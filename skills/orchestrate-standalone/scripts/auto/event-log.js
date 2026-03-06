#!/usr/bin/env node
/**
 * [파일 목적] append-only event log for auto mode
 * [주요 흐름] append → read → filter
 * [외부 연결] auto-state.json derives summary from these events
 * [수정시 주의] append-only 보장 필수, 동시 쓰기 안전
 *
 * Event Log for Orchestrate Standalone
 *
 * Manages auto-events.jsonl for autonomous orchestrator event history
 *
 * @TASK orchestrate-standalone
 * @SPEC SKILL.md
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Event Log Operations
// ---------------------------------------------------------------------------

const EVENT_LOG_FILE = '.claude/orchestrate/auto-events.jsonl';
const BACKUP_DIR = '.claude/backups';
const EVENT_TYPES = new Set([
  'define',
  'decompose',
  'plan',
  'execute',
  'assess',
  'adjust',
  'human_edit',
  'contract_change',
  'task_add',
  'task_complete',
  'task_fail',
  'budget_check'
]);

/**
 * Get event log path
 */
function getEventLogPath(projectDir = process.cwd()) {
  return path.join(projectDir, EVENT_LOG_FILE);
}

/**
 * Validate event type
 */
function validateEventType(type) {
  if (typeof type !== 'string' || type.trim() === '') {
    throw new Error('Event type must be a non-empty string');
  }

  if (!EVENT_TYPES.has(type)) {
    throw new Error(`Invalid event type: ${type}`);
  }
}

/**
 * Validate event data
 */
function validateEventData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Event data must be an object');
  }
}

/**
 * Append a single event to the JSONL log
 */
function appendEvent(type, data, projectDir = process.cwd()) {
  validateEventType(type);
  validateEventData(data);

  const logPath = getEventLogPath(projectDir);
  const event = {
    ts: new Date().toISOString(),
    type,
    data
  };

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`, 'utf8');
  } catch (error) {
    throw new Error(`Failed to append event: ${error.message}`);
  }

  return event;
}

/**
 * Read all events from the JSONL log
 */
function readEvents(projectDir = process.cwd()) {
  const logPath = getEventLogPath(projectDir);

  if (!fs.existsSync(logPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(logPath, 'utf8');

    if (content.trim() === '') {
      return [];
    }

    return content
      .split('\n')
      .filter(line => line.trim() !== '')
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`);
        }
      });
  } catch (error) {
    throw new Error(`Failed to read events: ${error.message}`);
  }
}

/**
 * Get events by type
 */
function getEventsByType(type, projectDir = process.cwd()) {
  validateEventType(type);
  return readEvents(projectDir).filter(event => event.type === type);
}

/**
 * Backup and clear event log
 */
function clearEvents(projectDir = process.cwd()) {
  const logPath = getEventLogPath(projectDir);

  if (!fs.existsSync(logPath)) {
    return null;
  }

  try {
    const backupDir = path.join(projectDir, BACKUP_DIR);
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `auto-events-${timestamp}.jsonl`);

    // Rename keeps the existing log contents intact and creates a clean append target.
    fs.renameSync(logPath, backupPath);
    fs.closeSync(fs.openSync(logPath, 'a'));

    return backupPath;
  } catch (error) {
    throw new Error(`Failed to clear events: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

if (require.main === module) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case 'append':
        if (args.length < 2) {
          console.error('Usage: node event-log.js append <type> <dataJson>');
          process.exit(1);
        }
        console.log(JSON.stringify(appendEvent(args[0], JSON.parse(args[1])), null, 2));
        break;

      case 'read':
        console.log(JSON.stringify(readEvents(), null, 2));
        break;

      case 'filter':
        if (args.length < 1) {
          console.error('Usage: node event-log.js filter <type>');
          process.exit(1);
        }
        console.log(JSON.stringify(getEventsByType(args[0]), null, 2));
        break;

      case 'clear':
        console.log(clearEvents() || 'No event log to clear');
        break;

      default:
        console.log(`
Usage: node event-log.js <command> [args]

Commands:
  append <type> <dataJson>  Append an event to the log
  read                      Read all events
  filter <type>             Read events of a specific type
  clear                     Backup and clear the event log
        `);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  EVENT_LOG_FILE,
  EVENT_TYPES,
  appendEvent,
  readEvents,
  getEventsByType,
  clearEvents
};
