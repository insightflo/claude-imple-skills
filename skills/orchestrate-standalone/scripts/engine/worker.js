#!/usr/bin/env node
/**
 * Task Worker for Orchestrate Standalone
 *
 * Executes individual tasks and reports results
 *
 * @TASK orchestrate-standalone
 * @SPEC SKILL.md
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  createRunId,
  emitRunEventDetailed,
  withExecutorMetadata,
} = require('../../../../project-team/scripts/lib/whitebox-run');

const STATE_FILE = '.claude/orchestrate-state.json';

async function emitCanonicalEvent(type, data, projectDir = process.cwd(), correlationId = null, stage = type) {
  const result = await emitRunEventDetailed({
    type,
    producer: 'orchestrate-worker',
    correlationId,
    projectDir,
    data,
    stage,
    mode: 'best_effort',
  });
  if (!result.ok) {
    writeStderr(`[worker] canonical event write failed (${type}): ${result.failure.message}`);
  }
  return result;
}

function writeStderr(message) {
  process.stderr.write(`${message}\n`);
}

function persistTaskState(statePath, taskId, status, data = {}) {
  let state = { tasks: [], started_at: new Date().toISOString() };

  if (fs.existsSync(statePath)) {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  }

  const taskIndex = state.tasks.findIndex((task) => task.id === taskId);
  const previous = taskIndex >= 0 ? state.tasks[taskIndex] : null;
  const taskState = {
    id: taskId,
    status,
    updated_at: new Date().toISOString(),
    ...data,
  };

  if (taskIndex >= 0) {
    state.tasks[taskIndex] = { ...state.tasks[taskIndex], ...taskState };
  } else {
    state.tasks.push(taskState);
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  return { previousStatus: previous && previous.status ? previous.status : null };
}

async function updateTaskState(statePath, taskId, status, data = {}, options = {}) {
  const { emitEvent = true, emitMode = 'best_effort' } = options;

  try {
    const { previousStatus } = persistTaskState(statePath, taskId, status, data);
    if (!emitEvent) return { ok: true, previousStatus };

    const projectDir = path.dirname(path.dirname(statePath));
    const eventResult = await emitCanonicalEvent('orchestrate.task.status_changed', {
      task_id: taskId,
      from: previousStatus,
      to: status,
      changed: previousStatus !== status,
      has_duration: Number.isFinite(data.duration),
      has_exit_code: Number.isInteger(data.code),
      worker: typeof data.worker === 'string' ? data.worker : null,
    }, projectDir, taskId, 'task_status_changed');

    if (!eventResult.ok) {
      if (emitMode === 'strict') {
      const error = new Error(`Failed to write orchestrate.task.status_changed for ${taskId}: ${eventResult.failure.message}`);
      error.code = 'WHITEBOX_EVENT_WRITE_FAILED';
      error.failure = eventResult.failure;
      throw error;
      }

      writeStderr(`Failed to write orchestrate.task.status_changed for ${taskId}: ${eventResult.failure.message}`);
    }

    return { ok: true, previousStatus, eventWarning: eventResult.ok ? null : eventResult.failure };
  } catch (error) {
    writeStderr(`Failed to update state: ${error.message}`);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Routing Management
// ---------------------------------------------------------------------------

/**
 * Parses .claude/model-routing.yaml without external dependencies
 */
function loadModelRouting(projectDir) {
  const routingPath = path.join(projectDir, '.claude', 'model-routing.yaml');
  const routing = { default: 'claude', routing: {} };

  if (fs.existsSync(routingPath)) {
    try {
      const content = fs.readFileSync(routingPath, 'utf8');

      const defaultMatch = content.match(/^default:\s*([^\s]+)/m);
      if (defaultMatch) routing.default = defaultMatch[1];

      const parts = content.split(/^routing:/m);
      const routingSection = parts.length > 1 ? parts[1] : null;

      if (routingSection) {
        const regex = /^\s+([a-zA-Z0-9_-]+):\s*([^\s]+)/gm;
        let match;
        while ((match = regex.exec(routingSection)) !== null) {
          routing.routing[match[1]] = match[2].replace(/['"]/g, '');
        }
      }
    } catch (e) {
      writeStderr(`Failed to parse model-routing.yaml: ${e.message}`);
    }
  }

  return routing;
}

/**
 * Determines the appropriate CLI command based on task routing
 * Priority: task.model > model-routing.yaml[task.owner] > default (claude)
 */
function resolveCliCommand(task, projectDir, defaultClaudePath = 'claude') {
  let model = task.model;
  let routeSource = 'task.model';
  let fallbackReason = null;

  // 1. task.model이 없으면 model-routing.yaml에서 task.owner 기반으로 탐색
  if (!model) {
    const routingConfig = loadModelRouting(projectDir);
    if (task.owner && routingConfig.routing[task.owner]) {
      model = routingConfig.routing[task.owner];
      routeSource = 'routing.owner';
    } else {
      model = routingConfig.default || 'claude';
      routeSource = 'routing.default';
    }
  }

  const rawModel = String(model || 'claude').trim().toLowerCase();
  const claudeAliases = new Set(['claude', 'sonnet', 'opus', 'haiku']);
  const isClaudeFamily = claudeAliases.has(rawModel) || rawModel.startsWith('claude-');

  let resolvedModel = 'claude';
  if (rawModel === 'codex' || rawModel === 'gemini') {
    resolvedModel = rawModel;
  } else if (isClaudeFamily) {
    resolvedModel = 'claude';
  } else {
    writeStderr(`[Warning] Unknown model '${rawModel}'. Falling back to 'claude'.`);
    resolvedModel = 'claude';
    fallbackReason = 'unknown_model';
  }

  let command = defaultClaudePath;
  let args = [];
  const requestedExecutor = rawModel;

  // 2. 모델명에 따른 CLI 커맨드 및 인자 매핑
  if (resolvedModel === 'codex') {
    command = 'codex';
    args = ['exec'];
  } else if (resolvedModel === 'gemini') {
    command = 'gemini';
    args = [];
  }

  // 3. Fallback: CLI가 시스템에 없으면 defaultClaudePath 사용
  if (command !== defaultClaudePath) {
    try {
      const checkCmd = process.platform === 'win32' ? 'where' : 'which';
      execSync(`${checkCmd} ${command}`, { stdio: 'ignore' });
    } catch (e) {
      writeStderr(`[Warning] CLI '${command}' not found. Falling back to '${defaultClaudePath}'.`);
      fallbackReason = `missing_cli:${command}`;
      command = defaultClaudePath;
      args = [];
      resolvedModel = 'claude';
    }
  }

  return { command, args, model: resolvedModel, requestedExecutor, routeSource, fallbackReason };
}

// ---------------------------------------------------------------------------
// Task Execution
// ---------------------------------------------------------------------------

/**
 * Execute a single task
 */
async function executeTask(task, options = {}) {
  const {
    claudePath = 'claude',
    projectDir = process.cwd(),
    timeout = 300000 // 5 minutes default
  } = options;

  const statePath = path.join(projectDir, STATE_FILE);

  return new Promise((resolve, reject) => {
    void (async () => {
    const startTime = Date.now();
    let timeoutHandle = null;
    let finalized = false;

    // Prepare prompt
    const prompt = `
Execute the following task:

**Task ID**: ${task.id}
**Description**: ${task.description}
**Domain**: ${task.domain || 'general'}
**Risk Level**: ${task.risk}
**Owner**: ${task.owner || 'default'}

Please complete this task and report back when done.
`;

    // Resolve which CLI to use based on routing rules
    const runId = task.run_id || createRunId('multi-ai-run', task.id);
    const { command, args, model, requestedExecutor, routeSource, fallbackReason } = resolveCliCommand(task, projectDir, claudePath);
    process.stderr.write(`[worker] Task ${task.id} → ${command} (model: ${model})\n`);

    await emitCanonicalEvent('multi_ai_run.route.selected', {
      run_id: runId,
      task_id: task.id,
      owner: task.owner || 'default',
      route_source: routeSource,
      requested_executor: requestedExecutor,
      command,
      ...withExecutorMetadata(model),
    }, projectDir, task.id, 'route_selected');

    if (fallbackReason) {
      await emitCanonicalEvent('multi_ai_run.route.fallback', {
        run_id: runId,
        task_id: task.id,
        owner: task.owner || 'default',
        route_source: routeSource,
        requested_executor: requestedExecutor,
        fallback_reason: fallbackReason,
        fallback_executor: model,
        command,
        ...withExecutorMetadata(model),
      }, projectDir, task.id, 'route_fallback');

    }

    await emitCanonicalEvent('orchestrate.execution.start', {
      run_id: runId,
      task_id: task.id,
      domain: task.domain || 'general',
      risk: task.risk || 'low',
      owner: task.owner || 'default',
      model,
      command,
      ...withExecutorMetadata(model),
    }, projectDir, task.id, 'execution_start');

    // Update state to "in_progress"
    try {
      await updateTaskState(statePath, task.id, 'in_progress', { worker: 'worker-' + process.pid % 4 });
    } catch (error) {
      reject(error);
      return;
    }

    // Spawn the selected CLI
    const cli = spawn(command, args, {
      cwd: projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLAUDE_AGENT_ROLE: task.owner || 'default',
        CLAUDE_TASK_ID: task.id,
        WHITEBOX_RUN_ID: runId,
      }
    });

    let output = '';
    let errorOutput = '';

    async function finalizeExecution(result) {
      if (finalized) return;
      finalized = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }

      const duration = Number.isFinite(result.durationMs) ? result.durationMs : (Date.now() - startTime);
      const stateData = {
        duration,
        ...result.stateData,
      };

      await emitCanonicalEvent('orchestrate.execution.finish', {
        run_id: runId,
        task_id: task.id,
        outcome: result.outcome,
        duration_ms: duration,
        exit_code: result.exitCode,
        ...(result.timeout ? { timeout: true } : {}),
        ...withExecutorMetadata(model),
      }, projectDir, task.id, 'execution_finish');

      try {
        await updateTaskState(statePath, task.id, result.status, stateData);
      } catch (error) {
        reject(error);
        return;
      }

      if (result.status === 'completed') {
        resolve({ id: task.id, status: 'completed', duration, output });
        return;
      }

      reject(result.error instanceof Error ? result.error : new Error(String(result.error || `Task ${task.id} failed`)));
    }

    cli.stdout.on('data', (data) => {
      output += data.toString();
    });

    cli.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    cli.on('error', async (err) => {
      await finalizeExecution({
        status: 'failed',
        outcome: 'error',
        exitCode: null,
        stateData: {
          error: err.message,
        },
        error: new Error(`Task ${task.id} failed to start: ${err.message}`),
      });
    });

    cli.on('close', async (code) => {
      if (code === 0) {
        await finalizeExecution({
          status: 'completed',
          outcome: 'pass',
          exitCode: 0,
          stateData: {
            output: output.slice(-500),
            worker: 'worker-' + process.pid % 4,
          },
        });
      } else {
        await finalizeExecution({
          status: 'failed',
          outcome: 'deny',
          exitCode: Number.isInteger(code) ? code : null,
          stateData: {
            error: errorOutput.slice(-500) || `Process exited with code ${code}`,
            code,
          },
          error: new Error(`Task ${task.id} failed with code ${code}`),
        });
      }
    });

    // Timeout handling
    timeoutHandle = setTimeout(() => {
      cli.kill('SIGTERM');
      void finalizeExecution({
        status: 'timeout',
        outcome: 'error',
        exitCode: null,
        durationMs: timeout,
        stateData: {},
        timeout: true,
        error: new Error(`Task ${task.id} timed out after ${timeout}ms`),
      });
    }, timeout);

    // Send prompt
    cli.stdin.write(prompt);
    cli.stdin.end();
    })().catch(reject);
  });
}

// ---------------------------------------------------------------------------
// Parallel Execution
// ---------------------------------------------------------------------------

/**
 * Execute multiple tasks in parallel (respecting worker pool size)
 */
async function executeLayer(layer, workerCount = 2) {
  const results = [];
  const executing = [];

  for (const task of layer) {
    const p = executeTask(task)
      .then(result => {
        executing.splice(executing.indexOf(p), 1);
        results.push(result);
        return result;
      })
      .catch(error => {
        executing.splice(executing.indexOf(p), 1);
        const res = { id: task.id, status: 'failed', error: error.message };
        results.push(res);
        return res;
      });

    executing.push(p);

    if (executing.length >= workerCount) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

if (require.main === module) {
  const taskArg = process.argv[2];
  const projectDir = process.argv[3] || process.cwd();

  if (!taskArg) {
    writeStderr('Usage: node worker.js <taskJson|taskId> [projectDir]');
    process.exit(1);
  }

  // JSON 문자열이면 파싱, 아니면 최소 task 객체 생성
  let task;
  try {
    task = JSON.parse(taskArg);
  } catch {
    task = { id: taskArg, description: taskArg, domain: 'general', risk: 'low' };
  }

  executeTask(task, { projectDir, timeout: 300000 })
    .then(result => {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    })
    .catch(error => {
      writeStderr(JSON.stringify({ error: error.message }, null, 2));
      process.exit(1);
    });
}

module.exports = {
  executeTask,
  executeLayer,
  updateTaskState,
  loadModelRouting,
  resolveCliCommand
};
