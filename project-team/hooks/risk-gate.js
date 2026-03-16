#!/usr/bin/env node
/**
 * Integrated Hook: Risk Gate
 *
 * Combines pre-edit-impact-check + risk-area-warning
 * into a unified risk assessment pipeline.
 *
 * Phase 2 Hook Consolidation
 *
 * Features:
 *   - Pre-edit impact analysis
 *   - Risk area identification (payment, auth, security)
 *   - Dependency impact calculation
 *   - Test requirement flagging
 *
 * Claude Code Hook Protocol:
 *   - stdin: JSON { hook_event_name, tool_name, tool_input }
 *   - stdout: JSON { hookSpecificOutput: { additionalContext } }
 */

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 1. Risk Area Definitions
// ---------------------------------------------------------------------------

const RISK_AREAS = {
  CRITICAL: {
    patterns: [
      'payment', 'billing', 'subscription', 'charge', 'refund',
      'auth', 'authentication', 'authorization', 'login', 'password', 'token',
      'security', 'encrypt', 'decrypt', 'secret', 'credential',
      'pii', 'personal', 'gdpr', 'compliance'
    ],
    pathPatterns: [
      /payment/i, /billing/i, /auth/i, /security/i, /secrets?/i
    ],
    requirements: {
      approvals: ['Security Specialist', 'Chief Architect'],
      tests: ['unit', 'integration', 'e2e', 'security'],
      review: 'mandatory'
    }
  },
  HIGH: {
    patterns: [
      'migration', 'schema', 'database', 'transaction',
      'api', 'contract', 'interface', 'endpoint',
      'config', 'environment', 'deployment'
    ],
    pathPatterns: [
      /migration/i, /schema/i, /database/i, /api/i, /config/i
    ],
    requirements: {
      approvals: ['DBA', 'Backend Specialist'],
      tests: ['unit', 'integration'],
      review: 'recommended'
    }
  },
  MEDIUM: {
    patterns: [
      'cache', 'session', 'state', 'store',
      'event', 'queue', 'notification'
    ],
    pathPatterns: [
      /cache/i, /session/i, /state/i, /store/i
    ],
    requirements: {
      approvals: [],
      tests: ['unit'],
      review: 'optional'
    }
  },
  LOW: {
    patterns: [],
    pathPatterns: [],
    requirements: {
      approvals: [],
      tests: [],
      review: 'standard'
    }
  }
};

// ---------------------------------------------------------------------------
// 2. Impact Analysis
// ---------------------------------------------------------------------------

function detectRiskLevel(filePath, content) {
  const lowerPath = filePath.toLowerCase();
  const lowerContent = (content || '').toLowerCase();

  // Check CRITICAL first
  for (const pattern of RISK_AREAS.CRITICAL.patterns) {
    if (lowerPath.includes(pattern) || lowerContent.includes(pattern)) {
      return 'CRITICAL';
    }
  }
  for (const regex of RISK_AREAS.CRITICAL.pathPatterns) {
    if (regex.test(filePath)) return 'CRITICAL';
  }

  // Check HIGH
  for (const pattern of RISK_AREAS.HIGH.patterns) {
    if (lowerPath.includes(pattern) || lowerContent.includes(pattern)) {
      return 'HIGH';
    }
  }
  for (const regex of RISK_AREAS.HIGH.pathPatterns) {
    if (regex.test(filePath)) return 'HIGH';
  }

  // Check MEDIUM
  for (const pattern of RISK_AREAS.MEDIUM.patterns) {
    if (lowerPath.includes(pattern) || lowerContent.includes(pattern)) {
      return 'MEDIUM';
    }
  }

  return 'LOW';
}

function findDependents(filePath) {
  // Simplified: would use actual dependency analysis in production
  const dependents = [];
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  try {
    // Quick grep-like search for imports of this file
    const baseName = path.basename(filePath, path.extname(filePath));
    const searchDirs = ['src', 'lib', 'app'];

    for (const dir of searchDirs) {
      const dirPath = path.join(projectDir, dir);
      if (!fs.existsSync(dirPath)) continue;

      // Would recursively search - simplified for hook
      dependents.push(`(Search ${dir}/ for "${baseName}" imports)`);
    }
  } catch {
    // Ignore errors
  }

  return dependents;
}

function findRelatedTests(filePath) {
  const tests = [];
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const baseName = path.basename(filePath, path.extname(filePath));
  const ext = path.extname(filePath);

  // Common test file patterns
  const testPatterns = [
    `${baseName}.test${ext}`,
    `${baseName}.spec${ext}`,
    `test_${baseName}${ext}`,
    `${baseName}_test${ext}`
  ];

  const testDirs = ['tests', '__tests__', 'test', 'spec'];

  for (const dir of testDirs) {
    for (const pattern of testPatterns) {
      const testPath = path.join(projectDir, dir, pattern);
      if (fs.existsSync(testPath)) {
        tests.push(path.relative(projectDir, testPath));
      }
    }
  }

  return tests;
}

function suggestTestCommand(filePath) {
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  if (ext === '.py') {
    return `pytest tests/ -k "${baseName}" -v`;
  }
  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    return `npm test -- --testPathPattern="${baseName}"`;
  }
  return 'Run relevant test suite manually.';
}

// ---------------------------------------------------------------------------
// 3. Report Generation
// ---------------------------------------------------------------------------

function formatRiskReport(filePath, riskLevel, requirements, dependents, tests) {
  const icons = {
    CRITICAL: '🔴',
    HIGH: '🟠',
    MEDIUM: '🟡',
    LOW: '🟢'
  };

  let report = `\n[Impact Analysis] File: "${filePath}"\n`;
  report += `  Risk Level: ${icons[riskLevel]} ${riskLevel}\n`;

  // Risk-specific message
  if (riskLevel === 'CRITICAL') {
    report += `  Payment/billing/auth/security area - financial or security impact.\n`;
    report += `  Requires thorough review and full test coverage.\n`;
  } else if (riskLevel === 'HIGH') {
    report += `  Database/API/config area - potential system-wide impact.\n`;
    report += `  Requires careful review and integration tests.\n`;
  } else if (riskLevel === 'MEDIUM') {
    report += `  State/cache/event area - moderate blast radius.\n`;
    report += `  Standard review applies.\n`;
  } else {
    report += `  Tests/utils/config/docs area - low blast radius.\n`;
    report += `  Standard review applies.\n`;
  }

  // Dependents
  report += `\n  Direct Dependents (files importing this file):\n`;
  if (dependents.length > 0) {
    for (const dep of dependents.slice(0, 5)) {
      report += `    ${dep}\n`;
    }
    if (dependents.length > 5) {
      report += `    ... and ${dependents.length - 5} more\n`;
    }
  } else {
    report += `    None found\n`;
  }

  // Related tests
  report += `\n  Related Tests:\n`;
  if (tests.length > 0) {
    for (const test of tests) {
      report += `    ${test}\n`;
    }
  } else {
    report += `    None found (consider writing tests!)\n`;
  }

  // Requirements
  if (requirements.approvals.length > 0) {
    report += `\n  Required Approvals:\n`;
    for (const approver of requirements.approvals) {
      report += `    - ${approver}\n`;
    }
  }

  if (requirements.tests.length > 0) {
    report += `\n  Required Tests:\n`;
    for (const testType of requirements.tests) {
      report += `    - ${testType}\n`;
    }
  }

  report += `\n  Recommended Test Command:\n`;
  report += `    $ ${suggestTestCommand(filePath)}\n`;

  // Warning for critical/high
  if (riskLevel === 'CRITICAL') {
    report += `\n  [WARNING] CRITICAL risk area! Ensure thorough review, full test coverage,\n`;
    report += `            and approval before merging.\n`;
  }

  return report;
}

// ---------------------------------------------------------------------------
// 4. Main Entry Point
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

  // Skip non-code files
  const ext = path.extname(filePath);
  const codeExts = ['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.java', '.rb'];
  if (!codeExts.includes(ext)) return;

  const content = toolInput.content || toolInput.new_string || '';

  // Analyze risk
  const riskLevel = detectRiskLevel(relativePath, content);
  const requirements = RISK_AREAS[riskLevel].requirements;
  const dependents = findDependents(relativePath);
  const tests = findRelatedTests(relativePath);

  // Generate report
  const report = formatRiskReport(relativePath, riskLevel, requirements, dependents, tests);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      additionalContext: report,
      hookEventName: hookEvent
    }
  }));
}

main().catch((err) => { console.error('[risk-gate] Unhandled error:', err.message); });

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RISK_AREAS,
    detectRiskLevel,
    findDependents,
    findRelatedTests,
    suggestTestCommand,
    formatRiskReport
  };
}
