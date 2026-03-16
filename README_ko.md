# claude-impl-tools

> **Claude Code용 구현 스킬 팩** — AI 에이전트 팀으로 소프트웨어 구축

[**English**](./README.md) | [**한국어**](./README_ko.md)

Claude Code로 소프트웨어를 개발할 때 도와주는 **스킬**과 **에이전트 팀** 모음입니다. 외부 의존성 없이 독립적으로 실행됩니다.

---

## 빠른 시작

### 옵션 1: 원라인 설치 (git clone 불필요)

```bash
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-impl-tools/main/scripts/quick-install.sh | bash
```

`~/.claude/claude-impl-tools/`에 설치되고 스킬이 `~/.claude/skills/`로 연결됩니다.

### 옵션 2: 수동 설치

```bash
git clone https://github.com/insightflo/claude-impl-tools.git
cd claude-impl-tools

# macOS/Linux
chmod +x ./scripts/install-unix.sh && ./scripts/install-unix.sh

# Windows PowerShell
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
|----------|------|------|
| **스킬** | 19개 | 작업 실행, 분석, 자동화 |
| **Agent Teams 리더** | 4개 | team-lead, architecture-lead, qa-lead, design-lead |
| **코어 워커 에이전트** | 4개 | builder, reviewer, designer, maintenance-analyst |
| **훅** | 19개 | 자동 검증, 게이트, 동기화, 거버넌스 |
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
| `/governance-setup` | 에이전트 팀 구조 설정 |
| `/tasks-init` | TASKS.md 처음부터 생성 (독립형) |
| `/tasks-migrate` | 기존 태스크 파일을 새 형식으로 변환 |

### 품질 & 보안

| 스킬 | 기능 |
|------|------|
| `/quality-auditor` | 배포 전 종합 감사 |
| `/security-review` | OWASP TOP 10, CVE, secrets 감지 |
| `/multi-ai-review` | 범용 멀티-AI 합의 엔진 (Claude + Gemini CLI + Codex CLI) — 코드 리뷰, 시황 레짐, 투자 심사, 리스크 평가 등 5개 도메인 자동 라우팅 |

### 자동화

| 스킬 | 기능 |
|------|------|
| `/team-orchestrate` | 네이티브 Agent Teams 오케스트레이션 — Plan Approval, 메일박스 통신, 전체 hook 적용 |
| `/multi-ai-run` | Claude/Gemini/Codex 자동 CLI 라우팅 기반 병렬 AI 실행 관리 |
| `/whitebox` | 실행 대시보드, health/state 확인, 개입형 control-plane 결정 처리 |

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

---

## Agent Teams

Claude Code 네이티브 **Agent Teams**를 사용한 계층적 에이전트 오케스트레이션:

```
team-lead (PM 리더)
├── architecture-lead (Teammate) → Task(builder) / Task(reviewer)
├── qa-lead (Teammate)           → Task(reviewer) / Task(test-specialist)
└── design-lead (Teammate)       → Task(designer) / Task(builder)

통신: Lead ↔ Teammates = 메일박스 (양방향)
위임: Teammate → Subagents = Task tool (단방향)
거버넌스: TeammateIdle hook + TaskCompleted hook
```

### Agent Teams 리더 (`.claude/agents/`)

| 에이전트 | 책임 |
|---------|------|
| **team-lead** | Plan Approval, 팀 형성, 충돌 중재 |
| **architecture-lead** | 아키텍처, API 설계, VETO 권한 |
| **qa-lead** | 품질 게이트, 테스트 전략, VETO 권한 |
| **design-lead** | 디자인 시스템, 시각적 일관성, VETO 권한 |

### 코어 워커 에이전트 (`project-team/agents/`)

| 에이전트 | 책임 |
|---------|------|
| **Builder** | 구현 실행 |
| **Reviewer** | 코드 리뷰 & QA |
| **Designer** | 디자인 전문가 |
| **Maintenance Analyst** | 프로덕션 영향도 분석 |

### 훅 (19개)

파일 수정 전후 자동 실행되는 검증:

| 카테고리 | 훅 |
|----------|-----|
| **권한** | `permission-checker`, `domain-boundary-enforcer` |
| **안전** | `pre-edit-impact-check`, `risk-area-warning`, `security-scan` |
| **품질** | `standards-validator`, `design-validator`, `interface-validator`, `quality-gate` |
| **게이트** | `policy-gate`, `contract-gate`, `risk-gate`, `docs-gate` |
| **동기화** | `architecture-updater`, `changelog-recorder`, `cross-domain-notifier`, `task-sync` |
| **Agent Teams** | `teammate-idle-gate`, `task-completed-gate` |

### 배포 모드

| 모드 | 사용 시기 | 구성요소 |
|------|-----------|----------|
| **Lite** | MVP, 스타트업 | 3 에이전트, 2 훅 |
| **Standard** | 일반적인 프로젝트 | 4 에이전트, 7 훅 |
| **Full** | 규제 산업 | 전체 에이전트, 전체 훅 |
| **Team** | Agent Teams 오케스트레이션 | 4 리더 + 워커, 거버넌스 훅 |

자세한 내용은 `project-team/docs/MODES.md` 참조.

### Agent Teams 활성화

Agent Teams는 실험적 기능 플래그가 필요합니다. `--mode=team`으로 설치하면 자동 설정됩니다:

```bash
cd project-team
./install.sh --local --mode=team
```

이 명령은 `.claude/settings.json`에 다음을 추가합니다:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "hooks": {
    "TeammateIdle": [...],
    "TaskCompleted": [...]
  }
}
```

또는 `.claude/settings.json`이나 `.claude/settings.local.json`에 직접 추가:
```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
}
```

에이전트 정의 파일 (`.claude/agents/team-lead.md`, `architecture-lead.md`, `qa-lead.md`, `design-lead.md`)은 저장소에 포함되어 있으며, 플래그 설정 시 자동 활성화됩니다.

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
  │   └─ 중대규모 (30+) ────────── /team-orchestrate
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
| 30+ | `/team-orchestrate` | Agent Teams + Plan Approval | 필요 |

---

## 프로젝트 구조

```
claude-impl-tools/
├── skills/                    # 19개 스킬
│   ├── workflow-guide/        # 메타 허브
│   ├── governance-setup/      # Phase 0 설정
│   ├── agile/                 # 레이어별 스프린트
│   ├── recover/               # 중단 후 재개
│   ├── quality-auditor/       # 배포 전 감사
│   ├── multi-ai-review/       # 범용 합의 엔진
│   ├── security-review/       # 보안 스캔
│   ├── multi-ai-run/          # 병렬 실행
│   ├── team-orchestrate/      # Agent Teams 오케스트레이션
│   ├── checkpoint/            # 진행 관리
│   ├── tasks-init/            # 태스크 생성
│   ├── tasks-migrate/         # 태스크 마이그레이션
│   ├── impact/                # 영향도 분석
│   ├── deps/                  # 의존성 그래프
│   ├── changelog/             # 변경 이력
│   ├── coverage/              # 테스트 커버리지
│   ├── architecture/          # 아키텍처 맵
│   ├── whitebox/              # 실행 상태 점검
│   └── statusline/            # 상태바 진행 표시
│
├── project-team/              # 에이전트 팀 시스템
│   ├── install.sh             # 설치 스크립트
│   ├── agents/                # 코어 워커 에이전트
│   ├── hooks/                 # 20개 검증 및 거버넌스 훅
│   ├── scripts/               # 협업 & 충돌 해결
│   ├── references/            # 통신 프로토콜
│   ├── templates/             # 프로토콜, ADR, 계약
│   ├── examples/              # 샘플 프로젝트
│   └── docs/                  # 상세 가이드
│
├── .claude/agents/            # Agent Teams 리더 (team-lead, architecture-lead, qa-lead, design-lead)
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
./install.sh --mode=standard  # 4 에이전트, 7 훅 (기본값)
./install.sh --mode=full      # 전체 에이전트, 전체 훅
./install.sh --mode=team      # Agent Teams + 거버넌스 훅
```

---

## 요구사항

### 스킬용

| 스킬 | 요구사항 |
|------|----------|
| 모든 스킬 | Claude Code CLI |
| `/multi-ai-review` | `gemini` CLI, `codex` CLI (선택) — 5개 도메인 프리셋 |
| `/agile`, `/audit` | `playwright` MCP (선택, 브라우저 테스트용) |

### Project Team 훅용

- Node.js 18+ (훅 실행용)
- Git (worktree & changelog 기능용)

---

## 버전 히스토리

| 버전 | 날짜 | 변경사항 |
|------|------|----------|
| **v4.0.0** | 2026-03-16 | Agent Teams 계층 (team-lead + 3 도메인 리더), 네이티브 Agent Teams 오케스트레이션, TeammateIdle/TaskCompleted 훅, orchestrate-standalone 제거 |
| v3.8.0 | 2026-03-05 | Task Board 스킬, 칸반 시각화, task-board-sync 훅 |
| v3.7.0 | 2026-03-05 | Agile Sprint Mode, REQ/DEC 프로토콜 |
| v3.6.0 | 2026-03-03 | Hybrid Wave Architecture |
| v3.5.0 | 2026-03-03 | Context Optimize 스킬 |
| v3.3.0 | 2026-03-03 | 독립형 아키텍처 |
| v3.0.0 | 2026-02-08 | Project Team 시스템 도입 |
| v2.0.0 | 2026-01-27 | MCP 의존성 제거 |

---

## Long Context 최적화

컨텍스트 크기 증가에 따른 환각 및 정보 손실을 최소화하기 위한 기법:

| 기법 | 목적 | 구현 |
|------|------|------|
| **H2O (Heavy-Hitter Oracle)** | 상단에 중요 정보 보존 | SKILL.md frontmatter, 에이전트 프롬프트 헤더 |
| **Compressive Context** | 오래된/덜 중요한 컨텐츠 요약 | 에이전트 Compressed Context 섹션 |
| **RAG Hybrid** | 검색 → 우선순위 → 압축 → 종합 | `project-team/services/contextOptimizer.js` |

---

## 라이선스

MIT License - Copyright (c) 2026 Insightflo Team

---

**[English](./README.md) | [한국어](./README_ko.md)**
