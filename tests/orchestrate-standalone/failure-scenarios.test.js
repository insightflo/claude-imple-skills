'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const engineAdapter = require('../../skills/orchestrate-standalone/scripts/engine-adapter');
const state = require('../../skills/orchestrate-standalone/scripts/state');
const eventLog = require('../../skills/orchestrate-standalone/scripts/event-log');
const tests = [];

function loadModuleWithInternals(modulePath, internalNames) {
  const source = fs.readFileSync(modulePath, 'utf8')
    + `\nmodule.exports.__test = { ${internalNames.join(', ')} };`;
  const loaded = new Module(modulePath, module);
  loaded.filename = modulePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(modulePath));
  loaded._compile(source, modulePath);
  return loaded.exports;
}

const autoOrchestratorPath = path.join(
  __dirname,
  '../../skills/orchestrate-standalone/scripts/auto-orchestrator.js'
);
const autoOrchestrator = loadModuleWithInternals(autoOrchestratorPath, [
  'getCurrentTaskMetrics',
  'appendDynamicTasks'
]);

async function withTempDir(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeTasksFile(projectDir, content) {
  const tasksPath = path.join(projectDir, 'TASKS.md');
  fs.writeFileSync(tasksPath, stripIndent(content).trim() + '\n', 'utf8');
  return tasksPath;
}

function stripIndent(content) {
  const lines = String(content).replace(/^\n/, '').split('\n');
  const indents = lines
    .filter(line => line.trim() !== '')
    .map(line => line.match(/^ */)[0].length);
  const minIndent = indents.length ? Math.min(...indents) : 0;
  return lines.map(line => line.slice(minIndent)).join('\n');
}

function createRl(answers) {
  const queue = answers.slice();
  return {
    question(prompt, callback) {
      callback(queue.shift() || '');
    },
    close() {}
  };
}

function runTest(name, fn) {
  tests.push({ name, fn });
}

runTest('2-4a: getCurrentTaskMetrics detects failed tasks from persisted state', () => {
  return withTempDir('orch-failure-', projectDir => {
    const tasks = engineAdapter.parseTasks(writeTasksFile(projectDir, `
      - [ ] T1: Prepare schema
        - deps: []
        - domain: data
        - files: src/schema.js
      - [ ] T2: Implement endpoint
        - deps: [T1]
        - domain: api
        - files: src/endpoint.js
      - [ ] T3: Add regression test
        - deps: [T2]
        - domain: qa
        - files: tests/endpoint.test.js
    `));

    state.saveState({
      version: '1.0.0',
      started_at: '2026-03-06T00:00:00.000Z',
      current_layer: 1,
      total_layers: 3,
      mode: 'auto',
      tasks: [
        { id: 'T1', status: 'completed' },
        { id: 'T2', status: 'failed' },
        { id: 'T3', status: 'pending' }
      ]
    }, projectDir);

    const metrics = autoOrchestrator.__test.getCurrentTaskMetrics(tasks, projectDir);

    assert.strictEqual(metrics.total, 3);
    assert.strictEqual(metrics.completed, 1);
    assert.strictEqual(metrics.failed, 1);
    assert.strictEqual(metrics.pending, 1);
    assert.deepStrictEqual(metrics.failedTasks.map(task => task.id), ['T2']);
    assert.deepStrictEqual(metrics.incompleteTasks.map(task => task.id), ['T2', 'T3']);
  });
});

runTest('2-4b: runAdjustStage detects budget overruns and triggers the failure gate', async () => {
  await withTempDir('orch-failure-', async projectDir => {
    const rl = createRl(['reject']);
    const assessment = {
      verdict: 'FAIL',
      metrics: {
        incompleteTasks: [],
        failedTasks: []
      }
    };
    const autoState = engineAdapter.saveAutoState({
      contract: {
        goal: 'Budget overrun reproduction',
        acceptance_criteria: [],
        constraints: [],
        quality_bar: [],
        verify_cmd: 'true',
        extra_checks: []
      },
      budget: {
        max_iterations: 2,
        current_iteration: 2,
        max_dynamic_tasks: 1,
        dynamic_tasks_added: 1,
        max_estimated_tokens: 0,
        estimated_tokens_used: 0
      },
      tasks: {
        total: 0,
        completed: 0,
        in_progress: 0,
        failed: 0,
        dynamically_added: 0
      }
    }, projectDir);

    const result = await autoOrchestrator.runAdjustStage(assessment, autoState, rl, { projectDir });
    const events = eventLog.readEvents(projectDir);
    const budgetEvent = events.find(event => event.type === 'budget_check');

    assert.strictEqual(result.outcome, 'abort');
    assert.ok(budgetEvent, 'expected a budget_check event');
    assert.match(budgetEvent.data.reason, /max_iterations exceeded/);
    assert.match(budgetEvent.data.reason, /max_dynamic_tasks exceeded/);
  });
});

runTest('2-4c: loadAutoState returns a normalized state when auto-state.json already exists', () => {
  return withTempDir('orch-failure-', projectDir => {
    const tasksPath = writeTasksFile(projectDir, `
      - [ ] T1: Seed plan
        - deps: []
        - domain: infra
        - files: TASKS.md
    `);
    const autoStatePath = path.join(projectDir, '.claude/orchestrate/auto-state.json');
    fs.mkdirSync(path.dirname(autoStatePath), { recursive: true });
    fs.writeFileSync(autoStatePath, JSON.stringify({
      session_id: 'session-123',
      contract: {
        version: 2,
        goal: 'Resume previous auto run',
        acceptance_criteria: ['criterion-a'],
        constraints: [],
        quality_bar: ['tests'],
        verify_cmd: 'node -e "process.exit(0)"',
        extra_checks: []
      },
      budget: {
        max_iterations: 8,
        current_iteration: 3,
        max_dynamic_tasks: 6,
        dynamic_tasks_added: 2
      },
      tasks: {
        total: 1,
        completed: 0,
        in_progress: 1,
        failed: 0,
        dynamically_added: 0
      }
    }, null, 2));

    const loaded = engineAdapter.loadAutoState(projectDir);

    assert.strictEqual(loaded.session_id, 'session-123');
    assert.strictEqual(loaded.contract.goal, 'Resume previous auto run');
    assert.strictEqual(loaded.contract.hash, engineAdapter.computeContractHash(loaded.contract));
    assert.strictEqual(loaded.budget.current_iteration, 3);
    assert.strictEqual(loaded.tasks.in_progress, 1);
    assert.ok(loaded.tasks_md_hash, `expected tasks_md_hash for ${tasksPath}`);
  });
});

runTest('2-4d: computeContractHash changes when acceptance criteria change', () => {
  const baseContract = {
    acceptance_criteria: ['green test suite', 'docs updated'],
    constraints: ['no external deps'],
    quality_bar: ['lint', 'tests'],
    verify_cmd: 'node smoke.js',
    extra_checks: ['node docs-check.js']
  };

  const hashA = engineAdapter.computeContractHash(baseContract);
  const hashB = engineAdapter.computeContractHash({
    ...baseContract,
    acceptance_criteria: ['green test suite', 'docs updated', 'failure scenarios covered']
  });

  assert.notStrictEqual(hashA, hashB);
});

runTest('2-4e: appendDynamicTasks appends AUTO-N tasks with stable numbering', () => {
  return withTempDir('orch-failure-', projectDir => {
    writeTasksFile(projectDir, `
      - [ ] T1: Initial setup
        - deps: []
        - domain: infra
        - files: src/setup.js

      - [ ] AUTO-2: Existing dynamic follow-up
        - deps: [T1]
        - domain: general
        - files: docs/notes.md
    `);

    const appended = autoOrchestrator.__test.appendDynamicTasks([
      {
        description: 'Fill in missing API regression coverage',
        deps: ['AUTO-2'],
        domain: 'qa',
        risk: 'high',
        owner: 'auto-orchestrator',
        model: 'sonnet'
      },
      {
        description: 'Document the new recovery path',
        deps: [],
        domain: 'docs',
        risk: 'medium',
        owner: 'auto-orchestrator',
        model: 'sonnet'
      }
    ], projectDir);

    const tasks = engineAdapter.parseTasks(path.join(projectDir, 'TASKS.md'));
    const fileContent = fs.readFileSync(path.join(projectDir, 'TASKS.md'), 'utf8');

    assert.deepStrictEqual(appended.map(task => task.id), ['AUTO-3', 'AUTO-4']);
    assert.deepStrictEqual(tasks.slice(-2).map(task => task.id), ['AUTO-3', 'AUTO-4']);
    assert.match(fileContent, /## Auto Adjustments/);
    assert.match(fileContent, /AUTO-3: Fill in missing API regression coverage/);
    assert.match(fileContent, /AUTO-4: Document the new recovery path/);
  });
});

async function main() {
  for (const test of tests) {
    try {
      await test.fn();
      process.stdout.write(`ok - ${test.name}\n`);
    } catch (error) {
      process.stderr.write(`not ok - ${test.name}\n`);
      process.stderr.write(`${error.stack}\n`);
      process.exitCode = 1;
    }
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
