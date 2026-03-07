#!/usr/bin/env node
/**
 * Integrated Hook: Policy Gate
 *
 * Combines permission-checker (PreToolUse) + standards-validator (PostToolUse)
 * into a unified policy enforcement pipeline.
 *
 * Phase 2 Hook Consolidation - Replaces individual hooks
 *
 * Mode Detection:
 *   - PreToolUse: Permission checking (block unauthorized writes)
 *   - PostToolUse: Standards validation (report violations)
 *
 * Claude Code Hook Protocol:
 *   - stdin: JSON { hook_event_name, tool_name, tool_input, tool_result? }
 *   - stdout: JSON { decision: "allow"|"deny", reason? } (PreToolUse)
 *            or { hookSpecificOutput: { additionalContext } } (PostToolUse)
 */

const path = require('path');
const fs = require('fs');
const { emitHookDecision } = require('./lib/hook-decision-event');

// ---------------------------------------------------------------------------
// 1. Permission Matrix (from permission-checker.js)
// ---------------------------------------------------------------------------

const PERMISSION_MATRIX = {
  'project-manager': {
    write: ['management/**', 'docs/**'],
    cannot: ['src/**', 'contracts/standards/**', 'database/**']
  },
  'chief-architect': {
    write: ['contracts/standards/**', 'management/decisions/**', 'docs/architecture/**'],
    cannot: ['src/**', 'design/**']
  },
  'chief-designer': {
    write: ['contracts/standards/design-system.md', 'design/**'],
    cannot: ['src/**', 'database/**']
  },
  'dba': {
    write: ['contracts/standards/database-standards.md', 'database/**'],
    cannot: ['src/**/services/**', 'design/**']
  },
  'qa-manager': {
    write: ['qa/**', 'management/responses/from-qa/**'],
    cannot: ['src/**', 'contracts/standards/**']
  },
  'security-specialist': {
    write: ['security/**', 'docs/security/**', '.claude/security/**'],
    cannot: ['src/**'] // Reports only, doesn't modify code
  },
  'backend-specialist': {
    write: ['src/**/api/**', 'src/**/services/**', 'src/**/repositories/**'],
    cannot: ['design/**', 'database/schema/**']
  },
  'frontend-specialist': {
    write: ['src/**/components/**', 'src/**/pages/**', 'src/**/hooks/**', 'src/**/styles/**'],
    cannot: ['database/**', 'src/**/api/**']
  }
};

// ---------------------------------------------------------------------------
// 2. Standards Rules (from standards-validator.js - simplified)
// ---------------------------------------------------------------------------

const FORBIDDEN_PATTERNS = [
  {
    id: 'any-type',
    extensions: ['.ts', '.tsx'],
    patterns: [/:\s*any\b/, /\bas\s+any\b/],
    severity: 'error',
    message: 'Usage of "any" type is forbidden. Use proper types or "unknown".'
  },
  {
    id: 'console-log',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    patterns: [/\bconsole\.(log|debug|info)\s*\(/],
    severity: 'warning',
    message: 'console.log is forbidden in production. Use structured logging.'
  },
  {
    id: 'inline-style',
    extensions: ['.jsx', '.tsx'],
    patterns: [/style\s*=\s*\{\s*\{/],
    severity: 'error',
    message: 'Inline styles are forbidden. Use CSS classes or styled-components.'
  },
  {
    id: 'hardcoded-secret',
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.py'],
    patterns: [/(password|secret|api_key)\s*=\s*['"][^'"]{8,}['"]/i],
    severity: 'error',
    message: 'Hardcoded secrets detected. Use environment variables.'
  }
];

const NAMING_RULES = {
  python: {
    file: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
    className: /^[A-Z][a-zA-Z0-9]*$/,
    function: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
  },
  javascript: {
    file: /^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/,
    className: /^[A-Z][a-zA-Z0-9]*$/,
    function: /^[a-z][a-zA-Z0-9]*$/
  },
  component: {
    file: /^[A-Z][a-zA-Z0-9]*$/
  }
};

// ---------------------------------------------------------------------------
// 3. Path Matching Utilities
// ---------------------------------------------------------------------------

function globToRegex(pattern) {
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<DOUBLESTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<DOUBLESTAR>>/g, '.*');
  return new RegExp('^' + regex + '$');
}

function matchesAnyPattern(relativePath, patterns) {
  if (!patterns || patterns.length === 0) return false;
  for (const pattern of patterns) {
    if (pattern.includes('!(')) continue;
    if (globToRegex(pattern).test(relativePath)) return true;
  }
  return false;
}

function toRelativePath(filePath) {
  if (!filePath) return '';
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!path.isAbsolute(filePath)) return filePath;
  const relative = path.relative(projectDir, filePath);
  if (relative.startsWith('..')) return relative;
  return relative;
}

// ---------------------------------------------------------------------------
// 4. Permission Check (PreToolUse)
// ---------------------------------------------------------------------------

function checkPermission(role, relativePath) {
  const permissions = PERMISSION_MATRIX[role];
  if (!permissions) {
    return { allowed: true }; // Unknown role = allow (fallback)
  }

  // Check cannot rules
  if (permissions.cannot && matchesAnyPattern(relativePath, permissions.cannot)) {
    return {
      allowed: false,
      reason: `Role "${role}" cannot write to "${relativePath}" (restricted area).`
    };
  }

  // Check write rules
  if (permissions.write && matchesAnyPattern(relativePath, permissions.write)) {
    return { allowed: true };
  }

  // Default: allow if no explicit rules match
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// 5. Standards Validation (PostToolUse)
// ---------------------------------------------------------------------------

function validateContent(content, filePath) {
  const violations = [];
  const ext = path.extname(filePath);
  const lines = content.split('\n');

  // Check forbidden patterns
  for (const rule of FORBIDDEN_PATTERNS) {
    if (!rule.extensions.includes(ext)) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('#')) continue;

      for (const pattern of rule.patterns) {
        if (pattern.test(line)) {
          violations.push({
            type: 'forbidden',
            severity: rule.severity,
            message: rule.message,
            file: filePath,
            line: lineNum
          });
          break;
        }
      }
    }
  }

  // Check naming conventions
  const fileName = path.basename(filePath, ext);
  const isComponent = ['.tsx', '.jsx'].includes(ext);

  if (ext === '.py') {
    if (!NAMING_RULES.python.file.test(fileName) && !fileName.startsWith('__')) {
      violations.push({
        type: 'naming',
        severity: 'warning',
        message: `Python file "${fileName}" should use snake_case.`,
        file: filePath
      });
    }
  } else if (isComponent) {
    if (!NAMING_RULES.component.file.test(fileName) && !NAMING_RULES.javascript.file.test(fileName)) {
      violations.push({
        type: 'naming',
        severity: 'warning',
        message: `Component file "${fileName}" should use PascalCase.`,
        file: filePath
      });
    }
  }

  return violations;
}

function formatViolationReport(violations, filePath) {
  if (violations.length === 0) return '';

  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  let report = `\n[Policy Gate] ${violations.length} issue(s) in "${filePath}"`;
  report += `\n  Errors: ${errors.length} | Warnings: ${warnings.length}\n`;

  for (const v of violations) {
    const severity = v.severity === 'error' ? '[ERROR]' : '[WARN]';
    const lineRef = v.line ? ` (line ${v.line})` : '';
    report += `  ${severity}${lineRef} ${v.message}\n`;
  }

  return report;
}

// ---------------------------------------------------------------------------
// 6. Main Entry Point
// ---------------------------------------------------------------------------

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      try {
        resolve(data.trim() ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

async function main() {
  const input = await readStdin();
  const hookEvent = input.hook_event_name || '';
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || toolInput.path || '';

  if (!filePath) {
    await emitHookDecision(input, {
      hook: 'policy-gate',
      decision: 'skip',
      summary: 'No target file path provided.',
    });
    return;
  }

  const relativePath = toRelativePath(filePath);
  if (relativePath.startsWith('..')) {
    await emitHookDecision(input, {
      hook: 'policy-gate',
      decision: 'skip',
      summary: 'Target path is outside project scope.',
    });
    return;
  }

  // Detect agent role
  const agentRole = process.env.CLAUDE_AGENT_ROLE?.toLowerCase().replace(/\s+/g, '-') || '';

  // PreToolUse: Permission check
  if (hookEvent.startsWith('PreToolUse')) {
    if (agentRole) {
      const result = checkPermission(agentRole, relativePath);
      if (!result.allowed) {
        await emitHookDecision(input, {
          hook: 'policy-gate',
          decision: 'deny',
          severity: 'error',
          summary: 'Write denied by role policy.',
          remediation: 'Request an authorized role or target an allowed path.',
        });
        process.stdout.write(JSON.stringify({
          decision: 'deny',
          reason: result.reason
        }));
        return;
      }
    }
    await emitHookDecision(input, {
      hook: 'policy-gate',
      decision: 'allow',
      severity: 'info',
      summary: 'Write allowed by policy checks.',
    });
    // Allow by default
    return;
  }

  // PostToolUse: Standards validation
  if (hookEvent.startsWith('PostToolUse')) {
    const content = toolInput.content || toolInput.new_string || '';
    if (!content) {
      await emitHookDecision(input, {
        hook: 'policy-gate',
        decision: 'skip',
        summary: 'No content provided for standards validation.',
      });
      return;
    }

    const violations = validateContent(content, relativePath);
    if (violations.length > 0) {
      const report = formatViolationReport(violations, relativePath);
      const hasError = violations.some((v) => v.severity === 'error');
      await emitHookDecision(input, {
        hook: 'policy-gate',
        decision: 'warn',
        severity: hasError ? 'error' : 'warning',
        summary: `${violations.length} standards issue(s) detected.`,
        remediation: 'Review policy warnings before continuing.',
      });
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          additionalContext: report,
          hookEventName: hookEvent
        }
      }));
    } else {
      await emitHookDecision(input, {
        hook: 'policy-gate',
        decision: 'allow',
        severity: 'info',
        summary: 'Standards validation passed.',
      });
    }
    return;
  }

  await emitHookDecision(input, {
    hook: 'policy-gate',
    decision: 'skip',
    summary: 'Unsupported hook event.',
  });
}

main().catch(() => {});

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PERMISSION_MATRIX,
    FORBIDDEN_PATTERNS,
    checkPermission,
    validateContent,
    formatViolationReport,
    matchesAnyPattern,
    globToRegex
  };
}
