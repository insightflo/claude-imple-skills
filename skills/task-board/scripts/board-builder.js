#!/usr/bin/env node
/**
 * board-builder.js
 *
 * Rebuilds .claude/collab/board-state.json from canonical sources:
 *   1. TASKS.md                          (task list with [ ] / [x] status)
 *   2. .claude/orchestrate-state.json    (orchestrate status: pending/in_progress/completed/failed)
 *   3. .claude/collab/requests/*.md      (REQ status: OPEN/PENDING/ESCALATED/RESOLVED/REJECTED)
 *   4. .claude/task-layers.json          (dependency DAG from scheduler)
 *
 * Usage:
 *   node board-builder.js [--project-dir=/path] [--json] [--dry-run]
 *
 * Output: writes .claude/collab/board-state.json
 *         with --json: also prints to stdout
 *         with --dry-run: prints only, does not write
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { projectDir: process.cwd(), json: false, dryRun: false };
  for (const arg of args) {
    if (arg.startsWith('--project-dir=')) opts.projectDir = path.resolve(arg.slice(14));
    else if (arg === '--json') opts.json = true;
    else if (arg === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Column map
// ---------------------------------------------------------------------------

const COLUMN_MAP = {
  // orchestrate-state statuses
  pending: 'Backlog',
  in_progress: 'In Progress',
  failed: 'Blocked',
  timeout: 'Blocked',
  completed: 'Done',
  // TASKS.md checkbox
  checked: 'Done',
  unchecked: 'Backlog',
  // REQ statuses
  OPEN: 'In Progress',
  PENDING: 'In Progress',
  ESCALATED: 'Blocked',
  RESOLVED: 'Done',
  REJECTED: 'Done',
};

// ---------------------------------------------------------------------------
// TASKS.md parser
// ---------------------------------------------------------------------------

function parseTasks(tasksPath) {
  if (!fs.existsSync(tasksPath)) return [];
  const lines = fs.readFileSync(tasksPath, 'utf8').split('\n');
  const tasks = [];
  for (const line of lines) {
    // Match both: "- [ ] Title" and "### [x] Title" (heading-style tasks)
    const m = line.match(/^\s*-\s*\[( |x)\]\s*(.+)$/i) ||
              line.match(/^#+\s+\[( |x)\]\s+(.+)$/i);
    if (!m) continue;
    const done = m[1].toLowerCase() === 'x';
    const title = m[2].trim();
    // Extract task ID if present (e.g. "T1.1:", "P8-T2:")
    const idMatch = title.match(/^([A-Z0-9]+-?[A-Z0-9]*\.[A-Z0-9]+):\s*/i) ||
                    title.match(/^([A-Z0-9]+-T[0-9]+):\s*/i);
    const id = idMatch ? idMatch[1] : title.slice(0, 40);
    tasks.push({ id, title, status: done ? 'completed' : 'pending', source: 'tasks-md' });
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// orchestrate-state.json parser
// ---------------------------------------------------------------------------

function parseOrchestrateState(statePath) {
  if (!fs.existsSync(statePath)) return [];
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!Array.isArray(state.tasks)) return [];
    return state.tasks.map((t) => ({
      id: t.id,
      title: t.title || t.id,
      status: t.status || 'pending',
      agent: t.owner || t.agent || null,
      source: 'orchestrate-state',
    }));
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// REQ files parser
// ---------------------------------------------------------------------------

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?(?:\n|$)/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    meta[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
  }
  return meta;
}

function parseReqFiles(requestsDir) {
  if (!fs.existsSync(requestsDir)) return [];
  const files = fs.readdirSync(requestsDir).filter((f) => f.match(/^REQ-.*\.md$/));
  return files.map((f) => {
    try {
      const content = fs.readFileSync(path.join(requestsDir, f), 'utf8');
      const meta = parseFrontmatter(content);
      return {
        id: meta.id || path.basename(f, '.md'),
        title: `REQ: ${meta.id || f}`,
        status: (meta.status || 'OPEN').toUpperCase(),
        agent: meta.from || null,
        source: 'req-file',
      };
    } catch { return null; }
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Merge: orchestrate-state overrides tasks-md for same task ID
// ---------------------------------------------------------------------------

function mergeSources(tasksMd, orchestrateState, reqs) {
  const byId = new Map();

  // Base: tasks-md
  for (const t of tasksMd) byId.set(t.id, t);

  // Override with orchestrate-state (more precise status)
  for (const t of orchestrateState) byId.set(t.id, { ...byId.get(t.id), ...t });

  // Add REQ cards (separate from tasks)
  for (const r of reqs) byId.set(r.id, r);

  return Array.from(byId.values());
}

// ---------------------------------------------------------------------------
// Build board state
// ---------------------------------------------------------------------------

function buildBoard(cards) {
  const state = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] },
  };

  for (const card of cards) {
    const col = COLUMN_MAP[card.status] || 'Backlog';
    state.columns[col].push({
      id: card.id,
      title: card.title,
      status: card.status,
      agent: card.agent || null,
      source: card.source,
    });
  }

  return state;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs();
  const p = opts.projectDir;

  const tasksMd = parseTasks(path.join(p, 'TASKS.md'));
  const orchestrateState = parseOrchestrateState(path.join(p, '.claude', 'orchestrate-state.json'));
  const reqs = parseReqFiles(path.join(p, '.claude', 'collab', 'requests'));

  const cards = mergeSources(tasksMd, orchestrateState, reqs);
  const board = buildBoard(cards);

  if (!opts.dryRun) {
    const outPath = path.join(p, '.claude', 'collab', 'board-state.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(board, null, 2));
    process.stderr.write(`board-state.json written (${cards.length} cards)\n`);
  }

  if (opts.json || opts.dryRun) {
    process.stdout.write(JSON.stringify(board, null, 2) + '\n');
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseTasks, parseOrchestrateState, parseReqFiles, mergeSources, buildBoard, COLUMN_MAP };
