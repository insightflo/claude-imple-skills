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
const { readTasksStats } = require('../lib/tasks-status');
const { refreshWhiteboxSummary } = require('../../whitebox/scripts/whitebox-summary');

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

  const stats = readTasksStats(tasksPath);

  const cacheDir = path.join(projectRoot, '.claude', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, 'tasks-status.json'),
    JSON.stringify(stats, null, 2) + '\n',
    'utf8'
  );

  refreshWhiteboxSummary({ projectDir: projectRoot });
}

main().catch(() => {
  // Hooks must never crash the session
});
