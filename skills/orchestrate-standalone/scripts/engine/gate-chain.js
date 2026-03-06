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

// ---------------------------------------------------------------------------
// Hook Execution
// ---------------------------------------------------------------------------

/**
 * Run a single hook
 */
async function runHook(hookName, context = {}) {
  const hooksDir = path.join(process.cwd(), '.claude', 'hooks');
  const hookPath = path.join(hooksDir, `${hookName}.js`);

  if (!fs.existsSync(hookPath)) {
    // Hook not installed, skip
    return { passed: true, skipped: true, hook: hookName };
  }

  return new Promise((resolve, reject) => {
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

    hook.on('close', (code) => {
      resolve({
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
    tasks: tasks.map(t => t.id),
    phase: 'barrier'
  });
  results.push(qualityResult);

  // 2. security-scan (보안 스캔)
  const securityResult = await runHook('security-scan', {
    layer: layerIndex,
    tasks: tasks.map(t => t.id),
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
