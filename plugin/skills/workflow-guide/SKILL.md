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

# 6. cmux 감지
CMUX_AVAILABLE=$(cmux ping 2>/dev/null && echo "yes" || echo "no")
echo "cmux=$CMUX_AVAILABLE"
```

### Stage 2: Decision Algorithm (rules + experience hybrid)

> workflow-guide does **current state → recommend 1 skill**.
> When experience data exists, memento's Smart Router can override the rule-based recommendation.

```
① Recovery: state file incomplete OR merge conflicts → /recover
② No tasks: no TASKS.md → /tasks-init (or /tasks-migrate if legacy exists)
③ Maintenance: source_code exists + bug/fix request → /maintenance
③-b Maintenance (iterative): source_code exists + incomplete>0 → /agile iterate
④ New implementation: incomplete>0 + TASK<30 → /agile auto
⑤ Large-scale (30-50): incomplete>=30 → /team-orchestrate --mode=auto (or --mode=team if Agent Teams)
⑤-b Very large (50+): incomplete>=50 → /team-orchestrate --mode=thin
⑥ Done: all_tasks_completed → /audit
```

**Memento Experience Override** (when `.claude/memento/experience.jsonl` exists with 5+ entries):

After computing the rule-based recommendation, check if memento's experience-weighted router suggests a different skill with confidence > 0.75. If so, use the experience-based recommendation and note the override reason. See `/memento route` for the full algorithm. This ensures backward compatibility — without experience data, routing is purely rule-based.

**cmux 오버라이드** (CMUX_AVAILABLE=yes일 때 ⑤ 이후 적용):

| 기본 추천 | cmux 대체 | 이유 |
|-----------|-----------|------|
| `/team-orchestrate` | `/cmux-orchestrate` | 물리적 계층 + 이기종 AI 팀 |
| `/multi-ai-run` | `/cmux-ai-run` | 창 분할 진짜 병렬 실행 |
| `/multi-ai-review` | `/cmux-ai-review` | 패널 나란히 동시 리뷰 |

cmux 감지 시 추천 메시지에 cmux 변형 스킬을 ⭐ 추천으로 올리고, 기존 스킬은 대안으로 제시.

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

## Standalone Skill Catalog (25 skills)

| Skill | Trigger | Role |
|-------|---------|------|
| **`/workflow`** | "what should I do?" | Meta hub — skill routing |
| **`/governance-setup`** | `/governance-setup` | Governance + Mini-PRD planning |
| **`/tasks-init`** | `/tasks-init` | TASKS.md scaffolding |
| **`/tasks-migrate`** | `/tasks-migrate` | Consolidate legacy tasks |
| **`/agile`** | `/agile auto` | Layer-based sprint execution |
| **`/team-orchestrate`** | `/team-orchestrate`, `/auto-orchestrate` | Unified orchestration — auto/team/thin modes |
| **`/cmux-orchestrate`** | `/cmux-orchestrate` | cmux 물리적 3-Level 팀 (Claude/Gemini/Codex 혼합) |
| **`/multi-ai-run`** | `/multi-ai-run` | Role-based model routing |
| **`/cmux-ai-run`** | `/cmux-ai-run` | cmux 창 분할 병렬 태스크 실행 |
| **`/checkpoint`** | "review this" | Two-stage review on task completion |
| **`/security-review`** | `/security-review` | OWASP Top 10 security scan |
| **`/audit`** | `/audit` | Pre-deployment comprehensive audit |
| **`/multi-ai-review`** | `/multi-ai-review` | 3-AI consensus review |
| **`/cmux-ai-review`** | `/cmux-ai-review` | cmux 창 분할 병렬 3-Stage 리뷰 |
| **`/recover`** | "work was interrupted" | Work recovery hub |
| **`/impact`** | `/impact <file>` | Change impact analysis |
| **`/deps`** | `/deps` | Dependency graph |
| **`/coverage`** | `/coverage` | Test coverage |
| **`/architecture`** | `/architecture` | Architecture map |
| **`/maintenance`** | "fix this bug" | ITIL 5-stage production maintenance orchestrator |
| **`/compress`** | "compress context" | Long context optimization |
| **`/statusline`** | auto-activated | Progress status bar display |
| **`/changelog`** | `/changelog` | Change history query |
| **`/cmux`** | `/cmux` | cmux 터미널 멀티플렉서 제어 |
| **`/memento`** | "skill health", "which skill" | Skill ecosystem intelligence — experience logging, smart routing, health dashboard |

---

## Skill Selection by Task Scale

| Task count | Recommended skill | Mode | Prerequisite skills |
|------------|-------------------|------|---------------------|
| **1–30** | `/agile auto` | — | — |
| **30–50** | `/team-orchestrate` | `--mode=auto` or `--mode=team` | `/governance-setup` (optional) |
| **50–200** | `/team-orchestrate` | `--mode=thin` | `/governance-setup` |
| **200+** | `/team-orchestrate --mode=thin --phase N` | split by phase | `/governance-setup` |

---

## Natural Language → Skill Quick Map (GSD 스타일 확장)

```
"I don't know where to start"          → /workflow
"I have a spec, start coding"          → /agile auto
"Fix this feature"                     → /agile iterate
"Review the code"                      → /checkpoint
"Do a deep review"                     → /multi-ai-review (cmux: /cmux-ai-review)
"Run a security check"                 → /security-review
"Run a quality check"                  → /audit
"Work was interrupted"                 → /recover
"This is a large project"              → /governance-setup
"Fix this bug"                         → /maintenance
"Fix this in production"               → /maintenance
"Run with an agent team"               → /team-orchestrate (cmux: /cmux-orchestrate)
"Use multiple AIs in parallel"         → /cmux-ai-run (cmux 감지 시) / /multi-ai-run
"Show execution status"                → /whitebox status
"Compress the context"                 → /compress
"Which skill works best for this?"     → /memento route
"Show skill performance"               → /memento health
"Why does this skill keep failing?"    → /memento reflect

# GSD 스타일 자연어 라우팅
"이거 리팩토링해줘"         → /agile auto (복잡) 또는 /agile iterate (단순)
"이 기능 추가해줘"          → /discuss → /agile auto
"뭘 어떻게 해야 할지 모르겠어" → /discuss
"결정해야 할 게 있어"        → /discuss
"요구사항 분석해줘"          → /si-planning
"기능정의서 만들어줘"        → /si-planning
"화면정의서 만들어줘"        → /si-planning
"SI 기획 시작"             → /si-planning --domain=?
"요구사항 변경"             → /si-planning --change
"누락 검사"                → /si-planning --gap
"고객 대시보드"             → /si-planning --dashboard
"이거 검증해줘"             → /audit (goal-backward 포함)
"코드 확인해줘"             → /checkpoint
"이거 맞게 했는지 봐줘"      → /audit
"자동으로 다 해줘"          → /team-orchestrate --mode=autonomous
"알아서 해줘"               → /agile auto
```

### 자동 라우팅 모드

`--auto` 플래그 추가 시 사용자 확인 없이 바로 실행:

```bash
# 기존
/workflow → 진단 → 추천 → 사용자 확인 → 실행

# --auto 모드
/workflow --auto → 진단 → 바로 실행
```

---

## Reference Documents

For detailed algorithms, skill integration matrix, and quality gates, see:

- `references/decision-algorithm.md` — Detailed decision algorithm + scenario validation
- `references/skill-integrations.md` — Skill-to-skill integrations + failure recovery paths

---

**Last Updated**: 2026-03-18 (v5.1.0 — cmux auto-detection + cmux skill routing added)
