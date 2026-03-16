# Workflow Guide Skill Integrations

> Inter-skill integration matrix and failure recovery paths

## Happy Path

```
/governance-setup (Mini-PRD planning)
    ↓
/tasks-init (TASKS.md scaffolding)
    ↓
┌─────────────────────────────────────────────────────────┐
│ Scale judgment → path branching                          │
│                                                         │
│ 📦 Small (≤30 tasks)                                     │
│   └─ /agile auto (Claude writes directly)               │
│                                                         │
│ 🏢 Medium (30~80 tasks)                                  │
│   └─ /team-orchestrate (dependency-based parallel run)  │
│                                                         │
│ 🏃 Sprint (50~200 tasks) - user review gate required    │
│   └─ /team-orchestrate --mode=sprint                   │
│                                                         │
│ 🌊 Large (80~200 tasks) - Wave profile                   │
│   └─ /team-orchestrate --mode=wave                     │
│                                                         │
│ 🏛️ Governance (10+ tasks + complex/collaborative)        │
│   └─ /governance-setup (Phase 0: PM/Architect/QA/DBA)  │
│       ↓                                                 │
│   └─ /agile auto or --mode=wave depending on scale     │
└─────────────────────────────────────────────────────────┘
    ↓
/checkpoint (review on task completion)
    ↓
/security-review (security check)
    ↓
/audit (comprehensive pre-deployment audit)
    ↓
/multi-ai-review (in-depth review)
    ↓
Deploy ✅
```

## Legacy Project Path

```
Existing codebase
    ↓
/tasks-migrate (integrate legacy tasks)
    ↓
/agile iterate (iterative improvement)
    ↓
/audit (comprehensive audit)
```

## Failure Recovery Paths

| Failure Scenario | Recovery Skill | Next Step |
|-----------------|---------------|-----------|
| CLI interrupted | `/recover` | Resume previous skill |
| Review failed | `/agile iterate` | `/checkpoint` |
| Quality gate failed | `/agile iterate` | Fix and re-verify |
| Planning unclear | `/governance-setup` | `/tasks-init` |
| Context overload | `/compress` | Retry after optimization |

---

## Natural Language → Skill Quick Mapping

```
"I don't know where to start"         → /workflow
"I have a spec, let's start coding"   → /agile auto
"Fix this feature"                    → /agile iterate
"Review the code"                     → /checkpoint
"Review this"                         → /checkpoint
"Deep review"                         → /multi-ai-review
"Convene the council"                 → /multi-ai-review
"Get opinions from multiple AIs"      → /multi-ai-review
"Run a security check"                → /security-review
"Run a quality check"                 → /audit
"Work was interrupted"                → /recover
"This is a large project"             → /governance-setup
"Governance setup"                    → /governance-setup
"Run with multi-AI"                   → /multi-ai-run
"Write code with Codex"               → /multi-ai-run --model=codex
"Design with Gemini"                  → /multi-ai-run --model=gemini
"Compress the context"                → /compress
"The document is too long"            → /compress optimize
"Run as a sprint"                     → /team-orchestrate --mode=sprint
"Run autonomously"                    → /team-orchestrate --mode=auto
"Show the kanban board"               → /whitebox status
"Show the board"                      → /whitebox status
"Check blocked tasks"                 → /whitebox status
```

---

## Quality Gate Checklist

Gates that must be passed after all implementation is complete:

| Gate | Required Skill | Pass Criteria |
|------|---------------|---------------|
| **G0: Task Review** | `/checkpoint` | 2-stage review passed |
| **G1: Comprehensive Audit** | `/audit` | Spec alignment + DDD + security + test/browser |
| **G2: In-depth Review** | `/multi-ai-review` | Multi-AI consensus (optional) |

---

## Hook System Integration

Built-in hooks in `project-team/hooks/` automate the workflow:

| Hook | Effect |
|------|--------|
| `task-sync.js` | Auto-updates TASKS.md on task completion |
| `quality-gate.js` | Quality verification before phase completion |
| `permission-checker.js` | File access control per agent role |
| `domain-boundary-enforcer.js` | Blocks cross-domain writes at PreToolUse stage |
| `design-validator.js` | Validates design system compliance |

### Hook Installation

```bash
# Run the project-team installation script
cd project-team && ./install.sh --mode standard
```
