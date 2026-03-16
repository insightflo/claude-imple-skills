# Workflow Guide Decision Algorithm

> Detailed 2-stage decision algorithm and scenario validation

## Algorithm Variable Mapping

Stage 1 bash variables → algorithm variables:

| Bash Variable | Algorithm Variable | Description |
|---------------|--------------------|-------------|
| `TASK_COUNT` | `TASK_COUNT` | Total number of tasks |
| `INCOMPLETE_COUNT` | `incomplete_tasks` | Incomplete tasks ([ ] checkboxes) |
| `TASK_COUNT>0 AND INCOMPLETE_COUNT=0` | `all_tasks_completed` | All tasks completed |
| `SOURCE_CODE(yes)` | `source_code EXISTS` | Code files exist under src/, app/, lib/ |
| `AGENT_COUNT` | `AGENT_COUNT` | Number of .claude/agents/*.md files |
| `GOVERNANCE_DONE` | `GOVERNANCE_DONE` | management/project-plan.md exists (yes/no) |
| `DOMAIN_COUNT` | `DOMAIN_COUNT` | Number of unique domain: fields in TASKS.md |
| `CONFLICT_FILES>0` | git merge conflicts exist | Result of git diff --diff-filter=U |

---

## Decision Algorithm (Simple Router)

> workflow-guide only does one thing: **current state → recommend 1 skill**.
> Prerequisites (governance, infrastructure installation, etc.) are handled by the recommended skill's own "precondition check".
> **Execute IF-THEN in order. Return immediately when the first condition is true.**

```python
ALGORITHM get_recommendation():

  # 1) Recovery (highest priority)
  IF (state file EXISTS AND INCOMPLETE_IN_STATE > 0) OR git merge conflicts:
    RETURN "/recover"

  # 2) No tasks
  IF TASKS.md NOT EXISTS:
    IF docs/planning/06-tasks.md EXISTS:
      RETURN "/tasks-migrate"
    ELSE:
      RETURN "/tasks-init"
  IF TASK_COUNT == 0:
    RETURN "/tasks-init"

  # 3) Maintenance (existing code + incomplete tasks)
  IF source_code EXISTS AND incomplete_tasks > 0:
    RETURN "/agile iterate"

  # 4) Small-scale implementation
  IF TASK_COUNT < 30 AND incomplete_tasks > 0:
    RETURN "/agile auto"

  # 5) Large-scale implementation
  IF incomplete_tasks >= 30:
    RETURN "/team-orchestrate"
    # team-orchestrate self-checks:
    #   - Agent Teams not installed → guide install.sh --mode=team
    #   - TASKS.md format insufficient → guide /tasks-migrate
    #   - Governance incomplete → guide /governance-setup

  # 6) Completed
  IF all_tasks_completed:
    RETURN "/audit"
    # audit self-checks:
    #   - No planning documents → guide /governance-setup
```

---

## Scenario Validation

| Scenario | Initial State | Algorithm Path | Recommendation | Skill Self-Handles |
|----------|--------------|----------------|----------------|--------------------|
| New project | No TASKS.md | 2 | `/tasks-init` | — |
| Legacy tasks | Only 06-tasks.md | 2 | `/tasks-migrate` | — |
| Small implementation | 20 tasks, incomplete>0 | 4 | `/agile auto` | TASKS format check |
| Large implementation | 100 tasks, incomplete>0 | 5 | `/team-orchestrate` | Agent Teams install, governance guide |
| Maintenance | source_code + incomplete>0 | 3 | `/agile iterate` | — |
| Pre-deployment | all_completed | 6 | `/audit` | Planning doc check |
| Recovery | state file incomplete | 1 | `/recover` | — |
| Merge conflict | git conflicts | 1 | `/recover` | — |

---

## Partial Completion Assessment Criteria

### Planning Completion Criteria (Socrates standard: 7 documents)

- `01-prd.md`, `02-trd.md`, `03-uxd.md`, `04-database-design.md`, `05-resources.md`, `06-tasks.md`, `07-acceptance-criteria.md`
- Fewer than 7 → "Planning in progress"

### Governance Completion Criteria (5 deliverables)

- `management/project-plan.md` (PM)
- `management/decisions/ADR-*.md` at least 4 (Architect)
- `design/system/*.md` at least 4 (Designer)
- `management/quality-gates.md` (QA)
- `database/standards.md` (DBA)
- Only some exist → "Governance in progress"

---

## Algorithm Application Rules

1. **Strictly prohibited**: TASKS.md content (titles, purposes, descriptions, comments), user statements, project names, and prior conversation history are NOT inputs to the algorithm
2. **Use only variables measured in Stage 1**
3. **In Stage 3 AskUserQuestion, the skill returned by RETURN must always be marked with ⭐**
