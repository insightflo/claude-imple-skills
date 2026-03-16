#!/usr/bin/env node
/**
 * PostToolUse[Edit|Write] Hook: Design System Validator
 *
 * Enforces design system compliance by validating:
 * - Design token usage (var(--color-*), var(--font-*), var(--space-*))
 * - Forbidden inline styles (React style={{}} pattern)
 * - Hardcoded color values (#fff, rgb(), hsl())
 * - Non-standard spacing (must be 4px multiples: 4, 8, 16, 24, 32, 48)
 *
 * @TASK P2-T3 - Design Validator Hook
 * @SPEC project-team/hooks/design-validator.js
 *
 * Claude Code Hook Protocol:
 *   - stdin: JSON { tool_name, tool_input: { file_path, content, ... } }
 *   - stdout: JSON { decision: "allow"|"deny", reason?: string }
 *             or { hookSpecificOutput: { additionalContext: string } }
 *
 * Event: post_tool_use
 * Tools: Edit, Write
 * Patterns: glob patterns for tsx, jsx, css, scss, styles.ts files
 */

const path = require('path');

// ---------------------------------------------------------------------------
// 1. Design System Rules
// ---------------------------------------------------------------------------

/**
 * Design token patterns (allowed)
 */
const DESIGN_TOKENS = {
  color: /var\(--color-[a-z0-9-]+\)/g,
  font: /var\(--font-[a-z0-9-]+\)/g,
  space: /var\(--space-[a-z0-9-]+\)/g,
  any: /var\(--[a-z0-9-]+\)/g
};

/**
 * Forbidden patterns
 */
const FORBIDDEN_PATTERNS = {
  // Inline styles in React
  inlineStyle: {
    pattern: /style\s*=\s*\{\{[^}]*\}\}/g,
    message: 'Inline styles are forbidden. Use CSS classes or styled-components with design tokens.',
    severity: 'error'
  },

  // Hardcoded colors
  hexColor: {
    pattern: /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g,
    message: 'Hardcoded hex colors are forbidden. Use var(--color-*) design tokens.',
    severity: 'error',
    exceptions: ['#000', '#000000', '#fff', '#ffffff', 'transparent'] // Allow only in design token definitions
  },
  rgbColor: {
    pattern: /\brgb\s*\([^)]+\)/g,
    message: 'Hardcoded RGB colors are forbidden. Use var(--color-*) design tokens.',
    severity: 'error'
  },
  hslColor: {
    pattern: /\bhsl\s*\([^)]+\)/g,
    message: 'Hardcoded HSL colors are forbidden. Use var(--color-*) design tokens.',
    severity: 'error'
  },

  // Non-standard spacing (not 4px multiples)
  // Matches: padding: 5px, margin: 15px, gap: 3rem, etc.
  nonStandardSpacing: {
    pattern: /\b(padding|margin|gap|top|right|bottom|left|width|height)\s*:\s*['"]?(\d+(?:\.\d+)?)(px|rem|em)['"]?(?=[^a-zA-Z0-9]|$)/g,
    message: 'Use standard spacing values (4px multiples: 4, 8, 16, 24, 32, 48) or design tokens var(--space-*).',
    severity: 'warning',
    validator: (match) => {
      const value = parseFloat(match[2]);
      const unit = match[3];

      // Convert to px for validation
      let pxValue = value;
      if (unit === 'rem' || unit === 'em') {
        pxValue = value * 16; // Assume 1rem = 16px
      }

      // Check if it's a 4px multiple
      return pxValue % 4 !== 0;
    }
  }
};

/**
 * File patterns to validate
 */
const VALIDATION_PATTERNS = [
  '**/*.tsx',
  '**/*.jsx',
  '**/*.css',
  '**/*.scss',
  '**/*.styles.ts',
  '**/*.styles.js'
];

/**
 * Files to skip (design token definition files)
 */
const SKIP_PATTERNS = [
  '**/tokens.css',
  '**/design-tokens.css',
  '**/variables.css',
  '**/theme.ts',
  '**/theme.js',
  '**/__tests__/**',
  '**/*.test.tsx',
  '**/*.test.ts',
  '**/*.spec.tsx',
  '**/*.spec.ts'
];

// ---------------------------------------------------------------------------
// 2. Path Matching Utilities
// ---------------------------------------------------------------------------

/**
 * Convert a simplified glob pattern to a RegExp.
 * @param {string} pattern - Glob-like pattern
 * @returns {RegExp}
 */
function globToRegex(pattern) {
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<DOUBLESTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<DOUBLESTAR>>/g, '.*');
  return new RegExp('^' + regex + '$');
}

/**
 * Check if a file path matches any pattern.
 * @param {string} filePath
 * @param {string[]} patterns
 * @returns {boolean}
 */
function matchesAnyPattern(filePath, patterns) {
  return patterns.some(pattern => globToRegex(pattern).test(filePath));
}

/**
 * Check if file should be validated.
 * @param {string} relativePath
 * @returns {boolean}
 */
function shouldValidate(relativePath) {
  // Skip if in skip patterns
  if (matchesAnyPattern(relativePath, SKIP_PATTERNS)) {
    return false;
  }

  // Validate if matches validation patterns
  return matchesAnyPattern(relativePath, VALIDATION_PATTERNS);
}

// ---------------------------------------------------------------------------
// 3. Validation Logic
// ---------------------------------------------------------------------------

/**
 * Validate file content against design system rules.
 * @param {string} content - File content
 * @param {string} filePath - File path (for context)
 * @returns {{ valid: boolean, violations: Array, warnings: Array }}
 */
function validateContent(content, filePath) {
  const violations = [];
  const warnings = [];

  // Check each forbidden pattern
  for (const [name, rule] of Object.entries(FORBIDDEN_PATTERNS)) {
    const matches = [...content.matchAll(rule.pattern)];

    for (const match of matches) {
      // Apply custom validator if present
      if (rule.validator && !rule.validator(match)) {
        continue;
      }

      // Check exceptions
      if (rule.exceptions) {
        const matchText = match[0];
        if (rule.exceptions.some(ex => matchText.includes(ex))) {
          continue;
        }
      }

      const violation = {
        pattern: name,
        match: match[0],
        message: rule.message,
        line: getLineNumber(content, match.index),
        column: match.index - getLineStartIndex(content, match.index)
      };

      if (rule.severity === 'error') {
        violations.push(violation);
      } else {
        warnings.push(violation);
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    warnings
  };
}

/**
 * Get line number from character index.
 * @param {string} content
 * @param {number} index
 * @returns {number}
 */
function getLineNumber(content, index) {
  return content.substring(0, index).split('\n').length;
}

/**
 * Get start index of the line containing the character index.
 * @param {string} content
 * @param {number} index
 * @returns {number}
 */
function getLineStartIndex(content, index) {
  const beforeMatch = content.substring(0, index);
  const lastNewline = beforeMatch.lastIndexOf('\n');
  return lastNewline === -1 ? 0 : lastNewline + 1;
}

// ---------------------------------------------------------------------------
// 4. Message Formatting
// ---------------------------------------------------------------------------

/**
 * Format violation message.
 * @param {string} filePath
 * @param {Array} violations
 * @param {Array} warnings
 * @returns {string}
 */
function formatViolationMessage(filePath, violations, warnings) {
  let message = `[Design System Violation] File "${filePath}" contains design rule violations:\n\n`;

  if (violations.length > 0) {
    message += '🚫 ERRORS (must fix):\n';
    violations.forEach((v, i) => {
      message += `  ${i + 1}. Line ${v.line}: ${v.message}\n`;
      message += `     Found: ${v.match}\n`;
    });
  }

  if (warnings.length > 0) {
    message += '\n⚠️  WARNINGS (recommended to fix):\n';
    warnings.forEach((w, i) => {
      message += `  ${i + 1}. Line ${w.line}: ${w.message}\n`;
      message += `     Found: ${w.match}\n`;
    });
  }

  message += '\n📖 Design System Guide:\n';
  message += '  - Colors: Use var(--color-primary), var(--color-secondary), etc.\n';
  message += '  - Spacing: Use 4px multiples (4, 8, 16, 24, 32, 48) or var(--space-*)\n';
  message += '  - Typography: Use var(--font-*) tokens\n';
  message += '  - NO inline styles allowed (use CSS classes or styled-components)\n';
  message += '\n  See: contracts/standards/design-system.md for full reference.\n';

  return message;
}

/**
 * Format warning context (non-blocking).
 * @param {string} filePath
 * @param {Array} warnings
 * @returns {string}
 */
function formatWarningContext(filePath, warnings) {
  let message = `[Design System] File "${filePath}" has ${warnings.length} design warning(s):\n\n`;

  warnings.forEach((w, i) => {
    message += `  ${i + 1}. Line ${w.line}: ${w.message}\n`;
    message += `     Found: ${w.match}\n`;
  });

  message += '\nConsider updating to follow design system standards.\n';

  return message;
}

// ---------------------------------------------------------------------------
// 5. stdin/stdout Helpers (Claude Code Hook Protocol)
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
 * Output a deny decision.
 * @param {string} reason
 */
function outputDeny(reason) {
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: reason
  }));
}

/**
 * Output a warning via additionalContext (does not block).
 * @param {string} context
 */
function outputWarning(context) {
  const hookSpecificOutput = { additionalContext: context };
  if (_hookEventName) hookSpecificOutput.hookEventName = _hookEventName;
  process.stdout.write(JSON.stringify({ hookSpecificOutput }));
}

// ---------------------------------------------------------------------------
// 6. Relative Path Resolution
// ---------------------------------------------------------------------------

/**
 * Convert an absolute file path to a project-relative path.
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
// 7. Main Hook Entry Point
// ---------------------------------------------------------------------------

async function main() {
  const input = await readStdin();

  // Extract file path and content from tool input
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || toolInput.path || '';
  const content = toolInput.content || toolInput.new_string || '';

  if (!filePath || !content) return; // Nothing to validate

  // Convert to project-relative path
  const relativePath = toRelativePath(filePath);

  // Skip files outside project
  if (relativePath.startsWith('..')) return;

  // Check if file should be validated
  if (!shouldValidate(relativePath)) return;

  // Perform validation
  const result = validateContent(content, relativePath);

  // If valid, allow silently
  if (result.valid && result.warnings.length === 0) {
    return;
  }

  // If only warnings (no errors), output as context but allow
  if (result.valid && result.warnings.length > 0) {
    outputWarning(formatWarningContext(relativePath, result.warnings));
    return;
  }

  // If violations exist, deny the operation
  outputDeny(formatViolationMessage(relativePath, result.violations, result.warnings));
}

main().catch((err) => { console.error('[design-validator] Unhandled error:', err.message); });

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DESIGN_TOKENS,
    FORBIDDEN_PATTERNS,
    VALIDATION_PATTERNS,
    SKIP_PATTERNS,
    globToRegex,
    matchesAnyPattern,
    shouldValidate,
    validateContent,
    getLineNumber,
    getLineStartIndex,
    formatViolationMessage,
    formatWarningContext,
    toRelativePath
  };
}
