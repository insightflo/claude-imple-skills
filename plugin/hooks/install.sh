#!/bin/bash
# Context Monitor Hooks Installer

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SETTINGS_FILE="${1:-.claude/settings.json}"

# settings.json이 없으면 생성
if [ ! -f "$SETTINGS_FILE" ]; then
    mkdir -p "$(dirname "$SETTINGS_FILE")"
    echo '{}' > "$SETTINGS_FILE"
fi

# 훅 등록 (jq 사용)
if command -v jq &> /dev/null; then
    # PostToolUse 훅 추가
    jq '.hooks.PostToolUse += [{"matcher": "", "hooks": [{"type": "command", "command": "node '"$PLUGIN_ROOT"'/hooks/context-monitor.js"}]}]' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"

    # Statusline 훅 추가
    jq '.hooks.Statusline += [{"matcher": "", "hooks": [{"type": "command", "command": "node '"$PLUGIN_ROOT"'/hooks/statusline-ctx-bridge.js"}]}]' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"

    echo "✅ Context monitor hooks registered in $SETTINGS_FILE"
else
    echo "❌ jq not found. Please install jq or manually add hooks to settings.json"
    exit 1
fi
