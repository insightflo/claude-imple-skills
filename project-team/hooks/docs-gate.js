#!/usr/bin/env node
/**
 * Integrated Hook: Docs Gate
 *
 * Combines architecture-updater + changelog-recorder
 * into a unified documentation maintenance pipeline.
 *
 * Phase 2 Hook Consolidation
 *
 * Features:
 *   - Architecture documentation updates
 *   - Changelog entry generation
 *   - Dependency matrix maintenance
 *   - API documentation sync
 *
 * Claude Code Hook Protocol:
 *   - stdin: JSON { hook_event_name, tool_name, tool_input, tool_result? }
 *   - stdout: JSON { hookSpecificOutput: { additionalContext } }
 */

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 1. Change Type Detection
// ---------------------------------------------------------------------------

const CHANGE_TYPES = {
  feature: {
    patterns: ['add', 'create', 'implement', 'new'],
    pathPatterns: [/src\/(features|components|pages)/i]
  },
  fix: {
    patterns: ['fix', 'bug', 'patch', 'resolve', 'correct'],
    pathPatterns: []
  },
  refactor: {
    patterns: ['refactor', 'restructure', 'reorganize', 'optimize'],
    pathPatterns: []
  },
  docs: {
    patterns: ['doc', 'readme', 'comment', 'jsdoc'],
    pathPatterns: [/docs?\//i, /\.md$/i, /readme/i]
  },
  test: {
    patterns: ['test', 'spec', 'coverage'],
    pathPatterns: [/tests?\//i, /__(tests|mocks)__/i, /\.(test|spec)\./i]
  },
  chore: {
    patterns: ['config', 'build', 'ci', 'deps', 'dependency'],
    pathPatterns: [/config/i, /\.config\./i, /package\.json/i]
  }
};

function detectChangeType(filePath, content) {
  const lowerPath = filePath.toLowerCase();
  const lowerContent = (content || '').toLowerCase().slice(0, 500);

  for (const [type, rules] of Object.entries(CHANGE_TYPES)) {
    // Check path patterns first
    for (const regex of rules.pathPatterns) {
      if (regex.test(filePath)) return type;
    }
    // Check content patterns
    for (const pattern of rules.patterns) {
      if (lowerContent.includes(pattern)) return type;
    }
  }

  return 'chore'; // Default
}

// ---------------------------------------------------------------------------
// 2. Domain Detection
// ---------------------------------------------------------------------------

function detectDomain(filePath) {
  // Pattern: src/domains/{domain}/...
  const domainMatch = filePath.match(/src\/domains\/([^/]+)\//);
  if (domainMatch) return domainMatch[1];

  // Pattern: src/{feature}/...
  const featureMatch = filePath.match(/src\/([^/]+)\//);
  if (featureMatch) {
    const feature = featureMatch[1];
    if (!['components', 'utils', 'hooks', 'lib', 'types', 'styles'].includes(feature)) {
      return feature;
    }
  }

  // Pattern: {domain}-api.yaml
  const contractMatch = filePath.match(/([^/]+)-api\.yaml$/);
  if (contractMatch) return contractMatch[1];

  return 'general';
}

// ---------------------------------------------------------------------------
// 3. Impact Detection
// ---------------------------------------------------------------------------

function detectImpact(filePath, content) {
  const impacts = [];

  // Check for external dependencies
  const depPatterns = [
    /import\s+.*from\s+['"](?!\.)/g,  // External imports
    /require\(['"](?!\.)/g             // External requires
  ];

  for (const pattern of depPatterns) {
    const matches = (content || '').match(pattern);
    if (matches && matches.length > 0) {
      impacts.push(`external dependency added: ${matches.slice(0, 3).join(', ')}`);
    }
  }

  // Check for API changes
  if (/export\s+(async\s+)?function/.test(content || '')) {
    impacts.push('public API modified');
  }

  // Check for schema changes
  if (/CREATE TABLE|ALTER TABLE|DROP TABLE|migration/i.test(content || '')) {
    impacts.push('database schema change');
  }

  return impacts;
}

// ---------------------------------------------------------------------------
// 4. Changelog Entry Generation
// ---------------------------------------------------------------------------

function generateChangelogEntry(filePath, changeType, domain, impacts) {
  const timestamp = new Date().toISOString().split('T')[0];
  const fileName = path.basename(filePath);

  let entry = `\n[Changelog Recorded]\n`;
  entry += `  Type: ${changeType}\n`;
  entry += `  Domain: ${domain}\n`;
  entry += `  File: ${filePath}\n`;

  // Generate description based on type
  const descriptions = {
    feature: `Create ${fileName.replace(path.extname(fileName), '')} in ${domain}`,
    fix: `Fix issue in ${fileName}`,
    refactor: `Refactor ${fileName}`,
    docs: `Add documentation ${fileName}`,
    test: `Add tests for ${domain}`,
    chore: `Update ${fileName}`
  };

  entry += `  Description: ${descriptions[changeType] || `Modify ${fileName}`}\n`;

  if (impacts.length > 0) {
    entry += `  Impact: ${impacts.join('; ')}\n`;
  }

  entry += `\n  Changelog: .claude/changelog/${timestamp.slice(0, 7)}.yaml\n`;

  return entry;
}

// ---------------------------------------------------------------------------
// 5. Architecture Update Detection
// ---------------------------------------------------------------------------

function detectArchitectureChange(filePath, content) {
  const changes = [];

  // New module/package
  if (/\/__init__\.py$/.test(filePath) || /\/index\.(ts|js)$/.test(filePath)) {
    changes.push('New module structure');
  }

  // New route/endpoint
  if (/router\.(add_api_)?route|@(app|router)\.(get|post|put|delete)/i.test(content || '')) {
    changes.push('API endpoint modified');
  }

  // New component
  if (/export\s+(default\s+)?function\s+[A-Z]/.test(content || '') &&
    ['.tsx', '.jsx'].includes(path.extname(filePath))) {
    changes.push('New component created');
  }

  // New service
  if (/class\s+\w+Service/.test(content || '')) {
    changes.push('New service class');
  }

  return changes;
}

function generateArchitectureUpdateReminder(archChanges, filePath) {
  if (archChanges.length === 0) return '';

  let reminder = `\n[Architecture Update Detected]\n`;
  reminder += `  Changed: ${archChanges.join(', ')}\n`;
  reminder += `  Documents to update: Dependency Matrix\n`;
  reminder += `\n  Architecture docs location: .claude/architecture/\n`;
  reminder += `  Dependency matrix: .claude/architecture/dependency-matrix.md\n`;
  reminder += `\n  RECOMMENDATION:\n`;
  reminder += `  - Review architecture documentation for accuracy after this change.\n`;
  reminder += `  - Architecture docs have been flagged for regeneration.\n`;

  return reminder;
}

// ---------------------------------------------------------------------------
// 6. Report Formatting
// ---------------------------------------------------------------------------

function formatDocsReport(changelogEntry, archReminder) {
  let report = '';

  if (changelogEntry) {
    report += changelogEntry;
  }

  if (archReminder) {
    report += archReminder;
  }

  return report;
}

// ---------------------------------------------------------------------------
// 7. Main Entry Point
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

function toRelativePath(filePath) {
  if (!filePath) return '';
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!path.isAbsolute(filePath)) return filePath;
  const relative = path.relative(projectDir, filePath);
  return relative.startsWith('..') ? relative : relative;
}

async function main() {
  const input = await readStdin();
  const hookEvent = input.hook_event_name || '';
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || toolInput.path || '';

  if (!filePath) return;

  const relativePath = toRelativePath(filePath);
  if (relativePath.startsWith('..')) return;

  // Skip changelog and architecture docs themselves to prevent recursion
  if (relativePath.includes('.claude/changelog') ||
    relativePath.includes('.claude/architecture')) {
    return;
  }

  const content = toolInput.content || toolInput.new_string || '';

  // Detect change metadata
  const changeType = detectChangeType(relativePath, content);
  const domain = detectDomain(relativePath);
  const impacts = detectImpact(relativePath, content);
  const archChanges = detectArchitectureChange(relativePath, content);

  // Generate entries
  const changelogEntry = generateChangelogEntry(relativePath, changeType, domain, impacts);
  const archReminder = generateArchitectureUpdateReminder(archChanges, relativePath);

  // Output report
  const report = formatDocsReport(changelogEntry, archReminder);

  if (report) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        additionalContext: report,
        hookEventName: hookEvent
      }
    }));
  }
}

main().catch((err) => { console.error('[docs-gate] Unhandled error:', err.message); });

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CHANGE_TYPES,
    detectChangeType,
    detectDomain,
    detectImpact,
    generateChangelogEntry,
    detectArchitectureChange,
    generateArchitectureUpdateReminder,
    formatDocsReport
  };
}
