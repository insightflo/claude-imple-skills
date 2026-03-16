# Agent Teams API Reference

> Native Claude Code Agent Teams tools for programmatic team control.
> Discovered 2026-03-16 — these tools replace the "natural language only" assumption.

## Available Tools

### TeamCreate

Creates a team + shared task list.

```json
{
  "team_name": "my-project",
  "description": "Working on feature X",
  "agent_type": "team-lead"
}
```

Creates:
- `~/.claude/teams/{team-name}.json` (team config)
- `~/.claude/tasks/{team-name}/` (shared task list)

### TaskCreate

Creates a task in the team's shared task list.

```json
{
  "subject": "Implement User API",
  "description": "Create CRUD endpoints for user domain",
  "activeForm": "Implementing User API"
}
```

- Status starts as `pending`
- Use TaskUpdate to set `owner`, `status`, `blocks`, `blockedBy`

### TaskUpdate

Updates task status, owner, dependencies.

```json
{
  "task_id": "1",
  "status": "in_progress",
  "owner": "architecture-lead"
}
```

### TaskList

Lists all tasks in the team's task list. Returns id, subject, status, owner, blockedBy.

### TaskGet

Gets full details of a specific task by ID.

### Agent (with team_name)

Spawns a teammate that joins the team.

```json
{
  "subagent_type": "builder",
  "team_name": "my-project",
  "name": "architecture-lead",
  "prompt": "You are the architecture lead. Check TaskList for your assigned tasks."
}
```

Key parameters for Agent Teams:
- `team_name`: Associates agent with the team (required for teammate)
- `name`: Teammate name (used for messaging, task ownership)
- `subagent_type`: Agent type (determines available tools)

### SendMessage

Sends messages between teammates.

```json
{
  "to": "architecture-lead",
  "message": "Start working on task #1",
  "summary": "Assign task #1"
}
```

Protocol messages:
- `{ "type": "shutdown_request" }` — graceful shutdown
- `{ "type": "plan_approval_response", "approve": true }` — plan approval

Broadcast: `"to": "*"` sends to all teammates (use sparingly).

---

## Complete Workflow

```
Step 1: Create team
  TeamCreate(team_name="customs-flo", description="CustomsFlo3 implementation")

Step 2: Create tasks (from TASKS.md analysis)
  TaskCreate(subject="T1.1: User API design", description="...")
  TaskCreate(subject="T1.2: User API impl", description="...")
  TaskCreate(subject="T2.1: Dashboard UI", description="...")

Step 3: Set dependencies
  TaskUpdate(task_id="2", blockedBy=["1"])

Step 4: Spawn teammates
  Agent(subagent_type="builder", team_name="customs-flo", name="architecture-lead",
        prompt="You are architecture-lead. Check TaskList for assigned tasks...")
  Agent(subagent_type="designer", team_name="customs-flo", name="design-lead",
        prompt="You are design-lead. Check TaskList for assigned tasks...")

Step 5: Assign tasks
  TaskUpdate(task_id="1", owner="architecture-lead")
  TaskUpdate(task_id="3", owner="design-lead")

Step 6: Teammates work autonomously
  - Each teammate checks TaskList, works on owned tasks
  - Marks tasks complete via TaskUpdate
  - Communicates via SendMessage
  - Goes idle between turns (normal behavior)

Step 7: Shutdown
  SendMessage(to="architecture-lead", message={ "type": "shutdown_request" })
  SendMessage(to="design-lead", message={ "type": "shutdown_request" })
```

---

## 3-Level Architecture

```
Level 0: Agent Team (TeamCreate + Agent with team_name)
  team-lead (this session)
  ├── architecture-lead (Teammate) — mailbox, shared tasks
  ├── qa-lead (Teammate)
  └── design-lead (Teammate)

Level 1: Teammate internals (Task tool for subagents)
  architecture-lead
    └── Task(builder), Task(reviewer)

Level 2: Subagent internals (Bash for external CLI)
  builder
    └── Bash("echo '...' | gemini")
```

- Level 0: Native Agent Teams (TeamCreate, SendMessage, shared TaskList)
- Level 1: Regular subagent delegation (Task tool within teammate)
- Level 2: External CLI invocation (Bash within subagent)

---

## Key Constraints

1. No nested teams — teammates cannot create teams
2. No teammate modification after spawn — cannot change tools/model
3. Teammates go idle between turns — this is normal, not an error
4. Send shutdown_request for graceful termination
5. Task ownership via TaskUpdate(owner=name), not via SendMessage
6. All teammates share the same permission mode as the lead
7. Teammates have their own context window (independent from lead)

---

## File Locations

```
~/.claude/teams/{team-name}.json          — team config (members array)
~/.claude/teams/{team-name}/inboxes/      — mailbox per teammate
~/.claude/tasks/{team-name}/              — shared task list (1.json, 2.json, ...)
```

---

## Hooks (fire for Agent Teams only)

| Hook | When | Input |
|------|------|-------|
| TeammateIdle | Teammate finishes a turn | `{ teammate_name, team_name }` |
| TaskCompleted | Task marked complete | `{ task_id, task_subject, teammate_name, team_name }` |

Exit code 2 from hook → feedback loop (teammate continues working).
