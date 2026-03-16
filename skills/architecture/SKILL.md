---
name: architecture
description: Query and visualize the full project architecture. Use this during project onboarding, before code reviews, before adding new domains, or whenever you need to understand the tech stack. Responds to questions like "show me the overall structure", "list all APIs", "what's the tech stack", or "explain the domain structure". Triggers on /architecture.
version: 1.1.0
updated: 2026-02-11
---

# Architecture Map

> **Query and visualize the full project architecture. Get a clear picture of domain structure, API catalog, layer layout, and tech stack at a glance.**

---

## Skill Triggers

- `/architecture` — Full architecture overview
- `/architecture domains` — Domain structure
- `/architecture api` — API catalog
- `/architecture layers` — Layer-by-layer structure
- `/architecture tech` — Tech stack
- `/architecture <domain-name>` — Specific domain detail
- "show me the architecture"
- "understand the overall structure"
- "list all APIs"

---

## Absolute Prohibitions

1. **Do not modify code** — this skill is read/visualize only.
2. **Do not guess at structure** — analyze based on the actual filesystem.
3. **Do not edit architecture documents directly** — that is the responsibility of the `architecture-updater.js` hook.

---

## Execution Steps

```
Receive /architecture [subcommand]
    |
    v
[1] Parse subcommand
    |
    v
[2] Check existing architecture documents (.claude/architecture/)
    |
    v
[3] Explore project structure
    |
    v
[4] Analyze by subcommand
    |
    +--> overview: full architecture overview
    +--> domains: domain structure
    +--> api: API endpoints
    +--> layers: layer structure
    +--> tech: tech stack
    +--> <domain-name>: domain detail
    |
    v
[5] Output visualization
```

---

## Subcommands

| Subcommand | Description |
|------------|-------------|
| (none) | Full architecture overview |
| `domains` | Domain structure + Mermaid diagram |
| `api` | API endpoint catalog |
| `layers` | Layer-by-layer structure + violation detection |
| `tech` | Auto-detected tech stack |
| `<domain-name>` | Detailed analysis of a specific domain |

---

## Domain Discovery Patterns

| Pattern | Example |
|---------|---------|
| `src/domains/<name>/` | `src/domains/member/` |
| `domains/<name>/` | `domains/order/` |
| `packages/<name>/` | `packages/auth/` |
| `modules/<name>/` | `modules/payment/` |

**Layers vs. Domains:**

- Layers (not domains): `api/`, `services/`, `models/`, `utils/`
- Domains (analysis targets): `order/`, `member/`, `product/`

---

## Layer Identification Patterns

| Layer | Directory Patterns |
|-------|--------------------|
| API/Route | `api/`, `routes/`, `controllers/` |
| Service | `services/`, `usecases/` |
| Model/Entity | `models/`, `entities/` |
| Schema | `schemas/`, `dto/` |
| Repository | `repositories/`, `dao/` |
| Infrastructure | `infrastructure/`, `adapters/` |
| Test | `tests/`, `__tests__/` |

---

## Tech Stack Detection

| Category | Detection Source |
|----------|------------------|
| Language | File extension distribution |
| Framework | Config files, import patterns |
| Database | Config files, ORM imports |
| Infrastructure | Docker, K8s config files |
| CI/CD | Workflow files |

```bash
# Check config files
cat package.json pyproject.toml requirements.txt 2>/dev/null | head -30

# Infrastructure config
ls Dockerfile docker-compose*.yml .github/workflows/ 2>/dev/null
```

---

## Data Source Priority

| Priority | Source |
|----------|--------|
| 1 | `.claude/architecture/*.md` (hook-generated documents) |
| 2 | `.claude/project-team.yaml` (project config) |
| 3 | Real-time filesystem scan |

---

## Hook Integration

| Aspect | Hook (`architecture-updater.js`) | Skill (`/architecture`) |
|--------|----------------------------------|------------------------|
| Trigger | Auto-runs after Write/Edit | On user request |
| Scope | Incremental, based on changed files | Full or per subcommand |
| Output | Auto-updates documents | Interactive visualization |
| Purpose | Document maintenance | Architecture understanding |

---

## Related Skill Integration

| Skill | When to Link | Purpose |
|-------|--------------|---------|
| `/deps` | After full analysis | Deep dependency analysis |
| `/impact <file>` | When a specific file is of interest | Change impact scope |
| `/changelog <domain>` | After domain detail view | Change history |
| `/coverage` | After layer analysis | Test coverage |

---

## Reference Documents

- `references/output-formats.md` — Output format details
- `references/examples.md` — Usage examples
