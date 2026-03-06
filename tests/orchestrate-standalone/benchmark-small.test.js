'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseTasks,
  buildDAG,
  createLayers
} = require('../../skills/orchestrate-standalone/scripts/scheduler');

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
  fs.writeFileSync(tasksPath, content.trim() + '\n', 'utf8');
  return tasksPath;
}

function toLayerIds(layers) {
  return layers.map(layer => layer.map(task => task.id));
}

function indexById(tasks) {
  return new Map(tasks.map(task => [task.id, task]));
}

const SMALL_FEATURE_TASKS = `
- [ ] T1: Bootstrap feature flag wiring
  - deps: []
  - domain: infra
  - files: src/flags.js
  - owner: platform
  - model: sonnet
- [ ] T2: Define API payload contract
  - deps: []
  - domain: api-contract
  - files: docs/api-contract.md
  - owner: backend
  - model: sonnet
- [ ] T3: Add persistence model
  - deps: [T1]
  - domain: data
  - files: src/model.js
  - owner: backend
  - model: sonnet
- [ ] T4: Build service endpoint
  - deps: [T2, T3]
  - domain: service
  - files: src/service.js
  - owner: backend
  - model: sonnet
- [ ] T5: Build settings UI
  - deps: [T2]
  - domain: ui
  - files: src/settings-ui.js
  - owner: frontend
  - model: sonnet
### [ ] T6: Add end-to-end verification
  - deps: [T4, T5]
  - domain: test
  - files: tests/e2e-settings.js
  - owner: qa
  - model: sonnet
`;

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

runTest('parseTasks handles 5-10 tasks from inline TASKS.md content', () => {
  withTempDir('orch-small-', projectDir => {
    const tasksPath = writeTasksFile(projectDir, SMALL_FEATURE_TASKS);
    const tasks = parseTasks(tasksPath);

    assert.strictEqual(tasks.length, 6);
    assert.deepStrictEqual(tasks.map(task => task.id), ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
    assert.strictEqual(tasks[0].status, 'pending');
    assert.deepStrictEqual(tasks[3].deps, ['T2', 'T3']);
    assert.strictEqual(tasks[4].domain, 'ui');
    assert.deepStrictEqual(tasks[5].files, ['tests/e2e-settings.js']);
  });
});

runTest('buildDAG produces the expected adjacency list for a small feature graph', () => {
  withTempDir('orch-small-', projectDir => {
    const tasks = parseTasks(writeTasksFile(projectDir, SMALL_FEATURE_TASKS));
    const { sorted, graph } = buildDAG(tasks);

    assert.deepStrictEqual(sorted.map(task => task.id), ['T1', 'T2', 'T3', 'T5', 'T4', 'T6']);
    assert.deepStrictEqual(graph, {
      T1: ['T3'],
      T2: ['T4', 'T5'],
      T3: ['T4'],
      T4: ['T6'],
      T5: ['T6'],
      T6: []
    });
  });
});

runTest('createLayers never schedules a task before its dependencies', () => {
  withTempDir('orch-small-', projectDir => {
    const tasks = parseTasks(writeTasksFile(projectDir, SMALL_FEATURE_TASKS));
    const { sorted } = buildDAG(tasks);
    const layers = createLayers(sorted);
    const layerIndexByTaskId = new Map();

    layers.forEach((layer, layerIndex) => {
      layer.forEach(task => {
        layerIndexByTaskId.set(task.id, layerIndex);
      });
    });

    for (const task of tasks) {
      for (const dep of task.deps) {
        assert.ok(
          layerIndexByTaskId.get(task.id) > layerIndexByTaskId.get(dep),
          `${task.id} was scheduled before dependency ${dep}`
        );
      }
    }
  });
});

runTest('full parse -> DAG -> layers pipeline builds the expected execution plan', () => {
  withTempDir('orch-small-', projectDir => {
    const tasks = parseTasks(writeTasksFile(projectDir, SMALL_FEATURE_TASKS));
    const dag = buildDAG(tasks);
    const layers = createLayers(dag.sorted);
    const tasksById = indexById(tasks);

    assert.deepStrictEqual(toLayerIds(layers), [
      ['T1', 'T2'],
      ['T3', 'T5'],
      ['T4'],
      ['T6']
    ]);

    assert.strictEqual(tasksById.get('T4').description, 'Build service endpoint');
    assert.deepStrictEqual(tasksById.get('T6').deps, ['T4', 'T5']);
  });
});

