---
name: workflow-guide
description: 여러 플러그인 중 상황에 맞는 워크플로우를 안내합니다. /workflow, "어떤 스킬을 써야 해?", "워크플로우 추천" 트리거.
trigger: /workflow, /workflow-guide, "뭐해야해?", "어떤 스킬", "워크플로우 추천"
version: 4.0.0
updated: 2026-03-03

---

# 🧭 워크플로우 선택 가이드 (Meta Hub)

> **목적**: 상황에 맞는 최적의 스킬을 **단 하나만** 추천하는 메타 허브입니다.
>
> **⚠️ 핵심 원칙**: 이 스킬은 **구현 코드를 작성하지 않습니다**. 오직 **상황 진단 → 스킬 추천 → 사용자 확인**만 수행합니다.
>
> **v4.0.0**: Standalone-first 아키텍처로 완전한 파이프라인 제공.

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

## 📊 Standalone 스킬 카탈로그 (14개)

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
/orchestrate --tmux    # tmux 병렬 모드 활성화
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

# 3. 코드 베이스 확인
ls package.json pyproject.toml requirements.txt 2>/dev/null

# 4. 중단된 작업 확인
ls .claude/orchestrate-state.json 2>/dev/null
cat .claude/orchestrate-state.json 2>/dev/null | head -5

# 5. Git 상태 확인
git status --short 2>/dev/null | head -10
git worktree list 2>/dev/null

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

# 9. 에이전트 팀 확인 (v3.1.1 NEW)
ls .claude/agents/*.md 2>/dev/null | wc -l  # 3개 이상이면 팀 구성됨
```

### 2단계: 상황별 진단 결과 매핑

**진단 우선순위** (위에서 아래로 먼저 매칭되는 것 적용):

| 진단 결과 | 프로젝트 단계 | 권장 스킬 |
|-----------|---------------|-----------|
| orchestrate-state.json 존재 | 🔄 **자동화 중단** | `/recover` → `/orchestrate --resume` |
| Git 충돌/dirty 상태 | ⚠️ **복구 필요** | `/recover` |
| 아이디어만 있음 | 💡 **기획 시작** | `/governance-setup` (Mini-PRD 내장) |
| docs/planning/ 없음 | 🌱 **기획 필요** | `/governance-setup` |
| 기획 있음 + TASKS.md 없음 + 레거시(06-tasks.md)만 존재 | 📋 **마이그레이션 필요** | `/tasks-migrate` (루트 TASKS.md로 통합) |
| 기획 있음 + 태스크 파일 없음 | 📋 **태스크 필요** | `/tasks-init` |
| 태스크 있음 + **거버넌스 권장 조건 충족** + 거버넌스 없음 | 🏛️ **거버넌스 필요** | `/governance-setup` |
| 거버넌스 완료 + 미구현 | 🚀 **구현 준비** | `/agile auto` (≤30) 또는 `/orchestrate` (30~80) |
| 태스크 있음 + 코드 없음 (소규모) | 🚀 **구현 준비** | `/agile auto` (≤30) |
| 코드 있음 + 미완료 태스크 | 🔨 **구현 중** | `/agile iterate` 또는 `/orchestrate --resume` |
| 모든 태스크 완료 | ✅ **검증 필요** | `/audit` |

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

## 🎯 핵심 의사결정 트리 (Standalone v4.2)

```
시작
│
├─ 작업 중단됨? ─────────────────────── YES → /recover
│
├─ 기획 문서 없음? ─────────────────── YES → /governance-setup (Mini-PRD 내장)
│
├─ TASKS.md 없음?
│   ├─ 레거시 파일만 있음 ───────────── /tasks-migrate (통합)
│   └─ 태스크 파일 없음 ─────────────── /tasks-init (스캐폴딩)
│
├─ 구현 시작?
│   ├─ ≤30개 태스크 ──────────────────── /agile auto
│   ├─ 30~80개 태스크 ───────────────── /orchestrate
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
| **30~80개** | `/orchestrate` | 전문가 에이전트 | ✅ 권장 | `/governance-setup` |
| **80개+** | 30개 단위 스프린트 분할 (`/agile auto` 반복) | Claude 직접 | ❌ 불필요 | - |

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
│   └─ /orchestrate (의존성 기반 병렬 실행)                │
│                                                         │
│ 🏛️ 거버넌스 (태스크 10+ + 복잡/협업 조건)                │
│   └─ /governance-setup (Phase 0: PM/Architect/QA/DBA)   │
│       ↓                                                 │
│   └─ 30개 단위 스프린트 분할 → /agile auto 반복          │
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

---

---

## 💡 자연어 → 스킬 빠른 매핑

```
"뭐부터 해야 할지 모르겠어"     → /workflow
"기획서 있는데 코딩 시작해줘"   → /agile auto
"이 기능 수정해줘"              → /agile iterate
"코드 검토해줘"                 → /checkpoint
"리뷰해줘"                      → /checkpoint
"보안 검사해줘"                 → /security-review
"품질 검사해줘"                 → /audit
"작업이 중단됐어"               → /recover
"대규모 프로젝트야"             → /governance-setup → /agile auto (반복)
"거버넌스 셋업"                 → /governance-setup
"프로젝트 팀 구성"              → /governance-setup
"멀티 AI로 실행"                → /multi-ai-run
"Codex로 코드 작성"             → /multi-ai-run --model=codex
"Gemini로 디자인"               → /multi-ai-run --model=gemini
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
| `design-validator.js` | 디자인 시스템 준수 검증 |

### Hook 설치

```bash
# project-team 설치 스크립트 실행
./project-team/install.sh
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
A: 태스크가 **10개 이상**이고(특히 **2+도메인/2+팀원/외부 API 3+** 등 복잡·협업 조건이면) 구현 전에 `/governance-setup`을 먼저 권장합니다. 구현 실행은 30개 단위 스프린트로 분할하여 `/agile auto`를 반복하세요.

### Q: 거버넌스와 에이전트 팀의 차이는?
A: `/governance-setup`은 **거버넌스 팀**(PM, Architect, Designer, QA, DBA)이 표준/정책 문서를 생성합니다. 소규모(≤30개)는 `/agile auto`가 Claude 직접 작성 방식이라 거버넌스 없이도 됩니다.

---

**Last Updated**: 2026-03-03 (v4.2.0 - Standalone-first, 14개 핵심 스킬)
