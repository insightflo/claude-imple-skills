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
| **Gemini** | `gemini -y -m gemini-3-flash-preview` | `cmux send-key Return` | API 400/429 에러 빈번, 불안정 |
| **GLM** | `glm --dangerously-skip-permissions` | `cmux send-key Return` | API timeout 잦음, `/model`로 모델 변경 필요 |

> Codex interactive + cmux wait-for 조합이 가장 안정적이고 실용적.
> Gemini는 불안정, GLM은 느림. 코드 작업뿐 아니라 문서 작성도 Codex가 더 나았음.

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

CLI가 프롬프트 입력 가능 상태인지 `capture-pane`으로 확인:

```bash
sleep 5
cmux capture-pane --surface $CDX --lines 3
# codex: "gpt-5.4 high fast · NN% left" 확인
cmux capture-pane --surface $GMN --lines 3
# gemini: "Type your message" 확인
```

**Step 3: 프롬프트 주입**

프롬프트 파일을 작성하고 패널에 전송. 완료 콜백을 반드시 포함:

```bash
# 프롬프트 파일에 콜백 포함
Write: .claude/cmux-ai/runs/codex-prompt.md
  {codex_tasks}

  ## 완료 후 반드시 bash로 실행
  작업이 모두 끝나면, 아래 명령을 해석하지 말고 bash로 그대로 실행해:
  ```bash
  cmux wait-for -S codex-done && cmux notify --title "Codex" --body "작업 완료"
  ```

Write: .claude/cmux-ai/runs/gemini-prompt.md
  {gemini_tasks}

  ## 완료 후 반드시 bash로 실행
  작업이 모두 끝나면, 아래 명령을 해석하지 말고 bash로 그대로 실행해:
  ```bash
  cmux wait-for -S gemini-done && cmux notify --title "Gemini" --body "작업 완료"
  ```
```

```bash
# 패널에 전송 + 명시적 Return
cmux send --surface $CDX "$(cat .claude/cmux-ai/runs/codex-prompt.md)"
sleep 1
cmux send-key --surface $CDX Return

cmux send --surface $GMN "$(cat .claude/cmux-ai/runs/gemini-prompt.md)"
sleep 1
cmux send-key --surface $GMN Return
```

> `cmux send`의 마지막 `\n`이 제출 트리거로 안 먹히는 CLI가 있다.
> `cmux send-key Return`을 명시적으로 보내는 게 안전.

**Step 4: 완료 대기 (`cmux wait-for`)**

```bash
# 백그라운드로 시그널 대기 (non-blocking)
cmux wait-for codex-done --timeout 600 &
cmux wait-for gemini-done --timeout 600 &

cmux set-progress 0.4 --label "Live agents running..."
```

- Worker가 작업 완료 시 `cmux wait-for -S codex-done` 실행 → 시그널 발송
- Claude는 시그널 수신 시 자동으로 다음 단계 진행
- 타임아웃 시 `capture-pane`으로 수동 확인

**Step 5: 결과 확인**

```bash
cmux capture-pane --surface $CDX --scrollback --lines 30
cmux capture-pane --surface $GMN --scrollback --lines 30
```

### 에러 대응

```bash
# 1. 패널이 살아있는지 확인
cmux capture-pane --surface $CDX --lines 1 2>&1
# "Error: invalid_params: Surface is not a terminal" → 패널 닫힘

# 2. 타임아웃 시 수동 확인
cmux capture-pane --surface $CDX --lines 10

# 3. CLI 에러 시 → 프로세스 중단 후 대체 CLI
cmux send-key --surface $GMN ctrl+c
sleep 2
cmux send --surface $GMN "codex --dangerously-bypass-approvals-and-sandbox
"
# → Gemini 불안정 시 같은 패널에서 Codex로 대체
```

### 시그널 네이밍 컨벤션

- `codex-done`, `gemini-done` — 기본 완료
- `{task-name}-done` — 특정 태스크 완료
- `cmux wait-for -S`: 시그널 **보내기** (worker)
- `cmux wait-for`: 시그널 **대기** (orchestrator)

### 아키텍처

```
Claude (오케스트레이터)
├── cmux new-split → 패널 생성
├── cmux send "codex --dangerously-..." → CLI 실행
├── capture-pane → ready 확인
├── cmux send "프롬프트 + 콜백" + send-key Return → 작업 주입
├── cmux wait-for {signal} --timeout 600 → 백그라운드 대기 (non-blocking)
│
├── Worker (codex/gemini)
│   ├── 파일 읽기/쓰기 (자체 tool 사용)
│   ├── 작업 완료
│   └── cmux wait-for -S {signal} + cmux notify → 완료 시그널
│
└── 시그널 수신 → capture-pane 결과 확인 → 통합
```

### 기본 모드 vs --live-mode 비교

| | 기본 모드 | --live-mode |
|--|--|--|
| 오케스트레이터 | Background Agent (코디네이터) | Claude가 cmux로 직접 |
| CLI 실행 | Agent 내부에서 Bash 호출 | cmux send → 인터랙티브 세션 |
| 완료 감지 | SendMessage (이벤트) | `cmux wait-for` 시그널 (non-blocking) |
| 에러 대응 | Agent 내 Fallback | capture-pane 확인 → Ctrl+C → 대체 CLI |
| 시각화 | tail -f 로그 | 패널에서 CLI가 직접 작업 |
| 후속 명령 | 불가 | cmux send로 같은 세션에 추가 |
| 컨텍스트 유지 | 없음 | 인터랙티브 세션 유지 |
