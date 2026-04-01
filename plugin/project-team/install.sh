#!/usr/bin/env bash

set -euo pipefail

VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REGISTRY_SCRIPT="${SCRIPT_DIR}/scripts/install-registry.js"
BACKUP_SUFFIX=".backup-$(date +%Y%m%d%H%M%S)"
MANIFEST_NAME="project-team-install-state.json"
HOOK_CONFIG_NAME="project-team-hooks.json"

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

INSTALL_MODE=""
MODE="lite"
MODE_EXPLICIT=false
HOOKS_ONLY=false
DRY_RUN=false
UNINSTALL=false
FORCE=false
QUIET=false

INSTALLED_HOOKS=0
INSTALLED_AGENTS=0
INSTALLED_TEMPLATES=0
BACKED_UP=0
REMOVED=0
ERRORS=0

TARGET_BASE=""
TARGET_HOOKS=""
TARGET_AGENTS=""
TARGET_TEMPLATES=""
TARGET_SETTINGS=""
TARGET_HOOK_CONFIG=""
TARGET_MANIFEST=""

REGISTRY_MODE_JSON=""
PREVIOUS_STATE_JSON=""
PREVIOUS_HOOK_CONFIG_JSON=""
CURRENT_HOOK_CONFIG_JSON=""
CURRENT_MANAGED_COMMANDS_JSON="[]"
PREVIOUS_MANAGED_COMMANDS_JSON="[]"

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
    # 파이프 실행(curl | bash) 시 stdin이 tty가 아니므로 자동 Yes
    if [ ! -t 0 ]; then
        local prompt="${1:-Continue?}"
        printf "${YELLOW}%s [auto-yes: non-interactive]${NC}\n" "$prompt"
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

usage() {
    cat <<EOF
${BOLD}Claude Project Team Installer v${VERSION}${NC}

Usage: $(basename "$0") [OPTIONS]

${BOLD}Install Scope:${NC}
  --global               Install to ~/.claude/
  --local                Install to .claude/
  (no flag)              Interactive scope selection

${BOLD}Configuration Mode:${NC}
  --mode lite            Canonical MVP topology
  --mode=lite            Same as above
  --mode standard        Lite + specialists + added gates
  --mode full            Standard + compatibility profile surfaces
  --mode team            Agent Teams + governance hooks + AGENT_TEAMS env flag
  (no flag)              Interactive install defaults to lite

${BOLD}Selective Install:${NC}
  --hooks-only           Install hooks + managed settings only

${BOLD}Other Options:${NC}
  --dry-run              Preview changes without writing files
  --uninstall            Remove only manifest-owned Project Team artifacts
  --force                Skip confirmation prompts
  --quiet                Minimal output
  --help, -h             Show this help message

${BOLD}Examples:${NC}
  $(basename "$0") --local --mode lite
  $(basename "$0") --global --mode=standard
  $(basename "$0") --local --mode full --dry-run
  $(basename "$0") --local --mode=team        # Agent Teams + governance hooks
  $(basename "$0") --global --uninstall
EOF
}

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --global) INSTALL_MODE="global" ;;
            --local) INSTALL_MODE="local" ;;
            --mode)
                if [ $# -lt 2 ]; then
                    log_error "--mode requires a value"
                    exit 1
                fi
                MODE="$2"
                MODE_EXPLICIT=true
                shift
                ;;
            --mode=*)
                MODE="${1#--mode=}"
                MODE_EXPLICIT=true
                ;;
            --hooks-only) HOOKS_ONLY=true ;;
            --dry-run) DRY_RUN=true ;;
            --uninstall) UNINSTALL=true ;;
            --force) FORCE=true ;;
            --quiet) QUIET=true ;;
            --help|-h) usage; exit 0 ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
        shift
    done
}

check_prerequisites() {
    header "Checking prerequisites"

    local missing=0
    for dir in hooks agents templates scripts config; do
        if [ ! -e "${SCRIPT_DIR}/${dir}" ]; then
            log_error "Missing source path: ${SCRIPT_DIR}/${dir}"
            missing=$((missing + 1))
        fi
    done
    if [ ! -f "$REGISTRY_SCRIPT" ]; then
        log_error "Missing install registry reader: ${REGISTRY_SCRIPT}"
        missing=$((missing + 1))
    fi
    if [ "$missing" -gt 0 ]; then
        log_error "Source directory appears incomplete. Run from the project-team root."
        exit 1
    fi
    log_success "Source directory verified: ${SCRIPT_DIR}"

    if command -v node >/dev/null 2>&1; then
        local node_version
        node_version="$(node --version 2>/dev/null || echo 'unknown')"
        log_success "Node.js found: ${node_version}"
    else
        log_error "Node.js is required for registry-driven installation."
        exit 1
    fi

    if node "$REGISTRY_SCRIPT" mode "$MODE" >/dev/null 2>&1; then
        log_success "Registry mode verified: ${MODE}"
    else
        log_error "Invalid mode from registry: ${MODE}"
        exit 1
    fi
}

prompt_install_mode() {
    if [ -n "$INSTALL_MODE" ]; then
        return
    fi

    header "Installation Scope"
    printf "\n"
    printf "  ${BOLD}1)${NC} Global install  ${CYAN}(~/.claude/)${NC}\n"
    printf "  ${BOLD}2)${NC} Local install   ${CYAN}(.claude/)${NC}\n"
    printf "\n"

    # 파이프 환경에서는 local(프로젝트) 기본값 — 의도치 않은 전역 설치 방지
    if [ ! -t 0 ]; then
        INSTALL_MODE="local"
        log_info "Non-interactive: defaulting to local (project) install"
        return
    fi

    while true; do
        printf "${YELLOW}Select scope [1/2]:${NC} "
        read -r choice
        case "$choice" in
            1) INSTALL_MODE="global"; break ;;
            2) INSTALL_MODE="local"; break ;;
            *) printf "  Please enter 1 or 2.\n" ;;
        esac
    done
}

prompt_configuration_mode() {
    if [ "$MODE_EXPLICIT" = true ]; then
        return
    fi

    header "Configuration Mode"
    printf "\n"
    printf "  ${BOLD}1)${NC} lite     ${CYAN}(default)${NC}\n"
    printf "  ${BOLD}2)${NC} standard\n"
    printf "  ${BOLD}3)${NC} full\n"
    printf "\n"
    # 파이프 환경에서는 full 기본값 (최대 기능 설치)
    if [ ! -t 0 ]; then
        MODE="full"
        log_info "Non-interactive: defaulting to full mode"
        return
    fi

    printf "${YELLOW}Select mode [1/2/3] (Enter for lite):${NC} "
    read -r choice
    case "$choice" in
        ""|1) MODE="lite" ;;
        2) MODE="standard" ;;
        3) MODE="full" ;;
        *)
            log_warn "Unknown selection '${choice}'. Defaulting to lite."
            MODE="lite"
            ;;
    esac
}

resolve_targets() {
    case "$INSTALL_MODE" in
        global) TARGET_BASE="$HOME/.claude" ;;
        local) TARGET_BASE=".claude" ;;
        *)
            log_error "Invalid install mode: ${INSTALL_MODE}"
            exit 1
            ;;
    esac

    TARGET_HOOKS="${TARGET_BASE}/hooks"
    TARGET_AGENTS="${TARGET_BASE}/agents"
    TARGET_TEMPLATES="${TARGET_BASE}/templates"
    TARGET_SETTINGS="${TARGET_BASE}/settings.json"
    TARGET_HOOK_CONFIG="${TARGET_HOOKS}/${HOOK_CONFIG_NAME}"
    TARGET_MANIFEST="${TARGET_BASE}/${MANIFEST_NAME}"
}

backup_file() {
    local target="$1"
    if [ -e "$target" ]; then
        local backup="${target}${BACKUP_SUFFIX}"
        if [ "$DRY_RUN" = true ]; then
            log_dry "Would backup: ${target} -> ${backup}"
        else
            cp -a "$target" "$backup"
            BACKED_UP=$((BACKED_UP + 1))
        fi
    fi
}

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
    if [[ "$src" == *.js ]] || [[ "$src" == *.sh ]]; then
        chmod +x "$dest"
    fi
}

load_registry_payload() {
    REGISTRY_MODE_JSON="$(node "$REGISTRY_SCRIPT" mode "$MODE")"
}

json_eval() {
    local json="$1"
    local script="$2"
    JSON_INPUT="$json" node -e "$script"
}

registry_description() {
    json_eval "$REGISTRY_MODE_JSON" 'const d = JSON.parse(process.env.JSON_INPUT); console.log(d.description);'
}

registry_role_count() {
    json_eval "$REGISTRY_MODE_JSON" 'const d = JSON.parse(process.env.JSON_INPUT); console.log(d.canonicalRoleCount);'
}

registry_registry_version() {
    json_eval "$REGISTRY_MODE_JSON" 'const d = JSON.parse(process.env.JSON_INPUT); console.log(d.registryVersion || "unknown");'
}

registry_artifact_lines() {
    local category="$1"
    JSON_INPUT="$REGISTRY_MODE_JSON" CATEGORY="$category" node - <<'NODE'
const data = JSON.parse(process.env.JSON_INPUT);
for (const item of data.artifacts[process.env.CATEGORY] || []) {
  process.stdout.write(`${item}\n`);
}
NODE
}

managed_category_lines() {
    if [ "$HOOKS_ONLY" = true ]; then
        printf '%s\n' hooks settings
    else
        printf '%s\n' hooks agents templates settings
    fi
}

desired_artifact_lines() {
    while IFS= read -r category; do
        [ -n "$category" ] || continue
        registry_artifact_lines "$category"
    done < <(managed_category_lines)
}

load_previous_install_state() {
    if [ -f "$TARGET_MANIFEST" ]; then
        PREVIOUS_STATE_JSON="$(<"$TARGET_MANIFEST")"
    else
        PREVIOUS_STATE_JSON=""
    fi

    if [ -f "$TARGET_HOOK_CONFIG" ]; then
        PREVIOUS_HOOK_CONFIG_JSON="$(<"$TARGET_HOOK_CONFIG")"
    else
        PREVIOUS_HOOK_CONFIG_JSON=""
    fi

    PREVIOUS_MANAGED_COMMANDS_JSON="$(PREVIOUS_STATE_JSON="$PREVIOUS_STATE_JSON" PREVIOUS_HOOK_CONFIG_JSON="$PREVIOUS_HOOK_CONFIG_JSON" node - <<'NODE'
const unique = (values) => [...new Set(values.filter(Boolean))].sort();
const commands = [];
if (process.env.PREVIOUS_STATE_JSON) {
  const state = JSON.parse(process.env.PREVIOUS_STATE_JSON);
  commands.push(...(state.managedCommands || []));
}
if (process.env.PREVIOUS_HOOK_CONFIG_JSON) {
  const config = JSON.parse(process.env.PREVIOUS_HOOK_CONFIG_JSON);
  commands.push(...(((config.managed || {}).commands) || []));
}
// Also track .cjs variants so re-install cleans up hooks that were manually renamed .js→.cjs
const withCjsVariants = [];
for (const cmd of commands) {
  withCjsVariants.push(cmd);
  if (cmd.includes('.js"')) {
    withCjsVariants.push(cmd.split('.js"').join('.cjs"'));
  }
}
process.stdout.write(JSON.stringify(unique(withCjsVariants)));
NODE
)"
}

previous_artifact_lines_for_managed_categories() {
    PREVIOUS_STATE_JSON="$PREVIOUS_STATE_JSON" HOOKS_ONLY="$HOOKS_ONLY" node - <<'NODE'
if (!process.env.PREVIOUS_STATE_JSON) {
  process.exit(0);
}
const state = JSON.parse(process.env.PREVIOUS_STATE_JSON);
const categories = process.env.HOOKS_ONLY === 'true'
  ? ['hooks', 'settings']
  : ['hooks', 'agents', 'templates', 'settings'];
for (const category of categories) {
  for (const item of (((state.categories || {})[category]) || [])) {
    process.stdout.write(`${item}\n`);
  }
}
NODE
}

install_project_scripts() {
    header "Installing Project Scripts"

    local scripts_src="${SCRIPT_DIR}/scripts"
    local services_src="${SCRIPT_DIR}/services"
    local target_scripts="${TARGET_BASE}/project-team/scripts"
    local target_script_aliases="${TARGET_BASE}/scripts"
    local target_services="${TARGET_BASE}/services"
    local count=0
    local service_count=0

    if [ ! -d "$scripts_src" ]; then
        log_warn "Project scripts directory not found: ${scripts_src}"
        return
    fi

    while IFS= read -r -d '' scriptfile; do
        local relpath="${scriptfile#${scripts_src}/}"
        local dest="${target_scripts}/${relpath}"

        install_file "$scriptfile" "$dest"
        install_file "$scriptfile" "${target_script_aliases}/${relpath}"
        count=$((count + 1))

        if [ "$QUIET" = false ] && [ "$DRY_RUN" = false ]; then
            log_success "  ${relpath}"
        fi
    done < <(find "$scripts_src" -type f \( -name '*.js' -o -name '*.sh' \) -print0 | sort -z)

    if [ -d "$services_src" ]; then
        while IFS= read -r -d '' servicefile; do
            local relpath="${servicefile#${services_src}/}"
            local dest="${target_services}/${relpath}"

            install_file "$servicefile" "$dest"
            service_count=$((service_count + 1))

            if [ "$QUIET" = false ] && [ "$DRY_RUN" = false ]; then
                log_success "  services/${relpath}"
            fi
        done < <(find "$services_src" -type f -name '*.js' -print0 | sort -z)
    fi

    if [ "$count" -eq 0 ] && [ "$service_count" -eq 0 ]; then
        log_warn "No project runtime files selected for install"
        return
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "${count} project script(s) and ${service_count} service file(s) would be installed"
    else
        log_success "${count} project script(s) installed to ${target_scripts}"
        log_success "${count} script alias file(s) installed to ${target_script_aliases}"
        if [ "$service_count" -gt 0 ]; then
            log_success "${service_count} service file(s) installed to ${target_services}"
        fi
    fi
}

cleanup_stale_owned_artifacts() {
    local desired_file previous_file stale_lines relpath
    desired_file="$(mktemp)"
    previous_file="$(mktemp)"

    desired_artifact_lines | sort -u > "$desired_file"
    previous_artifact_lines_for_managed_categories | sort -u > "$previous_file"

    stale_lines=""
    while IFS= read -r relpath; do
        [ -n "$relpath" ] || continue
        if ! grep -Fqx "$relpath" "$desired_file"; then
            stale_lines="${stale_lines}${relpath}"$'\n'
        fi
    done < "$previous_file"

    if [ -z "$stale_lines" ]; then
        rm -f "$desired_file" "$previous_file"
        return
    fi

    header "Cleaning Stale Owned Artifacts"
    while IFS= read -r relpath; do
        [ -n "$relpath" ] || continue
        local target="${TARGET_BASE}/${relpath}"
        if [ ! -e "$target" ]; then
            continue
        fi
        if [ "$DRY_RUN" = true ]; then
            log_dry "Would remove stale owned artifact: ${target}"
        else
            rm -f "$target"
            REMOVED=$((REMOVED + 1))
            log_success "Removed stale owned artifact: ${target}"
            prune_empty_parent_dirs "$target"
        fi
    done <<< "$stale_lines"

    rm -f "$desired_file" "$previous_file"
}

prune_empty_parent_dirs() {
    local target="$1"
    local current
    current="$(dirname "$target")"
    while [ "$current" != "$TARGET_BASE" ] && [ "$current" != "." ] && [ -n "$current" ]; do
        rmdir "$current" 2>/dev/null || break
        current="$(dirname "$current")"
    done
}

install_registry_category() {
    local category="$1"
    local count=0
    local label

    case "$category" in
        hooks) label="Hooks" ;;
        agents) label="Agents" ;;
        templates) label="Templates" ;;
        *)
            log_error "Unsupported install category: ${category}"
            exit 1
            ;;
    esac

    header "Installing ${label}"
    while IFS= read -r relpath; do
        [ -n "$relpath" ] || continue
        local src="${SCRIPT_DIR}/${relpath}"
        local dest="${TARGET_BASE}/${relpath}"

        if [ ! -e "$src" ]; then
            log_error "Registry artifact missing from repository: ${src}"
            exit 1
        fi

        install_file "$src" "$dest"
        # If installing a .js hook, remove stale .cjs with same base name to prevent duplicate registration
        if [[ "$dest" == *.js ]] && [ "$DRY_RUN" = false ]; then
            local cjs_dest="${dest%.js}.cjs"
            if [ -f "$cjs_dest" ]; then
                rm -f "$cjs_dest"
                log_warn "Removed stale .cjs: $(basename "$cjs_dest") (superseded by .js)"
            fi
        fi
        count=$((count + 1))
        if [ "$QUIET" = false ] && [ "$DRY_RUN" = false ]; then
            log_success "  ${relpath}"
        fi
    done < <(registry_artifact_lines "$category")

    case "$category" in
        hooks) INSTALLED_HOOKS=$count ;;
        agents) INSTALLED_AGENTS=$count ;;
        templates) INSTALLED_TEMPLATES=$count ;;
    esac

    if [ "$DRY_RUN" = true ]; then
        log_dry "${count} ${category} artifact(s) would be installed"
    else
        log_success "${count} ${category} artifact(s) installed"
    fi
}

build_hook_config_json() {
    local hooks_path
    if [ "$INSTALL_MODE" = "global" ]; then
        hooks_path='${HOME}/.claude/hooks'
    else
        hooks_path='${CLAUDE_PROJECT_DIR:-.}/.claude/hooks'
    fi

    REGISTRY_MODE_JSON="$REGISTRY_MODE_JSON" INSTALL_MODE="$INSTALL_MODE" HOOKS_PATH="$hooks_path" node - <<'NODE'
const path = require('path');
const payload = JSON.parse(process.env.REGISTRY_MODE_JSON);
const defs = [...payload.hooks.active, ...payload.hooks.helpers];
const grouped = {};
const commands = [];

for (const def of defs) {
  const event = def.event;
  const matcher = def.matcher || null;
  const key = `${event}::${matcher || ''}`;
  if (!grouped[key]) {
    grouped[key] = { event, matcher, hooks: [] };
  }
  const command = `node "${process.env.HOOKS_PATH}/${path.basename(def.artifact)}"`;
  commands.push(command);
  grouped[key].hooks.push({
    type: 'command',
    command,
    timeout: event === 'Stop' ? 10 : 5,
    statusMessage: `Running ${def.name}...`
  });
}

const hooks = {};
for (const entry of Object.values(grouped)) {
  if (!hooks[entry.event]) {
    hooks[entry.event] = [];
  }
  const group = { hooks: entry.hooks };
  if (entry.matcher) {
    group.matcher = entry.matcher;
  }
  hooks[entry.event].push(group);
}

process.stdout.write(`${JSON.stringify({
  managed: {
    installer: 'project-team',
    registryVersion: payload.registryVersion || 'unknown',
    mode: payload.mode,
    installMode: process.env.INSTALL_MODE,
    commands: [...new Set(commands)].sort()
  },
  hooks
}, null, 2)}\n`);
NODE
}

write_hook_config_file() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would write hook configuration to ${TARGET_HOOK_CONFIG}"
        return
    fi

    mkdir -p "$(dirname "$TARGET_HOOK_CONFIG")"
    printf '%s\n' "$CURRENT_HOOK_CONFIG_JSON" > "$TARGET_HOOK_CONFIG"
    log_success "Hook configuration saved: ${TARGET_HOOK_CONFIG}"
}

merge_settings_json() {
    local new_commands_json
    new_commands_json="$(json_eval "$CURRENT_HOOK_CONFIG_JSON" 'const d = JSON.parse(process.env.JSON_INPUT); process.stdout.write(JSON.stringify(((d.managed || {}).commands) || []));')"
    CURRENT_MANAGED_COMMANDS_JSON="$new_commands_json"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would reconcile managed Project Team hook groups in ${TARGET_SETTINGS}"
        return
    fi

    local original existing_output updated changed
    original='{}'
    if [ -f "$TARGET_SETTINGS" ]; then
        if ! node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));' "$TARGET_SETTINGS" >/dev/null 2>&1; then
            log_error "Existing settings file is not valid JSON: ${TARGET_SETTINGS}"
            exit 1
        fi
        original="$(<"$TARGET_SETTINGS")"
    fi

    existing_output="$(TARGET_SETTINGS="$TARGET_SETTINGS" ORIGINAL_JSON="$original" PREVIOUS_MANAGED_COMMANDS_JSON="$PREVIOUS_MANAGED_COMMANDS_JSON" CURRENT_HOOK_CONFIG_JSON="$CURRENT_HOOK_CONFIG_JSON" INSTALL_MODE_NAME="$MODE" node - <<'NODE'
function parseJson(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

const currentConfig = parseJson(process.env.CURRENT_HOOK_CONFIG_JSON, { hooks: {}, managed: { commands: [] } });
const managedCommands = new Set(parseJson(process.env.PREVIOUS_MANAGED_COMMANDS_JSON, []).filter(Boolean));
const existing = parseJson(process.env.ORIGINAL_JSON, {});
const inputHooks = existing && typeof existing === 'object' && !Array.isArray(existing) ? (existing.hooks || {}) : {};
const outputHooks = {};

for (const [event, groups] of Object.entries(inputHooks || {})) {
  if (!Array.isArray(groups)) {
    outputHooks[event] = groups;
    continue;
  }
  const keptGroups = [];
  for (const group of groups) {
    if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) {
      keptGroups.push(group);
      continue;
    }
    const keptHooks = group.hooks.filter((hook) => !managedCommands.has(hook && hook.command));
    if (keptHooks.length > 0) {
      keptGroups.push({ ...group, hooks: keptHooks });
    }
  }
  if (keptGroups.length > 0) {
    outputHooks[event] = keptGroups;
  }
}

for (const [event, groups] of Object.entries(currentConfig.hooks || {})) {
  if (!outputHooks[event]) {
    outputHooks[event] = [];
  }
  outputHooks[event] = outputHooks[event].concat(groups);
}

const result = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
if (Object.keys(outputHooks).length > 0) {
  result.hooks = outputHooks;
} else {
  delete result.hooks;
}

// Agent Teams 모드일 때 실험적 기능 플래그 및 tmux 모드 추가
if (process.env.INSTALL_MODE_NAME === 'team') {
  result.env = { ...(result.env || {}), CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' };
  result.preferences = { ...(result.preferences || {}), teammateMode: 'tmux' };
} else if (result.env && result.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) {
  delete result.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  if (Object.keys(result.env).length === 0) delete result.env;
}

const originalSerialized = `${JSON.stringify(parseJson(process.env.ORIGINAL_JSON, {}), null, 2)}\n`;
const resultSerialized = `${JSON.stringify(result, null, 2)}\n`;
process.stdout.write(JSON.stringify({ changed: originalSerialized !== resultSerialized, content: resultSerialized }));
NODE
)"
    changed="$(JSON_INPUT="$existing_output" node -e 'const d = JSON.parse(process.env.JSON_INPUT); process.stdout.write(String(d.changed));')"
    updated="$(JSON_INPUT="$existing_output" node -e 'const d = JSON.parse(process.env.JSON_INPUT); process.stdout.write(d.content);')"

    if [ "$changed" = "true" ] && [ -f "$TARGET_SETTINGS" ]; then
        backup_file "$TARGET_SETTINGS"
    fi
    printf '%s' "$updated" > "$TARGET_SETTINGS"
    log_success "Updated ${TARGET_SETTINGS} with Project Team managed hook groups"
}

write_install_manifest() {
    local desired_json previous_state_for_merge manifest_json category_lines
    category_lines="$(managed_category_lines)"
    desired_json="$(CATEGORY_LINES="$category_lines" REGISTRY_MODE_JSON="$REGISTRY_MODE_JSON" node - <<'NODE'
const payload = JSON.parse(process.env.REGISTRY_MODE_JSON);
const categories = (process.env.CATEGORY_LINES || '').split(/\n+/).filter(Boolean);
const out = {};
for (const category of categories) {
  out[category] = [...new Set((payload.artifacts[category] || []))].sort();
}
process.stdout.write(JSON.stringify(out));
NODE
)"

    previous_state_for_merge="$PREVIOUS_STATE_JSON"
    manifest_json="$(DESIRED_CATEGORIES_JSON="$desired_json" PREVIOUS_STATE_JSON="$previous_state_for_merge" HOOKS_ONLY="$HOOKS_ONLY" REGISTRY_MODE_JSON="$REGISTRY_MODE_JSON" CURRENT_MANAGED_COMMANDS_JSON="$CURRENT_MANAGED_COMMANDS_JSON" INSTALL_MODE="$INSTALL_MODE" node - <<'NODE'
const payload = JSON.parse(process.env.REGISTRY_MODE_JSON);
const desired = JSON.parse(process.env.DESIRED_CATEGORIES_JSON || '{}');
const previous = process.env.PREVIOUS_STATE_JSON ? JSON.parse(process.env.PREVIOUS_STATE_JSON) : {};
const categories = process.env.HOOKS_ONLY === 'true'
  ? ['hooks', 'settings']
  : ['hooks', 'agents', 'templates', 'settings'];
const nextCategories = { ...(previous.categories || {}) };
for (const category of categories) {
  nextCategories[category] = desired[category] || [];
}
for (const category of ['hooks', 'agents', 'templates', 'settings']) {
  if (!Array.isArray(nextCategories[category])) {
    nextCategories[category] = [];
  }
  nextCategories[category] = [...new Set(nextCategories[category])].sort();
}
const ownedArtifacts = [...new Set(Object.values(nextCategories).flat())].sort();
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  installer: 'project-team',
  registryVersion: payload.registryVersion || 'unknown',
  installMode: process.env.INSTALL_MODE,
  mode: payload.mode,
  hooksOnly: process.env.HOOKS_ONLY === 'true',
  generatedAt: new Date().toISOString(),
  categories: nextCategories,
  managedCommands: JSON.parse(process.env.CURRENT_MANAGED_COMMANDS_JSON || '[]'),
  ownedArtifacts
}, null, 2)}\n`);
NODE
)"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would write ownership manifest to ${TARGET_MANIFEST}"
        return
    fi

    mkdir -p "$(dirname "$TARGET_MANIFEST")"
    printf '%s' "$manifest_json" > "$TARGET_MANIFEST"
    log_success "Ownership manifest saved: ${TARGET_MANIFEST}"
}

configure_settings() {
    header "Configuring Hook Settings"
    CURRENT_HOOK_CONFIG_JSON="$(build_hook_config_json)"
    write_hook_config_file
    merge_settings_json
    validate_stop_hooks_in_settings
}

# Verify that Stop-event hooks from the config were actually written to settings.json.
# If any are missing (e.g. due to a merge edge-case), append them directly.
validate_stop_hooks_in_settings() {
    [ "$DRY_RUN" = true ] && return

    CURRENT_HOOK_CONFIG_JSON="$CURRENT_HOOK_CONFIG_JSON" TARGET_SETTINGS="$TARGET_SETTINGS" node - <<'NODE'
const fs = require('fs');
const configHooks = (JSON.parse(process.env.CURRENT_HOOK_CONFIG_JSON || '{}')).hooks || {};
const stopGroups = configHooks['Stop'];
if (!stopGroups || stopGroups.length === 0) process.exit(0); // nothing to check

const settingsPath = process.env.TARGET_SETTINGS;
let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { process.exit(0); }

const settingsStop = (settings.hooks || {})['Stop'] || [];
const existingCmds = new Set(settingsStop.flatMap(g => (g.hooks || []).map(h => h.command)));

const missingGroups = stopGroups.filter(g =>
  (g.hooks || []).some(h => !existingCmds.has(h.command))
);
if (missingGroups.length === 0) process.exit(0);

// Append missing Stop groups to settings.json
if (!settings.hooks) settings.hooks = {};
if (!settings.hooks['Stop']) settings.hooks['Stop'] = [];
settings.hooks['Stop'] = settings.hooks['Stop'].concat(missingGroups);
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
process.stderr.write(`[validate_stop_hooks] Repaired ${missingGroups.length} missing Stop hook group(s) in settings.json\n`);
NODE
}

remove_managed_settings_entries() {
    local commands_json="$1"

    if [ ! -f "$TARGET_SETTINGS" ] || [ "$commands_json" = "[]" ]; then
        return
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would remove Project Team managed hook entries from ${TARGET_SETTINGS}"
        return
    fi

    if ! node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));' "$TARGET_SETTINGS" >/dev/null 2>&1; then
        log_warn "Skipping settings cleanup because JSON is invalid: ${TARGET_SETTINGS}"
        return
    fi

    local original result_json changed updated
    original="$(<"$TARGET_SETTINGS")"
    result_json="$(ORIGINAL_JSON="$original" COMMANDS_JSON="$commands_json" node - <<'NODE'
function parseJson(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

const original = parseJson(process.env.ORIGINAL_JSON, {});
const commands = new Set(parseJson(process.env.COMMANDS_JSON, []).filter(Boolean));
const result = original && typeof original === 'object' && !Array.isArray(original) ? { ...original } : {};
const nextHooks = {};

for (const [event, groups] of Object.entries(result.hooks || {})) {
  if (!Array.isArray(groups)) {
    nextHooks[event] = groups;
    continue;
  }
  const keptGroups = [];
  for (const group of groups) {
    if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) {
      keptGroups.push(group);
      continue;
    }
    const keptHooks = group.hooks.filter((hook) => !commands.has(hook && hook.command));
    if (keptHooks.length > 0) {
      keptGroups.push({ ...group, hooks: keptHooks });
    }
  }
  if (keptGroups.length > 0) {
    nextHooks[event] = keptGroups;
  }
}

if (Object.keys(nextHooks).length > 0) {
  result.hooks = nextHooks;
} else {
  delete result.hooks;
}

const originalSerialized = `${JSON.stringify(parseJson(process.env.ORIGINAL_JSON, {}), null, 2)}\n`;
const resultSerialized = `${JSON.stringify(result, null, 2)}\n`;
process.stdout.write(JSON.stringify({ changed: originalSerialized !== resultSerialized, content: resultSerialized }));
NODE
)"
    changed="$(JSON_INPUT="$result_json" node -e 'const d = JSON.parse(process.env.JSON_INPUT); process.stdout.write(String(d.changed));')"
    updated="$(JSON_INPUT="$result_json" node -e 'const d = JSON.parse(process.env.JSON_INPUT); process.stdout.write(d.content);')"

    if [ "$changed" = "true" ]; then
        backup_file "$TARGET_SETTINGS"
        printf '%s' "$updated" > "$TARGET_SETTINGS"
        log_success "Removed Project Team managed hook entries from ${TARGET_SETTINGS}"
    fi
}

verify_installation() {
    header "Verifying Installation"

    local ok=true
    local category relpath target

    for category in hooks settings; do
        while IFS= read -r relpath; do
            [ -n "$relpath" ] || continue
            target="${TARGET_BASE}/${relpath}"
            if [ -e "$target" ]; then
                log_success "Present: ${target}"
            else
                log_error "Missing: ${target}"
                ok=false
            fi
        done < <(registry_artifact_lines "$category")
    done

    if [ "$HOOKS_ONLY" = false ]; then
        for category in agents templates; do
            while IFS= read -r relpath; do
                [ -n "$relpath" ] || continue
                target="${TARGET_BASE}/${relpath}"
                if [ -e "$target" ]; then
                    log_success "Present: ${target}"
                else
                    log_error "Missing: ${target}"
                    ok=false
                fi
            done < <(registry_artifact_lines "$category")
        done
    fi

    if node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));' "$TARGET_SETTINGS" >/dev/null 2>&1; then
        log_success "Settings JSON is valid"
    else
        log_error "Settings JSON is invalid: ${TARGET_SETTINGS}"
        ok=false
    fi

    if [ "$ok" = false ]; then
        ERRORS=$((ERRORS + 1))
        return 1
    fi
}

print_summary() {
    header "Installation Summary"
    printf "\n"
    printf "  ${BOLD}Scope:${NC}        %s\n" "$INSTALL_MODE"
    printf "  ${BOLD}Mode:${NC}         %s\n" "$MODE"
    printf "  ${BOLD}Topology:${NC}     %s roles\n" "$(registry_role_count)"
    printf "  ${BOLD}Registry:${NC}     %s\n" "$(registry_registry_version)"
    printf "  ${BOLD}Description:${NC}  %s\n" "$(registry_description)"
    printf "\n"
    printf "  ${BOLD}Hooks:${NC}        %d installed\n" "$INSTALLED_HOOKS"
    if [ "$HOOKS_ONLY" = false ]; then
        printf "  ${BOLD}Agents:${NC}       %d installed\n" "$INSTALLED_AGENTS"
        printf "  ${BOLD}Templates:${NC}    %d installed\n" "$INSTALLED_TEMPLATES"
    fi
    printf "  ${BOLD}Removed:${NC}      %d stale artifact(s)\n" "$REMOVED"
    if [ "$BACKED_UP" -gt 0 ]; then
        printf "  ${BOLD}Backups:${NC}      %d\n" "$BACKED_UP"
    fi
    printf "\n"
    if [ "$ERRORS" -gt 0 ]; then
        printf "  ${RED}%d error(s) detected.${NC}\n\n" "$ERRORS"
    else
        printf "  ${GREEN}Installation completed successfully.${NC}\n\n"
    fi
}

print_next_steps() {
    header "Next Steps"
    printf "\n"
    printf "  1. Review ${TARGET_MANIFEST} for manifest-owned artifacts.\n"
    printf "  2. Review ${TARGET_SETTINGS} if you want to customize non-project-team hooks.\n"
    printf "  3. Re-run with a different --mode to upgrade or downgrade managed groups safely.\n"
    printf "\n"
}

do_uninstall() {
    header "Uninstalling Claude Project Team"

    if [ -z "$INSTALL_MODE" ]; then
        # 파이프 환경에서는 global 기본값
        if [ ! -t 0 ]; then
            INSTALL_MODE="global"
            log_info "Non-interactive: defaulting to global uninstall"
        else
            printf "\n"
            printf "  ${BOLD}1)${NC} Global uninstall  ${CYAN}(~/.claude/)${NC}\n"
            printf "  ${BOLD}2)${NC} Local uninstall   ${CYAN}(.claude/)${NC}\n"
            printf "\n"
            while true; do
                printf "${YELLOW}Select scope [1/2]:${NC} "
                read -r choice
                case "$choice" in
                    1) INSTALL_MODE="global"; break ;;
                    2) INSTALL_MODE="local"; break ;;
                    *) printf "  Please enter 1 or 2.\n" ;;
                esac
            done
        fi
    fi

    resolve_targets
    load_previous_install_state

    local listed=0
    if [ -n "$PREVIOUS_STATE_JSON" ]; then
        printf "\n${BOLD}Manifest-owned artifacts to remove:${NC}\n\n"
        while IFS= read -r relpath; do
            [ -n "$relpath" ] || continue
            local target="${TARGET_BASE}/${relpath}"
            if [ -e "$target" ]; then
                printf "  ${RED}x${NC} %s\n" "$target"
                listed=$((listed + 1))
            fi
        done < <(PREVIOUS_STATE_JSON="$PREVIOUS_STATE_JSON" node - <<'NODE'
const state = JSON.parse(process.env.PREVIOUS_STATE_JSON);
for (const item of state.ownedArtifacts || []) {
  process.stdout.write(`${item}\n`);
}
NODE
)
    fi

    if [ "$PREVIOUS_MANAGED_COMMANDS_JSON" != "[]" ]; then
        printf "  ${RED}x${NC} %s (managed hook entries only)\n" "$TARGET_SETTINGS"
        listed=$((listed + 1))
    fi

    if [ "$listed" -eq 0 ]; then
        log_info "No manifest-owned Project Team artifacts found. Nothing to remove."
        return 0
    fi

    printf "\n"
    if [ "$DRY_RUN" = true ]; then
        log_dry "${listed} uninstall action(s) would be performed."
        return 0
    fi

    if ! confirm "Remove manifest-owned Project Team artifacts?"; then
        log_info "Uninstall cancelled."
        return 0
    fi

    remove_managed_settings_entries "$PREVIOUS_MANAGED_COMMANDS_JSON"

    if [ -n "$PREVIOUS_STATE_JSON" ]; then
        while IFS= read -r relpath; do
            [ -n "$relpath" ] || continue
            local target="${TARGET_BASE}/${relpath}"
            if [ -e "$target" ]; then
                rm -f "$target"
                REMOVED=$((REMOVED + 1))
                log_success "Removed ${target}"
                prune_empty_parent_dirs "$target"
            fi
        done < <(PREVIOUS_STATE_JSON="$PREVIOUS_STATE_JSON" node - <<'NODE'
const state = JSON.parse(process.env.PREVIOUS_STATE_JSON);
for (const item of state.ownedArtifacts || []) {
  process.stdout.write(`${item}\n`);
}
NODE
)
    elif [ -f "$TARGET_HOOK_CONFIG" ]; then
        rm -f "$TARGET_HOOK_CONFIG"
        REMOVED=$((REMOVED + 1))
        log_success "Removed ${TARGET_HOOK_CONFIG}"
        prune_empty_parent_dirs "$TARGET_HOOK_CONFIG"
    fi

    printf "\n"
    log_success "Uninstall completed. Removed ${REMOVED} manifest-owned artifact(s)."
    printf "\n"
}

## install_agent_teams_leads() — REMOVED
## Agent Teams 네이티브 모드에서는 글로벌 에이전트 파일 불필요.
## 메인 세션이 lead 역할, teammate는 프롬프트로 역할 정의.

do_install() {
    prompt_install_mode
    prompt_configuration_mode
    check_prerequisites
    resolve_targets
    load_registry_payload
    load_previous_install_state

    header "Installation Plan"
    printf "\n"
    printf "  ${BOLD}Scope:${NC}        %s\n" "$INSTALL_MODE"
    printf "  ${BOLD}Mode:${NC}         %s\n" "$MODE"
    printf "  ${BOLD}Topology:${NC}     %s roles\n" "$(registry_role_count)"
    printf "  ${BOLD}Description:${NC}  %s\n" "$(registry_description)"
    printf "  ${BOLD}Target:${NC}       %s\n" "$TARGET_BASE"
    printf "\n"

    if [ "$DRY_RUN" = false ] && [ "$FORCE" = false ]; then
        if ! confirm "Proceed with installation?"; then
            log_info "Installation cancelled."
            exit 0
        fi
    fi

    cleanup_stale_owned_artifacts
    install_registry_category hooks
    if [ "$HOOKS_ONLY" = false ]; then
        install_registry_category agents
        install_registry_category templates
    fi

    # Team 모드: 글로벌 에이전트 설치 제거됨 (Agent Teams 네이티브는 프롬프트 기반)
    if [ "$HOOKS_ONLY" = false ]; then
        install_project_scripts
    fi
    configure_settings
    write_install_manifest

    if [ "$DRY_RUN" = false ]; then
        verify_installation
    fi

    print_summary
    print_next_steps
}

print_banner() {
    if [ "$QUIET" = true ]; then
        return
    fi
    printf "\n"
    printf "${BOLD}  Claude Project Team Installer v${VERSION}${NC}\n"
    printf "  Registry-driven hooks, agents, templates, and cleanup\n"
    printf "\n"
}

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
