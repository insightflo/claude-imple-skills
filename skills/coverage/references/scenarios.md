# Coverage Scenarios

> Usage scenarios and integration examples

## Scenario 1: Check Coverage Before a PR Review

```bash
# 1. Check overall coverage
/coverage

# 2. Identify files below threshold
/coverage --threshold 80

# 3. Detailed analysis of a specific file
/coverage app/services/order_service.py --uncovered

# Result: "This file has 78% coverage.
#          Recommended tests to add: L45-48, L67-70"
```

## Scenario 2: Secure Test Coverage After a Bug Fix

```bash
# 1. Check current coverage of the file to modify
/coverage app/services/payment_service.py

# Result: 75% coverage

# 2. Identify uncovered areas
/coverage app/services/payment_service.py --uncovered

# Result: The following areas are uncovered
#       - L34-37: Refund processing logic
#       - L65-68: Partial payment handling

# 3. Fix bug + add tests

# 4. Verify improvement
/coverage app/services/payment_service.py

# Result: 65% -> 88% improvement
```

## Scenario 3: Review Coverage Status by Domain

```bash
# 1. Full coverage for the order domain
/coverage order/ --report

# 2. Detailed analysis by layer
/coverage order/services/
/coverage order/models/
/coverage order/validators/

# 3. Track trends
/coverage order/ --trend

# Result: +10% since last month, 5% remaining to reach goal
```

## Scenario 4: Test Checklist When Adding a New Feature

```bash
# 1. Implement the feature
[implementation in progress]

# 2. Check per-function coverage
/coverage --function <new_module.py>

# 3. Add tests until each function reaches 100% coverage
# (both happy path and exception paths)

# 4. Check overall project coverage
/coverage

# 5. Open a PR once the threshold is met
```

---

## Integration Examples

### Coverage Check + Improvement Workflow

```bash
# Step 1: Check current state
/coverage
# Result: 82% coverage

# Step 2: Identify files below threshold
/coverage --threshold 80
# Result: 3 files below 80%

# Step 3: Analyze first file
/coverage app/utils/validators.py --uncovered
# Result: L12-18, L45-50 uncovered

# Step 4: Add tests (developer)
[add tests]

# Step 5: Verify improvement
/coverage app/utils/validators.py
# Result: 65% -> 88% improvement

# Step 6: Re-check overall coverage
/coverage
# Result: 82% -> 85% achieved
```

---

## Integration with Related Skills

### `/impact <file>` (Check coverage after impact analysis)

```
/impact app/services/order_service.py
  |
[impact analysis output]
  |
Recommended: /coverage app/services/ --uncovered
  (Check test coverage for the areas being changed)
```

### `/audit` (Coverage verification during pre-deployment audit)

```
/audit
  |
[Step 1: Specification verification]
[Step 2: DDD verification]
[Step 3: Code quality]
  |
/coverage (runs automatically)
  |
[Coverage report]
  |
Audit blocked if coverage is below 80%
```

### `/maintenance-analyst` (Check coverage before maintenance)

```
User: "Please modify the payment logic"
  |
/impact payment_service.py
  |
"Current coverage: 78%. Please run tests before making changes."
  |
/coverage payment_service.py (save current state)
  |
[make changes]
  |
/coverage payment_service.py (compare after changes)
  |
"Coverage maintenance confirmed"
```

---

## Recommendation Generation Logic

### Per-File Recommendations

**Above 80%:**
```
Excellent test coverage.
Please maintain this level during future maintenance.
```

**70-80%:**
```
There is room for improvement.
Consider adding tests for the following areas:
   - Exception handling paths
   - Edge cases
   - Conditional branches
```

**Below 70%:**
```
Coverage is low.
Run /coverage --uncovered [file] to identify uncovered areas,
then add tests in the following order:
   1. Core functionality (happy path)
   2. Exception handling
   3. Edge cases
```

### Per-Domain Analysis

```
order domain analysis:
   |-- services/: 95% (sufficient tests)
   |-- models/:   78% (model validation tests recommended)
   +-- validators/: 65% (input validation tests needed)

   -> Recommend improving validators coverage to 80%+ in the next sprint
```

### Trend-Based Recommendations

**Upward trend (good):**
```
Good trend! Keep this momentum.
Last week +3%, this week +2%
-> Target: 85% achievable within 3 weeks
```

**Downward trend (warning):**
```
Coverage has decreased.
Last week: 85% -> This week: 82% (-3%)
Please write tests alongside new code additions.
```

---

## Best Practices

1. **Regular checks**: Verify coverage at the end of each sprint
2. **Set goals**: Define coverage targets per domain (typically 80%)
3. **Monitor trends**: Watch for downward coverage trends
4. **Gradual improvement**: Aim for steady growth rather than sudden jumps
5. **Team discussion**: Decide coverage targets together with the team
