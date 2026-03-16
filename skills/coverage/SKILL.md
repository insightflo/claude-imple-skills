---
name: coverage
description: Query and analyze test coverage. Use this to check coverage before modifying code, identify uncovered files before a PR, or track coverage trends over time. Triggers immediately on keywords like "coverage", "test pass", "uncovered areas", or "add tests".
version: 2.3.0
updated: 2026-03-12
---

# Test Coverage Map

> **Purpose**: Query test coverage, **identify uncovered areas**, and **track coverage trends**.
>
> **Role breakdown:**
> | Skill | Timing | Scope |
> |-------|--------|-------|
> | **`/coverage` (this skill)** | **Before/after changes, regular queries** | **Coverage status + uncovered areas + trends** |
> | `/audit` | Before deployment | Full audit |
> | `/impact` | Before changes | Impact analysis |

---

## Absolute Prohibitions

1. **Do not modify code directly** — that is the implementation agent's responsibility
2. **Do not change test configuration** — only perform coverage analysis
3. **Do not arbitrarily lower coverage thresholds** — follow the criteria defined in planning documents

---

## Actions to Take Immediately on Trigger

```
1. Detect project type (Python/Node.js/Rust/Go, etc.)
2. Check test environment
3. Collect coverage data
4. Identify uncovered files/areas
5. Analyze coverage trends (when available)
6. Generate report and present recommendations
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/coverage` | Full project coverage query |
| `/coverage <path>` | Coverage for a specific directory/file |
| `/coverage --uncovered` | Show only uncovered areas |
| `/coverage --threshold <n>` | Show files below n% coverage |
| `/coverage --trend` | Coverage trend (7-day/30-day) |
| `/coverage --function <file>` | Per-function coverage for a file |
| `/coverage --branch` | Detailed branch coverage |
| `/coverage --report` | Generate detailed HTML report |

---

## Execution Process

### Step 1: Detect Project Type

```bash
ls pyproject.toml setup.py requirements.txt 2>/dev/null && echo "Python"
ls package.json 2>/dev/null && echo "Node.js"
ls Cargo.toml 2>/dev/null && echo "Rust"
ls go.mod 2>/dev/null && echo "Go"
```

### Step 2: Collect Coverage Data

| Project | Command |
|---------|---------|
| **Python** | `pytest --cov=. --cov-report=json --cov-report=term-missing` |
| **Node.js (Vitest)** | `npm run test -- --coverage` |
| **Node.js (Jest)** | `npm run test -- --coverage` |
| **Rust** | `cargo tarpaulin --out Json` |
| **Go** | `go test -coverprofile=coverage.out ./...` |

### Step 3: Identify Uncovered Areas

From the coverage report, identify:
- **Uncovered lines**
- **Uncovered branches**
- **Uncovered functions**

---

## Recommendation Thresholds

| Coverage | Verdict | Action |
|----------|---------|--------|
| **80%+** | Good | Maintain this level during maintenance |
| **70–80%** | Improve | Add exception/edge case tests |
| **Below 70%** | Low | Run `/coverage --uncovered` to identify gaps, then add tests |

---

## Related Skill Integration

| Skill | When to Link | Purpose |
|-------|--------------|---------|
| `/impact <file>` | Before a change | Check coverage after impact analysis |
| `/audit` | Before deployment | Coverage validation within full audit |
| `/checkpoint` | On task completion | Coverage check during code review |

---

## Reference Documents

For detailed output examples, per-language configuration, and usage scenarios, see:

- `references/output-formats.md` — Output format details
- `references/tech-specs.md` — Per-language test runner configuration
- `references/scenarios.md` — Usage scenarios and integration examples

---

**Last Updated**: 2026-03-12 (v2.3.0 - Progressive Disclosure applied)
