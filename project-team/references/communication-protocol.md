# Hierarchical Agent Communication Protocol

## 1. Overview
The agent collaboration system uses a file-based communication bus to manage cross-scope change requests. This lets canonical roles (Lead, Builder, Reviewer, and specialists such as Designer/DBA/Security Specialist) communicate asynchronously while preserving a verifiable audit trail for planning, execution, and final decisions.

## 2. Directory Structure
All communication happens within the `.claude/collab/` directory structure:

```text
.claude/collab/
├── contracts/    # Lead-owned write (Wave 0 outputs), all roles read
├── requests/     # REQ-*.md files for cross-domain change requests (OPEN/PENDING)
├── decisions/    # DEC-*.md files issued by Lead (FINAL rulings)
├── locks/        # JSON lock files for concurrency control (TTL: 10 min)
├── control.ndjson      # Canonical operator-intent log (append-only)
├── control-state.json  # Derived control query state (rebuildable, never edit directly)
└── archive/      # Resolved, rejected, or closed REQ/DEC files (wave-end archival)
```

Initialize with: `node project-team/scripts/collab-init.js`

## 3. REQ File Format

Requests must use the following structure containing YAML frontmatter and a Markdown body:

```markdown
---
id: REQ-YYYYMMDD-NNN
thread_id: thread-{domain}-{topic}
from: Builder
to: Reviewer
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
PENDING → ESCALATED (negotiation_count >= max_negotiation → Lead intervenes)
ESCALATED → RESOLVED (Lead creates DEC file, ruling enforced)
```

## 5. REQ Lifecycle Rules

- **Negotiation Limit**: `max_negotiation: 2` (default). If `negotiation_count` reaches this limit, status must transition to `ESCALATED`.
- **Thread Management**: Use the same `thread_id` for related follow-ups. Prevents duplicate REQs for the same issue.
- **Escalation Trigger**: When a REQ reaches `ESCALATED`, Lead takes ownership and creates a corresponding DEC file. All roles must comply with the DEC ruling.
- **Context Limit**: Change Summary must be ≤500 characters. Include only what the receiving agent needs to decide.
- **Wave Archive**: At wave completion, all RESOLVED/REJECTED REQs move to `.claude/collab/archive/wave-N/`.

## 6. DEC File Format

Decisions issued by Lead:

```markdown
---
id: DEC-YYYYMMDD-NNN
ref_req: REQ-YYYYMMDD-NNN
from: Lead
to: [Builder, Reviewer]
status: FINAL
timestamp: ISO8601
---
## Decision Summary
[Clear statement of the final architectural decision]

## Context & Conflict
[Brief summary of the escalated issue and why negotiation failed]

## Required Actions
- Builder: [specific implementation steps]
- Reviewer: [specific validation and release-readiness steps]
```

**File naming**: `DEC-YYYYMMDD-NNN.md` in `.claude/collab/decisions/`

## 7. File Lock Format

Before modifying any REQ/DEC file, agents create a JSON lock in `.claude/collab/locks/`:

```json
{
  "file": "REQ-20260305-001.md",
  "locked_by": "Builder",
  "timestamp": "2026-03-05T10:30:00Z",
  "ttl_seconds": 600
}
```

**Lock filename**: `{escaped-filename}.lock` (e.g., `REQ-20260305-001.md.lock`)

**Stale lock detection**: If `now > timestamp + ttl_seconds`, the lock is stale and can be safely overwritten.

**Atomic creation**: Use `O_EXCL` equivalent (write-only, fail-if-exists) to prevent race conditions.

## 8. Domain Boundary Rules

| Role | Can Write To | Cannot Write To |
|-------|-------------|-----------------|
| Builder (backend scope) | `src/domains/`, `src/api/`, `src/services/` | `src/components/`, `database/`, `contracts/` |
| Builder (frontend scope) | `src/components/`, `src/pages/`, `src/hooks/` | `src/api/`, `database/`, `contracts/` |
| DBA (specialist) | `src/db/`, `migrations/`, `prisma/` | `src/components/`, `src/api/` |
| Reviewer (test scope) | `tests/`, `*.test.*`, `*.spec.*` | `src/` (non-test), `database/` |
| Lead | `contracts/`, `.claude/collab/contracts/`, `.claude/collab/decisions/` | `src/` |
| Any Role | `.claude/collab/requests/`, `.claude/collab/locks/` | — |

Cross-domain writes are blocked by `project-team/hooks/domain-boundary-enforcer.js`.
To request a cross-domain change, create a REQ file instead.

## 9. Workflow Example

**Scenario**: A Builder working in auth scope adds a `role` field to JWT; a Builder working in UI scope needs an AuthGuard update.

1. **Create REQ**: Builder (auth scope) creates `REQ-20260305-001.md` (status: `OPEN`) describing the JWT change.
2. **Acknowledge**: Builder (UI scope) creates lock file, updates status to `PENDING`, reviews the request.
3. **Negotiate** (if conflict): Builder (UI scope) proposes an alternative in the Response section, increments `negotiation_count`.
4. **Resolve**: Builder (auth scope) accepts, Builder (UI scope) sets status to `RESOLVED` and implements the AuthGuard update.
5. **Escalate** (if no agreement after 2 rounds): status auto-set to `ESCALATED` by `conflict-resolver.js`.
6. **Mediate**: Lead reads both positions, creates `DEC-20260305-001.md` with a final ruling.
7. **Archive**: After wave completion, REQ and DEC move to `.claude/collab/archive/wave-N/`.

## 10. Kanban Board Status Mapping

The task board (`/task-board`) unifies two status systems into four visual columns:

| Board Column | orchestrate-state status | REQ/DEC status |
|-------------|--------------------------|----------------|
| **Backlog** | `pending` | — |
| **In Progress** | `in_progress` | `OPEN`, `PENDING` |
| **Blocked** | `failed`, `timeout` | `ESCALATED` |
| **Done** | `completed` | `RESOLVED`, `REJECTED` |

### Board Event Types (emitted by `task-board-sync.js`)

| Event | Trigger | Board Effect |
|-------|---------|--------------|
| `task_claimed` | Agent begins task | Backlog → In Progress |
| `task_started` | First file edit in task | In Progress (progress update) |
| `task_done` | TaskUpdate completed | In Progress → Done |
| `task_blocked` | `failed` / `timeout` status | In Progress → Blocked |
| `req_escalated` | REQ status = ESCALATED | new Blocked card |
| `req_resolved` | REQ status = RESOLVED/REJECTED | Blocked → Done |

### Board State Files

```
.claude/collab/
├── board-state.json   # Current board snapshot (derived, never edit directly)
└── events.ndjson      # Append-only event log (one JSON object per line)
```

**Single Source of Truth**: `TASKS.md` + `.claude/orchestrate-state.json` are canonical.
`board-state.json` is always derivable via `node skills/task-board/scripts/board-builder.js`.

## 11. Wave Integration

```
Wave 0: Lead (solo)
└── Runs collab-init.js + creates contracts/

Wave N: Builders and specialists (parallel)
├── Read contracts/ (read-only)
├── Create REQ files for cross-domain needs
└── Respond to incoming REQs

Wave Barrier (after each wave):
└── conflict-resolver.js scans requests/
    ├── Exit 0: all clear → next wave begins
    └── Exit 2: ESCALATED REQs → Lead mediates first
```

See also: `docs/plan/hierarchical-agent-collab-plan.md`

## 12. Whitebox Event Contract Integration

Whitebox event governance is standardized in `docs/plan/WHITEBOX-EVENT-CONTRACT.md`.

- `.claude/collab/events.ndjson` is the canonical whitebox log.
- `.claude/orchestrate/auto-events.jsonl` is a deprecated compatibility mirror.
- telemetry stream output is excluded from the whitebox contract.

Required envelope keys for whitebox events:

- `schema_version`, `event_id`, `ts`, `type`, `producer`, `data`
- `correlation_id`, `causation_id`

Required HITL lifecycle events:

- `approval_required`, `approval_granted`, `approval_rejected`
- `execution_paused`, `execution_resumed`

Schema policy and stale markers:

- Readers/projectors support schema `N` and `N-1`.
- Unsupported events are handled with skip+warn behavior.
- Stale derived artifact markers are tracked in `.claude/collab/derived-meta.json`.

## 13. Whitebox Approval Gate Inventory and Migration Policy

### Current Interactive Gate Inventory

The current orchestrator family has multiple human-input gate paths. They are not all MVP whitebox-control targets.

| Gate | Source | Current actions | MVP whitebox target | Modify policy |
|------|--------|-----------------|---------------------|---------------|
| Contract Gate | `skills/orchestrate-standalone/scripts/auto/auto-orchestrator.js` | `approve`, `reject`, `modify` | Yes | `modify` remains legacy interactive fallback in Phase 1; whitebox UI/CLI exposes `approve`/`reject` only |
| Define Failure Gate | `skills/orchestrate-standalone/scripts/auto/auto-orchestrator.js` | `approve`, `reject`, `modify` | Yes, but only for the approval/rejection branch | `modify` remains legacy interactive fallback; manual JSON entry stays outside MVP whitebox control |
| Decompose Gate | `skills/orchestrate-standalone/scripts/auto/auto-orchestrator.js` | `approve`, `reject`, `modify` | Yes | `modify` remains legacy interactive fallback in Phase 1 |
| Final Gate | `skills/orchestrate-standalone/scripts/auto/auto-orchestrator.js` | `approve`, `reject`, `modify` via adjust loop | Yes | `modify` remains legacy interactive fallback by routing to existing adjust feedback path |
| Sprint Review Gate | `skills/orchestrate-standalone/scripts/engine/sprint-review.js` | `approve`, `modify`, `stop` | No (Phase 1) | stays on the existing sprint-state machine until a later migration |

### MVP Scope

- Phase 1 whitebox control only standardizes `approve` and `reject` for approval-style gates.
- `modify` is explicitly out of MVP whitebox control.
- `modify` remains supported only through the existing interactive fallback paths in `auto-orchestrator.js` and sprint review flows.
- Sprint review state transitions (`approve`, `modify`, `stop`, `resume`) remain part of the sprint engine contract, not the whitebox approval-control MVP.

### Single Surface Contract

- `/whitebox` is the only user-facing product boundary.
- The terminal TUI is the `/whitebox` interactive renderer/operator shell.
- The CLI control script is the internal mutation API plus the headless/scriptable surface.
- `task-board` is a renderer within the whitebox product surface, not a separate product.

### Canonical Control Command Rules

- `.claude/collab/control.ndjson` is the canonical operator-intent log; it is append-only and existing lines are never edited or deleted.
- `.claude/collab/control-state.json` is a derived query model; it is disposable and rebuildable from canonical command/event logs.
- Node `whitebox-control.js` is the only command writer and the only mutation/audit owner for whitebox control actions.
- The CLI control surface is the shared mutation path and headless/scriptable surface for whitebox control.
- TUI mutations must delegate by spawning the CLI control command as a subprocess; TUI never writes command or derived files directly.
- Writers use advisory `flock(LOCK_EX)` for append serialization.
- Appliers consume commands using a persisted offset tracker or correlation-aware duplicate filtering.
- Idempotency is enforced per gate/action intent using `idempotency_key` plus duplicate filtering keyed by gate/correlation context.

### Canonical Control Artifact Ownership

| Artifact | Role | Ownership rule |
|----------|------|----------------|
| `.claude/collab/events.ndjson` | canonical facts log | Append-only whitebox facts/events only; never overloaded with operator commands |
| `.claude/collab/control.ndjson` | canonical operator-intent log | Append-only operator commands only; written only by Node `whitebox-control.js` |
| `.claude/collab/control-state.json` | derived control query state | Projected/read-only surface for status, explain, CLI read verbs, and TUI rendering |
| `.claude/collab/board-state.json` | derived task-board query state | Rebuildable renderer state; never a mutation target |

### Canonical Control Command Schema

Every line in `.claude/collab/control.ndjson` is one JSON object with these required keys:

| Field | Meaning |
|-------|---------|
| `command_id` | unique command envelope ID |
| `ts` | ISO8601 timestamp for command creation |
| `type` | MVP control action type; Phase 1 allows only `approve` or `reject` |
| `producer` | emitting surface, for example CLI or TUI subprocess delegate |
| `target` | target descriptor for the approval gate being addressed |
| `actor` | operator identity or execution actor issuing the command |
| `reason` | optional human rationale attached to the command |
| `correlation_id` | correlation link to the gate lifecycle |
| `causation_id` | causation link to the triggering event or prior command |
| `idempotency_key` | stable dedupe key for replay/duplicate suppression |

The `target` object is reserved for gate targeting and must be explicit enough for deterministic routing. At minimum it carries the `gate_id`; later tasks may include additional stable identifiers but must not rename the envelope keys above.

### Approval Gate Payload Schema

Approval-required lifecycle events in `.claude/collab/events.ndjson` use the normal whitebox event envelope and reserve these gate payload fields inside `data`:

| Field | Meaning |
|-------|---------|
| `gate_id` | stable approval gate identifier |
| `task_id` | task blocked by the gate |
| `run_id` | owning run or orchestrator execution identifier |
| `choices` | explicit available actions; MVP values are `approve` and `reject` |
| `default_behavior` | documented default gate policy when no operator action arrives |
| `timeout_policy` | timeout behavior for the paused gate |

These payload fields freeze the contract for later appliers/projectors. Phase 1 must not expand the whitebox control action family beyond `approve` and `reject`.

### Lifecycle Oracle

The approval lifecycle oracle is frozen for whitebox-controlled approval gates:

1. `approval_required`
2. `execution_paused`
3. `approval_granted` or `approval_rejected`
4. `execution_resumed` only after `approval_granted`

Additional rules:

- `execution_paused` is canonical for whitebox-controlled approval gates and must be present in protocol-aligned tests.
- Rejection ends the gate without emitting `execution_resumed` for the same correlation.
- Duplicate approval/rejection commands are idempotent and must not create duplicate terminal lifecycle events.

### Migration Policy

- `promptGate()` call sites in `auto-orchestrator.js` are the primary migration targets for file-based approval control.
- The migration replaces inline `approve/reject` handling with canonical command consumption.
- `modify` handling is preserved as a legacy interactive fallback in Phase 1 so the orchestrator can keep accepting guided revisions without inventing new whitebox semantics.
- Sprint review is explicitly deferred from the approval-control MVP to avoid conflating sprint-state transitions with whitebox approval gates.
