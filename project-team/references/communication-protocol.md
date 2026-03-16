# Hierarchical Agent Communication Protocol

## 1. Overview
The agent collaboration system utilizes a file-based communication bus to manage cross-domain change requests. This allows the Team Leads (team-lead and architecture-lead) and Worker Agents (builder, reviewer, designer) to communicate asynchronously and maintain a verifiable audit trail of all architectural and implementation decisions.

## 2. Directory Structure
All communication happens within the `.claude/collab/` directory structure:

```text
.claude/collab/
├── contracts/    # architecture-lead-only write (Wave 0 outputs), all agents read
├── requests/     # REQ-*.md files for cross-domain change requests (OPEN/PENDING)
├── decisions/    # DEC-*.md files issued by architecture-lead (FINAL rulings)
├── locks/        # JSON lock files for concurrency control (TTL: 10 min)
└── archive/      # Resolved, rejected, or closed REQ/DEC files (wave-end archival)
```

Initialize with: `node project-team/scripts/collab-init.js`

## 3. REQ File Format

Requests must use the following structure containing YAML frontmatter and a Markdown body:

```markdown
---
id: REQ-YYYYMMDD-NNN
thread_id: thread-{domain}-{topic}
from: architecture-lead
to: design-lead
task_ref: T2.3
status: OPEN
max_negotiation: 2
negotiation_count: 0
timestamp: ISO8601
---
## Change Summary (<=500 chars)
[description — keep concise for context efficiency]

## Response
[receiver fills this in]
```

**File naming**: `REQ-YYYYMMDD-NNN.md` in `.claude/collab/requests/`

## 4. Status Transitions

```
OPEN → PENDING (receiver acknowledged, under analysis)
PENDING → RESOLVED (accepted and implemented)
PENDING → REJECTED (denied, justification in Response section)
PENDING → ESCALATED (negotiation_count >= max_negotiation → architecture-lead intervenes)
ESCALATED → RESOLVED (architecture-lead creates FINAL DEC file, ruling enforced)
```

## 5. REQ Lifecycle Rules

- **Negotiation Limit**: `max_negotiation: 2` (default). If `negotiation_count` reaches this limit, status must transition to `ESCALATED`.
- **Thread Management**: Use the same `thread_id` for related follow-ups. Prevents duplicate REQs for the same issue.
- **Escalation Trigger**: When a REQ reaches `ESCALATED`, architecture-lead takes ownership and creates a corresponding DEC file. All agents must comply with the DEC ruling.
- **FINAL DEC Auto-Resolution**: Writing a `DEC-*.md` with `status: FINAL` for an `ESCALATED` REQ auto-updates the matching REQ to `RESOLVED`, appends the canonical `req_resolved` event, and marks derived artifacts stale for rebuild.
- **Context Limit**: Change Summary must be ≤500 characters. Include only what the receiving agent needs to decide.
- **Wave Archive**: At wave completion, all RESOLVED/REJECTED REQs move to `.claude/collab/archive/wave-N/`.

## 6. DEC File Format

Decisions issued by the architecture-lead:

```markdown
---
id: DEC-YYYYMMDD-NNN
ref_req: REQ-YYYYMMDD-NNN
from: architecture-lead
to: [builder, design-lead]
status: FINAL
timestamp: ISO8601
---
## Decision Summary
[Clear statement of the final architectural decision]

## Context & Conflict
[Brief summary of the escalated issue and why negotiation failed]

## Required Actions
- builder: [specific steps]
- design-lead: [specific steps]
```

**File naming**: `DEC-YYYYMMDD-NNN.md` in `.claude/collab/decisions/`

## 7. File Lock Format

Before modifying any REQ/DEC file, agents create a JSON lock in `.claude/collab/locks/`:

```json
{
  "file": "REQ-20260305-001.md",
  "locked_by": "design-lead",
  "timestamp": "2026-03-05T10:30:00Z",
  "ttl_seconds": 600
}
```

**Lock filename**: `{escaped-filename}.lock` (e.g., `REQ-20260305-001.md.lock`)

**Stale lock detection**: If `now > timestamp + ttl_seconds`, the lock is stale and can be safely overwritten.

**Atomic creation**: Use `O_EXCL` equivalent (write-only, fail-if-exists) to prevent race conditions.

## 8. Domain Boundary Rules

| Agent | Can Write To | Cannot Write To |
|-------|-------------|-----------------|
| builder (backend) | `src/domains/`, `src/api/`, `src/services/` | `src/components/`, `database/`, `contracts/` |
| builder (frontend) | `src/components/`, `src/pages/`, `src/hooks/` | `src/api/`, `database/`, `contracts/` |
| builder (database) | `src/db/`, `migrations/`, `prisma/` | `src/components/`, `src/api/` |
| reviewer | `tests/`, `*.test.*`, `*.spec.*` | `src/` (non-test), `database/` |
| architecture-lead | `contracts/`, `.claude/collab/contracts/`, `.claude/collab/decisions/` | `src/` |
| Any Agent | `.claude/collab/requests/`, `.claude/collab/locks/` | — |

Cross-domain writes are blocked by `project-team/hooks/domain-boundary-enforcer.js`.
To request a cross-domain change, create a REQ file instead.

## 9. Workflow Example

**Scenario**: Backend builder adds a `role` field to JWT; frontend builder's AuthGuard needs updating.

1. **Create REQ**: architecture-lead creates `REQ-20260305-001.md` (status: `OPEN`) describing the JWT change.
2. **Acknowledge**: design-lead creates lock file, updates status to `PENDING`, reviews the request.
3. **Negotiate** (if conflict): design-lead proposes alternative in Response section, increments `negotiation_count`.
4. **Resolve**: architecture-lead accepts, design-lead sets status to `RESOLVED` and delegates AuthGuard update to builder.
5. **Escalate** (if no agreement after 2 rounds): status auto-set to `ESCALATED` by `conflict-resolver.js`.
6. **Mediate**: team-lead reads both positions, creates `DEC-20260305-001.md` with final ruling.
7. **Auto-resolve**: Once that DEC is `FINAL`, the matching `ESCALATED` REQ is rewritten to `RESOLVED` via the canonical hook/event path.
8. **Archive**: After wave completion, REQ and DEC move to `.claude/collab/archive/wave-N/`.

## 10. Board Status Mapping

The whitebox surface unifies two status systems into four visual columns:

| Board Column | orchestrate-state status | REQ/DEC status |
|-------------|--------------------------|----------------|
| **Backlog** | `pending` | — |
| **In Progress** | `in_progress` | `OPEN`, `PENDING` |
| **Blocked** | `failed`, `timeout` | `ESCALATED` |
| **Done** | `completed` | `RESOLVED`, `REJECTED` |

### Event Types (emitted to `events.ndjson`)

| Event | Trigger | Board Effect |
|-------|---------|--------------|
| `task_claimed` | Agent begins task | Backlog → In Progress |
| `task_started` | First file edit in task | In Progress (progress update) |
| `task_done` | TaskUpdate completed | In Progress → Done |
| `task_blocked` | `failed` / `timeout` status | In Progress → Blocked |
| `req_escalated` | REQ status = ESCALATED | new Blocked card |
| `req_resolved` | REQ status = RESOLVED/REJECTED | Blocked → Done |
| `decision_written` | `DEC-*.md` write/update | refresh linked ruling context and trigger final-DEC resolution flow |

### Board State Files

```
.claude/collab/
├── board-state.json   # Current board snapshot (derived, never edit directly)
└── events.ndjson      # Append-only event log (one JSON object per line)
```

**Single Source of Truth**: `TASKS.md` + `.claude/orchestrate-state.json` are canonical.
`board-state.json` is always derivable from these canonical sources.
Escalated REQ cards may also surface linked `DEC-*` metadata (`decision_id`, `decision_status`, `decision_path`) so whitebox/TUI can show the final ruling context without manual file inspection.

## 11. Wave Integration

```
Wave 0: architecture-lead (solo)
└── Runs collab-init.js + creates contracts/

Wave N: Worker Agents (parallel)
├── Read contracts/ (read-only)
├── Create REQ files for cross-domain needs
└── Respond to incoming REQs

Wave Barrier (after each wave):
└── conflict-resolver.js scans requests/
    ├── Exit 0: all clear → next wave begins
    └── Exit 2: ESCALATED REQs → architecture-lead mediates first
```
