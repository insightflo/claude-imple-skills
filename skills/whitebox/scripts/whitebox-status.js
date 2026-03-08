#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const { buildWhiteboxSummary, parseArgs, refreshWhiteboxSummary } = require('./whitebox-summary');
const { ensureWhiteboxArtifacts } = require('./whitebox-refresh');

function formatHuman(summary) {
  const lines = [
    `gate_status: ${summary.gate_status}`,
    `blocked_count: ${summary.blocked_count}`,
    `pending_approval_count: ${summary.pending_approval_count || 0}`,
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
  const rebuild = options.dryRun ? { ok: true, rebuilt: [], failures: [] } : ensureWhiteboxArtifacts({ projectDir: options.projectDir });
  const summary = options.dryRun
    ? buildWhiteboxSummary(options.projectDir)
    : refreshWhiteboxSummary({ projectDir: options.projectDir });

  if (!rebuild.ok) {
    summary.ok = false;
    summary.rebuild = rebuild;
  } else if (rebuild.rebuilt.length > 0) {
    summary.rebuild = rebuild;
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    process.exit(summary.ok ? 0 : 1);
  }

  if (process.stdout.isTTY) {
    const boardShow = path.resolve(__dirname, '../../task-board/scripts/board-show.sh');
    const args = [`--project-dir=${options.projectDir}`];
    if (rebuild.rebuilt.length > 0) args.push('--rebuild');
    const result = spawnSync(boardShow, args, {
      stdio: 'inherit',
    });
    process.exit(result.status || 0);
  }

  if (!rebuild.ok) {
    process.stderr.write(`whitebox-status rebuild degraded: ${rebuild.failures.map((entry) => `${entry.artifact}: ${entry.message}`).join('; ')}\n`);
  }
  process.stdout.write(formatHuman(summary) + '\n');
  process.exit(summary.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  formatHuman,
};
