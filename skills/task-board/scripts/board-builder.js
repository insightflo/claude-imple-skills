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
const { buildControlState } = require('../../whitebox/scripts/whitebox-control-state');
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
  decision_pending: 'Blocked',
  decision_resolved: 'Done',
  decision_rejected: 'Done',
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
    })).filter((t) => !/^\d+$/.test(String(t.id || '')));
  } catch { return []; }
}

function parseDecisions(statePath) {
  if (!fs.existsSync(statePath)) return [];
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!Array.isArray(state.decisions)) return [];
    return state.decisions.map((decision) => ({
      id: decision.id,
      title: decision.title || decision.id,
      status: decision.status === 'resolved'
        ? 'decision_resolved'
        : decision.status === 'rejected'
          ? 'decision_rejected'
          : 'decision_pending',
      agent: null,
      source: 'decision',
      decision_type: decision.type || null,
      task_id: decision.task_id || null,
      allowed_actions: Array.isArray(decision.allowed_actions) ? decision.allowed_actions : [],
      reason: decision.reason || null,
    }));
  } catch {
    return [];
  }
}

function parseInterventionQueue(projectDir) {
  const controlState = buildControlState(projectDir);
  const pending = Array.isArray(controlState.pending_approvals) ? controlState.pending_approvals : [];
  return pending.map((gate) => ({
    id: gate.gate_id,
    title: gate.gate_name || gate.task_id || gate.gate_id,
    status: 'decision_pending',
    agent: null,
    source: 'control-state',
    decision_type: gate.trigger_type || 'user_confirmation',
    task_id: gate.task_id || null,
    allowed_actions: Array.isArray(gate.choices) && gate.choices.length > 0 ? gate.choices : ['approve', 'reject'],
    reason: gate.trigger_reason || gate.preview || `Operator input required for ${gate.gate_name || gate.gate_id}`,
    recommendation: gate.recommendation || null,
    trigger_type: gate.trigger_type || null,
  }));
}

function sanitizeDecisionIdPart(value) {
  return String(value || 'unknown')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
}

function extractTaskId(value) {
  const input = String(value || '').trim();
  if (!input) return null;
  const match = input.match(/^([A-Z0-9]+-T[0-9]+|T[0-9]+\.[0-9A-Z]+)$/i);
  return match ? match[1] : null;
}

function inferHookTriggerType(data = {}) {
  const riskLevel = String(data.risk_level || '').toUpperCase();
  const severity = String(data.severity || '').toLowerCase();
  if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH' || severity === 'critical' || severity === 'error') {
    return 'risk_acknowledgement';
  }
  return 'user_confirmation';
}

function defaultHookRecommendation(triggerType, hookName) {
  if (triggerType === 'risk_acknowledgement') {
    return 'Review the hook findings and accept the risk only if you want to proceed without changing the plan.';
  }
  return `Review the ${hookName || 'hook'} findings and decide whether to proceed after addressing them.`;
}

function parseHookInterventions(projectDir) {
  const parsed = readEvents({ projectDir, file: EVENTS_REL_PATH, tolerateTrailingPartialLine: true });
  const latestByKey = new Map();

  for (const event of parsed.events) {
    if (!event || event.type !== 'hook.decision') continue;
    const data = event.data && typeof event.data === 'object' ? event.data : {};
    const hookName = String(data.hook || event.producer || 'hook').trim() || 'hook';
    const correlationId = String(event.correlation_id || '').trim() || 'unknown';
    const key = `${hookName}:${correlationId}`;
    const current = latestByKey.get(key);
    if (!current || String(current.ts || '') <= String(event.ts || '')) {
      latestByKey.set(key, event);
    }
  }

  return Array.from(latestByKey.values()).flatMap((event) => {
    const data = event.data && typeof event.data === 'object' ? event.data : {};
    const decision = String(data.decision || '').toLowerCase();
    if (!decision || decision === 'allow' || decision === 'skip') return [];

    const hookName = String(data.hook || event.producer || 'hook').trim() || 'hook';
    const correlationId = String(event.correlation_id || '').trim() || 'unknown';
    const triggerType = inferHookTriggerType(data);
    const taskId = extractTaskId(correlationId);

    return [{
      id: `hook-${sanitizeDecisionIdPart(hookName)}-${sanitizeDecisionIdPart(correlationId)}`,
      title: `${hookName} intervention`,
      status: 'decision_pending',
      agent: null,
      source: 'hook-event',
      decision_type: triggerType,
      task_id: taskId,
      allowed_actions: [],
      reason: data.summary || `${hookName} ${decision}`,
      recommendation: data.remediation || defaultHookRecommendation(triggerType, hookName),
      trigger_type: triggerType,
    }];
  });
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

function parseFrontmatterDocument(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?(?:\n|$)([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: content || '' };
  }
  return {
    meta: parseFrontmatter(content),
    body: match[2] || '',
  }
}

function parseMarkdownSections(body) {
  const sections = {};
  let current = null;
  for (const rawLine of String(body || '').split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      current = heading[1].trim().toLowerCase();
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  return Object.fromEntries(Object.entries(sections).map(([key, lines]) => [key, lines.join('\n').trim()]));
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

function parseDecisionFiles(decisionsDir, projectDir) {
  if (!fs.existsSync(decisionsDir)) return [];
  return fs.readdirSync(decisionsDir)
    .filter((f) => f.match(/^DEC-.*\.md$/))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => {
      try {
        const filePath = path.join(decisionsDir, f);
        const content = fs.readFileSync(filePath, 'utf8');
        const { meta, body } = parseFrontmatterDocument(content);
        const sections = parseMarkdownSections(body);
        return {
          id: (meta.id || path.basename(f, '.md')).trim(),
          ref_req: String(meta.ref_req || '').trim(),
          status: String(meta.status || '').trim().toUpperCase() || 'FINAL',
          summary: sections['decision summary'] || '',
          conflict: sections['context & conflict'] || '',
          required_actions: sections['required actions'] || '',
          file_path: path.relative(projectDir, filePath).replace(/\\/g, '/'),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function indexDecisionsByReq(decisions) {
  const latestByReq = new Map();
  for (const decision of decisions) {
    if (!decision || !decision.ref_req) continue;
    const current = latestByReq.get(decision.ref_req);
    if (!current || String(current.id || '') <= String(decision.id || '')) {
      latestByReq.set(decision.ref_req, decision);
    }
  }
  return latestByReq;
}

function parseReqConflictInterventions(reqs, decisionsByReq = new Map()) {
  return reqs
    .filter((req) => req && req.status === 'ESCALATED')
    .map((req) => {
      const linkedDecision = decisionsByReq.get(req.id) || null;
      const decisionSummary = linkedDecision && linkedDecision.summary
        ? linkedDecision.summary
        : null;
      const decisionActions = linkedDecision && linkedDecision.required_actions
        ? linkedDecision.required_actions.replace(/\n+/g, ' ').trim()
        : null;
      return {
        id: `req-conflict-${sanitizeDecisionIdPart(req.id)}`,
        title: `REQ conflict ${req.id}`,
        status: 'decision_pending',
        agent: req.agent || null,
        source: 'req-conflict',
        decision_type: 'agent_conflict',
        req_id: req.id,
        allowed_actions: [],
        reason: linkedDecision
          ? `Linked ruling ${linkedDecision.id}: ${decisionSummary || 'Final mediation is available.'}`
          : 'Request escalated for mediation.',
        recommendation: linkedDecision
          ? (decisionActions || `Apply ${linkedDecision.id} and update the request status when the ruling is complete.`)
          : 'Review the escalated request and create or apply a DEC ruling before continuing.',
        trigger_type: 'agent_conflict',
        decision_id: linkedDecision ? linkedDecision.id : null,
        decision_path: linkedDecision ? linkedDecision.file_path : null,
        decision_status: linkedDecision ? linkedDecision.status : null,
      };
    });
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

function mergeSources(tasksMd, orchestrateState, reqs, decisions) {
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

  for (const decision of decisions) byId.set(decision.id, decision);

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
    decisions: [],
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
      ...(card.task_id ? { task_id: card.task_id } : {}),
      ...(card.req_id ? { req_id: card.req_id } : {}),
      ...(card.decision_id ? { decision_id: card.decision_id } : {}),
      ...(card.decision_path ? { decision_path: card.decision_path } : {}),
      ...(card.decision_status ? { decision_status: card.decision_status } : {}),
      ...(card.decision_type ? { decision_type: card.decision_type } : {}),
      ...(card.reason ? { reason: card.reason } : {}),
      ...(card.recommendation ? { recommendation: card.recommendation } : {}),
      ...(card.trigger_type ? { trigger_type: card.trigger_type } : {}),
      ...(Array.isArray(card.allowed_actions) && card.allowed_actions.length > 0 ? { allowed_actions: card.allowed_actions } : {}),
      run_id: eventMeta && eventMeta.run_id ? eventMeta.run_id : null,
      last_event_type: eventMeta && eventMeta.last_event_type ? eventMeta.last_event_type : null,
      last_event_ts: eventMeta && eventMeta.last_event_ts ? eventMeta.last_event_ts : null,
      blocker_reason: eventMeta && eventMeta.blocker_reason ? eventMeta.blocker_reason : null,
      blocker_source: eventMeta && eventMeta.blocker_source ? eventMeta.blocker_source : null,
      remediation: eventMeta && eventMeta.remediation ? eventMeta.remediation : null,
    });

    if (card.decision_type || (Array.isArray(card.allowed_actions) && card.allowed_actions.length > 0)) {
      state.decisions.push({
        id: card.id,
        title: card.title,
        status: card.status,
        task_id: card.task_id || null,
        req_id: card.req_id || null,
        decision_id: card.decision_id || null,
        decision_path: card.decision_path || null,
        decision_status: card.decision_status || null,
        decision_type: card.decision_type || null,
        allowed_actions: Array.isArray(card.allowed_actions) ? card.allowed_actions : [],
        reason: card.reason || null,
        recommendation: card.recommendation || null,
        trigger_type: card.trigger_type || null,
      });
    }
  }

  for (const cardsInColumn of Object.values(state.columns)) {
    cardsInColumn.sort((a, b) => a.id.localeCompare(b.id));
  }

  return state;
}

function computeCanonicalFingerprint(projectDir, statePath) {
  const requestsDir = path.join(projectDir, '.claude', 'collab', 'requests');
  const decisionsDir = path.join(projectDir, '.claude', 'collab', 'decisions');
  const requestFiles = fs.existsSync(requestsDir)
    ? fs.readdirSync(requestsDir).filter((name) => name.endsWith('.md')).sort((a, b) => a.localeCompare(b))
    : [];
  const decisionFiles = fs.existsSync(decisionsDir)
    ? fs.readdirSync(decisionsDir).filter((name) => name.endsWith('.md')).sort((a, b) => a.localeCompare(b))
    : [];

  const parts = [
    readTextIfExists(path.join(projectDir, 'TASKS.md')),
    readTextIfExists(statePath),
    readTextIfExists(path.join(projectDir, EVENTS_REL_PATH)),
  ];

  for (const requestFile of requestFiles) {
    parts.push(readTextIfExists(path.join(requestsDir, requestFile)));
  }

  for (const decisionFile of decisionFiles) {
    parts.push(readTextIfExists(path.join(decisionsDir, decisionFile)));
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
  const linkedDecisions = parseDecisionFiles(path.join(p, '.claude', 'collab', 'decisions'), p);
  const reqInterventions = parseReqConflictInterventions(reqs, indexDecisionsByReq(linkedDecisions));
  const decisions = parseDecisions(statePath);
  const interventions = parseInterventionQueue(p);
  const hookInterventions = parseHookInterventions(p);
  const eventContext = parseEventContext(p);
  const fingerprint = computeCanonicalFingerprint(p, statePath);
  const staleMarkers = opts.dryRun
    ? activeStaleMarkers(p)
    : activeStaleMarkers(p, { artifactToClear: BOARD_STATE_REL_PATH });

  const cards = mergeSources(tasksMd, orchestrateState, reqs, decisions.concat(interventions, hookInterventions, reqInterventions));
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
  parseDecisions,
  mergeSources,
  buildBoard,
  computeCanonicalFingerprint,
  parseEventContext,
  writeBoardArtifacts,
  activeStaleMarkers,
  COLUMN_MAP,
};
