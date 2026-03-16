---
name: workflow-guide
description: 여러 스킬 중 상황에 맞는 워크플로우를 안내합니다. 프로젝트 상태를 자동 분석하여 최적 스킬을 추천합니다. "뭐해야해?", "어떤 스킬 써야 해?", "워크플로우 추천", "다음 단계가 뭐야?" 질문에 반드시 사용하세요. /workflow 트리거.
trigger: /workflow, /workflow-guide, "뭐해야해?", "어떤 스킬", "워크플로우 추천"
version: 5.0.0
updated: 2026-03-12
---

# 🧭 워크플로우 선택 가이드 (Meta Hub)

> **목적**: 프로젝트 상태 자동 분석 → 최적 스킬 1~2개 추천
>
> **⚠️ 핵심 원칙**: 이 스킬은 **구현 코드를 작성하지 않습니다**. 오직 **상황 진단 → 스킬 추천 → 사용자 확인**만 수행합니다.

---

## ⛔ 절대 금지 사항

1. ❌ **직접 코드를 작성하지 마세요** - 워크플로우 안내만 합니다.
2. ❌ **모든 스킬을 나열하지 마세요** - 상황에 맞는 **1~2개만** 추천합니다.
3. ❌ **요구사항 질문으로 시작하지 마세요** - 먼저 프로젝트 상태를 **자동 진단**합니다.

---

## ✅ 스킬 발동 시 즉시 실행할 행동

### 1단계: 프로젝트 상태 자동 진단 (Silent Analysis)

```bash
# 1. 태스크 파일 확인
ls TASKS.md 2>/dev/null || ls docs/planning/06-tasks.md 2>/dev/null

# 2. 코드 베이스 확인 (src/·app/·lib/ 에 실제 코드 파일)
SOURCE_CODE=$(find src/ app/ lib/ -maxdepth 3 -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" \) 2>/dev/null | head -1)
echo "source_code=${SOURCE_CODE:+yes}"

# 3. 중단된 작업 확인 (state file + 미완료 태스크)
for STATE_PATH in ".claude/orchestrate-state.json" ".claude/orchestrate/orchestrate-state.json"; do
  if [ -f "$STATE_PATH" ] && grep -qE '"status"[[:space:]]*:[[:space:]]*"(in_progress|pending)"' "$STATE_PATH" 2>/dev/null; then
    echo "state_file=$STATE_PATH incomplete_in_state=1"
  fi
done

# 4. Git merge conflict 확인
CONFLICT_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null | wc -l | tr -d ' ')
echo "conflicts=$CONFLICT_FILES"

# 5. 에이전트/태스크 카운트
AGENT_COUNT=$(ls .claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
TASK_COUNT=$(grep -cE '^\s*[-*]\s*\[|^#{1,6}\s+\[' TASKS.md 2>/dev/null || echo 0)
INCOMPLETE_COUNT=$(grep -cE '^\s*[-*]\s*\[\s*\]|^#{1,6}\s+\[\s*\]' TASKS.md 2>/dev/null || echo 0)
GOVERNANCE_DONE=$(ls management/project-plan.md 2>/dev/null && echo "yes" || echo "no")
echo "agents=$AGENT_COUNT tasks=$TASK_COUNT incomplete=$INCOMPLETE_COUNT governance=$GOVERNANCE_DONE"
```

### 2단계: 결정 알고리즘 (IF-THEN 순서대로, 첫 RETURN에서 중단)

> **상세 알고리즘 및 시나리오 검증**: `references/decision-algorithm.md` 참조

```
① 복구 체크: state file + 미완료 OR merge conflicts → /recover
② 태스크 체크: TASKS.md 없음 → /tasks-init (또는 /tasks-migrate)
③ 유지보수: source_code + AGENT_COUNT=0 + GOV=no → /agile iterate
④ 거버넌스: TASK>=10 + (DOMAIN>=2 OR TASK>=30) + GOV=no → /governance-setup
⑤ 인프라: GOV=yes + TASK>=30 + AGENT=0 → install.sh
⑥ 구현: GOV=yes + AGENT>0 → /team-orchestrate 또는 /agile auto
⑦ 소규모: TASK<30 + incomplete>0 → /agile auto
⑧ 완료: all_tasks_completed → /audit
```

### 3단계: 맞춤 추천 (AskUserQuestion)

진단 결과를 **⭐ 권장** 스킬로 표시하여 사용자 확인:

```json
{
  "questions": [{
    "question": "프로젝트 상태를 분석했습니다. 다음 단계를 선택하세요:",
    "options": [
      { "label": "⭐ [권장] {진단된 스킬}", "description": "{적합 이유}" },
      { "label": "{대안 1}", "description": "{설명}" }
    ]
  }]
}
```

---

## 📊 Standalone 스킬 카탈로그 (19개)

| 스킬 | 트리거 | 역할 |
|------|--------|------|
| **`/workflow`** | "뭐해야해?" | 메타 허브 - 스킬 라우팅 |
| **`/governance-setup`** | `/governance-setup` | 거버넌스 + Mini-PRD 기획 |
| **`/tasks-init`** | `/tasks-init` | TASKS.md 스캐폴딩 |
| **`/tasks-migrate`** | `/tasks-migrate` | 레거시 태스크 통합 |
| **`/agile`** | `/agile auto` | 레이어 기반 스프린트 |
| **`/team-orchestrate`** | `/team-orchestrate` | 30~200개 병렬 실행 |
| **`/multi-ai-run`** | `/multi-ai-run` | 역할별 모델 라우팅 |
| **`/checkpoint`** | "리뷰해줘" | 태스크 완료 시 2단계 리뷰 |
| **`/security-review`** | `/security-review` | OWASP TOP 10 보안 검사 |
| **`/audit`** | `/audit` | 배포 전 종합 감사 |
| **`/multi-ai-review`** | `/multi-ai-review` | 3-AI 컨센서스 리뷰 |
| **`/recover`** | "작업이 중단됐어" | 작업 복구 허브 |
| **`/impact`** | `/impact <file>` | 변경 영향도 분석 |
| **`/deps`** | `/deps` | 의존성 그래프 |
| **`/coverage`** | `/coverage` | 테스트 커버리지 |
| **`/architecture`** | `/architecture` | 아키텍처 맵 |
| **`/compress`** | "컨텍스트 압축" | Long Context 최적화 |
| **`/statusline`** | 자동 활성화 | 진행률 상태바 표시 |
| **`/changelog`** | `/changelog` | 변경 이력 조회 |

---

## 📊 태스크 규모별 구현 스킬 선택

| 태스크 수 | 권장 스킬 | 에이전트 팀 | 선행 스킬 |
|-----------|-----------|------------|-----------|
| **1~30개** | `/agile auto` | ❌ 불필요 | - |
| **30~80개** | `/team-orchestrate` | ✅ 선택 | `/governance-setup` |
| **80~200개** | `/team-orchestrate --mode=wave` | ✅ 권장 | `/governance-setup` |
| **러프 골** | `/team-orchestrate --mode=auto` | ✅ 선택 | 불필요 |
| **200개+** | 하위 프로젝트 분할 → wave | ✅ 필수 | `/governance-setup` |

---

## 💡 자연어 → 스킬 빠른 매핑

```
"뭐부터 해야 할지 모르겠어"     → /workflow
"기획서 있는데 코딩 시작해줘"   → /agile auto
"이 기능 수정해줘"              → /agile iterate
"코드 검토해줘"                 → /checkpoint
"심층 리뷰해줘"                 → /multi-ai-review
"보안 검사해줘"                 → /security-review
"품질 검사해줘"                 → /audit
"작업이 중단됐어"               → /recover
"대규모 프로젝트야"             → /governance-setup
"스프린트로 실행해줘"           → /team-orchestrate --mode=sprint
"자율 실행해줘"                 → /team-orchestrate --mode=auto
"칸반 보드 보여줘"              → /whitebox status
"컨텍스트 압축해줘"             → /compress
```

---

## 📚 참조 문서

상세 알고리즘, 스킬 연동 매트릭스, 품질 게이트는 다음 파일을 참조하세요:

- `references/decision-algorithm.md` - 결정 알고리즘 상세 + 시나리오 검증
- `references/skill-integrations.md` - 스킬 간 연동 + 실패 복구 경로

---

**Last Updated**: 2026-03-12 (v5.0.0 - Progressive Disclosure 적용)
