---
name: checkpoint
description: 태스크/PR 완료 시 즉시 코드 리뷰. Git Diff 자동 감지 + TASKS.md 컨텍스트 + Hook 게이트 + AI 멀티 리뷰. 태스크 완료 후, 커밋 전, "체크포인트", "리뷰해줘", "코드 검토", "변경사항 확인" 요청에 반드시 사용하세요.
version: 1.0.0
---

# 🔍 Checkpoint (태스크 완료 시점 코드 리뷰)

> **목적**: 태스크/PR 완료 시 즉시 코드 리뷰를 수행하여 이슈를 조기에 발견하고 수정합니다.
>
> **핵심 기능**:
> - Git Diff 자동 감지
> - TASKS.md 자동 컨텍스트 추출
> - `/security-review` 자동 호출
> - Hook 게이트 + 수정 가이드

---

## ⚡ 핵심 기능

### Git Diff 자동 감지
```

### 우리 `/checkpoint`
```
자동 감지: Git Diff (latest commit)
자동 추출: TASKS.md → 관련 태스크 매칭
Hook 연동: policy-gate, standards-validator
강화 보안: /security-review 자동 호출
AI 멀티: /multi-ai-review 선택적 호출
결과: Pass/Warning/Fail + 구체적 수정 가이드
```

---

## 🔄 실행 흐름

```
/checkpoint 실행
    ↓
┌─────────────────────────────────────────┐
│ 1단계: Git Diff 자동 감지              │
│   • git diff HEAD~1 HEAD 자동 실행    │
│   • 변경 파일 목록 추출               │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 2단계: TASKS.md 컨텍스트 추출          │
│   • 변경 파일 ↔ 태스크 매칭           │
│   • 관련 요구사항 자동 식별           │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 3단계: 2단계 리뷰                       │
│   • Stage 1: Spec Compliance          │
│   • Stage 2: Code Quality              │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 4단계: 강화 분석 (연동)                │
│   • /impact (영향도)                  │
│   • /deps (의존성)                    │
│   • /security-review (보안)             │
│   • /multi-ai-review (선택적 AI)       │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 5단계: Hook 게이트                      │
│   • policy-gate (권한 + 표준)         │
│   • standards-validator (규칙)        │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 결과: Pass / Warning / Fail             │
│   • 수정 가이드 생성                   │
│   • /recover 경로 제공                  │
└─────────────────────────────────────────┘
```

---

## 🎯 2단계 리뷰 상세

### Stage 1: Spec Compliance (명세 준수)

```yaml
체크리스트:
  요구사항 일치:
    - 변경 파일의 기능이 TASKS.md에 정의되어 있는가?
    - Mini-PRD / Socrates 요구사항과 일치하는가?

  누락 확인:
    - 명세된 예외 처리가 구현되었는가?
    - 엣지 케이스가 처리되는가?

  YAGNI 위반:
    - 명세되지 않은 불필요한 기능이 있는가?
    - Over-engineering 여부
```

### Stage 2: Code Quality (코드 품질)

```yaml
체크리스트:
  아키텍처:
    - SOLID 원칙
    - 관심사 분리
    - 의존성 주입

  코드 품질:
    - 명확한 네이밍
    - 복잡도 (Cyclomatic, Cognitive)
    - 코드 중복 (DRY)
    - 매직 넘버/스트링 제거

  에러 처리:
    - 모든 에러 케이스 처리
    - 의미 있는 에러 메시지
    - 적절한 로깅

  테스트:
    - 충분한 커버리지
    - 엣지 케이스 테스트
    - Mock 아닌 실제 동작 테스트
```

---

## 📊 심각도 분류

| 등급 | 조건 | 조치 |
|------|------|------|
| **🔴 Fail** | Critical 이슈 1개 이상 또는 Important 3개 이상 | 즉시 수정 필요 |
| **🟡 Warning** | Important 1~2개 또는 Minor 다수 | 확인 후 진행 가능 |
| **🟢 Pass** | 이슈 없음 또는 Minor만 | 다음 단계 진행 |

---

## 🔗 에코시스템 통합

### /agile 연동

```yaml
/agile (태스크 완료)
    ↓
/checkpoint 자동 호출
    ↓
결과에 따라:
  - Pass → 다음 태스크
  - Warning → 사용자 확인 후 진행
  - Fail → 수정 후 재체크포인트
```

### /team-orchestrate 연동

```yaml
/team-orchestrate (태스크 완료)
    ↓
/checkpoint 자동 호출 (post-task 게이트)
    ↓
Hook 게이트 통과 후 다음 태스크
```

### PR/Merge 연동

```bash
# Git Hook에서 자동 호출
pre-commit:  /checkpoint --mode=quick       # 빠른 체크
pre-push:    /checkpoint --mode=full        # 전체 체크
```

---

## 🛡️ 보안 연동

### /security-review 자동 호출

```yaml
/security-review 호출 조건:
  - auth, payment, user 관련 파일 변경
  - .env, config 파일 변경
  - API 라우팅 변경

결과에 따라:
  - 취약점 발견 → Fail + 수정 가이드
  - 없음 → Stage 진행
```

---

## 🤖 AI 멀티 리뷰 (선택적)

### /multi-ai-review 연동

```yaml
사용자 선택: "AI 리뷰도 함께 할까요?"

선택 시:
  /multi-ai-review
    ├── Gemini: 코드 가독성, 개선 제안
    └── Codex: SOLID, 패턴 분석

결과를 checkpoint 리포트에 통합
```

---

## 📋 출력 형식

```markdown
## Checkpoint Report

### 개요
- **Task**: T1.2 - 사용자 인증 API 구현
- **Date**: 2026-03-03 15:30
- **Commit**: abc123d

### 변경 범위
- **변경 파일**: 3개
  - `src/domains/auth/auth.service.ts` (+45, -12)
  - `src/api/auth.routes.ts` (+23, -5)
  - `src/middleware/auth.middleware.ts` (+18)

### Stage 1: Spec Compliance ✅
- 요구사항 일치: ✅
- 누락 기능: ✅
- YAGNI 위반: ✅

### Stage 2: Code Quality ⚠️
- 아키텍처: ⚠️ Warning
  - auth.service.ts: 단일 책임 과대 (Single Responsibility)
- 코드 품질: ✅
- 테스트: ⚠️ Warning
  - 엣지 케이스 커버리지 부족

### 연동 분석
- **/impact**: 중간 위험도 (인증 관련)
- **/deps**: 순환 의존성 없음
- **/security-review**: ✅ 통과

### 최종 판정
- **결과**: 🟡 Warning
- **조치**: 확인 후 진행 가능

### 수정 가이드
1. auth.service.ts를 Service + Repository로 분리
2. 엣지 케이스 테스트 추가
```

---

## 🚀 사용 예시

```bash
# 기본 사용
/checkpoint

# 특정 커밋 범위 지정
/checkpoint --files src/auth/*.ts

# AI 멀티 리뷰 포함
/checkpoint --ai-review

# 빠른 모드 (Spec만)
/checkpoint --mode=spec

# 전체 모드
/checkpoint --mode=full
```

---

**Last Updated**: 2026-03-03 (v1.1.0 - Standalone 독립 완료)
