# claude-imple-skills

> **Whitebox control plane for Claude Code** — observe, explain, and steer AI coding with file-based artifacts

[**English**](./README.md) | [**한국어**](./README_ko.md)

A standalone-first collection of **skills**, **agent teams**, and **whitebox control-plane surfaces** for AI-assisted software delivery. It keeps execution legible through canonical events, derived status artifacts, and a Ratatui terminal viewer without requiring external services.

---

## Quick Start

### Option 1: Interactive Install (Recommended)

```bash
git clone https://github.com/insightflo/claude-imple-skills.git
cd claude-imple-skills
./install.sh
```

TUI-based installer lets you select:
- Install scope (global / project)
- Skill categories (Core, Orchestration, Quality, Analysis, Tasks)
- Project Team topology by mode (`lite`/`standard`/`full`)
- Multi-AI routing (Claude + Gemini + Codex)

Whitebox MVP policy after install:
- only subscription-backed CLIs are supported for LLM execution: `claude`, `codex`, `gemini`
- `/whitebox status`, `/whitebox explain`, and `/whitebox health` become the first inspection surface
- the terminal viewer uses Ratatui for TTY sessions and falls back to ASCII when redirected

### Option 2: Non-Interactive Install

```bash
./install.sh --global      # Global install (Core + Project Team)
./install.sh --all         # All skills globally
./install.sh --local       # Current project only
```

### Option 3: Remote Install (No git clone)

```bash
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-imple-skills/main/scripts/quick-install.sh | bash
```

---

## What You Get

| Component | Count | Purpose |
|-----------|-------|---------|
| **Skills** | 20 | Task execution, analysis, automation |
| **Agents** | 6 canonical roles | Mode-based topology (core + specialists) |
| **Hooks** | 4/7/17 by mode | Auto-validation from lite to full |
| **Templates** | 7 | Protocols, ADR, contracts |

---

## Skills

### Core Workflow

| Skill | What it does |
|-------|--------------|
| `/workflow` | **Meta hub** — analyzes your state and recommends the next skill |
| `/agile` | Layered sprints (Skeleton → Muscles → Skin) for 1-30 tasks |
| `/recover` | Resume work after interruptions |
| `/checkpoint` | Save/restore progress at any point |
| `/whitebox` | Inspect current run, blockers, CLI health, and derived artifact state |

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

### Maintenance

| Skill | What it does |
|-------|--------------|
| `/impact` | Analyze change impact before editing |
| `/deps` | Visualize dependencies + detect cycles |
| `/changelog` | Query change history by domain |
| `/coverage` | Visualize test coverage gaps |
| `/architecture` | Map project structure & domains |
| `/compress` | Long Context optimization (H2O pattern) |
| `/statusline` | Display TASKS.md progress plus whitebox blocker/run hints in Claude Code status bar |
| `/task-board` | Visualize agent tasks as a Kanban board with a Ratatui whitebox terminal viewer |

---

## Project Team

For larger projects, deploy a **mode-based canonical AI team** with automatic quality gates:

```
project-team/
├── agents/          # Canonical roles + one-release compatibility aliases
├── hooks/           # Mode-scaled validators (lite/standard/full)
├── scripts/         # collaboration & conflict resolution
├── references/      # communication protocols
├── skills/          # 5 maintenance tools
└── templates/       # protocols & contracts
```

### Canonical Roles

| Role | Responsibility |
|------|----------------|
| **Lead** | Coordination, planning, decision ownership |
| **Builder** | Core implementation and delivery |
| **Reviewer** | Quality gates, validation, release readiness |
| **Designer** | Design system consistency |
| **DBA** | Database schema, migrations |
| **Security Specialist** | Vulnerability scanning |

Compatibility aliases such as `ProjectManager`, `ChiefArchitect`, `QAManager`, `FrontendSpecialist`, and `BackendSpecialist` are provided for **one-release compatibility only** and are not the primary topology.

### Hooks (Mode-Scaled, up to 17)

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
| **lite** | MVP, startups | Lead/Builder/Reviewer + baseline hooks |
| **standard** | Most projects | lite + Designer/DBA/Security Specialist + extended hooks |
| **full** | Regulated industries | standard + compatibility profile surfaces + widest hook set |

See `project-team/docs/MODES.md` for details.

---

## Recommended Workflow

```
Start
  │
  ├─ "What should I do?" ────────────── /workflow
  ├─ "Why is it blocked / what's happening?" ── /whitebox status | /whitebox explain | /whitebox health
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

`/whitebox` is the terminal product surface for observation + decision support + control:
- `/whitebox status` (overview + pending approvals)
- `/whitebox explain` (why blocked/paused + evidence-backed options)
- `/whitebox approvals` (list/show/approve/reject via canonical CLI control path)
- `/whitebox health` (CLI/auth + artifact integrity checks)

The whitebox surfaces read file-based artifacts instead of hidden state:
- canonical log: `.claude/collab/events.ndjson`
- canonical operator intents: `.claude/collab/control.ndjson`
- derived board: `.claude/collab/board-state.json`
- derived control state: `.claude/collab/control-state.json`
- derived summary: `.claude/collab/whitebox-summary.json`
- stale markers: `.claude/collab/derived-meta.json`

New-user operator flow:
1. start work with `/orchestrate-standalone`
2. inspect `/whitebox status`
3. review `/whitebox explain`
4. list pending gates with `/whitebox approvals list`
5. approve or reject with `/whitebox approvals approve|reject --gate-id=...`
6. watch the updated state in `/whitebox status` or `/task-board`

### Do you need an agent team?

| Task count | Recommended | Code written by | Agent team |
|------------|-------------|-----------------|------------|
| ≤ 30 | `/agile auto` | Claude directly | No |
| 30-80 | `/orchestrate-standalone` | Specialist agents | Optional |
| 80-200 | `/orchestrate --mode=wave` | Domain-parallel agents | Recommended |
| 200+ | Split into sub-projects | Domain-parallel agents | Required |

**v2.0 Hybrid Wave Architecture**: For 80+ tasks, use `--mode=wave` for Contract-First + Domain Parallelism + Cross-Review gates. This ensures consistency even at scale.

---

## Repository Structure

```
claude-imple-skills/
├── skills/                    # 18 skills
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
│   └── statusline/            # TASKS.md progress in status bar
│
├── project-team/              # Agent team system
│   ├── install.sh             # Installation script
│   ├── agents/                # Canonical roles + one-release compatibility aliases
│   ├── hooks/                 # Mode-scaled hooks (4/7/17)
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
./install.sh --mode=lite      # Lead/Builder/Reviewer + 4 baseline hooks
./install.sh --mode=standard  # lite + specialists + 7 hooks (default)
./install.sh --mode=full      # standard + compatibility profiles + 17 hooks
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
