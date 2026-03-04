#!/bin/bash
# statusline/install.sh — Install the TASKS.md progress segment into statusline
#
# Usage:
#   ./install.sh              # Auto-detect statusline, patch it
#   ./install.sh --check      # Just check current state
#   ./install.sh --uninstall  # Remove the segment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEGMENT_SCRIPT="$SCRIPT_DIR/statusline-segment.sh"
HOOK_SCRIPT="$SCRIPT_DIR/hooks/tasks-status-writer.js"
STATUSLINE_FILE="$HOME/.claude/awesome-statusline.sh"
HOOKS_DIR="$HOME/.claude/hooks"
SETTINGS_FILE="$HOME/.claude/settings.json"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

MARKER_START="# === TASKS STATUSLINE SEGMENT ==="
MARKER_END="# === END TASKS STATUSLINE SEGMENT ==="

check_state() {
    echo ""
    echo -e "${CYAN}Statusline status:${NC}"
    if [[ -f "$STATUSLINE_FILE" ]]; then
        echo -e "  ${GREEN}✓${NC} Statusline found: $STATUSLINE_FILE"
        if grep -q "$MARKER_START" "$STATUSLINE_FILE" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} Tasks segment: installed"
        else
            echo -e "  ${YELLOW}⚠${NC} Tasks segment: not installed"
        fi
    else
        echo -e "  ${YELLOW}⚠${NC} Statusline not found at $STATUSLINE_FILE"
    fi

    if [[ -f "$HOOKS_DIR/tasks-status-writer.js" ]]; then
        echo -e "  ${GREEN}✓${NC} Hook: installed"
    else
        echo -e "  ${YELLOW}⚠${NC} Hook: not installed"
    fi
    echo ""
}

install_hook() {
    mkdir -p "$HOOKS_DIR"
    cp "$HOOK_SCRIPT" "$HOOKS_DIR/tasks-status-writer.js"
    chmod +x "$HOOKS_DIR/tasks-status-writer.js"

    # Add hook to settings.json
    if [[ -f "$SETTINGS_FILE" ]] && command -v jq &>/dev/null; then
        TMP=$(mktemp)
        jq '.hooks.PostToolUse += [{"matcher": "Edit|Write", "hooks": [{"type": "command", "command": "node '"$HOOKS_DIR"'/tasks-status-writer.js"}]}]' \
            "$SETTINGS_FILE" > "$TMP" 2>/dev/null && mv "$TMP" "$SETTINGS_FILE" || rm -f "$TMP"
    fi
    echo -e "${GREEN}✓${NC} Hook installed"
}

install_segment() {
    if [[ ! -f "$STATUSLINE_FILE" ]]; then
        echo -e "${YELLOW}⚠${NC} No statusline found at $STATUSLINE_FILE"
        echo "  Create it first or use awesome-claude-plugins."
        return 1
    fi

    # Remove existing segment if present
    if grep -q "$MARKER_START" "$STATUSLINE_FILE" 2>/dev/null; then
        TMP=$(mktemp)
        awk "/$MARKER_START/,/$MARKER_END/{next} {print}" "$STATUSLINE_FILE" > "$TMP"
        mv "$TMP" "$STATUSLINE_FILE"
    fi

    # Append segment before final output section
    cat >> "$STATUSLINE_FILE" << SEGMENT

$MARKER_START
# Line 3: TASKS.md progress (added by claude-imple-skills/statusline)
TASKS_LINE3=\$("$SEGMENT_SCRIPT" "\$CURRENT_DIR" 2>/dev/null)
[[ -n "\$TASKS_LINE3" ]] && printf "%b\n" "\$TASKS_LINE3"
$MARKER_END
SEGMENT

    echo -e "${GREEN}✓${NC} Statusline segment installed (Line 3)"
}

uninstall() {
    if [[ -f "$STATUSLINE_FILE" ]] && grep -q "$MARKER_START" "$STATUSLINE_FILE" 2>/dev/null; then
        TMP=$(mktemp)
        awk "/$MARKER_START/,/$MARKER_END/{next} {print}" "$STATUSLINE_FILE" > "$TMP"
        mv "$TMP" "$STATUSLINE_FILE"
        echo -e "${GREEN}✓${NC} Segment removed from statusline"
    fi
    rm -f "$HOOKS_DIR/tasks-status-writer.js"
    echo -e "${GREEN}✓${NC} Hook removed"
}

case "${1:-}" in
    --check) check_state ;;
    --uninstall) uninstall ;;
    *)
        check_state
        install_hook
        install_segment
        echo ""
        echo -e "${GREEN}Installation complete.${NC}"
        echo "Restart Claude Code to see the new statusline."
        ;;
esac
