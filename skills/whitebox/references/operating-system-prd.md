# Whitebox DevOS PRD

## 1. Product Statement

Whitebox is a development tool that lets an operator observe, govern, and control AI software delivery as if it were a human engineering organization.

It is not just a task runner and not just a dashboard.

It is a multi-team AI development operating system built around:

- visible execution
- explicit governance
- team-based coordination
- human-controlled intervention
- resumable operations

## 2. Product Thesis

Current AI coding flows fail when work keeps moving after governance is declared but before human intent is enforced.

Whitebox fixes that by moving the product boundary from:

- hidden hook behavior

to:

- visible supervisor-owned execution

## 3. Target User

Primary user:

- one technical operator who uses Claude Code as the main host and wants to supervise multiple AI teams

Secondary users:

- engineering leads
- staff engineers
- product-minded technical founders
- internal platform teams building AI-assisted dev workflows

## 4. Core Use Cases

### 4.1 Observe

The operator can see:

- which team is active
- which agent is running
- which model/CLI is being used
- what task is in progress
- which blockers or approvals exist
- what messages teams are sending each other

### 4.2 Decide

The operator can decide:

- continue vs pause
- approve vs reject
- replan vs retry
- escalate to PM vs team lead
- switch executor routing when a CLI is unhealthy

### 4.3 Control

The operator can:

- launch a run with UI first
- stop a team or whole mission
- resume paused work
- reject unsafe progress
- force a fallback executor
- recover after interruption

## 5. Product Scope

### In Scope

- UI-first development supervision
- multi-team organization model
- governance policy and gates
- visible team communication
- executor routing across Claude, Codex, Gemini style CLIs
- CLI failure diagnosis and retry orchestration
- recovery of active operational state

### Out of Scope

- replacing Claude Code as the primary coding host
- generic PM software
- standalone issue tracker product
- autonomous execution with no operator boundary
- hook-only control planes

## 6. Product Principles

### Principle 1: UI First

Execution should not begin invisibly.

The operator should see the run surface before meaningful work starts.

### Principle 2: Supervisor Owns Control

Hooks may emit signals, but the supervisor owns:

- process launch
- pause
- retry
- resume
- abort

### Principle 3: Teams, Not Flat Agents

The system models engineering as nested teams under a PM layer, not as one flat list of agents.

### Principle 4: Governance Must Be Executable

Governance is valid only if it can:

- block
- pause
- escalate
- request approval
- record the ruling

### Principle 5: Communication Must Be Operational

Messages are not archive-only logs.

They are active work objects with:

- sender
- recipient
- status
- required action
- linked decisions

### Principle 6: Recovery Restores Operating State

Recovery must restore:

- task progress
- team state
- open messages
- pending approvals
- executor health context

## 7. Product Model

```text
Operator
  -> Whitebox UI
  -> Whitebox Supervisor
      -> PM Agent
          -> Team Supervisors
              -> Team Agents
                  -> Executor Adapters
                      -> Claude / Codex / Gemini CLI
```

Claude Code remains the primary host and reasoning spine.

Other model CLIs are subordinate executors selected by routing policy.

## 8. Functional Requirements

### FR-1 Mission setup

The operator can define:

- mission
- scope
- constraints
- governance profile

### FR-2 Org visibility

The UI must show:

- PM
- teams
- team leads
- active agents
- assigned executor/model

### FR-3 Task visibility

The UI must show:

- team ownership
- current task
- task state
- blockers
- linked approvals

### FR-4 Communication visibility

The UI must show:

- active REQ/HANDOFF/BLOCKER/DEC/RISK flows
- unread or unresolved communication
- which team is waiting on which team

### FR-5 Governance enforcement

The system must support:

- policy checks
- architecture checks
- quality checks
- risk acknowledgements
- explicit human approvals

### FR-6 Supervisor-controlled launch

The system must:

- open the UI first
- spawn executor CLIs second
- keep execution metadata in canonical state artifacts

### FR-7 Multi-executor routing

The system must route work by:

- team
- role
- task type
- fallback health

### FR-8 Executor failure handling

The system must:

- capture stdout/stderr/exit code
- classify likely failure cause
- let an LLM inspect the failure
- allow retry with adjusted invocation
- allow fallback executor selection

### FR-9 Human-in-the-loop

The system must stop for operator input on:

- mission-scope changes
- high-risk actions
- team conflicts
- repeated executor failures
- recovery-resume decisions

### FR-10 Recovery and resume

The system must resume from:

- active mission state
- paused interventions
- communication backlog
- executor retry context

## 9. Non-Functional Requirements

- The canonical control path must remain file-based and inspectable.
- UI state must be derivable from canonical artifacts.
- No critical control action may depend on Claude Code custom hook UX.
- Direct automation mode must still exist for CI or headless use.

## 10. Success Metrics

### Operational success

- UI opens before execution in interactive runs
- paused decisions never silently pass
- team communication is visible in one surface
- repeated CLI failures become diagnosable and recoverable

### Product success

- user can explain who is doing what right now
- user can explain why work is paused
- user can approve, reject, retry, or abort from the UI

## 11. Release Slice

### Slice 1

- UI-first launcher
- mission/team/task/intervention visibility
- PM + multiple teams in UI

### Slice 2

- visible communication queues
- executor adapter health and retry flow
- richer governance enforcement

### Slice 3

- recovery-first resume
- multi-mission support
- historical audit and analytics
