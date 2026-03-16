# Coverage Output Formats

> Detailed output examples

## Overall Coverage Query (`/coverage`)

```
+---------------------------------------------------------------------+
|  Test Coverage Analysis                                             |
+---------------------------------------------------------------------+
|                                                                     |
|  Overall Coverage                                                   |
|  |-- Line coverage:    ████████░░  82% (1230/1500 lines)           |
|  |-- Branch coverage:  ███████░░░  71% (410/575 branches)          |
|  +-- Function coverage: █████████░  88% (45/51 functions)          |
|                                                                     |
|  Coverage by Package:                                               |
|  |-- app/api/          ██████████  95%                             |
|  |-- app/services/     ████████░░  82%                             |
|  |-- app/models/       ███████░░░  78%                             |
|  |-- app/utils/        █████░░░░░  65% (!)                         |
|  +-- tests/            ██████████ 100%                             |
|                                                                     |
|  Below threshold (< 80%):                                           |
|  |-- app/utils/        65% (13/20 lines)                           |
|  +-- app/models/       78% (32/41 lines)                           |
|                                                                     |
|  Next steps:                                                        |
|  - /coverage --uncovered (view uncovered areas in detail)           |
|  - /coverage app/utils/ (analyze specific package)                 |
|  - /coverage --function (per-function coverage)                    |
|                                                                     |
+---------------------------------------------------------------------+
```

## Specific Path Coverage (`/coverage <path>`)

```
+---------------------------------------------------------------------+
|  Test Coverage: app/services/                                       |
+---------------------------------------------------------------------+
|                                                                     |
|  Coverage Summary                                                   |
|  |-- Line coverage:    ████████░░  82% (45/55 lines)               |
|  |-- Branch coverage:  ███████░░░  71% (15/21 branches)            |
|  +-- Function coverage: █████████░  88% (7/8 functions)            |
|                                                                     |
|  Coverage by File:                                                  |
|  |-- order_service.py       ██████████  95% (38/40)                |
|  |-- payment_service.py      ████████░░  82% (18/22)               |
|  |-- discount_service.py     ████████░░  78% (12/15)               |
|  +-- notification_service.py ███░░░░░░░  45% (5/11) (!)            |
|                                                                     |
|  Function coverage (discount_service.py):                           |
|  |-- calculate_discount()       ████████░░  82%                    |
|  |-- get_member_grade()         ██████████ 100%                    |
|  +-- apply_coupon()             ████████░░  78%                    |
|                                                                     |
+---------------------------------------------------------------------+
```

## Uncovered Areas Detail (`/coverage --uncovered`)

```
+---------------------------------------------------------------------+
|  Uncovered Area Analysis                                            |
+---------------------------------------------------------------------+
|                                                                     |
|  app/services/discount_service.py (coverage: 78%)                  |
|  |-- L45-48: Null grade handling (exception case)                  |
|  |   def get_member_grade(user_id):                                |
|  |       grade = db.query(user_id)                                 |
|  |       if grade is None:  # uncovered branch                     |
|  |           ...                                                   |
|  |-- L67-70: Expired coupon handling (edge case)                   |
|  |   def apply_coupon(coupon_code, user):                          |
|  |       if coupon.expired:  # uncovered branch                    |
|  |           ...                                                   |
|  +-- L92-95: API timeout retry logic                               |
|      try:                                                          |
|          result = api_call()                                       |
|      except Timeout:  # uncovered exception                        |
|          ...                                                       |
|                                                                     |
|  app/utils/validators.py (coverage: 65%)                           |
|  |-- L12-18: Complex regex pattern (email validation)              |
|  |-- L45-50: International domain handling                         |
|  +-- L78-82: Special character escaping                            |
|                                                                     |
|  Recommendations:                                                   |
|  1. Add test cases for uncovered areas                             |
|  2. Focus on exception and edge cases                              |
|  3. If only happy paths are tested, add failure paths              |
|                                                                     |
+---------------------------------------------------------------------+
```

## Files Below Threshold (`/coverage --threshold 80`)

```
+---------------------------------------------------------------------+
|  Files Below Coverage Threshold (threshold: 80%)                   |
+---------------------------------------------------------------------+
|                                                                     |
|  File                              Coverage    Lines      Gap       |
|  ─────────────────────────────────────────────────────────────────  |
|  1. app/utils/validators.py        65%      20 / 31    -15%       |
|  2. app/services/notification.py   71%      5  / 7     -9%        |
|  3. app/models/order.py            78%      32 / 41    -2%        |
|                                                                     |
|  Summary                                                            |
|  |-- Below threshold: 3 files                                      |
|  |-- Total files: 15                                               |
|  +-- Pass rate: 80% (3 of 15 files below threshold)               |
|                                                                     |
|  How to resolve:                                                    |
|  /coverage app/utils/validators.py --uncovered (view uncovered)    |
|  Then add test cases for that file                                  |
|                                                                     |
+---------------------------------------------------------------------+
```

## Coverage Trend (`/coverage --trend`)

```
+---------------------------------------------------------------------+
|  Coverage Trend (Last 30 Days)                                      |
+---------------------------------------------------------------------+
|                                                                     |
|  Line coverage:                                                     |
|  2026-01-07: 65% ▄                                                  |
|  2026-01-14: 68% ▅                                                  |
|  2026-01-21: 72% ▆                                                  |
|  2026-01-28: 78% ▇                                                  |
|  2026-02-04: 80% █                                                  |
|  2026-02-07: 82% █ +2%                                              |
|                                                                     |
|  Period statistics:                                                 |
|  |-- Previous week: 80%                                            |
|  |-- Current: 82%                                                  |
|  +-- Change: +2%                                                   |
|                                                                     |
|  Key change drivers:                                                |
|  |-- 2026-02-04: Service layer tests added (+3%)                   |
|  +-- 2026-02-07: Exception handling tests added (+2%)              |
|                                                                     |
|  Goal:                                                              |
|  Current: 82% -> Target: 85% (3% more needed)                      |
|                                                                     |
+---------------------------------------------------------------------+
```

## Per-Function Coverage (`/coverage --function <file>`)

```
+---------------------------------------------------------------------+
|  Function Coverage: app/services/order_service.py                  |
+---------------------------------------------------------------------+
|                                                                     |
|  Function                          Lines   Coverage   Status        |
|  ─────────────────────────────────────────────────────────────────  |
|  create_order()                   18     ██████████ 100%           |
|  update_order_status()            12     ████████░░  83%           |
|  cancel_order()                   15     ███████░░░  71% (!)       |
|  get_order_details()              8      ██████████ 100%           |
|  validate_order_items()           10     █████░░░░░  50% (!)       |
|  apply_discount_to_order()        14     ██████████ 100%           |
|  send_order_notification()        9      ███░░░░░░░  33% (!)       |
|                                                                     |
|  Summary                                                            |
|  |-- Total functions: 7                                            |
|  |-- 100% covered: 3                                               |
|  |-- 80-99%: 2                                                     |
|  +-- Below 80%: 2                                                  |
|                                                                     |
+---------------------------------------------------------------------+
```

## Branch Coverage Detail (`/coverage --branch <file>`)

```
+---------------------------------------------------------------------+
|  Branch Coverage: app/services/discount_service.py                 |
+---------------------------------------------------------------------+
|                                                                     |
|  Line  Code                        Branch    Coverage              |
|  ─────────────────────────────────────────────────────────────────  |
|  L12   if user.premium:           True  Covered                   |
|         (premium member)          False Covered                   |
|                                                                     |
|  L28   if discount >= threshold:  True  Covered                   |
|         (discount at threshold)   False Not covered               |
|                                                                     |
|  L45   elif grade is None:        True  Not covered               |
|         (grade is null)           False Covered                   |
|                                                                     |
|  L67   try-except block:                                            |
|         Success  Covered                                           |
|         Timeout  Not covered                                       |
|         ValueError  Covered                                        |
|                                                                     |
|  Branch summary                                                     |
|  |-- Total branches: 12                                            |
|  |-- Covered branches: 9 (75%)                                     |
|  +-- Uncovered branches: 3 (25%)                                   |
|                                                                     |
+---------------------------------------------------------------------+
```
