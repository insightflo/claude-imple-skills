# 설치 가이드

## 방법 1: 플러그인 (권장)

### 1단계: Marketplace 등록

`~/.claude/settings.json`에 추가:

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

### 2단계: 플러그인 설치

```
/plugin install claude-impl-tools@insightflo
```

완료. 21개 스킬이 모든 프로젝트에서 사용 가능합니다.

### 3단계: Agent Teams (선택)

`/team-orchestrate` 실행 시 훅과 에이전트가 현재 프로젝트에 자동 설치됩니다. 수동 설치:

```bash
bash ~/.claude/plugins/cache/insightflo/claude-impl-tools/*/project-team/install.sh --local --mode=team
```

---

## 방법 2: 빠른 설치 (플러그인 없이)

```bash
curl -fsSL https://raw.githubusercontent.com/insightflo/claude-impl-tools/main/scripts/quick-install.sh | bash
```

`~/.claude/claude-impl-tools/`에 clone하고 스킬 심링크 생성. 훅/에이전트는 스킬이 필요할 때 자동 설치.

---

## 방법 3: 수동 Clone

```bash
git clone https://github.com/insightflo/claude-impl-tools.git ~/.claude/claude-impl-tools
```

스킬 심링크:
```bash
for skill in ~/.claude/claude-impl-tools/skills/*/; do
  ln -sf "$skill" ~/.claude/skills/$(basename "$skill")
done
```

---

## 프로젝트 레벨 설정 (필요 시)

`/team-orchestrate` 같은 스킬이 필요할 때 자동으로 프로젝트 레벨 리소스를 설치합니다. 수동 설치:

```bash
cd your-project

# Team 모드 (Agent Teams + tmux + 거버넌스 훅)
bash ~/.claude/claude-impl-tools/project-team/install.sh --local --mode=team

# 기타 모드
bash ~/.claude/claude-impl-tools/project-team/install.sh --local --mode=lite
bash ~/.claude/claude-impl-tools/project-team/install.sh --local --mode=standard
bash ~/.claude/claude-impl-tools/project-team/install.sh --local --mode=full
```

---

## 요구사항

- **Claude Code CLI**: https://claude.ai/code
- **Node.js 18+**: 훅 실행용 (선택)
- **tmux**: Agent Teams pane 자동 생성용 (선택)

---

## 업데이트

### 플러그인
```
/plugin update claude-impl-tools@insightflo
```

### 빠른 설치
```bash
cd ~/.claude/claude-impl-tools && git pull
```

---

## 제거

### 플러그인
```
/plugin uninstall claude-impl-tools@insightflo
```

### 빠른 설치
```bash
# 스킬 심링크 제거
for skill in agile architecture changelog checkpoint context-optimize coverage deps governance-setup impact maintenance multi-ai-review multi-ai-run quality-auditor recover security-review statusline tasks-init tasks-migrate team-orchestrate whitebox workflow-guide; do
  rm -f ~/.claude/skills/$skill
done

# Clone 제거
rm -rf ~/.claude/claude-impl-tools
```

### 프로젝트 레벨 훅 제거
```bash
cd your-project
bash ~/.claude/claude-impl-tools/project-team/install.sh --local --uninstall
```

---

## 빠른 시작

```bash
claude

> /workflow          # 다음 뭐 해야 해?
> /team-orchestrate  # 에이전트 팀 시작
> /multi-ai-review   # 멀티 AI 합의 리뷰
```

---

**[English version](./INSTALL.md)**
