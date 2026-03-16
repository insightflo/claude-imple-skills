# Claude Project Team - Usage Guide

Comprehensive guide for using Claude Project Team's hooks, agents, templates, and skills in your development workflow.

## Quick Start (5 minutes)

### 1. Set Your Role

```bash
export CLAUDE_AGENT_ROLE="builder"
# or your specific role: reviewer, designer, maintenance-analyst, team-lead, etc.
```

### 2. Start Claude Code

```bash
cd /path/to/your-project
claude
```

### 3. Try Basic Commands

```
> /impact src/core/payment.ts
> /architecture
> /deps show payment
> /changelog payment
```

### 4. Read This Guide

Continue reading sections relevant to your role.

---

## Agent System

### Available Agents

Claude Project Team v4.0 provides two tiers of agents: Agent Teams leads that orchestrate work natively via the Task tool, and core worker agents that execute tasks.

#### Agent Teams Leads (.claude/agents/)

These agents orchestrate the team by spawning worker subagents via Claude's native Task tool.

| Agent | Role | Responsibility | Tools |
|-------|------|-----------------|-------|
| **team-lead** | Orchestration | Request intake, task decomposition, worker coordination | Read, Write, Edit, Task |
| **architecture-lead** | Technical Leadership | Design decisions, standards, VETO authority | Read, Write, Edit, Task |
| **qa-lead** | Quality Assurance | Quality gates, test strategy, release approval | Read, Write, Edit, Task |
| **design-lead** | Design Leadership | Design system, UI/UX standards, design review | Read, Write, Edit, Task |

#### Core Worker Agents (project-team/agents/)

These agents are invoked as subagents by leads (team mode) or directly by the user (lite/standard/full modes).

| Agent | Role | Responsibility | Tools |
|-------|------|-----------------|-------|
| **Builder** | Implementation | Code implementation, feature development, testing | Read, Write, Edit |
| **Reviewer** | Code Review | Quality review, standards enforcement, feedback | Read, Write, Edit |
| **Designer** | Design | UI/UX design, design system application | Read, Write, Edit |
| **MaintenanceAnalyst** | Operations | Documentation, technical debt, refactoring analysis | Read, Write, Edit |

#### Domain-Specific Agent Templates (project-team/agents/templates/)

| Agent | Role | Responsibility |
|-------|------|-----------------|
| **PartLeader** | Domain Head | Coordinate domain tasks, interface management |
| **DomainDesigner** | Domain Design | UI/service design for domain |
| **DomainDeveloper** | Implementation | Code implementation and testing |

### Setting Agent Role

#### In Claude Code

```
> /set-role builder
> /set-role reviewer
> /set-role team-lead
```

#### Via Environment Variable

```bash
export CLAUDE_AGENT_ROLE="builder"
claude
```

#### In settings.json

```json
{
  "agentConfig": {
    "defaultRole": "builder",
    "roleConfig": {
      "builder": {
        "riskLevel": "high"
      }
    }
  }
}
```

### Agent Permissions

Each agent has defined access rights. When you set a role, the `permission-checker` hook validates your file access:

#### Permission Levels

```
FULL    - Read and write all files
DOMAIN  - Read and write only domain files
LIMITED - Read and write specific directories
DENY    - No access (blocked operations)
```

#### Example: Payment Domain Developer

```
CAN:
  - Read: all project files
  - Write: payment/ domain
  - Write: shared/ utilities

CANNOT:
  - Write: auth/ domain
  - Write: .claude/ hooks or agents
  - Modify: core/ infrastructure
```

#### Permission Denied Error

If you see "Permission denied" when editing a file:

```
[Permission Check] Your role 'auth-developer' cannot modify 'payment/checkout.ts'
Allowed paths for auth-developer:
  - auth/**/*
  - shared/**/*
```

**Solution:**
- Switch role: `export CLAUDE_AGENT_ROLE="team-lead"`
- Or escalate to the appropriate lead agent

---

## Hook System

### What Are Hooks?

Hooks are JavaScript programs that run automatically before and after file edits to enforce standards and catch issues early.

### Hook Lifecycle

```
Claude Code Command
  |
  v
[Pre-Tool-Use Hooks]      ← Before Edit/Write
  ├─ permission-checker
  ├─ pre-edit-impact-check
  └─ risk-area-warning
  |
  v
[File Edit/Write]
  |
  v
[Post-Tool-Use Hooks]     ← After Edit/Write
  ├─ standards-validator
  ├─ design-validator
  ├─ interface-validator
  ├─ cross-domain-notifier
  ├─ architecture-updater
  └─ changelog-recorder
```

### Running Hooks Manually

You can test hooks without using Claude Code:

```bash
# Test permission checker
echo '{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "auth/login.ts",
    "old_string": "old",
    "new_string": "new"
  }
}' | CLAUDE_AGENT_ROLE="payment-developer" node ~/.claude/hooks/permission-checker.js

# Test design validator
echo '{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "src/Button.tsx",
    "content": "<div style={{color: \"red\"}}>Button</div>"
  }
}' | node ~/.claude/hooks/design-validator.js
```

### Hook Configuration

Hooks run automatically when configured in `settings.json`. View hook settings:

```bash
jq '.hooks' ~/.claude/settings.json | jq '.PreToolUse'
```

Example hook configuration:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${HOME}/.claude/hooks/permission-checker.js\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### Disabling Hooks

To temporarily disable a hook:

```bash
# In .claude/settings.local.json
{
  "hooks": {
    "disabled": [
      "design-validator.js"
    ]
  }
}
```

Or edit the hook file directly to disable specific rules.

### Hook Details

#### 1. permission-checker.js (Pre-Edit)

Validates that your current agent role has permission to edit a file.

**What it checks:**
- Current agent role (from `CLAUDE_AGENT_ROLE`)
- Target file path
- Role-specific access matrix

**Possible outcomes:**
- ✅ **Allow (silent)** - You have permission
- ❌ **Deny** - You don't have permission, edit blocked
- ⚠️ **Warn** - Permission granted but suspicious pattern detected

**Example - Blocked:**
```
[Permission Check] Your role 'auth-developer' cannot modify 'payment/checkout.ts'
Escalate to: team-lead or architecture-lead
```

#### 2. pre-edit-impact-check.js (Pre-Edit)

Analyzes what files would be affected by your change before you make it.

**What it analyzes:**
- Direct dependents (files that import this file)
- Risk level (critical/high/medium/low)
- Related tests
- Cross-domain impacts

**Example output:**
```
[Impact Analysis] src/auth/token.ts
├─ Risk Level: HIGH (security/authentication)
├─ Direct Dependents: 4 files
├─ Affected Tests: 12 test cases
└─ Cross-Domain Impact: order, payment
```

#### 3. risk-area-warning.js (Pre-Edit)

Warns about editing files in security-sensitive areas.

**Sensitive Areas:**
- `payment/`, `billing/` - Payment processing
- `auth/`, `security/` - Authentication & security
- `crypto/`, `encryption/` - Cryptography
- Core middleware and session management

**Example warning:**
```
[Risk Area] You are editing a CRITICAL file: src/payment/checkout.ts
This file handles payment processing. Changes may affect customer transactions.
Required: Full test coverage, code review, staging test

Proceed with caution!
```

#### 4. standards-validator.js (Post-Edit)

Checks code against project standards:
- Naming conventions
- Import organization
- File structure
- Comment standards

**Example violations:**
```
[Standards] src/services/getUserService.ts
├─ ❌ Function name 'getUserService' should be camelCase: 'getUserService'
├─ ⚠️ Missing JSDoc comment on function 'fetchData'
└─ ℹ️ Consider extracting string literal to constant
```

#### 5. design-validator.js (Post-Edit)

Enforces design system compliance for UI components.

**What it checks:**
- No inline styles: ❌ `style={{ color: 'red' }}`
- No hardcoded colors: ❌ `color: #3b82f6`
- Design tokens only: ✅ `color: var(--color-primary)`
- Spacing 4px multiples: ✅ `padding: 16px` or `padding: var(--space-4)`

**Example violations:**
```
[Design System] src/Button.tsx
├─ ❌ Inline style detected on line 5: style={{ padding: '15px' }}
├─ ❌ Hardcoded color on line 12: color: '#ff0000'
├─ ⚠️ Spacing not 4px multiple on line 8: padding: 15px (use 16px)
└─ ✅ Correct usage on line 3: className="button"
```

**Fix examples:**
```tsx
// Wrong
<button style={{ color: 'red', padding: '15px' }}>Click</button>

// Correct
<button className="btn btn-primary" style={{ padding: 'var(--space-4)' }}>
  Click
</button>

/* In CSS: */
.btn {
  color: var(--color-text);
  padding: var(--space-4);
}

.btn-primary {
  background-color: var(--color-primary);
}
```

#### 6. interface-validator.js (Post-Edit)

Validates API contract changes in YAML interface specs.

**What it detects:**
- Breaking changes (field removed, type changed)
- New endpoints (non-breaking)
- Impact on consuming domains

**Example breaking change:**
```
[Interface Contract BREAKING CHANGE] Domain 'payment' v2.0.0
├─ ❌ Field removed: 'amount' in POST /api/charges
├─ ❌ Field type changed: 'status' from string to enum
└─ ⚠️ Affected domains: order, billing
   Requires: consumer code updates
```

#### 7. cross-domain-notifier.js (Post-Edit)

Notifies other domains when interfaces they depend on change.

**Example notification:**
```
[Cross-Domain Notice] Changes in 'payment' domain
├─ order domain uses: POST /api/charges
├─ billing domain uses: GET /api/transactions
└─ 📧 Notifications sent to order-developer, billing-developer
```

#### 8. architecture-updater.js (Post-Edit)

Automatically updates architecture documentation when code changes.

**What it updates:**
- `.claude/architecture/domains.md` - Domain definitions
- `.claude/architecture/api-catalog.md` - API endpoints
- `.claude/architecture/layers.md` - Layer structure

**No action needed** - Happens automatically.

#### 9. changelog-recorder.js (Post-Edit)

Records all changes to `.claude/changelog/` for audit trail.

**Recorded info:**
- File changed
- Type of change (add/modify/delete)
- Timestamp
- Agent who made change
- Summary of change

**No action needed** - Happens automatically.

#### 10. quality-gate.js (Post-Edit)

Enforces quality standards at different stages:
- 2-level gates: pre-commit, pre-merge
- Checklist validation
- Test coverage checks

---

## Skills System

### What Are Skills?

Skills are Claude Code extensions that you invoke with `/` commands. They provide advanced analysis and workflow features.

### Available Skills

#### 1. /impact - Change Impact Analysis

Analyzes what would be affected if you modify a file.

**Syntax:**
```
/impact <file-path>
/impact analyze src/auth/login.ts
```

**What it reports:**
- Risk classification (CRITICAL/HIGH/MEDIUM/LOW)
- Direct dependents (files importing this file)
- Indirect dependents (2+ levels of imports)
- Affected domains
- Related test files
- Recommended reviewers

**Example:**
```
/impact src/auth/token-manager.ts

Result:
├─ Risk Level: CRITICAL (auth, token management)
├─ Direct Dependents: 6 files
│   ├─ api/middleware.ts
│   ├─ services/user-service.ts
│   └─ ...
├─ Indirect Dependents: 12 files
├─ Affected Domains: auth, user, order
├─ Related Tests:
│   ├─ src/auth/__tests__/token-manager.test.ts (45 cases)
│   └─ ...
└─ Recommended Reviewers:
    ├─ architecture-lead (security)
    └─ reviewer (code review)
```

#### 2. /architecture - Architecture Map

View your project's architecture structure.

**Syntax:**
```
/architecture                 # Full overview
/architecture domains         # Domain structure
/architecture api            # API catalog
/architecture layers         # Layer structure
/architecture tech           # Technology stack
/architecture <domain>       # Domain details
```

**Example - Full Overview:**
```
/architecture

Result:
Claude Project Team Architecture Map
=====================================

Domains (4):
├─ auth
│  ├─ Type: Service domain
│  ├─ Components: 6 modules
│  └─ Tests: 34 cases
├─ payment
│  ├─ Type: Core domain
│  ├─ Components: 8 modules
│  └─ Tests: 52 cases
├─ order
│  ├─ Type: Service domain
│  ├─ Components: 5 modules
│  └─ Tests: 28 cases
└─ notification
   ├─ Type: Support domain
   ├─ Components: 3 modules
   └─ Tests: 12 cases

API Endpoints (18):
├─ GET  /api/auth/session
├─ POST /api/auth/login
├─ POST /api/charges
├─ GET  /api/orders/{id}
└─ ...

Layers:
├─ API Routes (4 files)
├─ Services (12 files)
├─ Models (8 files)
├─ Repositories (6 files)
└─ Utilities (5 files)

Technology Stack:
├─ Runtime: Node.js 18
├─ Backend: Express.js
├─ Database: PostgreSQL
├─ Frontend: React 18
└─ Testing: Jest
```

**Example - Domain Details:**
```
/architecture auth

Result:
Auth Domain
===========

Overview:
├─ Description: User authentication and session management
├─ Owner: architecture-lead
├─ Status: Stable
└─ Version: 2.1.0

Files:
├─ services/
│  ├─ auth-service.ts (287 lines)
│  └─ session-service.ts (156 lines)
├─ middleware/
│  └─ auth-middleware.ts (98 lines)
├─ models/
│  ├─ user.ts (45 lines)
│  └─ session.ts (32 lines)
└─ __tests__/
   ├─ auth.test.ts (234 lines)
   └─ session.test.ts (189 lines)

Dependencies:
├─ External: jsonwebtoken, bcrypt
├─ Internal: shared/crypto, shared/logger
└─ Total: 8 dependencies

Dependents:
├─ order domain (uses: /api/auth/verify)
├─ notification domain (uses: /api/auth/session)
└─ Total: 4 dependents

Interfaces (2):
├─ auth-api.yaml (version: 1.1.0)
└─ session-api.yaml (version: 1.0.0)
```

#### 3. /deps - Dependency Graph

Show dependencies between files or domains.

**Syntax:**
```
/deps show <domain>          # Show domain dependencies
/deps analyze <file>         # Analyze file dependencies
/deps circular               # Find circular dependencies
```

**Example:**
```
/deps show payment

Result:
Payment Domain Dependencies
============================

Imports (External):
├─ stripe (3 files)
├─ pg (2 files)
└─ uuid (2 files)

Imports (Internal):
├─ shared/crypto (authentication)
├─ shared/logger (logging)
├─ shared/errors (error handling)
└─ auth/token-manager (token validation)

Imported By:
├─ order domain (checkout, fulfillment)
├─ notification domain (payment-status notifications)
└─ admin domain (transaction reports)

Circular Dependencies:
└─ None detected ✅
```

#### 4. /changelog - Change History

View change history for files or domains.

**Syntax:**
```
/changelog <domain>          # Domain change history
/changelog <file-path>       # File change history
/changelog since <date>      # Changes since date
```

**Example:**
```
/changelog payment

Result:
Payment Domain Changelog
========================

Recent Changes (last 30 days):
├─ 2026-02-07 10:34 | Modified: src/payment/checkout.ts
│  └─ Added: Support for installment payments (3 commits)
├─ 2026-02-06 15:22 | Modified: src/payment/refund.ts
│  └─ Fixed: Refund calculation for partial amounts
├─ 2026-02-05 09:45 | Added: src/payment/fraud-check.ts
│  └─ New: Fraud detection integration with Stripe
└─ 2026-02-01 14:30 | Modified: src/payment/types.ts
   └─ Updated: Payment status enum with new statuses

Summary:
├─ Files Changed: 4
├─ Total Commits: 8
├─ Authors: 2
└─ Churn: 350 lines added, 120 lines removed
```

---

## Communication Protocol

### Handoff Protocol

When handing off work between agents, use the structured handoff template:

**File:** `.claude/templates/protocol/handoff.md`

**Example Handoff:**

```markdown
# Handoff: Payment Feature Implementation

## From
- **Agent**: team-lead
- **Date**: 2026-02-08
- **Status**: Requirements finalized

## To
- **Agent**: builder
- **Priority**: P0 (urgent)
- **Deadline**: 2026-02-15

## Context
User requested installment payment support. Chief Architect approved design.
Feature scope: 3 phases, estimated 5 days.

## Completed Work
- ✅ Collected requirements
- ✅ Designed data schema
- ✅ Updated interface contracts
- ✅ Generated task list (T1.1-T1.5)

## Next Steps
- [ ] Implement Phase 1: Database migration
- [ ] Add unit tests (80% coverage target)
- [ ] Update API documentation
- [ ] Get code review from reviewer (architecture-lead for interface changes)

## Access Granted
- Write: src/payment/**
- Write: database/migrations/**
- Read: auth/, order/ (dependency check)

## Questions/Blockers
None identified. Proceed with implementation.
```

### Request Protocol

When requesting work from another agent:

**File:** `.claude/templates/protocol/request.md`

**Example:**

```markdown
# Request: Design System Update

## From
- **Role**: design-lead
- **Date**: 2026-02-08

## To
- **Role**: builder (frontend)
- **Priority**: P1

## Request
Implement color token system refactor in design.

## Specifications
- New tokens: 32 color variables
- Migration: From hardcoded colors to var(--color-*)
- Scope: All React components
- Timeline: 3 days

## Requirements
- Maintain backward compatibility during migration
- 100% coverage of existing components
- Update design token documentation
- Test in Storybook

## Deliverables
1. Updated design-tokens.css
2. Updated all components
3. Updated documentation
4. Migration guide for future components

## Success Criteria
- All tests pass
- No visual regressions in Storybook
- Zero hardcoded colors in src/
```

### Response Protocol

When responding to requests:

**File:** `.claude/templates/protocol/response.md`

**Example:**

```markdown
# Response: Design System Update

## Request ID
From: design-lead, 2026-02-08

## Status
✅ COMPLETED (2026-02-11)

## Summary
Successfully implemented color token system refactor.

## What Was Done
- ✅ Added 32 new color tokens to design-tokens.css
- ✅ Updated 48 React components (src/components/)
- ✅ Updated documentation
- ✅ All tests passing (234 test cases)

## Metrics
- Files modified: 48
- Lines added: 2,340
- Lines removed: 890
- Test coverage: 94% (up from 88%)

## Testing
- ✅ Unit tests: 234 passing
- ✅ Visual regression: Clean
- ✅ Storybook: All stories rendering correctly

## Blockers Resolved
- Initially 12 components had inline styles - all resolved
- Performance concern in large lists - optimized with CSS variables

## Next Steps Recommended
- Deploy to staging and QA verification
- Monitor browser compatibility
- Plan deprecation of old color constants

## Attached
- Migration guide: documentation/design-tokens-migration.md
- Test results: test-results.json
```

---

## Configuration Files

### .claude/settings.json (Global)

Main configuration for hooks, permissions, and integrations.

**Structure:**
```json
{
  "hooks": {
    "enabled": true,
    "PreToolUse": [...],
    "PostToolUse": [...],
    "disabled": []
  },
  "permissions": {
    "enforceRoles": true,
    "riskAreas": ["src/payment", "src/auth"],
    "requireReview": ["src/core/*"]
  },
  "agents": {
    "defaultRole": "builder",
    "roleConfig": {
      "architecture-lead": {
        "maxRiskLevel": "critical"
      }
    }
  },
  "skills": {
    "architecture": {
      "cacheEnabled": true,
      "cacheTTL": 3600
    }
  }
}
```

### .claude/settings.local.json (Project)

Override global settings for this project only.

**Example - Disable Design Validator:**
```json
{
  "hooks": {
    "disabled": ["design-validator.js"]
  }
}
```

### .claude/project-team.yaml (Optional)

Advanced configuration for complex projects.

**Example:**
```yaml
project:
  name: payment-system
  version: 2.1.0

domains:
  payment:
    owner: architecture-lead
    riskLevel: critical
    requiresReview: true
  order:
    owner: domain-designer
    riskLevel: high

hooks:
  design-validator:
    enabled: true
    rules:
      onlyDesignTokens: true
  permission-checker:
    enabled: true
    strictMode: false

skills:
  architecture:
    updateFrequency: realtime
    cacheSize: 100
  changelog:
    retention: 90days
```

### .claude/risk-areas.yaml (Security)

Define security-sensitive code areas.

**Example:**
```yaml
riskAreas:
  critical:
    - src/payment/
    - src/auth/
    - src/security/
    - src/encryption/
  highRisk:
    - src/core/
    - src/middleware/
    - database/migrations/
  mediumRisk:
    - src/api/
    - src/services/
```

---

## Team Workflows

### Daily Development

```
Morning Standup
  ├─ /architecture           # Check domain structure
  ├─ /changelog auth         # See what changed yesterday
  └─ /impact src/core/...    # Check what you're about to edit

Development
  ├─ Edit files (hooks run automatically)
  │  ├─ permission-checker validates you can edit
  │  ├─ design-validator checks UI standards
  │  └─ standards-validator checks code quality
  └─ Run tests locally

Code Review
  ├─ Handoff to reviewer (use handoff protocol)
  ├─ Reviewer runs /impact on changes
  ├─ Reviewer checks /architecture for structural issues
  └─ Post response with results

Merge
  ├─ All hooks passed
  ├─ Tests passing
  ├─ Code review approved
  └─ Changelog auto-recorded
```

### Feature Development

```
1. Create Feature Request
   └─ Submit to team-lead (team mode) or directly to builder (lite/standard/full)

2. team-lead Orchestrates (team mode)
   ├─ Decomposes into tasks via Task tool
   ├─ Spawns Builder workers for implementation
   ├─ Spawns Reviewer workers for code review
   └─ Coordinates with architecture-lead / design-lead / qa-lead

3. Builder Agents Implement
   ├─ Run /impact before changes
   ├─ Hooks enforce standards automatically
   ├─ Regular architecture checks
   └─ Cross-domain notifications auto-sent

4. Code Review
   ├─ architecture-lead reviews design decisions
   ├─ Reviewer agent reviews implementation
   └─ qa-lead approves quality

5. Merge & Deploy
   ├─ Changelog auto-recorded
   ├─ Architecture auto-updated
   └─ Feature live
```

### Cross-Domain Changes

```
If you modify an interface that other domains depend on:

1. Interface Change
   ├─ interface-validator detects breaking change
   └─ Warns about affected domains

2. Auto-Notifications
   ├─ cross-domain-notifier alerts other developers
   └─ Lists affected files

3. Coordination
   ├─ Use handoff protocol to request updates
   ├─ Wait for acknowledgment
   └─ Then merge

4. Documentation
   └─ changelog auto-records the change
```

---

## Troubleshooting

### "Permission denied" Error

```
[Permission Check] Your role 'auth-developer' cannot modify 'payment/checkout.ts'
```

**Solution:**
```bash
# Check your current role
echo $CLAUDE_AGENT_ROLE

# Switch to appropriate role
export CLAUDE_AGENT_ROLE="team-lead"

# Or escalate to a lead agent with broader access
# Ask architecture-lead or team-lead to make the change
```

### Design Validator Blocking Valid Code

```
[Design System] Your code has violations
```

**Solution:**
See [design-validator.js](#5-design-validatorjs-post-edit) section for fix examples.

### Skills Running Slowly

If `/architecture` or `/impact` is taking >10 seconds:

```bash
# Check project size
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | wc -l

# If >5000 files, exclude directories in project-team.yaml
# Create .claude/project-team.yaml with:
skills:
  impact:
    exclude:
      - node_modules/
      - .git/
```

### Skills Not Found

```
> /impact
No handler found for /impact
```

**Solution:**
```bash
# Reinstall skills
cd /path/to/project-team
./install.sh --skills-only --global --force

# Restart Claude Code
exit
claude
```

---

## Next Steps

- See [MAINTENANCE.md](./MAINTENANCE.md) for long-term management
- See [INSTALLATION.md](./INSTALLATION.md) to troubleshoot setup issues
- Review Agent Teams lead files in `.claude/agents/` (team-lead.md, architecture-lead.md, qa-lead.md, design-lead.md)
- Review worker agent files in `project-team/agents/` (Builder.md, Reviewer.md, Designer.md, MaintenanceAnalyst.md)

---

**Version:** 4.0.0
**Last Updated:** 2026-03-16
