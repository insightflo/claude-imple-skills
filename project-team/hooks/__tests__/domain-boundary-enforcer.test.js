const { isAllowed } = require('../domain-boundary-enforcer');

describe('domain-boundary-enforcer deterministic scope', () => {
  test('allows domain developer within assigned domain', () => {
    expect(isAllowed('auth-developer', 'src/domains/auth/service.js')).toEqual({ allowed: true });
  });

  test('blocks cross-domain writes for compatibility profile roles', () => {
    expect(isAllowed('auth-developer', 'src/domains/payments/service.js')).toMatchObject({
      allowed: false
    });
  });

  test('blocks unknown authenticated roles', () => {
    expect(isAllowed('mystery-role', 'src/file.js')).toMatchObject({
      allowed: false
    });
  });
});
