# Claude Project Team

> An enterprise-grade agent coordination system for managing large-scale AI-driven projects with structured governance, role-based permissions, and automated quality gates.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/anthropics/claude-impl-tools)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-20%2B-brightgreen.svg)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/status-stable-success.svg)](#)

## Overview

Claude Project Team is a comprehensive framework for orchestrating AI agents across large-scale projects. It provides:

- **Multi-tier governance**: Project-level controls with domain-level execution
- **Registry-driven canonical roles and compatibility profiles** with clearly defined permissions
- **Registry-driven hook topology** for standards enforcement, quality gates, and cross-domain notifications
- **Interface contracts** for safe multi-domain coordination
- **AI context management** for consistent decision-making across distributed teams

Designed for projects where multiple AI agents work together while maintaining architectural consistency, design standards, and quality compliance.

## Key Features

### Registry-Driven Architecture

```
Canonical roles are installed by mode from `config/topology-registry.json`
  ├── lite     -> lead, builder, reviewer
  ├── standard -> lite + designer, dba, security-specialist
  └── full     -> standard + compatibility profiles (part-leader, domain-designer, domain-developer)

Active hooks are also mode-driven
  ├── lite     -> permission-checker, policy-gate, security-scan, task-board-sync
  ├── standard -> lite + quality-gate, contract-gate, pre-edit-impact-check
  └── full     -> standard + docs/risk/domain/interface/standards/design/task-sync hooks
```

### Automated Governance

The active hook set is generated from the registry for the selected install mode:

| Hook | Purpose | Trigger |
|------|---------|---------|
| **permission-checker / policy-gate** | Auth + policy screening | Session start / every file operation |
| **security-scan / task-board-sync** | Runtime safety + collab state sync | PostToolUse |
| **pre-edit-impact-check / risk-gate / domain-boundary-enforcer / risk-area-warning** | Edit-time risk, boundary checks, and advisory warnings | PreToolUse |
| **contract-gate / docs-gate / interface-validator / standards-validator / design-validator / task-sync** | Post-edit contract and standards enforcement | PostToolUse |
| **quality-gate** | Final quality gate at stop boundary | Stop |
| **architecture-updater / changelog-recorder / cross-domain-notifier** | Derived updates and coordination support | PostToolUse / runtime support |

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

#### Maintenance Actions

```bash
# Preview without changes
./install.sh --dry-run

# Remove existing installation
./install.sh --uninstall
```

### Verification

After installation, verify the generated topology and installed artifacts:

```bash
# View installed hooks
ls -la ~/.claude/hooks/

# Verify registry/manifest alignment
node scripts/install-registry.js validate
```

For closure checks, use the registry-backed commands instead of ad hoc inspection:

```bash
node scripts/install-registry.js validate
node scripts/install-registry.js runtime-health standard ~/.claude global

# Local project install target
node scripts/install-registry.js runtime-health standard ./.claude local

# Aggregated diagnostics
node scripts/doctor.js --project-dir=. --json

# Derived guidance bundle
node scripts/guidance-bundle.js build --project-dir=. --json
```

`runtime-health` is fail-closed for missing required capabilities and non-blocking for advisory-only gaps.

For runtime recovery/debugging, prefer the canonical status surfaces:

```bash
node ../skills/recover/scripts/recover-status.js --json
node ../skills/whitebox/scripts/whitebox-summary.js --json
```

Compatibility profiles are full-mode only. If you downgrade from `full` to `lite`, the installer removes those compatibility artifacts and the acceptance harness verifies that removal.

## Project Structure

```
project-team/
├── agents/                      # Canonical roles + compatibility profiles
│   ├── Lead.md                  # Canonical coordination role
│   ├── Builder.md               # Canonical implementation role
│   ├── Reviewer.md              # Canonical review role
│   ├── Designer.md              # Standard/full design role
│   ├── DBA.md                   # Standard/full data role
│   ├── SecuritySpecialist.md    # Standard/full security role
│   └── templates/               # Domain agent templates
│       ├── PartLeader.md
│       ├── DomainDesigner.md
│       └── DomainDeveloper.md
│
├── hooks/                       # Registry-driven runtime hooks
│   ├── permission-checker.js
│   ├── policy-gate.js
│   ├── security-scan.js
│   ├── task-board-sync.js
│   ├── quality-gate.js
│   ├── contract-gate.js
│   ├── pre-edit-impact-check.js
│   ├── docs-gate.js
│   ├── risk-gate.js
│   ├── domain-boundary-enforcer.js
│   ├── risk-area-warning.js
│   ├── cross-domain-notifier.js
│   ├── interface-validator.js
│   ├── standards-validator.js
│   ├── design-validator.js
│   ├── task-sync.js
│   ├── architecture-updater.js
│   ├── changelog-recorder.js
│   ├── README.md                # Hook documentation
│   ├── QUALITY_GATE.md          # QA criteria
│   ├── lib/                     # Hook support utilities
│   └── __tests__/               # Hook test suite
│
├── templates/                   # Document templates
│   ├── protocol/                # Collaboration protocols
│   ├── contracts/               # Interface contracts
│   └── adr/                     # Architecture Decision Records
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
| `CLAUDE_AGENT_TOKEN` | Signed agent identity token for permission checking | None | Required for authenticated hook execution |
| `PROJECT_TEAM_MODE` | Deployment mode: `lite`, `standard`, or `full` | `standard` | No |

**⚠️ Security Note**: In production, always set `AGENT_JWT_SECRET` to a strong random value and issue signed `CLAUDE_AGENT_TOKEN` values for active agents:

```bash
export AGENT_JWT_SECRET="$(openssl rand -base64 32)"
```

### Global Configuration

System-wide settings are stored in `~/.claude/settings.json`, but the installer generates registry-backed hook groups rather than the simplified static structure below.

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
    "lead": ["read", "write:management/", "write:contracts/"],
    "reviewer": ["read", "veto:architecture", "veto:quality"],
    "designer": ["read", "veto:design"],
    "dba": ["read", "write:database/", "veto:schema"]
  }
}
```

### Per-Project Configuration

Local project settings in `.claude/settings.json` should be treated as registry-managed output plus project metadata overlays, not a hand-authored team/permissions source of truth:

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
        "leader": "lead",
        "designer": "designer",
        "developer": "builder"
      }
    }
  }
}
```

## Usage Guide

### For Canonical Roles

#### Lead

Initialize a new project:

```bash
claude @lead "Initialize project 'CustomerPlatform' with 3 domains"
```

Coordinate cross-domain tasks:

```bash
claude @lead "The orders domain needs to request new fields from accounts API"
```

#### Reviewer / Designer / DBA / Security Specialist

Define architectural standards:

```bash
claude @reviewer "Review the API design in contracts/interfaces/"
```

Enforce standards via VETO:

```bash
claude @reviewer "Block this change: it violates API versioning standards"
```

Compatibility profiles are available only in `full` mode when legacy domain-role naming is required.

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
- Leads see project-wide context
- Builders see only their scoped implementation/domain context
- Reviewers receive cross-domain review views

### Checkpoint Verification

Agents validate decisions at critical points:
- Before proposing architecture changes
- Before approving critical merges
- Before releasing to production

See [../AGENTS.md](../AGENTS.md) for the current repository-level operating guidance.

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

1. The lead submits spec change in `contracts/change-requests/`
2. Interface validator analyzes impacts
3. Reviewer approves/rejects
4. Affected domains are notified
5. Change is coordinated across teams

## Example Workflows

### Scenario: New Feature Across Multiple Domains

1. **Lead** receives request
2. **Reviewer** reviews technical feasibility
3. **Compatibility profiles** coordinate domain contributions when full-mode legacy roles are enabled
4. **Designer** ensures UI/UX consistency
5. **Builder** implements changes
6. **Reviewer** verifies quality criteria
7. **Cross-domain notifier** keeps stakeholders informed

### Scenario: API Breaking Change

1. **Orders Domain** proposes breaking change to Accounts API
2. **Interface Validator** hook identifies impact
3. **Cross-Domain Notifier** alerts Accounts team
4. **Reviewer** mediates resolution
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

Prefer registry-backed and whitebox-backed health checks:

```bash
node scripts/install-registry.js validate
node scripts/install-registry.js runtime-health standard ~/.claude global
node ../skills/whitebox/scripts/whitebox-summary.js --json
```

## Troubleshooting

### Hooks Not Triggering

1. Verify installation: `ls ~/.claude/hooks/`
2. Run closure validation: `node scripts/install-registry.js validate`
3. Run runtime health: `node scripts/install-registry.js runtime-health standard ~/.claude global`

### Permission Denied Errors

1. Check agent permissions in `.claude/settings.json`
2. Verify file paths are in allowed list
3. Contact the lead for access changes

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
2. Review [../AGENTS.md](../AGENTS.md) and [hooks/README.md](hooks/README.md) for architecture/runtime questions
3. Open an issue with detailed reproduction steps
4. Contact the lead for access/permission issues

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

Part of the claude-impl-tools project.

**Version**: 1.0.0
**Last Updated**: 2026-03-03

---

## Quick Reference

### Common Commands

```bash
# Initialize a project with the canonical lead role
claude @lead

# Request architectural review
claude @reviewer "Review {file-path}"

# Request design review
claude @designer "Review UI in {path}"

# Check QA readiness for release
claude @reviewer "Pre-release checklist for v1.0.0"

# Manage domain
claude @lead "Status update"

# Get impact analysis
claude @reviewer "Impact analysis: changing {component}"
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

**Ready to get started?** Run `./install.sh`, then verify the installed topology with `node scripts/install-registry.js validate`.
