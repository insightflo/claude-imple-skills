#!/usr/bin/env bash
# board-show.sh — ASCII Kanban board renderer for task-board skill
#
# Reads .claude/collab/board-state.json and renders a terminal kanban board.
# Delegates rendering to Node.js for portability (avoids bash 4+ requirements).
#
# Usage:
#   ./board-show.sh [--project-dir=/path]
#   ./board-show.sh --rebuild   # rebuild board-state.json first

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILDER="$SCRIPT_DIR/board-builder.js"
TUI_MANIFEST="$SCRIPT_DIR/../tui/Cargo.toml"
TUI_BIN="$SCRIPT_DIR/../tui/target/debug/task-board-tui"
FORCE_TUI_CAPTURE="${WHITEBOX_TUI_CAPTURE:-0}"

# ---------------------------------------------------------------------------
# Args (parse BEFORE computing BOARD_FILE so --project-dir takes effect)
# ---------------------------------------------------------------------------

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
REBUILD=false
for arg in "$@"; do
  case "$arg" in
    --project-dir=*) PROJECT_DIR="${arg#--project-dir=}" ;;
    --rebuild) REBUILD=true ;;
  esac
done

BOARD_FILE="$PROJECT_DIR/.claude/collab/board-state.json"
DERIVED_META_FILE="$PROJECT_DIR/.claude/collab/derived-meta.json"
CONTROL_STATE_SCRIPT="$SCRIPT_DIR/../../whitebox/scripts/whitebox-control-state.js"
WHITEBOX_SUMMARY_SCRIPT="$SCRIPT_DIR/../../whitebox/scripts/whitebox-summary.js"

# ---------------------------------------------------------------------------
# Rebuild if requested or missing
# ---------------------------------------------------------------------------

needs_rebuild=false
if [[ "$REBUILD" == "true" ]] || [[ ! -f "$BOARD_FILE" ]]; then
  needs_rebuild=true
elif [[ -f "$DERIVED_META_FILE" ]] && command -v node &>/dev/null; then
  if node -e "const fs=require('fs');const file=process.argv[1];const markers=JSON.parse(fs.readFileSync(file,'utf8'));const stale=(markers||[]).some((entry)=>entry&&!entry.cleared_by&&['.claude/collab/board-state.json','.claude/collab/control-state.json','.claude/collab/whitebox-summary.json'].includes(entry.artifact));process.exit(stale?0:1);" "$DERIVED_META_FILE"; then
    needs_rebuild=true
  fi
fi

if [[ "$needs_rebuild" == "true" ]]; then
  if command -v node &>/dev/null && [[ -f "$BUILDER" ]]; then
    node "$BUILDER" --project-dir="$PROJECT_DIR" 2>&1 || true
    if [[ -f "$CONTROL_STATE_SCRIPT" ]]; then
      node "$CONTROL_STATE_SCRIPT" --project-dir="$PROJECT_DIR" >/dev/null 2>&1 || echo "Warning: control-state rebuild failed" >&2
    fi
    if [[ -f "$WHITEBOX_SUMMARY_SCRIPT" ]]; then
      node "$WHITEBOX_SUMMARY_SCRIPT" --project-dir="$PROJECT_DIR" >/dev/null 2>&1 || echo "Warning: whitebox-summary rebuild failed" >&2
    fi
  fi
fi

if [[ ! -f "$BOARD_FILE" ]]; then
  echo "No board-state.json found. Run: node skills/task-board/scripts/board-builder.js"
  exit 1
fi

if [[ "$FORCE_TUI_CAPTURE" == "1" ]] && [[ -f "$TUI_MANIFEST" ]] && command -v cargo &>/dev/null; then
  cargo run --quiet --manifest-path "$TUI_MANIFEST" -- --project-dir="$PROJECT_DIR" --snapshot && exit 0
fi

if [[ -t 0 && -t 1 ]] && [[ -f "$TUI_MANIFEST" ]] && command -v cargo &>/dev/null; then
  if [[ -x "$TUI_BIN" ]]; then
    "$TUI_BIN" --project-dir="$PROJECT_DIR" && exit 0
  fi

  cargo run --quiet --manifest-path "$TUI_MANIFEST" -- --project-dir="$PROJECT_DIR" && exit 0
fi

# ---------------------------------------------------------------------------
# Render via Node (portable, works with bash 3.2+ on macOS)
# ---------------------------------------------------------------------------

node - "$BOARD_FILE" <<'JSEOF'
'use strict';
const fs = require('fs');
const file = process.argv[2];  // argv[0]=node, argv[1]="-", argv[2]=file

const board = JSON.parse(fs.readFileSync(file, 'utf8'));
const COL_ORDER = ['Backlog', 'In Progress', 'Blocked', 'Done'];
const COL_WIDTH = 22;

// ANSI colors
const R = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const C = {
  Backlog:       '\x1b[38;2;88;91;112m',
  'In Progress': '\x1b[38;2;137;180;250m',
  Blocked:       '\x1b[38;2;243;139;168m',
  Done:          '\x1b[38;2;166;227;161m',
};

function pad(s, w) {
  const str = String(s);
  if (str.length >= w) return str.slice(0, w - 1) + '…';
  return str + ' '.repeat(w - str.length);
}

const now = new Date().toLocaleString('ko-KR', { hour12: false });
process.stdout.write(`\nTask Board  ${now}\n\n`);

// Header
for (const col of COL_ORDER) {
  const count = (board.columns[col] || []).length;
  process.stdout.write(`${C[col]}${BOLD}${pad(col + ' (' + count + ')', COL_WIDTH)}${R}  `);
}
process.stdout.write('\n');

// Separator
for (let i = 0; i < COL_ORDER.length; i++) {
  process.stdout.write('─'.repeat(COL_WIDTH) + '  ');
}
process.stdout.write('\n');

// Cards
const maxRows = Math.max(...COL_ORDER.map(col => (board.columns[col] || []).length));
for (let row = 0; row < maxRows; row++) {
  for (const col of COL_ORDER) {
    const cards = board.columns[col] || [];
    if (row < cards.length) {
      const card = cards[row];
      const label = card.id + (card.agent ? ` [${card.agent}]` : '');
      process.stdout.write(pad(label, COL_WIDTH) + '  ');
    } else {
      process.stdout.write(' '.repeat(COL_WIDTH) + '  ');
    }
  }
  process.stdout.write('\n');
}

process.stdout.write('\n');
JSEOF
