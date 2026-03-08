const { checkPermission } = require('../policy-gate');

describe('policy-gate deterministic permission checks', () => {
  test('allows canonical builder writes in implementation paths', () => {
    expect(checkPermission('builder', 'src/domains/payments/service.js')).toEqual({ allowed: true });
  });

  test('denies canonical lead writes without scoped paths', () => {
    expect(checkPermission('lead', 'docs/plan.md')).toMatchObject({
      allowed: false
    });
  });

  test('denies unknown roles instead of silently allowing', () => {
    expect(checkPermission('unknown-role', 'src/file.js')).toMatchObject({
      allowed: false
    });
  });
});
