# Linear Board Projection for TASKS.md

> Renamed from "Symphony Pattern Adoption" — we are not importing Symphony's
> long-running orchestrator. We borrow only the Human Review workflow states
> and the kanban board UX. (Round 1 Codex recommendation)

Created: 2026-03-06
Status: v5.1 (Round 3 final fixes — Go)
Basis: ref-symphony analysis (Claude + Gemini + Codex Council)
Review: Round 1 — Gemini + Codex + Claude Chairman
Review: Round 2 council — Codex + Gemini (via council.sh)
Review: Round 3 council — Codex + Gemini (final)

## Goal

Use Linear's kanban board as a visual projection of TASKS.md and
introduce a Human Review workflow state for agent-completed work.

## MVP Scope (7-Day Target)

> Round 3 Codex: Full v4 scope is too large for 7 days. Define MVP explicitly.

**In MVP (Phase 0 + Phase 1):**
- Phase 0: Linear connection + feature verification + state ID bootstrap
- Phase 1-1: Board setup (custom workflow states)
- Phase 1-2: TASKS.md → Linear migration (`tasks-to-linear.py`)
- Phase 1-3: `/linear-sync push` (manual, one-way, with protected states)
- `linear-mapping.json` + `linear-config.json` with immutable task_id in Linear
- Dry-run mode for all scripts
- `[ ]` / `[x]` markers only — no new markers

**Deferred to Post-MVP (Phase 2-4):**
- `/linear-sync pull` + `/linear-sync apply` (2-1)
- `orchestrate-standalone` Linear integration (2-3)
- Linear MCP configuration for Claude Code (1-4)
- workflow-guide documentation updates (2-2)
- New markers `[~]`, `[R]`, `[-]` (requires consumer updates)
- Automation and webhook polling (Phase 4)

## Non-Goals

- Full Elixir Symphony port
- Codex app-server protocol implementation
- Per-issue isolated workspaces
- Removing TASKS.md dependency from orchestrate-standalone
- Bidirectional automatic sync (Linear must NOT have state-change authority)
- Immediate deprecation of task-board/statusline

## Core Principles

1. **TASKS.md = sole source of truth** (Linear is a read-only projection)
2. **State changes on Linear are NOT auto-synced back** (suggestion diff only)
3. **All skills MUST work 100% without Linear**
4. **Distinguish document changes (SKILL.md) from runtime code changes**

## State Mapping Table

> Round 2 Codex: Without this, push/pull cannot operate consistently.

| TASKS.md Status | Linear Workflow State | Owner | MVP | Notes |
|----------------|----------------------|-------|-----|-------|
| `[ ]` (unchecked) | Backlog | TASKS.md | Yes | Default for new tasks |
| `[ ]` + assigned | Todo | TASKS.md | Yes | Assignee present but not started |
| `[ ]` + in orchestrate state | In Progress | TASKS.md | Yes | Detected via orchestrate-state.json, not marker |
| — | Human Review | **Linear** | Yes | Push sets this when PR URL present in deliverables |
| — | Rework | **Linear** | No | Reviewer requests changes (pull-only, Post-MVP) |
| — | Merging | **Linear** | No | Approved, merge in progress (pull-only, Post-MVP) |
| `[x]` (checked) | Done | TASKS.md | Yes | Completed |
| `[ ]` + cancelled note | Cancelled | TASKS.md | Yes | Dropped (convention-based) |

> MVP uses only `[ ]` and `[x]` markers. In Progress / Human Review are
> derived from context (orchestrate state, PR URL) rather than new markers.
> Post-MVP: introduce `[~]`, `[R]`, `[-]` markers WITH consumer updates.

### Field Ownership Rules

> Round 2 Codex: "read-only projection" conflicts with "human changes state on Linear".
> Resolve by defining field-level ownership.

| Field | Owner | Push Behavior | Pull Behavior |
|-------|-------|--------------|---------------|
| Title | TASKS.md | Overwrites Linear | Ignored |
| Status | TASKS.md (except Rework/Merging) | Overwrites Linear | Rework/Merging → suggestion diff |
| Description | TASKS.md | Overwrites Linear | Ignored |
| Assignee | TASKS.md | Overwrites Linear | Ignored |
| PR URL (attachment) | TASKS.md | Adds to Linear | Ignored |
| Review comments | **Linear** | Not touched | Informational only |

**Conflict rule**: If `push` would overwrite a Linear-owned field, skip and warn.

### Protected External States

> Round 3 Codex: Without this guard, push can overwrite Rework/Merging set by humans.

When a Linear issue is in a **Linear-owned state**, `push` MUST NOT change
the issue's workflow state, even if TASKS.md differs.

> Round 3 final Codex: Done (approved via Linear) must also be protected,
> otherwise push can revert an approved issue back to Human Review.

**Protected states**: `Rework`, `Merging`, `Done` (when set via Linear approval)

```
Push logic:
  current_linear_state = query Linear issue state
  tasks_md_status = parse TASKS.md marker

  # Protected: Linear-owned transitions that push must not overwrite
  if current_linear_state in [Rework, Merging]:
    SKIP state update (log: "protected state, skipping")
  elif current_linear_state == Done AND tasks_md_status != [x]:
    SKIP state update (log: "approved on Linear, skipping — run /linear-sync pull")
  else:
    update Linear state from TASKS.md
```

This prevents the "state oscillation" problem where push reverts human decisions.

## Prerequisites

- Linear free account (Starter plan, 250 issues free — as of 2026-03-06)
- Linear API key (Personal API Key)

---

## Phase 0: Linear Connection & Feature Verification (Day 0 — Highest Priority)

> Round 2 Codex: Phase 0 scope too narrow — must verify features, not just connection.

### 0-1. Linear MCP Connection Method

Official Linear MCP path (https://linear.app/docs/mcp):
```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.linear.app/sse"]
    }
  }
}
```
- Remote MCP server (not an npm package install)
- OAuth authentication (browser-based Linear login)

### 0-2. Feature Availability Checklist

> Connection alone is insufficient. The plan depends on these features:

| Feature | Verification Method | Required For |
|---------|-------------------|-------------|
| List issues | MCP or GraphQL query | Basic connectivity |
| Create issues with custom fields | GraphQL mutation | Phase 1 migration |
| Custom workflow states | Team settings API | Human Review / Merging / Rework |
| Sub-issues | Create sub-issue mutation | Task hierarchy |
| Issue relations (blocked by) | Relation mutation | Dependencies |
| Attachments (PR URL) | Attachment mutation | PR tracking |
| Team/project permissions | Team query | Write access |
| Issue description metadata | Description field write | task_id storage (see 0-3) |

- Run verification script: `scripts/linear-verify.sh` (new, Phase 0 deliverable)
- Script outputs pass/fail for each feature
- Any FAIL → evaluate if feature can be deferred to Phase 4

### 0-3. task_id Immutable Storage in Linear Issues

> Round 2 Codex: Mapping regeneration is fragile without immutable keys in Linear.

Every Linear issue MUST contain `task_id` as immutable metadata:
- **Method**: Store `<!-- task_id: T-001 -->` in issue description footer
- **Why**: Title renames, task splits, and duplicate titles break title-based matching
- **Lookup**: `linear-mapping.json` is the primary index; Linear description is the backup

### 0-4. Workflow State ID Bootstrap

> Round 3 Codex: Scripts need actual state IDs, not just names.

On first run, `scripts/linear-verify.sh` queries the team's workflow states
and writes a local cache:

```json
// linear-config.json (project root, git-tracked)
{
  "team_id": "TEAM_abc",
  "project_id": "PROJ_xyz",
  "workflow_states": {
    "Backlog": "state_001",
    "Todo": "state_002",
    "In Progress": "state_003",
    "Human Review": "state_004",
    "Merging": "state_005",
    "Rework": "state_006",
    "Done": "state_007",
    "Cancelled": "state_008"
  }
}
```

- All scripts resolve state names → IDs via this file
- If a state name is not found → error with "run linear-verify.sh to refresh"
- Re-run `linear-verify.sh` after any Linear workflow configuration change

### 0-5. Fallback Paths (if MCP connection fails)
- **Plan B**: `scripts/linear-api.sh` (curl + GraphQL direct calls)
  - Uses LINEAR_API_KEY environment variable
  - Claude Code invokes via Bash tool
- **Plan C**: Claude Code WebFetch to Linear GraphQL API directly

---

## Phase 1: Linear Board Setup + One-Way Export (Day 1-2)

> Codex recommendation: "Realistic scope is one-way projection"

### 1-1. Linear Project Setup

> Round 3 Gemini: Include setup guide for custom workflow states.

- Create Linear account (if needed)
- Create team + project
- **Custom state setup guide** (Linear UI: Settings → Team → Workflow):
  1. Keep default states: Backlog, Todo, In Progress, Done, Cancelled
  2. Add custom states (type: "Started" category):
     - `Human Review` — drag after In Progress
     - `Merging` — drag after Human Review
     - `Rework` — drag after Human Review (parallel with Merging)
  3. Run `scripts/linear-verify.sh` to cache state IDs
- Configure custom workflow states:
  - `Backlog` (default)
  - `Todo` (default)
  - `In Progress` (default)
  - `Human Review` (custom) — awaiting human review after PR submission
  - `Merging` (custom) — human approved, merge in progress
  - `Rework` (custom) — reviewer requested changes
  - `Done` (default) — merge complete
  - `Cancelled` (default)

### 1-2. TASKS.md → Linear Issue Migration Script

> Codex finding #4: Current TASKS.md is not a simple checklist — it contains
> phase headings, task IDs, assignees, deliverables, references, dependencies,
> and worktree info.

- Input: TASKS.md (current structure as-is)
- Output: Linear issues + sub-issues
- **Persistent mapping file required**: `linear-mapping.json` (project root, git-tracked)

> Round 2 Codex: `.claude/` looks like local config; mapping is shared project data.
> Round 2 Gemini: Multi-project support needs compound key.

  ```json
  {
    "schema_version": 1,
    "project": "claude-imple-skills",
    "linear_team": "PROJ",
    "mappings": [
      {
        "task_id": "T-001",
        "linear_issue_id": "abc123",
        "linear_issue_identifier": "PROJ-123",
        "synced_at": "2026-03-06T10:00:00Z"
      }
    ]
  }
  ```
  - Atomic writes (write to `.tmp` then rename) to prevent corruption
  - `schema_version` for future format changes
- Mapping rules:
  - Phase → Linear Label + Parent Issue
  - Task → Linear Issue (task_id, title, status, assignee, deliverables)
  - Sub-task → Linear Sub-issue
  - Dependencies → Linear issue relation (blocked by)
- **Issue ID back-annotation**: Stored in `linear-mapping.json`, NOT in TASKS.md body

> Round 2 Codex: Embedding `[PROJ-123]` in TASKS.md pollutes the source of truth
> and creates diff churn. The mapping file is the index; TASKS.md stays clean.

- **TASKS.md Parser Minimum Grammar**:

> Round 3 Codex: "as-is" and "minimum grammar" contradict.
> Resolution: MVP supports canonical subset only; unsupported lines are skipped.
> Round 3 Gemini: Task ID format should be flexible.

  > Round 3 final Codex: Parser must match THIS repo's actual TASKS.md format.

  - **Heading-style task** (this repo's primary format):
    `### [x] P0-T1: Title` or `### [ ] P2-T3: Title`
  - **Bullet-style task**: `- [ ] T1.1: Title` or `- [x] T1.1: Title`
  - Both styles supported — ID pattern: configurable regex, default `[A-Z0-9]+-[A-Z0-9]+`
    - Examples: `P0-T1`, `P2-T3`, `T-001`, `TASK-1`, `REQ-101`
  - Phase heading: `## Phase N: Title` or `## <any heading>`
  - Sub-task: indented bullet under a heading-style parent
  - **MVP markers: `[ ]` and `[x]` only** — matches all existing consumers
    (statusline, task-sync, task-board, orchestrate-standalone)
  - Post-MVP markers (requires consumer updates): `[~]`, `[-]`, `[R]`
  - **Skipped (not error)**: free-form prose, HTML comments, front-matter, lines not matching task pattern
  - Parser error on: duplicate task_id in same file
  - **Preflight validation**: `--validate` flag checks format without executing
  - **Dry-run mode**: `--dry-run` flag shows planned actions without executing

- **Idempotency**: check linear-mapping.json before creating → no duplicates
- Script location: `scripts/tasks-to-linear.py`
- Calls Linear API directly (MCP not required for one-time script)

### 1-3. `/linear-sync push` (MVP — manual one-way sync)

> Moved from Phase 2 to Phase 1 to align with MVP scope.

- Read TASKS.md + `linear-mapping.json`
- Reflect changed task states to Linear (respecting protected states)
- Trigger: `/linear-sync push` (manual)
- Implementation: Python script calling Linear GraphQL API directly
- `--dry-run` mode: show planned changes without executing
- Rate limit handling: sleep between API calls for large task sets (Round 3 Gemini)

### 1-4. Linear MCP Configuration (Post-MVP — deferred)

> Round 3 Codex: This is deferred but was still in Phase 1.
> Moved to Post-MVP. LINEAR_API_KEY + curl is the MVP path (Round 3 Gemini).

- Add to `~/.claude/settings.json` or `.mcp.json`
- Verify Linear issue query/state-change works from Claude Code
- **Not required for MVP** — all MVP scripts use `linear-api.sh` (curl)

### 1-5. task-board / statusline: Mark as "experimental alternative available"

> Codex finding #5: Deprecation timing is too early. Keep until replacement
> parity is confirmed. Run in parallel for at least one release.

- Add note: "Linear board alternative now available" (NOT deprecated)
- Keep all existing hooks and behavior intact
- Deprecation decision deferred to after Phase 3 stabilization

---

## Phase 2: Manual Sync Skill (Day 3-5)

### 2-1. New Skill: linear-sync (Post-MVP extensions)

> Push is now in Phase 1-3 (MVP). Phase 2 adds pull/apply.

**pull-review-state** (Linear → suggestion diff, Post-MVP):
- Detect only Human Review → Done and Rework transitions on Linear
- **Does NOT auto-modify TASKS.md** — outputs a suggestion diff only
- User approves before any TASKS.md changes are applied
- Trigger: `/linear-sync pull` (manual)

```
# Example output
[PROJ-123] Human Review → Done (approved on Linear)
  Suggestion: Change TASKS.md T-001 status to completed?
  Run /linear-sync apply to accept
```

### 2-2. workflow-guide Documentation Update (document change only)

> Codex finding #3: workflow-guide is a recommendation document, not an
> execution engine. Do not conflate document edits with runtime behavior changes.

- Target: `skills/workflow-guide/SKILL.md` (document only)
- Change: Add Human Review state description, state mapping table
- **This is "documentation enhancement", NOT "algorithm change"**

### 2-3. orchestrate-standalone Linear Integration

> Codex finding #2: orchestrate.sh cannot call MCP. Separate the Linear API
> client as an external script invoked by the shell.

- Target: `skills/orchestrate-standalone/scripts/orchestrate.sh`

> Round 2 Codex: `$ISSUE_ID` lookup path was undefined.

- **ISSUE_ID lookup**: `task_id` → `linear-mapping.json` → `linear_issue_id`
  ```bash
  # Inside orchestrate.sh:
  if [ -n "$LINEAR_API_KEY" ] && [ -f "$PROJECT_ROOT/scripts/linear-api.sh" ]; then
    source "$PROJECT_ROOT/scripts/linear-api.sh"
    ISSUE_ID=$(linear_lookup_issue "$TASK_ID" "$PROJECT_ROOT/linear-mapping.json")
    if [ -n "$ISSUE_ID" ]; then
      linear_update_issue_state "$ISSUE_ID" "In Progress"
    fi
    # If lookup fails (unmapped task): log warning, continue without Linear update
  fi
  ```
- `scripts/linear-api.sh`: Linear GraphQL API helper using curl
  - `linear_lookup_issue()`: reads mapping file, returns linear_issue_id or empty
  - `linear_update_issue_state()`: GraphQL mutation to change workflow state
- No MCP dependency. Works with LINEAR_API_KEY + curl only
- If neither is available, gracefully skips (no error)

---

## Phase 3: Operational Rules + Verification (Day 5-7)

### 3-1. Human Review Operational Contract

> Codex finding #6: Adding state columns without operational rules leads to
> issues stagnating in Human Review indefinitely.

| Question | Answer |
|----------|--------|
| Who approves Human Review → Done? | Project owner (user). Manually on Linear board |
| What triggers Rework? | Reviewer moves to Rework on Linear, or PR comment |
| Do non-PR tasks go to Human Review? | No. Only code-change tasks with PRs. Docs/config go straight to Done |
| Where is PR URL stored? | Linear issue attachment + TASKS.md deliverables field |
| Stale Human Review policy? | Warning after 3 days in linear-sync pull output. Recommended cadence: `/linear-sync pull` daily or before merge |
| Canonical source for approval? | Linear issue state (Human Review → Done = approved) |

### 3-2. Integration Tests

**Happy path:**
- Scenario 1: `scripts/tasks-to-linear.py` → issues created + mapping file verified
- Scenario 2: `/linear-sync push` → TASKS.md changes reflected on Linear
- Scenario 3: `/linear-sync pull` → Linear state changes detected + suggestion diff output
- Scenario 4: All skills work normally without LINEAR_API_KEY set
- Scenario 5: Idempotent re-run with existing linear-mapping.json
- Scenario 6: `--dry-run` shows planned actions without side effects

**Failure recovery** (Round 2 Codex):
- Scenario 7: Partial migration interrupted → resume without duplicates
- Scenario 8: `linear-mapping.json` corrupted/deleted → regenerate issue mapping from Linear description task_id (parent-child/dependency relations NOT recovered — manual re-link needed)
- Scenario 9: Task renamed in TASKS.md → push updates title, mapping preserved
- Scenario 10: Task deleted from TASKS.md → push marks Linear issue as Cancelled (not deleted)
- Scenario 11: Manual edit on Linear (title change) → push overwrites (TASKS.md-owned field)
- Scenario 12: Linear workflow state ID not found → skip with warning, don't crash
- Scenario 13: Free plan 250 issue limit reached → clear error message + archive guide

### 3-3. Documentation Updates
- `docs/explain/project-overview.md` → add Linear integration section
- `docs/explain/user-scenarios.md` → add Linear kanban scenario
- Update workflow-guide scenario validation table

---

## Phase 4: Automation Re-evaluation (Future)

> Codex recommendation: Stabilize through Phase 3 before considering automation.

- Auto Human Review transition after orchestrate-standalone completion
- Linear Webhook or periodic polling
- Bidirectional auto-sync (evaluate necessity)
- task-board / statusline deprecation decision

---

## Risks and Mitigations

| Risk | Probability | Mitigation |
|------|-------------|------------|
| **Data model drift** (identifier/state/recovery) | **High** | State mapping table, field ownership rules, task_id in Linear description |
| Linear remote MCP connection failure | Medium | Verify in Phase 0. Fall back to curl + GraphQL |
| TASKS.md parsing failure (complex structure) | Medium | Minimum grammar spec, dry-run mode, explicit error messages |
| Linear free plan issue limit (250) | Low | Error message + archive guide (Scenario 13) |
| Existing skill compatibility breakage | Low | All Linear features gated behind LINEAR_API_KEY |
| linear-mapping.json loss/corruption | Low | Git-tracked + task_id in Linear description as backup |
| Human Review stagnation | Medium | 3-day SLA warning, operational contract |
| Linear API rate limiting | Low | One-way push + manual execution = low call volume |
| Push overwrites human edits on Linear | Medium | Field ownership rules — skip Linear-owned fields |

---

## File Change Summary

```
Document changes (no behavior change):
  skills/workflow-guide/SKILL.md          # Add Human Review state guidance
  skills/task-board/SKILL.md              # Add "Linear alternative available" note
  skills/statusline/SKILL.md              # Add "Linear alternative available" note

Runtime code changes:
  skills/orchestrate-standalone/scripts/orchestrate.sh  # linear-api.sh hook call

New (runtime code):
  skills/linear-sync/SKILL.md             # Sync skill definition
  skills/linear-sync/scripts/sync.py      # push/pull implementation
  scripts/tasks-to-linear.py              # Migration utility
  scripts/linear-api.sh                   # Linear GraphQL helper (curl)
  scripts/linear-verify.sh               # Phase 0 feature verification script

New (data):
  linear-mapping.json                     # task_id ↔ linear_issue_id persistent mapping (project root)
  linear-config.json                      # team/project/workflow state ID cache (project root)

Configuration:
  ~/.claude/settings.json                 # Linear remote MCP server
```

## Success Criteria

1. Linear kanban board visually shows all task status
2. `/linear-sync push` reflects TASKS.md state changes to Linear
3. `/linear-sync pull` detects Human Review approvals as suggestion diffs
4. All skills work 100% without Linear (graceful degradation)
5. linear-mapping.json maintains 1:1 task_id ↔ linear_issue_id mapping

---

## Review Log

### Round 1 — Gemini

| Finding | Resolution |
|---------|-----------|
| Issue ID back-annotation needed in TASKS.md | Added format example in 1-2 |
| Linear MCP verification is priority zero | Phase 0 created |
| Merging state role undefined | Description added in 1-1 |
| linear-sync should start as one-way only | 2-1 scoped to push only + pull as suggestion diff |

### Round 1 — Codex

| Finding | Resolution |
|---------|-----------|
| #1 Bidirectional sync conflicts with source-of-truth principle | Stated in Non-Goals. Pull produces suggestion diff only, no auto-write |
| #2 orchestrate.sh cannot call MCP tools directly | linear-api.sh helper separated, curl-based direct API calls |
| #3 SKILL.md edits ≠ runtime behavior changes | Document vs runtime changes explicitly separated |
| #4 TASKS.md structure is not a simple checklist | linear-mapping.json persistent mapping + task_id-based matching |
| #5 Immediate deprecation of task-board/statusline is premature | Changed to "experimental alternative available", parallel operation |
| #6 Human Review operational rules missing | Operational contract table added in Phase 3 |
| #7 Linear MCP config diverges from official path | Updated to mcp-remote + https://mcp.linear.app/sse |
| Plan name is inaccurate | Renamed to "Linear Board Projection for TASKS.md" |

### Round 1 — Claude Chairman

| Finding | Resolution |
|---------|-----------|
| Phase A/B dependency fallback paths needed | Plan B/C added in Phase 0 |
| statusline hook cleanup missing | Deferred — parallel operation, no cleanup needed yet |

### Round 2 — Codex (council.sh)

| Finding | Resolution |
|---------|-----------|
| task_id must be immutable metadata in Linear issues | Added 0-3: `<!-- task_id: T-001 -->` in description footer |
| Phase 0 scope too narrow — feature verification needed | Expanded to Feature Availability Checklist (0-2) |
| Missing TASKS.md ↔ Linear state mapping table | Added State Mapping Table with field ownership rules |
| $ISSUE_ID lookup undefined in orchestrate.sh | Added linear_lookup_issue() in 2-3 |
| TASKS.md parser needs minimum grammar spec | Added parser grammar in 1-2 |
| Field-level ownership needed | Field Ownership Rules table added |
| linear-mapping.json in .claude/ is awkward | Moved to project root, added schema_version |
| Issue ID back-annotation pollutes TASKS.md | Removed — mapping file is the index |
| Test plan missing failure recovery | Added Scenarios 7-13 |
| Biggest risk is data model drift | Risk table reordered — data model drift as #1 |

### Round 2 — Gemini (council.sh)

| Finding | Resolution |
|---------|-----------|
| Task ID uniqueness across projects | Added compound key: project + linear_team in mapping file |
| Linear Team/Project creation unclear | Remains manual (Phase 1-1). Script selects existing team |
| Conflict resolution policy needed | Field ownership rules + conflict rule added |
| Free plan 250 issue limit alert | Scenario 13 added in test plan |

### Round 3 — Codex (council.sh)

| Finding | Resolution |
|---------|-----------|
| 7-day MVP scope too large | MVP Scope section added — Phase 0-1 + push only |
| Protected state rule missing (push overwrites Rework) | Protected External States guard added |
| Workflow state ID bootstrap missing | 0-4: linear-config.json cache + linear-verify.sh |
| "as-is" vs "minimum grammar" contradiction | Parser: canonical subset only, unsupported lines skipped |
| Scenario 8 recovery over-promised | Scoped to issue mapping only, manual re-link for relations |
| Human Review stagnation cadence | Daily sync or pre-merge pull recommended |

### Round 3 — Gemini (council.sh)

| Finding | Resolution |
|---------|-----------|
| Task ID regex flexibility | Configurable pattern, default `[A-Z]+-\d+` |
| Linear custom state setup guide needed | Step-by-step guide added in 1-1 |
| v4 approved for implementation | Acknowledged — v5 further refined |

### Round 3 Final — Codex (council.sh)

| Finding | Resolution |
|---------|-----------|
| Parser doesn't match actual TASKS.md (heading-style `### [x] P0-T1:`) | v5.1: Both heading-style and bullet-style supported |
| New markers `[~]`/`[R]`/`[-]` break statusline/task-sync | v5.1: MVP uses `[ ]`/`[x]` only. New markers Post-MVP |
| Done (approved via Linear) not protected from push | v5.1: Done added to protected states when TASKS.md disagrees |
| MVP/Phase numbering inconsistent | v5.1: push moved to 1-3, MCP config to 1-4 (deferred), Phase 2 push removed |

### Round 3 Final — Gemini (council.sh)

| Finding | Resolution |
|---------|-----------|
| API rate limit on initial migration | v5.1: Rate limit handling added to 1-3 push spec |
| LINEAR_API_KEY preferred over OAuth for MVP | v5.1: MCP/OAuth deferred to 1-4 (Post-MVP) |
| v5 Approved | v5.1 Go |
