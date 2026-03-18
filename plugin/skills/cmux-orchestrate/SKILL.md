---
name: cmux-orchestrate
description: cmux 기반 멀티-AI 팀 오케스트레이션. cmux 워크스페이스에 Claude/Gemini/Codex를 독립 프로세스로 배치해 물리적 다중 레벨 팀을 구성합니다. Agent Teams API 없이 진짜 병렬 실행. 이기종 AI 팀 구성, 사이드바 실시간 모니터링, 동적 팀 확장/축소 지원. "/cmux-orchestrate", "cmux로 팀 실행", "멀티 AI 팀", "gemini codex claude 병렬 실행" 등 cmux 환경에서 여러 AI를 팀으로 구성하는 요청이라면 반드시 이 스킬을 사용하세요.
triggers:
  - /cmux-orchestrate
  - cmux 팀
  - cmux로 팀 실행
  - 멀티 AI 팀
  - 이기종 AI 팀
version: 1.0.0
---

# /cmux-orchestrate — cmux 기반 멀티-AI 팀 오케스트레이션

> **team-orchestrate와의 차이**: Agent Teams API(flat) 대신 cmux 워크스페이스(물리 계층)를 사용.
> L1 리드가 자신의 L2 워커를 직접 스폰 → 진짜 3-Level 독립 프로세스.

---

## 아키텍처

```
현재 Claude 세션 (Level 0: team-lead)
  │  모니터링: cmux sidebar + .claude/collab/reports/
  │
  ├─ cmux workspace "arch-lead" (Level 1)
  │     process: claude or codex
  │     스폰: backend-builder 워크스페이스를 직접 생성
  │       └─ cmux workspace "backend-builder" (Level 2)
  │
  ├─ cmux workspace "design-lead" (Level 1)
  │     process: gemini or claude
  │     스폰: frontend-builder 워크스페이스를 직접 생성
  │       └─ cmux workspace "frontend-builder" (Level 2)
  │
  └─ cmux workspace "qa-lead" (Level 1)
        process: claude
```

**핵심 원칙**: 각 에이전트는 독립 프로세스 → 컨텍스트 격리 + 진짜 병렬

---

## Prerequisites

```bash
# 1. cmux 사용 가능
cmux ping || { echo "cmux 필요"; exit 1; }

# 2. TASKS.md 존재
[ -f TASKS.md ] || { echo "/tasks-init로 먼저 생성"; exit 1; }

# 3. 소켓 접근 모드 확인 (에이전트가 사이드바를 쓰려면 allowAll 필요)
export CMUX_SOCKET_MODE=allowAll   # 또는 cmux 내부에서 실행 중이면 자동
```

---

## 기본 AI 라우팅

| 역할 | 기본 AI | 이유 |
|------|---------|------|
| team-lead | claude | 전략, 조율, 판단 |
| arch-lead | claude | 아키텍처 결정, 코드 리뷰 |
| backend-builder | codex | 코드 생성 최적화 |
| design-lead | gemini | 창의성, 비주얼 판단 |
| frontend-builder | gemini | UI/UX 구현 |
| qa-lead | claude | 분석적 검증 |
| reviewer | claude | 코드 리뷰, 품질 판단 |

커스터마이징: `references/ai-routing.md` 참조

---

## 실행 순서

### Step 1: TASKS.md 분석

```bash
# 도메인 추출
grep "domain:" TASKS.md | sort -u
# 예시 출력: backend, frontend, qa
```

분석 결과로 팀 토폴로지 결정:
- `backend` 도메인 → arch-lead + backend-builder
- `frontend` 도메인 → design-lead + frontend-builder
- `qa` 태그 → qa-lead
- 도메인 없음 → arch-lead만

### Step 2: 협업 디렉토리 초기화

```bash
mkdir -p .claude/collab/{reports,requests,decisions,contexts,inbox}
# inbox: team-lead 수신함
# contexts: 각 에이전트용 브리핑 파일 (team-lead가 작성)
```

### Step 3: 에이전트 컨텍스트 파일 작성

각 L1 리드용 브리핑 파일을 `.claude/collab/contexts/` 에 작성.
내용: 역할, 담당 도메인 태스크 목록, 통신 규약, 워커 스폰 방법.

상세 프롬프트 템플릿: `references/agent-prompts.md`

### Step 4: L1 리드 스폰 (병렬)

```bash
# arch-lead (claude)
ARCH_WS=$(cmux new-workspace --json | jq -r '.workspace_id')
cmux send-surface --surface $ARCH_WS "cd $(pwd)\n"
cmux send-surface --surface $ARCH_WS \
  "claude --dangerously-skip-permissions -p \"\$(cat .claude/collab/contexts/arch-lead.md)\"\n"
cmux set-status "arch-lead" "starting" --icon hammer --color "#ff9500"

# design-lead (gemini)
DESIGN_WS=$(cmux new-workspace --json | jq -r '.workspace_id')
cmux send-surface --surface $DESIGN_WS "cd $(pwd)\n"
cmux send-surface --surface $DESIGN_WS \
  "gemini --yolo \"\$(cat .claude/collab/contexts/design-lead.md)\"\n"
cmux set-status "design-lead" "starting" --icon brush --color "#5856d6"

# qa-lead (claude) — L1 리드들 스폰 후에 시작
QA_WS=$(cmux new-workspace --json | jq -r '.workspace_id')
cmux send-surface --surface $QA_WS "cd $(pwd)\n"
cmux send-surface --surface $QA_WS \
  "claude --dangerously-skip-permissions -p \"\$(cat .claude/collab/contexts/qa-lead.md)\"\n"
cmux set-status "qa-lead" "waiting" --icon checklist --color "#8e8e93"
```

### Step 5: 모니터링 루프

team-lead는 블로킹 없이 아래를 반복 확인:

```bash
# 1. 사이드바 상태 확인
cmux sidebar-state

# 2. 리포트 파일 확인 (리드들이 완료 시 기록)
ls .claude/collab/reports/

# 3. team-lead 수신함 확인 (에이전트가 알림 전달 시)
ls .claude/collab/inbox/
```

긴급 이슈 → 리드가 `cmux notify`로 즉시 알림.

### Step 6: 크로스 도메인 조율

리드 간 충돌/의존성 발생 시:
```bash
# team-lead가 해당 리드 워크스페이스에 지시 전달
cmux send-surface --surface $ARCH_WS \
  "API 스펙 변경 사항을 .claude/collab/requests/REQ-001.md 에 기록하고 design-lead에 공유\n"
```

결정 사항 → `.claude/collab/decisions/DEC-NNN.md` 에 기록.

### Step 7: 동적 팀 확장/축소

```bash
# 작업량 증가 → 워커 추가 스폰
EXTRA_WS=$(cmux new-workspace --json | jq -r '.workspace_id')
cmux send-surface --surface $ARCH_WS \
  "WS=\$(cmux new-workspace --json | jq -r '.workspace_id') && \
   cmux send-surface --surface \$WS \"cd $(pwd) && codex -q '\$(cat .claude/collab/contexts/backend-builder-2.md)'\n\"\n"

# 완료된 워커 종료
cmux send-surface --surface $DONE_WS "exit\n"
cmux close-workspace --workspace $DONE_WS
cmux clear-status "backend-builder"
```

### Step 8: 종료

```bash
# 각 리드에 종료 신호
for WS in $ARCH_WS $DESIGN_WS $QA_WS; do
  cmux send-surface --surface $WS "exit\n"
done

# 워크스페이스 정리
cmux close-workspace --workspace $ARCH_WS
cmux close-workspace --workspace $DESIGN_WS
cmux close-workspace --workspace $QA_WS

# 사이드바 클리어
cmux clear-status
cmux log --level success -- "Team disbanded. All tasks complete."
```

---

## 에이전트 내부 규약 (L1 리드 컨텍스트에 포함)

### 사이드바 상태 보고 (리드 → team-lead)

```bash
# 시작
cmux set-status "{role}" "active" --icon hammer --color "#ff9500"
cmux set-progress 0.0 --label "{role}: starting"

# 진행 중
cmux set-progress 0.4 --label "{role}: T1.2 in progress"

# Phase 완료
cmux set-status "{role}" "phase-1 done" --icon checkmark --color "#34c759"
cmux log --level success -- "{role}: Phase 1 complete (3/3 tasks)"

# 블로킹 이슈
cmux set-status "{role}" "BLOCKED" --icon warning --color "#ff3b30"
cmux notify --title "{role} BLOCKED" --body "크로스 도메인 의존성 발생. team-lead 확인 필요"
```

### 파일 기반 리포트 (리드 → team-lead)

```bash
# Phase 완료 시 리포트 작성
cat > .claude/collab/reports/$(date +%Y%m%d)-{role}-phase-N.md << 'EOF'
## {role} Phase N Report
- Completed: T1.1, T1.2, T1.3
- Decisions: ADR-001 작성
- Issues: 없음
- Next: Phase 2 대기
EOF
```

### L1 → L2 워커 스폰 (리드가 직접)

```bash
# arch-lead가 backend-builder 스폰
WORKER_CTX=".claude/collab/contexts/backend-builder.md"
cat > $WORKER_CTX << 'EOF'
[워커 컨텍스트 - 담당 태스크, 테스트 명령, 보고 방법]
EOF

WS=$(cmux new-workspace --json | jq -r '.workspace_id')
cmux send-surface --surface $WS "cd $(pwd) && codex -q \"\$(cat $WORKER_CTX)\"\n"
cmux set-status "backend-builder" "spawned" --icon gear --color "#007aff"
```

워커 프롬프트 템플릿: `references/agent-prompts.md`

---

## team-orchestrate와 비교

| | team-orchestrate | cmux-orchestrate |
|---|---|---|
| 에이전트 실행 | Agent Teams API (in-process) | 독립 프로세스 (cmux workspace) |
| 계층 구조 | 논리적 (SendMessage 프로토콜) | 물리적 (프로세스 계층) |
| 지원 AI | Claude만 | Claude + Gemini + Codex |
| 컨텍스트 | 공유 (같은 프로세스) | 격리 (독립 세션) |
| 상태 모니터링 | TaskList 폴링 | cmux sidebar 실시간 |
| 장애 격리 | 한 에이전트 문제 → 전체 영향 | 독립 프로세스 → 격리됨 |
| 요구사항 | CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS | cmux (CMUX_SOCKET_MODE=allowAll) |

---

## 참고 파일

| 파일 | 내용 |
|------|------|
| `references/agent-prompts.md` | 각 역할별 컨텍스트 파일 템플릿 |
| `references/ai-routing.md` | AI 모델 배정 커스터마이징 가이드 |
