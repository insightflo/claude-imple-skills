#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { buildReport } = require('../../../project-team/scripts/subscription-policy-check');
const { validateEvents } = require('../../../project-team/scripts/lib/whitebox-events');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    projectDir: process.cwd(),
    json: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--project-dir=')) options.projectDir = path.resolve(arg.slice('--project-dir='.length));
    else if (arg === '--json') options.json = true;
  }

  return options;
}

function artifactStatus(filePath) {
  return {
    path: filePath,
    exists: fs.existsSync(filePath),
  };
}

function buildHealth(projectDir) {
  const currentDir = process.cwd();
  process.chdir(projectDir);
  const policy = buildReport();
  process.chdir(currentDir);

  const artifacts = {
    tasks: artifactStatus(path.join(projectDir, 'TASKS.md')),
    orchestrate_state: artifactStatus(path.join(projectDir, '.claude', 'orchestrate-state.json')),
    orchestrate_state_v2: artifactStatus(path.join(projectDir, '.claude', 'orchestrate', 'orchestrate-state.json')),
    board_state: artifactStatus(path.join(projectDir, '.claude', 'collab', 'board-state.json')),
    whitebox_summary: artifactStatus(path.join(projectDir, '.claude', 'collab', 'whitebox-summary.json')),
    events: artifactStatus(path.join(projectDir, '.claude', 'collab', 'events.ndjson')),
  };

  const eventsFile = '.claude/collab/events.ndjson';
  const eventsIntegrity = validateEvents({ projectDir, file: eventsFile });
  const artifactsOk = Object.values(artifacts).every((entry) => entry.exists || entry.path.endsWith('/orchestrate/orchestrate-state.json'));
  const executorsOk = Object.values(policy.executors).every((state) => state === 'ok' || state === 'host_not_attached');
  const forbiddenOk = !policy.forbidden_integration.detected;

  return {
    ok: artifactsOk && executorsOk && forbiddenOk && eventsIntegrity.ok,
    executors: policy.executors,
    forbidden_integration: policy.forbidden_integration,
    artifacts,
    events_integrity: eventsIntegrity,
  };
}

function printHuman(report) {
  process.stdout.write(`ok: ${report.ok}\n`);
  process.stdout.write(`claude: ${report.executors.claude}\n`);
  process.stdout.write(`codex: ${report.executors.codex}\n`);
  process.stdout.write(`gemini: ${report.executors.gemini}\n`);
  process.stdout.write(`events: ${report.events_integrity.ok ? 'ok' : 'invalid'}\n`);
}

function main() {
  const options = parseArgs();
  const report = buildHealth(options.projectDir);
  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exit(report.ok ? 0 : 1);
  }
  printHuman(report);
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildHealth,
  parseArgs,
};
