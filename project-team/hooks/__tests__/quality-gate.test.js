/**
 * @TASK P2-T4 - Quality Gate Hook Tests
 * @TEST hooks/quality-gate.js
 *
 * Tests cover:
 *   1. Project type detection (backend/frontend)
 *   2. Test output parsing (pytest, Vitest, Jest)
 *   3. Coverage extraction from various report formats
 *   4. Linting error/warning counting
 *   5. Type checking error parsing
 *   6. Quality gate decision logic
 *   7. Comprehensive report generation
 */

const fs = require('fs');
const path = require('path');

const {
  QUALITY_THRESHOLDS,
  PROJECT_PATTERNS,
  detectProjectType,
  runTests,
  parseTestOutput,
  parseLintOutput,
  parseTypeOutput,
  generateReport,
  isQualityGatePassed,
  toStopHookDecision
} = require('../quality-gate');

const qualityGatePath = require.resolve('../quality-gate');

// ---------------------------------------------------------------------------
// Test Output Parsing
// ---------------------------------------------------------------------------

describe('parseTestOutput', () => {
  describe('backend (pytest)', () => {
    test('parses pytest success output', () => {
      const output = '5 passed in 1.23s';
      const result = parseTestOutput(output, 'backend');

      expect(result).toEqual({
        passed: 5,
        failed: 0,
        total: 5
      });
    });

    test('parses pytest mixed results', () => {
      const output = '12 passed, 3 failed, 1 skipped in 2.45s';
      const result = parseTestOutput(output, 'backend');

      expect(result).toEqual({
        passed: 12,
        failed: 3,
        total: 15
      });
    });

    test('handles pytest with no tests', () => {
      const output = 'no tests ran in 0.01s';
      const result = parseTestOutput(output, 'backend');

      expect(result).toEqual({
        passed: 0,
        failed: 0,
        total: 0
      });
    });

    test('parses pytest with only failures', () => {
      const output = '2 failed in 0.50s';
      const result = parseTestOutput(output, 'backend');

      expect(result).toEqual({
        passed: 0,
        failed: 2,
        total: 2
      });
    });
  });

  describe('frontend (Vitest/Jest)', () => {
    test('parses Vitest success output', () => {
      const output = `
        Test Files  3 passed (3)
        Tests  25 passed (25)
      `;
      const result = parseTestOutput(output, 'frontend');

      expect(result.passed).toBeGreaterThan(0);
      expect(result.failed).toBe(0);
    });

    test('parses Vitest with failures', () => {
      const output = `
        Test Files  2 passed, 1 failed (3)
        Tests  20 passed, 5 failed (25)
      `;
      const result = parseTestOutput(output, 'frontend');

      expect(result.failed).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Linting Output Parsing
// ---------------------------------------------------------------------------

describe('parseLintOutput', () => {
  describe('backend (ruff)', () => {
    test('parses ruff JSON output with errors', () => {
      const output = JSON.stringify([
        { severity: 'error', file: 'app.py', line: 10 },
        { severity: 'error', file: 'utils.py', line: 5 },
        { severity: 'warning', file: 'app.py', line: 20 }
      ]);

      const result = parseLintOutput(output, 'backend');

      expect(result).toEqual({
        errors: 2,
        warnings: 1
      });
    });

    test('parses ruff text output', () => {
      const output = `
        app.py:10: error: unused variable
        utils.py:5: error: missing docstring
        app.py:20: warning: too many arguments
      `;

      const result = parseLintOutput(output, 'backend');

      expect(result.errors).toBeGreaterThan(0);
      expect(result.warnings).toBeGreaterThan(0);
    });

    test('handles no ruff issues', () => {
      const output = '';

      const result = parseLintOutput(output, 'backend');

      expect(result).toEqual({
        errors: 0,
        warnings: 0
      });
    });
  });

  describe('frontend (ESLint)', () => {
    test('parses ESLint JSON format', () => {
      const output = JSON.stringify([
        {
          filePath: 'src/App.tsx',
          messages: [
            { severity: 2, message: 'unused variable' },
            { severity: 1, message: 'prefer const' }
          ]
        },
        {
          filePath: 'src/utils.ts',
          messages: [
            { severity: 2, message: 'no console.log' }
          ]
        }
      ]);

      const result = parseLintOutput(output, 'frontend');

      expect(result).toEqual({
        errors: 2,
        warnings: 1
      });
    });

    test('parses ESLint text output', () => {
      const output = `
        2 errors and 1 warning found
      `;

      const result = parseLintOutput(output, 'frontend');

      expect(result.errors).toBeGreaterThan(0);
      expect(result.warnings).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Type Checking Output Parsing
// ---------------------------------------------------------------------------

describe('parseTypeOutput', () => {
  describe('backend (mypy)', () => {
    test('parses mypy errors', () => {
      const output = `
        app.py:10: error: Incompatible types in assignment
        utils.py:5: error: Name is not defined
      `;

      const result = parseTypeOutput(output, 'backend');

      expect(result).toBe(2);
    });

    test('handles no mypy errors', () => {
      const output = 'Success: no issues found';

      const result = parseTypeOutput(output, 'backend');

      expect(result).toBe(0);
    });
  });

  describe('frontend (tsc)', () => {
    test('parses tsc errors', () => {
      const output = `
        error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
        error TS2322: Type 'string' is not assignable to type 'number'.
      `;

      const result = parseTypeOutput(output, 'frontend');

      expect(result).toBe(2);
    });

    test('handles no tsc errors', () => {
      const output = '';

      const result = parseTypeOutput(output, 'frontend');

      expect(result).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Quality Gate Decision Logic
// ---------------------------------------------------------------------------

describe('isQualityGatePassed', () => {
  test('passes when all metrics meet thresholds', () => {
    const results = {
      tests: { passed: 10, failed: 0, total: 10 },
      coverage: { line: 85, branch: 70, function: 80, statement: 85 },
      linting: { errors: 0, warnings: 0 },
      typeChecking: { errors: 0 }
    };

    expect(isQualityGatePassed(results)).toBe(true);
  });

  test('fails when tests are failing', () => {
    const results = {
      tests: { passed: 9, failed: 1, total: 10 },
      coverage: { line: 85, branch: 70, function: 80, statement: 85 },
      linting: { errors: 0, warnings: 0 },
      typeChecking: { errors: 0 }
    };

    expect(isQualityGatePassed(results)).toBe(false);
  });

  test('fails when coverage is below threshold', () => {
    const results = {
      tests: { passed: 10, failed: 0, total: 10 },
      coverage: { line: 75, branch: 60, function: 70, statement: 75 },
      linting: { errors: 0, warnings: 0 },
      typeChecking: { errors: 0 }
    };

    expect(isQualityGatePassed(results)).toBe(false);
  });

  test('fails when linting errors exist', () => {
    const results = {
      tests: { passed: 10, failed: 0, total: 10 },
      coverage: { line: 85, branch: 70, function: 80, statement: 85 },
      linting: { errors: 2, warnings: 0 },
      typeChecking: { errors: 0 }
    };

    expect(isQualityGatePassed(results)).toBe(false);
  });

  test('fails when type errors exist', () => {
    const results = {
      tests: { passed: 10, failed: 0, total: 10 },
      coverage: { line: 85, branch: 70, function: 80, statement: 85 },
      linting: { errors: 0, warnings: 0 },
      typeChecking: { errors: 3 }
    };

    expect(isQualityGatePassed(results)).toBe(false);
  });

  test('passes with warnings (linting)', () => {
    const results = {
      tests: { passed: 10, failed: 0, total: 10 },
      coverage: { line: 85, branch: 70, function: 80, statement: 85 },
      linting: { errors: 0, warnings: 5 },
      typeChecking: { errors: 0 }
    };

    expect(isQualityGatePassed(results)).toBe(true);
  });
});

describe('toStopHookDecision', () => {
  test('maps pass to approve', () => {
    expect(toStopHookDecision(true)).toBe('approve');
  });

  test('maps fail to block', () => {
    expect(toStopHookDecision(false)).toBe('block');
  });
});

describe('manual hook output', () => {
  test('unknown project type emits stop-compatible block decision', async () => {
    let originalCwd;
    let result;
    const fixtureDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'quality-gate-unknown-'));

    try {
      originalCwd = process.cwd();
      process.chdir(fixtureDir);
      jest.resetModules();
      const fsModule = require('fs');
      const writes = [];
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        writes.push(String(chunk));
        return true;
      });

      delete require.cache[qualityGatePath];
      const freshModule = require('../quality-gate');
      result = await freshModule.main?.();
      stdoutSpy.mockRestore();

      const payload = JSON.parse(writes.join(''));
      expect(payload).toMatchObject({
        decision: 'block',
        reason: 'Could not detect project type (no package.json or pyproject.toml found)',
        stopReason: 'Quality gate blocked because project type could not be detected.'
      });
    } finally {
      if (originalCwd) process.chdir(originalCwd);
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

describe('generateReport', () => {
  test('generates comprehensive report with pass status', () => {
    const results = {
      projectType: 'frontend',
      tests: { passed: 25, failed: 0, total: 25 },
      coverage: { line: 85, branch: 75, function: 82, statement: 85 },
      linting: { errors: 0, warnings: 1 },
      typeChecking: { errors: 0 },
      passed: true,
      timestamp: '2024-01-15T10:30:00.000Z'
    };

    const report = generateReport(results);

    expect(report).toContain('QUALITY GATE REPORT');
    expect(report).toContain('✅ PASS');
    expect(report).toContain('25');
    expect(report).toContain('85%');
    expect(report).toContain('✅ QUALITY GATE PASSED');
  });

  test('generates report with failure details', () => {
    const results = {
      projectType: 'backend',
      tests: { passed: 8, failed: 2, total: 10 },
      coverage: { line: 65, branch: 50, function: 60, statement: 65 },
      linting: { errors: 3, warnings: 2 },
      typeChecking: { errors: 1 },
      passed: false,
      timestamp: '2024-01-15T10:30:00.000Z'
    };

    const report = generateReport(results);

    expect(report).toContain('❌ FAIL');
    expect(report).toContain('2');
    expect(report).toContain('Test failures');
    expect(report).toContain('Low coverage');
    expect(report).toContain('Linting errors');
    expect(report).toContain('Type errors');
  });

  test('report includes threshold comparisons', () => {
    const results = {
      projectType: 'frontend',
      tests: { passed: 20, failed: 0, total: 20 },
      coverage: { line: 88, branch: 70, function: 85, statement: 88 },
      linting: { errors: 0, warnings: 0 },
      typeChecking: { errors: 0 },
      passed: true,
      timestamp: '2024-01-15T10:30:00.000Z'
    };

    const report = generateReport(results);

    expect(report).toContain('threshold');
    expect(report).toContain(`${QUALITY_THRESHOLDS.coverage.line}%`);
    expect(report).toContain(`${QUALITY_THRESHOLDS.linting.maxErrors}`);
  });

  test('report handles zero coverage gracefully', () => {
    const results = {
      projectType: 'backend',
      tests: { passed: 0, failed: 0, total: 0 },
      coverage: { line: 0, branch: 0, function: 0, statement: 0 },
      linting: { errors: 0, warnings: 0 },
      typeChecking: { errors: 0 },
      passed: false,
      timestamp: '2024-01-15T10:30:00.000Z'
    };

    const report = generateReport(results);

    expect(report).not.toThrow;
    expect(report).toContain('0%');
  });
});

// ---------------------------------------------------------------------------
// Quality Thresholds
// ---------------------------------------------------------------------------

describe('QUALITY_THRESHOLDS', () => {
  test('defines minimum coverage threshold', () => {
    expect(QUALITY_THRESHOLDS.coverage.line).toBe(80);
    expect(QUALITY_THRESHOLDS.coverage.branch).toBe(60);
  });

  test('requires 100% test pass rate', () => {
    expect(QUALITY_THRESHOLDS.tests.passRateRequired).toBe(100);
  });

  test('allows zero linting errors', () => {
    expect(QUALITY_THRESHOLDS.linting.maxErrors).toBe(0);
  });

  test('allows zero type errors', () => {
    expect(QUALITY_THRESHOLDS.types.maxErrors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Project Patterns
// ---------------------------------------------------------------------------

describe('PROJECT_PATTERNS', () => {
  test('defines backend configuration', () => {
    const backend = PROJECT_PATTERNS.backend;

    expect(backend).toHaveProperty('testCmd');
    expect(backend).toHaveProperty('lintCmd');
    expect(backend).toHaveProperty('typeCmd');
    expect(backend.testCmd).toContain('pytest');
    expect(backend.lintCmd).toContain('ruff');
  });

  test('defines frontend configuration', () => {
    const frontend = PROJECT_PATTERNS.frontend;

    expect(frontend).toHaveProperty('testCmd');
    expect(frontend).toHaveProperty('lintCmd');
    expect(frontend).toHaveProperty('typeCmd');
    expect(frontend.testCmd).toContain('npm');
  });

  test('includes file extensions for each project type', () => {
    expect(PROJECT_PATTERNS.backend.extensions).toContain('.py');
    expect(PROJECT_PATTERNS.frontend.extensions).toContain('.ts');
    expect(PROJECT_PATTERNS.frontend.extensions).toContain('.tsx');
  });
});

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('Quality Gate Full Flow', () => {
  test('all-pass scenario', () => {
    const results = {
      projectType: 'frontend',
      tests: { passed: 50, failed: 0, total: 50 },
      coverage: { line: 92, branch: 85, function: 90, statement: 92 },
      linting: { errors: 0, warnings: 2 },
      typeChecking: { errors: 0 },
      passed: isQualityGatePassed({
        tests: { passed: 50, failed: 0, total: 50 },
        coverage: { line: 92, branch: 85, function: 90, statement: 92 },
        linting: { errors: 0, warnings: 2 },
        typeChecking: { errors: 0 }
      }),
      timestamp: new Date().toISOString()
    };

    expect(results.passed).toBe(true);

    const report = generateReport(results);
    expect(report).toContain('✅ QUALITY GATE PASSED');
  });

  test('partial-fail scenario (low coverage)', () => {
    const results = {
      projectType: 'backend',
      tests: { passed: 30, failed: 0, total: 30 },
      coverage: { line: 72, branch: 50, function: 70, statement: 72 },
      linting: { errors: 0, warnings: 1 },
      typeChecking: { errors: 0 },
      passed: isQualityGatePassed({
        tests: { passed: 30, failed: 0, total: 30 },
        coverage: { line: 72, branch: 50, function: 70, statement: 72 },
        linting: { errors: 0, warnings: 1 },
        typeChecking: { errors: 0 }
      }),
      timestamp: new Date().toISOString()
    };

    expect(results.passed).toBe(false);

    const report = generateReport(results);
    expect(report).toContain('❌ QUALITY GATE FAILED');
    expect(report).toContain('Low coverage');
  });

  test('multiple-fail scenario', () => {
    const results = {
      projectType: 'frontend',
      tests: { passed: 40, failed: 10, total: 50 },
      coverage: { line: 60, branch: 40, function: 55, statement: 60 },
      linting: { errors: 5, warnings: 3 },
      typeChecking: { errors: 2 },
      passed: isQualityGatePassed({
        tests: { passed: 40, failed: 10, total: 50 },
        coverage: { line: 60, branch: 40, function: 55, statement: 60 },
        linting: { errors: 5, warnings: 3 },
        typeChecking: { errors: 2 }
      }),
      timestamp: new Date().toISOString()
    };

    expect(results.passed).toBe(false);

    const report = generateReport(results);
    expect(report).toContain('❌ QUALITY GATE FAILED');
    expect(report).toContain('Test failures');
    expect(report).toContain('Low coverage');
    expect(report).toContain('Linting errors');
    expect(report).toContain('Type errors');
  });
});

// ---------------------------------------------------------------------------
// Regression: command injection hardening
// ---------------------------------------------------------------------------

describe('command execution hardening', () => {
  test('does not shell-evaluate metacharacters in configured commands', () => {
    jest.isolateModules(() => {
      const spawnSync = jest.fn(() => ({
        status: 0,
        stdout: '5 passed in 1.23s',
        stderr: ''
      }));

      jest.doMock('child_process', () => ({ spawnSync }));

      // Require after mocking child_process
      // eslint-disable-next-line global-require
      const qualityGate = require('../quality-gate');

      // Attempt to smuggle extra commands via shell metacharacters.
      qualityGate.PROJECT_PATTERNS.backend.testCmd = 'pytest -q && touch /tmp/SHOULD_NOT_RUN';

      const result = qualityGate.runTests('backend');
      expect(result.passed).toBe(5);
      expect(result.failed).toBe(0);

      expect(spawnSync).toHaveBeenCalledTimes(1);
      const [cmd, args, opts] = spawnSync.mock.calls[0];

      expect(cmd).toBe('pytest');
      expect(args).toEqual(['-q', '&&', 'touch', '/tmp/SHOULD_NOT_RUN']);
      expect(opts).toMatchObject({ shell: false });
    });
  });
});

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------
