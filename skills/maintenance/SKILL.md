---
name: maintenance
description: Production system maintenance orchestrator. Automates change acceptance → impact analysis → safe modification → test reinforcement → change record in 5 ITIL-based stages. Use this skill for bug fixes, feature changes, config updates, incident response, and hotfixes — always, without exception.
version: 1.0.0
updated: 2026-03-16
---

# Maintenance (Production Maintenance Orchestrator)

> **Purpose**: Safely execute changes to a production system following a 5-stage ITIL-based workflow.
> Automatically chains existing analysis skills (/impact, /deps, /coverage, /security-review, /changelog)
> so the user does not need to run each one individually — the entire flow completes as a single operation.
>
> **Core Principle**: Production code is involved, so every change must follow impact analysis → user confirmation → modification → verification in that exact order.

---

## Absolute Prohibitions

1. Do not modify code before completing the ASSESS stage
2. Do not proceed without user confirmation when risk is HIGH or CRITICAL
3. Do not move to the next file before running lint/type-check on the current one
4. Do not skip the VERIFY stage
5. Do not close the task without a change record (RECORD)

---

## Prerequisites (auto-checked at skill start)

1. **Git repository**: A `.git/` directory must exist. Halt if absent.
2. **TASKS.md**: Not required (production maintenance targets existing code).
3. **Project type detection**: Determine lint/test commands from package.json, pyproject.toml, Cargo.toml, etc.

---

## 5-Stage Workflow

```
/maintenance "request description"
    │
    ▼
[Stage 1: ASSESS]   Change classification + initial risk screening
    │
    ▼
[Stage 2: ANALYZE]  /impact + /deps + /architecture → impact report
    │                                                  ↓ HIGH/CRITICAL
    │                                           User confirmation required
    ▼
[Stage 3: IMPLEMENT] git branch + incremental changes + per-file validation
    │
    ▼
[Stage 4: VERIFY]   Tests + /coverage + /security-review
    │
    ▼
[Stage 5: RECORD]   Change record + commit + rollback plan
```

---

### Stage 1: ASSESS (Change Acceptance Decision)

Analyze the user request and classify the change.

```bash
# 1. Identify target files
# Extract file names, function names, error messages, etc. from the user request

# 2. Classify change type
#   - Bug Fix: correct an existing behavior error
#   - Feature Change: alter the behavior of an existing feature
#   - Config Update: change configuration or environment variables
#   - Refactor: structural improvement without behavior change

# 3. Map to ITIL change type
#   - Standard: low risk, routine (config changes, text edits)
#   - Normal: medium risk, requires evaluation (logic changes, API edits)
#   - Emergency: incident response, immediate action (production down, security vulnerability)
```

**Initial risk screening**: Quickly determine risk from target file paths.

| Path Pattern | Risk Level | Reason |
|---|---|---|
| `**/payment/**`, `**/billing/**` | CRITICAL | Financial logic |
| `**/auth/**`, `**/security/**` | CRITICAL | Authentication/security |
| `migrations/**`, `**/schema*` | HIGH | Data structure |
| `**/api/**`, `**/routes/**` | HIGH | External interface |
| `src/**`, `lib/**` | MEDIUM | General business logic |
| `config/**`, `*.env*` | MEDIUM | Environment config |
| `docs/**`, `*.md` | LOW | Documentation |
| `tests/**` | LOW | Test code |

**Gate**: Emergency displays a warning banner then proceeds. Normal + HIGH/CRITICAL requires user confirmation before proceeding.

---

### Stage 2: ANALYZE (Impact Analysis)

Call existing analysis skills in order and consolidate impact.

```
1. /impact <target file>        → change impact + risk factors
2. /deps <target file>          → dependency graph + circular reference check
3. /architecture                → identify affected domains
```

Synthesize each skill's results into an impact report:

```markdown
## Impact Report

| Item | Result |
|------|--------|
| Target files | 3 |
| Affected files | 12 |
| Affected domains | backend, api |
| Circular references | none |
| Risk level | HIGH |

### Risk Factors
- Core logic change in the payment domain
- Affects 3 API endpoints
```

**Gate**: If risk level is HIGH or CRITICAL, confirm with the user:
- Display impact summary
- Offer "Proceed / Reduce scope / Abort" choices

---

### Stage 3: IMPLEMENT (Safe Modification)

Safely modify production code. All changes are made on a dedicated branch.

```bash
# 1. Create branch
git checkout -b maintenance/{change-type}-{short-description}

# 2. Incremental per-file modification
#    - Edit one file
#    - Immediately run lint + type-check
#    - On failure: git checkout -- <file> to revert, then report to user
#    - On success: proceed to next file

# 3. Per-project validation commands
#    Node.js: npx eslint <file> && npx tsc --noEmit
#    Python:  ruff check <file> && mypy <file>
#    Rust:    cargo check
```

**Principles**:
- Modify only one file at a time
- Validate immediately after each modification — do not move to the next file before validating
- If all files fail validation, halt and suggest manual correction to the user

---

### Stage 4: VERIFY (Test Reinforcement)

Validate the quality of modified code.

```
1. Run existing tests               → confirm all pass
2. /coverage <changed files>        → check for coverage regression
3. /security-review --path <changed files>  → check for security vulnerabilities
```

**Validation verdict**:

| Result | Verdict | Action |
|--------|---------|--------|
| All tests pass + coverage maintained + security clean | PASS | Proceed to RECORD |
| Tests pass + coverage decreased | WARN | Show warning, user decides |
| Tests fail | FAIL | Show failure cause, suggest fix |
| CRITICAL security issue | BLOCK | Cannot proceed until security issue is resolved |

---

### Stage 5: RECORD (Change History)

Systematically record the change history.

```
1. Create Change Record    → based on references/change-record-template.md
2. Write structured commit message
3. Present rollback plan
```

**Commit message format**:

```
{change-type}({domain}): {description}

Change-Type: {Standard|Normal|Emergency}
Risk-Level: {CRITICAL|HIGH|MEDIUM|LOW}
Impact: {affected domains}
Files: {count} modified
Rollback: git revert <hash>
```

**Rollback plan**: After the commit, provide the rollback command to the user.

---

## Final Report

After all stages complete, output a summary report:

```
┌─────────────────────────────────────────────┐
│  Maintenance Complete Report                 │
├─────────────────────────────────────────────┤
│ Change Type: Bug Fix (Normal)                │
│ Risk Level:  MEDIUM                          │
│                                              │
│ ✅ ASSESS:    Standard classification        │
│ ✅ ANALYZE:   3 files, 2 domains affected    │
│ ✅ IMPLEMENT: 3/3 files modified             │
│ ✅ VERIFY:    Tests pass, coverage maintained│
│ ✅ RECORD:    CR-20260316-001 created        │
│                                              │
│ Branch:   maintenance/fix-payment-null-check │
│ Rollback: git revert abc1234                 │
└─────────────────────────────────────────────┘
```

---

## Skill Integration Table

| Stage | Called Skill | Purpose |
|-------|-------------|---------|
| ASSESS | (built-in logic) | Change classification + initial risk screening |
| ANALYZE | `/impact`, `/deps`, `/architecture` | Consolidated impact analysis |
| VERIFY | `/coverage`, `/security-review` | Quality + security validation |
| RECORD | `/changelog` (auto via hook) | Change history record |

---

## Reference Documents

- `references/change-record-template.md` — RFC-style change record template

---

**Last Updated**: 2026-03-16 (v1.0.0)
