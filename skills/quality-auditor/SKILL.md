---
name: quality-auditor
description: Phase 완료/배포 전 종합 품질 감사. 기획 정합성 + DDD 검증 + 보안 검증 + 테스트 + 브라우저 검증을 수행합니다. /audit 트리거.
version: 2.5.0
updated: 2026-03-03
---

# 🕵️ Quality Auditor (배포 전 종합 감사)

> **목적**: Phase 완료 또는 배포 전에 **기획 문서 대비 종합 품질 감사**를 수행합니다.
>
> **v2.6.0 업데이트**: project-team QA Manager 에이전트 연동 (승인 요청, 피드백 루프)
**v2.5.0 업데이트**: Mini-PRD 지원 (Socrates 대안), `/security-review` 연동 + project-team Hook 시스템 (quality-gate, standards-validator)

---

## 🔧 MCP 의존성

| MCP | 필수 여부 | 용도 |
|-----|-----------|------|
| `playwright` | ⚠️ 선택적 | 브라우저 검증 (없으면 스킵) |

> **MCP 없이도 동작**: 테스트 실행은 기본 명령어(`npm test`, `pytest`)를 사용합니다.

---

## ⛔ 절대 금지 사항

1. ❌ **직접 코드를 수정하지 마세요** - 수정은 `implementation agent`의 역할입니다.
2. ❌ **근거 없는 비판을 하지 마세요** - 반드시 `docs/planning/` 내의 문서를 근거로 제시해야 합니다.
3. ❌ **기획 문서 없이 감사하지 마세요** - 기획 문서가 없으면 먼저 `/governance-setup` 실행을 안내합니다.

---

## ✅ 스킬 발동 시 즉시 실행할 행동

```
1. 기획 문서 존재 확인
2. 컨텍스트 로딩 (기준 문서 읽기)
3. **2단계 리뷰 프로세스 (Two-Stage Review)**
   - Stage 1: Spec Compliance (요구사항 & 비즈니스 로직)
   - Stage 2: Code Quality (품질, 보안, 성능)
4. **DDD (Demo-Driven Development) 검증**
5. **🔒 보안 검증 (NEW v2.4)** ← /security-review 호출
6. **동적 검증 (테스트 실행)** ← v2.0 변경: 기본 명령어 사용
7. UI/UX 브라우저 검증 (선택적, playwright MCP 있을 때)
8. 품질 리포트 작성
9. 수정 지침 제공 (스킬 연동 권장)
```

---

## 🏗️ 실행 프로세스

### 1단계: 기획 문서 확인 (Pre-flight Check)

```bash
# 기획 문서 존재 확인 (두 가지 옵션)
ls management/mini-prd.md 2>/dev/null        # 옵션 A: Mini-PRD
ls docs/planning/*.md 2>/dev/null             # 옵션 B: Socrates
```

**옵션 A: Mini-PRD (권장, v2.5.0 NEW)**

| 필드 | 용도 | 필수 여부 |
|------|------|----------|
| `purpose` | 프로젝트 목적 | ✅ 필수 |
| `features` | 핵심 기능 목록 | ✅ 필수 |
| `tech_stack` | 기술 스택 | ✅ 필수 |
| `data_model` | 데이터 엔티티 | ✅ 권장 |
| `api_contract` | API endpoint | ✅ 권장 |
| `error_handling` | 예외 처리 | 선택 |
| `performance` | 성능 목표 | 선택 |

**옵션 B: Socrates 문서 (기존)**

| 문서 | 용도 | 필수 여부 |
|------|------|----------|
| `01-prd.md` | 비즈니스 로직 검증 | ✅ 필수 |
| `02-trd.md` | 기술 스택/아키텍처 검증 | ✅ 필수 |
| `07-coding-convention.md` | 코드 스타일 검증 | ✅ 필수 |
| `03-user-flow.md` | 사용자 흐름 검증 | 선택 |
| `04-database-design.md` | DB 스키마 검증 | 선택 |

**문서 없음 시 안내:**

```
⚠️ 기획 문서가 없습니다.

감사를 진행하려면 기획 문서가 필요합니다.

권장: /governance-setup → Mini-PRD 생성
```

### 2단계: 컨텍스트 로딩 (Baseline Audit)

가져온 코드와 비교할 **기준 문서**들을 읽습니다.

**옵션 A: Mini-PRD 로드**

```bash
# Read 도구로 순차 로드
management/mini-prd.md         # Mini-PRD 전체 (purpose, features, tech_stack, data_model, ...)
```

**옵션 B: Socrates 로드**

```bash
# Read 도구로 순차 로드
docs/planning/01-prd.md        # 비즈니스 로직
docs/planning/02-trd.md        # 기술 스택 및 아키텍처
docs/planning/07-coding-convention.md  # 코드 스타일
```

**자동 감지 로직:**
```bash
if [ -f "management/mini-prd.md" ]; then
  source="mini-prd"
elif [ -f "docs/planning/01-prd.md" ]; then
  source="socrates"
else
  echo "⚠️ 기획 문서 없음"
fi
```

### 3단계: 2단계 리뷰 (Two-Stage Review)

#### Stage 1: Spec Compliance Review (명세 준수)
- **요구사항 일치**: PRD 핵심 기능이 코드에 정확히 구현되었는가?
- **누락 기능**: 기획 문서에 명시된 엣지 케이스나 에러 처리가 누락되지 않았는가?
- **YAGNI 위반**: 기획에 없는 불필요한 기능이 과하게 구현되지 않았는가?

#### Stage 2: Code Quality Review (코드 품질)
- **SOLID/Clean Code**: 코드가 읽기 쉽고 확장 가능한 구조인가?
- **보안 (Security Review)**: API Key 노출, SQL Injection 등 보안 취약점이 없는가?
- **성능 (Vercel Review)**: 불필요한 리렌더링이나 워터폴 페칭이 없는가?

### 4단계: DDD (Demo-Driven Development) 검증

- **데모 페이지**: 각 UI 태스크별로 독립적인 데모 페이지가 존재하는가?
- **스크린샷 대조**: 데모 페이지의 상태별 렌더링 결과가 목업(`design/`)과 일치하는가?
- **콘솔 무결성**: 데모 페이지 실행 시 브라우저 콘솔에 에러가 없는가?

### 5단계: 🔒 보안 검증 (NEW v2.4)

배포 전 보안 취약점을 검사합니다. `/security-review` 스킬을 활용합니다.

```bash
/security-review --path src --summary
```

**보안 검증 체크리스트:**

- [ ] **Injection 공격**: SQL, Command, NoSQL Injection 대응이 있는가?
- [ ] **인증 & 인가**: API 키, 토큰이 안전하게 관리되는가? 권한 검증이 있는가?
- [ ] **데이터 노출**: 하드코딩된 시크릿, 환경설정 정보 노출이 없는가?
- [ ] **암호화**: 민감 데이터가 전송 중/저장 중 암호화되는가?
- [ ] **OWASP**: TOP 10 항목에 대한 기본 대응이 있는가?

**보안 검증 결과 해석:**

| 심각도 | 의미 | 배포 가능 |
|--------|------|----------|
| 🔴 CRITICAL | 즉시 수정 필수 | ❌ 배포 불가 |
| 🟠 HIGH | 배포 전 수정 권장 | ⚠️ 조건부 |
| 🟡 MEDIUM | 알려진 이슈 | ✅ 배포 가능 |

---

### 6단계: 동적 검증 (테스트 실행) - v2.0 개선

**MCP 없이 기본 테스트 명령어를 사용합니다:**

```bash
# 1. 프로젝트 타입 감지
ls package.json pyproject.toml requirements.txt 2>/dev/null

# 2. 테스트 실행 (프로젝트 타입에 따라)
```

| 프로젝트 타입 | 테스트 명령어 | 커버리지 |
|---------------|---------------|----------|
| **Node.js** | `npm test` 또는 `npm run test` | `npm run test:coverage` |
| **Python** | `pytest` | `pytest --cov` |
| **Python (Poetry)** | `poetry run pytest` | `poetry run pytest --cov` |
| **Monorepo** | `pnpm test` 또는 `turbo test` | - |

**테스트 결과 분석:**

```bash
# 실패한 테스트 확인
npm test 2>&1 | grep -E "(FAIL|Error|failed)"

# 또는
pytest 2>&1 | grep -E "(FAILED|ERROR)"
```

**테스트 검증 체크리스트:**

- [ ] 모든 테스트가 통과하는가?
- [ ] 테스트 커버리지가 80% 이상인가?
- [ ] 핵심 비즈니스 로직에 대한 테스트가 있는가?
- [ ] 엣지 케이스 테스트가 있는가?

### 7단계: UI/UX 브라우저 검증 (선택적)

> **⚠️ playwright MCP가 설정된 경우에만 실행**

```bash
# MCP 확인
cat .mcp.json 2>/dev/null | grep -q "playwright"
```

**playwright MCP 있을 때:**

```
mcp__playwright__browser_navigate → http://localhost:3000
mcp__playwright__browser_screenshot → audit_screenshot.png
mcp__playwright__browser_console_messages → 콘솔 에러 확인
```

**playwright MCP 없을 때:**

```
⚠️ 브라우저 검증 스킵 (playwright MCP 미설정)

수동으로 다음을 확인하세요:
1. 브라우저에서 http://localhost:3000 접속
2. 개발자 도구 → Console 탭에서 에러 확인
3. design/ 폴더의 목업과 실제 화면 비교
```

**브라우저 감사 체크리스트:**

- [ ] 디자인 시스템(`05-design-system.md`)의 색상, 폰트, 간격이 정확히 구현되었는가?
- [ ] 반응형 레이아웃이 Mobile/Desktop 뷰포트에서 깨지지 않는가?
- [ ] 사용자 흐름(`03-user-flow.md`)대로 인터랙션이 부드럽게 동작하는가?

---

## 📊 감사 결과 제출 (Output Format)

### 1. 품질 요약 (Quality Score)

```
┌─────────────────────────────────────────┐
│ 📊 품질 감사 결과                        │
├─────────────────────────────────────────┤
│ 총점: 85/100                            │
│ 판정: ⚠️ CAUTION                        │
│                                         │
│ ✅ 기능 정합성: 95%                      │
│ ✅ 아키텍처: 90%                         │
│ ⚠️ 컨벤션: 75%                          │
│ ⚠️ 코드 품질: 80%                       │
│ 🔒 보안: 88% (1개 중급 이슈)            │
│ ✅ 테스트: 통과 (커버리지 82%)           │
│ ⚠️ 브라우저: 스킵 (MCP 미설정)          │
└─────────────────────────────────────────┘
```

**판정 기준:**

| 점수    | 판정       | 의미                        |
| ------- | ---------- | --------------------------- |
| 90+     | ✅ PASS    | 즉시 프로덕션 배포 가능     |
| 70-89   | ⚠️ CAUTION | 경미한 수정 후 배포 가능    |
| 70 미만 | ❌ FAIL    | 주요 수정 필요, 재감사 필수 |

### 2. 주요 결함 (Critical Issues)

| 우선순위    | 구분   | 내용                    | 관련 파일              | 근거 문서            |
| ----------- | ------ | ----------------------- | ---------------------- | -------------------- |
| 🔴 Critical | 보안   | API 키 하드코딩         | `src/api/auth.py:23`   | TRD 보안 섹션        |
| 🟠 High     | 버그   | 중복 이메일 체크 누락   | `src/api/auth.py:45`   | PRD 회원가입 스펙    |
| 🟡 Medium   | 컨벤션 | 에러 메시지 형식 불일치 | `src/api/*.py`         | 07-coding-convention |
| 🟢 Low      | 스타일 | import 순서 위반        | `src/utils/helpers.py` | 07-coding-convention |

### 3. 잘된 점 (Positive Feedback)

```
✅ 잘 구현된 부분:

- Repository Pattern이 일관되게 적용되어 있습니다. (TRD 준수)
- 모든 API 엔드포인트에 적절한 HTTP 상태 코드가 사용되었습니다.
- 테스트 커버리지가 80% 이상입니다.
```

### 4. 수정 지침 (Action Items)

| #   | 우선순위 | 작업                       | 담당               |
| --- | -------- | -------------------------- | ------------------ |
| 1   | 🔴       | API 키를 환경변수로 이동   | backend-specialist |
| 2   | 🟠       | 이메일 중복 체크 로직 추가 | backend-specialist |
| 3   | 🟡       | 에러 메시지 형식 통일      | backend-specialist |

---

## 🔄 다음 단계 제안

감사 완료 후 AskUserQuestion으로 다음 단계를 제안합니다:

```json
{
  "questions": [
    {
      "question": "감사가 완료되었습니다. 다음 단계를 선택해주세요:",
      "header": "감사 후 조치",
      "options": [
        {
          "label": "⭐ [권장] 즉시 수정 시작",
          "description": "발견된 이슈를 우선순위대로 수정"
        },
        {
          "label": "재감사 예약",
          "description": "수정 완료 후 다시 /audit 실행 알림"
        },
        {
          "label": "리포트만 저장",
          "description": "현재 리포트를 docs/reports/에 저장"
        }
      ],
      "multiSelect": false
    }
  ]
}
```

---

## 🔗 스킬 연동 (v2.6)

감사 결과에 따라 **자동으로 적합한 스킬을 권장**합니다:

| 감사 결과 | 권장 스킬 | 설명 |
|-----------|-----------|------|
| **Spec 불일치** | `/agile iterate` | 요구사항 맞춰 수정 |
| **코드 품질 이슈** | `/checkpoint` → 재감사 | 코드 리뷰 후 재감사 |
| **보안 취약점** | `/security-review` 재실행 | OWASP TOP 10 기준 재검증 |
| **심층 검토 필요** | `/multi-ai-review` | Multi-AI 컨센서스 리뷰 |

### 🪝 Hook 연동 (v1.9.2)

| Hook | 효과 |
|------|------|
| `skill-router` | `/audit` 키워드 자동 감지 → 스킬 즉시 로드 |
| `post-edit-analyzer` | 감사 후 수정 시 보안/품질 패턴 자동 검사 |
| `git-commit-checker` | 감사 통과 전 커밋 경고 |

### 🤖 Agent Team 연동 (v2.6.0)

project-team의 QA Manager 에이전트와 협업하여 배포 승인 프로세스를 자동화합니다.

#### 감사 승인 워크플로우

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

#### QA Manager 연동 패턴

**1) 품질 게이트 승인 요청:**

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

**2) 불합격 시 Specialist 에이전트에게 피드백:**

```javascript
// 판정이 FAIL/CAUTION일 경우
if (qualityData.verdict === "FAIL" || qualityData.verdict === "CAUTION") {
  // 이슈 유형별로 해당 Specialist에게 할당
  for (const issue of qualityData.critical_issues) {
    const specialist = getSpecialistForIssue(issue.type); // backend/frontend/security

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

#### 에이전트별 피드백 라우팅

| 이슈 유형 | 담당 에이전트 | 피드백 내용 |
|-----------|--------------|-------------|
| **보안 취약점** | security-specialist | OWASP Top 10, 시크릿 노출, 인증/인가 |
| **백엔드 로직** | backend-specialist | API 구조, 데이터 모델, 트랜잭션 |
| **프론트엔드** | frontend-specialist | UI/UX, 상태 관리, 성능 |
| **아키텍처** | chief-architect | 설계 패턴, 모듈 의존성 |
| **테스트 커버리지** | qa-manager | 테스트 추가 요청 |

#### project-team 연동 전제 조건

```bash
# project-team이 설치되어 있어야 합니다
ls project-team/agents/qa-manager.md

# quality-gate Hook이 실행 가능해야 합니다
node project-team/hooks/quality-gate.js --check
```

**project-team 미설치 시 동작:**
- QA Manager 연동 없이 standalone 모드로 동작
- 사용자에게 수동 승인 요청

---

## 🔄 감사 후 워크플로우

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

---

## 📊 감사 히스토리 (선택적)

감사 결과를 `docs/reports/audit-{date}.md`에 저장하면 품질 추이를 추적할 수 있습니다.

```markdown
## Audit History

| 날짜 | 총점 | 판정 | 주요 이슈 | 조치 |
|------|------|------|-----------|------|
| 2026-01-27 | 85 | CAUTION | 컨벤션 75% | /agile iterate |
| 2026-01-26 | 72 | CAUTION | 보안 이슈 | /security-review 재검증 |
| 2026-01-25 | 91 | PASS | - | 배포 |
```

---

**Last Updated**: 2026-03-03 (v2.6.0 - QA Manager 에이전트 연동)
