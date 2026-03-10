const fs = require('fs');
const os = require('os');
const path = require('path');

const { writeEvent } = require('../../../project-team/scripts/lib/whitebox-events');
const { readControlCommands } = require('../../../project-team/scripts/lib/whitebox-control');
const {
  dashboardStatePath,
  startServer,
} = require('../../../skills/whitebox/scripts/whitebox-dashboard');

function makeTempProject(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(root, '.claude', 'collab', 'requests'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'collab', 'events.ndjson'), '', 'utf8');
  return root;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

describe('whitebox dashboard', () => {
  test('state API exposes board and approvals without a manual skill call', async () => {
    const projectDir = makeTempProject('whitebox-dashboard-state-');
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '- [ ] T1.1: Visible blocker\n', 'utf8');
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), {
      schema_version: '1.1',
      columns: {
        Backlog: [],
        'In Progress': [],
        Blocked: [{ id: 'T1.1', title: 'Visible blocker', blocker_reason: 'Waiting for approval' }],
        Done: [],
      },
      decisions: [],
      derived_from: { fingerprint: 'fixture-board' },
    });
    writeJson(path.join(projectDir, '.claude', 'collab', 'control-state.json'), {
      pending_approval_count: 1,
      pending_approvals: [{
        gate_id: 'gate-state-1',
        gate_name: 'State Approval',
        task_id: 'T1.1',
        trigger_type: 'user_confirmation',
        trigger_reason: 'Need confirmation before continuing.',
        choices: ['approve', 'reject'],
      }],
      resolved_approvals: [],
    });

    const { server, state } = await startServer({ projectDir, host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(new URL('/api/state', state.url));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.board.columns.Blocked).toHaveLength(1);
      expect(payload.approvals).toEqual(expect.arrayContaining([
        expect.objectContaining({ gate_id: 'gate-state-1', task_id: 'T1.1' }),
      ]));
      expect(payload.summary.blocked_count).toBe(1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dashboardStatePath(projectDir), { force: true });
    }
  });

  test('control API records approval commands from the dashboard', async () => {
    const projectDir = makeTempProject('whitebox-dashboard-control-');
    await writeEvent({
      type: 'approval_required',
      producer: 'jest',
      correlation_id: 'T2.4',
      data: {
        gate_id: 'gate-control-1',
        gate_name: 'Control Gate',
        task_id: 'T2.4',
        choices: ['approve', 'reject'],
        preview: 'Approve from the dashboard.',
      },
    }, { projectDir });
    await writeEvent({
      type: 'execution_paused',
      producer: 'jest',
      correlation_id: 'T2.4',
      data: {
        gate_id: 'gate-control-1',
        task_id: 'T2.4',
        trigger_type: 'user_confirmation',
        trigger_reason: 'Paused for operator confirmation.',
      },
    }, { projectDir });
    writeJson(path.join(projectDir, '.claude', 'collab', 'board-state.json'), {
      schema_version: '1.1',
      columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] },
      decisions: [],
      derived_from: { fingerprint: 'fixture-board-2' },
    });

    const { server, state } = await startServer({ projectDir, host: '127.0.0.1', port: 0 });

    try {
      const response = await fetch(new URL('/api/control', state.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approve', gateId: 'gate-control-1' }),
      });
      const payload = await response.json();
      const commands = readControlCommands({ projectDir }).commands;

      expect(response.status).toBe(200);
      expect(payload.result).toBe('approved');
      expect(commands).toHaveLength(1);
      expect(commands[0]).toMatchObject({
        type: 'approve',
        target: { gate_id: 'gate-control-1' },
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dashboardStatePath(projectDir), { force: true });
    }
  });
});
