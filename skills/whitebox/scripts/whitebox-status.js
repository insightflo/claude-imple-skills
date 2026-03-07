#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const { buildWhiteboxSummary, parseArgs, refreshWhiteboxSummary } = require('./whitebox-summary');

function formatHuman(summary) {
  const lines = [
    `gate_status: ${summary.gate_status}`,
    `blocked_count: ${summary.blocked_count}`,
    `run_id: ${summary.run_id || 'none'}`,
    `stale_artifacts: ${summary.stale_artifact_count}`,
  ];

  if (summary.next_remediation_target) {
    lines.push(`next: ${summary.next_remediation_target.id} - ${summary.next_remediation_target.reason}`);
  }

  return lines.join('\n');
}

function main() {
  const options = parseArgs();
  const summary = options.dryRun
    ? buildWhiteboxSummary(options.projectDir)
    : refreshWhiteboxSummary({ projectDir: options.projectDir });

  if (options.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    return;
  }

  if (process.stdout.isTTY) {
    const boardShow = path.resolve(__dirname, '../../task-board/scripts/board-show.sh');
    const result = spawnSync(boardShow, [`--project-dir=${options.projectDir}`], {
      stdio: 'inherit',
    });
    process.exit(result.status || 0);
  }

  process.stdout.write(formatHuman(summary) + '\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  formatHuman,
};
