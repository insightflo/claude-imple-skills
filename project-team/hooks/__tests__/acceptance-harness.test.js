'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const AgentAuthService = require('../../services/auth');
const { buildRuntimeHandoff } = require('../../services/context-injector');
const { buildModePayload, readRegistry } = require('../../scripts/install-registry');

const PROJECT_TEAM_ROOT = path.resolve(__dirname, '..', '..');
const PERMISSION_CHECKER = path.join(PROJECT_TEAM_ROOT, 'hooks', 'permission-checker.js');
const DOMAIN_BOUNDARY_ENFORCER = path.join(PROJECT_TEAM_ROOT, 'hooks', 'domain-boundary-enforcer.js');
const REGISTRY = readRegistry();
const LEGACY_ALIAS_PATTERN = [
  ['project', 'manager'].join('-'),
  ['chief', 'architect'].join('-'),
  ['chief', 'designer'].join('-'),
  ['qa', 'manager'].join('-'),
  ['maintenance', 'analyst'].join('-'),
  ['backend', 'specialist'].join('-'),
  ['frontend', 'specialist'].join('-'),
  ['Part', 'Leader'].join(' '),
  ['Domain', 'Designer'].join(' '),
  ['Domain', 'Developer'].join(' ')
].join('|');
const APPROVED_LEGACY_FILES = new Set([
  'README.md',
  'agents/MaintenanceAnalyst.md',
  'agents/templates/DomainDesigner.md',
  'agents/templates/DomainDeveloper.md',
  'agents/templates/PartLeader.md',
  'config/topology-registry.json',
  'docs/INSTALLATION.md',
  'docs/MAINTENANCE.md',
  'docs/MODES.md',
  'docs/PROJECT-BOOTSTRAP-INTEGRATION.md',
  'docs/SKILL-INTEGRATION.md',
  'docs/USAGE.md',
  'examples/ecommerce/README.md',
  'examples/ecommerce/risk-areas.yaml',
  'examples/saas/risk-areas.yaml',
  'hooks/README.md',
  'hooks/QUALITY_GATE.md',
  'hooks/__tests__/deterministic-policy.test.js',
  'hooks/__tests__/permission-checker.test.js',
  'hooks/__tests__/risk-area-warning.test.js',
  'hooks/contract-gate.js',
  'hooks/cross-domain-notifier.js',
  'hooks/domain-boundary-enforcer.js',
  'hooks/interface-validator.js',
  'hooks/permission-checker.js',
  'hooks/policy-gate.js',
  'hooks/risk-area-warning.js',
  'services/auth.js',
  'services/messaging.js',
  'templates/adr/example.md',
  'templates/contracts/example-user-api.yaml',
  'templates/contracts/interface.yaml',
  'templates/model-routing.yaml'
]);

jest.setTimeout(120000);

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function copyProjectTeamFixture() {
  const sandboxRoot = makeTempDir('project-team-acceptance-');
  const sandboxProjectTeam = path.join(sandboxRoot, 'project-team');
  fs.cpSync(PROJECT_TEAM_ROOT, sandboxProjectTeam, { recursive: true });
  return { sandboxRoot, sandboxProjectTeam };
}

function flattenHookCommands(hooks) {
  return Object.values(hooks || {}).flatMap((groups) => (groups || []).flatMap((group) =>
    (group.hooks || []).map((hook) => hook.command)
  ));
}

function runNodeScript(scriptPath, { cwd, env, input }) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd,
    env,
    input: input ? JSON.stringify(input) : undefined,
    encoding: 'utf8'
  });
}

function runInstaller({ sandboxProjectTeam, installMode, mode, homeDir }) {
  const result = spawnSync('bash', [path.join(sandboxProjectTeam, 'install.sh'), `--${installMode}`, '--force', '--quiet', `--mode=${mode}`], {
    cwd: sandboxProjectTeam,
    env: {
      ...process.env,
      HOME: homeDir
    },
    encoding: 'utf8'
  });

  expect(result.status).toBe(0);
  return result;
}

function getScopeRoot(sandboxProjectTeam, installMode, homeDir) {
  return installMode === 'global'
    ? path.join(homeDir, '.claude')
    : path.join(sandboxProjectTeam, '.claude');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertModeInstall({ sandboxProjectTeam, installMode, mode, homeDir }) {
  runInstaller({ sandboxProjectTeam, installMode, mode, homeDir });

  const scopeRoot = getScopeRoot(sandboxProjectTeam, installMode, homeDir);
  const payload = buildModePayload(REGISTRY, mode);

  for (const category of ['agents', 'hooks', 'templates', 'settings']) {
    for (const relPath of payload.artifacts[category]) {
      expect(fs.existsSync(path.join(scopeRoot, relPath))).toBe(true);
    }
  }

  const hookConfig = readJson(path.join(scopeRoot, 'hooks', 'project-team-hooks.json'));
  const expectedHookCount = payload.hooks.active.length + payload.hooks.helpers.length;
  expect(hookConfig.managed.mode).toBe(mode);
  expect(hookConfig.managed.commands).toHaveLength(expectedHookCount);
  expect(flattenHookCommands(hookConfig.hooks)).toHaveLength(expectedHookCount);

  const manifest = readJson(path.join(scopeRoot, 'project-team-install-state.json'));
  expect(manifest.mode).toBe(mode);
  expect(manifest.ownedArtifacts).toEqual(expect.arrayContaining(payload.artifacts.hooks));

  const settings = readJson(path.join(scopeRoot, 'settings.json'));
  expect(flattenHookCommands(settings.hooks)).toEqual(expect.arrayContaining(hookConfig.managed.commands));
}

function decodeJwtPayload(token) {
  const [, payloadEncoded] = String(token).split('.');
  return JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));
}

function createScopedProject() {
  const projectRoot = makeTempDir('project-team-scope-');
  fs.mkdirSync(path.join(projectRoot, 'tests', 'unit'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'src', 'backend', 'billing'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'src', 'frontend'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'tests', 'unit', 'reviewer.test.js'), 'test', 'utf8');
  fs.writeFileSync(path.join(projectRoot, 'docs', 'review.md'), 'doc', 'utf8');
  fs.writeFileSync(path.join(projectRoot, 'src', 'backend', 'billing', 'service.js'), 'service', 'utf8');
  fs.writeFileSync(path.join(projectRoot, 'src', 'frontend', 'app.js'), 'app', 'utf8');
  return projectRoot;
}

function runLegacyInventory(projectTeamDir) {
  const result = spawnSync('grep', ['-R', '-n', '-E', LEGACY_ALIAS_PATTERN, projectTeamDir], {
    encoding: 'utf8'
  });

  const output = result.stdout.trim();
  const files = new Set();
  if (output) {
    for (const line of output.split('\n')) {
      const firstColon = line.indexOf(':');
      if (firstColon === -1) {
        continue;
      }
      const absolutePath = line.slice(0, firstColon);
      files.add(path.relative(projectTeamDir, absolutePath).replace(/\\/g, '/'));
    }
  }

  const unexpected = [...files].filter((file) => !APPROVED_LEGACY_FILES.has(file)).sort();
  return {
    status: result.status,
    files: [...files].sort(),
    unexpected,
    stdout: output
  };
}

describe('acceptance harness install coverage', () => {
  test.each([
    ['global', 'lite'],
    ['global', 'standard'],
    ['global', 'full'],
    ['local', 'lite'],
    ['local', 'standard'],
    ['local', 'full']
  ])('installs %s %s with registry-aligned artifacts and hook counts', (installMode, mode) => {
    const { sandboxRoot, sandboxProjectTeam } = copyProjectTeamFixture();
    const homeDir = path.join(sandboxRoot, 'home');
    fs.mkdirSync(homeDir, { recursive: true });

    try {
      assertModeInstall({ sandboxProjectTeam, installMode, mode, homeDir });
    } finally {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  test('full to lite downgrade removes stale project-team-owned artifacts and commands', () => {
    const { sandboxRoot, sandboxProjectTeam } = copyProjectTeamFixture();
    const homeDir = path.join(sandboxRoot, 'home');
    fs.mkdirSync(homeDir, { recursive: true });

    try {
      runInstaller({ sandboxProjectTeam, installMode: 'global', mode: 'full', homeDir });
      runInstaller({ sandboxProjectTeam, installMode: 'global', mode: 'lite', homeDir });

      const scopeRoot = getScopeRoot(sandboxProjectTeam, 'global', homeDir);
      const litePayload = buildModePayload(REGISTRY, 'lite');
      const fullPayload = buildModePayload(REGISTRY, 'full');
      const staleArtifacts = [
        ...fullPayload.artifacts.hooks.filter((item) => !litePayload.artifacts.hooks.includes(item)),
        ...fullPayload.artifacts.agents.filter((item) => !litePayload.artifacts.agents.includes(item))
      ];

      for (const relPath of staleArtifacts) {
        expect(fs.existsSync(path.join(scopeRoot, relPath))).toBe(false);
      }

      const hookConfig = readJson(path.join(scopeRoot, 'hooks', 'project-team-hooks.json'));
      const settings = readJson(path.join(scopeRoot, 'settings.json'));
      const staleBasenames = staleArtifacts.map((relPath) => path.basename(relPath));
      const installedCommands = flattenHookCommands(settings.hooks).join('\n');
      for (const basename of staleBasenames) {
        expect(installedCommands.includes(basename)).toBe(false);
      }
      expect(hookConfig.managed.mode).toBe('lite');
    } finally {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  test('manifest-less legacy upgrade rewrites ownership manifest successfully', () => {
    const { sandboxRoot, sandboxProjectTeam } = copyProjectTeamFixture();
    const homeDir = path.join(sandboxRoot, 'home');
    fs.mkdirSync(homeDir, { recursive: true });

    try {
      runInstaller({ sandboxProjectTeam, installMode: 'global', mode: 'standard', homeDir });
      const scopeRoot = getScopeRoot(sandboxProjectTeam, 'global', homeDir);
      fs.unlinkSync(path.join(scopeRoot, 'project-team-install-state.json'));

      runInstaller({ sandboxProjectTeam, installMode: 'global', mode: 'full', homeDir });

      const manifest = readJson(path.join(scopeRoot, 'project-team-install-state.json'));
      const hookConfig = readJson(path.join(scopeRoot, 'hooks', 'project-team-hooks.json'));
      expect(manifest.mode).toBe('full');
      expect(manifest.ownedArtifacts).toEqual(expect.arrayContaining(buildModePayload(REGISTRY, 'full').artifacts.hooks));
      expect(hookConfig.managed.mode).toBe('full');
    } finally {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });
});

describe('acceptance harness policy and context coverage', () => {
  test('permission checker accepts canonical JWTs and reviewer self-check writes only in docs/tests', () => {
    const projectRoot = createScopedProject();
    const auth = new AgentAuthService({ secretKey: 'test-secret' });

    try {
      const reviewerToken = auth.issueToken('reviewer-1', 'reviewer', null, 3600000, {
        reviewOnly: true
      });

      const allowed = runNodeScript(PERMISSION_CHECKER, {
        cwd: PROJECT_TEAM_ROOT,
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: projectRoot,
          CLAUDE_HOOK_SECRET: 'test-secret'
        },
        input: {
          tool_name: 'Write',
          tool_input: {
            file_path: path.join(projectRoot, 'tests', 'unit', 'reviewer.test.js'),
            agent_token: reviewerToken,
            self_check: true,
            changed_files: ['tests/unit/reviewer.test.js', 'docs/review.md']
          }
        }
      });
      expect(allowed.status).toBe(0);
      expect(allowed.stdout).toBe('');

      const denied = runNodeScript(PERMISSION_CHECKER, {
        cwd: PROJECT_TEAM_ROOT,
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: projectRoot,
          CLAUDE_HOOK_SECRET: 'test-secret'
        },
        input: {
          tool_name: 'Write',
          tool_input: {
            file_path: path.join(projectRoot, 'src', 'backend', 'billing', 'service.js'),
            agent_token: reviewerToken,
            self_check: true,
            changed_files: ['tests/unit/reviewer.test.js', 'docs/review.md']
          }
        }
      });
      expect(denied.status).toBe(0);
      expect(JSON.parse(denied.stdout)).toMatchObject({ decision: 'block' });

      const builderToken = auth.issueToken('builder-1', 'builder', 'backend', 3600000, {
        allowedPaths: ['src/backend/billing/**']
      });
      const verifiedBuilder = auth.verifyToken(builderToken);
      expect(verifiedBuilder).toMatchObject({
        valid: true,
        role: 'builder',
        allowedPaths: ['src/backend/billing/**']
      });
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('domain boundary enforcer blocks builder writes outside scoped paths', () => {
    const projectRoot = createScopedProject();
    const auth = new AgentAuthService({ secretKey: 'test-secret' });

    try {
      const builderToken = auth.issueToken('builder-1', 'builder', 'backend', 3600000, {
        allowedPaths: ['src/backend/billing/**']
      });

      const allowed = runNodeScript(DOMAIN_BOUNDARY_ENFORCER, {
        cwd: PROJECT_TEAM_ROOT,
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: projectRoot,
          CLAUDE_HOOK_SECRET: 'test-secret'
        },
        input: {
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: {
            file_path: path.join(projectRoot, 'src', 'backend', 'billing', 'service.js'),
            agent_token: builderToken
          }
        }
      });
      expect(allowed.status).toBe(0);
      expect(allowed.stdout).toBe('');

      const blocked = runNodeScript(DOMAIN_BOUNDARY_ENFORCER, {
        cwd: PROJECT_TEAM_ROOT,
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: projectRoot,
          CLAUDE_HOOK_SECRET: 'test-secret'
        },
        input: {
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: {
            file_path: path.join(projectRoot, 'src', 'frontend', 'app.js'),
            agent_token: builderToken
          }
        }
      });
      expect(blocked.status).toBe(0);
      expect(JSON.parse(blocked.stdout)).toMatchObject({ decision: 'block' });
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('context injector emits deterministic payload and scoped token contract', () => {
    const projectRoot = makeTempDir('project-team-context-');
    const projectConfig = {
      domains: [
        {
          name: 'billing',
          path: 'src/backend/billing',
          resources: { api_contract: 'contracts/interfaces/billing-api.yaml' }
        },
        {
          name: 'checkout-ui',
          path: 'src/frontend/checkout',
          resources: { api_contract: 'contracts/interfaces/checkout-ui-api.yaml' }
        }
      ]
    };

    try {
      const handoff = buildRuntimeHandoff({
        task_id: 'T8-acceptance',
        title: 'Review backend and frontend coordination',
        domains: ['billing', 'checkout-ui'],
        cross_domain: true,
        changed_paths: ['src/backend/billing/service.js', 'src/frontend/checkout/page.tsx']
      }, {
        targetRole: 'reviewer',
        projectRoot,
        projectConfig,
        secretKey: 'test-secret',
        nowMs: 1741305600000,
        expiresInSeconds: 900
      });

      expect(handoff.payload).toMatchObject({
        task_id: 'T8-acceptance',
        target_role: 'reviewer',
        scope_profile: 'fullstack',
        review_only: true,
        risk_level: 'HIGH',
        contracts: [
          'contracts/interfaces/billing-api.yaml',
          'contracts/interfaces/checkout-ui-api.yaml'
        ]
      });
      expect(fs.existsSync(handoff.payloadPath)).toBe(true);
      expect(decodeJwtPayload(handoff.scopedToken)).toMatchObject({
        role: 'reviewer',
        review_only: true,
        advisory_only: true,
        scope_id: 'T8-acceptance:reviewer:fullstack'
      });
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

describe('acceptance harness legacy inventory coverage', () => {
  test('grep-based legacy inventory passes only for approved compatibility surfaces', () => {
    const inventory = runLegacyInventory(PROJECT_TEAM_ROOT);
    expect(inventory.status).toBe(0);
    expect(inventory.unexpected).toEqual([]);
    expect(inventory.files).not.toEqual(expect.arrayContaining([
      'examples/ecommerce/project-team.yaml',
      'examples/saas/project-team.yaml',
      'templates/project-team.yaml'
    ]));
    expect(inventory.files.every((file) => APPROVED_LEGACY_FILES.has(file))).toBe(true);
  });

  test('grep-based legacy inventory fails on active drift', () => {
    const { sandboxRoot, sandboxProjectTeam } = copyProjectTeamFixture();

    try {
      const driftFile = path.join(sandboxProjectTeam, 'scripts', 'active-drift.js');
      fs.writeFileSync(driftFile, `module.exports = "${['project', 'manager'].join('-')}";\n`, 'utf8');

      const inventory = runLegacyInventory(sandboxProjectTeam);
      expect(inventory.unexpected).toContain('scripts/active-drift.js');
    } finally {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });
});
