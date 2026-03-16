# 연구 디렉티브

## 도메인
구현 완성도 (프로젝트 정합성 + 불필요 코드 제거 + 문서 일관성)

## 목표
v4.0 Agent Teams 전환 후 프로젝트 정합성 점수를 최적화한다. (방향: higher is better)

현재 베이스라인 (2026-03-16 측정):
- stale_ref_count: 3 (프로젝트 소스에서 삭제된 에이전트/스킬 참조가 남아있는 파일 수)
- test_pass_rate: 100.0% (pre-existing 1건 제외 기준)
- dead_code_files: 1 (.claude/agents/ 에서 어디서도 참조되지 않는 에이전트)
- doc_consistency: 90 (README 숫자 불일치 1건)
- **복합 점수: 66.0** (= 0*0.30 + 100*0.30 + 90*0.20 + 90*0.20)

목표: 복합 점수 100점 (모든 항목 클린)
- stale_ref_count = 0
- test_pass_rate = 100.0
- dead_code_files = 0
- doc_consistency = 100

## 수정 가능한 파일

### Tier 1: 문서/설정 (안전)
- `README.md`, `README_ko.md`, `INSTALL.md`, `AGENTS.md`
- `project-team/README.md`
- `project-team/docs/*.md`
- `project-team/examples/**/*.md`
- `project-team/examples/**/*.yaml`
- `project-team/config/topology-registry.json`
- `skills/*/SKILL.md`

### Tier 2: 에이전트 정의 (중위험)
- `.claude/agents/*.md` — 사용하지 않는 에이전트 삭제, 기존 에이전트 개선
- `project-team/agents/*.md` — 워커 에이전트 개선
- `project-team/agents/templates/*.md` — 템플릿 현행화

### Tier 3: hooks/스크립트 (고위험)
- `project-team/hooks/*.js` — 주석/참조 정리만 (로직 변경 금지)
- `project-team/scripts/*.js` — 주석/참조 정리만
- `project-team/references/*.md` — 프로토콜 문서 현행화
- `skills/team-orchestrate/**` — 스킬 개선
- `install.sh`, `scripts/*.sh` — 설치 스크립트 정리

### Tier 4: 테스트 (수정 시 통과 필수)
- `project-team/hooks/__tests__/*.test.js` — stale 참조 수정

## 수정 불가 파일
- `.auto-revision/eval/` (전체)
- `.auto-revision/meta_eval/` (전체)
- `project-team/hooks/lib/` (hook 런타임 라이브러리 — 안정)
- `project-team/services/` (auth, messaging, context — 안정)
- `project-team/node_modules/` (의존성)
- `project-team/package.json`, `project-team/package-lock.json`

## 시간 예산
실험 1회당 최대 120초

## 제약 조건

### Gate 조건 (위반 시 즉시 revert)
1. `cd project-team && npx jest --runInBand --no-coverage` 에서 **기존 통과 테스트가 새로 실패하면 안 됨** (pre-existing acceptance-harness 1건은 허용)
2. `node skills/team-orchestrate/scripts/domain-analyzer.js --tasks-file /tmp/test-tasks.md --json` 이 유효한 JSON을 출력해야 함
3. `echo '{}' | node project-team/hooks/teammate-idle-gate.js` 와 `echo '{}' | node project-team/hooks/task-completed-gate.js` 가 유효한 JSON을 출력해야 함

### 소프트 제약
- 에이전트 삭제 시: 다른 파일에서 해당 에이전트를 참조하지 않는지 확인
- 문서 수정 시: README.md와 README_ko.md의 내용 동기화 유지
- hooks 로직은 변경하지 않고 주석/참조만 정리
- 새 파일 생성 금지 (정리 목적이므로 줄이기만)

## 실험 실행 방법

```bash
# 1. target 수정 (한 번에 하나의 가설만)

# 2. Frozen Metric 측정
bash .auto-revision/eval/measure.sh

# 3. 출력 예시:
#   stale_ref_count=3
#   test_pass_rate=99.9
#   dead_code_files=5
#   doc_consistency=85
#   composite_score=72.5

# 4. composite_score > best_score → keep (git commit)
# 5. composite_score <= best_score → revert (git reset --hard HEAD)
```

## 개선 우선순위 (가설 생성 가이드)

### P0: Stale 참조 제거
- `grep -r` 로 삭제된 에이전트/스킬 이름이 남아있는 파일 찾기
- 버전 히스토리의 역사적 언급은 허용 (예: "v4.0.0에서 orchestrate-standalone 제거")
- 주요 패턴: `ProjectManager`, `ChiefArchitect`, `ChiefDesigner`, `QAManager`, `BackendSpecialist`, `FrontendSpecialist`, `SecuritySpecialist`, `DBA.md`, `orchestrate-standalone`, `hook-shims`, `Lead.md`

### P1: Dead Agent 정리
`.claude/agents/`에 24개 에이전트 파일이 있지만, 실제 사용되는 것은:
- **Agent Teams 리더** (4): team-lead, architecture-lead, qa-lead, design-lead
- **코어 워커** (4): Builder, Reviewer, Designer, MaintenanceAnalyst (project-team/agents/ 복제)
- **Task 위임 대상** (2): builder (=Builder), test-specialist

나머지는 사용 여부를 확인하고:
- 어디서도 참조되지 않으면 삭제
- 참조되면 유지하되 정리
- 특히 `orchestrator.md`는 team-lead와 중복 가능성 확인
- `3d-engine-specialist.md`는 이 프로젝트에 필요한지 확인

### P2: 문서 숫자 일관성
- 모든 문서에서 에이전트 수, 훅 수, 스킬 수가 동일한지 확인
- 현재 정확한 수: 21 skills, 8 agents (4 leads + 4 workers), 20 hooks
- topology-registry.json의 모드별 구성이 docs/MODES.md와 일치하는지 확인

### P3: 테스트 정합성
- pre-existing acceptance-harness 실패 수정 시도
- stale 참조가 테스트에 남아있으면 수정

### P4: install.sh 정합성
- `project-team/install.sh`의 `--mode=team`이 registry의 team 모드와 일치하는지 확인
- `install.sh` (루트)의 TUI 선택지가 현재 구조를 정확히 반영하는지 확인

## 힌트 (Outer Loop가 업데이트)
- (초기 상태 — 아직 실험 전)
- v4.0 전환에서 가장 많이 누락된 패턴: 삭제된 에이전트 이름이 docs와 examples에 남아있음
- `.claude/agents/`의 PascalCase 파일들(Builder.md, Reviewer.md 등)은 project-team/agents/의 복제 — 중복 제거 대상
- topology-registry.json에서 dba, security-specialist 역할이 삭제되었지만 install-registry.js가 이를 참조할 수 있음

## NEVER STOP
루프가 시작되면 사용자가 수동 중단할 때까지 절대 멈추지 않는다.
아이디어 고갈 시: near-miss 조합, 급진적 접근, 처음부터 재구성.
