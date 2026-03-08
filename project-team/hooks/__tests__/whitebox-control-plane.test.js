const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { EventEmitter } = require('events');

const { writeEvent, readEvents, validateEvents } = require('../../../project-team/scripts/lib/whitebox-events');
const { writeControlCommand } = require('../../../project-team/scripts/lib/whitebox-control');
const { scanForbiddenIntegrationMetadata } = require('../../../project-team/scripts/subscription-policy-check');
const { buildWhiteboxSummary } = require('../../../skills/whitebox/scripts/whitebox-summary');
const { buildExplain } = require('../../../skills/whitebox/scripts/whitebox-explain');

const boardBuilderScript = path.resolve(__dirname, '../../../skills/task-board/scripts/board-builder.js');
const whiteboxControlScript = path.resolve(__dirname, '../../../skills/whitebox/scripts/whitebox-control.js');
const whiteboxControlStateScript = path.resolve(__dirname, '../../../skills/whitebox/scripts/whitebox-control-state.js');
const whiteboxStatusScript = path.resolve(__dirname, '../../../skills/whitebox/scripts/whitebox-status.js');
const boardShowScript = path.resolve(__dirname, '../../../skills/task-board/scripts/board-show.sh');
const taskBoardSyncScript = path.resolve(__dirname, '../task-board-sync.js');
const autoEventLogScript = path.resolve(__dirname, '../../../skills/orchestrate-standalone/scripts/auto/event-log.js');

function makeTempProject(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(root, '.claude', 'collab', 'requests'), { recursive: true });
  return root;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function initCollabArtifacts(projectDir) {
  fs.mkdirSync(path.join(projectDir, '.claude', 'collab', 'requests'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, '.claude', 'collab', 'archive'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');
}

function createMockCli() {
  const cli = new EventEmitter();
  cli.stdout = new EventEmitter();
  cli.stderr = new EventEmitter();
  cli.stdin = {
    write: jest.fn(),
    end: jest.fn(),
  };
  cli.kill = jest.fn();
  return cli;
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

  test('board builder remains deterministic and clears stale markers after recovery', () => {
    const projectDir = makeTempProject('whitebox-board-');
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 2\n### [ ] T2.1: Stabilize board\n', 'utf8');
    writeJson(path.join(projectDir, '.claude', 'orchestrate-state.json'), {
      tasks: [{ id: 'T2.1', title: 'Stabilize board', status: 'failed', owner: 'fixture-agent' }],
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), `${JSON.stringify({
      schema_version: '1.0',
      event_id: 'evt-board-1',
      ts: '2026-03-07T00:00:00.000Z',
      type: 'task_blocked',
      producer: 'fixture',
      correlation_id: 'T2.1',
      data: { task_id: 'T2.1', status: 'failed', run_id: 'run-board-1' },
    })}\n`, 'utf8');

    const runDry = () => spawnSync(process.execPath, [boardBuilderScript, `--project-dir=${projectDir}`, '--dry-run', '--json'], {
      encoding: 'utf8',
    });

    const first = JSON.parse(runDry().stdout);
    const second = JSON.parse(runDry().stdout);
    delete first.generated_at;
    delete second.generated_at;
    expect(first).toEqual(second);

    const failed = spawnSync(process.execPath, [boardBuilderScript, `--project-dir=${projectDir}`], {
      encoding: 'utf8',
      env: { ...process.env, WHITEBOX_FORCE_DERIVED_WRITE_FAILURE: '1' },
    });
    expect(failed.status).toBe(1);

    const recovered = spawnSync(process.execPath, [boardBuilderScript, `--project-dir=${projectDir}`], {
      encoding: 'utf8',
      env: { ...process.env },
    });
    expect(recovered.status).toBe(0);

    const markers = JSON.parse(fs.readFileSync(path.join(projectDir, '.claude', 'collab', 'derived-meta.json'), 'utf8'));
    expect(markers.some((entry) => entry.artifact === '.claude/collab/board-state.json' && entry.cleared_by === 'board-builder')).toBe(true);
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

  test('auto orchestrator file gate approve emits canonical resume lifecycle', async () => {
    const projectDir = makeTempProject('whitebox-auto-approve-');
    let orchestrator;
    let engineAdapter;

    jest.isolateModules(() => {
      orchestrator = require('../../../skills/orchestrate-standalone/scripts/auto/auto-orchestrator');
      engineAdapter = require('../../../skills/orchestrate-standalone/scripts/auto/engine-adapter');
    });

    const autoState = engineAdapter.initAutoState('Approve gate fixture', projectDir);
    const decisionPromise = orchestrator.resolveGateDecision(
      null,
      'Contract Gate',
      'contract preview',
      'unused modify prompt',
      autoState,
      {
        projectDir,
        stage: 'define_contract',
        approvalPollIntervalMs: 10,
        approvalWaitMs: 500,
      }
    );

    setTimeout(() => {
      const current = engineAdapter.loadAutoState(projectDir);
      void writeControlCommand({
        type: 'approve',
        producer: 'whitebox-cli',
        target: { gate_id: current.pending_gate.gate_id },
        actor: { id: 'operator-approve' },
        correlation_id: current.pending_gate.correlation_id,
      }, { projectDir });
    }, 25);

    const decision = await decisionPromise;
    expect(decision.action).toBe('approve');

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    const flow = parsed.events.filter((event) => event.correlation_id === decision.gate.correlation_id);
    expect(flow.map((event) => event.type)).toEqual([
      'approval_required',
      'execution_paused',
      'whitebox.control.command.recorded',
      'approval_granted',
      'execution_resumed',
    ]);

    const reloaded = engineAdapter.loadAutoState(projectDir);
    expect(reloaded.pending_gate).toBeNull();

    const bridge = JSON.parse(fs.readFileSync(path.join(projectDir, '.claude', 'orchestrate-state.json'), 'utf8'));
    expect(bridge.pending_gate).toBeNull();
  });

  test('auto orchestrator file gate reject emits canonical stop lifecycle without resume', async () => {
    const projectDir = makeTempProject('whitebox-auto-reject-');
    let orchestrator;
    let engineAdapter;

    jest.isolateModules(() => {
      orchestrator = require('../../../skills/orchestrate-standalone/scripts/auto/auto-orchestrator');
      engineAdapter = require('../../../skills/orchestrate-standalone/scripts/auto/engine-adapter');
    });

    const autoState = engineAdapter.initAutoState('Reject gate fixture', projectDir);
    const decisionPromise = orchestrator.resolveGateDecision(
      null,
      'Final Gate',
      'final preview',
      'unused modify prompt',
      autoState,
      {
        projectDir,
        stage: 'final_gate',
        approvalPollIntervalMs: 10,
        approvalWaitMs: 500,
      }
    );

    setTimeout(() => {
      const current = engineAdapter.loadAutoState(projectDir);
      void writeControlCommand({
        type: 'reject',
        producer: 'whitebox-cli',
        target: { gate_id: current.pending_gate.gate_id },
        actor: { id: 'operator-reject' },
        correlation_id: current.pending_gate.correlation_id,
      }, { projectDir });
    }, 25);

    const decision = await decisionPromise;
    expect(decision.action).toBe('reject');

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    const flow = parsed.events.filter((event) => event.correlation_id === decision.gate.correlation_id);
    expect(flow.map((event) => event.type)).toEqual([
      'approval_required',
      'execution_paused',
      'whitebox.control.command.recorded',
      'approval_rejected',
    ]);
    expect(flow.some((event) => event.type === 'execution_resumed')).toBe(false);

    const bridge = JSON.parse(fs.readFileSync(path.join(projectDir, '.claude', 'orchestrate-state.json'), 'utf8'));
    expect(bridge.pending_gate).toBeNull();
  });

  test('auto orchestrator resume path does not duplicate approval lifecycle after partial recovery', async () => {
    const projectDir = makeTempProject('whitebox-auto-idempotent-');
    let orchestrator;
    let engineAdapter;

    jest.isolateModules(() => {
      orchestrator = require('../../../skills/orchestrate-standalone/scripts/auto/auto-orchestrator');
      engineAdapter = require('../../../skills/orchestrate-standalone/scripts/auto/engine-adapter');
    });

    let autoState = engineAdapter.initAutoState('Idempotent gate fixture', projectDir);
    autoState.pending_gate = {
      gate_id: 'gate-recover-1',
      gate_name: 'Contract Gate',
      stage: 'define_contract',
      task_id: null,
      run_id: autoState.session_id,
      correlation_id: `gate:${autoState.session_id}:define_contract`,
      choices: ['approve', 'reject'],
      default_behavior: 'wait_for_operator',
      timeout_policy: 'wait_500ms',
      created_at: '2026-03-07T00:00:00.000Z',
      preview: 'contract preview',
    };
    autoState = engineAdapter.saveAutoState(autoState, projectDir);

    await writeControlCommand({
      type: 'approve',
      producer: 'whitebox-cli',
      target: { gate_id: autoState.pending_gate.gate_id },
      actor: { id: 'operator-recover' },
      correlation_id: autoState.pending_gate.correlation_id,
    }, { projectDir });

    await writeEvent({
      type: 'approval_required',
      producer: 'orchestrate-auto',
      correlation_id: autoState.pending_gate.correlation_id,
      data: {
        actor: 'system',
        gate_id: autoState.pending_gate.gate_id,
        task_id: null,
        run_id: autoState.pending_gate.run_id,
        choices: ['approve', 'reject'],
        default_behavior: 'wait_for_operator',
        timeout_policy: 'wait_500ms',
      },
    }, { projectDir });
    await writeEvent({
      type: 'execution_paused',
      producer: 'orchestrate-auto',
      correlation_id: autoState.pending_gate.correlation_id,
      data: {
        actor: 'system',
        gate_id: autoState.pending_gate.gate_id,
        task_id: null,
        run_id: autoState.pending_gate.run_id,
      },
    }, { projectDir });
    await writeEvent({
      type: 'approval_granted',
      producer: 'orchestrate-auto',
      correlation_id: autoState.pending_gate.correlation_id,
      data: {
        actor: 'operator-recover',
        gate_id: autoState.pending_gate.gate_id,
        task_id: null,
        run_id: autoState.pending_gate.run_id,
      },
    }, { projectDir });
    await writeEvent({
      type: 'execution_resumed',
      producer: 'orchestrate-auto',
      correlation_id: autoState.pending_gate.correlation_id,
      data: {
        actor: 'system',
        gate_id: autoState.pending_gate.gate_id,
        task_id: null,
        run_id: autoState.pending_gate.run_id,
      },
    }, { projectDir });

    const correlationId = autoState.pending_gate.correlation_id;
    const decision = await orchestrator.waitForFileGateDecision(autoState, 'Contract Gate', 'contract preview', {
      projectDir,
      stage: 'define_contract',
      approvalPollIntervalMs: 10,
      approvalWaitMs: 50,
    });

    expect(decision.action).toBe('approve');

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    const flow = parsed.events.filter((event) => event.correlation_id === correlationId);
    expect(flow.filter((event) => event.type === 'approval_granted')).toHaveLength(1);
    expect(flow.filter((event) => event.type === 'execution_resumed')).toHaveLength(1);
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

  test('duplicate approve is idempotent and does not duplicate approval_granted', async () => {
    const projectDir = makeTempProject('whitebox-cli-idempotent-');
    let orchestrator;
    let engineAdapter;

    jest.isolateModules(() => {
      orchestrator = require('../../../skills/orchestrate-standalone/scripts/auto/auto-orchestrator');
      engineAdapter = require('../../../skills/orchestrate-standalone/scripts/auto/engine-adapter');
    });

    const autoState = engineAdapter.initAutoState('CLI idempotency fixture', projectDir);
    const decisionPromise = orchestrator.resolveGateDecision(
      null,
      'Final Gate',
      'fixture preview',
      'unused modify prompt',
      autoState,
      {
        projectDir,
        stage: 'final_gate',
        approvalPollIntervalMs: 10,
        approvalWaitMs: 500,
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 25));
    const state = JSON.parse(fs.readFileSync(path.join(projectDir, '.claude', 'orchestrate', 'auto-state.json'), 'utf8'));
    const first = spawnSync(process.execPath, [whiteboxControlScript, 'approve', `--project-dir=${projectDir}`, `--gate-id=${state.pending_gate.gate_id}`, '--json'], { encoding: 'utf8' });
    const decision = await decisionPromise;
    const second = spawnSync(process.execPath, [whiteboxControlScript, 'approve', `--project-dir=${projectDir}`, `--gate-id=${state.pending_gate.gate_id}`, '--json'], { encoding: 'utf8' });

    expect(decision.action).toBe('approve');
    expect(JSON.parse(first.stdout).result).toBe('approved');
    expect(JSON.parse(second.stdout).result).toBe('already_applied');

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    const granted = parsed.events.filter((event) => event.correlation_id === decision.gate.correlation_id && event.type === 'approval_granted');
    expect(granted).toHaveLength(1);
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

  test('whitebox explain stays safe when evidence is missing', () => {
    const projectDir = makeTempProject('whitebox-explain-missing-');
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), { columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] } });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');

    const report = buildExplain({ projectDir, taskId: 'T6.404', reqId: '', gate: '' });
    expect(report.ok).toBe(false);
    expect(report.options).toEqual([]);
  });

  test('whitebox status auto-rebuilds stale derived artifacts before trusted output', () => {
    const projectDir = makeTempProject('whitebox-status-rebuild-');
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 8\n### [ ] T8.1: Rebuild status\n', 'utf8');
    writeJson(path.join(projectDir, '.claude', 'orchestrate-state.json'), { tasks: [] });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');
    writeJson(path.join(projectDir, '.claude', 'collab', 'derived-meta.json'), [
      { artifact: '.claude/collab/board-state.json', schema_version: '1.0', stale_since: '2026-03-07T00:00:00.000Z', reason: 'fixture stale', cleared_by: null },
      { artifact: '.claude/collab/control-state.json', schema_version: '1.0', stale_since: '2026-03-07T00:00:00.000Z', reason: 'fixture stale', cleared_by: null },
      { artifact: '.claude/collab/whitebox-summary.json', schema_version: '1.0', stale_since: '2026-03-07T00:00:00.000Z', reason: 'fixture stale', cleared_by: null },
    ]);

    const result = spawnSync(process.execPath, [whiteboxStatusScript, `--project-dir=${projectDir}`, '--json'], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.rebuild.rebuilt).toEqual(expect.arrayContaining([
      '.claude/collab/board-state.json',
      '.claude/collab/control-state.json',
      '.claude/collab/whitebox-summary.json',
    ]));
  });

  test('board-show snapshot renders approval affordances in non-TTY mode', () => {
    const projectDir = makeTempProject('whitebox-board-snapshot-');
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 7\n### [ ] T7.1: Snapshot\n', 'utf8');
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
      next_remediation_target: { id: 'gate-snapshot-1', reason: 'Approval required for T7.1', remediation: 'Approve or reject' },
    });
    writeJson(path.join(projectDir, '.claude', 'collab', 'control-state.json'), {
      pending_approval_count: 1,
      pending_approvals: [{
        gate_id: 'gate-snapshot-1',
        task_id: 'T7.1',
        created_at: '2026-03-07T00:00:00.000Z',
        correlation_id: 'gate:snapshot-1',
        evidence_paths: [],
      }],
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');

    const result = spawnSync('bash', [boardShowScript, `--project-dir=${projectDir}`], {
      encoding: 'utf8',
      env: { ...process.env, WHITEBOX_TUI_CAPTURE: '1' },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Approval Queue (1)');
    expect(result.stdout).toContain('Enter detail');
    expect(result.stdout).toContain('a approve');
    expect(result.stdout).toContain('r reject');
    expect(result.stdout).toContain('q quit');
  });

  test('interactive TUI approve key routes through whitebox control CLI', () => {
    if (spawnSync('tmux', ['-V'], { encoding: 'utf8' }).status !== 0) {
      return;
    }

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
    writeJson(path.join(projectDir, '.claude', 'collab', 'control-state.json'), {
      pending_approval_count: 1,
      pending_approvals: [{
        gate_id: 'gate-tui-1',
        task_id: 'T7.2',
        created_at: '2026-03-07T00:00:00.000Z',
        correlation_id: 'gate:tui-1',
        evidence_paths: [],
      }],
      resolved_approvals: [],
    });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '', 'utf8');
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'control.ndjson'), '', 'utf8');

    spawnSync('cargo', ['build', '--manifest-path', path.resolve(__dirname, '../../../skills/task-board/tui/Cargo.toml')], {
      cwd: path.resolve(__dirname, '../../..'),
      encoding: 'utf8',
    });

    const session = `wb-${Date.now()}`;
    const launch = spawnSync('tmux', ['new-session', '-d', '-s', session], { encoding: 'utf8' });
    expect(launch.status).toBe(0);
    try {
      spawnSync('tmux', ['send-keys', '-t', session, `${boardShowScript} --project-dir="${projectDir}"`, 'Enter'], { encoding: 'utf8' });
      spawnSync('bash', ['-lc', 'sleep 1'], { encoding: 'utf8' });
      spawnSync('tmux', ['send-keys', '-t', session, 'a'], { encoding: 'utf8' });
      spawnSync('bash', ['-lc', 'sleep 1'], { encoding: 'utf8' });
      spawnSync('tmux', ['send-keys', '-t', session, 'q'], { encoding: 'utf8' });
    } finally {
      spawnSync('tmux', ['kill-session', '-t', session], { encoding: 'utf8' });
    }

    const controlLog = fs.readFileSync(path.join(projectDir, '.claude', 'collab', 'control.ndjson'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    expect(controlLog).toHaveLength(1);
    expect(controlLog[0]).toMatchObject({
      type: 'approve',
      target: { gate_id: 'gate-tui-1', task_id: 'T7.2' },
    });
  });

  test('worker timeout emits a single finish event even when close follows SIGTERM', async () => {
    jest.useFakeTimers();

    const projectDir = makeTempProject('whitebox-worker-timeout-');
    writeJson(path.join(projectDir, '.claude', 'orchestrate-state.json'), {
      tasks: [{ id: 'T8.1', status: 'pending' }],
    });

    const cli = createMockCli();
    cli.kill.mockImplementation(() => {
      setTimeout(() => cli.emit('close', null), 0);
      return true;
    });

    const emitted = [];
    let worker;

    jest.isolateModules(() => {
      jest.doMock('child_process', () => ({
        spawn: jest.fn(() => cli),
        execSync: jest.fn(),
      }));
      jest.doMock('../../../project-team/scripts/lib/whitebox-events', () => ({
        writeEvent: jest.fn(async (event) => {
          emitted.push(event);
          return event;
        }),
      }));
      jest.doMock('../../../project-team/scripts/lib/whitebox-run', () => ({
        ...jest.requireActual('../../../project-team/scripts/lib/whitebox-run'),
        createRunId: jest.fn(() => 'run-timeout-1'),
        withExecutorMetadata: jest.fn(() => ({ executor: 'claude' })),
      }));
      worker = require('../../../skills/orchestrate-standalone/scripts/engine/worker');
    });

    const promise = worker.executeTask({ id: 'T8.1', description: 'timeout fixture' }, { projectDir, timeout: 10 });

    await jest.advanceTimersByTimeAsync(10);
    await expect(promise).rejects.toThrow('Task T8.1 timed out after 10ms');
    await jest.runOnlyPendingTimersAsync();

    const finishEvents = emitted.filter((event) => event.type === 'orchestrate.execution.finish');
    expect(finishEvents).toHaveLength(1);
    expect(finishEvents[0]).toMatchObject({
      correlation_id: 'T8.1',
      data: {
        task_id: 'T8.1',
        run_id: 'run-timeout-1',
        outcome: 'error',
        timeout: true,
      },
    });

    const state = JSON.parse(fs.readFileSync(path.join(projectDir, '.claude', 'orchestrate-state.json'), 'utf8'));
    expect(state.tasks.find((task) => task.id === 'T8.1').status).toBe('timeout');

    jest.useRealTimers();
    jest.resetModules();
    jest.dontMock('child_process');
    jest.dontMock('../../../project-team/scripts/lib/whitebox-events');
    jest.dontMock('../../../project-team/scripts/lib/whitebox-run');
  });

  test('worker spawn error followed by close still emits one terminal finish event', async () => {
    const projectDir = makeTempProject('whitebox-worker-error-');
    writeJson(path.join(projectDir, '.claude', 'orchestrate-state.json'), {
      tasks: [{ id: 'T8.2', status: 'pending' }],
    });

    const cli = createMockCli();
    const emitted = [];
    let worker;

    jest.isolateModules(() => {
      jest.doMock('child_process', () => ({
        spawn: jest.fn(() => cli),
        execSync: jest.fn(),
      }));
      jest.doMock('../../../project-team/scripts/lib/whitebox-events', () => ({
        writeEvent: jest.fn(async (event) => {
          emitted.push(event);
          return event;
        }),
      }));
      jest.doMock('../../../project-team/scripts/lib/whitebox-run', () => ({
        ...jest.requireActual('../../../project-team/scripts/lib/whitebox-run'),
        createRunId: jest.fn(() => 'run-error-1'),
        withExecutorMetadata: jest.fn(() => ({ executor: 'claude' })),
      }));
      worker = require('../../../skills/orchestrate-standalone/scripts/engine/worker');
    });

    const promise = worker.executeTask({ id: 'T8.2', description: 'spawn error fixture' }, { projectDir, timeout: 100 });
    await new Promise((resolve) => setImmediate(resolve));

    cli.emit('error', new Error('spawn exploded'));
    cli.emit('close', 1);

    await expect(promise).rejects.toThrow('Task T8.2 failed to start: spawn exploded');

    const finishEvents = emitted.filter((event) => event.type === 'orchestrate.execution.finish');
    const failedStatusEvents = emitted.filter((event) => event.type === 'orchestrate.task.status_changed' && event.data.to === 'failed');
    expect(finishEvents).toHaveLength(1);
    expect(failedStatusEvents).toHaveLength(1);
    expect(finishEvents[0]).toMatchObject({
      data: {
        task_id: 'T8.2',
        run_id: 'run-error-1',
        outcome: 'error',
      },
    });

    const state = JSON.parse(fs.readFileSync(path.join(projectDir, '.claude', 'orchestrate-state.json'), 'utf8'));
    const taskState = state.tasks.find((task) => task.id === 'T8.2');
    expect(taskState.status).toBe('failed');
    expect(taskState.error).toBe('spawn exploded');
  });

  test('worker surfaces canonical event write failures in orchestrate state', async () => {
    const projectDir = makeTempProject('whitebox-worker-write-fail-');
    writeJson(path.join(projectDir, '.claude', 'orchestrate-state.json'), {
      tasks: [{ id: 'T8.3', status: 'pending' }],
    });

    const cli = createMockCli();
    const spawnMock = jest.fn(() => cli);
    let worker;

    jest.isolateModules(() => {
      jest.doMock('child_process', () => ({
        spawn: spawnMock,
        execSync: jest.fn(),
      }));
      jest.doMock('../../../project-team/scripts/lib/whitebox-events', () => ({
        writeEvent: jest.fn(async (event) => {
          if (event.type === 'orchestrate.execution.start') {
            const error = new Error('simulated write failure');
            error.code = 'LOCK_TIMEOUT';
            throw error;
          }
          return event;
        }),
      }));
      jest.doMock('../../../project-team/scripts/lib/whitebox-run', () => ({
        ...jest.requireActual('../../../project-team/scripts/lib/whitebox-run'),
        createRunId: jest.fn(() => 'run-write-fail-1'),
        withExecutorMetadata: jest.fn(() => ({ executor: 'claude' })),
      }));
      worker = require('../../../skills/orchestrate-standalone/scripts/engine/worker');
    });

    const promise = worker.executeTask({ id: 'T8.3', description: 'write failure fixture' }, { projectDir, timeout: 100 });
    await new Promise((resolve) => setImmediate(resolve));
    cli.emit('close', 0);

    await expect(promise).resolves.toMatchObject({
      id: 'T8.3',
      status: 'completed',
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);

    const state = JSON.parse(fs.readFileSync(path.join(projectDir, '.claude', 'orchestrate-state.json'), 'utf8'));
    const taskState = state.tasks.find((task) => task.id === 'T8.3');
    expect(taskState.status).toBe('completed');
    expect(taskState.event_write_error).toBeUndefined();
  });

  test('worker treats route fallback write failures as best-effort before spawning the CLI', async () => {
    const projectDir = makeTempProject('whitebox-worker-route-fallback-fail-');
    writeJson(path.join(projectDir, '.claude', 'orchestrate-state.json'), {
      tasks: [{ id: 'T8.3b', status: 'pending' }],
    });

    const cli = createMockCli();
    const spawnMock = jest.fn(() => cli);
    let worker;

    jest.isolateModules(() => {
      jest.doMock('child_process', () => ({
        spawn: spawnMock,
        execSync: jest.fn(),
      }));
      jest.doMock('../../../project-team/scripts/lib/whitebox-events', () => ({
        writeEvent: jest.fn(async (event) => {
          if (event.type === 'multi_ai_run.route.fallback') {
            const error = new Error('route fallback write failure');
            error.code = 'LOCK_TIMEOUT';
            throw error;
          }
          return event;
        }),
      }));
      jest.doMock('../../../project-team/scripts/lib/whitebox-run', () => ({
        ...jest.requireActual('../../../project-team/scripts/lib/whitebox-run'),
        createRunId: jest.fn(() => 'run-route-fallback-fail-1'),
        withExecutorMetadata: jest.fn(() => ({ executor: 'claude' })),
      }));
      worker = require('../../../skills/orchestrate-standalone/scripts/engine/worker');
    });

    const promise = worker.executeTask({ id: 'T8.3b', description: 'route fallback failure fixture', model: 'unknown-model' }, { projectDir, timeout: 100 });
    await new Promise((resolve) => setImmediate(resolve));
    cli.emit('close', 0);

    await expect(promise).resolves.toMatchObject({
      id: 'T8.3b',
      status: 'completed',
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);

    const state = JSON.parse(fs.readFileSync(path.join(projectDir, '.claude', 'orchestrate-state.json'), 'utf8'));
    const taskState = state.tasks.find((task) => task.id === 'T8.3b');
    expect(taskState.status).toBe('completed');
    expect(taskState.event_write_error).toBeUndefined();
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

  test('gate chain surfaces canonical event write failures instead of swallowing them', async () => {
    const projectDir = makeTempProject('whitebox-gate-write-fail-');
    const originalCwd = process.cwd();
    let gateChain;

    jest.isolateModules(() => {
      jest.doMock('../../../project-team/scripts/lib/whitebox-events', () => ({
        writeEvent: jest.fn(async () => {
          const error = new Error('gate write failure');
          error.code = 'LOCK_TIMEOUT';
          throw error;
        }),
      }));
      process.chdir(projectDir);
      gateChain = require('../../../skills/orchestrate-standalone/scripts/engine/gate-chain');
    });

    const result = await gateChain.runHook('quality-gate', {
      phase: 'barrier',
      layer: 0,
      tasks: [{ id: 'T8.4', title: 'barrier task' }],
    });

    process.chdir(originalCwd);

    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/canonical event write failed/);
    expect(result.write_error).toMatchObject({
      stage: 'gate_start',
      event_type: 'orchestrate.gate.start',
      message: 'gate write failure',
      code: 'LOCK_TIMEOUT',
    });
  });

  test('barrier gate events retain layer and task-set context', async () => {
    const projectDir = makeTempProject('whitebox-barrier-context-');
    const originalCwd = process.cwd();
    const hooksDir = path.join(projectDir, '.claude', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'quality-gate.js'), '#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on("end",()=>process.exit(0));\n', 'utf8');
    fs.writeFileSync(path.join(hooksDir, 'security-scan.js'), '#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on("end",()=>process.exit(0));\n', 'utf8');

    const emitted = [];
    let gateChain;

    jest.isolateModules(() => {
      jest.doMock('../../../project-team/scripts/lib/whitebox-events', () => ({
        writeEvent: jest.fn(async (event) => {
          emitted.push(event);
          return event;
        }),
      }));
      process.chdir(projectDir);
      gateChain = require('../../../skills/orchestrate-standalone/scripts/engine/gate-chain');
    });

    const result = await gateChain.barrierGate(2, [
      { id: 'T8.5', title: 'Task A', domain: 'core', risk: 'low' },
      { id: 'T8.6', title: 'Task B', domain: 'core', risk: 'high' },
    ]);

    process.chdir(originalCwd);

    expect(result.passed).toBe(true);
    const barrierEvents = emitted.filter((event) => event.data && event.data.scope === 'barrier');
    expect(barrierEvents.length).toBeGreaterThan(0);
    for (const event of barrierEvents) {
      expect(event.correlation_id).toBe('layer:2');
      expect(event.data.layer).toBe(2);
      expect(event.data.task_ids).toEqual(['T8.5', 'T8.6']);
      expect(event.data.tasks).toEqual([
        { id: 'T8.5', title: 'Task A', domain: 'core', risk: 'low' },
        { id: 'T8.6', title: 'Task B', domain: 'core', risk: 'high' },
      ]);
      expect(event.data.task || null).toBe(null);
    }
  });

  test('single-task gate payload remains stable after barrier context expansion', async () => {
    const projectDir = makeTempProject('whitebox-single-task-gate-');
    const originalCwd = process.cwd();
    const hooksDir = path.join(projectDir, '.claude', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'policy-gate.js'), '#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on("end",()=>process.exit(0));\n', 'utf8');

    const emitted = [];
    let gateChain;

    jest.isolateModules(() => {
      jest.doMock('../../../project-team/scripts/lib/whitebox-events', () => ({
        writeEvent: jest.fn(async (event) => {
          emitted.push(event);
          return event;
        }),
      }));
      process.chdir(projectDir);
      gateChain = require('../../../skills/orchestrate-standalone/scripts/engine/gate-chain');
    });

    const result = await gateChain.runHook('policy-gate', {
      phase: 'pre-dispatch',
      task: { id: 'T8.7', title: 'Policy task', domain: 'core', risk: 'medium' },
    });

    process.chdir(originalCwd);

    expect(result.passed).toBe(true);
    const gateStart = emitted.find((event) => event.type === 'orchestrate.gate.start');
    expect(gateStart.correlation_id).toBe('T8.7');
    expect(gateStart.data.scope).toBeUndefined();
    expect(gateStart.data.task).toEqual({
      id: 'T8.7',
      title: 'Policy task',
      domain: 'core',
      risk: 'medium',
    });
    expect(gateStart.data.task_ids).toBeUndefined();
    expect(gateStart.data.tasks).toBeUndefined();
  });

  test('missing hooks emit a skip outcome event with missing_hook reason', async () => {
    const projectDir = makeTempProject('whitebox-missing-hook-');
    const originalCwd = process.cwd();
    const emitted = [];
    let gateChain;

    jest.isolateModules(() => {
      jest.doMock('../../../project-team/scripts/lib/whitebox-events', () => ({
        writeEvent: jest.fn(async (event) => {
          emitted.push(event);
          return event;
        }),
      }));
      process.chdir(projectDir);
      gateChain = require('../../../skills/orchestrate-standalone/scripts/engine/gate-chain');
    });

    const result = await gateChain.runHook('nonexistent-gate', {
      phase: 'pre-dispatch',
      task: { id: 'T8.7b', title: 'Missing hook task', domain: 'core', risk: 'low' },
    });

    process.chdir(originalCwd);

    expect(result).toEqual({ passed: true, skipped: true, hook: 'nonexistent-gate' });
    expect(emitted).toHaveLength(2);
    expect(emitted[0]).toMatchObject({
      type: 'orchestrate.gate.start',
      correlation_id: 'T8.7b',
    });
    expect(emitted[1]).toMatchObject({
      type: 'orchestrate.gate.outcome',
      correlation_id: 'T8.7b',
      data: {
        gate: 'nonexistent-gate',
        outcome: 'skip',
        reason: 'missing_hook',
      },
    });
  });

  test('task-board-sync emits task_started on first task-aware edit only once', () => {
    const projectDir = makeTempProject('whitebox-task-started-');
    initCollabArtifacts(projectDir);
    const editedFile = path.join(projectDir, 'src', 'feature.js');
    fs.mkdirSync(path.dirname(editedFile), { recursive: true });
    fs.writeFileSync(editedFile, 'module.exports = 1;\n', 'utf8');

    const payload = JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Write',
      tool_input: {
        file_path: 'src/feature.js',
      },
    });

    const env = {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectDir,
      CLAUDE_AGENT_ROLE: 'fixture-agent',
      CLAUDE_TASK_ID: 'T8.8',
      WHITEBOX_RUN_ID: 'run-task-started-1',
    };

    const first = spawnSync(process.execPath, [taskBoardSyncScript], {
      cwd: projectDir,
      env,
      input: payload,
      encoding: 'utf8',
    });
    expect(first.status).toBe(0);

    const second = spawnSync(process.execPath, [taskBoardSyncScript], {
      cwd: projectDir,
      env,
      input: payload,
      encoding: 'utf8',
    });
    expect(second.status).toBe(0);

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    const startedEvents = parsed.events.filter((event) => event.type === 'task_started');
    expect(startedEvents).toHaveLength(1);
    expect(startedEvents[0]).toMatchObject({
      correlation_id: 'T8.8',
      data: {
        task_id: 'T8.8',
        run_id: 'run-task-started-1',
        file_path: 'src/feature.js',
        agent: 'fixture-agent',
      },
    });

    const markerPath = path.join(projectDir, '.claude', 'collab', 'archive', 'task-started', 'run-task-started-1--T8.8.json');
    expect(fs.existsSync(markerPath)).toBe(true);
  });

  test('task-board-sync emits req_resolved for CRLF frontmatter and marks board-state stale', () => {
    const projectDir = makeTempProject('whitebox-req-resolved-');
    initCollabArtifacts(projectDir);
    const requestPath = path.join(projectDir, '.claude', 'collab', 'requests', 'REQ-42.md');
    fs.mkdirSync(path.dirname(requestPath), { recursive: true });
    fs.writeFileSync(requestPath, '---\r\nstatus: "REJECTED"\r\nowner: qa\r\n---\r\nBody\r\n', 'utf8');

    const result = spawnSync(process.execPath, [taskBoardSyncScript], {
      cwd: projectDir,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: projectDir,
      },
      input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: {
          file_path: '.claude/collab/requests/REQ-42.md',
        },
      }),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({
      type: 'req_resolved',
      correlation_id: 'REQ-42',
      data: {
        req_id: 'REQ-42',
        status: 'REJECTED',
      },
    });

    const markers = JSON.parse(fs.readFileSync(path.join(projectDir, '.claude', 'collab', 'derived-meta.json'), 'utf8'));
    expect(markers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifact: '.claude/collab/board-state.json',
        cleared_by: null,
        reason: 'incremental event req_resolved; rebuild required',
      }),
    ]));
  });

  test('task-board-sync emits task_claimed on TaskUpdate and marks board-state stale', () => {
    const projectDir = makeTempProject('whitebox-task-update-');
    initCollabArtifacts(projectDir);

    const result = spawnSync(process.execPath, [taskBoardSyncScript], {
      cwd: projectDir,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: projectDir,
        CLAUDE_AGENT_ROLE: 'fixture-agent',
      },
      input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        tool_input: {
          task_id: 'T8.11',
          status: 'in_progress',
        },
      }),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({
      type: 'task_claimed',
      correlation_id: 'T8.11',
      data: {
        task_id: 'T8.11',
        status: 'in_progress',
        agent: 'fixture-agent',
      },
    });

    const markers = JSON.parse(fs.readFileSync(path.join(projectDir, '.claude', 'collab', 'derived-meta.json'), 'utf8'));
    expect(markers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifact: '.claude/collab/board-state.json',
        cleared_by: null,
        reason: 'incremental event task_claimed; rebuild required',
      }),
    ]));
  });

  test('task-board-sync skips task_started without task context', () => {
    const projectDir = makeTempProject('whitebox-task-started-missing-');
    initCollabArtifacts(projectDir);
    const editedFile = path.join(projectDir, 'src', 'feature.js');
    fs.mkdirSync(path.dirname(editedFile), { recursive: true });
    fs.writeFileSync(editedFile, 'module.exports = 2;\n', 'utf8');

    const result = spawnSync(process.execPath, [taskBoardSyncScript], {
      cwd: projectDir,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: projectDir,
        CLAUDE_AGENT_ROLE: 'fixture-agent',
      },
      input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: {
          file_path: 'src/feature.js',
        },
      }),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    expect(parsed.events.filter((event) => event.type === 'task_started')).toHaveLength(0);
  });

  test('task-board-sync skips task_started when edit payload has no file path', () => {
    const projectDir = makeTempProject('whitebox-task-started-empty-path-');
    initCollabArtifacts(projectDir);

    const result = spawnSync(process.execPath, [taskBoardSyncScript], {
      cwd: projectDir,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: projectDir,
        CLAUDE_AGENT_ROLE: 'fixture-agent',
        CLAUDE_TASK_ID: 'T8.10',
        WHITEBOX_RUN_ID: 'run-task-started-empty',
      },
      input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: {},
      }),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);

    const parsed = readEvents({ projectDir, tolerateTrailingPartialLine: false });
    expect(parsed.events.filter((event) => event.type === 'task_started')).toHaveLength(0);
    const markerDir = path.join(projectDir, '.claude', 'collab', 'archive', 'task-started');
    expect(fs.existsSync(markerDir)).toBe(false);
  });

  test('legacy auto event log remains readable for compatibility', () => {
    const projectDir = makeTempProject('whitebox-auto-events-');
    const append = spawnSync(process.execPath, [autoEventLogScript, 'append', 'task_add', '{"task_id":"T8.9"}'], {
      cwd: projectDir,
      encoding: 'utf8',
    });
    expect(append.status).toBe(0);

    const read = spawnSync(process.execPath, [autoEventLogScript, 'read'], {
      cwd: projectDir,
      encoding: 'utf8',
    });
    expect(read.status).toBe(0);

    const events = JSON.parse(read.stdout);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'task_add',
      data: { task_id: 'T8.9' },
    });
  });

  test('legacy auto event log help marks it as deprecated compatibility output', () => {
    const result = spawnSync(process.execPath, [autoEventLogScript], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Deprecated compatibility mirror/);
    expect(result.stdout).toMatch(/events\.ndjson/);
  });
});
