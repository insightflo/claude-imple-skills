# claude-imple-skills

> **Claude Code용 구현 스킬 팩** — AI 에이전트 팀으로 소프트웨어 구축

[**English**](./README.md) | [**한국어**](./README_ko.md)

Claude Code로 소프트웨어를 개발할 때 도와주는 **스킬**과 **에이전트 팀** 모음입니다. 외부 의존성 없이 독립적으로 실행됩니다.

---

## 빠른 시작

```bash
# 설치 (macOS/Linux)
chmod +x ./scripts/install-unix.sh && ./scripts/install-unix.sh

# 설치 (Windows PowerShell)
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1

# 선택사항: 대규모 프로젝트용 Project Team
cd project-team && ./install.sh --global
```

---

## 제공 기능

| 구성요소 | 개수 | 용도 |
|----------|-------|------|
| **스킬** | 18개 | 작업 실행, 분석, 자동화 |
| **에이전트** | 10개 | 역할 기반 전문가 팀 |
| **훅** | 15개 | 자동 검증 (보안, 품질, 영향도) |
| **템플릿** | 7개 | 프로토콜, ADR, 계약 |

---

## 스킬

### 핵심 워크플로우

| 스킬 | 기능 |
|------|------|
| `/workflow` | **메타 허브** — 현재 상태를 분석하여 다음 스킬 추천 |
| `/agile` | 레이어별 스프린트 (Skeleton → Muscles → Skin), 1~30개 태스크 |
| `/recover` | 중단 후 작업 재개 |
| `/checkpoint` | 진행 상태 저장/복원 |

### 프로젝트 초기화

| 스킬 | 기능 |
|------|------|
| `/governance-setup` | PM → Architect → Designer → QA → DBA 팀 구성 |
| `/tasks-init` | TASKS.md 처음부터 생성 (독립형) |
| `/tasks-migrate` | 기존 태스크 파일을 새 형식으로 변환 |

### 품질 & 보안

| 스킬 | 기능 |
|------|------|
| `/quality-auditor` | 배포 전 종합 감사 |
| `/security-review` | OWASP TOP 10, CVE, secrets 감지 |
| `/multi-ai-review` | 컨센서스 리뷰 (Claude + Gemini CLI + Codex CLI) |

### 자동화

| 스킬 | 기능 |
|------|------|
| `/orchestrate-standalone` | 50~200개 태스크를 전문가 에이전트로 실행 |
| `/multi-ai-run` | 병렬 AI 실행 관리 |

### 유지보수

| 스킬 | 기능 |
|------|------|
| `/impact` | 수정 전 영향도 분석 |
| `/deps` | 의존성 시각화 + 순환 참조 감지 |
| `/changelog` | 도메인별 변경 이력 조회 |
| `/coverage` | 테스트 커버리지 시각화 |
| `/architecture` | 프로젝트 구조 & 도메인 맵 |

---

## Project Team

대규모 프로젝트를 위해 **AI 에이전트 팀**과 **자동 품질 게이트**를 배포하세요:

```
project-team/
├── agents/          # 10명 전문가
├── hooks/           # 15개 자동 검증기
├── skills/          # 5개 유지보수 도구
└── templates/       # 프로토콜 & 계약
```

### 에이전트 (10명)

| 역할 | 책임 |
|------|------|
| **Project Manager** | 조율, 태스크 라우팅 |
| **Chief Architect** | 표준, ADR, 거부권 |
| **Chief Designer** | 디자인 시스템 일관성 |
| **QA Manager** | 품질 게이트, 테스트 표준 |
| **DBA** | DB 스키마, 마이그레이션 |
| **Security Specialist** | 취약점 스캔 |
| **Frontend Specialist** | UI/UX 구현 |
| **Backend Specialist** | API, 비즈니스 로직 |
| **Maintenance Analyst** | 프로덕션 영향도 분석 |

### 훅 (15개)

파일 수정 전후 자동 실행되는 검증:

| 카테고리 | 훅 |
|----------|-----|
| **권한** | `permission-checker` |
| **안전** | `pre-edit-impact-check`, `risk-area-warning`, `security-scan` |
| **품질** | `standards-validator`, `design-validator`, `interface-validator`, `quality-gate` |
| **게이트** | `policy-gate`, `contract-gate`, `risk-gate`, `docs-gate` |
| **동기화** | `architecture-updater`, `changelog-recorder`, `cross-domain-notifier`, `task-sync` |

### 배포 모드

| 모드 | 사용 시기 | 구성요소 |
|------|-----------|----------|
| **Lite** | MVP, 스타트업 | 3 에이전트, 2 훅 |
| **Standard** | 일반적인 프로젝트 | 7 에이전트, 4 게이트 |
| **Full** | 규제 산업 | 전체 에이전트, 전체 훅 |

자세한 내용은 `project-team/docs/MODES.md` 참조.

---

## 권장 워크플로우

```
시작
  │
  ├─ "뭐부터 해야 해?" ────────────── /workflow
  │
  ├─ 프로젝트 기획
  │   ├─ 대규모 프로젝트? ──────── /governance-setup
  │   └─ 태스크 생성 ───────────── /tasks-init
  │
  ├─ 구현 (규모에 따라 선택)
  │   ├─ 소규모 (≤30) ─────────── /agile auto
  │   ├─ 중규모 (30-50) ───────── /orchestrate-standalone
  │   └─ 대규모 (50+) ─────────── /orchestrate-standalone
  │
  ├─ 유지보수
  │   ├─ 수정 전 ──────────────── /impact
  │   ├─ 의존성 확인 ──────────── /deps
  │   └─ 변경 이력 ────────────── /changelog
  │
  ├─ 품질
  │   ├─ 테스트 커버리지 ───────── /coverage
  │   ├─ 보안 스캔 ────────────── /security-review
  │   └─ 배포 전 감사 ─────────── /quality-auditor
  │
  └─ 중단 시 ──────────────────── /recover
```

### 에이전트 팀이 필요한가?

| 태스크 수 | 추천 | 코드 작성 | 에이전트 팀 |
|-----------|------|-----------|------------|
| ≤ 30 | `/agile auto` | Claude 직접 | 불필요 |
| 30-50 | `/orchestrate-standalone` | 전문가 에이전트 | 선택 |
| 50+ | `/orchestrate-standalone` | 전문가 에이전트 | 권장 |

---

## 프로젝트 구조

```
claude-imple-skills/
├── skills/                    # 18개 스킬
│   ├── workflow-guide/        # 메타 허브
│   ├── governance-setup/      # Phase 0 설정
│   ├── agile/                 # 레이어별 스프린트
│   ├── recover/               # 중단 후 재개
│   ├── quality-auditor/       # 배포 전 감사
│   ├── multi-ai-review/       # 컨센서스 리뷰
│   ├── security-review/       # 보안 스캔
│   ├── multi-ai-run/          # 병렬 실행
│   ├── orchestrate-standalone/# 대규모 오케스트레이션
│   ├── checkpoint/            # 진행 관리
│   ├── tasks-init/            # 태스크 생성
│   ├── tasks-migrate/         # 태스크 마이그레이션
│   ├── impact/                # 영향도 분석
│   ├── deps/                  # 의존성 그래프
│   ├── changelog/             # 변경 이력
│   ├── coverage/              # 테스트 커버리지
│   └── architecture/          # 아키텍처 맵
│
├── project-team/              # 에이전트 팀 시스템
│   ├── install.sh             # 설치 스크립트
│   ├── agents/                # 10개 에이전트 정의
│   ├── hooks/                 # 15개 자동 검증 훅
│   ├── skills/                # 5개 유지보수 스킬
│   ├── templates/             # 프로토콜, ADR, 계약
│   ├── examples/              # 샘플 프로젝트
│   └── docs/                  # 상세 가이드
│
├── scripts/                   # 설치 스크립트
│   ├── install-unix.sh
│   └── install-windows.ps1
│
└── README.md
```

---

## 설치

### 1단계: 스킬 설치

**macOS / Linux**
```bash
chmod +x ./scripts/install-unix.sh && ./scripts/install-unix.sh
```

**Windows (PowerShell)**
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
```

### 2단계: Project Team 설치 (선택)

대규모 프로젝트나 팀 협업 시:

```bash
cd project-team
./install.sh --global    # 모든 프로젝트에서 사용
./install.sh --local     # 프로젝트별 사용
```

모드 선택:
```bash
./install.sh --mode=lite      # 3 에이전트, 2 훅
./install.sh --mode=standard  # 7 에이전트, 4 게이트 (기본값)
./install.sh --mode=full      # 전체 에이전트, 전체 훅
```

---

## 요구사항

### 스킬용

| 스킬 | 요구사항 |
|------|----------|
| 모든 스킬 | Claude Code CLI |
| `/multi-ai-review` | `gemini` CLI, `codex` CLI (선택) |
| `/agile`, `/audit` | `playwright` MCP (선택, 브라우저 테스트용) |

### Project Team 훅용

- Node.js 18+ (훅 실행용)
- Git (worktree & changelog 기능용)

---

## 버전 히스토리

| 버전 | 날짜 | 변경사항 |
|------|------|----------|
| **v3.4.0** | 2026-03-03 | Long Context 최적화 (H2O, Compressive Context, RAG Hybrid) |
| v3.3.0 | 2026-03-03 | 18개 스킬, 10개 에이전트, 15개 훅. 독립형 아키텍처 |
| v3.2.0 | 2026-02-21 | Tmux 병렬 모드, Progressive Disclosure |
| v3.1.0 | 2026-02-11 | 거버넌스 설정, 워크플로우 연속성 |
| v3.0.0 | 2026-02-08 | Project Team 시스템 도입 |
| v2.0.0 | 2026-01-27 | MCP 의존성 제거 |

---

## Long Context 최적화

이 프로젝트는 컨텍스트 크기 증가에 따른 환각 및 정보 손실을 최소화하기 위한 고급 기법을 적용합니다.

### 적용된 기법

| 기법 | 목적 | 구현 |
|------|------|------|
| **H2O (Heavy-Hitter Oracle)** | 상단에 중요 정보 보존 | SKILL.md frontmatter, 에이전트 프롬프트 헤더 |
| **Compressive Context** | 오래된/덜 중요한 컨텐츠 요약 | 에이전트 Compressed Context 섹션 |
| **RAG Hybrid** | 검색 → 우선순위 → 압축 → 종합 | `project-team/services/contextOptimizer.js` |

### Context Optimizer 서비스

```bash
# 핵심 통찰 추출
node project-team/services/contextOptimizer.js optimize <file>

# 내용 압축
node project-team/services/contextOptimizer.js compress <file>

# RAG 하이브리드 쿼리 빌드
node project-team/services/contextOptimizer.js build "<query>" <files>
```

### MCP 서버

```json
{
  "mcpServers": {
    "context-optimizer": {
      "command": "node",
      "args": ["project-team/services/mcp-context-server.js", "serve"]
    }
  }
}
```

사용 가능한 MCP 도구:
- `compress_context` - H2O 패턴으로 컨텍스트 압축
- `extract_heavy_hitters` - 핵심 통찰 추출
- `build_optimized_prompt` - 최적화된 프롬프트 빌드

자세한 내용은 `docs/plan/long-context-optimization.md` 참조.

---

## 라이선스

MIT License - Copyright (c) 2026 Insightflo Team

---

**[English](./README.md) | [한국어](./README_ko.md)**
