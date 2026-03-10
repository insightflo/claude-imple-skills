#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { readEvents } = require('../../../project-team/scripts/lib/whitebox-events');
const { parseFrontmatter } = require('../../../project-team/scripts/conflict-resolver');
const { readControlState } = require('./whitebox-control-state');

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

function readTextIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  } catch {
    return '';
  }
}

function parseMarkdownSections(body) {
  const sections = {};
  let current = null;
  for (const rawLine of String(body || '').split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      current = heading[1].trim().toLowerCase();
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  return Object.fromEntries(Object.entries(sections).map(([key, lines]) => [key, lines.join('\n').trim()]));
}

function findBoardDecision(board, target) {
  const decisions = Array.isArray(board && board.decisions) ? board.decisions : [];
  if (target.type === 'req') {
    return decisions.find((entry) => entry && entry.req_id === target.id) || null;
  }
  if (target.type === 'task') {
    return decisions.find((entry) => entry && entry.task_id === target.id) || null;
  }
  return null;
}

function findLinkedDecision(projectDir, reqId) {
  const decisionsDir = path.join(projectDir, '.claude', 'collab', 'decisions');
  if (!fs.existsSync(decisionsDir)) return null;
  const files = fs.readdirSync(decisionsDir)
    .filter((file) => /^DEC-.*\.md$/.test(file))
    .sort((a, b) => a.localeCompare(b));
  let linked = null;
  for (const file of files) {
    const filePath = path.join(decisionsDir, file);
    const content = readTextIfExists(filePath);
    if (!content) continue;
    const meta = parseFrontmatter(content).meta || parseFrontmatter(content);
    if (String(meta.ref_req || '').trim() !== reqId) continue;
    const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?(?:\n|$)/, '');
    const sections = parseMarkdownSections(body);
    linked = {
      id: String(meta.id || path.basename(file, '.md')).trim(),
      status: String(meta.status || '').trim().toUpperCase() || 'FINAL',
      ref_req: reqId,
      path: filePath,
      relative_path: path.relative(projectDir, filePath).replace(/\\/g, '/'),
      summary: sections['decision summary'] || '',
      conflict: sections['context & conflict'] || '',
      required_actions: sections['required actions'] || '',
    };
  }
  return linked;
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
    return target.id === data.gate_id || target.id === data.gate || target.id === data.hook;
  }
  return false;
}

function describeEvent(event) {
  if (!event) return { reason: 'No supporting whitebox event found.', source: null, remediation: null };

  const data = event.data && typeof event.data === 'object' ? event.data : {};
  if (event.type === 'hook.decision' && data.decision && data.decision !== 'allow') {
    const riskLevel = String(data.risk_level || '').toUpperCase();
    const severity = String(data.severity || '').toLowerCase();
    const triggerType = (riskLevel === 'CRITICAL' || riskLevel === 'HIGH' || severity === 'critical' || severity === 'error')
      ? 'risk_acknowledgement'
      : 'user_confirmation';
    return {
      reason: data.summary || `${data.hook || event.producer} ${data.decision}`,
      source: data.hook || event.producer,
      remediation: data.remediation || 'Follow the hook remediation and retry.',
      trigger: {
        type: triggerType,
        recommendation: data.remediation || null,
      },
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
      trigger: {
        type: 'agent_conflict',
        recommendation: 'Review the escalated request and create or apply a DEC ruling before continuing.',
      },
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

function resolveTarget(options, board, controlState) {
  if (options.taskId) return { type: 'task', id: options.taskId };
  if (options.reqId) return { type: 'req', id: options.reqId };
  if (options.gate) return { type: 'gate', id: options.gate };

  const blockedCard = (board.columns && Array.isArray(board.columns.Blocked) ? board.columns.Blocked : [])[0];
  if (blockedCard) return { type: 'task', id: blockedCard.id };
  const pendingApproval = Array.isArray(controlState && controlState.pending_approvals)
    ? controlState.pending_approvals[0]
    : null;
  if (pendingApproval) {
    if (pendingApproval.task_id) return { type: 'task', id: pendingApproval.task_id };
    return { type: 'gate', id: pendingApproval.gate_id };
  }
  return { type: 'task', id: '' };
}

function findPendingApproval(controlState, target) {
  const pending = Array.isArray(controlState && controlState.pending_approvals)
    ? controlState.pending_approvals
    : [];
  if (target.type === 'gate') {
    return pending.find((entry) => entry.gate_id === target.id) || null;
  }
  if (target.type === 'task') {
    return pending.find((entry) => entry.task_id === target.id) || null;
  }
  return null;
}

function shellQuote(value) {
  return JSON.stringify(String(value));
}

function approvalOptions(approval) {
  const evidencePaths = Array.isArray(approval.evidence_paths) ? approval.evidence_paths : [];
  const controlScript = path.resolve(__dirname, 'whitebox-control.js');
  const projectDirArg = `--project-dir=${approval.project_dir}`;
  return [
    {
      command: `node ${shellQuote(controlScript)} approve ${shellQuote(projectDirArg)} --gate-id=${approval.gate_id} --json`,
      effect: 'Records one approve command for the paused gate and allows the orchestrator to resume.',
      risk: 'Execution continues with the currently proposed plan and may expose downstream failures.',
      recommendation: approval.recommendation || null,
      evidence_paths: evidencePaths,
    },
    {
      command: `node ${shellQuote(controlScript)} reject ${shellQuote(projectDirArg)} --gate-id=${approval.gate_id} --json`,
      effect: 'Records one reject command for the paused gate and keeps the run from resuming that gate.',
      risk: 'The run remains blocked until a new plan or retry path produces another approvable gate.',
      recommendation: approval.recommendation || null,
      evidence_paths: evidencePaths,
    },
  ];
}

function buildExplain(options) {
  const projectDir = options.projectDir;
  const boardPath = path.join(projectDir, '.claude/collab/board-state.json');
  const eventsPath = path.join(projectDir, '.claude/collab/events.ndjson');
  const controlStatePath = path.join(projectDir, '.claude/collab/control-state.json');
  const board = readJsonIfExists(boardPath, { columns: {} });
  const controlState = readControlState(projectDir, { pending_approvals: [] });
  const target = resolveTarget(options, board, controlState);
  const cards = flattenBoard(board);
  const card = cards.find((entry) => entry.id === target.id) || null;
  const boardDecision = findBoardDecision(board, target);
  const parsedEvents = readEvents({ projectDir, tolerateTrailingPartialLine: true });
  const relevantEvents = parsedEvents.events.filter((event) => matchesTarget(event, target));
  const event = latestEvent(relevantEvents);
  const described = describeEvent(event);
  const evidencePaths = [boardPath, eventsPath, controlStatePath].filter((filePath) => fs.existsSync(filePath));
  const approval = findPendingApproval(controlState, target);
  if (approval) {
    approval.project_dir = projectDir;
  }
  const optionsList = approval ? approvalOptions(approval) : [];
  let linkedDecision = null;

  if (target.type === 'req') {
    const reqPath = path.join(projectDir, '.claude/collab/requests', `${target.id}.md`);
    if (fs.existsSync(reqPath)) evidencePaths.push(reqPath);
    linkedDecision = findLinkedDecision(projectDir, target.id);
    if (linkedDecision && fs.existsSync(linkedDecision.path)) evidencePaths.push(linkedDecision.path);
  }

  const hasEvidence = Boolean(approval || card || event || boardDecision || linkedDecision);
  const reqReason = linkedDecision
    ? (linkedDecision.summary || linkedDecision.conflict || boardDecision?.reason || described.reason)
    : (boardDecision?.reason || described.reason);
  const reqRemediation = linkedDecision
    ? (linkedDecision.required_actions || boardDecision?.recommendation || `Apply ${linkedDecision.id} and update the request status when the ruling is complete.`)
    : (boardDecision?.recommendation || described.remediation);
  const reqSource = linkedDecision
    ? `${linkedDecision.id} (${linkedDecision.status})`
    : (boardDecision?.decision_id || boardDecision?.title || described.source);

  return {
    ok: hasEvidence,
    target,
    reason: approval
      ? (approval.trigger_reason || `Approval required for ${approval.task_id || approval.gate_name || approval.gate_id}`)
      : target.type === 'req'
        ? reqReason
        : card && card.blocker_reason ? card.blocker_reason : described.reason,
    source: approval
      ? 'whitebox-control-state'
      : target.type === 'req'
        ? reqSource
        : card && card.blocker_source ? card.blocker_source : described.source,
    remediation: approval
      ? (approval.recommendation || 'Choose approve or reject from the evidence-backed options.')
      : target.type === 'req'
        ? reqRemediation
        : card && card.remediation ? card.remediation : described.remediation,
    options: optionsList,
    trigger: approval ? {
      type: approval.trigger_type || 'user_confirmation',
      recommendation: approval.recommendation || null,
    } : (target.type === 'req' && (linkedDecision || boardDecision)) ? {
      type: 'agent_conflict',
      recommendation: reqRemediation || null,
    } : described.trigger || null,
    evidence_paths: evidencePaths,
    linked_decision: linkedDecision ? {
      id: linkedDecision.id,
      status: linkedDecision.status,
      ref_req: linkedDecision.ref_req,
      path: linkedDecision.relative_path,
    } : null,
    correlation: {
      run_id: approval && approval.run_id
        ? approval.run_id
        : card && card.run_id ? card.run_id : (event && event.data && event.data.run_id ? event.data.run_id : null),
      last_event_type: approval
        ? 'execution_paused'
        : card && card.last_event_type ? card.last_event_type : (event ? event.type : null),
      last_event_ts: approval && approval.paused_at
        ? approval.paused_at
        : card && card.last_event_ts ? card.last_event_ts : (event ? event.ts : null),
      event_id: event ? event.event_id : null,
    },
  };
}

function printHuman(report) {
  process.stdout.write(`target: ${report.target.type}:${report.target.id || 'none'}\n`);
  process.stdout.write(`reason: ${report.reason || 'none'}\n`);
  process.stdout.write(`source: ${report.source || 'unknown'}\n`);
  process.stdout.write(`remediation: ${report.remediation || 'none'}\n`);
  if (report.linked_decision && report.linked_decision.id) {
    process.stdout.write(`linked_decision: ${report.linked_decision.id} (${report.linked_decision.status || 'UNKNOWN'})\n`);
  }
  if (Array.isArray(report.options) && report.options.length > 0) {
    for (const option of report.options) {
      process.stdout.write(`option: ${option.command}\n`);
    }
  }
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
