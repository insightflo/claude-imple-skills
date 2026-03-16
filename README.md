# claude-impl-tools

> **Implementation skill pack for Claude Code** — Build software with AI agent teams

[**English**](./README.md) | [**한국어**](./README_ko.md)

A standalone-first collection of **skills** and **agent teams** that help you build software with Claude Code. No external dependencies required.

---

## Quick Start

### Option 1: Interactive Install (Recommended)

```bash
git clone https://github.com/insightflo/claude-impl-tools.git
cd claude-impl-tools
./install.sh
```

TUI-based installer lets you select:
- Install scope (global / project)
- Skill categories (Core, Orchestration, Quality, Analysis, Tasks)
- Project Team (agents + hooks)
- Multi-AI routing (Claude + Gemini + Codex)

### Option 2: Non-Interactive Install

```bash
./install.sh --global      # Global install (Core + Project Team)
./install.sh --all         # All skills globally
./install.sh --local       # Current project only
```

### Option 3: Remote Install (No git clone)

```bash
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-impl-tools/main/scripts/quick-install.sh | bash
```

---

## What You Get

| Component | Count | Purpose |
|-----------|-------|---------|
| **Skills** | 20 | Task execution, analysis, automation |
| **Agent Teams Leads** | 4 | team-lead, architecture-lead, qa-lead, design-lead |
| **Core Worker Agents** | 4 | builder, reviewer, designer, maintenance-analyst |
| **Hooks** | 20 | Auto-validation, gates, sync, governance |
| **Templates** | 11 | Project Team protocols, ADR, contracts, standards |

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
| `/governance-setup` | Set up agent team structure before starting |
| `/tasks-init` | Generate TASKS.md from scratch (standalone) |
| `/tasks-migrate` | Migrate existing task files to new format |

### Quality & Security

| Skill | What it does |
|-------|--------------|
| `/quality-auditor` | Pre-deployment comprehensive audit |
| `/security-review` | OWASP TOP 10, CVE, secrets detection |
| `/multi-ai-review` | Universal consensus engine (Claude + Gemini CLI + Codex CLI) — auto-routes code review, market regime, investment thesis, risk assessment via 3-Stage Pipeline |

### Automation

| Skill | What it does |
|-------|--------------|
| `/team-orchestrate` | Native Agent Teams orchestration with Plan Approval, mailbox communication, and full hook coverage |
| `/multi-ai-run` | Parallel AI execution management with automatic CLI routing defaults (Claude/Gemini/Codex) |
| `/whitebox` | Open the visible execution dashboard, inspect health/state, and handle intervention-aware control-plane decisions |

### Maintenance

| Skill | What it does |
|-------|--------------|
| `/impact` | Analyze change impact before editing |
| `/deps` | Visualize dependencies + detect cycles |
| `/changelog` | Query change history by domain |
| `/coverage` | Visualize test coverage gaps |
| `/architecture` | Map project structure & domains |
| `/compress` | Long Context optimization (H2O pattern) |
| `/statusline` | Display TASKS.md progress in Claude Code status bar |
| `/task-board` | Whitebox fallback surface for Kanban/task intervention rendering when browser surfacing is unavailable |

---

## Agent Teams

The orchestration model uses Claude Code native **Agent Teams** for hierarchical coordination with full hook coverage:

```
team-lead (PM 리더)
├── architecture-lead (Teammate) → Task(builder) / Task(reviewer)
├── qa-lead (Teammate)           → Task(reviewer) / Task(test-specialist)
└── design-lead (Teammate)       → Task(designer) / Task(builder)

Communication: Lead ↔ Teammates = mailbox (bidirectional)
Delegation:    Teammate → Subagents = Task tool (unidirectional)
Governance:    TeammateIdle hook + TaskCompleted hook
```

### Agent Teams Leads (`.claude/agents/`)

| Agent | Responsibility |
|-------|----------------|
| **team-lead** | Plan Approval, team formation, conflict mediation |
| **architecture-lead** | Architecture, API design, VETO authority |
| **qa-lead** | Quality gates, test strategy, VETO authority |
| **design-lead** | Design system, visual consistency, VETO authority |

### Core Worker Agents (`project-team/agents/`)

| Agent | Responsibility |
|-------|----------------|
| **Builder** | Implementation execution |
| **Reviewer** | Code review & QA |
| **Designer** | Design specialist |
| **Maintenance Analyst** | Production impact analysis |

### Hooks (20)

Automatic validations that run before/after file edits:

| Category | Hooks |
|----------|-------|
| **Permission** | `permission-checker`, `domain-boundary-enforcer` |
| **Safety** | `pre-edit-impact-check`, `risk-area-warning`, `security-scan` |
| **Quality** | `standards-validator`, `design-validator`, `interface-validator`, `quality-gate` |
| **Gates** | `policy-gate`, `contract-gate`, `risk-gate`, `docs-gate` |
| **Sync** | `architecture-updater`, `changelog-recorder`, `cross-domain-notifier`, `task-sync`, `task-board-sync` |
| **Agent Teams** | `teammate-idle-gate`, `task-completed-gate` |

### Deployment Modes

| Mode | When to use | Components |
|------|-------------|------------|
| **Lite** | MVP, startups | 3 agents, 2 hooks |
| **Standard** | Most projects | 4 agents, 7 hooks |
| **Full** | Regulated industries | All agents, all hooks |
| **Team** | Agent Teams orchestration | 4 leads + workers, governance hooks |

See `project-team/docs/MODES.md` for details.

### Enabling Agent Teams

Agent Teams requires the experimental feature flag. Install with `--mode=team` to auto-configure:

```bash
cd project-team
./install.sh --local --mode=team
```

This adds to your `.claude/settings.json`:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "hooks": {
    "TeammateIdle": [...],
    "TaskCompleted": [...]
  }
}
```

Or manually add the env flag to `.claude/settings.json` or `.claude/settings.local.json`:
```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
}
```

Agent definitions (`.claude/agents/team-lead.md`, `architecture-lead.md`, `qa-lead.md`, `design-lead.md`) are included in the repository and activated automatically when the flag is set.

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

### Do you need an agent team?

| Task count | Recommended | Code written by | Agent team |
|------------|-------------|-----------------|------------|
| ≤ 30 | `/agile auto` | Claude directly | No |
| 30+ | `/team-orchestrate` | Agent Teams with Plan Approval | Yes |

---

## Repository Structure

```
claude-impl-tools/
├── skills/                    # 20 skills
│   ├── workflow-guide/        # Meta hub
│   ├── governance-setup/      # Phase 0 setup
│   ├── agile/                 # Layered sprints
│   ├── recover/               # Resume after interruption
│   ├── quality-auditor/       # Pre-deploy audit
│   ├── multi-ai-review/       # Universal consensus engine
│   ├── security-review/       # Security scanning
│   ├── multi-ai-run/          # Parallel execution
│   ├── team-orchestrate/      # Agent Teams orchestration
│   ├── checkpoint/            # Progress management
│   ├── tasks-init/            # Task generation
│   ├── tasks-migrate/         # Task migration
│   ├── impact/                # Impact analysis
│   ├── deps/                  # Dependency graph
│   ├── changelog/             # Change history
│   ├── coverage/              # Test coverage
│   ├── architecture/          # Architecture map
│   ├── whitebox/              # Execution state inspection
│   ├── statusline/            # TASKS.md progress in status bar
│   └── task-board/            # Kanban visualization
│
├── project-team/              # Agent team system
│   ├── install.sh             # Installation script
│   ├── agents/                # Core worker agents
│   ├── hooks/                 # 20 validation and governance hooks
│   ├── scripts/               # Collaboration & conflict resolution
│   ├── references/            # Communication protocols
│   ├── templates/             # Protocols, ADR, contracts
│   ├── examples/              # Sample projects
│   └── docs/                  # Detailed guides
│
├── .claude/agents/            # Agent Teams leads (team-lead, architecture-lead, qa-lead, design-lead)
│
├── scripts/                   # Installers
│   ├── install-unix.sh
│   └── install-windows.ps1
│
└── README.md
```

---

## Installation

### Step 1: Install Skills

**macOS / Linux**
```bash
chmod +x ./scripts/install-unix.sh && ./scripts/install-unix.sh
```

**Windows (PowerShell)**
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
```

### Step 2: Install Project Team (Optional)

For large projects or team collaboration:

```bash
cd project-team
./install.sh --global    # Use everywhere
./install.sh --local     # Project-specific
```

Choose a mode:
```bash
./install.sh --mode=lite      # 3 agents, 2 hooks
./install.sh --mode=standard  # 4 agents, 7 hooks (default)
./install.sh --mode=full      # All agents, all hooks
./install.sh --mode=team      # Agent Teams + governance hooks
```

---

## Requirements

### For Skills

| Skill | Requirements |
|-------|--------------|
| All skills | Claude Code CLI |
| `/multi-ai-review` | `gemini` CLI, `codex` CLI (optional) — 5 domain presets (code-review, market-regime, investment, risk-assessment, default) |
| `/agile`, `/audit` | `playwright` MCP (optional, for browser tests) |

### For Project Team Hooks

- Node.js 18+ (for hook execution)
- Git (for worktree & changelog features)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| **v4.0.0** | 2026-03-16 | Agent Teams hierarchy (team-lead + 3 domain leads), native Agent Teams orchestration, TeammateIdle/TaskCompleted hooks, orchestrate-standalone removed |
| v3.8.0 | 2026-03-05 | Task Board skill (`/task-board`), Kanban visualization, task-board-sync hook |
| v3.7.0 | 2026-03-05 | Agile Sprint Mode, multi-ai-review zombie fix, REQ/DEC protocol |
| v3.6.0 | 2026-03-03 | Hybrid Wave Architecture for 80-200 tasks |
| v3.5.0 | 2026-03-03 | Context Optimize skill (`/compress`) |
| v3.3.0 | 2026-03-03 | Standalone-first architecture |
| v3.0.0 | 2026-02-08 | Project Team system introduced |
| v2.0.0 | 2026-01-27 | MCP dependency removed |

---

## Long Context Optimization

This project implements advanced techniques to minimize hallucination and information loss as context size grows:

### Applied Techniques

| Technique | Purpose | Implementation |
|-----------|---------|----------------|
| **H2O (Heavy-Hitter Oracle)** | Preserve critical info at the top | SKILL.md frontmatter, agent prompt headers |
| **Compressive Context** | Summarize older/less important content | Agent Compressed Context sections |
| **RAG Hybrid** | Retrieve → Prioritize → Compress → Synthesize | `project-team/services/contextOptimizer.js` |

---

## License

MIT License - Copyright (c) 2026 Insightflo Team

---

**[English](./README.md) | [한국어](./README_ko.md)**
