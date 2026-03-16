---
name: security-review
description: OWASP TOP 10 기반 보안 취약점 점검. 시크릿 노출, 인젝션, 인증/인가, 공급망(의존성) 위험, 보안 설정/헤더, 로깅/모니터링을 정적 분석으로 점검합니다. 배포 전, PR 머지 전, auth/payment/billing 코드 수정 시 반드시 사용하세요. "보안 검사", "취약점 점검", "시크릿 노출 확인" 요청에 즉시 실행.
version: 1.1.0
updated: 2026-03-02
---

# 🔒 Security Review (OWASP Top 10 보안 점검)

> **목적**: 배포 전 코드베이스의 핵심 보안 결함을 **정적 분석 기반으로 탐지/정리**하고, 재현 가능한 **근거(evidence)** 와 **수정 가이드**를 제공합니다.
>
> **핵심 원칙**: 이 스킬은 **분석/리포트 전용**입니다. 자동 수정은 하지 않습니다.
>
> **/audit 연동**: `/audit` 5단계 품질 감사에서 **보안 트랙을 전문적으로 수행**하며, 결과를 표준 아티팩트로 전달할 수 있습니다.

---

## 🔧 MCP 의존성

| MCP | 필수 여부 | 용도 |
|-----|-----------|------|
| 없음 | - | 기본 검색/정적 분석 도구로 점검 |

> 필요 시 외부 SAST/Dependency Scan 결과 파일을 **해석/요약**하는 형태로만 지원합니다.

---

## ⛔ 절대 금지 사항 (Safety & Constraints)

1. ❌ **취약점 악용 코드/페이로드 작성 금지**
   - 재현은 **공격 코드 없이** “입력 조건/흐름/기대-실제 결과 차이” 수준으로만 기술
2. ❌ **근거 없는 단정 금지**
   - 모든 지적은 `file_path:line` 기반의 증거를 포함
3. ❌ **시크릿/PII 재노출 금지**
   - 보고서/터미널/아티팩트 어디에도 원문을 남기지 않음
4. ❌ **비인가 대상 점검 금지**
   - 명시적으로 승인된 코드/환경만 점검 (외부 시스템 접속/테스트 수행 금지)

### 🔐 민감정보 마스킹 규칙

- 토큰/키/세션값/비밀번호 등은 **원문 금지**
- 기본 마스킹: `앞 3~4자 + "***" + (길이/타입 힌트)`
  - 예: `AKIA*** (len=20)`, `sk-*** (prefix=sk-)`, `***PRIVATE KEY***`
- 로그/샘플 데이터 인용 시 사용자 식별자(이메일/전화/IP 등)는 **최소화/비식별화**

### 🧯 긴급 대응 트리거(운영 관점)

- 아래 중 하나라도 해당하면 **즉시 CRITICAL 후보**로 분류하고, “수정”보다 **회수/재발급/영향 범위 확인**을 우선 권고합니다.
  - 활성(운영) 키로 보이는 시크릿 노출
  - 결제/PII/관리자 권한과 직접 연결되는 자격증명 노출

---

## ✅ 스킬 발동 시 즉시 실행할 행동 (High-level)

1. **프리플라이트 스코핑**(프로젝트 특성/제외 경로/산출물 정의)
2. **시크릿/자격증명 노출** 점검 + 노출 후 대응 권고
3. **OWASP A01~A10** 기준 점검 (필수: A04/A06/A10 포함)
4. **Web/API 특화 고위험**(SSRF/업로드/Path Traversal/역직렬화/CSRF/Clickjacking) 점검
5. **의존성/공급망** 위험 점검 (lockfile + install script + drift 등)
6. **트리아지(오탐 제거)**: Source→Sink 흐름/방어기제 확인
7. **리포트 작성**: 우선순위 + 수정 가이드 + 검증 방법

---

## 🏗️ 실행 프로세스 (Checklist)

### 0단계: 프리플라이트 스코핑 (필수)

- **대상 범위(in-scope)**
  - 기본: `src/`, `app/`, `server/`, `api/`, `infra/`(있을 경우), 설정 파일
- **제외 범위(out-of-scope) 기본값**
  - 생성물/벤더/캐시: `**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/coverage/**`, `**/*.min.*`
  - 테스트 픽스처는 기본 포함(단, 노이즈가 크면 제외 가능)
- **산출물**
  - (기본) Markdown 리포트
  - (선택) `/audit` 연동용 JSON 아티팩트

**완료 조건**: include/exclude, 스캔 모드(quick/standard/deep), 출력 형식(md/json) 확정

### 1단계: 시크릿 노출 점검

**점검 항목**
- 하드코딩된 API Key/Access Token/Private Key/DB URL
- `.env*`, credential 파일이 레포에 추적되는지
- 로그/에러 메시지에 민감정보 출력 여부

**증거 요건**
- `file_path:line` + (최대 5줄) 스니펫(마스킹 적용)

**노출 후 대응 절차(리포트에 포함)**
- 키 식별자(가능하면 서비스/환경만) + 노출 위치
- 회수/재발급 필요 여부 및 영향 범위 추정(환경: dev/stage/prod)

**완료 조건**: 시크릿 후보 목록을 Confirmed/FP(오탐)/Need-more-context로 분류

### 2단계: OWASP Top 10 (A01~A10) 전체 매트릭스

> 각 항목은 최소 1개의 “탐지 규칙”과 “필수 증거”를 동반합니다.

| OWASP | 핵심 질문(요약) | 최소 증거(필수) |
|---|---|---|
| A01 Broken Access Control | 권한 검증이 누락/우회 가능한가? | 가드/정책 코드 위치 + 접근 경로/리소스 식별자 처리 |
| A02 Cryptographic Failures | 저장/전송/키 관리가 취약한가? | 사용 알고리즘/모드/키 저장 위치, TLS/쿠키 설정 |
| A03 Injection | 외부 입력이 위험 sink로 결합되는가? | Source→Sink 경로 + 쿼리/커맨드/템플릿 결합 방식 |
| A04 Insecure Design | 설계상 보안 통제가 누락되었나? | 위협 모델 부재/권한 모델 모호/민감 기능 보호 누락의 근거 |
| A05 Security Misconfiguration | 안전하지 않은 설정/헤더/디버그가 있는가? | 설정 파일/서버 초기화 코드 + 실제 값 |
| A06 Vulnerable & Outdated Components | 취약/구식 컴포넌트를 쓰는가? | lockfile/버전/공급망 신호(postinstall 등) |
| A07 Identification & Authentication Failures | 인증 흐름이 깨지는가? | 토큰 검증(서명/만료/iss/aud), 세션/리셋 플로우 근거 |
| A08 Software & Data Integrity Failures | 무결성 검증 없는 업데이트/실행이 있는가? | 외부 스크립트/업데이트/플러그인 로드 경로 |
| A09 Security Logging & Monitoring Failures | 보안 이벤트가 기록/탐지되는가? | 최소 이벤트 목록 충족 여부 + 로깅 위치 |
| A10 Server-Side Request Forgery (SSRF) | 서버가 공격자 입력으로 요청을 하는가? | URL fetch 호출부 + 검증/차단 로직 |

#### A03 Injection 상세 분류(필수)

- SQL / NoSQL
- Command / Shell 인자 주입
- Template 인젝션
- LDAP / XPath
- CRLF(Header) / Response splitting

#### 인증/인가 상세 체크리스트(필수)

- JWT/세션: 서명, 만료, `iss/aud` 등 핵심 claim 검증
- 비밀번호 재설정/이메일 인증: 토큰 수명/1회성/사용 후 폐기
- 권한상승: 수평(IDOR), 수직(역할 상승) 가능 경로
- 브루트포스 방어: rate limit/lockout/2FA 적용 지점(있는 경우)

### 3단계: Web/API 특화 고위험 점검 (필수)

#### SSRF (A10과 중복되나 별도 고정 체크)
- 외부 URL 입력을 서버가 fetch 하는지
- allowlist 적용 여부, 내부망/IP/메타데이터 엔드포인트 차단 여부

#### 경로 순회(Path Traversal)
- 파일 경로/파일명에 사용자 입력이 결합되는지
- `../`, 절대 경로, URL 디코딩 이후 검증 누락 여부

#### 파일 업로드
- 확장자/MIME/콘텐츠 스니핑 검증, 저장 경로 격리, 실행 가능 파일 차단
- 업로드 후 접근 제어(비공개 파일/서명 URL 등)

#### 역직렬화(Deserialization)
- 신뢰할 수 없는 입력을 위험한 역직렬화로 처리하는지
- 예: Python `pickle`, unsafe YAML load, Java `ObjectInputStream` 등(언어별)

#### 브라우저 보안: CSRF / Clickjacking
- 상태 변경 요청의 CSRF 방어 토큰/SameSite 정책
- 클릭재킹 방어: `X-Frame-Options` 또는 CSP `frame-ancestors`

### 4단계: 의존성/공급망 점검

**가능한 경우 사용(환경 허용 시)**
- Node.js: `npm audit`, `pnpm audit`, `yarn audit`
- Python: `pip-audit`, `poetry audit`

**Supply Chain 리스크(정적 점검)**
- lockfile 무결성/드리프트(예: `package-lock.json` vs `package.json` 불일치)
- `postinstall/preinstall` 등 install script 존재 여부
- 신규/낯선 패키지 도입 흔적(typosquatting 의심)
- 원격 스크립트 다운로드/실행 패턴

**완료 조건**: “취약점(버전)”과 “공급망 신호(행위)”를 구분하여 기록

### 4.5단계: 트리아지(오탐지 필터링) & 증거 수집

취약점 후보를 발견하면, 보고 전 반드시 아래를 확인합니다:

- **Source→Sink 데이터 흐름**: 외부 입력(Source)이 방어 없이 위험 sink에 도달하는지
- **방어 기제 확인**: sanitization/encoding/parameterization/type casting 존재 여부
- **증거 수집 규칙**: `file:line` + 스니펫(최대 5줄, 마스킹) + “왜 위험한지” 1~2문장

**완료 조건**: Confirmed / Likely / Needs-context / False-positive 분류 완료

### 5단계: 리포트 작성

#### 우선순위 산정 규칙

- 우선순위 = **심각도 × 악용 난이도 × 노출 범위 × 자산 중요도(PII/결제/관리자)**

#### Finding(취약점) 필수 필드

각 이슈는 아래 필드를 반드시 포함합니다:

- **finding_id**: `SR-0001` 형식
- **title**: 한 줄 요약
- **owasp / cwe(가능 시)**
- **severity**: CRITICAL/HIGH/MEDIUM/LOW
- **confidence**: High/Medium/Low (정적 분석 확신도)
- **location**: `file_path:line`
- **evidence**: (최대 5줄) 스니펫 + 핵심 근거 요약
- **impact**: CIA(기밀/무결/가용) + 대상 자산(예: PII, 결제, 운영 권한)
- **reproduction_notes (safe)**: 공격 코드 없이 입력 조건/흐름 중심 설명
- **remediation**:
  - 안전 패턴(권장)
  - 금지 패턴(피해야 함)
  - 검증 방법(테스트/재스캔 체크)
- **status**: New/Confirmed/False-Positive/Accepted-Risk/Fixed (가능하면)

---

## 📊 출력 형식 (Output Format)

### 1) 요약 박스

- 총점(선택), 판정(OK/NEEDS FIX), 심각도 카운트
- 스캔 범위/모드/제외 경로 요약

### 2) 주요 취약점 목록(표)

| ID | Severity | OWASP | Title | Location | Confidence |
|---|---|---|---|---|---|
| SR-0001 | HIGH | A03 | ... | `src/...:123` | High |

### 3) 상세 Findings

- Finding 템플릿(위 필수 필드) 기준으로 섹션화

### 4) 우선순위 조치(Top 3)

1. 🔴/🟠 항목 즉시 수정 후 재검증
2. 인증/인가 공통 가드 및 입력 검증 레이어 보강
3. 시크릿 회수/재발급(노출 정황 존재 시)

### 5) 신뢰도 및 한계(필수)

- 정적 분석 한계, 미점검 범위(out-of-scope), 환경/런타임 확인 필요 항목을 명시

---

## 🛠️ 주요 명령어 대응 (Flags)

| 명령어 | 설명 |
|--------|------|
| `/security-review` | 기본(standard) 스캔 |
| `/security-review --mode quick` | 핵심 규칙만 빠르게 점검 |
| `/security-review --mode deep` | 전체 규칙 + 공급망/설정까지 정밀 점검 |
| `/security-review --path <dir>` | 지정 경로만 점검 |
| `/security-review --include "src/**"` | 포함 패턴 지정 |
| `/security-review --exclude "**/node_modules/**,**/dist/**"` | 제외 패턴 지정 |
| `/security-review --checks "secrets,auth,ssrf"` | 특정 카테고리만 재점검 |
| `/security-review --summary` | 요약 중심 리포트 |
| `/security-review --owasp` | OWASP 매핑 중심 출력 |
| `/security-review --format md` | 기본 출력(Markdown) |
| `/security-review --format json --out .claude/security-review.json` | JSON 아티팩트 생성(자동화/연동) |
| `/security-review --min-confidence high` | High confidence 이슈만 출력 |
| `/security-review --severity-threshold high` | High 이상만 요약/게이트 기준으로 사용 |
| `/security-review --fail-on high` | High 이상 미해결 시 실패(파이프라인용) |
| `/security-review --since <git-ref>` | 변경분 중심(델타) 점검 |
| `/security-review --baseline <file>` | 기존 베이스라인과 비교(중복/기허용 제외) |

---

## 🔄 `/audit` 연동 계약 (Interface Contract)

### 역할 분리

- `/audit`: 종합 점수/게이트 판정/전체 품질 통합
- `security-review`: 보안 결함 식별 + 근거 + 수정 가이드 제공

### 출력 아티팩트(권장)

- 기본 경로: `.claude/security-review.json` (또는 `--out`)
- 최소 포함 항목:
  - `scan`: include/exclude, mode, checks, timestamp
  - `findings[]`: Finding 필수 필드
  - `limits`: out-of-scope, 미점검 항목
  - `redaction`: 마스킹 정책(원문 포함 금지)

### 중복 제거 규칙(권장)

- 중복 키: `rule_id(or owasp+cwe) + file + line + sink/source` 조합
- 동일 이슈는 1건으로 집계하며, 근거가 강화되면 evidence만 갱신

### 5단계 매핑(권장)

- Audit 내 보안 단계에서 본 스킬 결과(JSON/리포트)를 “근거”로 첨부
- 다른 스킬/도구의 SAST 결과가 있으면 중복 탐지 대신 “해석/우선순위”에 집중

---

## 🔗 다음 단계 제안

| 상황 | 권장 스킬 | 설명 |
|------|-----------|------|
| 고위험 취약점 발견 | `/agile iterate` | 우선순위 수정 태스크 생성/수행 |
| 배포 전 종합 검증 | `/audit` | 보안 포함 통합 품질 감사 |
| 코드 품질 동시 개선 | `/code-review` | 2단계 리뷰로 품질 회귀 방지 |
| 반복 취약점 예방 | `/guardrails` | 생성 단계 보안 가드 강화 |

---

## 🪝 Hook 연동

| Hook | 효과 |
|------|------|
| `skill-router` | `/security-review` 키워드 자동 감지 |
| `post-edit-analyzer` | 수정 후 보안 패턴 자동 재검사 |
| `git-commit-checker` | 고위험 취약점 미해결 시 경고 |

---

**Last Updated**: 2026-03-02 (v1.1.0 - 전체 리라이트: OWASP A01~A10 완전 매트릭스, Web/API 고위험, 트리아지, 아티팩트/플래그, /audit 계약 추가)
