---
name: recover
description: Automatically detects and resumes incomplete work after CLI crashes, network drops, or agent errors. Use this skill whenever a session is interrupted, or on requests like "recover work", "interrupted task", "continue where you left off", or "what were you doing?"
version: 2.3.0
updated: 2026-02-21
---

# Recover Skill

> A skill that **automatically detects and recovers** work interrupted by CLI crashes, network drops, or agent errors.
>
> **Unique capabilities:**
> - Detects all types of interrupted work and guides the appropriate recovery path
> - Comprehensively analyzes TASKS.md, progress logs, and state files
>
> **v2.4.0 update**: TASKS.md-first recovery + project-team Hook integration

---

## Trigger Conditions

This skill can be invoked with the following commands or natural language:

- `/recover`
- `/복구`
- "Check interrupted tasks"
- "Continue previous work"

---

## Execution Steps

When this skill is triggered, it performs the following steps in order:

### Step 1: State Files and Artifact Inspection (Standalone v2.4)

Searches for traces of previous work, **prioritizing TASKS.md**:

| Priority | Source | File Path | Description |
|----------|--------|-----------|-------------|
| **1 (highest)** | Task Tracker | `TASKS.md` | Task list with `[ ]`, `[/]`, `[x]` statuses |
| 2 | Task Tracker (legacy) | `docs/planning/06-tasks.md`, `task.md` | Legacy task files |
| 3 | Progress Log | `.claude/progress.txt` | Decision and issue records |
| 4 (optional) | Orchestrate State | `.claude/orchestrate-state.json` | Automation state (if present) |

- **Standalone priority**: Incomplete tasks (`[ ]`, `[/]`) in `TASKS.md` are checked first.
- When found, report the list of those items to the user.

```bash
# Example output
## Interrupted Work Found

**TASKS.md incomplete tasks:**
- [/] T1.2: Dashboard UI implementation (in progress)
- [ ] T1.3: API integration

**Recommended**: run `/agile run T1.2` or `/agile auto`
```

### Step 2: Recent Conversation History Check

**Target**: Recent conversation summary list

- Search for previous conversations on topics similar to the current one.
- If related conversations are found, report the conversation IDs and summaries.

### Step 3: Git Worktree Status Inspection (v1.8.0)

**Target**: Git Worktree and branch status

```bash
# Check worktree status
git worktree list

# Check unmerged branches
git branch --no-merged main
```

| Status | Description | Recommended Action |
|--------|-------------|-------------------|
| **Orphan Worktree** | Worktree without a branch | `git worktree remove` |
| **Unmerged Branch** | Phase complete but not merged | `git merge` → `/orchestrate --resume` |
| **Dirty Worktree** | Uncommitted changes | `git stash` or commit then proceed |
| **Conflict State** | Merge conflict in progress | Resolve conflicts then proceed |

### Step 4: Project Folder Inspection

**Target**: User-provided path or current active document path

Detects incomplete files matching the following patterns:

| Pattern | Description |
|---------|-------------|
| Open code block | Markdown with ` ``` ` opened but not closed |
| Unclosed brackets | Code files with unclosed `{`, `[`, `(` |
| TODO markers | Incomplete markers like `// TODO:`, `# FIXME:` |
| Empty functions | `pass`, `throw new Error('Not implemented')`, etc. |

### Step 5: Recovery Proposal (v1.8.0)

Based on inspection results, propose **situation-specific recovery strategies**:

| Situation | Recommended Action | Auto-execute |
|-----------|-------------------|--------------|
| **Orchestrate interrupted** | `/orchestrate --resume` | Auto-recommended |
| **Ultra-Thin interrupted** | `/orchestrate --ultra-thin --resume` | Auto-recommended |
| **Agile interrupted** | `/agile status` → `/agile run {next-task}` | Manual confirmation |
| **Worktree issue** | Clean up Git then resume | Manual confirmation |
| **Incomplete code** | Per-file fix guidance | Manual confirmation |

#### Recovery Options

- **A. Automatic recovery (recommended)**: Immediately resume and complete detected incomplete items.
- **B. Manual selection**: Show the list of recoverable items and let the user choose.
- **C. Start fresh**: Run `/workflow` to receive guidance from the beginning.

---

## Constraints

1. **Unsaved data cannot be recovered**: Content lost before being written to a file when the CLI exited cannot be restored.
2. **Terminal commands cannot be restored**: Processes that were running (e.g., `npm run dev`) will not be automatically restarted. The user will be guided to re-run them if needed.

---

## Usage Example

**Input**:

```
/recover
```

**Example output**:

```
## Recovery Inspection Results

### Artifact Status
- `task.md` found: 2 incomplete items

### Project Inspection
- `d:\Projects\my-app\src\api\client.ts`: unclosed bracket detected (Line 45)

### Recommended Actions
1. [Auto-recover] Resume incomplete items in task.md
2. [Manual fix] Check client.ts Line 45

How would you like to proceed? (1/2/cancel)
```

---

## Next Skill Integration (v2.3.0)

After recovery completes, the following skills are automatically suggested based on the situation:

| Recovery Result | Next Skill | Description |
|-----------------|------------|-------------|
| Orchestrate resume | `/orchestrate --resume` | Continue from the interrupted phase |
| **tmux mode resume** | `/orchestrate --tmux --resume` | Resume tmux parallel execution **(v1.10.0)** |
| Individual task resume | `/agile run {task-id}` | Run a specific task |
| Deficit analysis interrupted | `/eros` | Resume Diotima ladder **(v1.10.0)** |
| Eros planning interrupted | `/poietes` | Resume 4-phase process **(v1.10.0)** |
| Quality check needed | `/trinity` → `/code-review` or `/audit` | Validate after recovery |
| Test failure recovery | `/powerqa` | Automated QA cycling |
| Start fresh | `/workflow` | Begin workflow from the start |

### Step 6: tmux Mode Failure Detection **(v1.10.0 NEW)**

When using tmux parallel execution mode, check status via `/tmp/task-*.done` files:

```bash
# Check tmux task completion status
ls /tmp/task-*.done 2>/dev/null

# Check result files
ls /tmp/task-*-result.md 2>/dev/null
```

| Status | Description | Recommended Action |
|--------|-------------|-------------------|
| Some `.done` missing | Only some tasks failed | Re-run only incomplete tasks |
| All `.done` missing | Total failure | `/orchestrate --tmux --resume` |
| tmux session remains | Process still running | Check status with `tmux attach` |

### Hook Integration (Standalone v2.4)

| Hook | Effect |
|------|--------|
| `task-sync` | Detects and syncs TASKS.md status changes |
| `quality-gate` | Automatically triggers quality validation after recovery |

> **Note**: Uses the project-team Hook system (`project-team/hooks/`)

---

## Prevention Tips

1. **Commit frequently**: Smaller commits make recovery easier.
2. **Use TASKS.md**: Documenting tasks with `/tasks-init` makes progress tracking straightforward.
3. **Use Worktrees**: Per-phase Worktrees keep work cleanly separated.

---

**Last Updated**: 2026-03-03 (v2.4.0 - Standalone independence complete)
