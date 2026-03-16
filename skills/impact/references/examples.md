# Impact Analyzer - Usage Examples

> This file contains usage examples for the `/impact` skill.

---

## Example 1: Service File Analysis

```
> /impact src/services/user_service.py

===========================================================
  Impact Analysis: user_service.py
===========================================================

  Risk Level: HIGH
  Service/core/middleware layer - business logic changes
  may affect multiple consumers. Run related test suites.

-----------------------------------------------------------
  Direct Dependents (files that import this file)
-----------------------------------------------------------
  - src/api/routes/user.py:L5
  - src/api/routes/admin.py:L8
  - src/services/order_service.py:L12

-----------------------------------------------------------
  Indirect Dependents (API call relationships)
-----------------------------------------------------------
  - [GET /api/users/{id}] frontend/pages/profile.tsx
  - [POST /api/users] frontend/pages/register.tsx

-----------------------------------------------------------
  Affected Domains
-----------------------------------------------------------
  - user (direct)
  - order (indirect - order_service imports user_service)

-----------------------------------------------------------
  Related Tests
-----------------------------------------------------------
  - tests/services/test_user_service.py
  - tests/api/test_user_routes.py

-----------------------------------------------------------
  Recommended Actions
-----------------------------------------------------------
  1. Run tests:
     $ pytest tests/services/test_user_service.py tests/api/test_user_routes.py -v --cov=src/services
  2. Reviewer: user Part Leader
  3. Notify the order domain of changes (cross-domain dependency)

  [CAUTION] HIGH risk area.
  Run full test suite for affected modules before proceeding.

===========================================================
```

---

## Example 2: Payment-Related File Analysis (CRITICAL)

```
> /impact src/api/routes/payment.py

===========================================================
  Impact Analysis: payment.py
===========================================================

  Risk Level: CRITICAL
  Payment/billing/auth/security area - financial or security
  impact. Requires thorough review and full test coverage.

-----------------------------------------------------------
  Direct Dependents (files that import this file)
-----------------------------------------------------------
  - src/main.py:L22 (router include)

-----------------------------------------------------------
  Indirect Dependents (API call relationships)
-----------------------------------------------------------
  - [POST /api/payments] frontend/pages/checkout.tsx
  - [POST /api/payments] mobile/screens/PaymentScreen.tsx
  - [GET /api/payments/{id}] frontend/pages/order-detail.tsx

-----------------------------------------------------------
  Affected Domains
-----------------------------------------------------------
  - payment (direct)
  - order (indirect - related to checkout flow)

-----------------------------------------------------------
  Related Tests
-----------------------------------------------------------
  - tests/api/test_payment.py
  - tests/integration/test_payment_flow.py

-----------------------------------------------------------
  Recommended Actions
-----------------------------------------------------------
  1. Run tests:
     $ pytest tests/api/test_payment.py tests/integration/test_payment_flow.py -v --cov=src/api/routes
  2. Reviewer: QA Manager, Chief Architect
  3. Integration tests are mandatory for payment-related changes

-----------------------------------------------------------
  [WARNING] CRITICAL Risk Area
-----------------------------------------------------------
  This is a core financial/security area.

  Required checks:
  [ ] Is the reason for the change clearly defined?
  [ ] Has the full scope of impact been identified?
  [ ] Are test cases prepared?
  [ ] Is a rollback plan in place?

  Required reviewers: QA Manager, Chief Architect

===========================================================
```

---

## Example 3: Test File Analysis (LOW)

```
> /impact tests/services/test_user_service.py

===========================================================
  Impact Analysis: test_user_service.py
===========================================================

  Risk Level: LOW
  Tests/utils/config/docs area - low blast radius.
  Standard review applies.

-----------------------------------------------------------
  Direct Dependents (files that import this file)
-----------------------------------------------------------
  None found

-----------------------------------------------------------
  Indirect Dependents (API call relationships)
-----------------------------------------------------------
  None found

-----------------------------------------------------------
  Affected Domains
-----------------------------------------------------------
  - user (test)

-----------------------------------------------------------
  Related Tests
-----------------------------------------------------------
  (This file itself is a test file)

-----------------------------------------------------------
  Recommended Actions
-----------------------------------------------------------
  1. Run tests:
     $ pytest tests/services/test_user_service.py -v
  2. Reviewer: Standard code review
  3. When modifying tests, verify that the behavior of the target source file has not changed

===========================================================
```
