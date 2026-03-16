---
name: multi-ai-review
description: |
  Claude + Gemini CLI + Codex CLI multi-AI consensus engine.
  3-Stage Pipeline (opinions → rebuttal → synthesis) automatically drives consensus
  across any domain requiring an expert panel: code review, market assessment,
  investment due diligence, risk analysis, and more.

  Automatically detects the domain from the user's natural-language request
  and applies the appropriate preset.

  Triggers:
  - "review this", "convene a council", "get multiple AI opinions", "deep review", "consensus"
  - "evaluate the market", "determine the regime", "market analysis", "macro analysis"
  - "review this investment", "deal due diligence", "valuation review"
  - "risk assessment", "strategy review", "decision support"
  - Any situation where the user needs consensus from multiple perspectives — trigger proactively
version: 4.0.0
updated: 2026-03-16
---

# Multi-AI Review — Universal Consensus Engine

> **Heavy-Hitter (execute immediately)**
>
> State the domain in natural language and the right panel is assembled automatically.
> **Cost**: Runs on CLI subscription plans only — no additional API charges.

> **v4.0.0**: Expanded to a universal consensus engine — domain auto-routing, Score Card, presets system
> **v3.3.0**: Chairman Protocol — automatically decides whether to run additional Cross-Review rounds when unresolved issues remain

---

## Quick Start

No need to specify the domain. State it in natural language and it is detected automatically.

```
# Code review
"Review this PR"
"Please check this code"

# Market analysis
"How does the market look today?"
"Determine the current regime"
"Run a macro analysis"

# Investment due diligence
"Evaluate this investment opportunity"
"Do a deal review"
"Valuation check"

# Risk assessment
"Assess the risk in this strategy"
"Analyze security vulnerabilities"

# General consensus (auto-applied when domain is unclear)
"Is this direction okay?"
"Convene a council"
"Let's hear from multiple AIs"
```

### Prerequisites

```bash
command -v claude  # Claude Code (host) — Chairman role
command -v gemini  # Gemini CLI (optional)
command -v codex   # Codex CLI (optional)
```

---

## 3-Stage Pipeline

The same pipeline applies regardless of domain.

```
Stage 1: Initial Opinions (parallel execution)
├── Gemini CLI → opinion.md (perspective A per preset)
└── Codex CLI  → opinion.md (perspective B per preset)

Stage 2: Cross-Review (rebuttal stage)
├── Gemini reviews and rebuts/supplements Codex's opinion
└── Codex reviews and rebuts/supplements Gemini's opinion

Stage 3: Chairman Synthesis
└── Claude synthesizes all opinions → produces Score Card → decides if additional rounds are needed
    → (Yes) Run additional Cross-Review (up to 2 extra rounds)
    → (No)  Output final report
```

---

## Domain Auto-Routing

Keywords in the user's request are detected and the appropriate preset is selected automatically.
There is no need to explicitly name a preset.

| Preset | Detected Keywords | Gemini Perspective | Codex Perspective |
|--------|------------------|--------------------|-------------------|
| `code-review` | review, PR, code check, merge | architecture/UX | technical/patterns |
| `market-regime` | market, regime, stocks, macro, interest rate | macro/news | quant/indicators |
| `investment` | investment, due diligence, valuation, IR, deal, M&A | market/strategy | finance/risk |
| `risk-assessment` | risk, danger, security assessment, vulnerability | external threats | internal weaknesses |
| `product-review` | planning, PRD, feature spec | user/market value | technical feasibility |
| `architecture-review` | architecture, design, system structure, infrastructure | solutions/trends | failure modes/cost |
| `business-plan` | business plan, viability, startup, pitch deck | market opportunity/strategy | finance/execution |
| `campaign-review` | campaign, marketing, advertising, creative, performance | creative/brand | performance/ROI |
| `portfolio-rebalance` | portfolio, rebalancing, asset allocation | macro strategy | quant analysis |
| `paper-review` | paper, research, academic, methodology, peer review | academic contribution/logic | methodology/reproducibility |
| `contract-review` | contract, NDA, SLA, terms, legal | business interests | legal risk |
| `project-gate` | project review, Go/No-Go, gate, milestone | stakeholders/scope | schedule/resources |
| `ml-model-review` | model evaluation, ML, AI model, bias, fairness | ethics/social impact | performance/deployment |
| `crisis-response` | crisis response, contingency plan, BCP, DR | communication/reputation | continuity/recovery |
| `default` | (auto-applied when none of the above are detected) | strategy/opportunity | execution/risk |

---

## Score Card System

In Stage 3, the Chairman tallies per-dimension scores from each member and produces a Score Card.

### Grade Thresholds

| Grade | Minimum Score |
|-------|--------------|
| A | 90 |
| B | 80 |
| C | 70 |
| D | 60 |
| F | 0 |

### Severity Labels

| Label | Meaning |
|-------|---------|
| Critical | Immediate action required |
| High | Priority resolution recommended |
| Medium | Improvement recommended |
| Low | For reference |

### Evaluation Dimensions by Domain

Each preset defines its dimensions and weights in `presets/*.yaml`.

| Preset | Key Dimensions |
|--------|---------------|
| code-review | security (25%), performance (20%), maintainability (25%), correctness (20%), style (10%) |
| market-regime | trend (25%), volatility (20%), liquidity (20%), sentiment (20%), valuation (15%) |
| investment | marketability (25%), financial health (25%), team/execution (20%), risk (15%), timing (15%) |
| risk-assessment | probability (25%), impact (30%), mitigation feasibility (20%), detectability (15%), urgency (10%) |
| default | feasibility (25%), effectiveness (25%), risk (20%), cost-efficiency (15%), goal alignment (15%) |

---

## CI Quality Gate

Activated only with the `--mode ci` flag. Disabled by default.

```bash
./skills/multi-ai-review/scripts/council.sh --mode ci "review request"
```

Quality Gate thresholds (adjustable in `council.config.yaml`):
- Critical issues: fail if more than 0
- High issues: fail if more than 3
- Overall score: fail if below 70

`on_fail: "block"` — returns a non-zero exit code when thresholds are not met.

---

## Chairman Protocol (Stage 3 — mandatory compliance)

After receiving Stage 1 + Stage 2 results, **the Chairman (Claude) follows this protocol.**

### Step 1: Consensus Evaluation

Analyze Cross-Review results and determine:

- **Consensus reached**: Members broadly agree, or disagreements are clearly resolved
- **Unresolved issues**: Opposing views on a core issue are still clashing and need further discussion

### Step 2: Additional Round Decision

```
IF unresolved issues exist AND additional discussion would add value:
    → Run additional Cross-Review (up to 2 extra rounds)
    → Re-query with a focused question that sharpens the point of contention
ELSE:
    → Proceed to final synthesis
```

### Step 3: Run Additional Cross-Review (if needed)

```bash
# JOB_DIR is the directory from the previous Stage
./skills/multi-ai-review/scripts/council.sh cross-review "$JOB_DIR"
```

**Focused Question example:**

> "A argues for approach X, while B argues for approach Y. Compare the trade-offs of each concretely,
> and provide evidence for which is more suitable in a production environment."

### Step 4: Final Synthesis (including Score Card)

After all rounds complete, synthesize in the following format.

```markdown
## Chairman's Synthesis

### {{verdict_label}}: {{final_verdict}}

### Score Card

| Dimension   | Weight | Gemini | Codex | Consensus | Grade |
|-------------|--------|--------|-------|-----------|-------|
| [dimension] | [x]%   | [score]| [score]| [consensus]| [grade]|
| **Overall** | **100%** |      |       | **[score]** | **[grade]** |

### Severity Summary

- Critical: [n items] — [summary]
- High: [n items] — [summary]
- Medium: [n items]
- Low: [n items]

### Points of Consensus

- [Points the members agreed on]

### Disagreements and Resolution

- [Issue] → [Chairman judgment + rationale]

### Recommendations

1. [High-priority action]
2. [Additional considerations]

### Review Metadata

- Domain: [preset name]
- Rounds: [Stage 1 + number of Cross-Review rounds]
- Consensus Level: [Strong / Moderate / Divergent]
- Composite Score: [score]/100 ([grade])
```

### Constraints

- **Maximum rounds**: Cross-Review runs at most 3 times total (Stage 2 + 2 additional)
- **Additional round criteria**: Only core issues that affect the decision — not mere differences of opinion
- **Infinite loop prevention**: After 3 rounds, if still unresolved, summarize as "divided opinion" and present the Chairman's judgment

---

## Presets Reference

Full definitions for each preset are in the `presets/` directory.

| File | Domain | Verdict Options |
|------|--------|----------------|
| `presets/code-review.yaml` | Code review | (score-based grade) |
| `presets/market-regime.yaml` | Market regime | Strong Bull / Bull / Neutral / Bear / Strong Bear |
| `presets/investment.yaml` | Investment due diligence | Strong Buy / Buy / Hold / Pass / Strong Pass |
| `presets/risk-assessment.yaml` | Risk assessment | Critical / High / Medium / Low / Negligible |
| `presets/default.yaml` | General consensus | Strong Agree / Agree / Neutral / Disagree / Strong Disagree |

---

## CLI Requirements

```bash
# Verify CLI installation
command -v claude  # Claude Code (host — Chairman role)
command -v gemini  # Gemini CLI
command -v codex   # Codex CLI

# Installation
# Gemini CLI: https://github.com/google-gemini/gemini-cli
# Codex CLI:  https://github.com/openai/codex
```

---

## File Structure

```
skills/multi-ai-review/
├── SKILL.md                    # this file
├── council.config.yaml         # member config, routing, scoring, Quality Gate
├── presets/
│   ├── code-review.yaml        # code review preset
│   ├── market-regime.yaml      # market regime preset
│   ├── investment.yaml         # investment due diligence preset
│   ├── risk-assessment.yaml    # risk assessment preset
│   └── default.yaml            # general consensus preset (fallback)
├── scripts/
│   ├── council.sh              # main execution script
│   ├── council-job.sh          # job runner
│   ├── council-job.js          # job implementation
│   ├── council-job-worker.js   # per-member worker
│   ├── council-event-utils.js  # event utilities
│   └── cleanup.sh              # orphan job cleanup
└── templates/
    ├── member-prompt.md        # common member prompt template (domain-agnostic)
    └── report.md               # final report template
```

---

## References

- `council.config.yaml` — member, routing, scoring, and Quality Gate configuration
- `presets/` — per-domain dimensions, weights, and role definitions
