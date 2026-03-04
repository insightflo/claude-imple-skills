#!/usr/bin/env node
/**
 * PostToolUse Hook: Tasks Status Writer
 *
 * When TASKS.md is edited/written, parses stats and writes to
 * .claude/cache/tasks-status.json for the statusline to read.
 *
 * Hook events: PostToolUse[Edit|Write]
 */

const fs = require('fs');
const path = require('path');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

function isTasksMdEdit(toolName, toolInput, projectRoot) {
  if (!['Edit', 'Write'].includes(toolName)) return false;
  const filePath = toolInput.file_path || toolInput.path || '';
  if (!filePath) return false;
  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectRoot, filePath);
  return path.basename(absPath) === 'TASKS.md';
}

function computeStats(content) {
  const lines = content.split('\n');
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
      done++;
      total++;
    } else if (/^### \[ \]/.test(line)) {
      total++;
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

async function main() {
  const input = await readStdin();
  const toolName = input.tool_name || input.tool || '';
  const toolInput = input.tool_input || {};
  const projectRoot = process.env.CLAUDE_PROJECT_DIR
    || (input.workspace && input.workspace.project_root)
    || process.cwd();

  if (!isTasksMdEdit(toolName, toolInput, projectRoot)) return;

  const tasksPath = path.join(projectRoot, 'TASKS.md');
  if (!fs.existsSync(tasksPath)) return;

  const content = fs.readFileSync(tasksPath, 'utf8');
  const stats = computeStats(content);

  const cacheDir = path.join(projectRoot, '.claude', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, 'tasks-status.json'),
    JSON.stringify(stats, null, 2) + '\n',
    'utf8'
  );
}

main().catch(() => {
  // Hooks must never crash the session
});
