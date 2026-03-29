---
name: si-planning
description: "SI 프로젝트 요구사항 공학 스킬. 소크라테스식 요구사항 수집 → 도메인별 체크리스트 검증 → 산출물 자동 생성(요구사항분석서/기능정의서/화면정의서/추적표) → 변경 영향 분석. 대시보드 연동으로 고객 공유 지원."
triggers:
  - /si-planning
  - 요구사항 분석
  - 기능정의서
  - 화면정의서
  - SI 기획
  - 요구사항 수집
  - SI 산출물
version: 1.0.0
updated: 2026-03-29
---

# SI Planning — 요구사항 공학 엔진

> **목표**: SI 프로젝트의 요구사항을 빠짐없이 수집하고, 도메인별 검증을 거쳐, 표준 산출물을 자동 생성한다.
>
> **철학**: 요구사항은 "물어서 얻는 것"이 아니라 "함께 발견하는 것". 고객의 암묵지를 구조화된 명세로 변환한다.

## 커맨드

```
/si-planning                           # 전체 워크플로우 (Phase 0-4)
/si-planning --domain=공공             # 도메인 지정 시작
/si-planning --add                     # 요구사항 추가
/si-planning --change RD-FR-003        # 요구사항 변경 + 영향 분석
/si-planning --gap                     # Gap Detection만 재실행
/si-planning --dashboard               # 대시보드 서버 시작
/si-planning --dashboard --port=3030   # 포트 지정
```

## 절대 금지

1. 기술 구현 세부사항 질문 (아키텍처, 라이브러리 선택 — Claude 영역)
2. 요구사항 임의 생성 (반드시 사용자 확인 필요)
3. 도메인 체크리스트 우회 (필수 항목 skip 불가)
4. Ambiguity Score 0.3 이상에서 Phase 2 진입

## 산출물 경로

- 프로젝트 레벨: `docs/si/`
- 상태 데이터: `docs/si/si-state.json`

---

## Phase 0: 도메인 프로파일 로드

```bash
# --domain 플래그 확인 또는 사용자에게 질문
DOMAIN={공공|금융|의료|제조|유통|커스텀}
```

도메인 선택 시 자동 로드:
- 필수 NFR 체크리스트
- 규정/법규 요건
- 흔히 누락되는 요구사항 목록
- 도메인 전용 질문 세트

상세: `references/domain-profiles.md`

---

## Phase 1: 요구사항 수집 (소크라테스식 + SI 강화)

> Ambiguity Score가 0.3 이하가 될 때까지, Phase 2로 넘어가지 않는다.

### Step 1: 프로젝트 개요

AskUserQuestion으로 수집:
- 프로젝트명, 목적, 범위
- 발주처/이해관계자
- 일정, 예산, 인력 제약

### Step 2: As-Is 워크스루

```
"현재 이 업무를 어떻게 처리하고 있나요?"
"아침에 출근하면 이 업무와 관련해서 첫 번째로 하는 일은?"
"그 과정에서 가장 불편한 점 3가지는?"
"지금 쓰고 있는 시스템/도구는?"
```

### Step 3: To-Be 도출

```
"이 시스템이 완성되면, 아까 말한 불편함이 어떻게 해결되나요?"
"가장 먼저 바뀌어야 할 것 3가지는?"
"이 시스템 없이는 절대 안 되는 기능은?"
```

### Step 4: 기능 요구사항 도출 (FR)

```
# 정방향: 기능 직접 도출
"핵심 기능을 업무 흐름 순서대로 말해주세요"

# 역방향: Anti-requirements
"절대 일어나면 안 되는 상황은?"
"이전 시스템에서 가장 큰 사고가 뭐였나요?"

# 숨은 요구사항
"이 데이터를 누가 또 보나요?" (숨은 이해관계자)
"이 기능이 장애가 나면 어떤 일이 벌어지나요?" (장애 영향도)
"데이터가 틀리면 누가 책임지나요?" (데이터 거버넌스)
```

### Step 5: 비기능 요구사항 (NFR) — ISO 25010 가이드

```
# 도메인 프로파일에서 필수 NFR 로드 후 확인
"동시 접속자는 최대 몇 명 정도?"     → 성능효율성
"장애 시 허용 가능한 중단 시간은?"    → 신뢰성
"법적/규정적으로 꼭 지켜야 하는 것은?" → 보안성/호환성
"기존 시스템과 연동해야 할 것은?"     → 상호운용성
```

### Step 6: 유사 시스템 레퍼런스

```
"비슷한 시스템을 써본 적 있으면, 그것과 비교하면?"
"그 시스템에서 좋았던 점/나빴던 점은?"
```

### Step 7: 숨은 이해관계자 탐색

```
"이 시스템의 결과물을 보고받는 상위 관리자는?"
"이 시스템에 데이터를 넣는 사람과 쓰는 사람이 다른가요?"
"외부 기관과 데이터를 주고받나요?"
```

### Gray Area → CONTEXT.md 연동 (GSD 패턴)

Phase 1 수집 중 Gray area(명확한 답이 없는 결정 사항) 발견 시:

1. `/discuss` 스킬 호출하여 결정 수집
2. 결정 결과를 `.claude/CONTEXT.md`에 기록
3. Phase 3 서브에이전트가 CONTEXT.md를 참조하여 산출물 생성

```text
Gray Area 발견 시:
  "이 부분은 여러 방법이 있는데, 어떻게 할지 결정이 필요합니다"
  → /discuss 호출 → CONTEXT.md 생성
  → Phase 3 서브에이전트에 CONTEXT.md 경로 전달
```

Gray area 예시:
- 권한 체계: 역할 기반(RBAC) vs 속성 기반(ABAC)
- 데이터 보존: 물리 삭제 vs 논리 삭제
- 알림 방식: 이메일 vs SMS vs 앱 푸시
- 결재선: 고정 vs 동적 결재선

### Ambiguity Score 측정

6가지 명확성 차원 평가 (각 0.0~1.0, 낮을수록 명확):

| 차원 | 측정 기준 |
|------|----------|
| 문제 정의 | As-Is/To-Be 명확성 |
| 대상 사용자 | 이해관계자 식별 완료도 |
| 핵심 기능 | 기능 목록의 구체성 |
| 비기능 요건 | NFR 정량화 여부 |
| 범위 경계 | 포함/불포함 명확성 |
| 성공 기준 | 검수 조건 정의 여부 |

**Score = 6개 차원 평균. 0.3 이하면 Phase 2 진입.**

상세 질문 체계: `references/question-framework.md`

---

## Phase 2: 분석 + Gap Detection

### Step 1: ID 체계화

```markdown
# 기능 요구사항
RD-FR-001 ~ RD-FR-NNN

# 비기능 요구사항
RD-NFR-001 ~ RD-NFR-NNN

# 기능 정의
FN-001 ~ FN-NNN

# 화면 정의
SC-001 ~ SC-NNN

# 테스트 케이스 (향후)
TC-001 ~ TC-NNN
```

### Step 2: MoSCoW 우선순위 분류

각 요구사항에 AskUserQuestion으로 우선순위 확인:
- **Must**: 없으면 시스템 무의미
- **Should**: 중요하지만 우회 가능
- **Could**: 있으면 좋지만 없어도 됨
- **Won't**: 이번 범위에서 제외 (명시적 기록)

### Step 3: 기능→화면 매핑

각 FR에 대해:
- 이 기능이 표시/실행되는 화면은?
- 화면 간 이동 경로는?
- 하나의 기능이 여러 화면에 걸치는 경우?

### Step 4: 도메인 체크리스트 대조

```
[Gap Detection 실행]
❌ RD-FR-012 (권한관리) → 기능정의 없음
❌ SC-005 (에러화면) → 요구사항 역추적 불가
⚠️ 공공 도메인 필수: '감사로그' 관련 요구사항 0건
⚠️ 비기능 '백업/복구' 요구사항 미정의
⚠️ 숨은 이해관계자 '감사부서'에 대한 요구사항 없음
```

Gap 발견 시 사용자에게 보고 → 추가 수집 또는 "의도적 제외" 확인

### Step 5-6: 충돌 식별 + 종속성 분석

- 이해관계자 간 요구 충돌 탐지
- 기능 간 종속성 그래프 생성

상세: `references/gap-detection.md`

---

## Phase 3: 산출물 생성

서브에이전트에 위임하여 메인 컨텍스트 보호:

```
Agent(
  subagent_type="builder",
  name="si-docs-generator",
  prompt="""
    수집된 요구사항 정보를 기반으로 docs/si/ 폴더에 4개 산출물 + 1개 상태 파일 생성:

    1. docs/si/requirements-analysis.md — 요구사항분석서
    2. docs/si/functional-spec.md — 기능정의서
    3. docs/si/screen-spec.md — 화면정의서
    4. docs/si/traceability-matrix.md — 요구사항추적표
    5. docs/si/si-state.json — 대시보드 상태 데이터

    [수집된 정보 JSON 전달]
    [.claude/CONTEXT.md 경로가 있으면 함께 전달]

    각 문서는 templates/ 폴더의 템플릿을 따릅니다.
    mkdir -p docs/si 먼저 실행하세요.
  """
)
```

### Deviation Rules 적용 (GSD 패턴)

> 산출물 생성 중 발견한 누락/오류를 자동 처리하는 규칙.

#### Rule 1: Auto-fix Gaps
**상황**: 산출물 생성 중 RTM 매핑 누락 발견
**동작**:
1. 누락된 매핑 자동 추가
2. 관련 산출물 업데이트
3. `[Rule 1 - Gap Fix] {설명}` 로 추적

#### Rule 2: Auto-add Missing Critical
**상황**: 도메인 체크리스트 필수 항목이 요구사항에 없음
**동작**:
1. 해당 NFR을 RD-NFR-NNN으로 자동 추가 (Draft 상태)
2. 산출물에 반영
3. `[Rule 2 - Critical Add] {설명}` 로 추적
4. Phase 4에서 사용자 확인 필수

#### Rule 3: Auto-fix Consistency
**상황**: 산출물 간 ID 불일치 (예: 기능정의서에 FN-015가 있는데 추적표에 없음)
**동작**:
1. 불일치 자동 수정
2. `[Rule 3 - Consistency Fix] {설명}` 로 추적

#### Deviation 기록

모든 deviation은 si-state.json의 gaps 배열에 기록:

```json
{
  "id": "DEV-001",
  "rule": "Rule 2",
  "type": "Critical Add",
  "description": "공공 도메인 필수: 감사로그 NFR 자동 추가",
  "target": "RD-NFR-014",
  "status": "draft"
}
```

#### 사용자 확인 필요한 경우

- Rule 2로 추가된 요구사항 (Draft → Confirmed 전환 필요)
- 3개 이상 산출물에 영향을 미치는 deviation

### 산출물 완료 확인

```bash
Glob("docs/si/*.md")  # 4개 파일 존재 확인
Read("docs/si/si-state.json")  # JSON 유효성 확인
```

---

## Phase 4: 검증 + 핸드오프

### Step 1: Goal-backward 검증 + 추적성 (GSD 패턴)

> **핵심 원칙**: 산출물 완성 ≠ 요구사항 충족. 목표에서 역산하여 검증한다.

**Goal-backward 검증 흐름:**

```text
프로젝트 목표 (Goal)
  ↓
Must-have: 이 목표를 달성하려면 반드시 필요한 요구사항은?
  ↓
Must-exist: 각 요구사항이 기능정의서에 존재하는가?
  ↓
Must-wired: 각 기능이 화면에 연결되어 있는가?
  ↓
실제 산출물 교차 검증
```

**실행:**

```bash
# Must-have 검증: 프로젝트 목표 대비 요구사항 완전성
grep -c "RD-FR" docs/si/requirements-analysis.md

# Must-exist 검증: 요구사항 대비 기능 존재 확인
grep -c "FN-" docs/si/functional-spec.md

# Must-wired 검증: 기능 대비 화면 연결 확인
grep -c "SC-" docs/si/screen-spec.md
```

**추적성 검증 결과:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GOAL-BACKWARD VERIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Goal → Must-have (요구사항): 45건 확인
 Must-have → Must-exist (기능): 30/32 (93.8%) ⚠️
 Must-exist → Must-wired (화면): 28/30 (93.3%) ⚠️
 도메인 체크: 12/15 (80.0%) ❌

 미매핑 항목:
 - RD-FR-031 → FN 없음
 - RD-FR-032 → FN 없음
 - FN-029 → SC 없음
 - FN-030 → SC 없음

 Deviation 적용: 2건 (Rule 2: 1건, Rule 3: 1건)
```

Gap 발견 시 `/quality-auditor`의 goal-backward 패턴으로 추가 검증:
- PASS → Phase 4 Step 2 진행
- FAIL → Gap 해결 작업 생성 → Phase 2로 회귀

### Step 2: 실패 기획 4요건 검사

vibelab 패턴 적용:
1. **자기 집착**: 유사 시스템 비교 없이 진행? → 경고
2. **추측 기반 결정**: 증거 없는 요구사항? → 태깅
3. **합리적 타협**: 핵심 가치 희석? → 검증
4. **시도 회피**: 과도한 분석 루프? → 다음 단계 유도

### Step 3: 사용자 최종 확인

### Step 4: 핸드오프

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 /si-planning COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 요구사항: 45건 (FR: 32, NFR: 13)
 추적성: 85%
 도메인 체크: 12/15 통과
 Ambiguity Score: 0.18

 생성된 산출물:
 - docs/si/requirements-analysis.md
 - docs/si/functional-spec.md
 - docs/si/screen-spec.md
 - docs/si/traceability-matrix.md

 대시보드: /si-planning --dashboard

 다음 단계:
 - /agile auto (소규모)
 - /team-orchestrate (대규모)
 - /si-planning --dashboard (고객 공유)
```

---

## 변경 관리 모드

### --change: 기존 요구사항 변경

```
/si-planning --change RD-FR-003

→ 영향 분석:
  기능: FN-001, FN-012
  화면: SC-001, SC-007
  테스트: TC-001, TC-002, TC-015
  예상 공수 변동: +2일

→ [승인] 산출물 자동 업데이트
→ [보류] CR-NNN으로 기록만
```

### --add: 새 요구사항 추가

```
/si-planning --add

→ Phase 1 질문 재사용 (신규 요구사항만)
→ 기존 ID 체계에 추가
→ Gap Detection 재실행
→ 산출물 업데이트
```

상세: `references/change-management.md`

---

## 스킬 연계

| 상황 | 연결 스킬 |
|------|----------|
| 요구사항 수집 전 브레인스토밍 | `/neurion` |
| Gray area 결정 수집 | `/discuss` |
| Phase 1 gray area 발견 | `/discuss` → CONTEXT.md |
| 산출물 완성 후 구현 | `/agile auto` 또는 `/team-orchestrate` |
| Phase 3 산출물 생성 중 누락 | Deviation Rules 자동 적용 |
| 산출물 검증 | `/quality-auditor` |
| Phase 4 목표 검증 | `/quality-auditor` goal-backward |
| 고객 공유 | `/si-planning --dashboard` |
| 변경 영향 분석 | `/si-planning --change` |

---

**Last Updated**: 2026-03-29 (v1.0.0 — 초기 버전)
