#!/usr/bin/env node
/**
 * State Management for Team Orchestrate
 *
 * Manages orchestrate-state.json for resume capability
 *
 * @TASK team-orchestrate
 * @SPEC SKILL.md
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// State File Operations
// ---------------------------------------------------------------------------

const STATE_FILE = '.claude/orchestrate-state.json';
const BACKUP_DIR = '.claude/backups';

/**
 * Load orchestration state
 */
function loadState(projectDir = process.cwd()) {
  const statePath = path.join(projectDir, STATE_FILE);

  if (!fs.existsSync(statePath)) {
    return {
      version: '1.0.0',
      started_at: new Date().toISOString(),
      tasks: [],
      decisions: [],
      current_layer: 0,
      total_layers: 0,
      mode: 'standard'
    };
  }

  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!Array.isArray(state.tasks)) state.tasks = [];
    if (!Array.isArray(state.decisions)) state.decisions = [];
    return state;
  } catch (error) {
    throw new Error(`Failed to load state: ${error.message}`);
  }
}

/**
 * Save orchestration state
 */
function saveState(state, projectDir = process.cwd()) {
  const statePath = path.join(projectDir, STATE_FILE);

  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (error) {
    throw new Error(`Failed to save state: ${error.message}`);
  }
}

/**
 * Backup current state
 */
function backupState(projectDir = process.cwd()) {
  const statePath = path.join(projectDir, STATE_FILE);

  if (fs.existsSync(statePath)) {
    const backupDir = path.join(projectDir, BACKUP_DIR);
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `orchestrate-state-${timestamp}.json`);
    fs.copyFileSync(statePath, backupPath);

    return backupPath;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Task State Updates
// ---------------------------------------------------------------------------

/**
 * Update task status
 */
function updateTask(taskId, updates, projectDir = process.cwd()) {
  const state = loadState(projectDir);
  const taskIndex = state.tasks.findIndex(t => t.id === taskId);

  if (taskIndex >= 0) {
    state.tasks[taskIndex] = {
      ...state.tasks[taskIndex],
      ...updates,
      updated_at: new Date().toISOString()
    };
  } else {
    state.tasks.push({
      id: taskId,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...updates
    });
  }

  saveState(state, projectDir);
  return state.tasks[taskIndex >= 0 ? taskIndex : state.tasks.length - 1];
}

/**
 * Get task by ID
 */
function getTask(taskId, projectDir = process.cwd()) {
  const state = loadState(projectDir);
  return state.tasks.find(t => t.id === taskId);
}

/**
 * Get tasks by status
 */
function getTasksByStatus(status, projectDir = process.cwd()) {
  const state = loadState(projectDir);
  return state.tasks.filter(t => t.status === status);
}

// ---------------------------------------------------------------------------
// Progress Tracking
// ---------------------------------------------------------------------------

/**
 * Update current layer
 */
function setCurrentLayer(layer, projectDir = process.cwd()) {
  const state = loadState(projectDir);
  state.current_layer = layer;
  saveState(state, projectDir);
}

function upsertDecision(decision, projectDir = process.cwd()) {
  const state = loadState(projectDir);
  const timestamp = new Date().toISOString();
  const next = {
    updated_at: timestamp,
    ...decision
  };
  const index = state.decisions.findIndex((entry) => entry.id === next.id);
  if (index >= 0) {
    state.decisions[index] = {
      created_at: state.decisions[index].created_at || timestamp,
      ...next
    };
  } else {
    state.decisions.push({
      created_at: timestamp,
      ...next
    });
  }
  saveState(state, projectDir);
  return state.decisions[index >= 0 ? index : state.decisions.length - 1];
}

function resolveDecision(decisionId, action, projectDir = process.cwd(), extra = {}) {
  const state = loadState(projectDir);
  const index = state.decisions.findIndex((entry) => entry.id === decisionId);
  if (index === -1) return null;
  state.decisions[index] = {
    ...state.decisions[index],
    status: action === 'approve' ? 'resolved' : 'rejected',
    resolution_action: action,
    resolved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...extra
  };
  saveState(state, projectDir);
  return state.decisions[index];
}

function clearTaskDecisions(taskId, projectDir = process.cwd()) {
  const state = loadState(projectDir);
  const nextDecisions = state.decisions.filter((entry) => entry.task_id !== taskId);
  if (nextDecisions.length === state.decisions.length) return false;
  state.decisions = nextDecisions;
  saveState(state, projectDir);
  return true;
}

/**
 * Get progress summary
 */
function getProgress(projectDir = process.cwd()) {
  const state = loadState(projectDir);

  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const pending = total - completed - failed - inProgress;

  return {
    total,
    completed,
    failed,
    in_progress: inProgress,
    pending,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0
  };
}

/**
 * Check if orchestration is complete
 */
function isComplete(projectDir = process.cwd()) {
  const state = loadState(projectDir);
  const progress = getProgress(projectDir);
  return progress.pending === 0 && progress.in_progress === 0;
}

/**
 * Check if orchestration can be resumed
 */
function canResume(projectDir = process.cwd()) {
  const statePath = path.join(projectDir, STATE_FILE);
  if (!fs.existsSync(statePath)) return false;

  const state = loadState(projectDir);
  const progress = getProgress(projectDir);

  // Can resume if there are pending or failed tasks
  return progress.pending > 0 || progress.failed > 0;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Clear orchestration state
 */
function clearState(projectDir = process.cwd()) {
  const statePath = path.join(projectDir, STATE_FILE);

  if (fs.existsSync(statePath)) {
    backupState(projectDir);
    fs.unlinkSync(statePath);
  }
}

/**
 * Clear old backups (keep last 5)
 */
function cleanBackups(projectDir = process.cwd(), keep = 5) {
  const backupDir = path.join(projectDir, BACKUP_DIR);

  if (!fs.existsSync(backupDir)) return;

  const files = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('orchestrate-state-'))
    .sort()
    .reverse();

  // Remove files beyond the keep count
  for (const file of files.slice(keep)) {
    fs.unlinkSync(path.join(backupDir, file));
  }
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

if (require.main === module) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'load':
      console.log(JSON.stringify(loadState(), null, 2));
      break;

    case 'progress':
      console.log(JSON.stringify(getProgress(), null, 2));
      break;

    case 'update':
      if (args.length < 1) {
        console.error('Usage: node state.js update <taskId> <key>=<value>...');
        process.exit(1);
      }
      const taskId = args[0];
      const updates = {};
      for (let i = 1; i < args.length; i++) {
        const [key, value] = args[i].split('=');
        updates[key] = value;
      }
      updateTask(taskId, updates);
      console.log(JSON.stringify(getTask(taskId), null, 2));
      break;

    case 'set-layer':
      if (args.length !== 1) {
        console.error('Usage: node state.js set-layer <layer>');
        process.exit(1);
      }
      setCurrentLayer(Number(args[0]) || 0);
      console.log(JSON.stringify(loadState(), null, 2));
      break;

    case 'clear':
      clearState();
      console.log('State cleared');
      break;

    case 'can-resume':
      console.log(canResume() ? 'yes' : 'no');
      break;

    case 'is-complete':
      console.log(isComplete() ? 'yes' : 'no');
      break;

    default:
      console.log(`
Usage: node state.js <command> [args]

Commands:
  load              Load current state
  progress          Show progress summary
  update <id> k=v    Update task status
  clear             Clear state (keeps backup)
  can-resume        Check if can resume
  is-complete       Check if orchestration is complete
      `);
  }
}

module.exports = {
  loadState,
  saveState,
  backupState,
  updateTask,
  getTask,
  getTasksByStatus,
  setCurrentLayer,
  upsertDecision,
  resolveDecision,
  clearTaskDecisions,
  getProgress,
  isComplete,
  canResume,
  clearState,
  cleanBackups
};
