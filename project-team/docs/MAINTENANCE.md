# Claude Project Team - Maintenance Guide

Guide for maintaining, extending, and customizing Claude Project Team in your development environment.

## Daily Maintenance

### Check System Health

Run daily or before starting work:

```bash
# Check hook status
npm test --prefix ~/.claude/hooks/

# Verify installations
ls ~/.claude/hooks/*.js | wc -l       # Should be 20
ls ~/.claude/agents/*.md | wc -l      # Should be 4 leads + 4 workers = 8+
ls project-team/agents/*.md | wc -l  # Should be 4 worker agents
```

### Monitor Hook Execution

Watch hook output in real-time:

```bash
# View recent hook logs
tail -f ~/.claude/hooks.log

# Check for errors
grep "ERROR\|FAIL" ~/.claude/hooks.log
```

### Clean Up Temporary Files

```bash
# Remove backup files older than 30 days
find ~/.claude -name "*.backup-*" -mtime +30 -delete

# Clean installation logs older than 90 days
find ~/.claude -name "install.log" -mtime +90 -delete
```

---

## Weekly Tasks

### Review Change Log

Check what changed in the project this week:

```bash
# View changes from last 7 days
ls -lt .claude/changelog/* | head -20

# Summarize by domain
for domain in auth payment order notification; do
  echo "=== $domain ==="
  ls .claude/changelog/*$domain* 2>/dev/null | wc -l
done
```

### Verify Architecture Documentation

Keep architecture docs in sync with reality:

```bash
# Regenerate architecture docs
> /architecture --refresh

# Compare old vs new
diff .claude/architecture/domains.md.old .claude/architecture/domains.md

# Commit if significant changes
git add .claude/architecture/
git commit -m "chore: update architecture docs"
```

### Review Risk Areas

Make sure sensitive areas are properly protected:

```bash
# Check permission matrix
grep -A 20 "riskLevel: critical" .claude/project-team.yaml

# Update if needed
vim .claude/project-team.yaml
```

---

## Monthly Tasks

### Update Hook Configuration

Review and optimize hook settings:

```bash
# Backup current settings
cp ~/.claude/settings.json ~/.claude/settings.json.$(date +%Y%m%d)

# Check which hooks are running
jq '.hooks.PreToolUse, .hooks.PostToolUse' ~/.claude/settings.json | less

# Disable hooks that slow down development
jq '.hooks.disabled += ["design-validator.js"]' ~/.claude/settings.json > tmp.json
mv tmp.json ~/.claude/settings.json
```

### Audit Hook Test Coverage

Ensure hooks are thoroughly tested:

```bash
# Run full test suite
npm test --prefix ~/.claude/hooks/

# Check coverage
npm run coverage --prefix ~/.claude/hooks/

# Expected: >80% coverage
```

### Review and Update Agents

Customize agents for your team:

```bash
# List Agent Teams leads
ls -la ~/.claude/agents/team-lead.md \
       ~/.claude/agents/architecture-lead.md \
       ~/.claude/agents/qa-lead.md \
       ~/.claude/agents/design-lead.md

# List worker agents
ls -la project-team/agents/{Builder,Reviewer,Designer,MaintenanceAnalyst}.md

# Edit lead agent capabilities
vim ~/.claude/agents/architecture-lead.md

# Edit worker agent capabilities
vim project-team/agents/Builder.md

# Update domain templates
vim project-team/agents/templates/DomainDeveloper.md
```

### Perform Backup

Backup your entire Claude environment:

```bash
# Full backup
tar czf ~/claude-backup-$(date +%Y%m%d).tar.gz ~/.claude/

# Verify backup
tar tzf ~/claude-backup-$(date +%Y%m%d).tar.gz | head -20

# Store securely
# mv ~/claude-backup-*.tar.gz /secure/backup/location/
```

---

## Quarterly Tasks

### Upgrade Claude Project Team

Check for and install updates:

```bash
# Check for updates
cd /path/to/project-team
git fetch origin
git log --oneline origin/main ^main | head -10

# If updates available, review changes
git log origin/main ^main --stat

# Upgrade
git pull origin main
./install.sh --global --force

# Verify upgrade
npm test
```

### Audit Project Standards

Review and update coding standards:

```bash
# Check current standards
cat contracts/standards/*.md

# Run standards validator
node ~/.claude/hooks/standards-validator.js --audit

# Update if needed
vim contracts/standards/coding-standards.md
```

### Migrate Risk Areas

Update risk area definitions as project evolves:

```bash
# Review sensitive paths
grep -r "critical\|risk" .claude/project-team.yaml

# Update as needed
# Example: Move legacy payment system from critical to high-risk
vim .claude/project-team.yaml
```

### Clean Up Architecture Files

Archive old architecture versions:

```bash
# Find files older than 3 months
find .claude/architecture -mtime +90

# Archive old versions
tar czf .claude/architecture/archive-$(date +%Y%m).tar.gz \
  $(find .claude/architecture -mtime +90)

# Keep current
find .claude/architecture -mtime +90 -delete
```

---

## Managing Hooks

### Understanding Hook Structure

Each hook is a Node.js script that:

1. **Reads** JSON from stdin (hook input)
2. **Processes** the input (validation, analysis)
3. **Outputs** JSON to stdout (hook decision)

**Hook Interface:**

```javascript
#!/usr/bin/env node
const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
const { tool_name, tool_input } = input;

// Validate
if (/* violation detected */) {
  console.log(JSON.stringify({
    decision: 'deny',
    reason: 'Detailed reason'
  }));
  process.exit(0);
}

// Warn
if (/* warning condition */) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      additionalContext: 'Warning message'
    }
  }));
  process.exit(0);
}

// Allow (silent - no output)
process.exit(0);
```

### Adding a New Hook

Create a custom hook for your project:

```bash
# 1. Create hook file
cat > ~/.claude/hooks/my-custom-hook.js << 'EOF'
#!/usr/bin/env node
// Custom validation logic here
const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));

// Your validation code
if (needsValidation) {
  console.log(JSON.stringify({
    decision: 'deny',
    reason: 'Custom validation failed'
  }));
}

process.exit(0);
EOF

# 2. Make executable
chmod +x ~/.claude/hooks/my-custom-hook.js

# 3. Add to settings.json
jq '.hooks.PostToolUse[0].hooks += [{
  "type": "command",
  "command": "node \"${HOME}/.claude/hooks/my-custom-hook.js\"",
  "timeout": 5
}]' ~/.claude/settings.json > tmp.json && mv tmp.json ~/.claude/settings.json

# 4. Test hook
echo '{"tool_name":"Write","tool_input":{"file_path":"test.txt","content":"test"}}' \
  | node ~/.claude/hooks/my-custom-hook.js
```

### Modifying Hook Rules

Customize validation rules in existing hooks:

#### Example: Update Design Token Rules

```bash
# Edit design validator
vim ~/.claude/hooks/design-validator.js

# Find DESIGN_RULES section:
# const DESIGN_RULES = {
#   inlineStyles: { severity: 'error', ... },
#   hardcodedColors: { severity: 'error', ... },
#   ...
# }

# Modify rules as needed, e.g.:
# Change spacing multiple from 4px to 8px:
# spacingMultiple: 8

# Test changes
npm test --prefix ~/.claude/hooks/
```

#### Example: Add New Risk Area

```bash
# Edit permission checker
vim ~/.claude/hooks/permission-checker.js

# Find PERMISSION_MATRIX section and add:
const domain = filePath.match(/src\/(\w+)/)?.[1];
if (filePath.includes('src/newarea/')) {
  // Add custom permission logic
}

# Test changes
npm test
```

### Disabling/Enabling Hooks

Temporarily disable hooks without uninstalling:

```bash
# Disable specific hook
jq '.hooks.disabled += ["design-validator.js"]' \
  ~/.claude/settings.json > tmp.json && mv tmp.json ~/.claude/settings.json

# Re-enable hook
jq '.hooks.disabled -= ["design-validator.js"]' \
  ~/.claude/settings.json > tmp.json && mv tmp.json ~/.claude/settings.json

# Verify
jq '.hooks.disabled' ~/.claude/settings.json
```

### Testing Hooks

Run unit tests:

```bash
# Run all hook tests
npm test --prefix ~/.claude/hooks/

# Run specific hook test
npm test -- permission-checker.test.js

# Run with coverage
npm run coverage --prefix ~/.claude/hooks/
```

Manual testing:

```bash
# Test permission checker
export CLAUDE_AGENT_ROLE="developer"
echo '{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "src/auth/login.ts",
    "old_string": "old",
    "new_string": "new"
  }
}' | node ~/.claude/hooks/permission-checker.js

# Should see permission decision
```

---

## Managing Architecture Documents

### Automatic Architecture Updates

Architecture documents update automatically via `architecture-updater.js` hook.

**What gets auto-updated:**
- `.claude/architecture/domains.md` - Domain definitions
- `.claude/architecture/api-catalog.md` - API endpoints
- `.claude/architecture/layers.md` - Layer structure
- `.claude/architecture/dependencies.md` - Dependency graph

**When updates happen:**
- After any Write/Edit to code files
- Parses imports, exports, API routes
- Rebuilds dependency graph
- Updates documentation

### Manual Architecture Refresh

Force architecture refresh:

```bash
# Trigger full rebuild
> /architecture --refresh

# Or manually
rm .claude/architecture/*.md
touch .claude/architecture/domains.md
# Next file edit will regenerate all docs
```

### Architecture File Format

Standard architecture document format:

```markdown
---
domain: payment
version: 2.1.0
owner: architecture-lead
status: stable
updated: 2026-02-08
---

# Payment Domain

## Description
Payment processing and transaction management.

## Structure
\`\`\`
src/payment/
├─ services/
│  ├─ payment-service.ts
│  └─ refund-service.ts
├─ models/
│  └─ transaction.ts
└─ __tests__/
\`\`\`

## API Endpoints
- POST /api/charges
- GET /api/charges/{id}
- POST /api/refunds

## Dependencies
- stripe
- pg
- uuid

## Dependents
- order (checkout)
- notification (payment-status)
- admin (transaction-reports)
```

---

## Managing Changelog

### Automatic Changelog Recording

Changelog auto-recorded via `changelog-recorder.js` hook.

**Recorded in:** `.claude/changelog/`

**Format:**
```markdown
# 2026-02-08 10:34 | Modified: src/payment/checkout.ts
- **Agent**: payment-developer
- **Type**: feature
- **Summary**: Added installment payment support
- **Lines Changed**: +145 -32
```

### Viewing Changelog

```bash
# View changelog for domain
> /changelog payment

# View file-specific changes
> /changelog src/payment/checkout.ts

# View changes since date
> /changelog since 2026-02-01

# Manually query
ls -lt .claude/changelog/ | head -20
```

### Archiving Changelog

Archive old changelog entries:

```bash
# Archive entries older than 90 days
tar czf .claude/changelog/archive-2025-11.tar.gz \
  $(find .claude/changelog -mtime +90)

# Remove after archiving
find .claude/changelog -mtime +90 -delete
```

---

## Managing Agents

### Agent File Structure

Agents are split across two directories: leads live in `.claude/agents/` (global, orchestrate via Task tool), workers live in `project-team/agents/` (installed locally, executed as subagents).

```
~/.claude/agents/                     # Agent Teams leads (orchestrators)
├─ team-lead.md                       # Overall coordination & task decomposition
├─ architecture-lead.md               # Technical standards & VETO authority
├─ qa-lead.md                         # Quality gates & release approval
└─ design-lead.md                     # Design system & consistency

project-team/agents/                  # Core worker agents (subagents)
├─ Builder.md                         # Implementation execution
├─ Reviewer.md                        # Code review & QA
├─ Designer.md                        # Design specialist
├─ MaintenanceAnalyst.md              # System maintenance & refactoring
└─ templates/                         # Domain-specific agent templates
   ├─ PartLeader.md
   ├─ DomainDesigner.md
   └─ DomainDeveloper.md
```

### Agent Definition Format

```yaml
---
name: payment-developer
description: Payment domain implementation
tools: [Read, Write, Edit, Task]
model: opus

responsibilities:
  - Implement payment features
  - Write payment tests
  - Update payment documentation

access_rights:
  read: [all]
  write:
    - src/payment/**/*
    - database/migrations/payment_*
  cannot:
    - Modify auth domain
    - Change project structure
    - Deploy to production

constraints:
  - Must pass design-validator hook
  - Requires architecture-lead review for interface changes
  - Cannot modify payment interface without approval
```

### Customizing Agent Permissions

Edit agent file to adjust permissions:

```bash
# Edit a worker agent
vim project-team/agents/Builder.md

# Find access_rights section
# Example: Allow write to more directories
# access_rights:
#   write:
#     - src/{domain}/**/*
#     - tests/{domain}/**/*
#     - database/migrations/{domain}_*

# Verify changes don't break permission-checker
npm test -- permission-checker.test.js
```

### Adding New Agent Role

Create new domain-specific agent:

```bash
# 1. Create worker agent file (subagent)
cat > project-team/agents/templates/PaymentSpecialist.md << 'EOF'
---
name: payment-specialist
description: Payment domain implementation and design
tools: [Read, Write, Edit]
model: opus

responsibilities:
  - Implement payment features
  - Define payment interfaces
  - Review payment code

access_rights:
  read: [all]
  write:
    - contracts/interfaces/payment_*.yaml
    - src/payment/
    - docs/payment/
  cannot:
    - Modify core infrastructure
    - Delete domain code
EOF

# 2. Register in permission-checker.js
vim project-team/hooks/permission-checker.js
# Add to PERMISSION_MATRIX:
# 'payment-specialist': { level: 'high', ... }

# 3. Test
node ~/.claude/hooks/permission-checker.js --test payment-specialist
```

---

## Team Collaboration

### Setting Up Team Access

Share configuration across team:

```bash
# 1. Commit shared config to git
git add .claude/project-team.yaml
git add .claude/risk-areas.yaml
git add .claude/templates/
git commit -m "chore: add team configuration"

# 2. Team members pull
git pull

# 3. Install locally
./install.sh --local

# Now all team members have same configuration
```

### Communication Templates

Maintained in `.claude/templates/protocol/`:

- `handoff.md` - Task handoff between agents
- `request.md` - Request work from another agent
- `response.md` - Respond to requests with results

Copy to use:

```bash
# Start a request
cp .claude/templates/protocol/request.md .claude/requests/design-system-update.md
vim .claude/requests/design-system-update.md
```

### Documenting Decisions

Architecture Decision Records (ADRs) in `.claude/templates/adr/`:

```bash
# Create ADR
cp .claude/templates/adr/template.md .claude/architecture/adr/0003-payment-architecture.md

# Fill in decision details
vim .claude/architecture/adr/0003-payment-architecture.md

# Example ADR structure:
# - Title: Payment Service Architecture
# - Status: Accepted
# - Context: Why we needed to decide
# - Decision: What we decided
# - Consequences: What changed as a result
```

---

## Performance Optimization

### Optimize Hook Performance

If hooks are running slowly:

```bash
# Profile hook execution
time node ~/.claude/hooks/permission-checker.js < test-input.json

# If slow, check for:
# 1. File I/O operations (move to cache)
# 2. Expensive regex patterns (simplify)
# 3. Large array operations (optimize algorithm)

# Example optimization: cache permission matrix
const CACHE = new Map();
function getCachedPermissions(role) {
  if (!CACHE.has(role)) {
    CACHE.set(role, buildPermissions(role));
  }
  return CACHE.get(role);
}
```

### Optimize Skills Performance

If `/architecture` or `/impact` is slow:

```bash
# Check project size
find src -type f \( -name "*.ts" -o -name "*.js" \) | wc -l

# For large projects (>5000 files):
# 1. Create project-team.yaml with excludes
cat > .claude/project-team.yaml << 'EOF'
skills:
  architecture:
    exclude:
      - node_modules/
      - .git/
      - dist/
      - coverage/
    cache:
      enabled: true
      ttl: 3600
EOF

# 2. Or disable non-critical skills
jq '.hooks.disabled += ["architecture-updater.js"]' ~/.claude/settings.json > tmp.json
mv tmp.json ~/.claude/settings.json
```

---

## Troubleshooting

### Hook Errors

**Problem:** Hook appears in logs as failed

**Solution:**
```bash
# Check specific hook error
grep "my-hook" ~/.claude/hooks.log | tail -5

# Test hook directly
echo '{"tool_name":"Write","tool_input":{"file_path":"test.ts","content":""}}' \
  | node ~/.claude/hooks/my-hook.js

# Check for syntax errors
node -c ~/.claude/hooks/my-hook.js
```

### Permission Matrix Issues

**Problem:** Permissions too restrictive or too loose

**Solution:**
```bash
# Review matrix
grep -A 30 "PERMISSION_MATRIX\|access_rights" ~/.claude/hooks/permission-checker.js

# For common issues:
# 1. Role too restricted: Add write path
# 2. Unexpected denials: Check domain pattern matching
# 3. Need to escalate: Temporarily use team-lead role

# Test specific role
CLAUDE_AGENT_ROLE="my-role" node ~/.claude/hooks/permission-checker.js < test.json
```

### Architecture Documentation Out of Sync

**Problem:** Architecture docs don't match actual code

**Solution:**
```bash
# Force regeneration
rm .claude/architecture/*.md

# Trigger update by editing a file
touch src/dummy.ts && echo "" >> src/dummy.ts

# Verify regeneration
ls -la .claude/architecture/

# Clean up
git checkout src/dummy.ts
```

---

## Backup & Recovery

### Backup Procedure

Automated backups:

```bash
# Create backup script
cat > ~/bin/backup-claude.sh << 'EOF'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="${1:-~/backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/claude-backup-$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"
tar czf "$BACKUP_FILE" ~/.claude/ .claude/

echo "Backup created: $BACKUP_FILE"
echo "Size: $(du -sh $BACKUP_FILE | cut -f1)"

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/claude-backup-*.tar.gz | tail -n +11 | xargs rm -f
EOF

chmod +x ~/bin/backup-claude.sh

# Schedule daily
crontab -e
# Add: 0 2 * * * ~/bin/backup-claude.sh
```

### Restore from Backup

```bash
# List backups
ls -lhS ~/backups/claude-backup-*.tar.gz

# Restore latest
BACKUP=$(ls -t ~/backups/claude-backup-*.tar.gz | head -1)
tar xzf "$BACKUP" -C ~

# Verify restoration
ls ~/.claude/hooks/*.js | wc -l
```

---

## Advanced Customization

### Creating Hook Middleware

Chain multiple hooks:

```javascript
// .claude/hooks/multi-validator.js
const validators = [
  require('./permission-checker'),
  require('./design-validator'),
  require('./standards-validator')
];

async function validate(input) {
  for (const validator of validators) {
    const result = await validator(input);
    if (result.decision === 'deny') {
      return result;
    }
  }
  return { decision: 'allow' };
}
```

### Custom Skill Development

Create your own skill:

```bash
# 1. Create skill directory
mkdir -p ~/.claude/skills/my-skill

# 2. Create SKILL.md
cat > ~/.claude/skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: My custom skill
version: 1.0.0
---

# My Custom Skill

## Usage
/my-skill <arguments>

## Examples
/my-skill analyze src/
EOF

# 3. Claude Code will auto-discover and enable
```

---

## Next Steps

- See [USAGE.md](./USAGE.md) for daily workflow
- See [INSTALLATION.md](./INSTALLATION.md) to troubleshoot setup
- Review hook tests: `npm test --prefix ~/.claude/hooks/`
- Check project configuration: `.claude/settings.json`, `.claude/project-team.yaml`

---

**Version:** 4.0.0
**Last Updated:** 2026-03-16
