# multi-ai-review 프리셋 확장 프롬프트

아래 프롬프트를 Claude에게 전달하여 새로운 도메인 프리셋을 조사/생성하세요.

---

## 프롬프트

multi-ai-review 스킬은 3-Stage Pipeline(의견→반박→종합) 기반의 범용 멀티-AI 합의 엔진이다.
현재 5개 프리셋이 있고, 새로운 도메인을 발굴하여 프리셋을 추가하려 한다.

### 현재 프리셋 (중복 방지용)

| 프리셋 | 도메인 | 평가 차원 |
|--------|--------|----------|
| code-review | 코드 리뷰 | security, performance, maintainability, correctness, style |
| market-regime | 시장 레짐 판정 | trend, volatility, liquidity, sentiment, valuation |
| investment | 투자 심사 | market, financials, team, risk, timing |
| risk-assessment | 리스크 평가 | probability, impact, mitigation, detection, urgency |
| default | 범용 합의 | feasibility, effectiveness, risk, cost, alignment |

### 프리셋이 유효한 조건

아래 3가지를 모두 만족하는 도메인만 프리셋으로 만들 가치가 있다:

1. **복수 관점이 의미 있다** — 단일 전문가로 충분한 문제는 부적합
2. **반박(Cross-Review)이 품질을 높인다** — 관점 충돌이 통찰을 만드는 영역
3. **정량적 차원 분해가 가능하다** — 0-100점으로 점수화할 수 있는 평가 축이 3개 이상

### 요청 사항

#### Step 1: 도메인 발굴

아래 카테고리별로 multi-ai-review가 유효한 도메인을 최소 20개 조사하라.
각 도메인에 대해 한 줄 설명 + 유효 조건 3가지 충족 여부를 판단하라.

카테고리:
- **비즈니스/전략**: 사업 계획, 경쟁 분석, 시장 진입, M&A, 파트너십 등
- **금융/투자**: (기존 investment, market-regime 외) 포트폴리오, 크레딧, 보험 등
- **기술/엔지니어링**: (기존 code-review 외) 아키텍처, 인프라, MLOps, 데이터 등
- **제품/디자인**: UX, 기능 기획, 로드맵, A/B 테스트 해석 등
- **조직/인사**: 채용, 성과 평가, 조직 구조, 문화 등
- **법무/규제**: 계약, 컴플라이언스, 개인정보, 지적재산 등
- **콘텐츠/마케팅**: 카피, 캠페인, 브랜드 전략, SEO 등
- **교육/연구**: 논문 리뷰, 커리큘럼, 연구 제안서, 교육 콘텐츠 등
- **운영/프로세스**: 공급망, 품질관리, 프로젝트 관리, 위기 대응 등

#### Step 2: 우선순위 선정

발굴된 도메인 중 아래 기준으로 상위 10개를 선정하라:

- **범용성**: 많은 사람이 자주 쓸 수 있는가?
- **반박 가치**: Gemini vs Codex의 관점 차이가 실질적 가치를 만드는가?
- **기존 프리셋과의 차별성**: 기존 5개로 커버되지 않는 영역인가?
- **자동화 적합성**: 사람 없이 AI 패널만으로 유의미한 결과를 내는가?

#### Step 3: 프리셋 YAML 생성

선정된 10개 도메인 각각에 대해 아래 형식으로 프리셋 YAML을 생성하라:

```yaml
name: <kebab-case 이름>
display: "<한국어 표시명>"
dimensions:
  <dimension-1>: { weight: 0.XX, label: "<한국어 라벨>" }
  <dimension-2>: { weight: 0.XX, label: "<한국어 라벨>" }
  <dimension-3>: { weight: 0.XX, label: "<한국어 라벨>" }
  <dimension-4>: { weight: 0.XX, label: "<한국어 라벨>" }
  <dimension-5>: { weight: 0.XX, label: "<한국어 라벨>" }
roles:
  gemini: "<역할 설명 — 이 도메인에서 Gemini가 맡는 관점>"
  codex: "<역할 설명 — 이 도메인에서 Codex가 맡는 관점>"
output:
  verdict_options: ["<5개 판정 옵션>"]
  verdict_label: "<판정 라벨>"
```

규칙:
- **dimensions는 정확히 5개**, 가중치 합은 1.00
- **roles의 gemini와 codex는 상호 보완적** — 같은 관점을 주면 Cross-Review 가치가 없다
  - Gemini: 정성적/창의적/외부 시각/전략적 관점
  - Codex: 정량적/분석적/내부 시각/실행 관점
- **verdict_options는 5단계** — 강한 긍정 ~ 강한 부정 스펙트럼
- **verdict_label은 도메인에 맞는 자연스러운 한국어**

#### Step 4: 라우팅 키워드

각 프리셋에 대해 council.config.yaml의 routing에 추가할 키워드 목록을 제시하라:

```yaml
<preset-name>:
  keywords: ["키워드1", "키워드2", "keyword3", ...]
```

규칙:
- 한국어 + 영어 키워드 모두 포함
- 기존 프리셋 키워드와 겹치지 않도록 주의
- 사용자가 자연어로 말할 때 실제로 쓸 법한 표현 위주

#### Step 5: 파일 생성

생성된 프리셋 YAML 파일들을 아래 경로에 저장하라:
`~/.claude/skills/multi-ai-review/presets/<preset-name>.yaml`

council.config.yaml의 routing 섹션에 새 키워드를 추가하라.

SKILL.md의 도메인 라우팅 테이블에 새 프리셋을 추가하라.

#### Step 6: 검증

추가된 프리셋 각각에 대해 아래를 검증하라:
- dimensions 가중치 합이 1.00인가?
- gemini와 codex 역할이 실제로 상호 보완적인가?
- 라우팅 키워드가 기존 프리셋과 충돌하지 않는가?
- verdict_options가 도메인에 자연스러운가?

### 참고: Gemini vs Codex 역할 분배 원칙

| 관점 | Gemini | Codex |
|------|--------|-------|
| 사고 방식 | 발산적, 창의적 | 수렴적, 분석적 |
| 데이터 | 정성적, 트렌드 | 정량적, 통계 |
| 시야 | 외부(시장, 사용자, 경쟁) | 내부(시스템, 프로세스, 수치) |
| 시간 | 미래 지향, 기회 탐색 | 현재 기반, 리스크 분석 |
| 강점 | 왜(Why), 무엇(What) | 어떻게(How), 얼마나(How much) |

이 원칙에 따라 역할을 분배하면 Cross-Review에서 실질적인 관점 충돌이 발생한다.
