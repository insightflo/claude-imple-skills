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

const STATE_FILE = '.claude/orchestrate-state.json';

function writeStderr(message) {
  process.stderr.write(`${message}\n`);
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

  // 1. task.model이 없으면 model-routing.yaml에서 task.owner 기반으로 탐색
  if (!model) {
    const routingConfig = loadModelRouting(projectDir);
    if (task.owner && routingConfig.routing[task.owner]) {
      model = routingConfig.routing[task.owner];
    } else {
      model = routingConfig.default || 'claude';
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
  }

  let command = defaultClaudePath;
  let args = [];

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
      command = defaultClaudePath;
      args = [];
      resolvedModel = 'claude';
    }
  }

  return { command, args, model: resolvedModel };
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
    const startTime = Date.now();

    // Update state to "in_progress"
    updateTaskState(statePath, task.id, 'in_progress', { worker: 'worker-' + process.pid % 4 });

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
    const { command, args, model } = resolveCliCommand(task, projectDir, claudePath);
    process.stderr.write(`[worker] Task ${task.id} → ${command} (model: ${model})\n`);

    // Spawn the selected CLI
    const cli = spawn(command, args, {
      cwd: projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CLAUDE_AGENT_ROLE: task.owner || 'default' }
    });

    let output = '';
    let errorOutput = '';

    cli.stdout.on('data', (data) => {
      output += data.toString();
    });

    cli.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    cli.on('error', (err) => {
      updateTaskState(statePath, task.id, 'failed', {
        duration: Date.now() - startTime,
        error: err.message,
      });
      reject(new Error(`Task ${task.id} failed to start: ${err.message}`));
    });

    cli.on('close', (code) => {
      const duration = Date.now() - startTime;

      if (code === 0) {
        updateTaskState(statePath, task.id, 'completed', {
          duration,
          output: output.slice(-500), // Last 500 chars
          worker: 'worker-' + process.pid % 4
        });
        resolve({ id: task.id, status: 'completed', duration, output });
      } else {
        updateTaskState(statePath, task.id, 'failed', {
          duration,
          error: errorOutput.slice(-500) || `Process exited with code ${code}`,
          code
        });
        reject(new Error(`Task ${task.id} failed with code ${code}`));
      }
    });

    // Timeout handling
    const timeoutHandle = setTimeout(() => {
      cli.kill('SIGTERM');
      updateTaskState(statePath, task.id, 'timeout', { duration: timeout });
      reject(new Error(`Task ${task.id} timed out after ${timeout}ms`));
    }, timeout);

    cli.on('close', () => {
      clearTimeout(timeoutHandle);
    });

    // Send prompt
    cli.stdin.write(prompt);
    cli.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// State Management
// ---------------------------------------------------------------------------

/**
 * Update task state in orchestrate-state.json
 */
function updateTaskState(statePath, taskId, status, data = {}) {
  try {
    let state = { tasks: [], started_at: new Date().toISOString() };

    if (fs.existsSync(statePath)) {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }

    const taskIndex = state.tasks.findIndex(t => t.id === taskId);
    const taskState = {
      id: taskId,
      status,
      updated_at: new Date().toISOString(),
      ...data
    };

    if (taskIndex >= 0) {
      state.tasks[taskIndex] = { ...state.tasks[taskIndex], ...taskState };
    } else {
      state.tasks.push(taskState);
    }

    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (error) {
    writeStderr(`Failed to update state: ${error.message}`);
  }
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
