---
name: whitebox
description: File-based control plane that observes, explains, and controls the AI coding process. /whitebox is the sole product boundary — launch|status|explain|health|approvals expose run start, current state, intervention triggers, linked DEC evidence, approval control, and execution environment health. Use this to see what is running, why something is blocked, and to approve or reject gates.
trigger: /whitebox, /whitebox launch, /whitebox status, /whitebox explain, /whitebox health, /whitebox approvals, "화이트박스", "왜 막혔어", "상태 보여줘", "승인해", "거절해", "health check"
version: 1.0.0
updated: 2026-03-07
---

# Whitebox

> **File-based control plane that exposes AI execution, decisions, and gates in an observable form**

## Purpose

- Quickly understand the current run and gate state.
- Explain why a task/REQ/gate is blocked, backed by evidence (artifacts).
- Pin the operator-intent/control artifact contract for approval gates to the `/whitebox` surface.
- Interpret the pending approval queue as an intervention queue and surface intervention reasons such as `user_confirmation`, `agent_conflict`, and `risk_acknowledgement`.
- For `agent_conflict` cases, surface linked `DEC-*` ruling metadata and required actions on the explain/TUI surface.
- Check the health of subscription-based CLI executors (claude/codex/gemini) and core artifacts.

## Non-goals

- Do not assume hook UX inside Claude Code alone is sufficient for control.
- Does not support API-key-first provider integrations.
- Does not log raw prompts, raw file contents, or secrets.

## Input Artifacts (MVP)

Whitebox is a product boundary that reads file-based artifacts; any mutations are performed exclusively via the canonical CLI path.

- `TASKS.md`
- `.claude/orchestrate-state.json`
- `.claude/collab/events.ndjson` (canonical facts log)
- `.claude/collab/control.ndjson` (canonical operator-intent log)
- `.claude/collab/board-state.json` (derived renderer state)
- `.claude/collab/control-state.json` (derived control query state)
- `.claude/collab/derived-meta.json` (derived stale markers)

## Single Surface Contract

- `/whitebox` is the only product boundary.
- The TUI is `/whitebox`'s interactive renderer/operator shell.
- The CLI is `/whitebox`'s internal mutation API and headless/scriptable surface.
- The TUI renderer is the exclusive interactive shell for `/whitebox`.

## Control Contract (MVP freeze)

- The canonical control action family is `approve` / `reject` only.
- `.claude/collab/control.ndjson` is an append-only operator-intent log; only the Node writer may write to it.
- The TUI sends control commands via subprocess delegation only.
- `.claude/collab/control-state.json` is disposable derived state and must not be edited directly.
- Duplicate command handling is fixed via `idempotency_key` and correlation-aware filtering.

## Commands

### `/whitebox launch` — UI-first supervisor entrypoint

**Intent**: Bring up Whitebox first, then start the actual executor CLI as a child process.

- Canonical script: `node skills/whitebox/scripts/whitebox-launcher.js`
- Inputs:
  - `.claude/collab/*` artifacts (auto-init capable)
  - executor command (default: `claude`)
- Outputs:
  - Human: dashboard URL + spawned command + run/session summary
  - JSON (`--json`): `{ ok, project_dir, dashboard, session, command }`
- Side effects:
  - May run `collab-init`
  - Opens the whitebox dashboard
  - Records `supervisor.session.*` lifecycle events
  - Spawns child CLI / forwards signals

**Principle**:

- If the UI is not visible, surface that fact explicitly.
- Hooks are auxiliary signals; the supervisor owns execution.

### `/whitebox status` — Current state/summary

**Intent**: See at a glance what is currently running and the key state (gates/blocked).

- Inputs: `TASKS.md`, `.claude/orchestrate-state.json`, `.claude/collab/board-state.json`, `.claude/collab/derived-meta.json`
- Outputs:
  - Human: summary (active run, blocked count, key gate state, pending approval/decision count) + board/TUI link
  - JSON (`--json`): `{ ok, run_id, blocked_count, gate_status, pending_approval_count, pending_decision_count, stale_artifacts }`
- Side effects:
  - If stale derived artifacts are detected, automatically attempts rebuild via the authoritative projector
  - In TTY mode, can enter the whitebox TUI operator shell to render the approval shell

**Relationship**: `/whitebox status` exposes the whitebox-perspective summary/header/warnings (derived stale, etc.).

### `/whitebox explain` — Why is it blocked? What options are available?

**Intent**: Explain, with evidence, why a specific task/REQ/gate is blocked or denied.

- Inputs: `.claude/collab/events.ndjson`, `.claude/collab/control-state.json`, `TASKS.md`, `.claude/orchestrate-state.json`, `.claude/collab/requests/*.md`, `.claude/collab/decisions/*.md`
- Outputs:
  - Human: "what / why / where" it is blocked + approve/reject options (if an approval) + trigger/recommendation + linked DEC metadata
  - JSON (`--json`): `{ ok, target, reason, options[], trigger, linked_decision, evidence_paths, correlation }`
- Side effects: None (inspection only)

**Intervention trigger types**:

- `user_confirmation` — Explicit user confirmation is required
- `agent_conflict` — Agent recommendations conflict and operator choice is needed
- `risk_acknowledgement` — Continuing the current plan requires explicitly acknowledging a risk

### `/whitebox approvals` — Canonical approval control surface

**Intent**: Query and approve/reject paused approval gates in a headless/scriptable way.

- Canonical script: `node skills/whitebox/scripts/whitebox-control.js`
- Verbs:
  - `list` — Query pending approval queue (`control-state.json` read only)
  - `show --gate-id=<id>` — Show details of a specific gate
  - `approve --gate-id=<id>` — Append approve intent to canonical `control.ndjson`
  - `reject --gate-id=<id>` — Append reject intent to canonical `control.ndjson`
- Stable results: `approved`, `rejected`, `already_applied`, `not_found`, `stale_target`, `invalid_command`, `write_failed`
- Exit codes:
  - `0` — success (`approved`, `rejected`, `already_applied`, `list`, `show`)
  - `3` — `not_found`
  - `4` — `stale_target`
  - `5` — `invalid_command`
  - `6` — `write_failed`
- Side effects:
  - `list/show`: None (`control-state.json` query only)
  - `approve/reject`: appends to `control.ndjson` and records an audit event via the shared mutation path

`list`/`show` results for pending approvals may include the trigger metadata above; read-only decisions are surfaced in inspect-focused mode via `/whitebox explain`. `approve/reject` applies only to mutable approval gates.

### `/whitebox health` — Environment/artifact health check

**Intent**: Check the health of executors (subscription CLIs), core artifacts, and event log integrity.

- Inputs:
  - CLIs: `claude`, `codex`, `gemini` (subscription-backed)
  - Files: `TASKS.md`, `.claude/orchestrate-state.json`, `.claude/collab/events.ndjson`, `.claude/collab/control.ndjson`, `.claude/collab/board-state.json`, `.claude/collab/control-state.json`
- Outputs:
  - Human: checklist + failure reasons
  - JSON (`--json`): `{ ok, executors, artifacts, events_integrity, control_integrity }`
- Side effects: None (validation only)

## New User Flow

1. Start work with `/whitebox launch` or `/team-orchestrate` (which delegates launch).
2. Use `/whitebox status` to see paused gates / blocked state and pending decision count.
3. Use `/whitebox explain` to review evidence, trigger, linked DEC, approve/reject options, or inspect-only decisions.
4. Use `/whitebox approvals list|show` to review mutable pending gates.
5. Use `/whitebox approvals approve|reject --gate-id=...` to record the canonical control command.
6. When architecture-lead records a `FINAL` DEC, matching `ESCALATED` REQs are automatically `RESOLVED` through the canonical hook/event path.
7. Use `/whitebox status` again to verify resumed/blocked state.

**Rules**:

- Report non-interactive auth state via `codex auth status` and `gemini auth status`.
- Claude reports `host_not_attached` when the `CLAUDECODE` host attachment signal is absent — do not guess.
