#!/usr/bin/env node
/**
 * PostToolUse Hook: Context Monitor
 *
 * Reads the current context usage snapshot for the active session and emits
 * an additionalContext warning when usage crosses configured thresholds.
 *
 * Behavior:
 * - Read PostToolUse event JSON from stdin
 * - Extract session_id
 * - Read /tmp/claude-ctx-{session_id}.json
 * - Check remaining_percentage thresholds
 * - Debounce warnings to at most once every 5 tool calls
 * - Escalate immediately when severity increases
 *
 * Silent failure is intentional. Hooks must never interrupt the session.
 */

const fs = require('fs');

const STDIN_TIMEOUT_MS = 10_000;
const WARNING_THRESHOLD = 35;
const CRITICAL_THRESHOLD = 25;
const WARNING_DEBOUNCE_CALLS = 5;

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } catch {
    // Silent exit behavior for hooks
  }
}

function getSessionId(input) {
  const candidates = [
    input.session_id,
    input.sessionId,
    input.session?.id,
    input.session?.session_id,
    input.metadata?.session_id,
    input.metadata?.sessionId
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function getCallCount(ctxState) {
  const candidates = [
    ctxState.call_count,
    ctxState.tool_call_count,
    ctxState.post_tool_use_count,
    ctxState.event_count
  ];

  for (const candidate of candidates) {
    if (Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
}

function getSeverity(remainingPercentage) {
  if (remainingPercentage <= CRITICAL_THRESHOLD) return 'critical';
  if (remainingPercentage <= WARNING_THRESHOLD) return 'warning';
  return 'none';
}

function formatMessage(severity, usedPercentage) {
  const usedPct = Math.round(usedPercentage);

  if (severity === 'critical') {
    return `🚨 CRITICAL: Context nearly full (${usedPct}%). Save state NOW and wrap up immediately.`;
  }

  if (severity === 'warning') {
    return `⚠️ Context usage high (${usedPct}%). Consider wrapping up current task or run /prune.`;
  }

  return null;
}

function shouldWarn(severity, callCount, monitorState) {
  if (severity === 'none') return false;

  const lastSeverity = monitorState.last_severity || 'none';
  const lastWarningCallCount = Number.isFinite(monitorState.last_warning_call_count)
    ? monitorState.last_warning_call_count
    : 0;

  if (severity === 'critical' && lastSeverity !== 'critical') {
    return true;
  }

  if (!Number.isFinite(callCount)) {
    return lastSeverity !== severity;
  }

  return (callCount - lastWarningCallCount) >= WARNING_DEBOUNCE_CALLS;
}

function outputWarning(message) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { additionalContext: message } })}\n`);
}

function readStdinWithTimeout(timeoutMs) {
  return new Promise((resolve) => {
    let data = '';
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        finish(JSON.parse(data));
      } catch {
        finish(null);
      }
    });
    process.stdin.on('error', () => finish(null));
    process.stdin.resume();
  });
}

async function main() {
  const input = await readStdinWithTimeout(STDIN_TIMEOUT_MS);
  if (!input || typeof input !== 'object') return;

  const sessionId = getSessionId(input);
  if (!sessionId) return;

  const ctxStatePath = `/tmp/claude-ctx-${sessionId}.json`;
  const monitorStatePath = `/tmp/claude-ctx-monitor-${sessionId}.json`;

  const ctxState = readJsonFile(ctxStatePath, null);
  if (!ctxState || !Number.isFinite(ctxState.remaining_percentage)) return;

  const remainingPercentage = ctxState.remaining_percentage;
  const usedPercentage = 100 - remainingPercentage;
  const severity = getSeverity(remainingPercentage);

  const existingMonitorState = readJsonFile(monitorStatePath, {
    last_warning_call_count: 0,
    last_severity: 'none'
  });

  if (severity === 'none') {
    if (existingMonitorState.last_severity !== 'none') {
      writeJsonFile(monitorStatePath, {
        last_warning_call_count: existingMonitorState.last_warning_call_count || 0,
        last_severity: 'none'
      });
    }
    return;
  }

  const callCount = getCallCount(ctxState);
  if (!shouldWarn(severity, callCount, existingMonitorState)) return;

  const message = formatMessage(severity, usedPercentage);
  if (!message) return;

  writeJsonFile(monitorStatePath, {
    last_warning_call_count: Number.isFinite(callCount)
      ? callCount
      : (existingMonitorState.last_warning_call_count || 0),
    last_severity: severity
  });

  outputWarning(message);
}

main().catch(() => {
  // Silent exit: hooks must never fail the session.
});
