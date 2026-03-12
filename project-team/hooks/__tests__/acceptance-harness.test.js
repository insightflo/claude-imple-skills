'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const AgentAuthService = require('../../services/auth');
const { buildRuntimeHandoff } = require('../../services/context-injector');
const { buildModePayload, readRegistry } = require('../../scripts/install-registry');

const PROJECT_TEAM_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(PROJECT_TEAM_ROOT, '..');
const PERMISSION_CHECKER = path.join(PROJECT_TEAM_ROOT, 'hooks', 'permission-checker.js');
const DOMAIN_BOUNDARY_ENFORCER = path.join(PROJECT_TEAM_ROOT, 'hooks', 'domain-boundary-enforcer.js');
const INSTALL_REGISTRY = path.join(PROJECT_TEAM_ROOT, 'scripts', 'install-registry.js');
const DOCTOR_SCRIPT = path.join(PROJECT_TEAM_ROOT, 'scripts', 'doctor.js');
const LEASE_SCRIPT = path.join(PROJECT_TEAM_ROOT, 'scripts', 'lease.js');
const GUIDANCE_BUNDLE_SCRIPT = path.join(PROJECT_TEAM_ROOT, 'scripts', 'guidance-bundle.js');
const TASKS_INIT_GENERATOR = path.join(REPO_ROOT, 'skills', 'tasks-init', 'scripts', 'generate.js');
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
  'agents/BackendSpecialist.md',
  'agents/ChiefArchitect.md',
  'agents/ChiefDesigner.md',
  'agents/FrontendSpecialist.md',
  'agents/MaintenanceAnalyst.md',
  'agents/ProjectManager.md',
  'agents/QAManager.md',
  'agents/templates/DomainDesigner.md',
  'agents/templates/DomainDeveloper.md',
  'agents/templates/PartLeader.md',
  'config/capability-manifest.json',
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
  'hooks/__tests__/auto-orchestrator-routing.test.js',
  'hooks/__tests__/deterministic-policy.test.js',
  'hooks/__tests__/permission-checker.test.js',
  'hooks/__tests__/risk-area-warning.test.js',
  'hooks/__tests__/whitebox-control-plane.test.js',
  'hooks/__tests__/worker-cli-routing.test.js',
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

function runNodeCommand(args, { cwd, env }) {
  return spawnSync(process.execPath, args, {
    cwd,
    env,
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
      expect(JSON.parse(denied.stdout)).toMatchObject({ decision: 'deny' });

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

describe('acceptance harness closure fixtures', () => {
  test('lease script acquires and releases canonical artifact leases', () => {
    const projectDir = makeTempDir('lease-acquire-release-');
    fs.mkdirSync(path.join(projectDir, '.claude', 'collab', 'locks'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '');
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 1\n- [ ] T1.1: Fixture\n', 'utf8');

    try {
      const acquireResult = runNodeCommand([LEASE_SCRIPT, 'acquire', 'TASKS.md', '--holder=agent:P1-T3', '--ttl=60', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env: { ...process.env }
      });
      expect(acquireResult.status).toBe(0);
      expect(JSON.parse(acquireResult.stdout)).toMatchObject({ ok: true, status: 'active' });

      const statusResult = runNodeCommand([LEASE_SCRIPT, 'status', 'TASKS.md', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env: { ...process.env }
      });
      expect(statusResult.status).toBe(0);
      expect(JSON.parse(statusResult.stdout).leases).toEqual(expect.arrayContaining([
        expect.objectContaining({ target: 'TASKS.md', status: 'active', lease: expect.objectContaining({ holder: 'agent:P1-T3' }) })
      ]));

      const releaseResult = runNodeCommand([LEASE_SCRIPT, 'release', 'TASKS.md', '--holder=agent:P1-T3', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env: { ...process.env }
      });
      expect(releaseResult.status).toBe(0);
      expect(JSON.parse(releaseResult.stdout)).toMatchObject({ ok: true, status: 'released' });
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('stale lease can be released by human override', () => {
    const projectDir = makeTempDir('lease-stale-force-');
    const lockDir = path.join(projectDir, '.claude', 'collab', 'locks');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '');
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 1\n- [ ] T1.1: Fixture\n', 'utf8');
    const staleLease = {
      schema_version: 1,
      target: 'TASKS.md',
      holder: 'agent:stale-owner',
      ttl_seconds: 1,
      acquired_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z'
    };
    const staleLeaseName = `${crypto.createHash('sha1').update('TASKS.md').digest('hex').slice(0, 12)}.lease.json`;
    fs.writeFileSync(path.join(lockDir, staleLeaseName), JSON.stringify(staleLease, null, 2));

    try {
      const statusResult = runNodeCommand([LEASE_SCRIPT, 'status', 'TASKS.md', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env: { ...process.env }
      });
      expect(statusResult.status).toBe(0);
      expect(JSON.parse(statusResult.stdout).leases[0]).toMatchObject({ status: 'stale' });

      const releaseResult = runNodeCommand([LEASE_SCRIPT, 'release', 'TASKS.md', '--holder=human:operator', '--force', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env: { ...process.env }
      });
      expect(releaseResult.status).toBe(0);
      expect(JSON.parse(releaseResult.stdout)).toMatchObject({ ok: true, status: 'force_released' });
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('active lease cannot be released without holder unless force is used', () => {
    const projectDir = makeTempDir('lease-owner-guard-');
    fs.mkdirSync(path.join(projectDir, '.claude', 'collab', 'locks'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '');
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 1\n- [ ] T1.1: Fixture\n', 'utf8');

    try {
      const acquireResult = runNodeCommand([LEASE_SCRIPT, 'acquire', 'TASKS.md', '--holder=agent:P2-T1', '--ttl=60', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env: { ...process.env }
      });
      expect(acquireResult.status).toBe(0);

      const releaseResult = runNodeCommand([LEASE_SCRIPT, 'release', 'TASKS.md', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env: { ...process.env }
      });
      expect(releaseResult.status).not.toBe(0);
      expect(releaseResult.stderr).toContain('LEASE_HOLDER_REQUIRED');
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('doctor reports healthy project state from canonical checks', () => {
    const { sandboxRoot, sandboxProjectTeam } = copyProjectTeamFixture();
    const projectDir = makeTempDir('doctor-healthy-');

    try {
      fs.mkdirSync(path.join(projectDir, '.claude', 'collab'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, '.claude', 'orchestrate'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 1\n- [ ] T1.1: Fixture\n', 'utf8');
      fs.writeFileSync(path.join(projectDir, '.claude', 'orchestrate-state.json'), JSON.stringify({ tasks: [] }, null, 2));
      fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'events.ndjson'), '');
      fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'control.ndjson'), '');
      fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'control-state.json'), JSON.stringify({ pending_approvals: [], resolved_approvals: [], command_results: [] }, null, 2));
      fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'board-state.json'), JSON.stringify({ columns: { Backlog: [], 'In Progress': [], Blocked: [], Done: [] }, decisions: [], derived_from: {} }, null, 2));
      fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'whitebox-summary.json'), JSON.stringify({ gate_status: 'idle', blocked_count: 0, pending_approval_count: 0, stale_artifact_count: 0, tasks: { done: 0, total: 1 } }, null, 2));

      const homeDir = path.join(sandboxRoot, 'home');
      fs.mkdirSync(homeDir, { recursive: true });
      runInstaller({ sandboxProjectTeam, installMode: 'local', mode: 'standard', homeDir });

      const doctorResult = runNodeCommand([DOCTOR_SCRIPT, `--project-dir=${projectDir}`, '--mode=standard', '--install-mode=local', `--target-base=${path.join(sandboxProjectTeam, '.claude')}`, '--json'], {
        cwd: sandboxProjectTeam,
        env: { ...process.env }
      });
      expect(doctorResult.status).toBe(0);
      const report = JSON.parse(doctorResult.stdout);
      expect(report.ok).toBe(true);
      expect(report.sections.install.status).toBe('pass');
      expect(report.sections.runtime.status).toBe('pass');
      expect(report.sections.whitebox.status).toBe('warn');
      expect(report.sections.recovery.status).toBe('pass');
    } finally {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('recover-status prefers canonical runtime state over TASKS heuristics in addendum fixture', () => {
    const projectDir = makeTempDir('doctor-recover-priority-');
    fs.mkdirSync(path.join(projectDir, '.claude', 'orchestrate'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, '.claude', 'collab'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'TASKS.md'), '## Phase 1\n- [ ] T1.1: heuristic fallback\n', 'utf8');
    fs.writeFileSync(path.join(projectDir, '.claude', 'orchestrate', 'auto-state.json'), JSON.stringify({
      session_id: 'run-addendum-recover-acceptance',
      pending_gate: {
        gate_id: 'gate-addendum-recover-acceptance',
        gate_name: 'Acceptance Gate',
        task_id: 'T3.9',
        run_id: 'run-addendum-recover-acceptance',
        correlation_id: 'gate:run-addendum-recover-acceptance:final_gate',
        choices: ['approve', 'reject'],
        default_behavior: 'wait_for_operator',
        timeout_policy: 'wait_60000ms',
        created_at: '2026-03-11T00:00:00.000Z',
        trigger_reason: 'Need operator action.',
        recommendation: 'Inspect and resolve the pending gate.'
      }
    }, null, 2));
    fs.writeFileSync(path.join(projectDir, '.claude', 'collab', 'whitebox-summary.json'), JSON.stringify({ gate_status: 'approval_required', blocked_count: 0, pending_approval_count: 0, stale_artifact_count: 0, tasks: { done: 0, total: 1 } }, null, 2));

    try {
      const recoverResult = runNodeCommand([path.join(REPO_ROOT, 'skills', 'recover', 'scripts', 'recover-status.js'), `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env: { ...process.env }
      });
      expect(recoverResult.status).toBe(0);
      const report = JSON.parse(recoverResult.stdout);
      expect(report.authoritative_source).toMatchObject({ kind: 'auto-state' });
      expect(report.non_authoritative_heuristics[0]).toMatchObject({ kind: 'tasks-md' });
      expect(report.resume_options[0]).toMatchObject({ id: 'inspect-pending-gate' });
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('doctor surfaces runtime failure from canonical checks', () => {
    const { sandboxRoot, sandboxProjectTeam } = copyProjectTeamFixture();
    const homeDir = path.join(sandboxRoot, 'home');
    fs.mkdirSync(homeDir, { recursive: true });

    try {
      runInstaller({ sandboxProjectTeam, installMode: 'global', mode: 'standard', homeDir });
      const scopeRoot = path.join(homeDir, '.claude');
      fs.unlinkSync(path.join(scopeRoot, 'hooks', 'quality-gate.js'));

      const doctorResult = runNodeCommand([DOCTOR_SCRIPT, `--project-dir=${sandboxProjectTeam}`, '--mode=standard', '--install-mode=global', `--target-base=${scopeRoot}`, '--json'], {
        cwd: sandboxProjectTeam,
        env: { ...process.env }
      });
      expect(doctorResult.status).not.toBe(0);
      const report = JSON.parse(doctorResult.stdout);
      expect(report.ok).toBe(false);
      expect(report.sections.runtime.status).toBe('fail');
      expect(report.sections.runtime.remediation).toContain('project-team/docs/INSTALLATION.md#hook-modes');
    } finally {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  test.each([
    ['local', 'lite'],
    ['local', 'standard'],
    ['local', 'full']
  ])('runtime-health passes for %s %s install', (installMode, mode) => {
    const { sandboxRoot, sandboxProjectTeam } = copyProjectTeamFixture();
    const homeDir = path.join(sandboxRoot, 'home');
    fs.mkdirSync(homeDir, { recursive: true });

    try {
      runInstaller({ sandboxProjectTeam, installMode, mode, homeDir });
      const scopeRoot = getScopeRoot(sandboxProjectTeam, installMode, homeDir);
      const healthResult = runNodeCommand([INSTALL_REGISTRY, 'runtime-health', mode, scopeRoot, installMode], {
        cwd: sandboxProjectTeam,
        env: { ...process.env }
      });
      expect(healthResult.status).toBe(0);
      expect(JSON.parse(healthResult.stdout)).toMatchObject({ ok: true, mode, installMode });
    } finally {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  test.each(['standard', 'full'])('%s install passes registry validation and runtime health', (mode) => {
    const { sandboxRoot, sandboxProjectTeam } = copyProjectTeamFixture();
    const homeDir = path.join(sandboxRoot, 'home');
    fs.mkdirSync(homeDir, { recursive: true });

    try {
      runInstaller({ sandboxProjectTeam, installMode: 'global', mode, homeDir });
      const scopeRoot = path.join(homeDir, '.claude');

      const validateResult = runNodeCommand([INSTALL_REGISTRY, 'validate'], {
        cwd: sandboxProjectTeam,
        env: { ...process.env }
      });
      expect(validateResult.status).toBe(0);

      const healthResult = runNodeCommand([INSTALL_REGISTRY, 'runtime-health', mode, scopeRoot, 'global'], {
        cwd: sandboxProjectTeam,
        env: { ...process.env }
      });
      expect(healthResult.status).toBe(0);
      expect(JSON.parse(healthResult.stdout)).toMatchObject({ ok: true, mode });
    } finally {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  test('lite runtime health keeps full-only gaps non-blocking', () => {
    const { sandboxRoot, sandboxProjectTeam } = copyProjectTeamFixture();
    const homeDir = path.join(sandboxRoot, 'home');
    fs.mkdirSync(homeDir, { recursive: true });

    try {
      runInstaller({ sandboxProjectTeam, installMode: 'global', mode: 'lite', homeDir });
      const scopeRoot = path.join(homeDir, '.claude');

      const healthResult = runNodeCommand([INSTALL_REGISTRY, 'runtime-health', 'lite', scopeRoot, 'global'], {
        cwd: sandboxProjectTeam,
        env: { ...process.env }
      });

      expect(healthResult.status).toBe(0);
      const report = JSON.parse(healthResult.stdout);
      expect(report.ok).toBe(true);
      expect(report.mode).toBe('lite');
      expect(report.required.missing).toEqual([]);
      expect(report.advisory.checkedCapabilities).toBeGreaterThanOrEqual(1);
    } finally {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  test.each([
    ['lite', 'permission-checker.js'],
    ['standard', 'quality-gate.js'],
    ['full', 'quality-gate.js']
  ])('runtime-health fails when required %s artifact is missing', (mode, artifactBasename) => {
    const { sandboxRoot, sandboxProjectTeam } = copyProjectTeamFixture();
    const homeDir = path.join(sandboxRoot, 'home');
    fs.mkdirSync(homeDir, { recursive: true });

    try {
      runInstaller({ sandboxProjectTeam, installMode: 'global', mode, homeDir });
      const scopeRoot = path.join(homeDir, '.claude');
      fs.unlinkSync(path.join(scopeRoot, 'hooks', artifactBasename));

      const healthResult = runNodeCommand([INSTALL_REGISTRY, 'runtime-health', mode, scopeRoot, 'global'], {
        cwd: sandboxProjectTeam,
        env: { ...process.env }
      });

      expect(healthResult.status).not.toBe(0);
      const report = JSON.parse(healthResult.stdout);
      expect(report.ok).toBe(false);
      expect(report.required.missing).toEqual(expect.arrayContaining([
        expect.objectContaining({ artifact: `hooks/${artifactBasename}` })
      ]));
    } finally {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  test('full mode installs compatibility profile artifacts documented for legacy compatibility', () => {
    const { sandboxRoot, sandboxProjectTeam } = copyProjectTeamFixture();
    const homeDir = path.join(sandboxRoot, 'home');
    fs.mkdirSync(homeDir, { recursive: true });

    try {
      runInstaller({ sandboxProjectTeam, installMode: 'global', mode: 'full', homeDir });
      const scopeRoot = path.join(homeDir, '.claude');
      const fullPayload = buildModePayload(REGISTRY, 'full');

      for (const relPath of fullPayload.artifacts.agents.filter((item) => item.includes('templates/'))) {
        expect(fs.existsSync(path.join(scopeRoot, relPath))).toBe(true);
      }

      runInstaller({ sandboxProjectTeam, installMode: 'global', mode: 'lite', homeDir });
      const litePayload = buildModePayload(REGISTRY, 'lite');
      const removedProfiles = fullPayload.artifacts.agents.filter((item) => item.includes('templates/') && !litePayload.artifacts.agents.includes(item));
      for (const relPath of removedProfiles) {
        expect(fs.existsSync(path.join(scopeRoot, relPath))).toBe(false);
      }
    } finally {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  test('tasks-init generator emits project-shaped verify contracts and fails without one', () => {
    const root = makeTempDir('tasks-init-verify-contract-');
    const makeProject = path.join(root, 'make-project');
    const nonMakeProject = path.join(root, 'nonmake-project');
    const missingProject = path.join(root, 'missing-project');
    fs.mkdirSync(makeProject, { recursive: true });
    fs.mkdirSync(path.join(nonMakeProject, 'scripts'), { recursive: true });
    fs.mkdirSync(missingProject, { recursive: true });
    fs.writeFileSync(path.join(makeProject, 'Makefile'), 'verify:\n\t@echo make verify fixture ok\n', 'utf8');
    fs.writeFileSync(path.join(nonMakeProject, 'scripts', 'verify_all.sh'), '#!/usr/bin/env bash\necho non-make verify fixture ok\n', 'utf8');
    fs.chmodSync(path.join(nonMakeProject, 'scripts', 'verify_all.sh'), 0o755);

    try {
      const makeResult = runNodeCommand([TASKS_INIT_GENERATOR], {
        cwd: makeProject,
        env: { ...process.env, PROJECT_NAME: 'make-project', FEATURES: 'auth' }
      });
      expect(makeResult.status).toBe(0);
      expect(makeResult.stdout).toContain('verify_cmd: make verify');

      const nonMakeResult = runNodeCommand([TASKS_INIT_GENERATOR], {
        cwd: nonMakeProject,
        env: { ...process.env, PROJECT_NAME: 'nonmake-project', FEATURES: 'auth' }
      });
      expect(nonMakeResult.status).toBe(0);
      expect(nonMakeResult.stdout).toContain('verify_cmd: bash scripts/verify_all.sh');

      const missingResult = runNodeCommand([TASKS_INIT_GENERATOR], {
        cwd: missingProject,
        env: { ...process.env, PROJECT_NAME: 'missing-project', FEATURES: 'auth' }
      });
      expect(missingResult.status).not.toBe(0);
      expect(missingResult.stderr).toContain('No executable verification contract found');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('guidance bundle builds from canonical sources and validates cleanly', () => {
    const projectDir = makeTempDir('guidance-bundle-build-');

    try {
      const buildResult = runNodeCommand([GUIDANCE_BUNDLE_SCRIPT, 'build', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env: { ...process.env }
      });
      expect(buildResult.status).toBe(0);
      const bundle = JSON.parse(buildResult.stdout);
      expect(bundle.source_count).toBeGreaterThanOrEqual(4);
      expect(bundle.sources.map((entry) => entry.path)).toEqual(expect.arrayContaining([
        'AGENTS.md',
        'project-team/config/capability-manifest.json',
        'project-team/config/topology-registry.json',
        'skills/whitebox/SKILL.md',
        'skills/recover/SKILL.md',
      ]));

      const validateResult = runNodeCommand([GUIDANCE_BUNDLE_SCRIPT, 'validate', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env: { ...process.env }
      });
      expect(validateResult.status).toBe(0);
      expect(JSON.parse(validateResult.stdout)).toMatchObject({ ok: true });

      const readResult = runNodeCommand([GUIDANCE_BUNDLE_SCRIPT, 'read', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env: { ...process.env }
      });
      expect(readResult.status).toBe(0);
      expect(JSON.parse(readResult.stdout)).toMatchObject({
        ok: true,
        bundle: expect.objectContaining({ source_count: bundle.source_count })
      });
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('guidance bundle validate detects stale sources', () => {
    const fixtureRoot = makeTempDir('guidance-bundle-stale-source-');
    const sourceRoot = path.join(fixtureRoot, 'source');
    const projectDir = path.join(fixtureRoot, 'project');
    fs.mkdirSync(path.join(sourceRoot, 'project-team', 'config'), { recursive: true });
    fs.mkdirSync(path.join(sourceRoot, 'skills', 'whitebox'), { recursive: true });
    fs.mkdirSync(path.join(sourceRoot, 'skills', 'recover'), { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'CLAUDE.md'), 'alpha', 'utf8');
    fs.writeFileSync(path.join(sourceRoot, 'AGENTS.md'), 'beta', 'utf8');
    fs.writeFileSync(path.join(sourceRoot, 'project-team', 'config', 'capability-manifest.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(sourceRoot, 'project-team', 'config', 'topology-registry.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(sourceRoot, 'skills', 'whitebox', 'SKILL.md'), 'gamma', 'utf8');
    fs.writeFileSync(path.join(sourceRoot, 'skills', 'recover', 'SKILL.md'), 'delta', 'utf8');

    try {
      const env = { ...process.env, GUIDANCE_SOURCE_ROOT: sourceRoot };
      const buildResult = runNodeCommand([GUIDANCE_BUNDLE_SCRIPT, 'build', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env
      });
      expect(buildResult.status).toBe(0);

      fs.writeFileSync(path.join(sourceRoot, 'CLAUDE.md'), 'alpha-updated', 'utf8');

      const validateResult = runNodeCommand([GUIDANCE_BUNDLE_SCRIPT, 'validate', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env
      });
      expect(validateResult.status).not.toBe(0);
      const report = JSON.parse(validateResult.stdout);
      expect(report.ok).toBe(false);
      expect(report.stale).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'CLAUDE.md' })
      ]));
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test('guidance bundle validate detects deleted canonical sources', () => {
    const fixtureRoot = makeTempDir('guidance-bundle-deleted-source-');
    const sourceRoot = path.join(fixtureRoot, 'source');
    const projectDir = path.join(fixtureRoot, 'project');
    fs.mkdirSync(path.join(sourceRoot, 'project-team', 'config'), { recursive: true });
    fs.mkdirSync(path.join(sourceRoot, 'skills', 'whitebox'), { recursive: true });
    fs.mkdirSync(path.join(sourceRoot, 'skills', 'recover'), { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'CLAUDE.md'), 'alpha', 'utf8');
    fs.writeFileSync(path.join(sourceRoot, 'AGENTS.md'), 'beta', 'utf8');
    fs.writeFileSync(path.join(sourceRoot, 'project-team', 'config', 'capability-manifest.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(sourceRoot, 'project-team', 'config', 'topology-registry.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(sourceRoot, 'skills', 'whitebox', 'SKILL.md'), 'gamma', 'utf8');
    fs.writeFileSync(path.join(sourceRoot, 'skills', 'recover', 'SKILL.md'), 'delta', 'utf8');

    try {
      const env = { ...process.env, GUIDANCE_SOURCE_ROOT: sourceRoot };
      const buildResult = runNodeCommand([GUIDANCE_BUNDLE_SCRIPT, 'build', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env
      });
      expect(buildResult.status).toBe(0);

      fs.unlinkSync(path.join(sourceRoot, 'CLAUDE.md'));

      const validateResult = runNodeCommand([GUIDANCE_BUNDLE_SCRIPT, 'validate', `--project-dir=${projectDir}`, '--json'], {
        cwd: PROJECT_TEAM_ROOT,
        env
      });
      expect(validateResult.status).not.toBe(0);
      const report = JSON.parse(validateResult.stdout);
      expect(report.ok).toBe(false);
      expect(report.stale).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'CLAUDE.md', actual: null })
      ]));
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
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
