# Configuration Guide

Configuration file for setting up council members and their roles.

## Schema

```yaml
council:
  members:
    - name: claude
      command: "claude -p"
      emoji: "🧠"
      color: "CYAN"
      role: "spec-compliance"  # Spec adherence focus
      focus: ["SOLID principles", "Pattern analysis", "Correctness", "Optimization potential"]

    - name: codex
      command: "codex exec"
      emoji: "🤖"
      color: "BLUE"
      role: "technical-depth"  # Technical depth review
      focus: ["Architecture", "Design", "Feasibility", "Technical debt"]

    - name: gemini
      command: "gemini"
      emoji: "💎"
      color: "GREEN"
      role: "creative"  # Creative alternative suggestions
      focus: ["User experience", "UX", "Accessibility", "Alternative ideas"]

  # Chairman configuration
  chairman:
    # role: auto|claude|codex|gemini|...
    # - auto: Host agent acts as chairman (Claude Code => claude, Codex CLI => gemini CLI)
    role: "auto"
    description: "Synthesizes all opinions and provides final recommendation"
    # Optional: run synthesis inside council.sh via CLI (requires chairman.command)
    # command: "codex exec"  # Force Stage 3 with --chairman flag
    # command: "claude -p"  # Claude as chairman (inside council.sh)
    # command: "gemini"
  # Force stage 3 synthesis
    synthesize: false
    # Optional: if set to true, forces chairman to run just as a member
    # - name: gemini
    #   command: "gemini"
    #   emoji: "💎"
    #   color: "GREEN"
    # - name: codex
    #   command: "codex exec"
    #   emoji: "🤖"
    #   color: "BLUE"

  # Execution settings
  settings:
    timeout: 120            # Timeout seconds per agent (0 to disable)
    exclude_chairman_from_members: true  # host agent is excluded from members list by default
```

## CLI Installation Reference

- Google Gemini CLI: https://github.com/google-gemini/gemini-cli
- OpenAI Codex CLI: https://github.com/openai/codex
- GLM (Z.AI): Not supported
- Default chairman: `claude` (handles technical depth)

- Collects member opinions in parallel.
- Results are saved as `.opinion.md` files in the `council` folder
- `job.json` is used for progress tracking
- The host CLI sends a completion signal to members (e.g., "convene the council", "council assembly request", etc.)

- If a member entry with `name: done` exists, it is treated as a termination signal; defaults are used on configuration errors
- When using `role: auto` in **council.config.yaml**, various roles can be mixed:
    - `spec_compliance`: Spec adherence-focused review
    - `architecture`: Structural analysis
    - `planning`: Plan review
    - `UX`: User experience-centered evaluation
    - `security`: Security vulnerabilities and attack vector prevention
    - `accessibility`: Accessibility and i18n support
    - `i18n`: Internationalization support
    - `creative`: Creative alternative suggestions
    - `integration`: Claude final integration
- Output fields: `consensus_rate` (consensus percentage %), `consensus_reached` (whether consensus was reached)

```

  # Host agent configuration
  host:
    role: auto
    description: "Host agent synthesizes results"
    # Optional: custom command for synthesis
    # command: "claude -p"
  # settings:
    timeout: 120
    exclude_chairman_from_members: true
```
