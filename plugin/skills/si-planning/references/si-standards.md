# SI Planning — SI 표준 매핑

> **목적**: 국제 표준(IEEE, ISO/IEC)과 국내 SI 표준이 우리 산출물 구조에 어떻게 매핑되는지
> 정의한다. 산출물의 표준 준거성을 확보하고, 납품 요건 검토 시 참조한다.

---

## 1. IEEE 830 — 소프트웨어 요구사항 명세 (SRS)

### 표준 개요

```
IEEE 830-1998: Recommended Practice for Software Requirements Specifications
목적: SRS(Software Requirements Specification) 문서의 권장 구조 정의
상태: IEEE 830은 IEEE 29148로 통합/대체됨 (2011)
      그러나 국내 SI 현장에서 여전히 IEEE 830 기준 요구 빈번
```

### IEEE 830 섹션 → 우리 산출물 매핑

```
IEEE 830 섹션               | 우리 산출물                  | 문서 섹션
----------------------------|------------------------------|---------------------------
1. Introduction             | requirements-analysis.md    | §1 프로젝트 개요
  1.1 Purpose               |                              | §1.1 목적
  1.2 Scope                 |                              | §1.2 범위
  1.3 Definitions           |                              | §1.3 용어 정의
  1.4 References            |                              | §1.4 참고 문서
  1.5 Overview              |                              | §1.5 문서 구조
2. Overall Description      |                              | §2 시스템 개요
  2.1 Product Perspective   |                              | §2.1 시스템 컨텍스트
  2.2 Product Functions     |                              | §2.2 주요 기능 요약
  2.3 User Classes          |                              | §2.3 이해관계자
  2.4 Operating Environment |                              | §2.4 운영 환경
  2.5 Design/Impl. Constraints|                            | §2.5 제약 조건
  2.6 Assumptions           |                              | §2.6 가정 및 의존성
3. Specific Requirements    |                              |
  3.1 Functional Requirements| requirements-analysis.md   | §3 기능 요구사항 (RD-FR)
  3.2 Performance Req.      |                              | §4 비기능 요구사항 (RD-NFR)
  3.3 Logical DB Requirements|                             | §5 데이터 요구사항
  3.4 Design Constraints    |                              | §2.5 제약 조건
  3.5 Software System Attr. |                              | §4 비기능 요구사항
4. Supporting Information   | traceability-matrix.md      | 추적표 전체
```

### 우리가 IEEE 830에서 확장한 부분

```
IEEE 830 이상: 우리 산출물에 추가된 항목

1. MoSCoW 우선순위 — IEEE 830은 요구사항 우선순위 구조를 명시하지 않음
   → 우리: Must/Should/Could/Won't 전체 분류

2. As-Is / To-Be Gap 분석 — IEEE 830은 현황 분석을 포함하지 않음
   → 우리: Phase 1에서 명시적 As-Is/To-Be 갭 문서화

3. 도메인 체크리스트 — IEEE 830은 도메인별 특수 요건 없음
   → 우리: 공공/금융/의료/제조/유통별 필수 체크리스트

4. Ambiguity Score — IEEE 830은 품질 측정 방법 없음
   → 우리: 6차원 명확성 점수로 Phase 진입 제어

5. RTM(추적표) 내재화 — IEEE 830에서는 선택 사항
   → 우리: 추적표 필수 산출물 (traceability-matrix.md)
```

---

## 2. ISO/IEC 25010 — 소프트웨어 품질 특성 (SQuaRE)

### 표준 개요

```
ISO/IEC 25010:2011 (SQuaRE: Software product Quality Requirements and Evaluation)
목적: 소프트웨어 제품 품질을 8가지 특성과 31가지 부특성으로 정의
적용: 비기능 요구사항(NFR) 작성의 표준 분류 체계로 사용
```

### 8가지 품질 특성 및 하위 특성

```
1. 기능적합성 (Functional Suitability)
   부특성:
   - 기능완전성 (Functional Completeness): 모든 사용자 과업 커버
   - 기능정확성 (Functional Correctness): 정확한 결과 생성
   - 기능적합성 (Functional Appropriateness): 명시된 과업에 적합
   NFR 매핑: RD-FR이 커버 (별도 NFR 항목 불필요)
   SI 중요도: ★★★★★

2. 성능효율성 (Performance Efficiency)
   부특성:
   - 시간반응성 (Time Behaviour): 응답 시간, 처리 시간
   - 자원활용 (Resource Utilization): CPU, 메모리, 스토리지
   - 용량 (Capacity): 최대 처리량, 동시 사용자
   NFR 키워드: 응답 시간, TPS, 동시접속, 배치 완료 시간
   SI 중요도: ★★★★★
   정량화 필수: 수치로 표현하지 않으면 검수 불가

3. 호환성 (Compatibility)
   부특성:
   - 공존성 (Co-existence): 다른 시스템과 자원 공유 시 기능 유지
   - 상호운용성 (Interoperability): 다른 시스템과 데이터/기능 교환
   NFR 키워드: 연동, API, 인터페이스, 데이터 형식 표준
   SI 중요도: ★★★★☆ (연동 시스템 있을 때 ★★★★★)

4. 사용성 (Usability)
   부특성:
   - 적합인식성 (Appropriateness Recognizability): 적합 여부 인식
   - 학습성 (Learnability): 시스템 사용 학습 용이성
   - 운용성 (Operability): 조작 및 제어 용이성
   - 사용자오류방지 (User Error Protection): 사용자 실수 방지
   - 사용자인터페이스미학 (User Interface Aesthetics): UI 만족도
   - 접근성 (Accessibility): 장애인 포함 다양한 특성 사용자
   NFR 키워드: 웹 접근성, 반응형, 직관성, 학습 용이성
   SI 중요도: ★★★★☆ (공공 도메인: ★★★★★)

5. 신뢰성 (Reliability)
   부특성:
   - 성숙성 (Maturity): 정상 운영 중 실패 없이 작동
   - 가용성 (Availability): 가동 준비 및 접근 가능 상태 유지
   - 결함허용성 (Fault Tolerance): 오류 발생 시 의도된 수준 유지
   - 복구성 (Recoverability): 실패 후 데이터/기능 복구
   NFR 키워드: 가용성 %, SLA, RTO, RPO, MTTR, MTBF
   SI 중요도: ★★★★★

6. 보안성 (Security)
   부특성:
   - 기밀성 (Confidentiality): 인가된 접근만 허용
   - 무결성 (Integrity): 시스템/데이터 무단 변경 방지
   - 부인방지 (Non-repudiation): 행위 부인 불가
   - 책임추적성 (Accountability): 고유 추적 가능
   - 진본성 (Authenticity): 주체/자원 진본 확인
   NFR 키워드: 암호화, 접근 제어, 감사 로그, 전자서명
   SI 중요도: ★★★★★

7. 유지보수성 (Maintainability)
   부특성:
   - 모듈성 (Modularity): 변경 시 영향 최소화
   - 재사용성 (Reusability): 컴포넌트 재사용 가능
   - 분석성 (Analysability): 결함/변경 영향 진단 용이
   - 수정성 (Modifiability): 결함 없이 수정 가능
   - 시험성 (Testability): 시험 기준 수립 및 실행 용이
   NFR 키워드: 코딩 표준, 문서화, 기술 이전, 소스 공개
   SI 중요도: ★★★★☆

8. 이식성 (Portability)
   부특성:
   - 적응성 (Adaptability): 다른 환경에서 동작 가능
   - 설치성 (Installability): 환경 설치/제거 용이
   - 대체성 (Replaceability): 동일 환경에서 다른 제품 대체 가능
   NFR 키워드: 클라우드 이전, 멀티 브라우저, OS 독립성
   SI 중요도: ★★★☆☆
```

### ISO 25010 → 우리 NFR ID 매핑 규칙

```
RD-NFR ID 형식에 ISO 특성 코드 접두 권장:

RD-NFR-PE-001  # Performance Efficiency (성능효율성)
RD-NFR-CM-001  # Compatibility (호환성)
RD-NFR-US-001  # Usability (사용성)
RD-NFR-RL-001  # Reliability (신뢰성)
RD-NFR-SC-001  # Security (보안성)
RD-NFR-MT-001  # Maintainability (유지보수성)
RD-NFR-PT-001  # Portability (이식성)

예시:
  RD-NFR-PE-001: "시스템은 100명 동시 접속 시 주요 화면 응답 시간 3초 이내를 보장한다."
  RD-NFR-RL-001: "시스템은 연간 가용성 99.5% 이상을 보장한다. (계획 정지 제외)"
  RD-NFR-SC-001: "시스템은 모든 개인정보를 AES-256으로 암호화하여 저장한다."
```

---

## 3. IEEE 29148 — 요구사항 공학 수명주기

### 표준 개요

```
ISO/IEC/IEEE 29148:2018 (IEEE 830 대체)
목적: 요구사항 공학의 전체 수명주기 프로세스 정의
     (요구사항 수집 → 분석 → 명세 → 검증 → 관리)
적용: 우리 스킬의 Phase 0~4 설계 기반 표준
```

### IEEE 29148 프로세스 → 우리 Phase 매핑

```
IEEE 29148 프로세스           | 우리 Phase          | 주요 활동
-----------------------------|---------------------|---------------------
Elicitation (도출)           | Phase 1             | 소크라테스식 질문, 워크스루
Analysis (분석)              | Phase 2             | Gap Detection, 우선순위
Specification (명세)         | Phase 3             | 산출물 생성 (4개 문서)
Validation (검증)            | Phase 4             | 추적성 검증, 사용자 확인
Management (관리)            | --add, --change     | CR 관리, 영향 분석
```

### IEEE 29148 "좋은 요구사항" 기준 (SMART-C)

```
IEEE 29148에서 정의하는 개별 요구사항 품질 기준:

S — Singular (단일): 하나의 요구사항에 하나의 기능
M — Measurable (측정 가능): 검수 가능한 정량 기준
A — Attainable (달성 가능): 기술적으로 구현 가능
R — Relevant (관련성): 프로젝트 목적과 연관
T — Traceable (추적 가능): 이해관계자 요구로 역추적 가능
C — Clear (명확): 모호한 표현 없음

우리 스킬에서의 적용:
  Ambiguity Score → "C (Clear)" 기준 측정
  Gap Detection → "T (Traceable)" 검증
  MoSCoW → "R (Relevant) + A (Attainable)" 구분
  NFR 정량화 요구 → "M (Measurable)" 강제
```

### 요구사항 품질 자동 검사 규칙

```
[STD-Q01] 모호 표현 탐지 (IEEE 29148 §5.2.8)
  금지 표현 목록:
  - "빠르게", "빠른", "신속하게"      → 수치 명시 요구
  - "편리하게", "사용하기 쉽게"       → 구체적 기준 요구
  - "적절히", "충분히", "적당히"      → 정량화 요구
  - "등", "기타", "유사한"           → 완전한 목록 요구
  - "가능하면", "필요시", "경우에 따라" → 조건 명시 요구
  - "최신", "최근", "현재"           → 기준 시점 명시 요구

[STD-Q02] 복수 요구사항 탐지
  "그리고", "또는", "및" 로 연결된 요구사항 → 분리 권고
  예: "사용자는 조회하고 수정할 수 있다."
  → "사용자는 데이터를 조회할 수 있다. (RD-FR-NNN)"
     "사용자는 데이터를 수정할 수 있다. (RD-FR-NNN+1)"

[STD-Q03] 검수 불가 NFR 탐지
  "높은 보안", "좋은 성능", "안정적인" → 측정 기준 요구
```

---

## 4. 국내 SI 표준

### 4-1. 행정안전부 — 정보시스템 구축·운영 지침

```
기준: 행정안전부 고시 (정보시스템 구축·운영 지침)
적용 대상: 중앙행정기관 및 지방자치단체 정보시스템 구축 사업

주요 내용:
  1. 정보시스템 아키텍처 표준 (ITA: Information Technology Architecture)
  2. 전자정부 표준프레임워크 사용 권고
  3. 정보보안 기준 (ISMS 인증 여부, 망 분리)
  4. 접근성 의무 (WCAG 2.1 AA 수준)
  5. 오픈소스 활용 및 소스코드 공개 정책

우리 산출물 연결:
  - PUB-NFR-01 웹접근성 ← 접근성 의무
  - PUB-NFR-02 전자정부프레임워크 ← 표준프레임워크 사용 권고
  - PUB-NFR-04 정보보안 ← 정보보안 기준
  - PUB-CK-09 연계 시스템 ← ITA 연계 표준
```

### 4-2. 과학기술정보통신부 — 소프트웨어 사업 대가산정 가이드

```
기준: SW사업 대가산정 가이드 (한국소프트웨어산업협회 발행)
적용 대상: 공공 SW 사업 발주 시 개발 비용 산정 기준

주요 내용:
  1. 기능점수(Function Point) 기반 규모 산정
  2. 보정계수 (기술적 복잡도, 개발 환경 등)
  3. 투입 공수 계산 기준

우리 산출물 연결 (향후 확장):
  - functional-spec.md의 FN 목록 → 기능점수 산정 입력
  - 도메인별 복잡도 계수 (공공 > 일반 등)
  - NFR에서 정량화된 성능 요건 → 보정계수 입력

  [참고] 현재 스킬 범위에서는 FP 자동 계산 미포함.
         요구사항 수집 완료 후 별도 산정 가이드 제공 예정.
```

### 4-3. 국가정보화기획법 기반 — 정보화사업 추진 절차

```
절차: 제안요청서(RFP) → 제안서 → 계약 → 착수 → 개발 → 검수 → 유지보수

우리 스킬의 위치:
  [착수 단계] 요구사항 분석 → Phase 0~2 해당
  [개발 단계] 기능/화면 정의 → Phase 3 해당
  [검수 단계] 산출물 검증 → Phase 4 해당

납품 산출물 기준 매핑:
  표준 납품 요구 산출물      | 우리 산출물
  -------------------------|----------------------------------------
  요구사항분석서            | requirements-analysis.md
  기능명세서/기능정의서      | functional-spec.md
  화면설계서/화면정의서      | screen-spec.md
  요구사항추적표 (RTM)      | traceability-matrix.md
  변경관리대장              | si-state.json (change_requests 섹션)
```

### 4-4. TTAK (한국정보통신기술협회) — SW 요구사항 명세 표준

```
TTAK.KO-11.0023: 소프트웨어 요구사항 명세 가이드라인
                 (ISO/IEC 29148 국내 해설서)

주요 적용 사항:
  1. 요구사항 식별자(ID) 체계 권고 → 우리 RD-FR/NFR 체계와 일치
  2. 요구사항 상태 관리 (신규/검토중/승인/폐기) → si-state.json에 반영
  3. 기능 요구사항 작성 형식:
     "주어(Actor)는 목적어를 동사할 수 있다."
     예: "일반 사용자는 게시물을 등록할 수 있다."

요구사항 작성 형식 강제 규칙:
  [STD-KR-01] 기능 요구사항 작성 형식
    권장: "[이해관계자]는 [객체]를 [동사]할 수 있다."
    금지: "시스템은 [기능]을 제공한다." (주체 모호)
    금지: "[동사]하는 기능을 구현한다." (요구사항 아닌 구현 명세)
```

---

## 5. 표준별 우리 산출물 준거성 요약

### 산출물 × 표준 커버리지 매트릭스

```
산출물                        | IEEE 830 | ISO 25010 | IEEE 29148 | TTAK | 국내 지침
-----------------------------|----------|-----------|------------|------|----------
requirements-analysis.md    | ✅ 완전  | ✅ NFR섹션 | ✅ 명세     | ✅  | ✅
functional-spec.md          | ✅ 부분  | ✅ 기능적합성 | ✅ 명세   | ✅  | ✅
screen-spec.md              | △ 미포함 | ✅ 사용성  | △ 미포함    | △   | ✅
traceability-matrix.md      | ✅ 권장  | ✅ 추적성  | ✅ 필수     | ✅  | ✅
si-state.json               | △ 미정의 | △ 미정의  | ✅ 관리     | △   | △

✅ 완전 준수  /  △ 부분 준수  /  ❌ 미해당
```

### 표준 준거 선언 방법 (납품 시 활용)

```markdown
# 표준 준거 선언 (requirements-analysis.md 내 섹션)

## 참조 표준

본 요구사항분석서는 다음 표준을 준거하여 작성되었습니다:

| 표준 | 버전 | 준거 수준 | 비고 |
|------|------|---------|------|
| IEEE 830 / ISO 29148 | 2018 | 완전 준거 | 섹션 구조 준수 |
| ISO/IEC 25010 | 2011 | 완전 준거 | NFR 분류 체계 |
| 행안부 정보시스템 구축·운영 지침 | 최신 | 완전 준거 | 공공 도메인 |
| TTAK.KO-11.0023 | 최신 | 완전 준거 | 요구사항 작성 형식 |
| SW사업 대가산정 가이드 | 최신 | 부분 준거 | FP 산정 별도 |
```

---

## 6. 표준 기반 산출물 품질 체크리스트

### Phase 4 검증 시 자동 적용

```
[STD-CHECK-01] IEEE 830 섹션 완전성
  ✅ 1.1 목적 작성됨
  ✅ 1.2 범위 작성됨
  ✅ 1.3 용어 정의 (5개 이상)
  ✅ 2.3 이해관계자 식별
  ✅ 3.1 기능 요구사항 (최소 5건)
  ✅ 4.0 비기능 요구사항 (최소 4건)

[STD-CHECK-02] ISO 25010 NFR 커버리지
  ✅ 성능효율성 (응답 시간 수치 있음)
  ✅ 신뢰성 (가용성 % 있음)
  ✅ 보안성 (보안 정책 있음)
  △ 사용성 (접근성 기준 명시 권장)
  △ 유지보수성 (코딩 표준 권장)

[STD-CHECK-03] IEEE 29148 요구사항 품질
  ✅ 모호 표현 0건 (STD-Q01 통과)
  ✅ 단일 요구사항 준수 (STD-Q02 통과)
  ✅ NFR 정량화 (STD-Q03 통과)
  ✅ 추적성 완비 (GAP-TRACE-01 통과)

[STD-CHECK-04] TTAK 작성 형식
  ✅ FR 작성 형식 준수 (STD-KR-01)
  ✅ 요구사항 ID 체계 준수 (RD-FR/NFR)
  ✅ 요구사항 상태 필드 존재
```
