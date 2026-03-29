## --live-mode — cmux 직접 제어 실행

Claude가 cmux 패널에서 codex/gemini CLI를 인터랙티브 세션으로 띄우고,
프롬프트를 주입한 뒤, `cmux wait-for` 시그널로 완료를 감지하는 방식.

기본 모드(Background Agent + SendMessage)와 달리,
live-mode는 Agent 없이 Claude가 cmux 명령어로 직접 오케스트레이션한다.
패널에서 에이전트가 작업하는 모습이 사용자에게 실시간으로 보인다.

### CLI별 실행 옵션

| CLI | 실행 명령 | 프롬프트 제출 | 비고 |
|-----|----------|-------------|------|
| **Codex** | `codex --dangerously-bypass-approvals-and-sandbox` | `cmux send-key Return` | 가장 안정적. 문서 작성도 가능 |
| **Gemini** | `gemini -y -m gemini-3-flash-preview` | `cmux send-key Return` | API 400/429 빈번, 불안정 |
| **GLM** | `glm --dangerously-skip-permissions` | `cmux send-key Return` | API timeout 잦음, `/model`로 모델 변경 필요 |

> Codex interactive + cmux wait-for 조합이 가장 안정적이고 실용적.
> Gemini는 불안정, GLM은 느림. 코드 작업뿐 아니라 문서 작성도 Codex가 더 나았음.

### 프롬프트 전송: paste-buffer 사용

`cmux send`는 줄바꿈을 Enter(제출)로 해석해서 멀티라인 프롬프트가 잘린다.
**`cmux set-buffer` + `paste-buffer`**를 사용하면 줄바꿈 그대로 붙여넣기 가능:

```bash
# 1. 프롬프트를 buffer에 저장
cmux set-buffer --name codex-prompt "$(cat .claude/cmux-ai/runs/codex-prompt.md)"

# 2. 패널에 paste (줄바꿈이 Enter로 해석되지 않음)
cmux paste-buffer --name codex-prompt --surface $CDX

# 3. 명시적 Return으로 제출
sleep 1
cmux send-key --surface $CDX Return
```

> `cmux send`는 한 줄짜리 명령(CLI 실행 등)에만 쓰고,
> 멀티라인 프롬프트는 반드시 `paste-buffer`로 전송한다.

### 콜백: 스크립트 파일 방식

콜백 명령을 인라인으로 넣으면 Gemini가 "해석"해버리는 문제가 있다.
**스크립트 파일로 분리**하면 짧고 확실:

```bash
# 콜백 스크립트 생성
cat > .claude/cmux-ai/runs/callback-codex.sh << 'EOF'
cmux wait-for -S codex-done && cmux notify --title "Codex" --body "작업 완료"
EOF
chmod +x .claude/cmux-ai/runs/callback-codex.sh
```

프롬프트 끝에 한 줄 추가:
```
완료 후 반드시 bash .claude/cmux-ai/runs/callback-codex.sh 실행해.
```

### 실행 순서

**Step 1: 패널 생성 + CLI 실행**

```bash
mkdir -p .claude/cmux-ai/runs

CDX=$(cmux new-split right 2>&1 | awk '{print $2}')
GMN=$(cmux new-split down --surface $CDX 2>&1 | awk '{print $2}')

cmux send --surface $CDX "codex --dangerously-bypass-approvals-and-sandbox
"
cmux send --surface $GMN "gemini -y -m gemini-3-flash-preview
"

cmux rename-tab --surface $CDX "codex-runner"
cmux rename-tab --surface $GMN "gemini-runner"
```

**Step 2: Ready 확인**

```bash
sleep 5
cmux capture-pane --surface $CDX --lines 3
# codex: "gpt-5.4 high fast · NN% left" 확인
cmux capture-pane --surface $GMN --lines 3
# gemini: "Type your message" 확인
```

**Step 3: 콜백 스크립트 + 프롬프트 작성**

```bash
# 콜백 스크립트
cat > .claude/cmux-ai/runs/callback-codex.sh << 'EOF'
cmux wait-for -S codex-done && cmux notify --title "Codex" --body "작업 완료"
EOF
cat > .claude/cmux-ai/runs/callback-gemini.sh << 'EOF'
cmux wait-for -S gemini-done && cmux notify --title "Gemini" --body "작업 완료"
EOF
chmod +x .claude/cmux-ai/runs/callback-*.sh

# 프롬프트 파일 (콜백은 스크립트 실행 한 줄)
Write: .claude/cmux-ai/runs/codex-prompt.md
  {codex_tasks}
  완료 후 반드시 bash .claude/cmux-ai/runs/callback-codex.sh 실행해.

Write: .claude/cmux-ai/runs/gemini-prompt.md
  {gemini_tasks}
  완료 후 반드시 bash .claude/cmux-ai/runs/callback-gemini.sh 실행해.
```

**Step 4: paste-buffer로 프롬프트 전송**

```bash
cmux set-buffer --name cdx-p "$(cat .claude/cmux-ai/runs/codex-prompt.md)"
cmux paste-buffer --name cdx-p --surface $CDX
sleep 1
cmux send-key --surface $CDX Return

cmux set-buffer --name gmn-p "$(cat .claude/cmux-ai/runs/gemini-prompt.md)"
cmux paste-buffer --name gmn-p --surface $GMN
sleep 1
cmux send-key --surface $GMN Return
```

**Step 5: 완료 대기 (`cmux wait-for`)**

```bash
cmux wait-for codex-done --timeout 600 &
cmux wait-for gemini-done --timeout 600 &
```

**Step 6: 결과 확인**

```bash
cmux capture-pane --surface $CDX --scrollback --lines 30
cmux capture-pane --surface $GMN --scrollback --lines 30
```

### 에러 대응

```bash
# 패널 살아있는지 확인
cmux capture-pane --surface $CDX --lines 1 2>&1
# "Error: invalid_params: Surface is not a terminal" → 패널 닫힘

# 타임아웃 시 수동 확인
cmux capture-pane --surface $CDX --lines 10

# CLI 에러 시 → Ctrl+C → 대체 CLI
cmux send-key --surface $GMN ctrl+c
sleep 2
cmux send --surface $GMN "codex --dangerously-bypass-approvals-and-sandbox
"
```

### 시그널 네이밍

- `codex-done`, `gemini-done` — 기본 완료
- `{task-name}-done` — 특정 태스크 완료
- `cmux wait-for -S`: 시그널 **보내기** (worker)
- `cmux wait-for`: 시그널 **대기** (orchestrator)

### 아키텍처

```
Claude (오케스트레이터)
├── cmux new-split → 패널 생성
├── cmux send → CLI 실행 (한 줄 명령)
├── capture-pane → ready 확인
├── set-buffer + paste-buffer → 멀티라인 프롬프트 주입
├── send-key Return → 제출
├── cmux wait-for {signal} --timeout 600 → 백그라운드 대기
│
├── Worker (codex/gemini)
│   ├── 파일 읽기/쓰기 (자체 tool 사용)
│   ├── 작업 완료
│   └── bash callback.sh → cmux wait-for -S + notify
│
└── 시그널 수신 → capture-pane 결과 확인 → 통합
```

### 기본 모드 vs --live-mode 비교

| | 기본 모드 | --live-mode |
|--|--|--|
| 오케스트레이터 | Background Agent (코디네이터) | Claude가 cmux로 직접 |
| CLI 실행 | Agent 내부에서 Bash 호출 | cmux send → 인터랙티브 세션 |
| 프롬프트 전송 | Agent prompt 내장 | `paste-buffer` (줄바꿈 안전) |
| 콜백 | SendMessage | 스크립트 파일 (`bash callback.sh`) |
| 완료 감지 | SendMessage (이벤트) | `cmux wait-for` 시그널 (non-blocking) |
| 에러 대응 | Agent 내 Fallback | capture-pane → Ctrl+C → 대체 CLI |
| 시각화 | tail -f 로그 | 패널에서 CLI가 직접 작업 |
| 컨텍스트 유지 | 없음 | 인터랙티브 세션 유지 |
