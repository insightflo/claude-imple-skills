#!/usr/bin/env node
/**
 * PostToolUse[Edit|Write|TaskUpdate] Hook: Task Board Sync
 *
 * Emits normalized board events to:
 *   .claude/collab/events.ndjson      (append-only event log)
 *   .claude/collab/board-state.json   (current board snapshot)
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const COLLAB_DIR = path.join(PROJECT_DIR, '.claude', 'collab');
const EVENTS_FILE = path.join(COLLAB_DIR, 'events.ndjson');
const BOARD_FILE = path.join(COLLAB_DIR, 'board-state.json');

const COLUMN_MAP = {
  pending: 'Backlog',
  in_progress: 'In Progress',
  failed: 'Blocked',
  timeout: 'Blocked',
  completed: 'Done',
  OPEN: 'In Progress',
  PENDING: 'In Progress',
  ESCALATED: 'Blocked',
  RESOLVED: 'Done',
  REJECTED: 'Done',
};

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

function ensureCollabDir() {
  if (!fs.existsSync(COLLAB_DIR)) {
    fs.mkdirSync(COLLAB_DIR, { recursive: true });
  }
}

function appendEvent(event) {
  ensureCollabDir();
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n', 'utf8');
}

function readBoardState() {
  if (!fs.existsSync(BOARD_FILE)) {
    return {
      version: '1.0',
      generated_at: new Date().toISOString(),
      columns: {
        Backlog: [],
        'In Progress': [],
        Blocked: [],
        Done: [],
      },
    };
  }
  try {
    return JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
  } catch {
    // Return null on parse error — do NOT overwrite with empty state
    return null;
  }
}

function writeBoardState(state) {
  ensureCollabDir();
  state.generated_at = new Date().toISOString();
  const tmp = BOARD_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, BOARD_FILE);
}

// ---------------------------------------------------------------------------
// Board state mutations
// ---------------------------------------------------------------------------

function removeCardFromAllColumns(state, cardId) {
  for (const col of Object.values(state.columns)) {
    const idx = col.findIndex((c) => c.id === cardId);
    if (idx >= 0) col.splice(idx, 1);
  }
}

function upsertCard(state, card) {
  const targetCol = COLUMN_MAP[card.status] || 'Backlog';
  // Preserve existing title/agent before removing
  let existing = null;
  for (const col of Object.values(state.columns)) {
    const found = col.find((c) => c.id === card.id);
    if (found) { existing = found; break; }
  }
  removeCardFromAllColumns(state, card.id);
  if (!state.columns[targetCol]) state.columns[targetCol] = [];
  state.columns[targetCol].push({
    id: card.id,
    title: (card.title && card.title !== card.id) ? card.title : (existing?.title || card.id),
    status: card.status,
    agent: card.agent || existing?.agent || null,
    updated_at: new Date().toISOString(),
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

// ---------------------------------------------------------------------------
// Apply event to board state
// ---------------------------------------------------------------------------

function applyEventToBoard(state, event) {
  if (!event) return;

  if (event.type === 'task_claimed' || event.type === 'task_done' || event.type === 'task_blocked' || event.type === 'task_updated') {
    upsertCard(state, {
      id: event.task_id,
      title: event.task_id,
      status: event.status,
      agent: event.agent,
    });
  }

  if (event.type === 'req_escalated' || event.type === 'req_resolved') {
    upsertCard(state, {
      id: event.req_id,
      title: `REQ: ${event.req_id}`,
      status: event.status,
      agent: null,
    });
  }
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

  let event = null;

  if (toolName === 'TaskUpdate') {
    event = handleTaskUpdate(toolInput);
  } else if (toolName === 'Edit' || toolName === 'Write') {
    const filePath = toolInput.file_path || toolInput.path || '';
    // PostToolUse: file is already written — read from filesystem for full content
    // (new_string is only the replacement snippet, not the full file)
    let content = '';
    try {
      const fullPath = path.resolve(PROJECT_DIR, filePath);
      if (fs.existsSync(fullPath)) content = fs.readFileSync(fullPath, 'utf8');
    } catch { /* ignore read errors */ }
    event = handleReqFileEdit(filePath, content);
  }

  if (!event) return;

  try {
    appendEvent(event);
    const state = readBoardState();
    if (!state) return; // Parse error — skip write to avoid board wipe
    applyEventToBoard(state, event);
    writeBoardState(state);
  } catch {
    // Never block the workflow — board sync is best-effort
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
    applyEventToBoard,
    upsertCard,
    removeCardFromAllColumns,
    COLUMN_MAP,
  };
}
