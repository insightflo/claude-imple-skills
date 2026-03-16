---
name: tasks-migrate
description: Consolidates legacy task files (docs/planning/06-tasks.md, etc.) into the root TASKS.md. Use this whenever task files are scattered across multiple locations. Invoke immediately on "migrate tasks", "move 06-tasks to TASKS", or "consolidate tasks" requests.
triggers:
  - /tasks-migrate
  - 태스크 마이그레이션
  - 06-tasks를 TASKS로
  - 태스크 통합
  - migrate tasks
version: 1.0.0
---

# Tasks Migrate Skill

Scans legacy task files (docs/planning/06-tasks.md, task.md, etc.) and consolidates them into the root `TASKS.md`.

## Role

- Detect task files scattered across multiple locations
- Extract checkbox items and Task IDs
- Merge into root `TASKS.md` (with deduplication)
- Never modifies the original legacy files (safe)

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Detection Phase                                          │
├─────────────────────────────────────────────────────────────┤
│  • Check whether TASKS.md exists                            │
│  • Scan for legacy files (in priority order)                │
│  • Count discovered checkbox items                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Analysis Phase                                           │
├─────────────────────────────────────────────────────────────┤
│  • Extract Task IDs (P*-T*, T*.*)                           │
│  • Classify by layer (T0–T3, P*)                            │
│  • Detect duplicates                                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. User Confirmation                                        │
├─────────────────────────────────────────────────────────────┤
│  • Output migration summary                                 │
│  • User chooses: create / merge / cancel                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Output Phase                                             │
├─────────────────────────────────────────────────────────────┤
│  • Create or merge TASKS.md                                 │
│  • Append Migration Report section                          │
└─────────────────────────────────────────────────────────────┘
```

## Execution Stages

### Phase 1: Detection

Check for task files in the following priority order:

```bash
# Priority order
ls -la TASKS.md 2>/dev/null
ls -la docs/planning/06-tasks.md 2>/dev/null
ls -la docs/planning/tasks.md 2>/dev/null
ls -la docs/tasks.md 2>/dev/null
ls -la planning/tasks.md 2>/dev/null
ls -la .tasks.md 2>/dev/null
ls -la task.md 2>/dev/null
```

**Fallback**: If none of the above are found, search using the `*tasks*.md` pattern.

### Phase 2: Analysis

Extract checkbox items from discovered files:

**Extracted targets:**
```markdown
- [ ] Incomplete task
- [x] Completed task
- [/] In progress (optional: normalize to - [ ] (in progress))
```

**Task ID patterns:**
```
P\d+(?:-[A-Z]\d+)?(?:-T\d+)?   # P1-T1, P2-S1-T3
T\d+(?:\.\d+)+                  # T0.1, T1.12, T3.4
```

**Classification criteria:**
| ID Pattern | Layer | Section |
|------------|-------|---------|
| `T0.*` | Skeleton | `## T0 — Skeleton` |
| `T1.*` | Muscles | `## T1 — Muscles` |
| `T2.*` | Muscles Advanced | `## T2 — Muscles (advanced)` |
| `T3.*` | Skin | `## T3 — Skin` |
| `P*-*` | Phase-based | `## P* — Project/Phase tasks` |
| (no ID) | Uncategorized | `## Uncategorized` |

### Phase 3: User Confirmation

Output the migration summary and ask the user to confirm:

```markdown
## Migration Summary

### Discovered Files
| File | Tasks | Checked | Unchecked |
|------|-------|---------|-----------|
| docs/planning/06-tasks.md | 25 | 20 | 5 |
| task.md | 3 | 1 | 2 |

### ID Distribution
- T0.* (Skeleton): 5
- T1.* (Muscles): 12
- T2.* (Advanced): 3
- T3.* (Skin): 5
- P*-T* (Phase): 3
- No ID: 0

### Expected Result
- TASKS.md create/merge: 28 items
- Duplicates removed: 2
```

**Confirm via AskUserQuestion:**
- Create (generate new TASKS.md)
- Merge (append to existing TASKS.md)
- Cancel (do nothing)

### Phase 4: Output

**TASKS.md structure:**
```markdown
# TASKS.md

> Canonical task file for this project.
> Migrated: {date}

## T0 — Skeleton

- [ ] T0.1: Project structure setup
- [x] T0.2: Routing configuration

## T1 — Muscles

- [ ] T1.1: Authentication feature implementation
- [ ] T1.2: API integration

## T2 — Muscles (advanced)

- [ ] T2.1: Caching layer
- [ ] T2.2: Error handling

## T3 — Skin

- [ ] T3.1: Apply animations
- [ ] T3.2: Responsive design

## P* — Project/Phase tasks

- [x] P1-T1: Design document complete
- [ ] P2-T1: Hook implementation

---

## Migration Report

| Source | Imported | Duplicates Skipped |
|--------|----------|-------------------|
| docs/planning/06-tasks.md | 25 | 2 |
| task.md | 3 | 0 |

**Total**: 28 tasks imported
**Date**: 2026-03-03
```

## Safety Guarantees

1. **Legacy files are never modified**: Original files are never deleted or edited
2. **Deduplication**: If the same ID already exists, the existing item is preserved
3. **User confirmation required**: Always confirm via AskUserQuestion before creating or merging
4. **Dry-run support**: Use `--dry-run` to preview without making changes

## Usage Examples

```
/tasks-migrate

# or
"Migrate 06-tasks.md to TASKS.md"
"Consolidate legacy task files"
```

## Related Skills

- `/workflow-guide` — Diagnose whether migration is needed
- `/agile` — Run a sprint after migration
- `/recover` — Reference when recovering task files
