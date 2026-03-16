---
name: workflow-guide
description: Routes you to the right skill for any situation by auto-analyzing project state. Use this whenever you are unsure what to do next — it diagnoses the project and recommends the optimal skill. Invoke immediately on "what should I do?", "which skill?", "recommend a workflow", or "what's next?" questions. Triggered by /workflow.
trigger: /workflow, /workflow-guide, "뭐해야해?", "어떤 스킬", "워크플로우 추천"
version: 5.0.0
updated: 2026-03-12
---

# Workflow Selection Guide (Meta Hub)

> **Purpose**: Auto-analyze project state → recommend 1–2 optimal skills
>
> **Core principle**: This skill **does not write implementation code**. It only performs **situation diagnosis → skill recommendation → user confirmation**.

---

## Absolute Prohibitions

1. Do not write code directly — guide the workflow only.
2. Do not list all skills — recommend **1–2 only**, matched to the situation.
3. Do not start with requirements questions — **auto-diagnose** project state first.

---

## Actions to Execute Immediately on Skill Activation

### Stage 1: Auto-diagnose project state (Silent Analysis)

```bash
# 1. Check for task file
ls TASKS.md 2>/dev/null || ls docs/planning/06-tasks.md 2>/dev/null

# 2. Check codebase (actual code files in src/·app/·lib/)
SOURCE_CODE=$(find src/ app/ lib/ -maxdepth 3 -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" \) 2>/dev/null | head -1)
echo "source_code=${SOURCE_CODE:+yes}"

# 3. Check for interrupted work (state file + incomplete tasks)
for STATE_PATH in ".claude/orchestrate-state.json" ".claude/orchestrate/orchestrate-state.json"; do
  if [ -f "$STATE_PATH" ] && grep -qE '"status"[[:space:]]*:[[:space:]]*"(in_progress|pending)"' "$STATE_PATH" 2>/dev/null; then
    echo "state_file=$STATE_PATH incomplete_in_state=1"
  fi
done

# 4. Check for git merge conflicts
CONFLICT_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null | wc -l | tr -d ' ')
echo "conflicts=$CONFLICT_FILES"

# 5. Agent/task counts
AGENT_COUNT=$(ls .claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
TASK_COUNT=$(grep -cE '^\s*[-*]\s*\[|^#{1,6}\s+\[' TASKS.md 2>/dev/null || echo 0)
INCOMPLETE_COUNT=$(grep -cE '^\s*[-*]\s*\[\s*\]|^#{1,6}\s+\[\s*\]' TASKS.md 2>/dev/null || echo 0)
GOVERNANCE_DONE=$(ls management/project-plan.md 2>/dev/null && echo "yes" || echo "no")
echo "agents=$AGENT_COUNT tasks=$TASK_COUNT incomplete=$INCOMPLETE_COUNT governance=$GOVERNANCE_DONE"
```

### Stage 2: Decision Algorithm (simple router — each skill handles its own prerequisites)

> workflow-guide only does **current state → recommend 1 skill**.
> When the recommended skill runs, its own "prerequisite check" section detects any missing dependencies and guides accordingly.

```
① Recovery: state file incomplete OR merge conflicts → /recover
② No tasks: no TASKS.md → /tasks-init (or /tasks-migrate if legacy exists)
③ Maintenance: source_code exists + bug/fix request → /maintenance
③-b Maintenance (iterative): source_code exists + incomplete>0 → /agile iterate
④ New implementation: incomplete>0 + TASK<30 → /agile auto
⑤ Large-scale implementation: incomplete>0 + TASK>=30 → /team-orchestrate
⑥ Done: all_tasks_completed → /audit
```

Prerequisite checks each skill performs on its own:
- `/team-orchestrate` → checks TASKS.md format and Agent Teams installation
- `/agile` → checks TASKS.md existence/format, recommends team-orchestrate for ≥30 tasks
- `/audit` → checks for planning documents, guides to /governance-setup if missing
- `/governance-setup` → guides to /tasks-init or /tasks-migrate based on TASKS.md state

### Stage 3: Tailored Recommendation (AskUserQuestion)

Display the diagnosis result with a starred recommendation for user confirmation:

```json
{
  "questions": [{
    "question": "Project state has been analyzed. Choose the next step:",
    "options": [
      { "label": "⭐ [Recommended] {diagnosed skill}", "description": "{reason for fit}" },
      { "label": "{alternative 1}", "description": "{description}" }
    ]
  }]
}
```

---

## Standalone Skill Catalog (21 skills)

| Skill | Trigger | Role |
|-------|---------|------|
| **`/workflow`** | "what should I do?" | Meta hub — skill routing |
| **`/governance-setup`** | `/governance-setup` | Governance + Mini-PRD planning |
| **`/tasks-init`** | `/tasks-init` | TASKS.md scaffolding |
| **`/tasks-migrate`** | `/tasks-migrate` | Consolidate legacy tasks |
| **`/agile`** | `/agile auto` | Layer-based sprint execution |
| **`/team-orchestrate`** | `/team-orchestrate` | Agent Teams dynamic team formation + parallel execution |
| **`/multi-ai-run`** | `/multi-ai-run` | Role-based model routing |
| **`/checkpoint`** | "review this" | Two-stage review on task completion |
| **`/security-review`** | `/security-review` | OWASP Top 10 security scan |
| **`/audit`** | `/audit` | Pre-deployment comprehensive audit |
| **`/multi-ai-review`** | `/multi-ai-review` | 3-AI consensus review |
| **`/recover`** | "work was interrupted" | Work recovery hub |
| **`/impact`** | `/impact <file>` | Change impact analysis |
| **`/deps`** | `/deps` | Dependency graph |
| **`/coverage`** | `/coverage` | Test coverage |
| **`/architecture`** | `/architecture` | Architecture map |
| **`/maintenance`** | "fix this bug" | ITIL 5-stage production maintenance orchestrator |
| **`/compress`** | "compress context" | Long context optimization |
| **`/statusline`** | auto-activated | Progress status bar display |
| **`/changelog`** | `/changelog` | Change history query |

---

## Skill Selection by Task Scale

| Task count | Recommended skill | Agent Teams | Prerequisite skills |
|------------|-------------------|-------------|---------------------|
| **1–30** | `/agile auto` | Not required | — |
| **30+** | `/team-orchestrate` | Dynamic team formation | `/governance-setup` + `install.sh --mode=team` |
| **200+** | Split into sub-projects | Required | `/governance-setup` |

---

## Natural Language → Skill Quick Map

```
"I don't know where to start"          → /workflow
"I have a spec, start coding"          → /agile auto
"Fix this feature"                     → /agile iterate
"Review the code"                      → /checkpoint
"Do a deep review"                     → /multi-ai-review
"Run a security check"                 → /security-review
"Run a quality check"                  → /audit
"Work was interrupted"                 → /recover
"This is a large project"              → /governance-setup
"Fix this bug"                         → /maintenance
"Fix this in production"               → /maintenance
"Run with an agent team"               → /team-orchestrate
"Show execution status"                → /whitebox status
"Compress the context"                 → /compress
```

---

## Reference Documents

For detailed algorithms, skill integration matrix, and quality gates, see:

- `references/decision-algorithm.md` — Detailed decision algorithm + scenario validation
- `references/skill-integrations.md` — Skill-to-skill integrations + failure recovery paths

---

**Last Updated**: 2026-03-12 (v5.0.0 — Progressive Disclosure applied)
