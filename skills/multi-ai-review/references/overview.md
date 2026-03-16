# Multi-AI Review Overview

## Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Multi-AI Review Pipeline                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Stage 1: Initial Opinions (parallel execution)                     │
│  ├── 💎 Gemini CLI → opinion.md (creative perspective)               │
│  └── 🤖 Codex CLI → opinion.md (technical perspective)               │
│                                                                      │
│  Stage 2: Response Collection                                        │
│  └── Collect and format each response                               │
│                                                                      │
│  Stage 3: Chairman Synthesis                                         │
│  └── 🧠 Claude synthesizes all opinions → final report               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Features

### 1. CLI-Based Execution
- No MCP server required
- No additional API costs (subscription plans only)
- Simple configuration (YAML file)

### 2. Parallel Execution
- All members run simultaneously
- Depends on the slowest response time
- Configurable timeout

### 3. Job-Based Management
- Background execution support
- Progress polling available
- Results saved to files

## File Structure

```
skills/multi-ai-review/
├── SKILL.md                    # Skill documentation
├── council.config.yaml         # Member configuration
├── scripts/
│   ├── council.sh              # Main entry point
│   ├── council-job.sh          # Job runner
│   ├── council-job.js          # Job implementation
│   └── council-job-worker.js   # Worker
├── templates/
│   └── report.md               # Report template
└── references/
    ├── overview.md             # This file
    ├── config.md               # Configuration guide
    ├── examples.md             # Usage examples
    └── requirements.md         # Requirements
```

## Execution Modes

### One-shot (Simple)

```bash
./scripts/council.sh "Review request content"
```

### Job Mode (Fine-grained Control)

```bash
# 1. Start a job
JOB_DIR=$(./scripts/council.sh start "Review request")

# 2. Check progress
./scripts/council.sh status "$JOB_DIR"

# 3. Check results
./scripts/council.sh results "$JOB_DIR"

# 4. Clean up
./scripts/council.sh clean "$JOB_DIR"
```

## Member Roles

| Member | Role | Primary Review Areas |
|--------|------|---------------------|
| 💎 Gemini | Creative Reviewer | UX, alternative ideas, innovation |
| 🤖 Codex | Technical Reviewer | Architecture, patterns, performance |
| 🧠 Claude | Chairman | Synthesis and final report |

## Error Handling

- `missing_cli`: CLI is not installed
- `timed_out`: Timeout exceeded
- `error`: Execution error
- `canceled`: User cancellation
