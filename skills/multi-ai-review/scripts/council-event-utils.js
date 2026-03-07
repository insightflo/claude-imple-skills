'use strict';

const fs = require('fs');
const path = require('path');

const {
  emitRunEvent,
  hashText,
  withExecutorMetadata,
} = require('../../../project-team/scripts/lib/whitebox-run');

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveReviewContext(jobDir) {
  const promptPath = path.join(jobDir, 'prompt.txt');
  const prompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : '';
  const jobMeta = readJsonIfExists(path.join(jobDir, 'job.json')) || {};
  const runId = jobMeta.id || path.basename(jobDir);
  const taskId = jobMeta.taskId || process.env.WHITEBOX_TASK_ID || null;
  return {
    jobMeta,
    promptHash: hashText(prompt),
    projectDir: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    runId,
    taskId,
  };
}

function correlationIdForContext(context) {
  return context.taskId || context.runId;
}

async function emitCouncilEvent(context, type, data, causationId) {
  return emitRunEvent({
    type,
    producer: 'multi-ai-review',
    projectDir: context.projectDir,
    correlationId: correlationIdForContext(context),
    causationId,
    data: {
      run_id: context.runId,
      task_id: context.taskId,
      ...data,
    },
  });
}

function memberSelectionPayload(context, member) {
  return {
    ...withExecutorMetadata(member.name || member.member || member.command, {
      command: String(member.command || ''),
      member_name: String(member.name || member.member || ''),
      host_role: context.jobMeta.hostRole || null,
      chairman_role: context.jobMeta.chairmanRole || null,
      prompt_sha256: context.promptHash,
    }),
  };
}

function summarizeCouncilVerdict(members) {
  const counts = {
    done: 0,
    missing_cli: 0,
    error: 0,
    timed_out: 0,
    canceled: 0,
    queued: 0,
    running: 0,
  };

  for (const member of members || []) {
    const state = String(member && member.state ? member.state : 'unknown');
    if (Object.prototype.hasOwnProperty.call(counts, state)) {
      counts[state] += 1;
    }
  }

  const verdict = (counts.error || counts.missing_cli || counts.timed_out || counts.canceled) ? 'warning' : 'pass';
  return { counts, verdict };
}

module.exports = {
  emitCouncilEvent,
  memberSelectionPayload,
  readJsonIfExists,
  resolveReviewContext,
  summarizeCouncilVerdict,
  withExecutorMetadata,
};
