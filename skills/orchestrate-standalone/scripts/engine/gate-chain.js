#!/usr/bin/env node
/**
 * Gate Chain for Orchestrate Standalone
 *
 * Runs project-team hooks in sequence before/after task execution
 *
 * @TASK orchestrate-standalone
 * @SPEC SKILL.md
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { writeEvent } = require('../../../../project-team/scripts/lib/whitebox-events');

function toTaskMeta(task) {
  if (!task || typeof task !== 'object') return null;
  return {
    id: task.id || null,
    title: task.title || task.description || null,
    domain: task.domain || null,
    risk: task.risk || null,
  };
}

function toTaskListMeta(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .map((task) => {
      if (!task) return null;
      if (typeof task === 'string') return { id: task, title: null, domain: null, risk: null };
      return toTaskMeta(task);
    })
    .filter(Boolean);
}

function buildGateEventPayload(hookName, context, extras = {}) {
  const payload = {
    gate: hookName,
    phase: context.phase || null,
    layer: Number.isInteger(context.layer) ? context.layer : null,
    task: toTaskMeta(context.task),
    ...extras,
  };

  const taskList = toTaskListMeta(context.tasks);
  if (taskList.length > 0) {
    payload.scope = 'barrier';
    payload.task_ids = taskList.map((task) => task.id).filter(Boolean);
    payload.tasks = taskList;
  }

  return payload;
}

function getEventCorrelationId(context, payload) {
  if (payload.task && payload.task.id) return payload.task.id;
  if (payload.scope === 'barrier' && Number.isInteger(payload.layer)) {
    return `layer:${payload.layer}`;
  }
  return null;
}

async function emitCanonicalEvent(type, data, correlationId = null, stage = type) {
  try {
    await writeEvent({
      type,
      producer: 'orchestrate-gate-chain',
      correlation_id: correlationId || undefined,
      data,
    }, {
      projectDir: process.cwd(),
    });
    return { ok: true, error: null, failure: null };
  } catch (error) {
    const failure = {
      stage,
      event_type: type,
      message: error && error.message ? error.message : String(error),
      code: error && error.code ? error.code : null,
    };
    process.stderr.write(`[gate-chain] canonical event write failed (${type}): ${failure.message}\n`);
    return { ok: false, error, failure };
  }
}

// ---------------------------------------------------------------------------
// Hook Execution
// ---------------------------------------------------------------------------

/**
 * Run a single hook
 */
async function runHook(hookName, context = {}) {
  const hooksDir = path.join(process.cwd(), '.claude', 'hooks');
  const hookPath = path.join(hooksDir, `${hookName}.js`);
  const startPayload = buildGateEventPayload(hookName, context);
  const correlationId = getEventCorrelationId(context, startPayload);

  const startEvent = await emitCanonicalEvent('orchestrate.gate.start', startPayload, correlationId, 'gate_start');
  if (!startEvent.ok) {
    return {
      hook: hookName,
      passed: false,
      code: null,
      output: '',
      error: `canonical event write failed: ${startEvent.failure.message}`,
      write_error: startEvent.failure,
    };
  }

  if (!fs.existsSync(hookPath)) {
    // Hook not installed, skip
    const missingHookPayload = buildGateEventPayload(hookName, context, {
      outcome: 'skip',
      reason: 'missing_hook',
    });
    const missingHookEvent = await emitCanonicalEvent('orchestrate.gate.outcome', missingHookPayload, correlationId, 'gate_outcome');
    if (!missingHookEvent.ok) {
      return {
        hook: hookName,
        passed: false,
        code: null,
        output: '',
        error: `canonical event write failed: ${missingHookEvent.failure.message}`,
        write_error: missingHookEvent.failure,
      };
    }
    return { passed: true, skipped: true, hook: hookName };
  }

  return new Promise((resolve) => {
    let settled = false;

    const settle = async (payload) => {
      if (settled) return;
      settled = true;

      const outcome = payload.skipped
        ? 'skip'
        : payload.passed
          ? 'pass'
          : payload.code === null
            ? 'error'
            : 'deny';

      const outcomePayload = buildGateEventPayload(hookName, context, {
        outcome,
        code: Number.isInteger(payload.code) ? payload.code : null,
        skipped: Boolean(payload.skipped),
        has_error_output: Boolean(payload.error),
      });
      const outcomeEvent = await emitCanonicalEvent('orchestrate.gate.outcome', outcomePayload, correlationId, 'gate_outcome');

      if (!outcomeEvent.ok) {
        resolve({
          hook: hookName,
          passed: false,
          code: null,
          output: payload.output,
          error: `canonical event write failed: ${outcomeEvent.failure.message}`,
          write_error: outcomeEvent.failure,
        });
        return;
      }

      resolve(payload);
    };

    const hook = spawn('node', [hookPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    hook.stdout.on('data', (data) => {
      output += data.toString();
    });

    hook.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    hook.on('error', (error) => {
      void settle({
        hook: hookName,
        passed: false,
        code: null,
        output: output.slice(-1000),
        error: String(error && error.message ? error.message : 'spawn_error').slice(-500)
      });
    });

    hook.on('close', (code) => {
      void settle({
        hook: hookName,
        passed: code === 0,
        code,
        output: output.slice(-1000),
        error: errorOutput.slice(-500)
      });
    });

    // Send context as JSON
    hook.stdin.write(JSON.stringify({
      hook_event_name: 'orchestrate_gate',
      tool_name: 'orchestrate-standalone',
      tool_input: context
    }));
    hook.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Gate Chains
// ---------------------------------------------------------------------------

/**
 * Pre-Dispatch Gate (before task execution)
 */
async function preDispatchGate(task) {
  const results = [];

  // 1. policy-gate (권한 + 표준)
  const policyResult = await runHook('policy-gate', { task, phase: 'pre-dispatch' });
  results.push(policyResult);

  if (!policyResult.passed && !policyResult.skipped) {
    return { passed: false, gate: 'pre-dispatch', reason: 'policy-gate failed', results };
  }

  // 2. risk-gate (영향도 + 위험도)
  const riskResult = await runHook('risk-gate', { task, phase: 'pre-dispatch' });
  results.push(riskResult);

  if (!riskResult.passed && !riskResult.skipped) {
    return { passed: false, gate: 'pre-dispatch', reason: 'risk-gate failed', results };
  }

  return { passed: true, results };
}

/**
 * Post-Task Gate (after task execution)
 */
async function postTaskGate(task) {
  const results = [];

  // 1. contract-gate (API 계약 검증)
  const contractResult = await runHook('contract-gate', { task, phase: 'post-task' });
  results.push(contractResult);

  // 2. docs-gate (문서 + 변경 이력)
  const docsResult = await runHook('docs-gate', { task, phase: 'post-task' });
  results.push(docsResult);

  // 3. task-sync (TASKS.md 업데이트) - handled by docs-gate
  const syncResult = await runHook('task-sync', { task, phase: 'post-task' });
  results.push(syncResult);

  const failed = results.filter(r => !r.passed && !r.skipped);
  return {
    passed: failed.length === 0,
    results,
    failed: failed.map(r => r.hook)
  };
}

/**
 * Phase/Layer Barrier Gate (between layers)
 */
async function barrierGate(layerIndex, tasks) {
  const results = [];

  // 1. quality-gate (품질 게이트)
  const qualityResult = await runHook('quality-gate', {
    layer: layerIndex,
    tasks,
    phase: 'barrier'
  });
  results.push(qualityResult);

  // 2. security-scan (보안 스캔)
  const securityResult = await runHook('security-scan', {
    layer: layerIndex,
    tasks,
    phase: 'barrier'
  });
  results.push(securityResult);

  const failed = results.filter(r => !r.passed && !r.skipped);
  return {
    passed: failed.length === 0,
    results,
    failed: failed.map(r => r.hook)
  };
}

// ---------------------------------------------------------------------------
// Full Gate Pipeline
// ---------------------------------------------------------------------------

/**
 * Run complete gate pipeline for a layer
 */
async function runGatePipeline(layer, layerIndex) {
  // Pre-dispatch for each task in layer
  for (const task of layer) {
    const preResult = await preDispatchGate(task);
    if (!preResult.passed) {
      return {
        passed: false,
        stage: 'pre-dispatch',
        task: task.id,
        reason: preResult.reason
      };
    }
  }

  // (Tasks would be executed here by orchestrate.sh)

  // Post-task for each task in layer
  for (const task of layer) {
    const postResult = await postTaskGate(task);
    if (!postResult.passed) {
      return {
        passed: false,
        stage: 'post-task',
        task: task.id,
        reason: `Hooks failed: ${postResult.failed.join(', ')}`
      };
    }
  }

  // Barrier after layer completes
  const barrierResult = await barrierGate(layerIndex, layer);
  if (!barrierResult.passed) {
    return {
      passed: false,
      stage: 'barrier',
      layer: layerIndex,
      reason: `Hooks failed: ${barrierResult.failed.join(', ')}`
    };
  }

  return { passed: true };
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

if (require.main === module) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'pre-dispatch': {
      const task = JSON.parse(args[0]);
      preDispatchGate(task)
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(err => console.error(JSON.stringify({ error: err.message }, null, 2)));
      break;
    }

    case 'post-task': {
      const task = JSON.parse(args[0]);
      postTaskGate(task)
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(err => console.error(JSON.stringify({ error: err.message }, null, 2)));
      break;
    }

    case 'barrier': {
      const layerIndex = parseInt(args[0]);
      const tasks = JSON.parse(args[1]);
      barrierGate(layerIndex, tasks)
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(err => console.error(JSON.stringify({ error: err.message }, null, 2)));
      break;
    }

    case 'pipeline': {
      const layer = JSON.parse(args[0]);
      const layerIndex = parseInt(args[1]);
      runGatePipeline(layer, layerIndex)
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(err => console.error(JSON.stringify({ error: err.message }, null, 2)));
      break;
    }

    default:
      console.log(`
Usage: node gate-chain.js <command> [args]

Commands:
  pre-dispatch <taskJson>    Run pre-dispatch gate for a task
  post-task <taskJson>       Run post-task gate for a task
  barrier <layerIndex>       Run barrier gate after layer
  pipeline <layerJson>      Run full pipeline for a layer
      `);
  }
}

module.exports = {
  runHook,
  preDispatchGate,
  postTaskGate,
  barrierGate,
  runGatePipeline
};
