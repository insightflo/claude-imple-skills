#!/bin/bash
#
# Claude Imple Skills - Unified Installer
# TUI-based interactive installer using gum
#
# Usage:
#   ./install.sh              # Interactive TUI mode
#   ./install.sh --global     # Direct global install
#   ./install.sh --local      # Direct local install
#   ./install.sh --all        # Install all categories

set -e

VERSION="3.6.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLOBAL_CLAUDE_DIR="$HOME/.claude"
LOCAL_CLAUDE_DIR="./.claude"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

check_gum() {
    if ! command -v gum &> /dev/null; then
        echo -e "${YELLOW}gum이 설치되어 있지 않습니다. 설치를 진행합니다...${NC}"

        if command -v brew &> /dev/null; then
            brew install gum
        elif command -v apt-get &> /dev/null; then
            sudo mkdir -p /etc/apt/keyrings
            curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg
            echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" | sudo tee /etc/apt/sources.list.d/charm.list
            sudo apt update && sudo apt install gum
        else
            echo -e "${RED}gum을 자동으로 설치할 수 없습니다.${NC}"
            echo "https://github.com/charmbracelet/gum#installation 참조"
            echo ""
            echo "또는 --global 또는 --local 플래그로 비대화 모드 실행:"
            echo "  ./install.sh --global --all"
            exit 1
        fi
    fi
}

print_banner() {
    gum style \
        --foreground 212 --border-foreground 212 --border double \
        --align center --width 60 --margin "1 2" --padding "1 2" \
        "Claude Imple Skills v$VERSION" \
        "" \
        "AI 에이전트 팀으로 소프트웨어를 구축하는 구현 스킬팩"
}

# ============================================================================
# Installation Steps
# ============================================================================

select_install_scope() {
    echo ""
    gum style --foreground 39 "Step 1: 설치 위치 선택"

    SCOPE=$(gum choose --cursor.foreground 212 \
        "전역 설치 (~/.claude/) - 모든 프로젝트에서 사용" \
        "프로젝트 설치 (./.claude/) - 현재 프로젝트만")

    if [[ "$SCOPE" == *"전역"* ]]; then
        TARGET_DIR="$GLOBAL_CLAUDE_DIR"
        echo -e "${GREEN}✓ 전역 설치 선택됨${NC}"
    else
        TARGET_DIR="$LOCAL_CLAUDE_DIR"
        echo -e "${GREEN}✓ 프로젝트 설치 선택됨${NC}"
    fi
}

select_skill_categories() {
    echo ""
    gum style --foreground 39 "Step 2: 스킬 카테고리 선택"

    CATEGORIES=$(gum choose --no-limit --cursor.foreground 212 --selected.foreground 212 \
        --header "설치할 카테고리를 선택하세요 (Space로 선택, Enter로 확인):" \
        "Core - multi-ai-run, multi-ai-review, orchestrate-standalone (필수 추천)" \
        "Orchestration - agile, governance-setup, workflow-guide" \
        "Quality - checkpoint, quality-auditor, security-review" \
        "Analysis - architecture, deps, impact, changelog, coverage" \
        "Tasks - tasks-init, tasks-migrate, recover, context-optimize" \
        "All - 모든 스킬 설치")

    echo -e "${GREEN}✓ $(echo "$CATEGORIES" | wc -l | tr -d ' ')개 카테고리 선택됨${NC}"
}

select_project_team() {
    echo ""
    gum style --foreground 39 "Step 3: Project Team 설치"

    gum style --foreground 252 --italic \
        "Project Team은 10명의 전문 에이전트와 15개의" \
        "자동 검증 훅을 포함합니다." \
        "" \
        "- 에이전트: Frontend, Backend, Test, DBA, QA..." \
        "- 훅: 권한 체크, 영향도 분석, 표준 검증..."
    echo ""

    if gum confirm --default=true "Project Team을 설치하시겠습니까?"; then
        INSTALL_PROJECT_TEAM=true
        echo -e "${GREEN}✓ Project Team 설치 예정${NC}"

        # Select mode
        PROJECT_TEAM_MODE=$(gum choose --cursor.foreground 212 \
            "standard - 권장 훅 + 에이전트" \
            "lite - 에이전트만 (훅 없음)" \
            "full - 모든 훅 + 에이전트")

        if [[ "$PROJECT_TEAM_MODE" == *"lite"* ]]; then
            PROJECT_TEAM_MODE_FLAG="lite"
        elif [[ "$PROJECT_TEAM_MODE" == *"full"* ]]; then
            PROJECT_TEAM_MODE_FLAG="full"
        else
            PROJECT_TEAM_MODE_FLAG="standard"
        fi
    else
        INSTALL_PROJECT_TEAM=false
        echo -e "${YELLOW}⏭️  Project Team 설치 건너뜀${NC}"
    fi
}

configure_multi_ai_routing() {
    echo ""
    gum style --foreground 39 "Step 4: Multi-AI 라우팅 설정 (선택사항)"

    gum style --foreground 252 --italic \
        "Multi-AI 라우팅을 설정하면 태스크 유형별로" \
        "최적의 AI 모델을 자동 선택합니다:" \
        "" \
        "  코드 작업 → Codex (GPT-5.3)" \
        "  디자인/UI → Gemini (3.1-pro)" \
        "  기획/조율 → Claude (Opus/Sonnet)"
    echo ""

    if gum confirm --default=false "Multi-AI 라우팅을 설정하시겠습니까?"; then
        SETUP_MULTI_AI=true
        echo -e "${GREEN}✓ Multi-AI 라우팅 설정 예정${NC}"

        # Check CLI availability
        echo ""
        echo -e "${CYAN}CLI 설치 상태 확인...${NC}"
        if command -v gemini &> /dev/null; then
            echo -e "  ${GREEN}✓ Gemini CLI${NC}"
            HAS_GEMINI=true
        else
            echo -e "  ${YELLOW}⚠ Gemini CLI 미설치${NC}"
            HAS_GEMINI=false
        fi

        if command -v codex &> /dev/null; then
            echo -e "  ${GREEN}✓ Codex CLI${NC}"
            HAS_CODEX=true
        else
            echo -e "  ${YELLOW}⚠ Codex CLI 미설치${NC}"
            HAS_CODEX=false
        fi

        if [[ "$HAS_GEMINI" == false ]] || [[ "$HAS_CODEX" == false ]]; then
            echo ""
            gum style --foreground 214 \
                "일부 CLI가 미설치 상태입니다." \
                "라우팅 설정은 진행되며, 미설치 CLI는" \
                "Claude로 폴백됩니다."
        fi
    else
        SETUP_MULTI_AI=false
        echo -e "${YELLOW}⏭️  Multi-AI 라우팅 설정 건너뜀${NC}"
    fi
}

configure_statusline() {
    echo ""
    gum style --foreground 39 "Step 5: Statusline 설정 (선택사항)"

    gum style --foreground 252 --italic \
        "TASKS.md 진행 상황을 Claude Code 상태바에 표시합니다:" \
        "" \
        "  📋 12/34 ▓▓▓░░░░░░░  Phase 2  → T2.1: Build API"
    echo ""

    if gum confirm --default=false "Statusline에 태스크 진행 상황을 추가하시겠습니까?"; then
        SETUP_STATUSLINE=true
        echo -e "${GREEN}✓ Statusline 설정 예정${NC}"
    else
        SETUP_STATUSLINE=false
        echo -e "${YELLOW}⏭️  Statusline 설정 건너뜀${NC}"
    fi
}

# ============================================================================
# Installation Logic
# ============================================================================

install_skills() {
    echo ""
    gum style --foreground 39 "Installing Skills..."

    mkdir -p "$TARGET_DIR/skills"

    # Determine which skills to install
    INSTALL_ALL=false
    [[ "$CATEGORIES" == *"All"* ]] && INSTALL_ALL=true

    local installed=0

    # Core skills
    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Core"* ]]; then
        for skill in multi-ai-run multi-ai-review orchestrate-standalone; do
            if [[ -d "$SCRIPT_DIR/skills/$skill" ]]; then
                gum spin --spinner dot --title "$skill 설치 중..." -- \
                    rsync -a "$SCRIPT_DIR/skills/$skill/" "$TARGET_DIR/skills/$skill/"
                installed=$((installed + 1))
            fi
        done
    fi

    # Orchestration skills
    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Orchestration"* ]]; then
        for skill in agile governance-setup workflow-guide; do
            if [[ -d "$SCRIPT_DIR/skills/$skill" ]]; then
                gum spin --spinner dot --title "$skill 설치 중..." -- \
                    rsync -a "$SCRIPT_DIR/skills/$skill/" "$TARGET_DIR/skills/$skill/"
                installed=$((installed + 1))
            fi
        done
    fi

    # Quality skills
    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Quality"* ]]; then
        for skill in checkpoint quality-auditor security-review; do
            if [[ -d "$SCRIPT_DIR/skills/$skill" ]]; then
                gum spin --spinner dot --title "$skill 설치 중..." -- \
                    rsync -a "$SCRIPT_DIR/skills/$skill/" "$TARGET_DIR/skills/$skill/"
                installed=$((installed + 1))
            fi
        done
    fi

    # Analysis skills
    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Analysis"* ]]; then
        for skill in architecture deps impact changelog coverage; do
            if [[ -d "$SCRIPT_DIR/skills/$skill" ]]; then
                gum spin --spinner dot --title "$skill 설치 중..." -- \
                    rsync -a "$SCRIPT_DIR/skills/$skill/" "$TARGET_DIR/skills/$skill/"
                installed=$((installed + 1))
            fi
        done
    fi

    # Tasks skills
    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Tasks"* ]]; then
        for skill in tasks-init tasks-migrate recover context-optimize; do
            if [[ -d "$SCRIPT_DIR/skills/$skill" ]]; then
                gum spin --spinner dot --title "$skill 설치 중..." -- \
                    rsync -a "$SCRIPT_DIR/skills/$skill/" "$TARGET_DIR/skills/$skill/"
                installed=$((installed + 1))
            fi
        done
    fi

    echo -e "${GREEN}✓ $installed 스킬 설치 완료${NC}"
}

install_project_team() {
    if [[ "$INSTALL_PROJECT_TEAM" != true ]]; then
        return
    fi

    echo ""
    gum style --foreground 39 "Installing Project Team..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${YELLOW}⚠️  Node.js가 설치되어 있지 않습니다.${NC}"
        echo -e "${YELLOW}   훅이 제대로 동작하지 않을 수 있습니다.${NC}"
        if ! gum confirm "그래도 계속 설치하시겠습니까?"; then
            echo -e "${YELLOW}⏭️  Project Team 설치 건너뜀${NC}"
            return
        fi
    fi

    # Install agents
    mkdir -p "$TARGET_DIR/agents"
    if [[ -d "$SCRIPT_DIR/project-team/agents" ]]; then
        gum spin --spinner dot --title "에이전트 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/project-team/agents/" "$TARGET_DIR/agents/"
        local agent_count=$(ls -1 "$TARGET_DIR/agents"/*.md 2>/dev/null | wc -l | tr -d ' ')
        echo -e "${GREEN}✓ $agent_count 에이전트 설치됨${NC}"
    fi

    # Install templates
    mkdir -p "$TARGET_DIR/templates"
    if [[ -d "$SCRIPT_DIR/project-team/templates" ]]; then
        gum spin --spinner dot --title "템플릿 설치 중..." -- \
            rsync -a "$SCRIPT_DIR/project-team/templates/" "$TARGET_DIR/templates/"
        echo -e "${GREEN}✓ 템플릿 설치됨${NC}"
    fi

    # Install hooks (based on mode)
    if [[ "$PROJECT_TEAM_MODE_FLAG" != "lite" ]]; then
        mkdir -p "$TARGET_DIR/hooks"
        if [[ -d "$SCRIPT_DIR/project-team/hooks" ]]; then
            gum spin --spinner dot --title "훅 설치 중..." -- \
                rsync -a "$SCRIPT_DIR/project-team/hooks/" "$TARGET_DIR/hooks/"
            chmod +x "$TARGET_DIR/hooks/"*.js 2>/dev/null || true
            local hook_count=$(ls -1 "$TARGET_DIR/hooks"/*.js 2>/dev/null | wc -l | tr -d ' ')
            echo -e "${GREEN}✓ $hook_count 훅 설치됨${NC}"

            # Configure hooks in settings.json
            configure_hooks
        fi
    else
        echo -e "${YELLOW}⏭️  훅 설치 건너뜀 (lite 모드)${NC}"
    fi
}

configure_hooks() {
    SETTINGS_FILE="$TARGET_DIR/settings.json"

    if [[ ! -f "$SETTINGS_FILE" ]]; then
        echo '{}' > "$SETTINGS_FILE"
    fi

    # Use jq if available
    if command -v jq &> /dev/null; then
        local hook_config
        if [[ "$PROJECT_TEAM_MODE_FLAG" == "full" ]]; then
            hook_config='{
                "hooks": {
                    "PreToolUse": [
                        {"matcher": "Edit|Write", "hooks": [{"type": "command", "command": "node '"$TARGET_DIR"'/hooks/permission-checker.js"}]},
                        {"matcher": "Edit", "hooks": [{"type": "command", "command": "node '"$TARGET_DIR"'/hooks/pre-edit-impact-check.js"}]}
                    ],
                    "PostToolUse": [
                        {"matcher": "Edit|Write", "hooks": [{"type": "command", "command": "node '"$TARGET_DIR"'/hooks/standards-validator.js"}]}
                    ]
                }
            }'
        else
            # standard mode
            hook_config='{
                "hooks": {
                    "PreToolUse": [
                        {"matcher": "Edit|Write", "hooks": [{"type": "command", "command": "node '"$TARGET_DIR"'/hooks/permission-checker.js"}]}
                    ]
                }
            }'
        fi

        TMP_FILE=$(mktemp)
        echo "$hook_config" | jq -s '.[0] * .[1]' "$SETTINGS_FILE" - > "$TMP_FILE"
        mv "$TMP_FILE" "$SETTINGS_FILE"
        echo -e "${GREEN}✓ 훅 설정 완료${NC}"
    else
        echo -e "${YELLOW}⚠️  jq가 없어 훅 설정을 수동으로 해야 합니다.${NC}"
        echo "   $SETTINGS_FILE 에 hooks 설정을 추가하세요."
    fi
}

install_statusline() {
    if [[ "$SETUP_STATUSLINE" != true ]]; then
        return
    fi

    echo ""
    gum style --foreground 39 "Installing Statusline..."

    local skill_dir="$SCRIPT_DIR/skills/statusline"
    if [[ ! -f "$skill_dir/install.sh" ]]; then
        echo -e "${YELLOW}⚠️  Statusline skill not found${NC}"
        return
    fi

    gum spin --spinner dot --title "Statusline 설치 중..." -- \
        bash "$skill_dir/install.sh"
    echo -e "${GREEN}✓ Statusline 설치 완료${NC}"
}

setup_multi_ai_routing() {
    if [[ "$SETUP_MULTI_AI" != true ]]; then
        return
    fi

    echo ""
    gum style --foreground 39 "Configuring Multi-AI Routing..."

    # Copy routing config
    if [[ -f "$SCRIPT_DIR/skills/multi-ai-run/routing.config.yaml" ]]; then
        cp "$SCRIPT_DIR/skills/multi-ai-run/routing.config.yaml" "$TARGET_DIR/routing.config.yaml"
        echo -e "${GREEN}✓ routing.config.yaml 복사됨${NC}"
    fi

    # Copy model-routing template if project-team is installed
    if [[ -f "$SCRIPT_DIR/project-team/templates/model-routing.yaml" ]]; then
        cp "$SCRIPT_DIR/project-team/templates/model-routing.yaml" "$TARGET_DIR/model-routing.yaml"
        echo -e "${GREEN}✓ model-routing.yaml 복사됨${NC}"
    fi

    echo -e "${GREEN}✓ Multi-AI 라우팅 설정 완료${NC}"
}

# ============================================================================
# Post-installation
# ============================================================================

show_completion() {
    echo ""
    local installed_skills=$(ls -1 "$TARGET_DIR/skills" 2>/dev/null | wc -l | tr -d ' ')
    local installed_agents=$(ls -1 "$TARGET_DIR/agents"/*.md 2>/dev/null | wc -l | tr -d ' ')

    gum style \
        --foreground 82 --border-foreground 82 --border rounded \
        --align center --width 60 --margin "1 2" --padding "1 2" \
        "Installation Complete!" \
        "" \
        "Skills: ${installed_skills}" \
        "Agents: ${installed_agents}" \
        "Location: $TARGET_DIR"

    echo ""
    gum style --foreground 39 "Next Steps"
    echo ""

    gum style \
        --foreground 252 --border-foreground 240 --border normal \
        --width 60 --margin "0 2" --padding "1 2" \
        "1. Claude Code 실행:" \
        "   \$ claude" \
        "" \
        "2. 워크플로우 가이드:" \
        "   > /workflow" \
        "" \
        "3. 오케스트레이션 시작:" \
        "   > /orchestrate-standalone" \
        "" \
        "4. 멀티 AI 리뷰:" \
        "   > /multi-ai-review"

    # Show CLI status if multi-ai was configured
    if [[ "$SETUP_MULTI_AI" == true ]]; then
        echo ""
        gum style --foreground 39 "Multi-AI CLI Status"
        echo ""

        local cli_status=""
        if command -v gemini &> /dev/null; then
            cli_status+="  Gemini CLI: ✅ 설치됨\n"
        else
            cli_status+="  Gemini CLI: ❌ 미설치 → npm i -g @anthropic-ai/gemini-cli\n"
        fi

        if command -v codex &> /dev/null; then
            cli_status+="  Codex CLI:  ✅ 설치됨\n"
        else
            cli_status+="  Codex CLI:  ❌ 미설치 → npm i -g @openai/codex\n"
        fi

        echo -e "$cli_status"
    fi

    echo ""
}

# ============================================================================
# Non-interactive Mode
# ============================================================================

run_non_interactive() {
    local scope="$1"
    local install_all="${2:-false}"

    if [[ "$scope" == "global" ]]; then
        TARGET_DIR="$GLOBAL_CLAUDE_DIR"
    else
        TARGET_DIR="$LOCAL_CLAUDE_DIR"
    fi

    echo -e "${BLUE}[INFO]${NC} 설치 위치: $TARGET_DIR"

    # Set defaults for non-interactive
    if [[ "$install_all" == true ]]; then
        CATEGORIES="All"
    else
        CATEGORIES="Core"
    fi

    INSTALL_PROJECT_TEAM=true
    PROJECT_TEAM_MODE_FLAG="standard"
    SETUP_MULTI_AI=false

    install_skills
    install_project_team
    setup_multi_ai_routing

    echo ""
    echo -e "${GREEN}[OK]${NC} 설치 완료!"
    echo ""
    echo "설치된 스킬: $TARGET_DIR/skills"
    echo "설치된 에이전트: $TARGET_DIR/agents"
    echo ""
    echo "시작하려면:"
    echo "  claude"
    echo "  > /workflow"
}

# ============================================================================
# Main
# ============================================================================

main() {
    # Parse arguments
    case "${1:-}" in
        --global)
            run_non_interactive "global" "${2:-false}"
            exit 0
            ;;
        --local)
            run_non_interactive "local" "${2:-false}"
            exit 0
            ;;
        --all)
            run_non_interactive "global" true
            exit 0
            ;;
        --help|-h)
            echo "Usage: ./install.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  (없음)       대화형 TUI 모드"
            echo "  --global    전역 설치 (비대화)"
            echo "  --local     프로젝트 설치 (비대화)"
            echo "  --all       모든 스킬 전역 설치"
            echo "  --help      이 도움말 표시"
            exit 0
            ;;
    esac

    # Interactive mode
    check_gum
    clear
    print_banner

    select_install_scope
    select_skill_categories
    select_project_team
    configure_multi_ai_routing
    configure_statusline

    echo ""
    gum style --foreground 39 "Installation Summary"
    echo ""
    echo "  위치: $TARGET_DIR"
    echo "  카테고리: $(echo "$CATEGORIES" | tr '\n' ', ' | sed 's/,$//')"
    [[ "$INSTALL_PROJECT_TEAM" == true ]] && echo "  Project Team: 설치 예정 ($PROJECT_TEAM_MODE_FLAG)"
    [[ "$SETUP_MULTI_AI" == true ]] && echo "  Multi-AI: 설정 예정"
    echo ""

    if gum confirm "설치를 진행하시겠습니까?"; then
        echo ""
        install_skills
        install_project_team
        setup_multi_ai_routing
        install_statusline
        show_completion
    else
        echo -e "${YELLOW}설치가 취소되었습니다.${NC}"
        exit 0
    fi
}

# Run
main "$@"
