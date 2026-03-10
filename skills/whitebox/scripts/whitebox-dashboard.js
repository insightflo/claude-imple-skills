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

const DASHBOARD_STATE_REL_PATH = '.claude/collab/whitebox-dashboard.json';
const BOARD_STATE_REL_PATH = '.claude/collab/board-state.json';
const SUMMARY_REL_PATH = '.claude/collab/whitebox-summary.json';
const CONTROL_STATE_REL_PATH = '.claude/collab/control-state.json';

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

function collectDashboardState(projectDir, options = {}) {
  const rebuild = ensureWhiteboxArtifacts({ projectDir, force: Boolean(options.forceRefresh) });
  const summary = readSummary(projectDir) || readJsonIfExists(path.join(projectDir, SUMMARY_REL_PATH), {});
  const board = readBoardState(projectDir);
  const controlState = readControlState(projectDir);
  const pendingApprovals = Array.isArray(controlState.pending_approvals) ? controlState.pending_approvals : [];
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

  return {
    ok: rebuild.ok,
    generated_at: new Date().toISOString(),
    project_dir: projectDir,
    rebuild,
    summary,
    board,
    control_state: controlState,
    approvals: pendingApprovals,
    read_only_decisions: readOnlyDecisions,
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
      --bg: #f5f1e8;
      --panel: rgba(255, 252, 245, 0.92);
      --panel-strong: #fffdf8;
      --ink: #1f1a17;
      --muted: #6d6257;
      --line: rgba(62, 47, 38, 0.12);
      --accent: #0f766e;
      --accent-soft: rgba(15, 118, 110, 0.12);
      --warn: #b45309;
      --danger: #b42318;
      --danger-soft: rgba(180, 35, 24, 0.1);
      --shadow: 0 20px 50px rgba(46, 33, 24, 0.12);
      --radius: 20px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: radial-gradient(circle at top left, rgba(15,118,110,0.14), transparent 34%),
                  radial-gradient(circle at top right, rgba(180,83,9,0.12), transparent 32%),
                  linear-gradient(180deg, #fbf8f2 0%, #f2ece0 100%);
      min-height: 100vh;
    }
    header {
      padding: 32px 24px 16px;
      display: flex;
      gap: 16px;
      align-items: flex-end;
      justify-content: space-between;
      flex-wrap: wrap;
    }
    h1 { margin: 0; font-size: clamp(28px, 4vw, 48px); line-height: 0.95; }
    p { margin: 0; color: var(--muted); }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
    button {
      appearance: none;
      border: 1px solid var(--line);
      background: var(--panel-strong);
      color: var(--ink);
      border-radius: 999px;
      padding: 10px 16px;
      font: inherit;
      cursor: pointer;
      transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
    }
    button:hover { transform: translateY(-1px); border-color: rgba(15,118,110,0.3); }
    button.primary { background: var(--accent); color: white; border-color: transparent; }
    button.warn { background: #fff3e8; color: var(--warn); }
    button.danger { background: #fff1f0; color: var(--danger); }
    main {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
      gap: 18px;
      padding: 0 24px 24px;
    }
    .stack { display: grid; gap: 18px; }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
      backdrop-filter: blur(10px);
    }
    .panel header, .panel .content { padding: 18px 20px; }
    .panel header { border-bottom: 1px solid var(--line); }
    .panel h2 { margin: 0; font-size: 18px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      padding: 0 24px 18px;
    }
    .stat {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
      box-shadow: var(--shadow);
    }
    .stat .label { display: block; color: var(--muted); font-size: 13px; margin-bottom: 6px; }
    .stat strong { font-size: 28px; }
    .columns {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      padding: 20px;
    }
    .column {
      background: rgba(255,255,255,0.58);
      border: 1px solid var(--line);
      border-radius: 18px;
      min-height: 180px;
      padding: 12px;
    }
    .column h3 { margin: 0 0 10px; font-size: 14px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
    .card {
      background: white;
      border: 1px solid rgba(62,47,38,0.08);
      border-radius: 14px;
      padding: 12px;
      margin-bottom: 10px;
      box-shadow: 0 10px 20px rgba(48,38,29,0.06);
    }
    .card:last-child { margin-bottom: 0; }
    .card .title { font-weight: 700; margin-bottom: 4px; }
    .card .meta { font-size: 13px; color: var(--muted); }
    .list { display: grid; gap: 12px; padding: 18px 20px 20px; }
    .item {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
      background: rgba(255,255,255,0.78);
    }
    .item header {
      padding: 0;
      border: 0;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .item h3 { margin: 0; font-size: 16px; }
    .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 12px;
      background: var(--accent-soft);
      color: var(--accent);
    }
    .empty { color: var(--muted); font-style: italic; }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .split { display: grid; gap: 18px; }
    .status-line { color: var(--muted); font-size: 13px; }
    @media (max-width: 1040px) {
      main { grid-template-columns: 1fr; }
      .stats, .columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 720px) {
      header, main, .stats { padding-left: 16px; padding-right: 16px; }
      .stats, .columns { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <p>Ambient execution visibility</p>
      <h1>Whitebox Dashboard</h1>
    </div>
    <div class="actions">
      <button class="primary" id="refreshButton">Refresh now</button>
      <button id="copyUrlButton">Copy API URL</button>
    </div>
  </header>
  <section class="stats" id="stats"></section>
  <main>
    <div class="stack">
      <section class="panel">
        <header><h2>Board</h2></header>
        <div class="columns" id="columns"></div>
      </section>
      <section class="panel">
        <header><h2>Pending Approvals</h2></header>
        <div class="list" id="approvals"></div>
      </section>
      <section class="panel">
        <header><h2>Read-only Decisions</h2></header>
        <div class="list" id="decisions"></div>
      </section>
    </div>
    <div class="split">
      <section class="panel">
        <header><h2>Explain</h2></header>
        <div class="content"><pre id="explain">Select a blocker, approval, or decision to inspect.</pre></div>
      </section>
      <section class="panel">
        <header><h2>Runtime</h2></header>
        <div class="content">
          <pre id="runtime"></pre>
          <p class="status-line" id="statusLine"></p>
        </div>
      </section>
    </div>
  </main>
  <script>
    const columnsOrder = ['Backlog', 'In Progress', 'Blocked', 'Done'];
    let latestState = null;
    let explainTarget = null;

    function text(value, fallback = 'none') {
      if (value === null || value === undefined || value === '') return fallback;
      return String(value);
    }

    function renderStats(state) {
      const summary = state.summary || {};
      const items = [
        ['Gate', text(summary.gate_status)],
        ['Approvals', text(summary.pending_approval_count, '0')],
        ['Decisions', text(summary.pending_decision_count, '0')],
        ['Blocked', text(summary.blocked_count, '0')],
      ];
      document.getElementById('stats').innerHTML = items.map(([label, value]) => (
        '<div class="stat">'
          + '<span class="label">' + label + '</span>'
          + '<strong>' + value + '</strong>'
        + '</div>'
      )).join('');
    }

    function renderColumns(state) {
      const board = state.board || { columns: {} };
      document.getElementById('columns').innerHTML = columnsOrder.map((column) => {
        const cards = Array.isArray(board.columns && board.columns[column]) ? board.columns[column] : [];
        const body = cards.length === 0 ? '<p class="empty">Nothing here.</p>' : cards.map((card) => (
          '<div class="card">'
            + '<div class="title">' + text(card.id) + '</div>'
            + '<div class="meta">' + text(card.title || card.task_title || card.id) + '</div>'
            + '<div class="meta">' + (card.agent ? 'agent: ' + card.agent : '') + (card.run_id ? ' | run: ' + card.run_id : '') + '</div>'
          + '</div>'
        )).join('');
        return (
          '<section class="column">'
            + '<h3>' + column + ' (' + cards.length + ')' + '</h3>'
            + body
          + '</section>'
        );
      }).join('');
    }

    function explainButton(label, params) {
      const encoded = encodeURIComponent(JSON.stringify(params));
      return '<button data-explain="' + encoded + '">' + label + '</button>';
    }

    function renderApprovals(state) {
      const approvals = Array.isArray(state.approvals) ? state.approvals : [];
      const target = document.getElementById('approvals');
      if (approvals.length === 0) {
        target.innerHTML = '<p class="empty">No pending approvals.</p>';
        return;
      }
      target.innerHTML = approvals.map((approval) => (
        '<article class="item">'
          + '<header>'
            + '<div>'
              + '<h3>' + text(approval.gate_name || approval.gate_id) + '</h3>'
              + '<p>' + text(approval.trigger_reason || approval.preview || approval.gate_id) + '</p>'
            + '</div>'
            + '<span class="pill">' + text(approval.trigger_type, 'user_confirmation') + '</span>'
          + '</header>'
          + '<p class="status-line">task: ' + text(approval.task_id) + ' | gate: ' + text(approval.gate_id) + '</p>'
          + '<div class="actions">'
            + '<button class="primary" data-control="approve" data-gate-id="' + approval.gate_id + '">Approve</button>'
            + '<button class="danger" data-control="reject" data-gate-id="' + approval.gate_id + '">Reject</button>'
            + explainButton('Explain', approval.task_id ? { taskId: approval.task_id } : { gate: approval.gate_id })
          + '</div>'
        + '</article>'
      )).join('');
    }

    function renderDecisions(state) {
      const decisions = Array.isArray(state.read_only_decisions) ? state.read_only_decisions : [];
      const target = document.getElementById('decisions');
      if (decisions.length === 0) {
        target.innerHTML = '<p class="empty">No read-only decisions.</p>';
        return;
      }
      target.innerHTML = decisions.map((decision) => (
        '<article class="item">'
          + '<header>'
            + '<div>'
              + '<h3>' + text(decision.title) + '</h3>'
              + '<p>' + text(decision.reason) + '</p>'
            + '</div>'
            + '<span class="pill">' + text(decision.decision_class) + '</span>'
          + '</header>'
          + '<p class="status-line">task: ' + text(decision.task_id) + ' | req: ' + text(decision.req_id) + ' | trigger: ' + text(decision.trigger_type) + '</p>'
          + '<div class="actions">'
            + explainButton('Explain', decision.task_id ? { taskId: decision.task_id } : decision.req_id ? { reqId: decision.req_id } : { gate: decision.id })
          + '</div>'
        + '</article>'
      )).join('');
    }

    function renderRuntime(state) {
      const summary = state.summary || {};
      document.getElementById('runtime').textContent = JSON.stringify({
        generated_at: state.generated_at,
        project_dir: state.project_dir,
        run_id: summary.run_id,
        gate_status: summary.gate_status,
        rebuild: state.rebuild,
      }, null, 2);
      document.getElementById('statusLine').textContent = 'Auto-refresh every 2s. Last update: ' + new Date().toLocaleTimeString();
    }

    async function loadState(force = false) {
      const response = await fetch('/api/state' + (force ? '?force=1' : ''), { cache: 'no-store' });
      latestState = await response.json();
      renderStats(latestState);
      renderColumns(latestState);
      renderApprovals(latestState);
      renderDecisions(latestState);
      renderRuntime(latestState);
      if (explainTarget) {
        await loadExplain(explainTarget);
      }
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
    'whitebox-dashboard - browser surface for whitebox/task-board state',
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
