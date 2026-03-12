# Installation Guide

## Quick Install (One Command)

```bash
# Clone and install
git clone https://github.com/insightflo/claude-impl-tools.git
cd claude-impl-tools
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
- Project Team (에이전트 + 훅)
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
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-impl-tools/main/scripts/quick-install.sh | bash
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

Project Team은 10명의 전문 에이전트와 15개의 자동 검증 훅을 포함합니다.

### Capability Manifest and Closure Validation

`project-team/config/capability-manifest.json` is the canonical closure contract for Project Team install modes.

- It maps each documented capability to install mode coverage (`required`, `advisory`, `off`)
- It records the canonical writer, runtime artifact, validation command, and remediation source
- `node project-team/scripts/install-registry.js validate` checks `topology-registry.json` against that manifest instead of relying on duplicated hard-coded mode lists
- `node project-team/scripts/install-registry.js runtime-health <mode> <target-base> <global|local>` checks that the installed runtime artifacts for that mode are actually present and healthy

### 에이전트
- FrontendSpecialist (Gemini CLI)
- BackendSpecialist (Codex CLI)
- TestSpecialist, SecuritySpecialist, DevOpsSpecialist
- APIDesigner, DBA, QAManager
- ChiefArchitect, ProjectManager

### 훅 (Hook Modes)
- **lite**: 최소 필수 훅만 required
- **standard**: lite + quality/contract/impact 훅 required
- **full**: 모든 documented gate 훅 required, compatibility profiles restored

---

## Multi-AI Routing

태스크 유형별 최적 AI 모델 자동 선택:

| 작업 유형 | CLI | 모델 |
|----------|-----|------|
| 코드 작성/리뷰 | Codex | gpt-5.3-codex |
| 디자인/UI | Gemini | gemini-3.1-pro-preview |
| 기획/조율 | Claude | opus/sonnet |

### CLI 설치

```bash
# Gemini CLI
npm install -g @google/gemini-cli
gemini auth

# Codex CLI
npm install -g @openai/codex
codex auth
```

---

## Requirements

- **Claude Code CLI**: https://claude.ai/code
- **Node.js 18+**: 훅 실행용 (선택)
- **gum**: TUI용 (자동 설치)

## Verification Contract (Project-shaped)

품질 게이트 문서의 단일 검증 엔트리는 프로젝트 형태에 맞게 선언해야 합니다.

- Make 기반 프로젝트: `make verify` (`Makefile`에 `verify:` 타겟 필수)
- 비 Make 프로젝트: `bash scripts/verify_all.sh` (또는 동등한 단일 엔트리 명령)
- 모든 프로젝트에서 `make verify`를 기본값으로 가정하지 않습니다.

### Recovery and Run Evidence

- `node skills/recover/scripts/recover-status.js --json` prints canonical recovery precedence and resume options
- Whitebox lifecycle evidence is materialized as derived run reports under `.claude/collab/runs/<run-id>/report.json`
- `node project-team/scripts/doctor.js --project-dir . --json` aggregates install, runtime, whitebox, and recovery diagnostics in one report
- `node project-team/scripts/guidance-bundle.js build --project-dir . --json` builds a derived guidance bundle from canonical repo rules

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
│   ├── FrontendSpecialist.md
│   ├── BackendSpecialist.md
│   └── ...
├── hooks/                    # 자동 검증 훅
│   ├── permission-checker.js
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
cd claude-impl-tools
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

# 2. 워크플로우 가이드
> /workflow

# 3. 오케스트레이션 시작
> /orchestrate-standalone

# 4. 멀티 AI 리뷰
> /multi-ai-review
```
