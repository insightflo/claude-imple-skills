---
name: recover
description: CLI 중단 후 미완료 작업을 식별하고 재개합니다. /recover, "작업 복구", "중단된 작업" 트리거.
version: 2.3.0
updated: 2026-02-21
---

# 🔄 Recover Skill

> CLI 다운, 네트워크 끊김, 또는 에이전트 오류로 인해 중단된 작업을 **자동으로 탐지하고 복구**하는 스킬입니다.
>
> **고유 기능:**
> - 모든 유형의 중단된 작업을 탐지하고 적절한 복구 경로를 안내
> - TASKS.md, 진행 로그, 상태 파일 등을 종합적으로 분석
>
> **v2.4.0 업데이트**: TASKS.md 우선 복구 + project-team Hook 연동

---

## ⚡ 스킬 발동 조건

다음 명령어 또는 자연어로 이 스킬을 호출할 수 있습니다:

- `/recover`
- `/복구`
- "중단된 작업 확인해줘"
- "이전 작업 이어서 진행해줘"

---

## 📋 실행 단계 (Execution Steps)

이 스킬이 발동되면 다음 순서로 작업을 수행합니다:

### 1️⃣ 상태 파일 및 Artifact 점검 (Standalone v2.4)

이전 작업의 흔적을 **TASKS.md 우선**으로 탐색합니다:

| 우선순위 | 소스 | 파일 경로 | 설명 |
|----------|------|-----------|------|
| **1 (최우선)** | Task Tracker | `TASKS.md` | `[ ]`, `[/]`, `[x]` 상태의 태스크 목록 |
| 2 | Task Tracker (레거시) | `docs/planning/06-tasks.md`, `task.md` | 레거시 태스크 파일 |
| 3 | Progress Log | `.claude/progress.txt` | 의사결정 및 이슈 기록 |
| 4 (선택적) | Orchestrate State | `.claude/orchestrate-state.json` | 자동화 상태 (있을 경우) |

- **Standalone 우선순위**: `TASKS.md`의 미완료 태스크(`[ ]`, `[/]`)를 최우선으로 확인합니다.
- 발견 시, 해당 항목 목록을 사용자에게 보고합니다.

```bash
# 예시 출력
## 🚧 중단된 작업 발견

**TASKS.md 미완료 태스크:**
- [/] T1.2: Dashboard UI 구현 (진행 중)
- [ ] T1.3: API 연동

**권장**: `/agile run T1.2` 또는 `/agile auto` 실행
```

### 2️⃣ 최근 대화 히스토리 확인

**대상**: 최근 Conversation 요약 목록

- 현재 대화와 유사한 주제의 이전 대화가 있는지 검색합니다.
- 관련 대화가 있다면 해당 대화 ID와 요약을 보고합니다.

### 3️⃣ Git Worktree 상태 점검 (v1.8.0)

**대상**: Git Worktree 및 브랜치 상태

```bash
# Worktree 상태 확인
git worktree list

# 미병합 브랜치 확인
git branch --no-merged main
```

| 상태 | 설명 | 권장 조치 |
|------|------|-----------|
| **Orphan Worktree** | 브랜치 없는 고아 Worktree | `git worktree remove` |
| **Unmerged Branch** | Phase 완료 후 미병합 | `git merge` → `/auto-orchestrate --resume` |
| **Dirty Worktree** | 커밋되지 않은 변경 | `git stash` 또는 커밋 후 진행 |
| **Conflict State** | 병합 충돌 중 | 충돌 해결 후 진행 |

### 4️⃣ 프로젝트 폴더 점검

**대상**: 사용자가 제공한 경로 또는 현재 활성 문서 경로

다음 패턴의 불완전한 파일을 탐지합니다:

| 패턴           | 설명                                            |
| -------------- | ----------------------------------------------- |
| 열린 코드 블록 | ` ``` ` 로 시작했으나 닫히지 않은 마크다운      |
| 누락된 괄호    | `{`, `[`, `(` 등이 닫히지 않은 코드 파일        |
| TODO 마커      | `// TODO:`, `# FIXME:` 등 미완성 표시           |
| 빈 함수        | `pass`, `throw new Error('Not implemented')` 등 |

### 5️⃣ 복구 제안 (Recovery Proposal) - v1.8.0

점검 결과를 바탕으로 **상황별 맞춤 복구 전략**을 제안합니다:

| 상황 | 권장 조치 | 자동 실행 여부 |
|------|-----------|----------------|
| **Orchestrate 중단** | `/auto-orchestrate --resume` | ⭐ 자동 권장 |
| **Ultra-Thin 중단** | `/auto-orchestrate --ultra-thin --resume` | ⭐ 자동 권장 |
| **Agile 중단** | `/agile status` → `/agile run {next-task}` | 수동 확인 |
| **Worktree 문제** | Git 정리 후 재개 | 수동 확인 |
| **코드 불완전** | 파일별 수정 안내 | 수동 확인 |

#### 복구 옵션

- **A. 자동 복구 (권장)**: 탐지된 미완료 항목을 즉시 이어서 완료합니다.
- **B. 수동 선택**: 복구할 항목 목록을 보여주고 사용자가 선택하도록 합니다.
- **C. 새로 시작**: `/workflow`를 실행하여 처음부터 워크플로우를 다시 안내받습니다.

---

## 🛡️ 제약 사항

1. **저장되지 않은 데이터는 복구 불가**: 파일로 저장되기 전에 CLI가 종료된 경우, 해당 내용은 유실됩니다.
2. **터미널 명령 복원 불가**: `npm run dev` 등 실행 중이던 프로세스는 자동으로 재시작되지 않습니다. 필요시 사용자에게 재실행을 안내합니다.

---

## 💡 사용 예시

**입력**:

```
/recover
```

**출력 예시**:

```
## 🔍 복구 점검 결과

### 📋 Artifact 상태
- `task.md` 발견: 2개 미완료 항목

### 📁 프로젝트 점검
- `d:\Projects\my-app\src\api\client.ts`: 열린 괄호 탐지 (Line 45)

### 🚀 권장 조치
1. [자동 복구] task.md의 미완료 항목 이어서 진행
2. [수동 수정] client.ts Line 45 확인 필요

어떻게 진행할까요? (1/2/취소)
```

---

## 🔗 다음 스킬 연동 (v2.3.0)

복구 완료 후 상황에 따라 다음 스킬을 자동 제안합니다:

| 복구 결과 | 다음 스킬 | 설명 |
|-----------|-----------|------|
| Orchestrate 재개 | `/auto-orchestrate --resume` | 중단된 Phase부터 계속 |
| **tmux 모드 재개** | `/auto-orchestrate --tmux --resume` | tmux 병렬 실행 재개 **(v1.10.0)** |
| 개별 태스크 재개 | `/agile run {task-id}` | 특정 태스크 실행 |
| 결핍 분석 중단 | `/eros` | 디오티마 사다리 재개 **(v1.10.0)** |
| 에로스 기획 중단 | `/poietes` | 4 Phase 재개 **(v1.10.0)** |
| 품질 점검 필요 | `/trinity` → `/code-review` 또는 `/audit` | 복구 후 검증 |
| 테스트 실패 복구 | `/powerqa` | 자동 QA 사이클링 |
| 새로 시작 | `/workflow` | 워크플로우 처음부터 |

### 6️⃣ tmux 모드 실패 감지 **(v1.10.0 NEW)**

tmux 병렬 실행 모드 사용 시 `/tmp/task-*.done` 파일로 상태 확인:

```bash
# tmux 태스크 완료 상태 확인
ls /tmp/task-*.done 2>/dev/null

# 결과 파일 확인
ls /tmp/task-*-result.md 2>/dev/null
```

| 상태 | 설명 | 권장 조치 |
|------|------|-----------|
| 일부 `.done` 없음 | 일부 태스크만 실패 | 미완료 태스크만 재실행 |
| 모두 `.done` 없음 | 전체 실패 | `/auto-orchestrate --tmux --resume` |
| tmux 세션 남음 | 프로세스 아직 실행 중 | `tmux attach` 로 상태 확인 |

### 🪝 Hook 연동 (Standalone v2.4)

| Hook | 효과 |
|------|------|
| `task-sync` | TASKS.md 상태 변경 감지 및 동기화 |
| `quality-gate` | 복구 후 품질 검증 자동 트리거 |

> **참고**: project-team Hook 시스템(`project-team/hooks/`) 사용

---

## 💡 예방 팁 (Prevention Tips)

1. **자주 커밋하기**: 작은 단위로 커밋하면 복구가 쉬워집니다.
2. **TASKS.md 활용**: `/tasks-init`으로 태스크를 문서화하면 진행 상황 추적이 용이합니다.
3. **Worktree 사용**: Phase별 Worktree를 사용하면 작업 분리가 명확해집니다.

---

**Last Updated**: 2026-03-03 (v2.4.0 - Standalone 독립 완료)
