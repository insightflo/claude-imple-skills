---
name: orchestrate-standalone
description: 30~200개 태스크를 의존성 기반으로 병렬 실행합니다. Hybrid Wave 모드로 대규모도 일관성 유지.
triggers:
  - /orchestrate-standalone
  - /orchestrate
  - 오케스트레이트
  - 태스크 실행
version: 2.1.0
updated: 2026-03-05
---

# 🚀 Orchestrate Standalone

> **목표**: 30~200개 태스크를 의존성 기반 병렬 실행
>
> **철학**: Contract-First + Wave 단위 병렬 + 중간 검증 = 대규모에서도 일관성 유지

---

## ⚡ 실행 모드

| 모드 | 태스크 수 | 워커 수 | 설명 |
|------|----------|---------|------|
| **lite** | 30~50 | 2 | 빠른 실행 |
| **standard** | 50~80 | 4 | 일반 프로젝트 |
| **wave** | 80~200 | 4~8 | **Hybrid Wave Architecture** (NEW) |
| **sprint** | 50~200 | 4 | **Agile Sprint Mode** (NEW) — PI 계획 + 스프린트 Gate |
| **full** | 80개+ | 8 | 대규모 병렬 (legacy) |

---

## 🌊 Hybrid Wave Architecture (v2.0)

> Multi-AI Council 합의: Contract-First + 도메인 병렬 + 중간 검증 = 대규모 일관성

```
┌─────────────────────────────────────────────────────────┐
│  Phase 0: Shared Foundation (단일 에이전트)              │
│  - API 스키마, 타입, 에러 규약, 디자인 토큰 확정         │
│  - contracts/ 디렉토리에 계약 파일 생성                  │
│  - 이 단계 완료 전 병렬 진입 불가                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 1: Domain Parallelism (다중 에이전트)             │
│  - Wave 단위: 20-40 tasks                               │
│  - 도메인별 전문 에이전트가 병렬 실행                    │
│  - 중간 인터페이스 검증 (Wave 중간에 실행)               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 2: Cross-Review Gate                             │
│  - 각 에이전트가 다른 에이전트 결과물 검토               │
│  - contract-gate: 계약 준수 검증                         │
│  - 중복 코드, 타입 불일치 탐지                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 3: Integration & Polish (단일 에이전트)           │
│  - 공통 모듈 통합, 중복 제거                            │
│  - 최종 품질 감사 (/quality-auditor)                    │
└─────────────────────────────────────────────────────────┘
```

### Wave 모드 사용법

```bash
# Phase 0: 계약 생성 (필수 선행)
/orchestrate-standalone --mode=wave --phase=0

# Phase 1-3: 자동 실행
/orchestrate-standalone --mode=wave --wave-size=30
```

### Wave vs Legacy 비교

| 관점 | Legacy (full) | Wave (v2.0) |
|------|---------------|-------------|
| 통합 충돌 | 스프린트 말 발견 | Phase 2에서 조기 탐지 |
| Context Drift | 높음 | 계약으로 방지 |
| 병렬 효율 | 높음 | 높음 + 일관성 보장 |
| 권장 태스크 | 80+ | 80~200 |

---

### Sprint Mode (Agile Gate)

50-200 태스크를 3-4 스프린트로 분할하여, 각 스프린트 종료 시 사용자가
동작하는 결과물을 확인하고 방향을 수정할 수 있습니다.

```bash
/orchestrate-standalone --mode=sprint
/orchestrate-standalone --mode=sprint --sprint-size=25  # 스프린트 크기 조정
```

흐름:
1. PI 계획 수립 (스프린트 분할 표시 → 사용자 승인)
2. Sprint 실행 (Wave 병렬 실행)
3. Sprint Review (변경 요약 + 테스트 결과)
4. User Gate: [A]pprove / [M]odify / [S]top
5. Retro → 다음 스프린트

---

## 📋 필수 입력

> **💡 Tip**: 기획 문서나 TASKS.md가 너무 길면 `/compress` 스킬로 핵심 추출 후 시작하세요.

### 1. TASKS.md (확장 포맷)

```yaml
## T1 - User Resource

- [ ] T1.1: User API 설계
  - deps: []
  - domain: backend
  - risk: low
  - owner: backend-specialist
  - model: sonnet

- [ ] T1.2: User API 구현
  - deps: [T1.1]
  - domain: backend
  - risk: medium
  - files: src/domains/user/*
  - owner: backend-specialist
```

### 2. 메타 필드

| 필드 | 용도 | 필수 여부 |
|------|------|----------|
| `deps` | 의존 태스크 ID 리스트 | ✅ |
| `domain` | 백엔드/프론트엔드 구분 | 선택 |
| `risk` | low/medium/high/critical | 선택 |
| `files` | 영향받는 파일 패턴 | 선택 |
| `owner` | 담당 에이전트 | 선택 |
| `model` | 사용 모델 (sonnet/gemini) | 선택 |

---

## 🏗️ 실행 프로세스

```
1. TASKS.md 파싱
   ↓
2. 의존성 그래프 구축 (Kahn 알고리즘)
   ↓
3. 병렬 레이어 생성 (Topological Sort)
   ↓
4. 충돌 감지 (파일/도메인)
   ↓
5. 게이트 체인 통과
   ↓
6. Worker Pool 병렬 실행
   ↓
7. 상태 저장 (.claude/orchestrate-state.json)
```

---

## 🪝 게이트 체인

### Pre-Dispatch Gate
```javascript
policy-gate (권한 + 표준)
  ↓
risk-gate (영향도 + 위험도)
```

### Post-Task Gate (v1.1.0)
```javascript
contract-gate (API 계약 검증)
  ↓
checkpoint-review (2단계 코드 리뷰) ← NEW: /checkpoint 연동
  ↓
docs-gate (문서 + 변경 이력)
  ↓
task-sync (TASKS.md 업데이트)
```

### Phase/Layer Barrier Gate
```javascript
quality-gate (품질 게이트)
  ↓
security-scan (보안 스캔)
```

---

## 🔄 상태 관리

### 상태 파일: `.claude/orchestrate-state.json`

```json
{
  "version": "1.0.0",
  "started_at": "2026-03-03T10:00:00Z",
  "tasks": [
    {
      "id": "T1.1",
      "status": "completed",
      "started_at": "...",
      "completed_at": "...",
      "worker": "worker-1"
    }
  ],
  "current_layer": 2,
  "total_layers": 5
}
```

### 재개 (Resume)
```bash
# 중단 후 재개
/orchestestrate-standalone --resume
```

---

## 📊 병렬 실행 규칙

### 1. 파일 충돌
동일 파일을 수정하는 태스크는 **직렬 실행**

### 2. 도메인 충돌
동일 도메인의 태스크는 **순차 실행** (모드에 따라 병렬 가능)

### 3. 위험도
`risk: critical` 태스크는 **항상 직렬 실행**

### 4. 의존성
`deps`에 명시된 태스크가 완료된 후 실행

---

## 💡 사용 예시

### 소규모 (≤30개)
```bash
/agile auto
```

### 중규모 (30~80개)
```bash
/orchestrate-standalone --mode=standard
```

### 대규모 (80~200개) - Wave 모드 권장
```bash
# Step 1: Phase 0 - 계약 먼저 확정
/orchestrate-standalone --mode=wave --phase=0

# Step 2: Wave 실행 (자동으로 Phase 1-3 진행)
/orchestrate-standalone --mode=wave --wave-size=30

# 또는 한 번에 전체 실행
/orchestrate-standalone --mode=wave --auto
```

### 초대규모 (200개+)
```bash
# 프로젝트 분할 권장
# 각 하위 프로젝트에 Wave 모드 적용
/orchestrate-standalone --mode=wave --scope=domain:user
/orchestrate-standalone --mode=wave --scope=domain:order
```

---

## 🔗 관련 스킬

| 스킬 | 관계 |
|------|------|
| `/agile` | ≤30개 HITL 실행 |
| `/tasks-init` | TASKS.md 스캐폴딩 |
| `/recover` | 중단 작업 복구 |
| `/security-review` | 배포 전 보안 검사 |

---

## 📚 참조

- `references/hybrid-wave-architecture.md` - **Hybrid Wave Architecture 상세** (NEW)
- `references/dag-algorithm.md` - Kahn 알고리즘 상세
- `references/gate-protocol.md` - Hook 게이트 프로토콜
- `templates/contract-first.yaml` - **Contract-First 템플릿** (NEW)
- `project-team/hooks/` - 통합 Hook 목록

---

**Last Updated**: 2026-03-05 (v2.1.0 - Sprint Mode 추가)
