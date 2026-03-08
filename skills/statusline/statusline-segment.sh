#!/bin/bash
# statusline-segment.sh — TASKS.md progress for Claude Code statusline
#
# Outputs Line 3: 📋 DONE/TOTAL ▓▓▓░░░░░░░  Phase N  → T1.1: Next task
# If no TASKS.md found, outputs nothing.
#
# Usage: source or call standalone; always reads from project root.

# ============================================================================
# Colors (Catppuccin Mocha)
# ============================================================================
RESET="\033[0m"
BOLD="\033[1m"
CLR="\033[K"
C_TEAL="\033[38;2;148;226;213m"
C_GREEN="\033[38;2;166;227;161m"
C_PEACH="\033[38;2;250;179;135m"
C_YELLOW="\033[38;2;249;226;175m"
C_PINK="\033[38;2;245;194;231m"
C_DIM="\033[38;2;88;91;112m"

# ============================================================================
# Find project root
# ============================================================================
CURRENT_DIR="${1:-$(pwd)}"
PROJECT_ROOT=$(cd "$CURRENT_DIR" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null || echo "$CURRENT_DIR")
TASKS_FILE="$PROJECT_ROOT/TASKS.md"
SUMMARY_FILE="$PROJECT_ROOT/.claude/collab/whitebox-summary.json"

[[ ! -f "$TASKS_FILE" ]] && exit 0

# ============================================================================
# Cache (30s TTL)
# ============================================================================
CACHE_HASH=$(printf '%s' "$PROJECT_ROOT" | md5 2>/dev/null || printf '%s' "$PROJECT_ROOT" | md5sum 2>/dev/null | cut -c1-8)
CACHE_FILE="${TMPDIR:-/tmp}/.claude_tasks_status_${CACHE_HASH}"

use_cache=false
if [[ -f "$CACHE_FILE" ]]; then
    file_mtime=$(stat -f %m "$CACHE_FILE" 2>/dev/null || stat -c %Y "$CACHE_FILE" 2>/dev/null)
    if [[ -n "$file_mtime" ]]; then
        file_age=$(( $(date +%s) - file_mtime ))
        [[ "$file_age" -lt 30 ]] && use_cache=true
    fi
fi

if [[ "$use_cache" == false ]]; then
    DONE=$(grep -Ec '^(###|-)[[:space:]]+\[x\]' "$TASKS_FILE" 2>/dev/null || true)
    TOTAL=$(grep -Ec '^(###|-)[[:space:]]+\[' "$TASKS_FILE" 2>/dev/null || true)
    DONE="${DONE:-0}"
    TOTAL="${TOTAL:-0}"

    # Current phase: first ## Phase line that still has incomplete tasks below it
    CURRENT_PHASE=""
    current_phase_candidate=""
    while IFS= read -r line; do
        if [[ "$line" =~ ^##\ Phase\ ([0-9]+) ]]; then
            current_phase_candidate="Phase ${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^##[[:space:]]+T([0-9]+)\b ]]; then
            current_phase_candidate="T${BASH_REMATCH[1]}"
        elif [[ "$line" =~ ^(###|-)[[:space:]]+\[\ \] ]] && [[ -n "$current_phase_candidate" ]]; then
            CURRENT_PHASE="$current_phase_candidate"
            break
        fi
    done < "$TASKS_FILE"

    # Next incomplete task
    NEXT_TASK=$(grep -Em1 '^(###|-)[[:space:]]+\[ \]' "$TASKS_FILE" 2>/dev/null | sed -E 's/^(###|-)[[:space:]]+\[ \][[:space:]]*//' | tr '\t' ' ' | awk '{if(length($0)>28) print substr($0,1,28)"…"; else print}')

    printf "%s\t%s\t%s\t%s\n" "$DONE" "$TOTAL" "$CURRENT_PHASE" "$NEXT_TASK" > "$CACHE_FILE"
fi

# Read from cache
IFS=$'\t' read -r DONE TOTAL CURRENT_PHASE NEXT_TASK < "$CACHE_FILE"
DONE="${DONE:-0}"
TOTAL="${TOTAL:-0}"

[[ "$TOTAL" -eq 0 ]] && exit 0

# ============================================================================
# Progress bar
# ============================================================================
BAR_WIDTH=10
FILLED=$(( DONE * BAR_WIDTH / TOTAL ))
[[ $FILLED -gt $BAR_WIDTH ]] && FILLED=$BAR_WIDTH
EMPTY=$(( BAR_WIDTH - FILLED ))

BAR=""
for ((i=0; i<FILLED; i++)); do BAR+="${C_GREEN}▓"; done
for ((i=0; i<EMPTY; i++)); do BAR+="${C_DIM}░"; done
BAR+="${RESET}"

# ============================================================================
# Assemble Line 3
# ============================================================================
WB_BLOCKED="0"
WB_STALE="0"
WB_GATE=""
WB_RUN=""

if [[ -f "$SUMMARY_FILE" ]]; then
    WB_BLOCKED=$(grep -m1 '"blocked_count"' "$SUMMARY_FILE" 2>/dev/null | sed -E 's/.*: ([0-9]+).*/\1/' | tr -d ',')
    WB_STALE=$(grep -m1 '"stale_artifact_count"' "$SUMMARY_FILE" 2>/dev/null | sed -E 's/.*: ([0-9]+).*/\1/' | tr -d ',')
    WB_GATE=$(grep -m1 '"gate_status"' "$SUMMARY_FILE" 2>/dev/null | sed -E 's/.*: "([^"]+)".*/\1/')
    WB_RUN=$(grep -m1 '"run_id_short"' "$SUMMARY_FILE" 2>/dev/null | sed -E 's/.*: "([^"]+)".*/\1/')
fi

SEG_RATIO="${C_TEAL}${BOLD}📋 ${DONE}/${TOTAL}${RESET}"
SEG_BAR=" ${BAR} "
SEG_PHASE=""
[[ -n "$CURRENT_PHASE" ]] && SEG_PHASE="${C_PEACH}${CURRENT_PHASE}${RESET}  "
SEG_NEXT=""
[[ -n "$NEXT_TASK" ]] && SEG_NEXT="${C_YELLOW}→${RESET} ${C_PINK}${NEXT_TASK}${RESET}"
SEG_WB=""

if [[ "$WB_STALE" =~ ^[0-9]+$ ]] && [[ "$WB_STALE" -gt 0 ]]; then
    SEG_WB="  ${C_YELLOW}WB stale:${WB_STALE}${RESET}"
elif [[ "$WB_BLOCKED" =~ ^[0-9]+$ ]] && [[ "$WB_BLOCKED" -gt 0 ]]; then
    SEG_WB="  ${C_YELLOW}WB blocked:${WB_BLOCKED}${RESET}"
elif [[ "$WB_GATE" == "running" ]] && [[ -n "$WB_RUN" ]] && [[ "$WB_RUN" != "null" ]]; then
    SEG_WB="  ${C_TEAL}WB ${WB_RUN}${RESET}"
fi

# All done state
if [[ "$DONE" -eq "$TOTAL" ]]; then
    printf "%b%b\n" "${C_GREEN}✓ All tasks complete (${DONE}/${TOTAL})${RESET}" "$CLR"
    exit 0
fi

LINE3="${SEG_RATIO}${SEG_BAR}${SEG_PHASE}${SEG_NEXT}${SEG_WB}"
printf "%b%b\n" "$LINE3" "$CLR"
