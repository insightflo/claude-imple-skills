#!/usr/bin/env node
/**
 * Sprint Runner for Orchestrate Standalone
 *
 * Executes a single sprint using wave-based scheduling.
 *
 * @TASK orchestrate-standalone
 * @SPEC SKILL.md
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { parseTasks, buildDAG, createWaves } = require('./scheduler');
const { executeTask } = require('./worker');
const state = require('./sprint-state');

function normalizeTaskId(id) {
  return String(id || '').trim().toUpperCase();
}

function getCurrentSprintIndex(sprintState) {
  if (!sprintState || !Array.isArray(sprintState.sprints) || sprintState.sprints.length === 0) {
    return -1;
  }

  const current = sprintState.current_sprint;

  if (Number.isInteger(current) && current >= 1 && current <= sprintState.sprints.length) {
    return current - 1;
  }

  if (typeof current === 'string' && current.trim()) {
    const key = current.trim();
    const idx = sprintState.sprints.findIndex((s) => {
      if (!s || typeof s !== 'object') return false;
      return s.id === key || s.sprint_id === key || s.name === key;
    });
    if (idx >= 0) return idx;
  }

  return 0;
}

function getSprintTaskIds(sprint) {
  const ids = [];

  if (Array.isArray(sprint && sprint.tasks)) {
    for (const task of sprint.tasks) {
      if (typeof task === 'string') {
        const id = task.trim();
        if (id) ids.push(id);
        continue;
      }

      if (task && typeof task === 'object') {
        const id = task.id || task.task_id || task.taskId || task.name;
        if (id) ids.push(String(id).trim());
      }
    }
  }

  if (ids.length === 0 && Array.isArray(sprint && sprint.task_ids)) {
    for (const taskId of sprint.task_ids) {
      const id = String(taskId || '').trim();
      if (id) ids.push(id);
    }
  }

  return Array.from(new Set(ids.map(normalizeTaskId)));
}

function getCurrentSprintData(sprintState) {
  const index = getCurrentSprintIndex(sprintState);

  if (index < 0 || !Array.isArray(sprintState.sprints) || index >= sprintState.sprints.length) {
    throw new Error('Invalid sprint state: current sprint not found.');
  }

  return {
    index,
    sprint: sprintState.sprints[index]
  };
}

function normalizeSprintTasksArray(tasks) {
  const normalized = [];
  const seen = new Set();

  if (!Array.isArray(tasks)) return normalized;

  for (let i = 0; i < tasks.length; i += 1) {
    const entry = tasks[i];
    let id = '';
    let status = 'pending';

    if (typeof entry === 'string') {
      id = entry.trim();
    } else if (entry && typeof entry === 'object') {
      id = String(entry.id || entry.task_id || entry.taskId || entry.name || '').trim();
      status = String(entry.status || '').trim().toLowerCase() || 'pending';
    }

    if (!id) continue;
    const key = normalizeTaskId(id);
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push({ id, status });
  }

  return normalized;
}

function updateSprintTaskStatuses(sprintState, sprintIndex, statusById, idByKey) {
  const sprints = Array.isArray(sprintState.sprints) ? sprintState.sprints : [];
  const sprint = sprints[sprintIndex];
  if (!sprint || typeof sprint !== 'object') return;

  const tasks = normalizeSprintTasksArray(sprint.tasks);
  const existingMap = new Map(tasks.map((t) => [normalizeTaskId(t.id), t]));

  for (const key of Object.keys(statusById)) {
    const id = idByKey[key] || key;
    if (existingMap.has(key)) {
      const task = existingMap.get(key);
      task.status = statusById[key];
    } else {
      existingMap.set(key, { id, status: statusById[key] });
    }
  }

  const merged = Array.from(existingMap.values());
  sprint.tasks = merged;
  sprint.task_count = merged.length;
  sprint.completed_tasks = merged.filter((t) => t.status === 'completed').map((t) => t.id);
  sprint.completed_count = sprint.completed_tasks.length;
  sprint.failed_tasks = merged
    .filter((t) => t.status === 'failed' || t.status === 'timeout')
    .map((t) => t.id);
}

function ensureRunningState() {
  const sprintState = state.get();
  if (!sprintState) {
    throw new Error('Sprint state not found: .claude/sprint-state.json');
  }

  if (sprintState.state === 'PI_PLANNING') {
    state.transition('approve');
    return state.get();
  }

  if (sprintState.state === 'SPRINT_REVIEW') {
    state.transition('modify');
    return state.get();
  }

  if (sprintState.state === 'PAUSED') {
    state.transition('resume');
    return state.get();
  }

  return sprintState;
}

async function executeWave(wave, waveIndex, totalWaves, options) {
  const tasks = Array.isArray(wave && wave.tasks) ? wave.tasks : [];

  console.log(`[Sprint Runner] Wave ${waveIndex + 1}/${totalWaves}: ${tasks.length} tasks`);

  const settled = await Promise.allSettled(
    tasks.map((task) => executeTask(task, options))
  );

  const results = [];
  for (let i = 0; i < settled.length; i += 1) {
    const task = tasks[i];
    const item = settled[i];

    if (item.status === 'fulfilled') {
      results.push({
        id: task.id,
        status: 'completed',
        duration: item.value && item.value.duration
      });
    } else {
      const message = item.reason && item.reason.message ? item.reason.message : String(item.reason);
      results.push({
        id: task.id,
        status: 'failed',
        error: message
      });
    }
  }

  const failed = results.filter((r) => r.status !== 'completed');
  console.log(
    `[Sprint Runner] Wave ${waveIndex + 1} done: ${results.length - failed.length} completed, ${failed.length} failed`
  );

  return { results, failed };
}

function runSprintReview() {
  const reviewScript = path.join(__dirname, 'sprint-review.js');

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [reviewScript], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start sprint-review.js: ${error.message}`));
    });

    child.on('close', (code) => {
      resolve(Number.isInteger(code) ? code : 1);
    });
  });
}

function runSprintRetro() {
  const retroScript = path.join(__dirname, 'sprint-retro.js');

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [retroScript], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start sprint-retro.js: ${error.message}`));
    });

    child.on('close', (code) => {
      resolve(Number.isInteger(code) ? code : 1);
    });
  });
}

async function main(tasksFile) {
  const resolvedTasksFile = path.resolve(tasksFile || 'TASKS.md');

  if (!fs.existsSync(resolvedTasksFile)) {
    throw new Error(`TASKS.md not found: ${resolvedTasksFile}`);
  }

  fs.mkdirSync(path.join(process.cwd(), '.claude'), { recursive: true });

  let sprintState = ensureRunningState();

  if (sprintState.state !== 'SPRINT_RUNNING') {
    throw new Error(`Sprint is not runnable in current state: ${sprintState.state}`);
  }

  const { index: sprintIndex, sprint } = getCurrentSprintData(sprintState);
  const sprintTaskIds = getSprintTaskIds(sprint);

  if (sprintTaskIds.length === 0) {
    throw new Error('Current sprint has no task IDs.');
  }

  const allowed = new Set(sprintTaskIds);
  const idByKey = {};
  const allTasks = parseTasks(resolvedTasksFile);
  const sprintTasks = allTasks
    .filter((task) => allowed.has(normalizeTaskId(task.id)))
    .map((task) => {
      const key = normalizeTaskId(task.id);
      idByKey[key] = task.id;
      const deps = Array.isArray(task.deps) ? task.deps : [];
      const filteredDeps = deps.filter((dep) => allowed.has(normalizeTaskId(dep)));
      return Object.assign({}, task, { deps: filteredDeps });
    });

  if (sprintTasks.length === 0) {
    throw new Error('No matching tasks found in TASKS.md for current sprint.');
  }

  const { sorted } = buildDAG(sprintTasks);
  const waveSize = Number.isInteger(sprintState.sprint_size) && sprintState.sprint_size > 0
    ? sprintState.sprint_size
    : 30;
  const waves = createWaves(sorted, waveSize);

  console.log(
    `[Sprint Runner] Sprint tasks: ${sprintTasks.length}, waves: ${waves.length}, waveSize: ${waveSize}`
  );

  const statusById = {};
  for (const task of sprintTasks) {
    statusById[normalizeTaskId(task.id)] = 'pending';
  }

  // Bug #11: resume 시 이미 완료된 태스크 상태 복원
  const currentSprint = sprintState.sprints[sprintIndex];
  if (Array.isArray(currentSprint.tasks)) {
    for (const t of currentSprint.tasks) {
      if (t && typeof t === 'object' && t.status === 'completed') {
        const key = normalizeTaskId(t.id || t.task_id || t.taskId);
        if (Object.prototype.hasOwnProperty.call(statusById, key)) {
          statusById[key] = 'completed';
        }
      }
    }
  }

  for (let i = 0; i < waves.length; i += 1) {
    const wave = waves[i];
    // Bug #11: 완료된 태스크 제외
    const pendingTasks = wave.tasks.filter((t) => statusById[normalizeTaskId(t.id)] !== 'completed');
    if (pendingTasks.length === 0) {
      console.log(`[Sprint Runner] Wave ${i + 1}: all tasks completed, skipping`);
      continue;
    }
    const waveToExecute = { ...wave, tasks: pendingTasks };
    const { results, failed } = await executeWave(waveToExecute, i, waves.length, { projectDir: process.cwd() });

    for (const result of results) {
      statusById[normalizeTaskId(result.id)] = result.status;
    }

    sprintState = state.get();
    updateSprintTaskStatuses(sprintState, sprintIndex, statusById, idByKey);
    state.save();

    if (failed.length > 0) {
      const failedIds = failed.map((f) => f.id).join(', ');
      console.warn(`[Sprint Runner] Wave ${i + 1} partial failure: ${failedIds}`);
      console.warn('[Sprint Runner] Proceeding to review gate for user decision...');
      break;
    }
  }

  state.transition('wave_complete');

  const reviewExitCode = await runSprintReview();

  if (reviewExitCode === 0) {
    const retroExitCode = await runSprintRetro();
    return retroExitCode;
  }

  return reviewExitCode;
}

if (require.main === module) {
  const tasksFile = process.argv[2] || 'TASKS.md';

  main(tasksFile)
    .then((code) => {
      process.exit(Number.isInteger(code) ? code : 0);
    })
    .catch((error) => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}

module.exports = {
  main
};
