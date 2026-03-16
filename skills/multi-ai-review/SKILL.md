---
name: multi-ai-review
description: |
  Claude + Gemini CLI + Codex CLI 멀티-AI 합의 엔진.
  3-Stage Pipeline (의견→반박→종합)으로 코드 리뷰, 시황 평가, 투자 심사, 리스크 분석 등
  전문가 패널이 필요한 모든 도메인에서 자동 합의를 도출한다.

  사용자의 자연어 요청을 분석하여 도메인을 자동 감지하고 적합한 프리셋을 적용한다.

  트리거:
  - "리뷰해줘", "council 소집", "여러 AI 의견", "심층 리뷰", "컨센서스"
  - "시장 평가해줘", "레짐 판정", "시황 분석", "매크로 분석"
  - "투자 검토해줘", "딜 심사", "밸류에이션 평가"
  - "리스크 평가", "전략 검토", "의사결정 지원"
  - 사용자가 복수 관점의 합의가 필요한 모든 상황에서 적극 트리거
version: 4.0.0
updated: 2026-03-16
---

# Multi-AI Review — Universal Consensus Engine

> **Heavy-Hitter (즉시 실행)**
>
> 자연어로 도메인을 말하면 자동 감지 후 적합한 패널이 구성된다.
> **비용**: CLI 구독 플랜만으로 실행 (추가 API 비용 없음)

> **v4.0.0**: 범용 합의 엔진으로 확장 — 도메인 자동 라우팅, Score Card, presets 시스템
> **v3.3.0**: Chairman Protocol — 미해결 쟁점 시 추가 Cross-Review 라운드 자동 판단

---

## Quick Start

도메인을 명시하지 않아도 된다. 자연어 그대로 말하면 자동 감지된다.

```
# 코드 리뷰
"이 PR 리뷰해줘"
"코드 검토 부탁해"

# 시장 분석
"오늘 시장 상황 어때?"
"현재 레짐 판정해줘"
"매크로 분석 해줘"

# 투자 심사
"이 투자 건 평가해줘"
"딜 심사 해줘"
"밸류에이션 검토"

# 리스크 평가
"이 전략의 리스크 평가해줘"
"보안 취약점 분석"

# 범용 합의 (도메인 불명확 시 자동 적용)
"이 방향 괜찮을까?"
"council 소집해줘"
"여러 AI 의견 들어보자"
```

### 전제 조건

```bash
command -v claude  # Claude Code (호스트) — Chairman 역할
command -v gemini  # Gemini CLI (선택사항)
command -v codex   # Codex CLI (선택사항)
```

---

## 3-Stage Pipeline

도메인에 관계없이 동일한 파이프라인이 적용된다.

```
Stage 1: Initial Opinions (병렬 실행)
├── Gemini CLI → opinion.md (프리셋에 따른 관점 A)
└── Codex CLI  → opinion.md (프리셋에 따른 관점 B)

Stage 2: Cross-Review (반박 단계)
├── Gemini가 Codex 의견을 검토 및 반박/보완
└── Codex가 Gemini 의견을 검토 및 반박/보완

Stage 3: Chairman Synthesis (의장 종합)
└── Claude가 모든 의견 종합 → Score Card 산출 → 추가 라운드 필요 여부 판단
    → (Yes) 추가 Cross-Review 진행 (최대 2회 추가)
    → (No)  최종 리포트 출력
```

---

## Domain Auto-Routing

사용자의 요청에서 키워드를 감지하여 자동으로 프리셋을 선택한다.
명시적으로 프리셋 이름을 말할 필요가 없다.

| 프리셋 | 감지 키워드 | Gemini 관점 | Codex 관점 |
|--------|-----------|------------|-----------|
| `code-review` | 리뷰, review, PR, 코드 검토, merge | 아키텍처/UX | 기술/패턴 |
| `market-regime` | 시장, 시황, 레짐, 주식, 매크로, 금리 | 매크로/뉴스 | 퀀트/지표 |
| `investment` | 투자, 심사, 밸류에이션, IR, 딜, M&A | 시장/전략 | 재무/리스크 |
| `risk-assessment` | 리스크, 위험, risk, 보안 평가, 취약점 | 외부 위협 | 내부 취약점 |
| `product-review` | 기획, PRD, 기능 명세, 스펙, feature spec | 사용자/시장 가치 | 기술 실현성 |
| `architecture-review` | 아키텍처, 설계, 시스템 구조, 인프라 | 솔루션/트렌드 | 장애 모드/비용 |
| `business-plan` | 사업 계획, 비즈니스 플랜, 사업성, 창업, 피치덱 | 시장 기회/전략 | 재무/실행 |
| `campaign-review` | 캠페인, 마케팅, 광고, 크리에이티브, 퍼포먼스 | 크리에이티브/브랜드 | 퍼포먼스/ROI |
| `portfolio-rebalance` | 포트폴리오, 리밸런싱, 자산배분, rebalance | 매크로 전략 | 퀀트 분석 |
| `paper-review` | 논문, 연구, paper, 학술, 방법론, peer review | 학문적 기여/논리 | 방법론/재현성 |
| `contract-review` | 계약, contract, NDA, SLA, 약관, 법무 | 비즈니스 이익 | 법적 리스크 |
| `project-gate` | 프로젝트 점검, Go/No-Go, 게이트, milestone | 이해관계자/스코프 | 일정/리소스 |
| `ml-model-review` | 모델 평가, ML, AI 모델, 편향, fairness | 윤리/사회적 영향 | 성능/배포 |
| `crisis-response` | 위기 대응, 비상 계획, BCP, DR, crisis | 커뮤니케이션/평판 | 연속성/복구 |
| `default` | (위 키워드 미감지 시 자동 적용) | 전략/기회 | 실행/리스크 |

---

## Score Card System

Chairman이 Stage 3에서 각 멤버의 차원별 점수를 집계하여 Score Card를 산출한다.

### 등급 기준

| 등급 | 최저 점수 |
|------|---------|
| A | 90 |
| B | 80 |
| C | 70 |
| D | 60 |
| F | 0 |

### 심각도 레이블

| 레이블 | 의미 |
|--------|------|
| 🔴 Critical | 즉시 대응 필요 |
| 🟡 High | 우선 해결 권장 |
| 🟢 Medium | 개선 권장 |
| 💡 Low | 참고 |

### 도메인별 평가 차원

각 프리셋에 차원과 가중치가 정의되어 있다 (`presets/*.yaml`).

| 프리셋 | 주요 차원 |
|--------|---------|
| code-review | 보안(25%), 성능(20%), 유지보수성(25%), 정확성(20%), 스타일(10%) |
| market-regime | 추세(25%), 변동성(20%), 유동성(20%), 센티먼트(20%), 밸류에이션(15%) |
| investment | 시장성(25%), 재무 건전성(25%), 팀/실행력(20%), 리스크(15%), 타이밍(15%) |
| risk-assessment | 발생 확률(25%), 영향도(30%), 완화 가능성(20%), 탐지 용이성(15%), 긴급도(10%) |
| default | 실현 가능성(25%), 효과성(25%), 리스크(20%), 비용 효율(15%), 목표 정합성(15%) |

---

## CI Quality Gate

`--mode ci` 플래그 사용 시에만 활성화된다. 기본값은 비활성화.

```bash
./skills/multi-ai-review/scripts/council.sh --mode ci "리뷰 요청"
```

Quality Gate 기준 (`council.config.yaml`에서 조정 가능):
- Critical 이슈: 0건 초과 시 fail
- High 이슈: 3건 초과 시 fail
- 종합 점수: 70점 미만 시 fail

`on_fail: "block"` — 기준 미충족 시 non-zero exit code 반환.

---

## Chairman Protocol (Stage 3 — 필수 준수)

Stage 1 + Stage 2 결과를 받은 후, **Chairman(Claude)은 다음 프로토콜을 따른다.**

### Step 1: 합의 평가

Cross-Review 결과를 분석하여 다음을 판단:

- **합의 도달**: 멤버들이 대체로 동의하거나, 이견이 있어도 명확히 정리됨
- **미해결 쟁점**: 핵심 이슈에 대해 상반된 의견이 충돌하며 추가 논의 필요

### Step 2: 추가 라운드 결정

```
IF 미해결 쟁점 존재 AND 추가 논의가 가치 있음:
    → 추가 Cross-Review 실행 (최대 2회까지)
    → 쟁점을 명확히 한 focused question으로 재질의
ELSE:
    → 최종 종합으로 진행
```

### Step 3: 추가 Cross-Review 실행 (필요시)

```bash
# JOB_DIR은 이전 Stage의 디렉토리
./skills/multi-ai-review/scripts/council.sh cross-review "$JOB_DIR"
```

**Focused Question 예시:**

> "A는 X 접근법을, B는 Y 접근법을 주장합니다. 각각의 trade-off를 구체적으로 비교하고,
> 프로덕션 환경에서 어떤 것이 더 적합한지 근거를 제시하세요."

### Step 4: 최종 종합 (Score Card 포함)

모든 라운드 완료 후, 다음 형식으로 **한국어**로 종합한다.

```markdown
## 🏛️ Chairman's Synthesis

### {{verdict_label}}: {{final_verdict}}

### Score Card

| 차원        | 가중치 | Gemini | Codex | 합의 점수 | 등급 |
|-------------|--------|--------|-------|----------|------|
| [차원명]    | [x]%   | [점수] | [점수] | [합의]  | [등급] |
| **종합**    | **100%** |      |       | **[종합점수]** | **[등급]** |

### 심각도 요약

- 🔴 Critical: [n건] — [요약]
- 🟡 High: [n건] — [요약]
- 🟢 Medium: [n건]
- 💡 Low: [n건]

### 합의 사항

- [멤버들이 동의한 포인트들]

### 이견 및 해소

- [쟁점] → [Chairman 판단 + 근거]

### 권고 사항

1. [우선순위 높은 액션]
2. [추가 고려사항]

### 리뷰 메타

- Domain: [프리셋명]
- Rounds: [Stage 1 + Cross-Review 횟수]
- Consensus Level: [Strong / Moderate / Divergent]
- Composite Score: [점수]/100 ([등급])
```

### 제약 조건

- **최대 라운드**: Cross-Review는 최대 3회 (Stage 2 + 추가 2회)
- **추가 라운드 기준**: 단순 의견 차이가 아닌, 결정에 영향을 주는 핵심 쟁점만
- **무한 루프 방지**: 3회 후에도 미해결이면 "의견 분분"으로 정리하고 Chairman 판단 제시

---

## Presets Reference

각 프리셋의 전체 정의는 `presets/` 디렉토리에 있다.

| 파일 | 도메인 | 판정 옵션 |
|------|--------|---------|
| `presets/code-review.yaml` | 코드 리뷰 | (점수 기반 등급) |
| `presets/market-regime.yaml` | 시장 레짐 | Strong Bull / Bull / Neutral / Bear / Strong Bear |
| `presets/investment.yaml` | 투자 심사 | Strong Buy / Buy / Hold / Pass / Strong Pass |
| `presets/risk-assessment.yaml` | 리스크 평가 | Critical / High / Medium / Low / Negligible |
| `presets/default.yaml` | 범용 합의 | Strong Agree / Agree / Neutral / Disagree / Strong Disagree |

---

## CLI 요구사항

```bash
# CLI 설치 확인
command -v claude  # Claude Code (호스트 — Chairman 역할)
command -v gemini  # Gemini CLI
command -v codex   # Codex CLI

# 설치 방법
# Gemini CLI: https://github.com/google-gemini/gemini-cli
# Codex CLI:  https://github.com/openai/codex
```

---

## 파일 구조

```
skills/multi-ai-review/
├── SKILL.md                    # 이 파일
├── council.config.yaml         # 멤버 설정, 라우팅, 스코어링, Quality Gate
├── presets/
│   ├── code-review.yaml        # 코드 리뷰 프리셋
│   ├── market-regime.yaml      # 시장 레짐 프리셋
│   ├── investment.yaml         # 투자 심사 프리셋
│   ├── risk-assessment.yaml    # 리스크 평가 프리셋
│   └── default.yaml            # 범용 합의 프리셋 (폴백)
├── scripts/
│   ├── council.sh              # 메인 실행 스크립트
│   ├── council-job.sh          # Job runner
│   ├── council-job.js          # Job 구현
│   ├── council-job-worker.js   # 멤버별 워커
│   ├── council-event-utils.js  # 이벤트 유틸
│   └── cleanup.sh              # 고아 잡 정리
└── templates/
    ├── member-prompt.md        # 멤버 공통 프롬프트 템플릿 (도메인 무관)
    └── report.md               # 최종 리포트 템플릿
```

---

## 참조

- `council.config.yaml` — 멤버, 라우팅, 스코어링, Quality Gate 설정
- `presets/` — 도메인별 차원, 가중치, 역할 정의
