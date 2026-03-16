# Phase 1: Project Manager Detailed Guide

## Role
Project planning, milestone definition, risk management

## Deliverable
`management/project-plan.md`

## Task Invocation

```
Task({
  subagent_type: "orchestrator",
  description: "PM: Project planning",
  prompt: `
## Role: Project Manager

You are the PM for this project. Generate the following deliverable.

## Input
- PRD: docs/planning/01-prd.md
- TRD: docs/planning/02-trd.md
- TASKS: docs/planning/06-tasks.md

## Deliverable: management/project-plan.md

Include the following:
1. Project overview (purpose, scope, success criteria)
2. Milestone definition (goals per phase, duration)
3. Risk management plan (identified risks, mitigation strategies)
4. Communication rules (reporting cadence, channels)
5. Escalation policy
6. (Required) **Governance Operationalization (Doc → Execution)**
   - Propose a single-entry verification command: `scripts/verify_all.sh` or `make verify`
   - Specify where and how governance artifacts (ADR/quality-gates/DB standards/Design system) are enforced (CI job, tests, artifact paths)
   - Governance update triggers (gate failures / new public boundaries / security posture changes)

## Notes
- Do not write implementation code
- Base content on planning documents
- Set realistic timelines
`
})
```

## Completion Criteria
- [ ] `management/project-plan.md` created
- [ ] Milestones align with Phases in TASKS.md
- [ ] At least 3 risks identified

## Sample Deliverable Structure

```markdown
# Project Plan: {Project Name}

## 1. Project Overview
- **Purpose**:
- **Scope**:
- **Success Criteria**:

## 2. Milestones
| Phase | Goal | Duration | Owner |
|-------|------|----------|-------|
| Phase 1 | ... | 1 week | backend-specialist |

## 3. Risk Management
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|

## 4. Communication
- Daily Standup: Every day at 09:00
- Weekly Review: Every Friday

## 5. Escalation
- Level 1: Team Lead
- Level 2: PM
- Level 3: Stakeholder
```
