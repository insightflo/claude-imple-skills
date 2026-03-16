---
name: governance-setup
description: Sets up Agent Teams governance (team-lead + architecture/qa/design leads) for large projects, or a Mini-PRD for small ones. Use this skill at project kickoff, whenever a team structure is needed, or on requests like "set up governance", "configure project team", or "create agent team" — do not skip it.
version: 1.4.0
updated: 2026-03-03
---

> **v1.4.0**: **Mini-PRD support** (Progressive Disclosure + `/audit` compatible), removed `/project-bootstrap` dependency, added **local project team initialization (standalone)** path after governance completion

# Governance Setup (Phase 0)

> **Purpose**: Before implementation begins on a large project, the governance team establishes standards and quality baselines.
>
> **Standalone Goal (important)**: This project provides **implementation-assist skills + an Agent Team (Project Team)** and is designed to **operate fully standalone without external dependencies**.
>
> **Core Principle**: This skill **does not write implementation code**. It produces only **governance documents and standards**.
>
> **Prerequisites**: Having a TASKS.md is ideal. If absent, either (1) after governance completes, run **TASKS scaffolding** in the **local project team initialization (standalone)** step, or (optionally) generate TASKS with an external tool/skill.
>
> **v1.2.1**: Cleaned up frontmatter `trigger`, strengthened `/audit` integration, detailed Phase execution templates (standalone path reinforced in v1.3.0)

---

## Absolute Prohibitions

1. **No implementation code** — only standards and policy documents
2. **Do not skip agent order** — PM → Architect → Designer → QA → DBA sequence is mandatory
3. **Do not proceed without user confirmation** — user approval is required after each agent completes

---

## Immediate Actions on Trigger

### (Important) Document → Execution Link
- This skill does not write implementation code, but for its outputs to carry real effect, **documents must be translated into enforceable mechanisms (gates/tests/types/CI)**.
- Therefore `management/quality-gates.md` and `ADR-*.md` must include **"where and how it is enforced"** (e.g., a single verification entry command, CI job, test suite, artifact path).
- Example: define a **single entry verification command** like `scripts/verify_all.sh` or `make verify`, and map each quality gate item as a sub-step under that command.


### Step 0: Prerequisite Check

```bash
# The TASKS file may be at root (TASKS.md) or at docs/planning/06-tasks.md depending on the project.
ls docs/planning/06-tasks.md 2>/dev/null || ls TASKS.md 2>/dev/null
ls management/project-plan.md management/decisions/ADR-*.md 2>/dev/null
ls management/mini-prd.md 2>/dev/null
```

**If TASKS.md is absent**:
- Only a legacy file (`docs/planning/06-tasks.md`) exists → guide `/tasks-migrate` first (consolidate into TASKS.md)
- No task file at all → continue governance, then guide `/tasks-init` as the next step after completion

**If TASKS.md exists**: check the task count.
- 30 or more tasks → after governance, recommend `/team-orchestrate` for parallel execution

**Mini-PRD vs Full Governance selection**:
- Small project (1–5 people) → **Mini-PRD** (`references/mini-prd/`)
- Large project (6+ people) → **Full Governance** (5-phase agent team)

---

## Mini-PRD (Lightweight Alternative)

> **Fast start**: For small projects that do not need a full governance team

**File**: `management/mini-prd.md`

### Creating a Mini-PRD

```bash
# Template reference
references/mini-prd/mini-prd-template.md

# Progressive Disclosure question set
references/mini-prd/progressive-disclosure.md

# /audit compatibility mapping
references/mini-prd/audit-mapping.md
```

### Phase-by-Phase Questions

| Phase | Timing | Questions |
|-------|--------|-----------|
| **Phase 1** | Initial | purpose, features, tech-stack |
| **Phase 2** | After skeleton complete | business-logic, data-model, api-contract |
| **Phase 3** | During muscles phase | error-handling, edge-cases, performance |

### /audit Compatibility

A Mini-PRD passes `/audit`'s planning-conformance check:

```bash
# Mini-PRD alone is sufficient to pass
management/mini-prd.md  # Phase 1+2 required

# When /audit runs
/audit
  → ✅ Mini-PRD detected
  → ✅ Planning conformance verified
  → ✅ Architecture verified
  → ✅ DDD verified (data-model)
```

---

## Governance Team — 5-Phase Sequential Execution

| Step | Agent | Artifact | Detailed Guide |
|------|-------|----------|----------------|
| 1 | **PM** | `management/project-plan.md` | `references/phase-1-pm.md` |
| 2 | **Architect** | `management/decisions/ADR-*.md` | `references/phase-2-architect.md` |
| 3 | **Designer** | `design/system/*.md` | `references/phase-3-designer.md` |
| 4 | **QA Manager** | `management/quality-gates.md` | `references/phase-4-qa.md` |
| 5 | **DBA** | `database/standards.md` | `references/phase-5-dba.md` |

### On Entering Each Phase
1. Read the corresponding `references/phase-N-*.md` file
2. Invoke a Task using the template below (example):
   ```js
   Task({
     subagent_type: "orchestrator", // follow the guidance in the phase file
     description: "PM: Draft project plan",
     prompt: "Follow instructions in `references/phase-1-pm.md` and write `management/project-plan.md`. Ask the user for any required input."
   })
   ```
3. Confirm completion conditions before moving to the next phase

> Note: The `subagent_type` per phase takes its value from what is defined in `references/phase-N-*.md`.

---

## Governance Completion Checklist

```
management/
├── project-plan.md           ← PM
├── quality-gates.md          ← QA Manager
└── decisions/
    ├── ADR-001-tech-stack.md
    ├── ADR-002-api-versioning.md
    ├── ADR-003-error-handling.md
    └── ADR-004-naming-convention.md

design/system/
├── tokens.md, components.md, layout.md, accessibility.md

database/
└── standards.md              ← DBA
```

---

## Next Steps (CRITICAL)

> **This section must be executed after the skill completes.**

After governance completes, present next-step options via **AskUserQuestion**:

```json
{
  "questions": [{
    "question": "Governance setup complete! Choose your next step:",
    "header": "Next Steps",
    "options": [
      {"label": "Local project team initialization (recommended)", "description": "(standalone) project-team install + .claude/project-team.yaml creation + domain agents + TASKS scaffolding"},
      {"label": "Initial governance quality audit", "description": "/audit — comprehensive check of configured standards and quality gates"},
      {"label": "Deficit analysis first", "description": "/eros — validate hidden assumptions and gaps (v1.10.0)"},
      {"label": "Start implementing directly", "description": "/agile auto — Claude writes code directly (small projects only)"}
    ],
    "multiSelect": false
  }]
}
```

> **Conditional guidance (auto-inserted)**:
> - If TASKS.md was absent → prepend "TASKS.md is missing. Run `/tasks-init` first in the next step." to the top of the options.
> - If TASKS.md has 30 or more tasks → prepend "You have 30+ tasks. `/team-orchestrate` is recommended for parallel execution." to the top of the options.

### Auto-execution by Selection

| Selection | Action |
|-----------|--------|
| "Local project team initialization" | Execute **Standalone Init** section below |
| "Initial governance quality audit" | `Skill({ skill: "quality-auditor" })` |
| "Deficit analysis first" | `Skill({ skill: "eros" })` |
| "Start implementing directly" | `Skill({ skill: "agile" })` |

---

## Hook Integration

| Artifact | Hook | Behavior |
|----------|------|----------|
| ADR-*.md | `standards-validator` | Warns on ADR violations |
| quality-gates.md | `quality-gate` | Blocks on quality shortfalls |
| design/system/*.md | `design-validator` | Detects design violations |
| database/standards.md | `standards-validator` | Checks DB naming conventions |

---

## FAQ

**Q: I don't have a TASKS.md**
→ Run `/tasks-init` first (generates scaffolding)

**Q: I want to re-run a specific phase only**
→ Read the corresponding `references/phase-N-*.md` then invoke the Task

**Q: Agent invocation failed**
→ Check `ls ~/.claude/agents/` (Claude Project Team required)

**Q: Planning documents are too long**
→ Run `/compress optimize docs/planning/*.md` (extracts key content with the H2O pattern)

---

**Last Updated**: 2026-03-03 (v1.4.1 - Context Optimize integration)
