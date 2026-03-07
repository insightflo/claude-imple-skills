'use strict';

const fs = require('fs');

function computeStats(content) {
  const lines = String(content || '').split('\n');
  let done = 0;
  let total = 0;
  let currentPhaseNum = null;
  let activePhaseNum = null;
  let activePhaseHasIncomplete = false;
  let nextTask = null;

  for (const line of lines) {
    const phaseMatch = line.match(/^## Phase (\d+)/);
    if (phaseMatch) {
      if (activePhaseNum !== null && activePhaseHasIncomplete && currentPhaseNum === null) {
        currentPhaseNum = activePhaseNum;
      }
      activePhaseNum = parseInt(phaseMatch[1], 10);
      activePhaseHasIncomplete = false;
      continue;
    }

    if (/^### \[x\]/.test(line)) {
      done += 1;
      total += 1;
    } else if (/^### \[ \]/.test(line)) {
      total += 1;
      if (nextTask === null) {
        nextTask = line.replace(/^### \[ \]\s*/, '').trim();
      }
      if (activePhaseNum !== null) {
        activePhaseHasIncomplete = true;
      }
    }
  }

  if (currentPhaseNum === null && activePhaseNum !== null && activePhaseHasIncomplete) {
    currentPhaseNum = activePhaseNum;
  }

  return {
    done,
    total,
    current_phase: currentPhaseNum ? `Phase ${currentPhaseNum}` : null,
    next_task: nextTask,
    updated_at: new Date().toISOString(),
  };
}

function readTasksStats(tasksPath) {
  if (!fs.existsSync(tasksPath)) {
    return {
      done: 0,
      total: 0,
      current_phase: null,
      next_task: null,
      updated_at: new Date().toISOString(),
    };
  }

  return computeStats(fs.readFileSync(tasksPath, 'utf8'));
}

module.exports = {
  computeStats,
  readTasksStats,
};
