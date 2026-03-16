#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const { ensureWhiteboxArtifacts } = require('./whitebox-refresh');
const { buildExplain } = require('./whitebox-explain');
const { applyCommand } = require('./whitebox-control');
const { readEvents } = require('../../../project-team/scripts/lib/whitebox-events');

const DASHBOARD_STATE_REL_PATH = '.claude/collab/whitebox-dashboard.json';
const BOARD_STATE_REL_PATH = '.claude/collab/board-state.json';
const SUMMARY_REL_PATH = '.claude/collab/whitebox-summary.json';
const CONTROL_STATE_REL_PATH = '.claude/collab/control-state.json';
const LAUNCHER_STATE_REL_PATH = '.claude/collab/launcher-state.json';
const EVENTS_REL_PATH = '.claude/collab/events.ndjson';

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    command: '',
    projectDir: process.cwd(),
    host: '127.0.0.1',
    port: Number.parseInt(process.env.WHITEBOX_DASHBOARD_PORT || '0', 10) || 0,
    json: false,
    noBrowser: false,
    reveal: false,
    timeoutMs: 5000,
  };

  for (const arg of argv) {
    if (!options.command && !arg.startsWith('--')) {
      options.command = arg;
      continue;
    }
    if (arg.startsWith('--project-dir=')) options.projectDir = path.resolve(arg.slice('--project-dir='.length));
    else if (arg.startsWith('--host=')) options.host = arg.slice('--host='.length) || options.host;
    else if (arg.startsWith('--port=')) options.port = Number.parseInt(arg.slice('--port='.length), 10) || 0;
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = Number.parseInt(arg.slice('--timeout-ms='.length), 10) || options.timeoutMs;
    else if (arg === '--json') options.json = true;
    else if (arg === '--no-browser') options.noBrowser = true;
    else if (arg === '--reveal') options.reveal = true;
  }

  if (!options.command) options.command = 'open';
  return options;
}

function dashboardStatePath(projectDir) {
  return path.join(projectDir, DASHBOARD_STATE_REL_PATH);
}

function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function deleteDashboardState(projectDir) {
  const filePath = dashboardStatePath(projectDir);
  const current = readJsonIfExists(filePath, null);
  if (!current || current.pid !== process.pid) return;
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function dashboardRuntime(projectDir, server) {
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : null;
  const host = address && typeof address === 'object' ? address.address : '127.0.0.1';
  return {
    pid: process.pid,
    host,
    port,
    url: `http://${host}:${port}/`,
    api_url: `http://${host}:${port}/api/state`,
    started_at: new Date().toISOString(),
    project_dir: projectDir,
  };
}

function healthUrl(state) {
  return state && state.url ? new URL('/api/health', state.url).toString() : null;
}

async function isDashboardHealthy(state) {
  const url = healthUrl(state);
  if (!url) return false;
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload && payload.ok === true;
  } catch {
    return false;
  }
}

function readBoardState(projectDir) {
  return readJsonIfExists(path.join(projectDir, BOARD_STATE_REL_PATH), {
    columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] },
    decisions: [],
  });
}

function readSummary(projectDir) {
  return readJsonIfExists(path.join(projectDir, SUMMARY_REL_PATH), null);
}

function readControlState(projectDir) {
  return readJsonIfExists(path.join(projectDir, CONTROL_STATE_REL_PATH), {
    pending_approval_count: 0,
    pending_approvals: [],
    resolved_approvals: [],
  });
}

function classifyDecision(decision = {}) {
  if (decision.decision_class) return decision.decision_class;
  if (decision.source === 'req-conflict' || decision.decision_type === 'agent_conflict') return 'conflict';
  if (decision.source === 'hook-event') return 'validation';
  return 'decision';
}

function readLauncherState(projectDir) {
  return readJsonIfExists(path.join(projectDir, LAUNCHER_STATE_REL_PATH), null);
}

function readEventLog(projectDir) {
  const parsed = readEvents({ projectDir, file: EVENTS_REL_PATH, tolerateTrailingPartialLine: true });
  return Array.isArray(parsed.events) ? parsed.events : [];
}

function latestByKey(events, keyFn) {
  const index = new Map();
  for (const event of events) {
    const key = keyFn(event);
    if (!key) continue;
    const current = index.get(key);
    if (!current || String(current.ts || '') <= String(event.ts || '')) {
      index.set(key, event);
    }
  }
  return index;
}

function eventSummary(event) {
  if (!event) {
    return { label: 'no activity', detail: 'No matching event observed yet.', at: null };
  }

  const data = event && event.data && typeof event.data === 'object' ? event.data : {};
  if (event.type === 'hook.decision') {
    return {
      label: data.hook || event.producer || event.type,
      detail: data.summary || `${data.decision || 'decision'} from ${data.hook || event.producer || 'hook'}`,
      at: event.ts || null,
    };
  }

  if (event.type === 'orchestrate.task.status_changed') {
    return {
      label: 'task status',
      detail: `${data.from || 'unknown'} -> ${data.to || 'unknown'}`,
      at: event.ts || null,
    };
  }

  if (event.type === 'approval_required' || event.type === 'execution_paused' || event.type === 'execution_resumed') {
    return {
      label: event.type.replace(/_/g, ' '),
      detail: data.gate_id ? `gate ${data.gate_id}` : event.type,
      at: event.ts || null,
    };
  }

  if (event.type && event.type.startsWith('supervisor.session.')) {
    return {
      label: event.type.replace('supervisor.session.', ''),
      detail: data.command ? `${data.command}${Array.isArray(data.args) && data.args.length ? ` ${data.args.join(' ')}` : ''}` : 'supervisor lifecycle event',
      at: event.ts || null,
    };
  }

  return {
    label: event.type || 'event',
    detail: data.reason || data.summary || data.message || event.producer || 'whitebox event',
    at: event.ts || null,
  };
}

function buildRunningSessions(board, launcher, events) {
  const inProgress = Array.isArray(board.columns && board.columns['In Progress']) ? board.columns['In Progress'] : [];
  const taskEvents = latestByKey(events, (event) => {
    const data = event && event.data && typeof event.data === 'object' ? event.data : {};
    return data.task_id ? `task:${data.task_id}` : null;
  });

  const sessions = inProgress.map((card) => {
    const event = taskEvents.get(`task:${card.id}`) || null;
    const summary = eventSummary(event);
    return {
      id: card.id,
      title: card.title || card.task_title || card.id,
      owner: card.agent || null,
      run_id: card.run_id || launcher && launcher.session_id || null,
      status: 'running',
      session_id: launcher && launcher.session_id || card.run_id || null,
      executor: launcher && launcher.command ? launcher.command.program : null,
      supervisor_status: launcher && launcher.status ? launcher.status : null,
      last_event: summary.label,
      last_message: summary.detail,
      last_event_at: summary.at,
    };
  });

  if (sessions.length > 0 || !launcher) return sessions;

  return [{
    id: launcher.session_id,
    title: 'Whitebox supervisor session',
    owner: 'whitebox-launcher',
    run_id: launcher.session_id,
    status: launcher.status || 'running',
    session_id: launcher.session_id,
    executor: launcher.command && launcher.command.program ? launcher.command.program : null,
    supervisor_status: launcher.status || null,
    last_event: launcher.status || 'starting',
    last_message: launcher.command && launcher.command.program
      ? `${launcher.command.program}${Array.isArray(launcher.command.args) && launcher.command.args.length ? ` ${launcher.command.args.join(' ')}` : ''}`
      : 'launcher session',
    last_event_at: launcher.finished_at || launcher.started_at || null,
  }];
}

function buildInterventionQueue(pendingApprovals, readOnlyDecisions, blockedCards) {
  const approvals = pendingApprovals.map((approval) => ({
    kind: 'approval',
    id: approval.gate_id,
    title: approval.gate_name || approval.gate_id,
    task_id: approval.task_id || null,
    badge: approval.trigger_type || 'user_confirmation',
    reason: approval.trigger_reason || approval.preview || approval.gate_id,
    recommendation: approval.recommendation || null,
    actionable: true,
    gate_id: approval.gate_id,
  }));

  const decisions = readOnlyDecisions.map((decision) => ({
    kind: 'decision',
    id: decision.id,
    title: decision.title || decision.id,
    task_id: decision.task_id || decision.req_id || null,
    badge: decision.decision_class || 'decision',
    reason: decision.reason || 'Pending decision',
    recommendation: decision.recommendation || null,
    actionable: false,
    explain: decision.task_id ? { taskId: decision.task_id } : decision.req_id ? { reqId: decision.req_id } : { gate: decision.id },
  }));

  const blocked = blockedCards.map((card) => ({
    kind: 'blocked',
    id: card.id,
    title: card.title || card.id,
    task_id: card.id,
    badge: 'blocked',
    reason: card.blocker_reason || 'Blocked task',
    recommendation: card.remediation || null,
    actionable: false,
    explain: { taskId: card.id },
  }));

  return [...approvals, ...decisions, ...blocked];
}

function buildRecentEvents(events) {
  return [...events]
    .filter((event) => event && typeof event.type === 'string')
    .filter((event) => (
      event.type.startsWith('supervisor.session.')
      || event.type === 'approval_required'
      || event.type === 'execution_paused'
      || event.type === 'execution_resumed'
      || event.type === 'hook.decision'
      || event.type === 'orchestrate.task.status_changed'
    ))
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))
    .slice(0, 12)
    .map((event) => {
      const summary = eventSummary(event);
      return {
        type: event.type,
        producer: event.producer || null,
        at: event.ts || null,
        label: summary.label,
        detail: summary.detail,
      };
    });
}

function buildRuntimeSummary(projectDir, rebuild, summary, launcher, events) {
  return {
    project_dir: projectDir,
    gate_status: summary && summary.gate_status ? summary.gate_status : 'unknown',
    rebuild,
    launcher: launcher ? {
      session_id: launcher.session_id || null,
      status: launcher.status || null,
      command: launcher.command || null,
      started_at: launcher.started_at || null,
      finished_at: launcher.finished_at || null,
      supervisor_pid: launcher.supervisor_pid || null,
      executor_pid: launcher.executor_pid || null,
    } : null,
    event_count: Array.isArray(events) ? events.length : 0,
  };
}

function collectDashboardState(projectDir, options = {}) {
  const rebuild = ensureWhiteboxArtifacts({ projectDir, force: Boolean(options.forceRefresh) });
  const summary = readSummary(projectDir) || readJsonIfExists(path.join(projectDir, SUMMARY_REL_PATH), {});
  const board = readBoardState(projectDir);
  const controlState = readControlState(projectDir);
  const launcher = readLauncherState(projectDir);
  const events = readEventLog(projectDir);
  const pendingApprovals = Array.isArray(controlState.pending_approvals) ? controlState.pending_approvals : [];
  const blockedCards = Array.isArray(board.columns && board.columns.Blocked) ? board.columns.Blocked : [];
  const readOnlyDecisions = Array.isArray(board.decisions)
    ? board.decisions.filter((entry) => entry && entry.status === 'decision_pending' && (!Array.isArray(entry.allowed_actions) || entry.allowed_actions.length === 0))
      .map((entry) => ({
        id: entry.id,
        title: entry.title || entry.id,
        task_id: entry.task_id || null,
        req_id: entry.req_id || null,
        decision_class: classifyDecision(entry),
        trigger_type: entry.trigger_type || entry.decision_type || null,
        reason: entry.reason || null,
        recommendation: entry.recommendation || null,
        decision_id: entry.decision_id || null,
        decision_status: entry.decision_status || null,
        decision_path: entry.decision_path || null,
      }))
    : [];
  const sessions = buildRunningSessions(board, launcher, events);
  const interventionQueue = buildInterventionQueue(pendingApprovals, readOnlyDecisions, blockedCards);
  const recentEvents = buildRecentEvents(events);
  const runtime = buildRuntimeSummary(projectDir, rebuild, summary, launcher, events);

  return {
    ok: rebuild.ok,
    generated_at: new Date().toISOString(),
    project_dir: projectDir,
    rebuild,
    summary,
    board,
    control_state: controlState,
    launcher,
    approvals: pendingApprovals,
    read_only_decisions: readOnlyDecisions,
    sessions,
    intervention_queue: interventionQueue,
    recent_events: recentEvents,
    runtime,
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendHtml(response, html) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk.toString('utf8');
      if (body.length > 1024 * 1024) {
        reject(new Error('request_too_large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function buildDashboardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Whitebox Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --page: #f7f7f8;
      --page-soft: #fbfbfc;
      --card: rgba(255,255,255,0.94);
      --card-muted: #f3f4f6;
      --ink: #202123;
      --muted: #6e6e80;
      --line: #ececf1;
      --line-strong: #d9d9e3;
      --accent: #10a37f;
      --accent-ink: #0f513f;
      --accent-soft: #e8faf4;
      --warn: #b45309;
      --warn-soft: #fff7ed;
      --danger: #b42318;
      --danger-soft: #fef3f2;
      --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.05);
      --shadow-lg: 0 20px 50px rgba(15, 23, 42, 0.08);
    }
    * { box-sizing: border-box; }
    html { background: var(--page); }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top, rgba(16, 163, 127, 0.12) 0%, rgba(16, 163, 127, 0) 30%),
        linear-gradient(180deg, var(--page-soft) 0%, var(--page) 24%, #f3f4f6 100%);
      color: var(--ink);
      font-family: "Sohne", "SF Pro Text", "Helvetica Neue", "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    button {
      appearance: none;
      border: 1px solid var(--accent);
      background: var(--accent);
      color: white;
      border-radius: 999px;
      padding: 0.72rem 1.08rem;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      letter-spacing: -0.01em;
      box-shadow: 0 8px 20px rgba(16, 163, 127, 0.18);
      transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease, border-color 140ms ease;
    }
    button:hover { transform: translateY(-1px); box-shadow: 0 12px 24px rgba(16, 163, 127, 0.22); }
    button.secondary { background: var(--card); color: var(--ink); border-color: var(--line-strong); box-shadow: var(--shadow-sm); }
    button.danger { background: white; color: var(--danger); border-color: rgba(180, 35, 24, 0.18); box-shadow: none; }
    button.subtle { background: rgba(255,255,255,0.72); color: var(--muted); border-color: var(--line-strong); box-shadow: none; padding: 0.42rem 0.78rem; font-size: 0.84rem; }
    code, pre, .mono { font-family: "Sohne Mono", "SFMono-Regular", "SF Mono", Consolas, monospace; }
    .mono, .numeric { font-variant-numeric: tabular-nums slashed-zero; font-feature-settings: "tnum" 1, "zero" 1; }
    .app-shell { max-width: 1320px; margin: 0 auto; padding: 2rem 1rem 3.5rem; }
    .dashboard-shell { display: grid; gap: 1rem; }
    .hero-card, .section-card, .metric-card { background: var(--card); border: 1px solid rgba(217,217,227,0.82); box-shadow: var(--shadow-sm); backdrop-filter: blur(18px); }
    .hero-card { border-radius: 28px; padding: clamp(1.25rem, 3vw, 2rem); box-shadow: var(--shadow-lg); }
    .hero-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1.25rem; align-items: start; }
    .eyebrow { margin: 0; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.76rem; font-weight: 600; }
    .hero-title { margin: 0.35rem 0 0; font-size: clamp(2rem, 4vw, 3.3rem); line-height: 0.98; letter-spacing: -0.04em; }
    .hero-copy { margin: 0.75rem 0 0; max-width: 46rem; color: var(--muted); font-size: 1rem; }
    .hero-actions { margin-top: 1.1rem; display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .status-stack { display: grid; justify-items: end; align-content: start; gap: 0.65rem; min-width: min(100%, 12rem); }
    .status-badge { display: inline-flex; align-items: center; gap: 0.45rem; min-height: 2rem; padding: 0.35rem 0.78rem; border-radius: 999px; border: 1px solid var(--line); background: var(--card-muted); color: var(--muted); font-size: 0.82rem; font-weight: 700; letter-spacing: 0.01em; white-space: nowrap; }
    .status-badge-dot { width: 0.52rem; height: 0.52rem; border-radius: 999px; background: currentColor; opacity: 0.9; }
    .status-badge-live { background: var(--accent-soft); border-color: rgba(16,163,127,0.18); color: var(--accent-ink); }
    .status-badge-warning { background: var(--warn-soft); border-color: rgba(180,83,9,0.18); color: var(--warn); }
    .status-badge-danger { background: var(--danger-soft); border-color: rgba(180,35,24,0.18); color: var(--danger); }
    .metric-grid { display: grid; gap: 0.85rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .metric-card { border-radius: 22px; padding: 1rem 1.05rem 1.1rem; }
    .metric-label { margin: 0; color: var(--muted); font-size: 0.82rem; font-weight: 600; }
    .metric-value { margin: 0.35rem 0 0; font-size: clamp(1.6rem, 2vw, 2.1rem); line-height: 1.05; letter-spacing: -0.03em; }
    .metric-detail { margin: 0.45rem 0 0; color: var(--muted); font-size: 0.88rem; }
    .main-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.95fr); gap: 1rem; }
    .stack { display: grid; gap: 1rem; }
    .section-card { border-radius: 24px; padding: 1.15rem; }
    .section-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .section-title { margin: 0; font-size: 1.08rem; line-height: 1.2; letter-spacing: -0.02em; }
    .section-copy { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.94rem; }
    .table-wrap { overflow-x: auto; margin-top: 1rem; }
    .data-table { width: 100%; min-width: 760px; border-collapse: collapse; }
    .data-table th { padding: 0 0.5rem 0.75rem 0; text-align: left; color: var(--muted); font-size: 0.78rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .data-table td { padding: 0.95rem 0.5rem 0.95rem 0; border-top: 1px solid var(--line); vertical-align: top; font-size: 0.94rem; }
    .issue-stack, .detail-stack, .queue-stack { display: grid; gap: 0.22rem; }
    .issue-id { font-weight: 700; letter-spacing: -0.01em; }
    .muted { color: var(--muted); }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 0.3rem 0.68rem; font-size: 0.78rem; border: 1px solid var(--line); background: var(--card-muted); color: var(--muted); width: fit-content; }
    .pill.approval, .pill.running, .pill.live, .pill.user_confirmation { background: var(--accent-soft); border-color: rgba(16,163,127,0.18); color: var(--accent-ink); }
    .pill.blocked, .pill.conflict, .pill.danger, .pill.failed, .pill.agent_conflict { background: var(--danger-soft); border-color: rgba(180,35,24,0.18); color: var(--danger); }
    .pill.validation, .pill.warning, .pill.risk_acknowledgement, .pill.stale, .pill.decision { background: var(--warn-soft); border-color: rgba(180,83,9,0.18); color: var(--warn); }
    .empty-state { margin: 1rem 0 0; color: var(--muted); font-style: italic; }
    .queue-list { display: grid; gap: 0.75rem; margin-top: 1rem; }
    .queue-card { border: 1px solid var(--line); border-radius: 18px; background: rgba(255,255,255,0.78); padding: 0.95rem; }
    .queue-head { display: flex; justify-content: space-between; gap: 0.75rem; align-items: flex-start; }
    .queue-actions { display: flex; flex-wrap: wrap; gap: 0.55rem; margin-top: 0.85rem; }
    .columns { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.85rem; margin-top: 1rem; }
    .column { background: rgba(255,255,255,0.58); border: 1px solid var(--line); border-radius: 18px; min-height: 180px; padding: 0.85rem; }
    .column h3 { margin: 0 0 0.7rem; font-size: 0.82rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
    .board-card { background: white; border: 1px solid rgba(62,47,38,0.08); border-radius: 14px; padding: 0.8rem; margin-bottom: 0.65rem; box-shadow: 0 10px 20px rgba(48,38,29,0.06); }
    .board-card:last-child { margin-bottom: 0; }
    .board-card .title { font-weight: 700; margin-bottom: 0.28rem; }
    .board-card .meta { font-size: 0.82rem; color: var(--muted); }
    .runtime-card { background: #10131a; color: #dce7f7; border-radius: 18px; padding: 1rem; overflow: auto; max-height: 360px; }
    .runtime-card pre { margin: 0; white-space: pre-wrap; word-break: break-word; font: 13px/1.55 "Sohne Mono", "SFMono-Regular", monospace; }
    .status-line { color: var(--muted); font-size: 0.84rem; margin-top: 0.8rem; }
    .event-log { display: grid; gap: 0.7rem; margin-top: 1rem; }
    .event-item { border-top: 1px solid var(--line); padding-top: 0.7rem; }
    .event-item:first-child { border-top: 0; padding-top: 0; }
    @media (max-width: 1040px) {
      .main-grid, .hero-grid { grid-template-columns: 1fr; }
      .columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .status-stack { justify-items: start; }
    }
    @media (max-width: 720px) {
      .app-shell { padding-left: 0.85rem; padding-right: 0.85rem; }
      .columns { grid-template-columns: 1fr; }
      .data-table { min-width: 640px; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <section class="dashboard-shell">
      <header class="hero-card">
        <div class="hero-grid">
          <div>
            <p class="eyebrow">Whitebox supervisor</p>
            <h1 class="hero-title">Operations Dashboard</h1>
            <p class="hero-copy">Symphony-inspired control surface for execution visibility, intervention queues, and deterministic resume-or-abort decisions.</p>
            <div class="hero-actions">
              <button id="refreshButton">Refresh now</button>
              <button class="secondary" id="copyUrlButton">Copy API URL</button>
            </div>
          </div>
          <div class="status-stack" id="heroStatus"></div>
        </div>
      </header>

      <section class="metric-grid" id="stats"></section>

      <div class="main-grid">
        <div class="stack">
          <section class="section-card">
            <div class="section-header">
              <div>
                <h2 class="section-title">Running sessions</h2>
                <p class="section-copy">Current execution rows, owning session, and latest observed activity.</p>
              </div>
            </div>
            <div class="table-wrap" id="sessions"></div>
          </section>

          <section class="section-card">
            <div class="section-header">
              <div>
                <h2 class="section-title">Intervention queue</h2>
                <p class="section-copy">Approvals, decisions, and blocked tasks waiting on an operator action.</p>
              </div>
            </div>
            <div class="queue-list" id="interventionQueue"></div>
          </section>

          <section class="section-card">
            <div class="section-header">
              <div>
                <h2 class="section-title">Board</h2>
                <p class="section-copy">Task topology remains visible, but operational control stays above it.</p>
              </div>
            </div>
            <div class="columns" id="columns"></div>
          </section>
        </div>

        <div class="stack">
          <section class="section-card">
            <div class="section-header">
              <div>
                <h2 class="section-title">Explain</h2>
                <p class="section-copy">Why the run paused or blocked, plus evidence for the next decision.</p>
              </div>
            </div>
            <div class="runtime-card"><pre id="explain">Select a running row, queue item, or blocked task to inspect.</pre></div>
          </section>

          <section class="section-card">
            <div class="section-header">
              <div>
                <h2 class="section-title">Runtime</h2>
                <p class="section-copy">Supervisor session, rebuild health, and current control-plane snapshot.</p>
              </div>
            </div>
            <div class="runtime-card"><pre id="runtime"></pre></div>
            <p class="status-line" id="statusLine"></p>
          </section>

          <section class="section-card">
            <div class="section-header">
              <div>
                <h2 class="section-title">Recent events</h2>
                <p class="section-copy">Latest supervisor, gate, and task events affecting the run.</p>
              </div>
            </div>
            <div class="event-log" id="recentEvents"></div>
          </section>
        </div>
      </div>
    </section>
  </div>
  <script>
    const columnsOrder = ['Backlog', 'In Progress', 'Blocked', 'Done'];
    let latestState = null;
    let explainTarget = null;

    function text(value, fallback = 'none') {
      if (value === null || value === undefined || value === '') return fallback;
      return String(value);
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function pillClass(value) {
      const normalized = text(value, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
      return normalized ? 'pill ' + normalized : 'pill';
    }

    function renderHeroStatus(state) {
      const summary = state.summary || {};
      const launcher = state.launcher || {};
      const items = [];
      items.push('<span class="status-badge status-badge-live"><span class="status-badge-dot"></span>dashboard live</span>');
      const gateClass = summary.gate_status === 'approval_required' || summary.gate_status === 'blocked'
        ? 'status-badge-danger'
        : summary.gate_status === 'decision_pending' || summary.gate_status === 'stale'
          ? 'status-badge-warning'
          : 'status-badge-live';
      items.push('<span class="status-badge ' + gateClass + '"><span class="status-badge-dot"></span>' + escapeHtml(text(summary.gate_status, 'idle')) + '</span>');
      if (launcher.status) {
        const launcherClass = launcher.status === 'running' || launcher.status === 'completed'
          ? 'status-badge-live'
          : launcher.status === 'failed'
            ? 'status-badge-danger'
            : 'status-badge-warning';
        items.push('<span class="status-badge ' + launcherClass + '"><span class="status-badge-dot"></span>' + escapeHtml('launcher ' + launcher.status) + '</span>');
      }
      document.getElementById('heroStatus').innerHTML = items.join('');
    }

    function renderStats(state) {
      const summary = state.summary || {};
      const items = [
        ['Running', text((state.sessions || []).length, '0'), 'Active sessions currently visible to whitebox.'],
        ['Interventions', text((state.intervention_queue || []).length, '0'), 'Approvals, decisions, and blocked tasks waiting on action.'],
        ['Blocked', text(summary.blocked_count, '0'), 'Cards already in a blocked state.'],
        ['Approvals', text(summary.pending_approval_count, '0'), 'Explicit approve-or-reject gates.'],
        ['Decisions', text(summary.pending_decision_count, '0'), 'Read-only interventions that still require review.'],
        ['Next', text(summary.next_remediation_target && summary.next_remediation_target.type, 'none'), 'Most urgent next remediation target from the whitebox summary.'],
      ];
      document.getElementById('stats').innerHTML = items.map(([label, value, detail]) => (
        '<article class="metric-card">'
          + '<p class="metric-label">' + escapeHtml(label) + '</p>'
          + '<p class="metric-value numeric">' + escapeHtml(value) + '</p>'
          + '<p class="metric-detail">' + escapeHtml(detail) + '</p>'
        + '</article>'
      )).join('');
    }

    function renderSessions(state) {
      const sessions = Array.isArray(state.sessions) ? state.sessions : [];
      const target = document.getElementById('sessions');
      if (sessions.length === 0) {
        target.innerHTML = '<p class="empty-state">No active sessions.</p>';
        return;
      }
      target.innerHTML = '<table class="data-table"><thead><tr><th>Task</th><th>Status</th><th>Session</th><th>Executor</th><th>Latest activity</th></tr></thead><tbody>'
        + sessions.map((session) => (
          '<tr>'
            + '<td><div class="issue-stack"><span class="issue-id">' + escapeHtml(text(session.id)) + '</span><span class="muted">' + escapeHtml(text(session.title)) + '</span></div></td>'
            + '<td><span class="' + pillClass(session.status || session.supervisor_status || 'running') + '">' + escapeHtml(text(session.status || session.supervisor_status || 'running')) + '</span></td>'
            + '<td><div class="detail-stack"><span class="mono">' + escapeHtml(text(session.session_id, 'n/a')) + '</span><span class="muted">' + escapeHtml(text(session.run_id, 'n/a')) + '</span></div></td>'
            + '<td><div class="detail-stack"><span>' + escapeHtml(text(session.executor, 'n/a')) + '</span><span class="muted">' + escapeHtml(text(session.owner, 'unassigned')) + '</span></div></td>'
            + '<td><div class="detail-stack"><button class="subtle" data-explain="' + encodeURIComponent(JSON.stringify({ taskId: session.id })) + '">Explain</button><span>' + escapeHtml(text(session.last_message)) + '</span><span class="muted mono">' + escapeHtml(text(session.last_event_at, 'n/a')) + '</span></div></td>'
          + '</tr>'
        )).join('')
        + '</tbody></table>';
    }

    function renderColumns(state) {
      const board = state.board || { columns: {} };
      document.getElementById('columns').innerHTML = columnsOrder.map((column) => {
        const cards = Array.isArray(board.columns && board.columns[column]) ? board.columns[column] : [];
        const body = cards.length === 0 ? '<p class="empty-state">Nothing here.</p>' : cards.map((card) => (
          '<div class="board-card">'
            + '<div class="title">' + escapeHtml(text(card.id)) + '</div>'
            + '<div class="meta">' + escapeHtml(text(card.title || card.task_title || card.id)) + '</div>'
            + '<div class="meta">' + escapeHtml((card.agent ? 'owner: ' + card.agent : '') + (card.run_id ? (card.agent ? ' · ' : '') + 'run: ' + card.run_id : '')) + '</div>'
          + '</div>'
        )).join('');
        return '<section class="column"><h3>' + column + ' (' + cards.length + ')</h3>' + body + '</section>';
      }).join('');
    }

    function explainButton(label, params) {
      const encoded = encodeURIComponent(JSON.stringify(params));
      return '<button class="subtle" data-explain="' + encoded + '">' + label + '</button>';
    }

    function renderInterventionQueue(state) {
      const queue = Array.isArray(state.intervention_queue) ? state.intervention_queue : [];
      const target = document.getElementById('interventionQueue');
      if (queue.length === 0) {
        target.innerHTML = '<p class="empty-state">No interventions waiting right now.</p>';
        return;
      }
      target.innerHTML = queue.map((entry) => (
        '<article class="queue-card">'
          + '<div class="queue-head">'
            + '<div class="queue-stack"><strong>' + escapeHtml(text(entry.title || entry.id)) + '</strong><span class="muted">' + escapeHtml(text(entry.reason)) + '</span><span class="muted">target: ' + escapeHtml(text(entry.task_id || entry.id)) + '</span></div>'
            + '<span class="' + pillClass(entry.badge || entry.kind) + '">' + escapeHtml(text(entry.badge || entry.kind)) + '</span>'
          + '</div>'
          + (entry.recommendation ? '<p class="status-line">' + escapeHtml(entry.recommendation) + '</p>' : '')
          + '<div class="queue-actions">'
            + (entry.actionable ? '<button data-control="approve" data-gate-id="' + escapeHtml(entry.gate_id) + '">Approve</button><button class="danger" data-control="reject" data-gate-id="' + escapeHtml(entry.gate_id) + '">Reject</button>' : '')
            + explainButton('Explain', entry.explain || (entry.task_id ? { taskId: entry.task_id } : { gate: entry.id }))
          + '</div>'
        + '</article>'
      )).join('');
    }

    function renderRecentEvents(state) {
      const events = Array.isArray(state.recent_events) ? state.recent_events : [];
      const target = document.getElementById('recentEvents');
      if (events.length === 0) {
        target.innerHTML = '<p class="empty-state">No recent supervisor or gate events.</p>';
        return;
      }
      target.innerHTML = events.map((event) => (
        '<article class="event-item"><div class="queue-stack"><strong>' + escapeHtml(text(event.label || event.type)) + '</strong><span>' + escapeHtml(text(event.detail)) + '</span><span class="muted mono">' + escapeHtml(text(event.at, 'n/a')) + ' · ' + escapeHtml(text(event.producer, 'system')) + '</span></div></article>'
      )).join('');
    }

    function renderRuntime(state) {
      document.getElementById('runtime').textContent = JSON.stringify(state.runtime || {}, null, 2);
      document.getElementById('statusLine').textContent = 'Auto-refresh every 2s. Last update: ' + new Date().toLocaleTimeString();
    }

    async function loadState(force = false) {
      const response = await fetch('/api/state' + (force ? '?force=1' : ''), { cache: 'no-store' });
      latestState = await response.json();
      renderHeroStatus(latestState);
      renderStats(latestState);
      renderSessions(latestState);
      renderColumns(latestState);
      renderInterventionQueue(latestState);
      renderRecentEvents(latestState);
      renderRuntime(latestState);
      if (explainTarget) await loadExplain(explainTarget);
    }

    async function loadExplain(target) {
      explainTarget = target;
      const query = new URLSearchParams(target);
      const response = await fetch('/api/explain?' + query.toString(), { cache: 'no-store' });
      const payload = await response.json();
      document.getElementById('explain').textContent = JSON.stringify(payload, null, 2);
    }

    async function control(action, gateId) {
      const response = await fetch('/api/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, gateId }),
      });
      const payload = await response.json();
      document.getElementById('explain').textContent = JSON.stringify(payload, null, 2);
      await loadState(true);
    }

    document.addEventListener('click', async (event) => {
      const controlButton = event.target.closest('[data-control]');
      if (controlButton) {
        await control(controlButton.dataset.control, controlButton.dataset.gateId);
        return;
      }
      const explainButtonEl = event.target.closest('[data-explain]');
      if (explainButtonEl) {
        const params = JSON.parse(decodeURIComponent(explainButtonEl.dataset.explain));
        await loadExplain(params);
      }
    });

    document.getElementById('refreshButton').addEventListener('click', () => loadState(true));
    document.getElementById('copyUrlButton').addEventListener('click', async () => {
      await navigator.clipboard.writeText(window.location.href.replace(/\/$/, '') + '/api/state');
    });

    loadState(true).catch((error) => {
      document.getElementById('explain').textContent = error && error.message ? error.message : String(error);
    });
    window.setInterval(() => {
      loadState(false).catch(() => {});
    }, 2000);
  </script>
</body>
</html>`;
}

async function handleControl(projectDir, request, response) {
  try {
    const body = await readRequestBody(request);
    const payload = body ? JSON.parse(body) : {};
    const action = payload.action === 'reject' ? 'reject' : payload.action === 'approve' ? 'approve' : null;
    const gateId = payload.gateId ? String(payload.gateId) : '';
    if (!action || !gateId) {
      sendJson(response, 400, { ok: false, result: 'invalid_command', message: 'action and gateId are required' });
      return;
    }
    const result = await applyCommand(projectDir, gateId, action);
    collectDashboardState(projectDir, { forceRefresh: true });
    sendJson(response, result.ok ? 200 : 409, result);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    sendJson(response, 500, { ok: false, result: 'write_failed', message });
  }
}

function createDashboardServer(options = {}) {
  const projectDir = options.projectDir || process.cwd();
  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
      sendJson(response, 200, { ok: true, pid: process.pid, project_dir: projectDir });
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/api/state') {
      const forceRefresh = requestUrl.searchParams.get('force') === '1';
      sendJson(response, 200, collectDashboardState(projectDir, { forceRefresh }));
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/api/explain') {
      const report = buildExplain({
        projectDir,
        taskId: requestUrl.searchParams.get('taskId') || '',
        reqId: requestUrl.searchParams.get('reqId') || '',
        gate: requestUrl.searchParams.get('gate') || '',
      });
      sendJson(response, 200, report);
      return;
    }
    if (request.method === 'POST' && requestUrl.pathname === '/api/control') {
      await handleControl(projectDir, request, response);
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/') {
      sendHtml(response, buildDashboardHtml());
      return;
    }
    sendJson(response, 404, { ok: false, message: 'not_found' });
  });
}

function cleanupHooks(projectDir, server) {
  const cleanup = () => deleteDashboardState(projectDir);
  process.on('SIGINT', () => server.close(() => { cleanup(); process.exit(0); }));
  process.on('SIGTERM', () => server.close(() => { cleanup(); process.exit(0); }));
  process.on('exit', cleanup);
}

async function startServer(options = {}) {
  const projectDir = options.projectDir || process.cwd();
  const server = createDashboardServer({ projectDir });
  cleanupHooks(projectDir, server);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port || 0, options.host || '127.0.0.1', resolve);
  });

  const state = dashboardRuntime(projectDir, server);
  writeJsonAtomic(dashboardStatePath(projectDir), state);
  return { server, state };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDashboard(projectDir, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = readJsonIfExists(dashboardStatePath(projectDir), null);
    if (state && await isDashboardHealthy(state)) {
      return state;
    }
    await sleep(120);
  }
  return null;
}

function isHeadlessSession() {
  if (String(process.env.CI || '').toLowerCase() === 'true') return true;
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return true;
  return false;
}

function launchBrowser(url) {
  if (!url || isHeadlessSession()) return false;
  const commands = process.platform === 'darwin'
    ? [['open', [url]]]
    : process.platform === 'win32'
      ? [['cmd', ['/c', 'start', '', url]]]
      : [['xdg-open', [url]]];

  for (const [command, args] of commands) {
    try {
      const child = spawn(command, args, { stdio: 'ignore', detached: true });
      child.unref();
      return true;
    } catch {}
  }
  return false;
}

async function ensureDashboardServer(options = {}) {
  const projectDir = options.projectDir || process.cwd();
  const existing = readJsonIfExists(dashboardStatePath(projectDir), null);
  if (existing && await isDashboardHealthy(existing)) {
    return { state: existing, reused: true };
  }

  const child = spawn(process.execPath, [__filename, 'serve', `--project-dir=${projectDir}`, `--host=${options.host || '127.0.0.1'}`, `--port=${options.port || 0}`], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();

  const state = await waitForDashboard(projectDir, options.timeoutMs || 5000);
  if (!state) {
    throw new Error('whitebox_dashboard_start_timeout');
  }

  return { state, reused: false };
}

function helpText() {
  return [
    'whitebox-dashboard - browser surface for whitebox state',
    '',
    'Usage:',
    '  node skills/whitebox/scripts/whitebox-dashboard.js [open|serve] [options]',
    '',
    'Options:',
    '  --project-dir=/path   Target project directory',
    '  --host=127.0.0.1      Host to bind (serve)',
    '  --port=0              Port to bind (0 = dynamic)',
    '  --timeout-ms=5000     Wait time for detached server startup',
    '  --no-browser          Do not launch a browser window',
    '  --reveal              Launch browser even when reusing an existing server',
    '  --json                Print JSON payload when using open',
  ].join('\n');
}

async function main() {
  const options = parseArgs();
  if (options.command === 'help' || options.command === '--help' || options.command === '-h') {
    process.stdout.write(helpText() + '\n');
    return;
  }

  if (options.command === 'serve') {
    const { state } = await startServer(options);
    process.stdout.write(`${state.url}\n`);
    return;
  }

  const { state, reused } = await ensureDashboardServer(options);
  if (!options.noBrowser && (options.reveal || !reused)) {
    launchBrowser(state.url);
  }

  if (options.json) {
    process.stdout.write(JSON.stringify({ ok: true, reused, ...state }, null, 2) + '\n');
    return;
  }

  process.stdout.write(`${state.url}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

module.exports = {
  collectDashboardState,
  createDashboardServer,
  dashboardStatePath,
  ensureDashboardServer,
  startServer,
};
