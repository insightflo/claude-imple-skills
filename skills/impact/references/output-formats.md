# Impact Analyzer - Output Formats

> This file defines the detailed output formats for the `/impact` skill.

---

## Standard Report

```
===========================================================
  Impact Analysis: <filename>
===========================================================

  Risk Level: <CRITICAL|HIGH|MEDIUM|LOW>
  <risk level description>

-----------------------------------------------------------
  Direct Dependents (files that import this file)
-----------------------------------------------------------
  - <file-path>:<line-number>
  - <file-path>:<line-number>
  (if none: None found)

-----------------------------------------------------------
  Indirect Dependents (API call relationships)
-----------------------------------------------------------
  - [<METHOD> <path>] <calling file>
  (if none: None found)

-----------------------------------------------------------
  Affected Domains
-----------------------------------------------------------
  - <domain-name> (direct)
  - <domain-name> (indirect - via API call)

-----------------------------------------------------------
  Related Tests
-----------------------------------------------------------
  - <test file path>
  (if none: None found - writing tests is strongly recommended!)

-----------------------------------------------------------
  Recommended Actions
-----------------------------------------------------------
  1. Run tests: <test command>
  2. Reviewer: <recommended reviewer>
  3. <additional recommendations>

===========================================================
```

---

## Additional Output for CRITICAL/HIGH Risk

```
-----------------------------------------------------------
  [WARNING] CRITICAL Risk Area
-----------------------------------------------------------
  This is a core financial/security area.

  Required checks:
  [ ] Is the reason for the change clearly defined?
  [ ] Has the full scope of impact been identified?
  [ ] Are test cases prepared?
  [ ] Is a rollback plan in place?

  Required reviewers: QA Manager, Chief Architect
```

---

## Risk Level Reference Table

| Risk Level   | Patterns | Description | Required Actions |
|--------------|----------|-------------|------------------|
| **CRITICAL** | `payment`, `billing`, `auth`, `security`, `encryption`, `crypto`, `jwt`, `oauth`, `password`, `credential`, `session_manager`, `token_manager` | Core financial/security area | Full tests + coverage + review mandatory |
| **HIGH** | `services/*.(py|js|ts)`, `core/`, `middleware/`, `shared/`, `infrastructure/`, `base_(service|model|repository)` | Core business logic | Run related test suites |
| **MEDIUM** | `api/`, `routes/`, `models/`, `schemas/`, `controllers/`, `repositories/`, `migrations/`, `entities/`, `domain/`, `database/` | Interface/data model | Verify contract compatibility |
| **LOW** | `tests/`, `utils/`, `config/`, `docs/`, `fixtures/`, etc. | Utilities/tests | Standard review |

---

## Recommended Reviewer Determination

| Risk Level   | Recommended Reviewer |
|--------------|----------------------|
| **CRITICAL** | QA Manager + Chief Architect |
| **HIGH** | Part Leader (of the affected domain) |
| **MEDIUM** | Domain Developer (of the affected domain) |
| **LOW** | Standard code review |

**When cross-domain impact is detected**: Add the Part Leader of every affected domain.
