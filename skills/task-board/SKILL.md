---
name: task-board
description: AI 에이전트 태스크를 실시간 칸반 보드로 시각화합니다. TASKS.md + orchestrate-state + REQ 파일을 통합하여 board-state.json을 생성하고 터미널에 렌더링합니다.
trigger: /task-board, "칸반 보드", "태스크 보드", "보드 보여줘", "진행 상황 시각화"
version: 1.0.0
updated: 2026-03-05
---

# Task Board

> **AI 에이전트 태스크의 실시간 칸반 시각화**
>
> TASKS.md + `.claude/orchestrate-state.json` + `.claude/collab/requests/` 를 통합하여
> Backlog / In Progress / Blocked / Done 칸반 보드를 터미널에 렌더링합니다.

## 원칙

- **단일 진실 원천**: `TASKS.md` + `orchestrate-state.json` 이 canonical. `board-state.json`은 파생 데이터.
- **Standalone-first**: 외부 MCP 서버 없이 동작. 파일 기반.
- **Derived, never edit**: `board-state.json`은 직접 편집 금지. `board-builder.js`로 재생성.

## 명령어

### `/task-board show` — 보드 표시

현재 `board-state.json`을 읽어 터미널에 칸반 렌더링:

```bash
bash skills/task-board/scripts/board-show.sh
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

`.claude/collab/` 디렉토리 구조 + 빈 `board-state.json` + `events.ndjson` 생성.

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

이 이벤트들은 canonical 입력일 뿐이며, `board-state.json` 자체를 직접 수정하지 않습니다. authoritative writer 는 항상 `skills/task-board/scripts/board-builder.js` 입니다.

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
├── board-state.snapshot.json         # projector 체크포인트 메타데이터
├── derived-meta.json                 # stale derived artifact markers
└── events.ndjson                     # 이벤트 로그 (append-only)
```

## 설치

`task-board-sync.js` 훅은 `project-team/install.sh`에서 자동 설치됩니다:

```bash
./project-team/install.sh
```

또는 수동으로 Claude Code 설정에 추가:

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
"협업 버스 초기화"     → /task-board init
```
