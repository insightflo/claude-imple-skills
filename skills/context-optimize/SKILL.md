---
name: context-optimize
description: Long context optimization — extract key information, compress, and summarize using the H2O pattern. Use this whenever documents are too long, the context window is running low, or you need to synthesize multiple files. Triggers immediately on "compress this", "summarize this", "document is too long", "context overflow", or "clean up context". Triggers on /compress.
trigger: /compress, /optimize, "컨텍스트 압축", "문서 압축", "긴 문서 요약", "context overflow"
version: 1.1.0
updated: 2026-03-12
---

# Context Optimize Skill

> **When to use:**
> - When you need to analyze a long document or codebase
> - When the context window is running low
> - When you need to synthesize multiple files
> - When cleaning up documents before starting a project implementation

## Quick Start

```bash
# Extract key information (Heavy-Hitter)
/compress optimize <file>

# Compress a document
/compress <file>

# LLM-based summarization (requires Claude CLI)
/compress <file> --llm
```

---

## Usage Scenarios

### 1. Pre-project document cleanup

```
Situation: Planning docs and specs are too long to read in one pass
Solution:  /compress optimize docs/spec.md --heavy-count=20
Result:    Extract only the top 20 key items for quick understanding
```

### 2. Context overload

```
Situation: "Context window exceeded" or degraded response quality
Solution:  /compress <large-file> --summary-ratio=0.3
Result:    70% compression to free up context headroom
```

### 3. Synthesizing multiple files

```
Situation: Need to reference 10+ files at once
Solution:  /compress build "summarize" docs/*.md
Result:    RAG hybrid extracts only relevant content
```

---

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `optimize <file>` | Heavy-Hitter extraction | `/compress optimize spec.md` |
| `compress <file>` | Compress (preserve start/end) | `/compress README.md` |
| `build <query> <files>` | RAG hybrid | `/compress build "API list" src/*.ts` |

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--heavy-count=N` | Number of key items to extract | 10 |
| `--summary-ratio=N` | Compression ratio (0.1–0.9) | 0.3 |
| `--llm` | Use LLM-based summarization | false |
| `--json` | Output in JSON format | false |

---

## Technical Principles

### H2O (Heavy-Hitter Oracle)

Places critical information at the top to mitigate the "Lost in the Middle" phenomenon:

| Type | Priority | Example |
|------|----------|---------|
| h1 header | 1 | `# Title` |
| Class definition | 1 | `class Foo` |
| h2 header | 2 | `## Section` |
| Function definition | 2 | `function bar()` |
| Table header | 2 | `\| col1 \| col2 \|` |
| Code block | 3 | ` ```javascript` |
| List | 4 | `- item` |

**Bonus system**:
- Top 10% of document: priority multiplier 0.8x (higher priority)
- Bottom 10% of document: priority multiplier 0.9x
- Critical keywords (`CRITICAL`, `IMPORTANT`, `🔥`): multiplier 0.5x

### Compressive Context

Older or less important content is summarized; recent and critical content is preserved as-is:

```
[First 5 lines — preserved as-is]
... (compressed) ...
[Middle sampling]
... (compressed) ...
[Last 5 lines — preserved as-is]
```

### LLM Mode (`--llm`)

Semantic summarization using Claude CLI:
- No additional API cost — subscription only
- Automatically falls back to heuristic when running inside Claude Code

---

## How to Run

This skill internally calls `contextOptimizer.js`:

```bash
node project-team/services/contextOptimizer.js <command> <file> [options]
```

### Examples

```bash
# Heavy-Hitter extraction
node project-team/services/contextOptimizer.js optimize docs/spec.md --heavy-count=15 --json

# Compress
node project-team/services/contextOptimizer.js compress large-file.md --summary-ratio=0.2

# LLM-based (run in a separate terminal)
node project-team/services/contextOptimizer.js compress large-file.md --llm

# RAG hybrid
node project-team/services/contextOptimizer.js build "API endpoints" src/*.ts
```

---

## Related Resources

- Service README: `project-team/services/README.md`
- MCP server: `project-team/services/mcp-context-server.js`
