#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { writeEvent } = require('./lib/whitebox-events');

const DEFAULT_TTL_SECONDS = 600;
const LEASES_REL_DIR = '.claude/collab/locks';
const ALLOWED_PREFIXES = [
  'TASKS.md',
  '.claude/collab/',
  '.claude/orchestrate/',
  '.claude/orchestrate-state.json',
];

function parseArgs(argv = process.argv.slice(2)) {
  const [command, target] = argv;
  const options = {
    command: command || '',
    target: target || '',
    holder: '',
    ttlSeconds: DEFAULT_TTL_SECONDS,
    force: false,
    json: false,
    projectDir: process.cwd(),
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--holder=')) options.holder = arg.slice('--holder='.length);
    else if (arg.startsWith('--ttl=')) options.ttlSeconds = Number.parseInt(arg.slice('--ttl='.length), 10) || DEFAULT_TTL_SECONDS;
    else if (arg.startsWith('--project-dir=')) options.projectDir = path.resolve(arg.slice('--project-dir='.length));
    else if (arg === '--force') options.force = true;
    else if (arg === '--json') options.json = true;
  }

  return options;
}

function usage() {
  process.stderr.write([
    'Usage:',
    '  node project-team/scripts/lease.js acquire <target> --holder=<id> [--ttl=60] [--project-dir=/path] [--json]',
    '  node project-team/scripts/lease.js release <target> --holder=<id> [--force] [--project-dir=/path] [--json]',
    '  node project-team/scripts/lease.js status [target] [--project-dir=/path] [--json]',
  ].join('\n') + '\n');
}

function normalizeTarget(target) {
  return String(target || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function assertAllowedTarget(target) {
  const normalized = normalizeTarget(target);
  const allowed = ALLOWED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
  if (!allowed) {
    const error = new Error(`Target is not leaseable: ${normalized}`);
    error.code = 'LEASE_TARGET_NOT_ALLOWED';
    throw error;
  }
  return normalized;
}

function leaseFileName(target) {
  return `${crypto.createHash('sha1').update(target).digest('hex').slice(0, 12)}.lease.json`;
}

function leasePath(projectDir, target) {
  return path.join(projectDir, LEASES_REL_DIR, leaseFileName(target));
}

function readJsonIfExists(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function classifyLease(lease) {
  if (!lease) return 'missing';
  const acquired = new Date(lease.acquired_at).getTime();
  if (Number.isNaN(acquired)) return 'stale';
  const ttlMs = Number(lease.ttl_seconds || DEFAULT_TTL_SECONDS) * 1000;
  return Date.now() > acquired + ttlMs ? 'stale' : 'active';
}

async function emitLeaseEvent(projectDir, type, data) {
  await writeEvent({
    type,
    producer: 'lease-script',
    correlation_id: `lease:${data.target}`,
    data,
  }, { projectDir });
}

async function acquireLease(projectDir, target, holder, ttlSeconds) {
  const normalizedTarget = assertAllowedTarget(target);
  if (!holder) {
    const error = new Error('Missing holder for lease acquisition');
    error.code = 'LEASE_HOLDER_REQUIRED';
    throw error;
  }

  const filePath = leasePath(projectDir, normalizedTarget);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const existing = readJsonIfExists(filePath);
  if (classifyLease(existing) === 'active') {
    const error = new Error(`Target already leased by ${existing.holder}`);
    error.code = 'LEASE_HELD';
    throw error;
  }

  const lease = {
    schema_version: 1,
    target: normalizedTarget,
    holder,
    ttl_seconds: ttlSeconds,
    acquired_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(lease, null, 2));
  await emitLeaseEvent(projectDir, 'coordination.lease.acquired', {
    target: normalizedTarget,
    holder,
    ttl_seconds: ttlSeconds,
  });
  return { ok: true, status: 'active', lease };
}

async function releaseLease(projectDir, target, holder, force) {
  const normalizedTarget = assertAllowedTarget(target);
  const filePath = leasePath(projectDir, normalizedTarget);
  const existing = readJsonIfExists(filePath);
  if (!existing) {
    return { ok: true, status: 'missing', lease: null };
  }
  if (!force && !holder) {
    const error = new Error('Missing holder for non-force lease release');
    error.code = 'LEASE_HOLDER_REQUIRED';
    throw error;
  }
  if (!force && holder && existing.holder !== holder) {
    const error = new Error(`Lease held by ${existing.holder}`);
    error.code = 'LEASE_OWNER_MISMATCH';
    throw error;
  }

  const previousStatus = classifyLease(existing);
  fs.unlinkSync(filePath);
  await emitLeaseEvent(projectDir, force ? 'coordination.lease.force_released' : 'coordination.lease.released', {
    target: normalizedTarget,
    holder: holder || existing.holder,
    previous_holder: existing.holder,
    previous_status: previousStatus,
  });
  return { ok: true, status: force ? 'force_released' : 'released', lease: existing };
}

function statusLease(projectDir, target) {
  if (target) {
    const normalizedTarget = assertAllowedTarget(target);
    const lease = readJsonIfExists(leasePath(projectDir, normalizedTarget));
    return { ok: true, leases: [{ target: normalizedTarget, status: classifyLease(lease), lease }] };
  }

  const dir = path.join(projectDir, LEASES_REL_DIR);
  if (!fs.existsSync(dir)) return { ok: true, leases: [] };
  const leases = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.lease.json'))
    .map((name) => readJsonIfExists(path.join(dir, name)))
    .filter(Boolean)
    .map((lease) => ({ target: lease.target, status: classifyLease(lease), lease }));
  return { ok: true, leases };
}

async function main() {
  const options = parseArgs();
  if (!options.command) {
    usage();
    process.exit(2);
  }

  let result;
  if (options.command === 'acquire') {
    result = await acquireLease(options.projectDir, options.target, options.holder, options.ttlSeconds);
  } else if (options.command === 'release') {
    result = await releaseLease(options.projectDir, options.target, options.holder, options.force);
  } else if (options.command === 'status') {
    result = statusLease(options.projectDir, options.target);
  } else {
    usage();
    process.exit(2);
  }

  process.stdout.write(JSON.stringify(result, null, options.json ? 2 : 0) + '\n');
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.code || 'LEASE_ERROR'}: ${error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  acquireLease,
  releaseLease,
  statusLease,
  classifyLease,
  parseArgs,
};
