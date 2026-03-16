# Whitebox UI Information Architecture

## 1. Design Goal

The UI should answer four questions immediately:

1. What is running now?
2. What needs my decision now?
3. Which teams are talking to each other now?
4. What will happen if I do nothing?

## 2. Primary Surfaces

### 2.1 Mission

Shows:

- mission title
- mission objective
- governance profile
- current phase
- operator status

### 2.2 Organization

Shows:

- PM agent
- teams
- team leads
- active agents
- assigned executor and model

### 2.3 Execution

Shows:

- running sessions
- queued tasks
- blocked tasks
- completed tasks
- task ownership by team

### 2.4 Communication

Shows:

- inbox/outbox per team
- open REQ/HANDOFF/BLOCKER/RISK/DEC threads
- unresolved waits between teams

### 2.5 Control

Shows:

- pending approvals
- pending replan requests
- retry suggestions
- abort / resume / reject controls

### 2.6 Recovery

Shows:

- interrupted sessions
- failed executor attempts
- retry backlog
- resume readiness

## 3. Home Dashboard Layout

```text
┌──────────────────────────────────────────────────────────┐
│ Hero / Mission / Global Status                          │
├──────────────────────────────────────────────────────────┤
│ Metrics Row                                             │
├───────────────────────────────┬──────────────────────────┤
│ Running Sessions              │ Intervention Queue       │
├───────────────────────────────┼──────────────────────────┤
│ Team Organization             │ Communication Feed       │
├───────────────────────────────┼──────────────────────────┤
│ Execution Board               │ Explain / Runtime        │
└───────────────────────────────┴──────────────────────────┘
```

## 4. Navigation Model

### Top-level nav

- `Mission`
- `Teams`
- `Execution`
- `Communication`
- `Control`
- `Recovery`

### Drill-down model

Clicking any row should open a detail drawer or side panel.

Targets:

- task
- agent
- team
- communication thread
- intervention
- executor attempt

## 5. Home Dashboard Modules

### 5.1 Hero

Purpose:

- establish current mission context
- show if system is live, paused, blocked, or degraded

Fields:

- mission name
- mission status
- governance profile
- launcher/session status

### 5.2 Metrics row

Fields:

- running sessions
- open interventions
- blocked tasks
- open communications
- executor health alerts
- recovery backlog

### 5.3 Running sessions table

Columns:

- team
- task
- owner agent
- executor
- session id
- latest activity
- started at
- explain action

### 5.4 Intervention queue

Priority order:

1. operator approvals
2. team conflicts
3. risk acknowledgements
4. blocked tasks needing replan
5. executor failure escalations

Each card shows:

- reason
- affected team/task
- recommendation
- approve/reject/retry/replan actions

### 5.5 Team organization panel

Shows:

- PM at top
- teams below
- per-team health
- per-team active load
- per-team executor assignment

### 5.6 Communication feed

Views:

- all messages
- by team
- unresolved only

Each item shows:

- type
- from
- to
- waiting on
- age
- linked decision

### 5.7 Execution board

This remains visible but secondary.

Columns:

- backlog
- running
- blocked
- done

Cards must show team ownership first, not only task id.

### 5.8 Explain / Runtime panel

Tabs:

- `Explain`
- `Runtime`
- `Evidence`

Purpose:

- explain why a task or gate is in its current state
- show runtime artifacts
- show linked evidence paths and logs

## 6. Team View

Each team page should show:

- team mission
- lead
- members
- current queue
- open inbound communications
- outbound communications waiting on reply
- active executor health

## 7. Communication View

This view is not a raw log dump.

It should support:

- thread list
- thread state
- thread participants
- current owner
- linked decision
- operator escalation action

Message groupings:

- `Requests`
- `Handoffs`
- `Blockers`
- `Risks`
- `Decisions`

## 8. Control View

This is the operator console.

Actions:

- approve
- reject
- retry
- replan
- reroute executor
- pause team
- abort mission
- resume mission

Every action must show:

- reason
- likely impact
- recommended next step

## 9. Recovery View

Must show:

- interrupted mission snapshot
- per-team recovery readiness
- failed executor attempts
- still-open communications
- pending controls that must be resolved before resume

## 10. UX Rules

### Rule 1

Never make the operator infer where the blocker lives.

The UI must explicitly show:

- owning team
- impacted task
- required operator action

### Rule 2

Never present raw logs first.

Human summary first, raw evidence second.

### Rule 3

Never hide team structure.

The organization model is part of the product, not an internal detail.

### Rule 4

Never make board state the only truth visible to the user.

Communication and control state are first-class.

## 11. MVP Screen Set

- Dashboard
- Team detail
- Communication console
- Intervention console
- Runtime detail
- Recovery console
