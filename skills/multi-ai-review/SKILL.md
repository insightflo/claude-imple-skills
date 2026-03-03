---
name: multi-ai-review
description: Claude + Gemini CLI + Codex CLI 멀티-AI 리뷰. 3단계 파이프라인으로 Initial Opinions → Cross-Review → Chairman Synthesis 수행. CLI 방식으로 추가 API 비용 없이 실행.
trigger: "council 소집", "여러 AI 의견 물어봐", "심층 리뷰", "컨센서스 리뷰"
version: 3.1.0
updated: 2026-03-03
---

# Multi-AI Review 스킬 (CLI 기반)

> **🔥 Heavy-Hitter (즉시 실행)**
> ```
> "리뷰해줘" | "council 소집해줘" | "여러 AI 의견 들어보자"
> ```
>
> **3-Stage Pipeline**: Initial Opinions (병렬) → Cross-Review (반박) → Chairman Synthesis (종합)
> **비용**: CLI 구독 플랜만으로 실행 (추가 API 비용 없음)

> **v3.1.0**: Long Context 최적화 - H2O 패턴으로 핵심 정보 상단 배치
> **v3.0.0**: MCP 의존성 제거, agent-council 패턴 적용, CLI 직접 호출

---

## ⚡ Quick Start (최우선)

### 사용법
```bash
# 스킬 호출 (호스트 에이전트)
"리뷰해줘" | "council 소집해줘" | "Gemini랑 Codex 의견 들어보자"

# 스크립트 직접 실행
./skills/multi-ai-review/scripts/council.sh "리뷰 요청 내용"
```

### 전제 조건
```bash
command -v claude  # Claude Code (호스트) ✅
command -v gemini  # Gemini CLI (선택사항)
command -v codex   # Codex CLI (선택사항)
```

---

## 개요

Claude(오케스트레이터) + Gemini CLI + Codex CLI가 **완전 자동화**된 리뷰를 수행합니다.

## 3-Stage Pipeline

```
Stage 1: Initial Opinions (병렬 실행)
├── Gemini CLI → opinion.md (창의적 관점)
└── Codex CLI → opinion.md (기술적 관점)

Stage 2: Cross-Review (반박 단계)
├── Gemini가 Codex 의견 검토
└── Codex가 Gemini 의견 검토

Stage 3: Chairman Synthesis (의장 종합)
└── Claude가 모든 의견 종합 → 최종 리포트
```

## CLI 요구사항

```bash
# CLI 설치 확인
command -v claude  # Claude Code (호스트)
command -v gemini  # Gemini CLI
command -v codex   # Codex CLI

# 설치 방법
# Gemini CLI: https://github.com/google-gemini/gemini-cli
# Codex CLI: https://github.com/openai/codex
```

## 사용법

### 호스트 에이전트를 통한 사용

```
"리뷰해줘"
"council 소집해줘"
"여러 AI 의견 물어봐"
"Gemini랑 Codex 의견 들어보자"
```

### 스크립트 직접 실행

```bash
# 원샷 실행
JOB_DIR=$(./skills/multi-ai-review/scripts/council.sh start "리뷰 요청 내용")
./skills/multi-ai-review/scripts/council.sh wait "$JOB_DIR"
./skills/multi-ai-review/scripts/council.sh results "$JOB_DIR"
./skills/multi-ai-review/scripts/council.sh clean "$JOB_DIR"

# 또는 간단히
./skills/multi-ai-review/scripts/council.sh "리뷰 요청 내용"
```

### 수동 정리 (Cleanup)

```bash
# 고아 프로세스/잡 디렉토리 정리
./skills/multi-ai-review/scripts/cleanup.sh
```

**자동 정리**: council.sh 실행 시 자동으로 1시간 이상 된 고아 잭을 정리합니다.

## 설정 파일

`council.config.yaml`에서 멤버 구성:

```yaml
council:
  members:
    - name: gemini
      command: "gemini"
      emoji: "💎"
      color: "GREEN"

    - name: codex
      command: "codex exec"
      emoji: "🤖"
      color: "BLUE"

  chairman:
    role: "auto"  # 호스트 CLI 자동 감지
    description: "모든 의견을 종합하여 최종 추천 제시"

  settings:
    timeout: 120
    exclude_chairman_from_members: true
```

## 리뷰 유형

| 유형 | Gemini 역할 | Codex 역할 |
|------|------------|-----------|
| 코드 | 가독성, 개선 제안 | SOLID, 패턴 분석 |
| 아키텍처 | 창의적 대안 | 구조적 타당성 |
| 기획서 | UX, 완전성 | 논리적 일관성 |
| 보안 | 공격 벡터 | 취약점 분석 |

## 실행 흐름

1. **CLI 존재 확인**: `command -v`로 각 CLI 설치 여부 검증
2. **멤버 필터링**: 설치된 CLI만 members에 포함
3. **병렬 실행**: 각 멤버에게 동시에 리뷰 요청
4. **결과 수집**: 응답을 포맷팅하여 표시
5. **의장 종합**: Claude가 최종 판정 및 리포트 생성

## 파일 구조

```
skills/multi-ai-review/
├── SKILL.md                    # 이 파일
├── council.config.yaml         # 멤버 설정
├── scripts/
│   ├── council.sh              # 메인 실행 스크립트
│   ├── council-job.sh          # Job runner
│   ├── council-job.js          # Job 구현
│   └── council-job-worker.js   # 멤버별 워커
├── templates/
│   ├── review-prompt.md        # 리뷰 프롬프트 템플릿
│   └── report.md               # 최종 리포트 템플릿
└── references/
    ├── overview.md             # 상세 개요
    ├── config.md               # 설정 가이드
    ├── examples.md             # 사용 예시
    └── requirements.md         # 요구사항
```

## 참조

- `references/overview.md` — 워크플로우 상세
- `references/config.md` — 멤버 설정 가이드
- `references/examples.md` — 사용 예시
- `../agent-council-overview.md` — agent-council 원본 참조
