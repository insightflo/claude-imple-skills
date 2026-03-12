#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = process.env.GUIDANCE_SOURCE_ROOT
  ? path.resolve(process.env.GUIDANCE_SOURCE_ROOT)
  : path.resolve(__dirname, '..', '..');
const BUNDLE_REL_PATH = '.claude/cache/guidance-bundle.json';

const SOURCE_CANDIDATES = [
  'CLAUDE.md',
  'AGENTS.md',
  'project-team/config/capability-manifest.json',
  'project-team/config/topology-registry.json',
  'skills/whitebox/SKILL.md',
  'skills/recover/SKILL.md',
];

function parseArgs(argv = process.argv.slice(2)) {
  const [command = 'build'] = argv;
  const options = { command, projectDir: process.cwd(), json: false };
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('--project-dir=')) options.projectDir = path.resolve(arg.slice('--project-dir='.length));
    else if (arg === '--json') options.json = true;
  }
  return options;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function bundlePath(projectDir) {
  return path.join(projectDir, BUNDLE_REL_PATH);
}

function collectSources() {
  return SOURCE_CANDIDATES
    .map((relativePath) => {
      const absolutePath = path.join(REPO_ROOT, relativePath);
      if (!fs.existsSync(absolutePath)) return null;
      const content = fs.readFileSync(absolutePath, 'utf8');
      return {
        path: relativePath,
        hash: sha256(content),
        size: content.length,
      };
    })
    .filter(Boolean);
}

function buildBundle(projectDir) {
  const sources = collectSources();
  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_root: REPO_ROOT,
    project_dir: projectDir,
    sources,
    source_count: sources.length,
  };
  const outPath = bundlePath(projectDir);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return payload;
}

function validateBundle(projectDir) {
  const outPath = bundlePath(projectDir);
  if (!fs.existsSync(outPath)) {
    return { ok: false, reason: 'missing_bundle', bundle_path: outPath };
  }
  const current = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const nowSources = collectSources();
  const stale = [];
  const currentPaths = new Set((current.sources || []).map((entry) => entry.path));
  const nowPaths = new Set(nowSources.map((entry) => entry.path));
  for (const source of nowSources) {
    const bundled = current.sources.find((entry) => entry.path === source.path);
    if (!bundled || bundled.hash !== source.hash) {
      stale.push({ path: source.path, expected: bundled ? bundled.hash : null, actual: source.hash });
    }
  }
  for (const stalePath of currentPaths) {
    if (!nowPaths.has(stalePath)) {
      stale.push({ path: stalePath, expected: current.sources.find((entry) => entry.path === stalePath)?.hash || null, actual: null });
    }
  }
  return {
    ok: stale.length === 0,
    bundle_path: outPath,
    source_root: REPO_ROOT,
    stale,
    sources: nowSources,
  };
}

function readBundle(projectDir) {
  const outPath = bundlePath(projectDir);
  if (!fs.existsSync(outPath)) {
    return { ok: false, reason: 'missing_bundle', bundle_path: outPath };
  }
  return {
    ok: true,
    bundle_path: outPath,
    bundle: JSON.parse(fs.readFileSync(outPath, 'utf8')),
  };
}

function main() {
  const options = parseArgs();
  let result;
  if (options.command === 'build') result = buildBundle(options.projectDir);
  else if (options.command === 'validate') result = validateBundle(options.projectDir);
  else if (options.command === 'read') result = readBundle(options.projectDir);
  else {
    process.stderr.write('Usage: node project-team/scripts/guidance-bundle.js <build|validate|read> [--project-dir=/path] [--json]\n');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (options.command === 'validate') process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildBundle,
  validateBundle,
  readBundle,
  collectSources,
  bundlePath,
};
