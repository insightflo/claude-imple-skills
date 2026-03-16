# CloudMetrics: SaaS Project Team Configuration

> 멀티테넌트 SaaS 분석 플랫폼의 완전한 프로젝트 팀 구성 예제

## 개요

CloudMetrics는 멀티테넌트 SaaS 시스템의 팀 구성과 위험 영역 관리를 보여주는 예제입니다.

- **프로젝트 규모**: 중대형 (5개 도메인)
- **기술 스택**: FastAPI + React + PostgreSQL + InfluxDB
- **팀 구조**: Agent Teams 리드 4명 + 도메인 레벨 팀

## SaaS 프로젝트의 특성

SaaS 프로젝트는 기존 웹 애플리케이션과 다음 점에서 다릅니다:

### 1. 멀티테넌트 환경
- 여러 고객의 데이터를 같은 데이터베이스에 저장
- **데이터 격리가 최우선** → CRITICAL 위험도

### 2. 수익과 직결된 청비 시스템
- 청비 오류 = 수익 손실
- **청비 정확도가 회사 신뢰도에 영향** → CRITICAL 위험도

### 3. 고객 신뢰의 중요성
- 한 번의 데이터 유출 = 고객 이탈
- 규정 준수 필수 (GDPR, CCPA, SOC2)

### 4. 확장성 요구사항
- 초기: 100 테넌트 → 최종: 10,000+ 테넌트
- 성능이 중요한 경쟁 요소

## 파일 구조

```
saas/
├── project-team.yaml          # 팀 구성 및 에이전트 설정
├── risk-areas.yaml            # 위험 영역 정의 (SaaS 중심)
└── README.md                  # 이 파일
```

## 프로젝트 팀 구조

### Agent Teams 리드 (4명, .claude/agents/)

| 역할 | 책임 | SaaS 특화 |
|------|------|----------|
| **team-lead** | 전체 조율, 로드맵 | 고객 요청 우선순위 결정 |
| **architecture-lead** | 기술 표준, 멀티테넌트 아키텍처 | 테넌트 격리 전략 검증 |
| **design-lead** | 디자인 시스템, 대시보드 UI | 분석 시각화 표준 |
| **qa-lead** | 품질 게이트, 통합 테스트 | 테넌트 격리 검증 |

### 프로젝트 팀 에이전트 (project-team/agents/)

| 역할 | 책임 |
|------|------|
| **Builder** | 구현 작업 지원, 도메인 간 전달 |
| **Reviewer** | 품질 리뷰 및 릴리스 검증 |
| **Designer** | 디자인 시스템 및 UX |
| **MaintenanceAnalyst** | 유지보수 및 분석 |

### 도메인 레벨 팀 (5개 도메인)

#### 1. Auth Domain (인증 및 테넌트 관리)
- **책임**: SSO, SAML, 테넌트 프로비저닝, RBAC
- **특성**: 모든 도메인의 기반 (의존성 없음)
- **기술**: OAuth2, SAML2, JWT, PostgreSQL
- **위험도**: CRITICAL (보안)

#### 2. Subscription Domain (구독 관리)
- **책임**: 플랜 관리, 구독 생성/갱신/취소
- **의존성**: Auth (테넌트 정보)
- **특성**: 청비의 기반 데이터
- **위험도**: HIGH (상태 관리)

#### 3. Billing Domain (청비 관리)
- **책임**: 인보이스 생성, 결제 처리, 세금 계산
- **의존성**: Subscription, Usage
- **특성**: 수익에 직접 영향 (감사 로깅 필수)
- **위험도**: CRITICAL (정확도)

#### 4. Usage Domain (사용량 추적)
- **책임**: API 호출 추적, 메트릭 수집
- **의존성**: Auth
- **특성**: 청비 계산의 기초
- **위험도**: HIGH (정확도)

#### 5. Analytics Domain (분석 및 보고)
- **책임**: 대시보드, 리포트 생성, 시각화
- **의존성**: Usage, Subscription, Billing
- **특성**: 고객 가치 제공 (성능 중요)
- **위험도**: HIGH (성능)

## 도메인 의존성 다이어그램

```
┌──────────┐
│   Auth   │  (기반 도메인 - 의존성 없음)
└──────┬───┘
       │
       ├─────────────┬──────────────┬─────────────┐
       │             │              │             │
       ↓             ↓              ↓             ↓
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ Subscription│ │  Usage   │  │ Analytics │  │  Billing │
   └──┬───────┘  └──────────┘  └──────────┘  └──────────┘
      │                               ↑
      │                               │
      └───────────────────────────────┘
         Billing depends on Subscription & Usage
```

## SaaS 특화 위험 영역

### CRITICAL: 테넌트 데이터 격리

**왜 중요한가?**

멀티테넌트 SaaS의 최고 위험도 문제입니다. 만약 테넌트 A의 데이터가 테넌트 B에게 노출되면:

```
고객 신뢰 상실
    ↓
GDPR/CCPA 위반
    ↓
규제 당국 벌금 ($$$)
    ↓
회사 신뢰도 하락
    ↓
고객 이탈
```

**검증 방법**

모든 쿼리는 반드시 `tenant_id`로 필터링되어야 합니다:

```python
# ❌ 잘못된 코드
def get_users():
    return db.query(User).all()  # 모든 테넌트의 사용자 반환!

# ✅ 올바른 코드
def get_users(tenant_id: str):
    return db.query(User).filter(User.tenant_id == tenant_id).all()
```

**Row-Level Security (RLS) 정책**

PostgreSQL RLS를 사용한 추가 보호:

```sql
-- RLS 정책: 사용자는 자신의 테넌트 데이터만 접근
CREATE POLICY tenant_isolation ON users
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### CRITICAL: 청비 시스템

**왜 중요한가?**

```
청비 오류 (1%)
    ↓
매월 손실: 10,000 USD × 1% = 100 USD
    ↓
연간 손실: 1,200 USD
    ↓
고객 신뢰 상실 + 환불 요청
```

**청비 프로세스**

```
Subscription 변경
    ↓
Usage 집계
    ↓
Billing 엔진 (사용량 × 단가 + 세금)
    ↓
Invoice 생성
    ↓
Payment 처리
    ↓
Customer 청구
```

**필수 감시 로깅 (Audit Logging)**

모든 청비 계산 단계를 기록:

```yaml
billing_calculation_started:
  - tenant_id
  - subscription_id
  - billing_period
  - timestamp

usage_counted:
  - tenant_id
  - metric
  - count
  - unit_price
  - total_price

invoice_generated:
  - invoice_id
  - tenant_id
  - subtotal
  - tax
  - total
  - timestamp

payment_processed:
  - invoice_id
  - payment_gateway
  - status
  - transaction_id
  - timestamp
```

**테스트 시나리오**

```yaml
# 시나리오 1: 기본 월간 청비
- subscription: "Pro ($100/month)"
- period: "1 months"
- usage: "standard"
- expected: "$100"

# 시나리오 2: 월간 업그레이드
- day 1-15: "Basic ($50/month)"
- day 15-30: "Pro ($100/month)"
- expected: "$50 * (15/30) + $100 * (15/30) = $75"

# 시나리오 3: 사용량 기반 요금
- base_plan: "Pro ($100/month)"
- overage: "1000 API calls @ $0.01 per call"
- expected: "$100 + (1000 * $0.01) = $110"

# 시나리오 4: 세금 계산
- customer: "EU (VAT 21%)"
- subtotal: "$100"
- expected: "$100 + $21 = $121"

# 시나리오 5: 환율 변동
- base_currency: "USD"
- billing_currency: "KRW"
- rate: "1 USD = 1200 KRW"
- subtotal: "$100"
- expected: "120,000 KRW"
```

### CRITICAL: 인증 및 권한 (SSO/SAML)

**멀티테넌트 SSO의 과제**

```
기존 웹앱 인증:
  사용자 → (OAuth) → Google
              ↓
          사용자 로그인

SaaS 멀티테넌트 인증:
  사용자 → (SAML) → 회사 IdP (Active Directory)
              ↓
         회사 확인
              ↓
         어느 테넌트에 속하는가?
              ↓
         테넌트의 Role은?
              ↓
         권한 확인
              ↓
         로그인 승인/거부
```

**필수 검증**

```python
# SAML 어설션에서 테넌트 정보 추출
def process_saml_response(saml_assertion):
    # 1. 어설션 서명 검증
    if not verify_signature(saml_assertion):
        raise UnauthorizedError()

    # 2. 테넌트 식별
    tenant_id = extract_tenant_id(saml_assertion)

    # 3. 사용자 매핑
    user = map_to_tenant(saml_assertion, tenant_id)

    # 4. 권한 확인
    roles = get_user_roles(user, tenant_id)

    # 5. 토큰 생성 (tenant_id 포함)
    token = create_jwt_token(user, tenant_id, roles)

    return token
```

### HIGH: 사용량 추적

**청비와의 관계**

```
사용량 추적 오류
    ↓
청비 계산 오류
    ↓
고객 청구 오류
    ↓
고객 불만족
```

**대량 사용량 처리**

```
1시간에 1,000,000개 API 호출 이벤트
    ↓
Kafka로 수신
    ↓
배치 처리 (5분 단위)
    ↓
InfluxDB에 저장
    ↓
매시간 집계
```

**Idempotency (중복 방지)**

같은 이벤트가 2번 발송되어도 1번만 기록:

```python
def record_usage(event_id: str, usage: int):
    # event_id로 중복 확인
    if already_recorded(event_id):
        return  # 무시

    # 처음 기록하는 경우만 저장
    db.save_usage(event_id, usage)
```

## Hook 시스템 (SaaS 특화)

### 1. permission-checker (Strict Mode)

SaaS는 데이터 격리가 중요하므로 `strict: true` 사용:

```yaml
permission-checker:
  enabled: true
  strict: true  # 권한 위반 시 즉시 차단
```

### 2. standards-validator (테넌트 격리 검증)

```yaml
tenant_isolation:
  enabled: true
  rules:
    - "모든 쿼리에 tenant_id 필터링 필수"
    - "테넌트 간 데이터 접근 차단"
    - "Row-Level Security(RLS) 정책 검증"
```

### 3. quality-gate (테넌트 격리 테스트)

```yaml
quality-gate:
  tenant_isolation_tests:
    enabled: true
    description: |
      - Tenant A의 데이터만 조회 가능
      - Tenant B의 쿼리로 Tenant A 데이터 접근 불가
      - Cross-tenant 접근 시도 → 403 Forbidden
```

## SaaS 팀 규칙

### 규칙 1: 모든 쿼리에 tenant_id 필터링

```python
# ❌ 반드시 수정해야 할 코드
db.query(Invoice).filter(Invoice.amount > 1000)

# ✅ 올바른 코드
db.query(Invoice)\
    .filter(Invoice.tenant_id == tenant_id)\
    .filter(Invoice.amount > 1000)
```

### 규칙 2: 청비 변경 시 qa-lead 승인 필수

청비 계산 로직 변경 시 반드시 다음 단계를 거쳐야 합니다:

```
개발자 구현
    ↓
회귀 테스트 (모든 시나리오)
    ↓
qa-lead 검증
    ↓
스테이징 환경 테스트
    ↓
프로덕션 배포
```

### 규칙 3: 테넌트 격리 테스트 필수

모든 도메인의 리포지토리 변경 시:

```python
def test_tenant_isolation():
    # Tenant A 생성
    tenant_a_data = create_test_data("tenant_a")

    # Tenant B 생성
    tenant_b_data = create_test_data("tenant_b")

    # Tenant B의 쿼리로 Tenant A 데이터 조회 시도
    result = get_data_for_tenant("tenant_b")

    # Tenant A의 데이터가 포함되지 않아야 함
    assert tenant_a_data not in result
```

### 규칙 4: 감사 로깅 필수

청비, 사용량, 인증 등 중요 이벤트는 반드시 로깅:

```python
def process_payment(invoice_id, amount):
    # 감사 로그: 시작
    audit_log("payment_started", {
        "invoice_id": invoice_id,
        "amount": amount,
        "timestamp": now()
    })

    # 결제 처리
    result = payment_gateway.charge(amount)

    # 감사 로그: 결과
    audit_log("payment_completed", {
        "invoice_id": invoice_id,
        "status": result.status,
        "transaction_id": result.id,
        "timestamp": now()
    })
```

## 모니터링 메트릭 (SaaS 중심)

### 청비 관련 메트릭

| 메트릭 | 목표 | 점검 |
|--------|------|------|
| Billing Accuracy | 99.99% | 일일 |
| Invoice Generation Time | < 1분 | 일일 |
| Payment Success Rate | > 99% | 시간별 |
| Revenue Reconciliation | 100% | 일일 |

### 사용량 추적 메트릭

| 메트릭 | 목표 | 점검 |
|--------|------|------|
| Usage Event Latency | < 5분 | 시간별 |
| Usage Accuracy | 99.9% | 일일 |
| Concurrent Tracked Tenants | > 10,000 | 일일 |

### 테넌트 격리 메트릭

| 메트릭 | 목표 | 점검 |
|--------|------|------|
| Data Isolation Score | 100% | 일일 |
| Cross-tenant Access Attempts | 0 | 실시간 |
| RLS Policy Effectiveness | 100% | 주간 |

## 배포 프로세스 (SaaS 특화)

### 1. Development
```
개발자가 로컬에서 개발
    ↓
단위 테스트 (Coverage 85%+)
```

### 2. Staging
```
스테이징 환경에 배포 (테스트 테넌트)
    ↓
통합 테스트
    ↓
qa-lead 검증
    ↓
성능 테스트
    ↓
보안 스캔
    ↓
테넌트 격리 검증
```

### 3. Production
```
Blue-Green 배포
    ↓
모니터링 활성화
    ↓
실시간 메트릭 수집
    ↓
이상 감지 시 자동 롤백
```

### 4. Post-Deployment
```
청비 정확도 검증 (샘플 청구)
    ↓
고객 피드백 수집
    ↓
주간 안정성 리뷰
```

## FAQ

### Q: 도메인 간 테넌트 격리는 어떻게 보장하나요?

**A**: 여러 계층에서 보장합니다:

1. **Application Level**
   - 모든 쿼리에 `tenant_id` 필터링

2. **Database Level**
   - Row-Level Security (RLS) 정책
   - 테넌트별 스키마 분리 (선택사항)

3. **API Level**
   - JWT 토큰에 `tenant_id` 포함
   - 모든 요청에서 `tenant_id` 검증

### Q: 청비 오류가 발생하면 어떻게 하나요?

**A**: 감사 로그를 통해 추적합니다:

```
1. 감사 로그에서 청비 계산 단계 확인
2. 어느 단계에서 오류가 발생했는지 파악
3. 재계산하여 수정
4. 영향받은 고객에게 알림
5. 원인 분석 및 개선
```

### Q: 새 도메인을 추가하려면?

**A**: 다음 단계를 따릅니다:

```
1. project-team.yaml에 도메인 추가
2. API 컨트랙트 (contracts/interfaces/{domain}-api.yaml) 정의
3. 데이터 모델에 tenant_id 필드 추가
4. Row-Level Security(RLS) 정책 작성
5. 테넌트 격리 테스트 작성
6. architecture-lead 리뷰
7. DBA 검증
8. 배포
```

### Q: 기존 쿼리에 tenant_id 필터링을 빠뜨렸다면?

**A**: standards-validator 훅이 감지합니다:

```
Pull Request 제출
    ↓
standards-validator 검사
    ↓
"WHERE 절에 tenant_id가 없습니다" 오류
    ↓
개발자가 수정
    ↓
재검사
    ↓
통과
```

## 참고 자료

### 핵심 문서
- **멀티테넌트 아키텍처**: `docs/multi-tenancy.md`
- **보안 표준**: `docs/standards/security.md`
- **청비 시스템**: `docs/billing/README.md`
- **SaaS 최고 사례**: `docs/saas/best-practices.md`

### 규정 준수
- **GDPR**: `docs/compliance/GDPR.md`
- **CCPA**: `docs/compliance/CCPA.md`
- **SOC2**: `docs/compliance/SOC2.md`

### 외부 리소스
- [OWASP Multi-Tenancy](https://owasp.org/www-community/attacks/Multi-Tenant_Vulnerabilities)
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [SaaS Architecture Best Practices](https://www.aws.amazon.com/blogs/apn/multi-tenant-saas/)

## 업데이트 이력

| 버전 | 날짜 | 변경 사항 |
|------|------|----------|
| 1.0 | 2026-02-08 | 초기 버전 작성 |

## 피드백

SaaS 팀 구성에 대한 피드백:

- **Slack**: #saas-architecture
- **이슈 트래커**: projects/saas-team
- **정기 회의**: 월간 아키텍처 검토

---

**작성자**: Documentation Team
**검토자**: architecture-lead, team-lead, DBA
**다음 검토**: 2026-05-08
