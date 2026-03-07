---
name: whitebox
description: AI 코딩 과정을 관찰/설명/검증하는 화이트박스 컨트롤 플레인 엔트리포인트입니다. /whitebox status|explain|health 로 현재 상태, 막힌 이유, 실행 환경/아티팩트 건전성을 확인합니다.
trigger: /whitebox, /whitebox status, /whitebox explain, /whitebox health, "화이트박스", "왜 막혔어", "상태 보여줘", "health check"
version: 1.0.0
updated: 2026-03-07
---

# Whitebox

> **AI 실행/의사결정/게이트를 관찰 가능한 형태로 노출하는 파일 기반 컨트롤 플레인**

## 목적

- 현재 진행(run)과 게이트 상태를 빠르게 파악한다.
- 작업/REQ/게이트가 막힌 이유를 근거(아티팩트) 기반으로 설명한다.
- 구독형 CLI 실행기(claude/codex/gemini)와 핵심 아티팩트의 건전성을 점검한다.

## 비목적 (Non-goals)

- 새 스케줄러/실행 엔진을 만들지 않는다.
- 웹 UI를 만들지 않는다.
- API-key-first 제공자 통합을 지원하지 않는다.
- raw prompt / raw file contents / secrets 를 로그에 그대로 기록하지 않는다.

## 입력 아티팩트 (MVP)

화이트박스 명령은 아래 아티팩트를 "읽어서" 상태를 만든다. 직접 편집/수정하지 않는다.

- `TASKS.md`
- `.claude/orchestrate-state.json`
- `.claude/collab/events.ndjson` (canonical append-only log)
- `.claude/collab/board-state.json` (derived)
- `.claude/collab/derived-meta.json` (derived stale markers)

## 명령어

### `/whitebox status` — 현재 상태/요약

**의도**: 지금 무엇이 진행 중인지와 주요 상태(게이트/blocked)를 한 눈에 본다.

- Inputs: `TASKS.md`, `.claude/orchestrate-state.json`, `.claude/collab/board-state.json`, `.claude/collab/derived-meta.json`
- Outputs:
  - Human: 요약(진행 run, blocked 수, 주요 게이트 상태) + 보드/TUI 안내
  - JSON (`--json`): `{ ok, run_id, blocked_count, gate_status, stale_artifacts }`
- Side effects: 없음 (inspection only)

**관계**: 보드 렌더링은 `/task-board show`를 재사용할 수 있다. `/whitebox status`는 "화이트박스" 관점의 요약/헤더/경고(derived stale 등)를 추가로 노출한다.

### `/whitebox explain` — 왜 막혔는지 설명

**의도**: 특정 태스크/REQ/게이트가 blocked/denied 인 이유를 근거 기반으로 설명한다.

- Inputs: `.claude/collab/events.ndjson`, `TASKS.md`, `.claude/orchestrate-state.json`, `.claude/collab/requests/*.md`, `.claude/collab/decisions/*.md`
- Outputs:
  - Human: "무엇이 / 왜 / 어디서" 막혔는지 + 다음 액션 힌트
  - JSON (`--json`): `{ ok, target, reason, evidence_paths, correlation }`
- Side effects: 없음 (inspection only)

### `/whitebox health` — 환경/아티팩트 건전성 점검

**의도**: 실행기(구독형 CLI) + 핵심 아티팩트 + 이벤트 로그 무결성을 점검한다.

- Inputs:
  - CLIs: `claude`, `codex`, `gemini` (subscription-backed)
  - Files: `TASKS.md`, `.claude/orchestrate-state.json`, `.claude/collab/events.ndjson`, `.claude/collab/board-state.json`
- Outputs:
  - Human: 체크 리스트 + 실패 원인
  - JSON (`--json`): `{ ok, executors, artifacts, events_integrity }`
- Side effects: 없음 (validation only)

**규칙**:

- `codex auth status`, `gemini auth status`로 non-interactive auth 상태를 보고한다.
- Claude는 `CLAUDECODE` 호스트 첨부 신호가 없으면 `host_not_attached`로 보고한다(추측 금지).
