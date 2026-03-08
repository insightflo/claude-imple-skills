# claude-imple-skills

> **Claude Code용 화이트박스 컨트롤 플레인** — AI 코딩의 실행, 차단 이유, 건강 상태를 파일 기반으로 관찰/설명/제어

[**English**](./README.md) | [**한국어**](./README_ko.md)

Claude Code로 소프트웨어를 개발할 때 필요한 **스킬**, **에이전트 팀**, **화이트박스 관찰 표면**을 제공합니다. canonical 이벤트 로그, 파생 상태 아티팩트, Ratatui 터미널 뷰어를 통해 AI 실행을 숨기지 않고 드러내며, 외부 서비스 없이 독립적으로 동작합니다.

---

## 빠른 시작

### 옵션 1: 원라인 설치 (git clone 불필요)

```bash
# 자동 다운로드 및 설치
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-imple-skills/main/scripts/quick-install.sh | bash
```

`~/.claude/claude-imple-skills/`에 설치되고 스킬이 `~/.claude/skills/`로 연결됩니다.

### 옵션 2: 수동 설치

```bash
# 저장소 복제
git clone https://github.com/insightflo/claude-imple-skills.git
cd claude-imple-skills

# 설치 (macOS/Linux)
chmod +x ./scripts/install-unix.sh && ./scripts/install-unix.sh

# 설치 (Windows PowerShell)
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1
```

### 선택사항: Project Team

대규모 프로젝트용 AI 에이전트 팀 배포:

```bash
cd claude-imple-skills/project-team
./install.sh --global
```

설치 후 화이트박스 MVP 규칙:
- LLM 실행은 구독형 CLI `claude`, `codex`, `gemini`만 지원
- `/whitebox status`, `/whitebox explain`, `/whitebox health`가 기본 점검 엔트리포인트
- TTY에서는 Ratatui 뷰어를, 리다이렉트/비-TTY에서는 ASCII fallback을 사용

---

## 제공 기능

| 구성요소 | 개수 | 용도 |
|----------|-------|------|
| **스킬** | 20개 | 작업 실행, 분석, 자동화 |
| **에이전트** | 6개 canonical 역할 | 모드 기반 토폴로지 (코어 + specialist) |
| **훅** | 모드별 4/7/17개 | lite에서 full까지 단계적 자동 검증 |
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
| `/whitebox` | 현재 run, blocker, CLI/auth, 파생 artifact 상태를 설명/점검 |

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
| `/orchestrate-standalone` | 50~200개 태스크를 전문가 에이전트로 실행 (`--mode=sprint`으로 Agile PI 계획 + 스프린트 리뷰 게이트) |
| `/multi-ai-run` | 병렬 AI 실행 관리 |

### 유지보수

| 스킬 | 기능 |
|------|------|
| `/impact` | 수정 전 영향도 분석 |
| `/deps` | 의존성 시각화 + 순환 참조 감지 |
| `/changelog` | 도메인별 변경 이력 조회 |
| `/coverage` | 테스트 커버리지 시각화 |
| `/architecture` | 프로젝트 구조 & 도메인 맵 |
| `/compress` | Long Context 최적화 (H2O 패턴) |
| `/statusline` | Claude Code 상태바에 TASKS 진행률과 whitebox blocker/run 힌트 표시 |
| `/task-board` | Ratatui 화이트박스 터미널 뷰어와 함께 칸반 보드 시각화 |

---

## Project Team

대규모 프로젝트를 위해 **AI 에이전트 팀**과 **자동 품질 게이트**를 배포하세요:

```
project-team/
├── agents/          # canonical 역할 + one-release compatibility alias
├── hooks/           # 모드별 검증기 (lite/standard/full)
├── scripts/         # 협업 & 충돌 해결
├── references/      # 통신 프로토콜 명세
├── skills/          # 5개 유지보수 도구
└── templates/       # 프로토콜 & 계약
```

### Canonical 역할

| 역할 | 책임 |
|------|------|
| **Lead** | 조율, 계획, 의사결정 책임 |
| **Builder** | 핵심 구현 및 전달 |
| **Reviewer** | 품질 게이트, 검증, 릴리즈 준비 |
| **Designer** | 디자인 시스템 일관성 |
| **DBA** | DB 스키마, 마이그레이션 |
| **Security Specialist** | 취약점 스캔 |

`ProjectManager`, `ChiefArchitect`, `QAManager`, `FrontendSpecialist`, `BackendSpecialist` 같은 legacy 이름은 **one-release compatibility alias**로만 제공되며, 기본 토폴로지가 아닙니다.

### 훅 (모드별, 최대 17개)

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
| **lite** | MVP, 스타트업 | `Lead/Builder/Reviewer` + baseline 훅 |
| **standard** | 일반적인 프로젝트 | `lite` + `Designer/DBA/Security Specialist` + 확장 훅 |
| **full** | 규제/고신뢰 환경 | `standard` + compatibility profile surface + 가장 넓은 훅 세트 |

자세한 내용은 `project-team/docs/MODES.md` 참조.

---

## 권장 워크플로우

```
시작
  │
  ├─ "뭐부터 해야 해?" ────────────── /workflow
  ├─ "왜 막혔어 / 지금 상태 뭐야?" ─── /whitebox status | /whitebox explain | /whitebox health
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

`/whitebox`는 관찰 + 의사결정 지원 + 제어를 묶는 터미널 제품 표면입니다:
- `/whitebox status` — 현재 run, pending approval, blocked/stale 상태 요약
- `/whitebox explain` — 왜 막혔는지와 approve/reject 같은 근거 기반 선택지
- `/whitebox approvals` — `list|show|approve|reject` canonical control CLI 경로
- `/whitebox health` — 구독형 CLI 인증/부착 상태 + artifact 무결성 점검

화이트박스는 다음 파일 기반 아티팩트를 읽습니다:
- canonical 로그: `.claude/collab/events.ndjson`
- canonical operator-intent 로그: `.claude/collab/control.ndjson`
- 파생 보드: `.claude/collab/board-state.json`
- 파생 control state: `.claude/collab/control-state.json`
- 파생 요약: `.claude/collab/whitebox-summary.json`
- stale marker: `.claude/collab/derived-meta.json`

신규 사용자 흐름:
1. `/orchestrate-standalone` 로 작업을 시작한다.
2. `/whitebox status` 로 paused gate 와 pending approval 을 본다.
3. `/whitebox explain` 로 근거와 선택지를 확인한다.
4. `/whitebox approvals list|show` 로 gate 를 조회한다.
5. `/whitebox approvals approve|reject --gate-id=...` 로 제어한다.
6. `/whitebox status` 또는 `/task-board` 로 resumed / blocked 상태를 다시 확인한다.

### 에이전트 팀이 필요한가?

| 태스크 수 | 추천 | 코드 작성 | 에이전트 팀 |
|-----------|------|-----------|------------|
| ≤ 30 | `/agile auto` | Claude 직접 | 불필요 |
| 30-80 | `/orchestrate-standalone` | 전문가 에이전트 | 선택 |
| 80-200 | `/orchestrate --mode=wave` | 도메인 병렬 에이전트 | 권장 |
| 200+ | 하위 프로젝트 분할 | 도메인 병렬 에이전트 | 필수 |

**v2.0 Hybrid Wave Architecture**: 80개 이상 태스크는 `--mode=wave`를 사용하세요. Contract-First + 도메인 병렬 + Cross-Review 게이트로 대규모에서도 일관성을 보장합니다.

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
│   ├── architecture/          # 아키텍처 맵
│   └── statusline/            # 상태바 TASKS.md 진행 표시
│
├── project-team/              # 에이전트 팀 시스템
│   ├── install.sh             # 설치 스크립트
│   ├── agents/                # canonical 역할 + one-release compatibility alias
│   ├── hooks/                 # 모드별 훅 (4/7/17)
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
./install.sh --mode=lite      # Lead/Builder/Reviewer + 4 baseline 훅
./install.sh --mode=standard  # lite + specialists + 7 훅 (기본값)
./install.sh --mode=full      # standard + compatibility profiles + 17 훅
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
