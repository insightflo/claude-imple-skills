---
name: multi-ai-run
description: Routes each agent role to the optimal AI model (Claude/Gemini/Codex) and executes it. Automatically assigns Codex for code writing, Gemini for design, and Claude for planning and orchestration. Use this skill whenever you see "use Codex for code", "use Gemini for design", "use a different AI", or "model routing" requests. Triggers on /multi-ai-run.
triggers:
  - /multi-ai-run
  - 멀티 AI 실행
  - 모델 라우팅
  - AI 분업
  - Codex로
  - Gemini로
version: 1.2.0
---

# Multi-AI Run

> **Core concept**: Agents are **roles**, models are **executors**.
>
> Automatically routes and executes the AI model best suited for each agent role.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Claude (Orchestrator)                                      │
│    ↓ Task analysis + agent role decision                    │
│    ↓ model_routing lookup                                   │
│    ├── Code writing/review → Codex CLI                      │
│    ├── Design/UI work      → Gemini CLI                     │
│    └── Planning/orchestration/complex reasoning → Claude    │
└─────────────────────────────────────────────────────────────┘
```

## Model Strengths

| Model | CLI | Strengths | Recommended Roles |
|-------|-----|-----------|-------------------|
| **Claude** | `claude` | Complex reasoning, long context, orchestration | orchestrator, architect, pm |
| **Codex** | `codex` | Code generation, refactoring, tests | backend, test, api |
| **Gemini** | `gemini` | Creativity, design sensibility, multimodal | frontend, designer, ui |

---

## Configuration Files

### CLI Model Settings: `routing.config.yaml`

You can directly specify which model each CLI uses:

```yaml
# skills/multi-ai-run/routing.config.yaml (or .claude/routing.config.yaml)
cli_models:
  gemini:
    command: "gemini"
    model: "gemini-3.1-pro-preview"  # ← change model here
    # model: "gemini-2.0-flash"      # for faster responses
    # model: "gemini-3-flash-preview" # for lightweight tasks
    args: "--output-format text"

  codex:
    command: "codex exec"
    model: "gpt-5.3-codex"           # ← change model here
    # model: "o3"                    # for stronger reasoning
    # model: "gpt-4.1"               # general purpose

  claude:
    command: "claude"
    model: "opus"                    # ← change model here
    # model: "sonnet"                # for faster responses
```

**Configuration file precedence:**
1. Project: `.claude/routing.config.yaml`
2. Global: `~/.claude/routing.config.yaml`
3. Skill default: `skills/multi-ai-run/routing.config.yaml`

---

### Per-project Settings: `.claude/model-routing.yaml`

```yaml
# .claude/model-routing.yaml
version: 1.0

# Default model (applied to agents without a specific routing entry)
default: claude

# Per-role model overrides
routing:
  # Exact role name matching
  backend-specialist: codex
  frontend-specialist: gemini
  test-specialist: codex
  api-designer: codex

  # Wildcard patterns
  design-*: gemini      # design-system, design-review, etc.
  *-developer: codex    # auth-developer, payment-developer, etc.

  # Per-domain overrides
  domains:
    auth: codex         # all tasks in the auth domain
    ui: gemini          # all tasks in the ui domain

# Per-task-type overrides (take priority over role routing)
task_types:
  code_generation: codex
  code_review: codex
  design_implementation: gemini
  design_review: gemini
  architecture: claude
  planning: claude
```

### Global Default Settings: `~/.claude/model-routing.yaml`

Used when no project-level configuration exists.

---

## Execution Flow

### Phase 1: Routing Decision

```
1. Analyze task → determine agent role
2. Look up model-routing.yaml (project > global > default)
3. Matching precedence:
   a. task_types (task type)
   b. routing (exact role name)
   c. routing wildcard
   d. domains (domain)
   e. default
```

### Phase 2: CLI Execution

```bash
# Code generation with Codex
codex -q "Implement the auth service based on: $(cat specs/auth-service.md)"

# UI implementation with Gemini
gemini -p "Create React component following design: $(cat design/button.md)"

# Complex orchestration with Claude (handled directly)
# (the orchestrator handles this itself)
```

### Phase 3: Result Integration

```
1. Collect each CLI output
2. Apply file creation/modification
3. Claude mediates on conflict detection
4. Quality validation (lint, type-check, test)
```

---

## Usage

### Basic Execution

```bash
/multi-ai-run
# → auto-routes based on model-routing.yaml
```

### Run a Specific Task

```bash
/multi-ai-run T1.2
# → executes task T1.2 with the appropriate model
```

### Force a Specific Model

```bash
/multi-ai-run --model=gemini T1.2
# → forces task T1.2 to run with Gemini
```

### Dry Run (preview execution plan only)

```bash
/multi-ai-run --dry-run
# → preview which tasks will run on which models
```

---

## CLI Requirements

```bash
# Verify required CLI installations
command -v claude  # Claude Code (host, required)
command -v codex   # OpenAI Codex CLI
command -v gemini  # Google Gemini CLI
```

### Installation Guide

**Codex CLI:**
```bash
npm install -g @openai/codex
codex auth
```

**Gemini CLI:**
```bash
npm install -g @anthropic-ai/gemini-cli  # or official installation method
gemini auth
```

> For detailed installation instructions, see `references/cli-setup.md`

---

## Example Scenarios

### Scenario 1: Full-stack Feature Implementation

```
TASKS.md:
- [ ] T1.1: Implement backend API (auth)
- [ ] T1.2: Implement frontend UI (login form)
- [ ] T1.3: Write integration tests

Execution result:
T1.1 → Codex (backend-specialist, auth domain)
T1.2 → Gemini (frontend-specialist)
T1.3 → Codex (test-specialist)
```

### Scenario 2: Design System Work

```
TASKS.md:
- [ ] T2.1: Define design tokens
- [ ] T2.2: Implement button component
- [ ] T2.3: Write Storybook stories

Execution result:
T2.1 → Gemini (design-system)
T2.2 → Gemini (frontend-specialist)
T2.3 → Codex (code_generation)
```

---

## Orchestrator Integration

Use with `/orchestrate` or `/agile auto`:

```bash
# Existing: Claude only
/orchestrate

# New: model routing enabled
/orchestrate --multi-ai

# Or enable by default via config file
# .claude/model-routing.yaml
enabled: true  # auto-applies to all orchestration
```

---

## Safeguards

1. **CLI not installed**: fallback for that model → Claude handles it directly
2. **CLI failure**: auto-retry (up to 2 times) → Claude fallback on persistent failure
3. **Conflict detection**: Claude mediates when multiple model outputs target the same file
4. **Cost warning**: estimated token usage displayed (in dry-run mode)

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/multi-ai-review` | Uses multiple AIs during the review phase |
| `/orchestrate` | Integrates via `--multi-ai` flag |
| `/cost-router` | Can be combined with cost-based model selection |

---

## FAQ

**Q: Can models other than Claude modify files inside Claude Code?**
A: Codex can read and write directly to the project folder with the `--sandbox workspace-write` option. For Gemini, Claude receives the CLI output and applies it using the Edit/Write tools.

**Q: I want only a specific task to run on a different model.**
A: Use `--model=gemini T1.2`, or add a tag in TASKS.md: `- [ ] T1.2: UI implementation [model:gemini]`

**Q: How does API cost work?**
A: Each CLI uses its own subscription plan or API credits. This is separate from Claude Code costs.

---

## File Structure

```
skills/multi-ai-run/
├── SKILL.md                    # this file
├── routing.config.yaml         # CLI model + routing configuration
└── references/
    └── cli-setup.md            # CLI installation guide
```

---

**Last Updated**: 2026-03-04 (v1.1.0 - routing.config.yaml added)
