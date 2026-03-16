# Architecture Map - Output Formats

> This file defines the detailed output formats for the `/architecture` skill.

---

## Full Architecture Overview (`/architecture`)

```
===========================================================
  Architecture Overview
===========================================================

  Project: <project-name>
  Generated: <YYYY-MM-DD HH:MM>

-----------------------------------------------------------
  Domain Map (Mermaid)
-----------------------------------------------------------

  ```mermaid
  graph TB
    subgraph "Project Architecture"
      member["Member<br/>Files: 12, APIs: 5"]
      order["Order<br/>Files: 18, APIs: 12"]
      product["Product<br/>Files: 8, APIs: 6"]
      payment["Payment<br/>Files: 10, APIs: 4"]
    end

    order -->|"API 2, import 3"| member
    order -->|"API 2"| product
    payment -->|"API 1"| order

    style member fill:#4CAF50,color:#fff
    style order fill:#FF9800,color:#fff
  ```

-----------------------------------------------------------
  Domain Summary
-----------------------------------------------------------

  | Domain  | Files | APIs | Dependencies    | Role             |
  |---------|-------|------|-----------------|------------------|
  | member  | 12    | 5    | none            | Core (stable)    |
  | product | 8     | 6    | none            | Core (stable)    |
  | order   | 18    | 12   | member, product | Business Logic   |
  | payment | 10    | 4    | order           | Business Logic   |

-----------------------------------------------------------
  API Summary
-----------------------------------------------------------

  Total Endpoints: 27
  | Method | Count |
  |--------|-------|
  | GET    | 12    |
  | POST   | 8     |
  | PUT    | 4     |
  | DELETE | 3     |

-----------------------------------------------------------
  Tech Stack (Top)
-----------------------------------------------------------

  | Category   | Technology           |
  |------------|----------------------|
  | Language   | Python 3.14          |
  | Framework  | FastAPI              |
  | ORM        | SQLAlchemy 2.0       |
  | Database   | PostgreSQL           |

===========================================================
```

---

## Domain Structure (`/architecture domains`)

```
===========================================================
  Domain Structure
===========================================================

  Domains Found: <N>
  Total Files: <N>

-----------------------------------------------------------
  Domain Dependency Diagram (Mermaid)
-----------------------------------------------------------

  ```mermaid
  graph LR
    member["Member<br/>12 files"]
    order["Order<br/>18 files"]
    product["Product<br/>8 files"]

    order -->|"5 refs"| member
    order -->|"3 refs"| product

    style member fill:#4CAF50,color:#fff
  ```

-----------------------------------------------------------
  Domain Details
-----------------------------------------------------------

  ### member (12 files)

  | Role       | Count | Key Files                           |
  |------------|-------|-------------------------------------|
  | service    | 3     | user_service.py, auth_service.py    |
  | model      | 2     | user.py, role.py                    |
  | route      | 2     | user_router.py, auth_router.py      |
  | schema     | 2     | user_schema.py, auth_schema.py      |
  | repository | 1     | user_repository.py                  |
  | test       | 2     | test_user.py, test_auth.py          |

===========================================================
```

---

## API Catalog (`/architecture api`)

```
===========================================================
  API Catalog
===========================================================

  Total Endpoints: <N>
  Domains with APIs: <N>

-----------------------------------------------------------
  member Domain (5 endpoints)
-----------------------------------------------------------

  | Method | Path                    | Handler        | Auth |
  |--------|-------------------------|----------------|------|
  | GET    | /api/members            | list_members   | Yes  |
  | GET    | /api/members/{id}       | get_member     | Yes  |
  | POST   | /api/members            | create_member  | Yes  |
  | PUT    | /api/members/{id}       | update_member  | Yes  |
  | DELETE | /api/members/{id}       | delete_member  | Yes  |

  File: src/domains/member/api/router.py

===========================================================
```

---

## Layer Structure (`/architecture layers`)

```
===========================================================
  Layer Structure
===========================================================

  Architecture Style: <Layered|Clean|Hexagonal>

-----------------------------------------------------------
  Layer Diagram (Mermaid)
-----------------------------------------------------------

  ```mermaid
  graph TB
    subgraph "Presentation Layer"
      api["API/Routes<br/>14 files"]
    end

    subgraph "Business Layer"
      service["Services<br/>12 files"]
    end

    subgraph "Domain Layer"
      model["Models/Entities<br/>8 files"]
    end

    subgraph "Infrastructure Layer"
      repo["Repositories<br/>6 files"]
    end

    api --> service
    service --> model
    service --> repo
  ```

-----------------------------------------------------------
  Layer Violations
-----------------------------------------------------------

  | Severity | File                          | Violation                     |
  |----------|-------------------------------|-------------------------------|
  | HIGH     | models/order.py:L15           | imports from services/        |

  Clean Architecture Compliance: 97%

===========================================================
```

---

## Technology Stack (`/architecture tech`)

```
===========================================================
  Technology Stack
===========================================================

-----------------------------------------------------------
  Core Stack
-----------------------------------------------------------

  | Category         | Technology        | Version   |
  |------------------|-------------------|-----------|
  | Language          | Python            | 3.14      |
  | Framework         | FastAPI           | 0.115.x   |
  | ORM               | SQLAlchemy        | 2.0.x     |
  | Database          | PostgreSQL        | 16.x      |
  | Validation        | Pydantic          | 2.x       |

-----------------------------------------------------------
  Infrastructure
-----------------------------------------------------------

  | Category         | Technology        |
  |------------------|-------------------|
  | Container         | Docker            |
  | CI/CD             | GitHub Actions    |
  | Cache             | Redis             |

-----------------------------------------------------------
  File Distribution
-----------------------------------------------------------

  | Extension | Count | Percentage |
  |-----------|-------|------------|
  | .py       | 85    | 62%        |
  | .ts       | 30    | 22%        |
  | .yaml     | 12    | 9%         |

===========================================================
```

---

## Specific Domain Detail (`/architecture <domain>`)

```
===========================================================
  Domain Detail: <domain-name>
===========================================================

  Domain: <domain-name>
  Path: <domain-path>
  Files: <N>
  APIs: <N>

-----------------------------------------------------------
  Directory Structure
-----------------------------------------------------------

  <domain-name>/
  +-- api/
  |   +-- router.py            (route, 6 endpoints)
  +-- services/
  |   +-- order_service.py     (service, core logic)
  +-- models/
  |   +-- order.py             (model, SQLAlchemy)
  +-- schemas/
  |   +-- order_schema.py      (schema, Pydantic)
  +-- repositories/
      +-- order_repository.py  (repository, CRUD)

-----------------------------------------------------------
  External Dependencies (Outgoing)
-----------------------------------------------------------

  | Target Domain | Ref Type | Details                          |
  |---------------|----------|----------------------------------|
  | member        | API      | GET /api/members/{id} (grade)    |
  | product       | API      | GET /api/products/{id} (price)   |

-----------------------------------------------------------
  Dependents (Incoming)
-----------------------------------------------------------

  | Source Domain | Ref Type | Details                          |
  |---------------|----------|----------------------------------|
  | payment       | API      | GET /api/orders/{id}             |

===========================================================
```
