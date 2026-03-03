# AGENTS.md

This file provides guidance to AI agents (Warp, Claude, Cursor, etc.) when working with code in this repository.

## Project Overview

**claude-imple-skills** — A standalone-first implementation skill pack for Claude Code.

A collection of **14 core skills** and **agent team system** that help you build software with AI. No external dependencies required.

### Core Philosophy
- **Layer-based incremental implementation**: Build projects in three stages - Skeleton (structure), Muscles (functionality), Skin (polish)
- **Human-in-the-loop checkpoints**: Each layer requires user review and approval before proceeding
- **Standalone-first**: All skills work independently without external dependencies
- **Context preservation**: Track work progress through state files and orchestration artifacts
- **MCP-independent**: All skills work without MCP servers (optional enhancements available)

---

## 📊 Standalone Skill Catalog (14 Core Skills)

| Skill | Trigger | Role |
|-------|---------|------|
| **workflow-guide** | `/workflow` | Meta hub - skill routing recommendation |
| **agile** | `/agile`, `/sprint` | Sprint master with layer-based checkpoints |
| **quality-auditor** | `/audit` | Pre-deployment comprehensive audit |
| **governance-setup** | `/governance-setup` | Phase 0: Governance team setup |
| **tasks-init** | `/tasks-init` | TASKS.md scaffolding (standalone) |
| **checkpoint** | `/checkpoint` | Task completion code review |
| **recover** | `/recover` | Universal recovery hub |
| **orchestrate-standalone** | `/orchestrate` | Dependency-based task automation (30-80 tasks) |
| **impact** | `/impact` | File change impact analysis |
| **deps** | `/deps` | Dependency graph visualization |
| **changelog** | `/changelog` | Change history analysis |
| **architecture** | `/architecture` | Architecture query and visualization |
| **coverage** | `/coverage` | Test coverage analysis |
| **multi-ai-review** | `/multi-ai-review` | CLI-based multi-AI review |

---

## Installation and Setup

### Installation Commands

**macOS/Linux:**
```bash
chmod +x ./scripts/install-unix.sh && ./scripts/install-unix.sh
```

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
```

### Optional: Project Team for Large Projects

```bash
cd project-team && ./install.sh --global
```

### What Installation Does
- Creates symbolic links from `skills/` to `~/.claude/skills/`
- Makes all 14 core skills available to Claude Desktop
- Skills remain in-repo for version control

---

## Architecture

### Directory Structure
```
claude-imple-skills/
├── skills/                      # 14 core implementation skills
│   ├── workflow-guide/          # v4.2.0 - Meta hub for skill routing
│   ├── agile/                   # v2.4.0 - Sprint master
│   ├── quality-auditor/         # v2.5.0 - Comprehensive audit
│   ├── governance-setup/        # v1.4.0 - Phase 0 governance
│   ├── tasks-init/              # v2.0.0 - TASKS.md scaffolding
│   ├── checkpoint/              # v1.0.0 - Task completion review
│   ├── recover/                 # v2.3.0 - Recovery hub
│   ├── orchestrate-standalone/  # v1.1.0 - Task automation
│   ├── impact/                  # Analysis skills
│   ├── deps/
│   ├── changelog/
│   ├── architecture/
│   ├── coverage/
│   └── multi-ai-review/
├── project-team/                # Enterprise agent coordination system
│   ├── agents/                  # 9 specialized AI agents
│   ├── hooks/                   # 16 automated hooks
│   └── templates/               # Configuration templates
├── scripts/                     # Installation scripts
├── README.md                    # User documentation
├── README_ko.md                 # Korean documentation
└── AGENTS.md                    # This file (AI agent guidance)
```

### MCP Dependencies

All skills work **without MCP**. MCP servers provide optional enhancements:

| Skill | Optional MCP | Enhancement |
|-------|--------------|-------------|
| `/agile` | playwright | Screenshot capture |
| `/audit` | playwright | Browser verification |
| `/architecture` | context7 | Latest docs search |

---

## Development Workflows

### Recommended Workflow Sequence

```
Start
  │
  ├─ "What should I do?" ─────────── /workflow
  │
  ├─ Large project? ──────────────── /governance-setup
  │
  ├─ No tasks? ────────────────────── /tasks-init
  │
  ├─ Implementation
  │   ├─ 1-30 tasks ──────────────── /agile auto
  │   ├─ 30-80 tasks ─────────────── /orchestrate
  │   └─ Changes ──────────────────── /agile iterate
  │
  ├─ Analysis needed?
  │   ├─ File change ──────────────── /impact
  │   ├─ Dependencies ─────────────── /deps
  │   ├─ Architecture ─────────────── /architecture
  │   └─ Coverage ─────────────────── /coverage
  │
  ├─ Verification
  │   ├─ Task complete ────────────── /checkpoint
  │   ├─ Phase complete ───────────── /audit
  │   └─ Deep review ──────────────── /multi-ai-review
  │
  └─ Work interrupted ────────────── /recover
```

### Task Scale Selection

| Task Count | Recommended Skill | Features |
|------------|-------------------|----------|
| **1-10** | `/agile run` + `/agile done` | Manual control |
| **10-30** | `/agile auto` | Layer checkpoints |
| **30-80** | `/orchestrate` | Dependency-based parallel |
| **80+** | `/agile auto` (sprint iteration) | Sprint breakdown |

---

## Quality Assurance

### Quality Gates

| Gate | Skill | Criteria |
|------|-------|----------|
| **Task Complete** | `/checkpoint` | Git diff review |
| **Phase Complete** | `/audit` | Spec + DDD + Tests |
| **Deep Review** | `/multi-ai-review` | Multi-AI consensus |

### Audit (`/audit`) Scoring

| Score | Verdict | Meaning |
|-------|---------|---------|
| 90+ | ✅ PASS | Production-ready |
| 70-89 | ⚠️ CAUTION | Minor fixes needed |
| <70 | ❌ FAIL | Major revision required |

---

## Context Recovery

### Recovery Priority

When running `/recover`, check in this order:

1. **Orchestrate State** (`.claude/orchestrate-state.json`)
2. **TASKS.md** (root canonical task file)
3. **Progress Log** (`.claude/progress.txt`)
4. **Git State** — Unmerged branches, dirty state

---

## Task File & ID Policy

### Canonical Task File

| Priority | Path | Description |
|----------|------|-------------|
| **1 (Canonical)** | `./TASKS.md` | Standard task file (root) |
| 2 (Legacy) | `docs/planning/06-tasks.md` | Legacy convention |
| 3 (Legacy) | `task.md`, `*tasks*.md` | Other legacy formats |

> **Rule**: New projects use root `TASKS.md`. Use `/tasks-migrate` to consolidate legacy files.

### Task ID Policy

Two formats supported:

| Format | Pattern | Use Case | Example |
|--------|---------|----------|---------|
| **Phase-based** | `P{n}-T{m}` | Large projects | `P1-T1`, `P2-S1-T3` |
| **Agile Layer** | `T{layer}.{seq}` | Sprint/layer work | `T0.1`, `T1.2`, `T3.4` |

**Agile Layer meanings:**
- `T0.*` — Skeleton (structure, layout)
- `T1.*` — Muscles (core functionality)
- `T2.*` — Muscles Advanced
- `T3.*` — Skin (UI polish, animations)

---

## Important Constraints

### What Skills DON'T Do

**Workflow Guide:**
- ❌ Does NOT write code directly
- ❌ Does NOT list all skills (only 1-2 relevant recommendations)

**Quality Auditor:**
- ❌ Does NOT modify code directly
- ❌ Does NOT audit without planning documents

**Agile Sprint Master:**
- ❌ Does NOT skip checkpoints
- ❌ Does NOT commit to git without explicit user request

---

## Korean Language Support

All skills support Korean commands:
- `/복구` = `/recover`
- "/스프린트 시작" = "start sprint"
- "/감사" = `/audit`
- "/워크플로우" = `/workflow`

---

## Version Information

- **Current Version**: v4.2.0 (Standalone-first)
- **Last Updated**: 2026-03-03
- **License**: MIT
- **Requirements**: None (standalone)
