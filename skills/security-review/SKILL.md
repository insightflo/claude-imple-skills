---
name: security-review
description: OWASP Top 10 security vulnerability scanner. Detects secret exposure, injection flaws, auth/authz gaps, supply-chain risks, security misconfigurations, and logging failures via static analysis. Use this before every deployment, before every PR merge, and whenever auth/payment/billing code changes. Invoke immediately on "security check", "vulnerability scan", or "secret exposure" requests.
version: 1.1.0
updated: 2026-03-02
---

# Security Review (OWASP Top 10)

> **Purpose**: Detect and surface critical security flaws in a codebase via static analysis before deployment, and deliver reproducible **evidence** and **remediation guidance**.
>
> **Core principle**: This skill is **analysis and reporting only**. It does not auto-fix anything.
>
> **/audit integration**: Performs the **security track** within `/audit`'s 5-stage quality audit and can deliver results as standard artifacts.

---

## MCP Dependencies

| MCP | Required | Purpose |
|-----|----------|---------|
| None | - | Uses basic search/static analysis tools |

> External SAST/Dependency Scan result files are supported in **interpret/summarize** mode only.

---

## Absolute Prohibitions (Safety & Constraints)

1. No writing exploit code or attack payloads
   - Reproduction notes must be limited to "input conditions / flow / expected vs. actual" — no attack code
2. No unsubstantiated assertions
   - Every finding must include `file_path:line`-based evidence
3. No re-exposing secrets or PII
   - Raw values must never appear in reports, terminal output, or artifacts
4. No scanning unauthorized targets
   - Only inspect explicitly approved code/environments; do not access or test external systems

### Sensitive Data Masking Rules

- Tokens, keys, session values, passwords: **raw values forbidden**
- Default masking: `first 3–4 chars + "***" + (length/type hint)`
  - e.g., `AKIA*** (len=20)`, `sk-*** (prefix=sk-)`, `***PRIVATE KEY***`
- When quoting log/sample data, minimize or de-identify user identifiers (email/phone/IP)

### Emergency Response Triggers (operational view)

- If any of the following apply, classify immediately as **CRITICAL candidate** and recommend **revocation/reissuance/impact assessment** before any fix:
  - A secret that appears to be an active (production) key is exposed
  - Credentials directly tied to payment/PII/admin access are exposed

---

## Actions to Execute Immediately on Skill Activation (High-level)

1. **Pre-flight scoping** (project characteristics, excluded paths, output artifact format)
2. **Secret/credential exposure** scan + post-exposure response guidance
3. **OWASP A01–A10** coverage (required: A04/A06/A10 included)
4. **Web/API high-risk checks** (SSRF, file upload, path traversal, deserialization, CSRF, Clickjacking)
5. **Dependency/supply-chain** risk check (lockfile + install scripts + drift)
6. **Triage (false-positive filtering)**: Source→Sink flow + defense mechanism verification
7. **Report**: prioritized findings + remediation guide + verification steps

---

## Execution Process (Checklist)

### Stage 0: Pre-flight Scoping (required)

- **In-scope (default)**
  - `src/`, `app/`, `server/`, `api/`, `infra/` (if present), config files
- **Out-of-scope (default)**
  - Generated/vendor/cache: `**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/coverage/**`, `**/*.min.*`
  - Test fixtures included by default (can be excluded if noisy)
- **Output artifacts**
  - (default) Markdown report
  - (optional) JSON artifact for `/audit` integration

**Completion criteria**: include/exclude paths, scan mode (quick/standard/deep), and output format (md/json) confirmed.

### Stage 1: Secret/Credential Exposure

**Check items**
- Hardcoded API keys, access tokens, private keys, DB URLs
- `.env*` and credential files tracked in the repo
- Sensitive data printed in log/error messages

**Evidence requirements**
- `file_path:line` + (up to 5 lines) snippet (masking applied)

**Post-exposure response procedure (include in report)**
- Key identifier (service/environment only if possible) + exposure location
- Whether revocation/reissuance is needed + estimated impact scope (env: dev/stage/prod)

**Completion criteria**: Secret candidates classified as Confirmed / FP (false positive) / Needs-more-context.

### Stage 2: OWASP Top 10 (A01–A10) Full Matrix

> Each item requires at least one "detection rule" and "required evidence".

| OWASP | Core question (summary) | Minimum evidence (required) |
|---|---|---|
| A01 Broken Access Control | Is authorization validation missing or bypassable? | Guard/policy code location + access path/resource identifier handling |
| A02 Cryptographic Failures | Is storage/transmission/key management weak? | Algorithm/mode/key storage location, TLS/cookie config |
| A03 Injection | Does external input reach a dangerous sink? | Source→Sink path + query/command/template construction method |
| A04 Insecure Design | Are security controls missing at the design level? | Evidence of absent threat model / ambiguous auth model / unprotected sensitive operations |
| A05 Security Misconfiguration | Are there unsafe settings, headers, or debug flags? | Config files/server init code + actual values |
| A06 Vulnerable & Outdated Components | Are vulnerable or outdated components in use? | lockfile/version/supply-chain signals (postinstall, etc.) |
| A07 Identification & Authentication Failures | Is the authentication flow broken? | Token validation (signature/expiry/iss/aud), session/reset flow evidence |
| A08 Software & Data Integrity Failures | Is there update/execution without integrity verification? | External script/update/plugin load paths |
| A09 Security Logging & Monitoring Failures | Are security events being logged and detected? | Minimum event list coverage + logging locations |
| A10 Server-Side Request Forgery (SSRF) | Does the server make requests based on attacker-controlled input? | URL fetch call sites + validation/blocking logic |

#### A03 Injection Sub-categories (required)

- SQL / NoSQL
- Command / Shell argument injection
- Template injection
- LDAP / XPath
- CRLF (Header) / Response splitting

#### Auth/AuthZ Detailed Checklist (required)

- JWT/session: signature, expiry, `iss/aud` and other critical claim validation
- Password reset / email verification: token lifetime, single-use, post-use invalidation
- Privilege escalation: horizontal (IDOR), vertical (role escalation) paths
- Brute-force defense: rate limit/lockout/2FA enforcement points (if applicable)

### Stage 3: Web/API High-Risk Checks (required)

#### SSRF (overlaps A10 but checked separately)
- Does the server fetch externally supplied URLs?
- Is an allowlist enforced? Are internal IPs/metadata endpoints blocked?

#### Path Traversal
- Is user input combined with file paths or filenames?
- Missing validation after `../`, absolute paths, URL decoding?

#### File Upload
- Extension/MIME/content-sniffing validation, isolated storage path, executable file blocking
- Post-upload access control (private files/signed URLs, etc.)

#### Deserialization
- Is untrusted input processed with unsafe deserialization?
- e.g., Python `pickle`, unsafe YAML load, Java `ObjectInputStream` (language-specific)

#### Browser Security: CSRF / Clickjacking
- CSRF defense token / SameSite policy on state-mutating requests
- Clickjacking protection: `X-Frame-Options` or CSP `frame-ancestors`

### Stage 4: Dependency/Supply-Chain Check

**Use when available (if environment permits)**
- Node.js: `npm audit`, `pnpm audit`, `yarn audit`
- Python: `pip-audit`, `poetry audit`

**Supply Chain Risk (static checks)**
- Lockfile integrity/drift (e.g., `package-lock.json` vs. `package.json` mismatch)
- Presence of `postinstall/preinstall` install scripts
- Signs of newly added or unfamiliar packages (typosquatting suspects)
- Remote script download/execution patterns

**Completion criteria**: Record "vulnerabilities (version)" and "supply-chain signals (behavior)" separately.

### Stage 4.5: Triage (False-Positive Filtering) & Evidence Collection

Before reporting any candidate vulnerability, verify the following:

- **Source→Sink data flow**: Does external input (Source) reach a dangerous sink without defense?
- **Defense mechanism check**: Presence of sanitization/encoding/parameterization/type casting
- **Evidence collection rules**: `file:line` + snippet (up to 5 lines, masked) + 1–2 sentences on "why this is dangerous"

**Completion criteria**: All candidates classified as Confirmed / Likely / Needs-context / False-positive.

### Stage 5: Report

#### Priority Scoring Rule

- Priority = **Severity × Exploitability × Exposure Scope × Asset Criticality (PII/payment/admin)**

#### Finding Required Fields

Each issue must include the following fields:

- **finding_id**: `SR-0001` format
- **title**: One-line summary
- **owasp / cwe** (where available)
- **severity**: CRITICAL/HIGH/MEDIUM/LOW
- **confidence**: High/Medium/Low (static analysis confidence)
- **location**: `file_path:line`
- **evidence**: (up to 5 lines) snippet + key evidence summary
- **impact**: CIA (Confidentiality/Integrity/Availability) + target asset (e.g., PII, payment, admin access)
- **reproduction_notes (safe)**: Describe input conditions and flow without attack code
- **remediation**:
  - Safe pattern (recommended)
  - Unsafe pattern (avoid)
  - Verification method (test/re-scan checklist)
- **status**: New/Confirmed/False-Positive/Accepted-Risk/Fixed (where known)

---

## Output Format

### 1) Summary Box

- Total score (optional), verdict (OK/NEEDS FIX), severity counts
- Scan scope/mode/excluded paths summary

### 2) Top Findings Table

| ID | Severity | OWASP | Title | Location | Confidence |
|---|---|---|---|---|---|
| SR-0001 | HIGH | A03 | ... | `src/...:123` | High |

### 3) Detailed Findings

- One section per finding, using the required fields template above

### 4) Priority Actions (Top 3)

1. Immediately fix and re-verify CRITICAL/HIGH items
2. Harden shared auth/authz guards and input validation layer
3. Revoke/reissue secrets where exposure is confirmed

### 5) Confidence & Limitations (required)

- State the limits of static analysis, out-of-scope areas, and items requiring runtime/environment verification

---

## Command Flags

| Command | Description |
|--------|-------------|
| `/security-review` | Default (standard) scan |
| `/security-review --mode quick` | Fast scan of core rules only |
| `/security-review --mode deep` | Full rules + supply-chain/config deep scan |
| `/security-review --path <dir>` | Scan specified path only |
| `/security-review --include "src/**"` | Specify include pattern |
| `/security-review --exclude "**/node_modules/**,**/dist/**"` | Specify exclude pattern |
| `/security-review --checks "secrets,auth,ssrf"` | Re-scan specific categories only |
| `/security-review --summary` | Summary-focused report |
| `/security-review --owasp` | OWASP-mapping-focused output |
| `/security-review --format md` | Default output (Markdown) |
| `/security-review --format json --out .claude/security-review.json` | JSON artifact (automation/integration) |
| `/security-review --min-confidence high` | Output High confidence issues only |
| `/security-review --severity-threshold high` | Use High and above as summary/gate threshold |
| `/security-review --fail-on high` | Fail if any High or above is unresolved (pipeline use) |
| `/security-review --since <git-ref>` | Delta scan focused on changed code |
| `/security-review --baseline <file>` | Compare against existing baseline (skip known/accepted issues) |

---

## `/audit` Integration Contract

### Role Separation

- `/audit`: Aggregate score / gate verdict / overall quality integration
- `security-review`: Security flaw identification + evidence + remediation guidance

### Output Artifacts (recommended)

- Default path: `.claude/security-review.json` (or `--out`)
- Minimum required fields:
  - `scan`: include/exclude, mode, checks, timestamp
  - `findings[]`: required finding fields
  - `limits`: out-of-scope, unchecked items
  - `redaction`: masking policy (raw values forbidden)

### Deduplication Rules (recommended)

- Dedup key: `rule_id (or owasp+cwe) + file + line + sink/source`
- Same issue counts as one; if evidence strengthens, update evidence only

### Stage Mapping (recommended)

- Attach this skill's results (JSON/report) as "evidence" in the audit security stage
- If other skills/tools provide SAST results, focus on "interpretation/prioritization" rather than duplicate detection

---

## Suggested Next Steps

| Situation | Recommended skill | Description |
|-----------|-------------------|-------------|
| High-risk vulnerability found | `/agile iterate` | Create and execute prioritized fix tasks |
| Pre-deployment comprehensive check | `/audit` | Full quality audit including security |
| Simultaneous code quality improvement | `/code-review` | Two-stage review to prevent quality regressions |
| Prevent recurring vulnerabilities | `/guardrails` | Strengthen security guards at generation stage |

---

## Hook Integration

| Hook | Effect |
|------|--------|
| `skill-router` | Auto-detects `/security-review` keyword |
| `post-edit-analyzer` | Auto-re-checks security patterns after edits |
| `git-commit-checker` | Warns when high-risk vulnerabilities remain unresolved |

---

**Last Updated**: 2026-03-02 (v1.1.0 - Full rewrite: OWASP A01–A10 complete matrix, Web/API high-risk checks, triage, artifacts/flags, /audit contract added)
