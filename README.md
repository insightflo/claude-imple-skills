# claude-imple-skills

> **Implementation skill pack for Claude Code** — Build software with AI agent teams

[**English**](./README.md) | [**한국어**](./README_ko.md)

A standalone-first collection of **skills** and **agent teams** that help you build software with Claude Code. No external dependencies required.

---

## Quick Start

### Option 1: One-line Install (No git clone required)

```bash
# Download and install automatically
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-imple-skills/main/scripts/quick-install.sh | bash
```

This installs to `~/.claude/claude-imple-skills/` and symlinks skills to `~/.claude/skills/`.

### Option 2: Manual Install

```bash
# Clone repository
git clone https://github.com/insightflo/claude-imple-skills.git
cd claude-imple-skills

# Install (macOS/Linux)
chmod +x ./scripts/install-unix.sh && ./scripts/install-unix.sh

# Install (Windows PowerShell)
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
```

### Optional: Project Team

For large projects, deploy the AI agent team:

```bash
cd claude-imple-skills/project-team
./install.sh --global
```

---

## What You Get

| Component | Count | Purpose |
|-----------|-------|---------|
| **Skills** | 18 | Task execution, analysis, automation |
| **Agents** | 10 | Role-based specialist team |
| **Hooks** | 15 | Auto-validation (security, quality, impact) |
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
| `/orchestrate-standalone` | Execute 50-200 tasks with specialist agents |
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

---

## Project Team

For larger projects, deploy an **AI agent team** with automatic quality gates:

```
project-team/
├── agents/          # 9 specialists
├── hooks/           # 16 auto-validators
├── skills/          # 5 maintenance tools
└── templates/       # protocols & contracts
```

### Agents (10)

| Role | Responsibility |
|------|----------------|
| **Project Manager** | Coordination, task routing |
| **Chief Architect** | Standards, ADR, VETO authority |
| **Chief Designer** | Design system consistency |
| **QA Manager** | Quality gates, testing standards |
| **DBA** | Database schema, migrations |
| **Security Specialist** | Vulnerability scanning |
| **Frontend Specialist** | UI/UX implementation |
| **Backend Specialist** | API, business logic |
| **Maintenance Analyst** | Production impact analysis |

### Hooks (15)

Automatic validations that run before/after file edits:

| Category | Hooks |
|----------|-------|
| **Permission** | `permission-checker` |
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
| 30-50 | `/orchestrate-standalone` | Specialist agents | Optional |
| 50+ | `/orchestrate-standalone` | Specialist agents | Recommended |

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
│   └── architecture/          # Architecture map
│
├── project-team/              # Agent team system
│   ├── install.sh             # Installation script
│   ├── agents/                # 10 agent definitions
│   ├── hooks/                 # 15 auto-validation hooks
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
| **v3.5.0** | 2026-03-03 | Context Optimize skill (`/compress`), install.sh fix, 18 skills, 9 agents, 16 hooks |
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
