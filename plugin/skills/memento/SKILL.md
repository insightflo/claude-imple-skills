---
name: memento
description: "Cross-project experience memory — your persistent knowledge base across sessions. Remembers what worked, what failed, and why, so every new session starts smarter. Log outcomes → recall lessons → apply patterns. Use when starting work that other projects have solved, when you need to avoid past mistakes, or when onboarding to a new project area. Also logs skill execution outcomes to improve future routing. Responds to: 'memento', 'cross-project knowledge', 'what did we learn', 'past experience', 'avoid repeating', 'session memory', 'global memory', '스킬 성능', '스킬 추천', '스킬 건강', '어떤 스킬이 좋아'."
---

# Memento: Skill Ecosystem Intelligence

> Inspired by [Memento-Skills (arXiv:2603.18743)](https://arxiv.org/abs/2603.18743) — "Let Agents Design Agents"
>
> Core idea: Skills evolve through execution experience, not just manual editing.
> LLM parameters stay frozen; only SKILL.md files and routing knowledge change.

## What Memento Does

Cross-project knowledge memory with two primary purposes:

1. **Persist** — Record what you learn: feedback, decisions, references (Log)
2. **Retrieve** — Pull relevant lessons from other projects when starting new work (Recall/Search)

Skill intelligence is secondary — analyzing execution data to improve future routing:

## Modes

Invoke with: `/memento <mode>`

### Knowledge Modes (Persisting & Retrieving)

| Mode | Purpose | When |
|------|---------|------|
| `log` | Record what happened — successes, failures, decisions | After any significant outcome |
| `global recall <topic>` | Retrieve cross-project learnings on a topic | Session start, before new work |
| `global search <query>` | Full-text search across all projects | Need specific past experience |

### Skill Intelligence Modes (Learning from Execution)

These modes analyze skill execution data to improve future routing. They are means to improve recommendations, not the primary purpose.

| Mode | Purpose | When |
|------|---------|------|
| `route <task>` | Recommend best skill with experience weighting | workflow-guide static rules insufficient |
| `health` | Skill ecosystem dashboard | Periodic review |
| `reflect <skill>` | Failure pattern analysis + improvement suggestions | Skill underperforms repeatedly |
| `profile <skill>` | Detailed execution history for one skill | Before modifying or deprecating |
| `harness <skill>` | Auto-generate deterministic guardrails from failures | Recurring failures caught by code |

### Administration Modes

| Mode | Purpose |
|------|--------|
| `global health` | Unified ecosystem dashboard across all projects |
| `global sync` | Sync MEMORY.md files → DuckDB |
| `global sql <query>` | Direct SQL on unified experience store |

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

## Mode: `global <subcommand>`

> Unified Experience Store powered by DuckDB. Breaks project silos.
> 22개 프로젝트의 66개 메모리 파일을 하나의 SQL DB로 통합 검색.

### Setup

```bash
pip install duckdb  # 1회만
python3 ~/.claude/memento/query.py sync  # MEMORY.md → DB 동기화
```

### Subcommands

**`global search <query>`** — 전 프로젝트 학습 검색
```bash
python3 ~/.claude/memento/query.py search "cross-domain bugfix"
# → 14개 프로젝트에서 관련 학습 검색
```

**`global recall <topic>`** — 특정 주제의 크로스 프로젝트 지식 회수
```bash
python3 ~/.claude/memento/query.py recall "FastAPI 인증"
# → feedback/project 타입 우선, 실행 가능한 지식 반환
```

**`global health`** — 통합 대시보드
```bash
python3 ~/.claude/memento/query.py health
# → 프로젝트별 학습 현황 + 스킬 건강 (experience 데이터 있을 때)
```

**`global sync`** — MEMORY.md 동기화
```bash
python3 ~/.claude/memento/query.py sync
# → 모든 프로젝트의 메모리 파일을 DB에 upsert
```

**`global sql <query>`** — 직접 SQL
```bash
python3 ~/.claude/memento/query.py sql "SELECT type, COUNT(*) FROM learnings GROUP BY type"
```

### DB Location

```
~/.claude/memento/experience.duckdb  ← 전역 통합 저장소
~/.claude/memento/query.py           ← CLI 쿼리 도구
```

### Tables & Views

| Name | Type | Content |
|------|------|---------|
| `experience` | table | 스킬 실행 경험 (memento log에서 축적) |
| `learnings` | table | MEMORY.md 파일들 (22개 프로젝트 통합) |
| `skill_health` | view | 스킬별 사용횟수, 성공률, 평균토큰 |
| `project_knowledge` | view | 프로젝트별 학습 통계 |

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
