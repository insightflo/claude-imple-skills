# Whitebox Organization Schema

## 1. Organizational Model

Whitebox models engineering as a nested organization.

This is an extension of `agent-team`, not a replacement.

Current `agent-team`:

- one team

Whitebox DevOS:

- one PM layer
- multiple subordinate teams

## 2. Core Hierarchy

```text
Program PM
  ├── Governance Team
  ├── Architecture Team
  ├── Backend Team
  ├── Frontend Team
  ├── QA / Security Team
  └── Recovery / Ops Team
```

## 3. Team Definitions

### 3.1 Program PM

Role:

- owns mission objective
- owns team topology
- arbitrates cross-team priorities
- escalates to human operator

Default executor:

- Claude

### 3.2 Governance Team

Role:

- policy
- standards
- scope protection
- risk posture

Default executor:

- Claude

### 3.3 Architecture Team

Role:

- design decisions
- contracts
- system decomposition
- conflict rulings

Default executor:

- Claude

### 3.4 Backend Team

Role:

- APIs
- domain logic
- persistence
- tests near backend code

Default executor:

- Codex

### 3.5 Frontend Team

Role:

- UI implementation
- state management
- interaction polish
- frontend integration

Default executor:

- Gemini or Claude depending on project routing

### 3.6 QA / Security Team

Role:

- verification
- safety
- quality gates
- exploit / regression review

Default executor:

- Codex for test and code review
- Claude for risk reasoning

### 3.7 Recovery / Ops Team

Role:

- interrupted mission analysis
- retry strategy
- executor health
- resume planning

Default executor:

- Claude

## 4. Team Internal Roles

Each team may contain:

- `Lead`
- `Specialist`
- `Reviewer`

Example:

```text
Backend Team
  - Backend Lead
  - API Specialist
  - Domain Specialist
  - Test Reviewer
```

## 5. Minimal Entity Schema

### Organization

```json
{
  "mission_id": "mission-001",
  "pm": "program-pm",
  "teams": ["governance", "architecture", "backend", "frontend", "qa-security", "recovery-ops"]
}
```

### Team

```json
{
  "team_id": "backend",
  "name": "Backend Team",
  "lead_agent_id": "backend-lead",
  "default_executor": "codex",
  "members": ["backend-lead", "api-specialist", "domain-specialist"],
  "status": "running"
}
```

### Agent

```json
{
  "agent_id": "api-specialist",
  "team_id": "backend",
  "role": "specialist",
  "capability": "api",
  "preferred_executor": "codex",
  "status": "idle"
}
```

## 6. Ownership Rules

### PM owns

- mission scope
- team creation
- cross-team priorities
- final escalation to operator

### Team lead owns

- local task ordering
- team-local handoffs
- executor rerouting inside the team if policy allows

### Specialist owns

- assigned implementation or review work

### Reviewer owns

- acceptance or rejection signals inside the team

## 7. Team UI Requirements

The UI must show:

- which teams exist
- which agent belongs to which team
- which team is overloaded, idle, blocked, or degraded
- which executor each team is using
- which team currently owns a blocker or request

## 8. Team Health Model

Every team should expose:

- `idle`
- `running`
- `blocked`
- `waiting_on_other_team`
- `waiting_on_operator`
- `degraded_executor`
- `recovering`

## 9. Escalation Model

Escalation path:

1. specialist to team lead
2. team lead to PM
3. PM to human operator

Escalation causes:

- unresolved team conflict
- governance violation
- repeated executor failure
- architecture deadlock
- high-risk action request

## 10. Routing Model

Executor routing should be defined at four levels:

1. mission override
2. team default
3. agent preference
4. task-type override

The final runtime route is computed by policy, not guessed ad hoc.
