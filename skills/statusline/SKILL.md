---
name: statusline
description: TASKS.md 진행 상황과 화이트박스 요약 상태를 Claude Code 상태바 Line 3에 표시합니다.
version: 1.0.0
---

# Statusline — TASKS.md Progress

Claude Code 상태바에 프로젝트 태스크 진행 상황을 실시간으로 표시합니다.

```
📋 12/34 ▓▓▓░░░░░░░  Phase 2  → T2.1: Build API  WB blocked:1
```

## 설치

```bash
./skills/statusline/install.sh
```

또는 root `install.sh`의 Step 5에서 자동 설치.

## 표시 정보

| 항목 | 설명 |
|------|------|
| `📋 12/34` | 완료/전체 태스크 수 |
| `▓▓▓░░░░░░░` | 진행률 바 (10칸) |
| `Phase 2` | 현재 진행 중인 Phase |
| `→ T2.1: ...` | 다음 미완료 태스크 |
| `WB blocked:1` | 화이트박스 요약 기반 blocker/stale/run 힌트 |

## 동작 방식

1. `statusline-segment.sh` — 상태바 호출 시 TASKS.md 파싱 (30초 캐시) + `whitebox-summary.json` 읽기
2. `hooks/tasks-status-writer.js` — TASKS.md 편집 시 즉시 `tasks-status.json` 및 `whitebox-summary.json` 갱신

## 파일 구조

```
skills/statusline/
├── SKILL.md
├── install.sh              # 설치 스크립트
├── statusline-segment.sh   # 상태바 Line 3 출력
└── hooks/
    └── tasks-status-writer.js  # PostToolUse 훅
```

## 관련

- [simple-claude-board](https://github.com/insightflo/simple-claude-board) — 풀 TUI 대시보드
- [awesome-claude-plugins](https://github.com/AwesomeJun/awesome-claude-plugins) — 상태바 플러그인
