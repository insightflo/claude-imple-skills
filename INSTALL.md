# Installation Guide

## Quick Install (One Command)

```bash
# Clone and install
git clone https://github.com/insightflo/claude-imple-skills.git
cd claude-imple-skills
./install.sh
```

## Installation Methods

### 1. Interactive TUI (Recommended)

```bash
./install.sh
```

TUI 모드로 다음을 선택할 수 있습니다:
- 설치 위치 (전역/프로젝트)
- 스킬 카테고리
- Project Team 토폴로지 (Lite/Standard/Full)
- Multi-AI 라우팅 설정

### 2. Non-Interactive

```bash
# 전역 설치 (Core 스킬 + Project Team)
./install.sh --global

# 프로젝트 설치
./install.sh --local

# 모든 스킬 전역 설치
./install.sh --all
```

### 3. Remote Install (No Git Clone)

```bash
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-imple-skills/main/scripts/quick-install.sh | bash
```

---

## Skill Categories

| Category | Skills | Description |
|----------|--------|-------------|
| **Core** | multi-ai-run, multi-ai-review, orchestrate-standalone | 필수 오케스트레이션 |
| **Orchestration** | agile, governance-setup, workflow-guide | 프로젝트 관리 |
| **Quality** | checkpoint, quality-auditor, security-review | 품질 검증 |
| **Analysis** | architecture, deps, impact, changelog, coverage | 코드베이스 분석 |
| **Tasks** | tasks-init, tasks-migrate, recover, context-optimize | 태스크 관리 |

---

## Project Team

Project Team은 canonical registry를 기준으로 설치됩니다.

### Canonical Roles
- **Lite baseline**: Lead, Builder, Reviewer
- **Standard add-ons**: Designer, DBA, Security Specialist
- canonical 역할 정의는 `project-team/agents/Lead.md`, `project-team/agents/Builder.md`, `project-team/agents/Reviewer.md`를 기준으로 동작

### Hook Modes
- **lite**: canonical baseline (`Lead/Builder/Reviewer`) + 기본 훅 세트
- **standard**: lite + specialists (`Designer/DBA/Security Specialist`) + 확장 검증 훅
- **full**: standard + compatibility profile surfaces + 가장 넓은 훅 세트

### Compatibility Aliases (One Release)
- `ProjectManager`, `ChiefArchitect`, `FrontendSpecialist`, `BackendSpecialist` 등 legacy 이름은 **one-release compatibility alias/stub**로만 유지됩니다.
- alias는 연속성 보조용이며 primary 설치 모델은 canonical role topology입니다.

---

## Multi-AI Routing

태스크 유형별 최적 AI 모델 자동 선택:

| 작업 유형 | CLI | 모델 |
|----------|-----|------|
| 코드 작성/리뷰 | Codex | gpt-5.3-codex |
| 디자인/UI | Gemini | gemini-3.1-pro-preview |
| 기획/조율 | Claude | opus/sonnet |

### Whitebox Governance Policy (MVP)

- `subscription-only` 실행 모델만 지원: `claude`, `codex`, `gemini`
- CLI 구독 기반으로만 동작하며 **추가 API 비용 없음**
- API-key-first provider API integration은 MVP 범위 밖(명시적 out-of-scope)
- Claude는 인증 probing 없이 `CLAUDECODE`로 호스트 부착 상태만 확인
- `CLAUDECODE`가 없으면 상태는 `host_not_attached`
- TTY에서는 Ratatui 기반 `/task-board` / `/whitebox status` 표면을 사용하고, 비-TTY에서는 ASCII fallback을 사용

### CLI 설치

```bash
# Gemini CLI
npm install -g @google/gemini-cli
gemini auth
gemini auth status

# Codex CLI
npm install -g @openai/codex
codex auth
codex auth status
```

### 정책 점검

```bash
node project-team/scripts/subscription-policy-check.js --json
```

JSON 결과에서 executor별 상태(`missing_cli`, `missing_auth`, `host_not_attached`, `ok`)와 `forbidden_integration` 감지를 확인합니다.

### Whitebox Quick Checks

```bash
# 현재 상태/차단 이유/CLI 건강 상태 확인
node skills/whitebox/scripts/whitebox-status.js --project-dir=. --json
node skills/whitebox/scripts/whitebox-explain.js --task-id=T0.1 --project-dir=. --json
node skills/whitebox/scripts/whitebox-health.js --project-dir=. --json

# pending approval 조회 및 제어
node skills/whitebox/scripts/whitebox-control.js list --project-dir=. --json
node skills/whitebox/scripts/whitebox-control.js show --project-dir=. --gate-id=<gate-id> --json
node skills/whitebox/scripts/whitebox-control.js approve --project-dir=. --gate-id=<gate-id> --json
node skills/whitebox/scripts/whitebox-control.js reject --project-dir=. --gate-id=<gate-id> --json
```

화이트박스 아티팩트는 모두 `.claude/collab/` 아래에 생성됩니다:
- `events.ndjson` - canonical append-only log
- `control.ndjson` - canonical operator-intent log
- `board-state.json` - 파생 board view
- `control-state.json` - 파생 control query state
- `whitebox-summary.json` - 빠른 status/health summary
- `derived-meta.json` - stale derived artifact markers

---

## Requirements

- **Claude Code CLI**: https://claude.ai/code
- **Node.js 18+**: 훅 실행용 (선택)
- **gum**: TUI용 (자동 설치)

---

## Directory Structure

설치 후 구조:

```
~/.claude/                    # 전역 설치 시
├── skills/                   # 스킬들
│   ├── multi-ai-run/
│   ├── multi-ai-review/
│   ├── orchestrate-standalone/
│   └── ...
├── agents/                   # Project Team 에이전트
│   ├── Lead.md
│   ├── Builder.md
│   ├── Reviewer.md
│   ├── Designer.md
│   ├── DBA.md
│   ├── SecuritySpecialist.md
│   ├── ProjectManager.md      # one-release compatibility alias
│   ├── ChiefArchitect.md      # one-release compatibility alias
│   └── ...
├── hooks/                    # 자동 검증 훅
│   ├── permission-checker.js
│   ├── policy-gate.js
│   ├── security-scan.js
│   └── ...
├── templates/                # 템플릿
│   ├── project-team.yaml
│   └── model-routing.yaml
├── routing.config.yaml       # CLI 모델 설정
└── settings.json             # 훅 설정
```

---

## Update

```bash
cd claude-imple-skills
git pull
./install.sh
```

---

## Uninstall

```bash
# 스킬 제거
rm -rf ~/.claude/skills/{multi-ai-run,multi-ai-review,orchestrate-standalone,...}

# Project Team 제거
rm -rf ~/.claude/agents ~/.claude/hooks ~/.claude/templates

# 전체 제거
rm -rf ~/.claude/skills ~/.claude/agents ~/.claude/hooks ~/.claude/templates
```

---

## Quick Start

```bash
# 1. Claude Code 실행
claude

# 2. 구현 오케스트레이션 시작
> /orchestrate-standalone

# 3. 화이트박스 상태/선택지 확인
> /whitebox status
> /whitebox explain

# 4. pending approval 조회 및 승인/거절
> /whitebox approvals list
> /whitebox approvals approve --gate-id=<gate-id>

# 5. 멀티 AI 리뷰
> /multi-ai-review
```
