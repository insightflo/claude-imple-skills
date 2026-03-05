#!/usr/bin/env node
/**
 * Sprint Planner for Orchestrate Standalone
 *
 * Reads TASKS.md, builds DAG, slices tasks into PI sprints,
 * shows plan, and asks for approval.
 *
 * @TASK orchestrate-standalone
 * @SPEC SKILL.md
 */

const fs = require('fs');
const readline = require('readline');
const { parseTasks, buildDAG } = require('./scheduler');
const state = require('./sprint-state');

const SPRINT_TITLES = ['Foundation', 'Core Features', 'Integration', 'Stabilization'];

function extractPhaseInfo(task) {
  const id = (task && task.id) ? String(task.id) : '';

  let match = id.match(/^P(\d+)(?:-|$)/i);
  if (match) {
    return {
      key: `P${match[1]}`,
      label: `Phase ${Number(match[1])}`
    };
  }

  match = id.match(/^T(\d+)(?:[.\-]|$)/i);
  if (match) {
    return {
      key: `T${match[1]}`,
      label: `Phase ${Number(match[1])}`
    };
  }

  match = id.match(/^([A-Z]\d+)/);
  if (match) {
    return {
      key: match[1],
      label: `Phase ${match[1]}`
    };
  }

  return {
    key: 'MISC',
    label: 'Phase Misc'
  };
}

function truncate(text, limit = 56) {
  const s = String(text || '').trim();
  if (s.length <= limit) return s;
  return `${s.slice(0, limit - 1)}…`;
}

function summarizePhases(tasks) {
  const orderedKeys = [];
  const map = new Map();

  for (const task of tasks) {
    const phase = extractPhaseInfo(task);
    if (!map.has(phase.key)) {
      map.set(phase.key, {
        id: phase.key,
        label: phase.label,
        tasks: [],
        description: task.description || ''
      });
      orderedKeys.push(phase.key);
    }
    map.get(phase.key).tasks.push(task);
  }

  return orderedKeys.map((key) => {
    const info = map.get(key);
    const first = info.tasks[0];
    const last = info.tasks[info.tasks.length - 1];
    const range = first.id === last.id ? first.id : `${first.id}~${last.id}`;
    return {
      id: info.id,
      label: info.label,
      range,
      description: truncate(info.description)
    };
  });
}

function getSprintCount(totalTasks, size) {
  if (totalTasks <= 0) return 0;

  const estimated = Math.round(totalTasks / size) || 1;
  let count = Math.max(3, Math.min(4, estimated));

  if (totalTasks <= size + 5) {
    count = 1;
  }

  return Math.max(1, Math.min(totalTasks, count));
}

function chooseCutPoint(phaseKeys, cursor, total, remainingSprints, idealSize) {
  const minSize = Math.max(1, idealSize - 5);
  const maxSize = Math.max(minSize, idealSize + 5);

  let start = Math.max(cursor + minSize, cursor + 1);
  let end = Math.min(cursor + maxSize, total - (remainingSprints - 1));

  if (start > end) {
    const forced = Math.max(cursor + 1, total - (remainingSprints - 1));
    start = forced;
    end = forced;
  }

  const boundaryCandidates = [];
  for (let pos = start; pos <= end; pos++) {
    const isBoundary = (pos === total) || (phaseKeys[pos - 1] !== phaseKeys[pos]);
    if (isBoundary) boundaryCandidates.push(pos);
  }

  const candidates = boundaryCandidates.length > 0
    ? boundaryCandidates
    : Array.from({ length: end - start + 1 }, (_, i) => start + i);

  let bestPos = candidates[0];
  let bestDistance = Math.abs((bestPos - cursor) - idealSize);

  for (const pos of candidates) {
    const distance = Math.abs((pos - cursor) - idealSize);
    if (distance < bestDistance || (distance === bestDistance && pos > bestPos)) {
      bestPos = pos;
      bestDistance = distance;
    }
  }

  return bestPos;
}

function sliceIntoSprints(sortedTasks, size) {
  const tasks = Array.isArray(sortedTasks) ? sortedTasks : [];
  if (tasks.length === 0) return [];

  const sprintSize = Number.isFinite(size) && size > 0 ? Math.round(size) : 30;
  const total = tasks.length;
  const sprintCount = getSprintCount(total, sprintSize);
  const phaseKeys = tasks.map((t) => extractPhaseInfo(t).key);

  const rawSprints = [];
  let cursor = 0;

  for (let i = 0; i < sprintCount; i++) {
    const isLast = i === sprintCount - 1;
    if (isLast) {
      rawSprints.push(tasks.slice(cursor));
      cursor = total;
      break;
    }

    const remainingTasks = total - cursor;
    const remainingSprints = sprintCount - i;
    const ideal = Math.max(1, Math.round(remainingTasks / remainingSprints));
    const cut = chooseCutPoint(phaseKeys, cursor, total, remainingSprints, ideal);

    rawSprints.push(tasks.slice(cursor, cut));
    cursor = cut;
  }

  return rawSprints.map((sprintTasks, idx) => ({
    sprint_id: idx + 1,
    name: SPRINT_TITLES[idx] || `Sprint ${idx + 1}`,
    tasks: sprintTasks,
    task_count: sprintTasks.length,
    phases: summarizePhases(sprintTasks)
  }));
}

function formatPlan(sprints, totalTasks) {
  const lines = [];
  lines.push(`📋 PI 계획 (${totalTasks} 태스크 → ${sprints.length} 스프린트)`);
  lines.push('');

  for (const sprint of sprints) {
    lines.push(`Sprint ${sprint.sprint_id} (${sprint.task_count} tasks) — ${sprint.name}`);
    for (const phase of sprint.phases) {
      const desc = phase.description ? ` (${phase.description})` : '';
      lines.push(`  ${phase.label}: ${phase.range}${desc}`);
    }
    lines.push('');
  }

  lines.push('[A]pprove / [E]dit sprint sizes / [C]ancel');
  return lines.join('\n');
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function buildPiPlan(sprints, sprintSize) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  return {
    pi_id: `PI-${now.toISOString().slice(0, 10)}-${hh}${mm}`,
    created_at: now.toISOString(),
    sprint_size: sprintSize,
    total_sprints: sprints.length,
    sprints: sprints.map((s) => ({
      sprint_id: s.sprint_id,
      name: s.name,
      task_count: s.task_count,
      tasks: s.tasks.map((t) => t.id),
      phases: s.phases.map((p) => ({
        id: p.id,
        label: p.label,
        range: p.range
      }))
    }))
  };
}

async function approvalLoop(sortedTasks, initialSprintSize) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  let sprintSize = initialSprintSize;

  while (true) {
    const sprints = sliceIntoSprints(sortedTasks, sprintSize);

    console.log('');
    console.log(formatPlan(sprints, sortedTasks.length));
    console.log('');

    const action = (await ask(rl, '선택 [A/E/C]: ')).trim().toUpperCase();

    if (action === 'A') {
      const piPlan = buildPiPlan(sprints, sprintSize);
      state.init(piPlan);
      rl.close();
      process.exit(0);
    }

    if (action === 'E') {
      const nextSizeRaw = await ask(rl, '새 sprint size 입력: ');
      const nextSize = parseInt(nextSizeRaw, 10);

      if (!Number.isFinite(nextSize) || nextSize <= 0) {
        console.error('Error: sprint size must be a positive integer.');
      } else {
        sprintSize = nextSize;
      }
      continue;
    }

    if (action === 'C') {
      rl.close();
      process.exit(1);
    }

    console.log('유효하지 않은 입력입니다. A, E, C 중 하나를 입력하세요.');
  }
}

async function main(tasksFile, sprintSize = 30) {
  const resolvedTasksFile = tasksFile || 'TASKS.md';
  if (!fs.existsSync(resolvedTasksFile)) {
    const err = new Error(`TASKS.md not found: ${resolvedTasksFile}`);
    err.code = 'ENOENT';
    throw err;
  }

  const tasks = parseTasks(resolvedTasksFile);
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error(`No parsable tasks found in ${resolvedTasksFile}`);
  }

  const { sorted } = buildDAG(tasks);
  await approvalLoop(sorted, sprintSize);
}

if (require.main === module) {
  const tasksFile = process.argv[2] || 'TASKS.md';
  const sprintSizeArg = parseInt(process.argv[3], 10);
  const sprintSize = Number.isFinite(sprintSizeArg) && sprintSizeArg > 0 ? sprintSizeArg : 30;

  main(tasksFile, sprintSize).catch((error) => {
    if (error && error.code === 'ENOENT') {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }

    if (error && /circular dependency/i.test(error.message)) {
      console.error('Error: Circular dependency detected in TASKS.md');
      process.exit(1);
    }

    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  main,
  sliceIntoSprints
};
