# Dependency Graph - Usage Examples

> This file contains usage examples for the `/deps` skill.

---

## Example 1: Full Project Dependency Analysis

```
> /deps

===========================================================
  Dependency Graph: Full Project
===========================================================

  Scope: Full project
  Domains Found: 5 (order, member, product, payment, auth)
  Total Cross-Domain Dependencies: 8
  Circular Dependencies: None

-----------------------------------------------------------
  Mermaid Diagram
-----------------------------------------------------------

  ```mermaid
  graph LR
    order["Order<br/>(Ca:1, Ce:3, I:0.75)"]
    member["Member<br/>(Ca:2, Ce:1, I:0.33)"]
    product["Product<br/>(Ca:2, Ce:0, I:0.00)"]
    payment["Payment<br/>(Ca:1, Ce:2, I:0.67)"]
    auth["Auth<br/>(Ca:3, Ce:0, I:0.00)"]

    order -->|"API 2"| member
    order -->|"API 2"| product
    order -->|"import 1"| auth
    payment -->|"API 1"| order
    payment -->|"import 1"| auth
    member -->|"import 1"| auth

    style product fill:#4CAF50,color:#fff
    style auth fill:#4CAF50,color:#fff
  ```

-----------------------------------------------------------
  Domain Summary
-----------------------------------------------------------

  | Domain   | Ca | Ce | I    | Grade    | Assessment                      |
  |----------|----|----|------|----------|---------------------------------|
  | auth     | 3  | 0  | 0.00 | Loose    | Most stable (foundational module)|
  | product  | 2  | 0  | 0.00 | Loose    | Stable (pure domain)            |
  | member   | 2  | 1  | 0.33 | Loose    | Stable                          |
  | payment  | 1  | 2  | 0.67 | Moderate | Moderate (dependency mgmt needed)|
  | order    | 1  | 3  | 0.75 | Moderate | High coupling (core domain)      |

  [Architecture Health: GOOD]
  No circular dependencies. Coupling is at a manageable level.

===========================================================
```

---

## Example 2: Specific Domain Dependencies (`/deps show order`)

```
> /deps show order

===========================================================
  Dependency Graph: Order Domain
===========================================================

  Order domain dependencies:

-----------------------------------------------------------
  [Outgoing] (External dependencies used by Order)
-----------------------------------------------------------
  +-- member (2 APIs)
  |   +-- GET /members/{id} - Fetch member info
  |   +-- GET /members/{id}/grade - Fetch grade
  +-- product (2 APIs)
  |   +-- GET /products/{id} - Fetch product info
  |   +-- PATCH /products/{id}/stock - Deduct stock
  +-- auth (1 import)
      +-- auth.utils.token.verify_token - Token verification

-----------------------------------------------------------
  [Incoming] (External dependencies that use Order)
-----------------------------------------------------------
  +-- payment (1 API)
      +-- GET /orders/{id} - Confirm order

-----------------------------------------------------------
  Metrics
-----------------------------------------------------------
  Afferent Coupling (Ca): 1
  Efferent Coupling (Ce): 3
  Instability (I): 0.75
  Grade: Moderate

===========================================================
```

---

## Example 3: Circular Dependency Detection

```
> /deps --cycles

===========================================================
  Circular Dependency Report
===========================================================

  Total Cycles Found: 0

  No circular dependencies detected.
  The architecture is in a healthy state.

===========================================================
```

---

## Example 4: File Dependency Tree

```
> /deps src/services/order_service.py --tree

===========================================================
  Dependency Tree: order_service.py
===========================================================

  [Outgoing] (What this file depends on)
  order_service.py
  +-- member.services.member_service (member)
  |   +-- member.models.member (member)
  |   +-- auth.utils.token (auth)
  +-- product.services.product_service (product)
  |   +-- product.models.product (product)
  +-- order.models.order (order - internal)

  [Incoming] (What depends on this file)
  order_service.py
  +-- order.api.routes.order_router (order - internal)
  +-- payment.services.checkout_service (payment)

  Tree Depth: 2 levels
  Total Unique Dependencies: 8 files
  Cross-Domain References: 4 (member: 2, product: 1, payment: 1)

===========================================================
```

---

## Example 5: Cross-Domain Dependency Matrix

```
> /deps --matrix

===========================================================
  Cross-Domain Dependency Matrix
===========================================================

  |          | order | member | product | payment | auth |
  |----------|-------|--------|---------|---------|------|
  | order    |   -   |   2    |    2    |    0    |  1   |
  | member   |   0   |   -    |    0    |    0    |  1   |
  | product  |   0   |   0    |    -    |    0    |  0   |
  | payment  |   1   |   0    |    0    |    -    |  1   |
  | auth     |   0   |   0    |    0    |    0    |  -   |

  Hotspots:
  1. order -> member (2): Highest coupling
  2. order -> product (2): Same level

  Isolated:
  - product: No external dependencies (Ce=0)
  - auth: No external dependencies (Ce=0)

===========================================================
```
