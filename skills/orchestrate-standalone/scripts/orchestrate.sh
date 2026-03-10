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
COLLAB_INIT_SCRIPT="$SCRIPT_DIR/../../../project-team/scripts/collab-init.js"
BOARD_BUILDER_SCRIPT="$SCRIPT_DIR/../../task-board/scripts/board-builder.js"
BOARD_SHOW_SCRIPT="$SCRIPT_DIR/../../task-board/scripts/board-show.sh"
WHITEBOX_DASHBOARD_SCRIPT="$SCRIPT_DIR/../../whitebox/scripts/whitebox-dashboard.js"

MODE="${MODE:-standard}"
RESUME="${RESUME:-false}"
SPRINT_SIZE=30
AUTO_GOAL=""
AUTO_MAX_ITERATIONS=""
AUTO_MAX_DYNAMIC_TASKS=""
AUTO_WORKER_COUNT=""
AUTO_MAX_CONSECUTIVE_FAILURES=""
WORKER_COUNT=4

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

resolve_worker_count() {
    case "$MODE" in
        lite)
            WORKER_COUNT=2
            ;;
        standard)
            WORKER_COUNT=4
            ;;
        full)
            WORKER_COUNT=8
            ;;
        wave)
            WORKER_COUNT=6
            ;;
        sprint)
            WORKER_COUNT=4
            ;;
        auto)
            WORKER_COUNT=4
            ;;
        *)
            WORKER_COUNT=4
            ;;
    esac
}

header() {
    printf "\n${BOLD}%s${NC}\n" "$1"
    printf "%s\n" "$(printf '%.0s-' $(seq 1 ${#1}))"
}

ensure_git_repo() {
    if [ -d "$PROJECT_DIR/.git" ]; then
        return 0
    fi

    if ! command -v git >/dev/null 2>&1; then
        log_warn "Git not found. Continuing without auto git init."
        return 0
    fi

    git init -q "$PROJECT_DIR"
    log_info "Whitebox auto-init created a git repository in $PROJECT_DIR"
}

ensure_claude_dirs() {
    mkdir -p "$PROJECT_DIR/.claude"
}

ensure_node_runtime() {
    if ! command -v "$NODE_CMD" >/dev/null 2>&1; then
        log_error "Node.js not found. Please install Node.js to run orchestrate-standalone."
        exit 1
    fi

    log_success "Node.js: $($NODE_CMD --version)"
}

ensure_collab_bus() {
    local collab_dir="$PROJECT_DIR/.claude/collab"

    if [ ! -f "$COLLAB_INIT_SCRIPT" ]; then
        mkdir -p "$collab_dir/contracts" "$collab_dir/requests" "$collab_dir/decisions" "$collab_dir/locks" "$collab_dir/archive"
        : > "$collab_dir/events.ndjson"
        if [ ! -f "$collab_dir/board-state.json" ]; then
            printf '{\n  "version": "1.0",\n  "generated_at": "%s",\n  "columns": {"Backlog": [], "In Progress": [], "Blocked": [], "Done": []}\n}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$collab_dir/board-state.json"
        fi
        log_warn "collab-init script not found; created minimal whitebox collab directories instead"
        return 0
    fi

    "$NODE_CMD" "$COLLAB_INIT_SCRIPT" --project-dir="$PROJECT_DIR" >/dev/null 2>&1 || true
}

rebuild_board_state() {
    if [ ! -f "$TASKS_FILE" ]; then
        return 0
    fi

    if [ ! -f "$BOARD_BUILDER_SCRIPT" ]; then
        return 0
    fi

    "$NODE_CMD" "$BOARD_BUILDER_SCRIPT" --project-dir="$PROJECT_DIR" >/dev/null 2>&1 || true
}

build_wave_plan() {
    if [ "$MODE" != "wave" ]; then
        return 0
    fi

    if [ ! -f "$TASKS_FILE" ]; then
        return 0
    fi

    "$NODE_CMD" "$SCRIPT_DIR/engine/scheduler.js" "$TASKS_FILE" wave 30 >/dev/null 2>&1 || true
}

show_whitebox_board() {
    local phase="${1:-status}"
    local auto_open_tui="${WHITEBOX_AUTO_OPEN_TUI:-1}"
    local auto_open_browser="${WHITEBOX_AUTO_OPEN_BROWSER:-1}"

    if [ ! -f "$BOARD_SHOW_SCRIPT" ]; then
        return 0
    fi

    rebuild_board_state

    if [ ! -t 0 ] || [ ! -t 1 ]; then
        bash "$BOARD_SHOW_SCRIPT" --rebuild --project-dir="$PROJECT_DIR" || true
        return 0
    fi

    if [ "$auto_open_browser" != "0" ] && [ -f "$WHITEBOX_DASHBOARD_SCRIPT" ] && [ -z "${CI:-}" ]; then
        local dashboard_url
        dashboard_url="$($NODE_CMD "$WHITEBOX_DASHBOARD_SCRIPT" open --project-dir="$PROJECT_DIR" 2>/dev/null || true)"
        if [ -n "$dashboard_url" ]; then
            log_info "Whitebox dashboard for ${phase}: ${dashboard_url}"
            return 0
        fi
    fi

    if [ "$auto_open_tui" = "0" ]; then
        log_info "Whitebox UI available for ${phase}. Set WHITEBOX_AUTO_OPEN_BROWSER=1 or WHITEBOX_AUTO_OPEN_TUI=1 to open automatically."
        return 0
    fi

    log_info "Opening whitebox board for ${phase}."
    bash "$BOARD_SHOW_SCRIPT" --rebuild --project-dir="$PROJECT_DIR" || true
}

exit_with_board() {
    local code="$1"
    local phase="${2:-status}"
    show_whitebox_board "$phase"
    exit "$code"
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
        --goal=*)
            AUTO_GOAL="${1#*=}"
            ;;
        --max-iterations=*)
            AUTO_MAX_ITERATIONS="${1#*=}"
            ;;
        --max-dynamic-tasks=*)
            AUTO_MAX_DYNAMIC_TASKS="${1#*=}"
            ;;
        --worker-count=*)
            AUTO_WORKER_COUNT="${1#*=}"
            ;;
        --max-consecutive-failures=*)
            AUTO_MAX_CONSECUTIVE_FAILURES="${1#*=}"
            ;;
        --help|-h)
            cat <<EOF
${BOLD}Orchestrate Standalone${NC}

Usage: $0 [OPTIONS]

Options:
  --mode=MODE       Execution mode: lite, standard, full, wave, sprint, auto (default: standard)
  --goal=GOAL       Goal for auto mode (required for --mode=auto)
  --sprint-size=N   Size of sprint for sprint mode (default: 30)
  --resume          Resume from previous state
  --help            Show this help

Modes:
  lite          2 workers (fastest, fewer checks)
  standard      4 workers (balanced)
  full          8 workers (most thorough)
  wave          6 workers (Hybrid Wave Architecture)
  sprint        4 workers (Agile Sprint Mode with gates)
  auto          Autonomous DCPEA loop (Define→Decompose→Plan→Execute→Assess→Adjust)

Examples:
  $0                                          # Standard mode
  $0 --mode=lite                              # Lite mode
  $0 --mode=auto --goal="Build user auth"     # Auto mode
  $0 --mode=auto --resume                     # Resume auto mode
  $0 --resume                                 # Resume after interruption
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
    lite|standard|full|wave|sprint|auto)
        ;;
    *)
        log_error "Invalid mode: $MODE (must be: lite, standard, full, wave, sprint, or auto)"
        exit 1
        ;;
esac

resolve_worker_count

# ---------------------------------------------------------------------------
# Check Prerequisites
# ---------------------------------------------------------------------------

header "Checking Prerequisites"

ensure_git_repo
ensure_claude_dirs

TASKS_FILE="$PROJECT_DIR/TASKS.md"

ensure_node_runtime
ensure_collab_bus
rebuild_board_state
build_wave_plan
show_whitebox_board "startup"

if [ ! -f "$TASKS_FILE" ]; then
    log_error "TASKS.md not found at: $TASKS_FILE"
    log_info "Whitebox auto-init prepared .git and .claude where possible, but orchestration needs TASKS.md to continue."
    log_info "Run: bash .claude/skills/tasks-init/scripts/tasks-init.sh  or use /tasks-init first."
    exit_with_board 1 "missing TASKS.md"
fi

log_success "TASKS.md found"

# ---------------------------------------------------------------------------
# Parse Tasks and Build DAG
# ---------------------------------------------------------------------------

# Bug #4: sprint mode에서 scheduler.js 불필요 실행 방지
if [ "$MODE" != "sprint" ]; then
    header "Building Task Dependency Graph"

    LAYER_OUTPUT="$("$NODE_CMD" "$SCRIPT_DIR/engine/scheduler.js" "$TASKS_FILE" 2>&1)"
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

    TOTAL_LAYERS=$("$NODE_CMD" -e "const d = require('$LAYERS_FILE'); console.log(d.layers.length);")
    TOTAL_TASKS=$("$NODE_CMD" -e "const d = require('$LAYERS_FILE'); console.log(d.tasks.length);")

    log_success "$TOTAL_TASKS tasks organized into $TOTAL_LAYERS layers"
fi

# ---------------------------------------------------------------------------
# Execute Layers
# ---------------------------------------------------------------------------

# Auto mode: DCPEA autonomous orchestration
if [ "$MODE" = "auto" ]; then
    header "Executing Auto Mode (DCPEA Loop)"

    # Build forwarded args for auto-orchestrator.js
    AUTO_ARGS=()
    [ -n "$AUTO_MAX_ITERATIONS" ] && AUTO_ARGS+=("--max-iterations=$AUTO_MAX_ITERATIONS")
    [ -n "$AUTO_MAX_DYNAMIC_TASKS" ] && AUTO_ARGS+=("--max-dynamic-tasks=$AUTO_MAX_DYNAMIC_TASKS")
    [ -n "$AUTO_WORKER_COUNT" ] && AUTO_ARGS+=("--worker-count=$AUTO_WORKER_COUNT")
    [ -n "$AUTO_MAX_CONSECUTIVE_FAILURES" ] && AUTO_ARGS+=("--max-consecutive-failures=$AUTO_MAX_CONSECUTIVE_FAILURES")

    if [ "$RESUME" = "true" ]; then
        log_info "Resuming auto mode from checkpoint..."
        AUTO_MODE=true "$NODE_CMD" "$SCRIPT_DIR/auto/auto-orchestrator.js" --resume "${AUTO_ARGS[@]}"
    else
        if [ -z "$AUTO_GOAL" ]; then
            log_error "Auto mode requires --goal='...'. Example: --mode=auto --goal='Build user auth'"
            exit 1
        fi
        AUTO_MODE=true "$NODE_CMD" "$SCRIPT_DIR/auto/auto-orchestrator.js" "${AUTO_ARGS[@]}" "$AUTO_GOAL"
    fi

    AUTO_EXIT=$?
    case $AUTO_EXIT in
        0)
            log_success "Auto mode completed successfully!"
            ;;
        1)
            log_error "Auto mode failed"
            ;;
        2)
            log_warn "Auto mode paused for human review"
            log_info "Resume with: $0 --mode=auto --resume"
            ;;
        *)
            log_error "Auto mode exited with code: $AUTO_EXIT"
            ;;
    esac
    exit_with_board "$AUTO_EXIT" "auto mode"
fi

# Sprint mode: special handling with planner/runner
if [ "$MODE" = "sprint" ]; then
    header "Executing Sprint Mode (Workers: $WORKER_COUNT, Sprint Size: $SPRINT_SIZE)"

    # Bug #8: resume이 아닐 때만 planner 실행
    if [ "$RESUME" != "true" ]; then
        if ! "$NODE_CMD" "$SCRIPT_DIR/engine/sprint-planner.js" "$TASKS_FILE" "$SPRINT_SIZE"; then
            log_error "Sprint planning failed or cancelled"
            exit 1
        fi
    fi

    # Bug #7: Sprint 루프 - SPRINT_RUNNING 동안 반복
    while true; do
        SPRINT_STATE_VAL=$("$NODE_CMD" -e "
            try {
                const s = require('$PROJECT_DIR/.claude/sprint-state.json');
                console.log(s.state);
            } catch(e) { console.log('UNKNOWN'); }
        " 2>/dev/null || echo 'UNKNOWN')

        if [ "$SPRINT_STATE_VAL" = "UNKNOWN" ]; then
            log_error "Cannot read sprint-state.json (missing or corrupted)"
            exit 1
        fi

        if [ "$SPRINT_STATE_VAL" = "PI_COMPLETE" ]; then
            log_info "Sprint state: PI_COMPLETE — exiting loop"
            break
        fi

        # Bug #13: PAUSED는 --resume이 아닐 때만 루프 종료
        if [ "$SPRINT_STATE_VAL" = "PAUSED" ] && [ "$RESUME" != "true" ]; then
            log_info "Sprint paused. Resume with: $0 --mode=sprint --resume"
            break
        fi

        "$NODE_CMD" "$SCRIPT_DIR/engine/sprint-runner.js" "$TASKS_FILE" && SPRINT_EXIT=0 || SPRINT_EXIT=$?

        # Bug #2: exit code별 분기 처리
        case $SPRINT_EXIT in
            0)
                log_success "Sprint completed"
                ;;
            2)
                log_warn "Modification requested. Instructions saved to .claude/sprint-state.json"
                log_info "Re-run: $0 --mode=sprint --resume"
                exit_with_board 2 "sprint review"
                ;;
            3)
                log_info "Sprint stopped by user. State saved."
                log_info "Resume with: $0 --mode=sprint --resume"
                exit_with_board 0 "sprint stop"  # Intentional: stop is a clean exit, not an error
                ;;
            *)
                log_error "Sprint runner failed (exit code: $SPRINT_EXIT)"
                exit_with_board 1 "sprint failure"
                ;;
        esac
    done

    header "Orchestration Complete"
    log_success "Sprint mode execution finished!"
    exit_with_board 0 "sprint complete"
fi

header "Executing Tasks (Mode: $MODE, Workers: $WORKER_COUNT)"

# Initialize state if not resuming
if [ "$RESUME" != "true" ]; then
    "$NODE_CMD" "$SCRIPT_DIR/engine/state.js" clear &>/dev/null || true
fi

CURRENT_LAYER=0
if [ "$RESUME" = "true" ]; then
    CURRENT_LAYER=$("$NODE_CMD" "$SCRIPT_DIR/engine/state.js" load 2>/dev/null | "$NODE_CMD" -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).current_layer || 0")
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

    TASK_COUNT=$(echo "$LAYER_TASKS" | "$NODE_CMD" -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).length")

    header "Layer $LAYER_NUM/$TOTAL_LAYERS ($TASK_COUNT tasks)"

    # Pre-dispatch gate
    log_info "Running pre-dispatch gate..."
    while IFS= read -r taskJson; do
        taskId=$("$NODE_CMD" -pe "JSON.parse(process.argv[1]).id" "$taskJson")
        GATE_RESULT=$("$NODE_CMD" "$SCRIPT_DIR/engine/gate-chain.js" pre-dispatch "$taskJson" 2>&1)
        GATE_PASSED=$(echo "$GATE_RESULT" | "$NODE_CMD" -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).passed")

        if [ "$GATE_PASSED" != "true" ]; then
            log_error "Pre-dispatch gate failed for task: $taskId"
            echo "$GATE_RESULT"
            exit_with_board 1 "pre-dispatch gate"
        fi
    done < <(echo "$LAYER_TASKS" | "$NODE_CMD" -e "JSON.parse(require('fs').readFileSync(0,'utf8')).forEach(t=>console.log(JSON.stringify(t)))")

    log_info "Executing $TASK_COUNT tasks with $WORKER_COUNT workers..."
    while IFS= read -r taskJson; do
        taskId=$("$NODE_CMD" -pe "JSON.parse(process.argv[1]).id" "$taskJson")
        log_info "  → $taskId"
    done < <(echo "$LAYER_TASKS" | "$NODE_CMD" -e "JSON.parse(require('fs').readFileSync(0,'utf8')).forEach(t=>console.log(JSON.stringify(t)))")

    LAYER_RESULTS=$(LAYER_TASKS_JSON="$LAYER_TASKS" WORKER_COUNT="$WORKER_COUNT" PROJECT_DIR="$PROJECT_DIR" "$NODE_CMD" - <<NODE
const worker = require('${SCRIPT_DIR}/engine/worker.js');

(async () => {
  const layer = JSON.parse(process.env.LAYER_TASKS_JSON || '[]');
  const workerCount = parseInt(process.env.WORKER_COUNT || '4', 10) || 4;
  const projectDir = process.env.PROJECT_DIR || process.cwd();
  process.chdir(projectDir);
  const results = await worker.executeLayer(layer, workerCount);
  process.stdout.write(JSON.stringify(results));
})().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error));
  process.exit(1);
});
NODE
)

    LAYER_FAILED=$(printf '%s' "$LAYER_RESULTS" | "$NODE_CMD" -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).filter((item) => item && item.status === 'failed').length")
    if [ "$LAYER_FAILED" -gt 0 ]; then
        FAILED_TASK_IDS=$(printf '%s' "$LAYER_RESULTS" | "$NODE_CMD" -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).filter((item) => item && item.status === 'failed').map((item) => item.id).join(', ')")
        log_error "Layer $LAYER_NUM recorded $LAYER_FAILED failed task(s): $FAILED_TASK_IDS"
        exit_with_board 1 "task execution"
    fi

    # Post-task gate
    log_info "Running post-task gate..."
    while IFS= read -r taskJson; do
        taskId=$("$NODE_CMD" -pe "JSON.parse(process.argv[1]).id" "$taskJson")
        GATE_RESULT=$("$NODE_CMD" "$SCRIPT_DIR/engine/gate-chain.js" post-task "$taskJson" 2>&1)
        GATE_PASSED=$(echo "$GATE_RESULT" | "$NODE_CMD" -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).passed")

        if [ "$GATE_PASSED" != "true" ]; then
            log_warn "Post-task gate warning for: $taskId"
        fi
    done < <(echo "$LAYER_TASKS" | "$NODE_CMD" -e "JSON.parse(require('fs').readFileSync(0,'utf8')).forEach(t=>console.log(JSON.stringify(t)))")

    # Barrier gate after layer
    log_info "Running barrier gate..."
    BARRIER_RESULT=$("$NODE_CMD" "$SCRIPT_DIR/engine/gate-chain.js" barrier "$CURRENT_LAYER" "$LAYER_TASKS" 2>&1)
    BARRIER_PASSED=$(echo "$BARRIER_RESULT" | "$NODE_CMD" -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).passed")

    if [ "$BARRIER_PASSED" != "true" ]; then
        log_error "Barrier gate failed at layer $LAYER_NUM"
        echo "$BARRIER_RESULT"
        exit_with_board 1 "barrier gate"
    fi

    # Update current layer
    "$NODE_CMD" "$SCRIPT_DIR/engine/state.js" set-layer "$LAYER_NUM" &>/dev/null
    CURRENT_LAYER=$LAYER_NUM

    log_success "Layer $LAYER_NUM/$TOTAL_LAYERS completed"
done

# ---------------------------------------------------------------------------
# Final Summary
# ---------------------------------------------------------------------------

header "Orchestration Complete"

PROGRESS=$("$NODE_CMD" "$SCRIPT_DIR/engine/state.js" progress 2>/dev/null || echo '{}')
COMPLETED=$(echo "$PROGRESS" | "$NODE_CMD" -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).completed")
FAILED=$(echo "$PROGRESS" | "$NODE_CMD" -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).failed")
PERCENT=$(echo "$PROGRESS" | "$NODE_CMD" -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).percent")

log_success "Completed: $COMPLETED tasks"
if [ "$FAILED" -gt 0 ]; then
    log_warn "Failed: $FAILED tasks"
fi
log_info "Progress: ${PERCENT}%"

log_success "Orchestration finished!"
show_whitebox_board "completion"
