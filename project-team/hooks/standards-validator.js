#!/usr/bin/env node
/**
 * PostToolUse[Edit|Write] Hook: Standards Validator
 *
 * Validates coding conventions, architecture standards, and forbidden
 * patterns after file modifications. Provides clear violation reports
 * with fix guidance.
 *
 * @TASK P2-T2 - Standards Validator Hook
 * @SPEC .claude/agents/architecture-lead.md#enforcement-hook
 *
 * Claude Code Hook Protocol (PostToolUse):
 *   - stdin: JSON { tool_name, tool_input: { file_path, content, ... }, tool_result: ... }
 *   - stdout: JSON { hookSpecificOutput: { additionalContext: string } }
 *
 * PostToolUse hooks cannot block (the tool already executed).
 * Instead, they inject additionalContext to guide the agent toward fixes.
 *
 * Constitution (enforced standards):
 *   - Naming: snake_case (files), PascalCase (classes), camelCase (functions)
 *   - Architecture: Presentation > Application > Domain > Infrastructure
 *   - Dependency direction: outer -> inner only (no reverse)
 *   - Domain communication: Interface Contract required
 *   - Forbidden: any type, console.log, inline style, hardcoded colors, direct DOM
 */

const path = require('path');

// ---------------------------------------------------------------------------
// 1. Configuration: Supported File Extensions
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx',
  '.py',
  '.css', '.scss', '.less',
  '.vue', '.svelte'
]);

// ---------------------------------------------------------------------------
// 2. Naming Convention Rules
// ---------------------------------------------------------------------------

/**
 * Validate file naming convention (snake_case).
 * Files should use snake_case or kebab-case naming.
 * Exceptions: PascalCase for component files (React/Vue/Svelte).
 *
 * @param {string} filePath - Relative file path
 * @returns {object[]} Array of violations
 */
function validateFileName(filePath) {
  const violations = [];
  const fileName = path.basename(filePath, path.extname(filePath));
  const ext = path.extname(filePath);

  // Skip non-code files
  if (!SUPPORTED_EXTENSIONS.has(ext)) return violations;

  // Skip special files
  const skipPatterns = [
    /^__/,           // __init__.py, __test__
    /^\./, // dotfiles
    /^index$/,       // index.js/ts
    /^setup$/,       // setup.py
    /^conftest$/,    // conftest.py
    /^jest\.config/, // jest config
    /^vite\.config/, // vite config
    /^next\.config/, // next config
    /^tailwind\.config/,
    /^postcss\.config/,
    /^tsconfig/
  ];
  if (skipPatterns.some(p => p.test(fileName))) return violations;

  // Component files (.tsx, .jsx, .vue, .svelte) allow PascalCase
  const componentExts = new Set(['.tsx', '.jsx', '.vue', '.svelte']);
  if (componentExts.has(ext)) {
    // PascalCase: starts with uppercase, no underscores/hyphens in wrong places
    const isPascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(fileName);
    const isSnakeCase = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(fileName);
    const isKebabCase = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(fileName);
    if (!isPascalCase && !isSnakeCase && !isKebabCase) {
      violations.push({
        type: 'naming',
        severity: 'warning',
        message: `File "${fileName}${ext}" does not follow naming convention. `
          + `Use PascalCase for components (e.g., UserProfile${ext}) `
          + `or snake_case/kebab-case for utilities.`,
        file: filePath
      });
    }
    return violations;
  }

  // Python files should use snake_case
  if (ext === '.py') {
    const isSnakeCase = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(fileName);
    if (!isSnakeCase) {
      violations.push({
        type: 'naming',
        severity: 'warning',
        message: `Python file "${fileName}${ext}" should use snake_case naming `
          + `(e.g., user_service.py, auth_handler.py).`,
        file: filePath
      });
    }
    return violations;
  }

  // JS/TS non-component files: snake_case or kebab-case
  if (['.js', '.ts'].includes(ext)) {
    const isSnakeCase = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(fileName);
    const isKebabCase = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(fileName);
    // Also allow dotted names like "permission-checker.test"
    const isDottedName = /^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/.test(fileName);
    if (!isSnakeCase && !isKebabCase && !isDottedName) {
      violations.push({
        type: 'naming',
        severity: 'warning',
        message: `File "${fileName}${ext}" should use snake_case or kebab-case naming `
          + `(e.g., user_service.js, auth-handler.ts).`,
        file: filePath
      });
    }
    return violations;
  }

  return violations;
}

/**
 * Validate class naming convention (PascalCase).
 *
 * @param {string} content - File content
 * @param {string} filePath - For context in messages
 * @returns {object[]} Array of violations
 */
function validateClassNames(content, filePath) {
  const violations = [];
  const ext = path.extname(filePath);
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    let className = null;

    // Python class definition
    if (ext === '.py') {
      const pyMatch = line.match(/^class\s+([A-Za-z_]\w*)\s*[:(]/);
      if (pyMatch) className = pyMatch[1];
    }

    // JS/TS class definition
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      const jsMatch = line.match(/(?:^|export\s+(?:default\s+)?)class\s+([A-Za-z_$]\w*)/);
      if (jsMatch) className = jsMatch[1];
    }

    if (className) {
      const isPascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(className);
      if (!isPascalCase) {
        violations.push({
          type: 'naming',
          severity: 'error',
          message: `Class "${className}" at line ${lineNum} should use PascalCase `
            + `(e.g., ${toPascalCase(className)}).`,
          file: filePath,
          line: lineNum
        });
      }
    }
  }

  return violations;
}

/**
 * Validate function naming convention (camelCase for JS/TS, snake_case for Python).
 *
 * @param {string} content - File content
 * @param {string} filePath - For context in messages
 * @returns {object[]} Array of violations
 */
function validateFunctionNames(content, filePath) {
  const violations = [];
  const ext = path.extname(filePath);
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    let funcName = null;
    let expectedStyle = null;

    // Python function definition
    if (ext === '.py') {
      const pyMatch = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
      if (pyMatch) {
        funcName = pyMatch[1];
        expectedStyle = 'snake_case';
      }
    }

    // JS/TS function definition
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      // function declaration
      const funcDeclMatch = line.match(/(?:^|export\s+(?:default\s+)?)(?:async\s+)?function\s+([A-Za-z_$]\w*)\s*\(/);
      if (funcDeclMatch) {
        funcName = funcDeclMatch[1];
        expectedStyle = 'camelCase';
      }

      // Arrow function / const assignment (skip if looks like component - PascalCase allowed)
      if (!funcName) {
        const arrowMatch = line.match(/(?:const|let|var)\s+([A-Za-z_$]\w*)\s*=\s*(?:async\s*)?\(/);
        if (arrowMatch) {
          funcName = arrowMatch[1];
          expectedStyle = 'camelCase';
        }
      }
    }

    if (funcName && expectedStyle) {
      // Skip dunder methods in Python
      if (expectedStyle === 'snake_case' && funcName.startsWith('__') && funcName.endsWith('__')) {
        continue;
      }
      // Skip private methods starting with _ in Python
      if (expectedStyle === 'snake_case' && funcName.startsWith('_')) {
        // Validate the rest after underscore
        const rest = funcName.replace(/^_+/, '');
        if (rest && !/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(rest)) {
          violations.push({
            type: 'naming',
            severity: 'warning',
            message: `Function "${funcName}" at line ${lineNum} should use snake_case `
              + `(e.g., _${toSnakeCase(rest)}).`,
            file: filePath,
            line: lineNum
          });
        }
        continue;
      }

      if (expectedStyle === 'snake_case') {
        const isSnakeCase = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(funcName);
        if (!isSnakeCase) {
          violations.push({
            type: 'naming',
            severity: 'warning',
            message: `Function "${funcName}" at line ${lineNum} should use snake_case `
              + `(e.g., ${toSnakeCase(funcName)}).`,
            file: filePath,
            line: lineNum
          });
        }
      }

      if (expectedStyle === 'camelCase') {
        const isCamelCase = /^[a-z][a-zA-Z0-9]*$/.test(funcName);
        // Also allow PascalCase for React components (functions returning JSX)
        const isPascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(funcName);
        const isComponentFile = ['.tsx', '.jsx'].includes(ext);

        if (!isCamelCase && !(isPascalCase && isComponentFile)) {
          violations.push({
            type: 'naming',
            severity: 'warning',
            message: `Function "${funcName}" at line ${lineNum} should use camelCase `
              + `(e.g., ${toCamelCase(funcName)}).`,
            file: filePath,
            line: lineNum
          });
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 3. Forbidden Pattern Rules
// ---------------------------------------------------------------------------

/**
 * Registry of forbidden patterns with detection regex and fix guidance.
 * Each entry checks a specific anti-pattern defined in the Constitution.
 */
const FORBIDDEN_PATTERNS = [
  {
    id: 'any-type',
    name: 'any type usage',
    extensions: ['.ts', '.tsx'],
    // Match `: any`, `as any`, `<any>`, but not inside comments or strings
    patterns: [
      /:\s*any\b/,
      /\bas\s+any\b/,
      /<any>/
    ],
    severity: 'error',
    message: 'Usage of "any" type is forbidden. Use proper types, generics, or "unknown" instead.',
    fix: 'Replace "any" with a specific type. If the type is truly unknown, use "unknown" and narrow with type guards.'
  },
  {
    id: 'console-log',
    name: 'console.log usage',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    patterns: [
      /\bconsole\.(log|debug|info|warn|error|trace|dir|table)\s*\(/
    ],
    severity: 'warning',
    message: 'console.log is forbidden in production code. Use structured logging instead.',
    fix: 'Use the project logger (e.g., logger.info({ context, data })) for structured JSON logging.'
  },
  {
    id: 'inline-style',
    name: 'inline style usage',
    extensions: ['.jsx', '.tsx', '.vue', '.svelte'],
    patterns: [
      /style\s*=\s*\{\s*\{/,    // style={{ ... }}
      /style\s*=\s*["']/         // style="..." or style='...'
    ],
    severity: 'error',
    message: 'Inline styles are forbidden (no exceptions). Use CSS classes or styled-components.',
    fix: 'Move styles to a CSS/SCSS module or use a CSS-in-JS solution (styled-components, Tailwind classes).'
  },
  {
    id: 'hardcoded-color',
    name: 'hardcoded color value',
    extensions: ['.jsx', '.tsx', '.js', '.ts', '.css', '.scss', '.less', '.vue', '.svelte'],
    patterns: [
      // Hex colors: #fff, #ffffff, #ffffffff (but not inside CSS custom properties or var())
      /(?<!var\(\s*)#[0-9a-fA-F]{3,8}\b/,
      // rgb/rgba colors
      /\brgba?\s*\(\s*\d+/,
      // hsl/hsla colors
      /\bhsla?\s*\(\s*\d+/
    ],
    // Skip CSS variable definitions and design token files
    skipIf: (line, filePath) => {
      // Allow in design token/theme files
      if (/theme|token|variables|colors/i.test(filePath)) return true;
      // Allow CSS custom property definitions
      if (/--[\w-]+\s*:/.test(line)) return true;
      // Allow var() references
      if (/var\(/.test(line)) return true;
      return false;
    },
    severity: 'warning',
    message: 'Hardcoded color values are forbidden. Use design tokens or CSS custom properties.',
    fix: 'Use design tokens (e.g., var(--color-primary)) or theme constants from the design system.'
  },
  {
    id: 'direct-dom',
    name: 'direct DOM manipulation',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    patterns: [
      /\bdocument\.(getElementById|getElementsBy|querySelector|querySelectorAll|createElement)\b/,
      /\.innerHTML\s*=/,
      /\.outerHTML\s*=/,
      /\.insertAdjacentHTML\s*\(/
    ],
    // Skip test files and utility/helper files
    skipIf: (_line, filePath) => {
      if (/\.(test|spec)\.[jt]sx?$/.test(filePath)) return true;
      if (/(__tests__|__mocks__)/.test(filePath)) return true;
      return false;
    },
    severity: 'error',
    message: 'Direct DOM manipulation is forbidden. Use the framework\'s reactive rendering.',
    fix: 'Use React refs, Vue refs, or Svelte bindings instead of direct DOM access.'
  }
];

/**
 * Check content against all forbidden patterns.
 *
 * @param {string} content - File content
 * @param {string} filePath - File path for extension detection
 * @returns {object[]} Array of violations
 */
function validateForbiddenPatterns(content, filePath) {
  const violations = [];
  const ext = path.extname(filePath);
  const lines = content.split('\n');

  for (const rule of FORBIDDEN_PATTERNS) {
    // Skip if file extension does not match
    if (!rule.extensions.includes(ext)) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comment lines
      if (isCommentLine(line, ext)) continue;

      // Skip if rule has a skipIf condition and it returns true
      if (rule.skipIf && rule.skipIf(line, filePath)) continue;

      for (const pattern of rule.patterns) {
        if (pattern.test(line)) {
          violations.push({
            type: 'forbidden',
            id: rule.id,
            severity: rule.severity,
            message: rule.message,
            fix: rule.fix,
            file: filePath,
            line: lineNum,
            lineContent: line.trim().substring(0, 100)
          });
          break; // One violation per line per rule
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 4. Architecture Layer Validation
// ---------------------------------------------------------------------------

/**
 * Architecture layers ordered from outermost to innermost.
 * Dependencies must flow inward only (lower index -> higher index).
 */
const ARCHITECTURE_LAYERS = [
  { name: 'presentation', patterns: ['routes', 'controllers', 'views', 'pages', 'components', 'screens'] },
  { name: 'application', patterns: ['services', 'usecases', 'use_cases', 'handlers', 'commands', 'queries'] },
  { name: 'domain', patterns: ['models', 'entities', 'domain', 'aggregates', 'value_objects'] },
  { name: 'infrastructure', patterns: ['repositories', 'database', 'external', 'adapters', 'clients', 'providers'] }
];

/**
 * Detect which architecture layer a file belongs to based on its path.
 *
 * @param {string} filePath - Relative file path
 * @returns {{ layer: string, index: number } | null}
 */
function detectLayer(filePath) {
  const parts = filePath.toLowerCase().split('/');

  for (let i = 0; i < ARCHITECTURE_LAYERS.length; i++) {
    const layer = ARCHITECTURE_LAYERS[i];
    if (layer.patterns.some(p => parts.includes(p))) {
      return { layer: layer.name, index: i };
    }
  }

  return null;
}

/**
 * Validate architecture layer dependencies.
 * Checks that import statements do not violate the dependency direction rule:
 * Dependencies must flow from outer layers to inner layers.
 *
 * - Presentation -> Application (OK)
 * - Application -> Domain (OK)
 * - Domain -> Presentation (VIOLATION - reverse dependency)
 * - Infrastructure -> Domain (OK - infrastructure implements domain interfaces)
 *
 * @param {string} content - File content
 * @param {string} filePath - File path to determine source layer
 * @returns {object[]} Array of violations
 */
function validateArchitectureLayers(content, filePath) {
  const violations = [];
  const ext = path.extname(filePath);

  // Only check Python and JS/TS files
  if (!['.py', '.js', '.ts', '.jsx', '.tsx'].includes(ext)) return violations;

  const sourceLayer = detectLayer(filePath);
  if (!sourceLayer) return violations;

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    if (isCommentLine(line, ext)) continue;

    // Extract import paths
    const importPaths = extractImportPaths(line, ext);

    for (const importPath of importPaths) {
      const targetLayer = detectLayer(importPath);
      if (!targetLayer) continue;

      // Infrastructure is special: it implements domain interfaces,
      // so it legitimately imports from domain.
      if (sourceLayer.layer === 'infrastructure') continue;

      // Domain should not import from presentation or application
      if (sourceLayer.layer === 'domain' && targetLayer.index < sourceLayer.index) {
        violations.push({
          type: 'architecture',
          severity: 'error',
          message: `Architecture violation: "${sourceLayer.layer}" layer imports from `
            + `"${targetLayer.layer}" layer. Dependencies must flow inward `
            + `(Presentation -> Application -> Domain). `
            + `Domain must not depend on outer layers.`,
          file: filePath,
          line: lineNum,
          source: sourceLayer.layer,
          target: targetLayer.layer
        });
      }

      // Application should not import from presentation
      if (sourceLayer.layer === 'application' && targetLayer.layer === 'presentation') {
        violations.push({
          type: 'architecture',
          severity: 'error',
          message: `Architecture violation: "${sourceLayer.layer}" layer imports from `
            + `"${targetLayer.layer}" layer. Application layer must not depend on `
            + `Presentation layer.`,
          file: filePath,
          line: lineNum,
          source: sourceLayer.layer,
          target: targetLayer.layer
        });
      }
    }
  }

  return violations;
}

/**
 * Extract import paths from a line of code.
 *
 * @param {string} line - Single line of code
 * @param {string} ext - File extension
 * @returns {string[]} Array of import path strings
 */
function extractImportPaths(line, ext) {
  const paths = [];

  if (ext === '.py') {
    // Python: from x.y.z import ...
    const fromMatch = line.match(/^\s*from\s+([\w.]+)\s+import/);
    if (fromMatch) paths.push(fromMatch[1].replace(/\./g, '/'));

    // Python: import x.y.z
    const importMatch = line.match(/^\s*import\s+([\w.]+)/);
    if (importMatch) paths.push(importMatch[1].replace(/\./g, '/'));
  }

  if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
    // JS/TS: import ... from '...'
    const jsImportMatch = line.match(/(?:import|from)\s+['"]([^'"]+)['"]/);
    if (jsImportMatch) paths.push(jsImportMatch[1]);

    // JS/TS: require('...')
    const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) paths.push(requireMatch[1]);
  }

  return paths;
}

// ---------------------------------------------------------------------------
// 5. Error Handling Validation
// ---------------------------------------------------------------------------

/**
 * Check for proper domain-specific exception usage.
 * Generic exceptions (Exception, Error, RuntimeError) should be avoided
 * in favor of domain-specific custom exceptions.
 *
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {object[]} Array of violations
 */
function validateErrorHandling(content, filePath) {
  const violations = [];
  const ext = path.extname(filePath);
  const lines = content.split('\n');

  // Only check domain layer files
  const layer = detectLayer(filePath);
  if (!layer || layer.layer !== 'domain') return violations;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (isCommentLine(line, ext)) continue;

    // Python: raise Exception/RuntimeError/ValueError (generic exceptions)
    if (ext === '.py') {
      const raiseMatch = line.match(/\braise\s+(Exception|RuntimeError|ValueError|TypeError)\b/);
      if (raiseMatch) {
        violations.push({
          type: 'error-handling',
          severity: 'warning',
          message: `Generic exception "${raiseMatch[1]}" used at line ${lineNum}. `
            + `Domain layer should use domain-specific custom exceptions.`,
          fix: 'Create a custom exception class (e.g., UserNotFoundError, InvalidOrderError) '
            + 'in the domain exceptions module.',
          file: filePath,
          line: lineNum
        });
      }
    }

    // JS/TS: throw new Error (generic)
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      const throwMatch = line.match(/\bthrow\s+new\s+(Error|TypeError|RangeError)\b/);
      if (throwMatch) {
        violations.push({
          type: 'error-handling',
          severity: 'warning',
          message: `Generic error "${throwMatch[1]}" thrown at line ${lineNum}. `
            + `Domain layer should use domain-specific custom exceptions.`,
          fix: 'Create a custom error class (e.g., UserNotFoundError extends DomainError) '
            + 'in the domain errors module.',
          file: filePath,
          line: lineNum
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 6. Logging Validation
// ---------------------------------------------------------------------------

/**
 * Check for structured JSON logging compliance.
 * Unstructured logging (print, console.log without context) should be flagged.
 *
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @returns {object[]} Array of violations
 */
function validateLogging(content, filePath) {
  const violations = [];
  const ext = path.extname(filePath);
  const lines = content.split('\n');

  // Skip test files
  if (/\.(test|spec)\.[jt]sx?$/.test(filePath)) return violations;
  if (/test_[\w]+\.py$/.test(filePath)) return violations;
  if (/conftest\.py$/.test(filePath)) return violations;
  if (/(__tests__|__mocks__|fixtures)/.test(filePath)) return violations;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (isCommentLine(line, ext)) continue;

    // Python: print() usage in non-script files
    if (ext === '.py') {
      const printMatch = line.match(/\bprint\s*\(/);
      if (printMatch) {
        // Allow print in __main__ blocks
        const isMainBlock = lines.slice(Math.max(0, i - 5), i + 1)
          .some(l => /if\s+__name__\s*==\s*['"]__main__['"]/.test(l));
        if (!isMainBlock) {
          violations.push({
            type: 'logging',
            severity: 'warning',
            message: `print() at line ${lineNum} should use structured logging.`,
            fix: 'Use logger.info/warning/error with structured data: '
              + 'logger.info("message", extra={"key": "value"})',
            file: filePath,
            line: lineNum
          });
        }
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 7. Utility Functions
// ---------------------------------------------------------------------------

/**
 * Check if a line is a comment.
 * @param {string} line - Code line
 * @param {string} ext - File extension
 * @returns {boolean}
 */
function isCommentLine(line, ext) {
  const trimmed = line.trim();

  // Python comments
  if (ext === '.py') {
    return trimmed.startsWith('#');
  }

  // JS/TS/CSS comments
  if (['.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.less'].includes(ext)) {
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
  }

  // HTML-style comments
  if (['.vue', '.svelte'].includes(ext)) {
    return trimmed.startsWith('//') || trimmed.startsWith('*')
      || trimmed.startsWith('/*') || trimmed.startsWith('<!--');
  }

  return false;
}

/**
 * Convert a name to PascalCase suggestion.
 * @param {string} name
 * @returns {string}
 */
function toPascalCase(name) {
  return name
    .replace(/[-_]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

/**
 * Convert a name to camelCase suggestion.
 * @param {string} name
 * @returns {string}
 */
function toCamelCase(name) {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Convert a name to snake_case suggestion.
 * @param {string} name
 * @returns {string}
 */
function toSnakeCase(name) {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/-/g, '_')
    .replace(/__+/g, '_');
}

// ---------------------------------------------------------------------------
// 8. Report Formatting
// ---------------------------------------------------------------------------

/**
 * Format violations into a human-readable report.
 *
 * @param {object[]} violations - Array of violation objects
 * @param {string} filePath - The file that was checked
 * @returns {string} Formatted report
 */
function formatViolationReport(violations, filePath) {
  if (violations.length === 0) return '';

  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  let report = `\n[Standards Validator] ${violations.length} violation(s) found in "${filePath}"`;
  report += `\n  Errors: ${errors.length} | Warnings: ${warnings.length}`;
  report += '\n';

  // Group by type
  const grouped = {};
  for (const v of violations) {
    if (!grouped[v.type]) grouped[v.type] = [];
    grouped[v.type].push(v);
  }

  for (const [type, items] of Object.entries(grouped)) {
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    report += `\n  -- ${typeLabel} --`;

    for (const item of items) {
      const severity = item.severity === 'error' ? '[ERROR]' : '[WARN]';
      const lineRef = item.line ? ` (line ${item.line})` : '';
      report += `\n  ${severity}${lineRef} ${item.message}`;
      if (item.fix) {
        report += `\n    Fix: ${item.fix}`;
      }
      if (item.lineContent) {
        report += `\n    Code: ${item.lineContent}`;
      }
    }
  }

  report += '\n\n  Please fix the violations above to comply with project standards.';
  report += '\n  Reference: contracts/standards/coding-standards.md';

  return report;
}

// ---------------------------------------------------------------------------
// 9. stdin/stdout Helpers (Claude Code Hook Protocol)
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
// 10. Main Validation Pipeline
// ---------------------------------------------------------------------------

/**
 * Run all validation checks on the given file content.
 *
 * @param {string} content - File content
 * @param {string} filePath - Relative file path
 * @returns {object[]} Array of all violations
 */
function validateAll(content, filePath) {
  const ext = path.extname(filePath);

  // Skip non-supported files
  if (!SUPPORTED_EXTENSIONS.has(ext)) return [];

  // Skip test files for most checks (except naming)
  const isTest = /\.(test|spec)\.[jt]sx?$/.test(filePath)
    || /test_[\w]+\.py$/.test(filePath)
    || /(__tests__|__mocks__)/.test(filePath)
    || /conftest\.py$/.test(filePath);

  const violations = [];

  // 1. File naming validation (always)
  violations.push(...validateFileName(filePath));

  // 2. Class naming validation (always)
  violations.push(...validateClassNames(content, filePath));

  // 3. Function naming validation (skip test files for Python)
  if (!isTest || !['.py'].includes(ext)) {
    violations.push(...validateFunctionNames(content, filePath));
  }

  // 4. Forbidden patterns (always, rules handle their own skipping)
  violations.push(...validateForbiddenPatterns(content, filePath));

  // 5. Architecture layer validation (skip test files)
  if (!isTest) {
    violations.push(...validateArchitectureLayers(content, filePath));
  }

  // 6. Error handling validation (domain layer only)
  if (!isTest) {
    violations.push(...validateErrorHandling(content, filePath));
  }

  // 7. Logging validation (skip test files)
  if (!isTest) {
    violations.push(...validateLogging(content, filePath));
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 11. Relative Path Resolution
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
// 12. Main Hook Entry Point
// ---------------------------------------------------------------------------

async function main() {
  const input = await readStdin();

  // Extract tool info
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || toolInput.path || '';
  const content = toolInput.content || toolInput.new_string || '';

  if (!filePath) return; // No file path = nothing to check

  // Convert to project-relative path
  const relativePath = toRelativePath(filePath);

  // Skip files outside project directory
  if (relativePath.startsWith('..')) return;

  // Skip if no content to analyze
  if (!content) return;

  // Run all validations
  const violations = validateAll(content, relativePath);

  // Output report if violations found
  if (violations.length > 0) {
    const report = formatViolationReport(violations, relativePath);
    outputContext(report);
  }
}

main().catch(() => {
  // Silent exit - hooks must never break the session
});

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SUPPORTED_EXTENSIONS,
    FORBIDDEN_PATTERNS,
    ARCHITECTURE_LAYERS,
    validateFileName,
    validateClassNames,
    validateFunctionNames,
    validateForbiddenPatterns,
    validateArchitectureLayers,
    validateErrorHandling,
    validateLogging,
    validateAll,
    detectLayer,
    extractImportPaths,
    isCommentLine,
    toPascalCase,
    toCamelCase,
    toSnakeCase,
    formatViolationReport,
    toRelativePath
  };
}
