---
name: quality-auditor
description: Phase 완료/배포 전 종합 품질 감사. 기획 정합성 + DDD 검증 + 보안 검증 + 테스트 + 브라우저 검증을 수행합니다. 배포하기 전, PR 머지 전, 중요한 변경사항 완료 후 반드시 사용하세요. '품질 검사', '배포 전 체크', '감사해줘', 'QA' 키워드에 즉시 실행. /audit 트리거.
version: 2.7.0
updated: 2026-03-12
---

# 🕵️ Quality Auditor (배포 전 종합 감사)

> **목적**: Phase 완료 또는 배포 전에 **기획 문서 대비 종합 품질 감사**를 수행합니다.
>
> **v2.7.0**: Progressive Disclosure 적용 (Agent Team 상세 → references/)

---

## ⛔ 절대 금지 사항

1. ❌ **직접 코드를 수정하지 마세요** - 수정은 `implementation agent`의 역할
2. ❌ **근거 없는 비판을 하지 마세요** - 반드시 `docs/planning/` 내의 문서를 근거로 제시
3. ❌ **기획 문서 없이 감사하지 마세요** - 없으면 `/governance-setup` 실행 안내

---

## ✅ 스킬 발동 시 즉시 실행할 행동

```
1. 기획 문서 존재 확인 (Mini-PRD 또는 Socrates)
2. 컨텍스트 로딩 (기준 문서 읽기)
3. 2단계 리뷰 (Spec Compliance → Code Quality)
4. DDD (Demo-Driven Development) 검증
5. 🔒 보안 검증 (/security-review 호출)
6. 동적 검증 (테스트 실행)
7. UI/UX 브라우저 검증 (playwright MCP 있을 때)
8. 품질 리포트 작성 + 수정 지침 제공
```

---

## 🏗️ 실행 프로세스

### 1단계: 기획 문서 확인

```bash
# 두 가지 옵션 중 하나
ls management/mini-prd.md 2>/dev/null        # 옵션 A: Mini-PRD
ls docs/planning/*.md 2>/dev/null             # 옵션 B: Socrates
```

**Mini-PRD 필수 필드**: `purpose`, `features`, `tech_stack`
**Socrates 필수 문서**: `01-prd.md`, `02-trd.md`, `07-coding-convention.md`

### 2단계: 2단계 리뷰 (Two-Stage Review)

#### Stage 1: Spec Compliance (명세 준수)
- 요구사항 일치: PRD 핵심 기능이 정확히 구현되었는가?
- 누락 기능: 엣지 케이스/에러 처리 누락 없는가?
- YAGNI 위반: 기획에 없는 불필요한 기능 없는가?

#### Stage 2: Code Quality (코드 품질)
- SOLID/Clean Code: 읽기 쉽고 확장 가능한 구조인가?
- 보안: API Key 노출, SQL Injection 등 취약점 없는가?
- 성능: 불필요한 리렌더링/워터폴 페칭 없는가?

### 3단계: DDD 검증

- 데모 페이지: UI 태스크별 독립 데모 페이지 존재 여부
- 스크린샷 대조: 데모 vs 목업(`design/`) 일치 여부
- 콘솔 무결성: 브라우저 콘솔 에러 없음 확인

### 4단계: 🔒 보안 검증

```bash
/security-review --path src --summary
```

| 심각도 | 의미 | 배포 가능 |
|--------|------|----------|
| 🔴 CRITICAL | 즉시 수정 필수 | ❌ 배포 불가 |
| 🟠 HIGH | 배포 전 수정 권장 | ⚠️ 조건부 |
| 🟡 MEDIUM | 알려진 이슈 | ✅ 배포 가능 |

### 5단계: 동적 검증 (테스트 실행)

| 프로젝트 타입 | 테스트 명령어 |
|---------------|---------------|
| **Node.js** | `npm test` |
| **Python** | `pytest` |
| **Python (Poetry)** | `poetry run pytest` |

### 6단계: UI/UX 브라우저 검증 (선택적)

> **playwright MCP 설정 시에만 실행**

```
mcp__playwright__browser_navigate → http://localhost:3000
mcp__playwright__browser_screenshot → audit_screenshot.png
```

---

## 📊 감사 결과 제출

### 품질 요약

```
┌─────────────────────────────────────────┐
│ 📊 품질 감사 결과                        │
├─────────────────────────────────────────┤
│ 총점: 85/100                            │
│ 판정: ⚠️ CAUTION                        │
│                                         │
│ ✅ 기능 정합성: 95%                      │
│ ⚠️ 컨벤션: 75%                          │
│ 🔒 보안: 88% (1개 중급 이슈)            │
│ ✅ 테스트: 통과 (커버리지 82%)           │
└─────────────────────────────────────────┘
```

**판정 기준:**

| 점수 | 판정 | 의미 |
|------|------|------|
| 90+ | ✅ PASS | 즉시 배포 가능 |
| 70-89 | ⚠️ CAUTION | 경미한 수정 후 배포 |
| 70 미만 | ❌ FAIL | 주요 수정 필요 |

### 주요 결함

| 우선순위 | 구분 | 내용 | 관련 파일 | 근거 문서 |
|----------|------|------|-----------|-----------|
| 🔴 Critical | 보안 | API 키 하드코딩 | `src/api/auth.py:23` | TRD 보안 섹션 |
| 🟠 High | 버그 | 중복 체크 누락 | `src/api/auth.py:45` | PRD 회원가입 |

---

## 🔗 스킬 연동

| 감사 결과 | 권장 스킬 |
|-----------|-----------|
| Spec 불일치 | `/agile iterate` |
| 코드 품질 이슈 | `/checkpoint` → 재감사 |
| 보안 취약점 | `/security-review` 재실행 |
| 심층 검토 필요 | `/multi-ai-review` |

### 🤖 Agent Team 연동 (project-team)

QA Manager 에이전트와 협업하여 배포 승인 프로세스를 자동화합니다.

```
/audit → 품질 점수 계산 → QA Manager 승인 요청
    ↓
✅ 승인 → 배포 진행
⚠️ 조건부 → 이슈 수정 후 재검증
❌ 거부 → Specialist에게 피드백 전송
```

**상세 연동 패턴**: `references/agent-integration.md` 참조

---

## 📚 참조 문서

- `references/agent-integration.md` - QA Manager 연동 패턴, 피드백 라우팅

---

**Last Updated**: 2026-03-12 (v2.7.0 - Progressive Disclosure 적용)
