# Whitebox Supervisor-First Redesign

## Problem Statement

The current whitebox stack has good artifacts and weak control.

- Governance exists, but execution still flows inside Claude Code.
- Stop hooks can emit `block`, but they do not own the UX or the child process lifecycle.
- The browser dashboard exists, but it is opened as a side effect after execution has already moved on.
- Human-in-the-loop is therefore advisory in practice instead of authoritative.

The product goal is not "better hook logging". The goal is:

`observe -> decide -> control` before the next irreversible step happens.

## Socratic Reframe

### What is the product boundary?

The product boundary is not the hook.

The product boundary is the operator surface that owns:

- visible run state
- intervention queue
- pause / resume / abort decisions
- execution hand-off to the actual CLI

That boundary should remain `/whitebox`.

### Who should own execution?

Not Claude Code hooks.

Hooks run too late, cannot guarantee a custom UX, and cannot reliably stop already-rendered assistant output. The execution owner must be an external supervisor process.

### What should hooks do?

Hooks should be downgraded to signals and evidence producers.

They may:

- emit canonical events
- mark derived artifacts stale
- produce typed gate results
- suggest intervention reasons

They should not be the primary pause mechanism.

### What should the user launch?

The user should launch a whitebox entrypoint first, and that entrypoint should spawn the real executor CLI second.

Preferred flow:

1. `whitebox-launcher`
2. dashboard open + collab init
3. spawn `claude` / `codex` / `gemini`
4. monitor lifecycle
5. if gate requires intervention, keep the run paused at the supervisor boundary
6. operator approves or rejects through whitebox
7. supervisor resumes or aborts

## Keep / Cut / Add

### Keep

These are good assets and should remain canonical:

- `.claude/collab/events.ndjson`
- `.claude/collab/control.ndjson`
- `.claude/collab/board-state.json`
- `.claude/collab/control-state.json`
- `.claude/collab/derived-meta.json`
- `whitebox-control.js`
- `whitebox-dashboard.js`
- `whitebox-refresh.js`
- `project-team/scripts/collab-init.js`
- executor routing inside `worker.js`

### Cut

These should no longer be treated as the primary control plane:

- `Stop` hook as the main pause/resume mechanism
- "block and hope Claude Code asks the user"
- browser dashboard surfacing as a post-facto side effect
- governance-only success criteria that do not prove runtime control

### Add

These are the minimum new pieces:

- `whitebox-launcher.js`
- explicit supervisor lifecycle events
- a stable "launch-first" user journey
- orchestration entrypoints that can delegate to the launcher

## New Architecture

```text
┌────────────────────────────────────────────────────────┐
│ Operator                                              │
│  launches /whitebox                                   │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│ Whitebox Supervisor                                   │
│  - init collab artifacts                              │
│  - open dashboard first                               │
│  - spawn executor CLI                                 │
│  - track pid / status / exit                          │
│  - emit lifecycle events                              │
│  - enforce intervention waitpoints                    │
└──────────────┬─────────────────────────────────────────┘
               │
     ┌─────────┴─────────┐
     ▼                   ▼
┌──────────────┐   ┌────────────────────────────────────┐
│ Whitebox UI  │   │ Executor CLI                        │
│ status       │   │ claude / codex / gemini            │
│ explain      │   │ actual work                         │
│ approvals    │   │ emits output + file side effects    │
└──────────────┘   └────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────┐
│ Canonical Artifacts                                   │
│ events.ndjson / control.ndjson / board / summary      │
└────────────────────────────────────────────────────────┘
```

## Control Principles

### Principle 1

If the UI cannot be shown, the supervisor must say so explicitly before work continues.

### Principle 2

If a gate requires human input, progress must stop at a boundary owned by the supervisor, not by a hope that Claude Code will interrupt correctly.

### Principle 3

All operator decisions still flow through `control.ndjson`.

The mutation contract remains stable even if the execution owner changes.

### Principle 4

Recovery must restore both:

- task/orchestration state
- pending intervention state

## MVP Scope

### Phase A

Introduce `whitebox-launcher.js`.

- Runs `collab-init`
- Opens dashboard first
- Spawns `claude` by default
- Emits lifecycle events:
  - `supervisor.session.started`
  - `supervisor.session.spawn_failed`
  - `supervisor.session.finished`
  - `supervisor.session.interrupted`

### Phase B

Make orchestrate entrypoints optionally delegate into the launcher.

- `orchestrate.sh` can launch through whitebox in interactive mode
- direct orchestration remains available for non-interactive automation

### Phase C

Convert gate enforcement to supervisor-owned waitpoints.

- hook emits typed gate result
- supervisor translates it into pause / resume / abort
- whitebox approvals remain canonical

## User Journey

### Old

1. Start Claude Code directly
2. Hope hook blocks at the right time
3. Generic interrupt appears or does not appear
4. Whitebox may or may not open

### New

1. Start whitebox launcher
2. Whitebox becomes visible first
3. Executor CLI starts under supervision
4. Gate happens
5. User sees why it paused
6. User approves / rejects
7. Supervisor resumes / aborts deterministically

## Success Criteria

The redesign is successful only if all are true:

- UI is visible before real execution starts
- a blocked decision cannot silently flow past the boundary
- control works without depending on Claude Code custom UX behavior
- recovery restores pending approvals and the owning run

