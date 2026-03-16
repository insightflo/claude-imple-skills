# Dependency Graph - Output Formats

> This file defines the detailed output formats for the `/deps` skill.

---

## Default Output: Domain Dependencies (`/deps`)

```
===========================================================
  Dependency Graph: <target>
===========================================================

  Scope: <full project|domain-name|directory-path>
  Domains Found: <N>
  Total Cross-Domain Dependencies: <N>
  Circular Dependencies: <found/none>

-----------------------------------------------------------
  Mermaid Diagram
-----------------------------------------------------------

  ```mermaid
  graph LR
    order["Order<br/>(Ca:2, Ce:3, I:0.60)"]
    member["Member<br/>(Ca:3, Ce:1, I:0.25)"]
    product["Product<br/>(Ca:2, Ce:0, I:0.00)"]
    payment["Payment<br/>(Ca:0, Ce:2, I:1.00)"]

    order -->|"API 2"| member
    order -->|"API 2"| product
    order -->|"import 1"| payment
    payment -->|"API 1"| order

    style product fill:#4CAF50,color:#fff
    style payment fill:#FF9800,color:#fff
  ```

-----------------------------------------------------------
  Domain Summary
-----------------------------------------------------------

  | Domain   | Ca | Ce | I    | Grade    |
  |----------|----|----|------|----------|
  | member   | 3  | 1  | 0.25 | Loose    |
  | product  | 2  | 0  | 0.00 | Loose    |
  | order    | 2  | 3  | 0.60 | Moderate |
  | payment  | 0  | 2  | 1.00 | Loose    |

===========================================================
```

---

## Specific Domain Dependencies (`/deps show <domain>`)

```
===========================================================
  Dependency Graph: <domain-name> Domain
===========================================================

-----------------------------------------------------------
  [Outgoing] (External dependencies used by this domain)
-----------------------------------------------------------
  +-- <domain-A> (<N> APIs)
  |   +-- <METHOD> /<path> - <description>
  +-- <domain-B> (<N> imports)
      +-- <module-path> - <class/function name>

-----------------------------------------------------------
  [Incoming] (External dependencies that use this domain)
-----------------------------------------------------------
  +-- <domain-C> (<N> APIs)
      +-- <METHOD> /<path> - <description>

-----------------------------------------------------------
  [Circular Dependencies]
-----------------------------------------------------------
  +-- None

===========================================================
```

---

## Circular Dependencies Only (`/deps --cycles`)

```
===========================================================
  Circular Dependency Report
===========================================================

  Total Cycles Found: <N>

-----------------------------------------------------------
  [CRITICAL] Domain-Level Cycles
-----------------------------------------------------------

  Cycle 1:
    order -> payment -> order
    |
    +-- order/services/checkout.py:L15
    |     from payment.services.payment_service import process
    +-- payment/services/refund.py:L8
          from order.services.order_service import get_order

-----------------------------------------------------------
  Recommendations
-----------------------------------------------------------

  1. [CRITICAL] order <-> payment:
     - Recommend removing the order reference from payment
     - Consider switching to event-driven async communication
     - Reference: Dependency Inversion Principle (DIP)

===========================================================
```

---

## File Dependency Tree (`/deps <file> --tree`)

```
===========================================================
  Dependency Tree: <file-path>
===========================================================

  [Outgoing] (What this file depends on)
  <filename>
  +-- <import 1> (<domain>)
  |   +-- <import 1-1> (<domain>)
  +-- <import 2> (<domain>)

  [Incoming] (What depends on this file)
  <filename>
  +-- <dependent 1> (<domain>)

  Tree Depth: <N> levels
  Total Unique Dependencies: <N> files
  Cross-Domain References: <N>

===========================================================
```

---

## Cross-Domain Dependency Matrix (`/deps --matrix`)

```
===========================================================
  Cross-Domain Dependency Matrix
===========================================================

  (row: depending side -> column: depended-on side)

  |          | order | member | product | payment | auth |
  |----------|-------|--------|---------|---------|------|
  | order    |   -   |   2    |    2    |    1    |  1   |
  | member   |   0   |   -    |    0    |    0    |  1   |
  | product  |   0   |   0    |    -    |    0    |  0   |
  | payment  |   1   |   0    |    0    |    -    |  1   |
  | auth     |   0   |   1    |    0    |    0    |  -   |

  Legend:
    number = number of cross-domain dependencies (imports + API calls)
    0      = no dependency relationship
    -      = self (internal dependencies)

-----------------------------------------------------------
  Hotspots (High coupling)
-----------------------------------------------------------
  1. order -> member (2): 2 API calls
  2. order -> product (2): 2 API calls

===========================================================
```

---

## Coupling Grades

| Grade    | Cross-dependency count | Assessment                |
|----------|------------------------|---------------------------|
| Loose    | 0-2                    | Healthy state             |
| Moderate | 3-5                    | Manageable                |
| Tight    | 6-10                   | Refactoring recommended   |
| Tangled  | 11+                    | Refactoring required      |

---

## Instability Metric

```
I = Ce / (Ca + Ce)

I = 0.0: Completely stable (many domains depend on this; changes have wide impact)
I = 1.0: Completely unstable (depends on many domains; easy to change)
I = 0.5: Balanced state
```
