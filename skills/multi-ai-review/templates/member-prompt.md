# {{MEMBER_NAME}} 분석 프롬프트

> **역할**: {{MEMBER_ROLE}}
> **도메인**: {{DOMAIN_DISPLAY}}

---

## 분석 대상

{{TARGET_CONTENT}}

---

## 평가 차원 (각 0-100점)

각 차원에 대해 현재 상태를 평가하고, 근거를 제시한 뒤 점수를 기재하세요.

{{#each DIMENSIONS}}
### {{index}}. {{label}} (가중치 {{weight_pct}}%)

- 현재 상태 평가
- 근거 제시
- 점수: [0-100]

{{/each}}

---

## 이슈 목록

발견된 이슈를 심각도와 함께 기술합니다:

- 🔴 Critical: 즉시 대응 필요
- 🟡 High: 우선 해결 권장
- 🟢 Medium: 개선 권장
- 💡 Low: 참고

---

## 종합 의견

- **종합 점수**: [가중 평균은 Chairman이 계산합니다 — 각 차원 점수만 제시]
- **핵심 메시지**: [한 문장 요약]
- **판정**: {{VERDICT_OPTIONS}} 중 선택
