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
- Project Team (10 agents + 15 hooks)
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
| **Skills** | 21 | Task execution, analysis, automation |
| **Agents** | 13 | Canonical roles plus compatibility aliases |
| **Hooks** | 18 | Auto-validation, gates, sync, and helper checks |
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
| `/governance-setup` | Set up PM → Architect → Designer → QA → DBA team before starting |
| `/tasks-init` | Generate TASKS.md from scratch (standalone) |
| `/tasks-migrate` | Migrate existing task files to new format |

### Quality & Security

| Skill | What it does |
|-------|--------------|
| `/quality-auditor` | Pre-deployment comprehensive audit |
| `/security-review` | OWASP TOP 10, CVE, secrets detection |
| `/multi-ai-review` | Consensus review (Claude + Gemini CLI + Codex CLI) |

### Automation

| Skill | What it does |
|-------|--------------|
| `/orchestrate-standalone` | Execute 50-200 tasks with specialist agents (`--mode=sprint` for Agile PI planning + sprint review gates) |
| `/multi-ai-run` | Parallel AI execution management |
| `/whitebox` | Inspect execution state, task summaries, health, and intervention-aware control-plane details |

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
| `/task-board` | Visualize agent tasks and pending interventions as a Kanban board |

---

## Project Team

For larger projects, deploy an **AI agent team** with automatic quality gates:

```
project-team/
├── agents/          # 13 role definitions and aliases
├── hooks/           # 18 validation and helper hooks
├── scripts/         # collaboration & conflict resolution
├── references/      # communication protocols
├── skills/          # 5 maintenance tools
└── templates/       # protocols & contracts
```

### Agents (13)

| Role | Responsibility |
|------|----------------|
| **Lead** | Canonical coordination role |
| **Builder** | Canonical implementation role |
| **Reviewer** | Canonical review role |
| **Designer** | Canonical design specialist |
| **DBA** | Canonical data specialist |
| **Security Specialist** | Canonical security specialist |
| **Project Manager** | Compatibility alias for coordination workflows |
| **Chief Architect** | Compatibility alias for architecture workflows |
| **Chief Designer** | Compatibility alias for design workflows |
| **QA Manager** | Compatibility alias for review and QA workflows |
| **Frontend Specialist** | Compatibility alias for frontend execution |
| **Backend Specialist** | Compatibility alias for backend execution |
| **Maintenance Analyst** | Compatibility alias for production-impact workflows |

### Hooks (18)

Automatic validations that run before/after file edits:

| Category | Hooks |
|----------|-------|
| **Permission** | `permission-checker`, `domain-boundary-enforcer` |
| **Safety** | `pre-edit-impact-check`, `risk-area-warning`, `security-scan` |
| **Quality** | `standards-validator`, `design-validator`, `interface-validator`, `quality-gate` |
| **Gates** | `policy-gate`, `contract-gate`, `risk-gate`, `docs-gate` |
| **Sync** | `architecture-updater`, `changelog-recorder`, `cross-domain-notifier`, `task-sync` |

### Deployment Modes

| Mode | When to use | Components |
|------|-------------|------------|
| **Lite** | MVP, startups | 3 agents, 2 hooks |
| **Standard** | Most projects | 7 agents, 4 gates |
| **Full** | Regulated industries | All agents, all hooks |

See `project-team/docs/MODES.md` for details.

### What changed in the current `main`

- `--mode=wave` now uses the real worker pool path, emits `.claude/wave-plan.json`, and defaults to a 6-worker large-project profile.
- Whitebox board surfacing opens automatically at orchestrate startup in TTY sessions, with `WHITEBOX_AUTO_OPEN_TUI=0` as the opt-out.
- Whitebox approvals now surface typed intervention triggers such as `user_confirmation`, `agent_conflict`, and `risk_acknowledgement` across explain/status/task-board flows.
- Escalated REQ conflicts now surface linked `DEC-*` ruling metadata in whitebox explain, task-board, and the TUI detail pane.
- Writing a `FINAL` DEC for an `ESCALATED` REQ now auto-resolves that request through the canonical hook/event path instead of waiting for a separate manual sync step.
- Layer failures now stop the run cleanly, report failed task IDs, and cancel same-layer sibling work instead of silently continuing.
- Project Team installs now include the hook support libraries required by `policy-gate` and `permission-checker`.

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
  │   ├─ Medium (30-50) ──────── /orchestrate-standalone
  │   └─ Large (50+) ─────────── /orchestrate-standalone
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
| 30-80 | `/orchestrate-standalone` | Specialist agents | Optional |
| 80-200 | `/orchestrate --mode=wave` | Large-project wave profile | Recommended |
| 200+ | Split into sub-projects | Domain-parallel agents | Required |

**Wave mode (current CLI)**: For 80+ tasks, use `--mode=wave` for the large-project execution profile with whitebox board surfacing, typed intervention triggers, linked DEC detail for agent conflicts, and a 6-worker default.

### Tested execution flows

These are the flows validated against the current `main` branch:

| Project size | Recommended flow |
|--------------|------------------|
| Small (<=30 tasks) | `/agile auto` |
| Medium (30-80 tasks) | `/workflow` -> `/governance-setup` -> `project-team/install.sh --mode=standard` -> `/orchestrate-standalone --mode=standard` |
| Large (80+ tasks) | `/workflow` -> `/governance-setup` -> `project-team/install.sh --mode=standard` -> `/orchestrate-standalone --mode=wave` |
| Failure-path verification | Installed `--mode=wave` run with deterministic task failure -> fail-fast + blocked downstream tasks |

---

## Repository Structure

```
claude-impl-tools/
├── skills/                    # 21 skills
│   ├── workflow-guide/        # Meta hub
│   ├── governance-setup/      # Phase 0 setup
│   ├── agile/                 # Layered sprints
│   ├── recover/               # Resume after interruption
│   ├── quality-auditor/       # Pre-deploy audit
│   ├── multi-ai-review/       # Consensus review
│   ├── security-review/       # Security scanning
│   ├── multi-ai-run/          # Parallel execution
│   ├── orchestrate-standalone/# Large-scale orchestration
│   ├── checkpoint/            # Progress management
│   ├── tasks-init/            # Task generation
│   ├── tasks-migrate/         # Task migration
│   ├── impact/                # Impact analysis
│   ├── deps/                  # Dependency graph
│   ├── changelog/             # Change history
│   ├── coverage/              # Test coverage
│   ├── architecture/          # Architecture map
│   ├── whitebox/              # Execution state inspection and summaries
│   └── statusline/            # TASKS.md progress in status bar
│
├── project-team/              # Agent team system
│   ├── install.sh             # Installation script
│   ├── agents/                # 13 role definitions and aliases
│   ├── hooks/                 # 18 validation and helper hooks
│   ├── scripts/               # Collaboration & conflict resolution scripts
│   ├── references/            # Communication protocols & specs
│   ├── skills/                # 5 maintenance skills
│   ├── templates/             # Protocols, ADR, contracts
│   ├── examples/              # Sample projects
│   └── docs/                  # Detailed guides
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
./install.sh --mode=standard  # 7 agents, 4 hooks (default)
./install.sh --mode=full      # All agents, all hooks
```

---

## Requirements

### For Skills

| Skill | Requirements |
|-------|--------------|
| All skills | Claude Code CLI |
| `/multi-ai-review` | `gemini` CLI, `codex` CLI (optional) |
| `/agile`, `/audit` | `playwright` MCP (optional, for browser tests) |

### For Project Team Hooks

- Node.js 18+ (for hook execution)
- Git (for worktree & changelog features)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| **v3.8.0** | 2026-03-05 | Task Board skill (`/task-board`), Kanban visualization, task-board-sync hook, board-state.json infrastructure |
| v3.7.0 | 2026-03-05 | Agile Sprint Mode (`--mode=sprint`), multi-ai-review zombie fix, hierarchical agent collaboration bus (REQ/DEC protocol, domain-boundary-enforcer, Wave Barrier scanner) |
| v3.6.0 | 2026-03-03 | Hybrid Wave Architecture for 80-200 tasks (`/orchestrate --mode=wave`), Contract-First template |
| v3.5.0 | 2026-03-03 | Context Optimize skill (`/compress`), install.sh fix, 18 skills, 9 agents, 16 hooks |
| v3.4.0 | 2026-03-03 | Long Context optimization (H2O, Compressive Context, RAG Hybrid) |
| v3.3.0 | 2026-03-03 | Standalone-first architecture |
| v3.2.0 | 2026-02-21 | Tmux parallel mode, Progressive Disclosure |
| v3.1.0 | 2026-02-11 | Governance setup, workflow continuity |
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

### Context Optimizer Service

```bash
# Extract heavy-hitter insights
node project-team/services/contextOptimizer.js optimize <file>

# Compress long content
node project-team/services/contextOptimizer.js compress <file>

# Build RAG hybrid query
node project-team/services/contextOptimizer.js build "<query>" <files>
```

### MCP Server

```json
{
  "mcpServers": {
    "context-optimizer": {
      "command": "node",
      "args": ["project-team/services/mcp-context-server.js", "serve"]
    }
  }
}
```

Available MCP tools:
- `compress_context` - Compress using H2O pattern
- `extract_heavy_hitters` - Extract key insights
- `build_optimized_prompt` - Build optimized prompt

See `docs/plan/long-context-optimization.md` for details.

---

## License

MIT License - Copyright (c) 2026 Insightflo Team

---

**[English](./README.md) | [한국어](./README_ko.md)**
