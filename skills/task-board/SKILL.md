---
name: task-board
description: AI 에이전트 태스크를 실시간 칸반 보드로 시각화합니다. TASKS.md + orchestrate-state + REQ 파일을 통합하여 board-state.json을 생성하고 터미널에 렌더링합니다.
trigger: /task-board, "칸반 보드", "태스크 보드", "보드 보여줘", "진행 상황 시각화"
version: 1.0.0
updated: 2026-03-05
---

# Task Board

> **화이트박스 제품 표면 안에서 동작하는 AI 에이전트 태스크의 실시간 칸반 렌더러**
>
> TASKS.md + `.claude/orchestrate-state.json` + `.claude/collab/requests/` 를 통합하여
> Backlog / In Progress / Blocked / Done 칸반 보드를 터미널에 렌더링합니다.

## 원칙

- **단일 진실 원천**: `TASKS.md` + `orchestrate-state.json` 이 canonical. `board-state.json`은 파생 데이터.
- **Standalone-first**: 외부 MCP 서버 없이 동작. 파일 기반.
- **Derived, never edit**: `board-state.json`은 직접 편집 금지. `board-builder.js`로 재생성.
- **Whitebox renderer**: `/task-board`는 별도 제품이 아니라 `/whitebox`의 renderer/TUI surface 다.
- **Control query separation**: `control.ndjson` 은 canonical operator-intent log, `control-state.json` 은 파생 control query state 다.

## 명령어

### `/task-board show` — 보드 + pending approvals 표시

현재 `board-state.json`과 `control-state.json`을 읽어 칸반 + pending approval shell 을 렌더링:

```bash
bash skills/task-board/scripts/board-show.sh
bash skills/task-board/scripts/board-show.sh --approve=DEC-TASKSYNC-T0.1
bash skills/task-board/scripts/board-show.sh --reject=DEC-TASKSYNC-T0.1
```

### `/task-board rebuild` — 보드 재빌드

TASKS.md + orchestrate-state + REQ 파일에서 `board-state.json` 재생성:

```bash
node skills/task-board/scripts/board-builder.js
```

옵션:
```bash
node skills/task-board/scripts/board-builder.js --json        # stdout에도 출력
node skills/task-board/scripts/board-builder.js --dry-run     # 파일 쓰기 없이 출력만
node skills/task-board/scripts/board-builder.js --project-dir=/path
```

### `/task-board init` — 협업 버스 초기화

```bash
node project-team/scripts/collab-init.js
```

`.claude/collab/` 디렉토리 구조 + `board-state.json`/`control-state.json` 파생 파일 + `events.ndjson`/`control.ndjson` canonical log 를 준비한다.

### `/task-board health` — 보드 상태 점검

다음을 확인합니다:
1. `board-state.json` 존재 여부
2. `events.ndjson` 이벤트 수
3. Blocked 컬럼 카드 목록 (주의 필요 항목)
4. TASKS.md vs board-state 동기화 상태

```bash
node skills/task-board/scripts/board-builder.js --dry-run --json | \
  node -e "
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      const b = JSON.parse(chunks.join(''));
      const blocked = b.columns['Blocked'] || [];
      console.log('Backlog:', b.columns['Backlog'].length);
      console.log('In Progress:', b.columns['In Progress'].length);
      console.log('Blocked:', blocked.length, blocked.map(c=>c.id).join(', '));
      console.log('Done:', b.columns['Done'].length);
    });
  "
```

### `/task-board decisions` — 대기 중인 결정 보기

```bash
node skills/task-board/scripts/decision-gate.js list
```

### `/task-board resolve` — 결정 처리

```bash
node skills/task-board/scripts/decision-gate.js resolve --id=DEC-TASKSYNC-T0.1 --action=approve
node skills/task-board/scripts/decision-gate.js resolve --id=DEC-TASKSYNC-T0.1 --action=reject
```

`board-show.sh --approve/--reject`가 whitebox UI 게이트웨이이고,
`decision-gate.js`는 동일 동작의 직접 호출 경로입니다.

## 칸반 컬럼 매핑

| 컬럼 | orchestrate-state 상태 | REQ 상태 |
|------|------------------------|----------|
| **Backlog** | `pending` | — |
| **In Progress** | `in_progress` | `OPEN`, `PENDING` |
| **Blocked** | `failed`, `timeout` | `ESCALATED` |
| **Done** | `completed` | `RESOLVED`, `REJECTED` |

## 보드 이벤트 (task-board-sync.js 훅)

`project-team/hooks/task-board-sync.js`가 PostToolUse 이벤트를 감지하여
`.claude/collab/events.ndjson`에 자동으로 기록하고, `board-state.json` 재빌드가 필요하다는 stale marker 를 남깁니다.

| 이벤트 | 트리거 | projector 힌트 |
|--------|--------|----------------|
| `task_claimed` | TaskUpdate → in_progress | task가 진행 중으로 이동해야 함을 시사 |
| `task_done` | TaskUpdate → completed | task가 Done으로 이동해야 함을 시사 |
| `task_blocked` | TaskUpdate → failed/timeout | Blocked 이유 재계산 필요 |
| `req_escalated` | REQ status = ESCALATED | REQ blocker 컨텍스트 갱신 |
| `req_resolved` | REQ status = RESOLVED/REJECTED | 완료 상태 재계산 필요 |

이 이벤트들은 canonical 입력일 뿐이며, `board-state.json` 자체를 직접 수정하지 않습니다. authoritative writer 는 항상 `skills/task-board/scripts/board-builder.js` 입니다. Control 관련 상태 역시 `control.ndjson`/`events.ndjson` 에서 projector 가 만드는 `control-state.json` 을 읽어야 하며 renderer 가 직접 수정하면 안 됩니다.

## Ratatui MVP keybindings

- navigation: `j/k` 또는 화살표
- `a`: selected pending approval approve (`whitebox-control.js approve` subprocess)
- `r`: selected pending approval reject (`whitebox-control.js reject` subprocess)
- `q` / `esc`: 종료

Snapshot 모드(`WHITEBOX_TUI_CAPTURE=1` 또는 `--snapshot`)도 동일한 approval hints 를 표시한다.

## 파일 구조

```
skills/task-board/
├── SKILL.md                          # 이 파일
└── scripts/
    ├── board-builder.js              # board-state.json 빌더
    └── board-show.sh                 # 터미널 칸반 렌더러

project-team/hooks/
└── task-board-sync.js                # PostToolUse 이벤트 → canonical event log + stale marker

.claude/collab/
├── board-state.json                  # 현재 보드 스냅샷 (파생, 직접 편집 금지)
├── control-state.json                # 현재 control query state (파생, 직접 편집 금지)
├── board-state.snapshot.json         # projector 체크포인트 메타데이터
├── derived-meta.json                 # stale derived artifact markers
├── control.ndjson                    # operator-intent log (canonical, append-only)
└── events.ndjson                     # 이벤트 로그 (append-only)
```

## 설치

`task-board-sync.js`는 Claude Code PostToolUse 훅으로 연결해야 합니다. 프로젝트 설정에 아직 없으면 수동으로 추가하세요:

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Edit|Write|TaskUpdate", "hooks": [{ "type": "command", "command": "node project-team/hooks/task-board-sync.js" }] }
    ]
  }
}
```

## 자연어 트리거

```
"보드 보여줘"          → /task-board show
"칸반 보드 보여줘"     → /task-board show
"보드 다시 만들어"     → /task-board rebuild
"blocked 태스크 확인"  → /task-board health
"대기 중인 결정 보기"  → /task-board decisions
"이 결정 승인해"       → /task-board resolve
"협업 버스 초기화"     → /task-board init
```
