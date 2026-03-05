#!/usr/bin/env node
/**
 * Sprint State Management for Agile Sprint Mode
 *
 * State machine for managing sprint lifecycle:
 * PI_PLANNING → SPRINT_RUNNING → SPRINT_REVIEW → SPRINT_RETRO → (next sprint or PI_COMPLETE)
 *
 * @TASK orchestrate-standalone
 * @SPEC SKILL.md
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = process.cwd() + '/.claude/sprint-state.json';

const TRANSITIONS = {
  PI_PLANNING: { approve: 'SPRINT_RUNNING' },
  SPRINT_RUNNING: { wave_complete: 'SPRINT_REVIEW' },
  SPRINT_REVIEW: {
    approve: 'SPRINT_RETRO',
    modify: 'SPRINT_RUNNING',
    stop: 'PAUSED'
  },
  SPRINT_RETRO: {
    next_sprint: 'SPRINT_RUNNING',
    pi_complete: 'PI_COMPLETE'
  },
  PAUSED: { resume: 'SPRINT_RUNNING' }
};

const VALID_EVENTS = new Set([
  'approve',
  'modify',
  'stop',
  'wave_complete',
  'next_sprint',
  'pi_complete',
  'resume'
]);

let currentState = null;

function isPermissionError(error) {
  return error && (error.code === 'EACCES' || error.code === 'EPERM');
}

function load() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    currentState = parsed;
    return currentState;
  } catch (error) {
    if (error.code === 'ENOENT') {
      currentState = null;
      return null;
    }
    if (isPermissionError(error)) {
      throw new Error(`Permission denied reading sprint state file: ${STATE_FILE}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in sprint state file: ${STATE_FILE}`);
    }
    throw new Error(`Failed to load sprint state: ${error.message}`);
  }
}

function get() {
  return load();
}

function save() {
  if (!currentState) {
    throw new Error('No sprint state in memory. Call init(piPlan) or load() first.');
  }

  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(currentState, null, 2), 'utf8');
    return currentState;
  } catch (error) {
    if (isPermissionError(error)) {
      throw new Error(`Permission denied writing sprint state file: ${STATE_FILE}`);
    }
    throw new Error(`Failed to save sprint state: ${error.message}`);
  }
}

function init(piPlan) {
  if (!piPlan || typeof piPlan !== 'object' || Array.isArray(piPlan)) {
    throw new Error('init(piPlan) requires an object.');
  }

  if (!piPlan.pi_id || typeof piPlan.pi_id !== 'string') {
    throw new Error('init(piPlan) requires piPlan.pi_id (string).');
  }

  const sprints = Array.isArray(piPlan.sprints) ? piPlan.sprints : [];
  const totalSprints = Number.isInteger(piPlan.total_sprints)
    ? piPlan.total_sprints
    : sprints.length;

  const currentSprint = Number.isInteger(piPlan.current_sprint)
    ? piPlan.current_sprint
    : (totalSprints > 0 ? 1 : 0);

  currentState = {
    mode: 'sprint',
    pi_id: piPlan.pi_id,
    sprints,
    current_sprint: currentSprint,
    total_sprints: totalSprints,
    state: 'PI_PLANNING'
  };

  save();
  return currentState;
}

function transition(event) {
  if (!VALID_EVENTS.has(event)) {
    throw new Error(`Invalid event: ${event}`);
  }

  if (!currentState) {
    currentState = load();
  }

  if (!currentState) {
    throw new Error('Sprint state not found. Initialize with init(piPlan) first.');
  }

  const fromState = currentState.state;
  const nextState = TRANSITIONS[fromState] && TRANSITIONS[fromState][event];

  if (!nextState) {
    throw new Error(`Invalid transition: ${fromState} --${event}--> ?`);
  }

  currentState.state = nextState;
  save();
  return currentState;
}

module.exports = {
  init,
  get,
  transition,
  save,
  load
};
