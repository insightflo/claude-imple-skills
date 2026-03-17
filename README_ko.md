# claude-impl-tools

> **Claude Code용 구현 스킬 팩** — AI 에이전트 팀으로 소프트웨어 구축

[**English**](./README.md) | [**한국어**](./README_ko.md)

Claude Code용 **21개 스킬** 플러그인. 스킬 실행 시 프로젝트 레벨 훅과 에이전트를 자동 설치합니다 — 수동 설정 불필요.

---

## 빠른 시작

### 옵션 1: 플러그인 설치 (권장)

`~/.claude/settings.json`에 marketplace 추가:

```json
{
  "extraKnownMarketplaces": {
    "insightflo": {
      "source": {
        "source": "github",
        "repo": "insightflo/claude-impl-tools"
      }
    }
  }
}
```

설치:

```
/plugin install claude-impl-tools@insightflo
```

### 옵션 2: 빠른 설치 (플러그인 없이)

```bash
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-impl-tools/main/scripts/quick-install.sh | bash
```

레포 clone + 스킬 심링크만 설치. 훅/에이전트는 스킬 실행 시 자동 설치.

---

## 제공 기능

| 구성요소 | 개수 | 설치 시점 |
|----------|------|-----------|
| **스킬** | 21개 | 플러그인 설치 시 |
| **훅** | 최대 17개 | 필요 시 (스킬이 `install.sh --local` 실행) |
| **워커 에이전트** | 4개 | 필요 시 (프로젝트 레벨) |
| **템플릿** | 11개 | 필요 시 (프로젝트 레벨) |

---

## 스킬

### 핵심 워크플로우

| 스킬 | 기능 |
|------|------|
| `/workflow` | **메타 허브** — 현재 상태 분석 후 다음 스킬 추천 |
| `/agile` | 레이어별 스프린트 (Skeleton → Muscles → Skin), 1~30개 태스크 |
| `/recover` | 중단 후 작업 재개 |
| `/checkpoint` | 진행 상태 저장/복원 |

### 프로젝트 초기화

| 스킬 | 기능 |
|------|------|
| `/governance-setup` | 거버넌스 구조 설정 |
| `/tasks-init` | TASKS.md 처음부터 생성 |
| `/tasks-migrate` | 기존 태스크 파일을 새 형식으로 변환 |

### 품질 & 보안

| 스킬 | 기능 |
|------|------|
| `/quality-auditor` | 배포 전 종합 감사 |
| `/security-review` | OWASP TOP 10, CVE, secrets 감지 |
| `/multi-ai-review` | 범용 멀티-AI 합의 엔진 (v4.1) — Claude + Gemini CLI + Codex CLI |

### 자동화

| 스킬 | 기능 |
|------|------|
| `/team-orchestrate` | 네이티브 Agent Teams 오케스트레이션 — tmux pane 자동 생성 |
| `/multi-ai-run` | Claude/Gemini/Codex 자동 CLI 라우팅 병렬 실행 |
| `/whitebox` | 실행 대시보드, health/state 확인 |

### 유지보수

| 스킬 | 기능 |
|------|------|
| `/maintenance` | ITIL 5단계 프로덕션 유지보수 오케스트레이터 |
| `/impact` | 수정 전 영향도 분석 |
| `/deps` | 의존성 시각화 + 순환 참조 감지 |
| `/changelog` | 도메인별 변경 이력 조회 |
| `/coverage` | 테스트 커버리지 시각화 |
| `/architecture` | 프로젝트 구조 & 도메인 맵 |
| `/compress` | Long Context 최적화 (H2O 패턴) |
| `/statusline` | Claude Code 상태바에 TASKS.md 진행 상황 표시 |

---

## Agent Teams

Claude Code 네이티브 **Agent Teams** + `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` + tmux 자동 pane 생성.

```
현재 Claude 세션 (= team lead)
├── architecture-lead    ← tmux pane
│     ├── backend-builder
│     └── reviewer
├── design-lead          ← tmux pane
│     ├── frontend-builder
│     └── designer
└── qa-lead              ← tmux pane
```

### 작동 방식

1. `TASKS.md`가 있는 프로젝트에서 `/team-orchestrate` 실행
2. 사전조건 확인 → 훅/에이전트 없으면 **자동 로컬 설치**
3. tmux pane에 에이전트 자동 생성 (`teammateMode: "tmux"`)
4. 공유 태스크 목록 + 메일박스로 에이전트 간 통신

### Agent Teams 활성화

프로젝트 루트에서 `install.sh --local --mode=team` 실행하거나, `/team-orchestrate`가 자동 처리:

```bash
bash project-team/install.sh --local --mode=team
```

프로젝트 `.claude/settings.json`에 추가됨:
```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" },
  "preferences": { "teammateMode": "tmux" }
}
```

### 프로젝트 레벨 훅 (필요 시 설치)

| 카테고리 | 훅 |
|----------|-----|
| **권한** | `permission-checker`, `domain-boundary-enforcer` |
| **안전** | `pre-edit-impact-check`, `risk-area-warning`, `security-scan` |
| **품질** | `standards-validator`, `design-validator`, `interface-validator`, `quality-gate` |
| **게이트** | `policy-gate`, `contract-gate`, `risk-gate`, `docs-gate` |
| **동기화** | `architecture-updater`, `changelog-recorder`, `cross-domain-notifier`, `task-sync` |

### 훅 모드

| 모드 | 훅 수 | 사용 시기 |
|------|-------|-----------|
| **lite** | 4개 | MVP, 스타트업 |
| **standard** | 7개 | 일반 프로젝트 |
| **full** | 17개 | 규제 산업 |
| **team** | 8개 + Agent Teams 훅 | 팀 오케스트레이션 |

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
  │   ├─ 수정 전 영향도 ────────── /impact
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

---

## 프로젝트 구조

```
claude-impl-tools/
├── .claude-plugin/
│   └── plugin.json             # 플러그인 매니페스트
├── skills/                     # 21개 스킬 (자동 발견)
│   ├── team-orchestrate/
│   ├── multi-ai-review/
│   ├── agile/
│   └── ...
├── project-team/               # 필요 시 프로젝트 설정
│   ├── install.sh              # 로컬 설치 (훅, 에이전트, 템플릿)
│   ├── agents/                 # 워커 에이전트
│   ├── hooks/                  # 검증 & 거버넌스 훅
│   ├── templates/              # 프로토콜, ADR, 계약
│   └── scripts/                # 협업 스크립트
└── scripts/
    └── quick-install.sh        # 대체 설치 (clone + 심링크)
```

---

## 요구사항

| 구성요소 | 요구사항 |
|----------|----------|
| 모든 스킬 | Claude Code CLI |
| `/multi-ai-review` | `gemini` CLI, `codex` CLI (선택) |
| Project Team 훅 | Node.js 18+ |
| Agent Teams + tmux | tmux, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |

---

## 라이선스

MIT License - Copyright (c) 2026 Insightflo Team

---

**[English](./README.md) | [한국어](./README_ko.md)**
