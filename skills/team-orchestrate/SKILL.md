---
name: team-orchestrate
description: 3-level hierarchical agent orchestration using Claude Code native Agent Teams. Analyzes TASKS.md, creates a flat team via TeamCreate, enforces logical hierarchy (lead → domain-leads → workers) through SendMessage protocols. Supports parallel execution, inter-agent communication, and governance hooks.
triggers:
  - /team-orchestrate
  - 에이전트 팀 실행
  - 팀 오케스트레이트
version: 3.1.0
updated: 2026-03-16
---

# Agent Teams Orchestration (3-Level)

> **Goal**: Parallel agent execution with hierarchical coordination using native Agent Teams API.
>
> **CRITICAL**: You MUST use `TeamCreate` tool to create the team, then `Agent` tool with `team_name` parameter to spawn teammates. Do NOT use plain `Task()` or `Agent()` without `team_name` — that creates regular subagents, not Agent Teams teammates.

---

## Absolute Requirements

1. **MUST call `TeamCreate` tool** before spawning any agent — this creates the shared task list and mailbox infrastructure
2. **MUST use `Agent` tool with `team_name` and `name` parameters** to spawn each teammate — without `team_name`, agents are plain subagents with no communication ability
3. **MUST use `TaskCreate` tool** to register tasks in the shared list — teammates discover work through `TaskList`
4. **MUST use `SendMessage` tool** for all inter-agent communication — teammates cannot hear you unless you use SendMessage
5. **NEVER use plain `Task()` calls** — those bypass Agent Teams entirely

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

## Execution Steps (MUST follow exactly)

### Step 1: Analyze TASKS.md

```bash
node skills/team-orchestrate/scripts/domain-analyzer.js --tasks-file TASKS.md --json
```

### Step 2: Call TeamCreate (MANDATORY — do this FIRST)

You MUST call the `TeamCreate` tool. This is a tool call, not a description:

```
TeamCreate(
  team_name = "{project-name}",
  description = "3-level team for {project-name}"
)
```

If you skip this step, nothing else works. Verify you see `team_file_path` in the response.

### Step 3: Call TaskCreate for each task (MANDATORY)

For every incomplete task from TASKS.md, call the `TaskCreate` tool:

```
TaskCreate(
  subject = "T1.1: User API design",
  description = "Design REST endpoints for user domain. deps: []. domain: backend."
)
```

Then set dependencies with `TaskUpdate`:

```
TaskUpdate(task_id = "2", addBlockedBy = ["1"])
```

### Step 4: Spawn teammates with Agent tool (MANDATORY — use team_name)

For each teammate, call `Agent` with BOTH `team_name` AND `name`:

**Domain Lead example:**

```
Agent(
  subagent_type = "general-purpose",
  team_name = "{project-name}",          ← REQUIRED for Agent Teams
  name = "architecture-lead",            ← REQUIRED for messaging
  prompt = "You are architecture-lead on team {project-name}.

    ROLE: Domain coordinator for backend/api/database.
    REPORTS TO: team-lead (via SendMessage)
    SUPERVISES: backend-builder, reviewer (via SendMessage)

    Workflow:
    1. Call TaskList to see tasks in your domain
    2. Assign tasks to your workers via SendMessage
    3. Review worker output when they report back
    4. Report progress to team-lead via SendMessage
    5. Update TASKS.md with [x] when verified complete

    You coordinate — do NOT implement code directly.

    DECISION RECORDS (mandatory):
    When you make a technical decision (API design, architecture choice,
    technology selection, trade-off resolution), write it to:
      management/decisions/ADR-NNN-short-title.md
    Use this format:
      ## ADR-NNN: Title
      - Status: Accepted
      - Context: why this decision was needed
      - Decision: what was decided
      - Consequences: impact

    CROSS-DOMAIN ISSUES:
    When your domain needs something from another domain (e.g., API
    contract change, shared type update), create a request file:
      .claude/collab/requests/REQ-YYYYMMDD-NNN.md
    Notify the other domain-lead via SendMessage.

    STATUS REPORTS:
    After each phase or milestone, write a summary to:
      management/reports/{date}-{domain}-status.md",
  run_in_background = true
)
```

**Worker example:**

```
Agent(
  subagent_type = "builder",
  team_name = "{project-name}",          ← REQUIRED
  name = "backend-builder",              ← REQUIRED
  prompt = "You are backend-builder on team {project-name}.

    ROLE: Implementation worker for backend domain.
    REPORTS TO: architecture-lead (via SendMessage)

    Workflow:
    1. Check TaskList for tasks assigned to you
    2. Claim task: TaskUpdate(task_id, owner='backend-builder', status='in_progress')
    3. Implement the task
    4. Mark complete: TaskUpdate(task_id, status='completed')
    5. Report to architecture-lead: SendMessage(to='architecture-lead', message='Task #N done')
    6. Check TaskList for next task

    ISSUES & BLOCKERS:
    If you encounter a problem that needs a decision, report it to your
    domain-lead via SendMessage with enough context for them to decide.
    Do NOT make architectural decisions on your own.",
  run_in_background = true
)
```

**QA Lead example:**

```
Agent(
  subagent_type = "general-purpose",
  team_name = "{project-name}",
  name = "qa-lead",
  prompt = "You are qa-lead on team {project-name}.

    ROLE: Cross-cutting quality assurance.
    REPORTS TO: team-lead (via SendMessage)

    Workflow:
    1. Monitor TaskList for completed tasks
    2. Review completed work (run tests, check quality)
    3. If issues found → SendMessage to the worker with fix request
    4. If approved → SendMessage to domain-lead confirming verification
    5. Report quality status to team-lead

    QUALITY REPORTS:
    After reviewing a batch of tasks, write findings to:
      management/reports/{date}-qa-review.md
    Include: what was reviewed, issues found, pass/fail verdict.",
  run_in_background = true
)
```

**VERIFY**: Each Agent call must return `team_name` in the response. If it doesn't, you spawned a plain subagent.

### Step 5: Assign initial tasks

```
TaskUpdate(task_id = "1", owner = "backend-builder")
TaskUpdate(task_id = "5", owner = "frontend-builder")
```

Then notify domain-leads:

```
SendMessage(to = "architecture-lead", message = "Tasks assigned. Coordinate backend-builder and reviewer.", summary = "Task assignments ready")
SendMessage(to = "design-lead", message = "Tasks assigned. Coordinate frontend-builder and designer.", summary = "Task assignments ready")
```

### Step 6: Monitor and Mediate

- Receive messages from domain-leads automatically (no polling)
- Check TaskList periodically
- Reassign stuck tasks via TaskUpdate

**When mediating cross-domain conflicts:**
1. Collect positions from both domain-leads via SendMessage
2. Make a decision based on project goals and architecture principles
3. Record the decision in `.claude/collab/decisions/DEC-YYYYMMDD-NNN.md`:
   ```
   ## Decision: [Title]
   - From: team-lead
   - To: [affected domain-leads]
   - Context: [what was in conflict]
   - Decision: [what was decided]
   - Required Actions: [who does what]
   ```
4. Notify affected domain-leads via SendMessage

### Step 7: Shutdown

When all tasks complete:

```
SendMessage(to = "backend-builder", message = { "type": "shutdown_request", "reason": "All tasks complete" })
SendMessage(to = "frontend-builder", message = { "type": "shutdown_request", "reason": "All tasks complete" })
... (all teammates)
```

---

## Team Sizing

Spawn only what the project needs:

| Project type | Domain leads | Workers | Total |
|-------------|-------------|---------|-------|
| Backend only | architecture-lead | backend-builder, reviewer | 3 |
| Full-stack | architecture-lead, design-lead | backend-builder, frontend-builder, reviewer, designer | 6 |
| Full + QA | + qa-lead | | 7 |

---

## Communication Protocol

```
Worker → SendMessage(to=domain-lead)     "Task #1 done, ready for review"
Domain-lead → SendMessage(to=team-lead)  "Backend phase 1: 3/5 tasks done"
Domain-lead → SendMessage(to=worker)     "Fix auth logic in T1.3"
Cross-domain: architecture-lead → SendMessage(to=design-lead)  "API changed"
```

---

## Configuration

- `config/team-topology.json` — domain mapping, CLI routing
- `references/agent-teams-api.md` — full API reference

---

## Governance Hooks

| Hook | When | Effect |
|------|------|--------|
| TeammateIdle | Teammate finishes a turn | Check for incomplete work |
| TaskCompleted | Task marked complete | Lightweight quality gate |
| task-progress-gate (Stop) | Lead session ending | Warn if TASKS.md not updated |

---

**Last Updated**: 2026-03-16 (v3.1.0 — Mandatory tool call enforcement)
