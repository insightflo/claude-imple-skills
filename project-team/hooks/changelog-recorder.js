#!/usr/bin/env node
/**
 * PostToolUse[Write|Edit] Hook: Changelog Recorder
 *
 * Automatically records change history when source files are modified.
 * Detects change type (feature, fix, refactor, docs, test), extracts
 * domain from the file path, and appends a YAML entry to the monthly
 * changelog file at .claude/changelog/{YYYY-MM}.yaml.
 *
 * @TASK P3-T4 - Changelog Recorder Hook
 * @SPEC project-team/hooks (Section 12.6)
 *
 * Claude Code Hook Protocol (PostToolUse):
 *   - stdin: JSON { tool_name, tool_input: { file_path, content, old_string, new_string },
 *                   tool_result: { old_content?: string, ... } }
 *   - stdout: JSON { hookSpecificOutput: { additionalContext: string } }
 *
 * PostToolUse hooks cannot block (the tool already executed).
 * Instead, they inject additionalContext to acknowledge recorded changes.
 *
 * Changelog Storage:
 *   .claude/changelog/
 *   +-- {YYYY-MM}.yaml   # Monthly changelog files
 *
 * Entry Format:
 *   entries:
 *     - date: 2026-02-07T14:30:00
 *       type: feature|fix|refactor|docs|test
 *       domain: order
 *       files:
 *         - order/services/discount_service.py
 *       description: "Short description of the change"
 *       impact:
 *         - "dependency or side-effect note"
 */

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

/**
 * Changelog output directory (relative to project root).
 */
const CHANGELOG_DIR = '.claude/changelog';

/**
 * Domain directory patterns. Files under these directories are grouped
 * by the immediate subdirectory name as the "domain".
 *
 * Example: src/domains/member/services/auth.py -> domain = "member"
 */
const DOMAIN_PATTERNS = [
  /^src\/domains\/([^/]+)\//,
  /^app\/domains\/([^/]+)\//,
  /^domains\/([^/]+)\//,
  /^packages\/([^/]+)\//,
  /^modules\/([^/]+)\//
];

/**
 * Extended domain extraction patterns for paths outside strict domain dirs.
 * Extracts a logical domain from typical project structure paths.
 *
 * Example: app/api/routes/auth.py -> domain = "auth"
 *          src/services/order_service.py -> domain = "order"
 */
const EXTENDED_DOMAIN_PATTERNS = [
  // app/api/routes/{domain}.py (3-level: app/api/routes/X)
  /^(?:app|src)\/api\/routes\/([^/.]+)/,
  // app/api/{domain}/... (2-level: app/api/X or src/routes/X)
  /^(?:app|src)\/(?:api|routes)\/([^/.]+)/,
  // app/services/{domain}_service.py
  /^(?:app|src)\/services\/([^_/.]+)/,
  // app/models/{domain}.py
  /^(?:app|src)\/models\/([^/.]+)/,
  // app/schemas/{domain}.py
  /^(?:app|src)\/schemas\/([^/.]+)/,
  // app/controllers/{domain}_controller.py
  /^(?:app|src)\/controllers\/([^_/.]+)/
];

/**
 * File extensions considered as source code.
 */
const SOURCE_EXTENSIONS = new Set([
  '.py', '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
  '.java', '.kt', '.go', '.rs', '.rb', '.php', '.cs'
]);

/**
 * Documentation file extensions.
 */
const DOC_EXTENSIONS = new Set([
  '.md', '.rst', '.txt', '.adoc', '.mdx'
]);

/**
 * Configuration file extensions and names.
 */
const CONFIG_EXTENSIONS = new Set([
  '.yaml', '.yml', '.json', '.toml', '.ini', '.cfg', '.env', '.conf'
]);

/**
 * Maximum number of entries to keep per monthly file (prevents unbounded growth).
 */
const MAX_ENTRIES_PER_MONTH = 5000;

// ---------------------------------------------------------------------------
// 2. YAML Serializer (no external dependencies)
// ---------------------------------------------------------------------------

/**
 * Escape a string for YAML output.
 * Wraps in double quotes if the string contains special characters.
 *
 * @param {string} value - String to escape
 * @returns {string} YAML-safe string
 */
function yamlEscapeString(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (str === '') return '""';

  // Check if quoting is needed
  const needsQuoting = /[:#\[\]{}&*!|>'"%@`,?\\]/.test(str)
    || str.startsWith(' ')
    || str.endsWith(' ')
    || str.includes('\n')
    || str === 'true' || str === 'false'
    || str === 'null' || str === 'yes' || str === 'no'
    || /^\d+(\.\d+)?$/.test(str);

  if (needsQuoting) {
    // Escape backslashes and double quotes
    const escaped = str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    return `"${escaped}"`;
  }

  return str;
}

/**
 * Serialize a changelog entry to YAML format.
 *
 * @param {object} entry - Changelog entry
 * @param {string} indent - Base indentation (default: '  ')
 * @returns {string} YAML-formatted entry
 */
function serializeEntry(entry, indent) {
  const ind = indent || '  ';
  let yaml = '';

  yaml += `${ind}- date: ${yamlEscapeString(entry.date)}\n`;
  yaml += `${ind}  type: ${yamlEscapeString(entry.type)}\n`;
  yaml += `${ind}  domain: ${yamlEscapeString(entry.domain)}\n`;

  // files list
  yaml += `${ind}  files:\n`;
  const files = entry.files || [];
  for (const file of files) {
    yaml += `${ind}    - ${yamlEscapeString(file)}\n`;
  }

  yaml += `${ind}  description: ${yamlEscapeString(entry.description)}\n`;

  // impact list
  yaml += `${ind}  impact:\n`;
  const impact = entry.impact || [];
  if (impact.length === 0) {
    yaml += `${ind}    - none\n`;
  } else {
    for (const item of impact) {
      yaml += `${ind}    - ${yamlEscapeString(item)}\n`;
    }
  }

  return yaml;
}

/**
 * Serialize the full changelog document (header + entries).
 *
 * @param {object[]} entries - Array of changelog entries
 * @returns {string} Complete YAML document
 */
function serializeChangelog(entries) {
  let yaml = 'entries:\n';
  for (const entry of entries) {
    yaml += serializeEntry(entry);
  }
  return yaml;
}

// ---------------------------------------------------------------------------
// 3. YAML Parser (no external dependencies)
// ---------------------------------------------------------------------------

/**
 * Parse a YAML changelog file content into an array of entries.
 * This is a minimal, purpose-built parser for the specific changelog format.
 *
 * @param {string} content - YAML file content
 * @returns {object[]} Array of changelog entries
 */
function parseChangelog(content) {
  if (!content || typeof content !== 'string' || !content.trim()) {
    return [];
  }

  const entries = [];
  const lines = content.split('\n');
  let currentEntry = null;
  let currentList = null; // 'files' | 'impact' | null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and the top-level "entries:" key
    if (!trimmed || trimmed === 'entries:') {
      continue;
    }

    // New entry starts with "- date:"
    if (trimmed.startsWith('- date:')) {
      if (currentEntry) {
        entries.push(currentEntry);
      }
      currentEntry = {
        date: parseYamlValue(trimmed.replace(/^- date:\s*/, '')),
        type: '',
        domain: '',
        files: [],
        description: '',
        impact: []
      };
      currentList = null;
      continue;
    }

    if (!currentEntry) continue;

    // Field: type
    if (trimmed.startsWith('type:')) {
      currentEntry.type = parseYamlValue(trimmed.replace(/^type:\s*/, ''));
      currentList = null;
      continue;
    }

    // Field: domain
    if (trimmed.startsWith('domain:')) {
      currentEntry.domain = parseYamlValue(trimmed.replace(/^domain:\s*/, ''));
      currentList = null;
      continue;
    }

    // Field: description
    if (trimmed.startsWith('description:')) {
      currentEntry.description = parseYamlValue(trimmed.replace(/^description:\s*/, ''));
      currentList = null;
      continue;
    }

    // List header: files
    if (trimmed === 'files:') {
      currentList = 'files';
      continue;
    }

    // List header: impact
    if (trimmed === 'impact:') {
      currentList = 'impact';
      continue;
    }

    // List item
    if (trimmed.startsWith('- ') && currentList) {
      const value = parseYamlValue(trimmed.slice(2).trim());
      currentEntry[currentList].push(value);
      continue;
    }
  }

  // Push last entry
  if (currentEntry) {
    entries.push(currentEntry);
  }

  return entries;
}

/**
 * Parse a YAML scalar value, handling quoted strings.
 *
 * @param {string} raw - Raw value string
 * @returns {string} Parsed value
 */
function parseYamlValue(raw) {
  if (!raw) return '';
  let value = raw.trim();

  // Handle double-quoted strings
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
    // Unescape
    value = value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    return value;
  }

  // Handle single-quoted strings
  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
    // Single-quoted strings only escape '' -> '
    value = value.replace(/''/g, "'");
    return value;
  }

  return value;
}

// ---------------------------------------------------------------------------
// 4. Domain Extraction
// ---------------------------------------------------------------------------

/**
 * Extract domain name from a file path.
 * First checks strict domain directory patterns, then falls back to
 * extended patterns that infer domain from typical project structures.
 *
 * @param {string} filePath - Project-relative file path
 * @returns {string} Domain name or 'root' if no domain detected
 */
function extractDomain(filePath) {
  if (!filePath || typeof filePath !== 'string') return 'root';

  // Try strict domain directory patterns first
  for (const pattern of DOMAIN_PATTERNS) {
    const match = filePath.match(pattern);
    if (match) return match[1];
  }

  // Try extended patterns (infer domain from path structure)
  for (const pattern of EXTENDED_DOMAIN_PATTERNS) {
    const match = filePath.match(pattern);
    if (match) return match[1];
  }

  // Try to extract from filename for service files
  // e.g., services/order_service.py -> order
  const serviceMatch = filePath.match(/(?:^|\/)([^/]+?)_service\.[a-z]+$/);
  if (serviceMatch) return serviceMatch[1];

  // Try to extract from first meaningful directory segment
  const segments = filePath.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const firstDir = segments[0].toLowerCase();
    // Skip generic top-level dirs
    const genericDirs = new Set([
      'src', 'app', 'lib', 'pkg', 'cmd', 'internal',
      'test', 'tests', 'spec', 'specs', 'docs', 'doc',
      'config', 'configs', 'scripts', 'tools', 'bin',
      'public', 'static', 'assets', 'vendor', 'node_modules'
    ]);
    if (!genericDirs.has(firstDir)) {
      return firstDir;
    }
  }

  return 'root';
}

// ---------------------------------------------------------------------------
// 5. Change Type Detection
// ---------------------------------------------------------------------------

/**
 * Detect the type of change based on file path and content analysis.
 *
 * Change types:
 *   - feature: New file creation, new function/class added
 *   - fix: Bug fix patterns detected (fix, bugfix, patch, hotfix keywords)
 *   - refactor: Structure change (rename, move, reorganize)
 *   - docs: Documentation file change
 *   - test: Test file change
 *
 * @param {object} params
 * @param {string} params.filePath - Project-relative file path
 * @param {string} [params.newContent] - New file content
 * @param {string} [params.oldContent] - Old file content
 * @param {string} [params.oldString] - Old string (for Edit operations)
 * @param {string} [params.newString] - New string (for Edit operations)
 * @param {string} [params.toolName] - Tool name (Write or Edit)
 * @returns {string} Change type
 */
function detectChangeType(params) {
  const { filePath, newContent, oldContent, oldString, newString, toolName } = params || {};

  if (!filePath || typeof filePath !== 'string') return 'feature';

  const ext = path.extname(filePath).toLowerCase();
  const lowerPath = filePath.toLowerCase();

  // 1. Test file detection (highest priority - test files are always 'test')
  if (isTestFile(lowerPath)) {
    return 'test';
  }

  // 2. Documentation file detection
  if (isDocFile(lowerPath, ext)) {
    return 'docs';
  }

  // 3. New file creation (Write tool with no old content)
  if (toolName === 'Write' && !oldContent) {
    return 'feature';
  }

  // 4. Analyze content for patterns
  if (newContent || newString) {
    const contentToAnalyze = newContent || newString || '';
    const previousContent = oldContent || oldString || '';

    // Check for fix patterns in the diff/content
    if (hasFixPatterns(contentToAnalyze, previousContent)) {
      return 'fix';
    }

    // Check for refactor patterns
    if (hasRefactorPatterns(contentToAnalyze, previousContent, filePath)) {
      return 'refactor';
    }

    // Check for new function/class additions (feature)
    if (hasNewDefinitions(contentToAnalyze, previousContent, ext)) {
      return 'feature';
    }
  }

  // 5. For Edit operations, default depends on the nature of changes
  if (toolName === 'Edit' && oldString && newString) {
    // If old and new are similar length, likely refactor
    const lengthRatio = newString.length / Math.max(oldString.length, 1);
    if (lengthRatio >= 0.5 && lengthRatio <= 2.0) {
      return 'refactor';
    }
    // Significant addition
    if (newString.length > oldString.length * 2) {
      return 'feature';
    }
  }

  // 6. For Write operations with existing content, compare
  if (toolName === 'Write' && oldContent && newContent) {
    if (newContent.length > oldContent.length * 1.5) {
      return 'feature';
    }
    return 'refactor';
  }

  // Default: feature for new content, refactor for modifications
  return toolName === 'Write' ? 'feature' : 'refactor';
}

/**
 * Check if a file path is a test file.
 *
 * @param {string} lowerPath - Lowercased file path
 * @returns {boolean}
 */
function isTestFile(lowerPath) {
  if (!lowerPath) return false;

  // Directory-based test detection
  if (/(?:^|\/)(?:tests?|__tests__|spec|specs)\//.test(lowerPath)) return true;

  // Filename-based test detection
  if (/(?:^|\/)test_[^/]+\.[a-z]+$/.test(lowerPath)) return true;
  if (/(?:^|\/)[^/]+\.(?:test|spec)\.[a-z]+$/.test(lowerPath)) return true;
  if (/(?:^|\/)[^/]+_test\.[a-z]+$/.test(lowerPath)) return true;

  return false;
}

/**
 * Check if a file path is a documentation file.
 *
 * @param {string} lowerPath - Lowercased file path
 * @param {string} ext - File extension
 * @returns {boolean}
 */
function isDocFile(lowerPath, ext) {
  if (!lowerPath) return false;

  // Extension-based
  if (DOC_EXTENSIONS.has(ext)) return true;

  // Directory-based
  if (/(?:^|\/)(?:docs?|documentation)\//.test(lowerPath)) return true;

  // Specific documentation files
  if (/(?:^|\/)(?:readme|changelog|license|contributing|code_of_conduct)/i.test(lowerPath)) return true;

  return false;
}

/**
 * Check for bug fix patterns in content.
 *
 * @param {string} newContent - New content
 * @param {string} oldContent - Old content
 * @returns {boolean}
 */
function hasFixPatterns(newContent, oldContent) {
  if (!newContent) return false;

  const fixKeywords = [
    /\bfix(?:ed|es|ing)?\b/i,
    /\bbug(?:fix)?\b/i,
    /\bpatch(?:ed|es|ing)?\b/i,
    /\bhotfix\b/i,
    /\bresolve[ds]?\b/i,
    /\bcorrect(?:ed|s|ing)?\b/i,
    /\bworkaround\b/i
  ];

  // Check comments in the new content for fix-related keywords
  const commentLines = extractCommentLines(newContent);
  for (const comment of commentLines) {
    for (const pattern of fixKeywords) {
      if (pattern.test(comment)) return true;
    }
  }

  // Check if error handling was added/modified
  const errorPatterns = [
    /\btry\s*[:{]/,
    /\bcatch\b/,
    /\bexcept\b/,
    /\braise\b/,
    /\bthrow\b/,
    /\bif\s+.*err(?:or)?/i
  ];

  if (oldContent) {
    const oldErrorCount = countPatternMatches(oldContent, errorPatterns);
    const newErrorCount = countPatternMatches(newContent, errorPatterns);
    if (newErrorCount > oldErrorCount) return true;
  }

  return false;
}

/**
 * Check for refactoring patterns.
 *
 * @param {string} newContent - New content
 * @param {string} oldContent - Old content
 * @param {string} filePath - File path
 * @returns {boolean}
 */
function hasRefactorPatterns(newContent, oldContent, filePath) {
  if (!newContent || !oldContent) return false;

  const refactorKeywords = [
    /\brefactor(?:ed|s|ing)?\b/i,
    /\brestructur(?:ed|es|ing)?\b/i,
    /\breorganiz(?:ed|es|ing)?\b/i,
    /\bcleanup\b/i,
    /\bsimplif(?:y|ied|ies)\b/i,
    /\bextract(?:ed|s|ing)?\b/i,
    /\brename[ds]?\b/i
  ];

  // Check comments for refactor keywords
  const commentLines = extractCommentLines(newContent);
  for (const comment of commentLines) {
    for (const pattern of refactorKeywords) {
      if (pattern.test(comment)) return true;
    }
  }

  return false;
}

/**
 * Check if new function/class definitions were added.
 *
 * @param {string} newContent - New content
 * @param {string} oldContent - Old content
 * @param {string} ext - File extension
 * @returns {boolean}
 */
function hasNewDefinitions(newContent, oldContent, ext) {
  if (!newContent) return false;

  const definitionPatterns = getDefinitionPatterns(ext);
  if (definitionPatterns.length === 0) return false;

  const newDefs = countPatternMatches(newContent, definitionPatterns);
  const oldDefs = oldContent ? countPatternMatches(oldContent, definitionPatterns) : 0;

  return newDefs > oldDefs;
}

/**
 * Get definition patterns for a given file extension.
 *
 * @param {string} ext - File extension
 * @returns {RegExp[]} Array of patterns matching function/class definitions
 */
function getDefinitionPatterns(ext) {
  switch (ext) {
    case '.py':
      return [
        /^\s*(?:async\s+)?def\s+\w+/m,
        /^\s*class\s+\w+/m
      ];
    case '.js':
    case '.ts':
    case '.jsx':
    case '.tsx':
      return [
        /^\s*(?:export\s+)?(?:async\s+)?function\s+\w+/m,
        /^\s*(?:export\s+)?class\s+\w+/m,
        /^\s*(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/m
      ];
    case '.java':
    case '.kt':
      return [
        /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:class|interface|enum)\s+\w+/m,
        /^\s*(?:public|private|protected)?\s*(?:static\s+)?[\w<>[\]]+\s+\w+\s*\(/m
      ];
    case '.go':
      return [
        /^\s*func\s+/m,
        /^\s*type\s+\w+\s+struct/m
      ];
    case '.rs':
      return [
        /^\s*(?:pub\s+)?fn\s+/m,
        /^\s*(?:pub\s+)?struct\s+/m,
        /^\s*(?:pub\s+)?enum\s+/m
      ];
    default:
      return [];
  }
}

/**
 * Extract comment lines from source code.
 *
 * @param {string} content - Source code content
 * @returns {string[]} Array of comment line texts
 */
function extractCommentLines(content) {
  if (!content) return [];

  const comments = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Python comments
    if (trimmed.startsWith('#')) {
      comments.push(trimmed);
      continue;
    }
    // JS/TS single-line comments
    if (trimmed.startsWith('//')) {
      comments.push(trimmed);
      continue;
    }
    // Block comment lines
    if (trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      comments.push(trimmed);
      continue;
    }
  }

  return comments;
}

/**
 * Count the number of matches for any of the given patterns in content.
 *
 * @param {string} content - Content to search
 * @param {RegExp[]} patterns - Patterns to match
 * @returns {number} Total match count
 */
function countPatternMatches(content, patterns) {
  if (!content || !patterns) return 0;

  let count = 0;
  const lines = content.split('\n');

  for (const line of lines) {
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        count++;
        break; // One match per line is enough
      }
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// 6. Impact Detection
// ---------------------------------------------------------------------------

/**
 * Detect potential impacts of a file change.
 *
 * @param {object} params
 * @param {string} params.filePath - Project-relative file path
 * @param {string} [params.newContent] - New content
 * @param {string} [params.oldContent] - Old content
 * @returns {string[]} Array of impact descriptions
 */
function detectImpact(params) {
  const { filePath, newContent, oldContent } = params || {};
  const impacts = [];

  if (!filePath) return impacts;

  const ext = path.extname(filePath).toLowerCase();

  // Check for new imports (dependency changes)
  if (newContent) {
    const newImports = extractImportStatements(newContent, ext);
    const oldImports = oldContent ? extractImportStatements(oldContent, ext) : [];

    const oldSet = new Set(oldImports);
    const addedImports = newImports.filter(imp => !oldSet.has(imp));

    if (addedImports.length > 0) {
      // Group by external vs internal
      const external = addedImports.filter(imp => isExternalImport(imp));
      const internal = addedImports.filter(imp => !isExternalImport(imp));

      if (external.length > 0) {
        impacts.push(`external dependency added: ${external.slice(0, 3).join(', ')}${external.length > 3 ? ' (+more)' : ''}`);
      }
      if (internal.length > 0) {
        impacts.push(`internal dependency added: ${internal.slice(0, 3).join(', ')}${internal.length > 3 ? ' (+more)' : ''}`);
      }
    }
  }

  // Check for API route changes
  if (isApiRouteFile(filePath)) {
    impacts.push('API endpoint modification');
  }

  // Check for model/schema changes
  if (isModelFile(filePath)) {
    impacts.push('data model modification');
  }

  // Check for config file changes
  if (CONFIG_EXTENSIONS.has(ext)) {
    impacts.push('configuration change');
  }

  // Check for migration files
  if (/migration/i.test(filePath)) {
    impacts.push('database migration');
  }

  return impacts;
}

/**
 * Extract import statements from content.
 *
 * @param {string} content - File content
 * @param {string} ext - File extension
 * @returns {string[]} Array of imported module names
 */
function extractImportStatements(content, ext) {
  if (!content || typeof content !== 'string') return [];

  const imports = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (ext === '.py') {
      // from x.y.z import ...
      const fromMatch = trimmed.match(/^from\s+([\w.]+)\s+import/);
      if (fromMatch) {
        imports.push(fromMatch[1]);
        continue;
      }
      // import x.y.z
      const importMatch = trimmed.match(/^import\s+([\w.]+)/);
      if (importMatch) {
        imports.push(importMatch[1]);
        continue;
      }
    }

    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      // import ... from '...'
      const jsImportMatch = trimmed.match(/(?:import\s+.*?\s+from|import)\s+['"]([^'"]+)['"]/);
      if (jsImportMatch) {
        imports.push(jsImportMatch[1]);
        continue;
      }
      // require('...')
      const requireMatch = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (requireMatch) {
        imports.push(requireMatch[1]);
        continue;
      }
    }

    if (ext === '.go') {
      // Go: "package/path"
      const goMatch = trimmed.match(/^\s*"([^"]+)"/);
      if (goMatch) {
        imports.push(goMatch[1]);
      }
    }
  }

  return imports;
}

/**
 * Check if an import path refers to an external dependency.
 *
 * @param {string} importPath - Import path
 * @returns {boolean}
 */
function isExternalImport(importPath) {
  if (!importPath) return false;

  // Relative imports are internal
  if (importPath.startsWith('.') || importPath.startsWith('/')) return false;

  // Common internal prefixes
  const internalPrefixes = ['app.', 'src.', 'domains.', 'modules.', 'packages.'];
  for (const prefix of internalPrefixes) {
    if (importPath.startsWith(prefix)) return false;
  }

  return true;
}

/**
 * Check if a file is an API route file.
 *
 * @param {string} filePath - File path
 * @returns {boolean}
 */
function isApiRouteFile(filePath) {
  if (!filePath) return false;
  return /(?:routes?|api|endpoints?|controllers?)\//.test(filePath);
}

/**
 * Check if a file is a model/schema file.
 *
 * @param {string} filePath - File path
 * @returns {boolean}
 */
function isModelFile(filePath) {
  if (!filePath) return false;
  return /(?:models?|schemas?|entities)\//.test(filePath);
}

// ---------------------------------------------------------------------------
// 7. Description Generation
// ---------------------------------------------------------------------------

/**
 * Generate a short description of the change.
 *
 * @param {object} params
 * @param {string} params.filePath - File path
 * @param {string} params.changeType - Detected change type
 * @param {string} params.domain - Detected domain
 * @param {string} [params.newContent] - New content
 * @param {string} [params.oldContent] - Old content
 * @param {string} [params.oldString] - Old string (Edit)
 * @param {string} [params.newString] - New string (Edit)
 * @param {string} [params.toolName] - Tool name
 * @returns {string} Short description
 */
function generateDescription(params) {
  const { filePath, changeType, domain, newContent, oldContent, oldString, newString, toolName } = params || {};

  if (!filePath) return 'Unknown change';

  const fileName = path.basename(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  // Type-specific descriptions
  switch (changeType) {
    case 'test':
      if (toolName === 'Write' && !oldContent) {
        return `Add test file ${fileName}`;
      }
      return `Update test ${fileName}`;

    case 'docs':
      if (toolName === 'Write' && !oldContent) {
        return `Add documentation ${fileName}`;
      }
      return `Update documentation ${fileName}`;

    case 'feature':
      if (toolName === 'Write' && !oldContent) {
        return `Create ${baseName} in ${domain}`;
      }
      return `Add new functionality to ${baseName} in ${domain}`;

    case 'fix':
      return `Fix issue in ${baseName}`;

    case 'refactor':
      return `Refactor ${baseName}`;

    default:
      return `Modify ${fileName}`;
  }
}

// ---------------------------------------------------------------------------
// 8. Changelog File I/O
// ---------------------------------------------------------------------------

/**
 * Get the changelog file path for a given date.
 *
 * @param {string} projectDir - Absolute project root directory
 * @param {Date} [date] - Date (defaults to now)
 * @returns {string} Absolute path to the monthly changelog file
 */
function getChangelogFilePath(projectDir, date) {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const fileName = `${year}-${month}.yaml`;
  return path.join(projectDir, CHANGELOG_DIR, fileName);
}

/**
 * Read and parse existing changelog entries from a file.
 *
 * @param {string} filePath - Absolute path to the changelog file
 * @returns {object[]} Array of existing entries
 */
function readChangelogFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    return parseChangelog(content);
  } catch {
    return [];
  }
}

/**
 * Write changelog entries to a file, creating directories as needed.
 *
 * @param {string} filePath - Absolute path to the changelog file
 * @param {object[]} entries - Array of changelog entries
 */
function writeChangelogFile(filePath, entries) {
  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Enforce max entries limit
  const limitedEntries = entries.length > MAX_ENTRIES_PER_MONTH
    ? entries.slice(entries.length - MAX_ENTRIES_PER_MONTH)
    : entries;

  const content = serializeChangelog(limitedEntries);
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Append a new entry to the monthly changelog file.
 *
 * @param {string} projectDir - Absolute project root directory
 * @param {object} entry - Changelog entry
 * @param {Date} [date] - Date (defaults to now)
 * @returns {object} Result with { filePath, totalEntries }
 */
function appendEntry(projectDir, entry, date) {
  const filePath = getChangelogFilePath(projectDir, date);
  const existing = readChangelogFile(filePath);
  existing.push(entry);
  writeChangelogFile(filePath, existing);
  return { filePath, totalEntries: existing.length };
}

// ---------------------------------------------------------------------------
// 9. Relative Path Resolution
// ---------------------------------------------------------------------------

/**
 * Convert an absolute file path to a project-relative path.
 *
 * @param {string} filePath - Absolute or relative file path
 * @returns {string} Project-relative path
 */
function toRelativePath(filePath) {
  if (!filePath) return '';
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!path.isAbsolute(filePath)) return filePath;
  const relative = path.relative(projectDir, filePath);
  if (relative.startsWith('..')) return relative;
  return relative;
}

// ---------------------------------------------------------------------------
// 10. Changelog Entry Builder
// ---------------------------------------------------------------------------

/**
 * Build a complete changelog entry from tool input.
 *
 * @param {object} params
 * @param {string} params.filePath - Project-relative file path
 * @param {string} [params.newContent] - New content (Write)
 * @param {string} [params.oldContent] - Old content
 * @param {string} [params.oldString] - Old string (Edit)
 * @param {string} [params.newString] - New string (Edit)
 * @param {string} [params.toolName] - Tool name
 * @param {Date} [params.date] - Timestamp
 * @returns {object} Complete changelog entry
 */
function buildEntry(params) {
  const { filePath, newContent, oldContent, oldString, newString, toolName, date } = params || {};

  const d = date || new Date();
  const timestamp = d.toISOString().replace(/\.\d{3}Z$/, '');

  const domain = extractDomain(filePath);

  const changeType = detectChangeType({
    filePath,
    newContent,
    oldContent,
    oldString,
    newString,
    toolName
  });

  const description = generateDescription({
    filePath,
    changeType,
    domain,
    newContent,
    oldContent,
    oldString,
    newString,
    toolName
  });

  const impact = detectImpact({
    filePath,
    newContent,
    oldContent
  });

  return {
    date: timestamp,
    type: changeType,
    domain,
    files: [filePath],
    description,
    impact
  };
}

// ---------------------------------------------------------------------------
// 11. Report Formatting
// ---------------------------------------------------------------------------

/**
 * Format a changelog recording report for additionalContext output.
 *
 * @param {object} entry - The recorded changelog entry
 * @param {string} changelogFile - Path to the changelog file
 * @param {number} totalEntries - Total entries in the file
 * @returns {string} Formatted report
 */
function formatRecordingReport(entry, changelogFile, totalEntries) {
  if (!entry) return '';

  let report = '';
  report += '[Changelog Recorded]\n';
  report += `  Type: ${entry.type}\n`;
  report += `  Domain: ${entry.domain}\n`;
  report += `  File: ${entry.files.join(', ')}\n`;
  report += `  Description: ${entry.description}\n`;

  if (entry.impact && entry.impact.length > 0) {
    report += `  Impact: ${entry.impact.join('; ')}\n`;
  }

  report += `\n  Changelog: ${changelogFile}\n`;
  report += `  Total entries this month: ${totalEntries}\n`;

  return report;
}

// ---------------------------------------------------------------------------
// 12. Skip Logic
// ---------------------------------------------------------------------------

/**
 * Determine if a file change should be skipped (not recorded).
 *
 * @param {string} filePath - Project-relative file path
 * @returns {boolean} True if the file should be skipped
 */
function shouldSkipFile(filePath) {
  if (!filePath) return true;

  // Skip changelog files themselves (avoid recursion)
  if (filePath.startsWith(CHANGELOG_DIR)) return true;
  if (filePath.startsWith('.claude/changelog')) return true;

  // Skip hidden directories/files (except .claude itself)
  const segments = filePath.split('/');
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i].startsWith('.') && segments[i] !== '.claude') {
      return true;
    }
  }

  // Skip lock files
  if (/(?:package-lock|yarn\.lock|poetry\.lock|Pipfile\.lock|pnpm-lock)/.test(filePath)) {
    return true;
  }

  // Skip generated/build files
  if (/(?:^|\/)(?:dist|build|coverage|__pycache__|node_modules)\//.test(filePath)) {
    return true;
  }

  // Skip binary/media files by extension
  const binaryExts = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
    '.woff', '.woff2', '.ttf', '.eot',
    '.zip', '.tar', '.gz', '.bz2',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.pyc', '.pyo', '.class', '.o', '.so', '.dll',
    '.min.js', '.min.css', '.map'
  ]);
  const ext = path.extname(filePath).toLowerCase();
  if (binaryExts.has(ext)) return true;

  // Skip .min. files
  if (/\.min\.[a-z]+$/.test(filePath)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// 13. stdin/stdout Helpers (Claude Code Hook Protocol)
// ---------------------------------------------------------------------------

let _hookEventName = '';

/**
 * Read JSON from stdin.
 * @returns {Promise<object>}
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      try {
        const parsed = data.trim() ? JSON.parse(data) : {};
        _hookEventName = parsed.hook_event_name || '';
        resolve(parsed);
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

/**
 * Output additional context (PostToolUse guidance).
 * @param {string} context
 */
function outputContext(context) {
  const hookSpecificOutput = { additionalContext: context };
  if (_hookEventName) hookSpecificOutput.hookEventName = _hookEventName;
  process.stdout.write(JSON.stringify({ hookSpecificOutput }));
}

// ---------------------------------------------------------------------------
// 14. Main Hook Entry Point
// ---------------------------------------------------------------------------

async function main() {
  const input = await readStdin();

  // Extract tool info
  const toolName = input.tool_name || input.tool || '';
  const toolInput = input.tool_input || {};
  const toolResult = input.tool_result || {};

  const filePath = toolInput.file_path || toolInput.path || '';
  const newContent = toolInput.content || '';
  const oldString = toolInput.old_string || '';
  const newString = toolInput.new_string || '';
  const oldContent = toolResult.old_content || toolInput.old_content || '';

  if (!filePath) return;

  // Convert to project-relative path
  const relativePath = toRelativePath(filePath);
  if (relativePath.startsWith('..')) return;

  // Check if this file should be skipped
  if (shouldSkipFile(relativePath)) return;

  // Build the changelog entry
  const entry = buildEntry({
    filePath: relativePath,
    newContent,
    oldContent,
    oldString,
    newString,
    toolName
  });

  // Write to changelog file
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const result = appendEntry(projectDir, entry);
    const relChangelogPath = path.relative(projectDir, result.filePath);

    // Format and output report
    const report = formatRecordingReport(entry, relChangelogPath, result.totalEntries);
    if (report) {
      outputContext(report);
    }
  } catch {
    // Silent exit - hooks must never break the session
  }
}

main().catch((err) => { console.error('[changelog-recorder] Unhandled error:', err.message); });

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CHANGELOG_DIR,
    DOMAIN_PATTERNS,
    EXTENDED_DOMAIN_PATTERNS,
    SOURCE_EXTENSIONS,
    DOC_EXTENSIONS,
    CONFIG_EXTENSIONS,
    MAX_ENTRIES_PER_MONTH,
    yamlEscapeString,
    serializeEntry,
    serializeChangelog,
    parseChangelog,
    parseYamlValue,
    extractDomain,
    detectChangeType,
    isTestFile,
    isDocFile,
    hasFixPatterns,
    hasRefactorPatterns,
    hasNewDefinitions,
    getDefinitionPatterns,
    extractCommentLines,
    countPatternMatches,
    detectImpact,
    extractImportStatements,
    isExternalImport,
    isApiRouteFile,
    isModelFile,
    generateDescription,
    getChangelogFilePath,
    readChangelogFile,
    writeChangelogFile,
    appendEntry,
    toRelativePath,
    buildEntry,
    formatRecordingReport,
    shouldSkipFile
  };
}
