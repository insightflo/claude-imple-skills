---
name: memento
description: "Skill ecosystem intelligence engine — learns which skills work best for which tasks through execution experience, routes to optimal skills with confidence scores, and triggers improvements when patterns of failure emerge. Use this skill whenever you need to check skill health and performance stats, understand why a skill keeps failing, find the best skill for an unusual task, get a data-driven skill recommendation (not just rule-based), review the skill ecosystem dashboard, or trigger experience-based skill improvement. Also triggers automatically after skill execution to log outcomes. Responds to: 'skill health', 'skill stats', 'which skill works best for', 'why does this skill fail', 'skill dashboard', 'memento', '스킬 성능', '스킬 추천', '스킬 건강', '어떤 스킬이 좋아'."
---

# Memento: Skill Ecosystem Intelligence

> Inspired by [Memento-Skills (arXiv:2603.18743)](https://arxiv.org/abs/2603.18743) — "Let Agents Design Agents"
>
> Core idea: Skills evolve through execution experience, not just manual editing.
> LLM parameters stay frozen; only SKILL.md files and routing knowledge change.

## What Memento Does

Three functions, mapped to the paper's Read-Write Reflective Learning:

1. **Log** — Record skill execution outcomes (the experience memory)
2. **Route** — Recommend the best skill using rules + experience (Read phase)
3. **Reflect** — Detect failure patterns and suggest improvements (Write phase)

## Modes

Invoke with: `/memento <mode>`

| Mode | Purpose | When to use |
|------|---------|-------------|
| `log` | Record a skill execution outcome | After any skill completes (can be automated via hook) |
| `route <task>` | Get experience-weighted skill recommendation | When workflow-guide's static rules feel insufficient |
| `health` | Show skill ecosystem dashboard | Periodic review, before skill cleanup |
| `reflect <skill>` | Analyze failure patterns, suggest fixes | When a skill underperforms repeatedly |
| `profile <skill>` | Show detailed skill execution history | Before deciding to modify or deprecate a skill |
| `harness <skill>` | Generate validation scripts from failure patterns | When a skill has recurring failures that could be caught by code |

---

## Mode: `log`

Record what happened after a skill ran. This is the foundation — without experience data, routing and reflection have nothing to learn from.

### What to capture

Read the experience schema from `references/experience-schema.md`, then create an entry:

```bash
# Append to the project's experience store
STORE="${PROJECT_ROOT}/.claude/memento/experience.jsonl"
mkdir -p "$(dirname "$STORE")"
```

### Outcome determination

Observe these signals to judge success. Don't ask the user — infer from context:

| Signal | Interpretation | Confidence |
|--------|---------------|------------|
| User proceeds to next task | success | high |
| Explicit positive ("좋아", "perfect") | success | very high |
| Quality gate passed (/checkpoint, /audit) | success | very high |
| Same skill re-invoked immediately | partial | medium |
| User corrects output or says "아니" | failure | high |
| Quality gate failed | partial | high |
| Session ends without feedback | unknown — exclude from stats | low |

### Automatic logging

The ideal setup: a PostToolUse hook on Skill invocations that writes experience entries automatically. See `references/hook-setup.md` for the hook configuration. Until automated, log manually after significant skill runs.

---

## Mode: `route <task description>`

Recommend the best skill using a 3-layer scoring system that improves as experience accumulates.

### The Algorithm

```
Layer 1: Rule-based matching (existing workflow-guide logic)
  ↓ produces rule_scores: {skill: 0.0-1.0}

Layer 2: Experience-based matching
  ↓ find similar past tasks in experience.jsonl
  ↓ compute success_rate per skill, weighted by:
  ↓   - recency (recent experiences count more, decay=0.95)
  ↓   - similarity (closer task signatures count more)
  ↓ produces exp_scores: {skill: 0.0-1.0}

Layer 3: Blend
  ↓ alpha = min(0.7, 0.3 + experience_count * 0.04)
  ↓   → starts at 0.3 (rules dominate)
  ↓   → grows to 0.7 (experience dominates at 10+ data points)
  ↓ final_score = (1-alpha)*rule_score + alpha*exp_score
```

Cold start is handled gracefully: with zero experience, `alpha=0.3` and `exp_score=0.5` (neutral), so the existing workflow-guide rules drive routing. As experience accumulates, data gradually takes over.

### Task Signature Extraction

From the user's request, extract:
- **intent**: bugfix | feature | refactor | review | deploy | plan | research | design
- **scale**: single_file | multi_file | cross_domain | system_wide
- **domain**: extracted from file paths or keywords mentioned
- **keywords**: key terms from the request

Use these dimensions for similarity matching against past experiences.

### Output Format

Present the recommendation with confidence and evidence:

```
📊 Memento Route: maintenance (confidence: 0.87)

  Rule match:  0.82 (source_code=yes, intent=bugfix)
  Experience:  0.91 (7 similar tasks, 6 succeeded with /maintenance)
  Blend α:     0.58 (experience weight, based on 7 data points)

  Alternative: /agile iterate (0.64)

  Recent similar:
    • 2026-03-25 auth middleware fix → /maintenance → success
    • 2026-03-22 payment validation → /maintenance → success
    • 2026-03-20 cross-domain refactor → /maintenance → partial
```

---

## Mode: `health`

Display a skill ecosystem dashboard. Read all experience data, generate profiles, and present:

### Dashboard Sections

1. **Usage Ranking** — Top 10 most-used skills with success rates
2. **Risk Watch** — Skills with declining success rates or high failure counts
3. **Dead Skills** — Skills never invoked (candidates for deprecation)
4. **Coverage Gaps** — Task types that consistently score below confidence threshold

### Skill Profile Generation

For each skill with experience data, auto-generate a profile. See `references/skill-profile-schema.md` for the schema. Profiles include:
- Total uses, success rate, average duration/tokens
- Best-for task signatures (where it succeeds most)
- Failure patterns (recurring conditions that cause failure)
- Trend (improving/stable/declining based on recent 10 runs)

Store profiles in `.claude/memento/profiles/<skill-name>.json`.

---

## Mode: `reflect <skill-name>`

Analyze why a skill underperforms and suggest concrete improvements.

### Process

1. **Gather evidence**: Read all experience entries for the target skill
2. **Pattern detection**: Group failures by task signature dimensions
   - Does it fail on a specific intent? (e.g., always fails on cross-domain bugfixes)
   - Does it fail at a specific scale? (e.g., works for single_file but not system_wide)
   - Is there a recent regression? (worked before, fails now)
3. **Root cause hypothesis**: Based on patterns, hypothesize what's missing in the SKILL.md
4. **Generate improvement proposal**: A specific, actionable edit to the SKILL.md
5. **Confidence assessment**: Based on evidence quantity

### Integration with autoresearch-skills

When confidence is high (>0.8) and the pattern is clear:
- Generate a test case from the failure pattern
- Propose adding it to the skill's eval suite
- Suggest running `/autoresearch-skills` with the new test case

When confidence is medium (0.5-0.8):
- Present the analysis to the user
- Ask whether to proceed with improvement

When confidence is low (<0.5):
- Log the pattern, wait for more data

### Output Format

```
🔍 Memento Reflect: maintenance

  Evidence: 12 runs analyzed (8 success, 3 partial, 1 failure)

  Pattern detected: cross-domain failures
    • 3/3 cross-domain tasks resulted in partial or failure
    • All succeeded for single_file and multi_file scales

  Hypothesis: SKILL.md lacks guidance for cross-domain impact analysis.
    The 5-stage ITIL process jumps to modification without checking
    cross-domain dependencies first.

  Proposed fix: Add "Step 0: Run /impact for cross-domain changes"
    before Stage 3 (Safe Modification).

  Confidence: 0.75 (3 consistent data points)

  Recommendation: Present to user for approval before modifying.
```

---

## Mode: `profile <skill-name>`

Show the complete execution history and statistics for one skill.

Read `references/skill-profile-schema.md` for the data structure. Display:
- All logged executions (chronological)
- Success/failure breakdown by task signature
- Token efficiency trends
- Comparison with similar skills (if available)

---

## Mode: `harness <skill-name>`

> Inspired by [AutoHarness (arXiv:2603.03329)](https://arxiv.org/abs/2603.03329) — LLM agents that generate their own guardrail code.

Analyze failure patterns and generate validation scripts that prevent recurring failures. The key insight from AutoHarness: a small model + code guardrails beats a large model without them.

### Three Harness Types

| Type | File | Purpose | LLM needed at runtime? |
|------|------|---------|----------------------|
| **Pre-check** | `scripts/harness/pre_check.sh` | Validate environment before skill runs | No |
| **Action-verifier** | `scripts/harness/verify_action.py` | Check proposed actions are valid | No |
| **Post-verify** | `scripts/harness/post_verify.sh` | Confirm skill achieved its goal | No |

### Generation Process

```
1. Read experience.jsonl for target skill
2. Group failures by root cause:
   - Missing prerequisites (file not found, tool not installed)
   - Invalid actions (wrong file modified, forbidden operation)
   - Incomplete results (partial output, missing verification)
3. For each failure pattern, generate a validation script:
   - pre_check.sh: catches prerequisite failures
   - verify_action.py: catches invalid action patterns
   - post_verify.sh: catches incomplete results
4. Test the harness against past failure cases
5. If it would have caught the failures → install to skill's scripts/harness/
```

### Example

If maintenance skill fails 3/3 times on cross-domain changes because it doesn't check dependencies first:

```bash
# scripts/harness/pre_check.sh (auto-generated)
#!/bin/bash
# Harness: cross-domain dependency check
# Generated from 3 failure cases (2026-03-25, 03-22, 03-20)

CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null)
DOMAINS=$(echo "$CHANGED_FILES" | sed 's|/.*||' | sort -u | wc -l)

if [ "$DOMAINS" -gt 1 ]; then
  echo "HARNESS_WARN: Cross-domain change detected ($DOMAINS domains)."
  echo "HARNESS_SUGGEST: Run /impact first to map dependencies."
  exit 1
fi
exit 0
```

### Harness Directory Convention

```
skill-name/
├── SKILL.md
└── scripts/
    └── harness/           ← Auto-generated by /memento harness
        ├── pre_check.sh   ← Runs before skill, exit 1 = block
        ├── verify_action.py  ← Validates proposed actions
        └── post_verify.sh ← Runs after skill, exit 1 = warn
```

Harness scripts are deterministic (no LLM calls). They're the cheapest possible guardrails.

See `references/harness-generation.md` for the full generation algorithm and templates.

---

## Data Storage

All memento data lives in `.claude/memento/` within the project:

```
.claude/memento/
├── experience.jsonl          ← Append-only execution log
└── profiles/                 ← Auto-generated skill profiles
    ├── maintenance.json
    ├── agile.json
    └── ...
```

Experience is project-scoped because skill effectiveness varies by project type. A skill that works well for a web app may not suit a CLI tool.

---

## References

For detailed schemas and technical specifications:
- `references/experience-schema.md` — Experience log entry format
- `references/skill-profile-schema.md` — Skill profile data structure
- `references/smart-router.md` — Full routing algorithm with edge cases
- `references/hook-setup.md` — Automated experience logging via hooks
- `references/harness-generation.md` — AutoHarness-inspired validation script generation
