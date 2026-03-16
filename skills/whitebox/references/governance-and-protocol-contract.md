# Whitebox Governance And Protocol Contract

## 1. Purpose

This contract defines:

- how teams are governed
- how teams communicate
- how governance becomes enforceable runtime behavior

## 2. Governance Layers

### 2.1 Policy

Defines what is allowed, forbidden, or restricted.

Examples:

- forbidden file areas
- unsafe dependency rules
- approval-required risk levels
- human review requirements

### 2.2 Process

Defines how teams operate.

Examples:

- who may hand off to whom
- who may create decisions
- which team must acknowledge a blocker
- when PM escalation is mandatory

### 2.3 Gates

Defines where runtime must stop or warn.

Examples:

- governance gate
- architecture gate
- quality gate
- risk gate
- recovery gate

## 3. Governance Outcomes

Governance checks must emit only typed outcomes:

- `pass`
- `warn`
- `approval_required`
- `blocked_replan_required`
- `reject`

The UI and supervisor rely on these values.

## 4. Human-in-the-loop Contract

Operator input is required for:

- mission scope changes
- high-risk changes
- team conflict rulings
- repeated executor failures
- recovery resume

Every intervention must carry:

- reason
- trigger type
- impacted teams
- recommendation
- next valid actions

## 5. Communication Model

Messages are first-class work objects.

Required message families:

- `REQ`
- `ACK`
- `HANDOFF`
- `BLOCKER`
- `RISK`
- `DEC`
- `STATUS`
- `ESCALATION`

## 6. Message Schema

```json
{
  "id": "MSG-20260312-001",
  "type": "REQ",
  "thread_id": "thread-auth-contract",
  "from_team": "backend",
  "to_team": "frontend",
  "from_agent": "backend-lead",
  "to_agent": "frontend-lead",
  "task_ref": "T2.3",
  "status": "open",
  "priority": "medium",
  "requires_response": true,
  "created_at": "ISO8601",
  "summary": "Need frontend to adopt new auth payload shape.",
  "linked_decision_id": null
}
```

## 7. Message Lifecycle

### REQ

- `open`
- `acknowledged`
- `in_progress`
- `resolved`
- `escalated`
- `rejected`

### BLOCKER

- `open`
- `owned`
- `resolved`
- `escalated`

### DEC

- `draft`
- `final`
- `applied`

## 8. UI Rules For Communication

The UI must show:

- which team sent it
- which team owns the next action
- how old it is
- whether it is blocking execution
- whether a linked decision exists

## 9. Governance Event Contract

Each governance decision written to events must include:

```json
{
  "type": "governance.outcome",
  "producer": "governance-engine",
  "data": {
    "gate": "quality",
    "outcome": "approval_required",
    "trigger_type": "risk_acknowledgement",
    "team_ids": ["backend", "qa-security"],
    "task_id": "T4.1",
    "reason": "Security-relevant schema change detected.",
    "recommendation": "Review the risk and approve only if mitigation is accepted."
  }
}
```

## 10. Control Command Contract

Operator control remains canonical through append-only control commands.

Required actions:

- `approve`
- `reject`
- `retry`
- `replan`
- `abort`
- `resume`
- `reroute_executor`

Minimal command shape:

```json
{
  "type": "approve",
  "target": {
    "gate_id": "gate-risk-001",
    "mission_id": "mission-001"
  },
  "actor": {
    "id": "operator"
  },
  "created_at": "ISO8601"
}
```

## 11. Executor Failure Protocol

Executor failures must produce a typed attempt record.

```json
{
  "attempt_id": "exec-attempt-001",
  "team_id": "backend",
  "agent_id": "api-specialist",
  "executor": "codex",
  "command": "codex exec",
  "status": "failed",
  "failure_class": "auth_missing",
  "stderr_excerpt": "not authenticated",
  "retryable": true,
  "recommended_action": "retry_after_auth"
}
```

## 12. Retry And Fallback Policy

When executor invocation fails:

1. adapter writes failure record
2. diagnostic agent classifies error
3. team lead or PM proposes retry strategy
4. supervisor executes:
   - retry same executor
   - retry adjusted invocation
   - fallback executor
   - operator escalation

## 13. Recovery Contract

Resume may happen only if the system can reconstruct:

- mission state
- org state
- open communications
- pending controls
- unresolved executor failures

If not, the system must expose `resume_blocked` and explain why.

## 14. Required Canonical Artifacts

- `.claude/collab/events.ndjson`
- `.claude/collab/control.ndjson`
- `.claude/collab/requests/`
- `.claude/collab/decisions/`
- `.claude/whitebox/mission-state.json`
- `.claude/whitebox/org-state.json`
- `.claude/whitebox/executor-state.json`
- `.claude/whitebox/recovery-state.json`

## 15. Enforcement Principles

### Principle 1

Governance that cannot stop or pause execution is documentation, not control.

### Principle 2

Communication that cannot be surfaced in UI is hidden work and therefore product failure.

### Principle 3

Executor errors that are not normalized into typed failures cannot be routed or recovered.

### Principle 4

All critical control decisions must remain inspectable after the run.
