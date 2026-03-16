---
name: governance-setup
description: 대규모 프로젝트의 Agent Teams 거버넌스 (team-lead + architecture/qa/design leads) 또는 Mini-PRD(소규모)를 설정합니다. 프로젝트 시작 시, 팀 구성이 필요할 때, "거버넌스 구성", "프로젝트 팀 셋업", "에이전트 팀 만들어줘" 요청에 반드시 사용하세요.
version: 1.4.0
updated: 2026-03-03
---

> **v1.4.0**: **Mini-PRD 지원** (Progressive Disclosure + `/audit` 호환), `/project-bootstrap` 의존 제거, 거버넌스 완료 후 **프로젝트 팀 로컬 초기화(standalone)** 경로 추가

# 🏛️ Governance Setup (Phase 0)

> **목적**: 대규모 프로젝트에서 구현 전에 거버넌스 팀이 표준과 품질 기준을 확립합니다.
>
> **🎯 Standalone 목표(중요)**: 이 프로젝트는 **구현을 돕는 스킬 + 에이전트 팀(Project Team)**을 제공하며, **standalone으로 완전히 독립 동작**하는 것을 목표로 합니다.
>
> **⚠️ 핵심 원칙**: 이 스킬은 **구현 코드를 작성하지 않습니다**. 오직 **거버넌스 문서와 표준**만 생성합니다.
>
> **전제 조건**: TASKS.md가 있으면 좋습니다. 없다면 (1) 거버넌스 완료 후 **프로젝트 팀 로컬 초기화(standalone)** 단계에서 **TASKS 스캐폴딩**을 먼저 수행하거나, (선택) 외부 도구/스킬로 TASKS를 생성하세요.
>
> **v1.2.1**: Frontmatter `trigger` 정리, `/audit` 연동 보강, Phase 실행 템플릿 구체화 (v1.3.0에서 standalone 경로 강화)

---

## ⛔ 절대 금지 사항

1. ❌ **구현 코드 작성 금지** - 표준/정책 문서만 작성
2. ❌ **에이전트 순서 무시 금지** - PM → Architect → Designer → QA → DBA 순서 필수
3. ❌ **사용자 확인 없이 진행 금지** - 각 에이전트 완료 후 사용자 승인 필요

---

## ✅ 즉시 실행 행동

### (중요) 문서 → 실행 연결고리
- 이 스킬은 구현 코드를 작성하지 않지만, 산출물이 실제로 효력을 가지려면 **문서가 실행 가능한 강제 장치(게이트/테스트/타입/CI)**로 내려가야 합니다.
- 따라서 `management/quality-gates.md`와 `ADR-*.md`에는 **"어디에서 어떻게 강제되는지"(예: 단일 검증 엔트리 커맨드, CI job, 테스트 스위트, 산출물 경로)**를 반드시 포함하세요.
- 예: `scripts/verify_all.sh` 또는 `make verify` 같은 **단일 엔트리 검증 커맨드**를 정의하고, quality gates 항목을 그 커맨드 하위 단계로 매핑.


### 0단계: 전제 조건 확인

```bash
# TASKS 파일은 프로젝트에 따라 루트(TASKS.md) 또는 docs/planning/06-tasks.md에 있을 수 있습니다.
ls docs/planning/06-tasks.md 2>/dev/null || ls TASKS.md 2>/dev/null
ls management/project-plan.md management/decisions/ADR-*.md 2>/dev/null
ls management/mini-prd.md 2>/dev/null
```

**TASKS.md가 없으면**:
- 레거시 파일(`docs/planning/06-tasks.md`)만 있으면 → `/tasks-migrate` 먼저 안내 (TASKS.md로 통합)
- 태스크 파일 자체가 없으면 → `/tasks-init` 먼저 안내 (스캐폴딩 생성)

**Mini-PRD vs Full Governance 선택**:
- 소규모 프로젝트 (1~5인) → **Mini-PRD** (`references/mini-prd/`)
- 대규모 프로젝트 (6인 이상) → **Full Governance** (5단계 에이전트 팀)

---

## 🎯 Mini-PRD (Lightweight Alternative)

> **빠른 시작**: 대규모 거버넌스 팀이 필요 없는 소규모 프로젝트용

**파일**: `management/mini-prd.md`

### Mini-PRD 생성

```bash
# 템플릿 참조
references/mini-prd/mini-prd-template.md

# Progressive Disclosure 질문 세트
references/mini-prd/progressive-disclosure.md

# /audit 호환성 매핑
references/mini-prd/audit-mapping.md
```

### Phase별 질문

| Phase | 시점 | 질문 |
|-------|------|------|
| **Phase 1** | 초기 | purpose, features, tech-stack |
| **Phase 2** | Skeleton 완료 후 | business-logic, data-model, api-contract |
| **Phase 3** | Muscles 진행 중 | error-handling, edge-cases, performance |

### /audit 호환성

Mini-PRD는 `/audit`의 기획 정합성 검사를 통과합니다:

```bash
# Mini-PRD만 있어도 통과
management/mini-prd.md  # Phase 1+2 필수

# /audit 실행 시
/audit
  → ✅ Mini-PRD 감지
  → ✅ 기획 정합성 확인
  → ✅ 아키텍처 확인
  → ✅ DDD 확인 (data-model)
```

---

## 🔄 거버넌스 팀 5단계 순차 실행

| Step | 에이전트 | 산출물 | 상세 가이드 |
|------|----------|--------|-------------|
| 1 | **PM** | `management/project-plan.md` | `references/phase-1-pm.md` |
| 2 | **Architect** | `management/decisions/ADR-*.md` | `references/phase-2-architect.md` |
| 3 | **Designer** | `design/system/*.md` | `references/phase-3-designer.md` |
| 4 | **QA Manager** | `management/quality-gates.md` | `references/phase-4-qa.md` |
| 5 | **DBA** | `database/standards.md` | `references/phase-5-dba.md` |

### 각 Phase 진입 시
1. 해당 `references/phase-N-*.md` 파일을 Read
2. 아래 템플릿으로 Task 호출 (예시)
   ```js
   Task({
     subagent_type: "orchestrator", // phase 파일의 안내에 따름
     description: "PM: 프로젝트 계획 수립",
     prompt: "`references/phase-1-pm.md` 지침에 따라 `management/project-plan.md`를 작성하세요. 필요한 입력 정보는 사용자에게 질문하세요."
   })
   ```
3. 완료 조건 확인 후 다음 단계로

> 주의: Phase별 `subagent_type`은 `references/phase-N-*.md`에 정의된 값을 우선합니다.

---

## 📋 거버넌스 완료 체크리스트

```
management/
├── project-plan.md           ← PM
├── quality-gates.md          ← QA Manager
└── decisions/
    ├── ADR-001-tech-stack.md
    ├── ADR-002-api-versioning.md
    ├── ADR-003-error-handling.md
    └── ADR-004-naming-convention.md

design/system/
├── tokens.md, components.md, layout.md, accessibility.md

database/
└── standards.md              ← DBA
```

---

## 🔗 다음 단계 (CRITICAL)

> **이 섹션은 스킬 완료 후 반드시 실행합니다.**

거버넌스 완료 후 **AskUserQuestion**으로 다음 단계 안내:

```json
{
  "questions": [{
    "question": "✅ 거버넌스 셋업 완료! 다음 단계를 선택하세요:",
    "header": "다음 단계",
    "options": [
      {"label": "⭐ 프로젝트 팀 로컬 초기화 (권장)", "description": "(standalone) project-team install + .claude/project-team.yaml 생성 + 도메인 에이전트 + TASKS 스캐폴딩"},
      {"label": "거버넌스 품질 초기 감사", "description": "/audit - 설정된 표준과 품질 게이트를 종합 점검"},
      {"label": "결핍 분석 먼저", "description": "/eros - 숨겨진 가정과 결핍 검증 (v1.10.0)"},
      {"label": "직접 구현 시작", "description": "/agile auto - Claude가 직접 코드 작성 (소규모만)"}
    ],
    "multiSelect": false
  }]
}
```

### 선택에 따른 자동 실행

| 선택 | 실행 |
|------|------|
| "프로젝트 팀 로컬 초기화" | 아래 **Standalone Init** 섹션 수행 |
| "거버넌스 품질 초기 감사" | `Skill({ skill: "quality-auditor" })` |
| "결핍 분석 먼저" | `Skill({ skill: "eros" })` |
| "직접 구현 시작" | `Skill({ skill: "agile" })` |

---

## ⚙️ Hook 연동

| 산출물 | Hook | 동작 |
|--------|------|------|
| ADR-*.md | `standards-validator` | ADR 위반 시 경고 |
| quality-gates.md | `quality-gate` | 품질 미달 시 차단 |
| design/system/*.md | `design-validator` | 디자인 위반 감지 |
| database/standards.md | `standards-validator` | DB 명명 규칙 검사 |

---

## 🆘 FAQ

**Q: TASKS.md가 없어요**
→ `/tasks-init` 먼저 실행 (스캐폴딩 생성)

**Q: 특정 단계만 다시 실행하고 싶어요**
→ 해당 `references/phase-N-*.md`를 Read 후 Task 호출

**Q: 에이전트 호출 실패**
→ `ls ~/.claude/agents/` 확인 (Claude Project Team 필요)

**Q: 기획 문서가 너무 길어요**
→ `/compress optimize docs/planning/*.md` 실행 (H2O 패턴으로 핵심 추출)

---

**Last Updated**: 2026-03-03 (v1.4.1 - Context Optimize 연동)
