# ShopHub: E-commerce Project Team Configuration

> B2C 온라인 쇼핑몰 플랫폼의 완전한 프로젝트 팀 구성 예제

## 개요

ShopHub는 이커머스 프로젝트의 표준적인 팀 구성과 위험 영역 관리를 보여주는 예제입니다.

- **프로젝트 규모**: 중규모 (5개 도메인, 15명 팀)
- **기술 스택**: FastAPI + React + PostgreSQL
- **팀 구조**: Agent Teams 리드 4명 + 도메인 레벨 팀

## 파일 구조

```
ecommerce/
├── project-team.yaml          # 팀 구성 및 에이전트 설정
├── risk-areas.yaml            # 위험 영역 정의
└── README.md                  # 이 파일
```

## 프로젝트 팀 구조

### Agent Teams 리드 (4명, .claude/agents/)

| 역할 | 책임 |
|------|------|
| **team-lead** | 전체 조율, 도메인 간 조정, 스프린트 관리 |
| **architecture-lead** | 기술 표준, 마이크로서비스 설계, 아키텍처 VETO |
| **design-lead** | 디자인 시스템, UI/UX 가이드, 일관성 감시 |
| **qa-lead** | 통합 테스트, 품질 게이트, 릴리스 승인 |

### 프로젝트 팀 에이전트 (project-team/agents/)

| 역할 | 책임 |
|------|------|
| **Builder** | 구현 작업 지원, 도메인 간 전달 |
| **Reviewer** | 품질 리뷰 및 릴리스 검증 |
| **Designer** | 디자인 시스템 및 UX |
| **MaintenanceAnalyst** | 유지보수 및 분석 |

### 도메인 레벨 팀 (5개 도메인 × 3명)

#### 1. User Domain (사용자 관리)
- **책임**: 회원가입, 로그인, 프로필, 권한 관리
- **Domain lead**:인증/권한 정책 결정
- **Domain Designer**: 데이터 모델, API 설계, 인증 흐름
- **Domain Developer**: 개발/테스트 구현

#### 2. Product Domain (상품 관리)
- **책임**: 상품 조회, 검색, 필터링, 카테고리
- **Domain lead**:카탈로그 정책 결정
- **Domain Designer**: 검색 전략, API 설계
- **Domain Developer**: 개발/테스트 구현
- **의존성**: Inventory 도메인

#### 3. Order Domain (주문 관리)
- **책임**: 주문 생성, 조회, 취소, 반품
- **Domain lead**:주문 정책 결정
- **Domain Designer**: 상태 머신, 이벤트 정의
- **Domain Developer**: 개발/테스트 구현
- **의존성**: User, Product, Payment, Inventory 도메인

#### 4. Payment Domain (결제 관리)
- **책임**: 결제 처리, 결제 수단, 영수증
- **Domain lead**:결제 정책 결정, PCI-DSS 준수
- **Domain Designer**: 결제 흐름, 보안 설계
- **Domain Developer**: 개발/테스트 구현
- **의존성**: Order, User 도메인

#### 5. Inventory Domain (재고 관리)
- **책임**: 재고 조회, 업데이트, 예약, 경고
- **Domain lead**:재고 정책 결정
- **Domain Designer**: 재고 모델, 예약 전략
- **Domain Developer**: 개발/테스트 구현
- **의존성**: Product 도메인

## 도메인 의존성 다이어그램

```
┌─────────────┐
│   User      │  (기본 도메인 - 의존성 없음)
└─────────────┘
       ↑
       │
┌─────────────┐     ┌──────────────┐
│  Product    │────→│  Inventory   │
└─────────────┘     └──────────────┘
       ↑
       │
┌─────────────┐     ┌──────────────┐
│   Order     │────→│   Payment    │
└─────────────┘     └──────────────┘
    ↑   ↑                  ↑
    │   └──────────────────┘
    │
    └─────────────────────→ User
```

## 위험 영역 (Risk Areas)

### CRITICAL 레벨

#### 1. 결제 시스템 (Payment Domain)
- **위험도**: 최고 (금융 데이터)
- **PCI-DSS**: 3.2.1 준수 필수
- **필수 승인**: architecture-lead, qa-lead
- **필수 테스트**: Unit, Integration, E2E
- **보안 검사**: 암호화, PCI-DSS, SQL Injection, XSS, CSRF, 사기 탐지

```yaml
# 결제 도메인의 모든 변경은 다음을 만족해야 함:
required_approvals: ["architecture-lead", "qa-lead"]
required_tests: ["unit", "integration", "e2e"]
security_checks:
  - encryption (AES-256)
  - pci-dss (3.2.1)
  - fraud-detection
```

#### 2. 사용자 인증/권한 (User Domain)
- **위험도**: 최고 (보안)
- **영향도**: 모든 도메인에 영향
- **필수 승인**: architecture-lead
- **필수 테스트**: Unit (95%), Integration, Security
- **보안 검사**: OAuth2, JWT, Password Hashing, Session Management, Rate Limiting

### HIGH 레벨

#### 1. 주문 상태 머신 (Order Domain)
- **위험**: 트랜잭션 일관성, 금융 영향
- **필수 승인**: DBA
- **검증**: 동시성 제어, 트랜잭션 격리

#### 2. 재고 관리 (Inventory Domain)
- **위험**: 동시성 제어, Race Condition
- **필수 테스트**: Concurrency 테스트
- **검증**: 데드락 방지, 상호 배제

#### 3. API 컨트랙트 (Contracts)
- **위험**: Breaking Changes, 다중 도메인 영향
- **필수**: 30일 공지 기간
- **버전**: Semantic Versioning

#### 4. DB 마이그레이션 (Migrations)
- **위험**: 데이터 손실
- **배포 전략**: Blue-Green
- **필수**: 롤백 계획, 백업

#### 5. 보안 표준 (Security)
- **제한**: 하드코딩된 시크릿 금지
- **필수**: HashiCorp Vault 사용

#### 6. 성능 (Product Search)
- **목표**: 200ms (p95)
- **테스트**: 부하 테스트 (1000 RPS)

## Hook 시스템

### 1. permission-checker
파일 수정 권한 검증

```yaml
protected_paths:
  - ".claude/project-team.yaml" → team-lead만 수정
  - ".claude/standards/" → architecture-lead만 수정
  - "design-system/" → design-lead만 수정

domain_paths:
  - "src/domains/{domain}/" → domain-developer만 수정
  - "contracts/interfaces/{domain}-api.yaml" → domain-designer, part-leader만 수정
```

### 2. standards-validator
코딩/아키텍처 표준 검증

```yaml
code_style:
  linter: pylint (Python), eslint (TypeScript)
  rules: PEP 8, Airbnb JavaScript Style Guide

architecture:
  pattern: Hexagonal Architecture (DDD)
  must_have:
    - models/ (Entity, ValueObject)
    - schemas/ (DTO)
    - services/ (UseCase)
    - repositories/ (Persistence)
    - api/ (HTTP Handler)
```

### 3. design-validator
UI/UX 일관성 검증

```yaml
design_tokens: "design-system/tokens.json"
components: "design-system/components/"
```

### 4. quality-gate
품질 게이트 (배포 전 검증)

```yaml
test_coverage:
  minimum: 80%
  excluded: tests/, docs/

integration_tests: required

performance:
  max_response_time: 500ms
  target_p95: 200ms

security:
  tool: bandit (Python), eslint-plugin-security (TypeScript)
```

### 5. interface-validator
도메인 간 API 계약 검증

```yaml
versioning: "semantic" (major.minor.patch)
breaking_changes:
  require_approval: true
  min_notice_days: 30
```

### 6. cross-domain-notifier
도메인 간 변경 알림

```yaml
watch_paths:
  - contracts/interfaces/
  - design-system/

notification_strategy: "dependency"
# API 변경 시 → 사용하는 도메인에 자동 알림
# 디자인 변경 시 → 영향받는 도메인에 자동 알림
```

## 표준 및 가이드라인

### 코딩 표준

```python
# Naming Conventions
class UserService:           # PascalCase
    def create_user(self):   # snake_case
        MAX_RETRIES = 3      # UPPER_SNAKE_CASE
```

### 아키텍처 표준

Hexagonal Architecture (DDD) 패턴:

```
src/domains/{domain}/
├── models/              # Entity, ValueObject (도메인 모델)
├── schemas/             # DTO (Data Transfer Object)
├── services/            # UseCase (비즈니스 로직)
├── repositories/        # Persistence (데이터 액세스)
├── api/                 # HTTP Handler (REST API)
├── events.py            # Domain Events
├── exceptions.py        # Domain Exceptions
└── README.md            # 도메인 문서
```

### 테스트 표준

```
tests/
├── unit/                # 단위 테스트 (Coverage 80% 이상)
├── integration/         # 통합 테스트
├── e2e/                 # 엔드-투-엔드 테스트
└── performance/         # 성능 테스트
```

**목표**: 80% 코드 커버리지 (CRITICAL은 95%)

### 보안 표준

```yaml
authentication: "OAuth2 + JWT"
encryption:
  at_rest: "AES-256"
  in_transit: "TLS 1.3"

secret_management: "HashiCorp Vault"
pci_dss: "PCI-DSS 3.2.1 (결제 도메인)"
```

## 협업 프로세스

### 도메인 간 변경 요청 (Change Request)

```
1. 요청서 작성
   → requests/to-{domain}/ 디렉토리에 PR 생성

2. Domain lead 검토
   → 요청 대상 도메인의 Domain lead가 검토

3. 영향도 분석
   → interface-validator 훅이 자동 검증

4. Chief Architect (architecture-lead) 승인
   → Major changes (Breaking Changes)는 필수

5. 구현 및 테스트
   → Builder/Domain Developer가 구현, 테스트 작성

6. QA Manager (qa-lead) 승인
   → 통합 테스트, 품질 게이트 통과

7. 배포
   → team-lead가 배포 승인
```

### 정기 회의

| 회의 | 빈도 | 참석자 | 시간 |
|------|------|--------|------|
| Architecture Sync | 주 1회 | architecture-lead, 모든 Domain Lead | 1시간 |
| Design Sync | 격주 | design-lead, 모든 Domain Designer | 1시간 |
| QA/Release Planning | 주 1회 | qa-lead, 모든 Domain Lead | 1시간 |
| Domain Leads Standup | 일일 | team-lead, 모든 Domain Lead | 30분 |

### 문제 해결 (Escalation)

1. **Level 1**: 도메인 간 협의 (Domain Leads)
2. **Level 2**: team-lead 중재
3. **Level 3**: architecture-lead 최종 결정

## 모니터링 및 메트릭

### 핵심 지표

| 지표 | 목표 | 점검 빈도 |
|------|------|----------|
| Code Coverage | 80% | 일일 |
| Build Success Rate | 95% | 일일 |
| Test Execution Time | < 15분 | 일일 |
| API Response Time (p95) | < 200ms | 시간별 |
| Payment Success Rate | > 99.5% | 시간별 |
| Error Rate | < 0.1% | 시간별 |
| Inventory Accuracy | 99.9% | 일일 |

### 대시보드

- **Project Overview**: 프로젝트 전체 상태
- **Quality Metrics**: 코드 품질, 테스트 커버리지
- **Performance Monitoring**: 응답시간, 에러율, 처리량

## 배포 환경

### Development (개발)
- 자동 배포: 아니오
- 승인 필요: 아니오
- 사용: 로컬 개발자

### Staging (스테이징)
- 자동 배포: 아니오
- 승인 필요: **qa-lead** (필수)
- 목적: 본배포 전 최종 검증

### Production (운영)
- 자동 배포: 아니오
- 승인 필요: **team-lead** (필수)
- QA 검증: 필수
- 모니터링: 활성화

## 사용 가이드

### 1. 프로젝트 초기화

```bash
# 1. 이 예제를 프로젝트 루트로 복사
cp -r examples/ecommerce/* /path/to/your-project/

# 2. project-team.yaml 커스터마이징
vi .claude/project-team.yaml
# - 프로젝트명, 팀원 이름 수정
# - 기술 스택, 도메인 조정
# - 환경 변수 설정

# 3. risk-areas.yaml 커스터마이징 (선택사항)
vi .claude/risk-areas.yaml
# - 프로젝트 특성에 맞게 위험 영역 조정
```

### 2. 팀 온보딩

```bash
# 1. 각 팀원에게 프로젝트 구조 설명
# 2. project-team.yaml, README.md 공유
# 3. Hook 시스템 설정 확인
# 4. 표준 및 가이드라인 검토
```

### 3. 첫 번째 도메인 생성

```bash
# 1. Domain Designer가 API 컨트랙트 작성
# 2. Domain Developer가 모델, 서비스 구현
# 3. standards-validator 통과
# 4. Domain lead가 API 컨트랙트 승인
```

### 4. 도메인 간 의존성 관리

```bash
# 1. Consumer 도메인이 요청서 작성
#    → requests/to-{provider-domain}/
# 2. Provider domain lead 검토
# 3. 영향도 분석 (interface-validator)
# 4. architecture-lead 승인 (breaking change)
# 5. 구현 및 통합 테스트
# 6. 배포
```

### 5. 릴리스 프로세스

```
Phase 1: 개발 (Development)
  ↓
Phase 2: 통합 테스트 (Staging)
  ├─ qa-lead 검증
  ├─ 성능 테스트 (1000 RPS)
  └─ 보안 스캔
  ↓
Phase 3: 운영 배포 (Production)
  ├─ team-lead 승인
  ├─ Blue-Green 배포
  └─ Monitoring 활성화
  ↓
Phase 4: 모니터링
  └─ 메트릭 수집 및 분석
```

## 자주 묻는 질문 (FAQ)

### Q: 도메인 간 API 변경이 필요하면?

**A**: Change Request 프로세스를 따릅니다:

```bash
# 1. requests/to-{domain}/ 디렉토리 생성
mkdir -p requests/to-order/

# 2. 요청서 작성
# 2026-02-08-payment-webhook-api.md
# - 변경 사항
# - 영향받는 도메인
# - 마이그레이션 계획

# 3. 대상 도메인의 domain lead에게 검토 요청
# 4. interface-validator 훅이 자동으로 영향도 분석
# 5. Breaking change라면 architecture-lead 승인 필수
```

### Q: 도메인 개발 중 기술 표준 위반이 있으면?

**A**: standards-validator 훅이 자동으로 감지합니다:

```bash
# 1. 코드 리뷰 시 표준 위반 지적
# 2. .claude/standards/ 문서 참조
# 3. architecture-lead와 상담 (필요시)
# 4. 수정 후 다시 제출
```

### Q: CRITICAL 영역 변경 시 승인자가 없으면?

**A**: 배포 차단:

```bash
# 1. permission-checker 훅이 차단
# 2. 필수 승인자에게 요청
# 3. 승인 후 배포 가능

# CRITICAL 영역의 예:
# - Payment Domain (모든 파일)
# - User Domain (auth 폴더)
# - API Contracts (모든 변경)
```

### Q: 테스트 커버리지가 80% 미만이면?

**A**: quality-gate 훅이 배포 차단:

```bash
# 1. 테스트 작성으로 커버리지 증가
# 2. CRITICAL 도메인은 최소 95% 필요
# 3. 예외 승인은 team-lead에게 요청

# 확인 방법:
pytest --cov=src --cov-report=html
```

## 참고 자료

- **프로젝트 위키**: https://wiki.internal/shophub
- **디자인 시스템**: design-system/README.md
- **API 문서**: docs/api/README.md
- **아키텍처 가이드**: docs/architecture.md
- **코딩 표준**: docs/standards/
- **온보딩 가이드**: docs/onboarding/README.md
- **도메인 맵**: docs/domain-map.md
- **이벤트 스키마**: docs/events/schema.md

## 추가 리소스

### 템플릿 활용
- 새 프로젝트 시작 시 템플릿 참조: `../templates/project-team.yaml`
- 위험 영역 정의: `./risk-areas.yaml`

### 다른 예제
- **SaaS 프로젝트**: `../saas/`
- **API 프로젝트**: (추가 예정)
- **모바일 프로젝트**: (추가 예정)

## 업데이트 이력

| 버전 | 날짜 | 변경 사항 |
|------|------|----------|
| 1.0 | 2026-02-08 | 초기 버전 작성 |

## 피드백

프로젝트 팀 구성에 대한 피드백은 다음 채널을 통해 제출해주세요:

- **Slack**: #project-team-feedback
- **이슈 트래커**: projects/team-structure
- **회의**: 월간 아키텍처 리뷰

---

**작성자**: Documentation Team
**최종 검토**: architecture-lead, team-lead
**다음 검토**: 2026-05-08
