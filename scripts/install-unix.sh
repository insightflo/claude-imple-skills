#!/bin/bash

# Claude Impl Tools Installer for Unix/Mac
# This script creates Symbolic Links from the repo to your ~/.claude/skills directory.

SOURCE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../skills" && pwd )"
TARGET_DIR="$HOME/.claude/skills"

mkdir -p "$TARGET_DIR"

for skill_path in "$SOURCE_DIR"/*/; do
    skill_name=$(basename "$skill_path")
    dest_path="$TARGET_DIR/$skill_name"
    
    if [ -d "$dest_path" ] || [ -L "$dest_path" ]; then
        echo "Updating existing skill: $skill_name"
        rm -rf "$dest_path"
    fi
    
    echo "Installing skill: $skill_name"
    ln -s "$skill_path" "$dest_path"
done

echo -e "\nClaude Impl Tools installed successfully!"
echo "Run 'claude config skills' to verify."
