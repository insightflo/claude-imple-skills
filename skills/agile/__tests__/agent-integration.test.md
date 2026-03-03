# Agile Skill - Agent Integration Test

> **Test Purpose**: /agile 스킬과 project-team 에이전트 간의 통합 연동 검증
>
> **Version**: 2.5.0
> **Created**: 2026-03-03

---

## Test Environment Setup

### Prerequisites

```bash
# 1. project-team 설치 확인
ls project-team/agents/project-manager.md
ls project-team/agents/qa-manager.md
ls project-team/agents/backend-specialist.md
ls project-team/agents/frontend-specialist.md

# 2. governance-setup 실행 확인
ls management/mini-prd.md

# 3. TASKS.md 준비
ls TASKS.md
```

### Mock Agent Response Format

```json
{
  "agent_id": "project-manager",
  "response": {
    "status": "success",
    "tasks_assigned": [
      {"id": "T1.1", "domain": "backend", "assignee": "backend-specialist"},
      {"id": "T1.2", "domain": "frontend", "assignee": "frontend-specialist"}
    ]
  }
}
```

---

## Test Case 1: Sprint Start → Project Manager 호출

### Description
`/agile start` 실행 시 Project Manager 에이전트에게 태스크 분배를 요청하는지 확인

### Test Steps

1. **Given**: TASKS.md에 Skeleton 레이어 태스크가 정의됨
2. **When**: `/agile start` 실행
3. **Then**:
   - [ ] `Agent` tool이 `subagent_type="project-manager"`로 호출됨
   - [ ] 스프린트 범위와 태스크 목록이 전달됨
   - [ ] PM이 태스크를 도메인별로 분배하여 응답

### Expected Output

```markdown
## Project Manager 응답

### 스프린트 계획
- 레이어: Skeleton
- 기간: 1-2일
- 할당된 태스크: 5개

### 도메인별 분배
| Domain | Tasks | Assignee |
|--------|-------|----------|
| backend | T1.1, T1.2 | backend-specialist |
| frontend | T1.3, T1.4 | frontend-specialist |
```

### Success Criteria
- [ ] Agent tool 호출 로그 확인
- [ ] PM 응답에 도메인 분배 결과 포함

---

## Test Case 2: Muscles 완료 → Security Specialist 검증

### Description
Muscles 레이어 완료 시 Security Specialist 에이전트에게 보안 검증을 요청

### Test Steps

1. **Given**: Muscles 레이어 태스크가 완료됨
2. **When**: `/agile checkpoint muscles` 실행
3. **Then**:
   - [ ] `Agent` tool이 `subagent_type="security-specialist"`로 호출됨
   - [ ] 완료된 태스크와 변경 파일 목록이 전달됨
   - [ ] Security Specialist가 OWASP Top 10 검증 결과 응답

### Expected Output

```markdown
## Security Specialist 응답

### 보안 검증 결과
- 점수: 85/100
- 판정: PASS

### 검증된 항목
- [x] SQL Injection 대응
- [x] XSS 방어
- [x] 인증/인가 검증
- [ ] 시크릿 노출 검사 (권장)

### 발견된 이슈
- 🟡 MEDIUM: .env 파일이 git 추적 중 (제거 권장)
```

### Success Criteria
- [ ] Security Specialist 호출 확인
- [ ] 보안 점수와 이슈 목록 포함

---

## Test Case 3: Layer 완료 → QA Manager 승인 요청

### Description
각 레이어 완료 시 QA Manager에게 품질 게이트 승인을 요청

### Test Steps

1. **Given**: Skeleton 레이어가 완료되고 테스트 통과
2. **When**: `/agile complete skeleton` 실행
3. **Then**:
   - [ ] `SendMessage` tool이 `recipient="qa-manager"`로 호출됨
   - [ ] 레이어명, 완료 태스크, 테스트 결과가 전달됨
   - [ ] QA Manager가 승인/거부 응답

### Expected Output

```markdown
## QA Manager 응답

### 품질 게이트 판정
- Gate 1 (Unit): PASS (커버리지 82%)
- Gate 2 (Lint): PASS (에러 0개)
- Gate 3 (Build): PASS

### 최종 판정
✅ 승인 - 다음 레이어 진행 허용

### 조건
- 없음
```

### Success Criteria
- [ ] SendMessage 호출 확인
- [ ] QA Manager 승인 응답 포함

---

## Test Case 4: QA 거부 → Specialist 피드백 루프

### Description
QA Manager가 승인을 거부할 경우, 관련 Specialist 에이전트에게 피드백 전달

### Test Steps

1. **Given**: QA Manager가 Muscles 레이어를 거부 (보안 이슈)
2. **When**: 거부 응답 수신
3. **Then**:
   - [ ] `Agent` tool이 `subagent_type="security-specialist"`로 호출됨
   - [ ] 거부 사유와 수정 요청이 전달됨
   - [ ] Specialist가 수정 계획 응답

### Expected Output

```markdown
## Security Specialist 피드백 응답

### 수정 계획
- 대상 이슈: API 키 하드코딩 (CRITICAL)
- 수정 방법: 환경변수로 이동
- 예상 소요: 30분

### 수정 후 조치
- /audit 재실행 필요
- QA Manager 재승인 필요
```

### Success Criteria
- [ ] Specialist 호출 확인
- [ ] 수정 계획 포함

---

## Test Case 5: project-team 미설치 시 Standalone 동작

### Description
project-team이 설치되지 않은 환경에서 standalone 모드로 정상 동작

### Test Steps

1. **Given**: project-team/agents/ 디렉토리 없음
2. **When**: `/agile start` 실행
3. **Then**:
   - [ ] 에이전트 호출 스킵
   - [ ] "project-team 미설치" 안내 메시지
   - [ ] standalone 모드로 스프린트 진행

### Expected Output

```markdown
⚠️ project-team이 설치되지 않았습니다.
Standalone 모드로 진행합니다.

설치 방법:
/governance-setup 실행

## Sprint 계획 (Standalone)
- 레이어: Skeleton
- 태스크: 자동 할당 없음
```

### Success Criteria
- [ ] 에러 없이 standalone 모드 동작
- [ ] 설치 안내 포함

---

## Test Execution Checklist

### 사전 준비
- [ ] project-team 설치 완료
- [ ] governance-setup 실행 완료
- [ ] 테스트용 TASKS.md 준비

### 테스트 실행 순서
1. [ ] Test Case 1: Sprint Start → PM
2. [ ] Test Case 2: Muscles → Security
3. [ ] Test Case 3: Layer Complete → QA
4. [ ] Test Case 4: QA Reject → Feedback
5. [ ] Test Case 5: No project-team → Standalone

### 결과 기록

| Test Case | Status | Notes | Date |
|-----------|--------|-------|------|
| TC1 | [ ] PASS/FAIL | | |
| TC2 | [ ] PASS/FAIL | | |
| TC3 | [ ] PASS/FAIL | | |
| TC4 | [ ] PASS/FAIL | | |
| TC5 | [ ] PASS/FAIL | | |

---

## Integration Test Commands

```bash
# 수동 테스트 실행
echo "Test Case 1: Sprint Start"
echo "/agile start" | claude

echo "Test Case 2: Muscles Security"
echo "/agile checkpoint muscles" | claude

echo "Test Case 3: QA Approval"
echo "/agile complete skeleton" | claude

# 자동화 테스트 (추후 구현)
npm run test:integration:agile
```

---

**Test Owner**: Claude Code
**Last Updated**: 2026-03-03
