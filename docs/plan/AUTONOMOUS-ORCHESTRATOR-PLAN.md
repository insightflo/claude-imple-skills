# Autonomous Orchestrator

> Autonomous task decomposition, execution, evaluation, and adjustment.
> Symphony-level orchestration intelligence built on Claude Code skill system.

Created: 2026-03-06
Status: v3.7 (Round 10 — Go)
Basis: Symphony analysis + claude-imple-skills architecture review
Related: SYMPHONY-ADOPTION-PLAN.md (superseded — backup in docs/plan/backup/)
Review: Round 1 council — Codex + Gemini
Review: Round 2 council — Codex + Gemini
Review: Round 3 council — Codex + Gemini (v3.1 Go)
Review: Round 4 council — Codex + Gemini (v3.2 Go Conditional)
Review: Round 5 council — Codex No-Go / Gemini Full Go → v3.3 fixes applied
Review: Round 6 council — Codex No-Go (3 blockers) / Gemini Full Go → v3.4 blockers resolved
Review: Round 7 council — Codex No-Go (3 minor) / Gemini Full Go → v3.5 all resolved
Review: Round 8 council — Codex No-Go (4 High) / Gemini Full Go → v3.6 all resolved
Review: Round 9 council — Codex no explicit verdict / Gemini Full Go → no new issues
Review: Round 10 council — Codex No-Go (1 High) / Gemini Full Go → v3.7 bridge fixed
Review: Round 11 council — Codex Go / Gemini Go → FINAL (Medium/Low only)

## Problem Statement

Current orchestrate-standalone executes pre-defined tasks but cannot:
- Decompose rough tasks into actionable sub-tasks
- Dynamically add/modify tasks during execution
- Self-evaluate results and trigger rework
- Make autonomous decisions about what work is needed

Users must manually define every task in detail before orchestration begins.

## Goal

Build an autonomous orchestrator that accepts rough/high-level tasks,
decomposes them, executes with existing skills, self-evaluates, and
adjusts — with Human Review gates at configurable checkpoints.

```
Human: "Build user authentication with OAuth"
  |
  v
[Autonomous Orchestrator]
  |-- Define: acceptance criteria + constraints locked
  |-- Decompose: 12 sub-tasks identified
  |-- Plan: dependencies mapped, skills selected
  |-- Execute: sub-tasks run with skills (checkpoint, security-review...)
  |-- Assess: automated checks → QA agent → verdict
  |-- Adjust: 3 tasks added (edge cases found), 1 task modified
  |-- Gate: Human Review checkpoint reached
  |
  v
Human: Reviews, approves/reworks
```

## Strategy: Extend First, Extract Later

> Round 1 Codex: "별도 repo 시기상조. orchestrate-standalone 위에 autonomy layer
> 추가가 먼저." Codex confirmed existing engine has wave/sprint/gate/resume already.

**Phase 1**: Add autonomy layer to existing orchestrate-standalone (in claude-imple-skills)
**Phase 2**: Validate with 3+ real scenarios
**Phase 3**: Extract to separate project only if coupling becomes a problem

This avoids:
- Duplicating existing wave/sprint/gate/resume logic
- Breaking existing users during development
- Premature abstraction before patterns stabilize

## Architecture

### Core Loop (DCPEA — Define, Constrain, Plan, Execute, Assess)

> Round 1 Codex: "DPEA에 Define/Constrain 단계 필요. 없으면 Assess/Adjust가
> 매 반복마다 기준을 바꿈."

```
                    ┌─────────────────────────┐
                    │    Human Input           │
                    │  (rough task / goal)     │
                    └───────────┬──────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │  0. DEFINE + CONSTRAIN   │
                    │  Lock: acceptance criteria│
                    │  constraints, quality bar │
                    │  budget (iterations/tasks)│
                    │  Output: contract         │
                    │  *** HUMAN APPROVAL ***   │
                    └───────────┬──────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │  1. DECOMPOSE            │
                    │  PM Agent: break down    │
                    │  into sub-tasks          │
                    │  Output: task tree       │
                    └───────────┬──────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │  2. PLAN                 │
                    │  Architect Agent:        │
                    │  dependencies, order,    │
                    │  skill selection,        │
                    │  context protocol        │
                    │  Output: execution plan  │
                    └───────────┬──────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │  3. EXECUTE              │
              ┌────►│  Run tasks with skills   │
              │     │  (existing engine:       │
              │     │   wave/sprint/gate)      │
              │     │  Output: artifacts       │
              │     └───────────┬──────────────┘
              │                 │
              │     ┌───────────▼──────────────┐
              │     │  4. ASSESS               │
              │     │  a. Automated checks     │
              │     │     (lint/build/test)     │
              │     │  b. QA Agent reflection  │
              │     │  c. Against DEFINE       │
              │     │     contract criteria     │
              │     │  Output: verdict         │
              │     └───────────┬──────────────┘
              │                 │
              │          ┌──────┴──────┐
              │          │             │
              │     [PASS]        [FAIL/GAPS]
              │          │             │
              │          ▼             ▼
              │     ┌─────────┐  ┌──────────┐
              │     │ Human   │  │ 5. ADJUST│
              │     │ Review  │  │ (within  │
              │     │ Gate    │  │  budget) │
              │     └────┬────┘  └────┬─────┘
              │          │            │
              │          ▼            │
              │     [Continue]        │
              └───────────────────────┘
```

### Context Protocol

> Round 1 Gemini: "Global Intent vs Local Task Context 전달 방법 정의 필요."

Every skill/agent invocation receives a structured context envelope:

```json
{
  "global": {
    "goal": "Build user authentication with OAuth",
    "contract": { "acceptance_criteria": [...], "constraints": [...] },
    "architecture_decisions": [...]
  },
  "local": {
    "task_id": "AUTH-03",
    "task_description": "Implement JWT token validation",
    "dependencies_completed": ["AUTH-01", "AUTH-02"],
    "skill_hint": "security-review"
  },
  "budget": {
    "max_iterations": 5,
    "remaining_iterations": 3,
    "max_dynamic_tasks": 10,
    "tasks_added_so_far": 2
  }
}
```

### Budget Guardrails

> Round 1 Gemini: "Token/Budget 관리 — 무한 루프 방지용 예산 가드레일."

| Guardrail | Default | Configurable |
|-----------|---------|-------------|
| Max DCPEA loop iterations | 5 | Yes |
| Max dynamically added tasks | 10 | Yes |
| Max consecutive failures before human escalation | 3 | Yes |
| Max define retries before human escalation | 3 | Yes (Round 4) |
| Max estimated token budget per session | None (MVP) | Yes (Round 4: G6) |
| Decompose result requires human approval | Yes (MVP) | Yes |
| Adjust result requires human approval | No (within budget) | Yes |

When any budget is exceeded → forced Human Review Gate.

**Token Budget Enforcement** (Round 5 Codex: C5):
- Each agent invocation logs estimated token usage to auto-events.jsonl
- `auto-state.json` maintains `budget.estimated_tokens_used` (derived from events)
- Cutoff behavior: when token budget exceeded → forced Human Review Gate (same as other budget guardrails)
- MVP: token tracking is best-effort estimate (exact counting is Post-MVP)

### Skill Invocation Contract

> Round 1 Codex: "Skill invocation이 가장 과소정의됨. 입력 스키마, 출력 스키마,
> side effect 범위, timeout/retry, rollback, idempotency를 정의해야 함."

Each skill invocation follows this contract:

```yaml
# Skill Invocation Contract
invoke:
  skill: "checkpoint"
  input:
    context_envelope: { global: ..., local: ... }
    files_changed: ["src/auth/jwt.js"]
    git_diff: "..."
  expectations:
    output_format: "structured_json"  # or "markdown", "pass_fail"
    timeout_ms: 120000
    retry_on_failure: 1
    side_effects: "read_only"  # or "read_write", "git_commit"
  on_failure:
    action: "skip_with_warning"  # or "halt", "retry", "escalate"
    fallback: null
```

**MVP simplification**: Skills are invoked via Claude Code subagent with
prompt-based contract. Formal schema enforcement is Post-MVP.

### Assess Pipeline

> Round 1 Gemini: "QA Agent 전에 automated checks 필수."

```
Assess pipeline — two-tier model (Round 8 Codex: C4):

  Per-task (lightweight, after each task completes):
    1. Syntax/compile check on changed files only
    2. QA Agent reflection: does this task output match its local spec?
    3. Per-task verdict: PASS / FAIL(reason)
    → FAIL triggers Adjust for that specific task (within budget)

  Per-wave/final (full, after wave completes or all tasks done):
    1. Contract verify_cmd execution (e.g., "npm test && npm run lint")
       - Runs the FULL project-level verification
       - Additional policy checks from contract.extra_checks[]
    2. QA Agent reflection (against locked contract criteria):
       - completeness check across all completed tasks
       - correctness evaluation
       - edge case identification
    3. Wave/Final verdict: PASS / FAIL(reason) / GAPS(missing_items)
    → FAIL/GAPS triggers Adjust stage; PASS at final → Final gate

Note: verify_cmd existence and executability validated at Define stage (Phase 1-1).
```

### State Management

> Round 1 Codex: "versioned schema, append-only event log 필요."

```json
// .claude/orchestrate/auto-state.json (summary-only — derived from events on load)
{
  "schema_version": 1,
  "session_id": "auto-2026-03-06-1200",
  "contract": {
    "version": 1,
    "hash": "sha256:abc123...",
    "goal": "Build user authentication with OAuth",
    "acceptance_criteria": ["JWT auth works", "OAuth flow complete"],
    "constraints": ["No external auth service", "Must pass security-review"],
    "quality_bar": "all tests pass + security-review clean",
    "verify_cmd": "npm test && npm run lint",
    "extra_checks": ["security-review"]
  },
  "budget": {
    "max_iterations": 5,
    "current_iteration": 3,
    "max_dynamic_tasks": 10,
    "dynamic_tasks_added": 2,
    "max_estimated_tokens": null,
    "estimated_tokens_used": 45200
  },
  "tasks": {
    "total": 15,
    "completed": 8,
    "in_progress": 2,
    "failed": 1,
    "dynamically_added": ["AUTH-13", "AUTH-14"]
  },
  "tasks_md_hash": "sha256:def456..."
}
// NOTE: events are in separate append-only file: .claude/orchestrate/auto-events.jsonl
// Example event lines:
//   {"ts":"...","type":"define","data":{"contract":"..."}}
//   {"ts":"...","type":"assess","data":{"verdict":"fail","gaps":[...]}}
//   {"ts":"...","type":"human_edit","data":{"changes":"structural","diff":[...]}}
```

**Contract Change Control** (Round 2 Codex, Round 5 Codex: C3):
- `contract.hash` computed from acceptance_criteria + constraints + quality_bar + verify_cmd + extra_checks
- All evaluation-relevant fields included in hash scope (no bypass via quality_bar change)
- Contract changes require a dedicated gate + justification event
- Assess always validates against the locked contract hash, not free-form interpretation

**Concurrency-Safe Event Log** (Round 2 Codex):
- Events written to separate append-only file: `.claude/orchestrate/auto-events.jsonl`
  (one JSON object per line — no full-file rewrite, no race condition)
- `auto-state.json` holds only current summary (derived from events on load)
- Workers append to events file; only the main loop rewrites state summary

**TASKS.md Sync Protocol** (Round 2 Gemini):
- Before each Execute wave, orchestrator re-reads TASKS.md to detect human edits
- **Structural changes** (ID, deps, status) → failure gate triggered (MVP scope gate merged into failure gate)
- **Non-structural changes** (description, comments) → silent sync, no gate (Round 4 Gemini: G4)
- Human edits promoted to `human_edit` event (authority model above)
- Detection method (Round 5 Codex: C4):
  - Step 1: hash comparison (fast path — no change = skip)
  - Step 2: if hash changed, parse both versions → task graph diff (structural vs non-structural)
  - Requires: TASKS.md structural diff classifier (Phase 1-2 task)
- In-flight task deletion: worker receives SIGTERM + resource cleanup (Round 4 Gemini: G4)

**Context Sliding Window** (Round 2 Gemini):
- For task sets > 30: only current wave + immediate dependencies get full context
- Completed tasks summarized as `{id, status, key_outputs}` (not full detail)
- Architecture decisions always included in global context (never windowed out)

**State File Canonical Rules** (Round 8 Codex: C3, Round 10 Codex: C1):
- `--mode=auto`: canonical state is `auto-state.json` + `auto-events.jsonl`
- `--mode=wave/sprint`: canonical state remains `orchestrate-state.json` (unchanged)
- Auto mode writes a **full-compatible bridge** to `orchestrate-state.json` (write-through)
  - Bridge contains the FULL schema expected by consumers:
    `version`, `started_at`, `tasks[]` (with individual `id`, `status`, `description`),
    `current_layer`, `total_layers`, `mode: "auto"`
  - This keeps board-builder.js (parses `tasks[].id/status`), recover, statusline working
- Consumers read `orchestrate-state.json` as before — no consumer modification needed for MVP
- Migration to auto-state-aware consumers is Post-MVP (Phase 4)
- Related documentation updates (communication-protocol.md etc.) added to Phase 1-7

### MVP Agent Simplification

> Round 2 Codex: "MVP에서 PM/Architect/QA 3개 분리 불필요. orchestrator 1개 +
> assess 반사 단계면 충분."

**MVP**: Single orchestrator agent handles Define/Decompose/Plan/Adjust.
Separate QA reflection only for Assess stage.

**Post-MVP**: Split into specialized PM/Architect/QA agents when prompt
complexity warrants it (validated in Phase 2 benchmarks).

### Dynamic Task ID Policy

> Round 2 Codex: "TASKS.md를 언제, 누가, 어떤 ID 정책으로 수정하는지 필요."

- Dynamic tasks use existing ID format with sub-sequence: `T3.1`, `T3.2` (Round 8 Codex: C1)
  - Current parser regex: `[A-Z]\d+(?:\.\d+)*` — already supports dot-separated sub-IDs
  - Multi-letter prefixes like `AUTH-03.1` are NOT supported by current parser
  - Phase 0-7 parser fix must also validate dynamic ID compatibility
- Only the orchestrator main loop writes to TASKS.md (workers never modify it)
- **Auto mode hook policy** (Round 8 Codex: C2):
  - `task-sync` post-task hook is disabled in `--mode=auto` (conflicts with event-based sync)
  - Gate-chain.js skips task-sync when `AUTO_MODE=true` env is set
  - All TASKS.md mutations go through event log → main loop → TASKS.md write
- All TASKS.md modifications recorded as events in auto-events.jsonl
- **Authority model** (Round 5 Codex: C1):
  - Event log is the single authoritative source at all times
  - Human edits detected via hash diff → promoted to `human_edit` event in auto-events.jsonl
  - On resume: TASKS.md reconciled with event log (events authoritative, including human_edit events)
  - This eliminates the "human priority vs events authoritative" contradiction

### Human Review Gates

> Round 2 Codex: "Gate 종류 줄이기. MVP는 4개면 충분."

| Gate Type | Trigger | What Human Reviews | MVP |
|-----------|---------|-------------------|-----|
| Contract gate | After Define stage **or** contract change request | Full contract: acceptance criteria + constraints + quality_bar + verify_cmd + extra_checks | Yes |
| Decompose gate | After task tree generated | Task breakdown quality | Yes |
| Failure gate | N consecutive failures or budget exceeded | Failure analysis + proposed fix | Yes |
| Final gate | All tasks complete | Full output + QA report | Yes |
| Phase gate | All tasks in a phase complete | Phase deliverables + assessment | Post-MVP |
| Scope gate | Dynamic tasks exceed budget | New tasks + justification | Post-MVP (merged into Failure gate for MVP) |
| Critical gate | Security/architecture changes | Diff + impact analysis | Post-MVP |

**Contract Change Routing** (Round 6 Codex: C2, Round 10 Codex: C2):
- Any contract modification request → Contract gate re-entry (same gate, re-approval required)
- Change justification recorded as `contract_change` event in auto-events.jsonl
- Contract version incremented, hash recomputed after approval
- **Post-approval flow**: Decompose/Plan re-executed against updated contract
  - Already-completed tasks: re-assessed against new criteria at next wave Assess
  - In-progress tasks: continue (assessed at wave completion with new contract)
  - New gaps identified by re-Plan → added as dynamic tasks (within budget)

**Budget Ownership** (Round 7 Codex: C1):
- Budget is **runtime policy**, NOT part of contract (not included in contract.hash)
- Budget changes do not trigger Contract gate — they are operational adjustments
- Budget is set at session start and lives in `auto-state.json.budget`
- Budget exceeded → Failure gate (not Contract gate)

**Human Gate Trigger Policy** (Round 7 Codex: C3):
- Human Review Gates fire only at **defined checkpoints** (Contract/Decompose/Failure/Final)
- NOT triggered per individual task PASS — only at gate boundaries
- DCPEA diagram's PASS → Human Review path represents the Final gate after all tasks complete

## Changes to Current Project (claude-imple-skills)

### Phase 0: Stabilize Existing Engine (Day 1-3)

> Round 1 Codex: "기존 엔진에 TODO/버그 있음. scheduler 레이어 계산 오류,
> state 런타임 에러."

- 0-1. Fix scheduler.js layer computation bug (uses successors instead of predecessors)
- 0-2. Fix state.js runtime error (`in_progress` vs `inProgress` variable mismatch)
- 0-3. Fix worker.js context passing (taskId only → full task object)
- 0-4. Verify orchestrate.sh completion path
- 0-5. Unify state schema (orchestrate-state.json path consistency)
- 0-6. Add concurrency-safe event log file (.jsonl append-only)
- 0-7. Fix TASKS.md parser regex — current regex captures only last metadata line (Round 4 Codex: C1)
- 0-8. Add cycle detection to scheduler.js DAG builder (Round 4 Gemini: G9)
- 0-9. Create minimal engine/auto adapter boundary (thin interface, not full refactor)
- 0-10. Add missing tests for edge cases (after all bug fixes above)
- 0-11. Confirm wave/sprint/gate/resume all work correctly (final verification)

**Phase 0 Exit Criteria** (Round 3 Codex):
- wave/sprint/resume smoke tests pass
- current_layer persistence verified on resume
- worker_count enforcement confirmed
- state/event log integrity: no data loss on concurrent workers
- All existing `--mode=wave` and `--mode=sprint` tests green

### Phase 1: Autonomy Layer MVP (Day 4-10)

Add to orchestrate-standalone as new mode: `--mode=auto`

- 1-1. Define stage: contract generation from rough goal
  - Input: 1-2 sentence goal
  - Output: acceptance criteria, constraints, quality_bar, verify_cmd, extra_checks[] (JSON schema enforced)
  - `verify_cmd` is **required** (Non-LLM Ground Truth — Round 4 Gemini: G5)
  - `extra_checks[]` optional but declared upfront (Round 6 Codex: C3)
  - verify_cmd existence and executability validated at this stage
  - Max define retries: 3 before human escalation (Round 4 Gemini: G2)
  - Human approval required before proceeding (reviews contract: criteria, constraints, quality_bar, verify_cmd, extra_checks)
- 1-2. Decompose stage: PM agent integration
  - Reads contract → generates task tree in TASKS.md format
  - Agent output must conform to defined JSON schema (Round 4 Gemini: G1)
  - TASKS.md linter/validator before Plan stage (Round 4 Gemini: G3)
  - TASKS.md structural diff classifier for sync protocol (Round 5 Codex: C4)
  - Supports heading-style and bullet-style tasks
  - Human approval of decomposition (MVP)
- 1-3. Plan stage: Architect agent integration
  - Dependency detection from decomposed tasks
  - Skill selection hints per task
  - Execution order (reuses existing scheduler.js)
- 1-4. Execute stage: enhanced worker with context
  - Context envelope (global + local) passed to each task
  - Reuses existing wave/sprint execution engine
- 1-5. Assess stage: contract-driven verification + QA agent
  - Run contract.verify_cmd + contract.extra_checks[] (no implicit fixed pipeline)
  - QA agent reflection against locked contract criteria
  - Verdict: PASS/FAIL/GAPS
- 1-6. Adjust stage: dynamic task modification
  - Add tasks for identified gaps (within budget)
  - Modify existing tasks if rework needed
  - Budget enforcement (max iterations, max tasks, max tokens — Round 4 Gemini: G6)
- 1-7. DCPEA loop integration in orchestrate.sh
  - `--mode=auto` flag
  - Budget guardrails
  - State management (auto-state.json)
- 1-8. Resume from auto checkpoint

### Phase 2: Validation + Hardening (Day 11-15)

- 2-1. Benchmark scenario 1: Small feature (5-10 tasks generated)
- 2-2. Benchmark scenario 2: Medium feature (15-30 tasks generated)
- 2-3. Benchmark scenario 3: Bug fix with investigation (dynamic tasks)
- 2-4. Intentional failure scenarios (Round 5 Codex: C7):
  - 2-4a. Seeded test failure → Assess catches → Adjust adds fix task
  - 2-4b. Budget exceed → forced Human Review Gate triggered
  - 2-4c. Resume after mid-execution failure → state recovery verified
  - 2-4d. Contract change attempt → Contract gate re-entry blocks without justification
  - 2-4e. TASKS.md human edit during execution → structural diff + event promotion
- 2-5. Context protocol validation (no context drift across tasks)
- 2-6. Gate UX refinement (clear summaries at each gate)
- 2-7. Agent prompt iteration based on benchmark results
- 2-8. Documentation: usage guide, architecture, agent prompts

### Phase 3: Extract Decision (Day 16-17)

> Round 2 Codex: "deprecation은 빼기. 추출 판단만."
> Round 2 Codex: "engine과 auto-layer 모듈 경계 먼저 만들기."

- 3-1. Refactor: separate `engine/` (existing wave/sprint/gate) from `auto/` (DCPEA layer)
  - This makes future extraction trivial without touching engine code
- 3-2. Evaluate: does `--mode=auto` belong in orchestrate-standalone?
  - If coupling is manageable → keep as mode
  - If complexity warrants separation → extract to new project with /workflow-guide
- 3-3. Update workflow-guide routing to include auto mode
- 3-4. No deprecation of existing modes (premature — deferred to Future)

### Phase 4: Advanced Features (Future)

- 4-1. Cross-session learning (what decompositions worked well)
- 4-2. Complexity estimation and time prediction
- 4-3. Parallel assessment (multiple tasks assessed simultaneously)
- 4-4. Linear Board integration (auto → push → board reflects progress)
- 4-5. Multi-AI review integration for complex architectural decisions
- 4-6. Rollback strategy: git checkpoint + state undo on Adjust failure (Round 4 Gemini: G7)
- 4-7. Assessment caching: assessment_hash per task to skip re-evaluation (Round 4 Gemini: G8)

## Non-Goals

- Elixir/OTP runtime (stays Node.js/Bash)
- Long-running daemon (session-based only)
- Replacing Claude Code itself (orchestrator IS a Claude Code skill)
- Full Symphony port (we borrow patterns, not implementation)
- Removing human from the loop entirely (gates are mandatory)
- Premature repo extraction before validation (Phase 3 decides)

## Risks and Mitigations

| Risk | Probability | Mitigation |
|------|-------------|------------|
| Decomposition quality varies by task type | High | PM prompt iteration + mandatory human gate after decompose |
| Assessment drift (criteria change each loop) | **High** | Contract locked in Define stage, assessed against it |
| Infinite adjust loops | Medium | Budget guardrails: max 5 iterations, max 10 dynamic tasks |
| Skill invocation context loss | Medium | Context envelope protocol with global/local separation |
| Existing orchestrate-standalone breakage | Medium | Auto mode is additive — existing modes unchanged |
| Agent prompt quality | High | Phase 2 dedicated to prompt iteration on benchmarks |
| Assessment false positives | High | Automated checks → QA Agent → Human gate (3-layer) |
| Scope creep during implementation | Medium | MVP strictly Phase 0-1 only |

## Success Criteria

1. `--mode=auto` accepts a rough 1-2 sentence goal → produces implementation plan
2. Contract stage locks acceptance criteria before execution begins
3. Decompose generates valid TASKS.md sub-tasks from goal
4. Execute reuses existing wave/sprint engine (no duplication)
5. Assess detects at least 1 quality issue in benchmark scenarios
6. Adjust adds tasks for identified gaps (within budget)
7. Human Review gates pause execution with clear summary
8. Resume from checkpoint without losing progress
9. Existing `--mode=wave` and `--mode=sprint` work unchanged
10. 3 benchmark scenarios pass end-to-end

## Relationship to Linear Board (v5.1)

Linear Board Projection is the **visual layer**:
- Auto orchestrator updates TASKS.md → `/linear-sync push` → board reflects progress
- Human Review gates map to Linear's Human Review workflow state
- Integration deferred to Phase 4 (Linear Board MVP first)

## Review Log

### Round 1 — Codex (council.sh)

| Finding | Resolution |
|---------|-----------|
| Separate repo premature — extend orchestrate-standalone first | Strategy changed: extend first, extract later (Phase 3) |
| 17 days unrealistic — existing engine has bugs | Phase 0 added: stabilize existing engine first |
| DPEA needs Define/Constrain stage | DCPEA loop with contract locking |
| Skill invocation under-defined | Skill Invocation Contract added |
| Dynamic state management insufficient | Append-only event log + versioned schema |

### Round 1 — Gemini (council.sh)

| Finding | Resolution |
|---------|-----------|
| Context Protocol missing | Context envelope (global/local/budget) defined |
| Token/Budget management needed | Budget guardrails table + forced gate on exceed |
| Automated verification before QA | 3-layer assess pipeline: auto checks → QA → human |
| Phase 1.5 for protocol definition | Merged into Phase 1 (context in 1-4, contract in 1-1) |

### Round 2 — Codex (council.sh)

| Finding | Resolution |
|---------|-----------|
| Contract needs hash/version for change control | Added contract.hash + contract.version + change gate |
| Concurrency-unsafe JSON state file | Append-only .jsonl event log + derived summary |
| MVP doesn't need 3 separate agents | Single orchestrator + QA reflection only |
| Too many gate types for MVP | Reduced to 4 MVP gates |
| Dynamic task ID policy missing | Parent ID + sequence (AUTH-03.1) + TASKS.md write rules |
| State schema path inconsistency | Phase 0-5: unify state schema |
| Worker receives taskId only, no context | Phase 0-3: fix worker context passing |
| Phase 3 deprecation premature | Removed — extract decision only, no deprecation |
| Need engine/auto-layer module boundary | Phase 3-1: refactor into engine/ and auto/ |
| verify_cmd needed in contract | Added to contract schema |

### Round 2 — Gemini (council.sh)

| Finding | Resolution |
|---------|-----------|
| scheduler.js bug confirmed (successors vs predecessors) | Phase 0-1: explicit fix target |
| state.js bug confirmed (in_progress vs inProgress) | Phase 0-2: explicit fix target |
| TASKS.md sync protocol for human edits during execution | Added: hash-based detection + scope gate |
| Context sliding window for 30+ tasks | Added: current wave + dependencies only |

### Round 3 Final — Codex (council.sh)

| Finding | Resolution |
|---------|-----------|
| Scope gate MVP conflict (TASKS.md sync vs Post-MVP) | Unified: human edits → failure gate (MVP) |
| engine/auto boundary too late at Phase 3 | Moved to Phase 0-7: minimal adapter boundary |
| Phase 0 exit criteria missing | Added explicit exit criteria checklist |
| Conditional Go: Phase 0 must complete before auto | Acknowledged — Phase 0 is blocking gate |

### Round 3 Final — Gemini (council.sh)

| Finding | Resolution |
|---------|-----------|
| Contract must be measurable and verifiable | Acknowledged — prompt tuning in Phase 1-1 |
| Phase 2 should include intentional failure tests | Acknowledged — benchmark scenarios include failure paths |
| Full Go approved | v3.1 Go |

### Round 4 — Codex (council.sh, code inspection)

| Finding | Resolution |
|---------|-----------|
| TASKS.md parser regex captures only last metadata line | Phase 0-10: fix regex to capture all metadata |
| Dynamic ID `AUTH-03.1` already compatible with current regex | Confirmed — no change needed |
| executeLayer Promise pool fix verified (indexOf pattern) | Confirmed — Round 3 fix applied |
| state.js/scheduler.js/worker.js bugs still present | Phase 0-1~0-3: confirmed still blocking |

### Round 4 — Gemini (council.sh)

| Finding | Resolution |
|---------|-----------|
| Agent output JSON schema undefined — parsing failure risk | Phase 1-1/1-2: JSON schema enforced for agent outputs |
| Vague Goal deadlock — Define infinite retry | Phase 1-1: max 3 retries before human escalation |
| Decompose syntax validation missing | Phase 1-2: TASKS.md linter/validator added |
| TASKS.md change granularity too coarse | Structural vs non-structural change separation |
| verify_cmd should be required in contract | Phase 1-1: verify_cmd mandatory |
| Token budget guardrail missing | Budget table: max token budget added |
| Rollback strategy absent | Phase 4-6: post-MVP (git checkpoint + state undo) |
| Assessment idempotency — re-eval waste | Phase 4-7: post-MVP (assessment_hash caching) |
| Circular dependency detection not explicit | Phase 0-11: cycle detection in scheduler.js |
| **Verdict: Go (Conditional)** | v3.2 — all findings incorporated |

### Round 5 — Codex (council.sh, No-Go → fixes applied)

| Finding | Resolution |
|---------|-----------|
| Authority model conflict: TASKS.md "human priority" vs events "authoritative" | Unified: human edits → promoted to event, event log always authoritative |
| Assess pipeline separate from contract verify_cmd | Assess now runs contract.verify_cmd as single source; extra checks declared in contract |
| contract.hash missing quality_bar | Hash scope expanded: acceptance_criteria + constraints + quality_bar + verify_cmd + extra_checks |
| Structural/non-structural TASKS.md diff needs AST classifier | Phase 1-2: structural diff classifier added |
| Token budget has no enforcement mechanism | Token accounting defined: best-effort logging to events, cutoff triggers gate |
| Phase 0 ordering: tests before bug fixes | Reordered: 0-7/0-8 (fixes) before 0-10/0-11 (tests/verification) |
| Phase 2 missing intentional failure scenarios | 5 explicit failure scenarios added (2-4a through 2-4e) |

### Round 5 — Gemini (council.sh, Full Go)

| Finding | Resolution |
|---------|-----------|
| Round 4 feedback meticulously incorporated | Confirmed |
| Phase 0 blocking bugs verified in actual code | scheduler.js, state.js, parser regex confirmed |
| Context windowing: preserve key_outputs of dependencies | Acknowledged — already in design |
| Worker SIGTERM handling needs Phase 2 testing | Covered by scenario 2-4c/2-4e |
| **Verdict: Full Go** | v3.3 Go |

### Round 6 — Codex (council.sh, No-Go → 3 blockers fixed)

| Finding | Resolution |
|---------|-----------|
| auto-state.json still contains `events[]` contradicting summary-only design | Removed events from example; added event examples as jsonl comments |
| Change gate undefined — contract changes have no gate routing | Contract gate expanded: re-entry on contract change request |
| Phase 1-1/1-5 missing `extra_checks[]` — Assess pipeline inconsistency | 1-1: extra_checks[] in output schema; 1-5: verify_cmd + extra_checks only |
| DCPEA diagram PASS → Human Gate ambiguity (per task vs checkpoint) | Acknowledged — diagram is checkpoint-level, not per-task |
| Review Log Phase numbers stale after reordering | Acknowledged — log entries reference original context, not current numbering |
| auto-state.json budget missing token fields | Added estimated_tokens_used + max_estimated_tokens to budget schema |
| Contract gate review scope too narrow | Expanded: full contract including quality_bar, verify_cmd, extra_checks, budget |

### Round 6 — Gemini (council.sh, Full Go)

| Finding | Resolution |
|---------|-----------|
| All Round 5 feedback meticulously incorporated | Confirmed |
| Authority model, Assess pipeline, contract hash all consistent | Confirmed |
| Phase 0 → Phase 2 roadmap immediately actionable | Confirmed |
| **Verdict: Full Go** | v3.4 Go |

### Round 7 — Codex (council.sh, No-Go → 3 minor fixes applied)

| Finding | Resolution |
|---------|-----------|
| Budget ownership ambiguous — in Contract gate scope but not in hash | Budget is runtime policy, not contract; removed from Contract gate scope |
| Phase 2-4d stale "change gate" reference | Replaced with "Contract gate re-entry" |
| Human gate trigger ambiguous (per task vs checkpoint) | Explicit policy added: gates fire at defined checkpoints only |

### Round 7 — Gemini (council.sh, Full Go)

| Finding | Resolution |
|---------|-----------|
| All Round 6 blockers fully resolved | Confirmed |
| Document ready for implementation handoff | Confirmed |
| **Verdict: Full Go** | v3.5 Go |

### Round 8 — Codex (council.sh, No-Go → 4 High fixes applied)

| Finding | Resolution |
|---------|-----------|
| Dynamic ID `AUTH-03.1` incompatible with current parser regex `[A-Z]\d+` | ID policy changed to `T3.1` format; Phase 0-7 parser validates dynamic ID compat |
| task-sync hook writes TASKS.md directly — conflicts with main-loop-only policy | Auto mode disables task-sync via `AUTO_MODE=true` env; all writes through event log |
| auto-state vs orchestrate-state canonical rule missing | Write-through bridge: auto-state canonical, orchestrate-state read-only mirror |
| Assess "per task" vs verify_cmd global command contradiction | Two-tier model: per-task lightweight + per-wave/final full verify_cmd |
| Phase 1-1 "including budget" stale reference | Removed — budget is runtime policy, not contract |

### Round 8 — Gemini (council.sh, Full Go)

| Finding | Resolution |
|---------|-----------|
| No Blocking/High issues found | Confirmed |
| [Low] Single agent stage context switching | Stage header injection in prompts (Phase 1-7) |
| [Low] Token parsing from CLI output fragile | Best-effort with graceful fallback (already in design) |
| **Verdict: Full Go** | v3.6 Go |

### Round 9 — Codex (council.sh, code inspection only — no explicit verdict)

| Finding | Resolution |
|---------|-----------|
| Inspected gate-chain.js, state.js, worker.js, docs-gate.js | No new issues found beyond Round 8 |
| docs-gate does not write TASKS.md directly | Confirmed — non-issue for auto mode policy |

### Round 9 — Gemini (council.sh, Full Go)

| Finding | Resolution |
|---------|-----------|
| All Round 8 fixes verified | Confirmed |
| [Low] Per-task syntax check language-dependent | Flexible fallback at implementation |
| [Low] Token parsing fragile | Best-effort with graceful fallback |
| **Verdict: Full Go** | v3.6 Go |

### Round 10 — Codex (council.sh, No-Go → 1 High fix applied)

| Finding | Resolution |
|---------|-----------|
| Write-through bridge needs full tasks[] array, not just summary | Bridge redefined: full-compatible schema with tasks[].id/status/description |
| Contract change post-approval flow undefined | Added: Decompose/Plan re-execution + completed task re-assessment |
| Review Log stale Phase numbers/ID references | Acknowledged — log entries are historical context, not current spec |
| Related docs (communication-protocol.md) need state file updates | Added to Phase 1-7 scope |

### Round 10 — Gemini (council.sh, Full Go)

| Finding | Resolution |
|---------|-----------|
| No Blocking/High issues | Confirmed |
| [Medium] Token parsing resilience | Best-effort with fallback |
| [Low] Flaky test false positives in Assess | Retry logic at implementation |
| **Verdict: Full Go** | v3.7 Go |

### Round 11 — Codex (council.sh, **Go**)

| Finding | Resolution |
|---------|-----------|
| **Blocking/High: 없음** | First Go from Codex in 11 rounds |
| [Medium] Token budget best-effort accuracy | Implementation quality concern — acknowledged |
| [Low] Review Log stale Phase/ID references | Historical context — acknowledged |
| [Low] Per-task syntax check language fallback | Implementation detail |
| [Low] Flaky test retry/isolation policy | Implementation detail |

### Round 11 — Gemini (council.sh, **Go**)

| Finding | Resolution |
|---------|-----------|
| **Blocking/High: 없음** | Confirmed |
| [Medium] Worker state update mode branching | Adapter delegation at implementation |
| [Medium] verify_cmd execution bottleneck on large projects | Selective test execution Post-MVP |
| **Verdict: Go** | v3.7 Final Go |
