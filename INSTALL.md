# Installation Guide

## Method 1: Plugin (Recommended)

### Step 1: Register marketplace

Add to `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "insightflo": {
      "source": {
        "source": "github",
        "repo": "insightflo/claude-impl-tools"
      }
    }
  }
}
```

### Step 2: Install plugin

```
/plugin install claude-impl-tools@insightflo
```

Done. 21 skills are now available in all projects.

### Step 3: Agent Teams (optional)

When you run `/team-orchestrate`, it auto-installs hooks and agents to the current project. Or install manually:

```bash
bash ~/.claude/plugins/cache/insightflo/claude-impl-tools/*/project-team/install.sh --local --mode=team
```

---

## Method 2: Quick Install (No plugin)

```bash
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-impl-tools/main/scripts/quick-install.sh | bash
```

Clones to `~/.claude/claude-impl-tools/` and symlinks skills. No hooks or agents — skills install them on demand.

---

## Method 3: Manual Clone

```bash
git clone https://github.com/insightflo/claude-impl-tools.git ~/.claude/claude-impl-tools
```

Then symlink skills:
```bash
for skill in ~/.claude/claude-impl-tools/skills/*/; do
  ln -sf "$skill" ~/.claude/skills/$(basename "$skill")
done
```

---

## Project-level Setup (On Demand)

Skills like `/team-orchestrate` auto-install project-level resources when needed. To install manually:

```bash
cd your-project

# Team mode (Agent Teams + tmux + governance hooks)
bash ~/.claude/claude-impl-tools/project-team/install.sh --local --mode=team

# Other modes
bash ~/.claude/claude-impl-tools/project-team/install.sh --local --mode=lite
bash ~/.claude/claude-impl-tools/project-team/install.sh --local --mode=standard
bash ~/.claude/claude-impl-tools/project-team/install.sh --local --mode=full
```

---

## Requirements

- **Claude Code CLI**: https://claude.ai/code
- **Node.js 18+**: For hook execution (optional)
- **tmux**: For Agent Teams pane auto-creation (optional)

---

## Update

### Plugin
```
/plugin update claude-impl-tools@insightflo
```

### Quick Install
```bash
cd ~/.claude/claude-impl-tools && git pull
```

---

## Uninstall

### Plugin
```
/plugin uninstall claude-impl-tools@insightflo
```

### Quick Install
```bash
# Remove skills symlinks
for skill in agile architecture changelog checkpoint context-optimize coverage deps governance-setup impact maintenance multi-ai-review multi-ai-run quality-auditor recover security-review statusline tasks-init tasks-migrate team-orchestrate whitebox workflow-guide; do
  rm -f ~/.claude/skills/$skill
done

# Remove clone
rm -rf ~/.claude/claude-impl-tools
```

### Project-level hooks
```bash
cd your-project
bash ~/.claude/claude-impl-tools/project-team/install.sh --local --uninstall
```

---

## Quick Start

```bash
claude

> /workflow          # What should I do next?
> /team-orchestrate  # Start agent team
> /multi-ai-review   # Multi-AI consensus review
```

---

**[Korean version](./INSTALL_ko.md)**
