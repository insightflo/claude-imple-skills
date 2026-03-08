#!/usr/bin/env node
'use strict';

const path = require('path');

const {
  buildDefaultIdempotencyKey,
  writeControlCommand,
} = require('../../../project-team/scripts/lib/whitebox-control');
const {
  buildControlState,
  controlStatePath,
  readControlState,
} = require('./whitebox-control-state');

const EXIT_CODES = {
  ok: 0,
  not_found: 3,
  stale_target: 4,
  invalid_command: 5,
  write_failed: 6,
};

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    projectDir: process.cwd(),
    json: false,
    help: false,
    gateId: '',
    command: '',
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--json') options.json = true;
    else if (arg.startsWith('--project-dir=')) options.projectDir = path.resolve(arg.slice('--project-dir='.length));
    else if (arg.startsWith('--gate-id=')) options.gateId = arg.slice('--gate-id='.length);
    else if (!options.command) options.command = arg;
  }

  return options;
}

function helpText() {
  return [
    'whitebox-control - canonical whitebox approval control CLI',
    '',
    'Usage:',
    '  node skills/whitebox/scripts/whitebox-control.js <list|show|approve|reject> [options]',
    '',
    'Options:',
    '  --project-dir=/path   Target project directory',
    '  --gate-id=<id>        Gate identifier for show/approve/reject',
    '  --json                Print machine-readable JSON',
    '  --help, -h            Show this help',
    '',
    'Verbs:',
    '  list                  List pending approvals from control-state.json',
    '  show                  Show one approval from control-state.json',
    '  approve               Append one approve command to control.ndjson',
    '  reject                Append one reject command to control.ndjson',
    '',
    'Result values:',
    '  approved, rejected, already_applied, not_found, stale_target, invalid_command, write_failed',
    '',
    'Exit codes:',
    `  0  success (approved, rejected, already_applied, list, show)`,
    `  ${EXIT_CODES.not_found}  not_found`,
    `  ${EXIT_CODES.stale_target}  stale_target`,
    `  ${EXIT_CODES.invalid_command}  invalid_command`,
    `  ${EXIT_CODES.write_failed}  write_failed`,
  ].join('\n');
}

function print(payload, asJson) {
  if (asJson) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return;
  }

  process.stdout.write(`${payload.result || 'ok'}\n`);
}

function readProjectedState(projectDir) {
  return readControlState(projectDir, null);
}

function findGate(state, gateId) {
  const all = [
    ...(Array.isArray(state && state.pending_approvals) ? state.pending_approvals : []),
    ...(Array.isArray(state && state.resolved_approvals) ? state.resolved_approvals : []),
  ];
  return all.find((entry) => entry && entry.gate_id === gateId) || null;
}

function buildListResponse(projectDir) {
  const state = readProjectedState(projectDir);
  if (!state) {
    return {
      ok: false,
      result: 'not_found',
      message: `Missing derived control state: ${controlStatePath(projectDir)}`,
      approvals: [],
    };
  }

  return {
    ok: true,
    result: 'ok',
    pending_approval_count: state.pending_approval_count || 0,
    approvals: Array.isArray(state.pending_approvals) ? state.pending_approvals : [],
    derived_from: state.derived_from || null,
  };
}

function buildShowResponse(projectDir, gateId) {
  const state = readProjectedState(projectDir);
  if (!state) {
    return {
      ok: false,
      result: 'not_found',
      gate_id: gateId || null,
      message: `Missing derived control state: ${controlStatePath(projectDir)}`,
    };
  }

  const gate = findGate(state, gateId);
  if (!gate) {
    return {
      ok: false,
      result: 'not_found',
      gate_id: gateId || null,
      message: `No approval gate found for ${gateId}`,
    };
  }

  return {
    ok: true,
    result: 'ok',
    gate,
  };
}

function buildMutationPlan(projectDir, gateId, type) {
  const state = buildControlState(projectDir);
  const gate = findGate(state, gateId);
  if (!gate) {
    return {
      ok: false,
      result: 'not_found',
      gate_id: gateId,
      state,
    };
  }

  if (gate.state && gate.state !== 'pending') {
    if ((gate.state === 'approved' && type === 'approve') || (gate.state === 'rejected' && type === 'reject')) {
      return {
        ok: true,
        result: 'already_applied',
        gate,
        state,
      };
    }

    return {
      ok: false,
      result: 'stale_target',
      gate,
      state,
    };
  }

  return {
    ok: true,
    result: 'pending',
    gate,
    state,
  };
}

async function applyCommand(projectDir, gateId, type) {
  const plan = buildMutationPlan(projectDir, gateId, type);
  if (plan.result === 'already_applied') {
    return {
      ok: true,
      result: 'already_applied',
      gate: plan.gate,
    };
  }

  if (!plan.ok) {
    return {
      ok: false,
      result: plan.result,
      gate: plan.gate || null,
      gate_id: gateId,
    };
  }

  const commandInput = {
    type,
    producer: 'whitebox-control-cli',
    target: {
      gate_id: plan.gate.gate_id,
      task_id: plan.gate.task_id || null,
    },
    actor: { id: 'whitebox-cli' },
    correlation_id: plan.gate.correlation_id,
    idempotency_key: buildDefaultIdempotencyKey({
      type,
      correlation_id: plan.gate.correlation_id,
      target: { gate_id: plan.gate.gate_id },
    }),
  };

  try {
    const writeResult = await writeControlCommand(commandInput, { projectDir });
    return {
      ok: true,
      result: writeResult.status === 'already_applied' ? 'already_applied' : type === 'approve' ? 'approved' : 'rejected',
      gate: plan.gate,
      command: writeResult.command,
      duplicate_of: writeResult.duplicate_of,
    };
  } catch (error) {
    return {
      ok: false,
      result: error && error.code === 'WHITEBOX_CONTROL_INVALID' ? 'invalid_command' : 'write_failed',
      gate: plan.gate,
      error: error && error.message ? error.message : String(error),
      error_code: error && error.code ? error.code : null,
    };
  }
}

function exitCodeForResult(result) {
  if (result === 'not_found') return EXIT_CODES.not_found;
  if (result === 'stale_target') return EXIT_CODES.stale_target;
  if (result === 'invalid_command') return EXIT_CODES.invalid_command;
  if (result === 'write_failed') return EXIT_CODES.write_failed;
  return EXIT_CODES.ok;
}

async function main() {
  const options = parseArgs();
  if (options.help || !options.command) {
    process.stdout.write(helpText() + '\n');
    process.exit(0);
  }

  let payload;
  if (options.command === 'list') {
    payload = buildListResponse(options.projectDir);
  } else if (options.command === 'show') {
    payload = buildShowResponse(options.projectDir, options.gateId);
  } else if (options.command === 'approve' || options.command === 'reject') {
    if (!options.gateId) {
      payload = { ok: false, result: 'invalid_command', message: '--gate-id is required' };
    } else {
      payload = await applyCommand(options.projectDir, options.gateId, options.command);
    }
  } else {
    payload = { ok: false, result: 'invalid_command', message: `Unknown command: ${options.command}` };
  }

  print(payload, options.json);
  process.exit(exitCodeForResult(payload.result));
}

if (require.main === module) {
  main();
}

module.exports = {
  EXIT_CODES,
  applyCommand,
  buildListResponse,
  buildMutationPlan,
  buildShowResponse,
  parseArgs,
};
