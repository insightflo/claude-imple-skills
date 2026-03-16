# Quality Auditor Agent Integration

> project-team QA Manager agent integration (v2.6.0)

## Audit Approval Workflow

```
/audit runs → quality score calculated
    ↓
┌─────────────────────────────────────────────────────────────┐
│  1️⃣ Request approval from QA Manager agent                  │
│  - Send approval request via SendMessage tool               │
│  - Pass quality score, key issues, and verdict              │
├─────────────────────────────────────────────────────────────┤
│  2️⃣ QA Manager verdict                                      │
│  - ✅ Approved: proceed to deployment                        │
│  - ⚠️ Conditionally approved: fix issues and re-verify       │
│  - ❌ Rejected: critical issues must be fixed                │
├─────────────────────────────────────────────────────────────┤
│  3️⃣ On failure, send feedback to Domain Specialist          │
│  - backend-specialist: backend issues                       │
│  - frontend-specialist: frontend issues                     │
│  - security-specialist: security issues                     │
└─────────────────────────────────────────────────────────────┘
```

## QA Manager Integration Patterns

### 1) Quality Gate Approval Request

```javascript
// Check result from project-team/hooks/quality-gate.js
const qualityResult = bashExecute("node project-team/hooks/quality-gate.js");
const qualityData = JSON.parse(qualityResult);

// Send approval request to QA Manager
SendMessage({
  type: "message",
  recipient: "qa-manager",
  content: `Quality gate approval request:

## Audit Result
- Total Score: ${qualityData.score}/100
- Verdict: ${qualityData.verdict}

## Key Issues
${qualityData.critical_issues.map(i => `- ${i.severity}: ${i.description}`).join('\n')}

## Approval Request
Do you approve deployment based on this audit result?`,
  summary: "Quality gate approval request"
})
```

### 2) On Failure, Send Feedback to Specialist Agents

```javascript
// When verdict is FAIL or CAUTION
if (qualityData.verdict === "FAIL" || qualityData.verdict === "CAUTION") {
  // Assign issues to the appropriate Specialist by type
  for (const issue of qualityData.critical_issues) {
    const specialist = getSpecialistForIssue(issue.type);

    Agent({
      subagent_type: specialist,
      prompt: `Quality audit requires fixes:

## Issue
- Severity: ${issue.severity}
- Type: ${issue.type}
- Description: ${issue.description}
- Affected Files: ${issue.files.join(', ')}

## Fix Request
Please fix this issue. Re-run /audit after the fix is applied.`
    });
  }
}
```

## Feedback Routing by Agent

| Issue Type | Responsible Agent | Feedback Content |
|------------|------------------|-----------------|
| **Security vulnerabilities** | security-specialist | OWASP Top 10, secret exposure, auth/authz |
| **Backend logic** | backend-specialist | API structure, data model, transactions |
| **Frontend** | frontend-specialist | UI/UX, state management, performance |
| **Architecture** | chief-architect | Design patterns, module dependencies |
| **Test coverage** | qa-manager | Request for additional tests |

## project-team Integration Prerequisites

```bash
# project-team must be installed
ls project-team/agents/qa-manager.md

# quality-gate hook must be executable
node project-team/hooks/quality-gate.js --check
```

**Behavior when project-team is not installed:**
- Operates in standalone mode without QA Manager integration
- Requests manual approval from the user

## Post-Audit Workflow

```
/audit runs
    ↓
┌─────────────────────────────────────────┐
│ Verdict                                  │
├─────────────────────────────────────────┤
│ ✅ PASS (90+)      → Approve deployment  │
│ ⚠️ CAUTION (70-89) → Minor fixes needed  │
│ ❌ FAIL (< 70)     → Major fixes needed  │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Response by issue type                   │
├─────────────────────────────────────────┤
│ Spec mismatch  → /agile iterate          │
│ Quality issues → /checkpoint             │
│ Security issues → /security-review       │
└─────────────────────────────────────────┘
    ↓
Re-audit (/audit)
    ↓
Deploy ✅
```

## Audit History

Saving audit results to `docs/reports/audit-{date}.md` allows quality trend tracking:

```markdown
## Audit History

| Date | Score | Verdict | Key Issues | Action |
|------|-------|---------|------------|--------|
| 2026-01-27 | 85 | CAUTION | Convention 75% | /agile iterate |
| 2026-01-26 | 72 | CAUTION | Security issues | /security-review re-verify |
| 2026-01-25 | 91 | PASS | - | Deploy |
```
