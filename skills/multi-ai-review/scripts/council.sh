#!/bin/bash
#
# Multi-AI Review Council (agent-council 패턴 기반)
#
# Subcommands:
#   council.sh start [options] "question"     # returns JOB_DIR immediately
#   council.sh status [--json|--text] JOB_DIR # poll progress
#   council.sh wait [--cursor CURSOR] JOB_DIR # wait for progress
#   council.sh results [--json] JOB_DIR       # print collected outputs
#   council.sh stop JOB_DIR                   # best-effort stop running members
#   council.sh clean JOB_DIR                  # remove job directory
#
# One-shot:
#   council.sh "question"
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOB_SCRIPT="$SCRIPT_DIR/council-job.sh"
CLEANUP_SCRIPT="$SCRIPT_DIR/cleanup.sh"

# Auto-cleanup orphaned jobs on startup (silent)
if [ -x "$CLEANUP_SCRIPT" ]; then
  "$CLEANUP_SCRIPT" >/dev/null 2>&1 || true
fi

usage() {
  cat <<EOF
Multi-AI Review Council

Usage:
  $(basename "$0") start [options] "question"
  $(basename "$0") status [--json|--text] <jobDir>
  $(basename "$0") wait [--cursor CURSOR] <jobDir>
  $(basename "$0") results [--json] <jobDir>
  $(basename "$0") stop <jobDir>
  $(basename "$0") clean <jobDir>

One-shot:
  $(basename "$0") "question"

Examples:
  $(basename "$0") "이 코드의 보안 취약점을 검토해줘"
EOF
}

if [ $# -eq 0 ]; then
  usage
  exit 1
fi

case "$1" in
  -h|--help|help)
    usage
    exit 0
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required." >&2
  echo "macOS: brew install node" >&2
  echo "Or: https://nodejs.org/" >&2
  exit 127
fi

case "$1" in
  start|status|wait|results|stop|clean|cross-review)
    exec "$JOB_SCRIPT" "$@"
    ;;
esac

in_host_agent_context() {
  if [ -n "${CODEX_CACHE_FILE:-}" ]; then
    return 0
  fi
  case "$SCRIPT_DIR" in
    */.codex/skills/*|*/.claude/skills/*)
      if [ ! -t 1 ] && [ ! -t 2 ]; then
        return 0
      fi
      ;;
  esac
  return 1
}

# Register trap early (before JOB_SCRIPT start) to protect the start phase
_cleanup_job() {
  local exit_code=$?
  trap - EXIT INT TERM HUP
  if [ -n "${JOB_DIR:-}" ] && [ -d "$JOB_DIR" ]; then
    "$JOB_SCRIPT" stop "$JOB_DIR" >/dev/null 2>&1 || true
    "$JOB_SCRIPT" clean "$JOB_DIR" >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}

_cleanup_signal() {
  trap - EXIT INT TERM HUP
  if [ -n "${JOB_DIR:-}" ] && [ -d "$JOB_DIR" ]; then
    "$JOB_SCRIPT" stop "$JOB_DIR" >/dev/null 2>&1 || true
    "$JOB_SCRIPT" clean "$JOB_DIR" >/dev/null 2>&1 || true
  fi
  exit 130
}

JOB_DIR="$("$JOB_SCRIPT" start "$@")"

trap _cleanup_signal INT TERM HUP

if in_host_agent_context; then
  # Host agent context: poll in a loop until all members are done.
  # EXIT trap guards against abnormal exits (set -e errors) to prevent orphaned workers.
  # Removed before normal cleanup to avoid premature worker termination.
  trap _cleanup_job EXIT
  while true; do
    WAIT_JSON="$("$JOB_SCRIPT" wait --timeout-ms 10000 "$JOB_DIR")"
    OVERALL="$(printf '%s' "$WAIT_JSON" | node -e '
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
process.stdout.write(String(d.overallState||""));
')"
    if [ "$OVERALL" = "done" ]; then
      break
    fi
  done

  # Stage 1 complete — show results
  echo "=== Stage 1: Initial Opinions ===" >&2
  "$JOB_SCRIPT" results "$JOB_DIR"

  # Stage 2: Cross-Review
  echo "" >&2
  echo "=== Stage 2: Cross-Review ===" >&2
  CROSS_JOB_DIR="$("$JOB_SCRIPT" cross-review "$JOB_DIR" 2>/dev/null || true)"

  if [ -n "$CROSS_JOB_DIR" ] && [ -d "$CROSS_JOB_DIR" ]; then
    while true; do
      WAIT_JSON="$("$JOB_SCRIPT" wait --timeout-ms 10000 "$CROSS_JOB_DIR")"
      OVERALL="$(printf '%s' "$WAIT_JSON" | node -e '
const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
process.stdout.write(String(d.overallState||""));
')"
      if [ "$OVERALL" = "done" ]; then
        break
      fi
    done
    "$JOB_SCRIPT" results "$CROSS_JOB_DIR"
    "$JOB_SCRIPT" clean "$CROSS_JOB_DIR" >/dev/null 2>&1 || true
  fi

  # All done — remove traps before cleanup
  trap - EXIT INT TERM HUP
  "$JOB_SCRIPT" clean "$JOB_DIR" >/dev/null 2>&1 || true
  exit 0
fi

echo "council: started ${JOB_DIR}" >&2

while true; do
  WAIT_JSON="$("$JOB_SCRIPT" wait "$JOB_DIR")"
  OVERALL="$(printf '%s' "$WAIT_JSON" | node -e '
const fs=require("fs");
const d=JSON.parse(fs.readFileSync(0,"utf8"));
process.stdout.write(String(d.overallState||""));
')"

  "$JOB_SCRIPT" status --text "$JOB_DIR" >&2

  if [ "$OVERALL" = "done" ]; then
    break
  fi
done

trap - INT TERM HUP

echo "=== Stage 1: Initial Opinions ===" >&2
"$JOB_SCRIPT" results "$JOB_DIR"

# Stage 2: Cross-Review
echo "" >&2
echo "=== Stage 2: Cross-Review ===" >&2
CROSS_JOB_DIR="$("$JOB_SCRIPT" cross-review "$JOB_DIR" 2>/dev/null || true)"

if [ -n "$CROSS_JOB_DIR" ] && [ -d "$CROSS_JOB_DIR" ]; then
  while true; do
    WAIT_JSON="$("$JOB_SCRIPT" wait "$CROSS_JOB_DIR")"
    OVERALL="$(printf '%s' "$WAIT_JSON" | node -e '
const fs=require("fs");
const d=JSON.parse(fs.readFileSync(0,"utf8"));
process.stdout.write(String(d.overallState||""));
')"

    "$JOB_SCRIPT" status --text "$CROSS_JOB_DIR" >&2

    if [ "$OVERALL" = "done" ]; then
      break
    fi
  done
  "$JOB_SCRIPT" results "$CROSS_JOB_DIR"
  "$JOB_SCRIPT" clean "$CROSS_JOB_DIR" >/dev/null 2>&1 || true
fi

"$JOB_SCRIPT" clean "$JOB_DIR" >/dev/null
