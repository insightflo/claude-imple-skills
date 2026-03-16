---
name: tasks-init
description: Interactively scaffolds a TASKS.md file from scratch. Use this at project start, whenever TASKS.md is missing, or whenever task structure is needed. Invoke immediately on "create tasks", "generate TASKS.md", "start project", or "organize to-dos" requests. Runs standalone. Triggered by /tasks-init.
triggers:
  - /tasks-init
  - 태스크 초기화
  - TASKS 만들어줘
  - 태스크 생성
  - 프로젝트 시작
  - 할일 정리
version: 2.1.0
---

# Tasks Init (Standalone)

> A lightweight skill that interactively creates a TASKS.md file.
> Fully standalone — runs independently with no external dependencies.

## Role

- Collects project information interactively
- Generates detailed tasks via **Specialist context injection**
- Auto-detects dependencies and adds metadata
- Produces a domain-guarded TASKS.md (backend/frontend separated)

**v2.0.0 update**: Dependency-aware, Domain-guarded, Specialist integration

## Execution Flow

```
/tasks-init
     ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: Collect project info (AskUserQuestion)             │
│   • Project name                                            │
│   • Key features (3–5)                                      │
│   • Tech stack (auto-detected)                              │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 2: Analyze existing code (automatic)                  │
│   • Parse package.json / pyproject.toml                     │
│   • Scan directory structure (domain detection)             │
│   • Analyze import/require dependencies                     │
│   • Collect existing TODO markers                           │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 3: Specialist context injection (v2.0 NEW)            │
│   • Backend Specialist → detail backend tasks               │
│   • Frontend Specialist → detail frontend tasks             │
│   • Security Specialist → add security-related tasks        │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 4: Generate TASKS.md (Dependency-aware)               │
│   • Auto-calculate dependencies (deps field)                │
│   • Separate by domain (domain field)                       │
│   • Auto-classify risk (risk field)                         │
│   • Detect file conflicts (files field)                     │
└─────────────────────────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 5: User confirmation + next-step guidance             │
│   → Confirm owner-based auto-routing + recommend            │
│     /agile auto or /team-orchestrate                        │
└─────────────────────────────────────────────────────────────┘
```

## Stage 1: Collect Project Info

```json
{
  "questions": [
    {
      "question": "What are the main features of your project? (e.g., user auth, product catalog, payments)",
      "header": "Key Features",
      "options": [
        {"label": "Type manually", "description": "Write the feature list yourself"}
      ],
      "multiSelect": false
    }
  ]
}
```

## Stage 2: Code Analysis

```bash
# Detect tech stack
ls package.json pyproject.toml requirements.txt Cargo.toml go.mod 2>/dev/null

# Directory structure
ls -d */ 2>/dev/null | head -10

# Collect existing TODOs
grep -rn "TODO\|FIXME\|XXX" --include="*.ts" --include="*.tsx" --include="*.py" 2>/dev/null | head -20
```

## Stage 3: TASKS.md Template

```markdown
# TASKS.md

> Created: {date}
> Project: {project_name}

---

## T0 - Skeleton (Structure)

- [ ] T0.1: Initial project setup
- [ ] T0.2: Create directory structure
- [ ] T0.3: Configure routing/navigation
- [ ] T0.4: Define dummy data structures

## T1 - Muscles (Core Features)

{Auto-generated tasks per feature}

- [ ] T1.1: {feature1} backend implementation
- [ ] T1.2: {feature1} frontend implementation
- [ ] T1.3: {feature2} backend implementation
- [ ] T1.4: {feature2} frontend implementation

## T2 - Muscles Advanced (Advanced Features)

- [ ] T2.1: Error handling
- [ ] T2.2: Loading state management
- [ ] T2.3: Caching layer

## T3 - Skin (Polish)

- [ ] T3.1: Apply design system
- [ ] T3.2: Responsive layout
- [ ] T3.3: Animations/transitions
- [ ] T3.4: Accessibility review
```

## Stage 4: Next-Step Guidance

```json
{
  "questions": [
    {
      "question": "TASKS.md has been created. What would you like to do next?",
      "header": "Next Step",
      "options": [
        {"label": "Start implementation (/agile auto)", "description": "Layer-by-layer auto implementation for ≤30 tasks"},
        {"label": "Parallel orchestration (/team-orchestrate)", "description": "Dependency-based parallel execution for 30–80 tasks"},
        {"label": "Manual", "description": "Edit tasks manually and proceed at your own pace"}
      ],
      "multiSelect": false
    }
  ]
}
```

In the generated TASKS.md, `owner` determines the default executor. Set `model` only when you need to override the owner/model-routing auto-routing.

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/tasks-migrate` | Consolidate existing legacy files |
| `/agile auto` | Execute the generated TASKS.md (≤30 tasks) |
| `/team-orchestrate` | Parallel orchestration (30–80 tasks) |
| `/governance-setup` | Planning for large-scale projects |

---

**Last Updated**: 2026-03-03 (v2.0.0)

## File Structure

```
skills/tasks-init/
├── SKILL.md                    # Skill definition
├── scripts/
│   ├── analyze.js              # Code analysis (tech stack, dependencies, TODOs)
│   ├── generate.js             # Task generation (Specialist context injection)
│   └── tasks-init.sh           # Main entry point
└── templates/
    ├── task-metadata.yaml      # Metadata format description
    └── TASKS.md                # Template for the generated TASKS.md
```

## Usage

### Run directly via CLI

```bash
# Default usage (creates TASKS.md in the current directory)
cd skills/tasks-init/scripts
./tasks-init.sh

# Specify output file
./tasks-init.sh --output ../TASKS.md

# Specify feature list
./tasks-init.sh --features "user-auth,product-catalog,payment"
```

### Run as a skill

```bash
/tasks-init
```

Claude will interactively collect project information and then generate TASKS.md.
