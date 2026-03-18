# AI Routing Guide

cmux-orchestrate에서 각 역할에 어떤 AI를 배정할지 결정하는 가이드.

---

## 기본 배정 (Default)

```yaml
routing:
  team-lead:         claude   # 전략, 판단, 조율
  arch-lead:         claude   # 아키텍처 결정, ADR 작성
  backend-builder:   codex    # 코드 생성/변환
  design-lead:       gemini   # 비주얼 판단, 창의적 설계
  frontend-builder:  gemini   # UI 컴포넌트, 스타일
  qa-lead:           claude   # 분석적 검증, 리포트
  reviewer:          claude   # 코드 리뷰, 품질 판단
```

---

## CLI 명령어

| AI | 비대화형 실행 | 대화형 |
|----|-------------|--------|
| Claude | `claude --dangerously-skip-permissions -p "$(cat context.md)"` | `claude` |
| Gemini | `gemini --yolo "$(cat context.md)"` | `gemini` |
| Codex | `codex -q "$(cat context.md)"` | `codex` |

---

## 역할별 배정 기준

### Claude가 적합한 경우
- 복잡한 추론이 필요한 결정 (아키텍처, 트레이드오프)
- 긴 컨텍스트 분석 (대형 코드베이스 이해)
- 코드 리뷰 (보안, 패턴, 품질 판단)
- 오케스트레이션 (다른 에이전트 조율)

### Gemini가 적합한 경우
- UI/UX 설계 및 구현 (비주얼 판단)
- 창의적 컴포넌트 설계
- 디자인 시스템 작업
- 멀티모달 작업 (이미지 포함 UI 명세)

### Codex가 적합한 경우
- 반복적 코드 생성 (CRUD, 보일러플레이트)
- 리팩토링, 타입 변환
- 테스트 코드 작성
- API 엔드포인트 구현

---

## 프로젝트별 오버라이드

`.claude/collab/ai-routing.yaml` 파일로 커스터마이징:

```yaml
# .claude/collab/ai-routing.yaml
version: 1.0

# 전체 오버라이드
overrides:
  backend-builder: claude    # codex 대신 claude 사용
  design-lead: claude        # gemini 없을 때

# 도메인별 오버라이드
domains:
  security: claude           # 보안 도메인은 항상 claude
  performance: codex         # 성능 최적화는 codex
```

읽는 방법 (team-lead가 Step 1에서 확인):
```bash
[ -f .claude/collab/ai-routing.yaml ] && cat .claude/collab/ai-routing.yaml
```

---

## Fallback 전략

| 상황 | 폴백 |
|------|------|
| gemini CLI 없음 | design-lead → claude |
| codex CLI 없음 | backend-builder → claude |
| 둘 다 없음 | 전부 claude (team-orchestrate와 동일) |

```bash
# 설치 확인
command -v gemini || echo "WARNING: gemini not found, falling back to claude for design roles"
command -v codex  || echo "WARNING: codex not found, falling back to claude for code roles"
```

---

## 혼합 팀 예시

### 소규모 (Backend only)

```
team-lead (claude)
└─ arch-lead (claude)
   └─ backend-builder (codex)
```

### 풀스택

```
team-lead (claude)
├─ arch-lead (claude)
│  └─ backend-builder (codex)
├─ design-lead (gemini)
│  └─ frontend-builder (gemini)
└─ qa-lead (claude)
```

### 보안 중점

```
team-lead (claude)
├─ arch-lead (claude)
│  ├─ backend-builder (codex)
│  └─ security-specialist (claude)   ← 추가
└─ qa-lead (claude)
```
