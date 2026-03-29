# SI Planning — 변경 관리 프로토콜

> **목적**: 요구사항 변경을 체계적으로 추적하고, RTM(요구사항추적표)을 통해
> 변경의 파급 영향을 분석하여 산출물을 일관성 있게 유지한다.
>
> **원칙**: 변경은 막는 것이 아니라 관리하는 것. 모든 변경은 추적 가능해야 한다.

---

## 1. CR (Change Request) ID 체계

### ID 형식

```
CR-{연도}{월}-{일련번호}-{유형}

예시:
  CR-202603-001-ADD    # 2026년 3월, 1번, 요구사항 추가
  CR-202603-002-MOD    # 2026년 3월, 2번, 요구사항 변경
  CR-202603-003-DEL    # 2026년 3월, 3번, 요구사항 삭제
  CR-202603-004-DEP    # 2026년 3월, 4번, 범위 이연 (Deferral)
```

### 유형 코드

```
ADD  — 새 요구사항 추가 (RD-FR 또는 RD-NFR)
MOD  — 기존 요구사항 내용 변경
DEL  — 요구사항 삭제 (범위 제거)
DEP  — 다음 차수로 이연 (Won't → 2차 구축)
PRI  — 우선순위 변경만 (내용 변경 없음)
```

---

## 2. 변경 요청 로그 형식

### CR 카드 형식 (si-state.json 내 저장)

```json
{
  "change_requests": [
    {
      "cr_id": "CR-202603-001-MOD",
      "title": "로그인 인증 방식 변경",
      "type": "MOD",
      "status": "approved",
      "priority": "high",
      "requested_by": "발주처 IT담당자",
      "requested_at": "2026-03-15T10:00:00",
      "target_rd": "RD-FR-003",
      "original_content": "아이디/패스워드 로그인",
      "new_content": "아이디/패스워드 + OTP 2단계 인증",
      "reason": "보안 강화 요구사항 추가 (정보보안 감사 지적)",
      "impact_analysis": {
        "affected_fn": ["FN-001", "FN-002"],
        "affected_sc": ["SC-001", "SC-002", "SC-003"],
        "affected_tc": ["TC-001", "TC-002", "TC-015"],
        "estimated_effort": "+3일",
        "risk": "OTP 발송 인프라 추가 필요"
      },
      "approved_at": "2026-03-15T14:00:00",
      "approved_by": "PM",
      "implemented_at": "2026-03-18T09:00:00",
      "documents_updated": [
        "docs/si/requirements-analysis.md",
        "docs/si/functional-spec.md",
        "docs/si/screen-spec.md",
        "docs/si/traceability-matrix.md"
      ]
    }
  ]
}
```

---

## 3. --change 커맨드 상세 흐름

### 실행 방식

```
/si-planning --change RD-FR-003
/si-planning --change RD-NFR-005
/si-planning --change FN-012        # 기능정의 직접 변경
```

### 상세 워크플로우

```
Step 1: 변경 대상 확인
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[변경 대상 조회]
ID: RD-FR-003
현재 내용: "사용자는 아이디와 패스워드로 로그인할 수 있다."
우선순위: Must
현재 상태: 활성
연결 FN: FN-001 (로그인 처리), FN-002 (세션 관리)
연결 SC: SC-001 (로그인 화면), SC-002 (에러 화면), SC-003 (비밀번호 찾기)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 2: 변경 내용 수집 (AskUserQuestion)
"어떻게 변경하시겠습니까?
 A) 내용 수정 — 기존 요구사항 수정
 B) 우선순위 변경 — Must/Should/Could/Won't 변경
 C) 범위 제거 — 이번 구축에서 제외
 D) 다음 차수 이연 — Won't 처리
"

Step 3: 영향 분석 (RTM Traversal)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 [영향 분석 결과] CR-202603-001-MOD

 변경 요약: "아이디/패스워드 → 아이디/패스워드 + OTP"

 직접 영향:
   기능정의  FN-001 "로그인 처리" — 수정 필요
   기능정의  FN-002 "세션 관리" — 수정 필요

 간접 영향:
   화면정의  SC-001 "로그인 화면" — OTP 입력 필드 추가
   화면정의  SC-002 "에러 화면" — OTP 오류 메시지 추가
   화면정의  SC-003 "비밀번호 찾기" — 영향 없음 (확인 필요)

 테스트케이스 (있는 경우):
   TC-001 "로그인 성공" — 수정 필요
   TC-002 "로그인 실패" — 수정 필요

 공수 영향: 예상 +3일
 리스크: OTP 발송 인프라 (SMS/앱) 추가 필요

 → [A] 승인 후 산출물 자동 업데이트
 → [B] 보류 — CR로 기록만 (나중에 처리)
 → [C] 취소
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 4-A: 승인 시 산출물 자동 업데이트
  1. requirements-analysis.md — RD-FR-003 내용 수정 + 변경 이력 추가
  2. functional-spec.md — FN-001, FN-002 수정
  3. screen-spec.md — SC-001, SC-002 수정
  4. traceability-matrix.md — 매핑 테이블 갱신
  5. si-state.json — CR 카드 추가, 버전 증가

Step 4-B: 보류 시 CR 기록
  si-state.json에 status="pending" CR 카드 추가
  "보류된 CR: CR-202603-001-MOD — 나중에 /si-planning --change로 재처리 가능"
```

---

## 4. --add 커맨드 상세 흐름

### 실행 방식

```
/si-planning --add              # 대화형 추가
/si-planning --add --fr         # FR만 추가
/si-planning --add --nfr        # NFR만 추가
```

### 상세 워크플로우

```
Step 1: 추가 유형 확인 (AskUserQuestion)
"추가할 요구사항 유형은?
 A) 기능 요구사항 (FR) — 시스템이 해야 할 것
 B) 비기능 요구사항 (NFR) — 시스템이 어떻게 해야 할 것
"

Step 2: question-framework.md의 해당 카테고리 질문 재사용
  - FR 추가: Category 3 질문 적용
  - NFR 추가: Category 4 질문 적용

Step 3: 신규 RD ID 자동 할당
  현재 최대 FR ID가 RD-FR-032라면 → RD-FR-033 할당
  현재 최대 NFR ID가 RD-NFR-013이라면 → RD-NFR-014 할당

Step 4: 기존 요구사항과 충돌/중복 검사
  - 유사 요구사항 탐색 (키워드 유사도)
  - 충돌 발견 시 사용자에게 알림

  "유사한 기존 요구사항이 있습니다:
   RD-FR-015: '사용자는 비밀번호를 변경할 수 있다.'
   새 요구사항과 통합할까요, 별도로 추가할까요?"

Step 5: MoSCoW 우선순위 확인 (AskUserQuestion)

Step 6: Gap Detection 재실행 (신규 RD 추가 영향 확인)

Step 7: 산출물 업데이트
  1. requirements-analysis.md에 신규 RD 추가
  2. traceability-matrix.md에 미매핑 상태로 추가
  3. si-state.json에 CR-ADD 카드 추가

Step 8: 핸드오프
  "RD-FR-033 '2단계 인증 OTP 발송' 추가 완료
   기능정의서와 화면정의서 업데이트가 필요합니다.
   /si-planning --change FN 로 기능을 추가하거나
   Phase 2를 재실행하여 매핑하세요."
```

---

## 5. 승인 워크플로우

### 단계별 승인 정책

```
변경 영향도 분류 및 승인 레벨:

Level 1 — 경미 (Low Impact)
  조건: 영향 범위 SC 1건 이하, 공수 변동 0.5일 이하, NFR 아님
  승인: 사용자(담당자) 즉시 승인 가능
  절차: 변경 내용 확인 → 즉시 처리

Level 2 — 보통 (Medium Impact)
  조건: 영향 범위 FN 2건 이하 또는 SC 3건 이하, 공수 변동 3일 이하
  승인: 사용자 확인 + 이유 기록 필수
  절차: 영향 분석 보고 → 이유 입력 → 처리

Level 3 — 중대 (High Impact)
  조건: Must 요구사항 삭제, NFR 변경, 영향 범위 FN 3건 이상, 공수 변동 3일 초과
  승인: 명시적 승인 + 위험 인지 확인 필수
  절차: 영향 분석 보고 → 위험 고지 → 명시적 "동의합니다" 입력 → 처리

Level 4 — 범위 변경 (Scope Change)
  조건: 신규 Must 요구사항 추가, 핵심 기능 제거, 도메인 변경
  승인: 고객/발주처 승인 필요 사항으로 표시
  절차: CR 상태를 "pending_customer_approval"로 설정
        발주처 확인 후 수동으로 "approved"로 변경
```

### 취소 불가 변경 경고

```
다음 변경은 취소 불가 경고 표시:

1. 요구사항 삭제 (DEL):
   "RD-FR-003를 삭제하면 연결된 FN-001, SC-001이 고아 상태가 됩니다.
    연결 산출물도 함께 삭제하시겠습니까?
    이 작업은 되돌리기 어렵습니다. 'DELETE 확인'을 입력하세요."

2. Must → Won't 우선순위 변경:
   "Must 요구사항을 Won't로 변경하면 이 기능이 이번 구축 범위에서 제외됩니다.
    발주처와 합의된 내용인가요? '범위 제외 확인'을 입력하세요."
```

---

## 6. 문서 자동 업데이트 프로토콜

### 업데이트 순서 (종속성 기반)

```
변경 승인 후 다음 순서로 문서 업데이트:

1. si-state.json
   - CR 카드 상태: approved
   - 버전 증가: version + 0.0.1

2. requirements-analysis.md
   - 해당 RD 내용 수정
   - 변경 이력 행 추가:
     | CR-202603-001-MOD | 2026-03-15 | 내용 변경 | OTP 추가 |

3. functional-spec.md
   - 영향 받는 FN 수정
   - FN별 변경 이력 추가

4. screen-spec.md
   - 영향 받는 SC 수정
   - SC별 변경 이력 추가

5. traceability-matrix.md
   - 매핑 테이블 갱신
   - 변경된 행에 CR ID 주석 추가
```

### 충돌 방지 규칙

```
동시 변경 방지:
  - si-state.json에 "lock" 상태 필드 관리
  - 변경 작업 시작 시 lock: true
  - 완료 시 lock: false
  - lock 상태에서 다른 --change 호출 시 대기 요청

문서 무결성 검증:
  모든 업데이트 완료 후 Gap Detection 자동 재실행
  새로운 CRITICAL Gap 발생 시 즉시 사용자 알림
```

---

## 7. 버전 추적 체계

### 산출물 버전 관리

```
시맨틱 버전 형식: MAJOR.MINOR.PATCH

MAJOR: 범위 변경 (Must 요구사항 추가/삭제, 도메인 변경)
MINOR: 기능 변경 (FR 내용 수정, FN 추가/변경, SC 추가/변경)
PATCH: 오류 수정 (오탈자, 링크 수정, 형식 정정)

초기 버전: 1.0.0 (Phase 3 완료 후)

si-state.json 버전 관리:
{
  "project_name": "민원처리시스템",
  "version": "1.2.3",
  "last_updated": "2026-03-29T15:00:00",
  "total_fr": 32,
  "total_nfr": 13,
  "total_fn": 45,
  "total_sc": 38,
  "cr_count": {
    "total": 5,
    "approved": 4,
    "pending": 1,
    "rejected": 0
  }
}
```

### 변경 이력 요약 형식

```markdown
## 변경 이력 (requirements-analysis.md 내 섹션)

| CR ID | 일자 | 유형 | 대상 | 내용 요약 | 담당 |
|-------|------|------|------|-----------|------|
| CR-202603-001-MOD | 2026-03-15 | 수정 | RD-FR-003 | OTP 2단계 인증 추가 | PM |
| CR-202603-002-ADD | 2026-03-20 | 추가 | RD-FR-033 | SMS 알림 기능 추가 | 발주처 |
| CR-202603-003-DEP | 2026-03-25 | 이연 | RD-FR-028 | 통계 대시보드 2차로 이연 | PM |
```

---

## 8. --change / --add 비교 요약

```
┌─────────────────┬────────────────────────────┬────────────────────────────┐
│ 항목            │ --change                   │ --add                      │
├─────────────────┼────────────────────────────┼────────────────────────────┤
│ 대상            │ 기존 RD, FN 수정/삭제      │ 신규 RD 추가               │
│ 시작점          │ ID 직접 지정               │ 질문 카테고리 선택         │
│ 영향 분석       │ RTM traversal 자동 실행    │ 중복/충돌 검사             │
│ Gap Detection   │ 변경 영향 범위만 재실행    │ 전체 재실행                │
│ CR 유형         │ MOD, DEL, DEP, PRI         │ ADD                        │
│ 산출물 업데이트  │ 영향 받는 문서만 수정      │ RD 추가 + RTM 갱신         │
│ 승인 레벨       │ Level 1~4 (영향도 기준)    │ Level 1~4 (우선순위 기준)  │
└─────────────────┴────────────────────────────┴────────────────────────────┘
```

---

## 9. 대시보드용 변경 현황 데이터

```json
// si-state.json 내 dashboard 섹션
{
  "dashboard": {
    "change_summary": {
      "total_cr": 5,
      "by_type": {
        "ADD": 2,
        "MOD": 2,
        "DEL": 0,
        "DEP": 1
      },
      "by_status": {
        "approved": 4,
        "pending": 1,
        "rejected": 0
      },
      "recent_changes": [
        {
          "cr_id": "CR-202603-002-ADD",
          "date": "2026-03-20",
          "title": "SMS 알림 기능 추가",
          "impact": "low"
        }
      ]
    }
  }
}
```
