#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const { init: initCollab } = require('../../../project-team/scripts/collab-init');
const { emitRunEventDetailed, createRunId } = require('../../../project-team/scripts/lib/whitebox-run');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    projectDir: process.cwd(),
    host: '127.0.0.1',
    port: 0,
    json: false,
    noBrowser: false,
    noCollabInit: false,
    command: [],
  };

  let passthrough = false;
  for (const arg of argv) {
    if (passthrough) {
      options.command.push(arg);
      continue;
    }

    if (arg === '--') {
      passthrough = true;
      continue;
    }

    if (arg === '--json') options.json = true;
    else if (arg === '--no-browser') options.noBrowser = true;
    else if (arg === '--no-collab-init') options.noCollabInit = true;
    else if (arg.startsWith('--project-dir=')) options.projectDir = path.resolve(arg.slice('--project-dir='.length));
    else if (arg.startsWith('--host=')) options.host = arg.slice('--host='.length) || options.host;
    else if (arg.startsWith('--port=')) options.port = Number.parseInt(arg.slice('--port='.length), 10) || 0;
    else {
      options.command.push(arg);
      passthrough = true;
    }
  }

  if (options.command.length === 0) {
    options.command = ['claude'];
  }

  return options;
}

function helpText() {
  return [
    'whitebox-launcher - launch whitebox first, then supervise a CLI executor',
    '',
    'Usage:',
    '  node skills/whitebox/scripts/whitebox-launcher.js [options] [--] [command...]',
    '',
    'Options:',
    '  --project-dir=/path   Target project directory',
    '  --host=127.0.0.1      Dashboard host',
    '  --port=0              Dashboard port (0 = dynamic)',
    '  --no-browser          Start dashboard without opening a browser window',
    '  --no-collab-init      Skip collab-init before launch',
    '  --json                Print machine-readable launch summary',
    '',
    'Examples:',
    '  node skills/whitebox/scripts/whitebox-launcher.js',
    '  node skills/whitebox/scripts/whitebox-launcher.js -- --orchestrate',
    '  node skills/whitebox/scripts/whitebox-launcher.js -- claude',
    '  node skills/whitebox/scripts/whitebox-launcher.js -- codex exec',
  ].join('\n');
}

function launcherStatePath(projectDir) {
  return path.join(projectDir, '.claude', 'collab', 'launcher-state.json');
}

function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function splitCommand(command) {
  const [program, ...args] = Array.isArray(command) ? command : [];
  if (!program) {
    throw new Error('missing_executor_command');
  }

  return { program, args };
}

async function emitLifecycle(type, data, projectDir, sessionId) {
  return emitRunEventDetailed({
    type,
    producer: 'whitebox-launcher',
    data,
    projectDir,
    correlationId: sessionId,
    stage: type,
    mode: 'best_effort',
  });
}

async function prepareSurface(options) {
  if (!options.noCollabInit) {
    initCollab(options.projectDir);
  }

  const dashboardScript = path.resolve(__dirname, 'whitebox-dashboard.js');
  const dashboardArgs = [
    dashboardScript,
    'open',
    `--project-dir=${options.projectDir}`,
    `--host=${options.host}`,
    `--port=${options.port}`,
    '--json',
  ];

  if (options.noBrowser) {
    dashboardArgs.push('--no-browser');
  }

  const result = spawnSync(process.execPath, dashboardArgs, {
    cwd: options.projectDir,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'whitebox dashboard failed to open').trim());
  }

  return JSON.parse(result.stdout);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(helpText() + '\n');
    process.exit(0);
  }

  const options = parseArgs(argv);
  const sessionId = createRunId('whitebox-supervisor', path.basename(options.projectDir));
  const startedAt = new Date().toISOString();

  let dashboard;
  try {
    dashboard = await prepareSurface(options);
  } catch (error) {
    const payload = {
      ok: false,
      error: error && error.message ? error.message : String(error),
      stage: 'prepare_surface',
      project_dir: options.projectDir,
    };
    if (options.json) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    else process.stderr.write(`whitebox-launcher: ${payload.error}\n`);
    process.exit(1);
  }

  const { program, args } = splitCommand(options.command);
  const launcherState = {
    session_id: sessionId,
    started_at: startedAt,
    project_dir: options.projectDir,
    dashboard,
    command: { program, args },
    supervisor_pid: process.pid,
    status: 'starting',
  };
  writeJsonAtomic(launcherStatePath(options.projectDir), launcherState);

  await emitLifecycle('supervisor.session.started', {
    session_id: sessionId,
    command: program,
    args,
    dashboard_url: dashboard.url,
    dashboard_pid: dashboard.pid,
  }, options.projectDir, sessionId);

  const child = spawn(program, args, {
    cwd: options.projectDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: options.projectDir,
      WHITEBOX_LAUNCHER_ACTIVE: '1',
      WHITEBOX_SUPERVISOR_SESSION_ID: sessionId,
      WHITEBOX_PROJECT_DIR: options.projectDir,
      WHITEBOX_DASHBOARD_URL: dashboard.url,
    },
  });

  launcherState.status = 'running';
  launcherState.executor_pid = child.pid || null;
  writeJsonAtomic(launcherStatePath(options.projectDir), launcherState);

  const launchSummary = {
    ok: true,
    project_dir: options.projectDir,
    dashboard,
    session: {
      id: sessionId,
      supervisor_pid: process.pid,
      executor_pid: child.pid || null,
      started_at: startedAt,
      state_path: path.relative(options.projectDir, launcherStatePath(options.projectDir)),
    },
    command: { program, args },
  };

  if (options.json) {
    process.stdout.write(JSON.stringify(launchSummary, null, 2) + '\n');
  } else {
    process.stderr.write(`[whitebox-launcher] dashboard=${dashboard.url} executor=${program}${args.length ? ` ${args.join(' ')}` : ''}\n`);
  }

  const forwardSignal = (signal) => {
    if (child.exitCode !== null || child.killed) return;
    try {
      child.kill(signal);
    } catch {}
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.once('error', async (error) => {
    launcherState.status = 'spawn_failed';
    launcherState.error = error.message;
    launcherState.finished_at = new Date().toISOString();
    writeJsonAtomic(launcherStatePath(options.projectDir), launcherState);
    await emitLifecycle('supervisor.session.spawn_failed', {
      session_id: sessionId,
      command: program,
      args,
      error: error.message,
    }, options.projectDir, sessionId);
    process.stderr.write(`whitebox-launcher: failed to spawn ${program}: ${error.message}\n`);
    process.exit(1);
  });

  child.once('close', async (code, signal) => {
    launcherState.status = signal ? 'interrupted' : code === 0 ? 'completed' : 'failed';
    launcherState.exit_code = Number.isInteger(code) ? code : null;
    launcherState.signal = signal || null;
    launcherState.finished_at = new Date().toISOString();
    writeJsonAtomic(launcherStatePath(options.projectDir), launcherState);

    const eventType = signal ? 'supervisor.session.interrupted' : 'supervisor.session.finished';
    await emitLifecycle(eventType, {
      session_id: sessionId,
      command: program,
      args,
      exit_code: Number.isInteger(code) ? code : null,
      signal: signal || null,
      status: launcherState.status,
    }, options.projectDir, sessionId);

    process.exit(Number.isInteger(code) ? code : signal ? 130 : 1);
  });
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

module.exports = {
  launcherStatePath,
  parseArgs,
};
