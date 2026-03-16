# Project Bootstrap Integration with Claude Project Team

> **Document Version**: 1.0.0
> **Last Updated**: 2026-02-08
> **Status**: Published

## Table of Contents

1. [Overview](#overview)
2. [System Relationship](#system-relationship)
3. [Integration Method](#integration-method)
4. [Workflow](#workflow)
5. [Configuration by Project Type](#configuration-by-project-type)
6. [Agent Mapping](#agent-mapping)
7. [Hook System Integration](#hook-system-integration)
8. [Installation Automation](#installation-automation)
9. [Precautions](#precautions)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### What is Project Bootstrap?

**Project Bootstrap** (`/project-bootstrap`) is a vibelab skill (v1.7.5+) that automatically creates AI agent teams and project environments. When a user says "create an agent team" ("에이전트 팀 만들어줘"), it:

1. Determines the tech stack (or invokes `/socrates` for planning)
2. Asks follow-up questions (database, auth, MCP servers)
3. Generates agent files (`.claude/agents/`, `.claude/commands/`)
4. Optionally scaffolds backend, frontend, Docker, and Git

### What is Claude Project Team?

**Claude Project Team** is an enterprise-grade agent coordination system that provides:

1. **Multi-tier governance**: 4 project-team agents + 4 Agent Teams leads + per-domain 3-agent teams
2. **20 automated hooks**: Permission checking, standards validation, quality gates
3. **Interface contracts**: Safe cross-domain API coordination
4. **Configuration template**: `project-team.yaml` master configuration

### How They Relate

```
┌──────────────────────────────────────────────────────────────────┐
│  /project-bootstrap (vibelab skill)                              │
│  "Create the team and project scaffolding"                       │
│                                                                  │
│  Produces:                                                       │
│    .claude/agents/          (4-6 specialist agents)              │
│    .claude/commands/        (orchestrate, integration-validator)  │
│    .claude/memory/          (project context)                    │
│    .claude/metrics/         (evaluation tracking)                │
│    .claude/goals/           (goal tracking)                      │
│    backend/ + frontend/     (project code scaffolding)           │
│    docker-compose.yml       (infrastructure)                     │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             │  Enhances with governance layer
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Claude Project Team (governance framework)                      │
│  "Add structure, rules, and quality controls"                    │
│                                                                  │
│  Adds:                                                           │
│    .claude/project-team.yaml     (master team configuration)     │
│    .claude/hooks/                (20 automated governance hooks)  │
│    .claude/agents/ (extended)    (4 agents + 4 Agent Teams leads) │
│    .claude/skills/               (architecture, changelog, etc)  │
│    contracts/interfaces/         (cross-domain API contracts)    │
│    design-system/                (design tokens, components)     │
└──────────────────────────────────────────────────────────────────┘
```

**Key insight**: Project Bootstrap creates the *development team*. Claude Project Team adds the *governance layer* on top. They are complementary, not competing.

---

## System Relationship

### Layer Architecture

| Layer | System | Responsibility |
|-------|--------|---------------|
| **L1: Planning** | `/socrates` | 21-question requirements gathering, 7 planning documents |
| **L2: Team Creation** | `/project-bootstrap` | Agent team + project scaffolding |
| **L3: Governance** | Claude Project Team | Hooks, permissions, quality gates, standards |
| **L4: Execution** | `team-orchestrate` | Task routing to specialist agents |
| **L5: Quality** | Vibelab Extension Skills | Multi-AI review, quality audit, sprint management |

### Data Flow Between Systems

```
/socrates (Planning)
    │
    │  PRD, TRD, TASKS.md, tech stack decision
    ▼
/project-bootstrap (Team Creation)
    │
    │  .claude/agents/, .claude/commands/
    │  backend/, frontend/, docker-compose.yml
    ▼
Claude Project Team (Governance)
    │
    │  project-team.yaml, hooks/, contracts/
    ▼
team-orchestrate (Execution)
    │
    │  Task tool → specialist agents
    ▼
Specialist Agents (Implementation)
    │
    │  Code, tests, commits
    ▼
Hooks (Automated Verification)
    │  permission-checker, quality-gate,
    │  interface-validator, standards-validator
    ▼
Verified Output
```

---

## Integration Method

### Step 1: Run Project Bootstrap

Project Bootstrap creates the base agent team and project structure:

```bash
# In Claude Code session
> "FastAPI + React + PostgreSQL로 에이전트 팀 만들어줘"

# Bootstrap creates:
.claude/
├── agents/
│   ├── backend-specialist.md
│   ├── frontend-specialist.md
│   ├── database-specialist.md
│   └── test-specialist.md
├── commands/
│   ├── orchestrate.md
│   ├── integration-validator.md
│   └── agent-lifecycle.md
├── memory/
│   ├── project.md          # Tech stack auto-recorded
│   ├── preferences.md
│   ├── patterns.md
│   ├── decisions.md
│   └── learnings.md
├── metrics/
│   ├── quality/
│   ├── performance/
│   ├── cost/
│   └── reports/
└── goals/
    ├── objectives.md
    ├── progress.md
    ├── blockers.md
    └── timeline.md
```

### Step 2: Generate project-team.yaml

After Bootstrap completes, generate the `project-team.yaml` configuration based on the project's tech stack and domain structure.

The template is located at:
```
project-team/templates/project-team.yaml
```

Copy and customize it:
```bash
cp project-team/templates/project-team.yaml .claude/project-team.yaml
```

Then fill in the placeholders using information from Bootstrap:

```yaml
# Auto-populated from Bootstrap choices
project:
  name: "my-ecommerce-app"
  type: "ecommerce"
  description: "E-commerce platform with user auth and product management"
  owner: "team-lead"
  start_date: "2026-02-08"
  tech_stack:
    backend: "FastAPI"
    frontend: "React + Vite"
    database: "PostgreSQL"
    infrastructure: "Docker"
    messaging: ""

# Domain structure derived from TASKS.md
domains:
  - name: "user"
    display_name: "User Domain"
    description: "Authentication, user profiles, permissions"
    lead: "user-pl"
    team:
      - role: "part-leader"
        name: "user-pl"
      - role: "domain-designer"
        name: "user-designer"
      - role: "domain-developer"
        name: "user-developer"
    dependencies: []
    tech_stack: ["FastAPI", "SQLAlchemy", "JWT"]
    path: "src/domains/user"

  - name: "product"
    display_name: "Product Domain"
    description: "Product catalog, search, inventory"
    lead: "product-pl"
    team:
      - role: "part-leader"
        name: "product-pl"
      - role: "domain-designer"
        name: "product-designer"
      - role: "domain-developer"
        name: "product-developer"
    dependencies: ["user"]
    tech_stack: ["FastAPI", "SQLAlchemy", "PGVector"]
    path: "src/domains/product"
```

### Step 3: Install Claude Project Team

Run the installer to add governance hooks and project-level agents:

```bash
cd project-team
./install.sh --local
```

This installs:
- 20 governance hooks into `.claude/hooks/`
- 4 project-team agents (Builder, Reviewer, Designer, MaintenanceAnalyst)
- 4 Agent Teams leads (team-lead, architecture-lead, qa-lead, design-lead)
- 4 built-in skills (`/impact`, `/deps`, `/architecture`, `/changelog`)
- Domain agent templates into `.claude/agents/templates/`

### Step 4: Verify Combined Setup

After both systems are installed, the project should have:

```
.claude/
├── project-team.yaml          # [Project Team] Master config
│
├── agents/
│   ├── backend-specialist.md  # [Bootstrap] Implementation agent
│   ├── frontend-specialist.md # [Bootstrap] Implementation agent
│   ├── database-specialist.md # [Bootstrap] Implementation agent
│   ├── test-specialist.md     # [Bootstrap] Implementation agent
│   ├── Builder.md             # [Project Team] Implementation tasks
│   ├── Reviewer.md            # [Project Team] Quality review
│   ├── Designer.md            # [Project Team] Design system
│   ├── MaintenanceAnalyst.md  # [Project Team] Maintenance tasks
│   ├── team-lead.md           # [Agent Teams] Overall coordination
│   ├── architecture-lead.md   # [Agent Teams] Architecture decisions
│   ├── qa-lead.md             # [Agent Teams] Quality gates
│   ├── design-lead.md         # [Agent Teams] Design decisions
│   └── templates/
│       ├── PartLeader.md      # [Project Team] Domain template
│       ├── DomainDesigner.md  # [Project Team] Domain template
│       └── DomainDeveloper.md # [Project Team] Domain template
│
├── commands/
│   ├── orchestrate.md         # [Bootstrap] Task orchestrator
│   ├── integration-validator.md
│   └── agent-lifecycle.md
│
├── hooks/                     # [Project Team] Automated governance
│   ├── permission-checker.js
│   ├── standards-validator.js
│   ├── design-validator.js
│   ├── quality-gate.js
│   ├── interface-validator.js
│   ├── cross-domain-notifier.js
│   ├── architecture-updater.js
│   ├── changelog-recorder.js
│   ├── pre-edit-impact-check.js
│   └── risk-area-warning.js
│
├── skills/                    # [Project Team] Built-in skills
│   ├── architecture/
│   ├── changelog/
│   ├── deps/
│   └── impact/
│
├── memory/                    # [Bootstrap] Session memory
├── metrics/                   # [Bootstrap] Quality metrics
└── goals/                     # [Bootstrap] Goal tracking
```

---

## Workflow

### Complete Setup Flow

```
User: "에이전트 팀 만들어줘"
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Step 1: /project-bootstrap                               │
│                                                          │
│ Q1: Tech stack? → "FastAPI + React"                      │
│ Q2-1: Database? → "PostgreSQL"                           │
│ Q2-2: Auth? → "Yes (JWT)"                                │
│ Q2-3: Extras? → "PGVector for AI/RAG"                    │
│ Q2-4: MCP? → "Gemini + Context7 + Playwright"            │
│ Q3: Full setup? → "Yes"                                  │
│                                                          │
│ [Generates agent team + project scaffolding]              │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Step 2: Generate project-team.yaml                       │
│                                                          │
│ Map Bootstrap choices to project-team.yaml:              │
│ - tech_stack fields from Bootstrap selections            │
│ - domains from TASKS.md milestones                       │
│ - hooks configuration from project requirements          │
│ - risk_areas from auth/payment domain detection          │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Step 3: Install Claude Project Team                      │
│                                                          │
│ ./install.sh --local                                     │
│                                                          │
│ - Install 20 hooks                                       │
│ - Add 4 project-team agents + 4 Agent Teams leads        │
│ - Copy domain agent templates                            │
│ - Configure settings.json hook entries                   │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Step 4: Development begins with team-orchestrate         │
│                                                          │
│ /team-orchestrate T1.1 인증 API 구현해줘                  │
│                                                          │
│ Orchestrator:                                            │
│   1. Reads TASKS.md (from /socrates)                     │
│   2. Determines Phase -> Git Worktree                    │
│   3. Calls backend-specialist via Task tool              │
│   4. Hooks auto-verify code quality                      │
│   5. Quality gate checks before merge                    │
└─────────────────────────────────────────────────────────┘
```

### Domain Setup Flow

When the project has multiple domains (e.g., ecommerce with user, product, order, payment), create domain teams using the templates:

```
# For each domain in project-team.yaml:
domains:
  - name: "user"
  - name: "product"
  - name: "order"
  - name: "payment"

# Generate domain agents from templates:
.claude/agents/
├── user-pl.md           # From templates/PartLeader.md
├── user-designer.md     # From templates/DomainDesigner.md
├── user-developer.md    # From templates/DomainDeveloper.md
├── product-pl.md
├── product-designer.md
├── product-developer.md
├── order-pl.md
├── order-designer.md
├── order-developer.md
├── payment-pl.md
├── payment-designer.md
└── payment-developer.md
```

---

## Configuration by Project Type

### Type 1: Small Project (1-2 Domains)

Best for: Personal projects, MVPs, small-team apps

```yaml
# project-team.yaml (simplified)
project:
  name: "my-blog"
  type: "saas"
  tech_stack:
    backend: "FastAPI"
    frontend: "React + Vite"
    database: "PostgreSQL"

agents:
  team-lead:
    enabled: false       # Not needed for small projects
  architecture-lead:
    enabled: true        # Keep for architecture standards
  design-lead:
    enabled: false       # Not needed
  qa-lead:
    enabled: true        # Keep for quality gates
  dba:
    enabled: false       # Handled by database-specialist

domains:
  - name: "core"
    description: "All application logic"
    team:
      - role: "domain-developer"
        name: "fullstack-dev"

hooks:
  permission-checker:
    enabled: false       # Not needed for single domain
  standards-validator:
    enabled: true
  quality-gate:
    enabled: true
    strict: false        # Warning only
  interface-validator:
    enabled: false       # Single domain, no interfaces
  cross-domain-notifier:
    enabled: false
```

**Bootstrap command**: `"FastAPI + React로 에이전트 팀 만들어줘"` (simple setup)

### Type 2: Medium Project (3-5 Domains)

Best for: SaaS applications, e-commerce, multi-feature platforms

```yaml
# project-team.yaml
project:
  name: "ecommerce-platform"
  type: "ecommerce"
  tech_stack:
    backend: "FastAPI"
    frontend: "Next.js"
    database: "PostgreSQL"
    infrastructure: "Docker"

agents:
  team-lead:
    enabled: true
  architecture-lead:
    enabled: true
  design-lead:
    enabled: true
  qa-lead:
    enabled: true
  dba:
    enabled: true

domains:
  - name: "user"
    description: "Authentication and user management"
    dependencies: []
  - name: "product"
    description: "Product catalog and search"
    dependencies: ["user"]
  - name: "order"
    description: "Order processing and history"
    dependencies: ["user", "product"]
  - name: "payment"
    description: "Payment processing"
    dependencies: ["order"]

hooks:
  permission-checker:
    enabled: true
    strict: false
  standards-validator:
    enabled: true
  design-validator:
    enabled: true
  quality-gate:
    enabled: true
    strict: true         # Block merge if quality unmet
  interface-validator:
    enabled: true
  cross-domain-notifier:
    enabled: true

risk_areas:
  - pattern: "**/payment/**"
    level: CRITICAL
  - pattern: "**/auth/**"
    level: CRITICAL
  - pattern: "migrations/**"
    level: HIGH
```

**Bootstrap command**: `"FastAPI + Next.js + PostgreSQL로 에이전트 팀 만들어줘"` with auth and PGVector options

### Type 3: Large Project (6+ Domains)

Best for: Enterprise systems, microservices, multi-team projects

```yaml
# project-team.yaml
project:
  name: "enterprise-erp"
  type: "system"
  tech_stack:
    backend: "FastAPI"
    frontend: "React + Vite"
    database: "PostgreSQL"
    infrastructure: "Docker + Kubernetes"
    messaging: "RabbitMQ"

agents:
  team-lead:
    enabled: true
  architecture-lead:
    enabled: true
  design-lead:
    enabled: true
  qa-lead:
    enabled: true
  dba:
    enabled: true

domains:
  - name: "identity"
  - name: "hr"
  - name: "finance"
  - name: "inventory"
  - name: "sales"
  - name: "reporting"
  - name: "notification"
  - name: "integration"

hooks:
  # All hooks enabled with strict mode
  permission-checker:
    enabled: true
    strict: true
  standards-validator:
    enabled: true
  design-validator:
    enabled: true
  quality-gate:
    enabled: true
    strict: true
    config:
      test_coverage:
        minimum: 90
  interface-validator:
    enabled: true
    config:
      breaking_changes:
        require_approval: true
        min_notice_days: 30
  cross-domain-notifier:
    enabled: true

collaboration:
  change_request_process:
    - step: 1
      description: "Submit change request to target domain"
    - step: 2
      description: "Domain lead review"
    - step: 3
      description: "Impact analysis by interface-validator"
    - step: 4
      description: "architecture-lead approval for breaking changes"
    - step: 5
      description: "Implementation with TDD"
    - step: 6
      description: "qa-lead release approval"
```

---

## Agent Mapping

### How Bootstrap Agents Map to Project Team Roles

Project Bootstrap creates **implementation agents**. Claude Project Team adds **governance agents**. They work together in a hierarchy:

```
┌─────────────────────────────────────────────────────────┐
│  Agent Teams Leads (.claude/agents/)                     │
│                                                          │
│  team-lead ──────────── Overall coordination             │
│  architecture-lead ───── Architecture decisions, VETO    │
│  qa-lead ─────────────── Quality gates, release approval │
│  design-lead ─────────── Design system consistency       │
│                                                          │
│  Project Team Agents (project-team/agents/)              │
│                                                          │
│  Builder ─────────────── Implementation tasks            │
│  Reviewer ────────────── Quality review and approval     │
│  Designer ────────────── Design system and UX            │
│  MaintenanceAnalyst ───── Maintenance and analysis       │
└──────────────────────────┬──────────────────────────────┘
                           │
                           │  Delegates via team-orchestrate
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Domain Level (Project Bootstrap + Project Team)         │
│                                                          │
│  Per domain:                                             │
│    Domain lead ──────── Domain decisions (Project Team)  │
│    Domain designer ───── API/data design (Project Team)  │
│    Domain builder ─────── Implementation (Bootstrap)     │
│                                                          │
│  Shared specialists:                                     │
│    backend-specialist ── FastAPI, business logic          │
│    frontend-specialist ─ React/Vite, UI components       │
│    database-specialist ─ SQLAlchemy, Alembic              │
│    test-specialist ───── pytest, Vitest, E2E              │
└─────────────────────────────────────────────────────────┘
```

### Role Responsibility Matrix

| Action | Bootstrap Agent | Project Team Agent | Hook |
|--------|----------------|-------------------|------|
| API endpoint implementation | backend-specialist | - | standards-validator |
| UI component creation | frontend-specialist | - | design-validator |
| Database migration | database-specialist | dba (approval) | risk-area-warning |
| Cross-domain API change | - | architecture-lead (VETO) | interface-validator |
| Quality verification | test-specialist | qa-lead (gate) | quality-gate |
| Design consistency | - | design-lead | design-validator |
| File permission check | - | - | permission-checker |
| Architecture documentation | - | - | architecture-updater |

---

## Hook System Integration

### How Hooks Interact with Bootstrap Agents

When a Bootstrap specialist agent (e.g., `backend-specialist`) writes code, Claude Project Team hooks automatically verify the changes:

```
backend-specialist writes code
    │
    ├─→ [PreToolUse] pre-edit-impact-check.js
    │   "This file is in payment/ domain (CRITICAL risk area)"
    │
    ├─→ [PostToolUse] permission-checker.js
    │   "backend-specialist has write access to src/domains/user/"
    │
    ├─→ [PostToolUse] standards-validator.js
    │   "Code follows Python style guide, architecture patterns OK"
    │
    ├─→ [PostToolUse] risk-area-warning.js
    │   "WARNING: auth/ is a CRITICAL risk area, extra review needed"
    │
    └─→ [Phase completion] quality-gate.js
        "Coverage: 85% (min 80%), integration tests: PASS"
```

### Hook Configuration in settings.json

After installing both systems, the `.claude/settings.json` should contain hooks from both:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "node .claude/hooks/pre-edit-impact-check.js"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "node .claude/hooks/permission-checker.js"
      },
      {
        "matcher": "Edit|Write",
        "command": "node .claude/hooks/standards-validator.js"
      },
      {
        "matcher": "Edit|Write",
        "command": "if [[ {{filePath}} == *.py ]]; then ruff format {{filePath}}; fi"
      }
    ]
  },
  "permissions": {
    "allow": [
      "pytest", "pytest --cov", "pytest -v",
      "ruff check", "ruff format", "mypy",
      "npm run build", "npm run test", "npm run lint",
      "git status", "git log", "git diff",
      "git worktree list", "git worktree add",
      "docker compose up -d", "docker compose down",
      "node .claude/hooks/*.js"
    ],
    "deny": [
      "rm -rf", "git push --force", "git reset --hard",
      "DROP TABLE", "DROP DATABASE"
    ]
  }
}
```

---

## Installation Automation

### Recommended: Combined Setup Script

For projects that want both systems installed together, use this workflow:

```bash
#!/usr/bin/env bash
# combined-setup.sh - Install Bootstrap + Project Team together

set -euo pipefail

PROJECT_DIR="${1:-.}"
CLAUDE_DIR="${PROJECT_DIR}/.claude"

echo "=== Phase 1: Project Bootstrap ==="
echo "Run in Claude Code: \"에이전트 팀 만들어줘\""
echo "Complete the interactive setup first."
echo ""
read -p "Press Enter after Bootstrap is complete..."

echo "=== Phase 2: Claude Project Team ==="

# Backup existing config
if [ -f "${CLAUDE_DIR}/settings.json" ]; then
    cp "${CLAUDE_DIR}/settings.json" "${CLAUDE_DIR}/settings.json.backup"
    echo "Backed up existing settings.json"
fi

# Install Project Team
cd /path/to/project-team
./install.sh --local

echo "=== Phase 3: Generate project-team.yaml ==="
cp templates/project-team.yaml "${CLAUDE_DIR}/project-team.yaml"
echo "Created ${CLAUDE_DIR}/project-team.yaml"
echo "Edit this file to match your project's domain structure."

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit .claude/project-team.yaml with your domain info"
echo "  2. Restart Claude Code"
echo "  3. Run: /orchestrate T0.1 프로젝트 구조 초기화"
```

### Automated project-team.yaml Generation

When Bootstrap provides the tech stack, the `project-team.yaml` placeholders can be auto-populated:

| Bootstrap Selection | project-team.yaml Field | Example Value |
|--------------------|-----------------------|---------------|
| Backend framework | `tech_stack.backend` | `"FastAPI"` |
| Frontend framework | `tech_stack.frontend` | `"React + Vite"` |
| Database choice | `tech_stack.database` | `"PostgreSQL"` |
| Auth enabled | `standards.security.authentication` | `"jwt"` |
| Docker selected | `tech_stack.infrastructure` | `"Docker"` |
| PGVector selected | Additional domain tech | `"PGVector"` |
| Redis selected | `tech_stack.messaging` | `"Redis"` |

---

## Precautions

### 1. Backup Before Installation

Always back up existing `.claude/` configuration before installing either system:

```bash
# Create backup
cp -r .claude/ .claude.backup-$(date +%Y%m%d)/

# Or use install.sh's built-in backup
./install.sh --local  # Auto-creates .backup-YYYYMMDDHHMMSS files
```

### 2. Conflict Prevention

#### settings.json Merge

Both systems modify `.claude/settings.json`. The installer handles merging, but verify manually:

```bash
# Check for conflicts after install
cat .claude/settings.json | python3 -m json.tool

# Verify hooks are not duplicated
grep -c "permission-checker" .claude/settings.json  # Should be 1
grep -c "standards-validator" .claude/settings.json  # Should be 1
```

#### Agent File Naming

Agent Teams leads use hyphenated names (`team-lead.md`, `architecture-lead.md`), Project Team workers use PascalCase (`Builder.md`). No naming conflicts occur.

#### Hook Execution Order

Hooks execute in the order listed in `settings.json`. Recommended order:

1. `pre-edit-impact-check.js` (PreToolUse - analyze before changes)
2. `permission-checker.js` (PostToolUse - verify access rights)
3. `risk-area-warning.js` (PostToolUse - flag dangerous areas)
4. `standards-validator.js` (PostToolUse - check code standards)
5. `design-validator.js` (PostToolUse - check design consistency)
6. Auto-formatter hooks from Bootstrap settings template

### 3. Agent Overlap Resolution

If both systems define agents with overlapping responsibilities, follow these precedence rules:

| Responsibility | Primary Agent | Secondary Agent |
|---------------|---------------|-----------------|
| Database schema design | DBA (Project Team) | database-specialist (Bootstrap) |
| Code implementation | backend/frontend-specialist (Bootstrap) | Builder (Project Team) |
| Quality verification | qa-lead (Agent Teams) | test-specialist (Bootstrap) |
| Architecture decisions | architecture-lead (Agent Teams) | - |

### 4. Version Compatibility

| Component | Minimum Version | Recommended |
|-----------|----------------|-------------|
| vibelab skills | v1.7.4 | v1.7.5+ |
| vibelab labs (hooks) | v1.8.1 | v1.9.2+ |
| Claude Project Team | v1.0.0 | v1.0.0 |
| Node.js | v18.0.0 | v20+ |
| Claude Code CLI | v0.1.0 | Latest |

### 5. Performance Considerations

- **Hook overhead**: 20 hooks add latency to each file operation. For small projects, disable unused hooks (permission-checker, cross-domain-notifier).
- **Agent context**: More agents mean larger context windows. For projects with limited context budget, use a smaller configuration (Type 1 or Type 2).
- **MCP servers**: Bootstrap may configure MCP servers with `defer_loading: true` for token efficiency. Ensure Project Team hooks do not conflict with MCP tool invocations.

---

## Troubleshooting

### Q: Hooks do not trigger after installation

**Cause**: `settings.json` was not updated with hook entries.

**Solution**:
```bash
# Verify hooks are registered
cat .claude/settings.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
hooks = data.get('hooks', {})
for event, entries in hooks.items():
    print(f'{event}: {len(entries)} hooks')
    for e in entries:
        print(f'  - {e.get(\"command\", \"unknown\")[:60]}')
"

# If missing, re-run installer
./install.sh --hooks-only --local
```

### Q: Bootstrap agents ignore Project Team hooks

**Cause**: Bootstrap agents run via Task tool (sub-agents), which may not inherit hook configuration from the parent session.

**Solution**: Ensure hooks are installed at the project level (`.claude/settings.json`), not just the user level. Sub-agents inherit project-level settings.

```bash
# Install hooks to project level
./install.sh --local  # NOT --global

# Verify project-level settings
cat .claude/settings.json | grep "hooks"
```

### Q: project-team.yaml changes are not reflected

**Cause**: `project-team.yaml` is a configuration file read by agents, not by hooks. Agents must be instructed to read it.

**Solution**: Include a reference to `project-team.yaml` in the orchestrator prompt or in individual agent files:

```markdown
# In orchestrate.md or specialist agent files
## Project Configuration
Refer to `.claude/project-team.yaml` for:
- Domain boundaries and ownership
- Hook settings and risk areas
- Collaboration rules and escalation process
```

### Q: Duplicate agent files after reinstallation

**Cause**: Running both Bootstrap and Project Team installer multiple times creates duplicate files.

**Solution**:
```bash
# Check for duplicates
ls -la .claude/agents/ | sort

# Remove backup files
rm -f .claude/agents/*.backup-*

# Re-install cleanly
./install.sh --uninstall
./install.sh --local
```

### Q: Quality gate blocks all merges

**Cause**: `quality-gate` hook is set to `strict: true` but project does not yet meet coverage requirements.

**Solution**: Start with `strict: false` (warning only) and gradually increase requirements:

```yaml
# In project-team.yaml
hooks:
  quality-gate:
    enabled: true
    strict: false   # Start here, switch to true when ready
    config:
      test_coverage:
        minimum: 60  # Start low, increase gradually
```

---

## References

- [Claude Project Team README](../README.md)
- [Installation Guide](INSTALLATION.md)
- [Usage Guide](USAGE.md)
- [Skill Integration Guide](SKILL-INTEGRATION.md)
- [Maintenance Guide](MAINTENANCE.md)
- [Project Bootstrap SKILL.md](https://github.com/vibelab/claude-skills/blob/main/.claude/skills/project-bootstrap/SKILL.md) (vibelab v1.7.5)
- [Project Bootstrap README](https://github.com/vibelab/claude-skills/blob/main/.claude/skills/project-bootstrap/README.md) (vibelab v1.7.5)
