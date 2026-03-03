---
name: orchestrate-standalone
description: 30~80개 태스크를 의존성 기반으로 병렬 실행합니다. Standalone 독립 실행.
triggers:
  - /orchestrate-standalone
  - /orchestrate
  - 오케스트레이트
  - 태스크 실행
version: 1.1.0
updated: 2026-03-03
---

# 🚀 Orchestrate Standalone

> **목표**: 30~80개 태스크를 의존성 기반 병렬 실행
>
> **철학**: 30개는 "1회 스프린트 최적 단위"이며, 그 이상은 **스프린트 분할 반복**으로 해결

---

## ⚡ 실행 모드

| 모드 | 태스크 수 | 워커 수 | 설명 |
|------|----------|---------|------|
| **lite** | 30~50 | 2 | 빠른 실행 |
| **standard** | 50~80 | 4 | 일반 프로젝트 |
| **full** | 80개+ | 8 | 대규모 병렬 |

---

## 📋 필수 입력

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

### 대규모 (80개+)
```bash
# 스프린트 분할 반복 권장
/agile iterate "다음 30개 태스크 스프린트"
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

- `references/dag-algorithm.md` - Kahn 알고리즘 상세
- `references/gate-protocol.md` - Hook 게이트 프로토콜
- `project-team/hooks/` - 통합 Hook 목록

---

**Last Updated**: 2026-03-03 (v1.0.0)
