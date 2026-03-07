#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { readEvents } = require('../../../project-team/scripts/lib/whitebox-events');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    projectDir: process.cwd(),
    json: false,
    taskId: '',
    reqId: '',
    gate: '',
  };

  for (const arg of argv) {
    if (arg.startsWith('--project-dir=')) options.projectDir = path.resolve(arg.slice('--project-dir='.length));
    else if (arg === '--json') options.json = true;
    else if (arg.startsWith('--task-id=')) options.taskId = arg.slice('--task-id='.length);
    else if (arg.startsWith('--req-id=')) options.reqId = arg.slice('--req-id='.length);
    else if (arg.startsWith('--gate=')) options.gate = arg.slice('--gate='.length);
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

function flattenBoard(board) {
  return Object.values(board.columns || {}).flatMap((cards) => Array.isArray(cards) ? cards : []);
}

function latestEvent(events) {
  return [...events].sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))[0] || null;
}

function matchesTarget(event, target) {
  const data = event && event.data && typeof event.data === 'object' ? event.data : {};
  if (target.type === 'task') {
    return target.id === event.correlation_id || target.id === data.task_id;
  }
  if (target.type === 'req') {
    return target.id === event.correlation_id || target.id === data.req_id;
  }
  if (target.type === 'gate') {
    return target.id === data.gate || target.id === data.hook;
  }
  return false;
}

function describeEvent(event) {
  if (!event) return { reason: 'No supporting whitebox event found.', source: null, remediation: null };

  const data = event.data && typeof event.data === 'object' ? event.data : {};
  if (event.type === 'hook.decision' && data.decision && data.decision !== 'allow') {
    return {
      reason: data.summary || `${data.hook || event.producer} ${data.decision}`,
      source: data.hook || event.producer,
      remediation: data.remediation || 'Follow the hook remediation and retry.',
    };
  }

  if (event.type === 'orchestrate.gate.outcome' && data.outcome && data.outcome !== 'pass') {
    return {
      reason: data.reason || `${data.gate || 'gate'} ${data.outcome}`,
      source: data.gate || event.producer,
      remediation: 'Resolve the failed gate condition and rerun the orchestrate flow.',
    };
  }

  if (event.type === 'multi_ai_review.capability') {
    return {
      reason: data.message || `Missing CLI for ${data.member_name || 'review member'}`,
      source: event.producer,
      remediation: 'Install or authenticate the missing CLI and rerun the review.',
    };
  }

  if (event.type === 'multi_ai_run.route.fallback') {
    return {
      reason: data.fallback_reason || 'Executor fallback applied.',
      source: event.producer,
      remediation: 'Restore the requested executor to avoid fallback.',
    };
  }

  if (event.type === 'task_blocked') {
    return {
      reason: 'Task reported blocked.',
      source: event.producer,
      remediation: 'Resolve the blocker and rerun the affected workflow.',
    };
  }

  if (event.type === 'req_escalated') {
    return {
      reason: 'Request escalated.',
      source: event.producer,
      remediation: 'Review the escalation path and pending decision.',
    };
  }

  if (event.type === 'multi_ai_review.run.finish' && data.verdict === 'warning') {
    return {
      reason: 'Multi-AI review reported warnings.',
      source: event.producer,
      remediation: 'Address the warning items and rerun the review.',
    };
  }

  return {
    reason: data.reason || data.summary || event.type,
    source: event.producer || null,
    remediation: data.remediation || null,
  };
}

function resolveTarget(options, board) {
  if (options.taskId) return { type: 'task', id: options.taskId };
  if (options.reqId) return { type: 'req', id: options.reqId };
  if (options.gate) return { type: 'gate', id: options.gate };

  const blockedCard = (board.columns && Array.isArray(board.columns.Blocked) ? board.columns.Blocked : [])[0];
  if (blockedCard) return { type: 'task', id: blockedCard.id };
  return { type: 'task', id: '' };
}

function buildExplain(options) {
  const projectDir = options.projectDir;
  const boardPath = path.join(projectDir, '.claude/collab/board-state.json');
  const eventsPath = path.join(projectDir, '.claude/collab/events.ndjson');
  const board = readJsonIfExists(boardPath, { columns: {} });
  const target = resolveTarget(options, board);
  const cards = flattenBoard(board);
  const card = cards.find((entry) => entry.id === target.id) || null;
  const parsedEvents = readEvents({ projectDir, tolerateTrailingPartialLine: true });
  const relevantEvents = parsedEvents.events.filter((event) => matchesTarget(event, target));
  const event = latestEvent(relevantEvents);
  const described = describeEvent(event);
  const evidencePaths = [boardPath, eventsPath];

  if (target.type === 'req') {
    const reqPath = path.join(projectDir, '.claude/collab/requests', `${target.id}.md`);
    if (fs.existsSync(reqPath)) evidencePaths.push(reqPath);
    const decisionPath = path.join(projectDir, '.claude/collab/decisions', `${target.id}.md`);
    if (fs.existsSync(decisionPath)) evidencePaths.push(decisionPath);
  }

  return {
    ok: Boolean(target.id),
    target,
    reason: card && card.blocker_reason ? card.blocker_reason : described.reason,
    source: card && card.blocker_source ? card.blocker_source : described.source,
    remediation: card && card.remediation ? card.remediation : described.remediation,
    evidence_paths: evidencePaths,
    correlation: {
      run_id: card && card.run_id ? card.run_id : (event && event.data && event.data.run_id ? event.data.run_id : null),
      last_event_type: card && card.last_event_type ? card.last_event_type : (event ? event.type : null),
      last_event_ts: card && card.last_event_ts ? card.last_event_ts : (event ? event.ts : null),
      event_id: event ? event.event_id : null,
    },
  };
}

function printHuman(report) {
  process.stdout.write(`target: ${report.target.type}:${report.target.id || 'none'}\n`);
  process.stdout.write(`reason: ${report.reason || 'none'}\n`);
  process.stdout.write(`source: ${report.source || 'unknown'}\n`);
  process.stdout.write(`remediation: ${report.remediation || 'none'}\n`);
}

function main() {
  const options = parseArgs();
  const report = buildExplain(options);
  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  printHuman(report);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildExplain,
  parseArgs,
};
