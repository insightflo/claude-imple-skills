# Quality Gate Hook (P2-T4)

## Overview

The `quality-gate.js` hook serves as the **QA Manager's enforcement checkpoint**, automatically validating code quality before Phase completion. It acts as a **quality barrier** that blocks phase merges if quality standards are not met.

**Hook Type**: Manual (triggered when Phase is ready for completion)

**Responsibility**: QA Manager

**Authority**: Can block Phase merges based on quality metrics

## Quality Standards

### Test Requirements
- **Pass Rate**: 100% (all tests must pass)
- **Minimum Tests**: At least 1 test
- **Failure Impact**: Any failing test blocks merge

### Code Coverage
- **Line Coverage**: ≥ 80%
- **Branch Coverage**: ≥ 60%
- **Function Coverage**: ≥ 75%
- **Statement Coverage**: ≥ 80%
- **Failure Impact**: Any metric below threshold blocks merge

### Linting
- **Errors**: 0 (zero tolerance)
- **Warnings**: Unlimited
- **Tools**: ESLint (frontend), Ruff (backend)
- **Failure Impact**: Any linting error blocks merge

### Type Checking
- **Errors**: 0 (zero tolerance)
- **Tools**: TypeScript/tsc (frontend), mypy (backend)
- **Failure Impact**: Any type error blocks merge

## Project Detection

The hook automatically detects project type based on:

| Indicator | Project Type |
|-----------|--------------|
| `package.json` exists | Frontend |
| `pyproject.toml` or `setup.py` exists | Backend |
| None | Unknown (blocks merge) |

## Quality Check Flow

```
1. Detect Project Type
   ↓
2. Run Tests
   ├─ Backend: pytest --cov=app --cov-report=json
   └─ Frontend: npm run test -- --run --coverage
   ↓
3. Extract Coverage Metrics
   ├─ Backend: coverage.json (pytest-cov format)
   └─ Frontend: coverage/coverage-final.json (Vitest/Jest format)
   ↓
4. Run Linter
   ├─ Backend: ruff check . --output-format=json
   └─ Frontend: npm run lint -- --format=json
   ↓
5. Run Type Checker
   ├─ Backend: mypy app/
   └─ Frontend: npm run type-check
   ↓
6. Decision Logic
   ├─ ALL metrics pass? → ALLOW (✅)
   └─ ANY metric fails? → DENY (❌)
   ↓
7. Generate Report
   └─ Send comprehensive report with metrics & guidance
```

## Report Format

The hook generates a detailed report showing:

```
╔════════════════════════════════════════════════════════════════╗
║               📊 QUALITY GATE REPORT - PHASE COMPLETION        ║
╚════════════════════════════════════════════════════════════════╝

📋 SUMMARY:
  Project Type: frontend
  Timestamp: 2024-01-15T10:30:00.000Z
  Overall Status: ✅ PASS

🧪 TEST RESULTS:
  Passed: 25 / 25
  Failed: 0 / 25
  Pass Rate: 100%
  Status: ✅ All tests pass

📈 CODE COVERAGE:
  Line Coverage: 85% (threshold: 80%)
  Branch Coverage: 75% (threshold: 60%)
  Function Coverage: 82% (threshold: 75%)
  Statement Coverage: 85% (threshold: 80%)
  Status: ✅

📝 LINTING:
  Errors: 0 (threshold: 0)
  Warnings: 2
  Status: ✅

📦 TYPE CHECKING:
  Errors: 0 (threshold: 0)
  Status: ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ QUALITY GATE PASSED - Phase merge approved
```

## Pass Decision (✅)

All of the following must be true:

1. All tests pass (0 failures)
2. Line coverage ≥ 80%
3. Linting errors = 0
4. Type errors = 0

## Fail Decision (❌)

Any of the following will block merge:

1. Test failures exist
   - **Fix**: Debug and fix failing tests

2. Coverage below 80%
   - **Fix**: Add more test cases or improve coverage

3. Linting errors found
   - **Fix**: Follow project coding standards

4. Type errors found
   - **Fix**: Add type annotations or fix type mismatches

## Hook Output

### Success Response
```json
{
  "decision": "allow",
  "report": "[detailed report text]",
  "metrics": {
    "tests": { "passed": 25, "failed": 0, "total": 25 },
    "coverage": { "line": 85, "branch": 75, "function": 82, "statement": 85 },
    "linting": { "errors": 0, "warnings": 2 },
    "typeChecking": { "errors": 0 }
  }
}
```

### Failure Response
```json
{
  "decision": "deny",
  "report": "[detailed report text with fix guidance]",
  "metrics": {
    "tests": { "passed": 20, "failed": 5, "total": 25 },
    "coverage": { "line": 65, "branch": 50, "function": 60, "statement": 65 },
    "linting": { "errors": 3, "warnings": 5 },
    "typeChecking": { "errors": 2 }
  }
}
```

## Test Coverage

The `quality-gate.test.js` covers:

| Test Suite | Coverage |
|-----------|----------|
| Test Output Parsing | pytest, Vitest, Jest formats |
| Linting Output Parsing | Ruff, ESLint formats |
| Type Checking Output Parsing | mypy, tsc formats |
| Quality Gate Decision Logic | All pass/fail scenarios |
| Report Generation | Success & failure reports |
| Quality Thresholds | Threshold validation |
| Project Patterns | Backend & frontend patterns |
| Integration Tests | Full quality flow scenarios |

**Total Tests**: 35
**Status**: All PASS ✅

## Example Executions

### Backend Project (Python)

```bash
$ cd /path/to/backend && node hooks/quality-gate.js

# Output:
{
  "decision": "allow",
  "report": "...",
  "metrics": {
    "tests": { "passed": 42, "failed": 0, "total": 42 },
    "coverage": { "line": 82, "branch": 65, "function": 80, "statement": 82 },
    "linting": { "errors": 0, "warnings": 0 },
    "typeChecking": { "errors": 0 }
  }
}
```

### Frontend Project (React/TypeScript)

```bash
$ cd /path/to/frontend && node hooks/quality-gate.js

# Output:
{
  "decision": "deny",
  "report": "❌ QUALITY GATE FAILED - Phase merge blocked\nFix required:\n  • Low coverage: need +15% line coverage (currently 65%)",
  "metrics": {
    "tests": { "passed": 30, "failed": 0, "total": 30 },
    "coverage": { "line": 65, "branch": 50, "function": 60, "statement": 65 },
    "linting": { "errors": 0, "warnings": 1 },
    "typeChecking": { "errors": 0 }
  }
}
```

## Integration with Phase Workflow

### When is Quality Gate Triggered?

The Quality Gate runs when Phase is ready for completion:

```
Phase Development
    ↓
Phase Review
    ↓
Quality Gate Check ← quality-gate.js runs here
    ├─ ✅ PASS → Phase can be merged
    └─ ❌ FAIL → Block merge, provide fix guidance
```

### Who Controls It?

- **QA Manager**: Runs quality gate, interprets results
- **Domain Developers**: Fix failing tests/coverage issues
- **Orchestrator**: Respects quality gate decision

## Customization

To adjust quality thresholds, modify `QUALITY_THRESHOLDS`:

```javascript
const QUALITY_THRESHOLDS = {
  coverage: {
    line: 80,        // Change to 75, 85, 90, etc.
    branch: 60,      // Change as needed
    function: 75,
    statement: 80
  },
  tests: {
    passRateRequired: 100,  // Always 100%
    minTestCount: 1
  },
  linting: {
    maxErrors: 0,     // Zero tolerance
    maxWarnings: null
  },
  types: {
    maxErrors: 0      // Zero tolerance
  }
};
```

## Troubleshooting

### "Unknown project type" Error
- **Cause**: No `package.json` (frontend) or `pyproject.toml`/`setup.py` (backend)
- **Fix**: Ensure project has correct configuration files

### Coverage Not Detected
- **Cause**: Test command not generating coverage reports
- **Fix**: Ensure tests run with `--cov` flag (backend) or `--coverage` flag (frontend)

### Linting Fails Unexpectedly
- **Cause**: Project uses different linter (Prettier, Black, etc.)
- **Fix**: Add custom linting logic or adjust configuration

### Type Checking Fails
- **Cause**: Type errors in code (likely intentional during development)
- **Fix**: Add type annotations or fix type mismatches

## See Also

- **QA Lead Role**: `.claude/agents/qa-lead.md` (Agent Teams)
- **Quality Standards**: `contracts/standards/quality-standards.md`
