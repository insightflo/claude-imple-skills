#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {
  setStaleMarker,
  clearStaleMarker,
  readMarkers,
} = require('../../../project-team/scripts/collab-derived-meta');
const {
  CONTROL_LOG_REL_PATH,
  CONTROL_STATE_ARTIFACT,
  readControlCommands,
  validateControlCommands,
} = require('../../../project-team/scripts/lib/whitebox-control');
const {
  readEvents,
  validateEvents,
} = require('../../../project-team/scripts/lib/whitebox-events');

const CONTROL_STATE_SCHEMA_VERSION = '1.0';
const EVENTS_REL_PATH = '.claude/collab/events.ndjson';
const AUTO_STATE_REL_PATH = '.claude/orchestrate/auto-state.json';

function controlStatePath(projectDir) {
  return path.join(projectDir, CONTROL_STATE_ARTIFACT);
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    projectDir: process.cwd(),
    json: false,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--project-dir=')) options.projectDir = path.resolve(arg.slice('--project-dir='.length));
    else if (arg === '--json') options.json = true;
    else if (arg === '--dry-run') options.dryRun = true;
  }

  return options;
}

function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readControlState(projectDir, fallback = null) {
  return readJsonIfExists(controlStatePath(projectDir), fallback);
}

function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function commandEvidencePaths(projectDir, gateId) {
  const paths = [
    path.join(projectDir, CONTROL_LOG_REL_PATH),
    path.join(projectDir, EVENTS_REL_PATH),
    path.join(projectDir, AUTO_STATE_REL_PATH),
  ];
  if (gateId) {
    return paths.filter((filePath) => fs.existsSync(filePath));
  }
  return paths.filter((filePath) => fs.existsSync(filePath));
}

function eventData(event) {
  return event && event.data && typeof event.data === 'object' ? event.data : {};
}

function latestByTs(items) {
  return [...items].sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))[0] || null;
}

function normalizePendingFromAutoState(projectDir) {
  const autoState = readJsonIfExists(path.join(projectDir, AUTO_STATE_REL_PATH), null);
  if (!autoState || !autoState.pending_gate) return null;
  return autoState.pending_gate;
}

function collectGateRegistry(projectDir, events) {
  const registry = new Map();
  const autoGate = normalizePendingFromAutoState(projectDir);
  if (autoGate && autoGate.gate_id) {
    registry.set(autoGate.gate_id, {
      gate_id: autoGate.gate_id,
      gate_name: autoGate.gate_name || null,
      stage: autoGate.stage || null,
      task_id: autoGate.task_id || null,
      run_id: autoGate.run_id || null,
      correlation_id: autoGate.correlation_id || null,
      choices: Array.isArray(autoGate.choices) ? autoGate.choices : [],
      default_behavior: autoGate.default_behavior || null,
      timeout_policy: autoGate.timeout_policy || null,
      created_at: autoGate.created_at || null,
      preview: autoGate.preview || '',
      evidence_paths: commandEvidencePaths(projectDir, autoGate.gate_id),
    });
  }

  for (const event of events) {
    const data = eventData(event);
    const gateId = data.gate_id || data.gate || null;
    if (!gateId) continue;
    const existing = registry.get(gateId) || {
      gate_id: gateId,
      gate_name: data.gate_name || null,
      stage: data.stage || null,
      task_id: data.task_id || null,
      run_id: data.run_id || null,
      correlation_id: event.correlation_id || null,
      choices: Array.isArray(data.choices) ? data.choices : [],
      default_behavior: data.default_behavior || null,
      timeout_policy: data.timeout_policy || null,
      created_at: event.ts || null,
      preview: data.preview || '',
      evidence_paths: commandEvidencePaths(projectDir, gateId),
    };

    registry.set(gateId, {
      ...existing,
      gate_name: existing.gate_name || data.gate_name || null,
      stage: existing.stage || data.stage || null,
      task_id: existing.task_id || data.task_id || null,
      run_id: existing.run_id || data.run_id || null,
      correlation_id: existing.correlation_id || event.correlation_id || null,
      choices: existing.choices.length ? existing.choices : (Array.isArray(data.choices) ? data.choices : []),
      default_behavior: existing.default_behavior || data.default_behavior || null,
      timeout_policy: existing.timeout_policy || data.timeout_policy || null,
      created_at: existing.created_at || event.ts || null,
      preview: existing.preview || data.preview || '',
      evidence_paths: existing.evidence_paths,
    });
  }

  return registry;
}

function buildControlState(projectDir) {
  const parsedCommands = readControlCommands({ projectDir });
  const commandValidation = validateControlCommands({ projectDir });
  const parsedEvents = readEvents({ projectDir, tolerateTrailingPartialLine: true });
  const eventsValidation = validateEvents({ projectDir });
  const gateRegistry = collectGateRegistry(projectDir, parsedEvents.events);
  const activeMarkers = readMarkers(projectDir).filter((entry) => entry && !entry.cleared_by);

  const lifecycleByGate = new Map();
  for (const event of parsedEvents.events) {
    const data = eventData(event);
    const gateId = data.gate_id || data.gate || null;
    if (!gateId) continue;
    const bucket = lifecycleByGate.get(gateId) || [];
    bucket.push(event);
    lifecycleByGate.set(gateId, bucket);
  }

  const pendingApprovals = [];
  const resolvedApprovals = [];

  for (const [gateId, gate] of gateRegistry.entries()) {
    const lifecycle = lifecycleByGate.get(gateId) || [];
    const lastRequired = latestByTs(lifecycle.filter((event) => event.type === 'approval_required'));
    const lastPaused = latestByTs(lifecycle.filter((event) => event.type === 'execution_paused'));
    const lastGranted = latestByTs(lifecycle.filter((event) => event.type === 'approval_granted'));
    const lastRejected = latestByTs(lifecycle.filter((event) => event.type === 'approval_rejected'));
    const lastResumed = latestByTs(lifecycle.filter((event) => event.type === 'execution_resumed'));
    const resolution = lastGranted ? 'approved' : lastRejected ? 'rejected' : null;
    const latestCommand = latestByTs(parsedCommands.commands.filter((command) => command && command.target && command.target.gate_id === gateId));
    const actor = latestCommand && latestCommand.actor ? latestCommand.actor : null;
    const base = {
      gate_id: gate.gate_id,
      gate_name: gate.gate_name,
      stage: gate.stage,
      task_id: gate.task_id,
      run_id: gate.run_id,
      correlation_id: gate.correlation_id,
      choices: gate.choices,
      default_behavior: gate.default_behavior,
      timeout_policy: gate.timeout_policy,
      created_at: gate.created_at,
      preview: gate.preview,
      evidence_paths: gate.evidence_paths,
      latest_command: latestCommand,
      actor,
    };

    if (!resolution && (lastRequired || lastPaused)) {
      pendingApprovals.push({
        ...base,
        state: 'pending',
        required_at: lastRequired ? lastRequired.ts : null,
        paused_at: lastPaused ? lastPaused.ts : null,
      });
      continue;
    }

    if (resolution) {
      resolvedApprovals.push({
        ...base,
        state: resolution,
        resolved_at: resolution === 'approved' ? lastGranted.ts : lastRejected.ts,
        resumed_at: lastResumed ? lastResumed.ts : null,
      });
    }
  }

  const gateIds = new Set(gateRegistry.keys());
  const commandResults = parsedCommands.commands.map((command) => {
    const gateId = command && command.target ? command.target.gate_id : null;
    const matchingResolved = resolvedApprovals.find((entry) => entry.gate_id === gateId);
    const matchingPending = pendingApprovals.find((entry) => entry.gate_id === gateId);
    let result = 'not_found';
    if (matchingResolved) {
      if ((matchingResolved.state === 'approved' && command.type === 'approve') || (matchingResolved.state === 'rejected' && command.type === 'reject')) {
        result = 'already_applied';
      } else {
        result = 'stale_target';
      }
    } else if (matchingPending) {
      result = 'pending';
    } else if (gateIds.has(gateId)) {
      result = 'stale_target';
    }

    return {
      command_id: command.command_id,
      type: command.type,
      gate_id: gateId,
      correlation_id: command.correlation_id,
      result,
      ts: command.ts,
      actor: command.actor || null,
      idempotency_key: command.idempotency_key,
    };
  });

  const staleTargets = commandResults.filter((entry) => entry.result === 'stale_target');
  const controlMarker = activeMarkers.find((entry) => entry.artifact === CONTROL_STATE_ARTIFACT) || null;

  return {
    schema_version: CONTROL_STATE_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    ok: commandValidation.ok && eventsValidation.ok,
    pending_approval_count: pendingApprovals.length,
    pending_approvals: pendingApprovals.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))),
    resolved_approvals: resolvedApprovals.sort((a, b) => String(b.resolved_at || '').localeCompare(String(a.resolved_at || ''))),
    command_results: commandResults.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || ''))),
    stale_targets: staleTargets,
    control_health: {
      control_log: commandValidation,
      events_log: eventsValidation,
      stale_marker: controlMarker,
    },
    derived_from: {
      control_log: CONTROL_LOG_REL_PATH,
      event_log: EVENTS_REL_PATH,
      auto_state: AUTO_STATE_REL_PATH,
      authoritative_writer: 'skills/whitebox/scripts/whitebox-control-state.js',
    },
  };
}

function refreshControlState(options = {}) {
  const projectDir = options.projectDir || process.cwd();
  const state = buildControlState(projectDir);
  writeJsonAtomic(controlStatePath(projectDir), state);
  clearStaleMarker({
    projectDir,
    artifact: CONTROL_STATE_ARTIFACT,
    clearedBy: 'whitebox-control-state',
  });
  return state;
}

function main() {
  const options = parseArgs();
  const projectDir = options.projectDir;
  const state = buildControlState(projectDir);

  if (!options.dryRun) {
    try {
      writeJsonAtomic(path.join(projectDir, CONTROL_STATE_ARTIFACT), state);
      clearStaleMarker({
        projectDir,
        artifact: CONTROL_STATE_ARTIFACT,
        clearedBy: 'whitebox-control-state',
      });
    } catch (error) {
      setStaleMarker({
        projectDir,
        artifact: CONTROL_STATE_ARTIFACT,
        schemaVersion: CONTROL_STATE_SCHEMA_VERSION,
        reason: `control-state refresh failure: ${error.message}`,
      });
      process.stderr.write(`whitebox-control-state write failed: ${error.message}\n`);
      process.exitCode = 1;
      if (!options.json) return;
    }
  }

  if (options.json || options.dryRun) {
    process.stdout.write(JSON.stringify(state, null, 2) + '\n');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CONTROL_STATE_SCHEMA_VERSION,
  buildControlState,
  controlStatePath,
  readControlState,
  refreshControlState,
  parseArgs,
};
