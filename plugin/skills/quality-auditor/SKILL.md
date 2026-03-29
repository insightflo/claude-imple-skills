---
name: quality-auditor
description: "Comprehensive quality audit before phase completion or deployment. Performs planning conformance, DDD validation, security checks, tests, browser verification, and quantitative metrics. Also enforces verification-before-completion discipline — no claims without evidence. Run this skill before deploying, before merging a PR, after completing significant changes, and whenever anyone claims 'it works' or 'tests pass'. Triggers immediately on 'quality check', 'pre-deploy check', 'audit this', 'QA', 'verify this', 'does this work', '품질 검사', '배포 전 검사'. Trigger: /audit, /evaluate, /verify."
version: 3.0.0
updated: 2026-03-27
---

# Quality Auditor (Comprehensive Audit + Verification + Metrics)

> **Purpose**: Comprehensive quality audit against planning documents + quantitative metric tracking + verification discipline enforcement.
>
> **v3.0.0**: Absorbed `evaluation` (metrics) and `verification-before-completion` (evidence discipline)

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

## Step 7: Verification Discipline (Iron Law)

> Absorbed from `verification-before-completion`. Applies to ALL completion claims.

**Iron Law: No claims without fresh evidence.**

Before asserting any state ("tests pass", "bug fixed", "build succeeds"):

```
1. IDENTIFY — What command proves this claim?
2. RUN — Execute the full command (fresh, complete)
3. READ — Check full output, exit code, failure count
4. VERIFY — Does the output confirm the claim?
   - NO → state actual status with evidence
   - YES → state claim with evidence
5. ONLY THEN — Make the claim
```

| Claim | Required evidence | NOT sufficient |
|-------|------------------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Lint clean | Lint output: 0 errors | Partial check, inference |
| Build succeeds | Build command: exit 0 | Lint passed, logs look OK |
| Bug fixed | Original symptom test: passes | Code changed, assumed fixed |

**Red flags — stop immediately if you catch yourself:**
- Using "should", "probably", "seems to"
- Expressing satisfaction before running verification
- Trusting agent success reports without checking

---

## Step 8: Quantitative Metrics (Dashboard)

> Absorbed from `evaluation`. Optional — run when metrics tracking is needed.

### Code Quality Metrics

| Metric | Command | Target | Warning |
|--------|---------|--------|---------|
| Test coverage | `pytest --cov` / `vitest --coverage` | ≥70% | <60% |
| Cyclomatic complexity | `radon cc` / `eslint complexity` | ≤10 | >15 |
| Code duplication | `jscpd` / `pylint duplicate` | ≤5% | >10% |
| Lint errors | `ruff` / `eslint` | 0 | >5 |
| Type errors | `mypy` / `tsc` | 0 | >0 |
| Security score | `bandit` / `npm audit` | 0 critical | any critical |

### Agent Performance Metrics

| Metric | Target |
|--------|--------|
| Task completion rate | ≥95% |
| Average retries per task | ≤2 |
| First-attempt success rate | ≥80% |

Store metrics in `.claude/metrics/` for trend tracking across phases.

---

## Reference Documents

- `references/agent-integration.md` — QA Manager integration patterns, feedback routing

---

**Last Updated**: 2026-03-27 (v3.0.0 - Absorbed evaluation + verification-before-completion)

---

## Goal-backward Verification (GSD 패턴)

> **핵심 원칙**: Task 완료 ≠ Goal 달성

### 검증 흐름

```text
Goal (목표)
  ↓
Must-have (참이어야 할 것)
  ↓
Must-exist (존재해야 할 것)
  ↓
Must-wired (연결되어야 할 것)
  ↓
실제 코드베이스 검증
```

### Step 1: Goal 파악

```bash
# TASKS.md에서 현재 Phase/작업의 목표 추출
GOAL=$(grep -A5 "## Phase" TASKS.md | grep -E "^>" | head -1)
```

### Step 2: Must-haves 도출

목표에서 역산하여 필수 조건 도출:

```markdown
Goal: "사용자가 채팅할 수 있어야 함"
  ↓
Must-have:
  - 메시지 전송 가능
  - 메시지 수신 가능
  - 메시지 표시 가능
```

### Step 3: Must-exist 확인

각 must-have에 대해 실제 코드 존재 확인:

```bash
# 예: 채팅 기능 검증
grep -r "sendMessage\\|ChatInput\\|MessageList" src/
```

### Step 4: Must-wired 확인

컴포넌트 간 연결 확인:

```bash
# import/export 관계 확인
grep -r "import.*from.*chat" src/
```

### Step 5: VERIFICATION.md 생성

```markdown
# {Phase} - Verification Report

**검증일:** {date}
**상태:** {PASS|FAIL}

## Goal
{검증한 목표}

## Must-haves 검증

| ID | Must-have | Status | Evidence |
|----|-----------|--------|----------|
| M-01 | {항목} | ✅/❌ | {파일:라인} |

## Gaps (실패 시)
- {누락된 항목}
- {수정 필요 사항}

## 다음 단계
{PASS 시: 다음 Phase}
{FAIL 시: Gap 해결 작업}
```

### 검증 실패 처리

1. Gaps 목록화
2. TASKS.md에 수정 작업 추가
3. 수정 후 재검증
