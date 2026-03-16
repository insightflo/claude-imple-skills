const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork, spawnSync } = require('child_process');

const { writeEvent, readEvents, validateEvents } = require('../../../project-team/scripts/lib/whitebox-events');
const { writeControlCommand } = require('../../../project-team/scripts/lib/whitebox-control');
const { scanForbiddenIntegrationMetadata } = require('../../../project-team/scripts/subscription-policy-check');
const { buildWhiteboxSummary } = require('../../../skills/whitebox/scripts/whitebox-summary');
const { buildExplain } = require('../../../skills/whitebox/scripts/whitebox-explain');
const { dashboardStatePath, startServer } = require('../../../skills/whitebox/scripts/whitebox-dashboard');

const whiteboxControlScript = path.resolve(__dirname, '../../../skills/whitebox/scripts/whitebox-control.js');
const whiteboxControlStateScript = path.resolve(__dirname, '../../../skills/whitebox/scripts/whitebox-control-state.js');
const whiteboxStatusScript = path.resolve(__dirname, '../../../skills/whitebox/scripts/whitebox-status.js');

function makeTempProject(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(root, '.claude', 'collab', 'requests'), { recursive: true });
  return root;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function readControlLog(projectDir) {
  const filePath = path.join(projectDir, '.claude', 'collab', 'control.ndjson');
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim() : '';
  return content ? content.split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
}

function initCollabArtifacts(projectDir) {
  fs.mkdirSync(path.join(projectDir, '.claude', 'collab', 'requests'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, '.claude', 'collab', 'archive'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');
}


describe('whitebox control plane', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
    jest.restoreAllMocks();
    jest.unmock('fs');
    jest.unmock('child_process');
    jest.unmock('../../../project-team/scripts/lib/whitebox-events');
    jest.unmock('../../../project-team/scripts/lib/whitebox-run');
  });

  test('writeEvent redacts secrets and malformed logs fail validation cleanly', async () => {
    const projectDir = makeTempProject('whitebox-events-');
    await writeEvent({
      type: 'fixture.event',
      producer: 'jest',
      data: {
        api_key: 'secret-value',
        contact: 'dev@example.com',
        token: 'super-secret-token',
        note: 'AIzaSyabcdefghijklmnopqrstuvwxyz123456',
      },
    }, { projectDir });

    const eventsPath = path.join(projectDir, '.claude', 'collab', 'events.ndjson');
    fs.appendFileSync(eventsPath, '{"broken":\n', 'utf8');

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    expect(parsed.events[0].data).toMatchObject({
      api_key: '[REDACTED]',
      contact: '[REDACTED_EMAIL]',
      token: '[REDACTED]',
      note: '[REDACTED_TOKEN]',
    });

    const validation = validateEvents({ projectDir });
    expect(validation.ok).toBe(false);
    expect(validation.truncated).toBe(1);
  });

  test('writeEvent stays valid under concurrent multi-process appends', async () => {
    const projectDir = makeTempProject('whitebox-events-concurrent-');
    initCollabArtifacts(projectDir);

    const writerScript = path.join(projectDir, 'event-writer.js');
    fs.writeFileSync(writerScript, [
      `'use strict';`,
      `const { writeEvent } = require(${JSON.stringify(path.resolve(__dirname, '../../../project-team/scripts/lib/whitebox-events.js'))});`,
      `(async () => {`,
      `  for (let i = 0; i < 40; i += 1) {`,
      `    await writeEvent({`,
      `      type: 'fixture.concurrent',`,
      `      producer: 'jest-writer',`,
      `      data: { index: i, pid: process.pid },`,
      `    }, { projectDir: process.argv[2] });`,
      `  }`,
      `})();`,
      ``,
    ].join('\n'), 'utf8');

    await new Promise((resolve, reject) => {
      let settled = 0;
      const children = Array.from({ length: 6 }, () => fork(writerScript, [projectDir], { stdio: 'ignore' }));

      for (const child of children) {
        child.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`concurrent writer exited with code ${code}`));
            return;
          }
          settled += 1;
          if (settled === children.length) resolve();
        });
        child.on('error', reject);
      }
    });

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    const validation = validateEvents({ projectDir });

    expect(parsed.events).toHaveLength(240);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.truncated).toHaveLength(0);
    expect(validation.ok).toBe(true);
  });

  test('buildWhiteboxSummary reflects blocked cards and stale markers', () => {
    const projectDir = makeTempProject('whitebox-summary-');
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 1\n### [ ] T1.1: Fix blocker\n', 'utf8');
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), {
      schema_version: '1.1',
      columns: {
        Backlog: [],
        'In Progress': [],
        Blocked: [{
          id: 'T1.1',
          title: 'T1.1: Fix blocker',
          blocker_reason: 'Task reported blocked',
          blocker_source: 'fixture',
          remediation: 'Resolve the blocker and rerun the affected workflow.',
          run_id: 'run-summary-1',
          last_event_ts: '2026-03-07T00:00:00.000Z',
        }],
        Done: [],
      },
      derived_from: {
        fingerprint: 'fixture-fingerprint',
      },
    });
    writeJson(path.join(projectDir, '.claude', 'collab', 'derived-meta.json'), [{
      artifact: '.claude/collab/board-state.json',
      schema_version: '1.1',
      stale_since: '2026-03-07T00:00:00.000Z',
      reason: 'fixture stale marker',
      cleared_by: null,
    }]);

    const summary = buildWhiteboxSummary(projectDir);
    expect(summary.gate_status).toBe('stale');
    expect(summary.blocked_count).toBe(1);
    expect(summary.run_id).toBe('run-summary-1');
    expect(summary.next_remediation_target).toMatchObject({
      type: 'artifact',
      id: '.claude/collab/board-state.json',
    });
  });

  test('buildWhiteboxSummary surfaces pending read-only decisions', () => {
    const projectDir = makeTempProject('whitebox-summary-decisions-');
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), {
      schema_version: '1.1',
      columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] },
      decisions: [{
        id: 'req-conflict-REQ-77',
        title: 'REQ conflict REQ-77',
        status: 'decision_pending',
        source: 'req-conflict',
        decision_class: 'conflict',
        req_id: 'REQ-77',
        decision_type: 'agent_conflict',
        trigger_type: 'agent_conflict',
        reason: 'Request escalated for mediation.',
        recommendation: 'Review the escalated request and create or apply a DEC ruling before continuing.',
        allowed_actions: [],
      }],
      derived_from: { fingerprint: 'fixture-decision-fingerprint' },
    });

    const summary = buildWhiteboxSummary(projectDir);
    expect(summary.ok).toBe(false);
    expect(summary.gate_status).toBe('decision_pending');
    expect(summary.pending_decision_count).toBe(1);
    expect(summary.pending_conflict_count).toBe(1);
    expect(summary.pending_validation_count).toBe(0);
    expect(summary.pending_decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'req-conflict-REQ-77',
        decision_class: 'conflict',
      }),
    ]));
    expect(summary.next_remediation_target).toMatchObject({
      type: 'decision',
      id: 'req-conflict-REQ-77',
      trigger_type: 'agent_conflict',
    });
  });

  test('buildWhiteboxSummary keeps approvals actionable in mixed intervention states', () => {
    const projectDir = makeTempProject('whitebox-summary-mixed-interventions-');
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), {
      schema_version: '1.1',
      columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] },
      decisions: [
        {
          id: 'gate-mixed-1',
          title: 'Conflict Gate',
          status: 'decision_pending',
          task_id: 'T7.2',
          decision_type: 'agent_conflict',
          trigger_type: 'agent_conflict',
          recommendation: 'Review the conflict and choose a side before continuing.',
          allowed_actions: ['approve', 'reject'],
        },
        {
          id: 'req-conflict-REQ-77',
          title: 'REQ conflict REQ-77',
          status: 'decision_pending',
          source: 'req-conflict',
          decision_class: 'conflict',
          req_id: 'REQ-77',
          decision_type: 'agent_conflict',
          trigger_type: 'agent_conflict',
          reason: 'Request escalated for mediation.',
          recommendation: 'Review the escalated request and create or apply a DEC ruling before continuing.',
          allowed_actions: [],
        },
        {
          id: 'hook-pre-edit-impact-check-T8.4',
          title: 'pre-edit-impact-check intervention',
          status: 'decision_pending',
          source: 'hook-event',
          decision_class: 'validation',
          task_id: 'T8.4',
          decision_type: 'risk_acknowledgement',
          trigger_type: 'risk_acknowledgement',
          reason: 'HIGH risk for T8.4; 1 direct dependent, 4 indirect dependents.',
          recommendation: 'Review the impact report before proceeding.',
          allowed_actions: [],
        },
      ],
      derived_from: { fingerprint: 'fixture-mixed-fingerprint' },
    });
    writeJson(path.join(projectDir, '.claude', 'collab', 'control-state.json'), {
      pending_approval_count: 1,
      pending_approvals: [{
        gate_id: 'gate-mixed-1',
        gate_name: 'Conflict Gate',
        task_id: 'T7.2',
        correlation_id: 'gate:mixed-1',
        created_at: '2026-03-10T00:00:00.000Z',
        trigger_type: 'agent_conflict',
        recommendation: 'Review the conflict and choose a side before continuing.',
        evidence_paths: [],
      }],
    });

    const summary = buildWhiteboxSummary(projectDir);
    expect(summary.gate_status).toBe('approval_required');
    expect(summary.pending_approval_count).toBe(1);
    expect(summary.pending_decision_count).toBe(2);
    expect(summary.pending_conflict_count).toBe(1);
    expect(summary.pending_validation_count).toBe(1);
    expect(summary.pending_decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'req-conflict-REQ-77', decision_class: 'conflict' }),
      expect.objectContaining({ id: 'hook-pre-edit-impact-check-T8.4', decision_class: 'validation' }),
    ]));
    expect(summary.pending_decisions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'gate-mixed-1' }),
    ]));
    expect(summary.next_remediation_target).toMatchObject({
      type: 'approval',
      id: 'gate-mixed-1',
      trigger_type: 'agent_conflict',
    });
  });

  test('buildExplain returns actionable blocker details for a task', () => {
    const projectDir = makeTempProject('whitebox-explain-');
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), {
      columns: {
        Backlog: [],
        'In Progress': [],
        Blocked: [{
          id: 'T9.2',
          title: 'T9.2: Investigate blocked task',
          blocker_reason: 'Task reported blocked',
          blocker_source: 'fixture',
          remediation: 'Resolve the blocker and rerun the affected workflow.',
          run_id: 'run-explain-1',
          last_event_type: 'task_blocked',
          last_event_ts: '2026-03-07T00:00:00.000Z',
        }],
        Done: [],
      },
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), `${JSON.stringify({
      schema_version: '1.0',
      event_id: 'evt-explain-1',
      ts: '2026-03-07T00:00:00.000Z',
      type: 'task_blocked',
      producer: 'fixture',
      correlation_id: 'T9.2',
      data: {
        task_id: 'T9.2',
        status: 'failed',
        run_id: 'run-explain-1',
      },
    })}\n`, 'utf8');

    const report = buildExplain({ projectDir, taskId: 'T9.2', reqId: '', gate: '' });
    expect(report.ok).toBe(true);
    expect(report.reason).toBe('Task reported blocked');
    expect(report.source).toBe('fixture');
    expect(report.remediation).toMatch(/Resolve the blocker/);
    expect(report.correlation.run_id).toBe('run-explain-1');
  });

  test('buildExplain derives trigger metadata from hook decisions', () => {
    const projectDir = makeTempProject('whitebox-explain-hook-trigger-');
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), {
      columns: {
        Backlog: [],
        'In Progress': [],
        Blocked: [{
          id: 'T5.4',
          title: 'T5.4: Review risky change',
          blocker_reason: 'HIGH risk for T5.4; 2 direct dependents, 3 indirect dependents.',
          blocker_source: 'pre-edit-impact-check',
          remediation: 'Review the impact report before proceeding.',
          run_id: 'run-hook-trigger-1',
          last_event_type: 'hook.decision',
          last_event_ts: '2026-03-09T00:00:00.000Z',
        }],
        Done: [],
      },
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), `${JSON.stringify({
      schema_version: '1.0',
      event_id: 'evt-hook-trigger-1',
      ts: '2026-03-09T00:00:00.000Z',
      type: 'hook.decision',
      producer: 'pre-edit-impact-check',
      correlation_id: 'T5.4',
      data: {
        hook: 'pre-edit-impact-check',
        decision: 'warn',
        severity: 'error',
        risk_level: 'HIGH',
        summary: 'HIGH risk for T5.4; 2 direct dependents, 3 indirect dependents.',
        remediation: 'Review the impact report before proceeding.',
        run_id: 'run-hook-trigger-1',
        task_id: 'T5.4',
      },
    })}\n`, 'utf8');

    const report = buildExplain({ projectDir, taskId: 'T5.4', reqId: '', gate: '' });
    expect(report.ok).toBe(true);
    expect(report.trigger).toEqual({
      type: 'risk_acknowledgement',
      recommendation: 'Review the impact report before proceeding.',
    });
    expect(report.reason).toBe('HIGH risk for T5.4; 2 direct dependents, 3 indirect dependents.');
  });

  test('buildExplain links DEC rulings for escalated requests', () => {
    const projectDir = makeTempProject('whitebox-explain-req-decision-');
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), {
      columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] },
      decisions: [{
        id: 'req-conflict-REQ-77',
        title: 'REQ conflict REQ-77',
        status: 'decision_pending',
        req_id: 'REQ-77',
        decision_type: 'agent_conflict',
        trigger_type: 'agent_conflict',
        reason: 'Request escalated for mediation.',
        recommendation: 'Review the escalated request and create or apply a DEC ruling before continuing.',
        allowed_actions: [],
      }],
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'requests', 'REQ-77.md'), `---
id: REQ-77
status: ESCALATED
from: frontend-specialist
---

Escalated contract disagreement.
`, 'utf8');
    fs.mkdirSync(path.join(projectDir, '.claude', 'collab', 'decisions'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'decisions', 'DEC-20260309-001.md'), `---
id: DEC-20260309-001
ref_req: REQ-77
from: ChiefArchitect
to: [BackendSpecialist, FrontendSpecialist]
status: FINAL
timestamp: 2026-03-09T00:00:00.000Z
---
## Decision Summary
Use the backend contract and adapt the frontend mapper.

## Context & Conflict
Negotiation stalled after incompatible schema proposals.

## Required Actions
- BackendSpecialist: keep the contract stable.
- FrontendSpecialist: update the mapper before resuming.
`, 'utf8');

    const report = buildExplain({ projectDir, taskId: '', reqId: 'REQ-77', gate: '' });
    expect(report.ok).toBe(true);
    expect(report.reason).toBe('Use the backend contract and adapt the frontend mapper.');
    expect(report.source).toBe('DEC-20260309-001 (FINAL)');
    expect(report.remediation).toContain('FrontendSpecialist: update the mapper before resuming.');
    expect(report.trigger).toEqual({
      type: 'agent_conflict',
      recommendation: expect.stringContaining('BackendSpecialist: keep the contract stable.'),
    });
    expect(report.linked_decision).toEqual(expect.objectContaining({
      id: 'DEC-20260309-001',
      status: 'FINAL',
      ref_req: 'REQ-77',
      path: '.claude/collab/decisions/DEC-20260309-001.md',
    }));
    expect(report.evidence_paths).toContain(path.join(projectDir, '.claude', 'collab', 'decisions', 'DEC-20260309-001.md'));
  });

  test('buildHealth reports healthy subscription CLI state', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whitebox-health-ok-'));
    const projectDir = path.join(root, 'proj');
    fs.mkdirSync(path.join(projectDir, '.claude', 'collab'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 1\n### [ ] T1.1: Health fixture\n', 'utf8');
    writeJson(path.join(projectDir, '.claude', 'orchestrate-state.json'), { tasks: [] });
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), {
      columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] },
    });
    writeJson(path.join(projectDir, '.claude', 'collab', 'whitebox-summary.json'), {
      gate_status: 'idle',
      blocked_count: 0,
      stale_artifact_count: 0,
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'control.ndjson'), '', 'utf8');
    writeJson(path.join(projectDir, '.claude', 'collab', 'control-state.json'), {
      pending_approval_count: 0,
      pending_approvals: [],
      resolved_approvals: [],
    });

    jest.isolateModules(() => {
      jest.doMock('../../../project-team/scripts/subscription-policy-check', () => ({
        buildReport: () => ({
          executors: { claude: 'ok', codex: 'ok', gemini: 'ok' },
          forbidden_integration: { detected: false },
        }),
      }));
      const { buildHealth } = require('../../../skills/whitebox/scripts/whitebox-health');
      const report = buildHealth(projectDir);
      expect(report.ok).toBe(true);
      expect(report.executors).toEqual({ claude: 'ok', codex: 'ok', gemini: 'ok' });
    });
  });

  test('buildHealth distinguishes host, auth, and missing CLI failures', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whitebox-health-bad-'));
    const projectDir = path.join(root, 'proj');
    fs.mkdirSync(path.join(projectDir, '.claude', 'collab'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 1\n### [ ] T1.2: Health degraded fixture\n', 'utf8');
    writeJson(path.join(projectDir, '.claude', 'orchestrate-state.json'), { tasks: [] });
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), {
      columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] },
    });
    writeJson(path.join(projectDir, '.claude', 'collab', 'whitebox-summary.json'), {
      gate_status: 'idle',
      blocked_count: 0,
      stale_artifact_count: 0,
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');

    jest.isolateModules(() => {
      jest.doMock('../../../project-team/scripts/subscription-policy-check', () => ({
        buildReport: () => ({
          executors: {
            claude: 'host_not_attached',
            codex: 'missing_auth',
            gemini: 'missing_cli',
          },
          forbidden_integration: { detected: false },
        }),
      }));
      const { buildHealth } = require('../../../skills/whitebox/scripts/whitebox-health');
      const report = buildHealth(projectDir);
      expect(report.ok).toBe(false);
      expect(report.executors).toEqual({
        claude: 'host_not_attached',
        codex: 'missing_auth',
        gemini: 'missing_cli',
      });
    });
  });



  test('detects forbidden API-key-first integration metadata', () => {
    const projectDir = makeTempProject('whitebox-forbidden-');
    fs.writeFileSync(path.join(projectDir, '.env'), 'OPENAI_API_KEY=secret\n', 'utf8');

    const report = scanForbiddenIntegrationMetadata(projectDir);
    expect(report.state).toBe('forbidden_integration');
    expect(report.file_metadata_hits).toContain('.env');
  });

  test('captures HITL lifecycle for approval grant, resume, and rejection', () => {
    const projectDir = makeTempProject('whitebox-hitl-');
    const events = [
      {
        schema_version: '1.0',
        event_id: 'evt-hitl-1',
        ts: '2026-03-07T00:00:00.000Z',
        type: 'approval_required',
        producer: 'orchestrate',
        correlation_id: 'run-hitl',
        data: { actor: 'system', task_id: 'T3.1' },
      },
      {
        schema_version: '1.0',
        event_id: 'evt-hitl-1b',
        ts: '2026-03-07T00:00:00.500Z',
        type: 'execution_paused',
        producer: 'orchestrate',
        correlation_id: 'run-hitl',
        data: { actor: 'system', task_id: 'T3.1' },
      },
      {
        schema_version: '1.0',
        event_id: 'evt-hitl-2',
        ts: '2026-03-07T00:00:01.000Z',
        type: 'approval_granted',
        producer: 'whitebox',
        correlation_id: 'run-hitl',
        data: { actor: 'user', task_id: 'T3.1' },
      },
      {
        schema_version: '1.0',
        event_id: 'evt-hitl-3',
        ts: '2026-03-07T00:00:02.000Z',
        type: 'execution_resumed',
        producer: 'orchestrate',
        correlation_id: 'run-hitl',
        data: { actor: 'system', task_id: 'T3.1' },
      },
      {
        schema_version: '1.0',
        event_id: 'evt-hitl-4',
        ts: '2026-03-07T00:00:03.000Z',
        type: 'approval_required',
        producer: 'orchestrate',
        correlation_id: 'run-reject',
        data: { actor: 'system', task_id: 'T3.2' },
      },
      {
        schema_version: '1.0',
        event_id: 'evt-hitl-4b',
        ts: '2026-03-07T00:00:03.500Z',
        type: 'execution_paused',
        producer: 'orchestrate',
        correlation_id: 'run-reject',
        data: { actor: 'system', task_id: 'T3.2' },
      },
      {
        schema_version: '1.0',
        event_id: 'evt-hitl-5',
        ts: '2026-03-07T00:00:04.000Z',
        type: 'approval_rejected',
        producer: 'whitebox',
        correlation_id: 'run-reject',
        data: { actor: 'user', task_id: 'T3.2' },
      },
    ];

    fs.writeFileSync(
      path.join(projectDir, '.claude', 'collab', 'events.ndjson'),
      `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
      'utf8'
    );

    const parsed = readEvents({ projectDir });
    const grantedFlow = parsed.events.filter((event) => event.correlation_id === 'run-hitl');
    const rejectedFlow = parsed.events.filter((event) => event.correlation_id === 'run-reject');

    expect(grantedFlow.map((event) => event.type)).toEqual([
      'approval_required',
      'execution_paused',
      'approval_granted',
      'execution_resumed',
    ]);
    expect(grantedFlow[2].data.actor).toBe('user');
    expect(rejectedFlow.map((event) => event.type)).toEqual([
      'approval_required',
      'execution_paused',
      'approval_rejected',
    ]);
    expect(rejectedFlow[2].data.actor).toBe('user');
  });

  test('emitRunEvent remains best-effort for checkpoint-style telemetry writes', async () => {
    let whiteboxRun;

    jest.isolateModules(() => {
      jest.doMock('../../../project-team/scripts/lib/whitebox-events', () => ({
        writeEvent: jest.fn(async () => {
          throw new Error('telemetry sink unavailable');
        }),
      }));
      whiteboxRun = require('../../../project-team/scripts/lib/whitebox-run');
    });

    await expect(whiteboxRun.emitRunEvent({
      type: 'checkpoint.run.start',
      producer: 'checkpoint',
      projectDir: makeTempProject('whitebox-checkpoint-soft-fail-'),
      correlationId: 'run-checkpoint-soft-fail',
      data: { run_id: 'run-checkpoint-soft-fail' },
    })).resolves.toBeNull();
  });

  test('emitCouncilEvent remains best-effort for review telemetry writes', async () => {
    let utils;
    let emitRunEventMock;

    jest.isolateModules(() => {
      emitRunEventMock = jest.fn(async () => null);
      jest.doMock('../../../project-team/scripts/lib/whitebox-run', () => ({
        ...jest.requireActual('../../../project-team/scripts/lib/whitebox-run'),
        emitRunEvent: emitRunEventMock,
      }));
      utils = require('../../../skills/multi-ai-review/scripts/council-event-utils');
    });

    await expect(utils.emitCouncilEvent({
      projectDir: makeTempProject('whitebox-review-soft-fail-'),
      runId: 'run-review-soft-fail',
      taskId: 'T8.review',
    }, 'multi_ai_review.member.start', {
      member_name: 'claude',
      stage: 'initial_opinion',
    })).resolves.toBeNull();

    expect(emitRunEventMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'multi_ai_review.member.start',
      producer: 'multi-ai-review',
      correlationId: 'T8.review',
    }));
  });

  test('control-state projects pending approvals from canonical gate lifecycle', () => {
    const projectDir = makeTempProject('whitebox-control-state-');
    writeJson(path.join(projectDir, '.claude', 'orchestrate', 'auto-state.json'), {
      session_id: 'run-control-state-1',
      pending_gate: {
        gate_id: 'gate-control-state-1',
        gate_name: 'Final Gate',
        stage: 'final_gate',
        task_id: 'T4.1',
        run_id: 'run-control-state-1',
        correlation_id: 'gate:run-control-state-1:final_gate',
        choices: ['approve', 'reject'],
        default_behavior: 'wait_for_operator',
        timeout_policy: 'wait_60000ms',
        created_at: '2026-03-07T00:00:00.000Z',
        preview: 'fixture preview',
      },
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), `${JSON.stringify({
      schema_version: '1.0',
      event_id: 'evt-control-state-1',
      ts: '2026-03-07T00:00:00.000Z',
      type: 'approval_required',
      producer: 'orchestrate-auto',
      correlation_id: 'gate:run-control-state-1:final_gate',
      data: {
        actor: 'system',
        gate_id: 'gate-control-state-1',
        task_id: 'T4.1',
        run_id: 'run-control-state-1',
        choices: ['approve', 'reject'],
        default_behavior: 'wait_for_operator',
        timeout_policy: 'wait_60000ms',
      },
    })}\n${JSON.stringify({
      schema_version: '1.0',
      event_id: 'evt-control-state-2',
      ts: '2026-03-07T00:00:01.000Z',
      type: 'execution_paused',
      producer: 'orchestrate-auto',
      correlation_id: 'gate:run-control-state-1:final_gate',
      data: {
        actor: 'system',
        gate_id: 'gate-control-state-1',
        task_id: 'T4.1',
        run_id: 'run-control-state-1',
      },
    })}\n`, 'utf8');

    const result = spawnSync(process.execPath, [whiteboxControlStateScript, `--project-dir=${projectDir}`, '--json'], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.pending_approval_count).toBe(1);
    expect(state.pending_approvals[0]).toMatchObject({
      gate_id: 'gate-control-state-1',
      task_id: 'T4.1',
      gate_name: 'Final Gate',
      correlation_id: 'gate:run-control-state-1:final_gate',
    });
  });

  test('control-state preserves trigger metadata for selective interventions', () => {
    const projectDir = makeTempProject('whitebox-control-trigger-');
    writeJson(path.join(projectDir, '.claude', 'orchestrate', 'auto-state.json'), {
      session_id: 'run-control-trigger-1',
      pending_gate: {
        gate_id: 'gate-control-trigger-1',
        gate_name: 'Conflict Gate',
        stage: 'resolve_conflict',
        task_id: 'T4.9',
        run_id: 'run-control-trigger-1',
        correlation_id: 'gate:run-control-trigger-1:resolve_conflict',
        choices: ['approve', 'reject'],
        default_behavior: 'wait_for_operator',
        timeout_policy: 'wait_60000ms',
        created_at: '2026-03-07T00:00:00.000Z',
        preview: 'Builder and Reviewer disagree.',
        trigger_type: 'agent_conflict',
        trigger_reason: 'Agent conflict detected for T4.9.',
        recommendation: 'Review both options and choose the path you want to continue.',
      },
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), `${JSON.stringify({
      schema_version: '1.0',
      event_id: 'evt-control-trigger-1',
      ts: '2026-03-07T00:00:00.000Z',
      type: 'approval_required',
      producer: 'orchestrate-auto',
      correlation_id: 'gate:run-control-trigger-1:resolve_conflict',
      data: {
        actor: 'system',
        gate_id: 'gate-control-trigger-1',
        task_id: 'T4.9',
        run_id: 'run-control-trigger-1',
        choices: ['approve', 'reject'],
        trigger_type: 'agent_conflict',
        trigger_reason: 'Agent conflict detected for T4.9.',
        recommendation: 'Review both options and choose the path you want to continue.',
      },
    })}
${JSON.stringify({
      schema_version: '1.0',
      event_id: 'evt-control-trigger-2',
      ts: '2026-03-07T00:00:01.000Z',
      type: 'execution_paused',
      producer: 'orchestrate-auto',
      correlation_id: 'gate:run-control-trigger-1:resolve_conflict',
      data: {
        actor: 'system',
        gate_id: 'gate-control-trigger-1',
        task_id: 'T4.9',
        run_id: 'run-control-trigger-1',
      },
    })}
`, 'utf8');

    const result = spawnSync(process.execPath, [whiteboxControlStateScript, `--project-dir=${projectDir}`, '--json'], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const state = JSON.parse(result.stdout);
    expect(state.pending_approvals[0]).toMatchObject({
      gate_id: 'gate-control-trigger-1',
      task_id: 'T4.9',
      trigger_type: 'agent_conflict',
      trigger_reason: 'Agent conflict detected for T4.9.',
      recommendation: 'Review both options and choose the path you want to continue.',
    });
  });

  test('whitebox control list and show expose pending approvals from derived state', () => {
    const projectDir = makeTempProject('whitebox-control-cli-');
    writeJson(path.join(projectDir, '.claude', 'collab', 'control-state.json'), {
      pending_approval_count: 1,
      pending_approvals: [{
        gate_id: 'gate-cli-1',
        task_id: 'T4.2',
        correlation_id: 'gate:cli-1',
        evidence_paths: [path.join(projectDir, '.claude', 'collab', 'events.ndjson')],
      }],
      resolved_approvals: [],
    });

    const list = spawnSync(process.execPath, [whiteboxControlScript, 'list', `--project-dir=${projectDir}`, '--json'], {
      encoding: 'utf8',
    });
    const show = spawnSync(process.execPath, [whiteboxControlScript, 'show', `--project-dir=${projectDir}`, '--gate-id=gate-cli-1', '--json'], {
      encoding: 'utf8',
    });

    expect(list.status).toBe(0);
    expect(show.status).toBe(0);
    expect(JSON.parse(list.stdout)).toMatchObject({
      pending_approval_count: 1,
      approvals: [expect.objectContaining({ gate_id: 'gate-cli-1', task_id: 'T4.2' })],
    });
    expect(JSON.parse(show.stdout)).toMatchObject({
      result: 'ok',
      gate: expect.objectContaining({ gate_id: 'gate-cli-1', task_id: 'T4.2' }),
    });
  });

  test('whitebox control CLI returns invalid_command exit semantics', () => {
    const projectDir = makeTempProject('whitebox-control-invalid-');
    const result = spawnSync(process.execPath, [whiteboxControlScript, 'approve', `--project-dir=${projectDir}`, '--json'], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(5);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      result: 'invalid_command',
    });
  });

  test('whitebox control CLI returns stale_target exit semantics', () => {
    const projectDir = makeTempProject('whitebox-control-stale-');
    writeJson(path.join(projectDir, '.claude', 'orchestrate', 'auto-state.json'), {
      session_id: 'run-stale-1',
      pending_gate: null,
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), `${JSON.stringify({
      schema_version: '1.0',
      event_id: 'evt-stale-1',
      ts: '2026-03-07T00:00:00.000Z',
      type: 'approval_required',
      producer: 'orchestrate-auto',
      correlation_id: 'gate:stale-1',
      data: { gate_id: 'gate-stale-1', task_id: 'T4.4', run_id: 'run-stale-1', choices: ['approve', 'reject'] },
    })}\n${JSON.stringify({
      schema_version: '1.0',
      event_id: 'evt-stale-2',
      ts: '2026-03-07T00:00:01.000Z',
      type: 'execution_paused',
      producer: 'orchestrate-auto',
      correlation_id: 'gate:stale-1',
      data: { gate_id: 'gate-stale-1', task_id: 'T4.4', run_id: 'run-stale-1' },
    })}\n${JSON.stringify({
      schema_version: '1.0',
      event_id: 'evt-stale-3',
      ts: '2026-03-07T00:00:02.000Z',
      type: 'approval_granted',
      producer: 'orchestrate-auto',
      correlation_id: 'gate:stale-1',
      data: { gate_id: 'gate-stale-1', task_id: 'T4.4', run_id: 'run-stale-1' },
    })}\n`, 'utf8');
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'control.ndjson'), '', 'utf8');

    const result = spawnSync(process.execPath, [whiteboxControlScript, 'reject', `--project-dir=${projectDir}`, '--gate-id=gate-stale-1', '--json'], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(4);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      result: 'stale_target',
    });
  });

  test('whitebox control CLI returns write_failed exit semantics', () => {
    const projectDir = makeTempProject('whitebox-control-write-failed-');
    writeJson(path.join(projectDir, '.claude', 'orchestrate', 'auto-state.json'), {
      session_id: 'run-write-fail-1',
      pending_gate: {
        gate_id: 'gate-write-fail-1',
        gate_name: 'Final Gate',
        stage: 'final_gate',
        task_id: 'T4.5',
        run_id: 'run-write-fail-1',
        correlation_id: 'gate:write-fail-1',
        choices: ['approve', 'reject'],
        default_behavior: 'wait_for_operator',
        timeout_policy: 'wait_60000ms',
        created_at: '2026-03-07T00:00:00.000Z',
        preview: 'write failure fixture',
      },
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), `${JSON.stringify({
      schema_version: '1.0',
      event_id: 'evt-write-fail-1',
      ts: '2026-03-07T00:00:00.000Z',
      type: 'approval_required',
      producer: 'orchestrate-auto',
      correlation_id: 'gate:write-fail-1',
      data: { gate_id: 'gate-write-fail-1', task_id: 'T4.5', run_id: 'run-write-fail-1', choices: ['approve', 'reject'] },
    })}\n${JSON.stringify({
      schema_version: '1.0',
      event_id: 'evt-write-fail-2',
      ts: '2026-03-07T00:00:01.000Z',
      type: 'execution_paused',
      producer: 'orchestrate-auto',
      correlation_id: 'gate:write-fail-1',
      data: { gate_id: 'gate-write-fail-1', task_id: 'T4.5', run_id: 'run-write-fail-1' },
    })}\n`, 'utf8');
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'control.ndjson'), '', 'utf8');

    const result = spawnSync(process.execPath, [whiteboxControlScript, 'approve', `--project-dir=${projectDir}`, '--gate-id=gate-write-fail-1', '--json'], {
      encoding: 'utf8',
      env: { ...process.env, WHITEBOX_FORCE_CONTROL_WRITE_FAILURE: '1' },
    });

    expect(result.status).toBe(6);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      result: 'write_failed',
    });
  });

  test('whitebox status reflects pending approval queue', () => {
    const projectDir = makeTempProject('whitebox-status-pending-');
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 4\n### [ ] T4.3: Pending approval\n', 'utf8');
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), {
      columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] },
      derived_from: {},
    });
    writeJson(path.join(projectDir, '.claude', 'collab', 'control-state.json'), {
      pending_approval_count: 1,
      pending_approvals: [{
        gate_id: 'gate-status-1',
        task_id: 'T4.3',
        correlation_id: 'gate:status-1',
        evidence_paths: [],
      }],
      resolved_approvals: [],
      control_health: { control_log: { ok: true }, events_log: { ok: true } },
    });
    writeJson(path.join(projectDir, '.claude', 'collab', 'whitebox-summary.json'), {
      gate_status: 'approval_required',
      blocked_count: 0,
      pending_approval_count: 1,
      stale_artifact_count: 0,
      pending_approvals: [{ gate_id: 'gate-status-1', task_id: 'T4.3' }],
      next_remediation_target: { type: 'approval', id: 'gate-status-1', reason: 'Approval required for T4.3' },
      tasks: { done: 0, total: 1 },
    });

    const result = spawnSync(process.execPath, [whiteboxStatusScript, `--project-dir=${projectDir}`, '--json'], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      pending_approval_count: 1,
      gate_status: 'approval_required',
      pending_approvals: [expect.objectContaining({ gate_id: 'gate-status-1', task_id: 'T4.3' })],
    });
  });

  test('whitebox health detects malformed control log without crashing', () => {
    const projectDir = makeTempProject('whitebox-health-control-');
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 5\n### [ ] T5.1: Health control log\n', 'utf8');
    writeJson(path.join(projectDir, '.claude', 'orchestrate-state.json'), { tasks: [] });
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), { columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] } });
    writeJson(path.join(projectDir, '.claude', 'collab', 'whitebox-summary.json'), { gate_status: 'idle', blocked_count: 0, stale_artifact_count: 0 });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'control.ndjson'), '{"broken":\n', 'utf8');
    writeJson(path.join(projectDir, '.claude', 'collab', 'control-state.json'), { pending_approval_count: 0, pending_approvals: [], resolved_approvals: [] });

    jest.isolateModules(() => {
      jest.doMock('../../../project-team/scripts/subscription-policy-check', () => ({
        buildReport: () => ({
          executors: { claude: 'ok', codex: 'ok', gemini: 'ok' },
          forbidden_integration: { detected: false },
        }),
      }));
      const { buildHealth } = require('../../../skills/whitebox/scripts/whitebox-health');
      const report = buildHealth(projectDir);
      expect(report.ok).toBe(false);
      expect(report.control_integrity.ok).toBe(false);
    });
  });

  test('whitebox explain returns approve and reject options for pending approvals', () => {
    const projectDir = makeTempProject('whitebox-explain-options-');
    writeJson(path.join(projectDir, '.claude', 'collab', 'control-state.json'), {
      pending_approval_count: 1,
      pending_approvals: [{
        gate_id: 'gate-explain-1',
        task_id: 'T6.1',
        run_id: 'run-explain-options-1',
        paused_at: '2026-03-07T00:00:00.000Z',
        evidence_paths: [
          path.join(projectDir, '.claude', 'collab', 'events.ndjson'),
          path.join(projectDir, '.claude', 'collab', 'control.ndjson'),
        ],
      }],
    });
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), { columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] } });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');

    const report = buildExplain({ projectDir, taskId: 'T6.1', reqId: '', gate: '' });
    expect(report.ok).toBe(true);
    expect(report.options).toHaveLength(2);
    expect(report.options.map((option) => option.command)).toEqual([
      `node ${JSON.stringify(whiteboxControlScript)} approve ${JSON.stringify(`--project-dir=${projectDir}`)} --gate-id=gate-explain-1 --json`,
      `node ${JSON.stringify(whiteboxControlScript)} reject ${JSON.stringify(`--project-dir=${projectDir}`)} --gate-id=gate-explain-1 --json`,
    ]);
  });

  test('whitebox explain includes trigger metadata for selective interventions', () => {
    const projectDir = makeTempProject('whitebox-explain-trigger-');
    writeJson(path.join(projectDir, '.claude', 'collab', 'control-state.json'), {
      pending_approval_count: 1,
      pending_approvals: [{
        gate_id: 'gate-explain-trigger-1',
        task_id: 'T6.9',
        trigger_type: 'risk_acknowledgement',
        trigger_reason: 'This step touches a high-risk path and needs explicit acknowledgement.',
        recommendation: 'Approve only if you want the risky path to continue unchanged.',
        evidence_paths: [path.join(projectDir, '.claude', 'collab', 'events.ndjson')],
      }],
    });
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), { columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] } });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');

    const report = buildExplain({ projectDir, taskId: 'T6.9', reqId: '', gate: '' });
    expect(report.ok).toBe(true);
    expect(report.trigger).toEqual({
      type: 'risk_acknowledgement',
      recommendation: 'Approve only if you want the risky path to continue unchanged.',
    });
    expect(report.reason).toBe('This step touches a high-risk path and needs explicit acknowledgement.');
    expect(report.remediation).toBe('Approve only if you want the risky path to continue unchanged.');
    expect(report.options[0].recommendation).toBe('Approve only if you want the risky path to continue unchanged.');
  });

  test('whitebox explain stays safe when evidence is missing', () => {
    const projectDir = makeTempProject('whitebox-explain-missing-');
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), { columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] } });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');

    const report = buildExplain({ projectDir, taskId: 'T6.404', reqId: '', gate: '' });
    expect(report.ok).toBe(false);
    expect(report.options).toEqual([]);
  });




















  test('dashboard approve action routes through whitebox control CLI', async () => {
    const projectDir = makeTempProject('whitebox-tui-approve-');
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 7\n### [ ] T7.2: Interactive approval\n', 'utf8');
    writeJson(path.join(projectDir, '.claude', 'orchestrate-state.json'), { tasks: [] });
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), {
      columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] },
      derived_from: {},
    });
    writeJson(path.join(projectDir, '.claude', 'collab', 'whitebox-summary.json'), {
      gate_status: 'approval_required',
      blocked_count: 0,
      pending_approval_count: 1,
      stale_artifact_count: 0,
      tasks: { done: 0, total: 1 },
      next_remediation_target: { id: 'gate-tui-1', reason: 'Approval required for T7.2', remediation: 'Approve or reject' },
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'control.ndjson'), '', 'utf8');
    await writeEvent({
      type: 'approval_required',
      producer: 'jest',
      correlation_id: 'gate:tui-1',
      data: {
        gate_id: 'gate-tui-1',
        gate_name: 'Interactive approval',
        task_id: 'T7.2',
        choices: ['approve', 'reject'],
        preview: 'Approval required for T7.2',
      },
    }, { projectDir });
    await writeEvent({
      type: 'execution_paused',
      producer: 'jest',
      correlation_id: 'gate:tui-1',
      data: {
        gate_id: 'gate-tui-1',
        task_id: 'T7.2',
        trigger_type: 'user_confirmation',
        trigger_reason: 'Approval required for T7.2',
      },
    }, { projectDir });

    const { server, state } = await startServer({ projectDir, host: '127.0.0.1', port: 0 });
    try {
      const response = await fetch(new URL('/api/control', state.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approve', gateId: 'gate-tui-1' }),
      });
      const payload = await response.json();
      const controlLog = readControlLog(projectDir);

      expect(response.status).toBe(200);
      expect(payload.result).toBe('approved');
      expect(controlLog).toHaveLength(1);
      expect(controlLog[0]).toMatchObject({
        type: 'approve',
        target: { gate_id: 'gate-tui-1', task_id: 'T7.2' },
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dashboardStatePath(projectDir), { force: true });
    }
  });

  test('writeControlCommand records one canonical command, emits audit, and dedupes by idempotency key', async () => {
    const projectDir = makeTempProject('whitebox-control-command-');

    const input = {
      type: 'approve',
      producer: 'whitebox-cli',
      target: { gate_id: 'gate-1', task_id: 'T8.3c' },
      actor: { id: 'operator-1' },
      correlation_id: 'run-control-1',
    };

    const first = await writeControlCommand(input, { projectDir });
    const second = await writeControlCommand(input, { projectDir });

    expect(first.status).toBe('recorded');
    expect(second.status).toBe('already_applied');

    const controlLines = fs.readFileSync(path.join(projectDir, '.claude', 'collab', 'control.ndjson'), 'utf8')
      .trim()
      .split('\n');
    expect(controlLines).toHaveLength(1);

    const commands = controlLines.map((line) => JSON.parse(line));
    expect(commands[0]).toMatchObject({
      type: 'approve',
      producer: 'whitebox-cli',
      correlation_id: 'run-control-1',
      target: { gate_id: 'gate-1', task_id: 'T8.3c' },
    });

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    const auditEvents = parsed.events.filter((event) => event.type === 'whitebox.control.command.recorded');
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      correlation_id: 'run-control-1',
      data: {
        control_type: 'approve',
        target: { gate_id: 'gate-1', task_id: 'T8.3c' },
        actor: { id: 'operator-1' },
      },
    });

    const markers = JSON.parse(fs.readFileSync(path.join(projectDir, '.claude', 'collab', 'derived-meta.json'), 'utf8'));
    expect(markers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifact: '.claude/collab/control-state.json',
        cleared_by: null,
        reason: 'control command approve; rebuild required',
      }),
    ]));
  });

  test('writeControlCommand stays fail-hard when canonical control persistence fails', async () => {
    const projectDir = makeTempProject('whitebox-control-command-fail-');
    let controlApi;

    jest.isolateModules(() => {
      jest.doMock('fs', () => {
        const actual = jest.requireActual('fs');
        return {
          ...actual,
          appendFileSync: jest.fn((filePath, ...rest) => {
            if (String(filePath).endsWith(path.join('.claude', 'collab', 'control.ndjson'))) {
              const error = new Error('control append failed');
              error.code = 'LOCK_TIMEOUT';
              throw error;
            }
            return actual.appendFileSync(filePath, ...rest);
          }),
        };
      });
      controlApi = require('../../../project-team/scripts/lib/whitebox-control');
    });

    await expect(controlApi.writeControlCommand({
      type: 'reject',
      producer: 'whitebox-cli',
      target: { gate_id: 'gate-2' },
      actor: { id: 'operator-2' },
      correlation_id: 'run-control-2',
    }, { projectDir })).rejects.toMatchObject({
      code: 'WHITEBOX_CONTROL_WRITE_FAILED',
    });

    const controlPath = path.join(projectDir, '.claude', 'collab', 'control.ndjson');
    expect(fs.existsSync(controlPath)).toBe(false);
  });

  test('writeControlCommand can repair missing audit emission on idempotent retry', async () => {
    const projectDir = makeTempProject('whitebox-control-command-repair-');
    let controlApi;
    let auditFailures = 0;

    jest.isolateModules(() => {
      jest.doMock('../../../project-team/scripts/lib/whitebox-events', () => {
        const actual = jest.requireActual('../../../project-team/scripts/lib/whitebox-events');
        return {
          ...actual,
          writeEvent: jest.fn(async (event, options) => {
            if (event.type === 'whitebox.control.command.recorded' && auditFailures === 0) {
              auditFailures += 1;
              const error = new Error('audit emission failed');
              error.code = 'LOCK_TIMEOUT';
              throw error;
            }
            return actual.writeEvent(event, options);
          }),
        };
      });
      controlApi = require('../../../project-team/scripts/lib/whitebox-control');
    });

    const input = {
      type: 'approve',
      producer: 'whitebox-cli',
      target: { gate_id: 'gate-repair-1' },
      actor: { id: 'operator-repair' },
      correlation_id: 'run-control-repair-1',
    };

    await expect(controlApi.writeControlCommand(input, { projectDir })).rejects.toMatchObject({
      code: 'WHITEBOX_CONTROL_AUDIT_FAILED',
    });

    const retry = await controlApi.writeControlCommand(input, { projectDir });
    expect(retry.status).toBe('already_applied');

    const controlLines = fs.readFileSync(path.join(projectDir, '.claude', 'collab', 'control.ndjson'), 'utf8')
      .trim()
      .split('\n');
    expect(controlLines).toHaveLength(1);

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    const auditEvents = parsed.events.filter((event) => event.type === 'whitebox.control.command.recorded');
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].correlation_id).toBe('run-control-repair-1');
  });








});
