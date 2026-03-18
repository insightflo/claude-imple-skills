## --live-mode

> Claude Code의 `teammateMode=tmux`처럼 에이전트를 패널에서 **직접** 실행.
> 패널에서 `claude -p` 프로세스가 실제로 작업하는 모습이 보임.
> 완료 감지는 `.done` 파일 폴링 (5분 타임아웃).

### 언제 사용?

- 에이전트가 실제로 작업하는 것을 눈으로 확인하고 싶을 때
- 패널에서 직접 개입(Ctrl+C, 명령 추가 등)이 필요할 때

### Live Mode 실행 순서

**Step 1: 프롬프트 파일 + 패널 생성**

```bash
mkdir -p .claude/cmux-ai/runs
rm -f .claude/cmux-ai/runs/codex-runner.done .claude/cmux-ai/runs/gemini-runner.done

# 각 에이전트 프롬프트를 파일로 작성 (따옴표 이스케이프 없이 전달)
cat > .claude/cmux-ai/runs/codex-prompt.md << 'PROMPTEOF'
{codex_tasks_list}

완료 후 반드시 실행:
  echo "DONE" > .claude/cmux-ai/runs/codex-runner.done
PROMPTEOF

cat > .claude/cmux-ai/runs/gemini-prompt.md << 'PROMPTEOF'
{gemini_tasks_list}

완료 후 반드시 실행:
  echo "DONE" > .claude/cmux-ai/runs/gemini-runner.done
PROMPTEOF

# 패널 생성
CODEX_SURFACE=$(cmux new-split right 2>&1 | awk '{print $2}')
GEMINI_SURFACE=$(cmux new-split down --surface $CODEX_SURFACE 2>&1 | awk '{print $2}')

cmux set-status "codex" "live" --icon gear --color "#007aff"
cmux set-status "gemini" "live" --icon brush --color "#5856d6"
cmux set-progress 0.2 --label "Live agents starting..."
```

**Step 2: 패널에서 실제 AI CLI 직접 실행**

```bash
# Codex 패널: 실제 codex CLI 실행 — 코드 작업
cmux send --surface $CODEX_SURFACE \
  "codex exec \"\$(cat .claude/cmux-ai/runs/codex-prompt.md)\"
"

# Gemini 패널: 실제 gemini CLI 실행 — 디자인/UI 작업
cmux send --surface $GEMINI_SURFACE \
  "gemini -y -p \"\$(cat .claude/cmux-ai/runs/gemini-prompt.md)\"
"

cmux set-progress 0.4 --label "Live agents running (watch panels)..."
```

**Step 3: 완료 대기 (파일 폴링, 5분 타임아웃)**

```bash
TIMEOUT=300
ELAPSED=0
while true; do
  [ -f .claude/cmux-ai/runs/codex-runner.done ] && \
  [ -f .claude/cmux-ai/runs/gemini-runner.done ] && break
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    cmux notify --title "cmux-ai-run timeout" --body "5분 초과 — Claude가 직접 처리합니다"
    break
  fi
done
cmux set-progress 0.9 --label "Integrating results..."
```

**Step 4: 결과 통합 (기본 모드 Step 5와 동일)**

패널의 에이전트가 출력한 파일/변경사항을 검토하고 프로젝트에 반영.

```bash
cmux set-progress 1.0 --label "Done"
cmux log --level success -- "cmux-ai-run (live): All tasks complete"
cmux notify --title "cmux-ai-run Complete" --body "Live agents finished"
cmux clear-status "codex"
cmux clear-status "gemini"
```

### Live Mode 아키텍처

```
메인 Claude (오케스트레이터)
├── 프롬프트 파일 작성 → 패널에서 실제 AI CLI 직접 실행
├── cmux new-split → 이기종 AI가 패널에서 동시 작업
├── codex 패널: codex exec "..."  ← 진짜 Codex가 코드 작업
├── gemini 패널: gemini -y -p "..." ← 진짜 Gemini가 디자인 작업
└── .done 파일 감지 (5분 타임아웃) → Claude가 결과 통합
```

### 기본 모드 vs --live-mode 비교

| | 기본 모드 | --live-mode |
|--|--|--|
| **실제 사용 AI** | Claude 코디네이터가 codex/gemini CLI 호출 | 패널에서 codex/gemini CLI 직접 실행 |
| 에이전트 실행 | Background subagent | 패널에서 실제 CLI 프로세스 |
| 시각화 | 로그 파일 tail -f | 에이전트가 직접 작업하는 모습 |
