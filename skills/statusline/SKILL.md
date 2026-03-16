---
name: statusline
description: Displays TASKS.md progress in real time on Line 3 of the Claude Code status bar. Use this whenever you want a live view of project progress or need task tracking at a glance. Guides "show progress", "set up statusline", or "task status" requests. Triggered by /statusline.
version: 1.1.0
---

# Statusline — TASKS.md Progress

Displays project task progress in real time on the Claude Code status bar.

```
📋 12/34 ▓▓▓░░░░░░░  Phase 2  → T2.1: Build API
```

## Installation

```bash
./skills/statusline/install.sh
```

Or installed automatically at Step 5 of the root `install.sh`.

## Displayed Information

| Field | Description |
|-------|-------------|
| `📋 12/34` | Completed / total task count |
| `▓▓▓░░░░░░░` | Progress bar (10 segments) |
| `Phase 2` | Currently active phase |
| `→ T2.1: ...` | Next incomplete task |

## How It Works

1. `statusline-segment.sh` — Parses TASKS.md on each status bar refresh (30-second cache)
2. `hooks/tasks-status-writer.js` — Immediately invalidates the cache whenever TASKS.md is edited

## File Structure

```
skills/statusline/
├── SKILL.md
├── install.sh              # Installation script
├── statusline-segment.sh   # Status bar Line 3 output
└── hooks/
    └── tasks-status-writer.js  # PostToolUse hook
```

## Related

- [simple-claude-board](https://github.com/insightflo/simple-claude-board) — Full TUI dashboard
- [awesome-claude-plugins](https://github.com/AwesomeJun/awesome-claude-plugins) — Status bar plugins
