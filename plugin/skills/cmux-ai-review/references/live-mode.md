## --live-mode — cmux 직접 제어 리뷰

Claude Chairman이 cmux 패널에서 gemini/codex CLI를 직접 실행하고,
`capture-pane`으로 결과를 확인하며, Stage 전환도 cmux send로 직접 수행하는 대화형 리뷰.

### CLI별 주의사항

| CLI | 원샷 명령 | 인터랙티브 실행 | 프롬프트 제출 | 기본 모델 |
|-----|----------|---------------|-------------|----------|
| codex | `codex exec "prompt"` | `codex` | **Enter 2번** | gpt-5.4 |
| gemini | `gemini -y -m gemini-3-flash-preview -p "prompt"` | `gemini -y -m gemini-3-flash-preview` | Enter 1번 | gemini-3-flash-preview |

> gemini는 `gemini-3-flash-preview` 모델을 사용한다. `gemini-3.1-pro-preview`는 용량 부족(429)이 빈번하다.

### 두 가지 실행 방식

Claude가 리뷰 특성을 보고 판단해서 선택한다:

- **원샷**: 단순 코드 리뷰, 정형화된 체크리스트
- **인터랙티브**: 복잡한 아키텍처 리뷰, 시장 분석, 투자 실사 등 탐색적 분석.
  특히 Stage 1→2 전환 시 이전 분석 컨텍스트가 유지되어 더 깊은 반론이 가능.

### 원샷 실행 순서

**Step 1: 패널 생성 + Stage 1 전송**

```bash
mkdir -p .claude/cmux-ai/review

GEMINI_SURFACE=$(cmux new-split down 2>&1 | awk '{print $2}')
CODEX_SURFACE=$(cmux new-split right --surface $GEMINI_SURFACE 2>&1 | awk '{print $2}')

cmux send --surface $GEMINI_SURFACE \
  "gemini -y -m gemini-3-flash-preview -p \"\$(cat .claude/cmux-ai/review/gemini-stage1-prompt.md)\" > .claude/cmux-ai/review/gemini-opinion.md 2>&1; echo __EXIT_\$?__ >> .claude/cmux-ai/review/gemini-opinion.md
"
cmux send --surface $CODEX_SURFACE \
  "codex exec \"\$(cat .claude/cmux-ai/review/codex-stage1-prompt.md)\" > .claude/cmux-ai/review/codex-opinion.md 2>&1; echo __EXIT_\$?__ >> .claude/cmux-ai/review/codex-opinion.md
"
```

**Step 2: Stage 1 결과 확인 → Stage 2 전송**

```
Read(".claude/cmux-ai/review/gemini-opinion.md")  # __EXIT_0__ 확인
Read(".claude/cmux-ai/review/codex-opinion.md")    # __EXIT_0__ 확인
```

상대 의견을 포함한 반론 프롬프트를 동일 패널에 전송:

```bash
cmux send --surface $GEMINI_SURFACE \
  "gemini -y -m gemini-3-flash-preview -p \"\$(cat .claude/cmux-ai/review/gemini-stage2-prompt.md)\" > .claude/cmux-ai/review/gemini-rebuttal.md 2>&1; echo __EXIT_\$?__ >> .claude/cmux-ai/review/gemini-rebuttal.md
"
```

**Step 3: Stage 3 — Chairman 합성 (기본 모드와 동일)**

### 인터랙티브 실행 순서

**Step 1: 패널에서 CLI 인터랙티브 모드 실행**

```bash
GEMINI_SURFACE=$(cmux new-split down 2>&1 | awk '{print $2}')
CODEX_SURFACE=$(cmux new-split right --surface $GEMINI_SURFACE 2>&1 | awk '{print $2}')

cmux send --surface $GEMINI_SURFACE "gemini -y -m gemini-3-flash-preview
"
cmux send --surface $CODEX_SURFACE "codex
"
# CLI 초기화 대기 (8초)
```

**Step 2: Stage 1 — 리뷰 질문 입력**

```bash
# gemini: Enter 1번
cmux send --surface $GEMINI_SURFACE "{gemini_role} 관점에서 리뷰해줘: {review_target}
"

# codex: Enter 2번
cmux send --surface $CODEX_SURFACE "{codex_role} 관점에서 리뷰해줘: {review_target}"
cmux send-key --surface $CODEX_SURFACE enter
cmux send-key --surface $CODEX_SURFACE enter
```

**Step 3: 결과 확인 (`capture-pane`)**

```bash
cmux capture-pane --surface $GEMINI_SURFACE | tail -20
cmux capture-pane --surface $CODEX_SURFACE | tail -20
```

**Step 4: Stage 2 — 같은 세션에서 반론 이어가기**

인터랙티브의 강점: Stage 1 분석 컨텍스트가 유지된 상태에서 반론.

```bash
# gemini
cmux send --surface $GEMINI_SURFACE "상대(Codex)가 이렇게 말했어:
{codex_opinion}
반론을 작성해줘.
"

# codex (Enter 2번)
cmux send --surface $CODEX_SURFACE "상대(Gemini)가 이렇게 말했어:
{gemini_opinion}
반론을 작성해줘."
cmux send-key --surface $CODEX_SURFACE enter
cmux send-key --surface $CODEX_SURFACE enter
```

**Step 5: 결과 확인 + 종료 + Stage 3 합성**

```bash
cmux capture-pane --surface $GEMINI_SURFACE | tail -30
cmux capture-pane --surface $CODEX_SURFACE | tail -30

cmux send --surface $GEMINI_SURFACE "/exit
"
cmux send --surface $CODEX_SURFACE "/exit
"
# Chairman이 결과를 합성 → Score Card
```

### 에러 대응 (공통)

```bash
cmux capture-pane --surface $SURFACE | grep -i "error\|429\|fail"
cmux send-key --surface $SURFACE ctrl+c
cmux send --surface $SURFACE "codex exec ..." # 대체 CLI
```

### 아키텍처

```
메인 Claude (Chairman — 직접 제어)
│
├── [판단] 리뷰 특성에 따라 원샷/인터랙티브 선택
│
├── 원샷 흐름:
│   ├── [Stage 1] cmux send → CLI 원샷 (opinion → 파일) → Read 확인
│   ├── [Stage 2] cmux send → CLI 원샷 (rebuttal → 파일) → Read 확인
│   └── [Stage 3] Chairman 합성
│
├── 인터랙티브 흐름:
│   ├── [Stage 1] CLI 띄움 → 프롬프트 (codex: Enter 2번) → capture-pane 확인
│   ├── [Stage 2] 같은 세션에 반론 질문 (컨텍스트 유지) → capture-pane 확인
│   └── [Stage 3] Chairman 합성
│
└── 에러 → capture-pane 확인 → Ctrl+C → 대체 CLI 전송
```
