---
name: cmux-ai-review
description: cmux 창 분할 기반 멀티-AI 합의 리뷰 엔진. 동일 워크스페이스에서 Gemini/Codex 패널을 나란히 분할해 3-Stage 파이프라인(의견 → 반론 → 합성)을 진짜 병렬로 실행합니다. multi-ai-review의 순차 실행 대신 두 AI가 동시에 리뷰하는 것을 실시간으로 볼 수 있음. "/cmux-ai-review", "cmux 코드 리뷰", "AI 패널 리뷰", "병렬 리뷰" 등 cmux 환경에서 여러 AI의 동시 리뷰가 필요한 요청이라면 반드시 이 스킬을 사용하세요.
triggers:
  - /cmux-ai-review
  - cmux 리뷰
  - cmux 코드 리뷰
  - 패널 리뷰
  - 병렬 AI 리뷰
version: 1.2.0
---

# /cmux-ai-review — cmux 창 분할 병렬 AI 리뷰

> **multi-ai-review와의 차이**: CLI 순차 호출 대신 cmux 패널 분할로 Stage 1을 진짜 동시 실행.
> 패널에서 `tail -f`로 Gemini/Codex가 리뷰하는 과정을 실시간으로 볼 수 있음.
>
> **완료 감지**: Stage 전환은 Agent Teams API (SendMessage)로 구동 — 파일 폴링 없음.

---

## 패널 레이아웃

```
┌────────────────────────────────────────┐
│  Claude (Chairman) — 현재 패널         │
│  오케스트레이션 + 최종 합성             │
├───────────────────┬────────────────────┤
│  Gemini 패널      │  Codex 패널        │
│  tail -f          │  tail -f           │
│  gemini-review.log│  codex-review.log  │
└───────────────────┴────────────────────┘
```

---

## Prerequisites

```bash
cmux ping || { echo "cmux 필요"; exit 1; }
CONFIG="${PROJECT_ROOT}/.claude/cmux-ai-models.yaml"
[ ! -f "$CONFIG" ] && CONFIG="${CLAUDE_PLUGIN_ROOT}/skills/cmux-ai-review/config/models.yaml"
```

---

## 모델 설정

기본값 (`config/models.yaml`):
- **Gemini**: `gemini-3.1-pro-preview` (Perspective A)
- **Codex**: `gpt-5.4`, `effort=high` (Perspective B)
- **Claude**: `opus` (Chairman)

프로젝트별 오버라이드: `.claude/cmux-ai-models.yaml`

---

## 3-Stage Pipeline

### Stage 1: 초기 의견 수집 (진짜 병렬)

```
gemini-reviewer 에이전트 ──→ 리뷰 + 로그 기록 ──→ SendMessage(summary="opinion-ready")
codex-reviewer 에이전트  ──→ 리뷰 + 로그 기록 ──→ SendMessage(summary="opinion-ready")
                    ↑ 동시 실행 / 패널에서 tail -f로 실시간 확인
```

### Stage 2: 상호 반론 (교차 리뷰)

```
SendMessage 수신 후 즉시 전환
gemini-reviewer ← Codex 의견 전달 → 반론 → SendMessage(summary="rebuttal-ready")
codex-reviewer  ← Gemini 의견 전달 → 반론 → SendMessage(summary="rebuttal-ready")
```

### Stage 3: Chairman 합성

```
Claude ─── 양쪽 의견 + 반론 분석 ──→ Score Card + 최종 판정
```

---

## 실행 순서

### Step 1: 도메인 감지

요청 텍스트에서 도메인을 자동 감지:

| 키워드 | 도메인 | Gemini 역할 | Codex 역할 |
|--------|--------|-------------|------------|
| review, PR, code, merge | code-review | 아키텍처/가독성 | 기술/보안/성능 |
| market, stocks, macro | market-regime | 거시/뉴스 | 퀀트/지표 |
| investment, valuation | investment | 시장/전략 | 재무/리스크 |
| risk, security, danger | risk-assessment | 외부위협 | 내부취약점 |
| gate, milestone, Go/No-Go | project-gate | 이해관계자/범위 | 일정/리소스 |

감지 실패 시 `default` 프리셋 적용.

### Step 2: 로그 파일 + Agent Teams 세션 + cmux 패널 생성

```bash
# 로그 파일 먼저 생성 (tail -f가 즉시 열 수 있도록)
mkdir -p .claude/cmux-ai/review
touch .claude/cmux-ai/review/gemini-reviewer.log
touch .claude/cmux-ai/review/codex-reviewer.log
```

```
# Agent Teams 세션 생성
TeamCreate(name="cmux-ai-review-{project}-{timestamp}", description="Parallel AI review pipeline")
TaskCreate(team_name=..., subject="stage1-opinions", description="Collect parallel opinions")
TaskCreate(team_name=..., subject="stage2-rebuttals", description="Cross-rebuttal exchange")
```

```bash
# 패널 생성 + 즉시 tail -f 실행
GEMINI_SURFACE=$(cmux new-split down --json | jq -r '.surface_id')
CODEX_SURFACE=$(cmux new-split right --surface $GEMINI_SURFACE --json | jq -r '.surface_id')

cmux send-surface --surface $GEMINI_SURFACE \
  "tail -f .claude/cmux-ai/review/gemini-reviewer.log\n"
cmux send-surface --surface $CODEX_SURFACE \
  "tail -f .claude/cmux-ai/review/codex-reviewer.log\n"

cmux set-status "review" "Stage 1: collecting opinions" --icon doc --color "#ff9500"
cmux set-progress 0.2 --label "Stage 1: starting reviewers..."
```

### Step 3: Stage 1 — 병렬 의견 수집

```
Agent(
  subagent_type="builder",
  team_name="cmux-ai-review-{project}-{timestamp}",
  name="gemini-reviewer",
  run_in_background=true,
  prompt="""
    다음 대상을 {gemini_role} 관점에서 리뷰하세요.
    대상: {review_target}

    진행할 때마다 .claude/cmux-ai/review/gemini-reviewer.log 에 기록 (append):
      echo "[Stage1][$(date +%H:%M:%S)] 리뷰 시작" >> .claude/cmux-ai/review/gemini-reviewer.log
      echo "[Stage1][$(date +%H:%M:%S)] {발견 내용}" >> .claude/cmux-ai/review/gemini-reviewer.log

    완료 후:
      - 의견 전체를 .claude/cmux-ai/review/gemini-opinion.md 에 저장
      echo "[Stage1][$(date +%H:%M:%S)] ✅ Opinion saved" >> .claude/cmux-ai/review/gemini-reviewer.log
      SendMessage(
        to="team-lead",
        message="{의견 전체 내용}",
        summary="gemini-reviewer: Stage1 DONE — opinion ready"
      )

    Stage 2 SendMessage 수신 대기. 수신 시 {codex_opinion}을 받아:
      echo "[Stage2][$(date +%H:%M:%S)] Rebuttal 시작" >> .claude/cmux-ai/review/gemini-reviewer.log
      echo "[Stage2][$(date +%H:%M:%S)] {반론 내용}" >> .claude/cmux-ai/review/gemini-reviewer.log
      반론을 .claude/cmux-ai/review/gemini-rebuttal.md 에 저장
      echo "[Stage2][$(date +%H:%M:%S)] ✅ Rebuttal saved" >> .claude/cmux-ai/review/gemini-reviewer.log
      SendMessage(
        to="team-lead",
        message="{반론 전체 내용}",
        summary="gemini-reviewer: Stage2 DONE — rebuttal ready"
      )
  """
)

Agent(
  subagent_type="builder",
  team_name="cmux-ai-review-{project}-{timestamp}",
  name="codex-reviewer",
  run_in_background=true,
  prompt="""
    다음 대상을 {codex_role} 관점에서 리뷰하세요.
    대상: {review_target}

    진행할 때마다 .claude/cmux-ai/review/codex-reviewer.log 에 기록 (append):
      echo "[Stage1][$(date +%H:%M:%S)] 리뷰 시작" >> .claude/cmux-ai/review/codex-reviewer.log
      echo "[Stage1][$(date +%H:%M:%S)] {발견 내용}" >> .claude/cmux-ai/review/codex-reviewer.log

    완료 후:
      - 의견 전체를 .claude/cmux-ai/review/codex-opinion.md 에 저장
      echo "[Stage1][$(date +%H:%M:%S)] ✅ Opinion saved" >> .claude/cmux-ai/review/codex-reviewer.log
      SendMessage(
        to="team-lead",
        message="{의견 전체 내용}",
        summary="codex-reviewer: Stage1 DONE — opinion ready"
      )

    Stage 2 SendMessage 수신 대기. 수신 시 {gemini_opinion}을 받아:
      echo "[Stage2][$(date +%H:%M:%S)] Rebuttal 시작" >> .claude/cmux-ai/review/codex-reviewer.log
      echo "[Stage2][$(date +%H:%M:%S)] {반론 내용}" >> .claude/cmux-ai/review/codex-reviewer.log
      반론을 .claude/cmux-ai/review/codex-rebuttal.md 에 저장
      echo "[Stage2][$(date +%H:%M:%S)] ✅ Rebuttal saved" >> .claude/cmux-ai/review/codex-reviewer.log
      SendMessage(
        to="team-lead",
        message="{반론 전체 내용}",
        summary="codex-reviewer: Stage2 DONE — rebuttal ready"
      )
  """
)
```

```bash
cmux set-progress 0.35 --label "Stage 1: opinions in progress (see panels)..."
```

### Step 4: Stage 2 — 상호 반론 (이벤트 기반 전환)

두 `SendMessage(summary="...Stage1 DONE")` 수신 후 즉시 Stage 2 시작:

```bash
cmux set-status "review" "Stage 2: cross-rebuttal" --icon arrow.2.squarepath --color "#5856d6"
cmux set-progress 0.55 --label "Stage 2: cross-rebuttal (see panels)..."
```

각 에이전트에 상대 의견 전달 (에이전트는 위 프롬프트에서 대기 중):

```
SendMessage(
  to="gemini-reviewer",
  message="{codex_opinion 전체}",
  summary="Stage2: here is Codex opinion, write rebuttal"
)
SendMessage(
  to="codex-reviewer",
  message="{gemini_opinion 전체}",
  summary="Stage2: here is Gemini opinion, write rebuttal"
)
```

두 `SendMessage(summary="...Stage2 DONE")` 수신 대기.

### Step 5: Stage 3 — Chairman 합성 (Claude)

```bash
cmux set-status "review" "Stage 3: chairman synthesis" --icon star --color "#34c759"
cmux set-progress 0.8 --label "Stage 3: synthesis..."
```

4개 파일 읽어 Score Card 작성:

```
gemini_opinion  = read(".claude/cmux-ai/review/gemini-opinion.md")
codex_opinion   = read(".claude/cmux-ai/review/codex-opinion.md")
gemini_rebuttal = read(".claude/cmux-ai/review/gemini-rebuttal.md")
codex_rebuttal  = read(".claude/cmux-ai/review/codex-rebuttal.md")
```

Chairman 합성 규칙:
- 점수 차이 ≥ 15 → 증거 검증 후 결정 (평균 금지)
- code-review 도메인 → Codex 의견 2배 가중 (파일:라인 인용 시)
- 미해결 쟁점 → 추가 라운드 (최대 2회, Step 3부터 재실행)

Score Card 형식:

```
## Score Card — {domain} Review
- Overall Grade: A/B/C/D/F
- Score: {N}/100

| Dimension    | Score | Key Finding |
|-------------|-------|-------------|
| Security     |  /25  | ...         |
| Performance  |  /20  | ...         |
| Correctness  |  /20  | ...         |
| Maintain.    |  /25  | ...         |
| Style        |  /10  | ...         |

## Critical Issues
- [Critical] {issue}

## Recommendations
1. {recommendation}
```

결과를 `.claude/cmux-ai/review/final-scorecard.md`에 저장.

### Step 6: 완료 + 패널 정리

```bash
cmux set-progress 1.0 --label "Done"
cmux set-status "review" "complete" --icon checkmark --color "#34c759"
cmux log --level success -- "cmux-ai-review: {grade} ({score}/100)"
cmux notify --title "Review Complete" --body "{grade}: {top finding}"
```

---

## 추가 라운드 조건

Chairman이 아래 조건 중 하나 해당 시 Step 3부터 재실행:
- 두 AI 점수 차이 ≥ 15점
- Critical 이슈가 한쪽만 언급
- 핵심 사실 관계 불일치

최대 2회까지 반복.

---

## 아키텍처 요약

```
메인 Claude (Chairman/오케스트레이터)
├── 로그 파일 생성 → cmux 패널에서 tail -f (실시간 가시화)
├── TeamCreate → 통신 채널 수립
│
├── [Stage 1] Agent(gemini-reviewer, bg) + Agent(codex-reviewer, bg) — 동시 시작
│            각자 로그 기록 → SendMessage(summary="Stage1 DONE")
│            ↓ 두 SendMessage 수신 후 즉시 Stage 2
│
├── [Stage 2] SendMessage(gemini-reviewer, {codex_opinion})
│            SendMessage(codex-reviewer, {gemini_opinion})
│            각자 반론 + 로그 기록 → SendMessage(summary="Stage2 DONE")
│            ↓ 두 SendMessage 수신 후 즉시 Stage 3
│
└── [Stage 3] Chairman 합성 → Score Card 출력
```

---

## Fallback

| 상황 | 동작 |
|------|------|
| `gemini` CLI 없음 | Gemini 패널 대신 Claude가 Perspective A 담당 |
| `codex` CLI 없음 | Codex 패널 대신 Claude가 Perspective B 담당 |
| cmux 없음 | `/multi-ai-review` 사용 권장 |
| Agent 무응답 (5분) | Claude가 직접 해당 역할 수행 |

---

## 출력 파일 구조

```
.claude/cmux-ai/review/
├── gemini-reviewer.log    # Gemini 실시간 로그 (패널 표시)
├── codex-reviewer.log     # Codex 실시간 로그 (패널 표시)
├── gemini-opinion.md      # Stage 1 Gemini
├── codex-opinion.md       # Stage 1 Codex
├── gemini-rebuttal.md     # Stage 2 Gemini
├── codex-rebuttal.md      # Stage 2 Codex
└── final-scorecard.md     # Stage 3 결과
```
