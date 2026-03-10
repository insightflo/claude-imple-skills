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

### 에이전트
- FrontendSpecialist (Gemini CLI)
- BackendSpecialist (Codex CLI)
- TestSpecialist, SecuritySpecialist, DevOpsSpecialist
- APIDesigner, DBA, QAManager
- ChiefArchitect, ProjectManager

### 훅 (Hook Modes)
- **lite**: 에이전트만 (훅 없음)
- **standard**: 권한 체크 훅
- **full**: 모든 검증 훅

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
