# AGENTS.md

Instructions for AI agents working in this repository.

## Scope

- This file is for agent behavior inside the repo.
- Product overview, installation, feature lists, and marketing copy belong in `README.md` and `README_ko.md`.
- Do not duplicate large sections of README here.

## Repository Purpose

- This repository packages reusable implementation skills and an optional `project-team` coordination system for Claude Code.
- Treat it as a tooling and workflow repository, not as a single application service.
- Preserve the standalone-first design: optional enhancements are acceptable, but the base workflow should not depend on external MCP services.

## Agent Architecture

### Agent Teams Hierarchy (Primary)

The primary orchestration model uses Claude Code native Agent Teams:

```
team-lead (PM 리더)
├── architecture-lead → Task(builder) / Task(reviewer)
├── qa-lead           → Task(reviewer) / Task(test-specialist)
└── design-lead       → Task(designer) / Task(builder)
```

- Agent definitions: `.claude/agents/team-lead.md`, `architecture-lead.md`, `qa-lead.md`, `design-lead.md`
- Communication: mailbox (bidirectional between lead and teammates)
- Delegation: Task tool (teammates → subagents)
- Governance: `TeammateIdle` + `TaskCompleted` hooks in `.claude/settings.local.json`
- Multi-AI: Optional CLI routing — subagents can invoke `gemini`/`codex` CLI for subtasks (configured via `team-topology.json`)

### Core Worker Agents (Task Targets)

These are spawned by team leads via `Task()`:

| Agent | Role |
|-------|------|
| `builder` | Implementation execution |
| `reviewer` | Code review & QA |
| `designer` | Design specialist |
| `maintenance-analyst` | Production impact analysis |

Definitions: `project-team/agents/`

## Source of Truth

- Prefer `README.md` and `README_ko.md` for user-facing behavior and installation guidance.
- Prefer the relevant `skills/*/SKILL.md` file for skill-specific behavior.
- Prefer files under `project-team/` for agent-team, hook, and orchestration behavior.
- If documents disagree, verify against the current filesystem and executable scripts before restating counts, commands, or capabilities.

## Working Rules

- Keep `AGENTS.md` short, operational, and agent-focused.
- Avoid hardcoding counts of skills, agents, hooks, or templates here. Those values change and go stale quickly.
- When changing behavior, update the closest source:
  - skill behavior: matching `skills/*/SKILL.md`
  - user workflow or installation: `README.md` and `README_ko.md`
  - project-team behavior: `project-team/README.md`, hooks, scripts, or templates
- Do not present aspirational features as implemented unless backed by code or docs updated in the same change.
- Keep Korean and English user-facing docs aligned when behavior changes materially.

## Task And Planning Conventions

- If task tracking is needed, prefer a root `TASKS.md` as the canonical task file.
- If `TASKS.md` is absent, do not create it unless the user asks or the workflow explicitly requires it.
- Use layer-based terminology only where it is already part of the relevant skill or workflow.

## Validation Expectations

- For code changes, run the smallest meaningful verification available.
- For hook or orchestration changes, prefer targeted tests under `project-team/hooks/__tests__/` and related test directories.
- For documentation-only changes, verify consistency against current files and commands.
- If you could not run validation, say so explicitly.

## Editing Guidance

- Minimize unrelated churn.
- Preserve existing file structure unless the task requires restructuring.
- Do not turn this file back into a README clone.
