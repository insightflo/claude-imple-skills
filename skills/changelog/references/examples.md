# Changelog Viewer - Usage Examples

> This file contains usage examples for the `/changelog` skill.

---

## Example 1: Basic Query

```
> /changelog

===========================================================
  Changelog: February 2026
===========================================================

  Period: 2026-02-01 ~ 2026-02-07
  Total: 15 entries

-----------------------------------------------------------
  2026-02-07 (3 entries)
-----------------------------------------------------------
  [Feature] Create discount_service in order
     domain: order
     files:  order/services/discount_service.py
     impact: external dependency added: member-api

  [Fix] Fix issue in payment_service
     domain: payment
     files:  payment/services/payment_service.py
     impact: none

  [Refactor] Refactor order_service
     domain: order
     files:  order/services/order_service.py
     impact: none

  ... (12 more)

===========================================================
```

---

## Example 2: Domain + Date Range Filter

```
> /changelog --domain order --last 7d

===========================================================
  Changelog: order domain (last 7 days)
===========================================================

  Period: 2026-02-01 ~ 2026-02-07
  Total: 5 entries (order domain)

-----------------------------------------------------------
  2026-02-07 (2 entries)
-----------------------------------------------------------
  [Feature] Create discount_service in order
     files:  order/services/discount_service.py
             order/schemas/discount.py
     impact: external dependency added: member-api

  [Refactor] Refactor order_service
     files:  order/services/order_service.py
     impact: none

-----------------------------------------------------------
  2026-02-05 (3 entries)
-----------------------------------------------------------
  [Feature] Add new functionality to order_api in order
     files:  order/api/router.py
     impact: API endpoint modification

  [Fix] Fix issue in order_validator
     files:  order/validators/order_validator.py
     impact: none

  [Test] Add test file test_order_api.py
     files:  tests/order/test_order_api.py
     impact: none

===========================================================
```

---

## Example 3: Bug Fix History Only

```
> /changelog --type fix

===========================================================
  Changelog: fix changes (February 2026)
===========================================================

  Period: 2026-02-01 ~ 2026-02-07
  Total: 6 entries (type: fix)

-----------------------------------------------------------
  2026-02-07
-----------------------------------------------------------
  [Fix] Fix issue in payment_service
     domain: payment
     files:  payment/services/payment_service.py
     impact: none

-----------------------------------------------------------
  2026-02-05
-----------------------------------------------------------
  [Fix] Fix issue in order_validator
     domain: order
     files:  order/validators/order_validator.py
     impact: none

  [Fix] Fix issue in auth_middleware
     domain: auth
     files:  src/middleware/auth_middleware.py
     impact: API endpoint modification

  ... (3 more)

===========================================================
```

---

## Example 4: Change Statistics

```
> /changelog --stats

===========================================================
  Changelog Statistics (February 2026)
===========================================================

  Period: 2026-02-01 ~ 2026-02-07
  Total changes: 24 entries

-----------------------------------------------------------
  By Domain
-----------------------------------------------------------
  order       ############ 12 entries (50.0%)
  payment     ######        6 entries (25.0%)
  auth        ###           3 entries (12.5%)
  root        ##            2 entries ( 8.3%)
  member      #             1 entry   ( 4.2%)

-----------------------------------------------------------
  By Type
-----------------------------------------------------------
  feature     ############ 12 entries (50.0%)
  fix         ######        6 entries (25.0%)
  refactor    ###           3 entries (12.5%)
  test        ##            2 entries ( 8.3%)
  docs        #             1 entry   ( 4.2%)

-----------------------------------------------------------
  By Day
-----------------------------------------------------------
  02-07       ########     8 entries
  02-06       #####        5 entries
  02-05       ####         4 entries
  02-04       ###          3 entries
  02-03       ##           2 entries
  02-02       #            1 entry
  02-01       #            1 entry

-----------------------------------------------------------
  Most Changed Files (Top 5)
-----------------------------------------------------------
  1. order/services/discount_service.py    (4 changes)
  2. payment/services/payment_service.py   (3 changes)
  3. order/api/router.py                   (2 changes)
  4. src/middleware/auth_middleware.py     (2 changes)
  5. order/schemas/discount.py             (1 change)

===========================================================
```

---

## Example 5: Per-Domain Statistics

```
> /changelog --domain payment --stats

===========================================================
  Changelog Statistics: payment domain
===========================================================

  Period: 2026-02-01 ~ 2026-02-07
  Total changes: 6 entries (payment domain)

-----------------------------------------------------------
  By Type
-----------------------------------------------------------
  fix         ###          3 entries (50.0%)
  feature     ##           2 entries (33.3%)
  refactor    #            1 entry   (16.7%)

-----------------------------------------------------------
  By Day
-----------------------------------------------------------
  02-07       ##           2 entries
  02-06       ##           2 entries
  02-05       #            1 entry
  02-03       #            1 entry

-----------------------------------------------------------
  Most Changed Files (Top 3)
-----------------------------------------------------------
  1. payment/services/payment_service.py   (3 changes)
  2. payment/api/router.py                 (2 changes)
  3. payment/models/transaction.py         (1 change)

===========================================================
```

---

## Example 6: Change History for a Specific File

```
> /changelog --file discount_service.py

===========================================================
  Changelog: discount_service.py
===========================================================

  Period: all available
  Total: 4 entries (file: discount_service.py)

-----------------------------------------------------------
  Change History
-----------------------------------------------------------
  2026-02-07T14:30  [Feature] Create discount_service in order
                    impact: external dependency added: member-api

  2026-02-06T10:15  [Refactor] Refactor discount_service
                    impact: none

  2026-02-05T16:45  [Fix] Fix issue in discount_service
                    impact: none

  2026-02-03T09:00  [Feature] Add new functionality to discount_service
                    impact: internal dependency added: order.models

===========================================================
```
