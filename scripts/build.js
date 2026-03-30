#!/usr/bin/env node
'use strict';

/**
 * [파일 목적] 소스 스킬(plugin/skills/)을 멀티 프로바이더용으로 변환
 * [주요 흐름]
 *   1. plugin/skills/{skill}/SKILL.md 읽기
 *   2. YAML frontmatter 파싱
 *   3. 각 provider별 변환 + dist/ 출력
 * [외부 연결] scripts/lib/providers.js
 * [수정시 주의] 새 provider 추가 시 providers.js에 config 추가만 하면 됨
 */

const fs = require('fs');
const path = require('path');
const { PROVIDER_CONFIG } = require('./lib/providers');

const PLUGIN_DIR = path.resolve(__dirname, '..', 'plugin', 'skills');
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

// --- YAML frontmatter 파서 (외부 의존성 없음) ---

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const rawMeta = match[1];
  const body = match[2];
  const meta = {};

  // 간단한 YAML 파싱 (중첩 미지원, 스킬 frontmatter 수준)
  let currentKey = null;
  const lines = rawMeta.split('\n');

  for (const line of lines) {
    // key: (no value — array follows on next lines)
    const keyOnlyMatch = line.match(/^(\w[\w-]*)\s*:\s*$/);
    if (keyOnlyMatch) {
      currentKey = keyOnlyMatch[1];
      meta[currentKey] = [];
      continue;
    }

    // key: value
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let value = kvMatch[2].trim();
      // 따옴표 제거
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      meta[key] = value;
      currentKey = key;
      continue;
    }

    // 배열 항목:   - value
    const arrMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrMatch && currentKey) {
      if (!Array.isArray(meta[currentKey])) {
        meta[currentKey] = [];
      }
      let value = arrMatch[1].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      meta[currentKey].push(value);
      continue;
    }

    // 빈 줄이면 currentKey 리셋
    if (!line.trim()) currentKey = null;
  }

  return { meta, body };
}

function serializeFrontmatter(meta) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(meta)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        const needsQuote = /[:#{}[\],&*?|>!%@`]/.test(item) || item.includes("'");
        lines.push(`  - ${needsQuote ? '"' + item.replace(/"/g, '\\"') + '"' : item}`);
      }
    } else {
      const strVal = String(value);
      const needsQuote = /[:#{}[\],&*?|>!%@`]/.test(strVal) || strVal.includes("'");
      lines.push(`${key}: ${needsQuote ? '"' + strVal.replace(/"/g, '\\"') + '"' : strVal}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

// --- 스킬 디스커버리 ---

function discoverSkills() {
  const skills = [];
  const entries = fs.readdirSync(PLUGIN_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(PLUGIN_DIR, entry.name);
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;

    const content = fs.readFileSync(skillFile, 'utf8');
    const { meta, body } = parseFrontmatter(content);

    // 서브디렉토리 수집 (references, templates 등)
    const extras = [];
    const walk = (dir, rel) => {
      if (!fs.existsSync(dir)) return;
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        const relPath = path.join(rel, item.name);
        if (item.isDirectory()) {
          walk(fullPath, relPath);
        } else if (item.name !== 'SKILL.md') {
          extras.push({ relPath, fullPath });
        }
      }
    };
    walk(skillDir, '');

    skills.push({
      name: entry.name,
      meta,
      body,
      dir: skillDir,
      extras,
    });
  }

  return skills;
}

// --- Provider 변환 ---

function substituteVariables(text, variables) {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

function filterFrontmatter(meta, supportedFields) {
  const filtered = {};
  for (const field of supportedFields) {
    if (meta[field] !== undefined) {
      filtered[field] = meta[field];
    }
  }
  return filtered;
}

function transformSkill(skill, providerConfig) {
  // frontmatter 필터링
  const filteredMeta = filterFrontmatter(skill.meta, providerConfig.supportedFrontmatter);

  // body 변수 치환
  const transformedBody = substituteVariables(skill.body, providerConfig.variables);

  // 재조립
  const content = serializeFrontmatter(filteredMeta) + '\n' + transformedBody;
  return content;
}

function buildProvider(skills, providerConfig) {
  const providerDir = path.join(
    DIST_DIR,
    providerConfig.provider,
    providerConfig.skillsDir || 'skills'
  );

  let count = 0;
  for (const skill of skills) {
    const skillOutDir = path.join(providerDir, skill.name);
    fs.mkdirSync(skillOutDir, { recursive: true });

    // SKILL.md 변환 출력
    const content = transformSkill(skill, providerConfig);
    fs.writeFileSync(path.join(skillOutDir, 'SKILL.md'), content, 'utf8');

    // extras 복사 (references, templates, scripts 등)
    for (const extra of skill.extras) {
      const outPath = path.join(skillOutDir, extra.relPath);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });

      // .md 파일은 변수 치환 적용, 나머지는 그대로 복사
      if (extra.relPath.endsWith('.md')) {
        const raw = fs.readFileSync(extra.fullPath, 'utf8');
        const transformed = substituteVariables(raw, providerConfig.variables);
        fs.writeFileSync(outPath, transformed, 'utf8');
      } else {
        fs.copyFileSync(extra.fullPath, outPath);
      }
    }

    count++;
  }
  return count;
}

// --- CLI ---

function printHelp() {
  process.stdout.write(`
Multi-Provider Skill Build System

Usage:
  node scripts/build.js              Build all providers
  node scripts/build.js --clean      Remove dist/ and rebuild
  node scripts/build.js --provider=cursor  Build specific provider only
  node scripts/build.js --list       List discovered skills
  node scripts/build.js --help       Show this help

Providers: ${Object.keys(PROVIDER_CONFIG).join(', ')}
Source: plugin/skills/*/SKILL.md
Output: dist/{provider}/skills/{skill-name}/SKILL.md
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    printHelp();
    return;
  }

  // --clean
  if (args.includes('--clean')) {
    if (fs.existsSync(DIST_DIR)) {
      fs.rmSync(DIST_DIR, { recursive: true });
      process.stdout.write('[build] Cleaned dist/\n');
    }
  }

  // --list
  if (args.includes('--list')) {
    const skills = discoverSkills();
    process.stdout.write(`[build] Found ${skills.length} skills:\n`);
    for (const s of skills) {
      process.stdout.write(
        `  - ${s.name} (${s.meta.version || '?'}) [${s.extras.length} extras]\n`
      );
    }
    return;
  }

  // 스킬 발견
  const skills = discoverSkills();
  process.stdout.write(`[build] Discovered ${skills.length} skills from plugin/skills/\n`);

  // --provider 필터
  const providerArg = args.find((a) => a.startsWith('--provider='));
  const targetProvider = providerArg ? providerArg.split('=')[1] : null;

  const providers = targetProvider
    ? { [targetProvider]: PROVIDER_CONFIG[targetProvider] }
    : PROVIDER_CONFIG;

  if (targetProvider && !PROVIDER_CONFIG[targetProvider]) {
    process.stderr.write(`[build] Unknown provider: ${targetProvider}\n`);
    process.stderr.write(`[build] Available: ${Object.keys(PROVIDER_CONFIG).join(', ')}\n`);
    process.exit(1);
  }

  // 빌드
  fs.mkdirSync(DIST_DIR, { recursive: true });

  let totalFiles = 0;
  for (const [name, config] of Object.entries(providers)) {
    const count = buildProvider(skills, config);
    process.stdout.write(`[build] ${name}: ${count} skills → dist/${name}/\n`);
    totalFiles += count;
  }

  process.stdout.write(
    `[build] Done. ${totalFiles} skill sets generated across ${Object.keys(providers).length} providers.\n`
  );
}

main();
