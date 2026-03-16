/**
 * @TASK teammate-idle-gate hook tests
 * @TEST project-team/hooks/teammate-idle-gate.js
 *
 * Tests cover:
 *   1. Pending tasks detection from TASKS.md
 *   2. Escalated requests detection from .claude/collab/requests/
 *   3. Governance policy configuration
 *   4. Decision logic (allow vs warn)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  GOVERNANCE_POLICIES,
  checkPendingTasks,
  checkEscalatedRequests,
} = require('../teammate-idle-gate');

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-gate-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// checkPendingTasks
// ---------------------------------------------------------------------------

describe('checkPendingTasks', () => {
  test('returns no pending when TASKS.md does not exist', () => {
    const result = checkPendingTasks('architecture-lead', tmpDir);

    expect(result).toEqual({
      hasPending: false,
      count: 0,
      tasks: [],
    });
  });

  test('detects pending tasks assigned to teammate', () => {
    const tasksContent = [
      '## T1 - Backend',
      '',
      '- [ ] T1.1: User API design',
      '  - deps: []',
      '  - domain: backend',
      '  - owner: architecture-lead',
      '',
      '- [x] T1.2: User API impl',
      '  - deps: [T1.1]',
      '  - owner: architecture-lead',
      '',
      '- [ ] T1.3: User tests',
      '  - deps: [T1.2]',
      '  - owner: qa-lead',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = checkPendingTasks('architecture-lead', tmpDir);

    expect(result.hasPending).toBe(true);
    expect(result.count).toBe(1);
    expect(result.tasks).toContain('T1.1');
  });

  test('returns no pending when all tasks for teammate are completed', () => {
    const tasksContent = [
      '- [x] T1.1: User API design',
      '  - owner: architecture-lead',
      '',
      '- [x] T1.2: User API impl',
      '  - owner: architecture-lead',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = checkPendingTasks('architecture-lead', tmpDir);

    expect(result.hasPending).toBe(false);
    expect(result.count).toBe(0);
  });

  test('does not count tasks owned by other teammates', () => {
    const tasksContent = [
      '- [ ] T1.1: Write tests',
      '  - owner: qa-lead',
      '',
      '- [ ] T1.2: Design review',
      '  - owner: design-lead',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = checkPendingTasks('architecture-lead', tmpDir);

    expect(result.hasPending).toBe(false);
    expect(result.count).toBe(0);
  });

  test('handles malformed TASKS.md gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), 'not a valid tasks file');

    const result = checkPendingTasks('architecture-lead', tmpDir);

    expect(result.hasPending).toBe(false);
    expect(result.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// checkEscalatedRequests
// ---------------------------------------------------------------------------

describe('checkEscalatedRequests', () => {
  test('returns no escalated when requests dir does not exist', () => {
    const result = checkEscalatedRequests('architecture-lead', tmpDir);

    expect(result).toEqual({
      hasEscalated: false,
      count: 0,
    });
  });

  test('detects escalated requests involving teammate', () => {
    const requestsDir = path.join(tmpDir, '.claude', 'collab', 'requests');
    fs.mkdirSync(requestsDir, { recursive: true });

    const reqContent = [
      '---',
      'id: REQ-20260316-001',
      'from: architecture-lead',
      'to: design-lead',
      'status: ESCALATED',
      '---',
      '## Change Summary',
      'API contract conflict',
    ].join('\n');

    fs.writeFileSync(path.join(requestsDir, 'REQ-20260316-001.md'), reqContent);

    const result = checkEscalatedRequests('architecture-lead', tmpDir);

    expect(result.hasEscalated).toBe(true);
    expect(result.count).toBe(1);
  });

  test('ignores resolved requests', () => {
    const requestsDir = path.join(tmpDir, '.claude', 'collab', 'requests');
    fs.mkdirSync(requestsDir, { recursive: true });

    const reqContent = [
      '---',
      'id: REQ-20260316-001',
      'from: architecture-lead',
      'to: design-lead',
      'status: RESOLVED',
      '---',
      '## Change Summary',
      'Previously escalated, now resolved',
    ].join('\n');

    fs.writeFileSync(path.join(requestsDir, 'REQ-20260316-001.md'), reqContent);

    const result = checkEscalatedRequests('architecture-lead', tmpDir);

    expect(result.hasEscalated).toBe(false);
    expect(result.count).toBe(0);
  });

  test('detects escalated request where teammate is the "to" party', () => {
    const requestsDir = path.join(tmpDir, '.claude', 'collab', 'requests');
    fs.mkdirSync(requestsDir, { recursive: true });

    const reqContent = [
      '---',
      'id: REQ-20260316-002',
      'from: design-lead',
      'to: qa-lead',
      'status: ESCALATED',
      '---',
      '## Change Summary',
      'Test coverage dispute',
    ].join('\n');

    fs.writeFileSync(path.join(requestsDir, 'REQ-20260316-002.md'), reqContent);

    const result = checkEscalatedRequests('qa-lead', tmpDir);

    expect(result.hasEscalated).toBe(true);
    expect(result.count).toBe(1);
  });

  test('ignores escalated requests not involving teammate', () => {
    const requestsDir = path.join(tmpDir, '.claude', 'collab', 'requests');
    fs.mkdirSync(requestsDir, { recursive: true });

    const reqContent = [
      '---',
      'id: REQ-20260316-003',
      'from: design-lead',
      'to: qa-lead',
      'status: ESCALATED',
      '---',
      '## Change Summary',
      'Unrelated escalation',
    ].join('\n');

    fs.writeFileSync(path.join(requestsDir, 'REQ-20260316-003.md'), reqContent);

    const result = checkEscalatedRequests('architecture-lead', tmpDir);

    expect(result.hasEscalated).toBe(false);
    expect(result.count).toBe(0);
  });

  test('counts multiple escalated requests', () => {
    const requestsDir = path.join(tmpDir, '.claude', 'collab', 'requests');
    fs.mkdirSync(requestsDir, { recursive: true });

    for (let i = 1; i <= 3; i++) {
      const reqContent = [
        '---',
        `id: REQ-20260316-00${i}`,
        'from: architecture-lead',
        'to: qa-lead',
        'status: ESCALATED',
        '---',
        `## Change Summary ${i}`,
      ].join('\n');
      fs.writeFileSync(path.join(requestsDir, `REQ-20260316-00${i}.md`), reqContent);
    }

    const result = checkEscalatedRequests('architecture-lead', tmpDir);

    expect(result.hasEscalated).toBe(true);
    expect(result.count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Governance Policies Configuration
// ---------------------------------------------------------------------------

describe('GOVERNANCE_POLICIES', () => {
  test('defines expected policy flags', () => {
    expect(GOVERNANCE_POLICIES).toHaveProperty('checkEscalatedRequests');
    expect(GOVERNANCE_POLICIES).toHaveProperty('warnOnPendingTasks');
    expect(GOVERNANCE_POLICIES).toHaveProperty('maxIdleBeforeEscalation');
  });

  test('escalated request check is enabled by default', () => {
    expect(GOVERNANCE_POLICIES.checkEscalatedRequests).toBe(true);
  });

  test('pending task warning is enabled by default', () => {
    expect(GOVERNANCE_POLICIES.warnOnPendingTasks).toBe(true);
  });

  test('max idle before escalation has a reasonable default', () => {
    expect(GOVERNANCE_POLICIES.maxIdleBeforeEscalation).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: Combined governance check scenarios
// ---------------------------------------------------------------------------

describe('Combined governance scenarios', () => {
  test('clean state — no pending tasks, no escalated requests', () => {
    // Empty project dir with no TASKS.md and no requests
    const pending = checkPendingTasks('architecture-lead', tmpDir);
    const escalated = checkEscalatedRequests('architecture-lead', tmpDir);

    expect(pending.hasPending).toBe(false);
    expect(escalated.hasEscalated).toBe(false);
  });

  test('pending tasks + escalated requests — both detected', () => {
    // Create TASKS.md with pending task
    const tasksContent = [
      '- [ ] T1.1: Pending work',
      '  - owner: architecture-lead',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    // Create escalated request
    const requestsDir = path.join(tmpDir, '.claude', 'collab', 'requests');
    fs.mkdirSync(requestsDir, { recursive: true });
    const reqContent = [
      '---',
      'from: architecture-lead',
      'to: design-lead',
      'status: ESCALATED',
      '---',
    ].join('\n');
    fs.writeFileSync(path.join(requestsDir, 'REQ-20260316-001.md'), reqContent);

    const pending = checkPendingTasks('architecture-lead', tmpDir);
    const escalated = checkEscalatedRequests('architecture-lead', tmpDir);

    expect(pending.hasPending).toBe(true);
    expect(escalated.hasEscalated).toBe(true);
  });
});
