#!/usr/bin/env bash
# Claude Imple Skills - Quick Installer for New Users
#
# No git clone required! Downloads and installs skills automatically.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/insightflo/claude-impl-tools/main/scripts/quick-install.sh | bash

set -euo pipefail

# ============================================
# Configuration
# ============================================

REPO_URL="https://github.com/insightflo/claude-impl-tools.git"
REPO_NAME="claude-impl-tools"
INSTALL_DIR="$HOME/.claude/$REPO_NAME"
SKILLS_TARGET="$HOME/.claude/skills"
BRANCH="${BRANCH:-main}"

# Colors
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' NC=''
fi

# ============================================
# Helpers
# ============================================

log_info()    { printf "${BLUE}[INFO]${NC} %s\n" "$1"; }
log_success() { printf "${GREEN}[OK]${NC}   %s\n" "$1"; }
log_warn()    { printf "${YELLOW}[WARN]${NC} %s\n" "$1"; }
log_error()   { printf "${RED}[ERR]${NC}  %s\n" "$1" >&2; }

header() {
    printf "\n${BOLD}%s${NC}\n" "$1"
    printf "%s\n" "$(printf '%.0s-' $(seq 1 ${#1}))"
}

confirm() {
    # 파이프 실행(curl | bash) 시 stdin이 tty가 아니므로 자동 Yes 처리
    # 사용자가 입력할 수 없는 환경에서 N 기본값은 업데이트를 건너뛰는 버그를 유발
    if [ ! -t 0 ]; then
        printf "${YELLOW}%s [auto-yes: non-interactive]${NC}\n" "$1"
        return 0
    fi
    printf "${YELLOW}%s [y/N]${NC} " "$1"
    read -r answer
    case "$answer" in
        [yY]|[yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}

# ============================================
# Check Prerequisites
# ============================================

check_prerequisites() {
    header "Checking Prerequisites"

    # Check if curl or wget exists
    if command -v curl >/dev/null 2>&1; then
        DOWNLOADER="curl -fsSL"
        log_success "curl found"
    elif command -v wget >/dev/null 2>&1; then
        DOWNLOADER="wget -qO-"
        log_success "wget found"
    else
        log_error "Neither curl nor wget found. Please install one."
        exit 1
    fi

    # Check if git exists (for cloning)
    if command -v git >/dev/null 2>&1; then
        HAS_GIT=true
        log_success "git found - will use for download"
    else
        HAS_GIT=false
        log_warn "git not found - will use tarball download"
    fi

    # Check if Claude Code is installed
    if command -v claude >/dev/null 2>&1; then
        log_success "Claude Code CLI found"
    else
        log_warn "Claude Code CLI not found. Install from: https://claude.ai/code"
    fi
}

# ============================================
# Download Repository
# ============================================

download_repo() {
    header "Downloading Repository"

    # Create parent directory
    mkdir -p "$(dirname "$INSTALL_DIR")"

    # Check if already installed
    if [ -d "$INSTALL_DIR" ]; then
        log_info "Already installed at: $INSTALL_DIR"
        if confirm "Update to latest version?"; then
            (
                cd "$INSTALL_DIR"
                if [ "$HAS_GIT" = true ]; then
                    git pull origin "$BRANCH"
                else
                    log_warn "Git not available. Please remove and reinstall:"
                    log_warn "  rm -rf $INSTALL_DIR"
                    log_warn "  Then run this installer again."
                    exit 1
                fi
            )
        fi
        return
    fi

    log_info "Installing to: $INSTALL_DIR"

    if [ "$HAS_GIT" = true ]; then
        # Use git clone (faster for updates)
        log_info "Cloning repository..."
        git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
        log_success "Repository cloned"
    else
        # Use tarball download (no git required)
        log_info "Downloading tarball..."
        TEMP_TAR=$(mktemp)
        $DOWNLOADER "https://github.com/insightflo/claude-impl-tools/archive/refs/heads/$BRANCH.tar.gz" -o "$TEMP_TAR"
        mkdir -p "$INSTALL_DIR"
        tar -xzf "$TEMP_TAR" -C "$(dirname "$INSTALL_DIR")" --strip-components=1
        rm -f "$TEMP_TAR"
        log_success "Repository downloaded"
    fi
}

# ============================================
# Install Skills
# ============================================

install_skills() {
    header "Installing Skills"

    local source_dir="$INSTALL_DIR/skills"
    local count=0

    mkdir -p "$SKILLS_TARGET"

    for skill_path in "$source_dir"/*/; do
        skill_name=$(basename "$skill_path")
        dest_path="$SKILLS_TARGET/$skill_name"

        # Remove existing
        if [ -e "$dest_path" ]; then
            rm -rf "$dest_path"
        fi

        # Create symlink
        ln -s "$skill_path" "$dest_path"
        log_success "  $skill_name"
        count=$((count + 1))
    done

    log_success "$count skill(s) installed"
}

# ============================================
# Prompt for Project Team
# ============================================

prompt_project_team() {
    header "Project Team (Optional)"

    printf "\n"
    printf "  ${BOLD}Project Team${NC} includes:\n"
    printf "    - 4 Agent Teams leads + 4 core workers\n"
    printf "    - 20 auto-validation & governance hooks\n"
    printf "    - Templates for protocols & contracts\n"
    printf "\n"
    printf "  ${CYAN}Recommended for:${NC} 30+ task projects, team collaboration\n"
    printf "  ${CYAN}Requires:${NC}      Node.js 18+ (for hooks)\n"
    printf "\n"

    if confirm "Install Project Team now?"; then
        install_project_team
    else
        log_info "Skipped. Install later with:"
        log_info "  cd your-project && bash $INSTALL_DIR/project-team/install.sh --local"
    fi
}

# ============================================
# Install Project Team
# ============================================

install_project_team() {
    header "Installing Project Team"

    if ! command -v node >/dev/null 2>&1; then
        log_warn "Node.js not found. Project Team hooks require Node.js."
        log_warn "Install Node.js: https://nodejs.org/"
        if ! confirm "Continue anyway?"; then
            return
        fi
    fi

    bash "$INSTALL_DIR/project-team/install.sh" --local || {
        log_error "Project Team installation failed"
        return 1
    }

    log_success "Project Team installed"
}

# ============================================
# Print Summary
# ============================================

print_summary() {
    header "Installation Complete!"

    printf "\n"
    printf "  ${BOLD}Install Location:${NC}  %s\n" "$INSTALL_DIR"
    printf "  ${BOLD}Skills Installed:${NC}  %s\n" "$SKILLS_TARGET"
    printf "\n"
    printf "  ${BOLD}Available Skills:${NC}\n"
    printf "    /workflow         - Meta hub for skill recommendations\n"
    printf "    /agile            - Layered sprints (Skeleton → Muscles → Skin)\n"
    printf "    /governance-setup - Set up agent team structure\n"
    printf "    /tasks-init       - Generate TASKS.md from scratch\n"
    printf "    /multi-ai-review  - Consensus review (Claude + Gemini + Codex)\n"
    printf "    /team-orchestrate - Agent Teams orchestration with Plan Approval\n"
    printf "    /impact           - Analyze change impact before editing\n"
    printf "    /deps             - Visualize dependencies\n"
    printf "    /changelog        - Query change history\n"
    printf "    /coverage         - Test coverage visualization\n"
    printf "    /architecture     - Map project structure\n"
    printf "\n"
    printf "  ${BOLD}Quick Start:${NC}\n"
    printf "    cd your-project\n"
    printf "    claude\n"
    printf "    > /workflow\n"
    printf "\n"
    printf "  ${BOLD}Update:${NC}\n"
    printf "    cd $INSTALL_DIR && git pull\n"
    printf "    # Or run this installer again\n"
    printf "\n"
    printf "  ${BOLD}Uninstall:${NC}\n"
    printf "    rm -rf $INSTALL_DIR\n"
    printf "    rm -rf $SKILLS_TARGET/*\n"
    printf "\n"
    printf "  ${GREEN}Happy coding!${NC}\n"
    printf "\n"
}

# ============================================
# Banner
# ============================================

print_banner() {
    printf "\n"
    printf "${BOLD}  ╔════════════════════════════════════════════════╗${NC}\n"
    printf "${BOLD}  ║   Claude Imple Skills - Quick Installer       ║${NC}\n"
    printf "${BOLD}  ║   Build software with AI agent teams          ║${NC}\n"
    printf "${BOLD}  ╚════════════════════════════════════════════════╝${NC}\n"
    printf "\n"
}

# ============================================
# Main
# ============================================

main() {
    print_banner
    check_prerequisites
    download_repo
    install_skills
    prompt_project_team
    print_summary
}

main "$@"
