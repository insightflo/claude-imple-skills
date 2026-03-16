# Multi-AI Review Requirements

## CLI Tool Requirements

### Required CLIs

| CLI | Purpose | Installation |
|-----|---------|-------------|
| **Node.js** | Runtime | `brew install node` or https://nodejs.org/ |
| **Gemini CLI** | Creative Reviewer | https://github.com/google-gemini/gemini-cli |
| **Codex CLI** | Technical Reviewer | https://github.com/openai/codex |

### Optional CLIs

| CLI | Purpose | Installation |
|-----|---------|-------------|
| **Claude Code** | Chairman (host) | https://claude.ai/code |

## Installation Check

```bash
# Check Node.js
node --version  # v18+ recommended

# Check CLI availability
command -v claude && echo "✅ Claude Code"
command -v gemini && echo "✅ Gemini CLI"
command -v codex && echo "✅ Codex CLI"
```

## npm Dependencies

```bash
# yaml parser required
cd skills/multi-ai-review
npm install yaml
```

Or install globally:

```bash
npm install -g yaml
```

## Permission Setup

```bash
# Script execution permissions
chmod +x skills/multi-ai-review/scripts/council.sh
chmod +x skills/multi-ai-review/scripts/council-job.sh
```

## Environment Variables (Optional)

```bash
# ~/.zshrc or ~/.bashrc
export COUNCIL_CONFIG="/path/to/council.config.yaml"
export COUNCIL_JOBS_DIR="/tmp/council-jobs"
export COUNCIL_CHAIRMAN="auto"
```

## Subscription Plan Requirements

| Service | Plan | Notes |
|---------|------|-------|
| Google AI | Gemini subscription | For Gemini CLI |
| OpenAI | Codex subscription | For Codex CLI |
| Anthropic | Claude subscription | For Claude Code |

> **Note**: Since this uses CLI subscription plans rather than API keys, no additional API costs are incurred.

## System Requirements

- **OS**: macOS, Linux, Windows (WSL)
- **Memory**: Minimum 4GB RAM
- **Disk**: 100MB free space

## Troubleshooting

### "Missing runtime dependency: yaml"

```bash
cd skills/multi-ai-review
npm install yaml
```

### "command not found: gemini"

```bash
# Install Gemini CLI
npm install -g @anthropic/gemini-cli
# or
brew install gemini-cli
```

### "Permission denied"

```bash
chmod +x skills/multi-ai-review/scripts/*.sh
```

### Increase Timeout

```yaml
# council.config.yaml
council:
  settings:
    timeout: 300  # 5 minutes
```
