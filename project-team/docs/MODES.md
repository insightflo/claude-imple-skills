# Project-Team 모드 가이드

> 프로젝트 규모와 요구사항에 맞는 적절한 모드를 선택하세요.

## 개요

Project-Team은 네 가지 운영 모드를 제공합니다:

| 모드 | 대상 | 워커 에이전트 | Hook 수 | 특징 |
|------|------|------------|---------|----------|
| **lite** | 스타트업/MVP | 2 (builder, reviewer) | 4 | 최소 거버넌스 |
| **standard** | 일반 프로젝트 | 3 (+ designer) | 7 | 균형잡힌 거버넌스 |
| **full** | 엔터프라이즈 | 4 (모든 워커) | 20 | 완전한 거버넌스 |
| **team** | Agent Teams | 4 워커 + 4 리드 | 20 | 네이티브 멀티에이전트 |

---

## Lite 모드

### 적합한 프로젝트

- 스타트업 MVP 개발
- 소규모 팀 (1-3명)
- 빠른 이터레이션 필요
- 최소한의 거버넌스로 충분한 경우

### 구성

```yaml
mode: lite

agents:
  - builder    # 구현 실행
  - reviewer   # 코드 리뷰 & QA

hooks:
  - permission-checker     # 에이전트 권한 검증
  - pre-edit-impact-check  # 편집 전 영향도 분석
  - risk-area-warning      # 위험 영역 경고
  - quality-gate           # 기본 품질 게이트
```

### 특징

- **최소 오버헤드**: 필수 거버넌스만 유지
- **빠른 속도**: 승인 프로세스 간소화
- **VETO 없음**: 차단 대신 경고만 제공

### 워크플로우

```
사용자 요청 → Builder (구현)
           → Reviewer (코드 리뷰)
```

---

## Standard 모드 (권장)

### 적합한 프로젝트

- 일반적인 비즈니스 애플리케이션
- 중간 규모 팀 (4-10명)
- 품질과 속도 균형 필요
- API 계약 관리가 필요한 경우

### 구성

```yaml
mode: standard

agents:
  - builder    # 구현 실행
  - reviewer   # 코드 리뷰 & QA
  - designer   # 디자인 전문

hooks:
  - permission-checker       # 에이전트 권한 검증
  - pre-edit-impact-check    # 편집 전 영향도 분석
  - risk-area-warning        # 위험 영역 경고
  - quality-gate             # 품질 게이트
  - standards-validator      # 코딩 표준 검증
  - design-validator         # 디자인 시스템 강제
  - security-scan            # 보안 취약점 스캔
```

### 특징

- **균형잡힌 거버넌스**: 적절한 통제와 자율성
- **품질 게이트**: Phase 완료 전 검증
- **도메인 간 협업**: API 계약 기반 통신

### 워크플로우

```
사용자 요청
    ↓
Builder (구현) → Designer (디자인 리뷰)
    ↓
Reviewer (코드 리뷰 & 품질 게이트)
```

---

## Full 모드

### 적합한 프로젝트

- 엔터프라이즈 시스템
- 규제 산업 (금융, 의료, 보험)
- 대규모 팀 (10명 이상)
- 엄격한 컴플라이언스 필요
- 감사 추적이 필수인 경우

### 구성

```yaml
mode: full

agents:
  - builder              # 구현 실행
  - reviewer             # 코드 리뷰 & QA
  - designer             # 디자인 전문
  - maintenance-analyst  # 유지보수 분석

hooks: all               # 20개 모든 Hook 활성화

features:
  veto_authority: true
  cross_domain_notification: true
  quality_gate_strict: true    # 차단 모드
  compliance_tracking: true
  audit_logging: true
```

### 특징

- **완전한 거버넌스**: 20개 모든 Hook 활성화
- **감사 추적**: 모든 결정 기록
- **컴플라이언스**: 규제 요구사항 충족
- **분리된 역할**: 4개 워커 에이전트 모두 활성화

---

## Team 모드 (신규)

### 적합한 프로젝트

- 병렬 멀티에이전트 작업이 필요한 경우
- 복잡한 기능을 여러 서브에이전트에 분배해야 하는 경우
- Claude의 네이티브 Agent Teams 기능을 활용하는 경우

### 구성

```yaml
mode: team

# Agent Teams 리드 (.claude/agents/)
leads:
  - team-lead            # 전체 조율 & Task 분배
  - architecture-lead    # 기술 표준 & VETO 권한
  - qa-lead              # 품질 게이트 & 릴리스 승인
  - design-lead          # 디자인 시스템 & 일관성

# 워커 에이전트 (project-team/agents/) — 리드가 Task tool로 호출
workers:
  - builder
  - reviewer
  - designer
  - maintenance-analyst

hooks: all               # 20개 모든 Hook 활성화
```

### 특징

- **네이티브 멀티에이전트**: Claude Task tool 기반 병렬 실행
- **계층적 조율**: 리드 → Task → 워커 구조
- **완전한 거버넌스**: 20개 Hook + 리드 레벨 VETO
- **teammate-idle-gate**: 유휴 서브에이전트 핸드오프 방지
- **task-completed-gate**: Task 완료 기준 자동 검증

### 워크플로우

```
사용자 요청 → team-lead
                ↓ (Task tool)
    ┌───────────┼───────────┐
    ↓           ↓           ↓
 Builder     Reviewer    Designer
 (구현)      (리뷰)      (디자인)
    └───────────┴───────────┘
                ↓
    architecture-lead (기술 검토)
    design-lead (디자인 검토)
    qa-lead (품질 게이트)
```

---

## 모드 선택 가이드

### 의사결정 트리

```
프로젝트 시작
     │
     ▼
┌──────────────────────┐
│ 네이티브 멀티에이전트? │
└──────────┬───────────┘
           │
      Yes  │  No
       ▼   │
     TEAM  │
           ▼
┌─────────────────┐
│ 규제 산업인가? │
└────────┬────────┘
         │
    Yes  │  No
    ▼    │
  FULL   │
         ▼
┌─────────────────┐
│ 팀 규모 > 5명? │
└────────┬────────┘
         │
    Yes  │  No
    ▼    │
STANDARD │
         ▼
┌─────────────────┐
│ MVP/POC 단계? │
└────────┬────────┘
         │
    Yes  │  No
    ▼    ▼
  LITE  STANDARD
```

### 모드 전환

프로젝트가 성장하면 모드를 업그레이드할 수 있습니다:

```yaml
# project-team.yaml
mode: standard  # lite → standard로 변경

# 설치 스크립트로 Hook 업데이트
./install.sh --mode standard
```

---

## 설치 옵션

```bash
# Lite 모드로 설치
./install.sh --mode lite

# Standard 모드로 설치 (기본값)
./install.sh --mode standard

# Full 모드로 설치
./install.sh --mode full

# Team 모드로 설치 (Agent Teams 리드 포함)
./install.sh --mode team

# 현재 모드 확인
./install.sh --show-mode
```

---

## 비용 및 성능 비교

| 측면 | Lite | Standard | Full | Team |
|------|------|----------|------|------|
| **API 호출 비용** | 낮음 | 중간 | 높음 | 높음 |
| **응답 시간** | 빠름 | 중간 | 느림 | 중간(병렬) |
| **거버넌스 수준** | 최소 | 적절 | 최대 | 최대 |
| **오류 방지** | 기본 | 양호 | 우수 | 우수 |
| **컴플라이언스** | X | 부분 | 완전 | 완전 |
| **감사 추적** | X | X | O | O |
| **병렬 실행** | X | X | X | O |

---

## FAQ

### Q: 어떤 모드를 선택해야 하나요?

**A**: 대부분의 프로젝트는 **Standard 모드**를 권장합니다. MVP 단계이거나 매우 작은 팀이라면 Lite, 규제 산업이나 엔터프라이즈 환경이라면 Full을 선택하세요.

### Q: 모드를 변경하면 기존 설정이 사라지나요?

**A**: 아니요. 모드는 활성화되는 에이전트와 Hook을 결정할 뿐, 기존 설정은 유지됩니다. 비활성화된 에이전트는 `enabled: false` 상태가 됩니다.

### Q: Lite 모드에서 보안이 약해지나요?

**A**: 기본적인 보안 훅(permission-checker, risk-area-warning)은 Lite 모드에도 포함됩니다. 완전한 security-scan은 Standard 이상에서 활성화됩니다. 보안이 중요하다면 Standard 이상을 권장합니다.

### Q: Full 모드의 비용이 걱정됩니다.

**A**: Full 모드는 모든 Hook이 활성화되어 처리량이 증가합니다. 하지만 오류 방지와 품질 향상으로 장기적 비용 절감 효과가 있습니다. 규제 요구사항이 있다면 Full 모드가 필수입니다.

### Q: Team 모드와 Full 모드의 차이는?

**A**: Full 모드는 4개 워커 에이전트를 순차적으로 직접 호출하는 방식입니다. Team 모드는 Agent Teams 리드(team-lead, architecture-lead 등)가 Claude의 네이티브 Task tool을 통해 워커를 병렬 호출합니다. 복잡한 멀티도메인 작업을 동시에 처리해야 한다면 Team 모드를 선택하세요.

---

**Version**: 4.0.0
**Last Updated**: 2026-03-16
