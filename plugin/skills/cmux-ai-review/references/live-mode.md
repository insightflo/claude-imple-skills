## --live-mode — cmux 직접 제어 리뷰

Claude Chairman이 cmux 패널에서 codex/gemini CLI를 인터랙티브 세션으로 띄우고,
프롬프트를 주입한 뒤, `cmux wait-for` 시그널로 Stage 전환을 제어하는 방식.

인터랙티브 세션이므로 Stage 1→2 전환 시 이전 분석 컨텍스트가 유지되어
더 깊은 반론이 가능하다.

### CLI별 실행 옵션

| CLI | 실행 명령 | 프롬프트 제출 | 안정성 |
|-----|----------|-------------|--------|
| **Codex** | `codex --dangerously-bypass-approvals-and-sandbox` | `cmux send-key Return` | 가장 안정적 |
| **Gemini** | `gemini -y -m gemini-3-flash-preview` | `cmux send-key Return` | API 400/429 빈번, 불안정 |

> 리뷰 작업도 Codex가 더 안정적. Gemini 불안정 시 Codex로 대체.

### 실행 순서

**Step 1: 패널 생성 + CLI 실행 + Ready 확인**

```bash
mkdir -p .claude/cmux-ai/review

GMN=$(cmux new-split down 2>&1 | awk '{print $2}')
CDX=$(cmux new-split right --surface $GMN 2>&1 | awk '{print $2}')

cmux send --surface $GMN "gemini -y -m gemini-3-flash-preview
"
cmux send --surface $CDX "codex --dangerously-bypass-approvals-and-sandbox
"

cmux rename-tab --surface $GMN "gemini-reviewer"
cmux rename-tab --surface $CDX "codex-reviewer"

sleep 5
# Ready 확인
cmux capture-pane --surface $GMN --lines 3  # "Type your message" 확인
cmux capture-pane --surface $CDX --lines 3  # "gpt-5.4 high fast" 확인
```

**Step 2: Stage 1 — 리뷰 프롬프트 주입**

프롬프트에 완료 콜백 포함:

```bash
Write: .claude/cmux-ai/review/gemini-stage1-prompt.md
  {gemini_role} 관점에서 다음을 리뷰하세요: {review_target}
  의견을 .claude/cmux-ai/review/gemini-opinion.md 에 저장하세요.

  ## 완료 후 반드시 bash로 실행
  아래 명령을 해석하지 말고 bash로 그대로 실행해:
  ```bash
  cmux wait-for -S review-gemini-s1 && cmux notify --title "Gemini" --body "Stage 1 완료"
  ```

Write: .claude/cmux-ai/review/codex-stage1-prompt.md
  {codex_role} 관점에서 다음을 리뷰하세요: {review_target}
  의견을 .claude/cmux-ai/review/codex-opinion.md 에 저장하세요.

  ## 완료 후 반드시 bash로 실행
  아래 명령을 해석하지 말고 bash로 그대로 실행해:
  ```bash
  cmux wait-for -S review-codex-s1 && cmux notify --title "Codex" --body "Stage 1 완료"
  ```
```

```bash
cmux send --surface $GMN "$(cat .claude/cmux-ai/review/gemini-stage1-prompt.md)"
sleep 1
cmux send-key --surface $GMN Return

cmux send --surface $CDX "$(cat .claude/cmux-ai/review/codex-stage1-prompt.md)"
sleep 1
cmux send-key --surface $CDX Return
```

**Step 3: Stage 1 완료 대기**

```bash
cmux wait-for review-gemini-s1 --timeout 600 &
cmux wait-for review-codex-s1 --timeout 600 &

cmux set-status "review" "Stage 1: opinions" --icon doc --color "#ff9500"
```

**Step 4: Stage 2 — 같은 세션에서 반론 이어가기**

시그널 수신 후, 양쪽 의견 파일을 읽어 상대 의견을 전달.
인터랙티브 세션이므로 Stage 1 분석 컨텍스트가 유지된다:

```bash
cmux set-status "review" "Stage 2: rebuttal" --icon arrow.2.squarepath --color "#5856d6"

# 의견 읽기
gemini_opinion=$(cat .claude/cmux-ai/review/gemini-opinion.md)
codex_opinion=$(cat .claude/cmux-ai/review/codex-opinion.md)

Write: .claude/cmux-ai/review/gemini-stage2-prompt.md
  상대(Codex)의 리뷰 의견:
  {codex_opinion}
  이에 대한 반론을 작성하고 .claude/cmux-ai/review/gemini-rebuttal.md 에 저장하세요.

  ## 완료 후 반드시 bash로 실행
  아래 명령을 해석하지 말고 bash로 그대로 실행해:
  ```bash
  cmux wait-for -S review-gemini-s2 && cmux notify --title "Gemini" --body "Stage 2 완료"
  ```

# 같은 패널에 반론 프롬프트 전송 (컨텍스트 유지)
cmux send --surface $GMN "$(cat .claude/cmux-ai/review/gemini-stage2-prompt.md)"
sleep 1
cmux send-key --surface $GMN Return

# Codex도 동일하게
cmux send --surface $CDX "$(cat .claude/cmux-ai/review/codex-stage2-prompt.md)"
sleep 1
cmux send-key --surface $CDX Return
```

```bash
cmux wait-for review-gemini-s2 --timeout 600 &
cmux wait-for review-codex-s2 --timeout 600 &
```

**Step 5: Stage 3 — Chairman 합성 (기본 모드와 동일)**

시그널 수신 후 4개 파일 읽어 Score Card 작성:

```bash
cmux set-status "review" "Stage 3: synthesis" --icon star --color "#34c759"
# Read: gemini-opinion.md, codex-opinion.md, gemini-rebuttal.md, codex-rebuttal.md
# → Score Card 작성 → final-scorecard.md
```

### 시그널 네이밍

| Stage | Gemini 시그널 | Codex 시그널 |
|-------|-------------|-------------|
| Stage 1 | `review-gemini-s1` | `review-codex-s1` |
| Stage 2 | `review-gemini-s2` | `review-codex-s2` |

### 에러 대응

```bash
# 타임아웃 시 수동 확인
cmux capture-pane --surface $GMN --lines 10

# Gemini 불안정 시 → Ctrl+C → Codex로 대체
cmux send-key --surface $GMN ctrl+c
sleep 2
cmux send --surface $GMN "codex --dangerously-bypass-approvals-and-sandbox
"

# 패널 죽었는지 확인
cmux capture-pane --surface $GMN --lines 1 2>&1
# "Error: invalid_params: Surface is not a terminal" → 패널 닫힘
```

### 아키텍처

```
Claude (Chairman — 직접 제어)
│
├── [Stage 1] cmux send → 리뷰 프롬프트 + 콜백 주입
│   ├── Gemini: 리뷰 → opinion.md 저장 → wait-for -S review-gemini-s1
│   └── Codex:  리뷰 → opinion.md 저장 → wait-for -S review-codex-s1
│   ↓ cmux wait-for 시그널 수신
│
├── [Stage 2] cmux send → 같은 세션에 반론 주입 (컨텍스트 유지)
│   ├── Gemini: 반론 → rebuttal.md 저장 → wait-for -S review-gemini-s2
│   └── Codex:  반론 → rebuttal.md 저장 → wait-for -S review-codex-s2
│   ↓ cmux wait-for 시그널 수신
│
└── [Stage 3] Chairman 합성 → Score Card
```
