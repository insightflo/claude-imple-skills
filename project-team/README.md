# Claude Project Team

> Mode-based canonical agent coordination for Claude Code with strict role boundaries, deterministic `Edit`/`Write` permissions, and policy hooks.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/anthropics/claude-imple-skills)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-20%2B-brightgreen.svg)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/status-stable-success.svg)](#)

## Overview

Claude Project Team installs a canonical topology defined by `project-team/config/topology-registry.json`.

- **Core canonical roles**: Lead, Builder, Reviewer
- **Specialists (mode-dependent)**: Designer, DBA, Security Specialist
- **Mode-scaled hooks**: 4 (`lite`) / 7 (`standard`) / 17 (`full`)
- **Token-first authorization**: canonical claims + deterministic path-scoped `Edit`/`Write`
- **Compatibility aliases**: one-release only, for migration continuity

This README describes the canonical model as the primary runtime. Legacy role names are supported only as temporary compatibility aliases and are not the architecture of record.

## Canonical Architecture

### Role Topology

```
Core (always present)
  ├── Lead      - planning, delegation, merge decisions
  ├── Builder   - scoped implementation and handoff
  └── Reviewer  - independent adversarial validation

Specialists (standard/full)
  ├── Designer             - design system consistency
  ├── DBA                  - schema and migration safety
  └── Security Specialist  - vulnerability and risk review
```

Role order and mode binding come from the canonical registry.

### Mode Semantics

| Mode | Canonical roles | Hooks | Purpose |
|------|-----------------|-------|---------|
| `lite` | Lead, Builder, Reviewer | 4 | MVP baseline coordination |
| `standard` | lite + Designer, DBA, Security Specialist | 7 | Default for most projects |
| `full` | standard topology | 17 | Maximum governance and validation surface |

`full` adds compatibility profile surfaces but does not restore a legacy runtime model.

### Compatibility Policy (One Release)

- Legacy aliases (for example `ProjectManager`, `ChiefArchitect`, `QAManager`, `FrontendSpecialist`, `BackendSpecialist`) are accepted as migration aliases only.
- Domain-profile aliases (for example `PartLeader`, `DomainDesigner`, `DomainDeveloper`) are compatibility surfaces, not canonical roles.
- Aliases are excluded from canonical role totals.

## Quick Start

### Prerequisites

- Node.js 20+
- Claude Code CLI (`claude`)
- Bash 4.0+

### Installation

Install from `project-team/`:

```bash
# Global install
./install.sh --global

# Project-local install
./install.sh --local
```

Select mode explicitly when needed:

```bash
./install.sh --mode=lite
./install.sh --mode=standard
./install.sh --mode=full
```

Additional installer flags:

```bash
./install.sh --hooks-only
./install.sh --skills-only
./install.sh --dry-run
./install.sh --uninstall
```

### Verification

```bash
# Verify installed artifacts
ls -la ~/.claude/agents/
ls -la ~/.claude/hooks/

# Verify mode-scoped hook manifest
cat ~/.claude/project-team-install-state.json
```

## Project Structure

```
project-team/
├── agents/                      # Canonical roles + one-release compatibility aliases
│   ├── Lead.md
│   ├── Builder.md
│   ├── Reviewer.md
│   ├── Designer.md
│   ├── DBA.md
│   ├── SecuritySpecialist.md
│   ├── templates/               # Compatibility profile surfaces (full mode)
│   └── *.md                     # One-release alias stubs
├── config/
│   └── topology-registry.json   # Canonical role/mode/hook registry
├── hooks/                       # Mode-scaled hook implementations
│   ├── permission-checker.js
│   ├── policy-gate.js
│   ├── security-scan.js
│   ├── task-board-sync.js
│   └── ...                      # Extended/full hook sets
├── templates/                   # Protocol, ADR, contract templates
├── skills/                      # Maintenance/analysis skills
├── scripts/                     # Installer and helper scripts
└── README.md
```

## Configuration

### Environment Variables

| Variable | Purpose | Default | Required |
|----------|---------|---------|----------|
| `AGENT_JWT_SECRET` | JWT token signing key for agent authentication | `default-secret-key-change-in-production` | **Yes (production)** |
| `CLAUDE_HOOK_SECRET` | Canonical signing/verification secret for auth + permission hooks | None | No |
| `PERMISSION_CHECKER_SECRET` | Legacy fallback secret for permission validation | None | No |
| `CLAUDE_AGENT_ROLE` | Agent role identifier (legacy compatibility path) | None | No |
| `PROJECT_TEAM_MODE` | Deployment mode: `lite`, `standard`, or `full` | `standard` | No |

**Security note**: in production, always set `AGENT_JWT_SECRET` to a strong random value.

```bash
export AGENT_JWT_SECRET="$(openssl rand -base64 32)"
```

Auth and hook verification resolve shared secrets in this order:
`CLAUDE_HOOK_SECRET` -> `AGENT_JWT_SECRET` -> `PERMISSION_CHECKER_SECRET`.

Canonical JWT claims are:
- `role`, `scope_id`, `allowed_paths`, `review_only`, `iat`, `exp`
- Optional: `domain`, `type`, legacy `agentId`
- Advisory-only in v1: `allowed_tools`, `denied_tools`, `advisory_only`

`exp` is emitted in seconds since epoch. Permission verification accepts legacy millisecond `exp` for one release during compatibility migration.

## Hooks and Auth Contracts

`permission-checker` is token-first and enforces deterministic write scope for `Edit`/`Write`.

- Source priority: token `allowed_paths` -> reviewer low-risk self-check -> canonical role defaults
- Low-risk reviewer self-check scope: `tests/**`, `docs/**`
- Advisory tool claims are metadata-only in v1 and do not gate tool execution
- Legacy role/profile inputs remain compatibility-only and should be migrated

See `project-team/hooks/README.md` for hook-by-hook details and test commands.

## Usage Guide

### Core Workflow

```bash
# Lead: planning and delegation
claude @lead "Plan task DAG and delegate implementation"

# Builder: implementation in assigned scope
claude @builder "Implement requested changes in src/orders/**"

# Reviewer: independent validation verdict
claude @reviewer "Review builder artifacts and return PASS/FAIL/NEEDS_REVISION"
```

### Specialist Workflow (standard/full)

```bash
claude @designer "Validate design-token compliance for checkout UI"
claude @dba "Review migration safety for orders schema changes"
claude @security-specialist "Assess auth and payment paths for OWASP risks"
```

### Compatibility Aliases (Migration Only)

Legacy alias handles may still resolve for one release. Use canonical handles for all new automation, docs, and runbooks.

## API and Contract Coordination

### Interface Contracts

Define cross-domain APIs in `contracts/interfaces/{domain}-api.yaml`:

```yaml
domain: accounts
version: "1.0.0"
endpoints:
  /accounts/{id}:
    GET:
      response:
        type: object
        properties:
          id: string
          email: string
          created_at: datetime
```

### Change Process

1. Submit spec change in `contracts/change-requests/`
2. Run interface impact validation
3. Resolve affected domain updates
4. Coordinate rollout timeline

## Maintenance

### Hook Tests

```bash
cd hooks
npm test
```

### Troubleshooting Quick Checks

```bash
ls ~/.claude/hooks/
ls ~/.claude/agents/
tail -f ~/.claude/logs/hooks.log
```

## Documentation

- [PROJECT-TEAM-AGENTS.md](../docs/design/PROJECT-TEAM-AGENTS.md)
- [hooks/README.md](hooks/README.md)
- [hooks/QUALITY_GATE.md](hooks/QUALITY_GATE.md)
- [templates/protocol/](templates/protocol/)
- [templates/contracts/](templates/contracts/)
- [templates/adr/](templates/adr/)

## License

MIT License - see [LICENSE](LICENSE) for details.

## Authors

Part of the `claude-imple-skills` project.

**Version**: 1.0.0
**Last Updated**: 2026-03-07
