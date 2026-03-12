# claude-impl-tools

> **Claude Code용 구현 스킬 팩** — AI 에이전트 팀으로 소프트웨어 구축

[**English**](./README.md) | [**한국어**](./README_ko.md)

Claude Code로 소프트웨어를 개발할 때 도와주는 **스킬**과 **에이전트 팀** 모음입니다. 외부 의존성 없이 독립적으로 실행됩니다.

---

## 빠른 시작

### 옵션 1: 원라인 설치 (git clone 불필요)

```bash
# 자동 다운로드 및 설치
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-impl-tools/main/scripts/quick-install.sh | bash
```

`~/.claude/claude-impl-tools/`에 설치되고 스킬이 `~/.claude/skills/`로 연결됩니다.

### 옵션 2: 수동 설치

```bash
# 저장소 복제
git clone https://github.com/insightflo/claude-impl-tools.git
cd claude-impl-tools

# 설치 (macOS/Linux)
chmod +x ./scripts/install-unix.sh && ./scripts/install-unix.sh

# 설치 (Windows PowerShell)
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
```

### 선택사항: Project Team

대규모 프로젝트용 AI 에이전트 팀 배포:

```bash
cd claude-impl-tools/project-team
./install.sh --global
```

---

## 제공 기능

| 구성요소 | 개수 | 용도 |
|----------|-------|------|
| **스킬** | 21개 | 작업 실행, 분석, 자동화 |
| **에이전트** | 13개 | canonical role + compatibility alias 구성 |
| **훅** | 18개 | 자동 검증, 게이트, 동기화, helper 체크 |
| **템플릿** | 11개 | Project Team 프로토콜, ADR, 계약, 표준 |

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
| `/orchestrate-standalone` | 50~200개 태스크를 전문가 에이전트로 실행하고 whitebox 대시보드를 자동으로 surfacing (`--mode=sprint`으로 Agile PI 계획 + 스프린트 리뷰 게이트) |
| `/multi-ai-run` | Claude/Gemini/Codex 기본 정책을 따르는 자동 CLI 라우팅 기반 병렬 AI 실행 관리 |
| `/whitebox` | 보이는 실행 대시보드를 열고, health/state를 확인하며, 개입형 control-plane 결정을 처리 |

### 유지보수

| 스킬 | 기능 |
|------|------|
| `/impact` | 수정 전 영향도 분석 |
| `/deps` | 의존성 시각화 + 순환 참조 감지 |
| `/changelog` | 도메인별 변경 이력 조회 |
| `/coverage` | 테스트 커버리지 시각화 |
| `/architecture` | 프로젝트 구조 & 도메인 맵 |
| `/compress` | Long Context 최적화 (H2O 패턴) |
| `/statusline` | Claude Code 상태바에 TASKS.md 진행 상황 표시 |
| `/task-board` | 브라우저 surfacing이 불가능할 때 사용하는 whitebox fallback 칸반/개입 렌더러 |

---

## Project Team

대규모 프로젝트를 위해 **AI 에이전트 팀**과 **자동 품질 게이트**를 배포하세요:

```
project-team/
├── agents/          # 13개 역할 정의와 alias
├── hooks/           # 18개 검증 및 helper 훅
├── scripts/         # 협업 & 충돌 해결
├── references/      # 통신 프로토콜 명세
├── skills/          # 5개 유지보수 도구
└── templates/       # 프로토콜 & 계약
```

### 에이전트 (13명)

| 역할 | 책임 |
|------|------|
| **Lead** | canonical coordination role |
| **Builder** | canonical implementation role |
| **Reviewer** | canonical review role |
| **Designer** | canonical design specialist |
| **DBA** | canonical data specialist |
| **Security Specialist** | canonical security specialist |
| **Project Manager** | coordination workflow용 compatibility alias |
| **Chief Architect** | architecture workflow용 compatibility alias |
| **Chief Designer** | design workflow용 compatibility alias |
| **QA Manager** | review/QA workflow용 compatibility alias |
| **Frontend Specialist** | frontend execution용 compatibility alias |
| **Backend Specialist** | backend execution용 compatibility alias |
| **Maintenance Analyst** | production impact workflow용 compatibility alias |

### 훅 (18개)

파일 수정 전후 자동 실행되는 검증:

| 카테고리 | 훅 |
|----------|-----|
| **권한** | `permission-checker`, `domain-boundary-enforcer` |
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

자세한 내용은 `project-team/docs/INSTALLATION.md#hook-modes` 참조.

### 현재 `main`에서 바뀐 점

- `--mode=wave`가 실제 worker pool 경로를 사용하고, `.claude/wave-plan.json`을 생성하며, 대규모 프로젝트 기본값으로 6-worker profile을 사용합니다.
- 이제 `orchestrate`와 `whitebox status`는 로컬 웹 대시보드를 자동으로 열며, 브라우저 자동 열기를 끄려면 `WHITEBOX_AUTO_OPEN_BROWSER=0`, 터미널 fallback까지 끄려면 `WHITEBOX_AUTO_OPEN_TUI=0`을 사용합니다.
- whitebox approval 흐름은 이제 `user_confirmation`, `agent_conflict`, `risk_acknowledgement` 같은 typed intervention trigger를 explain/status/task-board 전반에 표시합니다.
- escalated REQ conflict는 이제 whitebox explain, task-board, TUI detail pane 에서 연결된 `DEC-*` ruling metadata까지 함께 표시합니다.
- `ESCALATED` REQ에 대한 `FINAL` DEC가 기록되면, 별도 수동 동기화 없이 canonical hook/event 경로를 통해 해당 REQ를 자동으로 `RESOLVED`로 전환합니다.
- layer 실패 시 failed task ID를 출력하고, 같은 layer의 sibling 작업도 취소하며, 조용히 계속 진행하지 않습니다.
- worker CLI 라우팅 기본 순서는 `task.model` -> agent `cli_command` -> project/global `model-routing.yaml` -> heuristic -> Claude fallback 이며, 일반적인 agent 역할은 사용자가 실행기를 직접 지정하지 않아도 됩니다.
- Project Team 설치 경로는 이제 `policy-gate`, `permission-checker`가 요구하는 hook support library도 함께 설치합니다.
- whitebox approval/deny lifecycle은 이제 `.claude/collab/runs/<run-id>/report.json`에 derived immutable run report를 남깁니다.
- `/recover`는 이제 `node skills/recover/scripts/recover-status.js --json`를 통해 canonical runtime state 우선 복구 상태를 확인할 수 있습니다.

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
| 30-80 | `/orchestrate-standalone` | 전문가 에이전트 | 선택 |
| 80-200 | `/orchestrate --mode=wave` | 대규모 실행용 wave profile | 권장 |
| 200+ | 하위 프로젝트 분할 | 도메인 병렬 에이전트 | 필수 |

**Wave mode (current CLI)**: 80개 이상 태스크는 `--mode=wave`를 사용하세요. 현재 공개 CLI는 whitebox board surfacing, typed intervention trigger, agent conflict용 linked DEC detail, 6-worker 기본값을 제공합니다.

### 검증된 실행 흐름

현재 `main` 기준으로 아래 흐름을 실제로 검증했습니다.

| 프로젝트 규모 | 권장 흐름 |
|--------------|-----------|
| Small (<=30 tasks) | `/agile auto` |
| Medium (30-80 tasks) | `/workflow` -> `/governance-setup` -> `project-team/install.sh --mode=standard` -> `/orchestrate-standalone --mode=standard` |
| Large (80+ tasks) | `/workflow` -> `/governance-setup` -> `project-team/install.sh --mode=standard` -> `/orchestrate-standalone --mode=wave` |
| Failure-path verification | installed `--mode=wave` 실행 + deterministic task failure -> fail-fast + downstream block 확인 |

설치 후 closure 검증은 아래 명령을 사용합니다:

- `node project-team/scripts/install-registry.js validate`
- `node project-team/scripts/install-registry.js runtime-health standard ~/.claude global`
- `node skills/recover/scripts/recover-status.js --json`

---

## 프로젝트 구조

```
claude-impl-tools/
├── skills/                    # 21개 스킬
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
│   ├── architecture/          # 아키텍처 맵
│   ├── whitebox/              # 실행 상태 점검 및 요약
│   └── statusline/            # 상태바 TASKS.md 진행 표시
│
├── project-team/              # 에이전트 팀 시스템
│   ├── install.sh             # 설치 스크립트
│   ├── agents/                # 13개 역할 정의와 alias
│   ├── hooks/                 # 18개 검증 및 helper 훅
│   ├── scripts/               # 협업 & 충돌 해결 스크립트
│   ├── references/            # 통신 프로토콜 & 명세
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
| **v3.8.0** | 2026-03-05 | Task Board 스킬 (`/task-board`), 칸반 시각화, task-board-sync 훅, board-state.json 인프라 |
| v3.7.0 | 2026-03-05 | Agile Sprint Mode (`--mode=sprint`), multi-ai-review 좀비 프로세스 수정, 계층형 에이전트 협업 버스 (REQ/DEC 프로토콜, domain-boundary-enforcer, Wave Barrier 스캐너) |
| v3.6.0 | 2026-03-03 | Hybrid Wave Architecture (80-200개 태스크용 `/orchestrate --mode=wave`), Contract-First 템플릿 |
| v3.5.0 | 2026-03-03 | Context Optimize 스킬 (`/compress`), install.sh 수정, 18개 스킬, 9개 에이전트, 16개 훅 |
| v3.4.0 | 2026-03-03 | Long Context 최적화 (H2O, Compressive Context, RAG Hybrid) |
| v3.3.0 | 2026-03-03 | 독립형 아키텍처 |
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
