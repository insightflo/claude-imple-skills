#!/usr/bin/env bash
# @TASK P6-T1 - Claude Project Team Install Script
# @SPEC docs/design/PROJECT-TEAM-AGENTS.md#13-배포-구조
#
# Installs Claude Project Team hooks, agents, templates, and skills
# into a user's Claude Code environment.
#
# Usage:
#   ./install.sh                  # Interactive install
#   ./install.sh --global         # Global install (~/.claude/)
#   ./install.sh --local          # Local install (.claude/)
#   ./install.sh --hooks-only     # Install hooks only
#   ./install.sh --skills-only    # Install skills only
#   ./install.sh --dry-run        # Preview without changes
#   ./install.sh --uninstall      # Remove installed files

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SUFFIX=".backup-$(date +%Y%m%d%H%M%S)"

# Colors (disabled if not a terminal)
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

# ---------------------------------------------------------------------------
# Default options
# ---------------------------------------------------------------------------

INSTALL_MODE=""        # "global" | "local"
MODE=""                # "lite" | "standard" | "full"
HOOKS_ONLY=false
SKILLS_ONLY=false
DRY_RUN=false
UNINSTALL=false
FORCE=false
QUIET=false

# Counters
INSTALLED_HOOKS=0
INSTALLED_AGENTS=0
INSTALLED_TEMPLATES=0
INSTALLED_SKILLS=0
BACKED_UP=0
ERRORS=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log_info()    { printf "${BLUE}[INFO]${NC} %s\n" "$1"; }
log_success() { printf "${GREEN}[OK]${NC}   %s\n" "$1"; }
log_warn()    { printf "${YELLOW}[WARN]${NC} %s\n" "$1"; }
log_error()   { printf "${RED}[ERR]${NC}  %s\n" "$1" >&2; }
log_dry()     { printf "${CYAN}[DRY]${NC}  %s\n" "$1"; }

header() {
    printf "\n${BOLD}%s${NC}\n" "$1"
    printf "%s\n" "$(printf '%.0s-' $(seq 1 ${#1}))"
}

confirm() {
    if [ "$FORCE" = true ]; then
        return 0
    fi
    local prompt="${1:-Continue?}"
    printf "${YELLOW}%s [y/N]${NC} " "$prompt"
    read -r answer
    case "$answer" in
        [yY]|[yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------

usage() {
    cat <<EOF
${BOLD}Claude Project Team Installer v${VERSION}${NC}

Usage: $(basename "$0") [OPTIONS]

${BOLD}Install Modes:${NC}
  --global          Install to ~/.claude/ (shared across projects)
  --local           Install to .claude/ (current project only)
  (no flag)         Interactive mode (prompts for choice)

${BOLD}Configuration Mode:${NC}
  --mode=lite       MVP용 (policy-gate, security-scan)
  --mode=standard   General project (lite + quality-gate, contract-gate)
  --mode=full       Enterprise (standard + risk-gate, docs-gate)

${BOLD}Selective Install:${NC}
  --hooks-only      Install hooks only
  --skills-only     Install skills only

${BOLD}Other Options:${NC}
  --dry-run         Preview what would be installed without making changes
  --uninstall       Remove Claude Project Team files
  --force           Skip confirmation prompts
  --quiet           Minimal output
  --help            Show this help message

${BOLD}Examples:${NC}
  $(basename "$0")                    # Interactive install
  $(basename "$0") --global           # Global install
  $(basename "$0") --local --mode=standard  # Standard mode install
  $(basename "$0") --dry-run          # Preview changes
  $(basename "$0") --uninstall        # Remove installation

EOF
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --global)     INSTALL_MODE="global" ;;
            --local)      INSTALL_MODE="local" ;;
            --mode)
                MODE="$2"
                shift
                ;;
            --hooks-only) HOOKS_ONLY=true ;;
            --skills-only) SKILLS_ONLY=true ;;
            --dry-run)    DRY_RUN=true ;;
            --uninstall)  UNINSTALL=true ;;
            --force)      FORCE=true ;;
            --quiet)      QUIET=true ;;
            --help|-h)    usage; exit 0 ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
        shift
    done

    # Validate conflicting options
    if [ "$HOOKS_ONLY" = true ] && [ "$SKILLS_ONLY" = true ]; then
        log_error "--hooks-only and --skills-only cannot be used together."
        exit 1
    fi

    # Validate mode
    if [ -n "$MODE" ]; then
        case "$MODE" in
            lite|standard|full)
                ;;
            *)
                log_error "Invalid mode: $MODE (must be: lite, standard, or full)"
                exit 1
                ;;
        esac
    fi
}

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------

check_prerequisites() {
    header "Checking prerequisites"

    # Verify source directory has expected structure
    # Note: skills are in root /skills/ directory, not in project-team/skills/
    local missing=0
    for dir in hooks agents templates; do
        if [ ! -d "${SCRIPT_DIR}/${dir}" ]; then
            log_error "Missing source directory: ${SCRIPT_DIR}/${dir}"
            missing=$((missing + 1))
        fi
    done
    if [ "$missing" -gt 0 ]; then
        log_error "Source directory appears incomplete. Run from the project-team root."
        exit 1
    fi
    log_success "Source directory verified: ${SCRIPT_DIR}"

    # Check for jq (needed for settings.json merge)
    if command -v jq >/dev/null 2>&1; then
        log_success "jq found (for settings.json merge)"
    else
        log_warn "jq not found. settings.json hook configuration will be generated but not auto-merged."
        log_warn "Install jq: brew install jq (macOS) or apt-get install jq (Linux)"
    fi

    # Check for Node.js (hooks are JS)
    if command -v node >/dev/null 2>&1; then
        local node_version
        node_version="$(node --version 2>/dev/null || echo 'unknown')"
        log_success "Node.js found: ${node_version} (required for hooks)"
    else
        log_warn "Node.js not found. Hooks require Node.js to execute."
    fi
}

# ---------------------------------------------------------------------------
# Interactive mode selection
# ---------------------------------------------------------------------------

prompt_install_mode() {
    if [ -n "$INSTALL_MODE" ]; then
        return
    fi

    header "Installation Mode"
    printf "\n"
    printf "  ${BOLD}1)${NC} Global install  ${CYAN}(~/.claude/)${NC}\n"
    printf "     Hooks, skills, and agents available in all projects.\n"
    printf "\n"
    printf "  ${BOLD}2)${NC} Local install   ${CYAN}(.claude/)${NC}\n"
    printf "     Installed only in the current project directory.\n"
    printf "\n"

    while true; do
        printf "${YELLOW}Select mode [1/2]:${NC} "
        read -r choice
        case "$choice" in
            1) INSTALL_MODE="global"; break ;;
            2) INSTALL_MODE="local"; break ;;
            *) printf "  Please enter 1 or 2.\n" ;;
        esac
    done
}

# ---------------------------------------------------------------------------
# Resolve target directories
# ---------------------------------------------------------------------------

resolve_targets() {
    case "$INSTALL_MODE" in
        global)
            TARGET_BASE="$HOME/.claude"
            TARGET_HOOKS="${TARGET_BASE}/hooks"
            TARGET_AGENTS="${TARGET_BASE}/agents"
            TARGET_TEMPLATES="${TARGET_BASE}/templates"
            TARGET_SKILLS="${TARGET_BASE}/skills"
            TARGET_SETTINGS="${TARGET_BASE}/settings.json"
            ;;
        local)
            TARGET_BASE=".claude"
            TARGET_HOOKS="${TARGET_BASE}/hooks"
            TARGET_AGENTS="${TARGET_BASE}/agents"
            TARGET_TEMPLATES="${TARGET_BASE}/templates"
            TARGET_SKILLS="${TARGET_BASE}/skills"
            TARGET_SETTINGS="${TARGET_BASE}/settings.json"
            ;;
        *)
            log_error "Invalid install mode: ${INSTALL_MODE}"
            exit 1
            ;;
    esac
}

# ---------------------------------------------------------------------------
# Backup a file if it exists
# ---------------------------------------------------------------------------

backup_file() {
    local target="$1"
    if [ -e "$target" ]; then
        local backup="${target}${BACKUP_SUFFIX}"
        if [ "$DRY_RUN" = true ]; then
            log_dry "Would backup: ${target} -> ${backup}"
        else
            cp -a "$target" "$backup"
            BACKED_UP=$((BACKED_UP + 1))
            if [ "$QUIET" = false ]; then
                log_info "Backed up: $(basename "$target")"
            fi
        fi
    fi
}

# ---------------------------------------------------------------------------
# Copy a single file with backup
# ---------------------------------------------------------------------------

install_file() {
    local src="$1"
    local dest="$2"
    local dest_dir
    dest_dir="$(dirname "$dest")"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would install: ${src} -> ${dest}"
        return 0
    fi

    mkdir -p "$dest_dir"
    backup_file "$dest"
    cp -a "$src" "$dest"

    # Preserve executable bit for hook scripts
    if [[ "$src" == *.js ]] || [[ "$src" == *.sh ]]; then
        chmod +x "$dest"
    fi
}

# ---------------------------------------------------------------------------
# Install hooks
# ---------------------------------------------------------------------------

install_hooks() {
    header "Installing Hooks"

    local hooks_src="${SCRIPT_DIR}/hooks"
    local count=0

    # Mode-based hook filtering
    local allowed_hooks=""
    if [ -n "$MODE" ]; then
        case "$MODE" in
            lite)
                allowed_hooks="policy-gate|security-scan"
                ;;
            standard)
                allowed_hooks="policy-gate|security-scan|quality-gate|contract-gate"
                ;;
            full)
                allowed_hooks="policy-gate|security-scan|quality-gate|contract-gate|risk-gate|docs-gate"
                ;;
        esac
        log_info "Mode: ${MODE} (installing: ${allowed_hooks})"
    fi

    # Install hook JS files (skip __tests__ and docs)
    while IFS= read -r -d '' hookfile; do
        local basename_file
        basename_file="$(basename "$hookfile")"
        local dest="${TARGET_HOOKS}/${basename_file}"

        # Skip test files
        if [[ "$basename_file" == *".test."* ]]; then
            continue
        fi

        # Mode-based filtering
        if [ -n "$allowed_hooks" ]; then
            local hook_name="${basename_file%.js}"
            if [[ ! "$hook_name" =~ ^($allowed_hooks)$ ]]; then
                log_dry "  [skip] ${basename_file} (not in ${MODE} mode)"
                continue
            fi
        fi

        install_file "$hookfile" "$dest"
        count=$((count + 1))

        if [ "$QUIET" = false ] && [ "$DRY_RUN" = false ]; then
            log_success "  ${basename_file}"
        fi
    done < <(find "$hooks_src" -maxdepth 1 -name '*.js' -print0 | sort -z)

    INSTALLED_HOOKS=$count

    if [ "$DRY_RUN" = true ]; then
        log_dry "${count} hook(s) would be installed to ${TARGET_HOOKS}"
    else
        log_success "${count} hook(s) installed to ${TARGET_HOOKS}"
    fi
}

# ---------------------------------------------------------------------------
# Install agents
# ---------------------------------------------------------------------------

install_agents() {
    header "Installing Agents"

    local agents_src="${SCRIPT_DIR}/agents"
    local count=0

    # Install project-level agents
    while IFS= read -r -d '' agentfile; do
        local relpath="${agentfile#${agents_src}/}"
        local dest="${TARGET_AGENTS}/${relpath}"

        install_file "$agentfile" "$dest"
        count=$((count + 1))

        if [ "$QUIET" = false ] && [ "$DRY_RUN" = false ]; then
            log_success "  ${relpath}"
        fi
    done < <(find "$agents_src" -name '*.md' -print0 | sort -z)

    INSTALLED_AGENTS=$count

    if [ "$DRY_RUN" = true ]; then
        log_dry "${count} agent(s) would be installed to ${TARGET_AGENTS}"
    else
        log_success "${count} agent(s) installed to ${TARGET_AGENTS}"
    fi
}

# ---------------------------------------------------------------------------
# Install templates
# ---------------------------------------------------------------------------

install_templates() {
    header "Installing Templates"

    local templates_src="${SCRIPT_DIR}/templates"
    local count=0

    while IFS= read -r -d '' tplfile; do
        local relpath="${tplfile#${templates_src}/}"
        local dest="${TARGET_TEMPLATES}/${relpath}"

        install_file "$tplfile" "$dest"
        count=$((count + 1))

        if [ "$QUIET" = false ] && [ "$DRY_RUN" = false ]; then
            log_success "  ${relpath}"
        fi
    done < <(find "$templates_src" -type f -print0 | sort -z)

    INSTALLED_TEMPLATES=$count

    if [ "$DRY_RUN" = true ]; then
        log_dry "${count} template(s) would be installed to ${TARGET_TEMPLATES}"
    else
        log_success "${count} template(s) installed to ${TARGET_TEMPLATES}"
    fi
}

# ---------------------------------------------------------------------------
# Install skills
# ---------------------------------------------------------------------------

install_skills() {
    header "Installing Skills"

    local skills_src="${SCRIPT_DIR}/skills"
    local count=0

    while IFS= read -r -d '' skillfile; do
        local relpath="${skillfile#${skills_src}/}"
        local dest="${TARGET_SKILLS}/${relpath}"

        install_file "$skillfile" "$dest"
        count=$((count + 1))

        if [ "$QUIET" = false ] && [ "$DRY_RUN" = false ]; then
            log_success "  ${relpath}"
        fi
    done < <(find "$skills_src" -type f -print0 | sort -z)

    INSTALLED_SKILLS=$count

    if [ "$DRY_RUN" = true ]; then
        log_dry "${count} skill(s) would be installed to ${TARGET_SKILLS}"
    else
        log_success "${count} skill(s) installed to ${TARGET_SKILLS}"
    fi
}

# ---------------------------------------------------------------------------
# Generate hook settings JSON
# ---------------------------------------------------------------------------

generate_hook_settings() {
    # Build the project-team hook entries as JSON.
    # These map each hook to the correct Claude Code event and matcher.
    local hooks_path
    if [ "$INSTALL_MODE" = "global" ]; then
        hooks_path="\${HOME}/.claude/hooks"
    else
        hooks_path="\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks"
    fi

    cat <<ENDJSON
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${hooks_path}/permission-checker.js\"",
            "timeout": 5,
            "statusMessage": "Checking permissions..."
          },
          {
            "type": "command",
            "command": "node \"${hooks_path}/pre-edit-impact-check.js\"",
            "timeout": 5,
            "statusMessage": "Analyzing impact..."
          },
          {
            "type": "command",
            "command": "node \"${hooks_path}/risk-area-warning.js\"",
            "timeout": 5,
            "statusMessage": "Checking risk areas..."
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${hooks_path}/standards-validator.js\"",
            "timeout": 5,
            "statusMessage": "Validating standards..."
          },
          {
            "type": "command",
            "command": "node \"${hooks_path}/design-validator.js\"",
            "timeout": 5,
            "statusMessage": "Checking design system..."
          },
          {
            "type": "command",
            "command": "node \"${hooks_path}/interface-validator.js\"",
            "timeout": 5,
            "statusMessage": "Validating interfaces..."
          },
          {
            "type": "command",
            "command": "node \"${hooks_path}/cross-domain-notifier.js\"",
            "timeout": 5,
            "statusMessage": "Checking cross-domain changes..."
          },
          {
            "type": "command",
            "command": "node \"${hooks_path}/architecture-updater.js\"",
            "timeout": 10,
            "statusMessage": "Updating architecture docs..."
          },
          {
            "type": "command",
            "command": "node \"${hooks_path}/changelog-recorder.js\"",
            "timeout": 5,
            "statusMessage": "Recording changelog..."
          }
        ]
      }
    ]
  }
}
ENDJSON
}

# ---------------------------------------------------------------------------
# Configure settings.json
# ---------------------------------------------------------------------------

configure_settings() {
    header "Configuring Hook Settings"

    local hook_json
    hook_json="$(generate_hook_settings)"

    local settings_file="$TARGET_SETTINGS"
    local hook_settings_file="${TARGET_BASE}/hooks/project-team-hooks.json"

    # Always write the standalone hook config for reference
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would write hook configuration to ${hook_settings_file}"
        log_dry "Would update ${settings_file}"
    else
        mkdir -p "$(dirname "$hook_settings_file")"
        printf '%s\n' "$hook_json" > "$hook_settings_file"
        log_success "Hook configuration saved: ${hook_settings_file}"
    fi

    # Merge into settings.json if jq is available
    if command -v jq >/dev/null 2>&1; then
        if [ "$DRY_RUN" = true ]; then
            log_dry "Would merge hooks into ${settings_file} using jq"
            return
        fi

        if [ -f "$settings_file" ]; then
            backup_file "$settings_file"

            # Deep-merge: append our hook entries to existing hook arrays
            local merged
            merged="$(jq -s '
                def merge_hook_arrays:
                    # For each event type in the new config,
                    # append entries that are not already present
                    . as [$base, $new] |
                    ($new.hooks // {}) | to_entries | reduce .[] as $entry (
                        $base;
                        .hooks[$entry.key] as $existing |
                        if $existing == null then
                            .hooks[$entry.key] = $entry.value
                        else
                            # Append new hook groups that have different commands
                            ($entry.value | map(
                                . as $new_group |
                                select(
                                    [$existing[] | .hooks[]?.command] |
                                    index($new_group.hooks[0]?.command) == null
                                )
                            )) as $additions |
                            if ($additions | length) > 0 then
                                .hooks[$entry.key] = $existing + $additions
                            else
                                .
                            end
                        end
                    );
                merge_hook_arrays
            ' "$settings_file" <(printf '%s' "$hook_json"))" 2>/dev/null

            if [ $? -eq 0 ] && [ -n "$merged" ]; then
                printf '%s\n' "$merged" > "$settings_file"
                log_success "Merged hooks into existing ${settings_file}"
            else
                log_warn "Could not auto-merge. Hook config saved to ${hook_settings_file}"
                log_warn "Manually merge into ${settings_file}"
            fi
        else
            # No existing settings, create new
            printf '%s\n' "$hook_json" > "$settings_file"
            log_success "Created ${settings_file} with hook configuration"
        fi
    else
        log_warn "jq not available. Skipping auto-merge."
        log_warn "Manually add hooks from: ${hook_settings_file}"
        log_warn "Target settings file: ${settings_file}"
    fi
}

# ---------------------------------------------------------------------------
# Verify installation
# ---------------------------------------------------------------------------

verify_installation() {
    header "Verifying Installation"

    local ok=true

    # Check hooks
    if [ "$SKILLS_ONLY" = false ]; then
        local hook_count
        hook_count="$(find "$TARGET_HOOKS" -maxdepth 1 -name '*.js' 2>/dev/null | wc -l | tr -d ' ')"
        if [ "$hook_count" -gt 0 ]; then
            log_success "Hooks: ${hook_count} file(s) in ${TARGET_HOOKS}"
        else
            log_error "Hooks: no files found in ${TARGET_HOOKS}"
            ok=false
        fi

        # Check executable permissions
        local non_exec=0
        while IFS= read -r -d '' f; do
            if [ ! -x "$f" ]; then
                non_exec=$((non_exec + 1))
            fi
        done < <(find "$TARGET_HOOKS" -maxdepth 1 -name '*.js' -print0 2>/dev/null)
        if [ "$non_exec" -gt 0 ]; then
            log_warn "${non_exec} hook file(s) missing executable permission"
        fi
    fi

    # Check agents
    if [ "$HOOKS_ONLY" = false ] && [ "$SKILLS_ONLY" = false ]; then
        local agent_count
        agent_count="$(find "$TARGET_AGENTS" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')"
        if [ "$agent_count" -gt 0 ]; then
            log_success "Agents: ${agent_count} file(s) in ${TARGET_AGENTS}"
        else
            log_warn "Agents: no files found in ${TARGET_AGENTS}"
        fi
    fi

    # Check skills
    if [ "$HOOKS_ONLY" = false ]; then
        local skill_count
        skill_count="$(find "$TARGET_SKILLS" -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' ')"
        if [ "$skill_count" -gt 0 ]; then
            log_success "Skills: ${skill_count} file(s) in ${TARGET_SKILLS}"
        else
            log_warn "Skills: no files found in ${TARGET_SKILLS}"
        fi
    fi

    # Check settings
    if [ -f "$TARGET_SETTINGS" ]; then
        if command -v jq >/dev/null 2>&1; then
            if jq empty "$TARGET_SETTINGS" 2>/dev/null; then
                log_success "Settings: ${TARGET_SETTINGS} (valid JSON)"
            else
                log_error "Settings: ${TARGET_SETTINGS} contains invalid JSON"
                ok=false
            fi
        else
            log_success "Settings: ${TARGET_SETTINGS} (exists, JSON not validated)"
        fi
    fi

    if [ "$ok" = false ]; then
        ERRORS=$((ERRORS + 1))
    fi
}

# ---------------------------------------------------------------------------
# Print install summary
# ---------------------------------------------------------------------------

print_summary() {
    header "Installation Summary"

    local mode_label
    if [ "$INSTALL_MODE" = "global" ]; then
        mode_label="Global (~/.claude/)"
    else
        mode_label="Local (.claude/)"
    fi

    printf "\n"
    printf "  ${BOLD}Mode:${NC}       %s\n" "$mode_label"
    printf "  ${BOLD}Version:${NC}    %s\n" "$VERSION"
    printf "\n"

    if [ "$SKILLS_ONLY" = false ]; then
        printf "  ${BOLD}Hooks:${NC}      %d installed\n" "$INSTALLED_HOOKS"
    fi
    if [ "$HOOKS_ONLY" = false ] && [ "$SKILLS_ONLY" = false ]; then
        printf "  ${BOLD}Agents:${NC}     %d installed\n" "$INSTALLED_AGENTS"
        printf "  ${BOLD}Templates:${NC}  %d installed\n" "$INSTALLED_TEMPLATES"
    fi
    if [ "$HOOKS_ONLY" = false ]; then
        printf "  ${BOLD}Skills:${NC}     %d installed\n" "$INSTALLED_SKILLS"
    fi
    if [ "$BACKED_UP" -gt 0 ]; then
        printf "  ${BOLD}Backups:${NC}    %d file(s) backed up (suffix: %s)\n" "$BACKED_UP" "$BACKUP_SUFFIX"
    fi
    printf "\n"

    if [ "$ERRORS" -gt 0 ]; then
        printf "  ${RED}%d error(s) detected. Check messages above.${NC}\n\n" "$ERRORS"
    else
        printf "  ${GREEN}Installation completed successfully.${NC}\n\n"
    fi
}

# ---------------------------------------------------------------------------
# Print next steps
# ---------------------------------------------------------------------------

print_next_steps() {
    header "Next Steps"

    printf "\n"
    printf "  1. ${BOLD}Set agent role${NC} (for permission-checker):\n"
    printf "     export CLAUDE_AGENT_ROLE=\"project-manager\"\n"
    printf "\n"
    printf "  2. ${BOLD}Initialize project${NC} (in your project directory):\n"
    printf "     cd your-project\n"
    printf "     claude\n"
    printf "     > /project-team init\n"
    printf "\n"
    printf "  3. ${BOLD}Available skills${NC}:\n"
    printf "     /impact analyze <file>    - Analyze change impact\n"
    printf "     /deps show <domain>       - Show domain dependencies\n"
    printf "     /changelog <domain>       - View change history\n"
    printf "     /architecture <domain>    - View architecture docs\n"
    printf "\n"
    printf "  4. ${BOLD}Customize${NC}:\n"
    printf "     Edit .claude/project-team.yaml to enable/disable hooks and agents.\n"
    printf "\n"

    if [ "$INSTALL_MODE" = "global" ]; then
        printf "  ${CYAN}Hooks installed globally will apply to all Claude Code sessions.${NC}\n"
        printf "  ${CYAN}Override per-project with .claude/settings.json if needed.${NC}\n"
    fi
    printf "\n"
}

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------

do_uninstall() {
    header "Uninstalling Claude Project Team"

    if [ -z "$INSTALL_MODE" ]; then
        printf "\n"
        printf "  ${BOLD}1)${NC} Global uninstall  ${CYAN}(~/.claude/)${NC}\n"
        printf "  ${BOLD}2)${NC} Local uninstall    ${CYAN}(.claude/)${NC}\n"
        printf "\n"
        while true; do
            printf "${YELLOW}Select mode [1/2]:${NC} "
            read -r choice
            case "$choice" in
                1) INSTALL_MODE="global"; break ;;
                2) INSTALL_MODE="local"; break ;;
                *) printf "  Please enter 1 or 2.\n" ;;
            esac
        done
    fi

    resolve_targets

    # List of project-team specific files to remove
    local project_team_hooks=(
        "permission-checker.js"
        "standards-validator.js"
        "design-validator.js"
        "interface-validator.js"
        "cross-domain-notifier.js"
        "quality-gate.js"
        "pre-edit-impact-check.js"
        "risk-area-warning.js"
        "architecture-updater.js"
        "changelog-recorder.js"
        "project-team-hooks.json"
    )

    local project_team_agents=(
        "ChiefArchitect.md"
        "ChiefDesigner.md"
        "DBA.md"
        "MaintenanceAnalyst.md"
        "ProjectManager.md"
        "QAManager.md"
        "templates/PartLeader.md"
        "templates/DomainDesigner.md"
        "templates/DomainDeveloper.md"
    )

    local project_team_skills=(
        "impact/SKILL.md"
        "deps/SKILL.md"
        "changelog/SKILL.md"
        "architecture/SKILL.md"
    )

    printf "\n${BOLD}The following will be removed:${NC}\n\n"

    local total=0

    # List hooks
    for f in "${project_team_hooks[@]}"; do
        local target="${TARGET_HOOKS}/${f}"
        if [ -e "$target" ]; then
            printf "  ${RED}x${NC} %s\n" "$target"
            total=$((total + 1))
        fi
    done

    # List agents
    for f in "${project_team_agents[@]}"; do
        local target="${TARGET_AGENTS}/${f}"
        if [ -e "$target" ]; then
            printf "  ${RED}x${NC} %s\n" "$target"
            total=$((total + 1))
        fi
    done

    # List skills
    for f in "${project_team_skills[@]}"; do
        local target="${TARGET_SKILLS}/${f}"
        if [ -e "$target" ]; then
            printf "  ${RED}x${NC} %s\n" "$target"
            total=$((total + 1))
        fi
    done

    # List templates
    if [ -d "$TARGET_TEMPLATES" ]; then
        local tpl_count
        tpl_count="$(find "$TARGET_TEMPLATES" -type f 2>/dev/null | wc -l | tr -d ' ')"
        if [ "$tpl_count" -gt 0 ]; then
            printf "  ${RED}x${NC} %s/ (%d files)\n" "$TARGET_TEMPLATES" "$tpl_count"
            total=$((total + "$tpl_count"))
        fi
    fi

    if [ "$total" -eq 0 ]; then
        log_info "No Claude Project Team files found. Nothing to remove."
        return 0
    fi

    printf "\n"

    if [ "$DRY_RUN" = true ]; then
        log_dry "${total} file(s) would be removed."
        return 0
    fi

    if ! confirm "Remove ${total} file(s)?"; then
        log_info "Uninstall cancelled."
        return 0
    fi

    local removed=0

    # Remove hooks
    for f in "${project_team_hooks[@]}"; do
        local target="${TARGET_HOOKS}/${f}"
        if [ -e "$target" ]; then
            rm -f "$target"
            removed=$((removed + 1))
        fi
    done

    # Remove agents
    for f in "${project_team_agents[@]}"; do
        local target="${TARGET_AGENTS}/${f}"
        if [ -e "$target" ]; then
            rm -f "$target"
            removed=$((removed + 1))
        fi
    done
    # Clean empty agent template dir
    rmdir "${TARGET_AGENTS}/templates" 2>/dev/null || true

    # Remove skills (and empty parent dirs)
    for f in "${project_team_skills[@]}"; do
        local target="${TARGET_SKILLS}/${f}"
        if [ -e "$target" ]; then
            rm -f "$target"
            removed=$((removed + 1))
            rmdir "$(dirname "$target")" 2>/dev/null || true
        fi
    done

    # Remove templates directory
    if [ -d "$TARGET_TEMPLATES" ]; then
        rm -rf "$TARGET_TEMPLATES"
        log_success "Removed templates directory"
    fi

    # Note: We do NOT remove settings.json hook entries automatically
    # to avoid accidentally breaking the user's configuration.
    log_warn "Hook entries in ${TARGET_SETTINGS} were NOT removed."
    log_warn "Manually edit ${TARGET_SETTINGS} to remove project-team hooks if desired."

    printf "\n"
    log_success "Removed ${removed} file(s)."
    printf "\n"
}

# ---------------------------------------------------------------------------
# Main install flow
# ---------------------------------------------------------------------------

do_install() {
    check_prerequisites

    if [ -z "$INSTALL_MODE" ]; then
        prompt_install_mode
    fi

    resolve_targets

    # Show plan
    header "Installation Plan"
    printf "\n"
    printf "  ${BOLD}Mode:${NC}    %s\n" "$INSTALL_MODE"
    printf "  ${BOLD}Target:${NC}  %s\n" "$TARGET_BASE"
    printf "\n"
    printf "  ${BOLD}Components:${NC}\n"
    if [ "$SKILLS_ONLY" = false ]; then
        printf "    - Hooks      -> %s\n" "$TARGET_HOOKS"
    fi
    if [ "$HOOKS_ONLY" = false ] && [ "$SKILLS_ONLY" = false ]; then
        printf "    - Agents     -> %s\n" "$TARGET_AGENTS"
        printf "    - Templates  -> %s\n" "$TARGET_TEMPLATES"
    fi
    if [ "$HOOKS_ONLY" = false ]; then
        printf "    - Skills     -> %s\n" "$TARGET_SKILLS"
    fi
    printf "    - Settings   -> %s\n" "$TARGET_SETTINGS"
    printf "\n"

    if [ "$DRY_RUN" = false ] && [ "$FORCE" = false ]; then
        if ! confirm "Proceed with installation?"; then
            log_info "Installation cancelled."
            exit 0
        fi
    fi

    # Execute installation
    if [ "$SKILLS_ONLY" = false ]; then
        install_hooks
    fi

    if [ "$HOOKS_ONLY" = false ] && [ "$SKILLS_ONLY" = false ]; then
        install_agents
        install_templates
    fi

    if [ "$HOOKS_ONLY" = false ]; then
        install_skills
    fi

    # Always configure settings (for hooks or skills that need it)
    if [ "$SKILLS_ONLY" = false ]; then
        configure_settings
    fi

    # Verify
    if [ "$DRY_RUN" = false ]; then
        verify_installation
    fi

    # Summary
    print_summary
    print_next_steps
}

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

print_banner() {
    if [ "$QUIET" = true ]; then
        return
    fi
    printf "\n"
    printf "${BOLD}  Claude Project Team Installer v${VERSION}${NC}\n"
    printf "  Team-based hooks, agents, and skills for Claude Code\n"
    printf "\n"
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

main() {
    parse_args "$@"
    print_banner

    if [ "$UNINSTALL" = true ]; then
        do_uninstall
    else
        do_install
    fi
}

main "$@"
