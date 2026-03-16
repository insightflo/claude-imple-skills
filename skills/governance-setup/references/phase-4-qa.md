# Phase 4: QA Manager Detailed Guide

## Role
Define quality standards, test strategy

## Deliverable
`management/quality-gates.md`

## Task Invocation

```
Task({
  subagent_type: "test-specialist",
  description: "QA: Quality gate definition",
  prompt: `
## Role: QA Manager

You are the QA Manager for this project. Define quality standards and test strategy.

## Input
- TASKS: docs/planning/06-tasks.md
- TRD: docs/planning/02-trd.md

## Deliverable: management/quality-gates.md

Include the following sections:

### 0. Governance Operationalization (Doc → Execution)
- (Required) **Doc → Execution linkage**: include the following:
  - Propose a single-entry verification command: `scripts/verify_all.sh` or `make verify`
  - A mapping table of execution commands/CI jobs/artifact paths/Block vs Warn for each gate item
  - Update triggers (repeated failures, new public boundary additions, operational/security posture changes)

### 1. Test Coverage Standards
- Unit Test: 80% or higher
- Integration Test: 100% for critical APIs
- E2E Test: 100% for Critical Path

### 2. Code Quality Standards
- Lint errors: 0
- TypeScript strict mode passing
- Cyclomatic complexity: 10 or less
- Code duplication: 5% or less

### 3. Performance Standards
- API response time: 200ms or less (P95)
- Page load: LCP 2.5s or less
- Bundle size limits

### 4. Security Standards
- OWASP Top 10 scan passing
- Zero dependency vulnerabilities (Critical/High)
- Sensitive data exposure scan

### 5. Code Review Checklist
- [ ] Requirements met
- [ ] Tests included
- [ ] Documentation updated
- [ ] Performance impact reviewed
- [ ] Security reviewed

### 6. Release Approval Criteria
- All tests passing
- Code review approved
- Quality gates passed
- Staging verification complete

## Notes
- Do not write implementation code
- Provide measurable criteria
- Set realistic targets
`
})
```

## Completion Criteria
- [ ] `management/quality-gates.md` created
- [ ] Each criterion includes specific numeric values
- [ ] Checklist format included

## Sample Deliverable

```markdown
# Quality Gates

## 1. Test Coverage
| Type | Target | Current |
|------|--------|---------|
| Unit | ≥ 80% | - |
| Integration | 100% (critical APIs) | - |
| E2E | 100% (happy path) | - |

## 2. Code Quality
| Metric | Threshold |
|--------|-----------|
| Lint errors | 0 |
| Type errors | 0 |
| Cyclomatic complexity | ≤ 10 |
| Duplication | ≤ 5% |

## 3. Performance
| Metric | Target |
|--------|--------|
| API P95 | ≤ 200ms |
| LCP | ≤ 2.5s |
| FID | ≤ 100ms |
| CLS | ≤ 0.1 |

## 4. Security
- [ ] OWASP Top 10 scan passed
- [ ] No critical/high vulnerabilities
- [ ] Secrets scan passed

## 5. Code Review Checklist
- [ ] Requirements met
- [ ] Tests included
- [ ] Docs updated
- [ ] Performance reviewed
- [ ] Security reviewed

## 6. Release Criteria
- [ ] All tests pass
- [ ] Code review approved
- [ ] Quality gates pass
- [ ] Staging verified
```
