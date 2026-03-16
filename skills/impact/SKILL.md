---
name: impact
description: Analyzes the blast radius and risk level before modifying any file. Run this skill before touching production code, before refactoring, and before changing core logic. It is mandatory for files under payment, auth, billing, and security paths. Triggers on /impact, "impact analysis", or "what does changing this file affect?"
version: 1.1.0
updated: 2026-02-11
---

# Impact Analyzer

> **Analyzes impact scope, risk level, and related tests before modifying a file to support safe changes.**

---

## Trigger Conditions

- `/impact <file-path>`
- `/impact analyze <file-path>`
- "What does changing this file affect?"
- "Run an impact analysis"

---

## Absolute Prohibitions

1. **Do not modify code directly** — this skill is analysis-only.
2. **Do not guess dependencies** — always parse actual import/require statements.
3. **Do not assert risk level without analysis** — verify both file path patterns and actual dependencies.

---

## Execution Steps

```
Receive /impact <file-path>
    |
    v
[1] Validate target file
    |
    v
[2] Risk classification
    |
    v
[3] Direct dependents analysis
    |
    v
[4] Indirect dependents analysis
    |
    v
[5] Identify affected domains
    |
    v
[6] Locate related tests
    |
    v
[7] Determine recommended reviewers
    |
    v
[8] Output impact report
```

---

### Step 1: Validate Target File

Confirm file existence and type (supported: `.py`, `.js`, `.ts`, `.jsx`, `.tsx`, `.vue`, `.svelte`)

### Step 2: Risk Classification

Classify risk based on file path patterns.

| Risk Level | Pattern | Required Action |
|------------|---------|-----------------|
| **CRITICAL** | `payment`, `billing`, `auth`, `security`, `crypto`, `jwt`, `password` | Full test suite + mandatory review |
| **HIGH** | `services/*`, `core/`, `middleware/`, `shared/` | Run related test suite |
| **MEDIUM** | `api/`, `routes/`, `models/`, `schemas/` | Verify contract compatibility |
| **LOW** | `tests/`, `utils/`, `config/`, `docs/` | Standard review |

**Custom configuration**: If `.claude/risk-areas.yaml` exists, it takes priority.

### Step 3: Direct Dependents Analysis

Find all files that **import or require** the target file.

```bash
# Python
grep -rn "from.*<module-name>|import.*<module-name>" --include="*.py" .

# JS/TS
grep -rn "from.*<module-name>|require.*<module-name>" --include="*.ts" --include="*.js" .
```

### Step 4: Indirect Dependents Analysis

If the target file **defines API endpoints**, find files that call those APIs.

| Type | Description | Discovery Method |
|------|-------------|-----------------|
| API calls | Clients calling the endpoint | grep for API path strings |
| Event subscriptions | Files publishing/subscribing to events | grep for event names |

### Step 5: Identify Affected Domains

Identify affected domains from dependency analysis results.
- Based on directory structure: `domains/<domain-name>/`, `src/<domain-name>/`
- Domain definitions in `.claude/project-team.yaml` take priority if present

### Step 6: Locate Related Tests

| Source File | Search Targets |
|-------------|----------------|
| `user_service.py` | `test_user_service.py`, `user_service_test.py` |
| `userService.ts` | `userService.test.ts`, `userService.spec.ts` |

### Step 7: Determine Recommended Reviewers

| Risk Level | Recommended Reviewer |
|------------|----------------------|
| **CRITICAL** | QA Manager + Chief Architect |
| **HIGH** | Part Leader (relevant domain) |
| **MEDIUM** | Domain Developer |
| **LOW** | Standard code review |

**Cross-domain impact**: Add the Part Leader of every affected domain.

### Step 8: Output Impact Report

See `references/output-formats.md` for detailed output format.

---

## Hook Integration

| | Hook (`pre-edit-impact-check.js`) | Skill (`/impact`) |
|--|-----------------------------------|-------------------|
| Timing | Auto-runs on Edit | On user request |
| Scope | Single file summary | Detailed analysis + recommendations |
| Purpose | Real-time warning | Pre-change planning |

---

## Related Skill Integration

| Skill | When to Use | Purpose |
|-------|-------------|---------|
| `/deps <domain>` | When cross-domain impact is found | Visualize domain dependencies |
| `/coverage <file>` | After reviewing related tests | Detailed test coverage check |
| `/changelog <domain>` | After change is complete | Review change history record |

---

## Reference Documents

- `references/output-formats.md` — detailed output format
- `references/examples.md` — usage examples
