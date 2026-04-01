---
name: multi-ai-review
description: |
  Claude + Gemini CLI + Codex CLI multi-AI consensus engine.
  3-Stage Pipeline (opinions → rebuttal → synthesis) drives consensus across domains:
  code review, market analysis, investment diligence, risk assessment, and more.

  Automatically detects domain from natural language and applies appropriate preset.

  Triggers:
  - "review this", "convene a council", "get multiple AI opinions", "deep review", "consensus"
  - "market analysis", "macro analysis", "investment review", "risk assessment"
  - Any situation needing multiple perspectives — trigger proactively
version: 4.2.0
updated: 2026-04-01
---

# Multi-AI Review — Universal Consensus Engine

> **Heavy-Hitter**: State the domain in natural language — right panel assembled automatically.
> **Cost**: CLI subscription plans only — no additional API charges.

## Quick Start

```
# Code review
"Review this PR"

# Market analysis
"How does the market look today?"

# Investment
"Evaluate this investment"

# Consensus (auto-applied)
"Convene a council on this direction"
```

## Prerequisites

```bash
command -v claude   # Claude Code (Chairman)
command -v gemini   # Gemini CLI (optional)
command -v codex    # Codex CLI (optional)
```

---

## 3-Stage Pipeline

```
Stage 1: Initial Opinions (parallel)
├── Gemini CLI → opinion.md (perspective A)
└── Codex CLI  → opinion.md (perspective B)

Stage 2: Cross-Review (rebuttal)
├── Gemini reviews/rebuts Codex
└── Codex reviews/rebuts Gemini

Stage 3: Chairman Synthesis
└── Claude synthesizes → Score Card → decides if more rounds needed
```

---

## Domain Auto-Routing

Keywords detected automatically — no preset naming needed.

| Preset | Keywords | Gemini | Codex |
|--------|----------|--------|-------|
| code-review | review, PR, code, merge | architecture/UX | technical/patterns |
| market-regime | market, stocks, macro | macro/news | quant/indicators |
| investment | investment, valuation, deal | market/strategy | finance/risk |
| risk-assessment | risk, security, danger | external threats | internal weaknesses |
| project-gate | gate, milestone, Go/No-Go | stakeholders/scope | schedule/resources |
| planning | plan, PRD, design, architecture, council | CTO (architecture/scalability) | Security (threats/compliance) |
| default | (fallback) | strategy/opportunity | execution/risk |

Full presets: `presets/*.yaml`

---

## Score Card

### Grade Thresholds

| Grade | Min Score |
|-------|-----------|
| A | 90 |
| B | 80 |
| C | 70 |
| D | 60 |
| F | 0 |

### Severity Labels

| Label | Meaning |
|-------|---------|
| Critical | Immediate action |
| High | Priority recommended |
| Medium | Improvement recommended |
| Low | For reference |

### Key Dimensions (code-review example)

| Dimension | Weight |
|-----------|--------|
| Security | 25% |
| Performance | 20% |
| Maintainability | 25% |
| Correctness | 20% |
| Style | 10% |

---

## Chairman Rules (v4.1.0)

**Core Principles**:
1. **Evidence Hierarchy** — file:line citations outrank structural scores
2. **Verification Required** — score changes need grep/file read/test proof
3. **Pre-Deploy Gate** — Done-When checks BEFORE deployment
4. **Delta Arbitration** — score gap ≥15 triggers verification (no averaging)
5. **2× Codex Weight** — in code-review/project-gate when verified
6. **Council Skeptic** — `planning` domain: play Devil's Advocate. Challenge every recommendation with "What's the tradeoff?" — never accept "good point" without a follow-up probing question.
7. **Planning Fallback** — `planning` domain + CLI unavailable: spawn Agent(CTO) + Agent(UX) + Agent(Security) per `references/council-personas.md` instead of skipping.

**Quick Reference**:

| Rule | Trigger | Action |
|------|---------|--------|
| Evidence Hierarchy | Concrete vs structural | Prioritize file:line |
| Verification Required | Score adjustment | Run grep/file read first |
| Pre-Deploy Gate | Task completion | Block if checks fail |
| Delta Arbitration | Gap ≥15 | Verify, don't average |
| 2× Weight | code-review + verified Codex | Formula: `(codex×2 + gemini)/3` |
| Council Skeptic | planning domain | "What's the tradeoff?" on every recommendation |
| Planning Fallback | planning + no CLI | Spawn Agent(CTO) + Agent(UX) + Agent(Security) |

**Detailed rules**: `references/evidence-rules.md`

---

## Chairman Protocol (Stage 3)

```
1. Extract Evidence
   - File:line citations (Codex)
   - Structural observations (Gemini)
   - Run Done-When verification

2. Consensus Evaluation
   - Consensus reached? → Proceed
   - Unresolved issues? → Additional round
   - Score gap ≥15? → Verify per Evidence Rules

3. Additional Round (if needed, max 2)
   - Focused question on contention point
   - Re-run Cross-Review

4. Final Synthesis
   - Score Card with grades
   - Severity summary
   - Recommendations
```

**Full protocol**: `references/chairman-protocol.md`

---

## CI Quality Gate

```bash
./skills/multi-ai-review/scripts/council.sh --mode ci "review request"
```

Thresholds (`council.config.yaml`):
- Critical issues: fail if > 0
- High issues: fail if > 3
- Overall score: fail if < 70

`on_fail: "block"` — returns non-zero exit code.

---

## Preset Verdicts

| Preset | Verdict Options |
|--------|----------------|
| code-review | A / B / C / D / F (score-based) |
| market-regime | Strong Bull / Bull / Neutral / Bear / Strong Bear |
| investment | Strong Buy / Buy / Hold / Pass / Strong Pass |
| risk-assessment | Critical / High / Medium / Low / Negligible |
| planning | Strongly Recommend / Recommend / Revise / Major Revise / Reject |
| default | Strong Agree / Agree / Neutral / Disagree / Strong Disagree |

---

## File Structure

```
skills/multi-ai-review/
├── SKILL.md                    # this file
├── council.config.yaml         # member, routing, scoring config
├── presets/
│   ├── code-review.yaml
│   ├── market-regime.yaml
│   ├── investment.yaml
│   └── default.yaml
├── scripts/
│   └── council.sh              # main execution
└── references/
    ├── evidence-rules.md       # Chairman Evidence Weighting (detailed)
    └── chairman-protocol.md    # Stage 3 protocol (detailed)
```

---

**Last Updated**: 2026-04-01 (v4.2.0 — Council mode: planning preset + CTO/UX/Security personas + Council Skeptic rule)
