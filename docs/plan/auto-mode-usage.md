# Auto Mode Usage

This guide covers the current `orchestrate-standalone` auto loop implemented in `skills/orchestrate-standalone/scripts/auto-orchestrator.js` and the shell wrapper in `skills/orchestrate-standalone/scripts/orchestrate.sh`.

## Quick Start

If you are in a directory that contains the wrapper script:

```bash
./orchestrate.sh --mode=auto --goal="Build X"
```

From this repository root, the equivalent command is:

```bash
./skills/orchestrate-standalone/scripts/orchestrate.sh --mode=auto --goal="Build X"
```

What happens next:

1. Define: generate a contract from the goal.
2. Decompose: generate `TASKS.md`.
3. Plan: parse tasks, build the DAG, create execution layers.
4. Execute: run layer-by-layer task execution.
5. Assess: run `verify_cmd` and extra checks, then inspect task completion.
6. Adjust: append follow-up work if gaps remain and budget allows another loop.

State is persisted under `.claude/` so the session can resume after interruption:

- `.claude/orchestrate/auto-state.json`
- `.claude/orchestrate/auto-events.jsonl`
- `.claude/orchestrate-state.json`

## Resume

To continue an interrupted auto run:

```bash
./orchestrate.sh --mode=auto --resume
```

Repository path form:

```bash
./skills/orchestrate-standalone/scripts/orchestrate.sh --mode=auto --resume
```

Resume behavior:

- `auto-state.json` is loaded from `.claude/orchestrate/auto-state.json`.
- The goal is reused from the saved contract.
- If `TASKS.md` is missing or empty, Decompose runs again before the loop continues.

## CLI Options

There are currently two entry surfaces:

1. `orchestrate.sh` wrapper
2. `auto-orchestrator.js` Node entrypoint

The wrapper supports the most common auto-mode controls:

| Option | Default | Notes |
|--------|---------|-------|
| `--mode=auto` | `standard` | Enables the DCPEA loop. |
| `--goal="..."` | none | Required unless `--resume` is used. |
| `--resume` | `false` | Resumes the latest saved auto session. |

The Node entrypoint exposes the advanced runtime flags used by the auto loop:

```bash
node ./skills/orchestrate-standalone/scripts/auto-orchestrator.js \
  --max-iterations=12 \
  --max-dynamic-tasks=25 \
  --worker-count=4 \
  --max-consecutive-failures=2 \
  --claude-path=claude \
  "Build X"
```

| Option | Default | Where it applies | Notes |
|--------|---------|------------------|-------|
| `--resume` | `false` | wrapper + Node | Resume from saved auto state. |
| `--max-iterations=N` | `10` | Node entrypoint | Caps DCPEA loop count. |
| `--max-dynamic-tasks=N` | `20` | Node entrypoint | Caps appended `AUTO-N` tasks. |
| `--worker-count=N` | `2` | Node entrypoint | Parallel workers used by Execute. |
| `--max-consecutive-failures=N` | `2` | Node entrypoint | Escalates to Failure Gate when exceeded. |
| `--claude-path=PATH` | `claude` | Node entrypoint | Override Claude CLI executable. |

Current limitation:

- `orchestrate.sh` does not yet forward `--max-iterations`, `--max-dynamic-tasks`, `--worker-count`, `--max-consecutive-failures`, or `--claude-path` to `auto-orchestrator.js`.
- Use the Node entrypoint directly when you need those controls today.

## Human Gates

MVP auto mode uses four human review gates:

| Gate | Trigger | Human action |
|------|---------|--------------|
| Contract Gate | After Define | Approve, reject, or modify the generated contract. |
| Decompose Gate | After `TASKS.md` generation | Approve, reject, or modify the task breakdown. |
| Failure Gate | Budget exceeded or repeated failures | Abort, grant one more loop, or grant one more loop with guidance. |
| Final Gate | Assess reports `PASS` | Approve the finished result or send it back for one more loop. |

Gate semantics:

- `approve`: continue immediately.
- `modify`: keep the stage, regenerate with human feedback.
- `reject`: discard the current result and retry or abort depending on the stage.

## Budget System

Auto mode persists budget state inside `.claude/orchestrate/auto-state.json`.

Implemented budget fields:

| Field | Meaning |
|-------|---------|
| `budget.max_iterations` | Maximum number of Adjust loops allowed before escalation. |
| `budget.current_iteration` | Current loop counter. |
| `budget.max_dynamic_tasks` | Maximum number of appended `AUTO-N` tasks allowed before escalation. |
| `budget.dynamic_tasks_added` | Number of dynamic tasks added so far. |
| `budget.max_estimated_tokens` | Reserved token-budget field in state. |
| `budget.estimated_tokens_used` | Reserved token usage accumulator in state. |

Related runtime threshold:

- `maxConsecutiveFailures` is passed as a runtime option to the Node entrypoint and triggers the Failure Gate when the trailing non-pass assessment count reaches the threshold.

Budget behavior:

1. If the loop is within budget, Adjust increments the iteration counter and may append dynamic tasks.
2. If `max_iterations` is hit, the Failure Gate opens.
3. If `max_dynamic_tasks` is hit, the Failure Gate opens.
4. If consecutive failures exceed the configured threshold, the Failure Gate opens.
5. A human can reject and abort, or approve/modify to grant one more loop.

Important distinction:

- Budget is runtime policy, not part of `contract.hash`.
- Contract changes recompute the contract hash.
- Budget changes do not require a Contract Gate reapproval by themselves.

## Example Session

Start a new session:

```bash
./skills/orchestrate-standalone/scripts/orchestrate.sh \
  --mode=auto \
  --goal="Add benchmark tests and auto-mode docs"
```

Typical flow:

1. Contract Gate shows the generated contract JSON.
2. You enter `approve` to accept the goal, checks, and acceptance criteria.
3. Decompose Gate shows the generated `TASKS.md`.
4. You enter `modify` if the task plan is missing a scenario, then provide instructions.
5. Plan builds layers from parsed task dependencies.
6. Execute runs tasks and updates `.claude/orchestrate-state.json`.
7. Assess runs `verify_cmd` and any extra checks from the contract.
8. If checks fail or work remains, Adjust may append `AUTO-N` tasks under `## Auto Adjustments`.
9. If the run exceeds budget, the Failure Gate asks whether to abort or extend the loop.
10. When Assess reports `PASS`, the Final Gate asks for the last human approval.

If the session stops mid-run:

```bash
./skills/orchestrate-standalone/scripts/orchestrate.sh --mode=auto --resume
```

Useful files to inspect during the session:

- `TASKS.md`
- `.claude/orchestrate/auto-state.json`
- `.claude/orchestrate/auto-events.jsonl`
- `.claude/orchestrate-state.json`
