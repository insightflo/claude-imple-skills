/**
 * @TASK task-completed-gate hook tests
 * @TEST project-team/hooks/task-completed-gate.js
 *
 * Tests cover:
 *   1. Task existence validation in TASKS.md
 *   2. File scope validation against task metadata
 *   3. Lightweight quality check logic
 *   4. Quality check configuration
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  QUALITY_CHECKS,
  validateTaskExists,
  validateFileScope,
  runLightweightQualityCheck,
} = require('../task-completed-gate');

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-gate-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// validateTaskExists
// ---------------------------------------------------------------------------

describe('validateTaskExists', () => {
  test('returns not found when TASKS.md does not exist', () => {
    const result = validateTaskExists('T1.1', tmpDir);

    expect(result).toEqual({
      exists: false,
      status: 'no_tasks_file',
    });
  });

  test('detects existing pending task', () => {
    const tasksContent = [
      '- [ ] T1.1: User API design',
      '  - deps: []',
      '  - domain: backend',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = validateTaskExists('T1.1', tmpDir);

    expect(result.exists).toBe(true);
    expect(result.status).toBe('pending');
  });

  test('detects completed task', () => {
    const tasksContent = [
      '- [x] T1.1: User API design',
      '  - deps: []',
      '  - domain: backend',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = validateTaskExists('T1.1', tmpDir);

    expect(result.exists).toBe(true);
    expect(result.status).toBe('completed');
  });

  test('returns not_found for non-existent task', () => {
    const tasksContent = [
      '- [ ] T1.1: User API design',
      '  - deps: []',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = validateTaskExists('T99.1', tmpDir);

    expect(result.exists).toBe(false);
    expect(result.status).toBe('not_found');
  });

  test('handles task IDs with hyphens', () => {
    const tasksContent = [
      '- [ ] AUTH-03: Authentication module',
      '  - deps: []',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = validateTaskExists('AUTH-03', tmpDir);

    expect(result.exists).toBe(true);
  });

  test('handles task IDs with dots', () => {
    const tasksContent = [
      '- [ ] P1-T2.3: Sub-task implementation',
      '  - deps: [P1-T2.2]',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = validateTaskExists('P1-T2.3', tmpDir);

    expect(result.exists).toBe(true);
  });

  test('does not match partial task IDs', () => {
    const tasksContent = [
      '- [ ] T1.10: Extended task',
      '  - deps: []',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    // T1.1 should not match T1.10 due to word boundary
    const result = validateTaskExists('T1.1', tmpDir);

    expect(result.exists).toBe(false);
    expect(result.status).toBe('not_found');
  });
});

// ---------------------------------------------------------------------------
// validateFileScope
// ---------------------------------------------------------------------------

describe('validateFileScope', () => {
  test('returns in scope when no changed files', () => {
    const result = validateFileScope('T1.1', [], tmpDir);

    expect(result).toEqual({
      inScope: true,
      outOfScope: [],
    });
  });

  test('returns in scope when TASKS.md does not exist', () => {
    const result = validateFileScope('T1.1', ['src/app.js'], tmpDir);

    expect(result.inScope).toBe(true);
  });

  test('returns in scope when task has no files metadata', () => {
    const tasksContent = [
      '- [ ] T1.1: User API design',
      '  - deps: []',
      '  - domain: backend',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = validateFileScope('T1.1', ['src/anywhere.js'], tmpDir);

    expect(result.inScope).toBe(true);
  });

  test('detects files within scope', () => {
    const tasksContent = [
      '- [ ] T1.1: User API design',
      '  - deps: []',
      '  - files: src/domains/user/*',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = validateFileScope(
      'T1.1',
      ['src/domains/user/handler.js'],
      tmpDir
    );

    expect(result.inScope).toBe(true);
    expect(result.outOfScope).toEqual([]);
  });

  test('detects files out of scope', () => {
    const tasksContent = [
      '- [ ] T1.1: User API design',
      '  - deps: []',
      '  - files: src/domains/user/*',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = validateFileScope(
      'T1.1',
      ['src/domains/user/handler.js', 'src/domains/admin/admin.js'],
      tmpDir
    );

    expect(result.inScope).toBe(false);
    expect(result.outOfScope).toContain('src/domains/admin/admin.js');
  });

  test('handles multiple file patterns', () => {
    const tasksContent = [
      '- [ ] T1.1: Multi-scope task',
      '  - files: src/domains/user/*, src/shared/*',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = validateFileScope(
      'T1.1',
      ['src/domains/user/handler.js', 'src/shared/utils.js'],
      tmpDir
    );

    expect(result.inScope).toBe(true);
  });

  test('handles prefix-based file scope (no wildcard)', () => {
    const tasksContent = [
      '- [ ] T1.1: User module',
      '  - files: src/domains/user/',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = validateFileScope(
      'T1.1',
      ['src/domains/user/index.js'],
      tmpDir
    );

    expect(result.inScope).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runLightweightQualityCheck
// ---------------------------------------------------------------------------

describe('runLightweightQualityCheck', () => {
  test('passes when task exists in TASKS.md', () => {
    const tasksContent = [
      '- [ ] T1.1: User API design',
      '  - deps: []',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = runLightweightQualityCheck('T1.1', 'architecture-lead', tmpDir);

    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test('fails when task does not exist in TASKS.md', () => {
    const tasksContent = [
      '- [ ] T1.1: User API design',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const result = runLightweightQualityCheck('T99.1', 'architecture-lead', tmpDir);

    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]).toContain('T99.1');
    expect(result.issues[0]).toContain('not found');
  });

  test('fails when TASKS.md does not exist', () => {
    const result = runLightweightQualityCheck('T1.1', 'architecture-lead', tmpDir);

    expect(result.passed).toBe(false);
    expect(result.issues[0]).toContain('not found');
  });
});

// ---------------------------------------------------------------------------
// QUALITY_CHECKS Configuration
// ---------------------------------------------------------------------------

describe('QUALITY_CHECKS', () => {
  test('defines expected check flags', () => {
    expect(QUALITY_CHECKS).toHaveProperty('validateTaskExists');
    expect(QUALITY_CHECKS).toHaveProperty('validateFileScope');
    expect(QUALITY_CHECKS).toHaveProperty('blockOnLintErrors');
  });

  test('task existence check is enabled by default', () => {
    expect(QUALITY_CHECKS.validateTaskExists).toBe(true);
  });

  test('file scope check is enabled by default', () => {
    expect(QUALITY_CHECKS.validateFileScope).toBe(true);
  });

  test('lint error blocking is disabled by default', () => {
    expect(QUALITY_CHECKS.blockOnLintErrors).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: Combined scenarios
// ---------------------------------------------------------------------------

describe('Combined task completion scenarios', () => {
  test('valid task with in-scope files — full pass', () => {
    const tasksContent = [
      '- [ ] T1.1: User API design',
      '  - deps: []',
      '  - files: src/domains/user/*',
      '  - owner: architecture-lead',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const qualityResult = runLightweightQualityCheck('T1.1', 'architecture-lead', tmpDir);
    const scopeResult = validateFileScope('T1.1', ['src/domains/user/handler.js'], tmpDir);

    expect(qualityResult.passed).toBe(true);
    expect(scopeResult.inScope).toBe(true);
  });

  test('valid task with out-of-scope files — scope warning', () => {
    const tasksContent = [
      '- [ ] T1.1: User API design',
      '  - files: src/domains/user/*',
      '  - owner: architecture-lead',
    ].join('\n');

    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), tasksContent);

    const qualityResult = runLightweightQualityCheck('T1.1', 'architecture-lead', tmpDir);
    const scopeResult = validateFileScope(
      'T1.1',
      ['src/domains/user/handler.js', 'src/config/global.js'],
      tmpDir
    );

    expect(qualityResult.passed).toBe(true);
    expect(scopeResult.inScope).toBe(false);
    expect(scopeResult.outOfScope).toContain('src/config/global.js');
  });

  test('nonexistent task — quality failure', () => {
    fs.writeFileSync(path.join(tmpDir, 'TASKS.md'), '# Empty tasks');

    const qualityResult = runLightweightQualityCheck('T99.1', 'architecture-lead', tmpDir);

    expect(qualityResult.passed).toBe(false);
  });
});
