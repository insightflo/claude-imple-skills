# claude-impl-tools

> **Implementation skill pack for Claude Code** — Build software with AI agent teams

[**English**](./README.md) | [**한국어**](./README_ko.md)

A plugin of **26 skills** for Claude Code. Covers the full dev lifecycle: planning, orchestration, quality, security, maintenance, and skill ecosystem intelligence. Skills auto-install project-level hooks and agents on demand.

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
| **Skills** | 26 | Plugin install |
| **Hooks** | up to 17 | On demand (skill runs `install.sh --local`) |
| **Worker Agents** | 4 | On demand (project-level) |
| **Templates** | 11 | On demand (project-level) |

---

## Skills (26)

### Core Workflow

| Skill | What it does |
|-------|--------------|
| `/workflow` | **Meta hub** — analyzes project state, recommends the next skill (rules + experience hybrid) |
| `/agile` | Layered sprints (Skeleton → Muscles → Skin) for 1-30 tasks |
| `/recover` | Resume work after CLI crashes, network drops, or agent errors |
| `/checkpoint` | Two-stage code review at task/PR completion |

### Project Initialization

| Skill | What it does |
|-------|--------------|
| `/si-planning` | SI requirements engineering — Socratic elicitation, domain checklist, auto-generated deliverables (requirements analysis / functional spec / screen spec / traceability matrix), change impact analysis, customer dashboard |
| `/governance-setup` | Set up Agent Teams governance or Mini-PRD |
| `/tasks-init` | Generate TASKS.md from scratch |
| `/tasks-migrate` | Consolidate legacy task files into TASKS.md |

### Quality & Security

| Skill | What it does |
|-------|--------------|
| `/quality-auditor` | Comprehensive audit + verification discipline + quantitative metrics (v3.0) |
| `/security-review` | OWASP Top 10, CVE, secrets detection |
| `/multi-ai-review` | Claude + Gemini + Codex 3-AI consensus engine with domain presets |

### Orchestration

| Skill | What it does |
|-------|--------------|
| `/team-orchestrate` | **Unified engine** — 3 modes: `auto` (Task dispatch), `team` (Agent Teams API), `thin` (ultra-minimal for 50-200 tasks) |
| `/cmux-orchestrate` | cmux-based multi-AI team — Claude/Gemini/Codex in physical parallel |
| `/cmux-ai-run` | cmux pane-split parallel task execution |
| `/cmux-ai-review` | cmux pane-split parallel 3-stage review |
| `/multi-ai-run` | Role-based AI model routing (Codex=code, Gemini=design, Claude=plan) |
| `/whitebox` | Execution control plane — state, health, approvals |
| `/cmux` | cmux terminal multiplexer control |

### Maintenance & Analysis

| Skill | What it does |
|-------|--------------|
| `/maintenance` | ITIL 5-stage production maintenance orchestrator |
| `/impact` | Blast radius and risk analysis before file modification |
| `/deps` | Dependency graph + circular dependency detection |
| `/changelog` | Change history query by domain/date/author |
| `/coverage` | Test coverage analysis and gap identification |
| `/architecture` | Project structure and tech stack visualization |
| `/compress` | Context optimization with self-editing `/prune` (H2O + Context-1 pattern, v2.0) |
| `/statusline` | TASKS.md progress in Claude Code status bar |

### Skill Intelligence

| Skill | What it does |
|-------|--------------|
| `/memento` | **Skill ecosystem engine** — experience logging, smart routing, failure reflection, harness generation, cross-project knowledge via DuckDB |

---

## Memento: Skill Ecosystem Intelligence

`/memento` learns which skills work best for which tasks and improves the ecosystem over time.

| Mode | Purpose |
|------|---------|
| `log` | Record skill execution outcomes (auto via PostToolUse hook) |
| `route <task>` | Experience-weighted skill recommendation |
| `health` | Unified skill dashboard across all projects |
| `reflect <skill>` | Analyze failure patterns, suggest SKILL.md fixes |
| `harness <skill>` | Generate validation scripts from failure patterns (AutoHarness-inspired) |
| `global search` | Cross-project knowledge search via DuckDB |
| `global recall` | Topic-specific cross-project learning retrieval |

### Prerequisites for Memento

Memento's SKILL.md is included in the plugin. The execution infrastructure requires one-time global setup:

```bash
# 1. Install DuckDB
pip install duckdb

# 2. Initialize the global experience store
python3 -c "
import duckdb
db = duckdb.connect('$HOME/.claude/memento/experience.duckdb')
# Tables are auto-created on first use
db.close()
"

# 3. Add experience logging hook to ~/.claude/settings.json
# (See Harness Infrastructure below)
```

---

## Orchestration Modes

`/team-orchestrate` auto-selects the right mode based on task count:

| Task count | Mode | How it works |
|-----------|------|--------------|
| 1-50 | `--mode=auto` | Direct Task dispatch, worktree-based phases |
| 10-80 | `--mode=team` | Agent Teams API, 3-level hierarchy |
| 50-200 | `--mode=thin` | Ultra-minimal context (76% token reduction) |

```bash
# Examples
/team-orchestrate                    # auto-selects mode
/team-orchestrate --mode=thin        # force thin mode
/auto-orchestrate                    # alias for --mode=auto
```

---

## Agent Teams

Uses Claude Code native **Agent Teams** with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

```
Your Claude session (= team lead)
├── architecture-lead
│     ├── backend-builder
│     └── reviewer
├── design-lead
│     ├── frontend-builder
│     └── designer
└── qa-lead
```

### Enabling Agent Teams

```bash
bash plugin/project-team/install.sh --local --mode=team
```

Or let `/team-orchestrate` auto-install when needed.

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

## Harness Infrastructure (Global)

The plugin works out of the box, but full harness engineering features require global setup in `~/.claude/`:

### Invariant Hooks (PreToolUse)

Enforce rules with code, not just instructions. Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/memento/invariants/cross-domain-guard.sh", "timeout": 3 },
          { "type": "command", "command": "bash ~/.claude/memento/invariants/sensitive-file-guard.sh", "timeout": 2 }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/memento/invariants/test-before-commit.sh", "timeout": 3 }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/memento/log_skill.sh", "timeout": 5 }
        ]
      }
    ]
  }
}
```

### Global files

| File | Purpose |
|------|---------|
| `~/.claude/memento/experience.duckdb` | Unified experience store (DuckDB) |
| `~/.claude/memento/query.py` | CLI: `search`, `health`, `recall`, `sync`, `sql` |
| `~/.claude/memento/log_skill.sh` | PostToolUse hook — auto-log skill executions |
| `~/.claude/memento/update_outcome.py` | Update experience outcome with failure taxonomy |
| `~/.claude/memento/invariants/*.sh` | PreToolUse invariant enforcement scripts |

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
  │   ├─ Medium (30-50) ──────── /team-orchestrate --mode=auto
  │   ├─ Large (50-200) ──────── /team-orchestrate --mode=thin
  │   └─ With cmux ────────────── /cmux-orchestrate
  │
  ├─ Maintain
  │   ├─ Before editing ──────── /impact
  │   ├─ Bug fix ──────────────── /maintenance
  │   ├─ Check dependencies ──── /deps
  │   └─ Review changes ──────── /changelog
  │
  ├─ Quality
  │   ├─ Test coverage ───────── /coverage
  │   ├─ Security scan ───────── /security-review
  │   ├─ Pre-deploy audit ────── /quality-auditor
  │   └─ Context cleanup ─────── /compress (or /prune)
  │
  ├─ Skill ecosystem
  │   ├─ Skill performance ──── /memento health
  │   ├─ Cross-project recall ── /memento global recall
  │   └─ Improve a skill ─────── /memento reflect <skill>
  │
  └─ If interrupted ───────────── /recover
```

---

## Repository Structure

```
claude-impl-tools/
├── .claude-plugin/
│   └── marketplace.json           # Marketplace manifest
├── plugin/
│   ├── .claude-plugin/
│   │   └── plugin.json            # Plugin manifest (version, metadata)
│   ├── skills/                    # 26 skills (auto-discovered)
│   │   ├── memento/               # Skill ecosystem intelligence
│   │   ├── team-orchestrate/      # Unified orchestration (3 modes)
│   │   ├── quality-auditor/       # Comprehensive audit (v3.0)
│   │   ├── context-optimize/      # H2O + self-editing (v2.0)
│   │   └── ...
│   └── project-team/              # On-demand project setup
│       ├── install.sh             # Local installer
│       ├── agents/                # Worker agents
│       ├── hooks/                 # Validation & governance hooks
│       └── templates/             # Protocols, ADR, contracts
└── scripts/
    └── quick-install.sh           # Alternative install (clone + symlink)
```

---

## Requirements

| Component | Requirement |
|-----------|-------------|
| All skills | Claude Code CLI |
| `/memento` global features | Python 3.10+, `pip install duckdb` |
| `/multi-ai-review`, `/cmux-ai-*` | `gemini` CLI, `codex` CLI (optional) |
| `/cmux-*` skills | [cmux](https://github.com/nicholasgasior/cmux) terminal multiplexer |
| Project Team hooks | Node.js 18+ |
| Agent Teams | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |
| Invariant hooks | Global `~/.claude/memento/invariants/*.sh` setup |

---

## Version History

| Version | Changes |
|---------|---------|
| **4.5.0** | context-optimize v2.0 (self-editing /prune), hybrid recall |
| **4.4.0** | Unified DuckDB experience store, memento global mode |
| **4.3.1** | memento harness mode (AutoHarness-inspired validation) |
| **4.3.0** | memento skill, team-orchestrate 3-mode unification, quality-auditor v3.0 |
| **4.2.0** | cmux live-mode: paste-buffer + callback scripts |
| **3.5.x** | cmux skills, auto-revision quality improvements |
| **3.4.0** | Agent Teams API migration |

---

## License

MIT License - Copyright (c) 2026 Insightflo Team

---

**[English](./README.md) | [한국어](./README_ko.md)**
