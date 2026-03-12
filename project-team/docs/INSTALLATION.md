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

Automated PowerShell installation is not currently shipped for Project Team. Use Git Bash/WSL to run `./install.sh --global`, or install from macOS/Linux.

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

Automated PowerShell local installation is not currently shipped for Project Team. Use Git Bash/WSL to run `/path/to/project-team/install.sh --local`, or install from macOS/Linux.

**Advantages:**
- Project-specific configuration
- No impact on other projects
- Easier to manage per-project settings

Installs the hook set required by the selected mode. Use the Hook Modes table below and the closure commands later in this document to inspect the exact active set instead of assuming a fixed subset or a fixed hook count.

### Hook Modes

| Mode | Canonical roles | Required runtime hooks | Advisory-only gaps |
|------|-----------------|------------------------|--------------------|
| `lite` | `lead`, `builder`, `reviewer` | `permission-checker`, `policy-gate`, `security-scan`, `task-board-sync` | Everything not marked required in the capability manifest |
| `standard` | lite + `designer`, `dba`, `security-specialist` | lite + `quality-gate`, `contract-gate`, `pre-edit-impact-check` | Full-only capabilities |
| `full` | standard + compatibility profiles (`part-leader`, `domain-designer`, `domain-developer`) | standard + `docs-gate`, `risk-gate`, `domain-boundary-enforcer`, `architecture-updater`, `changelog-recorder`, `cross-domain-notifier`, `interface-validator`, `standards-validator`, `design-validator`, `task-sync` | None for documented capabilities |

Installs the Project Team maintenance skills included in the current package:
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

Set the project root and configure signed-token validation for permission checking:

```bash
# Add to your shell profile (~/.bashrc, ~/.zshrc, or ~/.profile)
export CLAUDE_PROJECT_DIR="$(pwd)"
export AGENT_JWT_SECRET="$(openssl rand -base64 32)"
```

**Canonical Roles:**
- `lead` - Coordination and approvals
- `builder` - Primary implementation
- `reviewer` - Review and approval flows
- `designer` - Standard/full design review
- `dba` - Standard/full database changes
- `security-specialist` - Standard/full security review
- Compatibility profiles (`part-leader`, `domain-designer`, `domain-developer`) are full-mode only

`permission-checker` authenticates agents via signed token (`CLAUDE_AGENT_TOKEN` or `tool_input.agent_token`), not by trusting a role env var alone.

### Step 4: Inspect the installed topology

In your Claude Code session, inspect the installed topology and closure state:

```
> /impact show settings.json
> /architecture
> /whitebox health
```

If installation is successful, the closure checks and whitebox health surface should report the active runtime topology.

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

### Verify Closure and Runtime Health

```bash
# Registry/manifest alignment
node project-team/scripts/install-registry.js validate

# Runtime health for an installed target
node project-team/scripts/install-registry.js runtime-health standard ~/.claude global

# Runtime health for a local project install
node project-team/scripts/install-registry.js runtime-health standard ./.claude local

# Canonical recovery status
node skills/recover/scripts/recover-status.js --json
```

`runtime-health` exits non-zero when required runtime artifacts are missing and reports them under `required.missing`. Advisory-only gaps are reported under `advisory.missing` without failing the command.

For mode transitions, compatibility profiles are restored only in `full` mode. Reinstalling `lite` after `full` removes those compatibility artifacts; this behavior is covered by the acceptance harness.

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

If you can't install jq, rerun `./install.sh --dry-run` to inspect the registry-backed hook configuration and merge the reported settings manually.

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
1. Verify your signed agent token is set:
   ```bash
   echo $CLAUDE_AGENT_TOKEN
   ```

2. Confirm the token secret and hook install are present:
   ```bash
   echo $AGENT_JWT_SECRET
   ls ~/.claude/hooks/permission-checker.js
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
1. Re-run the installer in the desired mode:
   ```bash
   ./install.sh --global --mode=standard --force
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

Automated PowerShell upgrade is not currently shipped for Project Team. Use Git Bash/WSL to rerun `./install.sh --global --force` after updating the repository.

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

Automated PowerShell uninstall is not currently shipped for Project Team. Use Git Bash/WSL to run `./install.sh --uninstall`, or remove installed artifacts manually.

### What Gets Removed

- Registry-owned hook files for the active install mode
- Canonical roles plus any installed compatibility profiles
- Project Team templates and managed settings artifacts
- All templates (ADR, protocols, interface contracts)

**Note:** `settings.json` entries are NOT automatically removed to prevent accidental configuration loss. Manually remove if desired:

```bash
# Edit ~/.claude/settings.json
# Remove or comment out the "hooks" section for project-team
```

### Partial Removal

If you need local-only cleanup, remove the local `.claude/` artifacts manually and then rerun `node project-team/scripts/install-registry.js runtime-health <mode> ./.claude local` to confirm the remaining state.

## Configuration After Installation

### Environment Variables

Set permanent environment variables:

#### macOS / Linux

```bash
# Add to ~/.bashrc or ~/.zshrc
export CLAUDE_PROJECT_DIR="$(pwd)"
export AGENT_JWT_SECRET="<strong-random-secret>"
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
    'AGENT_JWT_SECRET',
    '<strong-random-secret>',
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

## Installation Diagnostics

Use registry-backed diagnostics instead of log scraping:

```bash
node project-team/scripts/install-registry.js validate
node project-team/scripts/install-registry.js runtime-health standard ~/.claude global
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

1. **Set Your Agent Token:**
   ```bash
   export CLAUDE_AGENT_TOKEN="<signed-token-for-your-canonical-role>"
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
