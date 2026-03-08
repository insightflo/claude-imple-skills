#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function getProjectDir() {
  const fromEnv = process.env.CLAUDE_PROJECT_DIR;
  return path.resolve(fromEnv || process.cwd());
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readStdin() {
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => {
      if (!input.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(input));
      } catch {
        resolve({ raw: input });
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

async function runShim(name) {
  const projectDir = getProjectDir();

  if (name === 'session-summary-saver') {
    const payload = await readStdin();
    writeJson(path.join(projectDir, '.claude', 'session-summary.json'), {
      hook: name,
      project_dir: projectDir,
      saved_at: new Date().toISOString(),
      payload
    });
  }
}

module.exports = { runShim };

if (require.main === module) {
  const hookName = process.argv[2] || path.basename(process.argv[1], '.js');
  runShim(hookName).catch(() => {
    process.exit(0);
  });
}
