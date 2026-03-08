const {
  resolveRoleIdentity,
  resolveDeterministicWriteScope,
  isLowRiskSelfCheck
} = require('../lib/deterministic-policy');

describe('resolveRoleIdentity', () => {
  test('recognizes canonical roles', () => {
    expect(resolveRoleIdentity('builder')).toMatchObject({
      recognized: true,
      canonicalRole: 'builder',
      compatibilityAlias: null,
      domain: null
    });
  });

  test('maps legacy agent aliases to canonical roles', () => {
    expect(resolveRoleIdentity('project-manager')).toMatchObject({
      recognized: true,
      canonicalRole: 'lead',
      compatibilityAlias: 'project-manager'
    });
  });

  test('maps domain-scoped compatibility aliases', () => {
    expect(resolveRoleIdentity('payments-developer')).toMatchObject({
      recognized: true,
      canonicalRole: 'builder',
      compatibilityAlias: 'domain-developer',
      domain: 'payments'
    });
  });
});

describe('resolveDeterministicWriteScope', () => {
  test('prefers token allowed_paths over role defaults', () => {
    const identity = resolveRoleIdentity('builder');
    const scope = resolveDeterministicWriteScope({
      identity,
      allowedPaths: ['docs/scoped/**'],
      relativePath: 'docs/scoped/file.md'
    });

    expect(scope).toEqual({
      recognized: true,
      source: 'token.allowed_paths',
      writePaths: ['docs/scoped/**']
    });
  });

  test('fails closed for unknown authenticated roles', () => {
    const scope = resolveDeterministicWriteScope({
      identity: resolveRoleIdentity('mystery-role'),
      relativePath: 'src/file.js'
    });

    expect(scope).toEqual({
      recognized: false,
      source: 'unknown-role',
      writePaths: []
    });
  });

  test('allows explicit low-risk reviewer self-check scope only', () => {
    const identity = resolveRoleIdentity('reviewer');
    const scope = resolveDeterministicWriteScope({
      identity,
      reviewOnly: true,
      selfCheck: true,
      changedFiles: ['tests/unit/reviewer.test.js', 'docs/reviewer.md'],
      relativePath: 'tests/unit/reviewer.test.js'
    });

    expect(scope).toEqual({
      recognized: true,
      source: 'reviewer.low-risk-self-check',
      writePaths: ['tests/**', 'docs/**']
    });
  });
});

describe('isLowRiskSelfCheck', () => {
  test('rejects src mutations', () => {
    expect(isLowRiskSelfCheck({
      reviewOnly: true,
      selfCheck: true,
      changedFiles: ['tests/unit/reviewer.test.js', 'src/index.js'],
      relativePath: 'tests/unit/reviewer.test.js'
    })).toBe(false);
  });

  test('rejects more than two changed files', () => {
    expect(isLowRiskSelfCheck({
      reviewOnly: true,
      selfCheck: true,
      changedFiles: ['tests/a.test.js', 'tests/b.test.js', 'docs/c.md'],
      relativePath: 'tests/a.test.js'
    })).toBe(false);
  });
});
