#!/usr/bin/env node
/**
 * [파일 목적] DCPEA autonomous orchestration loop
 * [주요 흐름] Define→Decompose→Plan→Execute→Assess→Adjust
 * [외부 연결] engine-adapter, event-log
 * [수정시 주의] Human gate prompts must be synchronous readline
 *
 * Auto Orchestrator for Orchestrate Standalone
 *
 * Implements the MVP autonomous loop for `--mode=auto` with mandatory human
 * approval gates, budget enforcement, and resume support.
 *
 * @TASK orchestrate-standalone
 * @SPEC SKILL.md
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const { exec, execSync, spawnSync } = require('child_process');

const {
  parseTasks,
  buildDAG,
  createLayers,
  loadState,
  saveState,
  initAutoState,
  loadAutoState,
  saveAutoState
} = require('./engine-adapter');
const {
  appendEvent,
  readEvents
} = require('./event-log');
const {
  syncToLinear,
  isLinearSyncAvailable
} = require('./linear-sync');
const {
  readControlCommands,
} = require('../../../../project-team/scripts/lib/whitebox-control');
const {
  readEvents: readWhiteboxEvents,
} = require('../../../../project-team/scripts/lib/whitebox-events');
const {
  emitRunEventStrict,
} = require('../../../../project-team/scripts/lib/whitebox-run');

const { executeLayer } = require('../engine/worker');

const TASKS_FILE = 'TASKS.md';
const DEFAULT_MAX_DEFINE_RETRIES = 3;
const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_MAX_DYNAMIC_TASKS = 20;
const DEFAULT_WORKER_COUNT = 2;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 2;
const SUBAGENT_TIMEOUT_MS = 120000;
const DEFAULT_APPROVAL_POLL_INTERVAL_MS = 250;
const DEFAULT_APPROVAL_WAIT_MS = 60000;

// ---------------------------------------------------------------------------
// Prompt Utilities
// ---------------------------------------------------------------------------

/**
 * Create a readline interface for mandatory human gates.
 *
 * @returns {readline.Interface} Interactive readline interface.
 */
function createPromptInterface() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return null;
  }

  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Ask a single readline question.
 *
 * @param {readline.Interface} rl - Active readline interface.
 * @param {string} prompt - Prompt string.
 * @returns {Promise<string>} User input.
 */
function askQuestion(rl, prompt) {
  if (!rl) {
    throw new Error('Human gate prompt requires an interactive TTY');
  }
  return new Promise(resolve => {
    rl.question(prompt, answer => resolve(String(answer || '').trim()));
  });
}

/**
 * Ask an optional yes/no question with a conservative default of "no".
 *
 * @param {readline.Interface} rl - Active readline interface.
 * @param {string} prompt - Prompt string.
 * @returns {Promise<boolean>} True only when the user explicitly answers yes.
 */
async function askOptionalYesNo(rl, prompt) {
  if (!rl) return false;
  const answer = (await askQuestion(rl, prompt)).toLowerCase();
  return answer === 'y' || answer === 'yes';
}

/**
 * Print a gate preview block to stdout.
 *
 * @param {string} title - Gate title.
 * @param {string} body - Content preview.
 */
function printGatePreview(title, body) {
  process.stdout.write(`\n=== ${title} ===\n`);
  process.stdout.write(`${body}\n`);
}

/**
 * Prompt for a mandatory human gate decision.
 *
 * @param {readline.Interface} rl - Active readline interface.
 * @param {string} gateName - Gate name.
 * @param {string} preview - Human-readable preview text.
 * @param {string} [modifyPrompt='Modification instructions: '] - Feedback prompt.
 * @returns {Promise<{ action: string, feedback?: string }>} Gate decision.
 */
async function promptGate(rl, gateName, preview, modifyPrompt = 'Modification instructions: ') {
  printGatePreview(gateName, preview);

  while (true) {
    const answer = (await askQuestion(rl, `${gateName} [approve/reject/modify]: `)).toLowerCase();

    if (answer === 'approve' || answer === 'a') {
      return { action: 'approve' };
    }

    if (answer === 'reject' || answer === 'r') {
      return { action: 'reject' };
    }

    if (answer === 'modify' || answer === 'm') {
      const feedback = await askQuestion(rl, modifyPrompt);
      return { action: 'modify', feedback };
    }

    process.stdout.write('Enter one of: approve, reject, modify\n');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createGateId(stage, autoState) {
  const sessionId = autoState && autoState.session_id ? autoState.session_id : crypto.randomUUID();
  const token = crypto.randomBytes(3).toString('hex');
  return `${String(stage || 'gate').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}-${sessionId}-${token}`;
}

function normalizePendingGate(autoState, gateName, preview, options = {}) {
  const existing = autoState && autoState.pending_gate ? autoState.pending_gate : null;
  if (existing && existing.stage === options.stage && existing.gate_name === gateName) {
    return existing;
  }

  return {
    gate_id: createGateId(options.stage || gateName, autoState),
    gate_name: gateName,
    stage: options.stage || gateName,
    task_id: options.taskId || null,
    run_id: autoState && autoState.session_id ? autoState.session_id : '',
    correlation_id: autoState && autoState.session_id
      ? `gate:${autoState.session_id}:${options.stage || gateName}`
      : createGateId('correlation', autoState),
    choices: ['approve', 'reject'],
    default_behavior: 'wait_for_operator',
    timeout_policy: options.timeoutPolicy || `wait_${options.approvalWaitMs || DEFAULT_APPROVAL_WAIT_MS}ms`,
    created_at: new Date().toISOString(),
    preview,
  };
}

async function emitApprovalLifecycle(type, gate, actor, projectDir) {
  const data = {
    actor,
    gate_id: gate.gate_id,
    task_id: gate.task_id,
    run_id: gate.run_id,
  };

  if (type === 'approval_required') {
    data.choices = gate.choices;
    data.default_behavior = gate.default_behavior;
    data.timeout_policy = gate.timeout_policy;
  }

  await emitRunEventStrict({
    type,
    producer: 'orchestrate-auto',
    projectDir,
    correlationId: gate.correlation_id,
    data,
    stage: type,
  });
}

function findGateCommand(gate, projectDir) {
  const parsed = readControlCommands({ projectDir });
  return parsed.commands.find((command) => command
    && (command.type === 'approve' || command.type === 'reject')
    && command.target
    && command.target.gate_id === gate.gate_id
    && command.correlation_id === gate.correlation_id);
}

function hasLifecycleEvent(projectDir, correlationId, type) {
  const parsed = readWhiteboxEvents({ projectDir, tolerateTrailingPartialLine: true });
  return parsed.events.some((event) => event
    && event.correlation_id === correlationId
    && event.type === type);
}

async function waitForFileGateDecision(autoState, gateName, preview, options = {}) {
  const projectDir = options.projectDir || process.cwd();
  const approvalPollIntervalMs = Number.isInteger(options.approvalPollIntervalMs)
    ? options.approvalPollIntervalMs
    : DEFAULT_APPROVAL_POLL_INTERVAL_MS;
  const approvalWaitMs = Number.isInteger(options.approvalWaitMs)
    ? options.approvalWaitMs
    : DEFAULT_APPROVAL_WAIT_MS;
  const gate = normalizePendingGate(autoState, gateName, preview, {
    stage: options.stage,
    taskId: options.taskId,
    timeoutPolicy: options.timeoutPolicy,
    approvalWaitMs,
  });

  if (!autoState.pending_gate || autoState.pending_gate.gate_id !== gate.gate_id) {
    autoState.pending_gate = gate;
    saveAutoState(autoState, projectDir);
    await emitApprovalLifecycle('approval_required', gate, 'system', projectDir);
    await emitApprovalLifecycle('execution_paused', gate, 'system', projectDir);
  }

  const deadline = Date.now() + approvalWaitMs;
  while (Date.now() <= deadline) {
    const command = findGateCommand(gate, projectDir);
    if (command) {
      const actor = command.actor && command.actor.id ? command.actor.id : 'user';
      if (command.type === 'approve') {
        if (!hasLifecycleEvent(projectDir, gate.correlation_id, 'approval_granted')) {
          await emitApprovalLifecycle('approval_granted', gate, actor, projectDir);
        }
        if (!hasLifecycleEvent(projectDir, gate.correlation_id, 'execution_resumed')) {
          await emitApprovalLifecycle('execution_resumed', gate, 'system', projectDir);
        }
      } else {
        if (!hasLifecycleEvent(projectDir, gate.correlation_id, 'approval_rejected')) {
          await emitApprovalLifecycle('approval_rejected', gate, actor, projectDir);
        }
      }

      autoState.pending_gate = null;
      saveAutoState(autoState, projectDir);
      return { action: command.type, command, gate };
    }

    await sleep(approvalPollIntervalMs);
  }

  throw new Error(`Timed out waiting for control command for ${gate.gate_id}`);
}

async function resolveGateDecision(rl, gateName, preview, modifyPrompt, autoState, options = {}) {
  if (rl) {
    return promptGate(rl, gateName, preview, modifyPrompt);
  }

  return waitForFileGateDecision(autoState, gateName, preview, options);
}

// ---------------------------------------------------------------------------
// CLI / Shell Utilities
// ---------------------------------------------------------------------------

/**
 * Parse CLI options for standalone execution.
 *
 * @param {string[]} argv - Raw CLI args after node/script name.
 * @returns {{ goal: string, options: object }} Parsed goal and options.
 */
function parseCliArgs(argv) {
  const options = {
    resume: false,
    maxIterations: undefined,
    maxDynamicTasks: undefined,
    workerCount: DEFAULT_WORKER_COUNT,
    maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES,
    claudePath: 'claude',
    projectDir: process.cwd()
  };
  const goalParts = [];

  for (const arg of argv) {
    if (arg === '--resume') {
      options.resume = true;
      continue;
    }

    if (arg.startsWith('--max-iterations=')) {
      options.maxIterations = Number.parseInt(arg.split('=')[1], 10);
      continue;
    }

    if (arg.startsWith('--max-dynamic-tasks=')) {
      options.maxDynamicTasks = Number.parseInt(arg.split('=')[1], 10);
      continue;
    }

    if (arg.startsWith('--worker-count=')) {
      options.workerCount = Number.parseInt(arg.split('=')[1], 10);
      continue;
    }

    if (arg.startsWith('--max-consecutive-failures=')) {
      options.maxConsecutiveFailures = Number.parseInt(arg.split('=')[1], 10);
      continue;
    }

    if (arg.startsWith('--claude-path=')) {
      options.claudePath = arg.split('=')[1] || 'claude';
      continue;
    }

    goalParts.push(arg);
  }

  return {
    goal: goalParts.join(' ').trim(),
    options
  };
}

/**
 * Quote a shell token for `execSync`.
 *
 * @param {string} value - Raw token.
 * @returns {string} Shell-safe token.
 */
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Extract the executable token from a shell command.
 *
 * @param {string} command - Full shell command.
 * @returns {string} Executable token.
 */
function getExecutableToken(command) {
  const match = String(command || '').trim().match(/^(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (!match) {
    return '';
  }

  return match[1] || match[2] || match[3] || '';
}

/**
 * Validate that a command executable is present on PATH.
 *
 * @param {string} command - Shell command string.
 */
function validateExecutable(command) {
  const executable = getExecutableToken(command);

  if (!executable) {
    throw new Error('verify_cmd must not be empty');
  }

  const locator = process.platform === 'win32' ? 'where' : 'command -v';
  execSync(`${locator} ${shellQuote(executable)}`, {
    stdio: 'ignore',
    shell: process.platform === 'win32' ? true : '/bin/sh'
  });
}

// ---------------------------------------------------------------------------
// Claude Subagent Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a JSON object from Claude CLI output.
 *
 * @param {string} output - Raw CLI output.
 * @returns {object} Parsed JSON object.
 */
function extractJson(output) {
  const trimmed = String(output || '').trim();

  if (!trimmed) {
    throw new Error('Claude returned empty output');
  }

  try {
    return JSON.parse(trimmed);
  } catch {}

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/);
  if (fenced) {
    return JSON.parse(fenced[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new Error('Failed to extract JSON from Claude output');
}

/**
 * Remove Markdown fences from a generated TASKS.md block.
 *
 * @param {string} output - Raw Claude output.
 * @returns {string} Plain TASKS.md content.
 */
function stripMarkdownFence(output) {
  const trimmed = String(output || '').trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Run Claude CLI synchronously and return stdout.
 *
 * @param {string} prompt - Prompt text.
 * @param {object} [options={}] - CLI options.
 * @param {string} [options.projectDir=process.cwd()] - Working directory.
 * @param {string} [options.claudePath='claude'] - Claude executable.
 * @returns {string} CLI stdout.
 */
function runClaudePrompt(prompt, options = {}) {
  const {
    projectDir = process.cwd(),
    claudePath = 'claude'
  } = options;

  const result = spawnSync(
    claudePath,
    ['-p', prompt, '--output-format', 'text'],
    {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: SUBAGENT_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 4,
      env: {
        ...process.env,
        CLAUDE_AGENT_ROLE: 'auto-orchestrator'
      }
    }
  );

  if (result.error) {
    throw new Error(`Claude CLI failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(`Claude CLI exited with code ${result.status}${stderr ? `: ${stderr}` : ''}`);
  }

  return String(result.stdout || '').trim();
}

/**
 * Build the embedded contract prompt for Define.
 *
 * @param {string} goal - Project goal.
 * @param {string} [feedback=''] - Optional user feedback.
 * @returns {string} Prompt text.
 */
function buildContractPrompt(goal, feedback = '') {
  return [
    'You are generating an implementation contract for an autonomous coding loop.',
    'Return JSON only. Do not wrap in Markdown.',
    '',
    'Goal:',
    goal,
    '',
    'Required JSON schema:',
    '{',
    '  "acceptance_criteria": ["specific, testable outcomes"],',
    '  "constraints": ["hard constraints, dependencies, prohibitions"],',
    '  "quality_bar": ["quality expectations"],',
    '  "verify_cmd": "single shell command that verifies the outcome",',
    '  "extra_checks": ["optional shell command", "optional shell command"]',
    '}',
    '',
    'Rules:',
    '- acceptance_criteria must be concrete and verifiable.',
    '- constraints must include repository and workflow constraints when relevant.',
    '- quality_bar must describe review/test expectations.',
    '- verify_cmd must be executable from project root.',
    '- extra_checks should be useful but non-duplicative.',
    '- Prefer conservative commands already likely to exist.',
    ''
  ].concat(feedback ? ['Human feedback to incorporate:', feedback, ''] : []).join('\n');
}

/**
 * Build the embedded decomposition prompt for TASKS.md generation.
 *
 * @param {object} contract - Approved contract.
 * @param {string} [feedback=''] - Optional user feedback.
 * @returns {string} Prompt text.
 */
function buildDecomposePrompt(contract, feedback = '') {
  return [
    'You are decomposing an implementation contract into TASKS.md for dependency-based execution.',
    'Return TASKS.md content only. Do not wrap in Markdown fences.',
    '',
    'Contract JSON:',
    JSON.stringify(contract, null, 2),
    '',
    'Output requirements:',
    '- Use bullet tasks only.',
    '- Each task must follow: - [ ] TASK_ID: Description',
    '- Each task must include indented metadata lines.',
    '- IDs must start with an uppercase letter and support dependency references such as T1, T1.1, P1-T1, AUTH-03.',
    '- Each task must include at least deps, domain, risk, owner, model.',
    '- Keep tasks implementation-sized and dependency-aware.',
    '- Sequence tasks so parseTasks() and DAG scheduling can execute them.',
    '',
    'Example format:',
    '- [ ] T1: Example task',
    '  - deps: []',
    '  - domain: backend',
    '  - risk: low',
    '  - owner: default',
    '  - model: sonnet',
    ''
  ].concat(feedback ? ['Human feedback to incorporate:', feedback, ''] : []).join('\n');
}

// ---------------------------------------------------------------------------
// Contract / Task Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a generated contract to the expected runtime shape.
 *
 * @param {object} raw - Raw contract object.
 * @param {string} goal - Goal string.
 * @returns {object} Normalized contract.
 */
function normalizeContract(raw, goal) {
  const normalizeArray = value => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map(item => String(item || '').trim())
      .filter(Boolean);
  };

  return {
    version: 1,
    goal: goal || '',
    acceptance_criteria: normalizeArray(raw.acceptance_criteria),
    constraints: normalizeArray(raw.constraints),
    quality_bar: normalizeArray(raw.quality_bar),
    verify_cmd: String(raw.verify_cmd || '').trim(),
    extra_checks: normalizeArray(raw.extra_checks)
  };
}

/**
 * Validate the generated contract structure.
 *
 * @param {object} contract - Normalized contract.
 */
function validateContract(contract) {
  if (!contract.acceptance_criteria.length) {
    throw new Error('Contract must include at least one acceptance criterion');
  }

  if (!contract.quality_bar.length) {
    throw new Error('Contract must include at least one quality_bar item');
  }

  if (!contract.verify_cmd) {
    throw new Error('Contract must include verify_cmd');
  }

  validateExecutable(contract.verify_cmd);
}

/**
 * Get the absolute TASKS.md path.
 *
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {string} Absolute TASKS.md path.
 */
function getTasksPath(projectDir = process.cwd()) {
  return path.join(projectDir, TASKS_FILE);
}

/**
 * Return true when the completed scope warrants an optional council review.
 *
 * @param {Array<object>} tasks - Parsed task list.
 * @returns {boolean} Whether a multi-AI review should be suggested.
 */
function shouldTriggerMultiAiReview(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return false;
  }

  if (tasks.length > 20) {
    return true;
  }

  return tasks.some(task => {
    const domain = String(task && task.domain ? task.domain : '').toLowerCase();
    const risk = String(task && task.risk ? task.risk : '').toLowerCase();
    return domain === 'architecture' || risk === 'critical';
  });
}

/**
 * Resolve the optional multi-AI council entrypoint.
 *
 * @returns {string} Absolute script path.
 */
function getCouncilScriptPath() {
  return path.resolve(__dirname, '../../../multi-ai-review/scripts/council.sh');
}

/**
 * Build a compact review brief for council.sh.
 *
 * @param {Array<object>} tasks - Completed tasks.
 * @param {object} contract - Approved contract.
 * @param {object} assessment - Final assessment payload.
 * @returns {string} Review prompt text.
 */
function buildMultiAiReviewSummary(tasks, contract, assessment) {
  const highlightedTasks = tasks
    .filter(task => {
      const domain = String(task && task.domain ? task.domain : '').toLowerCase();
      const risk = String(task && task.risk ? task.risk : '').toLowerCase();
      return domain === 'architecture' || risk === 'critical';
    })
    .slice(0, 8)
    .map(task => `- ${task.id}: ${task.description} [domain=${task.domain || 'general'}, risk=${task.risk || 'low'}]`);
  const taskSummary = tasks
    .slice(0, 12)
    .map(task => `- ${task.id}: ${task.description} [domain=${task.domain || 'general'}, risk=${task.risk || 'low'}]`);

  return [
    'Review this completed orchestrator run.',
    `Goal: ${contract && contract.goal ? contract.goal : 'N/A'}`,
    `Verdict: ${assessment && assessment.verdict ? assessment.verdict : 'PASS'}`,
    `Completion rate: ${assessment && typeof assessment.completion_rate === 'number' ? assessment.completion_rate : 100}%`,
    `Verify command: ${assessment && assessment.verify && assessment.verify.command ? assessment.verify.command : 'N/A'}`,
    `Total tasks: ${tasks.length}`,
    highlightedTasks.length ? 'Architecture / critical tasks:' : '',
    ...highlightedTasks,
    'Task summary:',
    ...taskSummary,
    tasks.length > taskSummary.length ? `- ...and ${tasks.length - taskSummary.length} more completed tasks.` : '',
    'Focus on architecture soundness, critical-risk regressions, and missing follow-up work.'
  ].filter(Boolean).join('\n');
}

/**
 * Optionally launch a multi-AI review after Final Gate approval.
 *
 * @param {readline.Interface} rl - Active readline interface.
 * @param {Array<object>} tasks - Planned tasks for the run.
 * @param {object} contract - Approved contract.
 * @param {object} assessment - Final assessment.
 * @param {object} [options={}] - Runtime options.
 * @param {string} [options.projectDir=process.cwd()] - Project root.
 */
async function maybeRunMultiAiReview(rl, tasks, contract, assessment, options = {}) {
  const {
    projectDir = process.cwd()
  } = options;

  if (!shouldTriggerMultiAiReview(tasks)) {
    return;
  }

  const councilScript = getCouncilScriptPath();
  if (!fs.existsSync(councilScript)) {
    appendEvent('multi_ai_review', {
      status: 'unavailable',
      reason: 'council.sh not found'
    }, projectDir);
    return;
  }

  const shouldRun = await askOptionalYesNo(rl, 'Multi-AI review recommended. Run now? [y/N] ');
  if (!shouldRun) {
    appendEvent('multi_ai_review', {
      status: 'skipped'
    }, projectDir);
    return;
  }

  const summary = buildMultiAiReviewSummary(tasks, contract, assessment);
  const result = spawnSync(councilScript, [summary], {
    cwd: projectDir,
    stdio: 'inherit'
  });

  if (result.error) {
    appendEvent('multi_ai_review', {
      status: 'failed',
      error: result.error.message
    }, projectDir);
    return;
  }

  appendEvent('multi_ai_review', {
    status: result.status === 0 ? 'completed' : 'failed',
    exit_code: Number.isInteger(result.status) ? result.status : null
  }, projectDir);
}

/**
 * Optionally sync the current auto-state to Linear without affecting orchestration.
 *
 * @param {object} autoState - Current auto-state.
 * @param {object} [options={}] - Runtime options.
 * @param {string} [options.projectDir=process.cwd()] - Project root.
 * @returns {{ synced: boolean, reason?: string, error?: string }} Sync result.
 */
function maybeSyncLinearProgress(autoState, options = {}) {
  const {
    projectDir = process.cwd()
  } = options;

  if (!isLinearSyncAvailable(projectDir)) {
    return {
      synced: false,
      reason: 'linear-sync not available'
    };
  }

  const result = syncToLinear(autoState, projectDir);
  const detail = result.error || result.reason || null;
  const syncStatus = result.synced ? 'completed' : (result.reason ? 'skipped' : 'failed');

  appendEvent('linear_sync', {
    status: syncStatus,
    synced: result.synced,
    detail,
    iteration: Number(autoState && autoState.budget && autoState.budget.current_iteration) || 0,
    verdict: autoState && autoState.last_assessment
      ? autoState.last_assessment.verdict || null
      : null
  }, projectDir);

  if (result.synced) {
    process.stdout.write('Linear sync completed.\n');
  } else if (result.reason) {
    process.stdout.write(`Linear sync skipped: ${detail}\n`);
  } else {
    process.stdout.write(`Linear sync failed: ${detail || 'unknown error'}\n`);
  }

  return result;
}

/**
 * Synchronize current task definitions into bridge state.
 *
 * @param {Array<object>} tasks - Parsed tasks.
 * @param {number} totalLayers - Number of planned layers.
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {object} Updated bridge state.
 */
function syncBridgeState(tasks, totalLayers, projectDir = process.cwd()) {
  const state = loadState(projectDir);
  const byId = new Map((Array.isArray(state.tasks) ? state.tasks : []).map(task => [task.id, task]));

  for (const task of tasks) {
    const existing = byId.get(task.id);
    const fallbackStatus = task.status === 'completed' ? 'completed' : 'pending';
    byId.set(task.id, {
      ...existing,
      id: task.id,
      description: task.description,
      deps: task.deps || [],
      domain: task.domain || null,
      risk: task.risk || 'low',
      owner: task.owner || 'default',
      model: task.model || 'sonnet',
      status: existing && existing.status ? existing.status : fallbackStatus,
      updated_at: new Date().toISOString(),
      created_at: existing && existing.created_at ? existing.created_at : new Date().toISOString()
    });
  }

  state.tasks = Array.from(byId.values());
  state.total_layers = totalLayers;
  state.mode = 'auto';
  saveState(state, projectDir);
  return state;
}

/**
 * Compute completion metrics for the currently planned tasks only.
 *
 * @param {Array<object>} tasks - Parsed task list.
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {object} Completion metrics.
 */
function getCurrentTaskMetrics(tasks, projectDir = process.cwd()) {
  const state = loadState(projectDir);
  const stateById = new Map((state.tasks || []).map(task => [task.id, task]));
  const metrics = {
    total: tasks.length,
    completed: 0,
    failed: 0,
    in_progress: 0,
    pending: 0,
    incompleteTasks: [],
    failedTasks: []
  };

  for (const task of tasks) {
    const persisted = stateById.get(task.id);
    const status = persisted && persisted.status ? persisted.status : (task.status === 'completed' ? 'completed' : 'pending');

    if (status === 'completed') {
      metrics.completed++;
      continue;
    }

    if (status === 'failed' || status === 'timeout') {
      metrics.failed++;
      metrics.incompleteTasks.push(task);
      metrics.failedTasks.push(task);
      continue;
    }

    if (status === 'in_progress') {
      metrics.in_progress++;
      metrics.incompleteTasks.push(task);
      continue;
    }

    metrics.pending++;
    metrics.incompleteTasks.push(task);
  }

  metrics.percent = metrics.total > 0
    ? Math.round((metrics.completed / metrics.total) * 100)
    : 0;

  return metrics;
}

/**
 * Persist the current task summary into auto-state.
 *
 * @param {object} autoState - Current auto-state.
 * @param {Array<object>} tasks - Parsed task list.
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {object} Saved auto-state.
 */
function refreshAutoStateSummary(autoState, tasks, projectDir = process.cwd()) {
  const metrics = getCurrentTaskMetrics(tasks, projectDir);
  autoState.tasks.total = metrics.total;
  autoState.tasks.completed = metrics.completed;
  autoState.tasks.in_progress = metrics.in_progress;
  autoState.tasks.failed = metrics.failed;
  return saveAutoState(autoState, projectDir);
}

/**
 * Get the learnings JSONL path for a project.
 *
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {string} Absolute learnings.jsonl path.
 */
function getLearningsPath(projectDir = process.cwd()) {
  return path.join(projectDir, '.claude/orchestrate/learnings.jsonl');
}

/**
 * Append a cross-session learning entry for the current assessment.
 *
 * @param {object|null} autoState - Current auto-state.
 * @param {object} assessment - Assessment result.
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {object} Persisted learning entry.
 */
function saveLearning(autoState, assessment, projectDir = process.cwd()) {
  const learningsPath = getLearningsPath(projectDir);
  const learningsDir = path.dirname(learningsPath);
  const entry = {
    ts: new Date().toISOString(),
    session_id: autoState && autoState.session_id ? autoState.session_id : null,
    goal: autoState && autoState.contract && autoState.contract.goal ? autoState.contract.goal : '',
    iteration: autoState && autoState.budget ? autoState.budget.current_iteration : null,
    tasks_total: autoState && autoState.tasks ? autoState.tasks.total : 0,
    tasks_completed: autoState && autoState.tasks ? autoState.tasks.completed : 0,
    tasks_failed: autoState && autoState.tasks ? autoState.tasks.failed : 0,
    verdict: assessment && assessment.verdict ? assessment.verdict : 'GAPS',
    duration_estimate: null
  };

  fs.mkdirSync(learningsDir, { recursive: true });
  fs.appendFileSync(learningsPath, `${JSON.stringify(entry)}\n`, 'utf8');
  return entry;
}

/**
 * Load persisted learning entries from the project JSONL store.
 *
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {Array<object>} Parsed learning entries.
 */
function loadLearnings(projectDir = process.cwd()) {
  const learningsPath = getLearningsPath(projectDir);
  if (!fs.existsSync(learningsPath)) {
    return [];
  }

  return fs.readFileSync(learningsPath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

/**
 * Summarize persisted cross-session learning data.
 *
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {{ total_sessions: number, avg_completion_rate: number, common_failure_patterns: Array<string> }} Learning summary.
 */
function getLearningsSummary(projectDir = process.cwd()) {
  const learnings = loadLearnings(projectDir);
  const totalSessions = learnings.length;
  const avgCompletionRate = totalSessions > 0
    ? learnings.reduce((sum, learning) => {
      const total = Number(learning && learning.tasks_total);
      const completed = Number(learning && learning.tasks_completed);
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(completed)) {
        return sum;
      }

      return sum + (completed / total);
    }, 0) / totalSessions
    : 0;

  return {
    total_sessions: totalSessions,
    avg_completion_rate: avgCompletionRate,
    common_failure_patterns: learnings
      .filter(learning => learning && learning.verdict === 'FAIL')
      .map(learning => learning.goal)
      .filter(Boolean)
  };
}

/**
 * Compute a stable hash for a task assessment cache entry.
 *
 * MVP behavior uses only task metadata so unchanged tasks can reuse the
 * previous assessment without re-running verification commands.
 *
 * @param {object} task - Parsed task.
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {string} Hex-encoded task hash.
 */
function computeTaskHash(task, projectDir = process.cwd()) {
  void projectDir;
  const payload = JSON.stringify({
    id: String(task && task.id ? task.id : ''),
    status: String(task && task.status ? task.status : ''),
    description: String(task && task.description ? task.description : '')
  });

  return crypto.createHash('sha256').update(payload).digest('hex');
}

// ---------------------------------------------------------------------------
// Dynamic Task Management
// ---------------------------------------------------------------------------

/**
 * Allocate the next AUTO-N task identifier.
 *
 * @param {Array<object>} tasks - Current parsed tasks.
 * @returns {string} New task id.
 */
function getNextDynamicTaskId(tasks) {
  const numbers = tasks
    .map(task => {
      const match = String(task.id || '').match(/^AUTO-(\d+)$/);
      return match ? Number.parseInt(match[1], 10) : 0;
    })
    .filter(Boolean);

  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `AUTO-${next}`;
}

/**
 * Append dynamically generated tasks to TASKS.md.
 *
 * @param {Array<object>} tasksToAdd - Task specs to append.
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {Array<object>} Appended tasks with ids.
 */
function appendDynamicTasks(tasksToAdd, projectDir = process.cwd()) {
  if (!tasksToAdd.length) {
    return [];
  }

  const tasksPath = getTasksPath(projectDir);
  const existingContent = fs.existsSync(tasksPath) ? fs.readFileSync(tasksPath, 'utf8') : '';
  const existingTasks = fs.existsSync(tasksPath) ? parseTasks(tasksPath) : [];
  const appended = [];
  let nextTasks = existingTasks.slice();

  for (const spec of tasksToAdd) {
    const id = getNextDynamicTaskId(nextTasks);
    const task = {
      id,
      description: spec.description,
      deps: Array.isArray(spec.deps) ? spec.deps : [],
      domain: spec.domain || 'general',
      risk: spec.risk || 'medium',
      owner: spec.owner || 'auto-orchestrator',
      model: spec.model || 'sonnet'
    };

    appended.push(task);
    nextTasks.push(task);
  }

  const blocks = appended.map(task => [
    `- [ ] ${task.id}: ${task.description}`,
    `  - deps: [${task.deps.join(', ')}]`,
    `  - domain: ${task.domain}`,
    `  - risk: ${task.risk}`,
    `  - owner: ${task.owner}`,
    `  - model: ${task.model}`
  ].join('\n'));

  const nextContent = existingContent.trimEnd()
    + (existingContent.trim() ? '\n\n' : '')
    + (existingContent.includes('## Auto Adjustments') ? '' : '## Auto Adjustments\n\n')
    + blocks.join('\n\n')
    + '\n';

  fs.writeFileSync(tasksPath, nextContent, 'utf8');
  return appended;
}

/**
 * Mark incomplete tasks as pending so they can be retried on the next loop.
 *
 * @param {Array<object>} tasks - Incomplete tasks.
 * @param {string} [projectDir=process.cwd()] - Project root.
 */
function resetTasksForRetry(tasks, projectDir = process.cwd()) {
  if (!tasks.length) {
    return;
  }

  const state = loadState(projectDir);
  const ids = new Set(tasks.map(task => task.id));

  state.tasks = (state.tasks || []).map(task => {
    if (!ids.has(task.id)) {
      return task;
    }

    return {
      ...task,
      status: 'pending',
      retry_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  saveState(state, projectDir);
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/**
 * Define stage: generate and approve a contract.
 *
 * @param {string} goal - User goal.
 * @param {object} autoState - Current auto-state.
 * @param {readline.Interface} rl - Interactive gate interface.
 * @param {object} [options={}] - Runtime options.
 * @returns {Promise<object>} Approved contract.
 */
async function runDefineStage(goal, autoState, rl, options = {}) {
  const {
    projectDir = process.cwd(),
    claudePath = 'claude'
  } = options;

  let attempt = 0;
  let feedback = '';

  while (attempt < DEFAULT_MAX_DEFINE_RETRIES) {
    attempt++;

    let contract;
    try {
      const prompt = buildContractPrompt(goal, feedback);
      const output = runClaudePrompt(prompt, { projectDir, claudePath });
      contract = normalizeContract(extractJson(output), goal);
      validateContract(contract);
    } catch (error) {
      appendEvent('define', {
        goal,
        status: 'error',
        attempt,
        error: error.message
      }, projectDir);
      feedback = `Previous contract generation failed: ${error.message}`;
      continue;
    }

    appendEvent('define', {
      goal,
      status: 'generated',
      attempt,
      contract
    }, projectDir);

    const decision = await resolveGateDecision(
      rl,
      'Contract Gate',
      `${JSON.stringify(contract, null, 2)}\n`,
      'Contract modification instructions: ',
      autoState,
      {
        ...options,
        stage: 'define_contract',
      }
    );

    if (decision.action === 'approve') {
      autoState.contract = contract;
      return saveAutoState(autoState, projectDir).contract;
    }

    if (decision.action === 'modify') {
      feedback = decision.feedback || 'User requested contract revisions.';
      appendEvent('human_edit', {
        stage: 'define',
        action: 'modify',
        feedback
      }, projectDir);
      continue;
    }

    feedback = 'User rejected the previous contract. Generate a different contract.';
    appendEvent('human_edit', {
      stage: 'define',
      action: 'reject'
    }, projectDir);
  }

  const escalation = await promptGate(
    rl,
    'Failure Gate',
    'Define exceeded retry budget. approve=enter manual JSON, reject=abort, modify=revise requirements before manual entry',
    'Failure gate guidance: '
  );

  if (escalation.action === 'reject') {
    throw new Error('Define aborted after retry budget was exhausted');
  }

  const manualJson = await askQuestion(rl, 'Paste compact contract JSON: ');
  const manualContract = normalizeContract(extractJson(manualJson), goal);
  validateContract(manualContract);
  appendEvent('define', {
    goal,
    status: 'manual',
    contract: manualContract
  }, projectDir);
  autoState.contract = manualContract;
  return saveAutoState(autoState, projectDir).contract;
}

/**
 * Decompose stage: generate and approve TASKS.md.
 *
 * @param {object} contract - Approved contract.
 * @param {object} autoState - Current auto-state.
 * @param {readline.Interface} rl - Interactive gate interface.
 * @param {object} [options={}] - Runtime options.
 * @returns {Promise<Array<object>>} Approved parsed tasks.
 */
async function runDecomposeStage(contract, autoState, rl, options = {}) {
  const {
    projectDir = process.cwd(),
    claudePath = 'claude'
  } = options;

  const tasksPath = getTasksPath(projectDir);
  let feedback = '';

  while (true) {
    let tasks;
    try {
      const output = runClaudePrompt(buildDecomposePrompt(contract, feedback), { projectDir, claudePath });
      const content = stripMarkdownFence(output);
      fs.writeFileSync(tasksPath, `${content.trim()}\n`, 'utf8');
      tasks = parseTasks(tasksPath);
      if (!tasks.length) {
        throw new Error('TASKS.md did not contain any parseable tasks');
      }
      appendEvent('decompose', {
        status: 'generated',
        task_count: tasks.length
      }, projectDir);

      const decision = await resolveGateDecision(
        rl,
        'Decompose Gate',
        `${content}\n`,
        'TASKS modification instructions: ',
        autoState,
        {
          ...options,
          stage: 'decompose',
        }
      );

      if (decision.action === 'approve') {
        autoState.tasks.total = tasks.length;
        autoState.tasks.completed = 0;
        autoState.tasks.in_progress = 0;
        autoState.tasks.failed = 0;
        saveAutoState(autoState, projectDir);
        return tasks;
      }

      if (decision.action === 'modify') {
        feedback = decision.feedback || 'User requested TASKS.md revisions.';
        appendEvent('human_edit', {
          stage: 'decompose',
          action: 'modify',
          feedback
        }, projectDir);
        continue;
      }

      feedback = 'User rejected the previous decomposition. Produce a different task plan.';
      appendEvent('human_edit', {
        stage: 'decompose',
        action: 'reject'
      }, projectDir);
    } catch (error) {
      appendEvent('decompose', {
        status: 'error',
        error: error.message
      }, projectDir);
      feedback = `Previous TASKS.md was invalid: ${error.message}`;
      continue;
    }
  }
}

/**
 * Plan stage: parse, build DAG, and create execution layers.
 *
 * @param {object} autoState - Current auto-state.
 * @param {object} [options={}] - Runtime options.
 * @returns {{ tasks: Array<object>, dag: object, layers: Array<Array<object>> }} Execution plan.
 */
function runPlanStage(autoState, options = {}) {
  const { projectDir = process.cwd() } = options;
  const tasksPath = getTasksPath(projectDir);
  const tasks = parseTasks(tasksPath);
  if (!tasks.length) {
    throw new Error('TASKS.md did not contain any parseable tasks');
  }
  const dag = buildDAG(tasks);
  const layers = createLayers(dag.sorted);

  syncBridgeState(tasks, layers.length, projectDir);
  refreshAutoStateSummary(autoState, tasks, projectDir);

  appendEvent('plan', {
    task_count: tasks.length,
    layer_count: layers.length,
    layers: layers.map((layer, index) => ({
      index,
      task_ids: layer.map(task => task.id)
    }))
  }, projectDir);

  return { tasks, dag, layers };
}

/**
 * Execute stage: run executable tasks layer by layer.
 *
 * @param {Array<Array<object>>} layers - Planned execution layers.
 * @param {string} goal - User goal.
 * @param {object} contract - Approved contract.
 * @param {object} autoState - Current auto-state.
 * @param {object} [options={}] - Runtime options.
 * @returns {Promise<Array<object>>} Flattened layer results.
 */
async function runExecuteStage(layers, goal, contract, autoState, options = {}) {
  const {
    projectDir = process.cwd(),
    workerCount = DEFAULT_WORKER_COUNT
  } = options;

  const allResults = [];
  const checkpointTag = createGitCheckpoint(
    Number(autoState && autoState.budget && autoState.budget.current_iteration) + 1,
    projectDir
  );

  if (checkpointTag) {
    appendEvent('execute', {
      status: 'created',
      tag: checkpointTag
    }, projectDir);
  }

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex];
    const state = loadState(projectDir);
    const stateById = new Map((state.tasks || []).map(task => [task.id, task]));

    const runnable = layer.filter(task => {
      const persisted = stateById.get(task.id);
      if (persisted && persisted.status === 'completed') {
        return false;
      }

      return (task.deps || []).every(dep => {
        const depState = stateById.get(dep);
        return depState && depState.status === 'completed';
      });
    });

    state.current_layer = layerIndex + 1;
    state.total_layers = layers.length;
    state.mode = 'auto';
    saveState(state, projectDir);

    if (!runnable.length) {
      autoState = refreshAutoStateSummary(autoState, parseTasks(getTasksPath(projectDir)), projectDir);
      continue;
    }

    const layerTasks = runnable.map(task => ({
      ...task,
      context: {
        global: {
          goal,
          contract
        },
        local: {
          task_id: task.id,
          description: task.description
        }
      }
    }));

    const results = await executeLayer(layerTasks, workerCount);
    allResults.push(...results);

    for (const result of results) {
      appendEvent('execute', {
        task_id: result.id,
        layer: layerIndex,
        status: result.status,
        error: result.error || null
      }, projectDir);
    }

    autoState = refreshAutoStateSummary(autoState, parseTasks(getTasksPath(projectDir)), projectDir);
  }

  return allResults;
}

/**
 * Run a single shell check command asynchronously.
 *
 * @param {string} cmd - Shell command.
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {Promise<{ cmd: string, success: boolean, output: string }>} Result.
 */
function runCheckParallel(cmd, projectDir = process.cwd()) {
  return new Promise((resolve, reject) => {
    exec(cmd, {
      cwd: projectDir,
      encoding: 'utf8',
      shell: process.platform === 'win32' ? true : '/bin/sh',
      maxBuffer: 1024 * 1024 * 4
    }, (error, stdout, stderr) => {
      if (error) {
        const failure = new Error(
          String(stderr || stdout || error.message || '').trim()
        );
        failure.cmd = cmd;
        failure.output = String(stderr || stdout || error.message || '').trim();
        failure.code = error.code;
        reject(failure);
        return;
      }

      resolve({
        cmd,
        success: true,
        output: String(stdout || '').trim()
      });
    });
  });
}

/**
 * Normalize a settled check result into the assess-stage result shape.
 *
 * @param {PromiseSettledResult<{ cmd: string, success: boolean, output: string }>} settled - Settled check result.
 * @param {string} command - Original shell command.
 * @returns {{ command: string, ok: boolean, output?: string, error?: string }} Result.
 */
function formatSettledCheckResult(settled, command) {
  if (settled.status === 'fulfilled') {
    return {
      command,
      ok: Boolean(settled.value && settled.value.success),
      output: String(settled.value && settled.value.output ? settled.value.output : '').trim()
    };
  }

  const reason = settled.reason || {};
  return {
    command,
    ok: false,
    error: String(reason.output || reason.message || '').trim()
  };
}

/**
 * Run a git command and return trimmed stdout.
 *
 * @param {string} command - Git command to execute.
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {string} Trimmed stdout.
 */
function runGitCommand(command, projectDir = process.cwd()) {
  return String(execSync(command, {
    cwd: projectDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32' ? true : '/bin/sh',
    maxBuffer: 1024 * 1024 * 4
  }) || '').trim();
}

/**
 * Create a lightweight git checkpoint tag for the current working tree state.
 *
 * @param {number|string} iterationNum - Current execute iteration number.
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {string|null} Checkpoint tag name or null when git is unavailable.
 */
function createGitCheckpoint(iterationNum, projectDir = process.cwd()) {
  const tagName = `auto-checkpoint-${iterationNum}`;

  try {
    runGitCommand('git rev-parse --is-inside-work-tree', projectDir);
    runGitCommand('git add -A', projectDir);

    let checkpointRef = runGitCommand(`git stash create ${shellQuote(tagName)}`, projectDir);
    if (!checkpointRef) {
      checkpointRef = runGitCommand('git rev-parse HEAD', projectDir);
    }

    if (!checkpointRef) {
      return null;
    }

    runGitCommand(
      `git tag -f ${shellQuote(tagName)} ${shellQuote(checkpointRef)}`,
      projectDir
    );

    return tagName;
  } catch {
    return null;
  }
}

/**
 * Restore tracked files from a previously created checkpoint tag.
 *
 * @param {string} tagName - Checkpoint tag name.
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {boolean} True when rollback succeeded.
 */
function rollbackToCheckpoint(tagName, projectDir = process.cwd()) {
  if (!tagName) {
    return false;
  }

  try {
    runGitCommand(`git checkout ${shellQuote(tagName)} -- .`, projectDir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete all auto-generated checkpoint tags.
 *
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {Array<string>} Removed checkpoint tag names.
 */
function cleanupCheckpoints(projectDir = process.cwd()) {
  try {
    runGitCommand('git rev-parse --is-inside-work-tree', projectDir);
    const output = runGitCommand(`git tag --list ${shellQuote('auto-checkpoint-*')}`, projectDir);
    const tags = output.split(/\r?\n/).map(tag => tag.trim()).filter(Boolean);

    for (const tag of tags) {
      runGitCommand(`git tag -d ${shellQuote(tag)}`, projectDir);
    }

    return tags;
  } catch {
    return [];
  }
}

/**
 * Find the most recent auto-generated checkpoint tag.
 *
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {string|null} Latest checkpoint tag or null when unavailable.
 */
function getLatestCheckpointTag(projectDir = process.cwd()) {
  try {
    const output = runGitCommand(
      `git tag --list ${shellQuote('auto-checkpoint-*')} --sort=-version:refname`,
      projectDir
    );
    return output.split(/\r?\n/).map(tag => tag.trim()).find(Boolean) || null;
  } catch {
    return null;
  }
}

/**
 * Assess stage: verify commands and task completion status.
 *
 * @param {Array<object>} tasks - Current parsed tasks.
 * @param {object} contract - Approved contract.
 * @param {object} [options={}] - Runtime options.
 * @param {object} [options.autoState] - Current auto-state for cache reuse.
 * @returns {Promise<object>} Assessment result.
 */
async function runAssessStage(tasks, contract, options = {}) {
  const {
    projectDir = process.cwd(),
    autoState = null
  } = options;
  const metrics = getCurrentTaskMetrics(tasks, projectDir);
  const timestamp = new Date().toISOString();
  const contractHash = String(contract && contract.hash ? contract.hash : '');
  const taskHashes = Object.fromEntries(
    tasks.map(task => [task.id, computeTaskHash(task, projectDir)])
  );

  if (autoState) {
    if (!autoState.assessment_cache || typeof autoState.assessment_cache !== 'object') {
      autoState.assessment_cache = {};
    }

    if (autoState.assessment_cache_contract_hash !== contractHash) {
      autoState.assessment_cache = {};
      autoState.assessment_cache_contract_hash = contractHash;
      autoState.last_assessment = null;
    }
  }

  const cache = autoState && autoState.assessment_cache ? autoState.assessment_cache : {};
  const canUseCachedAssessment = tasks.length > 0
    && tasks.every(task => cache[task.id] && cache[task.id].hash === taskHashes[task.id])
    && autoState
    && autoState.last_assessment;

  if (canUseCachedAssessment) {
    const assessment = {
      ...autoState.last_assessment,
      cached: true,
      cache_timestamp: timestamp,
      metrics,
      completion_rate: metrics.percent
    };

    appendEvent('assess', assessment, projectDir);
    saveLearning(autoState, assessment, projectDir);
    return assessment;
  }

  const checkCommands = [contract.verify_cmd, ...(contract.extra_checks || [])];
  const settledChecks = await Promise.allSettled(
    checkCommands.map(command => runCheckParallel(command, projectDir))
  );
  const verify = formatSettledCheckResult(settledChecks[0], contract.verify_cmd);
  const extraChecks = (contract.extra_checks || []).map((command, index) =>
    formatSettledCheckResult(settledChecks[index + 1], command)
  );
  const allChecksGreen = verify.ok && extraChecks.every(check => check.ok);

  let verdict = 'PASS';
  if (!allChecksGreen) {
    verdict = 'FAIL';
  } else if (metrics.completed !== metrics.total) {
    verdict = 'GAPS';
  }

  const assessment = {
    verdict,
    verify,
    extra_checks: extraChecks,
    completion_rate: metrics.percent,
    metrics,
    cached: false
  };

  if (autoState) {
    autoState.assessment_cache = Object.fromEntries(
      tasks.map(task => [
        task.id,
        {
          hash: taskHashes[task.id],
          verdict,
          timestamp
        }
      ])
    );
    autoState.assessment_cache_contract_hash = contractHash;
    autoState.last_assessment = assessment;
  }

  appendEvent('assess', assessment, projectDir);
  saveLearning(autoState, assessment, projectDir);
  return assessment;
}

/**
 * Count trailing non-pass assessment verdicts from the event log.
 *
 * @param {string} [projectDir=process.cwd()] - Project root.
 * @returns {number} Trailing non-pass count.
 */
function getTrailingFailureCount(projectDir = process.cwd()) {
  const events = readEvents(projectDir)
    .filter(event => event.type === 'assess')
    .map(event => event.data && event.data.verdict)
    .filter(Boolean)
    .reverse();

  let count = 0;
  for (const verdict of events) {
    if (verdict === 'PASS') {
      break;
    }
    count++;
  }

  return count;
}

/**
 * Build dynamic tasks from the assessment gaps.
 *
 * @param {object} assessment - Assessment result.
 * @returns {Array<object>} Task specs to append.
 */
function buildDynamicTasks(assessment) {
  const tasks = [];

  for (const failedTask of assessment.metrics.failedTasks) {
    tasks.push({
      description: `Resolve blocker and complete ${failedTask.id}: ${failedTask.description}`,
      deps: [],
      domain: failedTask.domain || 'general',
      risk: 'medium'
    });
  }

  if (assessment.verdict === 'FAIL') {
    tasks.push({
      description: `Fix failing verification command and make it pass: ${assessment.verify.command}`,
      deps: [],
      domain: 'general',
      risk: 'high'
    });

    for (const check of assessment.extra_checks.filter(result => !result.ok)) {
      tasks.push({
        description: `Fix failing extra check and make it pass: ${check.command}`,
        deps: [],
        domain: 'general',
        risk: 'medium'
      });
    }
  }

  if (assessment.verdict === 'GAPS' && tasks.length === 0) {
    for (const task of assessment.metrics.incompleteTasks.slice(0, 3)) {
      tasks.push({
        description: `Close remaining gap for ${task.id}: ${task.description}`,
        deps: [],
        domain: task.domain || 'general',
        risk: 'medium'
      });
    }
  }

  return tasks;
}

/**
 * Handle a failure gate when budget has been exceeded.
 *
 * @param {readline.Interface} rl - Interactive gate interface.
 * @param {object} autoState - Current auto-state.
 * @param {string} reason - Failure reason.
 * @param {object} [options={}] - Runtime options.
 * @returns {Promise<{ action: string, feedback?: string }>} Gate result.
 */
async function runFailureGate(rl, autoState, reason, options = {}) {
  const { projectDir = process.cwd() } = options;
  const checkpointTag = getLatestCheckpointTag(projectDir);
  appendEvent('budget_check', {
    status: 'exceeded',
    reason,
    budget: autoState.budget,
    checkpoint_tag: checkpointTag
  }, projectDir);

  return resolveGateDecision(
    rl,
    'Failure Gate',
    `Budget or failure threshold exceeded.\nReason: ${reason}\nBudget: ${JSON.stringify(autoState.budget, null, 2)}\nLatest checkpoint: ${checkpointTag || 'none'}\napprove=grant one more loop, reject=abort${checkpointTag ? ' (rollback will be offered)' : ''}, modify=grant one more loop with guidance\n`,
    'Failure gate guidance: ',
    autoState,
    {
      ...options,
      stage: 'adjust_failure',
    }
  );
}

/**
 * Adjust stage: enforce budget, add dynamic tasks, and prepare another loop.
 *
 * @param {object} assessment - Assessment result.
 * @param {object} autoState - Current auto-state.
 * @param {readline.Interface} rl - Interactive gate interface.
 * @param {object} [options={}] - Runtime options.
 * @param {string} [feedback=''] - Optional human feedback.
 * @returns {Promise<{ outcome: string, autoState: object, addedTasks: Array<object> }>} Adjust result.
 */
async function runAdjustStage(assessment, autoState, rl, options = {}, feedback = '') {
  const {
    projectDir = process.cwd(),
    maxConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES
  } = options;

  const failureCount = getTrailingFailureCount(projectDir);
  const overIterations = autoState.budget.current_iteration >= autoState.budget.max_iterations;
  const overDynamicTasks = autoState.budget.dynamic_tasks_added >= autoState.budget.max_dynamic_tasks;
  const tooManyFailures = failureCount >= maxConsecutiveFailures;

  if (overIterations || overDynamicTasks || tooManyFailures) {
    const reasons = [];
    if (overIterations) reasons.push('max_iterations exceeded');
    if (overDynamicTasks) reasons.push('max_dynamic_tasks exceeded');
    if (tooManyFailures) reasons.push(`consecutive failures reached ${failureCount}`);

    const decision = await runFailureGate(rl, autoState, reasons.join(', '), options);
    if (decision.action === 'reject') {
      const checkpointTag = getLatestCheckpointTag(projectDir);
      let rolledBack = false;

      if (checkpointTag && rl) {
        const rollbackAnswer = (await askQuestion(
          rl,
          `Rollback tracked files to ${checkpointTag}? [y/N]: `
        )).toLowerCase();

        if (rollbackAnswer === 'y' || rollbackAnswer === 'yes') {
          rolledBack = rollbackToCheckpoint(checkpointTag, projectDir);
          appendEvent('adjust', {
            status: rolledBack ? 'rolled_back' : 'rollback_failed',
            tag: checkpointTag
          }, projectDir);
        }
      }

      appendEvent('adjust', {
        status: 'aborted',
        reason: reasons.join(', '),
        rollback_tag: checkpointTag || null,
        rolled_back: rolledBack
      }, projectDir);
      return { outcome: 'abort', autoState, addedTasks: [], rollbackTag: checkpointTag, rolledBack };
    }

    autoState.budget.max_iterations += 1;
    if (overDynamicTasks) {
      autoState.budget.max_dynamic_tasks += 1;
    }
    saveAutoState(autoState, projectDir);
    feedback = [feedback, decision.feedback].filter(Boolean).join(' | ');
  }

  autoState.budget.current_iteration += 1;

  const incompleteTasks = assessment.metrics.incompleteTasks || [];
  resetTasksForRetry(incompleteTasks, projectDir);

  let dynamicTasks = buildDynamicTasks(assessment);
  if (feedback) {
    dynamicTasks.unshift({
      description: `Apply human adjustment feedback from iteration ${autoState.budget.current_iteration}: ${feedback}`,
      deps: [],
      domain: 'general',
      risk: 'medium'
    });
  }

  const remainingDynamicBudget = Math.max(
    0,
    autoState.budget.max_dynamic_tasks - autoState.budget.dynamic_tasks_added
  );
  dynamicTasks = dynamicTasks.slice(0, remainingDynamicBudget);

  const addedTasks = appendDynamicTasks(dynamicTasks, projectDir);
  autoState.budget.dynamic_tasks_added += addedTasks.length;
  autoState.tasks.dynamically_added += addedTasks.length;
  autoState = refreshAutoStateSummary(autoState, parseTasks(getTasksPath(projectDir)), projectDir);

  appendEvent('adjust', {
    verdict: assessment.verdict,
    iteration: autoState.budget.current_iteration,
    feedback: feedback || null,
    added_task_ids: addedTasks.map(task => task.id)
  }, projectDir);

  return { outcome: 'continue', autoState, addedTasks };
}

// ---------------------------------------------------------------------------
// Main Loop
// ---------------------------------------------------------------------------

/**
 * Run the DCPEA loop.
 *
 * @param {string} goal - Goal string from CLI args.
 * @param {object} [options={}] - Runtime options.
 * @returns {Promise<object>} Final orchestration result.
 */
async function main(goal, options = {}) {
  const normalizedOptions = {
    resume: Boolean(options.resume),
    maxIterations: Number.isInteger(options.maxIterations) ? options.maxIterations : undefined,
    maxDynamicTasks: Number.isInteger(options.maxDynamicTasks) ? options.maxDynamicTasks : undefined,
    workerCount: Number.isInteger(options.workerCount) ? options.workerCount : DEFAULT_WORKER_COUNT,
    maxConsecutiveFailures: Number.isInteger(options.maxConsecutiveFailures)
      ? options.maxConsecutiveFailures
      : DEFAULT_MAX_CONSECUTIVE_FAILURES,
    claudePath: options.claudePath || 'claude',
    projectDir: options.projectDir || process.cwd()
  };

  const rl = createPromptInterface();
  const originalCwd = process.cwd();

  try {
    if (normalizedOptions.projectDir !== originalCwd) {
      process.chdir(normalizedOptions.projectDir);
    }

    let autoState;
    let effectiveGoal = goal || '';

    if (normalizedOptions.resume) {
      autoState = loadAutoState(normalizedOptions.projectDir);
      if (!autoState) {
        throw new Error('Resume requested but auto-state.json was not found');
      }
      effectiveGoal = autoState.contract.goal || effectiveGoal;

      // If TASKS.md is missing or empty, re-run Decompose before entering the loop
      const tasksPath = getTasksPath(normalizedOptions.projectDir);
      let resumeTasks = [];
      try { resumeTasks = fs.existsSync(tasksPath) ? parseTasks(tasksPath) : []; } catch {}
      if (!resumeTasks.length && autoState.contract) {
        await runDecomposeStage(autoState.contract, autoState, rl, normalizedOptions);
        autoState = loadAutoState(normalizedOptions.projectDir);
      }
    } else {
      if (!effectiveGoal) {
        throw new Error('Goal is required unless --resume is provided');
      }

      autoState = initAutoState(effectiveGoal, normalizedOptions.projectDir);
      autoState.budget.max_iterations = normalizedOptions.maxIterations || DEFAULT_MAX_ITERATIONS;
      autoState.budget.max_dynamic_tasks = normalizedOptions.maxDynamicTasks || DEFAULT_MAX_DYNAMIC_TASKS;
      autoState = saveAutoState(autoState, normalizedOptions.projectDir);

      const contract = await runDefineStage(effectiveGoal, autoState, rl, normalizedOptions);
      autoState.contract = contract;
      autoState = saveAutoState(autoState, normalizedOptions.projectDir);

      await runDecomposeStage(contract, autoState, rl, normalizedOptions);
      autoState = loadAutoState(normalizedOptions.projectDir);
    }

    while (true) {
      const plan = runPlanStage(autoState, normalizedOptions);
      autoState = loadAutoState(normalizedOptions.projectDir) || autoState;

      await runExecuteStage(plan.layers, effectiveGoal, autoState.contract, autoState, normalizedOptions);
      autoState = loadAutoState(normalizedOptions.projectDir) || autoState;

      const assessment = await runAssessStage(plan.tasks, autoState.contract, {
        ...normalizedOptions,
        autoState
      });
      autoState = refreshAutoStateSummary(autoState, plan.tasks, normalizedOptions.projectDir);

      if (assessment.verdict === 'PASS') {
        const decision = await resolveGateDecision(
          rl,
          'Final Gate',
          `All checks passed.\nCompletion rate: ${assessment.completion_rate}%\nverify_cmd: ${assessment.verify.command}\n`,
          'Final gate feedback: ',
          autoState,
          {
            ...normalizedOptions,
            stage: 'final_gate',
          }
        );

        if (decision.action === 'approve') {
          await maybeRunMultiAiReview(
            rl,
            plan.tasks,
            autoState.contract,
            assessment,
            normalizedOptions
          );

          const removedCheckpoints = cleanupCheckpoints(normalizedOptions.projectDir);
          if (removedCheckpoints.length) {
            appendEvent('adjust', {
              status: 'cleaned',
              tags: removedCheckpoints
            }, normalizedOptions.projectDir);
          }

          maybeSyncLinearProgress(autoState, normalizedOptions);

          return {
            status: 'PASS',
            goal: effectiveGoal,
            contract: autoState.contract,
            assessment
          };
        }

        const finalAssessment = {
          ...assessment,
          verdict: 'GAPS'
        };
        autoState.last_assessment = finalAssessment;
        autoState = saveAutoState(autoState, normalizedOptions.projectDir);

        const adjustResult = await runAdjustStage(
          finalAssessment,
          autoState,
          rl,
          normalizedOptions,
          decision.feedback || 'Final gate requested additional changes.'
        );

        if (adjustResult.outcome === 'abort') {
          maybeSyncLinearProgress(autoState, normalizedOptions);
          return {
            status: 'ABORTED',
            goal: effectiveGoal,
            contract: autoState.contract,
            assessment: finalAssessment
          };
        }

        autoState = adjustResult.autoState;
        maybeSyncLinearProgress(autoState, normalizedOptions);
        continue;
      }

      const adjustResult = await runAdjustStage(assessment, autoState, rl, normalizedOptions);
      if (adjustResult.outcome === 'abort') {
        maybeSyncLinearProgress(autoState, normalizedOptions);
        return {
          status: 'ABORTED',
          goal: effectiveGoal,
          contract: autoState.contract,
          assessment
        };
      }

      autoState = adjustResult.autoState;
      maybeSyncLinearProgress(autoState, normalizedOptions);
    }
  } finally {
    if (process.cwd() !== originalCwd) {
      process.chdir(originalCwd);
    }
    if (rl) {
      rl.close();
    }
  }
}

// ---------------------------------------------------------------------------
// CLI Entrypoint
// ---------------------------------------------------------------------------

if (require.main === module) {
  const { goal, options } = parseCliArgs(process.argv.slice(2));

  main(goal, options)
    .then(result => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.status === 'ABORTED') {
        process.exit(2);
      }
    })
    .catch(error => {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    });
}

module.exports = {
  main,
  parseCliArgs,
  resolveGateDecision,
  waitForFileGateDecision,
  shouldTriggerMultiAiReview,
  runDefineStage,
  runDecomposeStage,
  runPlanStage,
  runExecuteStage,
  runAssessStage,
  runAdjustStage,
  saveLearning,
  loadLearnings,
  getLearningsSummary,
  createGitCheckpoint,
  rollbackToCheckpoint,
  cleanupCheckpoints
};
