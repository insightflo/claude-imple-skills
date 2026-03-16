#!/usr/bin/env node
/**
 * PostToolUse[Edit|Write] Hook: Cross-Domain Change Notifier
 *
 * Generates notification files when cross-domain changes are detected.
 * Monitors interface contract changes and design system updates, then
 * creates YAML notification files for affected consumer domains.
 *
 * v2.0.0: Agent Messaging Service integration - automatically notifies
 *         relevant agents when cross-domain changes are detected.
 *
 * @TASK P2-T6 - Cross-Domain Notifier Hook
 * @SPEC project-team/hooks/cross-domain-notifier.js
 *
 * Claude Code Hook Protocol (PostToolUse):
 *   - stdin: JSON { tool_name, tool_input: { file_path, content, ... },
 *                    tool_result: { old_content?: string, ... } }
 *   - stdout: JSON { hookSpecificOutput: { additionalContext: string } }
 *
 * PostToolUse hooks cannot block (the tool already executed).
 * Instead, they inject additionalContext to guide the agent toward
 * acknowledging cross-domain impacts and creating proper notifications.
 *
 * Notification Scenarios:
 *   1. Interface contract field addition  -> normal priority to consumers
 *   2. Interface contract field deletion  -> high priority to consumers
 *   3. Interface contract type change     -> high priority to consumers
 *   4. Design token change               -> high priority broadcast
 *   5. Design component change           -> normal priority to related domains
 *
 * Agent Integration (v2.0.0):
 *   - Automatically sends messages to affected agents via messaging service
 *   - Breaking changes trigger immediate agent notification
 *   - Non-breaking changes logged to agent inbox
 */

const path = require('path');
const fs = require('fs').promises;

// v2.0.0: Agent Messaging Service integration
let messagingService = null;
try {
  const messagingPath = path.join(__dirname, '../services/messaging.js');
  if (require('fs').existsSync(messagingPath)) {
    const { AgentMessagingService } = require(messagingPath);
    messagingService = new AgentMessagingService();
  }
} catch (error) {
  // Messaging service unavailable - will use file-based notification fallback
}

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

/**
 * File patterns to monitor for cross-domain changes.
 */
const INTERFACE_PATTERNS = [
  '**/contracts/interfaces/**/*.yaml',
  '**/contracts/interfaces/**/*.yml'
];

const DESIGN_PATTERNS = [
  '**/contracts/standards/design-system.md'
];

/**
 * All monitored patterns combined.
 */
const ALL_PATTERNS = [...INTERFACE_PATTERNS, ...DESIGN_PATTERNS];

/**
 * Notification priority levels.
 */
const PRIORITY = {
  HIGH: 'high',
  NORMAL: 'normal'
};

/**
 * Change type definitions with their notification properties.
 */
const NOTIFICATION_TYPES = {
  // Interface changes
  field_add: {
    type: 'interface_change',
    subtype: 'field_add',
    priority: PRIORITY.NORMAL,
    breaking: false,
    actionTemplate: 'New field available. Update code if needed.',
    deadlineRequired: false
  },
  field_remove: {
    type: 'interface_change',
    subtype: 'field_remove',
    priority: PRIORITY.HIGH,
    breaking: true,
    actionTemplate: 'Field removed. Code update required before deployment.',
    deadlineRequired: true
  },
  field_type_change: {
    type: 'interface_change',
    subtype: 'field_type_change',
    priority: PRIORITY.HIGH,
    breaking: true,
    actionTemplate: 'Field type changed. Code update required before deployment.',
    deadlineRequired: true
  },
  endpoint_add: {
    type: 'interface_change',
    subtype: 'endpoint_add',
    priority: PRIORITY.NORMAL,
    breaking: false,
    actionTemplate: 'New endpoint available for consumption.',
    deadlineRequired: false
  },
  endpoint_remove: {
    type: 'interface_change',
    subtype: 'endpoint_remove',
    priority: PRIORITY.HIGH,
    breaking: true,
    actionTemplate: 'Endpoint removed. Migration required before deployment.',
    deadlineRequired: true
  },
  endpoint_method_change: {
    type: 'interface_change',
    subtype: 'endpoint_method_change',
    priority: PRIORITY.HIGH,
    breaking: true,
    actionTemplate: 'Endpoint method changed. Code update required.',
    deadlineRequired: true
  },
  version_bump: {
    type: 'interface_change',
    subtype: 'version_bump',
    priority: PRIORITY.NORMAL,
    breaking: false,
    actionTemplate: 'Contract version updated. Review changelog.',
    deadlineRequired: false
  },

  // Design changes
  design_token_change: {
    type: 'design_change',
    subtype: 'token_change',
    priority: PRIORITY.HIGH,
    breaking: true,
    actionTemplate: 'Design token changed. UI update required.',
    deadlineRequired: true
  },
  design_component_change: {
    type: 'design_change',
    subtype: 'component_change',
    priority: PRIORITY.NORMAL,
    breaking: false,
    actionTemplate: 'Design component updated. Review and update if needed.',
    deadlineRequired: false
  }
};

// ---------------------------------------------------------------------------
// 2. Simple YAML Parser (shared pattern with interface-validator)
// ---------------------------------------------------------------------------

/**
 * Parse a simplified YAML string into a JavaScript object.
 * Handles key-value pairs, nested objects, and arrays.
 *
 * @param {string} yamlString - YAML content
 * @returns {object} Parsed object
 */
function parseSimpleYaml(yamlString) {
  if (!yamlString || typeof yamlString !== 'string') return {};

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

function parseBlock(lines, start, end, parentIndent) {
  const result = {};
  let i = start;

  while (i < end) {
    const line = lines[i];
    if (line.indent <= parentIndent && parentIndent >= 0) break;

    if (line.trimmed.startsWith('- ')) { i++; continue; }

    if (line.trimmed.includes(':')) {
      const { key, value } = splitKeyValue(line.trimmed);
      if (!key) { i++; continue; }

      if (value !== '' && value !== undefined) {
        result[key] = parseValue(value);
        i++;
      } else {
        const childIndent = findChildIndent(lines, i + 1, end);
        if (childIndent === -1) {
          result[key] = null;
          i++;
        } else {
          const childEnd = findBlockEnd(lines, i + 1, end, childIndent);
          const firstChild = (i + 1 < childEnd) ? i + 1 : -1;
          if (firstChild !== -1 && lines[firstChild].trimmed.startsWith('- ')) {
            result[key] = parseArray(lines, i + 1, childEnd, line.indent);
          } else {
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

function parseArray(lines, start, end, parentIndent) {
  const result = [];
  let i = start;

  while (i < end) {
    const line = lines[i];
    if (!line.trimmed.startsWith('- ')) { i++; continue; }

    const dashIndent = line.indent;
    const content = line.trimmed.substring(2).trim();

    if (!content.includes(':')) {
      result.push(parseValue(content));
      i++;
    } else {
      const itemObj = parseInlineKeyValue(content);
      const itemContentIndent = dashIndent + 2;
      let itemEnd = i + 1;
      while (itemEnd < end) {
        const nextLine = lines[itemEnd];
        if (nextLine.trimmed.startsWith('- ') && nextLine.indent <= dashIndent) break;
        if (nextLine.indent <= dashIndent && !nextLine.trimmed.startsWith('- ')) break;
        itemEnd++;
      }
      parseArrayItemContent(lines, i + 1, itemEnd, itemContentIndent, itemObj);
      result.push(itemObj);
      i = itemEnd;
    }
  }
  return result;
}

function parseArrayItemContent(lines, start, end, baseIndent, target) {
  let i = start;
  while (i < end) {
    const line = lines[i];
    if (!line.trimmed.includes(':')) { i++; continue; }
    const { key, value } = splitKeyValue(line.trimmed);
    if (!key) { i++; continue; }
    if (value !== '' && value !== undefined) {
      target[key] = parseValue(value);
      i++;
    } else {
      const childIndent = findChildIndent(lines, i + 1, end);
      if (childIndent === -1) {
        target[key] = null;
        i++;
      } else {
        const childEnd = findBlockEnd(lines, i + 1, end, childIndent);
        const firstChild = (i + 1 < childEnd) ? i + 1 : -1;
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

function findChildIndent(lines, start, end) {
  if (start < end) return lines[start].indent;
  return -1;
}

function findBlockEnd(lines, start, end, blockIndent) {
  for (let i = start; i < end; i++) {
    if (lines[i].indent < blockIndent) return i;
  }
  return end;
}

function splitKeyValue(str) {
  const colonIndex = str.indexOf(':');
  if (colonIndex === -1) return { key: null, value: null };
  const key = str.substring(0, colonIndex).trim();
  const value = str.substring(colonIndex + 1).trim();
  return { key, value };
}

function parseInlineKeyValue(str) {
  const { key, value } = splitKeyValue(str);
  if (!key) return {};
  const obj = {};
  obj[key] = parseValue(value);
  return obj;
}

function parseValue(value) {
  if (value === undefined || value === null) return '';
  const trimmed = String(value).trim();
  if (trimmed === '' || trimmed === '~' || trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1);
    return inner.split(',').map(s => parseValue(s.trim()));
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
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
 * Determine the change category for a file path.
 * @param {string} relativePath
 * @returns {'interface'|'design'|null}
 */
function classifyFile(relativePath) {
  if (matchesAnyPattern(relativePath, INTERFACE_PATTERNS)) return 'interface';
  if (matchesAnyPattern(relativePath, DESIGN_PATTERNS)) return 'design';
  return null;
}

// ---------------------------------------------------------------------------
// 4. Interface Change Detection (reuses interface-validator patterns)
// ---------------------------------------------------------------------------

/**
 * Extract endpoint fields from a parsed spec.
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

    fields.set(key, '__endpoint__');

    const response = ep.response || {};
    for (const [fieldName, fieldType] of Object.entries(response)) {
      fields.set(`${key}.${fieldName}`, String(fieldType));
    }

    const request = ep.request || {};
    for (const [fieldName, fieldType] of Object.entries(request)) {
      fields.set(`${key}.request.${fieldName}`, String(fieldType));
    }
  }
  return fields;
}

/**
 * Extract consumer domains from a parsed spec.
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
 * Detect changes between old and new interface specs.
 * @param {object} oldSpec - Previous parsed spec
 * @param {object} newSpec - New parsed spec
 * @returns {object[]} Array of detected changes
 */
function detectInterfaceChanges(oldSpec, newSpec) {
  const changes = [];

  // Version change
  if (oldSpec.version !== undefined && newSpec.version !== undefined
      && String(oldSpec.version) !== String(newSpec.version)) {
    changes.push({
      changeType: 'version_bump',
      field: 'version',
      oldValue: String(oldSpec.version),
      newValue: String(newSpec.version)
    });
  }

  // Endpoint & field changes
  const oldFields = extractEndpointFields(oldSpec);
  const newFields = extractEndpointFields(newSpec);

  for (const [key, oldType] of oldFields) {
    if (!newFields.has(key)) {
      if (oldType === '__endpoint__') {
        changes.push({
          changeType: 'endpoint_remove',
          field: key,
          oldValue: key,
          newValue: null
        });
      } else {
        changes.push({
          changeType: 'field_remove',
          field: key,
          oldValue: oldType,
          newValue: null
        });
      }
    }
  }

  for (const [key, newType] of newFields) {
    if (!oldFields.has(key)) {
      if (newType === '__endpoint__') {
        changes.push({
          changeType: 'endpoint_add',
          field: key,
          oldValue: null,
          newValue: key
        });
      } else {
        changes.push({
          changeType: 'field_add',
          field: key,
          oldValue: null,
          newValue: newType
        });
      }
    } else if (newType !== '__endpoint__') {
      const oldType = oldFields.get(key);
      if (oldType !== '__endpoint__' && oldType !== newType) {
        changes.push({
          changeType: 'field_type_change',
          field: key,
          oldValue: oldType,
          newValue: newType
        });
      }
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// 5. Design System Change Detection
// ---------------------------------------------------------------------------

/**
 * Design token pattern matchers.
 * Detects tokens like: --color-primary: #xxx, --font-size-lg: 1.25rem, etc.
 */
const DESIGN_TOKEN_PATTERNS = {
  color: /--color-([a-zA-Z0-9-]+)\s*[:=]\s*([^\n;]+)/g,
  font: /--font-([a-zA-Z0-9-]+)\s*[:=]\s*([^\n;]+)/g,
  space: /--space-([a-zA-Z0-9-]+)\s*[:=]\s*([^\n;]+)/g,
  radius: /--radius-([a-zA-Z0-9-]+)\s*[:=]\s*([^\n;]+)/g,
  shadow: /--shadow-([a-zA-Z0-9-]+)\s*[:=]\s*([^\n;]+)/g
};

/**
 * Design component section pattern.
 * Detects markdown sections like: ## Button, ## Card, ## Modal
 * Only captures the heading text (no trailing whitespace/newlines).
 */
const COMPONENT_SECTION_PATTERN = /^##\s+([A-Z][a-zA-Z0-9 ]*[a-zA-Z0-9])/gm;

/**
 * Extract design tokens from content.
 * @param {string} content - Design system file content
 * @returns {Map<string, string>} token name -> value
 */
function extractDesignTokens(content) {
  const tokens = new Map();
  if (!content || typeof content !== 'string') return tokens;

  for (const [category, pattern] of Object.entries(DESIGN_TOKEN_PATTERNS)) {
    // Reset lastIndex for each pattern
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const tokenName = `--${category}-${match[1]}`;
      const tokenValue = match[2].trim();
      tokens.set(tokenName, tokenValue);
    }
  }

  return tokens;
}

/**
 * Extract component section names from design system markdown.
 * @param {string} content - Design system markdown content
 * @returns {Set<string>} component names
 */
function extractComponentSections(content) {
  const components = new Set();
  if (!content || typeof content !== 'string') return components;

  const regex = new RegExp(COMPONENT_SECTION_PATTERN.source, COMPONENT_SECTION_PATTERN.flags);
  let match;
  while ((match = regex.exec(content)) !== null) {
    components.add(match[1].trim());
  }

  return components;
}

/**
 * Detect changes in design system content.
 * @param {string} oldContent - Previous content
 * @param {string} newContent - New content
 * @returns {object[]} Array of detected design changes
 */
function detectDesignChanges(oldContent, newContent) {
  const changes = [];

  // Token changes
  const oldTokens = extractDesignTokens(oldContent);
  const newTokens = extractDesignTokens(newContent);

  for (const [name, oldValue] of oldTokens) {
    if (!newTokens.has(name)) {
      changes.push({
        changeType: 'design_token_change',
        field: name,
        oldValue: oldValue,
        newValue: null,
        detail: 'token_removed'
      });
    } else if (newTokens.get(name) !== oldValue) {
      changes.push({
        changeType: 'design_token_change',
        field: name,
        oldValue: oldValue,
        newValue: newTokens.get(name),
        detail: 'token_modified'
      });
    }
  }

  for (const [name, newValue] of newTokens) {
    if (!oldTokens.has(name)) {
      changes.push({
        changeType: 'design_token_change',
        field: name,
        oldValue: null,
        newValue: newValue,
        detail: 'token_added'
      });
    }
  }

  // Component section changes
  const oldComponents = extractComponentSections(oldContent);
  const newComponents = extractComponentSections(newContent);

  for (const comp of oldComponents) {
    if (!newComponents.has(comp)) {
      changes.push({
        changeType: 'design_component_change',
        field: comp,
        oldValue: comp,
        newValue: null,
        detail: 'component_removed'
      });
    }
  }

  for (const comp of newComponents) {
    if (!oldComponents.has(comp)) {
      changes.push({
        changeType: 'design_component_change',
        field: comp,
        oldValue: null,
        newValue: comp,
        detail: 'component_added'
      });
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// 6. Affected Domain Identification
// ---------------------------------------------------------------------------

/**
 * Identify domains affected by interface changes.
 * @param {object[]} changes - Detected interface changes
 * @param {object} spec - The new/current spec (for consumer info)
 * @returns {object[]} Array of { domain, reason, affectedFields }
 */
function identifyAffectedDomains(changes, spec) {
  const consumers = extractConsumers(spec);
  const affected = [];
  const sourceDomain = spec.domain || 'unknown';

  for (const [consumerDomain, consumerInfo] of consumers) {
    const usedEndpoints = consumerInfo.uses || [];
    const affectedFields = [];

    for (const change of changes) {
      for (const used of usedEndpoints) {
        if (change.field.startsWith(used) || change.field === used) {
          affectedFields.push(change);
        }
      }
    }

    // For breaking changes, notify all consumers even without exact match
    const hasBreaking = changes.some(c => {
      const typeDef = NOTIFICATION_TYPES[c.changeType];
      return typeDef && typeDef.breaking;
    });

    if (affectedFields.length > 0 || hasBreaking) {
      affected.push({
        domain: consumerDomain,
        sourceDomain,
        reason: affectedFields.length > 0
          ? `Uses endpoints affected by changes`
          : `Breaking change in consumed interface`,
        affectedFields: affectedFields.map(f => f.field),
        requiresUpdate: hasBreaking
      });
    }
  }

  return affected;
}

/**
 * Identify domains affected by design system changes.
 * Returns a broadcast target list (all frontend-related roles).
 * @param {object[]} changes - Detected design changes
 * @returns {object[]} Array of { target, roles, reason }
 */
function identifyDesignAffectedTargets(changes) {
  const targets = [];

  const tokenChanges = changes.filter(c => c.changeType === 'design_token_change');
  const componentChanges = changes.filter(c => c.changeType === 'design_component_change');

  if (tokenChanges.length > 0) {
    targets.push({
      target: 'broadcast',
      roles: ['domain-designer', 'frontend-developer'],
      reason: `Design token(s) changed: ${tokenChanges.map(c => c.field).join(', ')}`,
      requiresUpdate: true
    });
  }

  if (componentChanges.length > 0) {
    targets.push({
      target: 'broadcast',
      roles: ['domain-designer', 'frontend-developer'],
      reason: `Design component(s) changed: ${componentChanges.map(c => c.field).join(', ')}`,
      requiresUpdate: componentChanges.some(c => c.detail === 'component_removed')
    });
  }

  return targets;
}

// ---------------------------------------------------------------------------
// 7. Notification Generation
// ---------------------------------------------------------------------------

/**
 * Generate a notification YAML string.
 * @param {object} params - Notification parameters
 * @returns {string} YAML-formatted notification
 */
function generateNotificationYaml(params) {
  const {
    type,
    from,
    to,
    priority,
    created,
    file: changedFile,
    changeType,
    field,
    breaking,
    description,
    deadline,
    details
  } = params;

  let yaml = '';
  yaml += `type: ${type}\n`;
  yaml += `from: ${from}\n`;
  yaml += `to: ${to}\n`;
  yaml += `priority: ${priority}\n`;
  yaml += `created: ${created}\n`;
  yaml += '\n';
  yaml += 'change:\n';
  yaml += `  file: ${changedFile}\n`;
  yaml += `  type: ${changeType}\n`;

  if (field) {
    yaml += `  field: ${field}\n`;
  }

  yaml += `  breaking: ${breaking}\n`;

  if (details) {
    yaml += '  details:\n';
    for (const detail of details) {
      yaml += `    - field: ${detail.field}\n`;
      if (detail.oldValue !== null && detail.oldValue !== undefined) {
        yaml += `      old_value: ${detail.oldValue}\n`;
      }
      if (detail.newValue !== null && detail.newValue !== undefined) {
        yaml += `      new_value: ${detail.newValue}\n`;
      }
    }
  }

  yaml += '\n';
  yaml += 'action_required:\n';
  yaml += `  description: "${description}"\n`;

  if (deadline) {
    yaml += `  deadline: ${deadline}\n`;
  } else {
    yaml += '  deadline: null\n';
  }

  yaml += '\n';
  yaml += 'acknowledged: false\n';

  return yaml;
}

/**
 * Generate a notification file path.
 * @param {string} sourceDomain - Domain that made the change
 * @param {string} targetDomain - Domain to notify (or 'broadcast')
 * @param {string} changeType - Type of change
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @returns {string} Notification file path
 */
function generateNotificationPath(sourceDomain, targetDomain, changeType, dateStr) {
  const targetDir = targetDomain === 'broadcast'
    ? 'management/notifications/broadcast'
    : `management/notifications/to-${targetDomain}`;

  const fileName = `${dateStr}-${sourceDomain}-${changeType}.yaml`;
  return `${targetDir}/${fileName}`;
}

/**
 * Build complete notification entries from detected changes.
 * @param {object} params
 * @param {string} params.category - 'interface' or 'design'
 * @param {object[]} params.changes - Detected changes
 * @param {string} params.filePath - Changed file path
 * @param {object} [params.spec] - Parsed interface spec (for interface changes)
 * @param {string} [params.timestamp] - ISO timestamp (defaults to now)
 * @returns {object[]} Array of { path, content, notification }
 */
function buildNotifications(params) {
  const {
    category,
    changes,
    filePath,
    spec,
    timestamp
  } = params;

  const now = timestamp || new Date().toISOString();
  const dateStr = now.substring(0, 10);
  const notifications = [];

  if (category === 'interface' && spec) {
    const sourceDomain = spec.domain || 'unknown';
    const affectedDomains = identifyAffectedDomains(changes, spec);

    // Determine highest priority among changes
    const hasBreaking = changes.some(c => {
      const typeDef = NOTIFICATION_TYPES[c.changeType];
      return typeDef && typeDef.breaking;
    });
    const priority = hasBreaking ? PRIORITY.HIGH : PRIORITY.NORMAL;

    // Group changes by type for summary
    const changesByType = {};
    for (const change of changes) {
      if (!changesByType[change.changeType]) {
        changesByType[change.changeType] = [];
      }
      changesByType[change.changeType].push(change);
    }

    // Create a notification for each affected domain
    for (const affected of affectedDomains) {
      const primaryChange = changes[0];
      const typeDef = NOTIFICATION_TYPES[primaryChange.changeType] || NOTIFICATION_TYPES.field_add;

      const description = buildInterfaceDescription(changes, sourceDomain);

      const notifPath = generateNotificationPath(
        sourceDomain, affected.domain, summarizeChangeType(changes), dateStr
      );

      const content = generateNotificationYaml({
        type: 'interface_change',
        from: sourceDomain,
        to: affected.domain,
        priority,
        created: now,
        file: filePath,
        changeType: summarizeChangeType(changes),
        field: changes.length === 1 ? changes[0].field : null,
        breaking: hasBreaking,
        description,
        deadline: hasBreaking ? `${dateStr}T23:59:59Z` : null,
        details: changes.map(c => ({
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue
        }))
      });

      notifications.push({
        path: notifPath,
        content,
        notification: {
          from: sourceDomain,
          to: affected.domain,
          priority,
          breaking: hasBreaking,
          changeCount: changes.length
        }
      });
    }
  } else if (category === 'design') {
    const targets = identifyDesignAffectedTargets(changes);

    for (const target of targets) {
      const hasBreaking = target.requiresUpdate;
      const priority = hasBreaking ? PRIORITY.HIGH : PRIORITY.NORMAL;

      const description = buildDesignDescription(changes);

      const notifPath = generateNotificationPath(
        'design-system', target.target, summarizeDesignChangeType(changes), dateStr
      );

      const content = generateNotificationYaml({
        type: 'design_change',
        from: 'design-system',
        to: target.target,
        priority,
        created: now,
        file: filePath,
        changeType: summarizeDesignChangeType(changes),
        field: null,
        breaking: hasBreaking,
        description,
        deadline: hasBreaking ? `${dateStr}T23:59:59Z` : null,
        details: changes.map(c => ({
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue
        }))
      });

      notifications.push({
        path: notifPath,
        content,
        notification: {
          from: 'design-system',
          to: target.target,
          roles: target.roles,
          priority,
          breaking: hasBreaking,
          changeCount: changes.length
        }
      });
    }
  }

  return notifications;
}

// ---------------------------------------------------------------------------
// 8. Description Builders
// ---------------------------------------------------------------------------

/**
 * Build a human-readable description for interface changes.
 * @param {object[]} changes
 * @param {string} sourceDomain
 * @returns {string}
 */
function buildInterfaceDescription(changes, sourceDomain) {
  if (changes.length === 1) {
    const c = changes[0];
    const typeDef = NOTIFICATION_TYPES[c.changeType];
    if (typeDef) {
      return `${sourceDomain} interface: ${typeDef.actionTemplate} [${c.field}]`;
    }
    return `${sourceDomain} interface changed: ${c.field}`;
  }

  const breakingCount = changes.filter(c => {
    const typeDef = NOTIFICATION_TYPES[c.changeType];
    return typeDef && typeDef.breaking;
  }).length;

  const nonBreakingCount = changes.length - breakingCount;
  const parts = [];
  if (breakingCount > 0) parts.push(`${breakingCount} breaking`);
  if (nonBreakingCount > 0) parts.push(`${nonBreakingCount} non-breaking`);

  return `${sourceDomain} interface: ${changes.length} changes (${parts.join(', ')}). Review required.`;
}

/**
 * Build a human-readable description for design changes.
 * @param {object[]} changes
 * @returns {string}
 */
function buildDesignDescription(changes) {
  const tokenChanges = changes.filter(c => c.changeType === 'design_token_change');
  const componentChanges = changes.filter(c => c.changeType === 'design_component_change');

  const parts = [];
  if (tokenChanges.length > 0) {
    const modified = tokenChanges.filter(c => c.detail === 'token_modified');
    const added = tokenChanges.filter(c => c.detail === 'token_added');
    const removed = tokenChanges.filter(c => c.detail === 'token_removed');

    if (modified.length > 0) parts.push(`${modified.length} token(s) modified`);
    if (added.length > 0) parts.push(`${added.length} token(s) added`);
    if (removed.length > 0) parts.push(`${removed.length} token(s) removed`);
  }

  if (componentChanges.length > 0) {
    const added = componentChanges.filter(c => c.detail === 'component_added');
    const removed = componentChanges.filter(c => c.detail === 'component_removed');

    if (added.length > 0) parts.push(`${added.length} component(s) added`);
    if (removed.length > 0) parts.push(`${removed.length} component(s) removed`);
  }

  return `Design system updated: ${parts.join(', ')}. UI review required.`;
}

/**
 * Summarize change types into a single label for file naming.
 * @param {object[]} changes
 * @returns {string}
 */
function summarizeChangeType(changes) {
  const types = new Set(changes.map(c => c.changeType));

  if (types.has('field_remove') || types.has('endpoint_remove') || types.has('field_type_change')) {
    return 'breaking-change';
  }
  if (types.has('field_add') || types.has('endpoint_add')) {
    return 'spec-update';
  }
  if (types.has('version_bump')) {
    return 'version-bump';
  }
  return 'change';
}

/**
 * Summarize design change types for file naming.
 * @param {object[]} changes
 * @returns {string}
 */
function summarizeDesignChangeType(changes) {
  const hasTokenChange = changes.some(c => c.changeType === 'design_token_change');
  const hasComponentChange = changes.some(c => c.changeType === 'design_component_change');

  if (hasTokenChange && hasComponentChange) return 'design-update';
  if (hasTokenChange) return 'token-change';
  if (hasComponentChange) return 'component-change';
  return 'design-change';
}

// ---------------------------------------------------------------------------
// 9. Report Formatting
// ---------------------------------------------------------------------------

/**
 * Format a notification summary report for additionalContext output.
 * @param {object[]} notifications - Built notification entries
 * @param {string} category - 'interface' or 'design'
 * @returns {string}
 */
function formatNotificationReport(notifications, category) {
  if (notifications.length === 0) return '';

  let report = '';

  if (category === 'interface') {
    const hasBreaking = notifications.some(n => n.notification.breaking);
    const severity = hasBreaking ? 'BREAKING CHANGE' : 'SPEC UPDATE';
    report += `[Cross-Domain Notification: ${severity}]\n`;
    report += `  ${notifications.length} domain(s) notified:\n\n`;

    for (const n of notifications) {
      const urgency = n.notification.breaking ? '[HIGH]' : '[NORMAL]';
      report += `  ${urgency} ${n.notification.from} -> ${n.notification.to}\n`;
      report += `    File: ${n.path}\n`;
      report += `    Changes: ${n.notification.changeCount}\n`;
    }

    if (hasBreaking) {
      report += '\n  ACTION REQUIRED:\n';
      report += '  - Notify affected domain teams about breaking changes.\n';
      report += '  - Consumer code must be updated before deployment.\n';
      report += '  - Notification files created in management/notifications/.\n';
    } else {
      report += '\n  INFO:\n';
      report += '  - Non-breaking changes. Consumer teams informed.\n';
      report += '  - Notification files created in management/notifications/.\n';
    }
  } else if (category === 'design') {
    const hasBreaking = notifications.some(n => n.notification.breaking);
    report += `[Cross-Domain Notification: DESIGN ${hasBreaking ? 'BREAKING' : 'UPDATE'}]\n`;
    report += `  ${notifications.length} broadcast notification(s) created:\n\n`;

    for (const n of notifications) {
      const urgency = n.notification.breaking ? '[HIGH]' : '[NORMAL]';
      report += `  ${urgency} design-system -> ${n.notification.to}\n`;
      report += `    Roles: ${(n.notification.roles || []).join(', ')}\n`;
      report += `    File: ${n.path}\n`;
      report += `    Changes: ${n.notification.changeCount}\n`;
    }

    if (hasBreaking) {
      report += '\n  ACTION REQUIRED:\n';
      report += '  - All domain-designers and frontend-developers must review.\n';
      report += '  - UI components may need updating.\n';
    } else {
      report += '\n  INFO:\n';
      report += '  - Design system updated. Teams informed via broadcast.\n';
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// 10. stdin/stdout Helpers (Claude Code Hook Protocol)
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
// 11. Relative Path Resolution
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
// 12. Agent Messaging Integration (v2.0.0)
// ---------------------------------------------------------------------------

/**
 * Map domain names to agent IDs.
 * @param {string} domain - Domain name
 * @returns {string[]} Agent IDs for the domain
 */
function getAgentsForDomain(domain) {
  const domainAgentMap = {
    'backend': ['backend-specialist', 'dba'],
    'frontend': ['frontend-specialist', 'chief-designer'],
    'api': ['backend-specialist', 'frontend-specialist'],
    'security': ['security-specialist'],
    'all': ['project-manager', 'chief-architect', 'qa-manager',
             'security-specialist', 'backend-specialist', 'frontend-specialist']
  };

  return domainAgentMap[domain] || [`${domain}-specialist`];
}

/**
 * Send agent notification for cross-domain changes.
 * v2.0.0: Uses Agent Messaging Service when available, falls back to file-based notification.
 *
 * @param {object[]} notifications - Built notification entries
 * @param {string} category - 'interface' or 'design'
 * @returns {Promise<object[]>} Results of agent notifications
 */
async function notifyAgents(notifications, category) {
  const results = [];

  // Use messaging service if available (v2.0.0 integration)
  if (messagingService) {
    for (const notif of notifications) {
      try {
        const targetAgents = notif.notification.to === 'broadcast'
          ? getAgentsForDomain('all')
          : getAgentsForDomain(notif.notification.to);

        // Use broadcastDomainChange for breaking changes
        if (notif.notification.breaking) {
          const change = {
            type: category,
            from: notif.notification.from,
            breaking: true,
            changeCount: notif.notification.changeCount,
            description: notif.content,
            timestamp: new Date().toISOString()
          };

          const affectedDomains = notif.notification.to === 'broadcast'
            ? ['all']
            : [notif.notification.to];

          await messagingService.broadcastDomainChange(change, affectedDomains);

          for (const agentId of targetAgents) {
            results.push({ agentId, status: 'delivered', method: 'messaging-service' });
          }
        } else {
          // Use notifyAgent for non-breaking changes
          for (const agentId of targetAgents) {
            try {
              await messagingService.notifyAgent(agentId, {
                type: 'cross-domain-notification',
                category,
                breaking: false,
                content: notif.content,
                notificationFile: notif.path,
                timestamp: new Date().toISOString()
              });
              results.push({ agentId, status: 'delivered', method: 'messaging-service' });
            } catch (error) {
              results.push({ agentId, status: 'failed', error: error.message, method: 'messaging-service' });
            }
          }
        }
      } catch (error) {
        // Fallback to file-based notification on error
        await notifyAgentsViaFiles(notifications, category, results);
        break;
      }
    }
    return results;
  }

  // Fallback: File-based notification (legacy behavior)
  return notifyAgentsViaFiles(notifications, category, results);
}

/**
 * Fallback file-based notification when messaging service is unavailable.
 * @param {object[]} notifications - Built notification entries
 * @param {string} category - 'interface' or 'design'
 * @param {object[]} results - Results array to append to
 * @returns {Promise<object[]>} Results of agent notifications
 */
async function notifyAgentsViaFiles(notifications, category, results = []) {
  for (const notif of notifications) {
    const targetAgents = notif.notification.to === 'broadcast'
      ? getAgentsForDomain('all')
      : getAgentsForDomain(notif.notification.to);

    for (const agentId of targetAgents) {
      try {
        // Create agent inbox directory
        const inboxDir = `management/inbox/${agentId}`;
        await fs.mkdir(inboxDir, { recursive: true });

        // Create message file
        const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const messageFile = `${inboxDir}/${messageId}.json`;

        const message = {
          id: messageId,
          type: 'cross-domain-notification',
          timestamp: new Date().toISOString(),
          from: notif.notification.from,
          to: agentId,
          subject: `Cross-Domain ${category === 'interface' ? 'Interface' : 'Design'} Change`,
          priority: notif.notification.priority,
          content: {
            category,
            breaking: notif.notification.breaking,
            changeCount: notif.notification.changeCount,
            notificationFile: notif.path,
            description: notif.content
          },
          actionRequired: notif.notification.breaking,
          protocol: 'broadcast'
        };

        await fs.writeFile(messageFile, JSON.stringify(message, null, 2), 'utf-8');

        results.push({
          agentId,
          status: 'delivered',
          messageId,
          method: 'file-based'
        });
      } catch (error) {
        results.push({
          agentId,
          status: 'failed',
          error: error.message,
          method: 'file-based'
        });
      }
    }
  }

  return results;
}

/**
 * Format agent notification report for additionalContext.
 * @param {object[]} agentResults - Results from notifyAgents
 * @returns {string} Formatted report
 */
function formatAgentNotificationReport(agentResults) {
  if (agentResults.length === 0) return '';

  const delivered = agentResults.filter(r => r.status === 'delivered').length;
  const failed = agentResults.filter(r => r.status === 'failed').length;

  let report = '\n[Agent Messaging Service]\n';
  report += `  Notified ${delivered} agent(s)`;

  if (failed > 0) {
    report += ` (${failed} failed)`;
  }

  report += '\n';

  // List notified agents
  const notifiedAgents = [...new Set(agentResults.filter(r => r.status === 'delivered').map(r => r.agentId))];
  if (notifiedAgents.length > 0) {
    report += '  Agents: ' + notifiedAgents.join(', ') + '\n';
  }

  return report;
}

// ---------------------------------------------------------------------------
// 13. Main Hook Entry Point
// ---------------------------------------------------------------------------

async function main() {
  const input = await readStdin();

  // Extract tool info
  const toolInput = input.tool_input || {};
  const toolResult = input.tool_result || {};

  const filePath = toolInput.file_path || toolInput.path || '';
  const newContent = toolInput.content || toolInput.new_string || '';
  const oldContent = toolResult.old_content || toolInput.old_content || '';

  if (!filePath || !newContent) return;

  // Convert to project-relative path
  const relativePath = toRelativePath(filePath);
  if (relativePath.startsWith('..')) return;

  // Classify the file
  const category = classifyFile(relativePath);
  if (!category) return;

  // No old content means new file creation - no cross-domain notification needed
  // (handled by interface-validator for new specs)
  if (!oldContent || !oldContent.trim()) return;

  let changes = [];
  let spec = null;

  if (category === 'interface') {
    spec = parseSimpleYaml(newContent);
    const oldSpec = parseSimpleYaml(oldContent);
    changes = detectInterfaceChanges(oldSpec, spec);
  } else if (category === 'design') {
    changes = detectDesignChanges(oldContent, newContent);
  }

  if (changes.length === 0) return;

  // Build notifications
  const notifications = buildNotifications({
    category,
    changes,
    filePath: relativePath,
    spec,
    timestamp: new Date().toISOString()
  });

  if (notifications.length === 0) return;

  // v2.0.0: Notify agents about cross-domain changes
  let agentReport = '';
  try {
    const agentResults = await notifyAgents(notifications, category);
    agentReport = formatAgentNotificationReport(agentResults);
  } catch (error) {
    // Agent notification failure should not break the hook
    agentReport = '\n[Agent Messaging Service] Notification skipped (service unavailable)';
  }

  // Format and output report
  const report = formatNotificationReport(notifications, category);
  if (report || agentReport) {
    outputContext(report + agentReport);
  }
}

main().catch((err) => { console.error('[cross-domain-notifier] Unhandled error:', err.message); });

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    INTERFACE_PATTERNS,
    DESIGN_PATTERNS,
    ALL_PATTERNS,
    PRIORITY,
    NOTIFICATION_TYPES,
    parseSimpleYaml,
    splitKeyValue,
    parseValue,
    globToRegex,
    matchesAnyPattern,
    classifyFile,
    extractEndpointFields,
    extractConsumers,
    detectInterfaceChanges,
    extractDesignTokens,
    extractComponentSections,
    detectDesignChanges,
    identifyAffectedDomains,
    identifyDesignAffectedTargets,
    generateNotificationYaml,
    generateNotificationPath,
    buildNotifications,
    buildInterfaceDescription,
    buildDesignDescription,
    summarizeChangeType,
    summarizeDesignChangeType,
    formatNotificationReport,
    // v2.0.0 Agent Messaging Integration
    getAgentsForDomain,
    notifyAgents,
    formatAgentNotificationReport,
    toRelativePath
  };
}
