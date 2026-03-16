# Phase 5: DBA Detailed Guide

## Role
Define database standards, naming conventions

## Deliverable
`database/standards.md`

## Task Invocation

```
Task({
  subagent_type: "database-specialist",
  description: "DBA: Database standards definition",
  prompt: `
## Role: DBA

You are the DBA for this project. Define the database standards.

## Input
- TRD: docs/planning/02-trd.md (DB technology stack)
- DB Design: docs/planning/04-database-design.md (if available)

## Deliverable: database/standards.md

Include the following sections:

### 1. Table Naming Conventions
- Use snake_case
- Use plural nouns (users, orders)
- Prefix rules (none or per domain)
- Avoid reserved words

### 2. Column Naming Conventions
- Use snake_case
- Foreign keys: {referenced_table}_id
- Booleans: is_, has_, can_ prefixes
- Timestamps: created_at, updated_at, deleted_at

### 3. Index Policy
- Primary Key naming: pk_{table}
- Foreign Key naming: fk_{table}_{column}
- Unique Index naming: uq_{table}_{column}
- Regular Index naming: idx_{table}_{column}

### 4. Migration Rules
- File naming: {timestamp}_{description}.sql
- Rollback scripts required
- Considerations for large table changes
- Zero-downtime migration strategy

### 5. Query Standards
- Prevent N+1 queries
- Pagination required (cursor vs offset)
- Transaction isolation level
- Timeout configuration

### 6. Backup & Recovery
- Backup frequency
- Retention period
- Recovery test frequency

### (Required) Governance Operationalization (Doc → Execution)
- Propose a single-entry verification command: `scripts/verify_all.sh` or `make verify`
- Specify where DB standards are actually enforced (e.g., migration lint, naming checks, CI jobs)
- A mapping table of execution commands/artifact paths/Block vs Warn for each check
- Update triggers (incidents, performance/lock issues, domain expansion)

## Notes
- Do not write implementation code (SQL examples only)
- Define clear rules the entire team can follow
`
})
```

## Completion Criteria
- [ ] `database/standards.md` created
- [ ] Naming convention examples included
- [ ] Migration procedure defined

## Sample Deliverable

```markdown
# Database Standards

## 1. Table Naming
| Rule | Example |
|------|---------|
| snake_case | user_profiles |
| Plural | users, orders |
| No prefix | users (not tbl_users) |

## 2. Column Naming
| Type | Convention | Example |
|------|------------|---------|
| Primary Key | id | id |
| Foreign Key | {table}_id | user_id |
| Boolean | is_, has_, can_ | is_active |
| Timestamp | _at suffix | created_at |

## 3. Index Naming
| Type | Pattern | Example |
|------|---------|---------|
| PK | pk_{table} | pk_users |
| FK | fk_{table}_{col} | fk_orders_user_id |
| Unique | uq_{table}_{col} | uq_users_email |
| Index | idx_{table}_{col} | idx_orders_status |

## 4. Migration Rules
- File: `{YYYYMMDDHHMMSS}_{description}.sql`
- Always include rollback
- Test on staging first

## 5. Query Standards
- Use pagination (cursor preferred)
- Avoid SELECT *
- Use parameterized queries
- Set query timeout: 30s

## 6. Backup Policy
- Full backup: Daily
- Incremental: Hourly
- Retention: 30 days
- Recovery test: Monthly
```
