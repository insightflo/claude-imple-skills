#!/usr/bin/env node

/**
 * Long Context Optimizer Service
 *
 * Applies H2O (Heavy-Hitter Oracle) and Compressive Context patterns
 * to optimize long context for LLM processing.
 *
 * Techniques:
 * - Heavy-Hitter extraction: Preserve critical info at the top
 * - Compressive Context: Summarize older/less important content
 * - RAG Hybrid: Retrieve → Prioritize → Compress → Synthesize
 */

const fs = require('fs');
const path = require('path');

// ============================================
// Configuration
// ============================================

const DEFAULT_CONFIG = {
  maxTokens: 8000,        // Target token limit
  heavyHitterCount: 10,   // Number of key insights to extract
  summaryRatio: 0.3,      // Ratio of content to compress
  importance: {
    code: ['function', 'class', 'interface', 'type', 'const', 'let', 'var'],
    markdown: ['##', '###', '####', '| ', '- ', '* ', '> '],
    yaml: ['  - ', '    - ', '  \\w+:']
  }
};

// ============================================
// H2O: Heavy-Hitter Extraction
// ============================================

/**
 * Extract heavy-hitter tokens from content
 * Preserves high-value information (functions, classes, headers, lists)
 */
function extractHeavyHitters(content, options = {}) {
  const { maxCount = 10, importance = DEFAULT_CONFIG.importance } = options;
  const hitters = [];
  const lines = content.split('\n');

  for (const line of lines) {
    if (hitters.length >= maxCount) break;

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Code patterns (function/class definitions)
    if (trimmed.match(/^(function|class|interface|type|const|let|var)\s+\w+/)) {
      hitters.push({ type: 'code', priority: 1, content: trimmed });
      continue;
    }

    // Markdown headers
    if (trimmed.match(/^#{1,4}\s+\S+/)) {
      hitters.push({ type: 'header', priority: 1, content: trimmed });
      continue;
    }

    // Markdown lists
    if (trimmed.match(/^[-*+]\s+\S+/) || trimmed.match(/^\d+\.\s+\S+/)) {
      hitters.push({ type: 'list', priority: 2, content: trimmed });
      continue;
    }

    // YAML key-value pairs
    if (trimmed.match(/^\s*\w+:\s*\S+/)) {
      hitters.push({ type: 'yaml', priority: 2, content: trimmed });
      continue;
    }
  }

  return {
    heavyHitters: hitters.slice(0, maxCount),
    totalCount: hitters.length,
    compressionRatio: hitters.length / lines.length
  };
}

/**
 * Structure context with heavy-hitters at the top
 */
function structureContext(contexts, options = {}) {
  const structured = [];

  for (const ctx of contexts) {
    const { type, content, source } = ctx;
    const extracted = extractHeavyHitters(content, options);

    structured.push({
      source,
      type,
      heavyHitters: extracted.heavyHitters,
      summary: compressContent(content, options),
      originalLength: content.length,
      compressedLength: Math.floor(content.length * (1 - options.summaryRatio || DEFAULT_CONFIG.summaryRatio))
    });
  }

  // Sort by importance (heavyHitters count desc)
  return structured.sort((a, b) => b.heavyHitters.length - a.heavyHitters.length);
}

// ============================================
// Compressive Context
// ============================================

/**
 * Compress content by importance
 * Recent/critical content preserved, older content summarized
 */
function compressContent(content, options = {}) {
  const { summaryRatio = DEFAULT_CONFIG.summaryRatio, preserveLines = 5 } = options;
  const lines = content.split('\n');
  const totalLines = lines.length;
  const targetLines = Math.max(preserveLines, Math.floor(totalLines * summaryRatio));

  if (totalLines <= targetLines) return content;

  // Keep header (first N lines)
  const header = lines.slice(0, preserveLines);
  // Keep footer (last N lines)
  const footer = lines.slice(-preserveLines);
  // Compress middle section
  const middle = lines.slice(preserveLines, -preserveLines);

  // Sample middle section
  const sampleStep = Math.max(1, Math.floor(middle.length / (targetLines - preserveLines * 2)));
  const sampled = middle.filter((_, i) => i % sampleStep === 0);

  return [...header, '... (compressed)', ...sampled, '... (compressed)', ...footer].join('\n');
}

/**
 * Build optimized prompt with H2O pattern
 */
function buildPrompt(contexts, prompt, options = {}) {
  const structured = structureContext(contexts, options);

  let result = `# 🔥 Heavy-Hitters (Critical Context)\n\n`;

  for (const ctx of structured) {
    result += `## From: ${ctx.source}\n\n`;
    for (const hitter of ctx.heavyHitters) {
      result += `${hitter.content}\n`;
    }
    result += '\n';
  }

  result += `# 📋 Compressed Context\n\n`;
  for (const ctx of structured) {
    result += `## ${ctx.source} (${ctx.type})\n\n`;
    result += `${ctx.summary}\n\n`;
  }

  result += `# ❓ Request\n\n${prompt}`;

  return result;
}

// ============================================
// RAG Hybrid Pipeline
// ============================================

/**
 * RAG Hybrid: Retrieve → Prioritize → Compress → Synthesize
 */
function ragHybridPipeline(query, documents, options = {}) {
  // 1. Retrieve (filter relevant documents)
  const relevant = retrieveDocuments(query, documents, options);

  // 2. Prioritize (sort by relevance/importance)
  const prioritized = prioritizeDocuments(relevant, query);

  // 3. Compress (apply compressive context)
  const compressed = prioritized.map(doc => ({
    ...doc,
    content: compressContent(doc.content, options)
  }));

  // 4. Synthesize (build final context)
  return buildPrompt(compressed, query, options);
}

/**
 * Retrieve relevant documents by keyword matching
 */
function retrieveDocuments(query, documents, options = {}) {
  const { threshold = 0.1 } = options;
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  return documents
    .map(doc => {
      const content = (doc.content || '').toLowerCase();
      const matches = keywords.filter(kw => content.includes(kw)).length;
      const relevance = keywords.length > 0 ? matches / keywords.length : 0;
      return { ...doc, relevance, matchCount: matches };
    })
    .filter(doc => doc.relevance >= threshold)
    .sort((a, b) => b.relevance - a.relevance);
}

/**
 * Prioritize documents by combined score
 */
function prioritizeDocuments(documents, query) {
  return documents.map(doc => ({
    ...doc,
    priority: calculatePriority(doc, query)
  })).sort((a, b) => b.priority - a.priority);
}

/**
 * Calculate document priority score
 */
function calculatePriority(doc, query) {
  let score = 0;

  // Relevance from retrieval
  score += (doc.relevance || 0) * 50;

  // Freshness bonus (recent content)
  if (doc.timestamp) {
    const age = Date.now() - new Date(doc.timestamp).getTime();
    score += Math.max(0, 20 - age / (1000 * 60 * 60 * 24)); // Decay over 20 days
  }

  // Type bonus
  const typeBonus = { 'code': 10, 'spec': 15, 'api': 12, 'doc': 8 };
  score += typeBonus[doc.type] || 5;

  return score;
}

// ============================================
// CLI Interface
// ============================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { _: [] };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) {
      options._.push(a);
      continue;
    }

    const [key, value] = a.split('=', 2);
    const optionKey = key.slice(2);
    options[optionKey] = value !== undefined ? value : true;
  }

  return options;
}

function printHelp() {
  console.log(`
Context Optimizer - Long Context Optimization Service

Usage:
  contextOptimizer.js optimize <file> [options]
  contextOptimizer.js compress <file> [options]
  contextOptimizer.js build <query> <file...> [options]

Options:
  --max-tokens=N       Target token limit (default: 8000)
  --heavy-count=N      Number of heavy hitters (default: 10)
  --summary-ratio=N    Compression ratio 0-1 (default: 0.3)
  --json               Output JSON format

Examples:
  # Optimize single file
  contextOptimizer.js optimize docs/plan/long-context-optimization.md

  # Compress content
  contextOptimizer.js compress large-file.md

  # Build RAG hybrid query
  contextOptimizer.js build "summarize this" docs/*.md
`);
}

function cmdOptimize(options) {
  const filePath = options._[1];
  if (!filePath) {
    console.error('Error: Missing file path');
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const { heavyHitters, totalCount, compressionRatio } = extractHeavyHitters(content, options);

  if (options.json) {
    console.log(JSON.stringify({ heavyHitters, totalCount, compressionRatio }, null, 2));
    return;
  }

  console.log(`# Heavy-Hitters from: ${filePath}\n`);
  console.log(`Extracted: ${heavyHitters.length} / ${totalCount} total\n`);
  for (const hitter of heavyHitters) {
    console.log(`[${hitter.type}] ${hitter.content}`);
  }
}

function cmdCompress(options) {
  const filePath = options._[1];
  if (!filePath) {
    console.error('Error: Missing file path');
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const compressed = compressContent(content, options);

  if (options.json) {
    console.log(JSON.stringify({
      original: content.length,
      compressed: compressed.length,
      ratio: compressed.length / content.length
    }, null, 2));
    return;
  }

  console.log(compressed);
}

function cmdBuild(options) {
  const query = options._[1];
  const files = options._.slice(2);

  if (!query) {
    console.error('Error: Missing query');
    process.exit(1);
  }

  const documents = files.map(file => ({
    source: file,
    type: path.extname(file).slice(1) || 'unknown',
    content: fs.readFileSync(file, 'utf8')
  }));

  const result = ragHybridPipeline(query, documents, options);
  console.log(result);
}

function main() {
  const options = parseArgs();
  const [command] = options._;

  if (!command || options.help || options.h) {
    printHelp();
    return;
  }

  switch (command) {
    case 'optimize':
      cmdOptimize(options);
      break;
    case 'compress':
      cmdCompress(options);
      break;
    case 'build':
      cmdBuild(options);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

// ============================================
// Module Exports (for require/import)
// ============================================

module.exports = {
  extractHeavyHitters,
  structureContext,
  compressContent,
  buildPrompt,
  ragHybridPipeline,
  retrieveDocuments,
  prioritizeDocuments,
  DEFAULT_CONFIG
};

if (require.main === module) {
  main();
}
