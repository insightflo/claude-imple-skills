/**
 * @TASK P2-T1 - Permission Checker Hook Tests
 * @TEST hooks/permission-checker.js
 *
 * Tests cover:
 *   1. Static role permissions (project-manager, chief-architect, etc.)
 *   2. Domain-scoped template roles (part-leader, designer, developer)
 *   3. Domain boundary violation detection
 *   4. Glob pattern matching
 *   5. Escalation target resolution
 *   6. Agent role detection from environment
 *   7. Relative path resolution
 */

const {
  PERMISSION_MATRIX,
  generatePartLeaderPermissions,
  generateDomainDesignerPermissions,
  generateDomainDeveloperPermissions,
  globToRegex,
  matchesAnyPattern,
  findEscalationTarget,
  detectAgentRole,
  resolvePermissions,
  checkDomainBoundary,
  checkPermission,
  toRelativePath,
  toSafeProjectRelativePath,
  verifyAgentToken,
  resolveVerifiedRoleContext,
  formatDenialMessage,
  formatBoundaryViolationMessage,
  formatUnknownAgentWarning
} = require('../permission-checker');
const AgentAuthService = require('../../services/auth');

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');


// ---------------------------------------------------------------------------
// Glob Pattern Matching
// ---------------------------------------------------------------------------

describe('globToRegex', () => {
  test('matches exact file path', () => {
    const regex = globToRegex('contracts/standards/design-system.md');
    expect(regex.test('contracts/standards/design-system.md')).toBe(true);
    expect(regex.test('contracts/standards/api-standards.md')).toBe(false);
  });

  test('matches single wildcard (*)', () => {
    const regex = globToRegex('management/requests/to-*/**');
    expect(regex.test('management/requests/to-auth/task-1.md')).toBe(true);
    expect(regex.test('management/requests/to-payment/task-2.md')).toBe(true);
  });

  test('matches double wildcard (**)', () => {
    const regex = globToRegex('src/domains/auth/**');
    expect(regex.test('src/domains/auth/models/user.py')).toBe(true);
    expect(regex.test('src/domains/auth/services/auth_service.py')).toBe(true);
    expect(regex.test('src/domains/payment/models/order.py')).toBe(false);
  });

  test('matches all files with **/*', () => {
    const regex = globToRegex('**/*');
    expect(regex.test('any/path/to/file.py')).toBe(true);
    // Note: **/* requires at least one directory separator
    // Root-level files without / are not matched by **/*
    expect(regex.test('root-file.md')).toBe(false);
  });
});

describe('matchesAnyPattern', () => {
  test('returns true when path matches any pattern', () => {
    const patterns = ['management/requests/**', 'management/meetings/**'];
    expect(matchesAnyPattern('management/requests/to-auth/task.md', patterns)).toBe(true);
    expect(matchesAnyPattern('management/meetings/2024-01-01.md', patterns)).toBe(true);
  });

  test('returns false when path matches no pattern', () => {
    const patterns = ['management/requests/**', 'management/meetings/**'];
    expect(matchesAnyPattern('src/domains/auth/models/user.py', patterns)).toBe(false);
  });

  test('returns false for empty patterns', () => {
    expect(matchesAnyPattern('any/file.py', [])).toBe(false);
    expect(matchesAnyPattern('any/file.py', null)).toBe(false);
  });

  test('skips negation patterns with !()', () => {
    const patterns = ['src/domains/!(auth)/**'];
    // Negation patterns are intentionally skipped
    expect(matchesAnyPattern('src/domains/payment/file.py', patterns)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Permission Matrix Validation
// ---------------------------------------------------------------------------

describe('PERMISSION_MATRIX', () => {
  test('defines all 6 static roles', () => {
    const expectedRoles = [
      'project-manager',
      'chief-architect',
      'chief-designer',
      'dba',
      'qa-manager',
      'maintenance-analyst'
    ];
    for (const role of expectedRoles) {
      expect(PERMISSION_MATRIX).toHaveProperty(role);
    }
  });

  test('each role has read, write, and cannot arrays', () => {
    for (const perms of Object.values(PERMISSION_MATRIX)) {
      expect(Array.isArray(perms.read)).toBe(true);
      expect(Array.isArray(perms.write)).toBe(true);
      expect(Array.isArray(perms.cannot)).toBe(true);
    }
  });

  test('project-manager has management write access', () => {
    const pm = PERMISSION_MATRIX['project-manager'];
    expect(matchesAnyPattern('management/requests/to-auth/task.md', pm.write)).toBe(true);
    expect(matchesAnyPattern('management/meetings/standup.md', pm.write)).toBe(true);
    expect(matchesAnyPattern('management/decisions/adr-001.md', pm.write)).toBe(true);
  });

  test('project-manager cannot write src files', () => {
    const pm = PERMISSION_MATRIX['project-manager'];
    expect(matchesAnyPattern('src/domains/auth/models/user.py', pm.cannot)).toBe(true);
  });

  test('chief-architect can write standards', () => {
    const ca = PERMISSION_MATRIX['chief-architect'];
    expect(matchesAnyPattern('contracts/standards/coding-standards.md', ca.write)).toBe(true);
    expect(matchesAnyPattern('contracts/standards/api-standards.md', ca.write)).toBe(true);
  });

  test('chief-architect cannot write src files', () => {
    const ca = PERMISSION_MATRIX['chief-architect'];
    expect(matchesAnyPattern('src/domains/auth/models/user.py', ca.cannot)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Template Role Generators
// ---------------------------------------------------------------------------

describe('generatePartLeaderPermissions', () => {
  test('generates correct write paths for domain', () => {
    const perms = generatePartLeaderPermissions('auth');
    expect(matchesAnyPattern('src/domains/auth/models/user.py', perms.write)).toBe(true);
    expect(matchesAnyPattern('contracts/interfaces/auth-api.yaml', perms.write)).toBe(true);
    expect(matchesAnyPattern('management/requests/to-payment/task.md', perms.write)).toBe(true);
    expect(matchesAnyPattern('management/responses/from-auth/status.md', perms.write)).toBe(true);
  });

  test('stores domain name', () => {
    const perms = generatePartLeaderPermissions('payment');
    expect(perms._domain).toBe('payment');
  });
});

describe('generateDomainDesignerPermissions', () => {
  test('generates correct write paths for domain', () => {
    const perms = generateDomainDesignerPermissions('auth');
    expect(matchesAnyPattern('design/auth/screens/login.md', perms.write)).toBe(true);
    expect(matchesAnyPattern('contracts/interfaces/auth-components.yaml', perms.write)).toBe(true);
  });

  test('cannot write design system', () => {
    const perms = generateDomainDesignerPermissions('auth');
    expect(matchesAnyPattern('contracts/standards/design-system.md', perms.cannot)).toBe(true);
  });

  test('cannot write src code', () => {
    const perms = generateDomainDesignerPermissions('auth');
    expect(matchesAnyPattern('src/domains/auth/routes/auth_routes.py', perms.cannot)).toBe(true);
  });
});

describe('generateDomainDeveloperPermissions', () => {
  test('generates correct write paths for domain', () => {
    const perms = generateDomainDeveloperPermissions('auth');
    expect(matchesAnyPattern('src/domains/auth/models/user.py', perms.write)).toBe(true);
    expect(matchesAnyPattern('src/domains/auth/services/auth_service.py', perms.write)).toBe(true);
    expect(matchesAnyPattern('tests/auth/unit/test_user.py', perms.write)).toBe(true);
  });

  test('cannot write standards', () => {
    const perms = generateDomainDeveloperPermissions('auth');
    expect(matchesAnyPattern('contracts/standards/coding-standards.md', perms.cannot)).toBe(true);
  });

  test('cannot write design files', () => {
    const perms = generateDomainDeveloperPermissions('auth');
    expect(matchesAnyPattern('design/auth/screens/login.md', perms.cannot)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Agent Role Detection
// ---------------------------------------------------------------------------

describe('detectAgentRole', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CLAUDE_AGENT_ROLE;
    delete process.env.CLAUDE_AGENT_NAME;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('detects static role from CLAUDE_AGENT_ROLE', () => {
    process.env.CLAUDE_AGENT_ROLE = 'project-manager';
    expect(detectAgentRole()).toEqual({ role: 'project-manager', domain: null });
  });

  test('detects static role from CLAUDE_AGENT_NAME', () => {
    process.env.CLAUDE_AGENT_NAME = 'chief-architect';
    expect(detectAgentRole()).toEqual({ role: 'chief-architect', domain: null });
  });

  test('detects part-leader with domain', () => {
    process.env.CLAUDE_AGENT_ROLE = 'auth-part-leader';
    expect(detectAgentRole()).toEqual({ role: 'part-leader', domain: 'auth' });
  });

  test('detects domain-designer with domain', () => {
    process.env.CLAUDE_AGENT_ROLE = 'payment-designer';
    expect(detectAgentRole()).toEqual({ role: 'domain-designer', domain: 'payment' });
  });

  test('detects domain-developer with domain', () => {
    process.env.CLAUDE_AGENT_ROLE = 'auth-developer';
    expect(detectAgentRole()).toEqual({ role: 'domain-developer', domain: 'auth' });
  });

  test('does not confuse chief-designer with domain-designer', () => {
    process.env.CLAUDE_AGENT_ROLE = 'chief-designer';
    const result = detectAgentRole();
    expect(result.role).toBe('chief-designer');
    expect(result.domain).toBeNull();
  });

  test('returns null for unknown role', () => {
    process.env.CLAUDE_AGENT_ROLE = 'unknown-role-xyz';
    expect(detectAgentRole()).toEqual({ role: null, domain: null });
  });

  test('returns null when no env var set', () => {
    expect(detectAgentRole()).toEqual({ role: null, domain: null });
  });

  test('handles case-insensitive role names', () => {
    process.env.CLAUDE_AGENT_ROLE = 'Project-Manager';
    expect(detectAgentRole()).toEqual({ role: 'project-manager', domain: null });
  });

  test('CLAUDE_AGENT_ROLE takes priority over CLAUDE_AGENT_NAME', () => {
    process.env.CLAUDE_AGENT_ROLE = 'project-manager';
    process.env.CLAUDE_AGENT_NAME = 'chief-architect';
    expect(detectAgentRole()).toEqual({ role: 'project-manager', domain: null });
  });
});

// ---------------------------------------------------------------------------
// Permission Resolution
// ---------------------------------------------------------------------------

describe('resolvePermissions', () => {
  test('resolves static roles', () => {
    const perms = resolvePermissions('project-manager', null);
    expect(perms).toBeDefined();
    expect(perms.write).toContain('management/meetings/**');
  });

  test('resolves part-leader with domain', () => {
    const perms = resolvePermissions('part-leader', 'auth');
    expect(perms).toBeDefined();
    expect(perms._domain).toBe('auth');
  });

  test('resolves domain-developer with domain', () => {
    const perms = resolvePermissions('domain-developer', 'payment');
    expect(perms).toBeDefined();
    expect(perms._domain).toBe('payment');
  });

  test('returns null for unknown role', () => {
    expect(resolvePermissions('nonexistent', null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Domain Boundary Detection
// ---------------------------------------------------------------------------

describe('checkDomainBoundary', () => {
  test('detects cross-domain src access', () => {
    const result = checkDomainBoundary('src/domains/payment/models/order.py', 'auth');
    expect(result.violation).toBe(true);
    expect(result.targetDomain).toBe('payment');
  });

  test('allows own domain src access', () => {
    const result = checkDomainBoundary('src/domains/auth/models/user.py', 'auth');
    expect(result.violation).toBe(false);
  });

  test('detects cross-domain test access', () => {
    const result = checkDomainBoundary('tests/payment/unit/test_order.py', 'auth');
    expect(result.violation).toBe(true);
    expect(result.targetDomain).toBe('payment');
  });

  test('allows own domain test access', () => {
    const result = checkDomainBoundary('tests/auth/unit/test_user.py', 'auth');
    expect(result.violation).toBe(false);
  });

  test('detects cross-domain design access', () => {
    const result = checkDomainBoundary('design/payment/screens/checkout.md', 'auth');
    expect(result.violation).toBe(true);
    expect(result.targetDomain).toBe('payment');
  });

  test('no violation for non-domain paths', () => {
    const result = checkDomainBoundary('contracts/standards/coding-standards.md', 'auth');
    expect(result.violation).toBe(false);
  });

  test('no violation when agentDomain is null', () => {
    const result = checkDomainBoundary('src/domains/auth/models/user.py', null);
    expect(result.violation).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Core Permission Check
// ---------------------------------------------------------------------------

describe('checkPermission', () => {
  // Project Manager
  describe('project-manager', () => {
    test('allows writing management requests', () => {
      const result = checkPermission('project-manager', null, 'management/requests/to-auth/task.md');
      expect(result.allowed).toBe(true);
    });

    test('allows writing meeting notes', () => {
      const result = checkPermission('project-manager', null, 'management/meetings/standup.md');
      expect(result.allowed).toBe(true);
    });

    test('denies writing source code', () => {
      const result = checkPermission('project-manager', null, 'src/domains/auth/models/user.py');
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('restricted-area');
    });

    test('provides escalation target for code files', () => {
      const result = checkPermission('project-manager', null, 'src/domains/auth/models/user.py');
      expect(result.escalation).toBeDefined();
    });
  });

  // Chief Architect
  describe('chief-architect', () => {
    test('allows writing standards', () => {
      const result = checkPermission('chief-architect', null, 'contracts/standards/coding-standards.md');
      expect(result.allowed).toBe(true);
    });

    test('allows writing decisions', () => {
      const result = checkPermission('chief-architect', null, 'management/decisions/adr-001.md');
      expect(result.allowed).toBe(true);
    });

    test('denies writing source code', () => {
      const result = checkPermission('chief-architect', null, 'src/domains/auth/routes/auth_routes.py');
      expect(result.allowed).toBe(false);
    });

    test('denies writing design files', () => {
      const result = checkPermission('chief-architect', null, 'design/auth/screens/login.md');
      expect(result.allowed).toBe(false);
    });
  });

  // Chief Designer
  describe('chief-designer', () => {
    test('allows writing design system', () => {
      const result = checkPermission('chief-designer', null, 'contracts/standards/design-system.md');
      expect(result.allowed).toBe(true);
    });

    test('allows writing design files', () => {
      const result = checkPermission('chief-designer', null, 'design/auth/screens/login.md');
      expect(result.allowed).toBe(true);
    });

    test('denies writing source code', () => {
      const result = checkPermission('chief-designer', null, 'src/domains/auth/models/user.py');
      expect(result.allowed).toBe(false);
    });

    test('denies writing coding standards', () => {
      const result = checkPermission('chief-designer', null, 'contracts/standards/coding-standards.md');
      expect(result.allowed).toBe(false);
    });
  });

  // DBA
  describe('dba', () => {
    test('allows writing database schema', () => {
      const result = checkPermission('dba', null, 'database/schema/users.sql');
      expect(result.allowed).toBe(true);
    });

    test('allows writing database standards', () => {
      const result = checkPermission('dba', null, 'contracts/standards/database-standards.md');
      expect(result.allowed).toBe(true);
    });

    test('denies writing service code', () => {
      const result = checkPermission('dba', null, 'src/domains/auth/services/auth_service.py');
      expect(result.allowed).toBe(false);
    });
  });

  // QA Manager
  describe('qa-manager', () => {
    test('allows writing qa files', () => {
      const result = checkPermission('qa-manager', null, 'qa/test-plans/integration.md');
      expect(result.allowed).toBe(true);
    });

    test('denies writing source code', () => {
      const result = checkPermission('qa-manager', null, 'src/domains/auth/models/user.py');
      expect(result.allowed).toBe(false);
    });
  });

  // Maintenance Analyst
  describe('maintenance-analyst', () => {
    test('allows writing architecture docs', () => {
      const result = checkPermission('maintenance-analyst', null, 'docs/architecture/system-map.md');
      expect(result.allowed).toBe(true);
    });

    test('allows writing changelog', () => {
      const result = checkPermission('maintenance-analyst', null, 'docs/changelog/2024-01-01.md');
      expect(result.allowed).toBe(true);
    });

    test('denies writing source code', () => {
      const result = checkPermission('maintenance-analyst', null, 'src/domains/auth/models/user.py');
      expect(result.allowed).toBe(false);
    });
  });

  // Domain Developer (template role)
  describe('domain-developer', () => {
    test('allows writing own domain code', () => {
      const result = checkPermission('domain-developer', 'auth', 'src/domains/auth/models/user.py');
      expect(result.allowed).toBe(true);
    });

    test('allows writing own domain tests', () => {
      const result = checkPermission('domain-developer', 'auth', 'tests/auth/unit/test_user.py');
      expect(result.allowed).toBe(true);
    });

    test('denies writing other domain code (boundary violation)', () => {
      const result = checkPermission('domain-developer', 'auth', 'src/domains/payment/models/order.py');
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('domain-boundary');
    });

    test('denies writing standards', () => {
      const result = checkPermission('domain-developer', 'auth', 'contracts/standards/coding-standards.md');
      expect(result.allowed).toBe(false);
    });

    test('denies writing design files', () => {
      const result = checkPermission('domain-developer', 'auth', 'design/auth/screens/login.md');
      expect(result.allowed).toBe(false);
    });
  });

  // Part Leader (template role)
  describe('part-leader', () => {
    test('allows writing own domain code', () => {
      const result = checkPermission('part-leader', 'auth', 'src/domains/auth/models/user.py');
      expect(result.allowed).toBe(true);
    });

    test('allows writing interface contracts', () => {
      const result = checkPermission('part-leader', 'auth', 'contracts/interfaces/auth-api.yaml');
      expect(result.allowed).toBe(true);
    });

    test('allows writing cross-domain requests', () => {
      const result = checkPermission('part-leader', 'auth', 'management/requests/to-payment/interface-request.md');
      expect(result.allowed).toBe(true);
    });

    test('denies writing other domain code (boundary violation)', () => {
      const result = checkPermission('part-leader', 'auth', 'src/domains/payment/models/order.py');
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('domain-boundary');
    });
  });

  // Domain Designer (template role)
  describe('domain-designer', () => {
    test('allows writing own domain design', () => {
      const result = checkPermission('domain-designer', 'auth', 'design/auth/screens/login.md');
      expect(result.allowed).toBe(true);
    });

    test('allows writing own components yaml', () => {
      const result = checkPermission('domain-designer', 'auth', 'contracts/interfaces/auth-components.yaml');
      expect(result.allowed).toBe(true);
    });

    test('denies writing other domain design (boundary violation)', () => {
      const result = checkPermission('domain-designer', 'auth', 'design/payment/screens/checkout.md');
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('domain-boundary');
    });

    test('denies writing source code', () => {
      const result = checkPermission('domain-designer', 'auth', 'src/domains/auth/models/user.py');
      expect(result.allowed).toBe(false);
    });
  });

  // Unknown role
  describe('unknown role', () => {
    test('denies access for unknown role', () => {
      const result = checkPermission('nonexistent-role', null, 'any/file.py');
      expect(result.allowed).toBe(false);
      expect(result.type).toBe('unknown-role');
    });
  });
});

// ---------------------------------------------------------------------------
// Escalation Target Resolution
// ---------------------------------------------------------------------------

describe('findEscalationTarget', () => {
  test('finds escalation target for matching path', () => {
    const escalationMap = {
      'src/**': 'Domain Developer',
      'contracts/standards/**': 'Chief Architect',
      'design/**': 'Chief Designer'
    };

    expect(findEscalationTarget('src/domains/auth/models/user.py', escalationMap)).toBe('Domain Developer');
    expect(findEscalationTarget('contracts/standards/api-standards.md', escalationMap)).toBe('Chief Architect');
    expect(findEscalationTarget('design/auth/screens/login.md', escalationMap)).toBe('Chief Designer');
  });

  test('returns null for non-matching path', () => {
    const escalationMap = { 'src/**': 'Domain Developer' };
    expect(findEscalationTarget('management/meetings/standup.md', escalationMap)).toBeNull();
  });

  test('returns null for null escalation map', () => {
    expect(findEscalationTarget('any/file.py', null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Message Formatting
// ---------------------------------------------------------------------------

describe('formatDenialMessage', () => {
  test('includes agent role and file path', () => {
    const msg = formatDenialMessage({
      agentRole: 'project-manager',
      domain: null,
      filePath: 'src/domains/auth/models/user.py',
      reason: 'restricted area',
      escalationTarget: 'Domain Developer'
    });
    expect(msg).toContain('project-manager');
    expect(msg).toContain('src/domains/auth/models/user.py');
    expect(msg).toContain('Domain Developer');
  });

  test('includes domain in agent label for domain-scoped roles', () => {
    const msg = formatDenialMessage({
      agentRole: 'domain-developer',
      domain: 'auth',
      filePath: 'contracts/standards/coding-standards.md',
      reason: 'restricted area',
      escalationTarget: 'Chief Architect'
    });
    expect(msg).toContain('auth-domain-developer');
  });
});

describe('formatBoundaryViolationMessage', () => {
  test('includes both agent and target domains', () => {
    const msg = formatBoundaryViolationMessage({
      agentRole: 'domain-developer',
      agentDomain: 'auth',
      targetDomain: 'payment',
      filePath: 'src/domains/payment/models/order.py'
    });
    expect(msg).toContain('auth');
    expect(msg).toContain('payment');
    expect(msg).toContain('Domain Boundary Violation');
    expect(msg).toContain('payment-part-leader');
  });
});

describe('formatUnknownAgentWarning', () => {
  test('includes file path and env var hint', () => {
    const msg = formatUnknownAgentWarning('src/domains/auth/models/user.py');
    expect(msg).toContain('Permission Warning');
    expect(msg).toContain('CLAUDE_AGENT_ROLE');
    expect(msg).toContain('src/domains/auth/models/user.py');
  });
});

// ---------------------------------------------------------------------------
// Relative Path Resolution
// ---------------------------------------------------------------------------

describe('toRelativePath', () => {
  test('returns empty string for empty input', () => {
    expect(toRelativePath('')).toBe('');
    expect(toRelativePath(null)).toBe('');
    expect(toRelativePath(undefined)).toBe('');
  });

  test('returns relative path as-is', () => {
    expect(toRelativePath('src/domains/auth/models/user.py')).toBe('src/domains/auth/models/user.py');
  });
});

// ---------------------------------------------------------------------------
// Agent Token Verification
// ---------------------------------------------------------------------------

describe('verifyAgentToken', () => {
  function base64UrlEncode(input) {
    return Buffer.from(input)
      .toString('base64')
      .replace(/=+$/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  function sign(payloadB64, secret) {
    return Buffer.from(crypto.createHmac('sha256', secret).update(payloadB64).digest())
      .toString('base64')
      .replace(/=+$/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  function makeToken(payload, secret) {
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const sigB64 = sign(payloadB64, secret);
    return `${payloadB64}.${sigB64}`;
  }

  test('denies when secret is missing', () => {
    const res = verifyAgentToken('abc.def', '');
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('Missing token verification secret');
  });

  test('denies when token is missing', () => {
    const res = verifyAgentToken('', 'test-secret');
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('Missing agent authentication token');
  });

  test('denies when token format is invalid', () => {
    const res = verifyAgentToken('not-a-jwt', 'test-secret');
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('Invalid agent_token format');
  });

  test('denies when token signature is invalid', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = makeToken({ role: 'project-manager', exp: nowSec + 60 }, 'secret-a');

    const res = verifyAgentToken(token, 'secret-b');
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('Invalid agent_token signature');
  });

  test('denies when token is expired', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const secret = 'test-secret';
    const token = makeToken({ role: 'project-manager', exp: nowSec - 1 }, secret);

    const res = verifyAgentToken(token, secret);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('expired');
  });

  test('allows valid token and normalizes role', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const secret = 'test-secret';
    const token = makeToken({ role: 'Project Manager', exp: nowSec + 60 }, secret);

    const res = verifyAgentToken(token, secret);
    expect(res).toMatchObject({ ok: true, role: 'project-manager', exp: nowSec + 60 });
  });

  test('accepts canonical JWTs from auth service and preserves advisory claims', () => {
    const auth = new AgentAuthService({ secretKey: 'test-secret' });
    const token = auth.issueToken('builder-1', 'auth-developer', 'auth', 3600000, {
      scopeId: 'auth-scope',
      allowedPaths: ['src/domains/auth/**'],
      reviewOnly: false,
      allowedTools: ['Read', 'Edit'],
      deniedTools: ['Bash'],
      advisoryOnly: true
    });

    const res = verifyAgentToken(token, 'test-secret');
    expect(res).toMatchObject({
      ok: true,
      role: 'auth-developer',
      domain: 'auth',
      scopeId: 'auth-scope',
      allowedPaths: ['src/domains/auth/**'],
      reviewOnly: false,
      agentId: 'builder-1',
      allowedTools: ['Read', 'Edit'],
      deniedTools: ['Bash'],
      advisoryOnly: true
    });
  });

  test('accepts legacy millisecond exp in JWTs for compatibility', () => {
    const secret = 'test-secret';
    const token = (() => {
      const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payloadB64 = base64UrlEncode(JSON.stringify({
        role: 'project-manager',
        scope_id: 'project-manager',
        allowed_paths: [],
        review_only: false,
        iat: Date.now(),
        exp: Date.now() + 60000
      }));
      const sigB64 = sign(`${headerB64}.${payloadB64}`, secret);
      return `${headerB64}.${payloadB64}.${sigB64}`;
    })();

    const res = verifyAgentToken(token, secret);
    expect(res).toMatchObject({ ok: true, role: 'project-manager' });
  });

  test('resolves verification secret from canonical environment order', () => {
    const previousEnv = { ...process.env };

    try {
      process.env.CLAUDE_HOOK_SECRET = 'hook-secret';
      process.env.AGENT_JWT_SECRET = 'jwt-secret';
      process.env.PERMISSION_CHECKER_SECRET = 'legacy-secret';

      const auth = new AgentAuthService({ secretKey: process.env.CLAUDE_HOOK_SECRET });
      const token = auth.issueToken('agent-1', 'project-manager', null);
      const res = verifyAgentToken(token);
      expect(res).toMatchObject({ ok: true, role: 'project-manager' });
    } finally {
      process.env = previousEnv;
    }
  });
});

describe('resolveVerifiedRoleContext', () => {
  test('maps canonical builder role directly', () => {
    expect(resolveVerifiedRoleContext({ role: 'builder' })).toMatchObject({
      role: 'builder',
      canonicalRole: 'builder',
      domain: null
    });
  });

  test('maps legacy alias to canonical reviewer role', () => {
    expect(resolveVerifiedRoleContext({ role: 'qa-manager' })).toMatchObject({
      role: 'qa-manager',
      canonicalRole: 'reviewer',
      domain: null
    });
  });

  test('maps legacy domain alias to canonical builder with domain', () => {
    expect(resolveVerifiedRoleContext({ role: 'auth-developer' })).toMatchObject({
      role: 'domain-developer',
      canonicalRole: 'builder',
      domain: 'auth'
    });
  });
});

// ---------------------------------------------------------------------------
// Safe Path Handling
// ---------------------------------------------------------------------------

describe('toSafeProjectRelativePath', () => {
  let tmpRoot;
  let projectDir;
  let outsideDir;
  let insideFile;
  let outsideFile;
  let symlinkPath;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'permission-checker-'));
    projectDir = path.join(tmpRoot, 'project');
    outsideDir = path.join(tmpRoot, 'outside');

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    insideFile = path.join(projectDir, 'src', 'ok.txt');
    fs.mkdirSync(path.dirname(insideFile), { recursive: true });
    fs.writeFileSync(insideFile, 'ok', 'utf8');

    outsideFile = path.join(outsideDir, 'evil.txt');
    fs.writeFileSync(outsideFile, 'evil', 'utf8');

    symlinkPath = path.join(projectDir, 'link-to-evil.txt');
    fs.symlinkSync(outsideFile, symlinkPath);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('allows paths inside project root', () => {
    const res = toSafeProjectRelativePath(insideFile, projectDir);
    expect(res.ok).toBe(true);
    expect(res.relativePath).toBe('src/ok.txt');
  });

  test('allows new (non-existent) files under an existing project subdir', () => {
    const newDir = path.join(projectDir, 'newdir');
    fs.mkdirSync(newDir, { recursive: true });

    const newFile = path.join(newDir, 'newfile.txt');
    const res = toSafeProjectRelativePath(newFile, projectDir);
    expect(res.ok).toBe(true);
    expect(res.relativePath).toBe('newdir/newfile.txt');
  });

  test('denies absolute paths outside project root', () => {
    const res = toSafeProjectRelativePath(outsideFile, projectDir);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('escapes project root');
  });

  test('denies relative traversal paths that escape project root', () => {
    const traversal = path.join('..', 'outside', 'evil.txt');
    const res = toSafeProjectRelativePath(traversal, projectDir);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('escapes project root');
  });

  test('denies symlink escape outside project root', () => {
    const res = toSafeProjectRelativePath(symlinkPath, projectDir);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('escapes project root');
  });
});
