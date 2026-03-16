# CLI Setup Guide

## Required CLIs

| CLI      | Purpose                        | Check Installation     |
| -------- | ------------------------------ | ---------------------- |
| `claude` | Orchestrator (host)            | `claude --version`     |
| `codex`  | Code generation / review       | `codex --version`      |
| `gemini` | Design / UI tasks              | `gemini --version`     |

---

## Claude Code (Required)

Already in use, so it should be installed.

```bash
claude --version
```

---

## Codex CLI (OpenAI)

### Installation

```bash
npm install -g @openai/codex
```

### Authentication

```bash
codex auth
# or via environment variable
export OPENAI_API_KEY="sk-..."
```

### Test

```bash
codex -q "Write a hello world in Python"
```

### Recommended Configuration

```bash
# ~/.codexrc
model: gpt-5.3-codex
auto_approve: false
```

---

## Gemini CLI (Google)

### Installation

```bash
npm install -g @anthropic-ai/gemini-cli
# or official method
pip install google-generativeai
```

### Authentication

```bash
gemini auth
# or via environment variable
export GOOGLE_API_KEY="..."
```

### Test

```bash
gemini -p "Describe a modern button design"
```

---

## Installation Check Script

```bash
#!/bin/bash
# check-multi-ai-cli.sh

echo "=== Multi-AI CLI Check ==="

check_cli() {
  if command -v $1 &> /dev/null; then
    echo "✅ $1: $(which $1)"
  else
    echo "❌ $1: not installed"
  fi
}

check_cli claude
check_cli codex
check_cli gemini

echo ""
echo "=== Authentication Status Check ==="
claude --version 2>/dev/null && echo "✅ Claude authenticated"
codex auth status 2>/dev/null && echo "✅ Codex authenticated"
gemini auth status 2>/dev/null && echo "✅ Gemini authenticated"
```

---

## Fallback Behavior

When a CLI is not installed:

```
1. Tasks for that model → Claude handles directly
2. Warning message printed: "[multi-ai-run] codex CLI not installed. Falling back to Claude"
3. User notified of potential performance/quality differences
```

---

## Troubleshooting

### Codex Authentication Failure

```bash
# Reset API key
unset OPENAI_API_KEY
codex auth --reset
```

### Gemini Permission Error

```bash
# Check project ID
gcloud config get-value project
# or reissue API key
```

### Timeout

```yaml
# .claude/model-routing.yaml
timeouts:
    codex: 60 # seconds
    gemini: 60
    default: 30
```
