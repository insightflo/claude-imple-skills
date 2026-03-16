# Progressive Disclosure Question Sets

> Progressive planning: ask only the questions needed, at the moment they are needed

---

## Phase 1 Questions (Initial)

> Core questions that must be answered at project start

```json
{
  "phase": "initial",
  "questions": [
    {
      "id": "purpose",
      "question": "What do you want to build?",
      "header": "Project Purpose",
      "type": "text",
      "required": true,
      "placeholder": "e.g., A web service where users can create and share their portfolios"
    },
    {
      "id": "features",
      "question": "What are the 3-5 core features?",
      "header": "Core Features",
      "type": "multi-select",
      "required": true,
      "options": [
        { "label": "User Authentication", "description": "Login / Sign-up / Profile" },
        { "label": "Content CRUD", "description": "Create / Read / Update / Delete" },
        { "label": "Search / Filter", "description": "Search and filtering" },
        { "label": "Social Features", "description": "Comments / Likes / Follow" },
        { "label": "Notifications", "description": "Email / Push notifications" },
        { "label": "Payments", "description": "Payment processing and management" },
        { "label": "Dashboard", "description": "Data visualization and analytics" },
        { "label": "Custom Input", "description": "Write the feature list yourself" }
      ]
    },
    {
      "id": "tech-stack",
      "question": "Do you have a preferred technology stack?",
      "header": "Technology Stack",
      "type": "single-select",
      "required": false,
      "options": [
        { "label": "React + Node.js", "description": "Traditional full-stack" },
        { "label": "Next.js", "description": "React-based full-stack framework" },
        { "label": "Vue + FastAPI", "description": "Python backend" },
        { "label": "SvelteKit", "description": "Next-generation full-stack" },
        { "label": "Not sure", "description": "Let AI recommend" }
      ]
    }
  ]
}
```

---

## Phase 2 Questions (After Skeleton Complete)

> Define specifics once the basic structure is in place

```json
{
  "phase": "skeleton-complete",
  "trigger": "T0.* completed",
  "questions": [
    {
      "id": "business-logic",
      "question": "Describe the specific behavior of each feature",
      "header": "Business Logic",
      "type": "table",
      "required": true,
      "columns": ["Feature", "Input", "Process", "Output", "Exception"],
      "examples": [
        ["Login", "Email, password", "Validate → issue JWT", "Access token", "Auth failure"],
        ["Create post", "Title, content", "Save → validate", "Post ID", "Validation failure"]
      ]
    },
    {
      "id": "data-model",
      "question": "What are the key entities and their relationships?",
      "header": "Data Model",
      "type": "entity-diagram",
      "required": true,
      "entities": [
        { "name": "User", "fields": ["id", "email", "name", "created_at"] },
        { "name": "Post", "fields": ["id", "user_id", "title", "content"] }
      ]
    },
    {
      "id": "api-contract",
      "question": "What are the key API endpoints?",
      "header": "API Contract",
      "type": "api-list",
      "required": true,
      "endpoints": [
        { "method": "GET", "path": "/api/users", "response": "User[]" },
        { "method": "POST", "path": "/api/users", "request": "{email, name, password}", "response": "User" }
      ]
    }
  ]
}
```

---

## Phase 3 Questions (During Muscles)

> Define details discovered as implementation progresses

```json
{
  "phase": "muscles-in-progress",
  "trigger": "T1.* in_progress",
  "questions": [
    {
      "id": "error-handling",
      "question": "What are the error scenarios and how should they be handled?",
      "header": "Error Handling",
      "type": "table",
      "required": true,
      "columns": ["Error Scenario", "HTTP Code", "User Message"],
      "examples": [
        ["Duplicate email", "409", "This email is already registered"],
        ["Auth failure", "401", "Email or password is incorrect"],
        ["Resource not found", "404", "The requested resource could not be found"]
      ]
    },
    {
      "id": "edge-cases",
      "question": "What are the edge cases?",
      "header": "Edge Cases",
      "type": "list",
      "required": false,
      "examples": [
        "Retry policy on network interruption",
        "Handling large file uploads",
        "Handling concurrent requests"
      ]
    },
    {
      "id": "performance",
      "question": "What are the performance targets?",
      "header": "Performance Requirements",
      "type": "table",
      "required": false,
      "columns": ["Metric", "Target", "Measurement Method"],
      "examples": [
        ["API response time", "< 200ms (p95)", "Datadog APM"],
        ["Page load", "< 2s (p95)", "Lighthouse"],
        ["Concurrent users", "1000", "Load test"]
      ]
    }
  ]
}
```

---

## Execution Flow

```
Start
  ↓
┌─────────────────────────────────────────┐
│ Phase 1 Questions (Required)            │
│   • purpose, features, tech-stack       │
└─────────────────────────────────────────┘
  ↓
[Governance setup / Implementation starts]
  ↓
┌─────────────────────────────────────────┐
│ At T0 completion                        │
│   • business-logic, data-model, api     │
└─────────────────────────────────────────┘
  ↓
[T1 in progress]
  ↓
┌─────────────────────────────────────────┐
│ Phase 3 Questions (Optional)            │
│   • error-handling, edge-cases, perf    │
└─────────────────────────────────────────┘
  ↓
Done
```

---

**Last Updated**: 2026-03-03
