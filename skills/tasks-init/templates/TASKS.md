# TASKS.md

> 생성일: {{DATE}}
> 프로젝트: {{PROJECT_NAME}}
> 태스크 수: {{TASK_COUNT}}

---

## T0 - Skeleton (구조)

- [ ] T0.1: 프로젝트 초기 설정
  - description: 기본 프로젝트 설정과 구조를 생성합니다.
  - deps: []
  - domain: shared
  - risk: low
  - owner: project-manager

- [ ] T0.2: 디렉토리 구조 생성
  - description: DDD/레이어드 구조에 맞춰 디렉토리를 생성합니다.
  - deps: [T0.1]
  - domain: shared
  - risk: low
  - owner: chief-architect

- [ ] T0.3: 타입/모델 정의
  - description: 공통 타입과 데이터 모델을 정의합니다.
  - deps: [T0.2]
  - domain: shared
  - risk: low
  - owner: backend-specialist
  - files: src/types/**/*.ts

- [ ] T0.4: 라우팅/네비게이션 설정
  - description: 기본 라우팅 구조를 설정합니다.
  - deps: [T0.2]
  - domain: frontend
  - risk: low
  - owner: frontend-specialist

## T1 - Muscles (핵심 기능)

{{FEATURE_TASKS}}

## T2 - Muscles Advanced (고급 기능)

- [ ] T2.1: 에러 핸들링
  - description: 통합 에러 핸들링 시스템을 구현합니다.
  - deps: [T1.*]
  - domain: shared
  - risk: medium
  - owner: backend-specialist

- [ ] T2.2: 로딩 상태 관리
  - description: 로딩 스켈레톤과 상태 관리를 구현합니다.
  - deps: [T1.*]
  - domain: frontend
  - risk: low
  - owner: frontend-specialist

- [ ] T2.3: 캐싱 레이어
  - description: Redis/메모리 캐싱을 구현합니다.
  - deps: [T1.*]
  - domain: backend
  - risk: medium
  - owner: backend-specialist

- [ ] T2.4: 검증/폼 처리
  - description: 폼 검증과 에러 메시지 처리를 구현합니다.
  - deps: [T1.*]
  - domain: frontend
  - risk: low
  - owner: frontend-specialist

## T3 - Skin (마무리)

- [ ] T3.1: 디자인 시스템 적용
  - description: 디자인 토큰과 컴포넌트 라이브러리를 적용합니다.
  - deps: [T2.*]
  - domain: frontend
  - risk: low
  - owner: chief-designer

- [ ] T3.2: 반응형 레이아웃
  - description: 모바일/태블릿/데스크톱 반응형을 구현합니다.
  - deps: [T2.*]
  - domain: frontend
  - risk: low
  - owner: frontend-specialist

- [ ] T3.3: 애니메이션/전환 효과
  - description: 페이지 전환과 인터랙션 애니메이션을 추가합니다.
  - deps: [T3.2]
  - domain: frontend
  - risk: low
  - owner: frontend-specialist

- [ ] T3.4: 접근성 검토
  - description: ARIA, 키보드 네비게이션, 스크린 리더를 검토합니다.
  - deps: [T3.*]
  - domain: shared
  - risk: medium
  - owner: qa-manager

---

## 메타데이터 설명

```yaml
# deps: 의존 태스크 ID 목록 (선행 태스크가 완료되어야 실행)
# domain: backend | frontend | shared (도메인 분리)
# risk: low | medium | critical (위험도, critical은 항상 직렬)
# files: 영향받는 파일 패턴 (충돌 감지용)
# owner: 담당 에이전트
# model: sonnet | gemini | haiku (선택, owner/model-routing을 덮는 명시적 override일 때만 사용)
```

## 다음 단계

TASKS.md가 생성되었습니다. 다음 단계를 선택하세요:

1. **수동 검토**: TASKS.md를 열고 태스크를 수정/추가합니다
2. **구현 시작**:
   - `/agile auto` → 30개 이하 태스크용 (레이어별 자동 구현)
   - `/team-orchestrate` → 30~80개 태스크용 (의존성 기반 병렬 실행)
3. **에이전트 팀 실행**: `project-team` 에이전트가 각 태스크를 담당하여 구현
