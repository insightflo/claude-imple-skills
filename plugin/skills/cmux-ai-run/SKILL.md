---
name: cmux-ai-run
description: cmux 창 분할 기반 멀티-AI 병렬 태스크 실행. 동일 워크스페이스에서 Codex(코드)/Gemini(디자인)/Claude(계획)를 패널로 분할해 동시에 실행합니다. multi-ai-run의 순차 실행과 달리 진짜 병렬. "/cmux-ai-run", "cmux로 AI 분업", "창 분할 병렬 실행", "codex gemini 동시 실행" 등 cmux 환경에서 여러 AI를 동시에 돌리고 싶은 요청이라면 반드시 이 스킬을 사용하세요.
triggers:
  - /cmux-ai-run
  - cmux AI 분업
  - cmux 병렬 실행
  - 창 분할 실행
version: 1.2.0
---

# /cmux-ai-run — cmux 창 분할 병렬 AI 실행

> **multi-ai-run과의 차이**: Bash 서브프로세스(순차) 대신 cmux 패널 분할(진짜 병렬).
> 패널에서 `tail -f`로 에이전트 진행 상황을 실시간 확인 가능.
>
> **완료 감지**: 실제 완료 신호는 Agent Teams API (SendMessage)로 수신 — 파일 폴링 없음.
> **시각화**: 패널에서 각 에이전트의 로그를 실시간 스트리밍.

---

## 패널 레이아웃

```
┌─────────────────────┬──────────────────────────┐
│  Claude             │  codex-runner 로그        │
│  (현재 패널)        │  $ tail -f codex.log      │
│  오케스트레이터     │  [진행 상황 실시간 표시]   │
│                     ├──────────────────────────┤
│                     │  gemini-runner 로그       │
│                     │  $ tail -f gemini.log     │
│                     │  [진행 상황 실시간 표시]   │
└─────────────────────┴──────────────────────────┘
```

---

## Prerequisites

```bash
cmux ping || { echo "cmux 필요"; exit 1; }
# 모델 설정 확인 (프로젝트 오버라이드 우선)
CONFIG="${PROJECT_ROOT}/.claude/cmux-ai-models.yaml"
[ ! -f "$CONFIG" ] && CONFIG="${CLAUDE_PLUGIN_ROOT}/skills/cmux-ai-run/config/models.yaml"
```

---

## 모델 설정

기본값 (`config/models.yaml`):
- **Codex**: `gpt-5.4`, `effort=high`
- **Gemini**: `gemini-3.1-pro-preview`
- **Claude**: `opus`

프로젝트별 오버라이드: `.claude/cmux-ai-models.yaml` 생성 (동일 형식)

---

## 실행 순서

### Step 1: 태스크 분석 + 라우팅

TASKS.md 또는 명시된 태스크를 분석해 AI별로 그룹화:

```
codex_tasks: [코드 생성, 리팩토링, 테스트 작성, API 구현]
gemini_tasks: [UI 컴포넌트, 디자인 구현, 스타일링]
claude_tasks: [아키텍처 결정, 플래닝, 복잡한 추론]
```

라우팅 기준은 `config/models.yaml`의 `routing` 섹션 참조.
태스크에 `[model:gemini]` 태그가 있으면 강제 라우팅.

### Step 2: 로그 파일 + Agent Teams 세션 + cmux 패널 생성

```bash
# 로그 파일 먼저 생성 (tail -f가 즉시 열 수 있도록)
mkdir -p .claude/cmux-ai/runs
touch .claude/cmux-ai/runs/codex-runner.log
touch .claude/cmux-ai/runs/gemini-runner.log
```

```
# Agent Teams 세션 생성
TeamCreate(name="cmux-ai-run-{project}-{timestamp}", description="Parallel AI task execution")
TaskCreate(team_name=..., subject="codex-tasks", description="{codex_tasks_list}")
TaskCreate(team_name=..., subject="gemini-tasks", description="{gemini_tasks_list}")
```

```bash
# cmux 패널 생성 + 즉시 tail -f 실행
CODEX_SURFACE=$(cmux new-split right --json | jq -r '.surface_id')
GEMINI_SURFACE=$(cmux new-split down --surface $CODEX_SURFACE --json | jq -r '.surface_id')

# 패널에 로그 스트리밍 시작 (에이전트 작업이 보임)
cmux send-surface --surface $CODEX_SURFACE \
  "tail -f .claude/cmux-ai/runs/codex-runner.log\n"
cmux send-surface --surface $GEMINI_SURFACE \
  "tail -f .claude/cmux-ai/runs/gemini-runner.log\n"

cmux set-status "codex" "running" --icon gear --color "#007aff"
cmux set-status "gemini" "running" --icon brush --color "#5856d6"
cmux set-progress 0.2 --label "Agents starting..."
```

### Step 3: 병렬 에이전트 실행

각 에이전트는 진행 상황을 로그 파일에 기록하고, 완료 시 `SendMessage`로 보고:

```
Agent(
  subagent_type="builder",
  team_name="cmux-ai-run-{project}-{timestamp}",
  name="codex-runner",
  run_in_background=true,
  prompt="""
    다음 태스크를 실행하세요.
    태스크: {codex_tasks_list}

    진행할 때마다 .claude/cmux-ai/runs/codex-runner.log 에 기록 (append):
      echo "[$(date +%H:%M:%S)] 태스크 시작: {task}" >> .claude/cmux-ai/runs/codex-runner.log
      echo "[$(date +%H:%M:%S)] 완료: {result}" >> .claude/cmux-ai/runs/codex-runner.log

    모든 태스크 완료 후:
      echo "[$(date +%H:%M:%S)] ✅ ALL DONE" >> .claude/cmux-ai/runs/codex-runner.log
      SendMessage(
        to="team-lead",
        message="{결과 전체 내용}",
        summary="codex-runner: DONE — {완료된 태스크 수}개 완료"
      )
  """
)

Agent(
  subagent_type="builder",
  team_name="cmux-ai-run-{project}-{timestamp}",
  name="gemini-runner",
  run_in_background=true,
  prompt="""
    다음 태스크를 실행하세요.
    태스크: {gemini_tasks_list}

    진행할 때마다 .claude/cmux-ai/runs/gemini-runner.log 에 기록 (append):
      echo "[$(date +%H:%M:%S)] 태스크 시작: {task}" >> .claude/cmux-ai/runs/gemini-runner.log
      echo "[$(date +%H:%M:%S)] 완료: {result}" >> .claude/cmux-ai/runs/gemini-runner.log

    모든 태스크 완료 후:
      echo "[$(date +%H:%M:%S)] ✅ ALL DONE" >> .claude/cmux-ai/runs/gemini-runner.log
      SendMessage(
        to="team-lead",
        message="{결과 전체 내용}",
        summary="gemini-runner: DONE — {완료된 태스크 수}개 완료"
      )
  """
)
```

```bash
cmux set-progress 0.4 --label "Agents running (see panels)..."
```

### Step 4: 완료 대기 (이벤트 기반)

메인 Claude는 두 에이전트의 `SendMessage` 수신 대기. 수신 시 패널의 로그에도 완료가 표시되어 있음.

```bash
cmux set-progress 0.7 --label "Waiting for agents..."
```

### Step 5: 결과 통합 + 충돌 해결

두 `SendMessage` 수신 후 결과를 검토하고 프로젝트에 반영:

- **파일 충돌**: 같은 파일 수정 시 Claude가 중재
- **품질 검증**: lint, type-check, test 실행
- **적용**: Edit/Write 도구로 프로젝트에 반영

```bash
cmux set-progress 0.9 --label "Integrating results..."
# ... Claude가 결과 통합 ...
cmux set-progress 1.0 --label "Done"
cmux log --level success -- "cmux-ai-run: All tasks complete"
cmux notify --title "cmux-ai-run Complete" --body "All agents finished"
cmux clear-status "codex"
cmux clear-status "gemini"
```

---

## 태스크 태그 (TASKS.md에서 사용)

```markdown
- [ ] T1.1: Implement auth API [model:codex]
- [ ] T1.2: Create login UI component [model:gemini]
- [ ] T1.3: Design system architecture [model:claude]
- [ ] T1.4: Write integration tests  # 태그 없으면 routing 설정 기준 자동 배정
```

---

## Fallback

| 상황 | 동작 |
|------|------|
| `codex` CLI 없음 | Claude가 직접 처리 |
| `gemini` CLI 없음 | Claude가 직접 처리 |
| cmux 없음 | `/multi-ai-run` 사용 권장 |
| Agent 무응답 (5분) | Claude가 직접 해당 태스크 수행 |

---

## 아키텍처 요약

```
메인 Claude (오케스트레이터)
├── 로그 파일 생성 → cmux 패널에서 tail -f (실시간 가시화)
├── TeamCreate → 통신 채널 수립
├── Agent(codex-runner, bg) → 작업 + 로그 기록 → SendMessage(summary="DONE")
├── Agent(gemini-runner, bg) → 작업 + 로그 기록 → SendMessage(summary="DONE")
└── SendMessage 수신 → 결과 통합 (이벤트 기반)
```

---

## 설정 파일 우선순위

1. `.claude/cmux-ai-models.yaml` (프로젝트)
2. `config/models.yaml` (스킬 기본값)
