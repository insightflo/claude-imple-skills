---
name: quality-auditor
description: Comprehensive quality audit before phase completion or deployment. Performs planning conformance, DDD validation, security checks, tests, and browser verification. Run this skill before deploying, before merging a PR, and after completing significant changes — no exceptions. Triggers immediately on "quality check", "pre-deploy check", "audit this", or "QA". Trigger: /audit.
version: 2.7.0
updated: 2026-03-12
---

# Quality Auditor (Pre-Deployment Comprehensive Audit)

> **Purpose**: Performs a **comprehensive quality audit against planning documents** at phase completion or before deployment.
>
> **v2.7.0**: Progressive Disclosure applied (Agent Team details moved to references/)

---

## Absolute Prohibitions

1. **Do not modify code directly** — modification is the `implementation agent`'s responsibility
2. **Do not criticize without evidence** — all feedback must cite documents under `docs/planning/`
3. **Do not audit without planning documents** — if both `management/mini-prd.md` and `docs/planning/*.md` are absent, run `/governance-setup` first

---

## Immediate Actions on Trigger

```
1. Verify planning document existence (Mini-PRD or Socrates)
2. Load context (read reference documents)
3. Two-stage review (Spec Compliance → Code Quality)
4. DDD (Demo-Driven Development) validation
5. Security validation (invoke /security-review)
6. Dynamic validation (run tests)
7. UI/UX browser validation (agent-browser CLI + Lighthouse CLI)
8. Write quality report + provide fix guidance
```

---

## Prerequisites (auto-checked at skill start)

Before starting the audit, verify the following when the skill is triggered.

1. **Planning documents exist**: at least one of `management/mini-prd.md` or `docs/planning/*.md` must be present.
   - If neither exists: "No planning documents found. Please run `/governance-setup` first."

---

## Execution Process

### Step 1: Check Planning Documents

```bash
# One of the two options
ls management/mini-prd.md 2>/dev/null        # Option A: Mini-PRD
ls docs/planning/*.md 2>/dev/null             # Option B: Socrates
```

**Mini-PRD required fields**: `purpose`, `features`, `tech_stack`
**Socrates required documents**: `01-prd.md`, `02-trd.md`, `07-coding-convention.md`

### Step 2: Two-Stage Review

#### Stage 1: Spec Compliance
- Requirements match: are the PRD's core features implemented correctly?
- Missing features: are there any gaps in edge cases or error handling?
- YAGNI violations: are there unnecessary features not specified in the plan?

#### Stage 2: Code Quality
- SOLID/Clean Code: is the structure readable and extensible?
- Security: are there vulnerabilities such as exposed API keys or SQL injection?
- Performance: are there unnecessary re-renders or waterfall fetching?

### Step 3: DDD Validation

- Demo pages: verify independent demo pages exist for each UI task
- Screenshot comparison: check that demos match mockups in `design/`
- Console integrity: confirm no browser console errors

### Step 4: Security Validation

```bash
/security-review --path src --summary
```

| Severity | Meaning | Deployable |
|----------|---------|-----------|
| CRITICAL | Immediate fix required | No — cannot deploy |
| HIGH | Fix recommended before deployment | Conditional |
| MEDIUM | Known issue | Yes — can deploy |

### Step 5: Dynamic Validation (Test Execution)

| Project Type | Test Command |
|---|---|
| **Node.js** | `npm test` |
| **Python** | `pytest` |
| **Python (Poetry)** | `poetry run pytest` |

### Step 6: UI/UX Browser Validation (optional)

> **Uses agent-browser CLI or Lighthouse CLI**

```bash
# 1. Open page + take snapshot
agent-browser open http://localhost:3000
agent-browser snapshot                    # accessibility tree (@ref based)
agent-browser screenshot audit.png        # visual capture

# 2. Lighthouse audit (accessibility + performance + SEO)
npx lighthouse http://localhost:3000 --output=json --quiet

# 3. Check console errors
agent-browser console                     # error/warning count
```

---

## Audit Result Submission

### Quality Summary

```
┌─────────────────────────────────────────┐
│ Quality Audit Result                    │
├─────────────────────────────────────────┤
│ Score: 85/100                           │
│ Verdict: CAUTION                        │
│                                         │
│ ✅ Feature conformance: 95%             │
│ ⚠️  Conventions: 75%                   │
│ Security: 88% (1 medium issue)          │
│ ✅ Tests: passed (coverage 82%)         │
└─────────────────────────────────────────┘
```

**Verdict criteria:**

| Score | Verdict | Meaning |
|-------|---------|---------|
| 90+ | PASS | Ready to deploy immediately |
| 70–89 | CAUTION | Deploy after minor fixes |
| Below 70 | FAIL | Major fixes required |

### Critical Defects

| Priority | Category | Description | Related File | Reference Document |
|----------|----------|-------------|-------------|-------------------|
| Critical | Security | Hardcoded API key | `src/api/auth.py:23` | TRD security section |
| High | Bug | Missing duplicate check | `src/api/auth.py:45` | PRD signup |

---

## Skill Integration

| Audit Result | Recommended Skill |
|---|---|
| Spec mismatch | `/agile iterate` |
| Code quality issues | `/checkpoint` → re-audit |
| Security vulnerabilities | Re-run `/security-review` |
| Deep review needed | `/multi-ai-review` |

### Agent Team Integration (project-team)

Automates the deployment approval process in collaboration with the QA Manager agent.

```
/audit → calculate quality score → request QA Manager approval
    ↓
✅ Approved → proceed to deployment
⚠️  Conditional → re-validate after fixing issues
❌ Rejected → send feedback to Specialist
```

**Detailed integration patterns**: see `references/agent-integration.md`

---

## Reference Documents

- `references/agent-integration.md` — QA Manager integration patterns, feedback routing

---

**Last Updated**: 2026-03-12 (v2.7.0 - Progressive Disclosure applied)
