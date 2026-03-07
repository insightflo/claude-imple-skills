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
const crypto = require('crypto');

const { readEvents } = require('../../../project-team/scripts/lib/whitebox-events');
const { refreshWhiteboxSummary } = require('../../whitebox/scripts/whitebox-summary');
const {
  setStaleMarker,
  clearStaleMarker,
  readMarkers,
} = require('../../../project-team/scripts/collab-derived-meta');

const BOARD_SCHEMA_VERSION = '1.1';
const BOARD_STATE_REL_PATH = '.claude/collab/board-state.json';
const BOARD_SNAPSHOT_REL_PATH = '.claude/collab/board-state.snapshot.json';
const EVENTS_REL_PATH = '.claude/collab/events.ndjson';

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
    const m = line.match(/^\s*[-*]\s*\[( |x)\]\s*(.+)$/i) ||
              line.match(/^#+\s+\[( |x)\]\s+(.+)$/i);
    if (!m) continue;
    const done = m[1].toLowerCase() === 'x';
    const title = m[2].trim();
    // Extract task ID if present (e.g. "T1.1:", "P8-T2:")
    const idMatch = title.match(/^([A-Z0-9]+-?[A-Z0-9]*\.[A-Z0-9]+):\s*/i) ||
                    title.match(/^([A-Z][0-9]+-[A-Z][0-9]+):\s*/i) ||
                    title.match(/^([A-Z0-9]+-T[0-9]+):\s*/i);
    const id = idMatch ? idMatch[1] : title.slice(0, 40);
    tasks.push({ id, title, status: done ? 'completed' : 'pending', source: 'tasks-md' });
  }
  return tasks.sort((a, b) => a.id.localeCompare(b.id));
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
  const files = fs.readdirSync(requestsDir)
    .filter((f) => f.match(/^REQ-.*\.md$/))
    .sort((a, b) => a.localeCompare(b));
  return files.map((f) => {
    try {
      const content = fs.readFileSync(path.join(requestsDir, f), 'utf8');
      const meta = parseFrontmatter(content);
      return {
        id: meta.id || path.basename(f, '.md'),
        title: `REQ: ${meta.id || f}`,
        status: (meta.status || 'OPEN').trim().replace(/^['"]|['"]$/g, '').toUpperCase(),
        agent: meta.from || null,
        source: 'req-file',
      };
    } catch { return null; }
  }).filter(Boolean);
}

function readTextIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  } catch {
    return '';
  }
}

function sha256(parts) {
  const hash = crypto.createHash('sha256');
  for (const part of parts) hash.update(String(part || ''), 'utf8');
  return hash.digest('hex');
}

function latestIso(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function deriveBlockerDetails(event) {
  const data = event && event.data && typeof event.data === 'object' ? event.data : {};

  if (event.type === 'hook.decision' && data.decision && data.decision !== 'allow') {
    return {
      reason: data.summary || `${data.hook || event.producer} ${data.decision}`,
      source: data.hook || event.producer,
      remediation: data.remediation || null,
    };
  }

  if (event.type === 'orchestrate.gate.outcome' && data.outcome && data.outcome !== 'pass') {
    return {
      reason: data.reason || `${data.gate || 'gate'} ${data.outcome}`,
      source: data.gate || event.producer,
      remediation: null,
    };
  }

  if (event.type === 'req_escalated') {
    return {
      reason: 'Request escalated',
      source: event.producer,
      remediation: null,
    };
  }

  if (event.type === 'task_blocked') {
    return {
      reason: 'Task reported blocked',
      source: event.producer,
      remediation: null,
    };
  }

  if (event.type === 'multi_ai_review.run.finish' && data.verdict === 'warning') {
    return {
      reason: 'Multi-AI review reported warnings',
      source: event.producer,
      remediation: null,
    };
  }

  if (event.type === 'multi_ai_review.capability' && data.state === 'missing_cli') {
    return {
      reason: data.message || `Missing CLI for ${data.member_name || data.executor || 'review member'}`,
      source: event.producer,
      remediation: 'Install or authenticate the missing CLI, then rerun the review.',
    };
  }

  if (event.type === 'multi_ai_run.route.fallback') {
    return {
      reason: data.fallback_reason || 'Executor fallback applied',
      source: event.producer,
      remediation: 'Install or restore the requested executor to avoid fallback.',
    };
  }

  return null;
}

function parseEventContext(projectDir) {
  const parsed = readEvents({ projectDir, file: EVENTS_REL_PATH, tolerateTrailingPartialLine: true });
  const byId = new Map();

  for (const event of parsed.events) {
    const data = event && event.data && typeof event.data === 'object' ? event.data : {};
    const cardId = data.task_id || data.req_id || event.correlation_id || null;
    if (!cardId) continue;

    const current = byId.get(cardId) || {
      last_event_ts: null,
      last_event_type: null,
      run_id: null,
      blocker_reason: null,
      blocker_source: null,
      remediation: null,
    };

    current.last_event_ts = latestIso(current.last_event_ts, event.ts || null);
    if (!current.last_event_type || current.last_event_ts === (event.ts || null)) {
      current.last_event_type = event.type;
    }
    if (data.run_id) current.run_id = data.run_id;

    const blocker = deriveBlockerDetails(event);
    if (blocker) {
      current.blocker_reason = blocker.reason;
      current.blocker_source = blocker.source;
      current.remediation = blocker.remediation;
    }

    byId.set(cardId, current);
  }

  return {
    byId,
    stats: {
      events: parsed.events.length,
      invalid: parsed.errors.length,
      truncated: parsed.truncated.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Merge: orchestrate-state overrides tasks-md for same task ID
// ---------------------------------------------------------------------------

function mergeSources(tasksMd, orchestrateState, reqs) {
  const byId = new Map();

  // Base: tasks-md
  for (const t of tasksMd) byId.set(t.id, t);

  // Override with orchestrate-state (more precise status), but preserve richer title from tasks-md
  for (const t of orchestrateState) {
    const existing = byId.get(t.id);
    const preservedTitle = (existing?.title && existing.title !== t.id) ? existing.title : (t.title || t.id);
    byId.set(t.id, { ...existing, ...t, title: preservedTitle });
  }

  // Add REQ cards (separate from tasks)
  for (const r of reqs) byId.set(r.id, r);

  return Array.from(byId.values());
}

// ---------------------------------------------------------------------------
// Build board state
// ---------------------------------------------------------------------------

function buildBoard(cards, options = {}) {
  const eventContext = options.eventContext || { byId: new Map(), stats: { events: 0, invalid: 0, truncated: 0 } };
  const fingerprint = options.fingerprint || '';
  const staleMarkers = Array.isArray(options.staleMarkers) ? options.staleMarkers : [];
  const state = {
    version: '1.0',
    schema_version: BOARD_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] },
    derived_from: {
      fingerprint,
      event_log: EVENTS_REL_PATH,
      authoritative_writer: 'skills/task-board/scripts/board-builder.js',
      event_stats: eventContext.stats,
    },
    stale_markers: staleMarkers,
  };

  for (const card of cards) {
    const col = COLUMN_MAP[card.status] || 'Backlog';
    const eventMeta = eventContext.byId.get(card.id) || null;
    state.columns[col].push({
      id: card.id,
      title: card.title,
      status: card.status,
      agent: card.agent || null,
      source: card.source,
      run_id: eventMeta && eventMeta.run_id ? eventMeta.run_id : null,
      last_event_type: eventMeta && eventMeta.last_event_type ? eventMeta.last_event_type : null,
      last_event_ts: eventMeta && eventMeta.last_event_ts ? eventMeta.last_event_ts : null,
      blocker_reason: eventMeta && eventMeta.blocker_reason ? eventMeta.blocker_reason : null,
      blocker_source: eventMeta && eventMeta.blocker_source ? eventMeta.blocker_source : null,
      remediation: eventMeta && eventMeta.remediation ? eventMeta.remediation : null,
    });
  }

  for (const cardsInColumn of Object.values(state.columns)) {
    cardsInColumn.sort((a, b) => a.id.localeCompare(b.id));
  }

  return state;
}

function computeCanonicalFingerprint(projectDir, statePath) {
  const requestsDir = path.join(projectDir, '.claude', 'collab', 'requests');
  const requestFiles = fs.existsSync(requestsDir)
    ? fs.readdirSync(requestsDir).filter((name) => name.endsWith('.md')).sort((a, b) => a.localeCompare(b))
    : [];

  const parts = [
    readTextIfExists(path.join(projectDir, 'TASKS.md')),
    readTextIfExists(statePath),
    readTextIfExists(path.join(projectDir, EVENTS_REL_PATH)),
  ];

  for (const requestFile of requestFiles) {
    parts.push(readTextIfExists(path.join(requestsDir, requestFile)));
  }

  return sha256(parts);
}

function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function shouldForceDerivedWriteFailure() {
  const raw = String(process.env.WHITEBOX_FORCE_DERIVED_WRITE_FAILURE || '').trim();
  return raw === '1' || raw === 'true' || raw === 'board-state';
}

function writeBoardArtifacts(projectDir, board) {
  if (shouldForceDerivedWriteFailure()) {
    throw new Error('forced derived write failure');
  }

  const boardPath = path.join(projectDir, BOARD_STATE_REL_PATH);
  const snapshotPath = path.join(projectDir, BOARD_SNAPSHOT_REL_PATH);
  const cardCounts = Object.fromEntries(Object.entries(board.columns).map(([column, cards]) => [column, cards.length]));

  writeJsonAtomic(boardPath, board);
  writeJsonAtomic(snapshotPath, {
    schema_version: BOARD_SCHEMA_VERSION,
    artifact: BOARD_STATE_REL_PATH,
    generated_at: board.generated_at,
    derived_from: board.derived_from,
    card_counts: cardCounts,
  });
}

function activeStaleMarkers(projectDir, options = {}) {
  const artifactToClear = options.artifactToClear || null;
  return readMarkers(projectDir).filter((entry) => {
    if (!entry || entry.cleared_by) return false;
    if (artifactToClear && entry.artifact === artifactToClear) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs();
  const p = opts.projectDir;

  const tasksMd = parseTasks(path.join(p, 'TASKS.md'));
  // Support both legacy (.claude/orchestrate-state.json) and new (.claude/orchestrate/orchestrate-state.json) paths
  const statePath = fs.existsSync(path.join(p, '.claude', 'orchestrate', 'orchestrate-state.json'))
    ? path.join(p, '.claude', 'orchestrate', 'orchestrate-state.json')
    : path.join(p, '.claude', 'orchestrate-state.json');
  const orchestrateState = parseOrchestrateState(statePath);
  const reqs = parseReqFiles(path.join(p, '.claude', 'collab', 'requests'));
  const eventContext = parseEventContext(p);
  const fingerprint = computeCanonicalFingerprint(p, statePath);
  const staleMarkers = opts.dryRun
    ? activeStaleMarkers(p)
    : activeStaleMarkers(p, { artifactToClear: BOARD_STATE_REL_PATH });

  const cards = mergeSources(tasksMd, orchestrateState, reqs);
  const board = buildBoard(cards, {
    eventContext,
    fingerprint,
    staleMarkers,
  });

  if (!opts.dryRun) {
    try {
      writeBoardArtifacts(p, board);
      clearStaleMarker({
        projectDir: p,
        artifact: BOARD_STATE_REL_PATH,
        clearedBy: 'board-builder',
      });
      try {
        refreshWhiteboxSummary({ projectDir: p });
      } catch (summaryError) {
        process.stderr.write(`whitebox-summary refresh failed: ${summaryError.message}\n`);
      }
      process.stderr.write(`board-state.json written (${cards.length} cards)\n`);
    } catch (error) {
      setStaleMarker({
        projectDir: p,
        artifact: BOARD_STATE_REL_PATH,
        schemaVersion: BOARD_SCHEMA_VERSION,
        reason: `derived write failure: ${error.message}`,
      });
      process.stderr.write(`board-state.json write failed: ${error.message}\n`);
      process.exitCode = 1;
      if (!opts.json) return;
    }
  }

  if (opts.json || opts.dryRun) {
    process.stdout.write(JSON.stringify(board, null, 2) + '\n');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseTasks,
  parseOrchestrateState,
  parseReqFiles,
  mergeSources,
  buildBoard,
  computeCanonicalFingerprint,
  parseEventContext,
  writeBoardArtifacts,
  activeStaleMarkers,
  COLUMN_MAP,
};
