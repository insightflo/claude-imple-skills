# Phase 3: Chief Designer Detailed Guide

## Role
Define the design system, UI/UX guidelines

## Deliverable
`design/system/*.md`

## Task Invocation

```
Task({
  subagent_type: "frontend-specialist",
  description: "Designer: Design system definition",
  prompt: `
## Role: Chief Designer

You are the Chief Designer for this project. Define the design system.

## Input
- PRD: docs/planning/01-prd.md (user requirements)
- Screen Specs: specs/screens/*.yaml (if available)

## Deliverable: design/system/ folder

### design/system/tokens.md
Design token definitions:
- Color Palette (Primary, Secondary, Neutral, Semantic)
- Typography Scale (Font family, sizes, weights)
- Spacing Scale (4px base grid)
- Border Radius, Shadows

### design/system/components.md
Component rules:
- Button variants (Primary, Secondary, Ghost, Danger)
- Input fields (Text, Select, Checkbox, Radio)
- Card, Modal, Toast
- State styles (Default, Hover, Active, Disabled, Error)

### design/system/layout.md
Layout rules:
- Grid system (12-column)
- Breakpoints (Mobile, Tablet, Desktop)
- Container widths
- Page templates

### design/system/accessibility.md
Accessibility guide:
- Color contrast ratios (WCAG AA)
- Focus indicators
- ARIA label rules
- Keyboard navigation

### (Required) Governance Operationalization (Doc → Execution)
- To ensure the design system is reflected in actual development, include the following in each document (or a shared section):
  - Propose a single-entry verification command: `scripts/verify_all.sh` or `make verify`
  - A mapping table of check tools/CI jobs/artifact paths/Block vs Warn for Tokens/Components/Visual regression/a11y
  - Update triggers (token changes, a11y violations, new core patterns added)

## Notes
- Do not write implementation code (CSS/Tailwind examples only)
- Define a consistent design language
`
})
```

## Completion Criteria
- [ ] `design/system/` folder created
- [ ] At least 4 documents written
- [ ] At least 5 colors defined in the color palette

## Design Token Example

```markdown
# Design Tokens

## Colors

### Primary
- primary-50: #EEF2FF
- primary-500: #6366F1
- primary-900: #312E81

### Neutral
- gray-50: #F9FAFB
- gray-500: #6B7280
- gray-900: #111827

### Semantic
- success: #10B981
- warning: #F59E0B
- error: #EF4444
- info: #3B82F6

## Typography

| Name | Size | Weight | Line Height |
|------|------|--------|-------------|
| h1 | 2.25rem | 700 | 2.5rem |
| h2 | 1.875rem | 600 | 2.25rem |
| body | 1rem | 400 | 1.5rem |
| small | 0.875rem | 400 | 1.25rem |

## Spacing
- 4px (xs), 8px (sm), 16px (md), 24px (lg), 32px (xl)
```
