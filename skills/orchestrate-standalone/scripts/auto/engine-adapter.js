#!/usr/bin/env node
/**
 * [파일 목적] engine/auto adapter boundary
 * [주요 흐름] 기존 엔진 함수 재사용 + auto 전용 상태 관리
 * [외부 연결] scheduler, state, worker, gate-chain
 * [수정시 주의] bridge 호환성 유지
 *
 * Engine Adapter for Orchestrate Standalone Auto Mode
 *
 * Provides a thin compatibility layer so auto mode can reuse the existing
 * scheduler, state, worker, and gate-chain modules with a unified API.
 *
 * @TASK orchestrate-standalone
 * @SPEC SKILL.md
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  parseTasks,
  buildDAG,
  createLayers,
  createWaves
} = require('../engine/scheduler');
const {
  loadState,
  saveState,
  updateTask,
  getProgress
} = require('../engine/state');
const {
  executeTask,
  executeLayer
} = require('../engine/worker');
const {
  preDispatchGate,
  postTaskGate,
  barrierGate
} = require('../engine/gate-chain');

const AUTO_STATE_FILE = '.claude/orchestrate/auto-state.json';
const TASKS_FILE = 'TASKS.md';
const BRIDGE_VERSION = '1.0.0';
const AUTO_SCHEMA_VERSION = 1;

/**
 * Get the auto-state path for a project.
 *
 * @param {string} [projectDir=process.cwd()] - Project root directory.
 * @returns {string} Absolute path to auto-state.json.
 */
function getAutoStatePath(projectDir = process.cwd()) {
  return path.join(projectDir, AUTO_STATE_FILE);
}

/**
 * Return a stable JSON representation for hashing.
 *
 * @param {*} value - Value to serialize.
 * @returns {string} Stable serialized JSON string.
 */
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

/**
 * Create a SHA256 hash for a string.
 *
 * @param {string} input - Raw string payload.
 * @returns {string} Hex-encoded SHA256 hash.
 */
function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Compute a SHA256 hash for a file if it exists.
 *
 * @param {string} filePath - File path to hash.
 * @returns {string|null} Hex hash or null when the file does not exist.
 */
function computeFileHash(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return sha256(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Normalize contract fields to the expected auto schema.
 *
 * @param {object} [contract={}] - Partial contract object.
 * @returns {object} Normalized contract.
 */
function normalizeContract(contract = {}) {
  const normalized = {
    version: contract.version || 1,
    hash: '',
    goal: contract.goal || '',
    acceptance_criteria: Array.isArray(contract.acceptance_criteria) ? contract.acceptance_criteria : [],
    constraints: Array.isArray(contract.constraints) ? contract.constraints : [],
    quality_bar: Array.isArray(contract.quality_bar) ? contract.quality_bar : [],
    verify_cmd: typeof contract.verify_cmd === 'string' ? contract.verify_cmd : '',
    extra_checks: Array.isArray(contract.extra_checks) ? contract.extra_checks : []
  };

  normalized.hash = computeContractHash(normalized);
  return normalized;
}

/**
 * Normalize budget fields with conservative defaults for auto mode.
 *
 * @param {object} [budget={}] - Partial budget object.
 * @returns {object} Normalized budget.
 */
function normalizeBudget(budget = {}) {
  return {
    max_iterations: Number.isInteger(budget.max_iterations) ? budget.max_iterations : 10,
    current_iteration: Number.isInteger(budget.current_iteration) ? budget.current_iteration : 0,
    max_dynamic_tasks: Number.isInteger(budget.max_dynamic_tasks) ? budget.max_dynamic_tasks : 20,
    dynamic_tasks_added: Number.isInteger(budget.dynamic_tasks_added) ? budget.dynamic_tasks_added : 0,
    max_estimated_tokens: Number.isInteger(budget.max_estimated_tokens) ? budget.max_estimated_tokens : 0,
    estimated_tokens_used: Number.isInteger(budget.estimated_tokens_used) ? budget.estimated_tokens_used : 0
  };
}

/**
 * Normalize task summary fields.
 *
 * @param {object} [tasks={}] - Partial task summary object.
 * @returns {object} Normalized task summary.
 */
function normalizeTaskSummary(tasks = {}) {
  return {
    total: Number.isInteger(tasks.total) ? tasks.total : 0,
    completed: Number.isInteger(tasks.completed) ? tasks.completed : 0,
    in_progress: Number.isInteger(tasks.in_progress) ? tasks.in_progress : 0,
    failed: Number.isInteger(tasks.failed) ? tasks.failed : 0,
    dynamically_added: Number.isInteger(tasks.dynamically_added) ? tasks.dynamically_added : 0
  };
}

/**
 * Normalize assessment cache entries keyed by task id.
 *
 * @param {object} [cache={}] - Partial assessment cache.
 * @returns {object} Normalized assessment cache.
 */
function normalizeAssessmentCache(cache = {}) {
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(cache).map(([taskId, entry]) => [
      String(taskId),
      {
        hash: entry && typeof entry.hash === 'string' ? entry.hash : '',
        verdict: entry && typeof entry.verdict === 'string' ? entry.verdict : '',
        timestamp: entry && typeof entry.timestamp === 'string' ? entry.timestamp : ''
      }
    ])
  );
}

function normalizePendingGate(gate = null) {
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    return null;
  }

  return {
    gate_id: typeof gate.gate_id === 'string' ? gate.gate_id : '',
    gate_name: typeof gate.gate_name === 'string' ? gate.gate_name : '',
    stage: typeof gate.stage === 'string' ? gate.stage : '',
    task_id: typeof gate.task_id === 'string' ? gate.task_id : null,
    run_id: typeof gate.run_id === 'string' ? gate.run_id : '',
    correlation_id: typeof gate.correlation_id === 'string' ? gate.correlation_id : '',
    choices: Array.isArray(gate.choices) ? gate.choices.map(String) : [],
    default_behavior: typeof gate.default_behavior === 'string' ? gate.default_behavior : 'wait_for_operator',
    timeout_policy: typeof gate.timeout_policy === 'string' ? gate.timeout_policy : 'wait_for_operator',
    created_at: typeof gate.created_at === 'string' ? gate.created_at : null,
    preview: typeof gate.preview === 'string' ? gate.preview : '',
  };
}

/**
 * Normalize the full auto-state payload before persistence.
 *
 * @param {object} state - Partial auto-state payload.
 * @param {string} [projectDir=process.cwd()] - Project root directory.
 * @returns {object} Normalized auto-state object.
 */
function normalizeAutoState(state, projectDir = process.cwd()) {
  const tasksPath = path.join(projectDir, TASKS_FILE);
  const normalized = {
    schema_version: AUTO_SCHEMA_VERSION,
    session_id: state && state.session_id ? state.session_id : crypto.randomUUID(),
    contract: normalizeContract(state && state.contract ? state.contract : {}),
    budget: normalizeBudget(state && state.budget ? state.budget : {}),
    tasks: normalizeTaskSummary(state && state.tasks ? state.tasks : {}),
    assessment_cache: normalizeAssessmentCache(state && state.assessment_cache ? state.assessment_cache : {}),
    assessment_cache_contract_hash: state && typeof state.assessment_cache_contract_hash === 'string'
      ? state.assessment_cache_contract_hash
      : '',
    last_assessment: state && state.last_assessment && typeof state.last_assessment === 'object'
      ? state.last_assessment
      : null,
    pending_gate: normalizePendingGate(state && state.pending_gate ? state.pending_gate : null),
    tasks_md_hash: state && Object.prototype.hasOwnProperty.call(state, 'tasks_md_hash')
      ? state.tasks_md_hash
      : computeFileHash(tasksPath)
  };

  return normalized;
}

/**
 * Estimate task complexity on a bounded 1-5 scale.
 *
 * @param {object} [task={}] - Task payload.
 * @returns {number} Estimated complexity from 1 to 5.
 */
function estimateComplexity(task = {}) {
  const description = typeof task.description === 'string' ? task.description : '';
  const descriptionLength = description.length;
  const baseFromDescription = descriptionLength < 30
    ? 1
    : descriptionLength < 80
      ? 2
      : descriptionLength < 150
        ? 3
        : descriptionLength < 300
          ? 4
          : 5;

  const deps = Array.isArray(task.deps) ? task.deps : [];
  const depBonus = deps.length === 0 ? 0 : deps.length <= 2 ? 1 : 2;

  const files = Array.isArray(task.files) ? task.files : [];
  const fileBonus = files.length <= 1 ? 0 : files.length <= 3 ? 1 : 2;

  const riskLevel = typeof task.risk === 'string' ? task.risk.toLowerCase() : '';
  const riskBonus = riskLevel === 'critical'
    ? 3
    : riskLevel === 'high'
      ? 2
      : riskLevel === 'medium'
        ? 1
        : 0;

  const domainConflictBonus = task.domain ? 1 : 0;
  const rawScore = baseFromDescription + depBonus + fileBonus + riskBonus + domainConflictBonus;

  return Math.max(1, Math.min(5, rawScore));
}

/**
 * Estimate aggregate complexity metrics for a layer.
 *
 * @param {object[]} [layer=[]] - Tasks in the layer.
 * @returns {object} Layer complexity summary.
 */
function estimateLayerComplexity(layer = []) {
  const tasks = Array.isArray(layer) ? layer : [];
  const complexities = tasks.map(task => estimateComplexity(task));
  const total = complexities.reduce((sum, complexity) => sum + complexity, 0);
  const max = complexities.length > 0 ? Math.max(...complexities) : 0;

  return {
    total,
    average: complexities.length > 0 ? total / complexities.length : 0,
    max,
    estimated_parallelism: Math.ceil(tasks.length / Math.max(1, max))
  };
}

/**
 * Compute the contract hash from the mutable contract fields only.
 *
 * @param {object} [contract={}] - Contract payload.
 * @returns {string} Hex-encoded SHA256 hash.
 */
function computeContractHash(contract = {}) {
  const payload = {
    acceptance_criteria: Array.isArray(contract.acceptance_criteria) ? contract.acceptance_criteria : [],
    constraints: Array.isArray(contract.constraints) ? contract.constraints : [],
    quality_bar: Array.isArray(contract.quality_bar) ? contract.quality_bar : [],
    verify_cmd: typeof contract.verify_cmd === 'string' ? contract.verify_cmd : '',
    extra_checks: Array.isArray(contract.extra_checks) ? contract.extra_checks : []
  };

  return sha256(stableStringify(payload));
}

/**
 * Initialize a new auto-state file with a contract stub.
 *
 * @param {string} goal - Auto-mode goal statement.
 * @param {string} [projectDir=process.cwd()] - Project root directory.
 * @returns {object} Newly initialized auto-state object.
 */
function initAutoState(goal, projectDir = process.cwd()) {
  const autoState = normalizeAutoState({
    contract: {
      version: 1,
      goal: goal || '',
      acceptance_criteria: [],
      constraints: [],
      quality_bar: [],
      verify_cmd: '',
      extra_checks: []
    },
    budget: {
      max_iterations: 10,
      current_iteration: 0,
      max_dynamic_tasks: 20,
      dynamic_tasks_added: 0,
      max_estimated_tokens: 0,
      estimated_tokens_used: 0
    },
    tasks: {
      total: 0,
      completed: 0,
      in_progress: 0,
      failed: 0,
      dynamically_added: 0
    },
    assessment_cache: {},
    assessment_cache_contract_hash: '',
    last_assessment: null
  }, projectDir);

  return saveAutoState(autoState, projectDir);
}

/**
 * Load auto-state.json from the project.
 *
 * @param {string} [projectDir=process.cwd()] - Project root directory.
 * @returns {object|null} Parsed auto-state or null when not initialized.
 */
function loadAutoState(projectDir = process.cwd()) {
  const autoStatePath = getAutoStatePath(projectDir);

  if (!fs.existsSync(autoStatePath)) {
    return null;
  }

  try {
    const state = JSON.parse(fs.readFileSync(autoStatePath, 'utf8'));
    return normalizeAutoState(state, projectDir);
  } catch (error) {
    throw new Error(`Failed to load auto state: ${error.message}`);
  }
}

/**
 * Persist auto-state.json and refresh the legacy bridge state.
 *
 * @param {object} state - Auto-state payload.
 * @param {string} [projectDir=process.cwd()] - Project root directory.
 * @returns {object} Normalized auto-state object.
 */
function saveAutoState(state, projectDir = process.cwd()) {
  const autoStatePath = getAutoStatePath(projectDir);
  const normalized = normalizeAutoState(state || {}, projectDir);

  try {
    fs.mkdirSync(path.dirname(autoStatePath), { recursive: true });
    fs.writeFileSync(autoStatePath, JSON.stringify(normalized, null, 2));
  } catch (error) {
    throw new Error(`Failed to save auto state: ${error.message}`);
  }

  writeBridge(normalized, projectDir);
  return normalized;
}

/**
 * Write a backward-compatible orchestrate-state.json bridge.
 *
 * The auto-state schema tracks summary counts only, so this bridge preserves
 * any existing legacy task entries when available and exposes iteration data
 * through the layer fields used by the existing engine.
 *
 * @param {object} autoState - Normalized auto-state object.
 * @param {string} [projectDir=process.cwd()] - Project root directory.
 * @returns {object} Persisted bridge state.
 */
function writeBridge(autoState, projectDir = process.cwd()) {
  const previousBridge = loadState(projectDir);
  const bridgeState = {
    version: previousBridge.version || BRIDGE_VERSION,
    started_at: previousBridge.started_at || new Date().toISOString(),
    tasks: Array.isArray(previousBridge.tasks) ? previousBridge.tasks : [],
    current_layer: autoState && autoState.budget ? autoState.budget.current_iteration : 0,
    total_layers: autoState && autoState.budget ? autoState.budget.max_iterations : 0,
    mode: 'auto',
    pending_gate: autoState && autoState.pending_gate ? autoState.pending_gate : null,
  };

  saveState(bridgeState, projectDir);
  return bridgeState;
}

module.exports = {
  AUTO_STATE_FILE,
  parseTasks,
  buildDAG,
  createLayers,
  createWaves,
  loadState,
  saveState,
  updateTask,
  getProgress,
  executeTask,
  executeLayer,
  preDispatchGate,
  postTaskGate,
  barrierGate,
  initAutoState,
  loadAutoState,
  saveAutoState,
  estimateComplexity,
  estimateLayerComplexity,
  computeContractHash,
  writeBridge
};
