---
name: workflow-guide
description: 여러 플러그인 중 상황에 맞는 워크플로우를 안내합니다. /workflow, "어떤 스킬을 써야 해?", "워크플로우 추천" 트리거.
trigger: /workflow, /workflow-guide, "뭐해야해?", "어떤 스킬", "워크플로우 추천"
version: 4.9.3
updated: 2026-03-06

---

# 🧭 워크플로우 선택 가이드 (Meta Hub)

> **🔥 Heavy-Hitter (즉시 실행)**
> ```
> /workflow | "뭐해야해?" | "어떤 스킬 써야 해?"
> ```
> **결과**: 프로젝트 상태 자동 분석 → 최적 스킬 1~2개 추천
>
> **⚠️ 핵심 원칙**: 이 스킬은 **구현 코드를 작성하지 않습니다**. 오직 **상황 진단 → 스킬 추천 → 사용자 확인**만 수행합니다.

> **v4.1.0**: Long Context 최적화 - H2O 패턴으로 핵심 정보 상단 배치
> **v4.0.0**: Standalone-first 아키텍처로 완전한 파이프라인 제공

---

## ⚡ 실행 파이프라인

### Standalone 파이프라인 (완전 독립)

```
기획 시작 ──────────── /governance-setup (Mini-PRD 내장)
     ↓
태스크 생성 ─────────── /tasks-init (TASKS.md 스캐폴딩)
     ↓                  /tasks-migrate (레거시 통합)
     ↓
구현 ────────────────── /agile auto (≤30개)
     │                  /multi-ai-run (모델 라우팅)
     ↓
태스크 리뷰 ─────────── /checkpoint (2단계 리뷰) ← v4.1 NEW
     ↓
검증 ────────────────── /security-review (보안)
     │                  /quality-auditor (종합 감사)
     ↓
복구 (필요시) ────────── /recover
     ↓
분석 ────────────────── /impact, /deps, /coverage, /changelog, /architecture
     ↓
심층 리뷰 ───────────── /multi-ai-review (3-AI 컨센서스)
```

---

## 📊 Standalone 스킬 카탈로그 (20개)

### 핵심 스킬

| 스킬 | 트리거 | 역할 |
|------|--------|------|
| **`/workflow`** | `/workflow`, "뭐해야해?" | 메타 허브 - 스킬 라우팅 |
| **`/governance-setup`** | `/governance-setup` | 거버넌스 + Mini-PRD 기획 |
| **`/tasks-init`** | `/tasks-init` | TASKS.md 스캐폴딩 **(v4.0 NEW)** |
| **`/tasks-migrate`** | `/tasks-migrate` | 레거시 태스크 통합 |
| **`/agile`** | `/agile auto` | 레이어 기반 스프린트 |
| **`/multi-ai-run`** | `/multi-ai-run` | 역할별 모델 라우팅 |
| **`/recover`** | `/recover` | 작업 복구 허브 |
| **`/checkpoint`** | `/checkpoint`, "리뷰해줘" | 태스크 완료 시 2단계 코드 리뷰 **(v4.1 NEW)** |
| **`/security-review`** | `/security-review` | OWASP TOP 10 보안 검사 |
| **`/audit`** | `/audit` | 배포 전 종합 감사 |
| **`/multi-ai-review`** | `/multi-ai-review` | 3-AI 컨센서스 리뷰 |
| **`/impact`** | `/impact <file>` | 변경 영향도 분석 |
| **`/deps`** | `/deps` | 의존성 그래프 |
| **`/coverage`** | `/coverage` | 테스트 커버리지 |
| **`/changelog`** | `/changelog` | 변경 이력 |
| **`/architecture`** | `/architecture` | 아키텍처 맵 |
| **`/compress`** | `/compress`, "컨텍스트 압축" | Long Context 최적화 (H2O 패턴) |
| **`/orchestrate-standalone`** | `/orchestrate-standalone`, `/orchestrate` | 30~200개 태스크 병렬 실행 (`--mode=wave/sprint`) |
| **`/task-board`** | `/task-board`, "칸반 보드", "보드 보여줘" | 에이전트 태스크 칸반 시각화 (Backlog/In Progress/Blocked/Done) |
| **`/statusline`** | 자동 활성화 (설치 후) | TASKS.md 진행률 Claude Code 상태바 Line 3 표시 |

---

## ⚡ 병렬 실행 모드

### 기존 방식 vs tmux 모드

| 항목 | 기존 (`--parallel`) | tmux (`--tmux`) |
|------|---------------------|-----------------|
| 실행 방식 | Task 도구 + run_in_background | 독립 OS 프로세스 |
| 통신 방식 | 메인 컨텍스트 공유 | 파일 기반 (`/tmp/task-*.done`) |
| 중첩 제한 | 에이전트 깊이 제한 있음 | 무제한 |
| 병렬도 | 3-4개 | 무제한 (tmux 세션) |
| 실패 격리 | 메인 영향 가능 | 완전 격리 |

### 사용 방법

```bash
/orchestrate-standalone --tmux    # tmux 병렬 모드 활성화
```

### 언제 사용하나?

- **30개 이상 태스크**: 병렬 모드가 안정적
- **복잡한 의존성 트리**: 격리된 실행으로 부작용 방지
- **장시간 실행**: 개별 프로세스 로그 추적 가능

---

## ⛔ 절대 금지 사항

1. ❌ **직접 코드를 작성하지 마세요** - 워크플로우 안내만 합니다.
2. ❌ **모든 스킬을 나열하지 마세요** - 상황에 맞는 **1~2개만** 추천합니다.
3. ❌ **요구사항 질문으로 시작하지 마세요** - 먼저 프로젝트 상태를 **자동 진단**한 뒤, 3단계에서 확인 질문(AskUserQuestion)으로 진행합니다.

---

## ✅ 스킬 발동 시 즉시 실행할 행동

### 1단계: 프로젝트 상태 자동 진단 (Silent Analysis)

**사용자에게 묻기 전에 현재 상태를 파악합니다:**

```bash
# 1. 기획 문서 확인
ls docs/planning/*.md 2>/dev/null

# 2. 태스크 파일 확인 (둘 중 하나만 있어도 OK)
# 권장: 루트 TASKS.md / 레거시: docs/planning/06-tasks.md
ls TASKS.md 2>/dev/null || ls docs/planning/06-tasks.md 2>/dev/null

# 3. 코드 베이스 확인 (source_code = src/·app/·lib/ 디렉토리에 실제 코드 파일이 있어야 함)
# package.json만 있는 신규 프로젝트는 source_code로 보지 않음
SOURCE_CODE=$(find src/ app/ lib/ -maxdepth 3 -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" \) 2>/dev/null | head -1)
echo "source_code=${SOURCE_CODE:+yes}"

# 4. 중단된 작업 확인
# ⚠️ 레거시/신규 경로 모두 확인 — 하나라도 미완료 태스크 있으면 INCOMPLETE_IN_STATE=1 (OR 판정)
# ⚠️ grep -q 사용: grep -c || echo 0 은 no-match 시 "0\n0" 이중 출력 버그 있음
INCOMPLETE_IN_STATE=0
for STATE_PATH in ".claude/orchestrate-state.json" ".claude/orchestrate/orchestrate-state.json"; do
  if [ -f "$STATE_PATH" ]; then
    if grep -qE '"status"[[:space:]]*:[[:space:]]*"(in_progress|pending)"' "$STATE_PATH" 2>/dev/null; then
      INCOMPLETE_IN_STATE=1
      echo "state_file=$STATE_PATH incomplete_in_state=1 (중단 감지)"
    else
      echo "state_file=$STATE_PATH incomplete_in_state=0 (완료 상태)"
    fi
  fi
done
echo "INCOMPLETE_IN_STATE=$INCOMPLETE_IN_STATE"

# 5. Git 상태 확인
git status --short 2>/dev/null | head -10
git worktree list 2>/dev/null
# ⚠️ merge conflict 감지 (git dirty 는 정상 — /recover 불필요)
CONFLICT_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null | wc -l | tr -d ' ')
echo "conflicts=$CONFLICT_FILES"  # 0이면 정상, 1 이상이면 /recover 필요

# 6. specs/ 폴더 확인 (v1.8.1)
ls specs/screens/*.yaml 2>/dev/null

# 7. 기획 문서 개수 확인 (v3.4.0)
# Socrates 호환 최소 세트: 7개(01~07). 추가 문서(product-brief 등)는 '보강용'입니다.
ls docs/planning/*.md 2>/dev/null | wc -l  # 7개 이상이면 기획(문서) 준비 완료로 간주

# 8. 거버넌스 산출물 확인 (v3.1.1 NEW)
# PM 산출물
ls management/project-plan.md 2>/dev/null && echo "PM: OK"
# Architect 산출물 (ADR 4개 이상)
ls management/decisions/ADR-*.md 2>/dev/null | wc -l
# Designer 산출물 (4개 이상)
ls design/system/*.md 2>/dev/null | wc -l
# QA 산출물
ls management/quality-gates.md 2>/dev/null && echo "QA: OK"
# DBA 산출물
ls database/standards.md 2>/dev/null && echo "DBA: OK"

# 9. 에이전트 팀 + project-team 설치 여부 확인 (CRITICAL)
AGENT_COUNT=$(ls .claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
TASK_COUNT=$(grep -cE '^\s*[-*]\s*\[|^#{1,6}\s+\[' TASKS.md 2>/dev/null || echo 0)
INCOMPLETE_COUNT=$(grep -cE '^\s*[-*]\s*\[\s*\]|^#{1,6}\s+\[\s*\]' TASKS.md 2>/dev/null || echo 0)
echo "agents=$AGENT_COUNT tasks=$TASK_COUNT incomplete=$INCOMPLETE_COUNT"
# ⚠️ agents=0 AND tasks>=30 → install.sh REQUIRED before orchestration
# ⚠️ incomplete=0 AND tasks>0 → all_tasks_completed = true → /audit 경로

# 10. 거버넌스 권장 조건 감지
DOMAIN_COUNT=$(grep -h "^\s*-\s*domain:" TASKS.md 2>/dev/null | awk '{print $NF}' | sort -u | wc -l | tr -d ' ')
GOVERNANCE_DONE=$(ls management/project-plan.md 2>/dev/null && echo "yes" || echo "no")
echo "domains=$DOMAIN_COUNT governance=$GOVERNANCE_DONE"
# 거버넌스 권장: tasks>=10 AND (domains>=2 OR 팀원>=2 OR 외부API>=3)
```

### 2단계: 결정 알고리즘 (의무 실행 — 순서대로, 첫 RETURN에서 중단)

> ⛔ **아래 알고리즘을 IF-THEN 순서대로 실행하세요. 첫 번째 조건이 참이면 즉시 해당 스킬을 RETURN하고 나머지 조건은 평가하지 않습니다.**
>
> ⛔ **절대 금지**: TASKS.md 내용(제목·목적·설명·주석), 사용자 발언, 프로젝트 이름, 이전 대화 내용은 이 알고리즘의 입력이 아닙니다. **1단계에서 측정한 변수만 사용합니다.**
>
> ✅ **3단계 AskUserQuestion에서 이 알고리즘이 RETURN한 스킬을 반드시 ⭐으로 표시합니다. 임의 변경 금지.**

```
# 1단계 bash 변수 → 알고리즘 변수 매핑:
# TASK_COUNT        → TASK_COUNT       (총 태스크 수)
# INCOMPLETE_COUNT  → incomplete_tasks  (미완료 태스크: [ ] 체크박스)
# TASK_COUNT>0 AND INCOMPLETE_COUNT=0 → all_tasks_completed
# SOURCE_CODE(yes)  → source_code EXISTS (src/·app/·lib/ 에 코드 파일 있음)
# AGENT_COUNT       → AGENT_COUNT      (.claude/agents/*.md 개수)
# GOVERNANCE_DONE   → GOVERNANCE_DONE  (management/project-plan.md 존재: yes/no)
# DOMAIN_COUNT      → DOMAIN_COUNT     (TASKS.md domain: 필드 유니크 수)
# CONFLICT_FILES>0  → git merge conflicts exist (git diff --diff-filter=U 결과)

ALGORITHM get_recommendation():

  # ① 복구 체크 (최우선)
  #    ⚠️ orchestrate.sh는 완료 시 state 파일을 자동 삭제하지 않음
  #       → 파일 존재 + 미완료(in_progress/pending) 태스크 존재 시만 복구 신호
  #    레거시: .claude/orchestrate-state.json / 신규: .claude/orchestrate/orchestrate-state.json
  IF (state file EXISTS) AND (INCOMPLETE_IN_STATE > 0):
    RETURN "/recover"  # 이후 /orchestrate-standalone --resume 안내

  # ⚠️ git dirty (미커밋 변경사항)는 정상 개발 상태 — /recover 트리거 아님
  # 오직 unresolved merge conflicts만 복구 필요
  IF git merge conflicts exist (git diff --diff-filter=U 결과 있음):
    RETURN "/recover"

  # ② 태스크 파일 체크
  IF TASKS.md NOT EXISTS:
    IF docs/planning/06-tasks.md EXISTS:
      RETURN "/tasks-migrate"
    ELSE:
      RETURN "/tasks-init"
  IF TASK_COUNT == 0:
    RETURN "/tasks-init"   # TASKS.md 있으나 태스크 없음 → 스캐폴딩 필요

  # ③ 유지보수 체크 ← 단독·소규모 유지보수 (AGENT_COUNT=0 AND GOVERNANCE_DONE=no 인 경우만)
  #    source_code = src/ 또는 app/ 또는 lib/ 디렉토리에 파일 1개 이상 있음
  #    ⚠️ package.json만 있는 신규 프로젝트는 source_code 아님 → ③ 건너뜀
  #    ⚠️ AGENT_COUNT > 0 (거버넌스+팀 구성된 대규모 진행 중) → ③ 건너뜀
  #    ⚠️ GOVERNANCE_DONE = yes (거버넌스 완료 후 install 대기) → ③ 건너뜀 → ⑤로 이동
  IF source_code EXISTS AND AGENT_COUNT == 0 AND GOVERNANCE_DONE == "no":
    IF incomplete_tasks > 0:
      RETURN "/agile iterate"   # 단독 유지보수 → iterate 사용
    IF all_tasks_completed:
      RETURN "/audit"

  # ④ 거버넌스 체크 ← source_code 없는 신규 프로젝트 전용 (미완료 태스크 있을 때만)
  #    DOMAIN_COUNT는 TASKS.md 'domain:' 필드 기반; 없으면 TASK_COUNT>=30으로 대체
  #    ⚠️ incomplete_tasks == 0 (모든 완료) → 거버넌스 불필요 → ⑦·⑧으로 이동
  IF TASK_COUNT >= 10 AND (DOMAIN_COUNT >= 2 OR TASK_COUNT >= 30) AND GOVERNANCE_DONE == "no" AND incomplete_tasks > 0:
    RETURN "/governance-setup"
    # ⚠️ AGENT_COUNT, TASKS.md 목적·설명 필드, 사용자 맥락은 이 조건에 영향 없음

  # ⑤ 인프라 체크 (거버넌스 완료 후, 미완료 태스크 있을 때만)
  #    ⚠️ all_tasks_completed이면 install.sh 불필요 → ⑥·⑧으로 이동
  IF GOVERNANCE_DONE == "yes" AND TASK_COUNT >= 30 AND AGENT_COUNT == 0 AND incomplete_tasks > 0:
    RETURN "project-team/install.sh --mode standard"
    # 참고: claude-imple-skills 클론 디렉토리 내 project-team/ 에서 실행

  # ⑥ 구현/배포 판단 (거버넌스 완료 + 인프라 준비)
  IF GOVERNANCE_DONE == "yes" AND AGENT_COUNT > 0:
    IF all_tasks_completed: RETURN "/audit"   # 전체 완료 → 배포 전 감사
    IF incomplete_tasks >= 80: RETURN "/orchestrate-standalone --mode=wave"
    IF incomplete_tasks >= 30: RETURN "/orchestrate-standalone"
    ELSE: RETURN "/agile auto"

  # ⑦ 소규모 신규 구현 (거버넌스 불필요, 코드 없음, 미완료 태스크 있음)
  IF TASK_COUNT > 0 AND TASK_COUNT < 30 AND incomplete_tasks > 0:
    RETURN "/agile auto"

  # ⑧ 완료
  IF all_tasks_completed:
    RETURN "/audit"
```

**시나리오별 추적 검증:**

| 시나리오 | 초기 상태 | 알고리즘 경로 | 예상 추천 |
|---------|-----------|--------------|----------|
| S1 (새 프로젝트) | TASKS.md 없음 | ② → /tasks-init | ✅ `/tasks-init` |
| S1 (tasks-init 후) | 20 tasks, domain<2, 코드 없음 | ③ skip, ④ skip(20<30), ⑦ → /agile auto | ✅ `/agile auto` |
| S2 (100 tasks, 12 domains, 거버넌스 없음) | 코드 없음, GOVERNANCE_DONE=no | ③ skip(코드없음), ④ 100>=30 → /governance-setup | ✅ `/governance-setup` |
| S2 (거버넌스 후, agents=0) | GOVERNANCE_DONE=yes, AGENT_COUNT=0 | ⑤ → project-team/install.sh | ✅ `install.sh` |
| S2 (설치 후) | GOVERNANCE_DONE=yes, AGENT_COUNT>0, incomplete=100 | ⑥ incomplete>=80 → /orchestrate-standalone --mode=wave | ✅ `/orchestrate-standalone --mode=wave` |
| S2 (실행중, incomplete=50) | GOVERNANCE_DONE=yes, AGENT_COUNT>0, incomplete=50, **state 파일 미완료 태스크 0** (이전 실행이 모두 완료 → INCOMPLETE_IN_STATE=0) | ① skip(state없음), ⑥ 30<=incomplete<80 → /orchestrate-standalone | ✅ `/orchestrate-standalone` |
| S3 (유지보수) | source_code EXISTS(src/), AGENT_COUNT=0, GOVERNANCE_DONE=no, incomplete>0 | ③ AGENT_COUNT=0 AND gov=no → /agile iterate | ✅ `/agile iterate` |
| S5 (배포 직전) | GOVERNANCE_DONE=yes, AGENT_COUNT>0, all_completed | ⑥ all_tasks_completed → /audit | ✅ `/audit` |
| S6 (복구-state) | orchestrate-state.json 존재 AND 미완료(in_progress/pending) 태스크 있음 | ①a state+incomplete>0 → /recover | ✅ `/recover` |
| S6 (복구-merge) | git merge conflicts 존재 (git diff --diff-filter=U) | ①b merge conflict → /recover | ✅ `/recover` |
| S1-레거시 | TASKS.md 없음, 06-tasks.md 있음 | ② → /tasks-migrate | ✅ `/tasks-migrate` |
| S1-빈TASKS | TASKS.md 있으나 task 0개 | ② TASK_COUNT=0 → /tasks-init | ✅ `/tasks-init` |
| S1-완료 | TASK_COUNT=20, all done, 코드 없음 | ③ skip(코드없음), ④ skip(20<30), ⑦ skip(incomplete=0), ⑧ → /audit | ✅ `/audit` |
| S4·S7 | 명시적 직접 호출 | workflow-guide 우회 가능 (자연어 트리거) | ✅ 해당 스킬 직접 실행 |
| S6-신규경로 | .claude/orchestrate/orchestrate-state.json 존재 AND incomplete>0 | ① 신규 경로 체크 → /recover | ✅ `/recover` |
| 비정상 (AGENT>0+GOV=no) | AGENT_COUNT>0, GOVERNANCE_DONE=no, T=20, incomplete>0 | ③ skip(AGENT>0), ④ skip(T<30), ⑤ skip(GOV=no), ⑥ skip(GOV=no), ⑦ T<30 AND incomplete>0 → /agile auto | ✅ `/agile auto` |

### 2-1단계: 부분 완료 상태 판단 기준

**기획 완료 기준** (Socrates 기준 7개 문서):
- `01-prd.md`, `02-trd.md`, `03-uxd.md`, `04-database-design.md`, `05-resources.md`, `06-tasks.md`, `07-acceptance-criteria.md`
- 7개 미만 → "기획 진행 중"

**거버넌스 완료 기준** (5개 산출물):
- `management/project-plan.md` (PM)
- `management/decisions/ADR-*.md` 4개 이상 (Architect)
- `design/system/*.md` 4개 이상 (Designer)
- `management/quality-gates.md` (QA)
- `database/standards.md` (DBA)
- 일부만 존재 → "거버넌스 진행 중"

### 3단계: 맞춤 추천 + 사용자 확인

진단 결과에 따라 **AskUserQuestion**으로 확인합니다:

```json
{
  "questions": [
    {
      "question": "프로젝트 상태를 분석했습니다. 다음 단계를 선택하세요:",
      "header": "워크플로우",
      "options": [
        {
          "label": "⭐ [권장] {진단된 최적 스킬}",
          "description": "{해당 스킬이 적합한 이유}"
        },
        {
          "label": "{대안 스킬 1}",
          "description": "{대안 설명}"
        },
        {
          "label": "{대안 스킬 2}",
          "description": "{대안 설명}"
        }
      ],
      "multiSelect": false
    }
  ]
}
```

---

## 🎯 핵심 의사결정 트리 (Standalone v4.9)

```
시작
│
├─ orchestrate-state.json 존재 AND 미완료(in_progress/pending) 태스크 있음? ── YES → /recover
│   ↳ 레거시·신규 경로 모두 확인 / 완료된 state 파일은 오탐 방지로 건너뜀
│
├─ git merge conflicts 존재? (git diff --diff-filter=U) ─── YES → /recover
│   ↳ dirty working tree(미커밋 변경)는 정상 개발 상태 — /recover 트리거 아님
│
│
├─ TASKS.md 없음?
│   ├─ 레거시(06-tasks.md) 있음 ───────── /tasks-migrate (통합)
│   └─ 레거시도 없음 ─────────────────── /tasks-init (스캐폴딩)
│
├─ 기존 코드베이스? (src/·app/·lib/에 실제 파일 존재) + AGENT_COUNT=0 + GOVERNANCE_DONE=no?
│   ├─ 미완료 태스크 있음 ─────────────── /agile iterate   ← ③ 유지보수
│   └─ 모든 태스크 완료 ─────────────── /audit
│   ↳ AGENT_COUNT>0 또는 GOVERNANCE_DONE=yes 이면 이 분기 건너뜀
│
├─ 태스크 있음 + 미완료 있음 + 거버넌스 권장 조건 충족 + 거버넌스 없음? ── YES → /governance-setup
│
├─ 거버넌스 완료 + 태스크 30개+ + .claude/agents/ 없음 + 미완료 있음? ── YES → project-team/install.sh --mode standard
│
├─ 구현 시작?
│   ├─ ≤30개 태스크 ──────────────────── /agile auto
│   ├─ 30~80개 태스크 ───────────────── /orchestrate-standalone
│   ├─ 80~200개 (자율 병렬 실행) ──────── /orchestrate-standalone --mode=wave
│   ├─ 200개+ 태스크 ───────────────── 하위 프로젝트 분할 → wave
│   └─ 수정/변경 ─────────────────────── /agile iterate
│
├─ 검증 필요?
│   ├─ 보안 검사 ─────────────────────── /security-review
│   ├─ 종합 감사 ─────────────────────── /audit
│   └─ 심층 리뷰 ─────────────────────── /multi-ai-review
│
├─ 분석 필요?
│   ├─ 영향도 ────────────────────────── /impact
│   ├─ 의존성 ────────────────────────── /deps
│   ├─ 커버리지 ──────────────────────── /coverage
│   └─ 아키텍처 ──────────────────────── /architecture
│
└─ 구현 완료?
    │
    ├─ 태스크 완료 ───────────────────── /checkpoint
    ├─ Phase 완료 ───────────────────── /audit
    └─ 배포 전 ──────────────────────── /multi-ai-review
```

---

## 📊 태스크 규모별 구현 스킬 선택

| 태스크 수 | 권장 스킬 | 코드 작성 주체 | 에이전트 팀 | 선행 스킬 |
|-----------|-----------|---------------|------------|-----------|
| **1~10개** | `/agile run` + `/agile done` | Claude 직접 | ❌ 불필요 | - |
| **10~30개** | `/agile auto` | Claude 직접 | ❌ 불필요 | - |
| **30~80개** | `/orchestrate-standalone` | 전문가 에이전트 | ✅ 선택 | `/governance-setup` |
| **50~200개** | `/orchestrate-standalone --mode=sprint` | Agile 스프린트 에이전트 | ✅ 선택 | `/governance-setup` |
| **80~200개** | `/orchestrate-standalone --mode=wave` | 도메인 병렬 에이전트 | ✅ 권장 | `/governance-setup` |
| **200개+** | 하위 프로젝트 분할 → `/orchestrate-standalone --mode=wave` | 도메인 병렬 에이전트 | ✅ 필수 | `/governance-setup` |

> **Sprint vs Wave 선택 기준**: `--mode=sprint`은 Human-in-the-loop 리뷰가 필요할 때 (각 스프린트 경계에서 사용자 승인), `--mode=wave`는 완전 자율 도메인 병렬 실행 시 사용합니다.
>
> **v2.0 Hybrid Wave Architecture**: 80개 이상 태스크는 `--mode=wave`로 Contract-First + 도메인 병렬 + Cross-Review 게이트를 적용하여 대규모에서도 일관성을 보장합니다.

### 거버넌스 권장 기준 (실행 규모와 별개)

아래 조건을 만족하면 **구현 전에** 거버넌스(Phase 0)를 권장합니다:

- **태스크 수: 10개 이상** AND 아래 중 1개 이상
  - 도메인 수: 2개 이상
  - 팀원 수: 2명 이상
  - 외부 API: 3개 이상

**거버넌스 권장 경로 (Standalone):**
```
/tasks-init → /governance-setup → /agile auto (≤30)
```

---

## 🔗 스킬 간 연동 매트릭스 (v2.1)

### 성공 경로 (Happy Path)

```
/governance-setup (Mini-PRD 기획)
    ↓
/tasks-init (TASKS.md 스캐폴딩)
    ↓
┌─────────────────────────────────────────────────────────┐
│ 규모 판단 → 경로 분기                                    │
│                                                         │
│ 📦 소규모 (≤30개)                                        │
│   └─ /agile auto (Claude 직접 작성)                     │
│                                                         │
│ 🏢 중규모 (30~80개)                                      │
│   └─ /orchestrate-standalone (의존성 기반 병렬 실행)                │
│                                                         │
│ 🏃 스프린트 (50~200개) - 사용자 리뷰 게이트 필요         │
│   └─ /orchestrate-standalone --mode=sprint                        │
│       Agile PI 계획 → 스프린트 실행 → 리뷰 게이트       │
│                                                         │
│ 🌊 대규모 (80~200개) - Hybrid Wave Architecture          │
│   └─ /orchestrate-standalone --mode=wave                          │
│       Phase 0: Contract-First (계약 확정)               │
│       Phase 1: Domain Parallelism (병렬 실행)           │
│       Phase 2: Cross-Review Gate (상호 검토)            │
│       Phase 3: Integration & Polish (통합)              │
│                                                         │
│ 🏛️ 거버넌스 (태스크 10+ + 복잡/협업 조건)                │
│   └─ /governance-setup (Phase 0: PM/Architect/QA/DBA)   │
│       ↓                                                 │
│   └─ 규모에 따라 /agile auto 또는 /orchestrate-standalone --mode=wave │
└─────────────────────────────────────────────────────────┘
    ↓
/checkpoint (태스크 완료 시 리뷰)
    ↓
/security-review (보안 검사)
    ↓
/audit (배포 전 종합 감사)
    ↓
/multi-ai-review (심층 검토)
    ↓
배포 ✅
```

### 레거시 프로젝트 경로

```
기존 코드베이스
    ↓
/tasks-migrate (레거시 태스크 통합)
    ↓
/agile iterate (반복 개선)
    ↓
/audit (종합 감사)
```

### 실패 복구 경로

| 실패 상황 | 복구 스킬 | 다음 단계 |
|-----------|-----------|-----------|
| CLI 중단 | `/recover` | 이전 스킬 재개 |
| 리뷰 실패 | `/agile iterate` | `/checkpoint` |
| 품질 게이트 실패 | `/agile iterate` | 수정 후 재검증 |
| 기획 불명확 | `/governance-setup` | `/tasks-init` |
| 컨텍스트 과부하 | `/compress` | 최적화 후 재시도 |

---

---

## 💡 자연어 → 스킬 빠른 매핑

```
"뭐부터 해야 할지 모르겠어"     → /workflow
"기획서 있는데 코딩 시작해줘"   → /agile auto
"이 기능 수정해줘"              → /agile iterate
"코드 검토해줘"                 → /checkpoint  (빠른 2단계 리뷰)
"리뷰해줘"                      → /checkpoint  (빠른 리뷰; 심층이면 /multi-ai-review)
"심층 리뷰해줘"                 → /multi-ai-review
"council 소집해줘"              → /multi-ai-review
"여러 AI 의견 들어보자"         → /multi-ai-review
"보안 검사해줘"                 → /security-review
"품질 검사해줘"                 → /audit
"작업이 중단됐어"               → /recover
"대규모 프로젝트야"             → /governance-setup → /agile auto (반복)
"거버넌스 셋업"                 → /governance-setup
"프로젝트 팀 구성"              → /governance-setup
"멀티 AI로 실행"                → /multi-ai-run
"Codex로 코드 작성"             → /multi-ai-run --model=codex
"Gemini로 디자인"               → /multi-ai-run --model=gemini
"컨텍스트 압축해줘"             → /compress
"문서가 너무 길어"              → /compress optimize
"context overflow"              → /compress
"스프린트로 실행해줘"           → /orchestrate-standalone --mode=sprint
"사용자 리뷰 게이트 원해"       → /orchestrate-standalone --mode=sprint
"협업 버스 초기화"              → node project-team/scripts/collab-init.js
"콜랩 인프라 셋업"              → node project-team/scripts/collab-init.js
"Wave Barrier 확인"             → node project-team/scripts/conflict-resolver.js
"REQ 충돌 해결"                 → node project-team/scripts/conflict-resolver.js --auto-escalate
"에이전트 통신 프로토콜"        → project-team/references/communication-protocol.md
"REQ/DEC 프로토콜"              → project-team/references/communication-protocol.md
"ChiefArchitect 중재 요청"      → REQ 파일 ESCALATED → ChiefArchitect DEC 파일 생성
"도메인 규칙 강제"              → domain-boundary-enforcer.js (project-team/hooks/)
"교차 도메인 쓰기 차단"         → domain-boundary-enforcer.js PreToolUse 훅
"칸반 보드 보여줘"              → /task-board show
"보드 보여줘"                   → /task-board show
"태스크 보드"                   → /task-board show
"보드 다시 만들어"              → /task-board rebuild
"blocked 태스크 확인"           → /task-board health
"에이전트 진행 상황 시각화"     → /task-board show
```

---

## 🔒 품질 게이트 체크리스트 (v4.2.0)

모든 구현 완료 후 반드시 거쳐야 하는 게이트:

| 게이트 | 필수 스킬 | 통과 기준 |
|--------|-----------|-----------|
| **G0: 태스크 리뷰** | `/checkpoint` | 2단계 리뷰 통과 |
| **G1: 종합 감사** | `/audit` | 기획 정합성 + DDD + 보안 + 테스트/브라우저 |
| **G2: 심층 검토** | `/multi-ai-review` | Multi-AI 합의 (선택적) |

---

## 🪝 Hook 시스템 연동 (project-team)

`project-team/hooks/` 내장 Hook이 워크플로우를 자동화합니다:

| Hook | 효과 |
|------|------|
| `task-sync.js` | 태스크 완료 시 TASKS.md 자동 업데이트 |
| `quality-gate.js` | Phase 완료 전 품질 검증 |
| `permission-checker.js` | 에이전트 역할별 파일 접근 제어 |
| `domain-boundary-enforcer.js` | PreToolUse 단계에서 교차 도메인 쓰기 차단 |
| `design-validator.js` | 디자인 시스템 준수 검증 |

### Hook 설치

```bash
# project-team 설치 스크립트 실행 (claude-imple-skills 클론 디렉토리 내 project-team/ 에서 실행)
cd project-team && ./install.sh --mode standard
```

---

## 🆘 도움말 & FAQ

### Q: 어떤 스킬을 써야 할지 모르겠어요
A: `/workflow`를 실행하면 프로젝트 상태를 자동 분석하여 최적의 스킬을 추천합니다.

### Q: 여러 스킬을 동시에 실행해도 되나요?
A: 권장하지 않습니다. 각 스킬은 순차적으로 실행하고, 완료 후 다음 스킬로 넘어가세요.

### Q: 스킬 실행 중 에러가 발생하면?
A: `/recover`를 실행하여 중단된 작업을 복구하세요.

### Q: 대규모 프로젝트는 어떻게 관리하나요?
A: 태스크 규모와 리뷰 필요 여부에 따라:
- **50~200개 (사용자 리뷰 필요)**: `/orchestrate-standalone --mode=sprint`. Agile PI 계획 + 스프린트 경계마다 사용자 승인 게이트.
- **80~200개 (완전 자율 실행)**: `/orchestrate-standalone --mode=wave`. Contract-First + 도메인 병렬 + Cross-Review로 일관성 보장.
- **200개+**: 하위 프로젝트로 분할 후 각각 wave 모드 적용.
- 구현 전 `/governance-setup`으로 거버넌스(PM/Architect/QA/DBA) 문서 생성 권장.

### Q: 거버넌스와 에이전트 팀의 차이는?
A: `/governance-setup`은 **거버넌스 팀**(PM, Architect, Designer, QA, DBA)이 표준/정책 문서를 생성합니다. 소규모(≤30개)는 `/agile auto`가 Claude 직접 작성 방식이라 거버넌스 없이도 됩니다.

---

### Q: 문서가 너무 길어서 처리가 안 돼요
A: `/compress`를 사용하여 H2O 패턴으로 핵심 정보를 추출하세요. `--llm` 옵션으로 더 정밀한 요약도 가능합니다.

---

**Last Updated**: 2026-03-06 (v4.9.3 - ① 복구 체크 강화: grep -q OR 판정으로 교체, S6 시나리오 분리(state/merge), S2-running 전제 조건 명확화, 결정 트리 merge conflict 추가·sprint 제거)
