# {{MEMBER_NAME}} 분석 프롬프트

> **역할**: {{MEMBER_ROLE}}
> **도메인**: {{DOMAIN_DISPLAY}}

---

## 분석 대상

{{TARGET_CONTENT}}

---

## 평가 차원 (각 0-100점)

각 차원에 대해 현재 상태를 평가하고, **구체적인 증거(file:line)를 제시한 뒤** 점수를 기재하세요.

> **중요**: Chairman은 인상보다 구체적인 코드 레벨 근거를 더 신뢰합니다.
> - Codex: file:line 인용이 있는 경우 2× 가중치 부여 (code-review/project-gate)
> - Gemini: 구조적 관찰도 중요하지만, 구체적 인용 없으면 가중치 감소

{{#each DIMENSIONS}}
### {{index}}. {{label}} (가중치 {{weight_pct}}%)

- 현재 상태 평가
- **증거**: file:line 또는 구체적 코드 참조 (필수)
- 점수: [0-100]

{{/each}}

---

## 이슈 목록

발견된 이슈를 **반드시 file:line 인용과 함께** 기술합니다:

- 🔴 Critical: 즉시 대응 필요 (file:line 필수)
- 🟡 High: 우선 해결 권장 (file:line 필수)
- 🟢 Medium: 개선 권장 (file:line 권장)
- 💡 Low: 참고

> **증거 없는 이슈는 Chairman合成 시 제외될 수 있습니다.**

---

## 종합 의견

- **종합 점수**: [가중 평균은 Chairman이 계산합니다 — 각 차원 점수만 제시]
- **핵심 메시지**: [한 문장 요약]
- **판정**: {{VERDICT_OPTIONS}} 중 선택
