#!/usr/bin/env node
/**
 * PostToolUse[Write|Edit|TaskUpdate] Hook: Task Sync
 *
 * Automatically syncs task completion status to the original TASKS.md file.
 * Detects task completion from:
 *   - Code comments (@TASK P1-T1, #P1-T1)
 *   - TaskUpdate tool calls
 *   - Commit message patterns
 *
 * Finds TASKS.md regardless of location:
 *   - TASKS.md (root, canonical)
 *   - docs/planning/06-tasks.md (legacy convention)
 *   - any tasks.md or *-tasks.md files
 *
 * Claude Code Hook Protocol (PostToolUse):
 *   - stdin: JSON { tool_name, tool_input, tool_result, hook_event_name }
 *   - stdout: JSON { hookSpecificOutput: { additionalContext: string } }
 *
 * @version 1.0.0
 * @date 2026-02-08
 */

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

/**
 * Task file patterns to search for (in priority order).
 */
const TASK_FILE_PATTERNS = [
  'TASKS.md',
  'docs/planning/06-tasks.md',
  'docs/planning/tasks.md',
  'docs/tasks.md',
  'planning/tasks.md',
  '.tasks.md'
];

/**
 * Task ID patterns to detect in code/comments.
 * Captures:
 *   - Phase-based: P{phase}-T{task} or P{phase}-S{screen}-T{task} or P{phase}-R{resource}
 *   - Agile layer: T{layer}.{seq} (e.g., T0.1, T1.2, T3.4)
 */
const TASK_ID_PATTERNS = [
  // === Phase-based IDs (P*-T*) ===
  // @TASK P1-T1, @TASK P2-S1-T3
  /@TASK\s+(P\d+(?:-[A-Z]\d+)?(?:-T\d+)?)/gi,
  // #P1-T1, #P2-S1-T3
  /#(P\d+(?:-[A-Z]\d+)?(?:-T\d+)?)\b/g,
  // Task P1-T1 completed, Task P2-S1-T3 done
  /Task\s+(P\d+(?:-[A-Z]\d+)?(?:-T\d+)?)\s+(?:completed|done|finished)/gi,
  // [P1-T1] in commit messages
  /\[(P\d+(?:-[A-Z]\d+)?(?:-T\d+)?)\]/g,

  // === Agile layer IDs (T*.*) ===
  // @TASK T0.1, @TASK T1.2
  /@TASK\s+(T\d+(?:\.\d+)+)/gi,
  // #T0.1, #T1.2
  /#(T\d+(?:\.\d+)+)\b/g,
  // Task T0.1 completed, Task T1.2 done
  /Task\s+(T\d+(?:\.\d+)+)\s+(?:completed|done|finished)/gi,
  // [T0.1], [T1.2] in commit messages
  /\[(T\d+(?:\.\d+)+)\]/g
];

/**
 * Checkbox patterns in TASKS.md.
 */
const UNCHECKED_PATTERN = /^(\s*-\s*)\[ \]/;
const CHECKED_PATTERN = /^(\s*-\s*)\[x\]/i;

// ---------------------------------------------------------------------------
// 2. Task File Discovery
// ---------------------------------------------------------------------------

/**
 * Find the tasks file in the project.
 * Searches in priority order from TASK_FILE_PATTERNS.
 *
 * @param {string} projectDir - Project root directory
 * @returns {string|null} Path to tasks file or null if not found
 */
function findTasksFile(projectDir) {
  // Check direct patterns first
  for (const pattern of TASK_FILE_PATTERNS) {
    const filePath = path.join(projectDir, pattern);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  // Fallback: search for any *tasks*.md file
  try {
    const candidates = findFilesRecursive(projectDir, /tasks.*\.md$/i, 3);
    if (candidates.length > 0) {
      // Prefer files with more task checkboxes
      let bestFile = candidates[0];
      let maxTasks = 0;

      for (const file of candidates) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          const taskCount = (content.match(/- \[[ x]\]/gi) || []).length;
          if (taskCount > maxTasks) {
            maxTasks = taskCount;
            bestFile = file;
          }
        } catch { /* ignore */ }
      }

      return bestFile;
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * Recursively find files matching a pattern.
 *
 * @param {string} dir - Directory to search
 * @param {RegExp} pattern - Filename pattern
 * @param {number} maxDepth - Maximum recursion depth
 * @param {number} currentDepth - Current depth
 * @returns {string[]} Array of matching file paths
 */
function findFilesRecursive(dir, pattern, maxDepth, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];

  const results = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden directories and common excludes
      if (entry.name.startsWith('.')) continue;
      if (['node_modules', 'dist', 'build', '__pycache__', '.git'].includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        results.push(...findFilesRecursive(fullPath, pattern, maxDepth, currentDepth + 1));
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch { /* ignore permission errors */ }

  return results;
}

// ---------------------------------------------------------------------------
// 3. Task ID Extraction
// ---------------------------------------------------------------------------

/**
 * Extract task IDs from content (code, comments, commit messages).
 *
 * @param {string} content - Content to analyze
 * @returns {string[]} Array of task IDs (e.g., ['P1-T1', 'P2-S1-T3'])
 */
function extractTaskIds(content) {
  if (!content || typeof content !== 'string') return [];

  const taskIds = new Set();

  for (const pattern of TASK_ID_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const taskId = match[1].toUpperCase();
      taskIds.add(taskId);
    }
  }

  return Array.from(taskIds);
}

/**
 * Check if content indicates task completion.
 *
 * @param {string} content - Content to check
 * @returns {boolean}
 */
function hasCompletionIndicator(content) {
  if (!content) return false;

  const completionPatterns = [
    /\bcompleted?\b/i,
    /\bdone\b/i,
    /\bfinished\b/i,
    /\bimplemented\b/i,
    /\b완료\b/,
    /\[x\]/i
  ];

  return completionPatterns.some(p => p.test(content));
}

// ---------------------------------------------------------------------------
// 4. Task File Update
// ---------------------------------------------------------------------------

/**
 * Update task checkboxes in the tasks file.
 *
 * @param {string} tasksFilePath - Path to the tasks file
 * @param {string[]} taskIds - Task IDs to mark as complete
 * @returns {object} Result { updated: string[], notFound: string[] }
 */
function updateTaskCheckboxes(tasksFilePath, taskIds) {
  if (!tasksFilePath || !taskIds || taskIds.length === 0) {
    return { updated: [], notFound: taskIds || [] };
  }

  let content;
  try {
    content = fs.readFileSync(tasksFilePath, 'utf8');
  } catch {
    return { updated: [], notFound: taskIds };
  }

  const lines = content.split('\n');
  const updated = [];
  const notFound = [...taskIds];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line contains any of our task IDs
    for (const taskId of taskIds) {
      // Match task ID in the line (case-insensitive)
      const taskPattern = new RegExp(`\\b${escapeRegex(taskId)}\\b`, 'i');

      if (taskPattern.test(line)) {
        // Check if it's an unchecked task
        if (UNCHECKED_PATTERN.test(line)) {
          // Update the checkbox
          lines[i] = line.replace(UNCHECKED_PATTERN, '$1[x]');
          updated.push(taskId);

          // Remove from notFound
          const idx = notFound.indexOf(taskId);
          if (idx !== -1) notFound.splice(idx, 1);
        } else if (CHECKED_PATTERN.test(line)) {
          // Already checked, just remove from notFound
          const idx = notFound.indexOf(taskId);
          if (idx !== -1) notFound.splice(idx, 1);
        }
      }
    }
  }

  // Write back if any updates were made
  if (updated.length > 0) {
    try {
      fs.writeFileSync(tasksFilePath, lines.join('\n'), 'utf8');
    } catch {
      return { updated: [], notFound: taskIds };
    }
  }

  return { updated, notFound };
}

/**
 * Escape special regex characters in a string.
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// 5. TaskUpdate Tool Integration (Option C)
// ---------------------------------------------------------------------------

/**
 * Handle TaskUpdate tool calls.
 * When internal TaskUpdate marks a task as completed, sync to TASKS.md.
 *
 * @param {object} toolInput - TaskUpdate tool input
 * @param {string} projectDir - Project root directory
 * @returns {object|null} Update result or null
 */
function handleTaskUpdate(toolInput, projectDir) {
  const { taskId, status, subject } = toolInput || {};

  // Only handle completion
  if (status !== 'completed') return null;

  // Extract task ID from subject if available
  const taskIds = [];

  if (subject) {
    const extracted = extractTaskIds(subject);
    taskIds.push(...extracted);
  }

  // If no task ID found in subject, try to infer from taskId
  if (taskIds.length === 0 && taskId) {
    // Internal task IDs might be numeric, try to match with active tasks
    // This is a best-effort approach
    taskIds.push(`TASK-${taskId}`);
  }

  if (taskIds.length === 0) return null;

  const tasksFile = findTasksFile(projectDir);
  if (!tasksFile) return null;

  return updateTaskCheckboxes(tasksFile, taskIds);
}

// ---------------------------------------------------------------------------
// 6. Edit/Write Handler (Option A)
// ---------------------------------------------------------------------------

/**
 * Handle Edit/Write tool calls.
 * Detect task completion from code changes and update TASKS.md.
 *
 * @param {object} params
 * @param {string} params.filePath - File being edited
 * @param {string} params.content - New content (Write)
 * @param {string} params.newString - New string (Edit)
 * @param {string} params.oldString - Old string (Edit)
 * @param {string} params.projectDir - Project root directory
 * @returns {object|null} Update result or null
 */
function handleEditWrite(params) {
  const { filePath, content, newString, oldString, projectDir } = params;

  // Combine all available content for analysis
  const allContent = [content, newString, oldString].filter(Boolean).join('\n');

  // Extract task IDs from the content
  const taskIds = extractTaskIds(allContent);

  if (taskIds.length === 0) return null;

  // Check if there's a completion indicator
  // For Edit/Write, we're more conservative - only update if explicitly marked complete
  if (!hasCompletionIndicator(allContent)) {
    // Still useful to track but don't auto-complete
    return null;
  }

  const tasksFile = findTasksFile(projectDir);
  if (!tasksFile) return null;

  return {
    ...updateTaskCheckboxes(tasksFile, taskIds),
    tasksFile: path.relative(projectDir, tasksFile)
  };
}

// ---------------------------------------------------------------------------
// 7. Report Formatting
// ---------------------------------------------------------------------------

/**
 * Format a task sync report for additionalContext output.
 *
 * @param {object} result - Update result
 * @param {string} tasksFile - Relative path to tasks file
 * @returns {string} Formatted report
 */
function formatSyncReport(result, tasksFile) {
  if (!result) return '';

  const { updated, notFound } = result;

  if (updated.length === 0) return '';

  let report = '[Task Sync]\n';
  report += `  Tasks File: ${tasksFile}\n`;
  report += `  Updated: ${updated.join(', ')}\n`;

  if (notFound && notFound.length > 0) {
    report += `  Not Found: ${notFound.join(', ')}\n`;
  }

  return report;
}

// ---------------------------------------------------------------------------
// 8. stdin/stdout Helpers (Claude Code Hook Protocol)
// ---------------------------------------------------------------------------

let _hookEventName = '';

/**
 * Read JSON from stdin.
 * @returns {Promise<object>}
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      try {
        const parsed = data.trim() ? JSON.parse(data) : {};
        _hookEventName = parsed.hook_event_name || '';
        resolve(parsed);
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

/**
 * Output additional context (PostToolUse guidance).
 * @param {string} context
 */
function outputContext(context) {
  const hookSpecificOutput = { additionalContext: context };
  if (_hookEventName) hookSpecificOutput.hookEventName = _hookEventName;
  process.stdout.write(JSON.stringify({ hookSpecificOutput }));
}

// ---------------------------------------------------------------------------
// 9. Main Hook Entry Point
// ---------------------------------------------------------------------------

async function main() {
  const input = await readStdin();

  const toolName = input.tool_name || input.tool || '';
  const toolInput = input.tool_input || {};
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let result = null;
  let tasksFile = '';

  // Option C: Handle TaskUpdate tool
  if (toolName === 'TaskUpdate') {
    result = handleTaskUpdate(toolInput, projectDir);
    if (result) {
      const tf = findTasksFile(projectDir);
      tasksFile = tf ? path.relative(projectDir, tf) : '';
    }
  }

  // Option A: Handle Edit/Write tools
  if (toolName === 'Edit' || toolName === 'Write') {
    const filePath = toolInput.file_path || toolInput.path || '';

    // Skip if editing the tasks file itself
    const tf = findTasksFile(projectDir);
    if (tf && filePath === tf) return;

    result = handleEditWrite({
      filePath,
      content: toolInput.content || '',
      newString: toolInput.new_string || '',
      oldString: toolInput.old_string || '',
      projectDir
    });

    if (result) {
      tasksFile = result.tasksFile || '';
    }
  }

  // Output report if any tasks were updated
  if (result && result.updated && result.updated.length > 0) {
    const report = formatSyncReport(result, tasksFile);
    if (report) {
      outputContext(report);
    }
  }
}

main().catch(() => {
  // Silent exit - hooks must never break the session
});

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TASK_FILE_PATTERNS,
    TASK_ID_PATTERNS,
    findTasksFile,
    findFilesRecursive,
    extractTaskIds,
    hasCompletionIndicator,
    updateTaskCheckboxes,
    handleTaskUpdate,
    handleEditWrite,
    formatSyncReport
  };
}
