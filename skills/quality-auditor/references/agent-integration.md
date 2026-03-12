# Quality Auditor Agent Integration

> project-team QA Manager 에이전트 연동 (v2.6.0)

## 감사 승인 워크플로우

```
/audit 실행 → 품질 점수 계산 완료
    ↓
┌─────────────────────────────────────────────────────────────┐
│  1️⃣ QA Manager 에이전트에게 승인 요청                       │
│  - SendMessage tool로 승인 요청 전송                        │
│  - 품질 점수, 주요 이슈, 판정 결과 전달                     │
├─────────────────────────────────────────────────────────────┤
│  2️⃣ QA Manager 판정                                        │
│  - ✅ 승인: 배포 진행                                       │
│  - ⚠️ 조건부 승인: 이슈 수정 후 재검증                       │
│  - ❌ 거부: 주요 이슈 수정 필수                              │
├─────────────────────────────────────────────────────────────┤
│  3️⃣ 불합격 시 Domain Specialist에게 피드백 전송            │
│  - backend-specialist: 백엔드 이슈                          │
│  - frontend-specialist: 프론트엔드 이슈                      │
│  - security-specialist: 보안 이슈                           │
└─────────────────────────────────────────────────────────────┘
```

## QA Manager 연동 패턴

### 1) 품질 게이트 승인 요청

```javascript
// project-team/hooks/quality-gate.js 실행 결과 확인
const qualityResult = bashExecute("node project-team/hooks/quality-gate.js");
const qualityData = JSON.parse(qualityResult);

// QA Manager에게 승인 요청
SendMessage({
  type: "message",
  recipient: "qa-manager",
  content: `품질 게이트 승인 요청:

## 감사 결과
- 총점: ${qualityData.score}/100
- 판정: ${qualityData.verdict}

## 주요 이슈
${qualityData.critical_issues.map(i => `- ${i.severity}: ${i.description}`).join('\n')}

## 승인 요청
이 감사 결과로 배포를 승인하시겠습니까?`,
  summary: "Quality gate approval request"
})
```

### 2) 불합격 시 Specialist 에이전트에게 피드백

```javascript
// 판정이 FAIL/CAUTION일 경우
if (qualityData.verdict === "FAIL" || qualityData.verdict === "CAUTION") {
  // 이슈 유형별로 해당 Specialist에게 할당
  for (const issue of qualityData.critical_issues) {
    const specialist = getSpecialistForIssue(issue.type);

    Agent({
      subagent_type: specialist,
      prompt: `품질 감사 결과 수정이 필요합니다:

## 이슈
- 심각도: ${issue.severity}
- 유형: ${issue.type}
- 내용: ${issue.description}
- 관련 파일: ${issue.files.join(', ')}

## 수정 요청
이 이슈를 수정해주세요. 수정 후 /audit 재실행이 필요합니다.`
    });
  }
}
```

## 에이전트별 피드백 라우팅

| 이슈 유형 | 담당 에이전트 | 피드백 내용 |
|-----------|--------------|-------------|
| **보안 취약점** | security-specialist | OWASP Top 10, 시크릿 노출, 인증/인가 |
| **백엔드 로직** | backend-specialist | API 구조, 데이터 모델, 트랜잭션 |
| **프론트엔드** | frontend-specialist | UI/UX, 상태 관리, 성능 |
| **아키텍처** | chief-architect | 설계 패턴, 모듈 의존성 |
| **테스트 커버리지** | qa-manager | 테스트 추가 요청 |

## project-team 연동 전제 조건

```bash
# project-team이 설치되어 있어야 합니다
ls project-team/agents/qa-manager.md

# quality-gate Hook이 실행 가능해야 합니다
node project-team/hooks/quality-gate.js --check
```

**project-team 미설치 시 동작:**
- QA Manager 연동 없이 standalone 모드로 동작
- 사용자에게 수동 승인 요청

## 감사 후 워크플로우

```
/audit 실행
    ↓
┌─────────────────────────────────────────┐
│ 결과 판정                                │
├─────────────────────────────────────────┤
│ ✅ PASS (90+)    → 배포 승인             │
│ ⚠️ CAUTION (70-89) → 경미한 수정 필요   │
│ ❌ FAIL (70 미만) → 주요 수정 필요       │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ 이슈 유형별 대응                         │
├─────────────────────────────────────────┤
│ Spec 불일치  → /agile iterate           │
│ 품질 이슈    → /checkpoint              │
│ 보안 이슈    → /security-review         │
└─────────────────────────────────────────┘
    ↓
재감사 (/audit)
    ↓
배포 ✅
```

## 감사 히스토리

감사 결과를 `docs/reports/audit-{date}.md`에 저장하면 품질 추이를 추적할 수 있습니다:

```markdown
## Audit History

| 날짜 | 총점 | 판정 | 주요 이슈 | 조치 |
|------|------|------|-----------|------|
| 2026-01-27 | 85 | CAUTION | 컨벤션 75% | /agile iterate |
| 2026-01-26 | 72 | CAUTION | 보안 이슈 | /security-review 재검증 |
| 2026-01-25 | 91 | PASS | - | 배포 |
```
