---
name: checkpoint
description: Immediate code review at task/PR completion. Auto-detects Git Diff, extracts TASKS.md context, runs Hook gates, and optionally invokes AI multi-review. Use this after completing a task, before committing, or whenever someone says "checkpoint", "review my code", "code review", or "check changes". Always trigger on task completion.
version: 1.0.0
---

# Checkpoint (Code Review at Task Completion)

> **Purpose**: Perform an immediate code review at task/PR completion to catch and fix issues early.
>
> **Core features**:
> - Auto-detect Git Diff
> - Auto-extract TASKS.md context
> - Auto-invoke `/security-review`
> - Hook gate + fix guide

---

## Core Features

### Git Diff Auto-Detection

### Our `/checkpoint`
```
Auto-detect:  Git Diff (latest commit)
Auto-extract: TASKS.md → match related tasks
Hook integration: policy-gate, standards-validator
Enhanced security: /security-review auto-invoked
AI multi-review: /multi-ai-review optional invocation
Result: Pass/Warning/Fail + concrete fix guide
```

---

## Execution Flow

```
/checkpoint
    ↓
┌─────────────────────────────────────────┐
│ Step 1: Auto-detect Git Diff            │
│   • git diff HEAD~1 HEAD auto-run       │
│   • Extract list of changed files       │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Step 2: Extract TASKS.md context        │
│   • Match changed files ↔ tasks         │
│   • Auto-identify related requirements  │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Step 3: 2-Stage Review                  │
│   • Stage 1: Spec Compliance            │
│   • Stage 2: Code Quality               │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Step 4: Enhanced Analysis (integrations)│
│   • /impact (change impact)             │
│   • /deps (dependencies)                │
│   • /security-review (security)         │
│   • /multi-ai-review (optional AI)      │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Step 5: Hook Gate                       │
│   • policy-gate (permissions + standards│
│   • standards-validator (rules)         │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Result: Pass / Warning / Fail           │
│   • Generate fix guide                  │
│   • Provide /recover path               │
└─────────────────────────────────────────┘
```

---

## 2-Stage Review Detail

### Stage 1: Spec Compliance

```yaml
Checklist:
  Requirements match:
    - Does the changed file's functionality match what is defined in TASKS.md?
    - Does it match the Mini-PRD / Socrates requirements?

  Missing checks:
    - Has the specified error handling been implemented?
    - Are edge cases handled?

  YAGNI violations:
    - Are there unnecessary features not in the spec?
    - Is there over-engineering?
```

### Stage 2: Code Quality

```yaml
Checklist:
  Architecture:
    - SOLID principles
    - Separation of concerns
    - Dependency injection

  Code quality:
    - Clear naming
    - Complexity (Cyclomatic, Cognitive)
    - Code duplication (DRY)
    - Magic numbers/strings removed

  Error handling:
    - All error cases handled
    - Meaningful error messages
    - Appropriate logging

  Testing:
    - Sufficient coverage
    - Edge case tests
    - Tests against real behavior, not just mocks
```

---

## Severity Classification

| Grade | Condition | Action |
|-------|-----------|--------|
| **Fail** | 1+ Critical issue OR 3+ Important issues | Immediate fix required |
| **Warning** | 1–2 Important issues OR many Minor issues | Review before proceeding |
| **Pass** | No issues OR Minor only | Proceed to next step |

---

## Ecosystem Integration

### /agile Integration

```yaml
/agile (task complete)
    ↓
/checkpoint auto-invoked
    ↓
Based on result:
  - Pass → next task
  - Warning → user confirmation then proceed
  - Fail → fix then re-checkpoint
```

### /team-orchestrate Integration

```yaml
/team-orchestrate (task complete)
    ↓
/checkpoint auto-invoked (post-task gate)
    ↓
Proceed to next task after Hook gate passes
```

### PR/Merge Integration

```bash
# Auto-invoked from Git Hook
pre-commit:  /checkpoint --mode=quick       # Quick check
pre-push:    /checkpoint --mode=full        # Full check
```

---

## Security Integration

### /security-review Auto-Invocation

```yaml
/security-review invocation conditions:
  - Changes to auth, payment, or user-related files
  - Changes to .env or config files
  - API routing changes

Based on result:
  - Vulnerability found → Fail + fix guide
  - None → Continue to next stage
```

---

## AI Multi-Review (Optional)

### /multi-ai-review Integration

```yaml
User prompt: "Would you like to include an AI review?"

If selected:
  /multi-ai-review
    ├── Gemini: code readability, improvement suggestions
    └── Codex: SOLID, pattern analysis

Results integrated into checkpoint report
```

---

## Output Format

```markdown
## Checkpoint Report

### Overview
- **Task**: T1.2 - User authentication API implementation
- **Date**: 2026-03-03 15:30
- **Commit**: abc123d

### Change Scope
- **Changed files**: 3
  - `src/domains/auth/auth.service.ts` (+45, -12)
  - `src/api/auth.routes.ts` (+23, -5)
  - `src/middleware/auth.middleware.ts` (+18)

### Stage 1: Spec Compliance ✅
- Requirements match: ✅
- Missing features: ✅
- YAGNI violations: ✅

### Stage 2: Code Quality ⚠️
- Architecture: ⚠️ Warning
  - auth.service.ts: Single Responsibility over-scoped
- Code quality: ✅
- Testing: ⚠️ Warning
  - Insufficient edge case coverage

### Integration Analysis
- **/impact**: Medium risk (auth-related)
- **/deps**: No circular dependencies
- **/security-review**: ✅ Passed

### Final Verdict
- **Result**: Warning
- **Action**: Review then proceed

### Fix Guide
1. Split auth.service.ts into Service + Repository
2. Add edge case tests
```

---

## Usage Examples

```bash
# Basic usage
/checkpoint

# Specify file scope
/checkpoint --files src/auth/*.ts

# Include AI multi-review
/checkpoint --ai-review

# Quick mode (Spec only)
/checkpoint --mode=spec

# Full mode
/checkpoint --mode=full
```

---

**Last Updated**: 2026-03-03 (v1.1.0 - Standalone independent mode complete)
