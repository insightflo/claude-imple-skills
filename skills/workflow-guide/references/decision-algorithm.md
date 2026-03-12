# Workflow Guide Decision Algorithm

> 2단계 결정 알고리즘 상세 및 시나리오 검증

## 알고리즘 변수 매핑

1단계 bash 변수 → 알고리즘 변수:

| Bash 변수 | 알고리즘 변수 | 설명 |
|-----------|--------------|------|
| `TASK_COUNT` | `TASK_COUNT` | 총 태스크 수 |
| `INCOMPLETE_COUNT` | `incomplete_tasks` | 미완료 태스크 ([ ] 체크박스) |
| `TASK_COUNT>0 AND INCOMPLETE_COUNT=0` | `all_tasks_completed` | 모든 태스크 완료 |
| `SOURCE_CODE(yes)` | `source_code EXISTS` | src/·app/·lib/에 코드 파일 있음 |
| `AGENT_COUNT` | `AGENT_COUNT` | .claude/agents/*.md 개수 |
| `GOVERNANCE_DONE` | `GOVERNANCE_DONE` | management/project-plan.md 존재 (yes/no) |
| `DOMAIN_COUNT` | `DOMAIN_COUNT` | TASKS.md domain: 필드 유니크 수 |
| `CONFLICT_FILES>0` | git merge conflicts exist | git diff --diff-filter=U 결과 |

---

## 결정 알고리즘 (의무 실행)

> **IF-THEN 순서대로 실행. 첫 번째 조건이 참이면 즉시 해당 스킬을 RETURN하고 나머지 조건은 평가하지 않습니다.**

```python
ALGORITHM get_recommendation():

  # ① 복구 체크 (최우선)
  IF (state file EXISTS) AND (INCOMPLETE_IN_STATE > 0):
    RETURN "/recover"

  IF git merge conflicts exist:
    RETURN "/recover"

  # ② 태스크 파일 체크
  IF TASKS.md NOT EXISTS:
    IF docs/planning/06-tasks.md EXISTS:
      RETURN "/tasks-migrate"
    ELSE:
      RETURN "/tasks-init"
  IF TASK_COUNT == 0:
    RETURN "/tasks-init"

  # ③ 유지보수 체크 (단독·소규모)
  IF source_code EXISTS AND AGENT_COUNT == 0 AND GOVERNANCE_DONE == "no":
    IF incomplete_tasks > 0:
      RETURN "/agile iterate"
    IF all_tasks_completed:
      RETURN "/audit"

  # ④ 거버넌스 체크 (신규 프로젝트)
  IF TASK_COUNT >= 10 AND (DOMAIN_COUNT >= 2 OR TASK_COUNT >= 30) AND GOVERNANCE_DONE == "no" AND incomplete_tasks > 0:
    RETURN "/governance-setup"

  # ⑤ 인프라 체크 (거버넌스 완료 후)
  IF GOVERNANCE_DONE == "yes" AND TASK_COUNT >= 30 AND AGENT_COUNT == 0 AND incomplete_tasks > 0:
    RETURN "project-team/install.sh --mode standard"

  # ⑥ 구현/배포 판단 (거버넌스 완료 + 인프라 준비)
  IF GOVERNANCE_DONE == "yes" AND AGENT_COUNT > 0:
    IF all_tasks_completed: RETURN "/audit"
    IF incomplete_tasks >= 80: RETURN "/orchestrate-standalone --mode=wave"
    IF incomplete_tasks >= 30: RETURN "/orchestrate-standalone"
    ELSE: RETURN "/agile auto"

  # ⑦ 소규모 신규 구현
  IF TASK_COUNT > 0 AND TASK_COUNT < 30 AND incomplete_tasks > 0:
    RETURN "/agile auto"

  # ⑧ 완료
  IF all_tasks_completed:
    RETURN "/audit"
```

---

## 시나리오별 추적 검증

| 시나리오 | 초기 상태 | 알고리즘 경로 | 예상 추천 |
|---------|-----------|--------------|----------|
| S1 (새 프로젝트) | TASKS.md 없음 | ② → /tasks-init | ✅ `/tasks-init` |
| S1 (tasks-init 후) | 20 tasks, domain<2, 코드 없음 | ③ skip, ④ skip(20<30), ⑦ → /agile auto | ✅ `/agile auto` |
| S2 (100 tasks, 12 domains) | 코드 없음, GOVERNANCE_DONE=no | ③ skip, ④ 100>=30 → /governance-setup | ✅ `/governance-setup` |
| S2 (거버넌스 후, agents=0) | GOVERNANCE_DONE=yes, AGENT_COUNT=0 | ⑤ → project-team/install.sh | ✅ `install.sh` |
| S2 (설치 후) | GOVERNANCE_DONE=yes, AGENT_COUNT>0, incomplete=100 | ⑥ incomplete>=80 → /orchestrate-standalone --mode=wave | ✅ `/orchestrate-standalone --mode=wave` |
| S2 (실행중, incomplete=50) | GOVERNANCE_DONE=yes, AGENT_COUNT>0, incomplete=50 | ⑥ 30<=incomplete<80 → /orchestrate-standalone | ✅ `/orchestrate-standalone` |
| S3 (유지보수) | source_code EXISTS, AGENT_COUNT=0, GOVERNANCE_DONE=no, incomplete>0 | ③ → /agile iterate | ✅ `/agile iterate` |
| S5 (배포 직전) | GOVERNANCE_DONE=yes, AGENT_COUNT>0, all_completed | ⑥ → /audit | ✅ `/audit` |
| S6 (복구-state) | orchestrate-state.json + 미완료 태스크 | ①a → /recover | ✅ `/recover` |
| S6 (복구-merge) | git merge conflicts 존재 | ①b → /recover | ✅ `/recover` |
| S1-레거시 | TASKS.md 없음, 06-tasks.md 있음 | ② → /tasks-migrate | ✅ `/tasks-migrate` |
| S1-빈TASKS | TASKS.md 있으나 task 0개 | ② TASK_COUNT=0 → /tasks-init | ✅ `/tasks-init` |
| S1-완료 | TASK_COUNT=20, all done, 코드 없음 | ⑧ → /audit | ✅ `/audit` |
| 비정상 (AGENT>0+GOV=no) | AGENT_COUNT>0, GOVERNANCE_DONE=no, T=20 | ⑦ → /agile auto | ✅ `/agile auto` |

---

## 부분 완료 상태 판단 기준

### 기획 완료 기준 (Socrates 기준 7개 문서)

- `01-prd.md`, `02-trd.md`, `03-uxd.md`, `04-database-design.md`, `05-resources.md`, `06-tasks.md`, `07-acceptance-criteria.md`
- 7개 미만 → "기획 진행 중"

### 거버넌스 완료 기준 (5개 산출물)

- `management/project-plan.md` (PM)
- `management/decisions/ADR-*.md` 4개 이상 (Architect)
- `design/system/*.md` 4개 이상 (Designer)
- `management/quality-gates.md` (QA)
- `database/standards.md` (DBA)
- 일부만 존재 → "거버넌스 진행 중"

---

## 알고리즘 적용 규칙

1. **절대 금지**: TASKS.md 내용(제목·목적·설명·주석), 사용자 발언, 프로젝트 이름, 이전 대화 내용은 알고리즘의 입력이 아님
2. **1단계에서 측정한 변수만 사용**
3. **3단계 AskUserQuestion에서 RETURN한 스킬을 반드시 ⭐으로 표시**
