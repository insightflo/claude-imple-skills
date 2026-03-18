---
name: cmux-ai-run
description: cmux 창 분할 기반 멀티-AI 병렬 태스크 실행. 동일 워크스페이스에서 Codex(코드)/Gemini(디자인)/Claude(계획)를 패널로 분할해 동시에 실행합니다. multi-ai-run의 순차 실행과 달리 진짜 병렬. "/cmux-ai-run", "cmux로 AI 분업", "창 분할 병렬 실행", "codex gemini 동시 실행" 등 cmux 환경에서 여러 AI를 동시에 돌리고 싶은 요청이라면 반드시 이 스킬을 사용하세요.
triggers:
  - /cmux-ai-run
  - cmux AI 분업
  - cmux 병렬 실행
  - 창 분할 실행
version: 1.3.0
---

# /cmux-ai-run — cmux 창 분할 병렬 AI 실행

> **multi-ai-run과의 차이**: Bash 서브프로세스(순차) 대신 cmux 패널 분할(진짜 병렬).
>
> **두 가지 실행 모드:**
> - **기본 모드**: Background Agent(코디네이터)가 CLI 호출 + `tail -f` 로그 스트리밍. SendMessage 완료 감지.
> - **`--live-mode`**: Claude가 cmux 명령어로 패널을 직접 제어. CLI 전송 → Read 결과 확인 → 에러 시 즉시 대응.

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
- **Gemini**: `gemini-3-flash-preview`
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
CODEX_SURFACE=$(cmux new-split right 2>&1 | awk '{print $2}')
GEMINI_SURFACE=$(cmux new-split down --surface $CODEX_SURFACE 2>&1 | awk '{print $2}')

# 패널에 로그 스트리밍 시작 (에이전트 작업이 보임)
cmux send --surface $CODEX_SURFACE \
  "tail -f .claude/cmux-ai/runs/codex-runner.log
"
cmux send --surface $GEMINI_SURFACE \
  "tail -f .claude/cmux-ai/runs/gemini-runner.log
"

cmux set-status "codex" "running" --icon gear --color "#007aff"
cmux set-status "gemini" "running" --icon brush --color "#5856d6"
cmux set-progress 0.2 --label "Agents starting..."
```

### Step 3: 병렬 에이전트 실행

각 에이전트(Claude 서브에이전트)는 **코디네이터**로서 실제 AI CLI를 호출하고, 진행 로그를 기록하며, 완료 시 `SendMessage`로 보고:

```
Agent(
  subagent_type="builder",
  team_name="cmux-ai-run-{project}-{timestamp}",
  name="codex-runner",
  run_in_background=true,
  prompt="""
    너는 Codex CLI 코디네이터다. 직접 코드를 작성하지 말고,
    실제 codex CLI를 호출해서 작업을 수행하라.

    ## 수행할 태스크
    {codex_tasks_list}

    ## 실행 방법
    각 태스크마다:
    1. 프롬프트 파일 작성:
       Write("{task_prompt}") > .claude/cmux-ai/runs/codex-task-{N}.md
    2. 로그 기록:
       Bash: echo "[$(date +%H:%M:%S)] ▶ {task 이름} — codex exec 실행" >> .claude/cmux-ai/runs/codex-runner.log
    3. codex CLI 호출:
       Bash: codex exec "$(cat .claude/cmux-ai/runs/codex-task-{N}.md)" 2>&1
    4. 결과 확인 후 로그:
       Bash: echo "[$(date +%H:%M:%S)] ✅ {task 이름} done" >> .claude/cmux-ai/runs/codex-runner.log
    5. 에러 시:
       Bash: echo "[$(date +%H:%M:%S)] ⚠️  {에러 내용}" >> .claude/cmux-ai/runs/codex-runner.log

    ## 완료 후
    Bash: echo "[$(date +%H:%M:%S)] ━━━━━━━━━━━━━━━━━━━━━━━━━" >> .claude/cmux-ai/runs/codex-runner.log
    Bash: echo "[$(date +%H:%M:%S)] 🏁 codex-runner ALL DONE" >> .claude/cmux-ai/runs/codex-runner.log
    SendMessage(
      to="team-lead",
      message="{결과 전체 요약}",
      summary="codex-runner: DONE — {완료된 태스크 수}개 완료"
    )

    ## Fallback
    codex CLI 실행 실패 시 → Claude가 직접 해당 태스크 수행 후 로그에 "[FALLBACK] Claude 직접 처리" 기록.
  """
)

Agent(
  subagent_type="builder",
  team_name="cmux-ai-run-{project}-{timestamp}",
  name="gemini-runner",
  run_in_background=true,
  prompt="""
    너는 Gemini CLI 코디네이터다. 직접 작업하지 말고,
    실제 gemini CLI를 호출해서 작업을 수행하라.

    ## 수행할 태스크
    {gemini_tasks_list}

    ## 실행 방법
    각 태스크마다:
    1. 프롬프트 파일 작성:
       Write("{task_prompt}") > .claude/cmux-ai/runs/gemini-task-{N}.md
    2. 로그 기록:
       Bash: echo "[$(date +%H:%M:%S)] ▶ {task 이름} — gemini -y -p 실행" >> .claude/cmux-ai/runs/gemini-runner.log
    3. gemini CLI 호출:
       Bash: gemini -y -p "$(cat .claude/cmux-ai/runs/gemini-task-{N}.md)" 2>&1
    4. 결과 확인 후 로그:
       Bash: echo "[$(date +%H:%M:%S)] ✅ {task 이름} done" >> .claude/cmux-ai/runs/gemini-runner.log
    5. 에러 시:
       Bash: echo "[$(date +%H:%M:%S)] ⚠️  {에러 내용}" >> .claude/cmux-ai/runs/gemini-runner.log

    ## 완료 후
    Bash: echo "[$(date +%H:%M:%S)] ━━━━━━━━━━━━━━━━━━━━━━━━━" >> .claude/cmux-ai/runs/gemini-runner.log
    Bash: echo "[$(date +%H:%M:%S)] 🏁 gemini-runner ALL DONE" >> .claude/cmux-ai/runs/gemini-runner.log
    SendMessage(
      to="team-lead",
      message="{결과 전체 요약}",
      summary="gemini-runner: DONE — {완료된 태스크 수}개 완료"
    )

    ## Fallback
    gemini CLI 실행 실패 시 → Claude가 직접 해당 태스크 수행 후 로그에 "[FALLBACK] Claude 직접 처리" 기록.
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
├── Agent(codex-runner, bg) = Claude 코디네이터
│   └── codex exec "task prompt" → 진짜 Codex가 코드 작업
│   └── 로그 기록 → SendMessage(summary="DONE")
├── Agent(gemini-runner, bg) = Claude 코디네이터
│   └── gemini -y -p "task prompt" → 진짜 Gemini가 디자인 작업
│   └── 로그 기록 → SendMessage(summary="DONE")
└── SendMessage 수신 → 결과 통합 (이벤트 기반)
```

---

## --live-mode

Claude가 cmux 명령어로 패널을 **직접 제어**하는 모드. 패널에 CLI 명령을 전송하고, 결과 파일을 Read로 확인하며, 에러 시 즉시 cmux send로 대응한다. .done 파일 폴링 없이 Claude가 능동적으로 오케스트레이션.

상세 실행 순서, 아키텍처, 비교표는 `references/live-mode.md` 참조.

---

## 설정 파일 우선순위

1. `.claude/cmux-ai-models.yaml` (프로젝트)
2. `config/models.yaml` (스킬 기본값)
