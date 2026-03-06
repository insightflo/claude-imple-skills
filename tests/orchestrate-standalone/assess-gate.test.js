'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const state = require('../../skills/orchestrate-standalone/scripts/engine/state');
const eventLog = require('../../skills/orchestrate-standalone/scripts/auto/event-log');
const { parseTasks } = require('../../skills/orchestrate-standalone/scripts/engine/scheduler');

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
  '../../skills/orchestrate-standalone/scripts/auto/auto-orchestrator.js'
);
const autoOrchestrator = loadModuleWithInternals(autoOrchestratorPath, [
  'getCurrentTaskMetrics',
  'getTrailingFailureCount',
  'buildDynamicTasks'
]);

function stripIndent(content) {
  const lines = String(content).replace(/^\n/, '').split('\n');
  const indents = lines
    .filter(line => line.trim() !== '')
    .map(line => line.match(/^ */)[0].length);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map(line => line.slice(minIndent)).join('\n');
}

function withTempDir(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeTasksFile(projectDir, content) {
  const tasksPath = path.join(projectDir, 'TASKS.md');
  fs.writeFileSync(tasksPath, stripIndent(content).trim() + '\n', 'utf8');
  return tasksPath;
}

function createContract(verifyCmd) {
  return {
    goal: 'Assess stage regression coverage',
    acceptance_criteria: ['verification reflects task completion'],
    constraints: ['assert-only tests'],
    quality_bar: ['verify command passes'],
    verify_cmd: verifyCmd,
    extra_checks: []
  };
}

function runTest(name, fn) {
  tests.push({ name, fn });
}

runTest('assess-gate: runAssessStage returns PASS when verify_cmd succeeds and all tasks are complete', () => {
  withTempDir('orch-assess-', projectDir => {
    const tasks = parseTasks(writeTasksFile(projectDir, `
      - [ ] T1: Prepare feature baseline
        - deps: []
        - domain: infra
        - files: src/setup.js

      - [ ] T2: Implement feature endpoint
        - deps: [T1]
        - domain: api
        - files: src/endpoint.js
    `));

    state.saveState({
      version: '1.0.0',
      started_at: '2026-03-06T00:00:00.000Z',
      current_layer: 1,
      total_layers: 2,
      mode: 'auto',
      tasks: [
        { id: 'T1', status: 'completed' },
        { id: 'T2', status: 'completed' }
      ]
    }, projectDir);

    const assessment = autoOrchestrator.runAssessStage(
      tasks,
      createContract('node -e "process.exit(0)"'),
      { projectDir }
    );

    assert.strictEqual(assessment.verdict, 'PASS');
    assert.strictEqual(assessment.verify.ok, true);
    assert.strictEqual(assessment.metrics.completed, 2);
    assert.strictEqual(assessment.completion_rate, 100);
  });
});

runTest('assess-gate: runAssessStage returns FAIL when verify_cmd fails', () => {
  withTempDir('orch-assess-', projectDir => {
    const tasks = parseTasks(writeTasksFile(projectDir, `
      - [ ] T1: Prepare feature baseline
        - deps: []
        - domain: infra
        - files: src/setup.js

      - [ ] T2: Implement feature endpoint
        - deps: [T1]
        - domain: api
        - files: src/endpoint.js
    `));

    state.saveState({
      version: '1.0.0',
      started_at: '2026-03-06T00:00:00.000Z',
      current_layer: 1,
      total_layers: 2,
      mode: 'auto',
      tasks: [
        { id: 'T1', status: 'completed' },
        { id: 'T2', status: 'completed' }
      ]
    }, projectDir);

    const assessment = autoOrchestrator.runAssessStage(
      tasks,
      createContract('node -e "process.exit(1)"'),
      { projectDir }
    );

    assert.strictEqual(assessment.verdict, 'FAIL');
    assert.strictEqual(assessment.verify.ok, false);
    assert.strictEqual(assessment.metrics.completed, 2);
  });
});

runTest('assess-gate: runAssessStage returns GAPS when verify_cmd passes but tasks remain incomplete', () => {
  withTempDir('orch-assess-', projectDir => {
    const tasks = parseTasks(writeTasksFile(projectDir, `
      - [ ] T1: Prepare feature baseline
        - deps: []
        - domain: infra
        - files: src/setup.js

      - [ ] T2: Implement feature endpoint
        - deps: [T1]
        - domain: api
        - files: src/endpoint.js

      - [ ] T3: Add regression coverage
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
        { id: 'T1', status: 'completed' }
      ]
    }, projectDir);

    const metrics = autoOrchestrator.__test.getCurrentTaskMetrics(tasks, projectDir);
    const assessment = autoOrchestrator.runAssessStage(
      tasks,
      createContract('node -e "process.exit(0)"'),
      { projectDir }
    );

    assert.strictEqual(metrics.completed, 1);
    assert.strictEqual(metrics.pending, 2);
    assert.deepStrictEqual(metrics.incompleteTasks.map(task => task.id), ['T2', 'T3']);
    assert.strictEqual(assessment.verdict, 'GAPS');
    assert.strictEqual(assessment.verify.ok, true);
  });
});

runTest('assess-gate: getTrailingFailureCount resets after a PASS event', () => {
  withTempDir('orch-assess-', projectDir => {
    eventLog.appendEvent('assess', { verdict: 'FAIL' }, projectDir);
    eventLog.appendEvent('assess', { verdict: 'FAIL' }, projectDir);
    eventLog.appendEvent('assess', { verdict: 'FAIL' }, projectDir);

    assert.strictEqual(autoOrchestrator.__test.getTrailingFailureCount(projectDir), 3);

    eventLog.appendEvent('assess', { verdict: 'PASS' }, projectDir);

    assert.strictEqual(autoOrchestrator.__test.getTrailingFailureCount(projectDir), 0);
  });
});

runTest('assess-gate: buildDynamicTasks creates follow-up work for failed items', () => {
  const dynamicTasks = autoOrchestrator.__test.buildDynamicTasks({
    verdict: 'GAPS',
    verify: { command: 'node -e "process.exit(0)"', ok: true },
    extra_checks: [],
    metrics: {
      failedTasks: [{ id: 'T2', description: 'X', domain: 'api' }],
      incompleteTasks: [{ id: 'T2', description: 'X', domain: 'api' }]
    }
  });

  assert.strictEqual(dynamicTasks.length, 1);
  assert.match(dynamicTasks[0].description, /T2/);
  assert.strictEqual(dynamicTasks[0].domain, 'api');
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
