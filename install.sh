#!/bin/bash
#
# [파일 목적] Claude Imple Skills - 통합 설치 스크립트 v4.1.0
#
# [주요 흐름]
#   1. Skills → ~/.claude/skills/ (전역, 심볼릭 링크/복사)
#   2. Agent Leads → ~/.claude/agents/ (전역, 항상 자동 설치)
#   3. Project Setup → 현재 디렉토리 (조건부: 프로젝트 감지 후 확인)
#
# [외부 연결]
#   - gum: TUI 대화형 모드에 필요 (없으면 설치 시도)
#   - project-team/install.sh: 프로젝트 워커/훅 설치 위임
#   - .claude/agents/: 리더 에이전트 소스 (team-lead, architecture-lead, qa-lead, design-lead)
#
# [수정시 주의]
#   - Step 번호는 주석과 gum style 출력 양쪽 모두 맞춰야 함
#   - 비대화 모드(run_non_interactive)와 대화 모드(main) 양쪽에서 동일한
#     install_* 함수를 공유하므로, 전역 변수 초기화 순서를 지킬 것
#
# Usage:
#   ./install.sh              # Interactive TUI mode
#   ./install.sh --global     # skills global + leads global (no project setup)
#   ./install.sh --local      # skills global + leads global + project setup (auto yes)
#   ./install.sh --all        # skills global + leads global + project setup (auto yes)

set -e

VERSION="4.1.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLOBAL_CLAUDE_DIR="$HOME/.claude"

# Skills always go to global
TARGET_DIR="$GLOBAL_CLAUDE_DIR"

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

# [목적] gum CLI 존재 확인 후 없으면 플랫폼별 패키지 관리자로 설치
# [주의] 설치 실패 시 비대화 모드 안내 후 exit
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
        elif command -v scoop &> /dev/null; then
            scoop install gum
        elif command -v winget &> /dev/null; then
            winget install charmbracelet.gum
        elif command -v choco &> /dev/null; then
            choco install gum
        else
            echo -e "${RED}gum을 자동으로 설치할 수 없습니다.${NC}"
            echo "https://github.com/charmbracelet/gum#installation 참조"
            echo ""
            echo "또는 --global 또는 --all 플래그로 비대화 모드 실행:"
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
# Step 1: Skills Selection & Installation
# ============================================================================

# [목적] TUI로 설치할 스킬 카테고리 선택 (다중 선택)
# [출력] CATEGORIES 전역 변수 설정
select_skill_categories() {
    echo ""
    gum style --foreground 39 "Step 1: 스킬 카테고리 선택"

    CATEGORIES=$(gum choose --no-limit --cursor.foreground 212 --selected.foreground 212 \
        --header "설치할 카테고리를 선택하세요 (Space로 선택, Enter로 확인):" \
        "Core - multi-ai-run, multi-ai-review, team-orchestrate, whitebox, statusline runtime (필수 추천)" \
        "Orchestration - agile, governance-setup, workflow-guide" \
        "Quality - checkpoint, quality-auditor, security-review" \
        "Analysis - architecture, deps, impact, changelog, coverage" \
        "Tasks - tasks-init, tasks-migrate, recover, context-optimize" \
        "All - 모든 스킬 설치")

    echo -e "${GREEN}✓ $(echo "$CATEGORIES" | wc -l | tr -d ' ')개 카테고리 선택됨${NC}"
}

# [목적] 선택된 카테고리에 따라 스킬을 TARGET_DIR/skills/로 복사
# [입력] CATEGORIES, TARGET_DIR (전역 변수)
# [출력] installed 카운트 출력
install_skills() {
    echo ""
    gum style --foreground 39 "Installing Skills..."

    mkdir -p "$TARGET_DIR/skills"

    INSTALL_ALL=false
    [[ "$CATEGORIES" == *"All"* ]] && INSTALL_ALL=true

    local installed=0

    # Core skills
    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Core"* ]]; then
        for skill in multi-ai-run multi-ai-review team-orchestrate whitebox statusline; do
            if [[ -d "$SCRIPT_DIR/skills/$skill" ]]; then
                mkdir -p "$TARGET_DIR/skills/$skill"
                gum spin --spinner dot --title "$skill 설치 중..." -- \
                    bash -c "rsync -a \"$SCRIPT_DIR/skills/$skill/\" \"$TARGET_DIR/skills/$skill/\" 2>/dev/null || cp -r \"$SCRIPT_DIR/skills/$skill/.\" \"$TARGET_DIR/skills/$skill/\""
                installed=$((installed + 1))
            fi
        done
    fi

    # Orchestration skills
    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Orchestration"* ]]; then
        for skill in agile governance-setup workflow-guide; do
            if [[ -d "$SCRIPT_DIR/skills/$skill" ]]; then
                mkdir -p "$TARGET_DIR/skills/$skill"
                gum spin --spinner dot --title "$skill 설치 중..." -- \
                    bash -c "rsync -a \"$SCRIPT_DIR/skills/$skill/\" \"$TARGET_DIR/skills/$skill/\" 2>/dev/null || cp -r \"$SCRIPT_DIR/skills/$skill/.\" \"$TARGET_DIR/skills/$skill/\""
                installed=$((installed + 1))
            fi
        done
    fi

    # Quality skills
    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Quality"* ]]; then
        for skill in checkpoint quality-auditor security-review; do
            if [[ -d "$SCRIPT_DIR/skills/$skill" ]]; then
                mkdir -p "$TARGET_DIR/skills/$skill"
                gum spin --spinner dot --title "$skill 설치 중..." -- \
                    bash -c "rsync -a \"$SCRIPT_DIR/skills/$skill/\" \"$TARGET_DIR/skills/$skill/\" 2>/dev/null || cp -r \"$SCRIPT_DIR/skills/$skill/.\" \"$TARGET_DIR/skills/$skill/\""
                installed=$((installed + 1))
            fi
        done
    fi

    # Analysis skills
    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Analysis"* ]]; then
        for skill in architecture deps impact changelog coverage; do
            if [[ -d "$SCRIPT_DIR/skills/$skill" ]]; then
                mkdir -p "$TARGET_DIR/skills/$skill"
                gum spin --spinner dot --title "$skill 설치 중..." -- \
                    bash -c "rsync -a \"$SCRIPT_DIR/skills/$skill/\" \"$TARGET_DIR/skills/$skill/\" 2>/dev/null || cp -r \"$SCRIPT_DIR/skills/$skill/.\" \"$TARGET_DIR/skills/$skill/\""
                installed=$((installed + 1))
            fi
        done
    fi

    # Tasks skills
    if [[ "$INSTALL_ALL" == true ]] || [[ "$CATEGORIES" == *"Tasks"* ]]; then
        for skill in tasks-init tasks-migrate recover context-optimize; do
            if [[ -d "$SCRIPT_DIR/skills/$skill" ]]; then
                mkdir -p "$TARGET_DIR/skills/$skill"
                gum spin --spinner dot --title "$skill 설치 중..." -- \
                    bash -c "rsync -a \"$SCRIPT_DIR/skills/$skill/\" \"$TARGET_DIR/skills/$skill/\" 2>/dev/null || cp -r \"$SCRIPT_DIR/skills/$skill/.\" \"$TARGET_DIR/skills/$skill/\""
                installed=$((installed + 1))
            fi
        done
    fi

    INSTALLED_SKILLS_COUNT=$installed
    echo -e "${GREEN}✓ $installed 스킬 설치 완료 → $TARGET_DIR/skills/${NC}"
}

# ============================================================================
# Step 2: Agent Leads (Global, Always)
# ============================================================================

# [목적] 4개의 리더 에이전트를 ~/.claude/agents/에 항상 설치
# [연결] 소스: $SCRIPT_DIR/.claude/agents/{team,architecture,qa,design}-lead.md
# [주의] 이 에이전트들은 동적 활성화 템플릿이므로 항상 전역 설치
install_agent_leads() {
    echo ""
    gum style --foreground 39 "Step 2: Agent Leads 설치 (전역 자동)"

    local agents_src="$SCRIPT_DIR/.claude/agents"
    local agents_dst="$GLOBAL_CLAUDE_DIR/agents"
    local lead_agents=(team-lead architecture-lead qa-lead design-lead)

    mkdir -p "$agents_dst"

    local installed=0
    for agent in "${lead_agents[@]}"; do
        local src_file="$agents_src/${agent}.md"
        if [[ -f "$src_file" ]]; then
            gum spin --spinner dot --title "${agent}.md 설치 중..." -- \
                cp "$src_file" "$agents_dst/${agent}.md"
            installed=$((installed + 1))
        else
            echo -e "${YELLOW}  ⚠ ${agent}.md 를 찾을 수 없습니다: $src_file${NC}"
        fi
    done

    INSTALLED_LEADS_COUNT=$installed
    echo -e "${GREEN}✓ $installed 리더 에이전트 설치 완료 → $agents_dst/${NC}"
}

# ============================================================================
# Step 3: Project Setup (Conditional)
# ============================================================================

# [목적] cwd가 프로젝트 디렉토리인지 감지
# [출력] 0=프로젝트, 1=비프로젝트 (bash 관례: 0=true)
detect_project() {
    local cwd="$PWD"
    if [[ -f "$cwd/package.json" ]] || \
       [[ -f "$cwd/pyproject.toml" ]] || \
       [[ -d "$cwd/src" ]] || \
       [[ -d "$cwd/.git" ]]; then
        return 0
    fi
    return 1
}

# [목적] project-team/install.sh를 호출해 워커 에이전트와 거버넌스 훅을 현재 프로젝트에 설치
# [연결] project-team/install.sh --local --mode=team --force --quiet
# [수정시 영향] project-team/install.sh의 인터페이스 변경 시 이 함수도 갱신 필요
setup_project() {
    local project_installer="$SCRIPT_DIR/project-team/install.sh"

    if [[ ! -f "$project_installer" ]]; then
        echo -e "${YELLOW}⚠ project-team/install.sh 를 찾을 수 없습니다.${NC}"
        PROJECT_INSTALLED=false
        return
    fi

    echo ""
    gum spin --spinner dot --title "프로젝트 워커/훅 설치 중..." -- \
        bash "$project_installer" --local --mode=team --force --quiet

    local exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
        PROJECT_INSTALLED=true
        echo -e "${GREEN}✓ 프로젝트 설정 완료 (./.claude/)${NC}"
    else
        PROJECT_INSTALLED=false
        echo -e "${YELLOW}⚠ 프로젝트 설정 중 오류 발생 (exit: $exit_code)${NC}"
    fi
}

# [목적] 프로젝트 감지 여부와 사용자 응답에 따라 setup_project 호출 또는 안내 출력
# [입력] auto_yes — true이면 확인 없이 자동 설치
handle_project_setup() {
    local auto_yes="${1:-false}"

    echo ""
    gum style --foreground 39 "Step 3: 프로젝트 설정"

    if detect_project; then
        # 프로젝트 디렉토리로 감지됨
        gum style --foreground 252 --italic \
            "현재 디렉토리에서 프로젝트가 감지되었습니다: $PWD" \
            "" \
            "워커 에이전트와 거버넌스 훅을 설치하면:" \
            "  - 빌더, 리뷰어, 디자이너, 유지보수 분석가 워커 에이전트" \
            "  - 권한 체크, 품질 게이트, 표준 검증 훅"
        echo ""

        local do_install=false
        if [[ "$auto_yes" == true ]]; then
            do_install=true
            echo -e "${CYAN}  → 자동 설치 모드: 프로젝트 설정 진행${NC}"
        else
            if gum confirm --default=true "현재 프로젝트에 워커 에이전트와 거버넌스 훅을 설치하시겠습니까?"; then
                do_install=true
            fi
        fi

        if [[ "$do_install" == true ]]; then
            setup_project
        else
            PROJECT_INSTALLED=false
            echo -e "${YELLOW}  ⏭  프로젝트 설정 건너뜀${NC}"
            echo ""
            echo -e "${CYAN}  나중에 프로젝트 디렉토리에서 다음 명령으로 설치할 수 있습니다:${NC}"
            echo "    project-team/install.sh --local --mode=team"
        fi
    else
        # 프로젝트가 아닌 디렉토리
        PROJECT_INSTALLED=false
        gum style --foreground 252 --italic \
            "현재 디렉토리가 프로젝트 디렉토리로 감지되지 않았습니다."
        echo ""
        echo -e "${CYAN}  나중에 프로젝트 디렉토리에서 다음 명령으로 설치할 수 있습니다:${NC}"
        echo "    project-team/install.sh --local --mode=team"
    fi
}

# ============================================================================
# Optional Steps: Multi-AI Routing & Statusline
# ============================================================================

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
# Installation Logic (Optional Steps)
# ============================================================================

setup_multi_ai_routing() {
    if [[ "$SETUP_MULTI_AI" != true ]]; then
        return
    fi

    echo ""
    gum style --foreground 39 "Configuring Multi-AI Routing..."

    if [[ -f "$SCRIPT_DIR/skills/multi-ai-run/routing.config.yaml" ]]; then
        cp "$SCRIPT_DIR/skills/multi-ai-run/routing.config.yaml" "$TARGET_DIR/routing.config.yaml"
        echo -e "${GREEN}✓ routing.config.yaml 복사됨${NC}"
    fi

    if [[ -f "$SCRIPT_DIR/project-team/templates/model-routing.yaml" ]]; then
        cp "$SCRIPT_DIR/project-team/templates/model-routing.yaml" "$TARGET_DIR/model-routing.yaml"
        echo -e "${GREEN}✓ model-routing.yaml 복사됨${NC}"
    fi

    echo -e "${GREEN}✓ Multi-AI 라우팅 설정 완료${NC}"
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

# ============================================================================
# Post-installation
# ============================================================================

# [목적] 설치 결과 요약과 다음 단계 안내를 gum 스타일로 출력
# [입력] INSTALLED_SKILLS_COUNT, INSTALLED_LEADS_COUNT, PROJECT_INSTALLED (전역)
show_completion() {
    echo ""

    local skills_count="${INSTALLED_SKILLS_COUNT:-$(ls -1 "$TARGET_DIR/skills" 2>/dev/null | wc -l | tr -d ' ')}"
    local leads_count="${INSTALLED_LEADS_COUNT:-0}"
    local project_status="미설치"
    [[ "$PROJECT_INSTALLED" == true ]] && project_status="설치됨"

    gum style \
        --foreground 82 --border-foreground 82 --border rounded \
        --align center --width 60 --margin "1 2" --padding "1 2" \
        "Installation Complete!" \
        "" \
        "Skills: ${skills_count} → ~/.claude/skills/" \
        "Agent Leads: ${leads_count} → ~/.claude/agents/" \
        "Project: ${project_status}"

    echo ""
    gum style --foreground 39 "Next Steps"
    echo ""

    gum style \
        --foreground 252 --border-foreground 240 --border normal \
        --width 60 --margin "0 2" --padding "1 2" \
        "1. cd your-project" \
        "2. claude" \
        "3. > /workflow"

    # Multi-AI CLI 상태 (설정한 경우만)
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

# [목적] --global / --local / --all 플래그로 호출 시 무인 설치 실행
# [입력]
#   scope: "global" | "local"
#   install_all: true | false
#   setup_project_auto: true | false
# [주의]
#   --global → 프로젝트 설정 없음
#   --local / --all → 프로젝트 설정 자동 yes
run_non_interactive() {
    local scope="$1"
    local install_all="${2:-false}"
    local setup_project_auto="${3:-false}"

    echo -e "${BLUE}[INFO]${NC} Skills → $TARGET_DIR/skills/"
    echo -e "${BLUE}[INFO]${NC} Agent Leads → $GLOBAL_CLAUDE_DIR/agents/"

    # Set skill category defaults
    if [[ "$install_all" == true ]]; then
        CATEGORIES="All"
    else
        CATEGORIES="Core"
    fi

    # Step 1: Skills
    INSTALLED_SKILLS_COUNT=0
    mkdir -p "$TARGET_DIR/skills"
    INSTALL_ALL=false
    [[ "$CATEGORIES" == *"All"* ]] && INSTALL_ALL=true

    local installed=0
    local all_skills=(multi-ai-run multi-ai-review team-orchestrate whitebox statusline agile governance-setup workflow-guide checkpoint quality-auditor security-review architecture deps impact changelog coverage tasks-init tasks-migrate recover context-optimize)
    local core_skills=(multi-ai-run multi-ai-review team-orchestrate whitebox statusline)

    if [[ "$INSTALL_ALL" == true ]]; then
        local skills_to_install=("${all_skills[@]}")
    else
        local skills_to_install=("${core_skills[@]}")
    fi

    for skill in "${skills_to_install[@]}"; do
        if [[ -d "$SCRIPT_DIR/skills/$skill" ]]; then
            mkdir -p "$TARGET_DIR/skills/$skill"
            rsync -a "$SCRIPT_DIR/skills/$skill/" "$TARGET_DIR/skills/$skill/" 2>/dev/null || \
                cp -r "$SCRIPT_DIR/skills/$skill/." "$TARGET_DIR/skills/$skill/"
            installed=$((installed + 1))
        fi
    done
    INSTALLED_SKILLS_COUNT=$installed
    echo -e "${GREEN}[OK]${NC} $installed 스킬 설치 완료 → $TARGET_DIR/skills/"

    # Step 2: Agent Leads
    local agents_src="$SCRIPT_DIR/.claude/agents"
    local agents_dst="$GLOBAL_CLAUDE_DIR/agents"
    local lead_agents=(team-lead architecture-lead qa-lead design-lead)
    mkdir -p "$agents_dst"
    local leads_installed=0
    for agent in "${lead_agents[@]}"; do
        local src_file="$agents_src/${agent}.md"
        if [[ -f "$src_file" ]]; then
            cp "$src_file" "$agents_dst/${agent}.md"
            leads_installed=$((leads_installed + 1))
        else
            echo -e "${YELLOW}[WARN]${NC} ${agent}.md 없음: $src_file"
        fi
    done
    INSTALLED_LEADS_COUNT=$leads_installed
    echo -e "${GREEN}[OK]${NC} $leads_installed 리더 에이전트 설치 완료 → $agents_dst/"

    # Step 3: Project setup (conditional)
    PROJECT_INSTALLED=false
    if [[ "$setup_project_auto" == true ]]; then
        local project_installer="$SCRIPT_DIR/project-team/install.sh"
        if detect_project; then
            echo -e "${BLUE}[INFO]${NC} 프로젝트 감지됨 → 워커/훅 설치 시작"
            if [[ -f "$project_installer" ]]; then
                bash "$project_installer" --local --mode=team --force --quiet && \
                    PROJECT_INSTALLED=true || \
                    echo -e "${YELLOW}[WARN]${NC} 프로젝트 설정 중 오류 발생"
            else
                echo -e "${YELLOW}[WARN]${NC} project-team/install.sh 없음"
            fi
        else
            echo -e "${YELLOW}[SKIP]${NC} 프로젝트 디렉토리 감지 안 됨 → 프로젝트 설정 건너뜀"
            echo "  나중에: project-team/install.sh --local --mode=team"
        fi
    else
        echo -e "${YELLOW}[SKIP]${NC} --global 모드: 프로젝트 설정 건너뜀"
        echo "  나중에: project-team/install.sh --local --mode=team"
    fi

    # Summary
    local project_status="미설치"
    [[ "$PROJECT_INSTALLED" == true ]] && project_status="설치됨"

    echo ""
    echo -e "${GREEN}[완료]${NC} Installation Complete!"
    echo ""
    echo "  Skills:      $INSTALLED_SKILLS_COUNT → ~/.claude/skills/"
    echo "  Agent Leads: $INSTALLED_LEADS_COUNT → ~/.claude/agents/"
    echo "  Project:     $project_status"
    echo ""
    echo "Next Steps:"
    echo "  1. cd your-project"
    echo "  2. claude"
    echo "  3. > /workflow"
    echo ""
}

# ============================================================================
# Main
# ============================================================================

main() {
    # Parse arguments
    case "${1:-}" in
        --global)
            # skills global + leads global, no project setup
            run_non_interactive "global" false false
            exit 0
            ;;
        --local)
            # skills global + leads global + project setup auto yes
            run_non_interactive "local" false true
            exit 0
            ;;
        --all)
            # all skills global + leads global + project setup auto yes
            run_non_interactive "global" true true
            exit 0
            ;;
        --help|-h)
            echo "Usage: ./install.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  (없음)      대화형 TUI 모드 (gum 필요)"
            echo "  --global    스킬 + 리더 에이전트 전역 설치 (프로젝트 설정 없음)"
            echo "  --local     스킬 + 리더 에이전트 + 프로젝트 설정 자동 설치"
            echo "  --all       모든 스킬 + 리더 에이전트 + 프로젝트 설정 자동 설치"
            echo "  --help      이 도움말 표시"
            exit 0
            ;;
    esac

    # Interactive TUI mode
    check_gum
    clear
    print_banner

    # Step 1: Skills
    select_skill_categories
    INSTALLED_SKILLS_COUNT=0

    # Step 2: Agent leads — always global, no prompt needed (inform only)
    echo ""
    gum style --foreground 39 "Step 2: Agent Leads (전역 자동 설치)"
    gum style --foreground 252 --italic \
        "다음 4개의 리더 에이전트는 항상 전역 설치됩니다:" \
        "  team-lead, architecture-lead, qa-lead, design-lead" \
        "" \
        "이 에이전트들은 동적 활성화 템플릿으로 모든 프로젝트에서 사용됩니다."
    INSTALLED_LEADS_COUNT=0

    # Step 3: Project setup
    handle_project_setup false

    # Optional: Multi-AI routing (Step 4)
    configure_multi_ai_routing

    # Optional: Statusline (Step 5)
    configure_statusline

    # Summary before install
    echo ""
    gum style --foreground 39 "Installation Summary"
    echo ""
    echo "  Skills → $TARGET_DIR/skills/"
    echo "  Agent Leads → $GLOBAL_CLAUDE_DIR/agents/ (team-lead, architecture-lead, qa-lead, design-lead)"
    [[ "$PROJECT_INSTALLED" != true ]] && echo "  Project: 건너뜀"
    [[ "$SETUP_MULTI_AI" == true ]] && echo "  Multi-AI: 설정 예정"
    [[ "$SETUP_STATUSLINE" == true ]] && echo "  Statusline: 설정 예정"
    echo ""

    if gum confirm "설치를 진행하시겠습니까?"; then
        echo ""
        install_skills
        install_agent_leads
        # Project setup was already handled interactively above (setup_project called if confirmed)
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
