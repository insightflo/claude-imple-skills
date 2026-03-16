# Checkpoint Integration Plan

> **목적**: `/checkpoint` 스킬과 다른 스킬들의 통합 방식 정의

---

## 1. 스킬 개요

### `/checkpoint` 포지셔닝

| 시점 | 스킬 | 범위 |
|------|------|------|
| **태스크 완료 시** | `/checkpoint` | Git Diff + 2단계 리뷰 |
| **Phase 완료 시** | `/trinity` → `/evaluation` | 五柱 평가 + 메트릭 |
| **배포 전** | `/audit` | 종합 감사 |

---

## 2. `/agile` 연동

### 연동 시점

```
/agile auto (레이어 완료)
    ↓
┌─────────────────────────────────────────┐
│ Muscles 레이어 완료 시                   │
│   /checkpoint 자동 호출                  │
├─────────────────────────────────────────┤
│ 결과에 따라:                             │
│   - Pass → 다음 레이어                   │
│   - Warning → 사용자 확인 후 진행        │
│   - Fail → 수정 후 재체크포인트          │
└─────────────────────────────────────────┘
    ↓
Skin 레이어 진행
```

### agile/SKILL.md 수정 사항

**품질 게이트 섹션 (54-73행) 업데이트:**

```markdown
### 4. 품질 게이트 (Quality Gate) - v2.4.0

각 레이어 완료 시 **품질 검증**을 수행합니다:

```
┌─────────────────────────────────────────────────────────────┐
│  레이어 완료 → 품질 게이트 체크                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🦴 Skeleton 완료 시:                                       │
│  └── 린트 통과 + 빌드 성공 확인                             │
│                                                             │
│  💪 Muscles 완료 시:                                        │
│  └── 린트 + 빌드 + 단위 테스트 통과                         │
│  └── /checkpoint (2단계 리뷰) ← v2.4.0 NEW                  │
│                                                             │
│  ✨ Skin 완료 시:                                           │
│  └── 전체 테스트 + /trinity → /audit 실행                   │
│  └── /verification-before-completion 필수                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
```

### 체크포인트 트리거

| 상황 | 트리거 | 모드 |
|------|--------|------|
| 태스크 완료 후 | `/checkpoint --mode=code` | Code Quality만 |
| 레이어 완료 시 | `/checkpoint --mode=full` | 전체 리뷰 |
| 보안 관련 변경 | `/checkpoint --security` | 보안 강화 |

---

## 3. `/team-orchestrate` 연동

### Post-Task 게이트 추가

**team-orchestrate/SKILL.md 게이트 체인 섹션 수정:**

```javascript
### Post-Task Gate (v1.1.0 Updated)
```javascript
contract-gate (API 계약 검증)
  ↓
checkpoint-review (2단계 코드 리뷰) ← NEW
  ↓
docs-gate (문서 + 변경 이력)
  ↓
task-sync (TASKS.md 업데이트)
```

### checkpoint-review Hook

```javascript
// project-team/hooks/checkpoint-review.js
const { runCheckpoint } = require('./checkpoint-lib');

module.exports = async function checkpointReview(context) {
  const { taskId, changedFiles } = context;

  // 자동 감지: Git Diff
  const diff = await getGitDiff(taskId);

  // 2단계 리뷰
  const result = await runCheckpoint({
    files: changedFiles,
    mode: 'code', // 태스크 단위는 빠른 모드
    skipSecurity: !isSecurityRelated(changedFiles)
  });

  return {
    allowed: result.severity !== 'Fail',
    report: result.report
  };
};
```

---

## 4. Git Hook 연동

### pre-commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash

# 빠른 체크 (린트 + 타입)
npm run lint || exit 1

# 옵션: 빠른 checkpoint
# /checkpoint --mode=quick
```

### pre-push Hook

```bash
# .git/hooks/pre-push
#!/bin/bash

# 전체 체크
./skills/checkpoint/scripts/checkpoint.sh --mode=full

RESULT=$?
if [ $RESULT -ne 0 ]; then
  echo "❌ Checkpoint 실패. Push가 차단되었습니다."
  exit 1
fi
```

---

## 5. 워크플로우 가이드 업데이트

### workflow-guide/SKILL.md 추가

**검증 섹션에 `/checkpoint` 추가:**

```markdown
### 핵심 스킬 (15개)

| 스킬 | 트리거 | 역할 |
|------|--------|------|
| ...
| **`/checkpoint`** | `/checkpoint`, "리뷰해줘" | 태스크 완료 시 2단계 코드 리뷰 |
| **`/security-review`** | `/security-review` | OWASP TOP 10 보안 검사 |
| **`/audit`** | `/audit` | 배포 전 종합 감사 |
```

### 품질 게이트 체크리스트 업데이트

```markdown
## 🔒 품질 게이트 체크리스트 (v4.1.0)

모든 구현 완료 후 반드시 거쳐야 하는 게이트:

| 게이트 | 필수 스킬 | 통과 기준 |
|--------|-----------|-----------|
| **G0: 태스크 리뷰** | `/checkpoint` | 2단계 리뷰 통과 |
| **G1: 기능 검증** | `/trinity` | Trinity Score 70+ |
| **G2: Phase 검증** | `/evaluation` | 품질 메트릭 80% 이상 |
| **G3: 종합 감사** | `/audit` | 기획 정합성 + DDD + 보안 + 테스트 |
| **G4: 심층 검토** | `/multi-ai-review` | 3개 AI 합의 (선택적) |
| **G5: 최종 검증** | `/verification-before-completion` | 검증 명령어 성공 |
```

---

## 6. 자연어 매핑 추가

### workflow-guide/SKILL.md 빠른 매핑

```markdown
"코드 검토해줘"                 → /checkpoint
"리뷰해줘"                      → /checkpoint
"이 파일 리뷰"                  → /checkpoint --files=<path>
"보안 검사해줘"                 → /security-review
```

---

## 7. 연동 흐름도

### 전체 워크플로우

```
┌─────────────────────────────────────────────────────────────┐
│                    개발 사이클                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 기획: /governance-setup → /tasks-init                  │
│     ↓                                                        │
│  2. 구현:                                                    │
│     • ≤30개: /agile auto                                     │
│     • 30~80개: /team-orchestrate                       │
│     ↓                                                        │
│  3. 태스크 완료 시: /checkpoint (자동)                       │
│     ↓                                                        │
│  4. 레이어/Phase 완료 시: /trinity → /evaluation            │
│     ↓                                                        │
│  5. 배포 전: /audit → /multi-ai-review                      │
│     ↓                                                        │
│  배포 ✅                                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. 상세 구현 태스크

### Phase 1: 핵심 기능 구현

| 태스크 | 설명 | 파일 |
|--------|------|------|
| 1.1 | checkpoint.js Git Diff 자동 감지 | scripts/checkpoint.js |
| 1.2 | TASKS.md 컨텍스트 추출 | scripts/task-context.js |
| 1.3 | 2단계 리뷰 로직 | scripts/review-stages.js |
| 1.4 | 보안 자동 호출 연동 | scripts/security-integration.js |

### Phase 2: 연동 구현

| 태스크 | 설명 | 파일 |
|--------|------|------|
| 2.1 | checkpoint-review Hook | project-team/hooks/checkpoint-review.js |
| 2.2 | agile SKILL.md 업데이트 | skills/agile/SKILL.md |
| 2.3 | team-orchestrate SKILL.md 업데이트 | skills/team-orchestrate/SKILL.md |
| 2.4 | workflow-guide SKILL.md 업데이트 | skills/workflow-guide/SKILL.md |

### Phase 3: 템플릿 및 문서

| 태스크 | 설명 | 파일 |
|--------|------|------|
| 3.1 | 체크포인트 리포트 템플릿 | templates/checkpoint-report.md |
| 3.2 | Git Hook 템플릿 | templates/git-hooks/ |
| 3.3 | 사용자 가이드 | references/usage.md |

---

## 9. 버전 업데이트

### 연관 스킬 버전 bump

| 스킬 | 현재 버전 | 새 버전 | 변경 내용 |
|------|-----------|---------|-----------|
| `/checkpoint` | 1.0.0 | 1.1.0 | 연동 기능 추가 |
| `/agile` | 2.3.0 | 2.4.0 | checkpoint 연동 |
| `/team-orchestrate` | 1.0.0 | 1.1.0 | post-task 게이트 |
| `/workflow-guide` | 4.0.0 | 4.1.0 | checkpoint 카탈로그 추가 |

---

**Last Updated**: 2026-03-03 (v1.0.0)
