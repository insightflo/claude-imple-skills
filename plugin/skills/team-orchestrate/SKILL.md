---
name: team-orchestrate
description: 3-level hierarchical agent orchestration using Claude Code native Agent Teams. Analyzes TASKS.md, creates a flat team via TeamCreate, enforces logical hierarchy (lead → domain-leads → workers) through SendMessage protocols. Supports parallel execution, inter-agent communication, and governance hooks.
triggers:
  - /team-orchestrate
  - 에이전트 팀 실행
  - 팀 오케스트레이트
version: 3.3.0
updated: 2026-03-17
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

> **CRITICAL**: Checks 1-2 are HARD BLOCKERS — user must fix manually.
> Checks 3-5 are AUTO-FIXABLE — if missing, run `install.sh --local --mode=team` automatically.
> Check 6 is a soft recommendation.

1. **TASKS.md exists**: Must be at project root.
   - Missing → STOP. "Create one first with `/tasks-init`."

2. **TASKS.md format**: Must include `deps:` and `domain:` fields.
   - Invalid → STOP. "Convert with `/tasks-migrate`."

3. **Agent Teams enabled**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings.
4. **Project-level hooks installed**: `.claude/hooks/` must exist and contain hook files.
5. **Project-level settings.json registered**: `.claude/settings.json` must exist and reference the hooks.

   - **Checks 3-5 any fail → AUTO-FIX**: Run the following, then re-verify:
     ```bash
     bash ${CLAUDE_PLUGIN_ROOT}/project-team/install.sh --local --mode=team --force
     ```
   - If auto-install fails → STOP and report the error to the user.

6. **governance-setup completed** (recommended, user choice required):
   - Missing → ASK USER using `AskUserQuestion`:
     ```text
     Question: Governance setup (/governance-setup) not found. Create governance structure first?
     Options:
       1. Yes, run /governance-setup first (recommended)
       2. No, proceed without governance
     ```
   - If user selects "Yes" → STOP. "Run `/governance-setup` first, then come back."
   - If user selects "No" → Proceed with a warning: "Proceeding without governance structure."

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

> **Before Step 1**: All 6 prerequisite checks must PASS. If checks 1-5 fail, do not proceed.
> Recommended prior steps: `/governance-setup` → `install.sh --local` → `/tasks-migrate` → then here.

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

### Step 2.5: Initialize collaboration directories

Ensure document directories exist for ADR, REQ, and reports:

```bash
Bash('mkdir -p .claude/collab/decisions .claude/collab/requests .claude/collab/reports')
```

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
    2. Assign ONLY unblocked tasks (blockedBy is empty) to workers via SendMessage
    3. When worker reports task done, run domain-level tests:
       Bash('cd backend && pytest') or Bash('cd frontend && npm test')
    4. If tests FAIL → SendMessage to worker with failure details, do NOT mark complete
    5. If tests PASS → TaskUpdate(status='completed'), update TASKS.md with [x]
    6. Report progress to team-lead via SendMessage
    7. When all domain tasks in a phase complete, report phase completion

    ORDERING RULES:
    - NEVER assign a task whose blockedBy contains incomplete tasks
    - Check TaskList after each completion — new tasks may become unblocked
    - Assign tasks in ID order when multiple are available

    You coordinate and verify — do NOT implement code directly.

    CONTEXT MANAGEMENT:
    If a file is over 500 lines, compress before reading:
      Bash('node ${CLAUDE_PLUGIN_ROOT}/project-team/services/contextOptimizer.js optimize <file> --heavy-count=15')

    DECISION RECORDS (mandatory — skip this and your decision has no authority):
    When you make ANY technical decision (API design, architecture choice,
    technology selection, trade-off resolution), you MUST write it to:
      .claude/collab/decisions/ADR-{NNN}-{short-title}.md
    Use this exact format:
      ## ADR-{NNN}: {Title}
      - Status: Accepted
      - Date: {YYYY-MM-DD}
      - Author: {your-agent-name}
      - Context: why this decision was needed
      - Decision: what was decided
      - Consequences: impact
    Example: Write('.claude/collab/decisions/ADR-001-use-jwt-auth.md', content)

    CROSS-DOMAIN ISSUES (mandatory — no direct cross-domain changes allowed):
    When your domain needs something from another domain (e.g., API
    contract change, shared type update), create a request file:
      .claude/collab/requests/REQ-{YYYYMMDD}-{NNN}.md
    Format:
      ## Request: {Title}
      - From: {your-agent-name}
      - To: {target-domain-lead}
      - Type: api-change | type-update | dependency | other
      - Status: OPEN
      - Description: {what you need}
    Then notify the other domain-lead via SendMessage.

    STATUS REPORTS (mandatory after each phase):
    After completing each phase, write a summary to:
      .claude/collab/reports/{date}-{domain}-status.md
    Include: tasks completed, decisions made, issues encountered, next steps.

    EXTERNAL AI ROUTING (optional — when cli field is set in team-topology.json):
    For code-heavy tasks, you can delegate implementation to Codex or Gemini CLI
    instead of waiting for a worker agent. Use this when:
    - Task is pure code generation (new file, boilerplate, CRUD endpoints)
    - Task is UI/styling work and you want Gemini's visual reasoning

    How to route:
      Bash('bash ${CLAUDE_PLUGIN_ROOT}/skills/team-orchestrate/scripts/cli-route.sh codex \"Implement user authentication middleware in backend/app/middleware/auth.py. Use JWT with python-jose. Include token validation and role extraction.\"')
      Bash('bash ${CLAUDE_PLUGIN_ROOT}/skills/team-orchestrate/scripts/cli-route.sh gemini \"Create a responsive login page component at frontend/src/pages/LoginPage.tsx using React 19 and Tailwind CSS.\"')

    Rules for CLI routing:
    - ALWAYS review CLI output before accepting — external AI may produce incorrect code
    - Run tests after CLI generates code, same as with worker output
    - If CLI fails or output is poor, fall back to worker agent
    - Log CLI usage in status report: 'Task #N delegated to codex/gemini'",
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
    1. Check TaskList — only pick tasks with YOUR name as owner AND empty blockedBy
    2. Claim: TaskUpdate(task_id, owner='backend-builder', status='in_progress')
    3. Implement the task
    4. Run unit tests for YOUR changes:
       Bash('cd backend && pytest tests/test_<module>.py -v') or
       Bash('cd frontend && npx vitest run src/<file>.test.tsx')
    5. If tests FAIL → fix and re-test. Do NOT proceed until tests pass.
    6. If tests PASS → report to domain-lead:
       SendMessage(to='architecture-lead', message='Task #N done. Tests: X/X passed.')
    7. Wait for domain-lead verification before checking TaskList for next task
    8. Do NOT call TaskUpdate(status='completed') yourself — domain-lead does it after verification

    CONTEXT MANAGEMENT:
    If a file is over 500 lines, compress before reading:
      Bash('node ${CLAUDE_PLUGIN_ROOT}/project-team/services/contextOptimizer.js optimize <file> --heavy-count=15')

    RULES:
    - NEVER skip tests. Every task must have passing tests before reporting done.
    - NEVER mark a task completed yourself. Only domain-lead marks completion after domain test.
    - If blocked, report to domain-lead. Do NOT make architectural decisions.",
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

    TEST HIERARCHY (mirrors human team):
    - Level 2 (worker): unit tests per task — worker runs before reporting done
    - Level 1 (domain-lead): domain tests — lead runs before marking complete
    - Level 0 (qa-lead): integration/cross-domain tests — you run when phase completes

    Workflow:
    1. Monitor TaskList — wait for domain-leads to report phase completion
    2. When a phase completes, run cross-domain integration tests:
       Bash('cd backend && pytest')
       Bash('cd frontend && npm test')
       Bash('cd backend && pytest tests/integration/ -v')  (if exists)
    3. If integration tests FAIL → SendMessage to relevant domain-lead with details
    4. If all tests PASS → write report and notify team-lead
    5. Report to team-lead: SendMessage(to='team-lead', message='Phase N QA: PASS/FAIL')

    QUALITY REPORTS (mandatory after each phase — no phase is approved without this):
    Write findings to: .claude/collab/reports/{date}-qa-phase-{N}.md
    Use this exact format:
      ## QA Report: Phase {N}
      - Date: {YYYY-MM-DD}
      - Verdict: PASS | FAIL
      - Tests Run: {count}
      - Passed: {count}
      - Failed: {count}
      - Integration Issues: {list or 'none'}
      - Recommendation: {approve phase / block phase with reasons}
    Example: Write('.claude/collab/reports/2026-03-17-qa-phase-1.md', content)

    NEVER approve a phase if integration tests fail.",
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

**Context management (auto):**
When you need to read long files (specs, plans, large source) or your context feels overloaded,
compress them before reading:
```bash
node project-team/services/contextOptimizer.js optimize <file> --heavy-count=15
```
Include this hint in teammate spawn prompts so domain-leads and workers also use it:
```
CONTEXT MANAGEMENT:
If a file is over 500 lines, compress before reading:
  Bash('node ${CLAUDE_PLUGIN_ROOT}/project-team/services/contextOptimizer.js optimize <file> --heavy-count=15')
```

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
