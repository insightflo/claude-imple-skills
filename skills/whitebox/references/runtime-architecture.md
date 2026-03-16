# Whitebox Runtime Architecture

## 1. Core Runtime Thesis

The runtime must be supervisor-first.

The supervisor owns:

- process launch
- lifecycle tracking
- gate waitpoints
- retry / fallback orchestration
- recovery state persistence

Executor CLIs do not own the flow.

## 2. Runtime Layers

```text
Operator Layer
  -> Whitebox UI

Supervisor Layer
  -> session launcher
  -> mission controller
  -> gate controller
  -> recovery manager

Coordination Layer
  -> PM supervisor
  -> team supervisors
  -> communication router

Execution Layer
  -> agent runners
  -> executor adapters

Artifact Layer
  -> events
  -> control
  -> mission state
  -> communication state
  -> derived UI state
```

## 3. Main Runtime Components

### 3.1 Whitebox Launcher

Responsibilities:

- initialize artifacts
- open UI first
- start mission supervisor
- capture top-level session metadata

### 3.2 Mission Supervisor

Responsibilities:

- own one mission
- coordinate PM and team supervisors
- keep authoritative mission state
- handle global pause / resume / abort

### 3.3 PM Supervisor

Responsibilities:

- receive mission objective
- create and govern teams
- assign cross-team work
- escalate conflicts

### 3.4 Team Supervisor

Responsibilities:

- maintain one team backlog
- assign work to team agents
- track team-local health
- publish team communication and status

### 3.5 Agent Runner

Responsibilities:

- build prompts and execution context
- request executor invocation
- capture result artifacts
- report success / failure / need for escalation

### 3.6 Executor Adapter

Responsibilities:

- build CLI command
- spawn child process
- stream stdout / stderr
- capture exit code
- classify failure mode

### 3.7 Governance Engine

Responsibilities:

- enforce policy and standards
- turn findings into typed interventions
- decide whether action is:
  - pass
  - warn
  - pause for approval
  - block pending replan

### 3.8 Communication Router

Responsibilities:

- create message objects
- route team-to-team messages
- maintain open thread state
- trigger escalations when waits become unresolved

### 3.9 Recovery Manager

Responsibilities:

- persist operating state
- detect interrupted missions
- restore pending controls and communication backlog

## 4. Canonical State Model

The runtime should preserve canonical machine state under `.claude/whitebox/` and `.claude/collab/`.

### Canonical files

- `.claude/collab/events.ndjson`
- `.claude/collab/control.ndjson`
- `.claude/collab/requests/*`
- `.claude/collab/decisions/*`
- `.claude/collab/board-state.json`
- `.claude/collab/control-state.json`
- `.claude/collab/derived-meta.json`
- `.claude/collab/launcher-state.json`
- `.claude/whitebox/mission-state.json`
- `.claude/whitebox/org-state.json`
- `.claude/whitebox/executor-state.json`
- `.claude/whitebox/recovery-state.json`

## 5. Mission Lifecycle

### Stage 1: Launch

1. operator starts whitebox
2. launcher initializes collab artifacts
3. dashboard opens
4. mission supervisor starts

### Stage 2: Organize

1. PM supervisor forms teams
2. governance profile is attached
3. routing and executor policy are loaded

### Stage 3: Execute

1. team supervisors assign tasks
2. agent runners invoke executor adapters
3. runtime streams activity and communications

### Stage 4: Intervene

1. gate or failure produces typed intervention
2. supervisor moves mission or team to paused state
3. operator decides
4. supervisor resumes, reroutes, replans, or aborts

### Stage 5: Recover

1. interrupted state is loaded
2. open controls and messages are restored
3. operator confirms resume
4. supervisor continues from restored state

## 6. Executor Architecture

### Main host

- Claude Code is the primary host and orchestrator reasoning layer

### Secondary executors

- Claude CLI
- Codex CLI
- Gemini CLI

### Why adapters are required

Because CLIs may fail in different ways:

- missing binary
- auth missing
- model name mismatch
- invalid arguments
- approval/sandbox mismatch
- transient network/runtime failure

The adapter normalizes these differences into one runtime contract.

## 7. CLI Failure Handling

### Failure pipeline

1. adapter captures stdout/stderr/exit
2. adapter classifies failure
3. diagnostic agent reviews failure context
4. supervisor chooses one of:
   - retry same executor
   - retry with changed invocation
   - fallback to different executor
   - escalate to operator

### Required failure classes

- `binary_missing`
- `auth_missing`
- `invocation_invalid`
- `permission_denied`
- `sandbox_blocked`
- `rate_limited`
- `runtime_failure`
- `unknown_failure`

## 8. Gate Model

Gate outcomes must be explicit:

- `pass`
- `warn`
- `approval_required`
- `blocked_replan_required`
- `rejected`

Only the supervisor translates gate outcomes into control flow.

## 9. Recovery Model

Recovery must restore:

- mission state
- team state
- running sessions snapshot
- open communications
- pending approvals
- failed executor attempts
- retry strategy state

## 10. Runtime Invariants

### Invariant 1

No interactive mission starts without a visible whitebox surface, unless operator explicitly chooses direct mode.

### Invariant 2

No approval-required action crosses the boundary without a supervisor-owned state transition.

### Invariant 3

Executor failures are persisted before retry logic runs.

### Invariant 4

UI state is derived from canonical state, never the other way around.
