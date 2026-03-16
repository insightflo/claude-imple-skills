# Claude Project Team - Installation Guide

Complete guide for installing Claude Project Team hooks, agents, templates, and skills into your Claude Code environment.

## System Requirements

### Minimum Requirements

- **Claude Code CLI**: v0.1.0+
- **Node.js**: v18.0.0+ (for running JavaScript hooks)
- **Bash/PowerShell**: For installation scripts
- **jq**: v1.6+ (optional but recommended, for automatic settings.json merging)

### Supported Operating Systems

- macOS 12+
- Linux (Ubuntu 20.04+, Fedora 35+, Debian 11+)
- Windows 10+ (with PowerShell 5.0+)

### Optional Tools

| Tool | Version | Purpose | Install Command |
|------|---------|---------|-----------------|
| `jq` | 1.6+ | Auto-merge settings.json | `brew install jq` (macOS) / `apt-get install jq` (Linux) |
| `git` | 2.30+ | Version control | Pre-installed on most systems |

## Installation Methods

### Method 1: Global Installation (Recommended for Teams)

Install to `~/.claude/` to share hooks and skills across all your Claude Code projects.

#### macOS / Linux

```bash
cd /path/to/project-team
chmod +x ./install.sh
./install.sh --global
```

#### Windows (PowerShell)

```powershell
cd "C:\path\to\project-team"
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 -Global
```

**Advantages:**
- Hooks and skills apply to all projects
- Easier maintenance - update once, applies everywhere
- Agents available for team collaboration

### Method 2: Local Installation (Project-Specific)

Install to `.claude/` directory in your project for isolated setup.

#### macOS / Linux

```bash
cd /path/to/your-project
/path/to/project-team/install.sh --local
```

#### Windows (PowerShell)

```powershell
cd "C:\path\to\your-project"
powershell -ExecutionPolicy Bypass -File "C:\path\to\project-team\scripts\install-windows.ps1" -Local
```

**Advantages:**
- Project-specific configuration
- No impact on other projects
- Easier to manage per-project settings

### Method 3: Selective Installation

Install only specific components:

#### Hooks Only

```bash
./install.sh --hooks-only --global
```

Installs 20 JavaScript hooks that enforce standards:
- `permission-checker.js` - Role-based access control
- `pre-edit-impact-check.js` - Change impact analysis
- `risk-area-warning.js` - Security risk detection
- `standards-validator.js` - Code standard enforcement
- `design-validator.js` - Design system compliance
- `interface-validator.js` - Domain contract validation
- `cross-domain-notifier.js` - Cross-domain change notifications
- `architecture-updater.js` - Auto-update architecture docs
- `changelog-recorder.js` - Auto-record change log
- `quality-gate.js` - Quality gates
- `contract-gate.js` - API contract enforcement
- `docs-gate.js` - Documentation completeness gate
- `domain-boundary-enforcer.js` - Domain boundary violations
- `policy-gate.js` - Policy rule enforcement
- `risk-gate.js` - Risk-level gating
- `security-scan.js` - Security vulnerability scanning
- `task-completed-gate.js` - Task completion verification
- `task-sync.js` - Task state synchronization
- `teammate-idle-gate.js` - Idle agent detection

#### Skills Only

```bash
./install.sh --skills-only --global
```

Installs 4 Claude Code skills:
- `/impact` - Change impact analysis skill
- `/deps` - Dependency graph visualization
- `/changelog` - Change history query
- `/architecture` - Architecture map visualization

## Installation Walkthrough

### Step 1: Verify Prerequisites

The installer will automatically check:

```bash
# Check Node.js
node --version

# Check jq (optional)
jq --version

# Check Claude Code
claude --version
```

If any critical tool is missing, the installer will warn you and suggest installation steps.

### Step 2: Run Installation Script

Choose your installation mode:

**Interactive Mode** (Recommended for first-time users):

```bash
./install.sh
# Follow prompts to select global or local mode
```

**Direct Mode** (Scripted installation):

```bash
./install.sh --global --force --quiet
```

### Step 3: Configure Environment Variables

Set your agent role for permission checking:

```bash
# Add to your shell profile (~/.bashrc, ~/.zshrc, or ~/.profile)
export CLAUDE_AGENT_ROLE="project-manager"
export CLAUDE_PROJECT_DIR="$(pwd)"
```

**Available Roles (project-team/agents/):**
- `builder` - Implementation tasks
- `reviewer` - Quality review and approval
- `designer` - Design system and UX
- `maintenance-analyst` - Maintenance and analysis tasks

**Agent Teams Leads (.claude/agents/):**
- `team-lead` - Overall team coordination
- `architecture-lead` - Architecture decisions
- `qa-lead` - Test and quality
- `design-lead` - Design decisions

Domain-specific roles: `{domain}-lead`, `{domain}-designer`, `{domain}-builder`

### Step 4: Initialize Project

In your Claude Code session, initialize the project:

```
> /project-team init
> /impact show settings.json
> /architecture
```

If initialization is successful, you'll see confirmation and available skills.

## Post-Installation Verification

### Check Installed Files

```bash
# Global installation
ls -la ~/.claude/hooks/ | grep -c "\.js"
ls -la ~/.claude/agents/
ls -la ~/.claude/skills/

# Local installation
ls -la .claude/hooks/ | grep -c "\.js"
ls -la .claude/agents/
ls -la .claude/skills/
```

### Verify Hook Permissions

All hooks should be executable:

```bash
# Should show 'x' permission for each file
ls -l ~/.claude/hooks/*.js

# Fix if needed
chmod +x ~/.claude/hooks/*.js
```

### Test Settings Configuration

Check that settings.json contains hook definitions:

```bash
# Global
jq '.hooks' ~/.claude/settings.json | head -20

# Local
jq '.hooks' ./.claude/settings.json | head -20
```

### Run Hook Unit Tests

```bash
cd /path/to/project-team
npm install
npm test

# Or run individual test
node ./hooks/__tests__/permission-checker.test.js
```

## Troubleshooting

### Installation Issues

#### Permission Denied Error

```
Error: Permission denied: ./install.sh
```

**Solution:**
```bash
chmod +x ./install.sh
./install.sh --global
```

#### Insufficient Storage

```
Error: No space left on device
```

**Solution:**
- Free up disk space or install to different location
- Use local installation if global directory is full

#### jq Not Found

```
Warning: jq not found. Skipping auto-merge.
```

**Solution:**
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Fedora
sudo dnf install jq
```

If you can't install jq, manually merge hook entries from `.claude/hooks/project-team-hooks.json` into `.claude/settings.json`.

### Hook Issues

#### Hooks Not Running

**Problem:** Hooks are installed but not executing on Edit/Write.

**Diagnosis:**
```bash
# Check executable bit
ls -l ~/.claude/hooks/permission-checker.js
# Should show: -rwxr-xr-x

# Check syntax
node ~/.claude/hooks/permission-checker.js < /dev/null
# Should not error
```

**Solutions:**
1. Make hooks executable:
   ```bash
   chmod +x ~/.claude/hooks/*.js
   ```

2. Verify settings.json hook configuration:
   ```bash
   jq '.hooks.PreToolUse' ~/.claude/settings.json
   ```

3. Restart Claude Code session

#### Permission Checker Denying Valid Access

**Problem:** `permission-checker.js` blocks legitimate operations.

**Solution:**
1. Verify your agent role is set:
   ```bash
   echo $CLAUDE_AGENT_ROLE
   ```

2. Check role permissions in the hook file:
   ```bash
   grep -A 20 "PERMISSION_MATRIX" ~/.claude/hooks/permission-checker.js
   ```

3. If role permissions are too restrictive, update them (requires editing hook file)

#### Design Validator False Positives

**Problem:** Design validator blocks valid design patterns.

**Examples:**
- "Cannot use inline styles in test files"
- "Spacing is not a 4px multiple" (when using design tokens)

**Solutions:**
1. Verify file should not be excluded:
   ```bash
   grep -A 5 "SKIP_PATTERNS\|DESIGN_RULES" ~/.claude/hooks/design-validator.js
   ```

2. Use proper design tokens:
   ```tsx
   // Wrong
   <div style={{ padding: '15px' }}>Content</div>

   // Correct
   <div className="card" style={{ padding: 'var(--space-4)' }}>Content</div>
   ```

3. For false positives in test files, add to skip list in `design-validator.js`

### Skills Issues

#### Skills Not Available in Claude Code

**Problem:** `/impact`, `/deps`, `/architecture`, `/changelog` commands not recognized.

**Diagnosis:**
```bash
# Check skills are installed
ls ~/.claude/skills/

# Check Claude Code sees them
claude --version
```

**Solution:**
1. Reinstall skills:
   ```bash
   ./install.sh --skills-only --force
   ```

2. Restart Claude Code

3. Verify with:
   ```
   > /help
   > /skills
   ```

#### Skills Running Slowly

**Problem:** `/architecture` or `/impact` takes >5 seconds.

**Solutions:**
1. Check your project size:
   ```bash
   find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" | wc -l
   ```

2. If >5000 files, consider excluding directories in skill config:
   ```bash
   # Create .claude/project-team.yaml
   skills:
     architecture:
       exclude:
         - node_modules/
         - .git/
         - dist/
   ```

## Updating Installation

### Minor Updates (Bug Fixes)

To update to a newer version while keeping configuration:

#### macOS / Linux

```bash
cd /path/to/project-team
git pull origin main
./install.sh --global --force
```

#### Windows

```powershell
cd "C:\path\to\project-team"
git pull origin main
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 -Global -Force
```

### Major Updates (Breaking Changes)

1. Backup current configuration:
   ```bash
   cp -r ~/.claude ~/.claude.backup-$(date +%Y%m%d)
   ```

2. Uninstall current version:
   ```bash
   ./install.sh --uninstall
   ```

3. Install new version:
   ```bash
   ./install.sh --global
   ```

4. Migrate configuration manually if needed

## Uninstallation

### Complete Removal

#### macOS / Linux

```bash
./install.sh --uninstall
```

#### Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 -Uninstall
```

### What Gets Removed

- All hook files (20 JavaScript files)
- All agent definitions (4 project-team agents + templates + 4 Agent Teams leads)
- All skills (4 skills)
- All templates (ADR, protocols, interface contracts)

**Note:** `settings.json` entries are NOT automatically removed to prevent accidental configuration loss. Manually remove if desired:

```bash
# Edit ~/.claude/settings.json
# Remove or comment out the "hooks" section for project-team
```

### Partial Removal

To keep some components (e.g., keep global hooks but remove project-local):

```bash
# Remove only local installation
cd /path/to/project
./install.sh --local --uninstall
```

## Configuration After Installation

### Environment Variables

Set permanent environment variables:

#### macOS / Linux

```bash
# Add to ~/.bashrc or ~/.zshrc
export CLAUDE_AGENT_ROLE="project-manager"
export CLAUDE_PROJECT_DIR="$(pwd)"
```

Then reload:
```bash
source ~/.bashrc
# or
source ~/.zshrc
```

#### Windows (PowerShell)

```powershell
# Add to $PROFILE
[System.Environment]::SetEnvironmentVariable(
    'CLAUDE_AGENT_ROLE',
    'project-manager',
    'User'
)
```

### Project-Specific Settings

Create `.claude/settings.local.json` for project overrides:

```json
{
  "hooks": {
    "disabledHooks": [
      "design-validator.js"
    ]
  },
  "permissions": {
    "riskAreas": [
      "src/payment/",
      "src/auth/"
    ]
  }
}
```

### Risk Areas Configuration

Configure security-sensitive paths in `.claude/project-team.yaml`:

```yaml
riskAreas:
  critical:
    - src/payment/
    - src/auth/
    - src/security/
  highRisk:
    - src/core/
    - src/database/
```

## Installation Logs

Installation logs are created in:

```
~/.claude/install.log          # Global installation
./.claude/install.log          # Local installation
```

View logs:
```bash
tail -f ~/.claude/install.log
```

## Offline Installation

If you need to install without internet:

1. Download project-team on a connected machine:
   ```bash
   git clone https://github.com/your-org/project-team.git
   tar czf project-team.tar.gz project-team/
   ```

2. Transfer `project-team.tar.gz` to target machine

3. Extract and install:
   ```bash
   tar xzf project-team.tar.gz
   cd project-team
   ./install.sh --global --force
   ```

## Next Steps After Installation

1. **Set Your Agent Role:**
   ```bash
   export CLAUDE_AGENT_ROLE="your-role"
   ```

2. **Read the Usage Guide:**
   - See [USAGE.md](./USAGE.md) for comprehensive how-to

3. **Review Available Skills:**
   ```
   > /impact
   > /architecture
   > /deps
   > /changelog
   ```

4. **Configure Project Settings:**
   - Edit `.claude/settings.json` or `.claude/settings.local.json`

5. **Customize Hooks (Optional):**
   - Review hook files in `~/.claude/hooks/`
   - Modify permission rules or validation patterns as needed

## Support & Issues

For problems or questions:

1. Check [Troubleshooting](#troubleshooting) section above
2. Review hook tests: `npm test`
3. Check hook configuration: `jq '.hooks' ~/.claude/settings.json`
4. Enable verbose logging: `CLAUDE_DEBUG=1 claude`

---

**Version:** 1.0.0
**Last Updated:** 2026-02-08
