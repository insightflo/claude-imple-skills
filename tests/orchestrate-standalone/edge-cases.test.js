'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const tests = [];

const scheduler = require('../../skills/orchestrate-standalone/scripts/engine/scheduler');
const state = require('../../skills/orchestrate-standalone/scripts/engine/state');
const gateChain = require('../../skills/orchestrate-standalone/scripts/engine/gate-chain');
const worker = require('../../skills/orchestrate-standalone/scripts/engine/worker');

function runTest(name, fn) { tests.push({ name, fn }); }

async function withTempDir(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
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
  fs.writeFileSync(tasksPath, stripIndent(content), 'utf8');
  return tasksPath;
}

async function withCwd(nextCwd, fn) {
  const previousCwd = process.cwd();
  process.chdir(nextCwd);
  try {
    return await fn();
  } finally {
    process.chdir(previousCwd);
  }
}

function loadModuleWithMocks(modulePath, mocks) {
  const source = fs.readFileSync(modulePath, 'utf8');
  const loaded = new Module(modulePath, module);
  loaded.filename = modulePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(modulePath));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = function requireWithMocks(request) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalRequire(request);
  };
  loaded._compile(source, modulePath);
  return loaded.exports;
}

function makeTask(id, deps) {
  return {
    id,
    deps: deps || [],
    files: [],
    domain: null,
    risk: 'low'
  };
}

function installLocalOrchestrateRuntime(projectDir) {
  const repoRoot = path.resolve(__dirname, '../..');
  const skillsDir = path.join(projectDir, '.claude', 'skills');
  const projectTeamDir = path.join(projectDir, '.claude', 'project-team');

  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(projectTeamDir, { recursive: true });

  fs.cpSync(
    path.join(repoRoot, 'skills', 'orchestrate-standalone'),
    path.join(skillsDir, 'orchestrate-standalone'),
    { recursive: true }
  );
  fs.cpSync(
    path.join(repoRoot, 'skills', 'task-board'),
    path.join(skillsDir, 'task-board'),
    { recursive: true }
  );
  fs.cpSync(
    path.join(repoRoot, 'project-team', 'scripts'),
    path.join(projectTeamDir, 'scripts'),
    { recursive: true }
  );

  return path.join(skillsDir, 'orchestrate-standalone', 'scripts', 'orchestrate.sh');
}

runTest('T0-10a: Empty TASKS.md returns empty array', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    const tasksPath = writeTasksFile(projectDir, '');
    const tasks = scheduler.parseTasks(tasksPath);

    assert.deepStrictEqual(tasks, []);
  });
});

runTest('T0-10b: Tasks with circular deps throw Error(\'Circular dependency\')', () => {
  const tasks = [
    makeTask('A', ['C']),
    makeTask('B', ['A']),
    makeTask('C', ['B'])
  ];

  assert.throws(() => scheduler.buildDAG(tasks), /Circular dependency/);
});

runTest('T0-10c: Task without deps goes to layer 0', () => {
  const task = makeTask('A', []);
  const dag = scheduler.buildDAG([task]);
  const layers = scheduler.createLayers(dag.sorted);

  assert.strictEqual(layers.length, 1);
  assert.deepStrictEqual(layers[0].map(item => item.id), ['A']);
});

runTest('T0-10d: Chain A→B→C creates 3 layers', () => {
  const tasks = [
    makeTask('A', []),
    makeTask('B', ['A']),
    makeTask('C', ['B'])
  ];
  const dag = scheduler.buildDAG(tasks);
  const layers = scheduler.createLayers(dag.sorted);

  assert.strictEqual(layers.length, 3);
  assert.deepStrictEqual(layers[0].map(task => task.id), ['A']);
  assert.deepStrictEqual(layers[1].map(task => task.id), ['B']);
  assert.deepStrictEqual(layers[2].map(task => task.id), ['C']);
});

runTest('T0-10e: Heading-format tasks (### [ ] ID: desc) are parsed correctly', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    const tasksPath = writeTasksFile(projectDir, `
      ### [ ] P1-T1: Define orchestration contract
        - deps: []
        - domain: planning
        - risk: medium
        - files: TASKS.md
        - owner: pm
        - model: sonnet
    `);
    const tasks = scheduler.parseTasks(tasksPath);

    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].id, 'P1-T1');
    assert.strictEqual(tasks[0].description, 'Define orchestration contract');
    assert.strictEqual(tasks[0].status, 'pending');
    assert.deepStrictEqual(tasks[0].deps, []);
    assert.strictEqual(tasks[0].domain, 'planning');
    assert.strictEqual(tasks[0].risk, 'medium');
    assert.deepStrictEqual(tasks[0].files, ['TASKS.md']);
    assert.strictEqual(tasks[0].owner, 'pm');
    assert.strictEqual(tasks[0].model, 'sonnet');
  });
});

runTest('T0-10f: Mixed bullet + heading tasks parse together', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    const tasksPath = writeTasksFile(projectDir, `
      - [ ] T1: Bootstrap task list
        - deps: []
        - domain: infra

      ### [ ] P1-T2: Verify orchestration hooks
        - deps: [T1]
        - domain: qa
    `);
    const tasks = scheduler.parseTasks(tasksPath);

    assert.strictEqual(tasks.length, 2);
    assert.deepStrictEqual(tasks.map(task => task.id), ['T1', 'P1-T2']);
    assert.deepStrictEqual(tasks[1].deps, ['T1']);
  });
});

runTest('T0-10g: Completed tasks ([x]) have status \'completed\'', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    const tasksPath = writeTasksFile(projectDir, `
      - [x] T1: Already completed
        - deps: []
    `);
    const tasks = scheduler.parseTasks(tasksPath);

    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].status, 'completed');
  });
});

runTest('T0-10h: loadState on missing file returns default state', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    const loaded = state.loadState(projectDir);

    assert.strictEqual(loaded.version, '1.0.0');
    assert.ok(loaded.started_at);
    assert.deepStrictEqual(loaded.tasks, []);
    assert.strictEqual(loaded.current_layer, 0);
    assert.strictEqual(loaded.total_layers, 0);
    assert.strictEqual(loaded.mode, 'standard');
  });
});

runTest('T0-10i: saveState + loadState roundtrip preserves data', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    const expected = {
      version: '1.0.0',
      started_at: '2026-03-06T00:00:00.000Z',
      tasks: [
        { id: 'T1', status: 'completed' },
        { id: 'T2', status: 'failed', error: 'boom' }
      ],
      decisions: [],
      current_layer: 2,
      total_layers: 4,
      mode: 'auto'
    };

    state.saveState(expected, projectDir);
    const loaded = state.loadState(projectDir);

    assert.deepStrictEqual(loaded, expected);
  });
});

runTest('T0-10j: getProgress with no tasks returns all zeros', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    const progress = state.getProgress(projectDir);

    assert.deepStrictEqual(progress, {
      total: 0,
      completed: 0,
      failed: 0,
      in_progress: 0,
      pending: 0,
      percent: 0
    });
  });
});

runTest('T0-10k: updateTask creates new task if not found', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    const updated = state.updateTask('T1', { status: 'in_progress', owner: 'backend' }, projectDir);
    const loaded = state.loadState(projectDir);

    assert.strictEqual(updated.id, 'T1');
    assert.strictEqual(updated.status, 'in_progress');
    assert.strictEqual(updated.owner, 'backend');
    assert.ok(updated.created_at);
    assert.ok(updated.updated_at);
    assert.strictEqual(loaded.tasks.length, 1);
    assert.strictEqual(loaded.tasks[0].id, 'T1');
  });
});

runTest('T0-10l: updateTask updates existing task', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    state.saveState({
      version: '1.0.0',
      started_at: '2026-03-06T00:00:00.000Z',
      tasks: [
        {
          id: 'T1',
          status: 'pending',
          owner: 'backend',
          created_at: '2026-03-06T00:00:00.000Z',
          updated_at: '2026-03-06T00:00:00.000Z'
        }
      ],
      current_layer: 0,
      total_layers: 1,
      mode: 'standard'
    }, projectDir);

    const updated = state.updateTask('T1', { status: 'completed', output: 'done' }, projectDir);
    const loaded = state.loadState(projectDir);

    assert.strictEqual(updated.id, 'T1');
    assert.strictEqual(updated.status, 'completed');
    assert.strictEqual(updated.owner, 'backend');
    assert.strictEqual(updated.output, 'done');
    assert.strictEqual(loaded.tasks.length, 1);
    assert.strictEqual(loaded.tasks[0].status, 'completed');
  });
});

runTest('T0-10m: preDispatchGate passes when no hooks installed', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    await withCwd(projectDir, async () => {
      const result = await gateChain.preDispatchGate({ id: 'T1' });

      assert.strictEqual(result.passed, true);
      assert.strictEqual(result.results.length, 2);
      assert.ok(result.results.every(entry => entry.skipped === true));
    });
  });
});

runTest('T0-10n: postTaskGate passes when no hooks installed', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    await withCwd(projectDir, async () => {
      const result = await gateChain.postTaskGate({ id: 'T1' });

      assert.strictEqual(result.passed, true);
      assert.strictEqual(result.results.length, 3);
      assert.deepStrictEqual(result.failed, []);
      assert.ok(result.results.every(entry => entry.skipped === true));
    });
  });
});

runTest('T0-10o: barrierGate passes when no hooks installed', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    await withCwd(projectDir, async () => {
      const result = await gateChain.barrierGate(0, [{ id: 'T1' }, { id: 'T2' }]);

      assert.strictEqual(result.passed, true);
      assert.strictEqual(result.results.length, 2);
      assert.deepStrictEqual(result.failed, []);
      assert.ok(result.results.every(entry => entry.skipped === true));
    });
  });
});

runTest('T0-10p: resolveCliCommand defaults to claude for unknown model', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    const resolved = worker.resolveCliCommand({ model: 'unknown-model' }, projectDir);

    assert.strictEqual(resolved.command, 'claude');
    assert.deepStrictEqual(resolved.args, []);
    assert.strictEqual(resolved.model, 'claude');
    assert.strictEqual(resolved.requestedExecutor, 'unknown-model');
    assert.strictEqual(resolved.routeSource, 'task.model');
    assert.strictEqual(resolved.fallbackReason, 'unknown_model');
  });
});

runTest('T0-10q: resolveCliCommand maps \'codex\' to codex command', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    const workerPath = path.join(
      __dirname,
      '../../skills/orchestrate-standalone/scripts/engine/worker.js'
    );
    const mockedWorker = loadModuleWithMocks(workerPath, {
      child_process: {
        spawn() {
          throw new Error('spawn should not be called in resolveCliCommand tests');
        },
        execSync() {
          return '';
        }
      }
    });

    const resolved = mockedWorker.resolveCliCommand({ model: 'codex' }, projectDir);

    assert.strictEqual(resolved.command, 'codex');
    assert.deepStrictEqual(resolved.args, ['exec']);
    assert.strictEqual(resolved.model, 'codex');
    assert.strictEqual(resolved.requestedExecutor, 'codex');
    assert.strictEqual(resolved.routeSource, 'task.model');
    assert.strictEqual(resolved.fallbackReason, null);
  });
});

runTest('T0-10r: resolveCliCommand maps \'sonnet\'/\'opus\'/\'haiku\' to claude', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    for (const model of ['sonnet', 'opus', 'haiku']) {
      const resolved = worker.resolveCliCommand({ model }, projectDir);

      assert.strictEqual(resolved.command, 'claude');
      assert.deepStrictEqual(resolved.args, []);
      assert.strictEqual(resolved.model, 'claude');
      assert.strictEqual(resolved.requestedExecutor, model);
      assert.strictEqual(resolved.routeSource, 'task.model');
      assert.strictEqual(resolved.fallbackReason, null);
    }
  });
});

runTest('T0-10s: orchestrate exits fast with failed task ids when a layer task fails', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    const orchestratePath = installLocalOrchestrateRuntime(projectDir);
    const binDir = path.join(projectDir, 'bin');
    const claudeStub = path.join(binDir, 'claude');

    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(claudeStub, '#!/bin/sh\nexit 7\n', { mode: 0o755 });

    writeTasksFile(projectDir, `
      - [ ] T0.1: Deterministic failing task
        - deps: []
        - domain: shared
        - risk: low
        - owner: backend-specialist
        - model: sonnet

      - [ ] T0.2: Downstream task must not run
        - deps: [T0.1]
        - domain: shared
        - risk: low
        - owner: backend-specialist
        - model: sonnet
    `);

    const result = spawnSync('bash', [orchestratePath, '--mode=wave'], {
      cwd: projectDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH || ''}`,
        WHITEBOX_AUTO_OPEN_TUI: '0',
      },
      timeout: 120000,
    });

    const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
    const statePath = path.join(projectDir, '.claude', 'orchestrate-state.json');
    const stateData = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const failedTask = stateData.tasks.find((task) => task.id === 'T0.1');

    assert.strictEqual(result.status, 1);
    assert.match(combinedOutput, /Layer 1 recorded 1 failed task\(s\): T0\.1/);
    assert.doesNotMatch(combinedOutput, /Layer 2\/2/);
    assert.ok(failedTask);
    assert.strictEqual(failedTask.status, 'failed');
    assert.ok(!stateData.tasks.some((task) => task.id === 'T0.2'));
  });
});

runTest('T0-10t: orchestrate cancels running same-layer siblings after first failure', async () => {
  await withTempDir('orch-edge-', async projectDir => {
    const orchestratePath = installLocalOrchestrateRuntime(projectDir);
    const binDir = path.join(projectDir, 'bin');
    const claudeStub = path.join(binDir, 'claude');
    const siblingMarker = path.join(projectDir, 'sibling-completed.txt');

    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(
      claudeStub,
      [
        '#!/bin/sh',
        'case "$CLAUDE_TASK_ID" in',
        '  T0.1)',
        '    sleep 1',
        '    exit 7',
        '    ;;',
        '  T0.2)',
        '    trap "exit 9" TERM',
        `    sleep 5; printf "done" > "${siblingMarker}"; exit 0`,
        '    ;;',
        '  *)',
        '    exit 0',
        '    ;;',
        'esac',
      ].join('\n') + '\n',
      { mode: 0o755 }
    );

    writeTasksFile(projectDir, `
      - [ ] T0.1: Immediate failure
        - deps: []
        - domain: backend
        - risk: low
        - owner: backend-specialist
        - model: sonnet

      - [ ] T0.2: Long-running sibling
        - deps: []
        - domain: frontend
        - risk: low
        - owner: backend-specialist
        - model: sonnet
    `);

    const result = spawnSync('bash', [orchestratePath, '--mode=wave'], {
      cwd: projectDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH || ''}`,
        WHITEBOX_AUTO_OPEN_TUI: '0',
      },
      timeout: 120000,
    });

    const statePath = path.join(projectDir, '.claude', 'orchestrate-state.json');
    const stateData = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const taskOne = stateData.tasks.find((task) => task.id === 'T0.1');
    const taskTwo = stateData.tasks.find((task) => task.id === 'T0.2');

    assert.strictEqual(result.status, 1);
    assert.ok(taskOne);
    assert.ok(taskTwo);
    assert.strictEqual(taskOne.status, 'failed');
    assert.strictEqual(taskTwo.status, 'failed');
    assert.strictEqual(taskTwo.code, 'LAYER_ABORTED');
    assert.ok(!fs.existsSync(siblingMarker));
  });
});

async function main() {
  for (const test of tests) {
    try {
      await test.fn();
      process.stdout.write('ok - ' + test.name + '\n');
    } catch (error) {
      process.stderr.write('not ok - ' + test.name + '\n');
      process.stderr.write(error.stack + '\n');
      process.exitCode = 1;
    }
  }
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
