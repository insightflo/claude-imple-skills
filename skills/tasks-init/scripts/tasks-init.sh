#!/bin/bash
#
# tasks-init - TASKS.md 스캐폴딩 생성 스크립트
# VibeLab 없이 독립 실행 가능
#
# Usage:
#   ./tasks-init.sh [--output FILE] [--features "feat1,feat2"]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

# 기본값
OUTPUT_FILE="TASKS.md"
FEATURES=""
ANALYSIS_OUTPUT="/tmp/tasks-init-analysis.json"

# 인자 파싱
while [[ $# -gt 0 ]]; do
  case $1 in
    --output|-o)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --features|-f)
      FEATURES="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --output, -o FILE    Output file path (default: TASKS.md)"
      echo "  --features, -f LIST  Comma-separated feature list"
      echo "  --help, -h           Show this help"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# 1단계: 프로젝트 정보 수집 (없으면 기본값 사용)
PROJECT_NAME="$(basename "$PROJECT_ROOT")"

echo "📋 tasks-init v2.0.0"
echo "===================="
echo ""
echo "Project: $PROJECT_NAME"
echo "Output: $OUTPUT_FILE"
echo ""

# 2단계: 코드 분석
echo "🔍 Analyzing codebase..."
if cd "$PROJECT_ROOT" && node "${SCRIPT_DIR}/analyze.js" > "$ANALYSIS_OUTPUT" 2>/dev/null; then
    echo "✓ Analysis complete"
else
    echo "⚠ Analysis failed, using defaults"
    echo "{}" > "$ANALYSIS_OUTPUT"
fi

# 3단계: 태스크 생성
echo "📝 Generating tasks..."
PROJECT_NAME="$PROJECT_NAME" \
FEATURES="$FEATURES" \
ANALYSIS_RESULT="$ANALYSIS_OUTPUT" \
node "${SCRIPT_DIR}/generate.js" > "${PROJECT_ROOT}/${OUTPUT_FILE}"

echo "✓ Tasks generated: ${PROJECT_ROOT}/${OUTPUT_FILE}"
echo ""

# 4단계: 다음 단계 안내
TASK_COUNT=$(grep -c '^\- \[ \]' "${PROJECT_ROOT}/${OUTPUT_FILE}" || echo "0")
echo "📊 Generated $TASK_COUNT tasks"
echo ""
echo "Routing note: owner drives executor selection by default; add 'model:' only for explicit overrides."
echo ""
echo "Next steps:"
echo "  1. Review TASKS.md and adjust as needed"
echo "  2. Run: /agile auto    (for ≤30 tasks)"
echo "  3. Or:    /team-orchestrate    (for 30-80 tasks)"
echo ""
echo "✅ Done!"
