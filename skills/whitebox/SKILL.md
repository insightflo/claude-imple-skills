---
name: whitebox
description: AI 코딩 과정을 관찰/설명/통제하는 화이트박스 컨트롤 플레인 엔트리포인트입니다. /whitebox 는 유일한 제품 경계이며 launch|status|explain|health|approvals 가 실행 시작, 현재 상태, intervention trigger, linked DEC 근거, 승인 제어, 실행 환경 건전성을 노출합니다.
trigger: /whitebox, /whitebox launch, /whitebox status, /whitebox explain, /whitebox health, /whitebox approvals, "화이트박스", "왜 막혔어", "상태 보여줘", "승인해", "거절해", "health check"
version: 1.0.0
updated: 2026-03-07
---

# Whitebox

> **AI 실행/의사결정/게이트를 관찰 가능한 형태로 노출하는 파일 기반 컨트롤 플레인**

## 목적

- 현재 진행(run)과 게이트 상태를 빠르게 파악한다.
- 작업/REQ/게이트가 막힌 이유를 근거(아티팩트) 기반으로 설명한다.
- 승인 게이트용 operator-intent/control artifact 계약을 `/whitebox` 표면에 고정한다.
- pending approval queue 를 intervention queue 로 해석해 `user_confirmation`, `agent_conflict`, `risk_acknowledgement` 같은 개입 이유를 드러낸다.
- `agent_conflict` 인 경우 linked `DEC-*` ruling metadata 와 required action 을 explain/TUI 표면에 함께 드러낸다.
- 구독형 CLI 실행기(claude/codex/gemini)와 핵심 아티팩트의 건전성을 점검한다.

## 비목적 (Non-goals)

- Claude Code 내부 hook UX 만으로 통제가 해결된다고 가정하지 않는다.
- API-key-first 제공자 통합을 지원하지 않는다.
- raw prompt / raw file contents / secrets 를 로그에 그대로 기록하지 않는다.

## 입력 아티팩트 (MVP)

화이트박스는 파일 기반 아티팩트를 읽는 제품 경계이며, mutation 이 필요한 경우에도 canonical CLI 경로를 통해서만 수행한다.

- `TASKS.md`
- `.claude/orchestrate-state.json`
- `.claude/collab/events.ndjson` (canonical facts log)
- `.claude/collab/control.ndjson` (canonical operator-intent log)
- `.claude/collab/board-state.json` (derived renderer state)
- `.claude/collab/control-state.json` (derived control query state)
- `.claude/collab/derived-meta.json` (derived stale markers)

## Single Surface Contract

- `/whitebox` is the only product boundary.
- TUI는 `/whitebox`의 interactive renderer/operator shell 이다.
- CLI는 `/whitebox`의 internal mutation API 이자 headless/scriptable surface 이다.
- `/task-board`는 별도 제품이 아니라 whitebox renderer 이다.

## Control Contract (MVP freeze)

- Canonical control action family 는 `approve` / `reject` 뿐이다.
- `.claude/collab/control.ndjson` 은 append-only operator-intent log 이며 Node writer 만 기록한다.
- TUI는 subprocess delegation 으로만 control command 를 보낸다.
- `.claude/collab/control-state.json` 은 disposable derived state 이며 직접 수정하지 않는다.
- Duplicate command 처리는 `idempotency_key` 와 correlation-aware filtering 으로 고정한다.

## 명령어

### `/whitebox launch` — UI-first supervisor entrypoint

**의도**: 화이트박스를 먼저 띄우고, 실제 실행 CLI는 그 다음에 child process 로 시작한다.

- Canonical script: `node skills/whitebox/scripts/whitebox-launcher.js`
- Inputs:
  - `.claude/collab/*` artifacts (auto-init 가능)
  - executor command (`claude` 기본)
- Outputs:
  - Human: dashboard URL + spawned command + run/session summary
  - JSON (`--json`): `{ ok, project_dir, dashboard, session, command }`
- Side effects:
  - `collab-init` 수행 가능
  - whitebox dashboard open
  - `supervisor.session.*` lifecycle event 기록
  - child CLI spawn / signal forwarding

**원칙**:

- UI가 먼저 보이지 않으면 그 사실을 명시적으로 드러낸다.
- hook 은 보조 signal 이고, 실행 소유권은 supervisor 가 가진다.

### `/whitebox status` — 현재 상태/요약

**의도**: 지금 무엇이 진행 중인지와 주요 상태(게이트/blocked)를 한 눈에 본다.

- Inputs: `TASKS.md`, `.claude/orchestrate-state.json`, `.claude/collab/board-state.json`, `.claude/collab/derived-meta.json`
- Outputs:
  - Human: 요약(진행 run, blocked 수, 주요 게이트 상태, pending approval/decision count) + 보드/TUI 안내
  - JSON (`--json`): `{ ok, run_id, blocked_count, gate_status, pending_approval_count, pending_decision_count, stale_artifacts }`
- Side effects:
  - stale derived artifact 가 있으면 authoritative projector 로 자동 rebuild 시도
  - TTY에서는 `/task-board` operator shell 로 진입해 approval shell 을 렌더링할 수 있음

**관계**: 보드 렌더링은 `/task-board show`를 재사용할 수 있다. `/whitebox status`는 "화이트박스" 관점의 요약/헤더/경고(derived stale 등)를 추가로 노출한다.

### `/whitebox explain` — 왜 막혔는지 + 어떤 선택이 가능한지 설명

**의도**: 특정 태스크/REQ/게이트가 blocked/denied 인 이유를 근거 기반으로 설명한다.

- Inputs: `.claude/collab/events.ndjson`, `.claude/collab/control-state.json`, `TASKS.md`, `.claude/orchestrate-state.json`, `.claude/collab/requests/*.md`, `.claude/collab/decisions/*.md`
- Outputs:
  - Human: "무엇이 / 왜 / 어디서" 막혔는지 + approval 인 경우 approve/reject 선택지 + trigger/recommendation + linked DEC metadata
  - JSON (`--json`): `{ ok, target, reason, options[], trigger, linked_decision, evidence_paths, correlation }`
- Side effects: 없음 (inspection only)

**Intervention trigger types**:

- `user_confirmation` — 사용자의 명시적 확인이 필요한 경우
- `agent_conflict` — 에이전트 간 권고가 충돌해서 operator 선택이 필요한 경우
- `risk_acknowledgement` — 현재 계획을 계속 진행하려면 위험을 명시적으로 수용해야 하는 경우

### `/whitebox approvals` — canonical approval control surface

**의도**: paused approval gate 를 headless/scriptable 방식으로 조회하고 승인/거절한다.

- Canonical script: `node skills/whitebox/scripts/whitebox-control.js`
- Verbs:
  - `list` — pending approval queue 조회 (`control-state.json` read only)
  - `show --gate-id=<id>` — 특정 gate 상세 조회
  - `approve --gate-id=<id>` — canonical `control.ndjson` 에 approve intent append
  - `reject --gate-id=<id>` — canonical `control.ndjson` 에 reject intent append
- Stable results: `approved`, `rejected`, `already_applied`, `not_found`, `stale_target`, `invalid_command`, `write_failed`
- Exit codes:
  - `0` — success (`approved`, `rejected`, `already_applied`, `list`, `show`)
  - `3` — `not_found`
  - `4` — `stale_target`
  - `5` — `invalid_command`
  - `6` — `write_failed`
- Side effects:
- `list/show`: 없음 (`control-state.json` query only)
  - `approve/reject`: shared mutation path 를 통해 `control.ndjson` append + audit event 기록

`list`/`show` 결과의 pending approval 은 위 trigger metadata 를 포함할 수 있으며, read-only decision 은 `/whitebox explain` 과 `/task-board`에서 inspect 중심으로 surfacing 됩니다. `approve/reject`는 mutable approval gate 에만 적용됩니다.

### `/whitebox health` — 환경/아티팩트 건전성 점검

**의도**: 실행기(구독형 CLI) + 핵심 아티팩트 + 이벤트 로그 무결성을 점검한다.

- Inputs:
  - CLIs: `claude`, `codex`, `gemini` (subscription-backed)
  - Files: `TASKS.md`, `.claude/orchestrate-state.json`, `.claude/collab/events.ndjson`, `.claude/collab/control.ndjson`, `.claude/collab/board-state.json`, `.claude/collab/control-state.json`
- Outputs:
  - Human: 체크 리스트 + 실패 원인
  - JSON (`--json`): `{ ok, executors, artifacts, events_integrity, control_integrity }`
- Side effects: 없음 (validation only)

## 신규 사용자 흐름

1. `/whitebox launch` 또는 launch 를 위임한 `/team-orchestrate` 로 작업을 시작한다.
2. `/whitebox status` 로 paused gate / blocked 상태와 pending decision 수를 본다.
3. `/whitebox explain` 로 근거, trigger, linked DEC, approve/reject 선택지 또는 inspect-only 결정을 확인한다.
4. `/whitebox approvals list|show` 로 mutable pending gate 를 확인한다.
5. `/whitebox approvals approve|reject --gate-id=...` 로 canonical control command 를 기록한다.
6. architecture-lead 가 `FINAL` DEC 를 기록하면 matching `ESCALATED` REQ 는 canonical hook/event 경로에서 자동 `RESOLVED` 된다.
7. `/whitebox status` 또는 `/task-board show` 로 resumed/blocked 상태를 다시 확인한다.

**규칙**:

- `codex auth status`, `gemini auth status`로 non-interactive auth 상태를 보고한다.
- Claude는 `CLAUDECODE` 호스트 첨부 신호가 없으면 `host_not_attached`로 보고한다(추측 금지).
