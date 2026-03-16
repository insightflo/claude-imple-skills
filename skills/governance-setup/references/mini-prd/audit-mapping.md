# Mini-PRD to Audit Mapping

> A mapping guide for passing `/audit` checks with a Mini-PRD

---

## Overview

**Problem**: `/audit` requires 7 Socrates documents
**Solution**: The Mini-PRD contains the core content of the Socrates documents

---

## Mapping Table

| Socrates Document | Mini-PRD Field | Audit Check Item | Required |
|-------------------|----------------|------------------|----------|
| **prd.md** | purpose, features | Planning coherence | Required |
| **trd.md** | tech-stack | Architecture | Required |
| **database-design.md** | data-model | DDD | Required |
| **api-contracts.md** | api-contract | API contract | Recommended |
| **screen-spec.md** | (separate) | Screen spec | At screen design time |
| **ui-guide.md** | (separate) | UI guide | At design time |
| **test-strategy.md** | (separate) | Test strategy | At QA Phase |

---

## Required Items by Phase

### Phase 1 (Initial) - Minimum required for `/audit`

```yaml
management/mini-prd.md:
  purpose:
    description: "Project purpose in one sentence"
    audit_check: "Planning coherence - confirm presence of purpose field"

  features:
    - name: "Feature name"
      description: "Feature description"
      priority: "P0 | P1 | P2"
    audit_check: "Planning coherence - confirm presence of features array"

  tech_stack:
    frontend: "Frontend technology"
    backend: "Backend technology"
    database: "Database technology"
    audit_check: "Architecture - confirm presence of tech_stack field"
```

### Phase 2 (Elaboration) - Recommended for `/audit`

```yaml
management/mini-prd.md:
  data_model:
    entities:
      - name: "EntityName"
        fields:
          - { name: "id", type: "UUID" }
          - { name: "email", type: "string", unique: true }
    audit_check: "DDD - confirm presence of data_model.entities"

  api_contract:
    endpoints:
      - { method: "GET", path: "/api/users", response: "User[]" }
      - { method: "POST", path: "/api/users", request: "{email, name}", response: "User" }
    audit_check: "API contract - confirm presence of api_contract.endpoints"
```

### Phase 3 (Refinement) - Extra credit for `/audit`

```yaml
management/mini-prd.md:
  error_handling:
    - error: "Duplicate email"
      http_code: 409
      message: "This email is already registered"

  edge_cases:
    - case: "Network interruption"
      handling: "Retry 3 times, exponential backoff"

  performance:
    - metric: "API response time"
      target: "< 200ms (p95)"
      measure: "Datadog APM"
```

---

## `/audit` Pass Conditions

### Minimum Pass (Phase 1 only)

```yaml
# management/mini-prd.md structure
purpose: "Project purpose"
features: [...]  # minimum 3
tech_stack: {...}

# /audit validation
✅ Planning coherence: purpose, features present
✅ Architecture: tech_stack present
⚠️ DDD: data-model absent (warning)
⚠️ API contract: api-contract absent (warning)
```

### Recommended Pass (Up to Phase 2)

```yaml
# management/mini-prd.md structure
purpose: "Project purpose"
features: [...]
tech_stack: {...}
data_model: { entities: [...] }
api_contract: { endpoints: [...] }

# /audit validation
✅ Planning coherence: pass
✅ Architecture: pass
✅ DDD: data_model entities present
✅ API contract: endpoints defined
```

### Full Pass (Up to Phase 3)

```yaml
# management/mini-prd.md structure + Phase 3 items
error_handling: [...]
edge_cases: [...]
performance: [...]

# /audit validation
✅ All items pass
✅ Error handling defined
✅ Performance targets set
```

---

## `/quality-auditor` Modification Required

The current `/audit` skill requires 7 Socrates documents.
It needs to be updated to support Mini-PRD:

### Before (quality-auditor/SKILL.md)

```markdown
## Prerequisites

1. Confirm planning documents exist
   - docs/planning/01-prd.md
   - docs/planning/02-trd.md
   - docs/planning/03-database-design.md
   - ...
```

### After

```markdown
## Prerequisites

1. Confirm planning documents exist (one of the following)
   - **Option A**: 7 Socrates documents
     - docs/planning/01-prd.md
     - docs/planning/02-trd.md
     - ...
   - **Option B**: Mini-PRD (recommended)
     - management/mini-prd.md
     - Phase 1 minimum, Phase 2 recommended
```

---

## Usage Examples

### Example 1: Passing `/audit` with Mini-PRD alone

```bash
# 1. Write Mini-PRD (Phase 1 + 2)
/governance-setup
  → generate mini-prd

# 2. Run /audit
/audit
  → ✅ Mini-PRD detected
  → ✅ Planning coherence confirmed (purpose, features)
  → ✅ Architecture confirmed (tech_stack)
  → ✅ DDD confirmed (data_model)
  → ✅ Pass
```

### Example 2: Mixing Socrates + Mini-PRD

```bash
# 1. Existing Socrates documents present
docs/planning/01-prd.md
docs/planning/02-trd.md

# 2. Supplement with Mini-PRD
management/mini-prd.md
  → add data_model (pass DDD validation)
  → add api_contract (pass API contract validation)

# 3. Run /audit
/audit
  → Integrated validation of existing Socrates + Mini-PRD
```

---

## Checklist

### When Writing Mini-PRD

- [ ] **Phase 1**: purpose clearly stated (one sentence)
- [ ] **Phase 1**: at least 3 features
- [ ] **Phase 1**: tech_stack with at minimum frontend/backend/DB
- [ ] **Phase 2**: data_model with at least 2 key entities
- [ ] **Phase 2**: api_contract with at least 3 endpoints
- [ ] **Phase 3**: error_handling for key error cases
- [ ] **Phase 3**: at least 1 performance metric

### Before Running `/audit`

- [ ] Mini-PRD file location: `management/mini-prd.md`
- [ ] All Phase 1 items present
- [ ] Phase 2 items written as completely as possible
- [ ] YAML/Markdown format valid

---

**Last Updated**: 2026-03-03
