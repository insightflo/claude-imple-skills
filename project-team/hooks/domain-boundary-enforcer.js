#!/usr/bin/env node
/**
 * PreToolUse[Edit|Write] Hook: Domain Boundary Enforcer
 *
 * Blocks agents from writing/editing files outside their assigned domain.
 * Supports the hierarchical agent collaboration architecture where each
 * Domain Worker has a clearly defined set of allowed paths.
 *
 * Claude Code Hook Protocol (PreToolUse):
 *   - stdin: JSON { hook_event_name, tool_name, tool_input: { file_path, content } }
 *   - stdout: JSON { decision: 'allow'|'block', reason?, suggestion? }
 *
 * Agent role detection: process.env.CLAUDE_AGENT_ROLE
 * Cross-domain changes: create REQ file in .claude/collab/requests/
 */

const path = require('path');
const AgentAuthService = require('../services/auth');
const {
  resolveTokenSecret
} = AgentAuthService;
const {
  matchesAnyPattern,
  normalizeRole,
  resolveRoleIdentity,
  resolveDeterministicWriteScope,
  checkDomainBoundary
} = require('./lib/deterministic-policy');

// Paths any agent can write (cross-agent collaboration paths)
const ALWAYS_ALLOWED_WRITE = [
  '.claude/collab/requests/',
  '.claude/collab/locks/',
];

// Paths any agent can write (test patterns apply to qa-specialist separately)
const CONTRACTS_READ_ONLY_PREFIXES = [
  'contracts/',
  '.claude/collab/contracts/',
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toRelativePath(filePath) {
  if (!filePath) return '';
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  // path.resolve normalizes traversal sequences (e.g. src/domains/../../contracts)
  const absPath = path.resolve(projectDir, filePath);
  // Normalize to forward slashes for cross-platform prefix matching
  return path.relative(projectDir, absPath).replace(/\\/g, '/');
}

function matchesPrefix(rel, prefixes) {
  for (const prefix of prefixes) {
    if (rel.startsWith(prefix)) return true;
  }
  return false;
}

function isAllowed(role, rel) {
  const identity = resolveRoleIdentity(role);

  // Any agent can write to requests/ and locks/
  if (matchesPrefix(rel, ALWAYS_ALLOWED_WRITE)) return { allowed: true };

  if (!identity.recognized) {
    return {
      allowed: false,
      reason: `Unknown authenticated role "${role}" has no deterministic write scope.`,
      suggestion: 'Issue a token with canonical role metadata and allowed_paths before attempting this write.'
    };
  }

  if (matchesPrefix(rel, CONTRACTS_READ_ONLY_PREFIXES) && identity.canonicalRole !== 'lead') {
    return {
      allowed: false,
      reason: `"${rel}" is a contracts/ file. Only lead-scoped roles can write here.`,
      suggestion: 'If you need a contract change, create a REQ file in .claude/collab/requests/ to request lead review.',
    };
  }

  const boundary = checkDomainBoundary(rel, identity.domain);
  if (boundary.violation) {
    return {
      allowed: false,
      reason: `Role "${role}" cannot write to "${rel}" across domain boundary (${identity.domain} -> ${boundary.targetDomain}).`,
      suggestion: `Create a REQ file in .claude/collab/requests/ for ${boundary.targetDomain}-part-leader review.`
    };
  }

  const scope = resolveDeterministicWriteScope({ identity, relativePath: rel });

  if (scope.writePaths.length > 0 && matchesAnyPattern(rel, scope.writePaths)) return { allowed: true };

  return {
    allowed: false,
    reason: `Role "${role}" is not allowed to write to "${rel}" (outside domain boundary).`,
    suggestion: `Create a REQ file in .claude/collab/requests/ to request this cross-domain change. The receiving agent will review and respond.`,
  };
}

// ---------------------------------------------------------------------------
// Main
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
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  // Only intercept PreToolUse for Edit/Write
  if (!hookEvent.startsWith('PreToolUse')) return;
  if (!['Edit', 'Write'].includes(toolName)) return;

  const filePath = toolInput.file_path || toolInput.path || '';
  if (!filePath) return;

  const rel = toRelativePath(filePath);
  // Skip files outside project (relative paths starting with ..)
  if (rel.startsWith('..')) return;

  const agentToken = toolInput.agent_token || process.env.CLAUDE_AGENT_TOKEN || '';
  if (agentToken) {
    const auth = new AgentAuthService({ secretKey: resolveTokenSecret() });
    const verified = auth.verifyToken(agentToken);

    if (!verified.valid) {
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: 'Invalid agent authentication token for domain boundary enforcement.',
        suggestion: 'Refresh the scoped token before attempting this write.'
      }));
      return;
    }

    const identity = resolveRoleIdentity(verified.role);
    if (!identity.recognized) {
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: `Unknown authenticated role "${verified.role}" has no deterministic domain policy.`,
        suggestion: 'Use a canonical role or registered compatibility alias in the token.'
      }));
      return;
    }

    const boundary = checkDomainBoundary(rel, identity.domain || verified.domain);
    if (boundary.violation) {
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: `Role "${verified.role}" cannot write across domain boundary to "${rel}".`,
        suggestion: `Create a REQ file in .claude/collab/requests/ for ${boundary.targetDomain}-part-leader review.`
      }));
      return;
    }

    const scope = resolveDeterministicWriteScope({
      identity,
      allowedPaths: verified.allowedPaths,
      reviewOnly: verified.reviewOnly,
      selfCheck: toolInput.self_check === true,
      changedFiles: toolInput.changed_files || toolInput.changedFiles,
      relativePath: rel
    });

    if (!scope.writePaths.length || !matchesAnyPattern(rel, scope.writePaths)) {
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: `Write to "${rel}" is outside the deterministic write scope for role "${verified.role}" (${scope.source}).`,
        suggestion: 'Issue a scoped token with allowed_paths for this target path.'
      }));
      return;
    }

    return;
  }

  const rawRole = process.env.CLAUDE_AGENT_ROLE || '';
  const role = normalizeRole(rawRole);

  // No role set = allow (non-agent context)
  if (!role) return;

  const result = isAllowed(role, rel);

  if (!result.allowed) {
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: result.reason,
      suggestion: result.suggestion,
    }));
  }
  // Allowed: no output needed (implicit allow)
}

main().catch(() => {});

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ALWAYS_ALLOWED_WRITE,
    isAllowed,
    normalizeRole,
    toRelativePath,
  };
}
