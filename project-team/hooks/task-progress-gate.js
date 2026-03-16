#!/usr/bin/env node
/**
 * Stop Hook: Task Progress Gate
 *
 * [Purpose] Verify TASKS.md is up to date before the agent stops.
 * [Flow]
 *   1. Read TASKS.md and count completed ([x]) vs total tasks
 *   2. Check git diff for code changes since last commit
 *   3. If code was changed but no TASKS.md checkbox was updated → warn
 *   4. Output decision as JSON to stdout
 * [External] Runs as a Stop hook — last chance to catch missed updates
 * [Caution] This is a "warn" gate, not a "deny" gate — it reminds but does not block
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TASKS_FILENAMES = ['TASKS.md', 'docs/planning/06-tasks.md'];

// ---------------------------------------------------------------------------
// TASKS.md Analysis
// ---------------------------------------------------------------------------

/**
 * Find and parse TASKS.md, return checkbox stats.
 */
function analyzeTasksFile(projectDir) {
  for (const filename of TASKS_FILENAMES) {
    const filePath = path.join(projectDir, filename);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const completed = (content.match(/\[x\]/gi) || []).length;
    const incomplete = (content.match(/\[\s\]/g) || []).length;
    const inProgress = (content.match(/\[\/\]/g) || []).length;
    const total = completed + incomplete + inProgress;

    return {
      found: true,
      file: filename,
      completed,
      incomplete,
      inProgress,
      total,
    };
  }

  return { found: false, file: null, completed: 0, incomplete: 0, inProgress: 0, total: 0 };
}

/**
 * Check if TASKS.md was modified in the current git working tree.
 */
function wasTasksModified(projectDir) {
  for (const filename of TASKS_FILENAMES) {
    const result = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', filename], {
      cwd: projectDir,
      encoding: 'utf8',
      shell: false,
      stdio: 'pipe',
    });
    if (result.stdout && result.stdout.trim().length > 0) return true;

    // Also check staged
    const staged = spawnSync('git', ['diff', '--cached', '--name-only', '--', filename], {
      cwd: projectDir,
      encoding: 'utf8',
      shell: false,
      stdio: 'pipe',
    });
    if (staged.stdout && staged.stdout.trim().length > 0) return true;
  }
  return false;
}

/**
 * Check if code files were modified (not just docs/config).
 */
function wereCodeFilesModified(projectDir) {
  const result = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    cwd: projectDir,
    encoding: 'utf8',
    shell: false,
    stdio: 'pipe',
  });

  if (!result.stdout) return false;

  const codeExtensions = /\.(js|ts|jsx|tsx|py|rs|go|java|rb|swift|kt|cs|cpp|c|h)$/;
  const files = result.stdout.trim().split('\n').filter(Boolean);
  return files.some((f) => codeExtensions.test(f));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const tasks = analyzeTasksFile(projectDir);

  // No TASKS.md → nothing to check
  if (!tasks.found) {
    process.stdout.write(JSON.stringify({ decision: 'approve', reason: '' }));
    return;
  }

  const codeChanged = wereCodeFilesModified(projectDir);
  const tasksUpdated = wasTasksModified(projectDir);

  // Code changed but TASKS.md not updated → warn
  if (codeChanged && !tasksUpdated) {
    const reason = `Code files were modified but TASKS.md was not updated. `
      + `Current progress: ${tasks.completed}/${tasks.total} completed, ${tasks.inProgress} in progress. `
      + `Please update TASKS.md to reflect completed work before finishing.`;

    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason,
      stopReason: reason,
      hookSpecificOutput: {
        additionalContext: reason,
      },
    }));
    return;
  }

  // Everything OK
  process.stdout.write(JSON.stringify({
    decision: 'approve',
    reason: '',
  }));
}

if (require.main === module) {
  try {
    main();
  } catch {
    // Hook must never crash the session
    process.stdout.write(JSON.stringify({ decision: 'approve', reason: '' }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { analyzeTasksFile, wasTasksModified, wereCodeFilesModified };
}
