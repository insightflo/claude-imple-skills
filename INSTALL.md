# Installation Guide

## Quick Install (One Command)

```bash
git clone https://github.com/insightflo/claude-impl-tools.git
cd claude-impl-tools
./install.sh
```

## Installation Methods

### 1. Interactive TUI (Recommended)

```bash
./install.sh
```

The TUI installer lets you select:
- Install scope (global / project)
- Skill categories
- Project Team (agents + hooks)
- Multi-AI routing configuration

### 2. Non-Interactive

```bash
# Global install (Core skills + Agent Teams leads)
./install.sh --global

# Global + project setup (agents + hooks for current project)
./install.sh --local

# All skills globally + project setup
./install.sh --all
```

### 3. Remote Install (No Git Clone)

```bash
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-impl-tools/main/scripts/quick-install.sh | bash
```

---

## Skill Categories

| Category | Skills | Purpose |
|----------|--------|---------|
| **Core** | multi-ai-run, multi-ai-review, team-orchestrate | Essential orchestration |
| **Orchestration** | agile, governance-setup, workflow-guide | Project management |
| **Quality** | checkpoint, quality-auditor, security-review | Quality verification |
| **Analysis** | architecture, deps, impact, changelog, coverage | Codebase analysis |
| **Maintenance** | maintenance | ITIL 5-stage production maintenance |
| **Tasks** | tasks-init, tasks-migrate, recover, context-optimize | Task management |

---

## Project Team

Project Team includes 4 Agent Teams leads, 4 core workers, and 19 governance hooks.

### Agent Teams Leads (`~/.claude/agents/`, installed globally)
- **team-lead** — PM lead, Plan Approval, conflict mediation
- **architecture-lead** — Architecture, API design, VETO authority
- **qa-lead** — Quality gates, test strategy, VETO authority
- **design-lead** — Design system, visual consistency, VETO authority

### Core Workers (`project-team/agents/`, installed per-project)
- **Builder** — Implementation execution
- **Reviewer** — Code review & QA
- **Designer** — Design specialist
- **MaintenanceAnalyst** — Production impact analysis

### Deployment Modes

| Mode | Components | Use Case |
|------|-----------|----------|
| **team** | Agent Teams leads (global) + workers + governance hooks + `AGENT_TEAMS` env flag | Recommended |
| **standard** | Core workers + recommended hooks | Most projects |
| **lite** | Core workers only (no hooks) | MVP / startups |
| **full** | All agents + all hooks | Regulated industries |

---

## Multi-AI Routing

Automatic model selection by task type:

| Task Type | CLI | Model |
|-----------|-----|-------|
| Code writing / review | Codex | gpt-5.3-codex |
| Design / UI | Gemini | gemini-3.1-pro-preview |
| Planning / coordination | Claude | opus / sonnet |

### CLI Installation

```bash
# Gemini CLI
npm install -g @google/gemini-cli
gemini auth

# Codex CLI
npm install -g @openai/codex
codex auth
```

---

## Requirements

- **Claude Code CLI**: https://claude.ai/code
- **Node.js 18+**: For hook execution (optional)
- **gum**: For TUI (auto-installed)

---

## Directory Structure

After installation:

```
~/.claude/                    # Global install
├── skills/                   # Skills (symlinked)
│   ├── multi-ai-run/
│   ├── multi-ai-review/
│   ├── team-orchestrate/
│   ├── maintenance/
│   └── ...
├── agents/                   # Agent Teams leads + workers
│   ├── team-lead.md
│   ├── architecture-lead.md
│   ├── Builder.md
│   └── ...
├── hooks/                    # Governance hooks
│   ├── permission-checker.js
│   └── ...
├── templates/                # Templates
│   ├── project-team.yaml
│   └── model-routing.yaml
└── settings.json             # Hook configuration
```

---

## Update

```bash
cd claude-impl-tools
git pull
./install.sh
```

---

## Uninstall

```bash
# Remove skills
rm -rf ~/.claude/skills/{multi-ai-run,multi-ai-review,team-orchestrate,...}

# Remove Project Team
rm -rf ~/.claude/agents ~/.claude/hooks ~/.claude/templates

# Full removal
rm -rf ~/.claude/skills ~/.claude/agents ~/.claude/hooks ~/.claude/templates
```

---

## Quick Start

```bash
# 1. Launch Claude Code
claude

# 2. Workflow guide
> /workflow

# 3. Start orchestration
> /team-orchestrate

# 4. Production maintenance
> /maintenance

# 5. Multi-AI review
> /multi-ai-review
```

---

**[Korean version](./INSTALL_ko.md)**
