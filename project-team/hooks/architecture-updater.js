#!/usr/bin/env node
/**
 * PostToolUse[Write|Edit] Hook: Architecture Updater
 *
 * Automatically generates and maintains architecture documentation
 * when source files are modified. Monitors domain structures, API
 * endpoints, and import dependencies to keep docs in sync with code.
 *
 * @TASK P3-T3 - Architecture Updater Hook
 * @SPEC project-team/hooks (Section 12.2)
 *
 * Claude Code Hook Protocol (PostToolUse):
 *   - stdin: JSON { tool_name, tool_input: { file_path, content, ... },
 *                    tool_result: { old_content?: string, ... } }
 *   - stdout: JSON { hookSpecificOutput: { additionalContext: string } }
 *
 * PostToolUse hooks cannot block (the tool already executed).
 * Instead, they inject additionalContext to guide the agent toward
 * acknowledging architecture documentation updates.
 *
 * Generated Documentation:
 *   .claude/architecture/
 *   +-- ARCHITECTURE.md      - Overall architecture overview
 *   +-- domains/             - Per-domain detail documents
 *   |   +-- {domain}.md
 *   +-- api-catalog.md       - Consolidated API endpoint catalog
 *   +-- dependency-matrix.md - Cross-file dependency matrix
 *
 * Update Scenarios:
 *   1. Domain folder file change   -> domains/{domain}.md update
 *   2. API route file change       -> api-catalog.md update
 *   3. Import statement change     -> dependency-matrix.md update
 *   4. Any tracked file change     -> ARCHITECTURE.md summary refresh
 */

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

/**
 * Architecture documentation output directory (relative to project root).
 */
const ARCHITECTURE_DIR = '.claude/architecture';

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
 * API route file patterns. Files matching these patterns are scanned
 * for endpoint definitions.
 */
const API_FILE_PATTERNS = [
  /\broutes?\//,
  /\bapi\//,
  /\bendpoints?\//,
  /\bcontrollers?\//,
  /\bviews?\//
];

/**
 * File extensions considered as source code for dependency tracking.
 */
const SOURCE_EXTENSIONS = new Set([
  '.py', '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte'
]);

/**
 * Directories to skip during file discovery.
 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  '.tox', '.mypy_cache', '.pytest_cache', 'dist', 'build',
  '.next', '.nuxt', 'coverage', '.eggs', '.cache', '.claude'
]);

/**
 * Maximum directory depth for file discovery.
 */
const MAX_DISCOVERY_DEPTH = 8;

// ---------------------------------------------------------------------------
// 2. Domain Detection
// ---------------------------------------------------------------------------

/**
 * Extract domain name from a file path.
 * Matches against known domain directory patterns.
 *
 * @param {string} filePath - Project-relative file path
 * @returns {string|null} Domain name or null if not in a domain directory
 */
function extractDomain(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;

  for (const pattern of DOMAIN_PATTERNS) {
    const match = filePath.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Determine if a file path is within a domain directory.
 *
 * @param {string} filePath - Project-relative file path
 * @returns {boolean}
 */
function isDomainFile(filePath) {
  return extractDomain(filePath) !== null;
}

/**
 * Classify a file within a domain by its role.
 * Returns a role like "service", "model", "route", "schema", etc.
 *
 * @param {string} filePath - Project-relative file path
 * @returns {string} File role classification
 */
function classifyDomainFileRole(filePath) {
  if (!filePath) return 'unknown';

  const lower = filePath.toLowerCase();

  if (/\bservices?\b/.test(lower)) return 'service';
  if (/\bmodels?\b/.test(lower)) return 'model';
  if (/\broutes?\b/.test(lower)) return 'route';
  if (/\bschemas?\b/.test(lower)) return 'schema';
  if (/\bcontrollers?\b/.test(lower)) return 'controller';
  if (/\brepository\b|\brepositories\b/.test(lower)) return 'repository';
  if (/\bmiddleware\b/.test(lower)) return 'middleware';
  if (/\butils?\b|\bhelpers?\b/.test(lower)) return 'utility';
  if (/\btests?\b|\bspec\b/.test(lower)) return 'test';
  if (/\bconfig\b|\bsettings?\b/.test(lower)) return 'config';
  if (/\bmigrations?\b/.test(lower)) return 'migration';
  if (/\bentit(?:y|ies)\b/.test(lower)) return 'entity';
  if (/\binterfaces?\b|\btypes?\b/.test(lower)) return 'interface';

  return 'other';
}

// ---------------------------------------------------------------------------
// 3. API Endpoint Detection
// ---------------------------------------------------------------------------

/**
 * Determine if a file is an API route file.
 *
 * @param {string} filePath - Project-relative file path
 * @returns {boolean}
 */
function isApiFile(filePath) {
  if (!filePath) return false;
  return API_FILE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Extract API endpoint definitions from file content.
 * Supports FastAPI, Flask, Express, and generic patterns.
 *
 * @param {string} content - File content
 * @param {string} ext - File extension (e.g., '.py', '.js')
 * @returns {object[]} Array of { method, path, handler } objects
 */
function extractApiEndpoints(content, ext) {
  if (!content || typeof content !== 'string') return [];

  const endpoints = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (ext === '.py') {
      // FastAPI: @router.get("/path") or @app.post("/path")
      const fastapiMatch = trimmed.match(
        /@(?:router|app)\.(get|post|put|delete|patch|head|options)\s*\(\s*['"]([^'"]+)['"]/i
      );
      if (fastapiMatch) {
        // Try to find handler name from next lines
        const handler = findPythonHandler(lines, i + 1);
        endpoints.push({
          method: fastapiMatch[1].toUpperCase(),
          path: fastapiMatch[2],
          handler: handler || 'unknown'
        });
        continue;
      }

      // Flask: @app.route("/path", methods=["GET", "POST"])
      const flaskMatch = trimmed.match(
        /@(?:app|blueprint|bp)\.route\s*\(\s*['"]([^'"]+)['"]/i
      );
      if (flaskMatch) {
        const methods = extractFlaskMethods(trimmed);
        for (const method of methods) {
          const handler = findPythonHandler(lines, i + 1);
          endpoints.push({
            method: method.toUpperCase(),
            path: flaskMatch[1],
            handler: handler || 'unknown'
          });
        }
        continue;
      }
    }

    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      // Express: app.get('/path', handler) or router.post('/path', handler)
      const expressMatch = trimmed.match(
        /(?:app|router)\.(get|post|put|delete|patch|head|options)\s*\(\s*['"]([^'"]+)['"]\s*,?\s*([a-zA-Z_$][\w$]*)?/i
      );
      if (expressMatch) {
        endpoints.push({
          method: expressMatch[1].toUpperCase(),
          path: expressMatch[2],
          handler: expressMatch[3] || 'anonymous'
        });
      }
    }
  }

  return endpoints;
}

/**
 * Find the Python function name defined after a decorator line.
 *
 * @param {string[]} lines - All file lines
 * @param {number} startLine - Line index to start searching from
 * @returns {string|null} Function name or null
 */
function findPythonHandler(lines, startLine) {
  for (let i = startLine; i < Math.min(startLine + 5, lines.length); i++) {
    const match = lines[i].match(/^\s*(?:async\s+)?def\s+(\w+)/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Extract HTTP methods from a Flask @app.route() decorator.
 *
 * @param {string} line - Decorator line
 * @returns {string[]} Array of HTTP methods
 */
function extractFlaskMethods(line) {
  const methodsMatch = line.match(/methods\s*=\s*\[([^\]]+)\]/i);
  if (methodsMatch) {
    return methodsMatch[1]
      .replace(/['"]/g, '')
      .split(',')
      .map(m => m.trim())
      .filter(Boolean);
  }
  return ['GET'];
}

// ---------------------------------------------------------------------------
// 4. Import/Dependency Parsing
// ---------------------------------------------------------------------------

/**
 * Parse import statements from file content.
 *
 * @param {string} content - File content
 * @param {string} ext - File extension
 * @returns {string[]} Array of imported module paths
 */
function parseImports(content, ext) {
  if (!content || typeof content !== 'string') return [];

  const imports = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments
    if (ext === '.py' && trimmed.startsWith('#')) continue;
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    }

    if (ext === '.py') {
      // Python: from .relative import ...
      const relMatch = trimmed.match(/^from\s+(\.[.\w]*)\s+import/);
      if (relMatch) {
        const raw = relMatch[1];
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

/**
 * Detect changes in imports between old and new content.
 *
 * @param {string} oldContent - Previous file content
 * @param {string} newContent - New file content
 * @param {string} ext - File extension
 * @returns {object} { added: string[], removed: string[], unchanged: string[] }
 */
function detectImportChanges(oldContent, newContent, ext) {
  const oldImports = new Set(parseImports(oldContent || '', ext));
  const newImports = new Set(parseImports(newContent || '', ext));

  const added = [];
  const removed = [];
  const unchanged = [];

  for (const imp of newImports) {
    if (oldImports.has(imp)) {
      unchanged.push(imp);
    } else {
      added.push(imp);
    }
  }

  for (const imp of oldImports) {
    if (!newImports.has(imp)) {
      removed.push(imp);
    }
  }

  return { added, removed, unchanged };
}

// ---------------------------------------------------------------------------
// 5. File Discovery
// ---------------------------------------------------------------------------

/**
 * Discover project source files recursively.
 *
 * @param {string} projectDir - Absolute project root directory
 * @param {number} [maxDepth] - Maximum recursion depth
 * @returns {string[]} List of project-relative file paths
 */
function discoverProjectFiles(projectDir, maxDepth) {
  const max = maxDepth || MAX_DISCOVERY_DEPTH;
  const files = [];

  function walk(dir, depth) {
    if (depth > max) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (SOURCE_EXTENSIONS.has(ext)) {
          const relative = path.relative(projectDir, fullPath);
          files.push(relative);
        }
      }
    }
  }

  walk(projectDir, 0);
  return files;
}

// ---------------------------------------------------------------------------
// 6. Domain Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze a domain by scanning its files.
 *
 * @param {string} domainName - Domain name
 * @param {string[]} domainFiles - Files belonging to this domain
 * @param {function} contentReader - Function that returns file content
 * @param {function} extResolver - Function that returns file extension
 * @returns {object} Domain analysis result
 */
function analyzeDomain(domainName, domainFiles, contentReader, extResolver) {
  const files = domainFiles || [];
  const roles = {};
  const endpoints = [];
  const allImports = [];

  for (const file of files) {
    const role = classifyDomainFileRole(file);
    if (!roles[role]) roles[role] = [];
    roles[role].push(file);

    const content = contentReader(file);
    const ext = extResolver(file);

    // Extract API endpoints if applicable
    if (isApiFile(file)) {
      const eps = extractApiEndpoints(content, ext);
      for (const ep of eps) {
        endpoints.push({ ...ep, file });
      }
    }

    // Collect imports
    const imports = parseImports(content, ext);
    for (const imp of imports) {
      allImports.push({ from: file, to: imp });
    }
  }

  return {
    name: domainName,
    fileCount: files.length,
    files,
    roles,
    endpoints,
    imports: allImports
  };
}

/**
 * Group files by domain.
 *
 * @param {string[]} allFiles - All project file paths
 * @returns {object} Map of domainName -> file paths
 */
function groupFilesByDomain(allFiles) {
  const domains = {};

  for (const file of allFiles) {
    const domain = extractDomain(file);
    if (domain) {
      if (!domains[domain]) domains[domain] = [];
      domains[domain].push(file);
    }
  }

  return domains;
}

// ---------------------------------------------------------------------------
// 7. Dependency Matrix Builder
// ---------------------------------------------------------------------------

/**
 * Build a dependency matrix from all project files.
 *
 * @param {string[]} allFiles - All project file paths
 * @param {function} contentReader - Function that returns file content
 * @param {function} extResolver - Function that returns file extension
 * @returns {object} Dependency matrix with { entries, domainDeps }
 */
function buildDependencyMatrix(allFiles, contentReader, extResolver) {
  const entries = [];
  const domainDeps = {};

  for (const file of allFiles) {
    const content = contentReader(file);
    const ext = extResolver(file);
    const imports = parseImports(content, ext);

    if (imports.length > 0) {
      entries.push({
        file,
        imports
      });
    }

    // Track inter-domain dependencies
    const sourceDomain = extractDomain(file);
    if (sourceDomain) {
      for (const imp of imports) {
        const targetDomain = extractDomainFromImport(imp);
        if (targetDomain && targetDomain !== sourceDomain) {
          if (!domainDeps[sourceDomain]) domainDeps[sourceDomain] = new Set();
          domainDeps[sourceDomain].add(targetDomain);
        }
      }
    }
  }

  // Convert Sets to Arrays for serialization
  const domainDepsArray = {};
  for (const [domain, deps] of Object.entries(domainDeps)) {
    domainDepsArray[domain] = Array.from(deps);
  }

  return { entries, domainDeps: domainDepsArray };
}

/**
 * Attempt to extract a domain name from an import path.
 *
 * @param {string} importPath - Import module path
 * @returns {string|null} Domain name or null
 */
function extractDomainFromImport(importPath) {
  if (!importPath) return null;

  // Normalize separators
  const normalized = importPath.replace(/\./g, '/');

  for (const pattern of DOMAIN_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) return match[1];
  }

  // Also try matching common import patterns: domains.member.services -> member
  const domainMatch = normalized.match(/domains\/([^/]+)/);
  if (domainMatch) return domainMatch[1];

  return null;
}

// ---------------------------------------------------------------------------
// 8. API Catalog Builder
// ---------------------------------------------------------------------------

/**
 * Build a consolidated API catalog from all route files.
 *
 * @param {string[]} allFiles - All project file paths
 * @param {function} contentReader - Function that returns file content
 * @param {function} extResolver - Function that returns file extension
 * @returns {object[]} Array of { method, path, handler, file, domain }
 */
function buildApiCatalog(allFiles, contentReader, extResolver) {
  const catalog = [];

  for (const file of allFiles) {
    if (!isApiFile(file)) continue;

    const content = contentReader(file);
    const ext = extResolver(file);
    const endpoints = extractApiEndpoints(content, ext);
    const domain = extractDomain(file);

    for (const ep of endpoints) {
      catalog.push({
        method: ep.method,
        path: ep.path,
        handler: ep.handler,
        file,
        domain: domain || 'root'
      });
    }
  }

  // Sort by path then method
  catalog.sort((a, b) => {
    const pathCmp = a.path.localeCompare(b.path);
    if (pathCmp !== 0) return pathCmp;
    return a.method.localeCompare(b.method);
  });

  return catalog;
}

// ---------------------------------------------------------------------------
// 9. Markdown Document Generators
// ---------------------------------------------------------------------------

/**
 * Generate the main ARCHITECTURE.md content.
 *
 * @param {object} params
 * @param {object} params.domainAnalyses - Map of domain name -> analysis
 * @param {object[]} params.apiCatalog - API catalog entries
 * @param {object} params.dependencyMatrix - Dependency matrix
 * @param {string} params.timestamp - ISO timestamp
 * @returns {string} Markdown content
 */
function generateArchitectureMd(params) {
  const { domainAnalyses, apiCatalog, dependencyMatrix, timestamp } = params;
  const analyses = domainAnalyses || {};
  const catalog = apiCatalog || [];
  const matrix = dependencyMatrix || { entries: [], domainDeps: {} };

  let md = '';
  md += '# Architecture Overview\n\n';
  md += `> Auto-generated by architecture-updater hook. Last updated: ${timestamp}\n\n`;

  // Domain Summary
  const domainNames = Object.keys(analyses).sort();
  md += '## Domains\n\n';
  if (domainNames.length > 0) {
    md += '| Domain | Files | Endpoints | Dependencies |\n';
    md += '|--------|-------|-----------|-------------|\n';
    for (const name of domainNames) {
      const analysis = analyses[name];
      const deps = (matrix.domainDeps[name] || []).join(', ') || 'none';
      md += `| ${name} | ${analysis.fileCount} | ${analysis.endpoints.length} | ${deps} |\n`;
    }
  } else {
    md += 'No domain directories detected.\n';
  }

  // API Summary
  md += '\n## API Summary\n\n';
  if (catalog.length > 0) {
    md += `Total endpoints: ${catalog.length}\n\n`;
    const byMethod = {};
    for (const ep of catalog) {
      byMethod[ep.method] = (byMethod[ep.method] || 0) + 1;
    }
    const methodSummary = Object.entries(byMethod)
      .map(([m, c]) => `${m}: ${c}`)
      .join(', ');
    md += `Methods: ${methodSummary}\n`;
  } else {
    md += 'No API endpoints detected.\n';
  }

  // Dependency Overview
  md += '\n## Dependency Overview\n\n';
  const depEntries = Object.entries(matrix.domainDeps);
  if (depEntries.length > 0) {
    md += '| Source Domain | Depends On |\n';
    md += '|--------------|------------|\n';
    for (const [source, targets] of depEntries) {
      md += `| ${source} | ${targets.join(', ')} |\n`;
    }
  } else {
    md += 'No inter-domain dependencies detected.\n';
  }

  // Document Links
  md += '\n## Documents\n\n';
  md += '- [API Catalog](api-catalog.md)\n';
  md += '- [Dependency Matrix](dependency-matrix.md)\n';
  if (domainNames.length > 0) {
    for (const name of domainNames) {
      md += `- [${name} Domain](domains/${name}.md)\n`;
    }
  }

  md += '\n---\n';
  md += `*Generated at ${timestamp}*\n`;

  return md;
}

/**
 * Generate a domain-specific documentation file.
 *
 * @param {object} analysis - Domain analysis from analyzeDomain()
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Markdown content
 */
function generateDomainMd(analysis, timestamp) {
  if (!analysis) return '';

  let md = '';
  md += `# ${analysis.name} Domain\n\n`;
  md += `> Auto-generated. Last updated: ${timestamp}\n\n`;

  // File Structure
  md += '## File Structure\n\n';
  md += `Total files: ${analysis.fileCount}\n\n`;

  const roleEntries = Object.entries(analysis.roles || {}).sort();
  if (roleEntries.length > 0) {
    md += '| Role | Files |\n';
    md += '|------|-------|\n';
    for (const [role, files] of roleEntries) {
      md += `| ${role} | ${files.length} |\n`;
    }

    md += '\n### Files by Role\n\n';
    for (const [role, files] of roleEntries) {
      md += `**${role}**:\n`;
      for (const file of files) {
        md += `- \`${file}\`\n`;
      }
      md += '\n';
    }
  }

  // Endpoints
  md += '## Endpoints\n\n';
  const endpoints = analysis.endpoints || [];
  if (endpoints.length > 0) {
    md += '| Method | Path | Handler | File |\n';
    md += '|--------|------|---------|------|\n';
    for (const ep of endpoints) {
      md += `| ${ep.method} | ${ep.path} | ${ep.handler} | \`${ep.file}\` |\n`;
    }
  } else {
    md += 'No endpoints defined.\n';
  }

  // Dependencies
  md += '\n## Dependencies\n\n';
  const imports = analysis.imports || [];
  if (imports.length > 0) {
    md += '| Source File | Imports |\n';
    md += '|------------|----------|\n';

    const byFile = {};
    for (const imp of imports) {
      if (!byFile[imp.from]) byFile[imp.from] = [];
      byFile[imp.from].push(imp.to);
    }

    for (const [file, imps] of Object.entries(byFile)) {
      md += `| \`${file}\` | ${imps.join(', ')} |\n`;
    }
  } else {
    md += 'No external dependencies.\n';
  }

  md += '\n---\n';
  md += `*Generated at ${timestamp}*\n`;

  return md;
}

/**
 * Generate the API catalog document.
 *
 * @param {object[]} catalog - API catalog entries
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Markdown content
 */
function generateApiCatalogMd(catalog, timestamp) {
  const entries = catalog || [];

  let md = '';
  md += '# API Catalog\n\n';
  md += `> Auto-generated. Last updated: ${timestamp}\n\n`;

  if (entries.length === 0) {
    md += 'No API endpoints detected.\n';
    md += '\n---\n';
    md += `*Generated at ${timestamp}*\n`;
    return md;
  }

  md += `Total endpoints: ${entries.length}\n\n`;

  // Group by domain
  const byDomain = {};
  for (const ep of entries) {
    const domain = ep.domain || 'root';
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(ep);
  }

  for (const [domain, eps] of Object.entries(byDomain).sort()) {
    md += `## ${domain}\n\n`;
    md += '| Method | Path | Handler | File |\n';
    md += '|--------|------|---------|------|\n';
    for (const ep of eps) {
      md += `| ${ep.method} | \`${ep.path}\` | ${ep.handler} | \`${ep.file}\` |\n`;
    }
    md += '\n';
  }

  md += '---\n';
  md += `*Generated at ${timestamp}*\n`;

  return md;
}

/**
 * Generate the dependency matrix document.
 *
 * @param {object} matrix - Dependency matrix from buildDependencyMatrix()
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Markdown content
 */
function generateDependencyMatrixMd(matrix, timestamp) {
  const entries = (matrix && matrix.entries) || [];
  const domainDeps = (matrix && matrix.domainDeps) || {};

  let md = '';
  md += '# Dependency Matrix\n\n';
  md += `> Auto-generated. Last updated: ${timestamp}\n\n`;

  // Domain-level dependencies
  const domainEntries = Object.entries(domainDeps).sort();
  md += '## Inter-Domain Dependencies\n\n';
  if (domainEntries.length > 0) {
    md += '| Source | Depends On |\n';
    md += '|--------|------------|\n';
    for (const [source, targets] of domainEntries) {
      md += `| ${source} | ${targets.join(', ')} |\n`;
    }
  } else {
    md += 'No inter-domain dependencies detected.\n';
  }

  // File-level dependencies (summarized)
  md += '\n## File Dependencies\n\n';
  if (entries.length > 0) {
    md += `Total files with imports: ${entries.length}\n\n`;
    md += '| File | Import Count | Key Imports |\n';
    md += '|------|-------------|-------------|\n';
    for (const entry of entries) {
      const keyImports = entry.imports.slice(0, 3).join(', ');
      const more = entry.imports.length > 3 ? ` (+${entry.imports.length - 3} more)` : '';
      md += `| \`${entry.file}\` | ${entry.imports.length} | ${keyImports}${more} |\n`;
    }
  } else {
    md += 'No file dependencies detected.\n';
  }

  md += '\n---\n';
  md += `*Generated at ${timestamp}*\n`;

  return md;
}

// ---------------------------------------------------------------------------
// 10. Change Analysis (for targeted updates)
// ---------------------------------------------------------------------------

/**
 * Analyze what architecture documents need updating based on the changed file.
 *
 * @param {string} filePath - Changed file's project-relative path
 * @param {string} [newContent] - New file content (if available)
 * @param {string} [oldContent] - Old file content (if available)
 * @returns {object} Update targets and analysis
 */
function analyzeChangeImpact(filePath, newContent, oldContent) {
  const ext = path.extname(filePath);
  const domain = extractDomain(filePath);
  const apiFile = isApiFile(filePath);

  const updates = {
    architecture: false,
    domain: null,
    apiCatalog: false,
    dependencyMatrix: false,
    details: []
  };

  // Domain file changed -> update domain doc
  if (domain) {
    updates.domain = domain;
    updates.architecture = true;
    updates.details.push(`Domain file changed: ${domain}`);
  }

  // API file changed -> update API catalog
  if (apiFile) {
    updates.apiCatalog = true;
    updates.architecture = true;
    updates.details.push(`API file changed: ${filePath}`);
  }

  // Check for import changes -> update dependency matrix
  if (newContent && oldContent && SOURCE_EXTENSIONS.has(ext)) {
    const importChanges = detectImportChanges(oldContent, newContent, ext);
    if (importChanges.added.length > 0 || importChanges.removed.length > 0) {
      updates.dependencyMatrix = true;
      updates.architecture = true;
      updates.details.push(
        `Import changes: +${importChanges.added.length} -${importChanges.removed.length}`
      );
    }
  } else if (SOURCE_EXTENSIONS.has(ext)) {
    // New file or no old content -> always update dependencies
    updates.dependencyMatrix = true;
    updates.architecture = true;
    updates.details.push('New file or content changed');
  }

  return updates;
}

// ---------------------------------------------------------------------------
// 11. Update Report Generation
// ---------------------------------------------------------------------------

/**
 * Format an architecture update report for additionalContext output.
 *
 * @param {object} updates - Change impact analysis result
 * @param {object} [stats] - Optional generation statistics
 * @returns {string} Formatted report string
 */
function formatUpdateReport(updates, stats) {
  if (!updates) return '';

  const sections = [];

  if (updates.domain) {
    sections.push(`Domain: ${updates.domain}`);
  }
  if (updates.apiCatalog) {
    sections.push('API Catalog');
  }
  if (updates.dependencyMatrix) {
    sections.push('Dependency Matrix');
  }

  if (sections.length === 0) return '';

  let report = '';
  report += '[Architecture Update Detected]\n';
  report += `  Changed: ${updates.details.join('; ')}\n`;
  report += `  Documents to update: ${sections.join(', ')}\n\n`;
  report += `  Architecture docs location: ${ARCHITECTURE_DIR}/\n`;

  if (updates.domain) {
    report += `  Domain doc: ${ARCHITECTURE_DIR}/domains/${updates.domain}.md\n`;
  }
  if (updates.apiCatalog) {
    report += `  API catalog: ${ARCHITECTURE_DIR}/api-catalog.md\n`;
  }
  if (updates.dependencyMatrix) {
    report += `  Dependency matrix: ${ARCHITECTURE_DIR}/dependency-matrix.md\n`;
  }

  report += '\n  RECOMMENDATION:\n';
  report += '  - Review architecture documentation for accuracy after this change.\n';
  report += '  - Architecture docs have been flagged for regeneration.\n';

  if (stats) {
    report += `\n  Stats: ${stats.domainCount || 0} domains, `;
    report += `${stats.endpointCount || 0} endpoints, `;
    report += `${stats.fileCount || 0} tracked files\n`;
  }

  return report;
}

// ---------------------------------------------------------------------------
// 12. Full Architecture Generation (for complete rebuild)
// ---------------------------------------------------------------------------

/**
 * Generate all architecture documentation.
 *
 * @param {string} projectDir - Absolute project root directory
 * @param {object} [options] - Options
 * @param {function} [options.contentReader] - Custom content reader
 * @param {function} [options.extResolver] - Custom extension resolver
 * @param {string[]} [options.files] - Pre-discovered file list
 * @param {string} [options.timestamp] - ISO timestamp
 * @returns {object} Generated documents map { path: content }
 */
function generateAllDocs(projectDir, options) {
  const opts = options || {};
  const timestamp = opts.timestamp || new Date().toISOString();
  const allFiles = opts.files || discoverProjectFiles(projectDir);

  const contentReader = opts.contentReader || ((f) => {
    try {
      return fs.readFileSync(path.join(projectDir, f), 'utf8');
    } catch {
      return '';
    }
  });

  const extResolver = opts.extResolver || ((f) => path.extname(f));

  // Analyze domains
  const domainGroups = groupFilesByDomain(allFiles);
  const domainAnalyses = {};
  for (const [name, files] of Object.entries(domainGroups)) {
    domainAnalyses[name] = analyzeDomain(name, files, contentReader, extResolver);
  }

  // Build API catalog
  const apiCatalog = buildApiCatalog(allFiles, contentReader, extResolver);

  // Build dependency matrix
  const dependencyMatrix = buildDependencyMatrix(allFiles, contentReader, extResolver);

  // Generate documents
  const docs = {};

  // ARCHITECTURE.md
  docs[`${ARCHITECTURE_DIR}/ARCHITECTURE.md`] = generateArchitectureMd({
    domainAnalyses,
    apiCatalog,
    dependencyMatrix,
    timestamp
  });

  // Domain docs
  for (const [name, analysis] of Object.entries(domainAnalyses)) {
    docs[`${ARCHITECTURE_DIR}/domains/${name}.md`] = generateDomainMd(analysis, timestamp);
  }

  // API catalog
  docs[`${ARCHITECTURE_DIR}/api-catalog.md`] = generateApiCatalogMd(apiCatalog, timestamp);

  // Dependency matrix
  docs[`${ARCHITECTURE_DIR}/dependency-matrix.md`] = generateDependencyMatrixMd(
    dependencyMatrix,
    timestamp
  );

  return {
    docs,
    stats: {
      domainCount: Object.keys(domainAnalyses).length,
      endpointCount: apiCatalog.length,
      fileCount: allFiles.length
    }
  };
}

// ---------------------------------------------------------------------------
// 13. Relative Path Resolution
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
 * Output additional context (PostToolUse guidance).
 * @param {string} context
 */
function outputContext(context) {
  const hookSpecificOutput = { additionalContext: context };
  if (_hookEventName) hookSpecificOutput.hookEventName = _hookEventName;
  process.stdout.write(JSON.stringify({ hookSpecificOutput }));
}

// ---------------------------------------------------------------------------
// 15. Main Hook Entry Point
// ---------------------------------------------------------------------------

async function main() {
  const input = await readStdin();

  // Extract tool info
  const toolInput = input.tool_input || {};
  const toolResult = input.tool_result || {};

  const filePath = toolInput.file_path || toolInput.path || '';
  const newContent = toolInput.content || toolInput.new_string || '';
  const oldContent = toolResult.old_content || toolInput.old_content || '';

  if (!filePath) return;

  // Convert to project-relative path
  const relativePath = toRelativePath(filePath);
  if (relativePath.startsWith('..')) return;

  // Skip architecture doc files themselves (avoid recursion)
  if (relativePath.startsWith(ARCHITECTURE_DIR)) return;

  // Check if this file is relevant for architecture tracking
  const ext = path.extname(relativePath);
  const domain = extractDomain(relativePath);
  const apiFile = isApiFile(relativePath);
  const isSource = SOURCE_EXTENSIONS.has(ext);

  if (!domain && !apiFile && !isSource) return;

  // Analyze what needs updating
  const updates = analyzeChangeImpact(relativePath, newContent, oldContent);

  if (!updates.architecture) return;

  // Format and output report
  const report = formatUpdateReport(updates);
  if (report) {
    outputContext(report);
  }
}

main().catch((err) => { console.error('[architecture-updater] Unhandled error:', err.message); });

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ARCHITECTURE_DIR,
    DOMAIN_PATTERNS,
    API_FILE_PATTERNS,
    SOURCE_EXTENSIONS,
    SKIP_DIRS,
    MAX_DISCOVERY_DEPTH,
    extractDomain,
    isDomainFile,
    classifyDomainFileRole,
    isApiFile,
    extractApiEndpoints,
    findPythonHandler,
    extractFlaskMethods,
    parseImports,
    detectImportChanges,
    discoverProjectFiles,
    analyzeDomain,
    groupFilesByDomain,
    buildDependencyMatrix,
    extractDomainFromImport,
    buildApiCatalog,
    generateArchitectureMd,
    generateDomainMd,
    generateApiCatalogMd,
    generateDependencyMatrixMd,
    analyzeChangeImpact,
    formatUpdateReport,
    generateAllDocs,
    toRelativePath
  };
}
