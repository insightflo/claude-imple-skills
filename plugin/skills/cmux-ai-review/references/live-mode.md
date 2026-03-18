## --live-mode

> 패널에서 실제 `claude -p` 프로세스가 직접 리뷰하는 모습이 보임.
> Stage 전환은 동일한 패널에 새 명령을 전송해서 이어받음.
> Stage 1 완료는 `.stage1.done` 파일 감지, Stage 2 완료는 `.stage2.done` 파일 감지.

### Live Mode 실행 순서

**Step 1: 프롬프트 파일 + 패널 생성**

```bash
mkdir -p .claude/cmux-ai/review
rm -f .claude/cmux-ai/review/*.done

# Stage 1 프롬프트 파일 작성
cat > .claude/cmux-ai/review/gemini-stage1-prompt.md << 'PROMPTEOF'
다음 대상을 {gemini_role} 관점에서 리뷰하세요.
대상: {review_target}

의견 전체를 .claude/cmux-ai/review/gemini-opinion.md 에 저장 후:
  echo "DONE" > .claude/cmux-ai/review/gemini-stage1.done
PROMPTEOF

cat > .claude/cmux-ai/review/codex-stage1-prompt.md << 'PROMPTEOF'
다음 대상을 {codex_role} 관점에서 리뷰하세요.
대상: {review_target}

의견 전체를 .claude/cmux-ai/review/codex-opinion.md 에 저장 후:
  echo "DONE" > .claude/cmux-ai/review/codex-stage1.done
PROMPTEOF

# 패널 생성
GEMINI_SURFACE=$(cmux new-split down 2>&1 | awk '{print $2}')
CODEX_SURFACE=$(cmux new-split right --surface $GEMINI_SURFACE 2>&1 | awk '{print $2}')

cmux set-status "review" "Stage 1: live opinions" --icon doc --color "#ff9500"
cmux set-progress 0.2 --label "Stage 1: live reviewers starting..."
```

**Step 2: Stage 1 — 패널에서 실제 AI CLI 직접 실행**

```bash
# Gemini 패널: 실제 gemini CLI 실행
cmux send --surface $GEMINI_SURFACE \
  "gemini -y -p \"\$(cat .claude/cmux-ai/review/gemini-stage1-prompt.md)\"
"

# Codex 패널: 실제 codex CLI 실행
cmux send --surface $CODEX_SURFACE \
  "codex exec \"\$(cat .claude/cmux-ai/review/codex-stage1-prompt.md)\"
"

# Stage 1 완료 대기 (5분 타임아웃)
TIMEOUT=300; ELAPSED=0
while true; do
  [ -f .claude/cmux-ai/review/gemini-stage1.done ] && \
  [ -f .claude/cmux-ai/review/codex-stage1.done ] && break
  sleep 5; ELAPSED=$((ELAPSED + 5))
  [ $ELAPSED -ge $TIMEOUT ] && { cmux notify --title "Stage 1 timeout" --body "직접 처리로 전환"; break; }
done

cmux set-status "review" "Stage 2: live rebuttal" --icon arrow.2.squarepath --color "#5856d6"
cmux set-progress 0.55 --label "Stage 2: cross-rebuttal..."
```

**Step 3: Stage 2 — 동일 패널에 반론 프롬프트 이어서 전송**

```bash
# 상대 의견을 포함한 Stage 2 프롬프트 작성
cat > .claude/cmux-ai/review/gemini-stage2-prompt.md << 'PROMPTEOF'
아래는 Codex의 리뷰 의견입니다. 이에 대한 반론을 작성하세요.

$(cat .claude/cmux-ai/review/codex-opinion.md)

반론 전체를 .claude/cmux-ai/review/gemini-rebuttal.md 에 저장 후:
  echo "DONE" > .claude/cmux-ai/review/gemini-stage2.done
PROMPTEOF

cat > .claude/cmux-ai/review/codex-stage2-prompt.md << 'PROMPTEOF'
아래는 Gemini의 리뷰 의견입니다. 이에 대한 반론을 작성하세요.

$(cat .claude/cmux-ai/review/gemini-opinion.md)

반론 전체를 .claude/cmux-ai/review/codex-rebuttal.md 에 저장 후:
  echo "DONE" > .claude/cmux-ai/review/codex-stage2.done
PROMPTEOF

# 동일 패널에 Stage 2 — 실제 AI CLI로 반론 실행
cmux send --surface $GEMINI_SURFACE \
  "gemini -y -p \"\$(cat .claude/cmux-ai/review/gemini-stage2-prompt.md)\"
"
cmux send --surface $CODEX_SURFACE \
  "codex exec \"\$(cat .claude/cmux-ai/review/codex-stage2-prompt.md)\"
"

# Stage 2 완료 대기 (5분 타임아웃)
TIMEOUT=300; ELAPSED=0
while true; do
  [ -f .claude/cmux-ai/review/gemini-stage2.done ] && \
  [ -f .claude/cmux-ai/review/codex-stage2.done ] && break
  sleep 5; ELAPSED=$((ELAPSED + 5))
  [ $ELAPSED -ge $TIMEOUT ] && { cmux notify --title "Stage 2 timeout" --body "직접 처리로 전환"; break; }
done
```

**Step 4: Stage 3 — Chairman 합성 (기본 모드 Step 5와 동일)**

```bash
cmux set-status "review" "Stage 3: chairman synthesis" --icon star --color "#34c759"
cmux set-progress 0.8 --label "Stage 3: synthesis..."
# 4개 파일 읽어 Score Card 작성 (기본 모드와 동일 로직)
```

### Live Mode 아키텍처

```
메인 Claude (Chairman/오케스트레이터)
├── Stage 1 프롬프트 파일 작성 → 패널에서 실제 AI CLI 직접 실행
│   ├── Gemini 패널: gemini -y -p "..."  ← 진짜 Gemini가 리뷰
│   └── Codex  패널: codex exec "..."    ← 진짜 Codex가 리뷰
│   ↓ .stage1.done 감지
├── Stage 2 프롬프트 파일 작성 → 동일 패널에 이어서 전송
│   ├── Gemini 패널: gemini -y -p "..."  ← 진짜 Gemini가 반론
│   └── Codex  패널: codex exec "..."    ← 진짜 Codex가 반론
│   ↓ .stage2.done 감지
└── Stage 3: Chairman Claude 합성 → Score Card
```

### 기본 모드 vs --live-mode 비교

| | 기본 모드 | --live-mode |
|--|--|--|
| **실제 사용 AI** | Claude 코디네이터가 gemini/codex CLI 호출 | 패널에서 gemini/codex CLI 직접 실행 |
| Stage 1/2 실행 | Background subagent | 패널에서 실제 CLI 프로세스 |
| Stage 전환 | SendMessage (이벤트) | 동일 패널에 새 명령 전송 |
| 시각화 | 로그 파일 tail -f | 에이전트가 직접 작업하는 모습 |
| 완료 감지 | SendMessage | .done 파일 폴링 (5분 타임아웃) |
| 개입 가능 여부 | 불가 | 패널 클릭 후 직접 조작 가능 |
