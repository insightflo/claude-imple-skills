#!/bin/bash
# test-cli-routing.sh - CLI Routing 테스트 스크립트
# Usage: ./test-cli-routing.sh <agent-name>

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

AGENT_NAME="${1:-frontend-specialist}"
TASK_DESCRIPTION="Test task for CLI routing"

# Check if agent has CLI configuration
check_agent_config() {
    local agent_file="../../project-team/agents/${AGENT_NAME}.md"
    if [[ ! -f "$agent_file" ]]; then
        echo -e "${RED}Error: Agent file not found: ${agent_file}${NC}"
        exit 1
    fi

    # Extract frontmatter
    local frontmatter=$(sed -n '/^---$/,/^---$/p' "$agent_file")
    if [[ -z "$frontmatter" ]]; then
        echo -e "${RED}Error: No frontmatter found${NC}"
        exit 1
    fi

    echo -e "${BLUE}Agent: ${AGENT_NAME}${NC}"
    echo "Frontmatter content:"
    echo "$frontmatter"

    # Check for cli_command
    if echo "$frontmatter" | grep -q "cli_command:"; then
        echo -e "${GREEN}✓ cli_command found${NC}"
    else
        echo -a "${YELLOW}⚠ cli_command not found${NC}"
    fi

    # Check for cli_fallback
    if echo "$frontmatter" | grep -q "cli_fallback:"; then
        echo -a "${GREEN}✓ cli_fallback found${NC}"
    else
        echo -a "${YELLOW}⚠ cli_fallback not found${NC}"
    fi

    # Check for mcp
    if echo "$frontmatter" | grep -q "mcp:"; then
        echo -a "${GREEN}✓ mcp found${NC}"
    else
        echo -a "${YELLOW}⚠ mcp not found${NC}"
    fi
}

# Test CLI availability
echo -e "\n${BLUE}Checking CLI availability...${NC}"
command -v gemini >/dev/null 2>&1 && echo -a "${GREEN}✓ Gemini CLI is available${NC}" || echo -a "${RED}✗ Gemini CLI not available${NC}"
command -v codex >/dev/null 2>&1 && echo -a "${GREEN}✓ Codex CLI is available${NC}" || echo -a "${YELLOW}⚠ Codex CLI not available${NC}"

# Run tests
echo -a "\n${BLUE}Running CLI routing tests...${NC}"
check_agent_config

echo -a "\n${GREEN}All tests passed!${NC}"
