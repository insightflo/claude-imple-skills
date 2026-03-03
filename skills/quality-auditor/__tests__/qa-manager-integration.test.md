# Quality Auditor Skill - QA Manager Integration Test

> **Test Purpose**: /audit 스킬과 project-team QA Manager 에이전트 간의 통합 연동 검증
>
> **Version**: 2.6.0
> **Created**: 2026-03-03

---

## Test Environment Setup

### Prerequisites

```bash
# 1. project-team 설치 확인
ls project-team/agents/qa-manager.md
ls project-team/agents/security-specialist.md
ls project-team/agents/backend-specialist.md
ls project-team/agents/frontend-specialist.md

# 2. 기획 문서 확인
ls management/mini-prd.md
# 또는
ls docs/planning/01-prd.md

# 3. quality-gate Hook 실행 가능
node project-team/hooks/quality-gate.js --check
```

### Mock QA Manager Response Format

```json
{
  "agent_id": "qa-manager",
  "response": {
    "decision": "approved",  // approved | conditional | rejected
    "quality_gates": {
      "unit": "pass",
      "integration": "pass",
      "release": "pass"
    },
    "score": 92,
    "conditions": []
  }
}
```

---

## Test Case 1: 감사 완료 → QA Manager 승인 요청

### Description
`/audit` 실행 후 품질 점수 계산 완료 시 QA Manager에게 승인 요청

### Test Steps

1. **Given**: 기획 문서와 코드가 존재
2. **When**: `/audit` 실행 → 감사 완료
3. **Then**:
   - [ ] `quality-gate.js` Hook이 실행되어 JSON 결과 반환
   - [ ] `SendMessage` tool이 `recipient="qa-manager"`로 호출됨
   - [ ] 품질 점수, 주요 이슈, 판정 결과가 전달됨
   - [ ] QA Manager가 승인/조건부/거부 응답

### Expected QA Manager Request

```markdown
품질 게이트 승인 요청:

## 감사 결과
- 총점: 85/100
- 판정: ⚠️ CAUTION

## 주요 이슈
- 🔴 CRITICAL: API 키 하드코딩 (src/api/auth.py:23)
- 🟠 HIGH: 중복 이메일 체크 누락 (src/api/auth.py:45)

## 품질 게이트
- Gate 1 (Unit): PASS (커버리지 82%)
- Gate 2 (Integration): PASS
- Gate 3 (Release): FAIL (Critical 이슈 존재)

## 승인 요청
이 감사 결과로 배포를 승인하시겠습니까?
```

### Expected QA Manager Response (Conditional)

```markdown
## Release Decision: v1.0.0

### Decision: ⚠️ 조건부 승인 (Conditional)

### Quality Gate Results
- Gate 1 (Unit): Pass
- Gate 2 (Integration): Pass
- Gate 3 (Release): Fail

### Conditions
1. 🔴 CRITICAL 이슈 수정 필수
2. 🟠 HIGH 이슈 수정 권장

### Risk Assessment: Medium

### 다음 단계
- Critical 이슈 수정 후 /audit 재실행
- High 이슈는 다음 스프린트에서 수정
```

### Success Criteria
- [ ] quality-gate Hook 실행 확인
- [ ] SendMessage 호출 확인
- [ ] QA Manager 응답에 decision 포함

---

## Test Case 2: 승인 → 배포 진행

### Description
QA Manager가 승인(Approved)하면 배프 프로세스 진행

### Test Steps

1. **Given**: 품질 점수 92+, 판정 PASS
2. **When**: QA Manager 승인 응답 수신
3. **Then**:
   - [ ] "배포 승인됨" 메시지 출력
   - [ ] 배포 관련 안내 표시
   - [ ] 선택사항으로 배포 명령어 제안

### Expected Output

```markdown
┌─────────────────────────────────────────┐
│ 📊 품질 감사 결과                        │
├─────────────────────────────────────────┤
│ 총점: 92/100                            │
│ 판정: ✅ PASS                            │
│                                         │
│ ✅ 기능 정합성: 95%                      │
│ ✅ 아키텍처: 90%                         │
│ ✅ 품질: 88%                            │
│ ✅ 테스트: 통과 (커버리지 85%)           │
└─────────────────────────────────────────┘

## QA Manager 승인 완료
- Decision: Approved
- Risk: Low

## 배포 준비 완료
다음 단계를 선택하세요:
1. 배포 시작 (/deploy)
2. 리포트 저장 (docs/reports/audit-2026-03-03.md)
3. 감사 종료
```

### Success Criteria
- [ ] 배포 승인 메시지 포함
- [ ] 다음 단계 옵션 제공

---

## Test Case 3: 거부 → Specialist 피드백 전송

### Description
QA Manager가 거부(Rejected)하면 관련 Specialist 에이전트에게 피드백

### Test Steps

1. **Given**: 품질 점수 65 미만, 판정 FAIL
2. **When**: QA Manager 거부 응답 수신
3. **Then**:
   - [ ] 이슈 유형별로 해당 Specialist 식별
   - [ ] `Agent` tool로 각 Specialist 호출
   - [ ] 수정 요청 전송

### Expected Specialist Calls

```javascript
// 보안 이슈 → Security Specialist
Agent({
  subagent_type: "security-specialist",
  prompt: `품질 감사 결과 수정이 필요합니다:

## 이슈
- 심각도: CRITICAL
- 유형: 보안
- 내용: API 키가 소스 코드에 하드코딩됨
- 관련 파일: src/api/auth.py:23

## 수정 요청
이 이슈를 즉시 수정해주세요. 수정 후 /audit 재실행이 필요합니다.`
});

// 백엔드 이슈 → Backend Specialist
Agent({
  subagent_type: "backend-specialist",
  prompt: `품질 감사 결과 수정이 필요합니다:
...`
});
```

### Expected Output

```markdown
## 감사 결과: ❌ FAIL

### QA Manager 판정: 거부 (Rejected)
- 사유: Critical 이슈 2개 존재

### Specialist 에이전트에게 수정 요청 전송
- [x] security-specialist: 보안 이슈 2건
- [x] backend-specialist: 로직 이슈 1건
- [ ] frontend-specialist: (이슈 없음)

### 다음 단계
1. Specialist 수정 대기
2. 수정 완료 후 /audit 재실행
3. 재감사 통과 시 배포 승인
```

### Success Criteria
- [ ] 거부 사유 명시
- [ ] Specialist 호출 로그 확인
- [ ] 수정 요청 내용 포함

---

## Test Case 4: quality-gate.js JSON 파싱

### Description
quality-gate.js Hook의 JSON 출력을 올바르게 파싱

### Test Steps

1. **Given**: project-team/hooks/quality-gate.js 존재
2. **When**: Hook 실행
3. **Then**:
   - [ ] JSON 출력 유효성 확인
   - [ ] score, verdict, issues 필드 추출

### Expected Hook Output

```json
{
  "score": 85,
  "verdict": "CAUTION",
  "gates": {
    "unit": {"pass": true, "coverage": 82},
    "integration": {"pass": true},
    "release": {"pass": false, "critical_issues": 1}
  },
  "critical_issues": [
    {
      "severity": "CRITICAL",
      "type": "security",
      "description": "API key hardcoded",
      "files": ["src/api/auth.py:23"]
    }
  ],
  "timestamp": "2026-03-03T12:00:00Z"
}
```

### Success Criteria
- [ ] JSON 파싱 에러 없음
- [ ] 필수 필드 모두 존재

---

## Test Case 5: 이슈 유형별 Specialist 라우팅

### Description
이슈 유형에 따라 올바른 Specialist 에이전트 선택

### Test Routing Logic

```javascript
function getSpecialistForIssue(issueType) {
  const routing = {
    "security": "security-specialist",
    "backend": "backend-specialist",
    "frontend": "frontend-specialist",
    "architecture": "chief-architect",
    "test": "qa-manager"
  };
  return routing[issueType] || "backend-specialist"; // default
}
```

### Test Cases

| Issue Type | Expected Specialist | Test Result |
|------------|---------------------|-------------|
| security (API key 노출) | security-specialist | [ ] PASS |
| backend (로직 버그) | backend-specialist | [ ] PASS |
| frontend (UI 렌더링) | frontend-specialist | [ ] PASS |
| architecture (순환 의존) | chief-architect | [ ] PASS |
| test (커버리지 부족) | qa-manager | [ ] PASS |
| unknown | backend-specialist (default) | [ ] PASS |

### Success Criteria
- [ ] 모든 라우팅 케이스 통과

---

## Test Case 6: project-team 미설치 시 Standalone 동작

### Description
project-team이 설치되지 않은 환경에서 standalone 모드로 정상 동작

### Test Steps

1. **Given**: project-team/agents/qa-manager.md 없음
2. **When**: `/audit` 실행
3. **Then**:
   - [ ] QA Manager 연동 스킵
   - [ ] standalone 품질 리포트 출력
   - [ ] 수동 승인 요청

### Expected Output

```markdown
⚠️ project-team QA Manager가 설치되지 않았습니다.
Standalone 모드로 감사를 진행합니다.

## 품질 감사 결과 (Standalone)
- 총점: 85/100
- 판정: ⚠️ CAUTION

### 수동 승인 필요
project-team 설치 시 자동 승인 가능:
/governance-setup 실행

### 현재 단계
리포트를 확인하고 수동으로 배포 결정을 내려주세요.
```

### Success Criteria
- [ ] standalone 모드로 정상 동작
- [ ] 수동 승인 안내 포함

---

## Test Execution Checklist

### 사전 준비
- [ ] project-team 설치 완료
- [ ] 기획 문서 준비
- [ ] 테스트용 코드 준비

### 테스트 실행 순서
1. [ ] Test Case 1: 감사 완료 → QA 승인 요청
2. [ ] Test Case 2: 승인 → 배포 진행
3. [ ] Test Case 3: 거부 → 피드백 루프
4. [ ] Test Case 4: quality-gate JSON 파싱
5. [ ] Test Case 5: Specialist 라우팅
6. [ ] Test Case 6: No project-team → Standalone

### 결과 기록

| Test Case | Status | Notes | Date |
|-----------|--------|-------|------|
| TC1 | [ ] PASS/FAIL | | |
| TC2 | [ ] PASS/FAIL | | |
| TC3 | [ ] PASS/FAIL | | |
| TC4 | [ ] PASS/FAIL | | |
| TC5 | [ ] PASS/FAIL | | |
| TC6 | [ ] PASS/FAIL | | |

---

## Integration Test Commands

```bash
# 수동 테스트 실행
echo "Test Case 1: Audit + QA Approval"
echo "/audit" | claude

# quality-gate Hook 직접 테스트
node project-team/hooks/quality-gate.js

# 자동화 테스트 (추후 구현)
npm run test:integration:audit
```

---

**Test Owner**: Claude Code
**Last Updated**: 2026-03-03
