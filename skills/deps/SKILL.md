---
name: deps
description: Visualize the project dependency graph and detect circular dependencies. Use this before refactoring, during architecture reviews, before adding new domains, or when evaluating module separation. Trigger immediately when cross-domain coupling seems high or circular references are suspected. Triggers on /deps, "dependency graph", or "check circular dependencies".
version: 1.1.0
updated: 2026-02-11
---

# Dependency Graph Analysis

> **Visualize dependency relationships across the project, detect circular dependencies, and analyze coupling between domains.**

---

## Skill Triggers

- `/deps` — Analyze all domain dependencies
- `/deps <domain>` — Dependencies for a specific domain
- `/deps --cycles` — Detect circular dependencies only
- `/deps <file> --tree` — Dependency tree for a file
- `/deps --matrix` — Cross-domain dependency matrix
- "show me the dependency graph"
- "check for circular dependencies"

---

## Absolute Prohibitions

1. **Do not modify code** — analysis only.
2. **Do not guess at dependencies** — always parse actual import/require statements.
3. **Do not ignore circular dependencies** — report any that are found.

---

## Execution Steps

```
Receive /deps [target] [options]
    |
    v
[1] Scope Resolution
    |
    v
[2] Domain Discovery
    |
    v
[3] Import/Require Parsing (Dependency Extraction)
    |
    v
[4] Graph Construction
    |
    v
[5] Cycle Detection
    |
    v
[6] Cross-Domain Coupling Analysis
    |
    v
[7] Output results
```

---

### Step 1: Scope Resolution

| Input | Scope |
|-------|-------|
| (none) | All project domains |
| Domain name | That domain's internal + external dependencies |
| File + `--tree` | File's dependency tree |

### Step 2: Domain Discovery

**Domain identification criteria (in priority order):**

1. `domains` definition in `.claude/project-team.yaml`
2. `domains/<domain-name>/` directory
3. `src/<domain-name>/` directory
4. Top-level meaningful directories

**Layers vs. Domains:**

- Layers (not domains): `api/`, `services/`, `models/`, `utils/`
- Domains (analysis targets): `order/`, `member/`, `product/`, `payment/`

### Step 3: Import/Require Parsing

| Language | Pattern |
|----------|---------|
| Python | `from x.y import z`, `import x.y` |
| JS/TS | `import ... from '...'`, `require('...')` |
| Go | `import "..."` |

```bash
# Python
grep -rn "^from \|^import " --include="*.py" <target-path>

# JS/TS
grep -rn "import.*from\|require(" --include="*.ts" --include="*.js" <target-path>
```

### Step 4: Graph Construction

```
Node: Domain or module
Edge: Dependency relationship (directed)
  - from: the depending side
  - to:   the depended-on side
  - weight: number of imports
```

### Step 5: Cycle Detection (DFS-based)

| Level | Description | Severity |
|-------|-------------|----------|
| Domain level | A -> B -> A | CRITICAL |
| Module level | A -> B -> C -> A | HIGH |
| File level | A <-> B | MEDIUM |

### Step 6: Coupling Analysis

| Metric | Description | Calculation |
|--------|-------------|-------------|
| Ca (Afferent) | Incoming dependency count | Number of external domains that depend on this domain |
| Ce (Efferent) | Outgoing dependency count | Number of external domains this domain depends on |
| I (Instability) | Instability index | Ce / (Ca + Ce) |

| Grade | Cross-dependencies | Assessment |
|-------|--------------------|-----------|
| Loose | 0–2 | Healthy |
| Moderate | 3–5 | Manageable |
| Tight | 6–10 | Consider refactoring |
| Tangled | 11+ | Refactoring required |

### Step 7: Output

See `references/output-formats.md` for detailed output format.

---

## Architecture File Generation

Analysis results are saved to `.claude/architecture/dependencies/`:

- `domain-graph.mmd` — Mermaid diagram
- `module-graph.json` — Module-level dependencies
- `api-graph.json` — API call relationships

---

## Relationship with the Impact Skill

| Aspect | `/impact` | `/deps` |
|--------|-----------|---------|
| Analysis unit | Single file | Domain / full project |
| Primary output | Impact report | Mermaid diagram |
| Core function | Change impact scope | Circular deps, coupling |
| Purpose | Pre-change analysis | Architecture review |

---

## Related Skill Integration

| Skill | When to Link | Purpose |
|-------|--------------|---------|
| `/impact <file>` | When circular dependency is found | Check file-level impact |
| `/changelog <domain>` | When dependency changes occur | Recent change history |
| `/architecture` | After full analysis | Update architecture documents |

---

## Reference Documents

- `references/output-formats.md` — Output format details
- `references/examples.md` — Usage examples
