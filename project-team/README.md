# Claude Project Team

> An enterprise-grade agent coordination system for managing large-scale AI-driven projects with structured governance, role-based permissions, and automated quality gates.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/anthropics/claude-imple-skills)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-20%2B-brightgreen.svg)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/status-stable-success.svg)](#)

## Overview

Claude Project Team is a comprehensive framework for orchestrating AI agents across large-scale projects. It provides:

- **Multi-tier governance**: Project-level controls with domain-level execution
- **9 specialized AI agents** with clearly defined roles and permissions
- **10 automated hooks** for standards enforcement, quality gates, and cross-domain notifications
- **Interface contracts** for safe multi-domain coordination
- **AI context management** for consistent decision-making across distributed teams

Designed for projects where multiple AI agents work together while maintaining architectural consistency, design standards, and quality compliance.

## Key Features

### Multi-Tier Architecture

```
Project Level (5 agents)
  ├── Project Manager      - Overall coordination
  ├── Chief Architect      - Standards & VETO authority
  ├── Chief Designer       - Design system & consistency
  ├── QA Manager           - Quality gates & release approval
  └── DBA                  - Database schema & standards

Domain Level (per domain: 3 agents)
  ├── Part Leader          - Domain management & decisions
  ├── Domain Designer      - Domain-specific design
  └── Domain Developer     - Implementation
```

### Automated Governance

10 hooks enforce standards automatically:

| Hook | Purpose | Trigger |
|------|---------|---------|
| **permission-checker** | Prevents unauthorized access | Every file operation |
| **standards-validator** | Validates code/architecture standards | Code changes |
| **design-validator** | Ensures design consistency | Design changes |
| **quality-gate** | Blocks merge if quality metrics unmet | Phase completion |
| **interface-validator** | Analyzes cross-domain API impacts | Interface changes |
| **cross-domain-notifier** | Alerts affected domains of changes | Major changes |
| **architecture-updater** | Maintains architecture documentation | Structure changes |
| **changelog-recorder** | Auto-generates changelog entries | Version changes |
| **pre-edit-impact-check** | Previews change impacts before edit | Pre-edit analysis |
| **risk-area-warning** | Highlights high-risk code areas | Risk assessment |

### Domain Coordination

- **Interface Contracts** (`contracts/interfaces/`) define APIs between domains
- **Cross-domain protocols** enable safe multi-team collaboration
- **Specification tracking** prevents breaking changes
- **Impact analysis** identifies downstream effects

## Quick Start

### Prerequisites

- Node.js 20+
- Claude Code CLI (`claude`)
- Bash 4.0+

### Installation

#### Global Install

Install into your global Claude configuration:

```bash
cd /path/to/project-team
./install.sh --global
```

#### Local Install

Install into a specific project's `.claude/` directory:

```bash
cd /path/to/project-team
./install.sh --local
```

#### Selective Installation

```bash
# Install only hooks
./install.sh --hooks-only

# Install only skills
./install.sh --skills-only

# Preview without changes
./install.sh --dry-run

# Remove existing installation
./install.sh --uninstall
```

### Verification

After installation, verify hooks are loaded:

```bash
# View installed hooks
ls -la ~/.claude/hooks/

# Check Claude Code recognizes hooks
claude mcp list
```

## Project Structure

```
project-team/
├── agents/                      # 9 AI agent definitions
│   ├── ProjectManager.md        # Project coordination
│   ├── ChiefArchitect.md        # Architecture & standards
│   ├── ChiefDesigner.md         # Design system
│   ├── QAManager.md             # Quality management
│   ├── DBA.md                   # Database management
│   ├── MaintenanceAnalyst.md    # System maintenance
│   └── templates/               # Domain agent templates
│       ├── PartLeader.md
│       ├── DomainDesigner.md
│       └── DomainDeveloper.md
│
├── hooks/                       # 10 JavaScript hooks
│   ├── permission-checker.js
│   ├── standards-validator.js
│   ├── design-validator.js
│   ├── quality-gate.js
│   ├── interface-validator.js
│   ├── cross-domain-notifier.js
│   ├── architecture-updater.js
│   ├── changelog-recorder.js
│   ├── pre-edit-impact-check.js
│   ├── risk-area-warning.js
│   ├── README.md                # Hook documentation
│   ├── QUALITY_GATE.md          # QA criteria
│   └── __tests__/               # Hook test suite
│
├── templates/                   # Document templates
│   ├── protocol/                # Collaboration protocols
│   ├── contracts/               # Interface contracts
│   └── adr/                     # Architecture Decision Records
│
├── skills/                      # 5 maintenance skills
│   ├── architecture/            # Architecture analysis
│   ├── changelog/               # Changelog generation
│   ├── deps/                    # Dependency analysis
│   └── impact/                  # Impact assessment
│
├── install.sh                   # Installation script (1.0.0)
├── package.json                 # Node.js dependencies
└── README.md                    # This file
```

## Configuration

### Environment Variables

| Variable | Purpose | Default | Required |
|----------|---------|---------|----------|
| `AGENT_JWT_SECRET` | JWT token signing key for agent authentication | `default-secret-key-change-in-production` | **Yes (production)** |
| `CLAUDE_HOOK_SECRET` | Shared secret for hook-to-hook communication | None | No |
| `PERMISSION_CHECKER_SECRET` | Legacy secret for permission validation | None | No |
| `CLAUDE_AGENT_ROLE` | Agent role identifier (legacy, for permission checker) | None | No |
| `PROJECT_TEAM_MODE` | Deployment mode: `lite`, `standard`, or `full` | `standard` | No |

**⚠️ Security Note**: In production, always set `AGENT_JWT_SECRET` to a strong random value:

```bash
export AGENT_JWT_SECRET="$(openssl rand -base64 32)"
```

### Global Configuration

System-wide settings are stored in `~/.claude/settings.json`:

```json
{
  "hooks": [
    "permission-checker",
    "standards-validator",
    "design-validator",
    "quality-gate",
    "interface-validator",
    "cross-domain-notifier",
    "architecture-updater",
    "changelog-recorder",
    "pre-edit-impact-check",
    "risk-area-warning"
  ],
  "permissions": {
    "project-manager": ["read", "write:management/", "write:contracts/"],
    "chief-architect": ["read", "veto:architecture"],
    "chief-designer": ["read", "veto:design"],
    "qa-manager": ["read", "veto:quality"],
    "dba": ["read", "write:database/", "veto:schema"]
  }
}
```

### Per-Project Configuration

Local project settings in `.claude/settings.json`:

```json
{
  "project": {
    "name": "My Project",
    "domains": [
      "accounts",
      "orders",
      "products"
    ],
    "teams": {
      "accounts": {
        "leader": "domain-lead-accounts",
        "designer": "domain-designer-accounts",
        "developer": "domain-dev-accounts"
      }
    }
  }
}
```

## Usage Guide

### For Project Managers

Initialize a new project:

```bash
claude @project-manager "Initialize project 'CustomerPlatform' with 3 domains"
```

Coordinate cross-domain tasks:

```bash
claude @project-manager "The orders domain needs to request new fields from accounts API"
```

### For Chief Architect

Define architectural standards:

```bash
claude @chief-architect "Review the API design in contracts/interfaces/"
```

Enforce standards via VETO:

```bash
claude @chief-architect "I VETO: This change violates API versioning standards"
```

### For QA Manager

Set up quality gates:

```bash
claude @qa-manager "Define quality gates for Phase 1 release"
```

Approve or block release:

```bash
claude @qa-manager "APPROVE release v1.0.0 - all QA criteria met"
```

### For Domain Teams

As Part Leader, coordinate your domain:

```bash
claude @part-leader-accounts "Coordinate sprint planning with design team"
```

Request changes from other domains:

```bash
claude @part-leader-accounts "Request: Add user_metadata field to Account API"
```

## AI Context Management

Claude Project Team includes sophisticated context management to maintain consistency across distributed AI agents:

### Constitution Injection

Encoded guardrails ensure all agents follow project principles:
- Architectural decisions are never contradicted
- Design systems are strictly maintained
- Quality standards cannot be bypassed

### Golden Samples

Real examples of correct agent behavior:
- Proper permission checking
- Correct API versioning
- Standard-compliant code reviews

### Progressive Context Loading

Agents only receive context relevant to their current task:
- Project managers see project-wide context
- Domain developers see only their domain
- Leads receive cross-domain views

### Checkpoint Verification

Agents validate decisions at critical points:
- Before proposing architecture changes
- Before approving critical merges
- Before releasing to production

See [docs/design/PROJECT-TEAM-AGENTS.md](../docs/design/PROJECT-TEAM-AGENTS.md) for complete context management architecture.

## Hooks Documentation

### permission-checker

Enforces role-based access control. Prevents agents from:
- Writing outside their permitted paths
- Executing forbidden operations
- Bypassing veto authorities

### standards-validator

Validates code against project standards:
- Coding conventions
- API design patterns
- Architecture principles
- Database naming standards

### quality-gate

Blocks phase completion when:
- Test coverage below threshold
- Critical bugs remain open
- Security scanning incomplete
- Performance benchmarks unmet

See [hooks/README.md](hooks/README.md) for complete hook reference.

## API Standards

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

### Change Request Process

1. Domain submits spec change in `contracts/change-requests/`
2. Interface validator analyzes impacts
3. Chief Architect approves/rejects
4. Affected domains are notified
5. Change is coordinated across teams

## Example Workflows

### Scenario: New Feature Across Multiple Domains

1. **Project Manager** receives request
2. **Chief Architect** reviews technical feasibility
3. **Part Leaders** coordinate their domain contributions
4. **Domain Designers** ensure UI/UX consistency
5. **Domain Developers** implement changes
6. **QA Manager** verifies quality criteria
7. **Cross-domain notifier** keeps stakeholders informed

### Scenario: API Breaking Change

1. **Orders Domain** proposes breaking change to Accounts API
2. **Interface Validator** hook identifies impact
3. **Cross-Domain Notifier** alerts Accounts team
4. **Chief Architect** mediates resolution
5. **DBA** validates any schema implications
6. **All affected domains** coordinate deprecation timeline

## Maintenance

### Running Hook Tests

```bash
cd hooks
npm test
```

### Updating Skills

Skills are self-contained and can be updated independently:

```bash
# Architecture analysis updates
npm run update:architecture

# Changelog generation updates
npm run update:changelog
```

### Monitoring Hook Performance

Hooks track execution metrics in `~/.claude/hook-metrics/`:

```bash
cat ~/.claude/hook-metrics/quality-gate.json
```

## Troubleshooting

### Hooks Not Triggering

1. Verify installation: `ls ~/.claude/hooks/`
2. Check Claude Code recognizes hooks: `claude mcp list`
3. Review hook logs: `tail -f ~/.claude/logs/hooks.log`

### Permission Denied Errors

1. Check agent permissions in `.claude/settings.json`
2. Verify file paths are in allowed list
3. Contact Project Manager for access changes

### Interface Validator Warnings

When changing domain APIs:

1. Review impact analysis from hook
2. Notify affected domains
3. Coordinate migration timeline
4. Update contract version

## Contributing

To extend Claude Project Team:

1. Create new hook in `hooks/`
2. Add tests in `hooks/__tests__/`
3. Update `hooks/README.md`
4. Run `npm test` to verify
5. Submit pull request with:
   - Hook purpose and triggers
   - Test coverage (>80%)
   - Documentation updates

## Documentation

- [PROJECT-TEAM-AGENTS.md](../docs/design/PROJECT-TEAM-AGENTS.md) - Complete system design
- [hooks/README.md](hooks/README.md) - Hook reference guide
- [hooks/QUALITY_GATE.md](hooks/QUALITY_GATE.md) - QA criteria definition
- [templates/protocol/](templates/protocol/) - Collaboration protocols
- [templates/contracts/](templates/contracts/) - Interface contract templates
- [templates/adr/](templates/adr/) - Architecture Decision Record templates

## Requirements

- **Node.js**: 20.0 or higher
- **Claude Code**: Latest version with hook support
- **Bash**: 4.0 or higher (for install.sh)
- **Disk Space**: ~50MB for full installation

## Support

For issues or questions:

1. Check [hooks/README.md](hooks/README.md) for hook troubleshooting
2. Review [docs/design/PROJECT-TEAM-AGENTS.md](../docs/design/PROJECT-TEAM-AGENTS.md) for architecture questions
3. Open an issue with detailed reproduction steps
4. Contact your Project Manager for access/permission issues

## Roadmap

- [ ] Multi-cloud deployment templates
- [ ] Metrics dashboard for agent performance
- [ ] GraphQL federation standards
- [ ] Microservices communication patterns
- [ ] Event-driven architecture templates
- [ ] Integration with VCS webhooks
- [ ] AI agent performance benchmarks

## License

MIT License - see [LICENSE](LICENSE) file for details

## Authors

Part of the claude-imple-skills project.

**Version**: 1.0.0
**Last Updated**: 2026-03-03

---

## Quick Reference

### Common Commands

```bash
# Initialize a project with Project Manager
claude @project-manager

# Request architectural review
claude @chief-architect "Review {file-path}"

# Request design review
claude @chief-designer "Review UI in {path}"

# Check QA readiness for release
claude @qa-manager "Pre-release checklist for v1.0.0"

# Manage domain
claude @part-leader-{domain} "Status update"

# Get impact analysis
claude @chief-architect "Impact analysis: changing {component}"
```

### Key Files to Know

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Project configuration |
| `contracts/interfaces/` | Domain API contracts |
| `hooks/QUALITY_GATE.md` | Release criteria |
| `management/decisions/` | Architecture decisions |
| `agents/*.md` | Agent role definitions |

---

**Ready to get started?** Run `./install.sh` and initialize your first project with the Project Manager.
