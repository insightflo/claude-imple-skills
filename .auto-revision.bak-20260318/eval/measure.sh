#!/usr/bin/env bash
# Frozen Metric: claude-imple-skills v4.0 정합성 측정
# 이 파일은 수정 금지 (eval/ 디렉토리)
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_DIR"

# ─────────────────────────────────────────────
# 1. Stale Reference Count
# ─────────────────────────────────────────────
STALE_PATTERNS='ProjectManager\.md|ChiefArchitect\.md|ChiefDesigner\.md|QAManager\.md|BackendSpecialist\.md|FrontendSpecialist\.md|SecuritySpecialist\.md|DBA\.md|orchestrate-standalone|hook-shims|task-board'

stale_ref_count=0
stale_files=$(grep -rl -E "$STALE_PATTERNS" \
  --include="*.md" --include="*.js" --include="*.json" --include="*.yaml" --include="*.sh" \
  "$PROJECT_DIR" 2>/dev/null \
  | grep -v node_modules \
  | grep -v ".git/" \
  | grep -v ".auto-revision/" \
  | grep -v "package-lock.json" \
  | grep -v ".claude/" \
  || true)

if [ -n "$stale_files" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    real_stale=$(grep -c -E "$STALE_PATTERNS" "$file" 2>/dev/null) || real_stale=0
    history_lines=$(grep -E "$STALE_PATTERNS" "$file" 2>/dev/null | grep -c -E "(removed|제거|삭제|v[34]\.[0-9]|Version History|버전 히스토리|^\|.*날짜.*변경|^\|.*Date.*Changes)" 2>/dev/null) || history_lines=0
    net=$((real_stale - history_lines))
    if [ "$net" -gt 0 ]; then
      stale_ref_count=$((stale_ref_count + 1))
    fi
  done <<< "$stale_files"
fi

# ─────────────────────────────────────────────
# 2. Test Pass Rate
# ─────────────────────────────────────────────
test_output=$(cd "$PROJECT_DIR/project-team" && npx --yes jest --runInBand --no-coverage 2>&1 || true)
test_line=$(echo "$test_output" | grep "^Tests:" | tail -1 || echo "")

test_total="0"
test_passed="0"
test_failed="0"
if [ -n "$test_line" ]; then
  test_total=$(echo "$test_line" | grep -o '[0-9]* total' | head -1 | grep -o '[0-9]*' || echo "0")
  test_passed=$(echo "$test_line" | grep -o '[0-9]* passed' | head -1 | grep -o '[0-9]*' || echo "0")
  test_failed=$(echo "$test_line" | grep -o '[0-9]* failed' | head -1 | grep -o '[0-9]*' || echo "0")
fi

# pre-existing acceptance-harness 실패 1건은 허용
adjusted_failed=0
if [ "$test_failed" -gt 1 ] 2>/dev/null; then
  adjusted_failed=$((test_failed - 1))
fi
if [ "$test_total" -gt 0 ]; then
  test_pass_rate=$(echo "scale=1; ($test_total - $adjusted_failed) * 100 / $test_total" | bc 2>/dev/null || echo "0")
else
  test_pass_rate="0"
fi

# ─────────────────────────────────────────────
# 3. Dead Code Files (.claude/agents/)
# ─────────────────────────────────────────────
dead_code_files=0
if [ -d "$PROJECT_DIR/.claude/agents" ]; then
  for agent_file in "$PROJECT_DIR/.claude/agents"/*.md; do
    [ -f "$agent_file" ] || continue
    agent_name=$(basename "$agent_file" .md)
    refs=$(grep -rl "$agent_name" \
      --include="*.md" --include="*.js" --include="*.json" --include="*.yaml" --include="*.sh" \
      "$PROJECT_DIR" 2>/dev/null \
      | grep -v node_modules \
      | grep -v ".git/" \
      | grep -v ".auto-revision/" \
      | grep -v "$agent_file" \
      | wc -l | tr -d ' ')
    if [ "$refs" -eq 0 ]; then
      dead_code_files=$((dead_code_files + 1))
    fi
  done
fi

# ─────────────────────────────────────────────
# 4. Doc Consistency
# ─────────────────────────────────────────────
doc_issues=0
actual_skills=$(ls -1d "$PROJECT_DIR/skills"/*/ 2>/dev/null | wc -l | tr -d ' ')
actual_hooks=$(ls -1 "$PROJECT_DIR/project-team/hooks"/*.js 2>/dev/null | wc -l | tr -d ' ')

for readme in "$PROJECT_DIR/README.md" "$PROJECT_DIR/README_ko.md"; do
  [ -f "$readme" ] || continue
  readme_skills=$(grep -o 'Skills[^|]*|[^|]*[0-9]' "$readme" 2>/dev/null | grep -o '[0-9]*' | head -1 || echo "0")
  if [ -n "$readme_skills" ] && [ "$readme_skills" != "0" ] && [ "$readme_skills" != "$actual_skills" ]; then
    doc_issues=$((doc_issues + 1))
  fi
  readme_hooks=$(grep -o 'Hooks[^|]*|[^|]*[0-9]' "$readme" 2>/dev/null | grep -o '[0-9]*' | head -1 || echo "0")
  if [ -n "$readme_hooks" ] && [ "$readme_hooks" != "0" ] && [ "$readme_hooks" != "$actual_hooks" ]; then
    doc_issues=$((doc_issues + 1))
  fi
done

doc_consistency=$((100 - doc_issues * 10))
[ "$doc_consistency" -lt 0 ] && doc_consistency=0

# ─────────────────────────────────────────────
# 5. Composite Score
# ─────────────────────────────────────────────
stale_score=$( [ "$stale_ref_count" -eq 0 ] && echo "100" || echo "0" )
dead_score=$(echo "scale=0; 100 - $dead_code_files * 10" | bc 2>/dev/null || echo "0")
[ "$(echo "$dead_score < 0" | bc 2>/dev/null || echo "1")" -eq 1 ] && dead_score=0

composite=$(echo "scale=1; $stale_score * 0.30 + $test_pass_rate * 0.30 + $dead_score * 0.20 + $doc_consistency * 0.20" | bc 2>/dev/null || echo "0")

# ─────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────
echo "stale_ref_count=$stale_ref_count"
echo "test_pass_rate=$test_pass_rate"
echo "test_failed=$test_failed"
echo "dead_code_files=$dead_code_files"
echo "doc_consistency=$doc_consistency"
echo "composite_score=$composite"
