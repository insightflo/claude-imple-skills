# Mini-PRD (Progressive)

> **Purpose**: Fast planning + `/audit` compatible
> **Version**: 2.0.0
> **Date**: {{DATE}}

---

## Phase 1: Initial Planning (Required)

> Core questions that must be answered before starting the project.

### 1.1 Project Purpose (purpose)

**Q: What do you want to build?**

Describe briefly:
```
{{PROJECT_PURPOSE}}
```

### 1.2 Core Features (features)

**Q: What are the 3-5 core features?**

| Feature | Description | Priority |
|---------|-------------|----------|
| {{FEATURE_1}} | {{DESC_1}} | P0 |
| {{FEATURE_2}} | {{DESC_2}} | P0 |
| {{FEATURE_3}} | {{DESC_3}} | P1 |

### 1.3 Technology Stack (tech-stack)

**Q: Do you have a preferred technology stack?**

| Category | Technology | Reason |
|----------|------------|--------|
| Frontend | {{FRONTEND}} | {{REASON}} |
| Backend | {{BACKEND}} | {{REASON}} |
| DB | {{DATABASE}} | {{REASON}} |
| Deploy | {{DEPLOY}} | {{REASON}} |

---

## Phase 2: Elaboration (After Skeleton Complete)

> Define specifics once the basic structure is in place.

### 2.1 Business Logic Details

**Q: What is the specific behavior of each feature?**

```
Feature: {{FEATURE_NAME}}
  Input: {{INPUT}}
  Process: {{PROCESS}}
  Output: {{OUTPUT}}
  Exception: {{EXCEPTION}}
```

### 2.2 Data Model (data-model)

**Q: What are the key entities and their relationships?**

```yaml
# Example
User:
  id: UUID
  email: string (unique)
  name: string
  created_at: datetime

Post:
  id: UUID
  user_id: UUID (FK → User)
  title: string
  content: text
  published_at: datetime?
```

### 2.3 API Contract (api-contract)

**Q: What are the key API endpoints?**

```yaml
# Example
GET /api/users
  response: User[]

POST /api/users
  request: { email, name, password }
  response: User

GET /api/users/:id
  response: User
```

---

## Phase 3: Refinement (During Muscles)

> Define details discovered as implementation progresses.

### 3.1 Error Handling

**Q: What are the error scenarios and how should they be handled?**

| Error Scenario | HTTP Code | Handling |
|----------------|-----------|----------|
| Duplicate email | 409 | "This email is already registered" |
| Auth failure | 401 | "Email or password is incorrect" |
| {{ERROR}} | {{CODE}} | {{HANDLING}} |

### 3.2 Edge Cases

**Q: What are the edge cases?**

```
Scenario: {{EDGE_CASE}}
  Current handling: {{CURRENT_HANDLING}}
  Improvement needed: {{IMPROVEMENT}}
```

### 3.3 Performance Requirements

**Q: What are the performance targets?**

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| API response time | < 200ms (p95) | Datadog APM |
| Page load | < 2s (p95) | Lighthouse |
| Concurrent users | {{NUMBER}} | Load test |

---

## Audit Compatibility Mapping

> This Mini-PRD includes the core content of the 7 Socrates documents
> to pass the planning coherence checks in `/audit`.

| Socrates Document | Mini-PRD Mapping | Status |
|-------------------|------------------|--------|
| prd.md | purpose, features | Phase 1 |
| trd.md | tech-stack | Phase 1 |
| database-design.md | data-model | Phase 2 |
| api-contracts.md | api-contract | Phase 2 |
| screen-spec.md | (per screen) | At screen design time |
| ui-guide.md | (design) | At design time |
| test-strategy.md | (testing) | At QA Phase |

---

## Completion Checklist

### Phase 1 (Initial)
- [ ] Project purpose stated
- [ ] 3-5 core features defined
- [ ] Technology stack selected

### Phase 2 (Elaboration)
- [ ] Business logic details
- [ ] Data model defined
- [ ] API contract written

### Phase 3 (Refinement)
- [ ] Error handling defined
- [ ] Edge cases identified
- [ ] Performance requirements set

---

**Author**: {{AUTHOR}}
**Reviewer**: {{REVIEWER}}
**Approver**: {{APPROVER}}
