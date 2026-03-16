---
name: changelog
description: Query and analyze project change history and statistics. Use this before code reviews, when preparing for a deployment, when tracing change history for a specific file, or when analyzing activity by domain. Responds to questions like "recent changes", "change history for this month", or "list of bug fixes". Triggers on /changelog.
version: 1.1.0
updated: 2026-02-11
---

# Changelog Viewer

> **Query, filter, and produce statistics from the change history automatically recorded by the `changelog-recorder.js` hook.**

---

## Skill Triggers

- `/changelog` — Most recent entries for the current month
- `/changelog --since <date>` — After a specific date
- `/changelog --domain <domain>` — Specific domain
- `/changelog --type <type>` — Specific change type
- `/changelog --stats` — Change statistics
- `/changelog --file <path>` — History for a specific file
- "show me the recent change history"
- "change history for the order domain"

---

## Absolute Prohibitions

1. **Do not modify change history** — this skill is read-only.
2. **Do not edit YAML files directly** — only the `changelog-recorder.js` hook may write entries.

---

## Command Options

| Option | Description | Example |
|--------|-------------|---------|
| (none) | Most recent 20 entries for the current month | `/changelog` |
| `--since <date>` | After a specific date | `--since 2026-02-01` |
| `--until <date>` | Before a specific date | `--until 2026-02-07` |
| `--last <period>` | Last N days/weeks | `--last 7d`, `--last 2w` |
| `--domain <name>` | Domain filter | `--domain order` |
| `--type <type>` | Type filter | `--type fix` |
| `--stats` | Output statistics | `--stats` |
| `--file <path>` | File history | `--file discount_service.py` |

**Combining options**: `/changelog --domain order --type fix --last 7d`

---

## Execution Steps

```
Receive /changelog [options]
    |
    v
[1] Parse options (extract filter conditions)
    |
    v
[2] Determine target YAML files (based on date range)
    |
    v
[3] Read and parse YAML files
    |
    v
[4] Apply filters (domain, type, file, date)
    |
    v
[5] Sort (newest first)
    |
    v
[6] Output report (or statistics)
```

---

### Step 1: Parse Options

| Input | Transformed Result |
|-------|--------------------|
| `--since 2026-02-01` | `since = 2026-02-01T00:00:00` |
| `--last 7d` | `since = (today - 7 days)` |
| `--last 2w` | `since = (today - 14 days)` |
| `--domain order` | `domain = "order"` |
| `--type fix` | `type = "fix"` |

### Step 2: Determine Target YAML Files

**Storage location**: `.claude/changelog/{YYYY-MM}.yaml`

```bash
ls .claude/changelog/*.yaml
```

### Step 3: Parse YAML

```yaml
entries:
  - date: 2026-02-07T14:30:00
    type: feature
    domain: order
    files:
      - order/services/discount_service.py
    description: "Create discount_service in order"
    impact:
      - "external dependency added: member-api"
```

### Step 4: Apply Filters

1. **Date filter**: Compare against the `date` field
2. **Domain filter**: Match against `domain` field (partial match)
3. **Type filter**: Match against `type` field (exact match)
4. **File filter**: Match against `files` array (substring match)

### Step 5: Sort

Sort filtered entries in **newest-first** order (descending by date).

### Step 6: Output

See `references/output-formats.md` for detailed output format.

---

## Hook Integration

| Aspect | Hook (`changelog-recorder.js`) | Skill (`/changelog`) |
|--------|-------------------------------|----------------------|
| Trigger | Auto-runs on Write/Edit | On user request |
| Action | Appends entry to YAML | Reads YAML + filters |
| Purpose | Record changes (write) | Query changes (read) |

---

## Change Types

| Type | Detection Criteria |
|------|--------------------|
| `test` | File path contains `tests/`, `test_`, or `.test.` |
| `docs` | File extension is `.md`, `.rst`, or `.txt` |
| `feature` | New file created or new function added |
| `fix` | Comment contains fix/bug keywords |
| `refactor` | Comment contains refactor keyword |

---

## Domain Extraction Rules

| Path Pattern | Extracted Domain |
|-------------|-----------------|
| `src/domains/<domain>/...` | `<domain>` |
| `domains/<domain>/...` | `<domain>` |
| `app/services/<domain>_service.py` | `<domain>` |
| (no match) | `root` |

---

## Related Skill Integration

| Skill | When to Link | Purpose |
|-------|--------------|---------|
| `/impact <file>` | When a frequently changed file is found | Impact analysis |
| `/deps <domain>` | When cross-domain changes are found | Dependency check |
| `/coverage <file>` | When a frequently changed file is found | Coverage check |

---

## Reference Documents

- `references/output-formats.md` — Output format details
- `references/examples.md` — Usage examples
