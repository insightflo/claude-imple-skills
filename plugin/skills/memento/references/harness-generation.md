# Harness Generation Algorithm

> Based on AutoHarness (arXiv:2603.03329): LLM generates code that constrains its own future behavior.
> Key insight: deterministic code guardrails eliminate entire classes of failures without LLM calls.

## Why Harness > More Instructions

| Approach | Failure mode | Cost per check |
|----------|-------------|----------------|
| Add rules to SKILL.md | LLM may ignore/forget rules | Full LLM inference |
| **Code harness** | Deterministic — cannot be ignored | ~1ms bash/python |

AutoHarness showed that Gemini-2.5-Flash + code harness beat Gemini-2.5-Pro without one.
Same principle: a skill + harness scripts is more reliable than a longer SKILL.md.

## Failure Pattern → Harness Type Mapping

| Failure pattern | Harness type | Script |
|----------------|-------------|--------|
| Missing file, tool not installed, wrong branch | **Pre-check** | `pre_check.sh` |
| Wrong file modified, forbidden directory, dangerous command | **Action-verifier** | `verify_action.py` |
| Tests not run, output incomplete, verification skipped | **Post-verify** | `post_verify.sh` |
| Multiple failure types | Generate all applicable types | Multiple scripts |

## Generation Algorithm

```python
def generate_harness(skill_name, experience_store):
    # 1. Collect failure data
    failures = [e for e in experience_store
                if e.skill == skill_name
                and e.outcome.status in ("failure", "partial")]

    if len(failures) < 2:
        return None  # Not enough data for pattern detection

    # 2. Classify failure root causes
    pre_check_failures = []    # Environment/prerequisite issues
    action_failures = []       # Wrong actions taken
    post_verify_failures = []  # Incomplete verification

    for f in failures:
        cause = classify_failure(f)  # LLM-assisted classification
        if cause == "prerequisite":
            pre_check_failures.append(f)
        elif cause == "invalid_action":
            action_failures.append(f)
        elif cause == "incomplete_verification":
            post_verify_failures.append(f)

    # 3. Generate scripts for patterns with 2+ occurrences
    harness = {}

    if len(pre_check_failures) >= 2:
        harness["pre_check.sh"] = generate_pre_check(pre_check_failures)

    if len(action_failures) >= 2:
        harness["verify_action.py"] = generate_action_verifier(action_failures)

    if len(post_verify_failures) >= 2:
        harness["post_verify.sh"] = generate_post_verify(post_verify_failures)

    # 4. Validate against historical failures
    for script_name, script_content in harness.items():
        caught = test_against_failures(script_content, failures)
        if caught < len(failures) * 0.5:
            # Harness wouldn't have caught most failures — discard
            del harness[script_name]

    return harness
```

## Script Templates

### pre_check.sh Template

```bash
#!/bin/bash
# Harness: {description}
# Generated: {date} from {N} failure cases
# Skill: {skill_name}

set -e

# Check 1: {check_description}
{check_code}

# All checks passed
echo "HARNESS_OK: Pre-checks passed"
exit 0
```

Exit codes:
- `0` — all checks pass, skill may proceed
- `1` — check failed, skill should not run (show HARNESS_WARN message)

### verify_action.py Template

```python
#!/usr/bin/env python3
"""Action verifier for {skill_name}.
Generated: {date} from {N} failure cases.

Usage: python verify_action.py --action "proposed action description" --context "current state"
Returns: exit 0 if valid, exit 1 if invalid (prints reason to stderr)
"""
import sys
import argparse

def verify(action: str, context: str) -> tuple[bool, str]:
    # Rule 1: {rule_description}
    {rule_code}

    return True, "Action is valid"

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--action", required=True)
    parser.add_argument("--context", default="")
    args = parser.parse_args()

    valid, reason = verify(args.action, args.context)
    if not valid:
        print(f"HARNESS_BLOCK: {reason}", file=sys.stderr)
        sys.exit(1)
    print("HARNESS_OK")
```

### post_verify.sh Template

```bash
#!/bin/bash
# Post-verification for {skill_name}
# Generated: {date} from {N} failure cases

# Verify 1: {verification_description}
{verification_code}

echo "HARNESS_OK: Post-verification passed"
exit 0
```

## Common Pre-check Patterns

| Pattern | Check code |
|---------|-----------|
| File exists | `[ -f "$FILE" ] \|\| { echo "HARNESS_WARN: $FILE not found"; exit 1; }` |
| Git clean | `[ -z "$(git status --porcelain)" ] \|\| { echo "HARNESS_WARN: Uncommitted changes"; exit 1; }` |
| Tool installed | `command -v $TOOL >/dev/null \|\| { echo "HARNESS_WARN: $TOOL not found"; exit 1; }` |
| TASKS.md exists | `[ -f "TASKS.md" ] \|\| { echo "HARNESS_WARN: No TASKS.md"; exit 1; }` |
| Cross-domain check | Count unique top-level dirs in git diff |
| Port available | `! lsof -i :$PORT >/dev/null 2>&1 \|\| { echo "HARNESS_WARN: Port $PORT in use"; exit 1; }` |

## Common Post-verify Patterns

| Pattern | Verification code |
|---------|-------------------|
| Tests pass | `npm test 2>&1 \| tail -1 \| grep -q "passed" \|\| exit 1` |
| No console errors | `grep -c "ERROR" $LOG \|\| exit 0; exit 1` |
| File was modified | `git diff --name-only \| grep -q "$EXPECTED_FILE" \|\| exit 1` |
| Build succeeds | `npm run build 2>/dev/null \|\| exit 1` |

## Iterative Refinement (AutoHarness Tree Search Pattern)

Like AutoHarness, harness scripts can be iteratively improved:

```
1. Generate initial harness from failure patterns
2. Run skill with harness enabled on test cases
3. If harness blocks legitimate actions (false positive):
   → Refine the check to be more specific
4. If harness misses a failure (false negative):
   → Add stricter checks
5. Repeat until false_positive_rate < 0.05 AND catch_rate > 0.80
```

This mirrors AutoHarness's refinement loop where the Critic provides feedback and the Refiner improves the code.
