#!/usr/bin/env node
/**
 * PreToolUse[Edit] Hook: Pre-Edit Impact Check
 *
 * Analyzes the impact of file modifications before they occur.
 * Tracks direct imports, API call relationships, and related tests
 * to provide risk assessment and recommended test commands.
 *
 * @TASK P3-T1 - Pre-Edit Impact Check Hook
 * @SPEC project-team/hooks (Section 12.3)
 *
 * Claude Code Hook Protocol (PreToolUse):
 *   - stdin: JSON { tool_name, tool_input: { file_path, ... } }
 *   - stdout: JSON { hookSpecificOutput: { additionalContext: "..." } }
 *
 * Risk Levels:
 *   - CRITICAL: payment, billing, auth, security, encryption
 *   - HIGH: services, core, middleware, shared
 *   - MEDIUM: api, models, schemas, controllers, repositories, migrations
 *   - LOW: tests, utils, config, docs, fixtures
 */

const path = require('path');
const fs = require('fs');
const { emitHookDecision } = require('./lib/hook-decision-event');

// ---------------------------------------------------------------------------
// 0. Safety Constants (Path Validation & Discovery Bounds)
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DISCOVERY_DEPTH = 6;
const MAX_DISCOVERY_DEPTH = Number.isFinite(Number.parseInt(process.env.PRE_EDIT_IMPACT_CHECK_MAX_DEPTH || process.env.PRE_EDIT_IMPACT_MAX_DEPTH || '', 10))
  ? Number.parseInt(process.env.PRE_EDIT_IMPACT_CHECK_MAX_DEPTH || process.env.PRE_EDIT_IMPACT_MAX_DEPTH, 10)
  : DEFAULT_MAX_DISCOVERY_DEPTH;

function safeRealpath(p) {
  try {
    // native preserves platform-specific behavior and is faster
    return fs.realpathSync.native(p);
  } catch {
    return null;
  }
}

function normalizeRelativeSlashes(p) {
  return typeof p === 'string' ? p.replace(/\\/g, '/') : '';
}

function isPathInside(baseDirAbs, targetAbs) {
  if (!baseDirAbs || !targetAbs) return false;
  const rel = path.relative(baseDirAbs, targetAbs);
  if (rel === '') return true;
  return !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel);
}

function getProjectDirReal() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return safeRealpath(projectDir);
}

function realpathOfExistingAncestor(absPath) {
  if (!absPath) return null;

  let current = absPath;
  while (true) {
    if (fs.existsSync(current)) {
      return safeRealpath(current);
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Resolve a tool-provided file path into a validated project-relative path.
 *
 * This defends against:
 * - absolute paths outside the project
 * - relative traversal (..)
 * - symlink escapes (project-internal symlink pointing outside)
 *
 * It uses realpath-based checks for both project root and the existing ancestor
 * of the target path (to handle new files that don't exist yet).
 *
 * @param {string} filePath
 * @param {string} projectDirReal - realpath of project root
 * @returns {string|null} project-relative path if inside, otherwise null
 */
function validateAndGetRelativePath(filePath, projectDirReal) {
  if (!filePath || !projectDirReal) return null;

  const candidateAbs = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(projectDirReal, filePath);

  // Determine the realpath of an existing ancestor to detect symlink escapes.
  const ancestorReal = realpathOfExistingAncestor(candidateAbs);
  if (!ancestorReal) return null;

  if (!isPathInside(projectDirReal, ancestorReal)) return null;

  const rel = normalizeRelativeSlashes(path.relative(projectDirReal, candidateAbs));
  if (!rel || rel.startsWith('..')) return null;

  return rel;
}

// ---------------------------------------------------------------------------
// 1. Risk Level Constants & Patterns
// ---------------------------------------------------------------------------

/**
 * Risk level priority values (lower = higher priority).
 */
const RISK_LEVELS = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3
};

/**
 * Risk classification patterns ordered by priority.
 * Each entry defines regex patterns that match file paths to risk levels.
 * CRITICAL patterns are checked first, then HIGH, then MEDIUM.
 * Anything unmatched defaults to LOW.
 */
const RISK_PATTERNS = [
  // CRITICAL: payment, billing, auth, security, encryption
  {
    level: 'CRITICAL',
    patterns: [
      /\bpayment\b/i,
      /\bbilling\b/i,
      /\bauth/i,
      /\bauthentication\b/i,
      /\bauthorization\b/i,
      /\bsecurity\b/i,
      /\bencryption\b/i,
      /\bcrypto\b/i,
      /\btoken[_-]?manager\b/i,
      /\bpassword\b/i,
      /\bcredential/i,
      /\boauth\b/i,
      /\bjwt\b/i,
      /\bsession[_-]?manager\b/i
    ]
  },
  // HIGH: services, core, middleware, shared
  {
    level: 'HIGH',
    patterns: [
      /\bservices\/[^/]+\.(py|js|ts|jsx|tsx)$/,
      /\bservices\/[^/]*_service\b/,
      /\bcore\//,
      /\bmiddleware\//,
      /\bshared\//,
      /\binfrastructure\//,
      /\bbase[_-]?(service|model|repository)\b/i
    ]
  },
  // MEDIUM: api, models, schemas, controllers, repositories, migrations
  {
    level: 'MEDIUM',
    patterns: [
      /(?<!docs\/)\bapi\//,
      /\broutes\//,
      /\bmodels\//,
      /\bschemas\//,
      /\bcontrollers\//,
      /\brepositories\//,
      /\bmigrations?\//,
      /\bentities\//,
      /\bdomain\//,
      /\bdatabase\//
    ]
  }
  // LOW: everything else (tests, utils, config, docs, fixtures)
];

// ---------------------------------------------------------------------------
// 2. Risk Level Classification
// ---------------------------------------------------------------------------

/**
 * Classify the risk level of a file based on its path.
 * All risk groups are checked and the highest priority match wins.
 * CRITICAL > HIGH > MEDIUM > LOW.
 * Files matching no pattern default to LOW.
 *
 * @param {string} filePath - Relative file path
 * @returns {string} Risk level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
 */
function classifyRiskLevel(filePath) {
  if (!filePath) return 'LOW';

  let bestLevel = 'LOW';
  let bestPriority = RISK_LEVELS.LOW;

  for (const riskGroup of RISK_PATTERNS) {
    const priority = RISK_LEVELS[riskGroup.level];
    // Only check if this group could improve the current best
    if (priority >= bestPriority) continue;

    for (const pattern of riskGroup.patterns) {
      if (pattern.test(filePath)) {
        bestLevel = riskGroup.level;
        bestPriority = priority;
        break; // Found match in this group, move on
      }
    }
  }

  return bestLevel;
}

/**
 * Get a human-readable description for a risk level.
 *
 * @param {string} level - Risk level string
 * @returns {string} Description
 */
function getRiskDescription(level) {
  const descriptions = {
    CRITICAL: 'Payment/billing/auth/security area - financial or security impact. Requires thorough review and full test coverage.',
    HIGH: 'Service/core/middleware layer - business logic changes may affect multiple consumers. Run related test suites.',
    MEDIUM: 'API/model/schema/controller layer - interface or data structure changes. Verify contract compatibility.',
    LOW: 'Tests/utils/config/docs area - low blast radius. Standard review applies.'
  };

  return descriptions[level] || 'Unknown risk level. Review manually.';
}

// ---------------------------------------------------------------------------
// 3. Import Statement Parsing
// ---------------------------------------------------------------------------

/**
 * Parse import statements from file content.
 * Supports Python (from/import), JavaScript/TypeScript (import/require).
 *
 * @param {string} content - File content
 * @param {string} ext - File extension (e.g., '.py', '.js', '.ts')
 * @returns {string[]} Array of imported module paths
 */
function parseImportStatements(content, ext) {
  if (!content) return [];

  const imports = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments
    if (ext === '.py' && trimmed.startsWith('#')) continue;
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext) && (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'))) continue;

    if (ext === '.py') {
      // Python: from .relative import ... (check before absolute to avoid false match)
      const relFromMatch = trimmed.match(/^from\s+(\.[.\w]*)\s+import/);
      if (relFromMatch) {
        const raw = relFromMatch[1];
        // Convert: ".models" -> "./models", "..utils" -> "../utils"
        // Replace leading dots with path notation, then remaining dots with /
        const leadingDots = raw.match(/^\.+/)[0];
        const rest = raw.slice(leadingDots.length);
        let prefix;
        if (leadingDots.length === 1) {
          prefix = '.';
        } else {
          prefix = Array(leadingDots.length).fill('..').join('/');
        }
        const modulePath = rest ? prefix + '/' + rest.replace(/\./g, '/') : prefix;
        imports.push(modulePath);
        continue;
      }

      // Python: from x.y.z import ...
      const fromMatch = trimmed.match(/^from\s+([\w.]+)\s+import/);
      if (fromMatch) {
        imports.push(fromMatch[1].replace(/\./g, '/'));
        continue;
      }

      // Python: import x.y.z
      const importMatch = trimmed.match(/^import\s+([\w.]+)/);
      if (importMatch) {
        imports.push(importMatch[1].replace(/\./g, '/'));
        continue;
      }
    }

    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      // JS/TS: import ... from '...'
      const jsImportMatch = trimmed.match(/(?:import\s+.*?\s+from|import)\s+['"]([^'"]+)['"]/);
      if (jsImportMatch) {
        imports.push(jsImportMatch[1]);
        continue;
      }

      // JS/TS: require('...')
      const requireMatch = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (requireMatch) {
        imports.push(requireMatch[1]);
        continue;
      }
    }
  }

  return imports;
}

// ---------------------------------------------------------------------------
// 4. API Endpoint Detection
// ---------------------------------------------------------------------------

/**
 * Detect API endpoint definitions in file content.
 * Supports FastAPI decorators and Express route patterns.
 *
 * @param {string} content - File content
 * @param {string} ext - File extension
 * @returns {object[]} Array of { method, path } objects
 */
function detectApiEndpoints(content, ext) {
  if (!content) return [];

  const endpoints = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (ext === '.py') {
      // FastAPI: @router.get("/path"), @app.post("/path"), etc.
      const fastapiMatch = trimmed.match(/@(?:router|app)\.(get|post|put|delete|patch|head|options)\s*\(\s*['"]([^'"]+)['"]/i);
      if (fastapiMatch) {
        endpoints.push({
          method: fastapiMatch[1].toUpperCase(),
          path: fastapiMatch[2]
        });
      }

      // Flask: @app.route("/path", methods=["GET"])
      const flaskMatch = trimmed.match(/@(?:app|blueprint|bp)\.route\s*\(\s*['"]([^'"]+)['"]/i);
      if (flaskMatch) {
        endpoints.push({
          method: 'ANY',
          path: flaskMatch[1]
        });
      }
    }

    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      // Express: app.get('/path', handler), router.post('/path', handler)
      const expressMatch = trimmed.match(/(?:app|router)\.(get|post|put|delete|patch|head|options)\s*\(\s*['"]([^'"]+)['"]/i);
      if (expressMatch) {
        endpoints.push({
          method: expressMatch[1].toUpperCase(),
          path: expressMatch[2]
        });
      }
    }
  }

  return endpoints;
}

// ---------------------------------------------------------------------------
// 5. Dependency Map Builder
// ---------------------------------------------------------------------------

/**
 * Build a dependency map from a list of files.
 * Maps each file to the list of modules it imports.
 *
 * @param {string[]} allFiles - List of all file paths
 * @param {function} contentReader - Function that returns file content given a path
 * @param {function} extResolver - Function that returns file extension given a path
 * @returns {object} Map of { filePath: string[] } (file -> its imports)
 */
function buildDependencyMap(allFiles, contentReader, extResolver) {
  const map = {};

  for (const file of allFiles) {
    const content = contentReader(file);
    const ext = extResolver(file);
    map[file] = parseImportStatements(content, ext);
  }

  return map;
}

// ---------------------------------------------------------------------------
// 6. Direct Dependents Finder
// ---------------------------------------------------------------------------

/**
 * Find files that directly import/depend on the target file.
 * Matches import paths against the target file name/path.
 *
 * @param {string} targetFile - The file being edited
 * @param {string[]} allFiles - List of all project files
 * @param {function} contentReader - Returns file content
 * @param {function} extResolver - Returns file extension
 * @returns {string[]} List of files that import the target
 */
function findDirectDependents(targetFile, allFiles, contentReader, extResolver) {
  if (!allFiles || allFiles.length === 0) return [];

  const dependents = [];

  // Derive target identifiers for matching
  const targetBase = path.basename(targetFile, path.extname(targetFile));
  const targetDir = path.dirname(targetFile);
  // Convert file path to potential Python module path: src/models/user.py -> src.models.user -> src/models/user
  const targetModulePath = targetFile.replace(/\.(py|js|ts|jsx|tsx)$/, '').replace(/\//g, '/');
  // Also: src.models.user (dot-separated for Python)
  const targetDotPath = targetModulePath.replace(/\//g, '.');

  for (const file of allFiles) {
    // Skip self
    if (file === targetFile) continue;

    const content = contentReader(file);
    if (!content) continue;

    const ext = extResolver(file);
    const imports = parseImportStatements(content, ext);

    for (const imp of imports) {
      // Normalize import path for comparison
      const normalizedImport = imp.replace(/\./g, '/');

      // Check various matching strategies
      if (
        normalizedImport === targetModulePath ||
        normalizedImport.endsWith('/' + targetBase) ||
        normalizedImport === targetDotPath ||
        imp === targetDotPath ||
        imp.endsWith('.' + targetBase) ||
        imp.endsWith('/' + targetBase)
      ) {
        dependents.push(file);
        break; // One match is enough per file
      }
    }
  }

  return dependents;
}

// ---------------------------------------------------------------------------
// 7. Indirect Dependents Finder (API call relationships)
// ---------------------------------------------------------------------------

/**
 * Find files that indirectly depend on the target through API calls.
 * If the target defines API endpoints, find files that reference those paths.
 *
 * @param {string} targetFile - The file being edited
 * @param {string} targetContent - Content of the target file
 * @param {string} targetExt - Extension of the target file
 * @param {string[]} allFiles - List of all project files
 * @param {function} contentReader - Returns file content
 * @param {function} extResolver - Returns file extension
 * @returns {string[]} Files that call APIs defined in the target
 */
function findIndirectDependents(targetFile, targetContent, targetExt, allFiles, contentReader, extResolver) {
  if (!allFiles || allFiles.length === 0) return [];

  // Detect API endpoints in the target file
  const endpoints = detectApiEndpoints(targetContent, targetExt);
  if (endpoints.length === 0) return [];

  const indirectDeps = [];

  for (const file of allFiles) {
    if (file === targetFile) continue;

    const content = contentReader(file);
    if (!content) continue;

    // Check if the file references any of the target's API paths
    for (const endpoint of endpoints) {
      // Normalize path for matching (remove parameter placeholders)
      const apiPath = endpoint.path.replace(/\{[^}]+\}/g, '');

      if (apiPath && content.includes(apiPath)) {
        indirectDeps.push(file);
        break;
      }
    }
  }

  return indirectDeps;
}

// ---------------------------------------------------------------------------
// 8. Related Test Finder
// ---------------------------------------------------------------------------

/**
 * Find test files related to the given source file.
 * Uses naming conventions and path patterns:
 *   - Python: test_{name}.py, {name}_test.py
 *   - JS/TS: {name}.test.js, {name}.spec.js, __tests__/{name}.test.js
 *
 * @param {string} sourceFile - The source file path
 * @param {string[]} allFiles - List of all project files
 * @returns {string[]} Related test file paths
 */
function findRelatedTests(sourceFile, allFiles) {
  if (!allFiles || allFiles.length === 0) return [];

  const basename = path.basename(sourceFile, path.extname(sourceFile));
  const sourceExt = path.extname(sourceFile);
  const tests = [];

  for (const file of allFiles) {
    if (file === sourceFile) continue;

    const fileBase = path.basename(file, path.extname(file));
    const fileExt = path.extname(file);

    // Python test patterns: test_{name}.py
    if (sourceExt === '.py') {
      if (fileBase === `test_${basename}` && fileExt === '.py') {
        tests.push(file);
        continue;
      }
      if (fileBase === `${basename}_test` && fileExt === '.py') {
        tests.push(file);
        continue;
      }
    }

    // JS/TS test patterns: {name}.test.js, {name}.spec.js
    if (['.js', '.ts', '.jsx', '.tsx'].includes(sourceExt)) {
      // Handle dotted test file names: userService.test.js
      const testPatterns = [
        `${basename}.test`,
        `${basename}.spec`,
        `test_${basename}`,
        `${basename}_test`
      ];

      if (testPatterns.includes(fileBase)) {
        tests.push(file);
        continue;
      }

      // Handle __tests__ directory with same name
      if (file.includes('__tests__') && fileBase.startsWith(basename)) {
        tests.push(file);
        continue;
      }
    }

    // Generic: file in tests/ directory with matching name
    if (file.includes('/tests/') || file.startsWith('tests/')) {
      if (fileBase.includes(basename) && (fileBase.includes('test') || fileBase.includes('spec'))) {
        tests.push(file);
        continue;
      }
    }
  }

  return tests;
}

// ---------------------------------------------------------------------------
// 9. Test Command Generator
// ---------------------------------------------------------------------------

/**
 * Generate recommended test command based on test files and risk level.
 *
 * @param {string[]} testFiles - List of related test file paths
 * @param {string} sourceFile - The source file being edited
 * @param {string} [riskLevel] - Risk level for coverage decisions
 * @returns {string} Recommended test command
 */
function generateTestCommand(testFiles, sourceFile, riskLevel) {
  const files = testFiles || [];
  const ext = path.extname(sourceFile);

  // Determine test runner
  const isPython = ext === '.py';
  const isJs = ['.js', '.ts', '.jsx', '.tsx'].includes(ext);

  if (files.length === 0) {
    // No specific test files found - suggest general command
    if (isPython) {
      return `pytest -v --tb=short`;
    }
    if (isJs) {
      return `jest --passWithNoTests`;
    }
    return 'Run relevant test suite manually.';
  }

  if (isPython) {
    const fileList = files.join(' ');
    const covFlag = (riskLevel === 'CRITICAL' || riskLevel === 'HIGH')
      ? ` --cov=${path.dirname(sourceFile)}`
      : '';
    return `pytest ${fileList} -v${covFlag}`;
  }

  if (isJs) {
    const fileList = files.map(f => path.basename(f)).join(' ');
    const covFlag = (riskLevel === 'CRITICAL' || riskLevel === 'HIGH')
      ? ' --coverage'
      : '';
    return `jest ${fileList}${covFlag}`;
  }

  return `Run tests: ${files.join(', ')}`;
}

// ---------------------------------------------------------------------------
// 10. Impact Analysis (Integration)
// ---------------------------------------------------------------------------

/**
 * Perform complete impact analysis for a file edit.
 *
 * @param {string} filePath - The file being edited (relative path)
 * @param {string} fileContent - Content of the file
 * @param {string[]} allFiles - All project files
 * @param {function} contentReader - Returns file content by path
 * @param {function} extResolver - Returns file extension by path
 * @returns {object} Impact analysis result
 */
function analyzeImpact(filePath, fileContent, allFiles, contentReader, extResolver) {
  const safeAllFiles = allFiles || [];
  const ext = extResolver(filePath);

  // 1. Risk classification
  const riskLevel = classifyRiskLevel(filePath);
  const riskDescription = getRiskDescription(riskLevel);

  // 2. Direct dependents (files that import this file)
  const directDependents = findDirectDependents(filePath, safeAllFiles, contentReader, extResolver);

  // 3. Indirect dependents (files that call APIs defined in this file)
  const indirectDependents = findIndirectDependents(
    filePath, fileContent || '', ext, safeAllFiles, contentReader, extResolver
  );

  // 4. Related test files
  const relatedTests = findRelatedTests(filePath, safeAllFiles);

  // 5. Test command
  const testCommand = generateTestCommand(relatedTests, filePath, riskLevel);

  return {
    filePath,
    riskLevel,
    riskDescription,
    directDependents,
    indirectDependents,
    relatedTests,
    testCommand
  };
}

// ---------------------------------------------------------------------------
// 11. Impact Report Formatting
// ---------------------------------------------------------------------------

/**
 * Format an impact analysis result into a human-readable report.
 *
 * @param {object} impact - Impact analysis result from analyzeImpact
 * @returns {string} Formatted report string
 */
function formatImpactReport(impact) {
  const directDeps = impact.directDependents || [];
  const indirectDeps = impact.indirectDependents || [];
  const tests = impact.relatedTests || [];
  const testCmd = impact.testCommand || '';
  const riskDesc = impact.riskDescription || getRiskDescription(impact.riskLevel);

  let report = '';
  report += `\n[Impact Analysis] File: "${impact.filePath}"`;
  report += `\n  Risk Level: ${impact.riskLevel}`;
  report += `\n  ${riskDesc}`;

  // Direct dependents
  report += '\n\n  Direct Dependents (files importing this file):';
  if (directDeps.length > 0) {
    for (const dep of directDeps) {
      report += `\n    - ${dep}`;
    }
  } else {
    report += '\n    None found';
  }

  // Indirect dependents
  report += '\n\n  Indirect Dependents (API call relationships):';
  if (indirectDeps.length > 0) {
    for (const dep of indirectDeps) {
      report += `\n    - ${dep}`;
    }
  } else {
    report += '\n    None found';
  }

  // Related tests
  report += '\n\n  Related Tests:';
  if (tests.length > 0) {
    for (const t of tests) {
      report += `\n    - ${t}`;
    }
  } else {
    report += '\n    None found (consider writing tests!)';
  }

  // Recommended test command
  if (testCmd) {
    report += `\n\n  Recommended Test Command:`;
    report += `\n    $ ${testCmd}`;
  }

  // Warning for CRITICAL/HIGH
  if (impact.riskLevel === 'CRITICAL') {
    report += '\n\n  [WARNING] CRITICAL risk area! Ensure thorough review, full test coverage, and approval before merging.';
  } else if (impact.riskLevel === 'HIGH') {
    report += '\n\n  [CAUTION] HIGH risk area. Run full test suite for affected modules before proceeding.';
  }

  return report;
}

// ---------------------------------------------------------------------------
// 12. Relative Path Resolution
// ---------------------------------------------------------------------------

/**
 * Convert an absolute file path to a project-relative path.
 *
 * @param {string} filePath - Absolute or relative file path
 * @returns {string} Project-relative path
 */
function toRelativePath(filePath) {
  if (!filePath) return '';

  const projectDirReal = getProjectDirReal();
  if (!projectDirReal) return '';

  const rel = validateAndGetRelativePath(filePath, projectDirReal);
  return rel || '';
}

// ---------------------------------------------------------------------------
// 13. File Discovery (Project File Listing)
// ---------------------------------------------------------------------------

/**
 * Discover project files for dependency analysis.
 *
 * Safety properties:
 * - realpath-based visited tracking prevents symlink loops
 * - realpath containment ensures we don't traverse outside project root
 * - bounded recursion depth prevents hangs on deep trees
 *
 * @param {string} projectDir - Project root directory (absolute)
 * @param {number} [maxDepth] - Maximum directory depth
 * @returns {string[]} List of relative file paths
 */
function discoverProjectFiles(projectDir, maxDepth) {
  const projectDirReal = safeRealpath(projectDir);
  if (!projectDirReal) return [];

  const max = (typeof maxDepth === 'number' && Number.isFinite(maxDepth))
    ? maxDepth
    : MAX_DISCOVERY_DEPTH;

  const files = [];
  const visited = new Set();

  const skipDirs = new Set([
    'node_modules', '.git', '__pycache__', '.venv', 'venv',
    '.tox', '.mypy_cache', '.pytest_cache', 'dist', 'build',
    '.next', '.nuxt', 'coverage', '.eggs', '.cache'
  ]);

  const codeExts = new Set([
    '.py', '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte'
  ]);

  function shouldWalkDir(fullPath, entry) {
    try {
      if (entry && entry.isDirectory && entry.isDirectory()) return true;
      if (entry && entry.isSymbolicLink && entry.isSymbolicLink()) {
        const stat = fs.statSync(fullPath);
        return stat.isDirectory();
      }
    } catch {
      return false;
    }
    return false;
  }

  function shouldIncludeFile(fullPath, entry) {
    try {
      if (entry && entry.isFile && entry.isFile()) return true;
      if (entry && entry.isSymbolicLink && entry.isSymbolicLink()) {
        const stat = fs.statSync(fullPath);
        return stat.isFile();
      }
    } catch {
      return false;
    }
    return false;
  }

  function walk(dir, depth) {
    if (depth > max) return;

    const dirReal = safeRealpath(dir);
    if (!dirReal) return;

    if (!isPathInside(projectDirReal, dirReal)) return;

    if (visited.has(dirReal)) return;
    visited.add(dirReal);

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;

      const fullPath = path.join(dir, entry.name);

      if (shouldWalkDir(fullPath, entry)) {
        if (!skipDirs.has(entry.name)) {
          walk(fullPath, depth + 1);
        }
      } else if (shouldIncludeFile(fullPath, entry)) {
        const ext = path.extname(entry.name);
        if (codeExts.has(ext)) {
          const relative = normalizeRelativeSlashes(path.relative(projectDirReal, fullPath));
          if (relative && !relative.startsWith('..')) {
            files.push(relative);
          }
        }
      }
    }
  }

  walk(projectDirReal, 0);
  return files;
}

// ---------------------------------------------------------------------------
// 14. stdin/stdout Helpers (Claude Code Hook Protocol)
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
 * Output additional context (PreToolUse guidance).
 * @param {string} context
 */
function outputContext(context) {
  const hookSpecificOutput = { additionalContext: context };
  if (_hookEventName) hookSpecificOutput.hookEventName = _hookEventName;
  process.stdout.write(JSON.stringify({ hookSpecificOutput }));
}

function decisionFromRiskLevel(riskLevel) {
  if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
    return {
      decision: 'warn',
      severity: riskLevel === 'CRITICAL' ? 'error' : 'warning',
      remediation: 'Run the recommended tests and complete review before merge.',
    };
  }
  return {
    decision: 'allow',
    severity: 'info',
    remediation: '',
  };
}

// ---------------------------------------------------------------------------
// 15. Main Hook Entry Point
// ---------------------------------------------------------------------------

async function main() {
  const input = await readStdin();

  // Extract file path from tool input
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || toolInput.path || '';

  if (!filePath) {
    await emitHookDecision(input, {
      hook: 'pre-edit-impact-check',
      decision: 'skip',
      summary: 'No target file path provided.',
    });
    return;
  }

  const projectDirReal = getProjectDirReal();
  if (!projectDirReal) {
    await emitHookDecision(input, {
      hook: 'pre-edit-impact-check',
      decision: 'skip',
      summary: 'Project directory is unavailable.',
    });
    return;
  }

  // Convert to validated project-relative path
  const relativePath = validateAndGetRelativePath(filePath, projectDirReal);
  if (!relativePath) {
    await emitHookDecision(input, {
      hook: 'pre-edit-impact-check',
      decision: 'skip',
      summary: 'Target path is outside project scope.',
    });
    return;
  }

  // Discover project files for dependency analysis
  const allFiles = discoverProjectFiles(projectDirReal);

  // Content reader: reads file from filesystem
  const contentReader = (f) => {
    try {
      return fs.readFileSync(path.join(projectDirReal, f), 'utf8');
    } catch {
      return '';
    }
  };

  // Extension resolver
  const extResolver = (f) => path.extname(f);

  // Read target file content
  const fileContent = contentReader(relativePath);

  // Perform impact analysis
  const impact = analyzeImpact(
    relativePath,
    fileContent,
    allFiles,
    contentReader,
    extResolver
  );

  // Generate report
  const report = formatImpactReport(impact);
  const mapped = decisionFromRiskLevel(impact.riskLevel);
  await emitHookDecision(input, {
    hook: 'pre-edit-impact-check',
    decision: mapped.decision,
    severity: mapped.severity,
    risk_level: impact.riskLevel,
    summary: `${impact.riskLevel} risk for ${impact.filePath}; ${impact.directDependents.length} direct dependents, ${impact.indirectDependents.length} indirect dependents.`,
    remediation: mapped.remediation,
  });

  // Output as additionalContext
  if (report) {
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
    RISK_LEVELS,
    RISK_PATTERNS,
    classifyRiskLevel,
    getRiskDescription,
    parseImportStatements,
    detectApiEndpoints,
    buildDependencyMap,
    findDirectDependents,
    findIndirectDependents,
    findRelatedTests,
    generateTestCommand,
    analyzeImpact,
    formatImpactReport,
    toRelativePath,
    discoverProjectFiles,
    validateAndGetRelativePath,
    isPathInside
  };
}
