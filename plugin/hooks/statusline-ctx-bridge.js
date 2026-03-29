#!/usr/bin/env node
/**
 * Statusline Hook: Context Bridge
 *
 * Reads statusline event JSON from stdin, writes a lightweight context bridge
 * file for context-monitor, then prints the existing statusline text by
 * delegating to the shell statusline segment.
 *
 * Silent failure is intentional. Statusline hooks must remain fast and never
 * interrupt the session.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TIMEOUT_MS = 3_000;
const BRIDGE_DIR = '/tmp';
const STATUSLINE_SEGMENT_PATH = path.resolve(
  __dirname,
  '../skills/statusline/statusline-segment.sh'
);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toFiniteNumber(value) {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstString(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function firstNumber(candidates) {
  for (const candidate of candidates) {
    const value = toFiniteNumber(candidate);
    if (value !== null) return value;
  }
  return null;
}

function getSessionId(input) {
  return firstString([
    input.session_id,
    input.sessionId,
    input.session?.id,
    input.session?.session_id,
    input.metadata?.session_id,
    input.metadata?.sessionId,
    input.context?.session_id,
    input.context?.sessionId
  ]);
}

function getRemainingPercentage(input) {
  return firstNumber([
    input.context_window?.remaining_percentage,
    input.contextWindow?.remainingPercentage,
    input.context_window?.remainingPercent,
    input.context?.window?.remaining_percentage,
    input.context?.window?.remainingPercentage
  ]);
}

function getCallCount(input) {
  return firstNumber([
    input.call_count,
    input.callCount,
    input.tool_call_count,
    input.toolCallCount,
    input.tool_call?.count,
    input.toolCalls?.count,
    input.usage?.tool_call_count,
    input.usage?.call_count,
    input.metrics?.tool_call_count,
    input.metrics?.call_count
  ]);
}

function readStdinWithTimeout(timeoutMs) {
  const readPromise = (async () => {
    try {
      let data = '';
      process.stdin.setEncoding('utf8');

      for await (const chunk of process.stdin) {
        data += chunk;
      }

      if (!data.trim()) return null;
      return JSON.parse(data);
    } catch {
      return null;
    }
  })();

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });

  return Promise.race([readPromise, timeoutPromise]);
}

function writeBridgeFile(sessionId, remainingPercentage, callCount) {
  if (!sessionId || !Number.isFinite(remainingPercentage)) return;

  const payload = {
    session_id: sessionId,
    remaining_percentage: remainingPercentage,
    used_pct: Math.round(100 - remainingPercentage),
    timestamp: Math.floor(Date.now() / 1000)
  };

  if (Number.isFinite(callCount)) {
    payload.call_count = callCount;
  }

  const filePath = path.join(BRIDGE_DIR, `claude-ctx-${sessionId}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function printStatusline(currentDir) {
  if (!fs.existsSync(STATUSLINE_SEGMENT_PATH)) return;

  const targetDir =
    (typeof currentDir === 'string' && currentDir.trim()) || process.cwd();

  const result = spawnSync(STATUSLINE_SEGMENT_PATH, [targetDir], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS
  });

  if (result.error || typeof result.stdout !== 'string' || !result.stdout) {
    return;
  }

  process.stdout.write(result.stdout);
}

async function main() {
  let input = null;

  try {
    input = await readStdinWithTimeout(TIMEOUT_MS);
    if (input && typeof input === 'object') {
      const sessionId = getSessionId(input);
      const remainingPercentage = getRemainingPercentage(input);
      const callCount = getCallCount(input);

      writeBridgeFile(sessionId, remainingPercentage, callCount);
      printStatusline(input.workspace?.current_dir);
      return;
    }
  } catch {
    // Silent exit behavior for hooks.
  }

  try {
    printStatusline(process.cwd());
  } catch {
    // Silent exit behavior for hooks.
  }
}

main().catch(() => {
  // Silent exit behavior for hooks.
});
