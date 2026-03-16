# Multi-AI Review Examples

## Basic Usage

### Code Review

```bash
# Run directly via CLI
./skills/multi-ai-review/scripts/council.sh "Review this code for security vulnerabilities"

# Request from Claude Code
"Review this file, convene the council"
```

### Architecture Review

```bash
./skills/multi-ai-review/scripts/council.sh "Review whether this microservice architecture is scalable"
```

### Planning Document Review

```bash
./skills/multi-ai-review/scripts/council.sh "Review this PRD for completeness and feasibility"
```

## Job Mode Examples

### 1. Start a Job

```bash
JOB_DIR=$(./skills/multi-ai-review/scripts/council.sh start "Review request content")
echo "Job started: $JOB_DIR"
```

### 2. Monitor Progress

```bash
# JSON format
./skills/multi-ai-review/scripts/council.sh status "$JOB_DIR"

# Text format
./skills/multi-ai-review/scripts/council.sh status --text "$JOB_DIR"

# Verbose output
./skills/multi-ai-review/scripts/council.sh status --text --verbose "$JOB_DIR"
```

### 3. Check Results

```bash
# Text format
./skills/multi-ai-review/scripts/council.sh results "$JOB_DIR"

# JSON format
./skills/multi-ai-review/scripts/council.sh results --json "$JOB_DIR"
```

### 4. Clean Up

```bash
./skills/multi-ai-review/scripts/council.sh clean "$JOB_DIR"
```

## Claude Code Integration Examples

### Keyword Triggers

```
User: "Review this code"
User: "Convene the council"
User: "Get opinions from multiple AIs"
User: "Let's hear what Gemini and Codex think"
```

### Review Result Example

```markdown
## 💎 Gemini (Creative Reviewer)

### Positive Evaluation
- Code structure is clear
- Error handling is well implemented

### Improvement Suggestions
1. **[High]** Performance optimization needed
2. **[Medium]** Accessibility improvements recommended

### Alternative Ideas
- Consider adding a caching layer

---

## 🤖 Codex (Technical Reviewer)

### Architecture Evaluation
- SOLID principles compliance is good
- Dependency injection pattern is appropriate

### Improvement Suggestions
1. **[Critical]** SQL injection vulnerability
2. **[High]** Insufficient test coverage

---

## 🧠 Claude (Chairman Synthesis)

### Final Verdict
- **Status**: Conditional Approval
- **Consensus Rate**: 75%

### Priority Improvements
1. Fix SQL injection (Critical)
2. Performance optimization (High)
3. Improve test coverage (High)
```

## Configuration Examples

### Minimal Configuration

```yaml
council:
  members:
    - name: gemini
      command: "gemini"
      emoji: "💎"
      color: "GREEN"
  chairman:
    role: "auto"
  settings:
    timeout: 60
```

### Full Configuration

```yaml
council:
  members:
    - name: gemini
      command: "gemini"
      emoji: "💎"
      color: "GREEN"

    - name: codex
      command: "codex exec"
      emoji: "🤖"
      color: "BLUE"

  chairman:
    role: "auto"
    description: "Synthesizes all opinions and provides final recommendation"

  settings:
    timeout: 120
    exclude_chairman_from_members: true
```

## Error Handling Examples

### CLI Not Installed

```bash
# When Gemini CLI is not found
$ ./scripts/council.sh "Review request"
Error: gemini CLI not found
Install from: https://github.com/google-gemini/gemini-cli
```

### Timeout

```bash
# When 120-second timeout is exceeded
$ ./scripts/council.sh status "$JOB_DIR"
{
  "members": [
    { "member": "gemini", "state": "timed_out", "message": "Timed out after 120s" }
  ]
}
```
