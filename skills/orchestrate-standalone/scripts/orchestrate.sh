#!/bin/bash
#
# Orchestrate Standalone - Main Entry Point
#
# Executes tasks in parallel layers based on dependencies
#
# Usage:
#   ./orchestrate.sh [--mode=standard] [--resume]
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
NODE_CMD="${NODE_CMD:-node}"

MODE="${MODE:-standard}"
RESUME="${RESUME:-false}"
SPRINT_SIZE=30

# Worker pool size based on mode
declare -A WORKERS=(
    [lite]=2
    [standard]=4
    [full]=8
    [wave]=6
    [sprint]=4
)
WORKER_COUNT=${WORKERS[$MODE]:-4}

# Colors
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log_info()    { printf "${BLUE}[INFO]${NC} %s\n" "$1"; }
log_success() { printf "${GREEN}[OK]${NC}   %s\n" "$1"; }
log_warn()    { printf "${YELLOW}[WARN]${NC} %s\n" "$1"; }
log_error()   { printf "${RED}[ERR]${NC}  %s\n" "$1" >&2; }

header() {
    printf "\n${BOLD}%s${NC}\n" "$1"
    printf "%s\n" "$(printf '%.0s-' $(seq 1 ${#1}))"
}

# ---------------------------------------------------------------------------
# Parse Arguments
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
    case "$1" in
        --mode=*)
            MODE="${1#*=}"
            ;;
        --sprint-size=*)
            SPRINT_SIZE="${1#*=}"
            ;;
        --resume)
            RESUME=true
            ;;
        --help|-h)
            cat <<EOF
${BOLD}Orchestrate Standalone${NC}

Usage: $0 [OPTIONS]

Options:
  --mode=MODE       Execution mode: lite, standard, full, wave, sprint (default: standard)
  --sprint-size=N   Size of sprint for sprint mode (default: 30)
  --resume          Resume from previous state
  --help            Show this help

Modes:
  lite          2 workers (fastest, fewer checks)
  standard      4 workers (balanced)
  full          8 workers (most thorough)
  wave          6 workers (Hybrid Wave Architecture)
  sprint        4 workers (Agile Sprint Mode with gates)

Examples:
  $0                      # Standard mode
  $0 --mode=lite          # Lite mode
  $0 --resume             # Resume after interruption
EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
    shift
done

# Validate mode
case "$MODE" in
    lite|standard|full|wave|sprint)
        ;;
    *)
        log_error "Invalid mode: $MODE (must be: lite, standard, full, wave, or sprint)"
        exit 1
        ;;
esac

# ---------------------------------------------------------------------------
# Check Prerequisites
# ---------------------------------------------------------------------------

header "Checking Prerequisites"

TASKS_FILE="$PROJECT_DIR/TASKS.md"
if [ ! -f "$TASKS_FILE" ]; then
    log_error "TASKS.md not found at: $TASKS_FILE"
    log_info "Run /tasks-init first to create TASKS.md"
    exit 1
fi

log_success "TASKS.md found"

# Check Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Please install Node.js to run orchestrate-standalone."
    exit 1
fi

log_success "Node.js: $(node --version)"

# ---------------------------------------------------------------------------
# Parse Tasks and Build DAG
# ---------------------------------------------------------------------------

# Bug #4: sprint mode에서 scheduler.js 불필요 실행 방지
if [ "$MODE" != "sprint" ]; then
    header "Building Task Dependency Graph"

    LAYER_OUTPUT="$("$NODE_CMD" "$SCRIPT_DIR/scheduler.js" "$TASKS_FILE" 2>&1)"
    if [ $? -ne 0 ]; then
        log_error "Failed to parse tasks"
        echo "$LAYER_OUTPUT"
        exit 1
    fi

    LAYERS_FILE="$PROJECT_DIR/.claude/task-layers.json"
    if [ ! -f "$LAYERS_FILE" ]; then
        log_error "Failed to create task layers"
        exit 1
    fi

    TOTAL_LAYERS=$(node -e "const d = require('$LAYERS_FILE'); console.log(d.layers.length);")
    TOTAL_TASKS=$(node -e "const d = require('$LAYERS_FILE'); console.log(d.tasks.length);")

    log_success "$TOTAL_TASKS tasks organized into $TOTAL_LAYERS layers"
fi

# ---------------------------------------------------------------------------
# Execute Layers
# ---------------------------------------------------------------------------

# Sprint mode: special handling with planner/runner
if [ "$MODE" = "sprint" ]; then
    header "Executing Sprint Mode (Workers: $WORKER_COUNT, Sprint Size: $SPRINT_SIZE)"

    # Bug #8: resume이 아닐 때만 planner 실행
    if [ "$RESUME" != "true" ]; then
        if ! "$NODE_CMD" "$SCRIPT_DIR/sprint-planner.js" "$TASKS_FILE" "$SPRINT_SIZE"; then
            log_error "Sprint planning failed or cancelled"
            exit 1
        fi
    fi

    # Bug #7: Sprint 루프 - SPRINT_RUNNING 동안 반복
    while true; do
        SPRINT_STATE_VAL=$(node -e "
            try {
                const s = require('$PROJECT_DIR/.claude/sprint-state.json');
                console.log(s.state);
            } catch(e) { console.log('UNKNOWN'); }
        " 2>/dev/null || echo 'UNKNOWN')

        if [ "$SPRINT_STATE_VAL" != "SPRINT_RUNNING" ]; then
            log_info "Sprint state: $SPRINT_STATE_VAL — exiting loop"
            break
        fi

        "$NODE_CMD" "$SCRIPT_DIR/sprint-runner.js" "$TASKS_FILE"
        SPRINT_EXIT=$?

        # Bug #2: exit code별 분기 처리
        case $SPRINT_EXIT in
            0)
                log_success "Sprint completed"
                ;;
            2)
                log_warn "Modification requested. Instructions saved to .claude/sprint-state.json"
                log_info "Re-run: $0 --mode=sprint --resume"
                exit 2
                ;;
            3)
                log_info "Sprint stopped by user. State saved."
                log_info "Resume with: $0 --mode=sprint --resume"
                exit 0
                ;;
            *)
                log_error "Sprint runner failed (exit code: $SPRINT_EXIT)"
                exit 1
                ;;
        esac
    done

    header "Orchestration Complete"
    log_success "Sprint mode execution finished!"
    exit 0
fi

header "Executing Tasks (Mode: $MODE, Workers: $WORKER_COUNT)"

# Initialize state if not resuming
if [ "$RESUME" != "true" ]; then
    "$NODE_CMD" "$SCRIPT_DIR/state.js" clear &>/dev/null || true
fi

CURRENT_LAYER=0
if [ "$RESUME" = "true" ]; then
    CURRENT_LAYER=$("$NODE_CMD" "$SCRIPT_DIR/state.js" load 2>/dev/null | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).current_layer || 0")
    log_info "Resuming from layer $CURRENT_LAYER"
fi

while [ $CURRENT_LAYER -lt $TOTAL_LAYERS ]; do
    LAYER_NUM=$((CURRENT_LAYER + 1))

    # Get tasks for this layer
    LAYER_TASKS=$("$NODE_CMD" -e "
        const d = require('$LAYERS_FILE');
        const layer = d.layers[$CURRENT_LAYER] || [];
        console.log(JSON.stringify(layer));
    ")

    TASK_COUNT=$(echo "$LAYER_TASKS" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).length")

    header "Layer $LAYER_NUM/$TOTAL_LAYERS ($TASK_COUNT tasks)"

    # Pre-dispatch gate
    log_info "Running pre-dispatch gate..."
    for task in $(echo "$LAYER_TASKS" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).map(t => t.id).join(' ')"); do
        GATE_RESULT=$("$NODE_CMD" "$SCRIPT_DIR/gate-chain.js" pre-dispatch "$(echo "$LAYER_TASKS" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).find(t => t.id === '$task')")" 2>&1)
        GATE_PASSED=$(echo "$GATE_RESULT" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).passed")

        if [ "$GATE_PASSED" != "true" ]; then
            log_error "Pre-dispatch gate failed for task: $task"
            echo "$GATE_RESULT"
            exit 1
        fi
    done

    # Execute tasks in this layer (parallel)
    log_info "Executing $TASK_COUNT tasks with $WORKER_COUNT workers..."
    # TODO: Implement parallel execution using worker.js
    # For now, sequential execution as placeholder
    for task in $(echo "$LAYER_TASKS" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).map(t => t.id).join(' ')"); do
        log_info "  → $task"
        "$NODE_CMD" "$SCRIPT_DIR/worker.js" "$task" "$MODE" &>/dev/null &
    done

    # Wait for all tasks in this layer
    wait

    # Post-task gate
    log_info "Running post-task gate..."
    for task in $(echo "$LAYER_TASKS" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).map(t => t.id).join(' ')"); do
        GATE_RESULT=$("$NODE_CMD" "$SCRIPT_DIR/gate-chain.js" post-task "$(echo "$LAYER_TASKS" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).find(t => t.id === '$task')")" 2>&1)
        GATE_PASSED=$(echo "$GATE_RESULT" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).passed")

        if [ "$GATE_PASSED" != "true" ]; then
            log_warn "Post-task gate warning for: $task"
        fi
    done

    # Barrier gate after layer
    log_info "Running barrier gate..."
    BARRIER_RESULT=$("$NODE_CMD" "$SCRIPT_DIR/gate-chain.js" barrier "$CURRENT_LAYER" "$LAYER_TASKS" 2>&1)
    BARRIER_PASSED=$(echo "$BARRIER_RESULT" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).passed")

    if [ "$BARRIER_PASSED" != "true" ]; then
        log_error "Barrier gate failed at layer $LAYER_NUM"
        echo "$BARRIER_RESULT"
        exit 1
    fi

    # Update current layer
    "$NODE_CMD" "$SCRIPT_DIR/state.js" update "$CURRENT_LAYER" "current_layer=$LAYER_NUM" &>/dev/null
    CURRENT_LAYER=$LAYER_NUM

    log_success "Layer $LAYER_NUM/$TOTAL_LAYERS completed"
done

# ---------------------------------------------------------------------------
# Final Summary
# ---------------------------------------------------------------------------

header "Orchestration Complete"

PROGRESS=$("$NODE_CMD" "$SCRIPT_DIR/state.js" progress 2>/dev/null || echo '{}')
COMPLETED=$(echo "$PROGRESS" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).completed")
FAILED=$(echo "$PROGRESS" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).failed")
PERCENT=$(echo "$PROGRESS" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).percent")

log_success "Completed: $COMPLETED tasks"
if [ "$FAILED" -gt 0 ]; then
    log_warn "Failed: $FAILED tasks"
fi
log_info "Progress: ${PERCENT}%"

log_success "Orchestration finished!"
