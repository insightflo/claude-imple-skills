---
name: team-orchestrate
description: "Unified orchestration engine with 3 modes: team (Agent Teams API, 3-level hierarchy), auto (direct Task dispatch, worktree-based phases), and thin (ultra-minimal context for 50-200 tasks). Use this skill for any multi-task project execution — it auto-selects the right mode based on task count and infrastructure. Triggers on /team-orchestrate, /auto-orchestrate, /orchestrate, '에이전트 팀 실행', '오케스트레이트', '자동 실행', '완전 자동화', and any request to execute TASKS.md at scale."
triggers:
  - /team-orchestrate
  - /auto-orchestrate
  - /orchestrate
  - 에이전트 팀 실행
  - 팀 오케스트레이트
  - 완전 자동화
  - 자동 실행
version: 4.1.0
updated: 2026-03-29
---

# Unified Orchestration Engine

> **Goal**: Execute TASKS.md at any scale with the right coordination strategy.

## Mode Selection

| Mode | Task count | Infrastructure | Command |
|------|-----------|----------------|---------|
| **auto** | 1-50 | Task tool only | `/team-orchestrate --mode=auto` |
| **autonomous** | any | Task tool + auto-cycle | `/team-orchestrate --mode=autonomous` |
| **team** | 10-80 | Agent Teams API | `/team-orchestrate --mode=team` |
| **thin** | 50-200 | Task tool + background | `/team-orchestrate --mode=thin` |

**Auto-selection** (when no `--mode` specified):
```
IF tasks < 30 AND no Agent Teams → auto
IF tasks < 80 AND Agent Teams available → team
IF tasks >= 50 → thin
```

For mode-specific details:
- **auto**: `references/auto-mode.md` — Direct subagent dispatch, worktree-based phases
- **thin**: `references/thin-mode.md` — Ultra-minimal context, 76% token reduction
- **team**: Below (this document) — Agent Teams API, 3-level hierarchy

---

## Mode: team (Agent Teams API)

## Mandatory Tools (순서대로 호출)

| 순서 | 도구 | 용도 | 필수 파라미터 |
|------|------|------|-------------|
| 1 | `TeamCreate` | 팀 생성 + 공유 작업 리스트 | `team_name`, `description` |
| 2 | `TaskCreate` | 작업 등록 | `subject`, `description` |
| 3 | `TaskUpdate` | 의존성/소유자 설정 | `addBlockedBy`, `owner` |
| 4 | `Agent` | 팀메이트 생성 | `team_name`, `name`, `prompt` |
| 5 | `SendMessage` | 에이전트 간 통신 | `to`, `message` |

> **CRITICAL**: `Agent`를 호출할 때 **반드시** `team_name`을 포함해야 함. 없으면 일반 서브에이전트가 생성되어 통신 불가.

---

## Prerequisite Checks (실행 전 자동 확인)

| # | 항목 | 실패 시 동작 |
|---|------|------------|
| 1 | `TASKS.md` 존재 | STOP - "/tasks-init로 생성 먼저" |
| 2 | `TASKS.md` 형식 (deps:, domain:) | STOP - "/tasks-migrate로 변환" |
| 3 | Agent Teams 활성화 | AUTO-FIX - `install.sh --local --mode=team` |
| 4 | 프로젝트 훅 설치 | AUTO-FIX - 동일 |
| 5 | settings.json 등록 | AUTO-FIX - 동일 |
| 6 | governance 문서 존재 | AskUserQuestion - 사용자 선택 |

**Check 6 상세**:
```bash
ls management/project-plan.md management/decisions/ADR-*.md 2>/dev/null | wc -l
```
- `≥ 2` → PASS
- `< 2` → 사용자에게 "/governance-setup 먼저 실행?" 선택지 제시

---

## Architecture: Logical 3-Level on Flat Team

```
Physical (flat):
  TeamCreate("project")
  ├── architecture-lead    ← domain coordinator
  ├── backend-builder      ← worker
  ├── design-lead          ← domain coordinator
  ├── frontend-builder     ← worker
  └── qa-lead              ← cross-cutting

Logical (hierarchical via SendMessage):
  Level 0: team-lead
    ├── Level 1: architecture-lead → Level 2: backend-builder, reviewer
    ├── Level 1: design-lead → Level 2: frontend-builder, designer
    └── Level 1: qa-lead (reports to team-lead)
```

**Key**: SendMessage는 모든 팀메이트 간 통신 가능. 계층은 통신 규약, 기술 제약 아님.

---

## Execution Steps

### Step 1: TASKS.md 분석

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/team-orchestrate/scripts/domain-analyzer.js --tasks-file TASKS.md --json
```

### Step 2: TeamCreate 호출 (가장 먼저)

```
TeamCreate(team_name="{project-name}", description="3-level team for {project}")
```

### Step 3: 협업 디렉토리 초기화

```bash
Bash('mkdir -p .claude/collab/decisions .claude/collab/requests .claude/collab/reports')
```

### Step 4: TaskCreate로 작업 등록 + 의존성 설정

```
TaskCreate(subject="T1.1: User API", description=" deps:[] domain:backend")
TaskUpdate(task_id="2", addBlockedBy=["1"])
```

### Step 5: Agent로 팀메이트 스폰 (team_name 필수)

**최소 구조**:
```javascript
Agent(
  subagent_type = "general-purpose",  // 또는 "builder"
  team_name = "{project-name}",       // 필수 - 통신 가능하게 함
  name = "architecture-lead",         // 필수 - SendMessage에서 사용
  prompt = "...",                     // 상세는 references/agent-prompts.md
  run_in_background = true
)
```

### Step 6: 초기 작업 할당 + 도메인 리드 알림

```
TaskUpdate(task_id="1", owner="backend-builder")
SendMessage(to="architecture-lead", message="Tasks assigned. Coordinate workers.")
```

### Step 7: 모니터링 + 중재

- 도메인 리드로부터 메시지 자동 수신 (폴링 불필요)
- TaskList로 진행 상황 확인
- 교차 도메인 충돌 시 중재 + `.claude/collab/decisions/DEC-*.md` 기록

### Step 8: 완료 시 팀 종료

```
SendMessage(to="teammate", message={"type": "shutdown_request", "reason": "All tasks complete"})
```

---

## Team Sizing 가이드

| 프로젝트 유형 | 도메인 리드 | 워커 | 총인원 |
|--------------|------------|------|--------|
| Backend only | architecture-lead | backend-builder, reviewer | 3 |
| Full-stack | architecture-lead, design-lead | backend, frontend, reviewer, designer | 6 |
| + QA | + qa-lead | | 7 |

---

## Communication Protocol

```
Worker → Domain-lead:    "Task #1 done, ready for review"
Domain-lead → Team-lead: "Backend phase 1: 3/5 tasks done"
Domain-lead → Worker:    "Fix auth logic in T1.3"
Cross-domain:            architecture-lead → design-lead "API changed"
```

---

## Agent Prompts (상세)

에이전트별 상세 프롬프트 템플릿은 `references/agent-prompts.md` 참조:

| 에이전트 | 역할 | 주요 책임 |
|----------|------|----------|
| architecture-lead | Backend 도메인 조정 | 작업 할당, 도메인 테스트, ADR 작성 |
| design-lead | Frontend 도메인 조정 | 작업 할당, 도메인 테스트, ADR 작성 |
| backend-builder | Backend 구현 | 단위 테스트, architecture-lead 보고 |
| frontend-builder | Frontend 구현 | 단위 테스트, design-lead 보고 |
| qa-lead | 교차 도메인 품질 | 통합 테스트, Phase 승인/거부 |
| reviewer | 코드 리뷰 | architecture-lead 지시, PR 검토 |
| designer | UI/UX 설계 | design-lead 지시, 명세 작성 |

---

## Configuration Files

| 파일 | 용도 |
|------|------|
| `config/team-topology.json` | 도메인 매핑, CLI 라우팅 |
| `.claude/collab/decisions/ADR-*.md` | 기술 결정 기록 |
| `.claude/collab/requests/REQ-*.md` | 도메인 간 요청 |
| `.claude/collab/reports/*-status.md` | 상태 보고 |

---

## Governance Hooks

| Hook | 시점 | 효과 |
|------|------|------|
| TeammateIdle | 팀메이트 턴 종료 | 미완료 작업 확인 |
| TaskCompleted | 작업 완료 표시 | 가벼운 품질 게이트 |
| task-progress-gate | 리드 세션 종료 | TASKS.md 미갱신 경고 |

---

**Last Updated**: 2026-03-29 (v4.1.0 - autonomous 모드 추가)

---

## Mode: autonomous (완전 자율 실행)

> GSD의 `/gsd:autonomous` 패턴. 모든 incomplete 작업을 자동으로 순회.

### 실행 흐름

```
1. TASKS.md 분석 → incomplete 작업 목록
2. 각 작업에 대해:
   a. /discuss (필요시) → CONTEXT.md
   b. 계획 수립
   c. 실행 (deviation rules 적용)
   d. 검증 (goal-backward)
3. 모든 작업 완료 또는 블로커 발생까지 반복
```

### 사용자 개입 포인트

- Gray area 결정 필요 (AskUserQuestion)
- 검증 실패 시 확인
- 블로커 발생 시 알림

### 진행 상황 표시

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AUTONOMOUS MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Progress: 3/10 tasks
 Current: T1.3: Implement auth API
 Status: executing...

 [██████░░░░░░░░░░░░░░] 30%
```

### 호출

```bash
/team-orchestrate --mode=autonomous
/team-orchestrate --mode=autonomous --from T2.1  # 특정 작업부터
```

### Fallback

- 5분 무응답 → 알림 + 대기
- 3회 연속 실패 → 중단 + 상태 저장
