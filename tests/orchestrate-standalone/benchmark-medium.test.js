'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseTasks,
  buildDAG,
  createLayers
} = require('../../skills/orchestrate-standalone/scripts/engine/scheduler');

function withTempDir(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function stripIndent(content) {
  const lines = String(content).replace(/^\n/, '').split('\n');
  const indents = lines
    .filter(line => line.trim() !== '')
    .map(line => line.match(/^ */)[0].length);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map(line => line.slice(minIndent)).join('\n');
}

function writeTasksFile(projectDir, content) {
  const tasksPath = path.join(projectDir, 'TASKS.md');
  fs.writeFileSync(tasksPath, stripIndent(content).trim() + '\n', 'utf8');
  return tasksPath;
}

function indexById(tasks) {
  return new Map(tasks.map(task => [task.id, task]));
}

function buildLayerIndex(layers) {
  const layerIndexByTaskId = new Map();
  layers.forEach((layer, layerIndex) => {
    layer.forEach(task => {
      layerIndexByTaskId.set(task.id, layerIndex);
    });
  });
  return layerIndexByTaskId;
}

function runTest(name, fn) {
  try {
    fn();
    process.stdout.write(`ok - ${name}\n`);
  } catch (error) {
    process.stderr.write(`not ok - ${name}\n`);
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  }
}

const MEDIUM_FEATURE_TASKS = `
  - [ ] P1-T1: Initialize repository scaffolding
    - deps: []
    - domain: repo-bootstrap
    - files: package.json
    - owner: platform
    - model: sonnet

  - [ ] P1-T2: Define authentication contract
    - deps: []
    - domain: auth-contract
    - files: docs/auth-contract.md
    - owner: backend
    - model: sonnet

  - [ ] P1-T3: Define reporting data schema
    - deps: []
    - domain: data-schema
    - files: docs/reporting-schema.md
    - owner: data
    - model: sonnet

  - [ ] P1-T4: Capture dashboard interaction flows
    - deps: []
    - domain: ux-spec
    - files: docs/dashboard-flows.md
    - owner: design
    - model: sonnet

  - [ ] P1-T5: Configure local environment bootstrap
    - deps: [P1-T1]
    - domain: env-bootstrap
    - files: scripts/bootstrap-env.js
    - owner: platform
    - model: sonnet

  ### [ ] P1-T6: Add CI verification pipeline
    - deps: [P1-T1]
    - domain: ci-pipeline
    - files: .github/workflows/ci.yml
    - owner: platform
    - model: sonnet

  - [ ] P2-T1: Implement authentication middleware
    - deps: [P1-T2, P1-T5]
    - domain: auth-runtime
    - files: src/auth/middleware.js
    - owner: backend
    - model: sonnet

  - [ ] P2-T2: Implement reporting data models
    - deps: [P1-T3, P1-T5]
    - domain: reporting-models
    - files: src/data/report-models.js
    - owner: data
    - model: sonnet

  - [ ] P2-T3: Implement reporting API handlers
    - deps: [P1-T2, P1-T3, P1-T5]
    - domain: reporting-api
    - files: src/api/report-handlers.js
    - owner: backend
    - model: sonnet

  - [ ] P2-T4: Implement dashboard shell
    - deps: [P1-T4, P1-T5]
    - domain: dashboard-shell
    - files: src/ui/dashboard-shell.js
    - owner: frontend
    - model: sonnet

  - [ ] P2-T5: Wire service integration flow
    - deps: [P2-T1, P2-T2, P2-T3]
    - domain: service-integration
    - files: src/service/reporting-service.js
    - owner: backend
    - model: sonnet

  ### [ ] P2-T6: Implement notification worker
    - deps: [P2-T2, P2-T3]
    - domain: notification-worker
    - files: src/workers/notification-worker.js
    - owner: backend
    - model: sonnet

  - [ ] P2-T7: Add audit logging hooks
    - deps: [P2-T1, P2-T3]
    - domain: audit-logging
    - files: src/observability/audit-logger.js
    - owner: platform
    - model: sonnet

  - [ ] P2-T8: Implement admin settings interactions
    - deps: [P2-T1, P2-T4]
    - domain: admin-settings
    - files: src/ui/admin-settings.js
    - owner: frontend
    - model: sonnet

  ### [ ] P3-T1: Add API integration coverage
    - deps: [P2-T5, P2-T7]
    - domain: api-integration-test
    - files: tests/api/reporting.integration.test.js
    - owner: qa
    - model: sonnet

  - [ ] P3-T2: Add dashboard end-to-end coverage
    - deps: [P2-T5, P2-T8]
    - domain: ui-e2e-test
    - files: tests/e2e/dashboard-flow.test.js
    - owner: qa
    - model: sonnet

  - [ ] P3-T3: Add worker retry regression coverage
    - deps: [P2-T6, P2-T7]
    - domain: worker-regression-test
    - files: tests/workers/notification-worker.test.js
    - owner: qa
    - model: sonnet

  ### [ ] P3-T4: Run full release verification
    - deps: [P1-T6, P3-T1, P3-T2, P3-T3]
    - domain: release-verification
    - files: scripts/release-verify.js
    - owner: release
    - model: sonnet
`;

runTest('benchmark-medium parses 18 mixed-format tasks from TASKS.md', () => {
  withTempDir('orch-medium-', projectDir => {
    const tasks = parseTasks(writeTasksFile(projectDir, MEDIUM_FEATURE_TASKS));
    const tasksById = indexById(tasks);

    assert.strictEqual(tasks.length, 18);
    assert.strictEqual(tasksById.get('P1-T6').description, 'Add CI verification pipeline');
    assert.deepStrictEqual(tasksById.get('P1-T6').deps, ['P1-T1']);
    assert.strictEqual(tasksById.get('P2-T6').domain, 'notification-worker');
    assert.deepStrictEqual(tasksById.get('P3-T4').deps, ['P1-T6', 'P3-T1', 'P3-T2', 'P3-T3']);
  });
});

runTest('benchmark-medium full pipeline builds valid layers for a medium dependency graph', () => {
  withTempDir('orch-medium-', projectDir => {
    const tasks = parseTasks(writeTasksFile(projectDir, MEDIUM_FEATURE_TASKS));
    const { sorted } = buildDAG(tasks);
    const layers = createLayers(sorted);
    const layerIndexByTaskId = buildLayerIndex(layers);
    const noDependencyTasks = tasks.filter(task => task.deps.length === 0).map(task => task.id).sort();

    assert.strictEqual(tasks.length, 18);
    assert.ok(layers.length >= 3 && layers.length <= 6, `expected 3-6 layers, received ${layers.length}`);

    for (const task of tasks) {
      for (const dep of task.deps) {
        assert.ok(
          layerIndexByTaskId.get(task.id) > layerIndexByTaskId.get(dep),
          `${task.id} was scheduled before dependency ${dep}`
        );
      }
    }

    for (const taskId of noDependencyTasks) {
      assert.strictEqual(
        layerIndexByTaskId.get(taskId),
        0,
        `${taskId} should be in layer 0`
      );
    }

    assert.deepStrictEqual(
      layers[0].map(task => task.id).sort(),
      noDependencyTasks
    );
    assert.ok(
      layers[layers.length - 1].some(task => task.id === 'P3-T4'),
      'expected final release verification task in the last layer'
    );
  });
});
