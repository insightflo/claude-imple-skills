---
name: agile
description: Agile Sprint Master for regular user check-ins and sprint management. Use this for /agile, /sprint, starting a sprint, checkpoint requests, or any time you are running structured iterative development. Triggers on "start sprint", "checkpoint", "sprint status", "run task", or whenever you need to manage layered build progress across Skeleton → Muscles → Skin.
version: 2.6.0
updated: 2026-03-03
---

# Agile Sprint Master

> **Heavy-Hitter (execute immediately)**
> ```
> /agile auto   | Initial build: auto-run all layers
> /agile iterate "changes" | Change/add: run only affected layers
> /agile status | Current sprint progress
> ```
>
> **Layers**: Skeleton (structure) → Muscles (logic) → Skin (polish)
> **Purpose**: 1–3 day sprints + user review cycles to maximize satisfaction

> **v3.0.0**: Agent Teams integration (team-lead, qa-lead), agent-browser + Lighthouse CLI
> **v2.6.0**: Long Context optimization — H2O pattern places critical info at the top

---

## Quick Start (Highest Priority)

### 3-Stage Pipeline
```
1. Sprint Planning   → Define Skeleton/Muscles/Skin layers
2. Sprint Execution  → Focused development + task sync
3. Checkpoint        → Screenshot capture + user approval
```

### Quality Gates
| Layer | Validation Criteria |
|-------|---------------------|
| Skeleton | Lint pass + build success |
| Muscles | Lint + build + unit tests + /checkpoint |
| Skin | Full tests + /trinity → /audit |

---

## Prerequisites (Auto-run on skill trigger)

When the skill is triggered, check the following in order before starting implementation.
Stop and display the relevant message if any check fails.

1. **TASKS.md exists**: A `TASKS.md` file must be present in the project root.
   - If missing: "TASKS.md not found. Please create it first with `/tasks-init`."

2. **TASKS.md format**: Must contain task IDs in the format `- [ ] T1.1:`.
   - If invalid: "TASKS.md format is incorrect. Convert it with `/tasks-migrate`."

3. **`/agile auto` + Agent Teams**: Check whether `.claude/agents/team-lead.md` exists.
   - If missing and TASKS.md has 30+ tasks: "30+ tasks detected — `/team-orchestrate` is recommended. Install Agent Teams: `project-team/install.sh --local --mode=team`"
   - If missing and fewer than 30 tasks: continue in standalone mode (skip agent delegation).

---

## Core Principles (INVEST)

- **I**ndependent: Each task can be completed and reviewed independently
- **N**egotiable: Requirements can be discussed and adjusted with the user
- **V**aluable: Each sprint deliverable provides real, tangible value
- **E**stimable: Work scope is small enough to be estimated
- **S**mall: Can be completed within 1–3 days
- **T**estable: Completion can be verified clearly

---

## Execution Process

### 1. Sprint Planning (Progressive Wholeness — Horizontal Slicing)

- **Philosophy**: Rather than completing features one by one, **raise the quality of the entire system (Whole) progressively**.
- **Layer-based sprint definition**:
  1. **Skeleton (Structure)**: Full layout, dummy data, primary navigation. (Review goal: "Does the overall structure look right?")
  2. **Muscles (Logic)**: Real data integration, core business logic, interactions. (Review goal: "Does it actually work correctly?")
  3. **Skin & Polish**: Precise design system application, animations, edge case handling, premium feel. (Review goal: "Does it feel great to use?")
- **Requirement Restatement**: "In this sprint, I will complete the [Skeleton/Muscles/Skin] layer of [all pages] to demonstrate [what value]."

### 2. Sprint Execution

- Develop intensively within the agreed sprint scope.
- New ideas or changes discovered during work are immediately logged in the **sprint backlog** and shared with the user.
- **[Required] Task sync**: Update the TASKS file (`TASKS.md` preferred, fallback to `docs/planning/06-tasks.md`) immediately upon each task execution. (Per TEAM-CHARTER)
- **[Required] Document sync**: Update relevant planning documents immediately when code changes.

### 3. Checkpoint (Sprint Review)

- **Visual Status Capture**: Before calling `notify_user`, use the `agent-browser` CLI to capture a screenshot of the current implementation.
  - `agent-browser open <url>` → `agent-browser wait` → `agent-browser screenshot checkpoint.png`
  - Lighthouse audit (optional): `npx lighthouse <url> --output=json --quiet`
- **Must call `notify_user`**: Upon completing each sprint goal or milestone, provide the code along with **visual output (screenshot)** and request approval.
- Collect user feedback and incorporate it immediately into the next work cycle.

### 4. Quality Gate (v2.4.0)

Perform **quality validation** on each layer completion:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer complete → Quality gate check                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Skeleton complete:                                         │
│  └── Lint pass + build success                              │
│                                                             │
│  Muscles complete:                                          │
│  └── Lint + build + unit test pass                          │
│  └── /checkpoint (2-stage review) ← v2.4.0 NEW             │
│                                                             │
│  Skin complete:                                             │
│  └── Full tests + /trinity → /audit                         │
│  └── /verification-before-completion required               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Principles (INVEST)

Always follow these principles when defining tasks or splitting sprints.

- **I**ndependent: Each task must be completable and reviewable independently from others.
- **N**egotiable: Requirements are not fixed and can be negotiated with the user.
- **V**aluable: Each sprint deliverable must provide real value to the user.
- **E**stimable: Work must be small enough that its scope can be estimated.
- **S**mall: Must be completable within 1–3 days.
- **T**estable: Completion must be clearly verifiable.

---

## Command Reference

| Command | Description |
| :------------------------------- | :------------------------------------------------------- |
| `/agile start` | Propose a new sprint plan. |
| `/agile status` | Summarize current sprint progress and remaining work. |
| `/agile review` | Summarize results so far and request user review. |
| `/agile run {task-id}` | Begin execution of a specific task. |
| `/agile done {task-id}` | Mark a specific task as complete. |
| **`/agile auto`** | **Initial build: auto-run all layers + checkpoints** |
| **`/agile iterate "changes"`** | **Change/add: selectively run only affected layers** |

---

## Iteration Mode (`/agile iterate`)

> **Purpose**: Handle **design changes, new feature additions, and business logic updates** in an already-built codebase.

### Usage Examples

```bash
# Design change
/agile iterate "Main page design renewal"

# New feature addition
/agile iterate "Add payment system"

# Business logic change
/agile iterate "Update discount logic: allow coupon stacking"
```

### Execution Flow

```
/agile iterate "change description"
    ↓
┌─────────────────────────────────────────────────────────────┐
│  1. Analyze change scope                                    │
│  - Interpret the change request                             │
│  - Scan existing codebase (identify affected files)         │
│  - Auto-determine affected layers                           │
├─────────────────────────────────────────────────────────────┤
│  Analysis result → User confirmation                        │
│  "This change affects [Muscles], [Skin] layers.             │
│   Affected files: 5. Proceed?"                              │
│  [Approve] → Execute / [Adjust] → Revise scope              │
└─────────────────────────────────────────────────────────────┘
    ↓ (User approval)
┌─────────────────────────────────────────────────────────────┐
│  2. Selectively run only affected layers                    │
│                                                             │
│  [SKIP] Skeleton (not affected)                             │
│                                                             │
│  MUSCLES layer → User confirmation on completion            │
│  SKIN layer → User confirmation on completion               │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Final validation and report                             │
│  - Before/after comparison (screenshots if possible)        │
│  - Test run results                                         │
│  - Git diff summary                                         │
└─────────────────────────────────────────────────────────────┘
```

### Auto Layer Detection by Change Type

| Change Type | Affected Layers | Examples |
| :------------------ | :-------------------- | :---------------------------------------- |
| **Design change** | Skin | Colors, fonts, animations, layout tweaks |
| **UI structure change** | Skeleton + Skin | Page structure, navigation changes |
| **New feature** | Skeleton + Muscles + Skin | New screens/APIs/DB models |
| **Business logic change** | Muscles | API logic, validation, calculation logic |
| **Bug fix** | Affected layer only | Target only the problematic layer |

### `/agile auto` vs `/agile iterate` Comparison

| Item | `/agile auto` | `/agile iterate` |
| :------------ | :----------------------------------- | :-------------------------- |
| **Purpose** | Initial build | Changes / additions |
| **Scope** | All layers (Skeleton→Muscles→Skin) | Affected layers only |
| **Task creation** | Run full TASKS.md | Auto-create new tasks then run |
| **Checkpoint** | On each layer completion | On each layer completion |

---

## Auto Layer Execution (`/agile auto`)

> **Purpose**: Automatically execute each layer (Skeleton → Muscles → Skin), **requesting user confirmation after every layer** to immediately incorporate feedback.

### Execution Flow

```
/agile auto
    ↓
┌─────────────────────────────────────────────────────────────┐
│  SKELETON layer                                             │
│  - Full layout, dummy data, navigation structure            │
│  - Auto-run related tasks                                   │
├─────────────────────────────────────────────────────────────┤
│  Layer complete → Screenshot → notify_user                  │
│  "Skeleton is done. Please check if the overall             │
│   structure matches your expectations."                     │
│  [Approve] → Next layer / [Request changes] → Apply + recheck│
└─────────────────────────────────────────────────────────────┘
    ↓ (User approval)
┌─────────────────────────────────────────────────────────────┐
│  MUSCLES layer                                              │
│  - Real data integration, core business logic, interactions │
│  - Auto-run related tasks                                   │
├─────────────────────────────────────────────────────────────┤
│  Layer complete → Screenshot → notify_user                  │
│  "Features are implemented. Please verify everything        │
│   works correctly."                                         │
│  [Approve] → Next layer / [Request changes] → Apply + recheck│
└─────────────────────────────────────────────────────────────┘
    ↓ (User approval)
┌─────────────────────────────────────────────────────────────┐
│  SKIN layer                                                 │
│  - Precise design system, animations, edge case handling    │
│  - Auto-run related tasks                                   │
├─────────────────────────────────────────────────────────────┤
│  Layer complete → Screenshot → notify_user                  │
│  "Done. Please do a final review of the look and feel."     │
└─────────────────────────────────────────────────────────────┘
```

### Task-to-Layer Mapping Rules

Classify tasks from the TASKS file (`TASKS.md` preferred, fallback to `docs/planning/06-tasks.md`) by layer:

| Task Pattern | Layer | Examples |
| :----------------------------- | :---------- | :------------------------- |
| `T0.*`, `T1.1–T1.3` (initial structure) | Skeleton | Routing, layout, dummy UI |
| `T1.4–T2.*` (core features) | Muscles | API integration, state management, CRUD |
| `T3.*` (polish) | Skin | Animations, responsive, accessibility |

> **Note**: If a task has a `[Skeleton]`, `[Muscles]`, or `[Skin]` tag, that tag takes precedence.

### Checkpoint Message Format

```markdown
## Skeleton Layer Complete!

**Completed Tasks**: T0.1, T0.2, T1.1
**Screenshot**: [attached]

### Review Request

> Please check that the overall structure matches expectations.
>
> - Is the layout as intended?
> - Is the navigation structure correct?

**Next Step**: Muscles layer (API integration, core logic implementation)

[1] Approve and continue to next layer
[2] Request changes (enter feedback)
```

---

## Task Execution Tracking

**Automatically document and track progress** when starting and completing individual tasks.

### `/agile run {task-id}` — Start a Task

**Actions to perform:**

1. **Extract task info from the TASKS file** (`TASKS.md` preferred)
2. **Generate execution plan**: `docs/reports/{task-id}-plan.md`

   ```markdown
   # Execution Plan: {task-id}

   **Started**: {timestamp}
   **Goal**: {task description}

   ## Execution Steps

   1. ...
   2. ...

   ## Expected Deliverables

   - ...
   ```

3. **Update TASKS file**: Mark the task as `[/]` (in progress)
4. **Report the plan to the user** before starting work

### `/agile done {task-id}` — Complete a Task

**Actions to perform:**

1. **Generate completion report**: `docs/reports/{task-id}-report.md`

   ```markdown
   # Completion Report: {task-id}

   **Completed**: {timestamp}
   **Duration**: {duration}

   ## Work Completed

   - ...

   ## Files Created

   - `path/to/file1.ts`
   - `path/to/file2.tsx`

   ## Test Results

   - Unit tests passed
   - Build succeeded

   ## Next Steps

   - Next task: {next-task-id}
   ```

2. **Update TASKS file**: Mark the task as `[x]` (done)
3. **Suggest a Git commit** (optional)

---

## Skill Integration (v2.6.0)

| Situation | Linked Skill | Description |
|-----------|--------------|-------------|
| **Before starting** | `/workflow` | Recommend skill based on current state |
| **Long planning docs** | `/compress` | Extract essentials via H2O pattern before starting |
| **Need tasks** | `/tasks-init` | Scaffold TASKS.md |
| **Large-scale automation** | `/team-orchestrate` | Parallel execution of 30–80 tasks |
| **Gap/assumption validation** | `/eros` → `/the-fool` | Gap analysis + critical validation |
| **Planning review** | `/poietes` | Eros planning v2 |
| **After Muscles layer** | `/checkpoint` | 2-stage code review **(v2.4.0 NEW)** |
| **After Skin layer** | `/trinity` → `/audit` | Five-pillar evaluation + full audit |
| **On bug** | `/systematic-debugging` | Root cause analysis |
| **Test automation** | `/powerqa` | QA cycling |
| **On interruption** | `/recover` | Work recovery |
| **Context overload** | `/compress` | Compress long docs/code and retry |

### Agent Teams Integration

When Agent Teams are active, delegate sprint coordination to team-lead.

```
/agile start or /agile auto:
    ↓
┌─────────────────────────────────────────────────────────────┐
│  1. Request sprint plan from team-lead                      │
│  - Pass sprint scope and schedule                           │
│  - team-lead distributes tasks to domain team members       │
├─────────────────────────────────────────────────────────────┤
│  2. Parallel execution per team member                      │
│  - architecture-lead → Task(builder): API/data logic        │
│  - design-lead → Task(builder): UI/state management         │
│  - qa-lead → Task(reviewer): security review (on Muscles)   │
├─────────────────────────────────────────────────────────────┤
│  3. Request quality validation from qa-lead at checkpoint   │
│  - Proceed to next layer after quality gate passes          │
└─────────────────────────────────────────────────────────────┘
```

| Agent | Invocation Point | Role |
|-------|------------------|------|
| **team-lead** | Sprint start | Task distribution, Plan Approval |
| **architecture-lead** | Muscles layer | Delegate API/DB logic |
| **design-lead** | Skin layer | Delegate UI/UX implementation |
| **qa-lead** | Each layer completion | Quality gate approval |

**When Agent Teams are inactive:** operate in standalone mode (skip agent delegation)

---

## Failure Response

| Failure Type | Recommended Action |
|--------------|-------------------|
| **Test failure** | `/systematic-debugging` → fix → re-run |
| **Build failure** | Analyze error message → `/agile iterate "fix build error"` |
| **Review failure** | Apply `/code-review` feedback → re-review |
| **CLI interruption** | `/recover` → `/agile status` → resume |

---

**Last Updated**: 2026-03-16 (v3.0.0 - Agent Teams integration, agent-browser + Lighthouse CLI)
