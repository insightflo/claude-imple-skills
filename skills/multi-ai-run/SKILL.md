---
name: multi-ai-run
description: 에이전트 역할별로 최적의 AI 모델(Claude/Gemini/Codex)을 라우팅하여 실행합니다.
triggers:
  - /multi-ai-run
  - 멀티 AI 실행
  - 모델 라우팅
  - AI 분업
version: 1.1.0
---

# Multi-AI Run

> **핵심 개념**: 에이전트는 **역할**, 모델은 **실행자**
>
> 각 에이전트 역할에 최적화된 AI 모델을 자동 라우팅하여 실행합니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  Claude (Orchestrator)                                      │
│    ↓ 태스크 분석 + 에이전트 역할 결정                        │
│    ↓ model_routing 조회                                     │
│    ├── 코드 작성/리뷰 → Codex CLI                           │
│    ├── 디자인/UI 작업 → Gemini CLI                          │
│    └── 기획/조율/복잡한 추론 → Claude 직접                   │
└─────────────────────────────────────────────────────────────┘
```

## 모델별 강점

| 모델 | CLI | 강점 | 권장 역할 |
|------|-----|------|-----------|
| **Claude** | `claude` | 복잡한 추론, 장문 컨텍스트, 조율 | orchestrator, architect, pm |
| **Codex** | `codex` | 코드 생성, 리팩토링, 테스트 | backend, test, api |
| **Gemini** | `gemini` | 창의성, 디자인 감각, 멀티모달 | frontend, designer, ui |

---

## 설정 파일

### 🔧 CLI 모델 설정: `routing.config.yaml`

각 CLI에서 사용할 모델을 직접 지정할 수 있습니다:

```yaml
# skills/multi-ai-run/routing.config.yaml (또는 .claude/routing.config.yaml)
cli_models:
  gemini:
    command: "gemini"
    model: "gemini-3.1-pro-preview"  # ← 모델 변경
    # model: "gemini-2.0-flash"      # 빠른 응답용
    # model: "gemini-3-flash-preview" # 경량 작업용
    args: "--output-format text"

  codex:
    command: "codex exec"
    model: "gpt-5.3-codex"           # ← 모델 변경
    # model: "o3"                    # 추론 강화
    # model: "gpt-4.1"               # 범용

  claude:
    command: "claude"
    model: "opus"                    # ← 모델 변경
    # model: "sonnet"                # 빠른 응답용
```

**설정 파일 우선순위:**
1. 프로젝트: `.claude/routing.config.yaml`
2. 글로벌: `~/.claude/routing.config.yaml`
3. 스킬 기본값: `skills/multi-ai-run/routing.config.yaml`

---

### 프로젝트별 설정: `.claude/model-routing.yaml`

```yaml
# .claude/model-routing.yaml
version: 1.0

# 기본 모델 (설정 없는 에이전트에 적용)
default: claude

# 역할별 모델 오버라이드
routing:
  # 정확한 역할명 매칭
  backend-specialist: codex
  frontend-specialist: gemini
  test-specialist: codex
  api-designer: codex

  # 와일드카드 패턴
  design-*: gemini      # design-system, design-review 등
  *-developer: codex    # auth-developer, payment-developer 등

  # 도메인별 오버라이드
  domains:
    auth: codex         # auth 도메인 모든 작업
    ui: gemini          # ui 도메인 모든 작업

# 태스크 유형별 오버라이드 (역할보다 우선)
task_types:
  code_generation: codex
  code_review: codex
  design_implementation: gemini
  design_review: gemini
  architecture: claude
  planning: claude
```

### 글로벌 기본 설정: `~/.claude/model-routing.yaml`

프로젝트 설정이 없으면 글로벌 설정을 사용합니다.

---

## 실행 흐름

### Phase 1: 라우팅 결정

```
1. 태스크 분석 → 에이전트 역할 결정
2. model-routing.yaml 조회 (프로젝트 > 글로벌 > 기본값)
3. 매칭 우선순위:
   a. task_types (태스크 유형)
   b. routing (정확한 역할명)
   c. routing 와일드카드
   d. domains (도메인)
   e. default
```

### Phase 2: CLI 실행

```bash
# Codex로 코드 생성
codex -q "Implement the auth service based on: $(cat specs/auth-service.md)"

# Gemini로 UI 구현
gemini -p "Create React component following design: $(cat design/button.md)"

# Claude로 복잡한 조율 (직접 처리)
# (orchestrator가 직접 수행)
```

### Phase 3: 결과 통합

```
1. 각 CLI 출력 수집
2. 파일 생성/수정 적용
3. 충돌 감지 시 Claude가 조율
4. 품질 검증 (lint, type-check, test)
```

---

## 사용법

### 기본 실행

```bash
/multi-ai-run
# → model-routing.yaml 기반으로 자동 라우팅
```

### 특정 태스크 실행

```bash
/multi-ai-run T1.2
# → T1.2 태스크를 적절한 모델로 실행
```

### 모델 강제 지정

```bash
/multi-ai-run --model=gemini T1.2
# → T1.2를 Gemini로 강제 실행
```

### 드라이런 (실행 계획만 확인)

```bash
/multi-ai-run --dry-run
# → 어떤 태스크가 어떤 모델로 실행될지 미리 확인
```

---

## CLI 요구사항

```bash
# 필수 CLI 설치 확인
command -v claude  # Claude Code (호스트, 필수)
command -v codex   # OpenAI Codex CLI
command -v gemini  # Google Gemini CLI
```

### 설치 가이드

**Codex CLI:**
```bash
npm install -g @openai/codex
codex auth
```

**Gemini CLI:**
```bash
npm install -g @anthropic-ai/gemini-cli  # 또는 공식 설치 방법
gemini auth
```

> 설치 상세: `references/cli-setup.md` 참조

---

## 예시 시나리오

### 시나리오 1: 풀스택 기능 구현

```
TASKS.md:
- [ ] T1.1: 백엔드 API 구현 (auth)
- [ ] T1.2: 프론트엔드 UI 구현 (login form)
- [ ] T1.3: 통합 테스트 작성

실행 결과:
T1.1 → Codex (backend-specialist, auth 도메인)
T1.2 → Gemini (frontend-specialist)
T1.3 → Codex (test-specialist)
```

### 시나리오 2: 디자인 시스템 작업

```
TASKS.md:
- [ ] T2.1: 디자인 토큰 정의
- [ ] T2.2: 버튼 컴포넌트 구현
- [ ] T2.3: 스토리북 작성

실행 결과:
T2.1 → Gemini (design-system)
T2.2 → Gemini (frontend-specialist)
T2.3 → Codex (code_generation)
```

---

## 오케스트레이터 통합

`/orchestrate` 또는 `/agile auto`와 함께 사용:

```bash
# 기존: Claude만 사용
/orchestrate

# 신규: 모델 라우팅 활성화
/orchestrate --multi-ai

# 또는 설정 파일로 기본 활성화
# .claude/model-routing.yaml
enabled: true  # 모든 오케스트레이션에 자동 적용
```

---

## 안전장치

1. **CLI 미설치 시**: 해당 모델 fallback → Claude 직접 처리
2. **CLI 실패 시**: 자동 재시도 (최대 2회) → 실패 시 Claude fallback
3. **충돌 감지**: 여러 모델 출력이 같은 파일 수정 시 Claude가 병합
4. **비용 경고**: 예상 토큰 사용량 표시 (dry-run 시)

---

## 관련 스킬

| 스킬 | 관계 |
|------|------|
| `/multi-ai-review` | 리뷰 단계에서 멀티 AI 사용 |
| `/orchestrate` | `--multi-ai` 플래그로 연동 |
| `/cost-router` | 비용 기반 모델 선택과 조합 가능 |

---

## FAQ

**Q: Claude 외 모델이 Claude Code 내에서 파일을 수정할 수 있나요?**
A: CLI 출력을 Claude가 받아서 Edit/Write 도구로 적용합니다. 직접 수정 권한은 Claude만 가집니다.

**Q: 특정 태스크만 다른 모델로 실행하고 싶어요**
A: `--model=gemini T1.2` 또는 TASKS.md에 태그 추가: `- [ ] T1.2: UI 구현 [model:gemini]`

**Q: API 비용은 어떻게 되나요?**
A: 각 CLI의 구독 플랜 또는 API 크레딧을 사용합니다. Claude Code 비용과 별도입니다.

---

## 파일 구조

```
skills/multi-ai-run/
├── SKILL.md                    # 이 파일
├── routing.config.yaml         # CLI 모델 + 라우팅 설정
└── references/
    └── cli-setup.md            # CLI 설치 가이드
```

---

**Last Updated**: 2026-03-04 (v1.1.0 - routing.config.yaml 추가)
