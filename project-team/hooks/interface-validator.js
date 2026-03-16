#!/usr/bin/env node
/**
 * PostToolUse[Edit|Write] Hook: Interface Contract Validator
 *
 * Validates domain interface contracts when YAML specs are modified.
 * Detects breaking changes, performs impact analysis, and identifies
 * affected consumer domains.
 *
 * @TASK P2-T5 - Interface Contract Validator Hook
 * @SPEC project-team/hooks/interface-validator.js
 *
 * Claude Code Hook Protocol (PostToolUse):
 *   - stdin: JSON { tool_name, tool_input: { file_path, content, ... },
 *                    tool_result: { old_content?: string, ... } }
 *   - stdout: JSON { hookSpecificOutput: { additionalContext: string } }
 *
 * PostToolUse hooks cannot block (the tool already executed).
 * Instead, they inject additionalContext to guide the agent toward fixes
 * or alert about breaking changes requiring approval.
 *
 * Validates:
 *   - YAML structure of interface contracts
 *   - Breaking changes: field deletion, type change, endpoint removal
 *   - Non-breaking changes: field addition, version bump
 *   - Consumer impact analysis
 */

const path = require('path');

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

/**
 * File patterns to validate (interface contract YAML files).
 */
const VALIDATION_PATTERNS = [
  '**/contracts/interfaces/**/*.yaml',
  '**/contracts/interfaces/**/*.yml'
];

/**
 * Breaking change definitions.
 * Each type specifies whether it blocks and what action is recommended.
 */
const CHANGE_TYPES = {
  field_add: {
    breaking: false,
    label: 'Field Added',
    action: 'Non-breaking: consumers can optionally use the new field.'
  },
  field_remove: {
    breaking: true,
    label: 'Field Removed',
    action: 'Breaking change: all consumers using this field must be updated.'
  },
  field_type_change: {
    breaking: true,
    label: 'Field Type Changed',
    action: 'Breaking change: consumers relying on the original type must be updated.'
  },
  endpoint_add: {
    breaking: false,
    label: 'Endpoint Added',
    action: 'Non-breaking: new endpoint available for consumers.'
  },
  endpoint_remove: {
    breaking: true,
    label: 'Endpoint Removed',
    action: 'Breaking change: all consumers using this endpoint must migrate.'
  },
  endpoint_method_change: {
    breaking: true,
    label: 'Endpoint Method Changed',
    action: 'Breaking change: consumers must update their HTTP method.'
  },
  version_bump: {
    breaking: false,
    label: 'Version Updated',
    action: 'Informational: contract version has been updated.'
  },
  consumer_add: {
    breaking: false,
    label: 'Consumer Added',
    action: 'Informational: new consumer domain registered.'
  },
  consumer_remove: {
    breaking: false,
    label: 'Consumer Removed',
    action: 'Informational: consumer domain unregistered.'
  }
};

// ---------------------------------------------------------------------------
// 2. Simple YAML Parser
// ---------------------------------------------------------------------------

/**
 * Parse a simplified YAML string into a JavaScript object.
 * Handles:
 *   - Key-value pairs (key: value)
 *   - Nested objects (indentation-based)
 *   - Arrays (- item)
 *   - Array items with nested key-value pairs and sub-objects
 *
 * Note: This is intentionally minimal. It handles the interface contract
 * YAML format without requiring a full YAML library.
 *
 * @param {string} yamlString - YAML content
 * @returns {object} Parsed object
 */
function parseSimpleYaml(yamlString) {
  if (!yamlString || typeof yamlString !== 'string') return {};

  // Filter out empty lines and comments, keeping line info
  const rawLines = yamlString.split('\n');
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = line.search(/\S/);
    lines.push({ raw: line, trimmed, indent, idx: i });
  }

  return parseBlock(lines, 0, lines.length, -1);
}

/**
 * Parse a block of YAML lines into an object or value.
 * @param {object[]} lines - Filtered line objects
 * @param {number} start - Start index in lines array
 * @param {number} end - End index (exclusive)
 * @param {number} parentIndent - Parent indentation level
 * @returns {object}
 */
function parseBlock(lines, start, end, parentIndent) {
  const result = {};
  let i = start;

  while (i < end) {
    const line = lines[i];

    // Skip lines at or below parent indent (shouldn't happen in well-formed YAML)
    if (line.indent <= parentIndent && parentIndent >= 0) break;

    if (line.trimmed.startsWith('- ')) {
      // This is an array item but we're in an object context - skip
      i++;
      continue;
    }

    if (line.trimmed.includes(':')) {
      const { key, value } = splitKeyValue(line.trimmed);
      if (!key) { i++; continue; }

      if (value !== '' && value !== undefined) {
        // Simple key: value
        result[key] = parseValue(value);
        i++;
      } else {
        // Key with no inline value - look at next lines for content
        const childIndent = findChildIndent(lines, i + 1, end);

        if (childIndent === -1) {
          // No children found
          result[key] = null;
          i++;
        } else {
          // Find the range of children at this indent level
          const childEnd = findBlockEnd(lines, i + 1, end, childIndent);

          // Check if children are array items or key-value pairs
          const firstChild = findFirstContentLine(lines, i + 1, childEnd);
          if (firstChild !== -1 && lines[firstChild].trimmed.startsWith('- ')) {
            // Array
            result[key] = parseArray(lines, i + 1, childEnd, line.indent);
          } else {
            // Nested object
            result[key] = parseBlock(lines, i + 1, childEnd, line.indent);
          }
          i = childEnd;
        }
      }
    } else {
      i++;
    }
  }

  return result;
}

/**
 * Parse an array block from YAML lines.
 * @param {object[]} lines - Filtered line objects
 * @param {number} start - Start index
 * @param {number} end - End index
 * @param {number} parentIndent - Parent key indentation
 * @returns {Array}
 */
function parseArray(lines, start, end, parentIndent) {
  const result = [];
  let i = start;

  while (i < end) {
    const line = lines[i];

    if (!line.trimmed.startsWith('- ')) {
      i++;
      continue;
    }

    const dashIndent = line.indent;
    const content = line.trimmed.substring(2).trim();

    if (!content.includes(':')) {
      // Simple value array item
      result.push(parseValue(content));
      i++;
    } else {
      // Object array item - parse the first key-value from the dash line
      const itemObj = parseInlineKeyValue(content);

      // The content after "- " starts at dashIndent + 2
      const itemContentIndent = dashIndent + 2;

      // Collect subsequent lines that belong to this array item
      let itemEnd = i + 1;
      while (itemEnd < end) {
        const nextLine = lines[itemEnd];
        // Stop if we hit another array item at the same level or less indent
        if (nextLine.trimmed.startsWith('- ') && nextLine.indent <= dashIndent) break;
        // Stop if we hit something at parent indent or less
        if (nextLine.indent <= dashIndent && !nextLine.trimmed.startsWith('- ')) break;
        itemEnd++;
      }

      // Parse the remaining lines as key-value pairs within this array item
      parseArrayItemContent(lines, i + 1, itemEnd, itemContentIndent, itemObj);

      result.push(itemObj);
      i = itemEnd;
    }
  }

  return result;
}

/**
 * Parse key-value content within an array item (handles nested objects).
 * @param {object[]} lines - Filtered line objects
 * @param {number} start - Start index
 * @param {number} end - End index
 * @param {number} baseIndent - Expected indent for sibling keys
 * @param {object} target - Object to populate
 */
function parseArrayItemContent(lines, start, end, baseIndent, target) {
  let i = start;

  while (i < end) {
    const line = lines[i];

    if (!line.trimmed.includes(':')) {
      i++;
      continue;
    }

    const { key, value } = splitKeyValue(line.trimmed);
    if (!key) { i++; continue; }

    if (value !== '' && value !== undefined) {
      target[key] = parseValue(value);
      i++;
    } else {
      // Nested object or array within the array item
      const childIndent = findChildIndent(lines, i + 1, end);

      if (childIndent === -1) {
        target[key] = null;
        i++;
      } else {
        const childEnd = findBlockEnd(lines, i + 1, end, childIndent);
        const firstChild = findFirstContentLine(lines, i + 1, childEnd);

        if (firstChild !== -1 && lines[firstChild].trimmed.startsWith('- ')) {
          target[key] = parseArray(lines, i + 1, childEnd, line.indent);
        } else {
          target[key] = parseBlock(lines, i + 1, childEnd, line.indent);
        }
        i = childEnd;
      }
    }
  }
}

/**
 * Find the indent level of the first child line.
 * @param {object[]} lines
 * @param {number} start
 * @param {number} end
 * @returns {number} Indent level or -1 if no children
 */
function findChildIndent(lines, start, end) {
  for (let i = start; i < end; i++) {
    return lines[i].indent;
  }
  return -1;
}

/**
 * Find where a block at the given indent level ends.
 * A block ends when we encounter a line at a lesser indent.
 * @param {object[]} lines
 * @param {number} start
 * @param {number} end
 * @param {number} blockIndent - The indent level of the block
 * @returns {number} End index
 */
function findBlockEnd(lines, start, end, blockIndent) {
  for (let i = start; i < end; i++) {
    if (lines[i].indent < blockIndent) return i;
  }
  return end;
}

/**
 * Find the first content line starting from an index.
 * @param {object[]} lines
 * @param {number} start
 * @param {number} end
 * @returns {number} Index or -1
 */
function findFirstContentLine(lines, start, end) {
  if (start < end) return start;
  return -1;
}

/**
 * Split a "key: value" string into parts.
 * @param {string} str
 * @returns {{ key: string, value: string }}
 */
function splitKeyValue(str) {
  const colonIndex = str.indexOf(':');
  if (colonIndex === -1) return { key: null, value: null };

  const key = str.substring(0, colonIndex).trim();
  const value = str.substring(colonIndex + 1).trim();
  return { key, value };
}

/**
 * Parse an inline "key: value" string from an array item.
 * Example: "path: /api/members/{id}" -> { path: "/api/members/{id}" }
 *
 * @param {string} str
 * @returns {object}
 */
function parseInlineKeyValue(str) {
  const { key, value } = splitKeyValue(str);
  if (!key) return {};
  const obj = {};
  obj[key] = parseValue(value);
  return obj;
}

/**
 * Parse a YAML value into a JavaScript value.
 * Handles: strings, numbers, booleans, null, and inline arrays.
 *
 * @param {string} value
 * @returns {*}
 */
function parseValue(value) {
  if (value === undefined || value === null) return '';
  const trimmed = String(value).trim();

  if (trimmed === '' || trimmed === '~' || trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Inline array: [item1, item2]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1);
    return inner.split(',').map(s => parseValue(s.trim()));
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  // Remove surrounding quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// 3. Path Matching Utilities
// ---------------------------------------------------------------------------

/**
 * Convert a simplified glob pattern to a RegExp.
 * Handles leading double-star-slash as optional prefix (matches with or without leading path).
 *
 * @param {string} pattern - Glob-like pattern
 * @returns {RegExp}
 */
function globToRegex(pattern) {
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '<<DOUBLESTAR_SLASH>>')
    .replace(/\*\*/g, '<<DOUBLESTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<DOUBLESTAR_SLASH>>/g, '(.+/)?')
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
 * Check if a file should be validated as an interface contract.
 * @param {string} relativePath
 * @returns {boolean}
 */
function shouldValidate(relativePath) {
  return matchesAnyPattern(relativePath, VALIDATION_PATTERNS);
}

// ---------------------------------------------------------------------------
// 4. Spec Comparison & Change Detection
// ---------------------------------------------------------------------------

/**
 * Extract a flat map of response fields from a parsed spec's endpoints.
 * Returns a map: "METHOD PATH.fieldName" -> fieldType
 *
 * @param {object} spec - Parsed YAML spec
 * @returns {Map<string, string>}
 */
function extractEndpointFields(spec) {
  const fields = new Map();
  const endpoints = spec.endpoints || [];

  for (const endpoint of endpoints) {
    const ep = endpoint || {};
    const epPath = ep.path || '';
    const method = (ep.method || 'GET').toUpperCase();
    const key = `${method} ${epPath}`;

    // Record the endpoint itself
    fields.set(key, '__endpoint__');

    // Record response fields
    const response = ep.response || {};
    for (const [fieldName, fieldType] of Object.entries(response)) {
      fields.set(`${key}.${fieldName}`, String(fieldType));
    }

    // Record request fields (if any)
    const request = ep.request || {};
    for (const [fieldName, fieldType] of Object.entries(request)) {
      fields.set(`${key}.request.${fieldName}`, String(fieldType));
    }
  }

  return fields;
}

/**
 * Extract a set of consumer domain entries from a parsed spec.
 * Returns a map: "domain" -> { domain, uses }
 *
 * @param {object} spec - Parsed YAML spec
 * @returns {Map<string, object>}
 */
function extractConsumers(spec) {
  const consumers = new Map();
  const consumerList = spec.consumers || [];

  for (const consumer of consumerList) {
    if (consumer && consumer.domain) {
      consumers.set(consumer.domain, {
        domain: consumer.domain,
        uses: consumer.uses || []
      });
    }
  }

  return consumers;
}

/**
 * Compare old and new specs to detect changes.
 *
 * @param {object} oldSpec - Previous parsed YAML spec
 * @param {object} newSpec - New parsed YAML spec
 * @returns {object[]} Array of detected changes
 */
function detectChanges(oldSpec, newSpec) {
  const changes = [];

  // 1. Version change detection
  if (oldSpec.version !== undefined && newSpec.version !== undefined
      && String(oldSpec.version) !== String(newSpec.version)) {
    changes.push({
      type: 'version_bump',
      field: 'version',
      oldValue: String(oldSpec.version),
      newValue: String(newSpec.version),
      ...CHANGE_TYPES.version_bump
    });
  }

  // 2. Endpoint & field changes
  const oldFields = extractEndpointFields(oldSpec);
  const newFields = extractEndpointFields(newSpec);

  // Detect removed fields/endpoints
  for (const [key, oldType] of oldFields) {
    if (!newFields.has(key)) {
      if (oldType === '__endpoint__') {
        changes.push({
          type: 'endpoint_remove',
          field: key,
          oldValue: key,
          newValue: null,
          ...CHANGE_TYPES.endpoint_remove
        });
      } else {
        changes.push({
          type: 'field_remove',
          field: key,
          oldValue: oldType,
          newValue: null,
          ...CHANGE_TYPES.field_remove
        });
      }
    }
  }

  // Detect added fields/endpoints and type changes
  for (const [key, newType] of newFields) {
    if (!oldFields.has(key)) {
      if (newType === '__endpoint__') {
        changes.push({
          type: 'endpoint_add',
          field: key,
          oldValue: null,
          newValue: key,
          ...CHANGE_TYPES.endpoint_add
        });
      } else {
        changes.push({
          type: 'field_add',
          field: key,
          oldValue: null,
          newValue: newType,
          ...CHANGE_TYPES.field_add
        });
      }
    } else if (newType !== '__endpoint__') {
      const oldType = oldFields.get(key);
      if (oldType !== '__endpoint__' && oldType !== newType) {
        changes.push({
          type: 'field_type_change',
          field: key,
          oldValue: oldType,
          newValue: newType,
          ...CHANGE_TYPES.field_type_change
        });
      }
    }
  }

  // 3. Consumer changes
  const oldConsumers = extractConsumers(oldSpec);
  const newConsumers = extractConsumers(newSpec);

  for (const [domain] of newConsumers) {
    if (!oldConsumers.has(domain)) {
      changes.push({
        type: 'consumer_add',
        field: `consumer:${domain}`,
        oldValue: null,
        newValue: domain,
        ...CHANGE_TYPES.consumer_add
      });
    }
  }

  for (const [domain] of oldConsumers) {
    if (!newConsumers.has(domain)) {
      changes.push({
        type: 'consumer_remove',
        field: `consumer:${domain}`,
        oldValue: domain,
        newValue: null,
        ...CHANGE_TYPES.consumer_remove
      });
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// 5. Impact Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze the impact of detected changes on consumer domains.
 *
 * @param {object[]} changes - Array of detected changes
 * @param {object} newSpec - The new parsed spec (for consumer info)
 * @returns {object} Impact analysis result
 */
function analyzeImpact(changes, newSpec) {
  const breakingChanges = changes.filter(c => c.breaking);
  const nonBreakingChanges = changes.filter(c => !c.breaking);
  const consumers = extractConsumers(newSpec);

  // Build affected consumer list
  const affectedConsumers = [];
  const domain = newSpec.domain || 'unknown';

  for (const [consumerDomain, consumerInfo] of consumers) {
    const usedEndpoints = consumerInfo.uses || [];
    const affectedEndpoints = [];
    const recommendations = [];

    for (const change of changes) {
      // Check if this consumer uses the affected endpoint
      for (const used of usedEndpoints) {
        if (change.field.startsWith(used) || change.field === used) {
          affectedEndpoints.push(change.field);

          if (change.breaking) {
            recommendations.push(
              `[BREAKING] ${change.label}: ${change.field} - ${change.action}`
            );
          } else {
            recommendations.push(
              `[INFO] ${change.label}: ${change.field} - ${change.action}`
            );
          }
        }
      }
    }

    // For breaking changes, all consumers should be notified even if
    // we can't determine the exact endpoint match
    const hasBreaking = breakingChanges.length > 0;

    if (affectedEndpoints.length > 0 || hasBreaking) {
      affectedConsumers.push({
        domain: consumerDomain,
        uses: usedEndpoints,
        affectedEndpoints: [...new Set(affectedEndpoints)],
        recommendations,
        requiresUpdate: hasBreaking,
        suggestedFiles: [`${consumerDomain}/services/*.py`, `${consumerDomain}/clients/${domain}_client.py`]
      });
    }
  }

  return {
    domain,
    version: newSpec.version ? String(newSpec.version) : 'unknown',
    totalChanges: changes.length,
    breakingCount: breakingChanges.length,
    nonBreakingCount: nonBreakingChanges.length,
    hasBreakingChanges: breakingChanges.length > 0,
    changes,
    affectedConsumers
  };
}

// ---------------------------------------------------------------------------
// 6. New Spec Validation (First Creation)
// ---------------------------------------------------------------------------

/**
 * Validate the structure of a new interface contract spec.
 * Checks for required fields and proper structure.
 *
 * @param {object} spec - Parsed YAML spec
 * @returns {{ valid: boolean, issues: string[] }}
 */
function validateSpecStructure(spec) {
  const issues = [];

  if (!spec.version) {
    issues.push('Missing required field: "version"');
  }

  if (!spec.domain) {
    issues.push('Missing required field: "domain"');
  }

  if (!spec.endpoints || !Array.isArray(spec.endpoints)) {
    issues.push('Missing or invalid "endpoints" array');
  } else {
    for (let i = 0; i < spec.endpoints.length; i++) {
      const ep = spec.endpoints[i];
      if (!ep.path) {
        issues.push(`Endpoint [${i}]: missing "path" field`);
      }
      if (!ep.method) {
        issues.push(`Endpoint [${i}]: missing "method" field`);
      }
      if (!ep.response && !ep.request) {
        issues.push(`Endpoint [${i}]: must define at least "response" or "request" fields`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

// ---------------------------------------------------------------------------
// 7. Report Formatting
// ---------------------------------------------------------------------------

/**
 * Format a full impact analysis report.
 *
 * @param {object} impact - Impact analysis result
 * @returns {string}
 */
function formatImpactReport(impact) {
  let report = '';

  // Header
  const severity = impact.hasBreakingChanges ? 'BREAKING CHANGE' : 'SPEC UPDATE';
  report += `[Interface Contract ${severity}] Domain "${impact.domain}" v${impact.version}\n`;
  report += `  Changes: ${impact.totalChanges} total`;
  report += ` (${impact.breakingCount} breaking, ${impact.nonBreakingCount} non-breaking)\n`;

  // Change details
  if (impact.changes.length > 0) {
    report += '\n  -- Changes --\n';

    const breakingChanges = impact.changes.filter(c => c.breaking);
    const nonBreakingChanges = impact.changes.filter(c => !c.breaking);

    if (breakingChanges.length > 0) {
      report += '  BREAKING:\n';
      for (const c of breakingChanges) {
        report += `    [BREAK] ${c.label}: ${c.field}`;
        if (c.oldValue && c.newValue) {
          report += ` (${c.oldValue} -> ${c.newValue})`;
        } else if (c.oldValue) {
          report += ` (removed: ${c.oldValue})`;
        }
        report += '\n';
        report += `      Action: ${c.action}\n`;
      }
    }

    if (nonBreakingChanges.length > 0) {
      report += '  NON-BREAKING:\n';
      for (const c of nonBreakingChanges) {
        report += `    [OK] ${c.label}: ${c.field}`;
        if (c.oldValue && c.newValue) {
          report += ` (${c.oldValue} -> ${c.newValue})`;
        } else if (c.newValue) {
          report += ` (added: ${c.newValue})`;
        }
        report += '\n';
      }
    }
  }

  // Consumer impact
  if (impact.affectedConsumers.length > 0) {
    report += '\n  -- Affected Consumers --\n';

    for (const consumer of impact.affectedConsumers) {
      const urgency = consumer.requiresUpdate ? '[ACTION REQUIRED]' : '[INFO]';
      report += `  ${urgency} Domain "${consumer.domain}"\n`;
      report += `    Uses: ${consumer.uses.join(', ')}\n`;

      if (consumer.affectedEndpoints.length > 0) {
        report += `    Affected: ${consumer.affectedEndpoints.join(', ')}\n`;
      }

      if (consumer.suggestedFiles.length > 0) {
        report += `    Check files: ${consumer.suggestedFiles.join(', ')}\n`;
      }

      if (consumer.recommendations.length > 0) {
        for (const rec of consumer.recommendations) {
          report += `    - ${rec}\n`;
        }
      }
    }
  }

  // Guidance
  if (impact.hasBreakingChanges) {
    report += '\n  REQUIRED ACTIONS:\n';
    report += '  1. Notify all affected consumer domain teams.\n';
    report += '  2. Update consumer code before deploying this contract change.\n';
    report += '  3. Bump the MAJOR version for breaking changes (semver).\n';
    report += '  4. Add migration guide in contracts/interfaces/MIGRATION.md.\n';
    report += '\n  This change requires approval from affected domain Part Leaders.\n';
  }

  return report;
}

/**
 * Format a new spec creation report.
 *
 * @param {object} spec - Parsed YAML spec
 * @param {object} validation - Validation result from validateSpecStructure
 * @returns {string}
 */
function formatNewSpecReport(spec, validation) {
  let report = `[Interface Contract NEW] Domain "${spec.domain || 'unknown'}"`;
  report += ` v${spec.version || '?'}\n`;

  if (!validation.valid) {
    report += '\n  STRUCTURE ISSUES:\n';
    for (const issue of validation.issues) {
      report += `    - ${issue}\n`;
    }
    report += '\n  Please fix the above issues for a valid interface contract.\n';
  } else {
    const endpoints = spec.endpoints || [];
    const consumers = spec.consumers || [];

    report += `  Endpoints: ${endpoints.length}\n`;
    report += `  Consumers: ${consumers.length}\n`;

    if (endpoints.length > 0) {
      report += '\n  -- Endpoints --\n';
      for (const ep of endpoints) {
        const method = (ep.method || 'GET').toUpperCase();
        report += `    ${method} ${ep.path || '?'}\n`;
        if (ep.response) {
          const fields = Object.keys(ep.response);
          report += `      Response fields: ${fields.join(', ')}\n`;
        }
      }
    }

    if (consumers.length > 0) {
      report += '\n  -- Registered Consumers --\n';
      for (const c of consumers) {
        report += `    Domain "${c.domain}": uses ${(c.uses || []).join(', ')}\n`;
      }
    }

    report += '\n  New interface contract registered successfully.\n';
  }

  return report;
}

/**
 * Format a JSON-structured impact summary (machine-readable).
 *
 * @param {object[]} changes - Detected changes
 * @param {object} impact - Impact analysis
 * @returns {object}
 */
function formatImpactJson(changes, impact) {
  return {
    change: {
      domain: impact.domain,
      version: impact.version,
      types: [...new Set(changes.map(c => c.type))],
      breakingCount: impact.breakingCount,
      details: changes.map(c => ({
        type: c.type,
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
        breaking: c.breaking
      }))
    },
    impact: {
      consumers: impact.affectedConsumers.map(c => ({
        domain: c.domain,
        files: c.suggestedFiles,
        action: c.requiresUpdate
          ? 'Code update required (breaking change)'
          : 'Code update recommended (new field available)',
        affectedEndpoints: c.affectedEndpoints
      })),
      breaking: impact.hasBreakingChanges
    }
  };
}

// ---------------------------------------------------------------------------
// 8. stdin/stdout Helpers (Claude Code Hook Protocol)
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
// 9. Relative Path Resolution
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
// 10. Main Hook Entry Point
// ---------------------------------------------------------------------------

async function main() {
  const input = await readStdin();

  // Extract tool info
  const toolInput = input.tool_input || {};
  const toolResult = input.tool_result || {};

  const filePath = toolInput.file_path || toolInput.path || '';
  const newContent = toolInput.content || toolInput.new_string || '';

  // old_content may come from tool_result (for Edit operations)
  // or from a custom hook context
  const oldContent = toolResult.old_content || toolInput.old_content || '';

  if (!filePath || !newContent) return; // Nothing to validate

  // Convert to project-relative path
  const relativePath = toRelativePath(filePath);

  // Skip files outside project directory
  if (relativePath.startsWith('..')) return;

  // Check if file is an interface contract
  if (!shouldValidate(relativePath)) return;

  // Parse the new spec
  const newSpec = parseSimpleYaml(newContent);

  // If there is old content, compare for changes
  if (oldContent && oldContent.trim()) {
    const oldSpec = parseSimpleYaml(oldContent);

    // Detect changes
    const changes = detectChanges(oldSpec, newSpec);

    if (changes.length === 0) return; // No meaningful changes

    // Analyze impact
    const impact = analyzeImpact(changes, newSpec);

    // Format and output report
    const report = formatImpactReport(impact);
    outputContext(report);
  } else {
    // New spec creation - validate structure
    const validation = validateSpecStructure(newSpec);
    const report = formatNewSpecReport(newSpec, validation);
    outputContext(report);
  }
}

main().catch((err) => { console.error('[interface-validator] Unhandled error:', err.message); });

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VALIDATION_PATTERNS,
    CHANGE_TYPES,
    parseSimpleYaml,
    splitKeyValue,
    parseValue,
    globToRegex,
    matchesAnyPattern,
    shouldValidate,
    extractEndpointFields,
    extractConsumers,
    detectChanges,
    analyzeImpact,
    validateSpecStructure,
    formatImpactReport,
    formatNewSpecReport,
    formatImpactJson,
    toRelativePath
  };
}
