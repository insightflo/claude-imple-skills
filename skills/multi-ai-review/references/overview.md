# Multi-AI Review Overview (v4.1)

## Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Multi-AI Review Pipeline (v4.1)                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Stage 1: Initial Opinions (parallel execution)                     │
│  ├── 💎 Gemini CLI → opinion.md (creative perspective)               │
│  └── 🤖 Codex CLI → opinion.md (technical perspective w/ file:line)  │
│                                                                      │
│  Stage 2: Cross-Review (rebuttal stage)                            │
│  ├── Gemini reviews/rebuts Codex findings                          │
│  └── Codex reviews/rebuts Gemini findings                           │
│                                                                      │
│  Stage 3: Chairman Synthesis (Evidence-Weighted)                     │
│  ├── 🔍 Evidence Extraction (file:line citations)                  │
│  ├── ✅ Done-When Verification (pre-deploy grep)                    │
│  ├── ⚖️ Delta Arbitration (gap ≥15 requires verification)          │
│  └── 🧠 Claude synthesizes → Score Card → final report               │
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

### 3. Evidence Weighting (v4.1)
- Code-level evidence (file:line) outranks structural impressions
- Verification required before score increases
- Pre-deploy Done-When checks block if issues found
- Delta arbitration when score gap ≥15 points
- Codex 2× weight in code-review/project-gate when verified

### 4. Job-Based Management
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
