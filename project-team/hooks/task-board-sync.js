#!/usr/bin/env node
/**
 * PostToolUse[Edit|Write|TaskUpdate] Hook: Task Board Sync
 *
 * Emits normalized board events to:
 *   .claude/collab/events.ndjson      (append-only event log)
 * and marks board-state.json stale for the authoritative projector rebuild.
 *
 * Event types:
 *   task_claimed    — agent begins a task (in_progress)
 *   task_started    — first file edit associated with a task
 *   task_done       — task marked completed
 *   task_blocked    — task failed or timed out
 *   req_escalated   — REQ status changed to ESCALATED
 *   req_resolved    — REQ status changed to RESOLVED or REJECTED
 *
 * Board columns (from communication-protocol.md §10):
 *   Backlog     ← pending
 *   In Progress ← in_progress, OPEN, PENDING
 *   Blocked     ← failed, timeout, ESCALATED
 *   Done        ← completed, RESOLVED, REJECTED
 *
 * Claude Code Hook Protocol (PostToolUse):
 *   stdin:  JSON { hook_event_name, tool_name, tool_input, tool_response }
 *   stdout: (no output required for PostToolUse)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { writeEvent } = require('../scripts/lib/whitebox-events');
const { setStaleMarker } = require('../scripts/collab-derived-meta');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const TASK_STARTED_ARCHIVE_DIR = path.join(PROJECT_DIR, '.claude', 'collab', 'archive', 'task-started');

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      try { resolve(data.trim() ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

function logStderr(msg) {
  process.stderr.write(`[task-board-sync] ${msg}\n`);
}

function taskStartedMarkerPath(runId, taskId) {
  return path.join(TASK_STARTED_ARCHIVE_DIR, `${runId}--${taskId}.json`);
}

function readTaskContext() {
  const taskId = process.env.CLAUDE_TASK_ID || '';
  const runId = process.env.WHITEBOX_RUN_ID || '';
  if (!taskId || !runId) return null;
  return {
    task_id: taskId,
    run_id: runId,
  };
}

function markTaskStarted(runId, taskId, filePath) {
  const markerPath = taskStartedMarkerPath(runId, taskId);
  if (fs.existsSync(markerPath)) return false;

  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify({
    run_id: runId,
    task_id: taskId,
    file_path: filePath || null,
    created_at: new Date().toISOString(),
  }, null, 2), 'utf8');
  return true;
}

async function appendEvent(event) {
  const payload = { ...event };
  const eventType = payload.type;
  delete payload.type;
  const correlationId = payload.task_id || payload.req_id || null;

  await writeEvent({
    type: eventType,
    producer: 'task-board-sync',
    correlation_id: correlationId,
    data: payload,
  }, {
    projectDir: PROJECT_DIR,
  });
}

// ---------------------------------------------------------------------------
// Event detection — TaskUpdate
// ---------------------------------------------------------------------------

function handleTaskUpdate(toolInput) {
  const taskId = toolInput.task_id || toolInput.id;
  const status = (toolInput.status || '').toLowerCase();
  if (!taskId || !status) return null;

  const eventTypeMap = {
    in_progress: 'task_claimed',
    completed: 'task_done',
    failed: 'task_blocked',
    timeout: 'task_blocked',
  };

  const eventType = eventTypeMap[status] || 'task_updated';
  return {
    type: eventType,
    task_id: taskId,
    status,
    agent: process.env.CLAUDE_AGENT_ROLE || null,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Event detection — REQ file edits (Edit|Write to requests/*.md)
// ---------------------------------------------------------------------------

function parseFrontmatterStatus(content) {
  // Constrain match to within first --- block only, handle CRLF
  const block = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return null;
  const statusMatch = block[1].match(/^status:\s*(\S+)/m);
  return statusMatch ? statusMatch[1].trim().replace(/^['"]|['"]$/g, '').toUpperCase() : null;
}

function handleReqFileEdit(filePath, newContent) {
  if (!filePath) return null;
  const rel = path.relative(PROJECT_DIR, path.resolve(PROJECT_DIR, filePath)).replace(/\\/g, '/');
  if (!rel.startsWith('.claude/collab/requests/') || !rel.endsWith('.md')) return null;

  const status = parseFrontmatterStatus(newContent || '');
  if (!status) return null;

  const reqId = path.basename(rel, '.md');

  if (status === 'ESCALATED') {
    return { type: 'req_escalated', req_id: reqId, status, timestamp: new Date().toISOString() };
  }
  if (status === 'RESOLVED' || status === 'REJECTED') {
    return { type: 'req_resolved', req_id: reqId, status, timestamp: new Date().toISOString() };
  }
  return null;
}

function handleTaskStartedEdit(filePath) {
  const taskContext = readTaskContext();
  if (!taskContext) return null;
  if (!filePath || typeof filePath !== 'string' || filePath.trim() === '') return null;

  const normalizedPath = path.relative(PROJECT_DIR, path.resolve(PROJECT_DIR, filePath)).replace(/\\/g, '/');
  const created = markTaskStarted(taskContext.run_id, taskContext.task_id, normalizedPath);
  if (!created) return null;

  return {
    type: 'task_started',
    task_id: taskContext.task_id,
    run_id: taskContext.run_id,
    file_path: normalizedPath,
    agent: process.env.CLAUDE_AGENT_ROLE || null,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const input = await readStdin();
  const hookEvent = input.hook_event_name || '';
  const toolName = input.tool_name || input.tool || '';
  const toolInput = input.tool_input || {};

  if (!hookEvent.startsWith('PostToolUse')) return;

  let events = [];

  if (toolName === 'TaskUpdate') {
    const taskEvent = handleTaskUpdate(toolInput);
    if (taskEvent) events.push(taskEvent);
  } else if (toolName === 'Edit' || toolName === 'Write') {
    const filePath = toolInput.file_path || toolInput.path || '';
    // PostToolUse: file is already written — read from filesystem for full content
    // (new_string is only the replacement snippet, not the full file)
    let content = '';
    try {
      const fullPath = path.resolve(PROJECT_DIR, filePath);
      if (fs.existsSync(fullPath)) content = fs.readFileSync(fullPath, 'utf8');
    } catch { /* ignore read errors */ }
    const taskStartedEvent = handleTaskStartedEdit(filePath);
    if (taskStartedEvent) events.push(taskStartedEvent);
    const reqEvent = handleReqFileEdit(filePath, content);
    if (reqEvent) events.push(reqEvent);
  }

  if (events.length === 0) return;

  for (const event of events) {
    try {
      await appendEvent(event);
    } catch (err) {
      logStderr(`event append failed: ${err.message}`);
      return;
    }
  }

  try {
    setStaleMarker({
      projectDir: PROJECT_DIR,
      artifact: '.claude/collab/board-state.json',
      schemaVersion: '1.1',
      reason: `incremental event ${events.map((event) => event.type).join(',')}; rebuild required`,
    });
  } catch (err) {
    logStderr(`stale marker set failed: ${err.message}`);
  }
}

main().catch((err) => process.stderr.write(`[task-board-sync] error: ${err.message}\n`));

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleTaskUpdate,
    handleReqFileEdit,
    handleTaskStartedEdit,
    readTaskContext,
    taskStartedMarkerPath,
  };
}
