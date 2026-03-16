# Phase 2: Chief Architect Detailed Guide

## Role
Define technical standards, write Architecture Decision Records (ADR)

## Deliverable
`management/decisions/ADR-*.md`

## Task Invocation

```
Task({
  subagent_type: "orchestrator",
  description: "Architect: Architecture decision documents",
  prompt: `
## Role: Chief Architect

You are the Chief Architect for this project. Write ADRs (Architecture Decision Records).

## Input
- TRD: docs/planning/02-trd.md
- TASKS: docs/planning/06-tasks.md

## Deliverable: ADR files in the management/decisions/ folder

### ADR-001-tech-stack.md
Technology stack decisions (summarize if already in TRD)

### ADR-002-api-versioning.md
API versioning policy:
- Version notation (URL path vs Header)
- Backward compatibility policy
- Deprecation procedure

### ADR-003-error-handling.md
Error handling standards:
- Error response format (JSON schema)
- HTTP status code usage rules
- Client errors vs server errors

### ADR-004-naming-convention.md
Naming conventions:
- File/folder naming rules
- Function/variable naming rules
- API endpoint naming rules

## ADR Format
Each ADR follows this structure:
- Title, Status (Proposed/Accepted/Deprecated)
- Context (why the decision is needed)
- Decision (what was decided)
- Consequences (impact of the decision)

## (Required) Governance Operationalization (Doc → Execution)
- To prevent ADRs from being "documentation only", include the following:
  - Propose a single-entry verification command: `scripts/verify_all.sh` or `make verify`
  - Specify where each ADR decision is actually enforced/validated (e.g., lint rule/CI job/tests/runtime guard)
  - Artifact paths and CI artifact paths (if applicable)
  - Update triggers (repeated failures, new public boundary additions, operational/security posture changes)

## Notes
- Do not write implementation code
- Clearly document the rationale for each decision
`
})
```

## Completion Criteria
- [ ] `management/decisions/` folder created
- [ ] At least 4 ADRs written
- [ ] Each ADR has a Status specified

## ADR Template

```markdown
# ADR-00X: {Title}

## Status
Proposed | Accepted | Deprecated

## Context
{Why this decision is needed}

## Decision
{What was decided}

## Consequences

### Positive
-

### Negative
-

### Risks
-
```
