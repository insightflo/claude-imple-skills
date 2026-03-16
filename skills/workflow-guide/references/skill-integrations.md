# Workflow Guide Skill Integrations

> 스킬 간 연동 매트릭스 및 실패 복구 경로

## 성공 경로 (Happy Path)

```
/governance-setup (Mini-PRD 기획)
    ↓
/tasks-init (TASKS.md 스캐폴딩)
    ↓
┌─────────────────────────────────────────────────────────┐
│ 규모 판단 → 경로 분기                                    │
│                                                         │
│ 📦 소규모 (≤30개)                                        │
│   └─ /agile auto (Claude 직접 작성)                     │
│                                                         │
│ 🏢 중규모 (30~80개)                                      │
│   └─ /team-orchestrate (의존성 기반 병렬 실행)          │
│                                                         │
│ 🏃 스프린트 (50~200개) - 사용자 리뷰 게이트 필요         │
│   └─ /team-orchestrate --mode=sprint                   │
│                                                         │
│ 🌊 대규모 (80~200개) - Wave profile                      │
│   └─ /team-orchestrate --mode=wave                     │
│                                                         │
│ 🏛️ 거버넌스 (태스크 10+ + 복잡/협업 조건)                │
│   └─ /governance-setup (Phase 0: PM/Architect/QA/DBA)   │
│       ↓                                                 │
│   └─ 규모에 따라 /agile auto 또는 --mode=wave          │
└─────────────────────────────────────────────────────────┘
    ↓
/checkpoint (태스크 완료 시 리뷰)
    ↓
/security-review (보안 검사)
    ↓
/audit (배포 전 종합 감사)
    ↓
/multi-ai-review (심층 검토)
    ↓
배포 ✅
```

## 레거시 프로젝트 경로

```
기존 코드베이스
    ↓
/tasks-migrate (레거시 태스크 통합)
    ↓
/agile iterate (반복 개선)
    ↓
/audit (종합 감사)
```

## 실패 복구 경로

| 실패 상황 | 복구 스킬 | 다음 단계 |
|-----------|-----------|-----------|
| CLI 중단 | `/recover` | 이전 스킬 재개 |
| 리뷰 실패 | `/agile iterate` | `/checkpoint` |
| 품질 게이트 실패 | `/agile iterate` | 수정 후 재검증 |
| 기획 불명확 | `/governance-setup` | `/tasks-init` |
| 컨텍스트 과부하 | `/compress` | 최적화 후 재시도 |

---

## 자연어 → 스킬 빠른 매핑

```
"뭐부터 해야 할지 모르겠어"     → /workflow
"기획서 있는데 코딩 시작해줘"   → /agile auto
"이 기능 수정해줘"              → /agile iterate
"코드 검토해줘"                 → /checkpoint
"리뷰해줘"                      → /checkpoint
"심층 리뷰해줘"                 → /multi-ai-review
"council 소집해줘"              → /multi-ai-review
"여러 AI 의견 들어보자"         → /multi-ai-review
"보안 검사해줘"                 → /security-review
"품질 검사해줘"                 → /audit
"작업이 중단됐어"               → /recover
"대규모 프로젝트야"             → /governance-setup
"거버넌스 셋업"                 → /governance-setup
"멀티 AI로 실행"                → /multi-ai-run
"Codex로 코드 작성"             → /multi-ai-run --model=codex
"Gemini로 디자인"               → /multi-ai-run --model=gemini
"컨텍스트 압축해줘"             → /compress
"문서가 너무 길어"              → /compress optimize
"스프린트로 실행해줘"           → /team-orchestrate --mode=sprint
"자율 실행해줘"                 → /team-orchestrate --mode=auto
"칸반 보드 보여줘"              → /whitebox status
"보드 보여줘"                   → /whitebox status
"blocked 태스크 확인"           → /whitebox status
```

---

## 품질 게이트 체크리스트

모든 구현 완료 후 반드시 거쳐야 하는 게이트:

| 게이트 | 필수 스킬 | 통과 기준 |
|--------|-----------|-----------|
| **G0: 태스크 리뷰** | `/checkpoint` | 2단계 리뷰 통과 |
| **G1: 종합 감사** | `/audit` | 기획 정합성 + DDD + 보안 + 테스트/브라우저 |
| **G2: 심층 검토** | `/multi-ai-review` | Multi-AI 합의 (선택적) |

---

## Hook 시스템 연동

`project-team/hooks/` 내장 Hook이 워크플로우를 자동화합니다:

| Hook | 효과 |
|------|------|
| `task-sync.js` | 태스크 완료 시 TASKS.md 자동 업데이트 |
| `quality-gate.js` | Phase 완료 전 품질 검증 |
| `permission-checker.js` | 에이전트 역할별 파일 접근 제어 |
| `domain-boundary-enforcer.js` | PreToolUse 단계에서 교차 도메인 쓰기 차단 |
| `design-validator.js` | 디자인 시스템 준수 검증 |

### Hook 설치

```bash
# project-team 설치 스크립트 실행
cd project-team && ./install.sh --mode standard
```
