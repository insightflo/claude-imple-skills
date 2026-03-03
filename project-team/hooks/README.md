# Claude Project Team Hooks

## Overview

This directory contains Claude Code hooks that enforce project standards and team collaboration protocols.

## Installed Hooks

### 1. permission-checker.js (Pre-Tool-Use)

**Event**: `pre_tool_use`
**Tools**: `Edit`, `Write`
**Task**: P2-T1

Validates agent file access permissions based on role-specific access rights matrix.

**Features**:
- Static role permissions (project-manager, chief-architect, chief-designer, dba, qa-manager, maintenance-analyst)
- Domain-scoped template roles (part-leader, designer, developer)
- Domain boundary violation detection
- Clear escalation guidance

**Usage**:
```bash
export CLAUDE_AGENT_ROLE="auth-developer"
# Edit/Write operations will be validated against access_rights
```

**Test**:
```bash
node __tests__/permission-checker.test.js
```

---

### 2. design-validator.js (Post-Tool-Use)

**Event**: `post_tool_use`
**Tools**: `Edit`, `Write`
**Task**: P2-T3

Enforces design system compliance by validating UI code against design standards.

**Validation Rules**:

| Rule | Severity | Description |
|------|----------|-------------|
| Inline styles | ❌ Error | React `style={{}}` patterns are forbidden |
| Hardcoded colors | ❌ Error | Hex, RGB, HSL values without design tokens |
| Non-standard spacing | ⚠️ Warning | Values not in 4px multiples (4, 8, 16, 24, 32, 48) |

**Design Token Requirements**:
- Colors: `var(--color-*)` (e.g., `var(--color-primary)`)
- Spacing: `var(--space-*)` (e.g., `var(--space-4)`)
- Typography: `var(--font-*)` (e.g., `var(--font-heading)`)

**File Patterns**:
- Validates: `*.tsx`, `*.jsx`, `*.css`, `*.scss`, `*.styles.ts`
- Skips: `tokens.css`, `design-tokens.css`, `variables.css`, `theme.ts`, `__tests__/**`, `*.test.*`, `*.spec.*`

**Examples**:

```tsx
// ❌ VIOLATIONS (Errors)
<div style={{ color: 'red', padding: '15px' }}>  // Inline styles
  <span style={{ fontSize: '18px' }}>Text</span>  // Inline styles
</div>

.button {
  background-color: #3b82f6;  // Hardcoded hex color
  color: rgb(255, 255, 255);   // Hardcoded RGB color
}

// ⚠️ WARNINGS (Non-blocking)
.card {
  padding: 15px;  // Not a 4px multiple (use 16px)
  margin: 5px;    // Not a 4px multiple (use 4px or 8px)
}

// ✅ VALID (Design Tokens)
<div className="button">  // CSS class
  <span className="text">Text</span>
</div>

.button {
  background-color: var(--color-primary);  // Design token
  color: var(--color-text);                 // Design token
  padding: var(--space-4);                  // Design token
  margin: 16px;                             // 4px multiple
}
```

**Testing**:

```bash
# Run unit tests
node __tests__/design-validator.test.js

# Test inline style violation (should deny)
echo '{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "src/components/Button.tsx",
    "content": "<div style={{ color: \"red\" }}>Button</div>"
  }
}' | node design-validator.js | jq .

# Expected output:
# {
#   "decision": "deny",
#   "reason": "[Design System Violation] File \"src/components/Button.tsx\" contains design rule violations:..."
# }

# Test valid design tokens (should allow silently)
echo '{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "src/components/Button.tsx",
    "content": "<div className=\"button\">Click me</div>\n.button { background-color: var(--color-primary); }"
  }
}' | node design-validator.js

# Expected output: (no output = silent allow)

# Test spacing warnings (should warn but allow)
echo '{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "src/components/Card.css",
    "content": ".card { padding: 15px; }"
  }
}' | node design-validator.js | jq .

# Expected output:
# {
#   "hookSpecificOutput": {
#     "additionalContext": "[Design System] File \"src/components/Card.css\" has 1 design warning(s):..."
#   }
# }
```

**Hook Protocol**:

Input (stdin):
```json
{
  "tool_name": "Edit" | "Write",
  "tool_input": {
    "file_path": "/absolute/path/to/file",
    "content": "file content string"
  }
}
```

Output (stdout):

- **Deny** (violations found):
  ```json
  {
    "decision": "deny",
    "reason": "Detailed violation message with line numbers and guide"
  }
  ```

- **Warning** (warnings only, non-blocking):
  ```json
  {
    "hookSpecificOutput": {
      "additionalContext": "Warning message with recommendations"
    }
  }
  ```

- **Allow** (valid or skipped):
  - No output (silent allow)

---

## Hook Installation

To use these hooks in a Claude Code project:

1. Copy hooks to project `.claude/hooks/` directory:
   ```bash
   mkdir -p .claude/hooks
   cp hooks/*.js .claude/hooks/
   ```

2. Make hooks executable:
   ```bash
   chmod +x .claude/hooks/*.js
   ```

3. Configure environment variables (for permission-checker):
   ```bash
   export CLAUDE_AGENT_ROLE="your-agent-role"
   export CLAUDE_PROJECT_DIR="$(pwd)"
   ```

4. Hooks will automatically run on `Edit` and `Write` tool calls.

---

## Development

### Adding New Hooks

1. Create hook file in `hooks/` directory
2. Follow Claude Code Hook Protocol:
   - Read JSON from stdin
   - Perform validation/processing
   - Write JSON to stdout
3. Set executable permission: `chmod +x hooks/your-hook.js`
4. Add tests in `hooks/__tests__/`
5. Document in this README

### Testing Hooks

```bash
# Unit tests (if using a test framework)
npm test

# Manual stdin/stdout test
echo '{"tool_name":"Write","tool_input":{...}}' | node hooks/your-hook.js | jq .

# Integration test with Claude Code
# (hook will run automatically during Edit/Write operations)
```

---

## Design System Reference

For full design system documentation, see:
- `contracts/standards/design-system.md`

Key principles:
- **Design tokens only**: Never hardcode colors, spacing, or typography
- **No inline styles**: Always use CSS classes or styled-components
- **4px spacing grid**: All spacing values must be multiples of 4px
- **Semantic naming**: Use meaningful token names (e.g., `--color-primary`, not `--color-blue`)

---

## Troubleshooting

### Hook not running

1. Check executable permission: `ls -la .claude/hooks/*.js`
2. Verify hook syntax: `node .claude/hooks/your-hook.js < test-input.json`
3. Check Claude Code configuration

### Permission checker denying legitimate access

1. Verify `CLAUDE_AGENT_ROLE` environment variable
2. Check role permissions in `permission-checker.js` PERMISSION_MATRIX
3. Review access_rights in agent definition files

### Design validator false positives

1. Check if file should be skipped (tokens, theme, test files)
2. Verify design token usage syntax: `var(--token-name)`
3. Ensure spacing values are 4px multiples or design tokens

---

### 4. interface-validator.js (Post-Tool-Use)

**Event**: `post_tool_use`
**Tools**: `Edit`, `Write`
**Task**: P2-T5

Validates domain interface contracts when YAML specs are modified. Detects breaking changes, performs impact analysis, and identifies affected consumer domains.

**Validation Rules**:

| Change Type | Breaking? | Action |
|------------|----------|--------|
| Field added | No | Notification only |
| Field removed | Yes | Requires consumer updates |
| Field type changed | Yes | Requires consumer updates |
| Endpoint removed | Yes | Requires consumer migration |
| Endpoint added | No | Notification only |
| Version bump | No | Informational |

**File Patterns**:
- Validates: `contracts/interfaces/**/*.yaml`, `contracts/interfaces/**/*.yml`

**Features**:
- YAML spec parsing (key-value, nested objects, arrays)
- Previous vs new spec comparison
- Breaking change detection and classification
- Consumer domain impact analysis
- Suggested files for consumer updates
- Machine-readable JSON output format

**Interface Contract Format**:

```yaml
# contracts/interfaces/member-api.yaml
version: 1.1.0
domain: member
endpoints:
  - path: /api/members/{id}
    method: GET
    response:
      id: uuid
      name: string
      email: string
      grade: string
consumers:
  - domain: order
    uses: [GET /api/members/{id}]
```

**Testing**:

```bash
# Run unit tests
node __tests__/interface-validator.test.js

# Or with jest
npx jest __tests__/interface-validator.test.js --verbose
```

**Hook Protocol**:

Input (stdin):
```json
{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "contracts/interfaces/member-api.yaml",
    "content": "new YAML content",
    "old_content": "previous YAML content"
  }
}
```

Output (stdout):

- **Breaking change detected**:
  ```json
  {
    "hookSpecificOutput": {
      "additionalContext": "[Interface Contract BREAKING CHANGE] Domain \"member\" v2.0.0\n  Changes: 1 breaking..."
    }
  }
  ```

- **Non-breaking update**:
  ```json
  {
    "hookSpecificOutput": {
      "additionalContext": "[Interface Contract SPEC UPDATE] Domain \"member\" v1.1.0\n  Changes: 1 non-breaking..."
    }
  }
  ```

- **New spec creation**:
  ```json
  {
    "hookSpecificOutput": {
      "additionalContext": "[Interface Contract NEW] Domain \"member\" v1.0.0\n  Endpoints: 1\n  Consumers: 1..."
    }
  }
  ```

---

### 11. task-sync.js (Post-Tool-Use)

**Event**: `post_tool_use`
**Tools**: `Edit`, `Write`, `TaskUpdate`
**Task**: Task synchronization

Automatically syncs task completion status to the original TASKS.md file.

**Problem Solved**:
- Task files may be in different locations (TASKS.md, docs/planning/06-tasks.md, etc.)
- Task completion doesn't always sync to the original file
- This hook finds the task file regardless of location and updates it

**Features**:
- Auto-discovers task file (TASKS.md, docs/planning/06-tasks.md, etc.)
- Extracts task IDs from code comments (@TASK P1-T1, #P1-T1)
- Updates checkboxes when tasks are marked complete
- Integrates with Claude's internal TaskUpdate tool

**Task ID Patterns**:

| Format | Example | Description |
|--------|---------|-------------|
| **Phase-based** | `P1-T1`, `P2-S1-T3` | Phase/Screen/Task 구조 |
| **Agile layer** | `T0.1`, `T1.2`, `T3.4` | Layer.Sequence 구조 |

```
# Phase-based (P*-T*)
@TASK P1-T1          # Code comment annotation
#P1-T1               # Hashtag reference
Task P1-T1 completed # Explicit completion mention
[P1-T1]              # Bracket notation (commit messages)

# Agile layer (T*.*)
@TASK T0.1           # Skeleton task
#T1.2                # Muscles task reference
Task T3.4 completed  # Skin task completion
[T2.1]               # Advanced muscles task
```

**Task File Discovery Order**:
1. `TASKS.md` (project root, canonical)
2. `docs/planning/06-tasks.md` (legacy convention)
3. `docs/planning/tasks.md`
4. `docs/tasks.md`
5. Any `*tasks*.md` file (fallback search)

**Output Example**:
```json
{
  "hookSpecificOutput": {
    "additionalContext": "[Task Sync]\n  Tasks File: docs/planning/06-tasks.md\n  Updated: P1-T1, P1-T2\n"
  }
}
```

**Configuration**:
Add to `~/.claude/settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${HOME}/.claude/hooks/task-sync.js\"",
            "timeout": 5,
            "statusMessage": "Syncing task status..."
          }
        ]
      },
      {
        "matcher": "TaskUpdate",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${HOME}/.claude/hooks/task-sync.js\"",
            "timeout": 5,
            "statusMessage": "Syncing task to TASKS.md..."
          }
        ]
      }
    ]
  }
}
```

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-08 | 1.2.0 | Add task-sync hook for TASKS.md synchronization |
| 2026-02-07 | 1.1.0 | Add interface-validator for domain contract enforcement |
| 2026-02-07 | 1.0.0 | Initial release with permission-checker and design-validator |
