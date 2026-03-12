#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  readRegistry,
  readCapabilityManifest,
  validateRegistry,
  buildRuntimeHealthReport,
} = require('./install-registry');

const INSTALL_STATE_REL_PATH = '.claude/project-team-install-state.json';

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    projectDir: process.cwd(),
    json: false,
    mode: null,
    installMode: null,
    targetBase: null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--project-dir=')) options.projectDir = path.resolve(arg.slice('--project-dir='.length));
    else if (arg.startsWith('--mode=')) options.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--install-mode=')) options.installMode = arg.slice('--install-mode='.length);
    else if (arg.startsWith('--target-base=')) options.targetBase = path.resolve(arg.slice('--target-base='.length));
    else if (arg === '--json') options.json = true;
  }

  return options;
}

function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadOptionalModule(relativePath) {
  try {
    return require(relativePath);
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

function inferInstallContext(projectDir, options = {}) {
  if (options.mode && options.installMode && options.targetBase) {
    return {
      mode: options.mode,
      installMode: options.installMode,
      targetBase: options.targetBase,
      source: 'explicit-flags',
    };
  }

  const localStatePath = path.join(projectDir, INSTALL_STATE_REL_PATH);
  const localState = readJsonIfExists(localStatePath, null);
  if (localState && localState.mode) {
    return {
      mode: options.mode || localState.mode,
      installMode: options.installMode || localState.installMode || 'local',
      targetBase: options.targetBase || path.join(projectDir, '.claude'),
      source: 'local-install-state',
      statePath: localStatePath,
    };
  }

  const homeStatePath = path.join(os.homedir(), '.claude', 'project-team-install-state.json');
  const homeState = readJsonIfExists(homeStatePath, null);
  if (homeState && homeState.mode) {
    return {
      mode: options.mode || homeState.mode,
      installMode: options.installMode || homeState.installMode || 'global',
      targetBase: options.targetBase || path.join(os.homedir(), '.claude'),
      source: 'global-install-state',
      statePath: homeStatePath,
    };
  }

  return null;
}

function normalizeSection(name, status, summary, details, remediation) {
  return { name, status, summary, details, remediation };
}

function computeDoctorReport(projectDir, options = {}) {
  const registry = readRegistry();
  const manifest = readCapabilityManifest();
  const installValidation = validateRegistry(registry, manifest);
  const install = normalizeSection(
    'install',
    installValidation.ok ? 'pass' : 'fail',
    installValidation.ok ? 'Registry and capability manifest are aligned.' : 'Registry and capability manifest diverged.',
    installValidation,
    installValidation.ok ? null : 'Run `node project-team/scripts/install-registry.js validate` and resolve the listed issues.'
  );

  const installContext = inferInstallContext(projectDir, options);
  let runtime;
  if (!installContext) {
    runtime = normalizeSection(
      'runtime',
      'warn',
      'No install state found; runtime health could not be inferred automatically.',
      { install_state: null },
      'Install Project Team locally or globally, or pass `--mode`, `--install-mode`, and `--target-base` explicitly.'
    );
  } else {
    const runtimeReport = buildRuntimeHealthReport(registry, manifest, installContext.mode, installContext.targetBase, installContext.installMode);
    runtime = normalizeSection(
      'runtime',
      runtimeReport.ok ? 'pass' : 'fail',
      runtimeReport.ok ? 'Installed runtime artifacts match the capability contract.' : 'Installed runtime artifacts are missing required capabilities.',
      { ...runtimeReport, installContext },
      runtimeReport.ok ? null : runtimeReport.required.missing[0]?.remediationSource || 'Reinstall the requested mode or restore the missing required runtime artifact.'
    );
  }

  const whiteboxModule = loadOptionalModule('../../skills/whitebox/scripts/whitebox-health');
  let whitebox;
  if (!whiteboxModule) {
    whitebox = normalizeSection(
      'whitebox',
      'warn',
      'Whitebox diagnostics are unavailable from this install layout.',
      { available: false },
      'Run doctor from the full claude-impl-tools repository checkout or add the whitebox skill package to this distribution.'
    );
  } else {
    const whiteboxReport = whiteboxModule.buildHealth(projectDir);
    const missingContextArtifacts = [
      whiteboxReport.artifacts.tasks,
      whiteboxReport.artifacts.orchestrate_state,
      whiteboxReport.artifacts.orchestrate_state_v2,
      whiteboxReport.artifacts.board_state,
      whiteboxReport.artifacts.whitebox_summary,
    ].filter((entry) => entry && !entry.exists);
    const whiteboxStatus = whiteboxReport.ok
      ? 'pass'
      : missingContextArtifacts.length > 0 && whiteboxReport.events_integrity.ok && whiteboxReport.control_integrity.ok
        ? 'warn'
        : 'fail';
    whitebox = normalizeSection(
      'whitebox',
      whiteboxStatus,
      whiteboxStatus === 'pass'
        ? 'Whitebox artifacts and executor policy look healthy.'
        : whiteboxStatus === 'warn'
          ? 'Whitebox runtime is healthy, but project execution artifacts are not fully initialized yet.'
          : 'Whitebox health check found integrity or executor problems.',
      whiteboxReport,
      whiteboxStatus === 'fail'
        ? 'Run `node skills/whitebox/scripts/whitebox-health.js --json` and fix the reported integrity or executor issues.'
        : whiteboxStatus === 'warn'
          ? 'Initialize collab/runtime artifacts (for example via orchestration or collab-init) before relying on whitebox state.'
          : null
    );
  }

  const recoverModule = loadOptionalModule('../../skills/recover/scripts/recover-status');
  let recovery;
  if (!recoverModule) {
    recovery = normalizeSection(
      'recovery',
      'warn',
      'Recovery diagnostics are unavailable from this install layout.',
      { available: false },
      'Run doctor from the full claude-impl-tools repository checkout or add the recover skill package to this distribution.'
    );
  } else {
    const recoverReport = recoverModule.buildRecoverStatus(projectDir);
    const recoverStatus = recoverReport.authoritative_source ? 'pass' : 'warn';
    recovery = normalizeSection(
      'recovery',
      recoverStatus,
      recoverStatus === 'pass'
        ? 'Recovery has a canonical source available.'
        : 'Recovery currently depends on heuristics or manual restart paths.',
      recoverReport,
      recoverStatus === 'warn'
        ? 'Generate canonical runtime state first (`auto-state`, `orchestrate-state`, or recovery snapshot) before relying on `/recover`.'
        : null
    );
  }

  const sections = { install, runtime, whitebox, recovery };
  const failing = Object.values(sections).filter((section) => section.status === 'fail');
  return {
    ok: failing.length === 0,
    projectDir,
    generated_at: new Date().toISOString(),
    sections,
  };
}

function printHuman(report) {
  for (const section of Object.values(report.sections)) {
    process.stdout.write(`${section.name}: ${section.status}\n`);
    process.stdout.write(`  ${section.summary}\n`);
    if (section.remediation) {
      process.stdout.write(`  remediation: ${section.remediation}\n`);
    }
  }
}

function main() {
  const options = parseArgs();
  const report = computeDoctorReport(options.projectDir, options);
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
  computeDoctorReport,
  inferInstallContext,
  parseArgs,
};
