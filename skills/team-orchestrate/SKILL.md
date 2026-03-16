---
name: team-orchestrate
description: 3-level hierarchical agent orchestration using Claude Code native Agent Teams. Analyzes TASKS.md, creates a flat team via TeamCreate, enforces logical hierarchy (lead → domain-leads → workers) through SendMessage protocols. Supports parallel execution, inter-agent communication, and governance hooks.
triggers:
  - /team-orchestrate
  - 에이전트 팀 실행
  - 팀 오케스트레이트
version: 3.0.0
updated: 2026-03-16
---

# Agent Teams Orchestration (3-Level)

> **Goal**: Parallel agent execution with hierarchical coordination using native Agent Teams API.
>
> **v3.0**: Flat TeamCreate + logical 3-level hierarchy via SendMessage protocol.
> All agents are teammates (can communicate freely). Hierarchy is enforced by prompt convention.

---

## Prerequisite Checks (auto-run on activation)

1. **TASKS.md exists**: Must be at project root.
   - Missing → "Create one first with `/tasks-init`."

2. **TASKS.md format**: Must include `deps:` and `domain:` fields.
   - Invalid → "Convert with `/tasks-migrate`."

3. **Agent Teams enabled**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings.
   - Missing → "Run `project-team/install.sh --local --mode=team`."

---

## Architecture: Logical 3-Level on Flat Team

All agents are spawned flat by the lead (TeamCreate), but communicate in a hierarchical protocol via SendMessage.

```
Physical structure (flat — all are teammates):
  TeamCreate("project")
  ├── architecture-lead    ← domain coordinator
  ├── backend-builder      ← worker
  ├── reviewer             ← worker
  ├── design-lead          ← domain coordinator
  ├── frontend-builder     ← worker
  ├── designer             ← worker
  └── qa-lead              ← cross-cutting quality

Logical hierarchy (enforced by prompts + SendMessage):
  Level 0: team-lead (this session)
    │
    ├── Level 1: architecture-lead (coordinates backend domain)
    │     ├── Level 2: backend-builder (implements, reports to architecture-lead)
    │     └── Level 2: reviewer (reviews, reports to architecture-lead)
    │
    ├── Level 1: design-lead (coordinates frontend domain)
    │     ├── Level 2: frontend-builder (implements, reports to design-lead)
    │     └── Level 2: designer (designs, reports to design-lead)
    │
    └── Level 1: qa-lead (cross-cutting quality, reports to team-lead)
```

**Key insight**: SendMessage works between ANY teammates. Hierarchy is a communication convention, not a technical limitation.

---

## Communication Protocol

### Reporting Chain (bottom-up)

```
Worker → SendMessage(to=domain-lead) → "Task T1.1 complete, ready for review"
Domain-lead → SendMessage(to=team-lead) → "Backend phase 1 complete, 3/5 tasks done"
```

### Delegation Chain (top-down)

```
Team-lead → SendMessage(to=domain-lead) → "Priority shift: focus on auth module first"
Domain-lead → SendMessage(to=worker) → "Start T1.3, auth endpoints"
```

### Cross-domain (lateral)

```
architecture-lead → SendMessage(to=design-lead) → "API contract changed, update frontend"
qa-lead → SendMessage(to=backend-builder) → "T1.1 test failed, fix needed"
```

### Protocol Rules

1. Workers report to their domain-lead, not directly to team-lead
2. Domain-leads aggregate status and report to team-lead
3. Cross-domain issues go through domain-leads or qa-lead
4. Anyone can message anyone in urgent situations (flat team allows it)
5. Team-lead is the final arbiter for conflicts

---

## Execution Flow

### Step 1: Analyze TASKS.md

```bash
node skills/team-orchestrate/scripts/domain-analyzer.js --tasks-file TASKS.md --json
```

Output determines which domain-leads and workers to activate.

### Step 2: Create Team

```
TeamCreate(
  team_name = "{project-name}",
  description = "3-level team: {n} domain-leads, {m} workers, {t} tasks"
)
```

### Step 3: Create Tasks in Shared TaskList

For each incomplete task from TASKS.md:

```
TaskCreate(subject = "T1.1: User API design", description = "...")
```

Set dependencies:

```
TaskUpdate(task_id = "2", addBlockedBy = ["1"])
```

### Step 4: Spawn All Agents (Flat)

Spawn domain-leads and workers as flat teammates. Hierarchy is in the prompt.

**Domain Lead prompt template:**

```
Agent(
  subagent_type = "general-purpose",
  team_name = "{project-name}",
  name = "architecture-lead",
  prompt = "You are architecture-lead on team {project-name}.

    ROLE: Domain coordinator for backend/api/database.
    REPORTS TO: team-lead (via SendMessage)
    SUPERVISES: backend-builder, reviewer (via SendMessage)

    Workflow:
    1. Check TaskList for tasks in your domain
    2. Assign tasks to your workers via SendMessage:
       SendMessage(to='backend-builder', message='Work on task #N: ...')
    3. Review worker output when they report back
    4. Aggregate progress and report to team-lead:
       SendMessage(to='team-lead', message='Domain status: ...')
    5. Resolve issues within your domain before escalating

    You do NOT implement code directly — delegate to workers.
    Update TASKS.md with [x] when tasks in your domain are verified complete."
)
```

**Worker prompt template:**

```
Agent(
  subagent_type = "builder",
  team_name = "{project-name}",
  name = "backend-builder",
  prompt = "You are backend-builder on team {project-name}.

    ROLE: Implementation worker for backend domain.
    REPORTS TO: architecture-lead (via SendMessage)
    PEERS: reviewer

    Workflow:
    1. Wait for task assignment from architecture-lead
    2. Check TaskList and claim assigned tasks: TaskUpdate(task_id, owner='backend-builder')
    3. Implement the task
    4. Mark complete: TaskUpdate(task_id, status='completed')
    5. Report to architecture-lead:
       SendMessage(to='architecture-lead', message='Task #N complete, ready for review')
    6. Check TaskList for next available task

    {cli_hint}"
)
```

**QA Lead prompt (cross-cutting):**

```
Agent(
  subagent_type = "general-purpose",
  team_name = "{project-name}",
  name = "qa-lead",
  prompt = "You are qa-lead on team {project-name}.

    ROLE: Cross-cutting quality assurance.
    REPORTS TO: team-lead (via SendMessage)
    REVIEWS: All workers' output

    Workflow:
    1. Monitor TaskList for completed tasks
    2. Review completed work (run tests, check quality)
    3. If issues found → SendMessage(to=worker, message='Fix needed: ...')
    4. If approved → SendMessage(to=domain-lead, message='Task #N verified')
    5. Report overall quality status to team-lead"
)
```

### Step 5: Assign Initial Tasks

```
TaskUpdate(task_id = "1", owner = "backend-builder")
TaskUpdate(task_id = "5", owner = "frontend-builder")
TaskUpdate(task_id = "8", owner = "designer")
```

Then notify domain-leads:

```
SendMessage(to = "architecture-lead", message = "Tasks #1,#2,#3 assigned to your domain. Coordinate backend-builder and reviewer.")
SendMessage(to = "design-lead", message = "Tasks #5,#6 assigned to your domain. Coordinate frontend-builder and designer.")
```

### Step 6: Monitor and Coordinate

While team works:
- Receive status reports from domain-leads automatically
- Resolve cross-domain conflicts (architecture-lead ↔ design-lead)
- Handle plan approvals if configured
- Check TaskList periodically for overall progress
- Reassign tasks if a worker is stuck

### Step 7: Completion and Shutdown

When TaskList shows all tasks completed:

1. Verify TASKS.md is fully updated
2. Ask qa-lead for final quality report:
   ```
   SendMessage(to = "qa-lead", message = "All tasks marked complete. Run final quality check.")
   ```
3. Shutdown all teammates (workers first, then leads):
   ```
   SendMessage(to = "backend-builder", message = { "type": "shutdown_request" })
   SendMessage(to = "frontend-builder", message = { "type": "shutdown_request" })
   SendMessage(to = "designer", message = { "type": "shutdown_request" })
   SendMessage(to = "reviewer", message = { "type": "shutdown_request" })
   SendMessage(to = "architecture-lead", message = { "type": "shutdown_request" })
   SendMessage(to = "design-lead", message = { "type": "shutdown_request" })
   SendMessage(to = "qa-lead", message = { "type": "shutdown_request" })
   ```
4. Report final status to user

---

## Team Sizing

Not all projects need all agents. Spawn only what domain-analyzer recommends:

| Project type | Domain leads | Workers | Total |
|-------------|-------------|---------|-------|
| Backend only | architecture-lead | backend-builder, reviewer | 3 |
| Full-stack | architecture-lead, design-lead | backend-builder, frontend-builder, reviewer, designer | 6 |
| Full + QA | architecture-lead, design-lead, qa-lead | backend-builder, frontend-builder, reviewer, designer | 7 |

---

## Optional Multi-AI CLI Routing

Workers can invoke external AI CLI for subtasks. Set `cli` in `team-topology.json`:

```json
{ "design-lead": { "cli": "gemini" } }
```

The CLI hint is included in the worker's spawn prompt. The worker (Claude) decides when to invoke, validates results, and hooks still apply.

---

## Configuration

- `config/team-topology.json` — domain mapping, CLI routing
- `references/agent-teams-api.md` — full API reference

---

## Governance Hooks

| Hook | When | Effect |
|------|------|--------|
| TeammateIdle | Any teammate finishes a turn | Check for incomplete work |
| TaskCompleted | Any task marked complete | Lightweight quality gate |
| task-progress-gate (Stop) | Lead session ending | Warn if TASKS.md not updated |

---

**Last Updated**: 2026-03-16 (v3.0.0 — 3-Level logical hierarchy on flat TeamCreate)
