---
name: team-orchestrate
description: Hierarchical agent orchestration using Claude Code native Agent Teams. Analyzes TASKS.md, automatically forms an agent team (PM Lead + Architecture/QA/Design teammates), and runs them in parallel with Plan Approval and governance hooks for quality assurance.
triggers:
  - /team-orchestrate
  - 에이전트 팀 실행
  - 팀 오케스트레이트
version: 1.0.0
updated: 2026-03-16
---

# Agent Teams Orchestration

> **Goal**: Hierarchical agent team execution using Claude Code native Agent Teams
>
> **Key differentiator**: Leverages Claude Code native Agent Teams (mailbox communication, shared task list, hooks) to provide hierarchical agent collaboration with Plan Approval-based governance.

---

## Architecture

```
Level 0 — Agent Team (Native)
  team-lead (PM Leader)
  ├── architecture-lead (Teammate) → Task(builder) / Task(reviewer)
  ├── qa-lead (Teammate)           → Task(reviewer) / Task(test-specialist)
  └── design-lead (Teammate)       → Task(designer) / Task(builder)

Communication: Lead ↔ Teammates = mailbox (bidirectional)
Delegation:    Teammate → Subagents = Task tool (unidirectional)
Governance:    TeammateIdle hook + TaskCompleted hook
Monitoring:    whitebox dashboard + direct user messages
```

---

## Prerequisite Checks (run automatically on skill activation)

When the skill is triggered, verify the following in order before starting any implementation.
If any check fails, output the corresponding message and stop.

1. **TASKS.md exists**: `TASKS.md` must be present at the project root.
   - If missing: "TASKS.md not found. Create one first with `/tasks-init`."

2. **TASKS.md format**: Must use the standard format including `deps:` and `domain:` fields.
   - If missing: "Convert TASKS.md format with `/tasks-migrate`."

3. **Agent Teams installed**: All three of the following must be confirmed:
   - `.claude/agents/team-lead.md` exists
   - `AGENT_TEAMS` environment variable registered in `.claude/settings.json`
   - `project-team` hooks (`TeammateIdle`, `TaskCompleted`) registered
   - If any is missing: "Agent Teams leader is not installed. Run `project-team/install.sh --local --mode=team`."

---

## Execution Flow

### Step 1: Domain Analysis

When the skill is invoked, analyze TASKS.md with `domain-analyzer.js`:

```bash
node skills/team-orchestrate/scripts/domain-analyzer.js --tasks-file TASKS.md
```

Output: JSON with task assignments per domain.

### Step 2: Team Formation

Using the domain-analyzer output, assemble the Agent Team:

1. Designate **team-lead** agent as the leader
2. Activate required teammates based on domain analysis results:
   - Backend/API/architecture tasks → `architecture-lead`
   - Testing/quality/security tasks → `qa-lead`
   - UI/design/frontend tasks → `design-lead`
3. Deactivate unnecessary teammates (e.g., exclude design-lead if no frontend work)

### Step 3: Plan Approval

All teammates must submit a plan to team-lead before implementing:

```
Teammate → Submit Plan → team-lead Reviews → Approved/Rejected
```

Approval criteria:
- Task scope is within the assigned domain
- No conflicts with other teammates' work
- Follows technical standards
- Risk is assessed appropriately

### Step 4: Parallel Execution

Teammates execute in parallel according to approved plans:
- Each teammate delegates their domain tasks to subagents via the Task tool
- Subagents (builder, reviewer, designer, test-specialist) do the actual implementation
- team-lead mediates when conflicts arise between teammates

### Step 5: Governance Verification

Automated hooks enforce governance:
- **TeammateIdle hook**: Checks for incomplete tasks/escalations when a teammate goes idle
- **TaskCompleted hook**: Lightweight quality gate on task completion

### Step 6: Completion

When all tasks are done:
1. qa-lead runs the final quality gate
2. team-lead writes the completion report
3. Report results to the user

---

## Required Inputs

### TASKS.md

Uses the standard TASKS.md format:

```yaml
## T1 - User Resource

- [ ] T1.1: User API design
  - deps: []
  - domain: backend
  - risk: low
  - owner: architecture-lead

- [ ] T1.2: User API implementation
  - deps: [T1.1]
  - domain: backend
  - risk: medium
  - files: src/domains/user/*
  - owner: architecture-lead
```

### Domain Mapping

| Domain | Teammate | Subagents |
|--------|----------|-----------|
| backend | architecture-lead | builder, reviewer |
| frontend | design-lead | designer, builder |
| api | architecture-lead | builder, reviewer |
| design | design-lead | designer |
| test | qa-lead | test-specialist |
| security | qa-lead | reviewer |
| shared | architecture-lead | builder |

---

## Configuration

### team-topology.json

Customize the domain-to-teammate mapping in `skills/team-orchestrate/config/team-topology.json`.

### Multi-AI CLI Routing (Optional)

By default, all teammates execute via Claude Task tool. To route a teammate's work to an external AI CLI (Gemini or Codex), set the `cli` field in `team-topology.json`:

```json
{
  "teammates": {
    "design-lead": {
      "cli": "gemini",
      "executors": ["designer", "builder"],
      "domains": ["frontend", "design", "ui", "ux"]
    }
  }
}
```

When `cli` is set, team-lead includes a **CLI hint** in the delegation prompt. The subagent (Claude) stays in control and decides when to invoke the external CLI for specific subtasks:

| `cli` value | Behavior | Best for |
|-------------|----------|----------|
| `null` (default) | Claude Task tool only | Most tasks |
| `"gemini"` | Subagent may call `gemini` CLI via Bash for subtasks | UI/design, visual reasoning |
| `"codex"` | Subagent may call `codex exec` CLI via Bash for subtasks | Code generation, refactoring |

**How it works**:
```
team-lead receives task
  └── Task(builder, prompt="...
        CLI hint: Use gemini CLI for design subtasks if available.
        Check: command -v gemini
        Usage: echo '<prompt>' | gemini
        Always validate CLI output before applying.
      ")
      ↓
  builder (Claude subagent) decides:
    ├── Simple task → handle directly
    └── Design-heavy subtask → Bash("echo '...' | gemini") → validate → apply
```

**Advantages over direct CLI routing**:
- Claude subagent validates and integrates external CLI output
- Hooks still apply at the subagent level (full governance)
- Subagent retains context and can retry/correct CLI results
- No "blind delegation" — Claude is always in the loop

**Prerequisites**: The target CLI must be installed and authenticated:
```bash
# Gemini
command -v gemini && gemini auth status

# Codex
command -v codex && codex auth status
```

If the CLI is not found, team-lead falls back to Claude Task tool with a warning.

### Governance Hooks

Automatically registered in `.claude/settings.local.json`:
- `TeammateIdle` → `project-team/hooks/teammate-idle-gate.js`
- `TaskCompleted` → `project-team/hooks/task-completed-gate.js`

---

## Usage Examples

### Basic run (all Claude)

```bash
/team-orchestrate
```

### With Gemini for design tasks

Edit `team-topology.json` to set `design-lead.cli = "gemini"`, then:
```bash
/team-orchestrate
```

### Specify TASKS.md path

```bash
/team-orchestrate --tasks-file path/to/TASKS.md
```

### Activate specific teammates only

```bash
/team-orchestrate --teammates architecture-lead,qa-lead
```

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/whitebox` | Execution monitoring + control plane |
| `/evaluation` | Quality gate after phase completion |
| `/auto-revision` | Autonomous improvement loop |
