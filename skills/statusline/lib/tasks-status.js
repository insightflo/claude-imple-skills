'use strict';

const fs = require('fs');

function computeStats(content) {
  const lines = String(content || '').split('\n');
  let done = 0;
  let total = 0;
  let currentPhaseLabel = null;
  let activePhaseNum = null;
  let activePhaseLabel = null;
  let activePhaseHasIncomplete = false;
  let nextTask = null;

  for (const line of lines) {
    const phaseMatch = line.match(/^## Phase (\d+)/);
    const agilePhaseMatch = line.match(/^##\s+T(\d+)\b/);
    const completedTaskMatch = line.match(/^(?:###|-)[ ]+\[x\]\s*(.+)$/);
    const incompleteTaskMatch = line.match(/^(?:###|-)[ ]+\[ \]\s*(.+)$/);

    if (phaseMatch) {
      if (activePhaseLabel !== null && activePhaseHasIncomplete && currentPhaseLabel === null) {
        currentPhaseLabel = activePhaseLabel;
      }
      activePhaseNum = parseInt(phaseMatch[1], 10);
      activePhaseLabel = `Phase ${activePhaseNum}`;
      activePhaseHasIncomplete = false;
      continue;
    }

    if (agilePhaseMatch) {
      if (activePhaseLabel !== null && activePhaseHasIncomplete && currentPhaseLabel === null) {
        currentPhaseLabel = activePhaseLabel;
      }
      activePhaseNum = parseInt(agilePhaseMatch[1], 10);
      activePhaseLabel = `T${activePhaseNum}`;
      activePhaseHasIncomplete = false;
      continue;
    }

    if (completedTaskMatch) {
      done += 1;
      total += 1;
    } else if (incompleteTaskMatch) {
      total += 1;
      if (nextTask === null) {
        nextTask = incompleteTaskMatch[1].trim();
      }
      if (activePhaseLabel !== null) {
        activePhaseHasIncomplete = true;
      }
    }
  }

  if (currentPhaseLabel === null && activePhaseLabel !== null && activePhaseHasIncomplete) {
    currentPhaseLabel = activePhaseLabel;
  }

  return {
    done,
    total,
    current_phase: currentPhaseLabel,
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
