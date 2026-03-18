# claude-impl-tools

> **Implementation skill pack for Claude Code** — Build software with AI agent teams

[**English**](./README.md) | [**한국어**](./README_ko.md)

A plugin of **23 skills** for Claude Code. Skills auto-install project-level hooks and agents on demand — no manual setup required.

---

## Quick Start

### Option 1: Plugin Install (Recommended)

Launch Claude Code, then run:

```
/plugin marketplace add insightflo/claude-impl-tools
/plugin install claude-impl-tools@insightflo
```

### Option 2: Quick Install (No plugin)

```bash
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-impl-tools/main/scripts/quick-install.sh | bash
```

This clones the repo and symlinks skills. No hooks or agents installed — skills handle that on demand.

---

## What You Get

| Component | Count | Installed when |
|-----------|-------|----------------|
| **Skills** | 23 | Plugin install |
| **Hooks** | up to 17 | On demand (skill runs `install.sh --local`) |
| **Worker Agents** | 4 | On demand (project-level) |
| **Templates** | 11 | On demand (project-level) |

---

## Skills

### Core Workflow

| Skill | What it does |
|-------|--------------|
| `/workflow` | **Meta hub** — analyzes your state and recommends the next skill |
| `/agile` | Layered sprints (Skeleton → Muscles → Skin) for 1-30 tasks |
| `/recover` | Resume work after interruptions |
| `/checkpoint` | Save/restore progress at any point |

### Project Initialization

| Skill | What it does |
|-------|--------------|
| `/governance-setup` | Set up governance structure before starting |
| `/tasks-init` | Generate TASKS.md from scratch |
| `/tasks-migrate` | Migrate existing task files to new format |

### Quality & Security

| Skill | What it does |
|-------|--------------|
| `/quality-auditor` | Pre-deployment comprehensive audit |
| `/security-review` | OWASP TOP 10, CVE, secrets detection |
| `/multi-ai-review` | Universal consensus engine (v4.1) — Claude + Gemini CLI + Codex CLI |

### Automation

| Skill | What it does |
|-------|--------------|
| `/team-orchestrate` | Native Agent Teams orchestration with tmux pane auto-creation |
| `/cmux-orchestrate` | cmux-based multi-AI team orchestration — physical 3-level hierarchy with Claude/Gemini/Codex |
| `/multi-ai-run` | Parallel AI execution with automatic CLI routing (Claude/Gemini/Codex) |
| `/whitebox` | Execution dashboard, health/state inspection |
| `/cmux` | cmux terminal multiplexer control (workspaces, panes, browser automation) |

### Maintenance

| Skill | What it does |
|-------|--------------|
| `/maintenance` | ITIL 5-stage production maintenance orchestrator |
| `/impact` | Analyze change impact before editing |
| `/deps` | Visualize dependencies + detect cycles |
| `/changelog` | Query change history by domain |
| `/coverage` | Visualize test coverage gaps |
| `/architecture` | Map project structure & domains |
| `/compress` | Long Context optimization (H2O pattern) |
| `/statusline` | Display TASKS.md progress in Claude Code status bar |

---

## Agent Teams

Uses Claude Code native **Agent Teams** with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and tmux auto-pane creation.

```
Your Claude session (= team lead)
├── architecture-lead    ← tmux pane
│     ├── backend-builder
│     └── reviewer
├── design-lead          ← tmux pane
│     ├── frontend-builder
│     └── designer
└── qa-lead              ← tmux pane
```

### How it works

1. Run `/team-orchestrate` in any project with `TASKS.md`
2. Skill checks prerequisites — if hooks/agents missing, **auto-installs** locally
3. Team spawns in tmux panes (if `teammateMode: "tmux"`)
4. Agents communicate via shared task list and mailbox

### Enabling Agent Teams

Run `install.sh --local --mode=team` from the project root, or let `/team-orchestrate` do it automatically:

```bash
bash project-team/install.sh --local --mode=team
```

This adds to your project's `.claude/settings.json`:
```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" },
  "preferences": { "teammateMode": "tmux" }
}
```

### Project-level hooks (installed on demand)

| Category | Hooks |
|----------|-------|
| **Permission** | `permission-checker`, `domain-boundary-enforcer` |
| **Safety** | `pre-edit-impact-check`, `risk-area-warning`, `security-scan` |
| **Quality** | `standards-validator`, `design-validator`, `interface-validator`, `quality-gate` |
| **Gates** | `policy-gate`, `contract-gate`, `risk-gate`, `docs-gate` |
| **Sync** | `architecture-updater`, `changelog-recorder`, `cross-domain-notifier`, `task-sync` |

### Hook modes

| Mode | Hooks | Use case |
|------|-------|----------|
| **lite** | 4 | MVP, startups |
| **standard** | 7 | Most projects |
| **full** | 17 | Regulated industries |
| **team** | 8 + Agent Teams hooks | Team orchestration |

---

## Recommended Workflow

```
Start
  │
  ├─ "What should I do?" ────────────── /workflow
  │
  ├─ Plan your project
  │   ├─ Large project? ──────── /governance-setup
  │   └─ Generate tasks ───────── /tasks-init
  │
  ├─ Implement (choose by scale)
  │   ├─ Small (≤30 tasks) ───── /agile auto
  │   └─ Medium-Large (30+) ──── /team-orchestrate
  │
  ├─ Maintain
  │   ├─ Before editing ──────── /impact
  │   ├─ Check dependencies ──── /deps
  │   └─ Review changes ──────── /changelog
  │
  ├─ Quality
  │   ├─ Test coverage ───────── /coverage
  │   ├─ Security scan ───────── /security-review
  │   └─ Pre-deploy audit ────── /quality-auditor
  │
  └─ If interrupted ───────────── /recover
```

---

## Repository Structure

```
claude-impl-tools/
├── .claude-plugin/
│   └── plugin.json             # Plugin manifest
├── skills/                     # 21 skills (auto-discovered)
│   ├── team-orchestrate/
│   ├── multi-ai-review/
│   ├── agile/
│   └── ...
├── project-team/               # On-demand project setup
│   ├── install.sh              # Local installer (hooks, agents, templates)
│   ├── agents/                 # Worker agents
│   ├── hooks/                  # Validation & governance hooks
│   ├── templates/              # Protocols, ADR, contracts
│   └── scripts/                # Collaboration scripts
└── scripts/
    └── quick-install.sh        # Alternative install (clone + symlink)
```

---

## Requirements

| Component | Requirement |
|-----------|-------------|
| All skills | Claude Code CLI |
| `/multi-ai-review` | `gemini` CLI, `codex` CLI (optional) |
| Project Team hooks | Node.js 18+ |
| Agent Teams + tmux | tmux, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |

---

## License

MIT License - Copyright (c) 2026 Insightflo Team

---

**[English](./README.md) | [한국어](./README_ko.md)**

