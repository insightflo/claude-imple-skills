---
name: workflow-guide
description: 여러 플러그인 중 상황에 맞는 워크플로우를 안내합니다. /workflow, "어떤 스킬을 써야 해?", "워크플로우 추천" 트리거.
version: 3.3.0
updated: 2026-03-01
---

# 🧭 워크플로우 선택 가이드 (Meta Hub)

> **목적**: 64개 스킬(바이브랩 46개 + Editor-K 6개 + 우리스킬 12개) 중 현재 상황에 가장 적합한 스킬을 **단 하나만** 추천하는 메타 허브입니다.
>
> **⚠️ 핵심 원칙**: 이 스킬은 **코드를 작성하지 않습니다**. 오직 **상황 진단 → 스킬 추천 → 사용자 확인**만 수행합니다.
>
> **v3.2.0 업데이트**: v1.10.0 신규 스킬 11개 추가, tmux 병렬 모드, 에로스 사이클 연동

---

## 📊 전체 스킬 카탈로그 (64개)

### 우리스킬 (12개) - 프로젝트 확장

| 스킬 | 트리거 | 고유 역할 |
|------|--------|-----------|
| **`/workflow`** | `/workflow`, "뭐해야해?" | 메타 허브 - 스킬 라우팅 |
| **`/agile`** | `/agile auto`, `/agile iterate` | 레이어 기반 스프린트 (Skeleton→Muscles→Skin) |
| **`/recover`** | `/recover`, "작업 복구" | 범용 복구 허브 |
| **`/audit`** | `/audit`, "품질 검사" | 배포 전 종합 감사 (DDD/테스트/브라우저/보안) |
| **`/security-review`** | `/security-review --deep`, "보안 검사" | **보안 취약점 분석 (OWASP TOP 10)** **(v3.3 NEW)** |
| **`/multi-ai-review`** | `/multi-ai-review`, "심층 리뷰" | Claude+Gemini+GLM 3중 검증 |
| **`/governance-setup`** | `/governance-setup`, "거버넌스 구성" | 대규모 프로젝트 Phase 0 거버넌스 **(v3.1 NEW)** |
| **`/impact`** | `/impact <file>`, "영향도 분석" | 파일 변경 전 의존성/위험도 분석 |
| **`/deps`** | `/deps`, "의존성 그래프" | 순환 감지, Mermaid 시각화 |
| **`/changelog`** | `/changelog`, "변경 이력" | 기간/도메인/유형별 필터링 |
| **`/coverage`** | `/coverage`, "테스트 커버리지" | 미커버 영역, 트렌드 |
| **`/architecture`** | `/architecture`, "아키텍처 맵" | 도메인 구조, API 카탈로그 |

### Editor-K 스킬 (6개) - 글쓰기/편집

| 스킬 | 트리거 | 고유 역할 |
|------|--------|-----------|
| **`/draft-assist`** | `/draft-assist` | 초안 작성 지원 (질문으로 유도) |
| **`/red-pen`** | `/red-pen` | 편집장 K의 빨간펜 (16가지 기준 교정) |
| **`/research`** | `/research` | 주제 기반 자료 수집 (4종 카테고리) |
| **`/soul-drill`** | `/soul-drill` | 영혼 굴착기 (Why 질문으로 진짜 이야기 발굴) |
| **`/structure`** | `/structure` | 글 구조 설계 (도입-전개-결론) |
| **`/style-learn`** | `/style-learn` | 작가 스타일 학습 (25개 항목 프로파일) |

### 바이브랩스킬 (46개) - 핵심 기능

#### 💡 아이디어 & 브레인스토밍

| 스킬 | 용도 |
|------|------|
| `/neurion` | AI 브레인스토밍 (Osborn 4원칙, 4 AI 페르소나) |
| `/eureka` | 추상적 아이디어 → 구체적 MVP 변환 |

#### 🔮 결핍 인식 & 비판적 사고 **(v1.10.0 NEW!)**

| 스킬 | 용도 |
|------|------|
| `/eros` | 디오티마 사다리 6계층 추상화 (결핍→패턴→규칙→전이→메타→이데아) |
| `/poietes` | 에로스 기획 v2 (결핍→욕망→다이몬→출산), 소크라테스 21개 질문 재배열 |
| `/common-ground` | AI 가정 투명화 (4가지 가정 유형, 3단계 신뢰 등급) |
| `/the-fool` | 비판적 사고 5모드 (가정 노출, 반대 논증, 실패 모드, 레드팀, 증거 검증) |

#### 🎨 기획 & 설계

| 스킬 | 용도 |
|------|------|
| `/socrates` | 1:1 기획 컨설팅 (21개 질문 → 7개 문서 생성) |
| `/screen-spec` | 화면별 상세 명세 (YAML v2.0) |
| `/design-linker` | 목업 이미지 ↔ TASKS.md 연결 |
| `/movin-design-system` | 다크모드 + 네온 디자인 시스템 |
| `/paperfolio-design` | 클린/볼드/모던 포트폴리오 디자인 |
| `/reverse` | 기존 코드 → 명세 역추출 |

#### 📝 태스크 & 목표

| 스킬 | 용도 |
|------|------|
| `/tasks-generator` | TASKS.md 생성 (Domain-Guarded 구조) |
| `/goal-setting` | 목표 관리 및 진행 모니터링 |

#### 🛠️ 구현 & 자동화

| 스킬 | 용도 | 규모 |
|------|------|------|
| `/auto-orchestrate` | 의존성 기반 자동 실행 (`--tmux` 병렬 모드 지원) | 30~50개 |
| `/ultra-thin-orchestrate` | 초경량 오케스트레이션 (`--tmux` 병렬 모드 지원) | 50~200개 |
| `/ralph-loop` | 자율 반복 루프 (완료까지) | 에러 반복 시 |
| `/project-bootstrap` | 에이전트 팀 + 프로젝트 셋업 | 초기 1회 |
| `/project-bootstrap-supabase` | Next.js + Supabase + Vercel CI/CD 원커맨드 셋업 **(v1.10.0 NEW!)** | 초기 1회 |
| `/desktop-bridge` | Desktop↔CLI 하이브리드 워크플로우 |
| `/cost-router` | AI 비용 40-70% 절감 라우팅 |

#### 🔍 검증 & 품질

| 스킬 | 시점 | 범위 |
|------|------|------|
| `/code-review` | 태스크/기능 완료 | 2단계 리뷰 (Spec→Quality) |
| `/evaluation` | Phase 완료 | 메트릭 측정 + 품질 게이트 |
| `/trinity` | Phase 완료/PR 전 | 五柱 철학 기반 품질 평가 **(v1.8.1 NEW!)** |
| `/powerqa` | 테스트 자동화 | 자동 QA 사이클링 **(v1.8.1 NEW!)** |
| `/sync` | 개발 중간 | 명세-코드 동기화 검증 **(v1.8.1 NEW!)** |
| `/vercel-review` | 프론트엔드 | React/Next.js 성능 최적화 |
| `/verification-before-completion` | 모든 완료 선언 전 | 검증 명령어 실행 필수 |
| `/systematic-debugging` | 버그 발생 시 | 4단계 근본 원인 분석 |
| `/guardrails` | 코드 생성 시 | 보안 패턴 자동 검사 |

#### 🔬 리서치 & 지식

| 스킬 | 용도 |
|------|------|
| `/deep-research` | 5개 API 병렬 검색 |
| `/rag` | Context7 기반 최신 문서 검색 |
| `/memory` | 세션 간 학습 지속 |
| `/reasoning` | CoT, ToT, ReAct 추론 |
| `/reflection` | 자기 성찰 패턴 |

#### ⚡ 기술 스택

| 스킬 | 용도 |
|------|------|
| `/react-19` | React 19 컴포넌트/훅 |
| `/fastapi-latest` | FastAPI 백엔드 |

#### 👨‍💻 전문가 스킬 **(v1.10.0 NEW!)**

| 스킬 | 용도 |
|------|------|
| `/python-pro` | Python 3.11+ 전문가 (타입힌트, async/await, pytest) |
| `/typescript-pro` | TypeScript 5.x 전문가 (제네릭, 유틸리티 타입, satisfies) |
| `/golang-pro` | Go 동시성 전문가 (goroutine, channel, 인터페이스) |
| `/kubernetes-specialist` | K8s 워크로드, 서비스, Helm, GitOps |
| `/terraform-engineer` | Terraform IaC, 멀티클라우드, 모듈 패턴 |
| `/database-optimizer` | 인덱스 전략, 쿼리 최적화, EXPLAIN 분석 |

#### 🔧 유틸리티

| 스킬 | 용도 |
|------|------|
| `/chrome-browser` | 브라우저 자동화 |
| `/a2a` | 에이전트 간 통신 프로토콜 |
| `/kongkong2` | 입력 복제로 정확도 향상 |

---

## ⚡ tmux 병렬 실행 모드 **(v1.10.0 NEW!)**

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
/auto-orchestrate --tmux          # tmux 병렬 모드 활성화
/ultra-thin-orchestrate --tmux    # 초경량 병렬 모드
```

### 언제 사용하나?

- **50개 이상 태스크**: 기존 방식보다 안정적
- **복잡한 의존성 트리**: 격리된 실행으로 부작용 방지
- **장시간 실행**: 개별 프로세스 로그 추적 가능

---

## 🔄 에로스 사이클 연동 **(v1.10.0 NEW!)**

### 연동 관계

```
/common-ground (가정 투명화)
    ↓ 가정 목록 → 결핍 후보
/eros (디오티마 사다리)
    ↓ 결핍 6계층 분석
/poietes (에로스 기획 v2)
    ↓ 4 Phase: 결핍→욕망→다이몬→출산
/socrates (기획 문서화)
    ↓ 21개 질문 → 7개 문서
/the-fool (비판적 검증)
    └ 가정 노출, 레드팀
```

### 권장 워크플로우

| 시나리오 | 권장 경로 |
|----------|----------|
| 아이디어만 있음 | `/neurion` → `/eros` → `/poietes` → `/socrates` |
| 기획 검증 필요 | `/common-ground` → `/the-fool` → `/eros` |
| 기존 기획 보완 | `/eros` (결핍 분석) → `/poietes` (재기획) |

---

## ⛔ 절대 금지 사항

1. ❌ **직접 코드를 작성하지 마세요** - 워크플로우 안내만 합니다.
2. ❌ **모든 스킬을 나열하지 마세요** - 상황에 맞는 **1~2개만** 추천합니다.
3. ❌ **사용자에게 먼저 묻지 마세요** - 프로젝트 상태를 **먼저 자동 진단**합니다.

---

## ✅ 스킬 발동 시 즉시 실행할 행동

### 1단계: 프로젝트 상태 자동 진단 (Silent Analysis)

**사용자에게 묻기 전에 현재 상태를 파악합니다:**

```bash
# 1. 기획 문서 확인
ls docs/planning/*.md 2>/dev/null

# 2. 태스크 파일 확인
ls docs/planning/06-tasks.md 2>/dev/null

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

# 7. 기획 문서 개수 확인 (v3.1.1 NEW)
ls docs/planning/*.md 2>/dev/null | wc -l  # 6개면 완료

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
| orchestrate-state.json 존재 | 🔄 **자동화 중단** | `/recover` → `/auto-orchestrate --resume` |
| Git 충돌/dirty 상태 | ⚠️ **복구 필요** | `/recover` |
| 아이디어만 있음 | 💡 **브레인스토밍** | `/neurion` → `/socrates` |
| docs/planning/ 없음 | 🌱 **기획 시작** | `/socrates` |
| docs/planning/ 일부만 존재 (1~5개) | 📝 **기획 진행 중** | `/socrates` (이어서 진행) |
| 기존 코드만 있음 (명세 없음) | 🔄 **역추출 필요** | `/reverse` |
| 기획 있음 + 06-tasks.md 없음 | 📋 **기획 완료** | `/tasks-generator` |
| 태스크 있음 + 대규모 + 거버넌스 없음 | 🏛️ **거버넌스 필요** | `/governance-setup` |
| 거버넌스 일부만 존재 | 🏛️ **거버넌스 진행 중** | `/governance-setup` (이어서 진행) |
| 거버넌스 완료 + 에이전트 팀 없음 | 👥 **팀 구성 필요** | `/project-bootstrap` |
| 거버넌스 + 에이전트 팀 있음 + 미구현 | 🚀 **구현 준비** | `/auto-orchestrate` |
| 태스크 있음 + 코드 없음 (소규모) | 🚀 **구현 준비** | `/agile auto` (≤30) |
| 코드 있음 + 미완료 태스크 | 🔨 **구현 중** | `/agile iterate` 또는 `/auto-orchestrate --resume` |
| 모든 태스크 완료 | ✅ **검증 필요** | `/trinity` → `/audit` |

### 2-1단계: 부분 완료 상태 판단 기준

**기획 완료 기준** (6개 문서):
- `01-prd.md`, `02-trd.md`, `03-uxd.md`, `04-database-design.md`, `05-resources.md`, `06-tasks.md`
- 6개 미만 → "기획 진행 중"

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

## 🎯 핵심 의사결정 트리 (v3.1)

```
시작
│
├─ 작업 중단됨? ─────────────────────── YES → /recover
│
├─ 아이디어만 있음? ─────────────────── YES → /neurion → /eros → /poietes → /socrates
│                                             (또는 바로 /socrates)
│
├─ 기획 문서 있음? ─────────────────── NO
│   │                                      └─ 신규 프로젝트: /socrates
│   │                                      └─ 기존 코드만: /reverse
│   │
│   └─ YES → TASKS.md 있음? ─────────── NO → /tasks-generator
│                                            (UI 상세화: /screen-spec)
│
├─ 대규모 프로젝트? ─────────────────── YES (10+태스크, 2+도메인)
│   │                                      ↓
│   │                                  /governance-setup (Phase 0)
│   │                                      ↓
│   │                                  /project-bootstrap (에이전트 팀)
│   │                                      ↓
│   └───────────────────────────────── /auto-orchestrate
│
├─ 코드베이스 있음?
│   │
│   ├─ 신규 구현? ──────────────────── ≤30개: /agile auto (에이전트 팀 불필요)
│   │                                   30~50개: /project-bootstrap → /auto-orchestrate
│   │                                   50~200개: /project-bootstrap → /ultra-thin-orchestrate
│   │
│   ├─ 수정/변경? ──────────────────── /agile iterate
│   │
│   ├─ 명세 드리프트? ─────────────── /sync
│   │
│   └─ 버그 수정? ──────────────────── /systematic-debugging
│
└─ 구현 완료?
    │
    ├─ 기능 단위 ────────────────────── /code-review
    ├─ Phase 완료 ───────────────────── /trinity → /evaluation → /audit
    ├─ QA 자동화 ────────────────────── /powerqa
    └─ 배포 전 ──────────────────────── /multi-ai-review → /verification-before-completion
```

---

## 📊 태스크 규모별 구현 스킬 선택

| 태스크 수 | 권장 스킬 | 코드 작성 주체 | 에이전트 팀 | 선행 스킬 |
|-----------|-----------|---------------|------------|-----------|
| **1~10개** | `/agile run` + `/agile done` | Claude 직접 | ❌ 불필요 | - |
| **10~30개** | `/agile auto` | Claude 직접 | ❌ 불필요 | - |
| **30~50개** | `/auto-orchestrate` | 전문가 에이전트 | ✅ 권장 | `/project-bootstrap` |
| **50~200개** | `/ultra-thin-orchestrate` | 전문가 에이전트 | ✅ 필수 | `/project-bootstrap` |
| **에러 반복** | `/ralph-loop` | 자기 참조 학습 | - | - |
| **QA 사이클** | `/powerqa` | 테스트 자동화 | - | - |

### 대규모 프로젝트 추가 기준 (거버넌스 팀 권장)

| 조건 | 기준 | 권장 스킬 |
|------|------|-----------|
| 태스크 수 | 10개 이상 | `/governance-setup` |
| 도메인 수 | 2개 이상 | `/governance-setup` |
| 팀원 수 | 2명 이상 | `/governance-setup` |
| 외부 API | 3개 이상 | `/governance-setup` |

**대규모 프로젝트 권장 경로:**
```
/tasks-generator → /governance-setup → /project-bootstrap → /auto-orchestrate
```

---

## 🔗 스킬 간 연동 매트릭스 (v2.1)

### 성공 경로 (Happy Path)

```
/neurion (아이디어 폭발)
    ↓
/socrates (기획 문서화)
    ↓
/screen-spec (화면 명세)
    ↓
/tasks-generator
    ↓
┌─────────────────────────────────────────────────────────┐
│ 규모 판단 → 경로 분기                                    │
│                                                         │
│ 📦 소규모 (≤30개)                                        │
│   └─ /agile auto (Claude 직접 작성, 에이전트 팀 불필요)  │
│                                                         │
│ 🏢 중규모 (30~50개)                                      │
│   └─ /project-bootstrap → /auto-orchestrate             │
│                                                         │
│ 🏛️ 대규모 (50+개 또는 2+도메인)                          │
│   └─ /governance-setup (Phase 0: PM/Architect/QA/DBA)   │
│       ↓                                                 │
│   └─ /project-bootstrap (에이전트 팀 생성)              │
│       ↓                                                 │
│   └─ /auto-orchestrate --ultra-thin                     │
│                                                         │
│ ┌─ 개발 중간: /sync (명세 동기화) ─┐                     │
│ └─ 비용 최적화: /cost-router ─────┘                     │
└─────────────────────────────────────────────────────────┘
    ↓
/code-review (기능 단위)
    ↓
/trinity (五柱 품질 평가)
    ↓
/evaluation (Phase 완료)
    ↓
/audit (배포 전 종합 감사)
    ↓
/multi-ai-review (심층 검토)
    ↓
/verification-before-completion
    ↓
배포 ✅
```

### 레거시 프로젝트 경로 (v1.8.1 NEW!)

```
기존 코드베이스
    ↓
/reverse (코드 → 명세 역추출)
    ↓
specs/screens/*.yaml 생성
    ↓
/socrates (기획 보완)
    ↓
/tasks-generator
    ↓
일반 워크플로우...
```

### 하이브리드 워크플로우 (v1.8.1 NEW!)

```
[Claude Desktop]              [Claude Code CLI]
     │                              │
/neurion, /socrates           /auto-orchestrate
/screen-spec                        │
     │                              │
     └──── /desktop-bridge ─────────┘
           (GitHub Issue 연동)
```

### 실패 복구 경로

| 실패 상황 | 복구 스킬 | 다음 단계 |
|-----------|-----------|-----------|
| CLI 중단 | `/recover` | 이전 스킬 재개 |
| 테스트 실패 | `/systematic-debugging` | `/agile iterate` |
| 리뷰 실패 | `/agile iterate` | `/code-review` |
| 품질 게이트 실패 | `/tasks-generator analyze` | 수정 태스크 생성 |
| Trinity 점수 낮음 | `/trinity` 피드백 반영 | `/code-review` |
| 명세-코드 불일치 | `/sync` | 수정 후 재검증 |
| 기획 불명확 | `/socrates` (재실행) | `/tasks-generator` |

---

## 💡 자연어 → 스킬 빠른 매핑

```
"뭐부터 해야 할지 모르겠어"     → /workflow
"아이디어 브레인스토밍"         → /neurion
"아이디어를 정리하고 싶어"      → /socrates
"기존 코드가 있는데 명세가 없어" → /reverse
"기획서 있는데 코딩 시작해줘"   → /agile auto
"이 기능 수정해줘"              → /agile iterate
"명세랑 코드가 맞는지 확인해줘" → /sync
"버그 있어"                     → /systematic-debugging
"코드 검토해줘"                 → /code-review
"품질 점수 측정해줘"            → /trinity
"QA 자동화해줘"                 → /powerqa
"보안 검사해줘"                 → /security-review
"품질 검사해줘"                 → /audit
"작업이 중단됐어"               → /recover
"대규모 프로젝트야"             → /governance-setup → /project-bootstrap → /auto-orchestrate
"에이전트 팀 만들어줘"          → /project-bootstrap
"거버넌스 셋업"                 → /governance-setup
"프로젝트 팀 구성"              → /governance-setup
"배포 전 최종 점검"             → /verification-before-completion
"디자인 시스템 적용"            → /movin-design-system 또는 /paperfolio-design
"화면 명세 상세화"              → /screen-spec
"목업 연결"                     → /design-linker
"리서치 해줘"                   → /deep-research
"React 코드 작성"               → /react-19
"FastAPI 백엔드"                → /fastapi-latest
"AI 비용 줄이고 싶어"           → /cost-router
"Desktop과 CLI 연동"            → /desktop-bridge

# v1.10.0 신규 스킬
"결핍이 뭔지 모르겠어"          → /eros
"기획을 에로스로 검증"          → /poietes
"AI 가정 확인"                  → /common-ground
"비판적으로 검토해줘"           → /the-fool
"Python 전문가 모드"            → /python-pro
"TypeScript 전문가 모드"        → /typescript-pro
"Go 전문가 모드"                → /golang-pro
"K8s 설정"                      → /kubernetes-specialist
"Terraform IaC"                 → /terraform-engineer
"DB 쿼리 최적화"                → /database-optimizer
"Supabase 프로젝트 시작"        → /project-bootstrap-supabase
```

---

## 🔒 품질 게이트 체크리스트 (v2.2)

모든 구현 완료 후 반드시 거쳐야 하는 게이트:

| 게이트 | 필수 스킬 | 통과 기준 |
|--------|-----------|-----------|
| **G1: 기능 검증** | `/code-review` | 2단계 리뷰 통과 |
| **G2: 五柱 평가** | `/trinity` | Trinity Score 70+ |
| **G3: Phase 검증** | `/evaluation` | 품질 메트릭 80% 이상 |
| **G4: 종합 감사** | `/audit` | 기획 정합성 + DDD + TestSprite |
| **G5: 심층 검토** | `/multi-ai-review` | 3개 AI 합의 (선택적) |
| **G6: 최종 검증** | `/verification-before-completion` | 검증 명령어 성공 |

---

## 🪝 Hook 시스템 연동 (v1.9.2)

바이브랩 v1.9.2의 Hook 시스템이 워크플로우를 자동화합니다:

| Hook | 효과 | 절감 |
|------|------|------|
| `skill-router` | 키워드 기반 스킬 자동 감지 → 이 스킬 호출 불필요 | 1K~3K 토큰/프롬프트 |
| `session-memory-loader` | 이전 워크플로우 상태 자동 복원 | 2K~5K 토큰/세션 |
| `context-guide-loader` | Constitution 자동 주입 | 1K~3K 토큰/수정 |
| `error-recovery-advisor` | 실패 시 복구 스킬 자동 제안 | ~1K 토큰/에러 |

### Hook 활성화 확인

```bash
ls ~/.claude/hooks/
# session-memory-loader.js, skill-router.js, context-guide-loader.js, ...
```

---

## 🆘 도움말 & FAQ

### Q: 어떤 스킬을 써야 할지 모르겠어요
A: `/workflow`를 실행하면 프로젝트 상태를 자동 분석하여 최적의 스킬을 추천합니다.

### Q: 여러 스킬을 동시에 실행해도 되나요?
A: 권장하지 않습니다. 각 스킬은 순차적으로 실행하고, 완료 후 다음 스킬로 넘어가세요.

### Q: 스킬 실행 중 에러가 발생하면?
A: `/recover`를 실행하여 중단된 작업을 복구하거나, `/systematic-debugging`으로 원인을 분석하세요.

### Q: 대규모 프로젝트는 어떻게 관리하나요?
A: 50개 이상의 태스크는 `/governance-setup` → `/project-bootstrap` → `/auto-orchestrate --ultra-thin` 순서로 실행하세요. 거버넌스 팀이 표준을 정의하고, 에이전트 팀이 구현을 담당합니다.

### Q: 에이전트 팀은 언제 필요한가요?
A: **30개 이상 태스크** 또는 **2개 이상 도메인**이면 `/project-bootstrap`으로 에이전트 팀을 구성하세요. 소규모(≤30개)는 `/agile auto`가 Claude 직접 작성 방식이라 에이전트 팀 없이도 됩니다.

### Q: governance-setup과 project-bootstrap의 차이는?
A: `/governance-setup`은 **거버넌스 팀**(PM, Architect, Designer, QA, DBA)이 표준/정책 문서를 생성합니다. `/project-bootstrap`은 **구현 에이전트 팀**(backend, frontend, test)과 프로젝트 환경을 셋업합니다.

### Q: 기존 코드가 있는데 명세가 없어요
A: `/reverse`를 실행하여 코드에서 명세를 역추출한 후, `/socrates`로 보완하세요.

### Q: AI 비용이 너무 많이 나와요
A: `/cost-router`가 태스크 복잡도에 따라 적절한 모델을 자동 선택하여 40-70% 비용을 절감합니다.

### Q: eros, poietes, socrates의 차이는? **(v1.10.0 NEW!)**
A:
- `/eros`: 결핍 인식 → 디오티마 사다리 6계층 추상화 (왜 만드는가?)
- `/poietes`: 에로스 4 Phase (결핍→욕망→다이몬→출산) 기획 컨설팅 v2
- `/socrates`: 21개 질문 → 7개 기획 문서 생성 (기존 방식)
권장: `/eros` → `/poietes` → `/socrates` 또는 바로 `/socrates`

### Q: tmux 모드는 언제 쓰나요? **(v1.10.0 NEW!)**
A: 50개 이상 태스크, 복잡한 의존성 트리, 장시간 실행 시 `/auto-orchestrate --tmux` 사용. 각 태스크가 독립 프로세스로 실행되어 격리됩니다.

### Q: 전문가 스킬은 언제 쓰나요? **(v1.10.0 NEW!)**
A: 특정 언어/기술 코드 품질이 중요할 때 `/python-pro`, `/typescript-pro`, `/golang-pro` 등을 사용하세요. Progressive Disclosure로 필요한 지식만 로드합니다.

---

**Last Updated**: 2026-03-01 (v3.3.0 - 64개 스킬: 바이브랩 46개 + Editor-K 6개 + 우리스킬 12개) **(v3.3 NEW: security-review 추가)**
