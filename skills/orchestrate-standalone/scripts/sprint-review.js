#!/usr/bin/env node
/**
 * Sprint Review for Orchestrate Standalone
 *
 * Shows git diff stats, test results, and handles user gate decision.
 *
 * @TASK orchestrate-standalone
 * @SPEC SKILL.md
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const state = require('./sprint-state');

function stripAnsi(text) {
  return String(text || '').replace(/\x1B\[[0-9;]*m/g, '');
}

function toInt(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = parseInt(value.replace(/,/g, '').trim(), 10);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function getCurrentSprintFromState(sprintState) {
  if (!sprintState || !Array.isArray(sprintState.sprints) || sprintState.sprints.length === 0) {
    return null;
  }

  const current = sprintState.current_sprint;

  if (Number.isInteger(current) && current >= 1 && current <= sprintState.sprints.length) {
    return sprintState.sprints[current - 1];
  }

  if (typeof current === 'string' && current.trim()) {
    const byId = sprintState.sprints.find((s) =>
      s && (s.id === current || s.sprint_id === current || s.name === current)
    );
    if (byId) return byId;
  }

  return sprintState.sprints[0];
}

function getCurrentSprintNumber(sprintState) {
  if (Number.isInteger(sprintState && sprintState.current_sprint) && sprintState.current_sprint > 0) {
    return sprintState.current_sprint;
  }

  const sprint = getCurrentSprintFromState(sprintState);
  if (!sprint) return 1;

  if (Number.isInteger(sprint.number) && sprint.number > 0) return sprint.number;
  if (Number.isInteger(sprint.sprint) && sprint.sprint > 0) return sprint.sprint;

  return 1;
}

function getCurrentSprintStartCommit() {
  const sprintState = state.get();
  if (!sprintState) {
    throw new Error('sprint-state.json 파일을 찾을 수 없습니다.');
  }

  const sprint = getCurrentSprintFromState(sprintState);
  const commitFields = ['start_commit', 'startCommit', 'base_commit', 'baseCommit'];

  if (sprint && typeof sprint === 'object') {
    for (const key of commitFields) {
      if (typeof sprint[key] === 'string' && sprint[key].trim()) {
        return sprint[key].trim();
      }
    }
  }

  for (const key of commitFields) {
    if (typeof sprintState[key] === 'string' && sprintState[key].trim()) {
      return sprintState[key].trim();
    }
  }

  // Fallback: use HEAD~10 if no commit found
  return 'HEAD~10';
}

function normalizeDiffPath(filePart) {
  let p = filePart.trim();

  if (p.includes('{') && p.includes('=>')) {
    p = p.replace(/\{([^{}]*)=>\s*([^{}]+)\}/g, '$2');
  }

  if (p.includes('=>')) {
    p = p.split('=>').pop().trim();
  }

  return p.trim();
}

function topDir(filePath) {
  if (!filePath || filePath === '.' || filePath === './') return '(root)';
  const clean = filePath.replace(/^\.\/+/, '');
  const slash = clean.indexOf('/');
  return slash === -1 ? '(root)' : clean.slice(0, slash);
}

function parseDiffSummary(summaryLine) {
  if (!summaryLine) return { files: 0, insertions: 0, deletions: 0 };

  const filesMatch = summaryLine.match(/([\d,]+)\s+files?\s+changed/i);
  const insMatch = summaryLine.match(/([\d,]+)\s+insertions?\(\+\)/i);
  const delMatch = summaryLine.match(/([\d,]+)\s+deletions?\(-\)/i);

  return {
    files: filesMatch ? toInt(filesMatch[1], 0) : 0,
    insertions: insMatch ? toInt(insMatch[1], 0) : 0,
    deletions: delMatch ? toInt(delMatch[1], 0) : 0
  };
}

function getGitDiffStat(baseCommit) {
  if (!baseCommit || typeof baseCommit !== 'string') {
    throw new Error('baseCommit 값이 유효하지 않습니다.');
  }

  const cmd = `git diff --stat ${baseCommit} HEAD`;
  let output = '';

  try {
    output = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    const stderr = stripAnsi(String((error && error.stderr) || '')).trim();
    const msg = stderr || (error && error.message) || 'unknown error';
    throw new Error(`git diff 실행 실패: ${msg}`);
  }

  const lines = output.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  const summaryLine = [...lines].reverse().find((l) => /files?\s+changed|insertions?\(\+\)|deletions?\(-\)/i.test(l)) || '';
  const summary = parseDiffSummary(summaryLine);

  const fileLines = lines.filter((line) => line.includes('|'));
  const byDir = {};

  for (const line of fileLines) {
    const filePart = line.split('|')[0];
    if (!filePart) continue;
    const normalized = normalizeDiffPath(filePart);
    const dir = topDir(normalized);
    byDir[dir] = (byDir[dir] || 0) + 1;
  }

  const totalFiles = summary.files > 0 ? summary.files : fileLines.length;

  return {
    totalFiles,
    insertions: summary.insertions,
    deletions: summary.deletions,
    byDir
  };
}

function hasNpmTestScript() {
  const packagePath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packagePath)) return false;

  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return !!(pkg && pkg.scripts && typeof pkg.scripts.test === 'string' && pkg.scripts.test.trim());
  } catch (_) {
    return false;
  }
}

function hasPytest() {
  try {
    execSync('pytest --version', { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    return true;
  } catch (_) {
    return false;
  }
}

function extractMaxCount(text, patterns) {
  let max = 0;
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let m;
    while ((m = re.exec(text)) !== null) {
      const n = toInt(m[1], 0);
      if (n > max) max = n;
    }
  }
  return max;
}

function extractFailedTests(text, limit = 10) {
  const failed = new Set();
  const add = (name) => {
    const clean = stripAnsi(String(name || '')).trim();
    if (!clean) return;
    if (failed.size < limit) failed.add(clean);
  };

  let m;
  const pytestRe = /^\s*FAILED\s+([^\s]+(?:::[^\s]+)*)/gm;
  while ((m = pytestRe.exec(text)) !== null && failed.size < limit) add(m[1]);

  const failLineRe = /^\s*FAIL(?:ED)?\s+(.+)$/gm;
  while ((m = failLineRe.exec(text)) !== null && failed.size < limit) add(m[1]);

  const jestCaseRe = /^\s*[✕×x]\s+(.+)$/gm;
  while ((m = jestCaseRe.exec(text)) !== null && failed.size < limit) add(m[1]);

  const inlinePytestRe = /([A-Za-z0-9_./\\-]+::[A-Za-z0-9_./\\-]+)/g;
  while ((m = inlinePytestRe.exec(text)) !== null && failed.size < limit) add(m[1]);

  return Array.from(failed).slice(0, limit);
}

function parseTestResult(output, success) {
  const text = stripAnsi(output || '');

  const passed = extractMaxCount(text, [
    /(\d+)\s+passed\b/gi,
    /(\d+)\s+passing\b/gi,
    /(\d+)\s+tests?\s+passed\b/gi
  ]);

  let failed = extractMaxCount(text, [
    /(\d+)\s+failed\b/gi,
    /(\d+)\s+failing\b/gi,
    /(\d+)\s+errors?\b/gi,
    /(\d+)\s+tests?\s+failed\b/gi
  ]);

  const noTestsPattern = /(no tests ran|no tests collected|collected 0 items|no tests found|0 tests\b)/i;
  const noTests = noTestsPattern.test(text) || (passed === 0 && failed === 0 && /\b0 passing\b/i.test(text));

  if (!success && !noTests && failed === 0) {
    failed = 1;
  }

  return {
    passed,
    failed,
    failedTests: extractFailedTests(text, 10),
    noTests
  };
}

function runTestCommand(command, runner) {
  try {
    const stdout = execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024
    });
    const parsed = parseTestResult(stdout, true);
    return { runner, ...parsed };
  } catch (error) {
    const stdout = String((error && error.stdout) || '');
    const stderr = String((error && error.stderr) || '');
    const combined = `${stdout}\n${stderr}`.trim();
    const parsed = parseTestResult(combined, false);
    return { runner, ...parsed };
  }
}

function runTests() {
  if (hasNpmTestScript()) {
    return runTestCommand('npm test', 'npm');
  }

  if (hasPytest()) {
    return runTestCommand('pytest --tb=short', 'pytest');
  }

  return { runner: null, passed: 0, failed: 0, failedTests: [], noTests: true };
}

function normalizeTask(task, index) {
  if (typeof task === 'string') {
    return { id: task, status: 'pending', index };
  }

  if (!task || typeof task !== 'object') {
    return { id: `task-${index + 1}`, status: 'pending', index };
  }

  const id = task.id || task.task_id || task.taskId || task.name || `task-${index + 1}`;
  let status = String(task.status || '').toLowerCase();

  if (!status) {
    if (task.completed === true) status = 'completed';
    else if (task.blocked === true) status = 'blocked';
    else if (task.skipped === true) status = 'skipped';
    else status = 'pending';
  }

  return { id, status, index };
}

function isCompletedStatus(status) {
  return new Set(['completed', 'done', 'success', 'passed', 'finished']).has(String(status || '').toLowerCase());
}

function toTaskLabel(entry, fallbackStatus) {
  if (typeof entry === 'string') return `${entry} (${fallbackStatus})`;
  if (entry && typeof entry === 'object') {
    const id = entry.id || entry.task_id || entry.taskId || entry.name || 'unknown';
    const status = String(entry.status || fallbackStatus || 'pending').toLowerCase();
    return `${id} (${status})`;
  }
  return `unknown (${fallbackStatus || 'pending'})`;
}

function getTaskSummary(sprintState) {
  const sprint = getCurrentSprintFromState(sprintState);
  let tasks = [];

  if (sprint && Array.isArray(sprint.tasks)) {
    tasks = sprint.tasks.map(normalizeTask);
  } else if (Array.isArray(sprintState.tasks)) {
    const sprintNo = getCurrentSprintNumber(sprintState);
    const sprintId = sprint && (sprint.id || sprint.sprint_id);

    const filtered = sprintState.tasks.filter((t) => {
      if (!t || typeof t !== 'object') return false;
      if (Number.isInteger(t.sprint) && t.sprint === sprintNo) return true;
      if (Number.isInteger(t.sprint_index) && t.sprint_index === sprintNo) return true;
      if (sprintId && (t.sprint_id === sprintId || t.sprintId === sprintId)) return true;
      return false;
    });

    tasks = filtered.map(normalizeTask);
  }

  if (tasks.length > 0) {
    const total = tasks.length;
    const completed = tasks.filter((t) => isCompletedStatus(t.status)).length;
    const incomplete = tasks
      .filter((t) => !isCompletedStatus(t.status))
      .map((t) => `${t.id} (${t.status || 'pending'})`);

    return { total, completed, incomplete };
  }

  const total = toInt(
    (sprint && (sprint.total_tasks || sprint.task_count || sprint.total || sprint.planned_total)) ||
      (Array.isArray(sprint && sprint.planned_tasks) ? sprint.planned_tasks.length : 0),
    0
  );

  const completed = toInt(
    (sprint && (sprint.completed_count || sprint.done_count || sprint.total_completed)) ||
      (Array.isArray(sprint && sprint.completed_tasks) ? sprint.completed_tasks.length : 0),
    0
  );

  const incomplete = [];
  if (sprint && Array.isArray(sprint.blocked_tasks)) {
    for (const t of sprint.blocked_tasks) incomplete.push(toTaskLabel(t, 'blocked'));
  }
  if (sprint && Array.isArray(sprint.skipped_tasks)) {
    for (const t of sprint.skipped_tasks) incomplete.push(toTaskLabel(t, 'skipped'));
  }

  return { total, completed, incomplete };
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function printReview(sprintState, taskSummary, diffSummary, testSummary) {
  const sprintNumber = getCurrentSprintNumber(sprintState);
  const totalSprints = sprintState.total_sprints || sprintState.sprints?.length || '?';
  const percent = taskSummary.total > 0 ? Math.round((taskSummary.completed / taskSummary.total) * 100) : 0;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Sprint ${sprintNumber} Review`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`완료 태스크: ${taskSummary.completed}/${taskSummary.total} (${percent}%)`);
  console.log(`미완료: ${taskSummary.incomplete.length ? taskSummary.incomplete.join(', ') : '없음'}`);
  console.log('');
  console.log(
    `변경 파일: ${formatNumber(diffSummary.totalFiles)} files (+${formatNumber(diffSummary.insertions)} lines, -${formatNumber(diffSummary.deletions)} lines)`
  );

  const dirEntries = Object.entries(diffSummary.byDir).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (dirEntries.length > 0) {
    const labels = dirEntries.map(([dir]) => (dir === '(root)' ? '(root)/' : `${dir}/`));
    const maxLen = Math.max(...labels.map((d) => d.length));
    for (let i = 0; i < dirEntries.length; i += 1) {
      const [dir, count] = dirEntries[i];
      const label = dir === '(root)' ? '(root)/' : `${dir}/`;
      console.log(`  ${label.padEnd(maxLen)} — ${formatNumber(count)} files`);
    }
  }

  console.log('');
  if (testSummary.noTests) {
    console.log('테스트: 테스트 없음');
  } else {
    console.log(`테스트: ✅ ${formatNumber(testSummary.passed)} passed / ⚠️ ${formatNumber(testSummary.failed)} failed`);
    for (const name of testSummary.failedTests.slice(0, 10)) {
      console.log(`  FAIL: ${name}`);
    }
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const isLastSprint = sprintState.total_sprints > 0 && sprintNumber >= sprintState.total_sprints;
  const approveLabel = isLastSprint
    ? 'PI 완료 → Retrospective'
    : `Sprint ${sprintNumber + 1} 시작`;
  console.log(`[A] 승인 — ${approveLabel}`);
  console.log('[M] 수정 요청 — 지시사항 입력');
  console.log('[S] 중단 — 상태 저장 후 종료');
}

async function handleGateDecision(sprintState) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    for (;;) {
      const answer = String(await ask(rl, '선택 [A/M/S]: ')).trim().toUpperCase();

      if (answer === 'A') {
        state.transition('approve');
        rl.close();
        process.exit(0);
      }

      if (answer === 'M') {
        const instructions = String(await ask(rl, '수정 지시사항: ')).trim();
        const now = new Date().toISOString();

        if (!sprintState.review || typeof sprintState.review !== 'object') {
          sprintState.review = {};
        }
        sprintState.review.last_decision = 'modify';
        sprintState.review.instructions = instructions;
        sprintState.review.updated_at = now;

        const currentSprint = getCurrentSprintFromState(sprintState);
        if (currentSprint && typeof currentSprint === 'object') {
          if (!currentSprint.review || typeof currentSprint.review !== 'object') {
            currentSprint.review = {};
          }
          currentSprint.review.last_decision = 'modify';
          currentSprint.review.instructions = instructions;
          currentSprint.review.updated_at = now;
        }

        state.save();
        rl.close();
        process.exit(2);
      }

      if (answer === 'S') {
        state.transition('stop');
        rl.close();
        process.exit(3);
      }

      console.log('A, M, S 중 하나를 입력하세요.');
    }
  } catch (error) {
    rl.close();
    throw error;
  }
}

async function main() {
  try {
    const sprintState = state.get();
    if (!sprintState) {
      throw new Error('sprint-state.json 파일을 찾을 수 없습니다.');
    }

    const baseCommit = getCurrentSprintStartCommit();
    const taskSummary = getTaskSummary(sprintState);
    const diffSummary = getGitDiffStat(baseCommit);
    const testSummary = runTests();

    printReview(sprintState, taskSummary, diffSummary, testSummary);
    await handleGateDecision(sprintState);
  } catch (error) {
    console.error(`오류: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  getCurrentSprintStartCommit,
  getGitDiffStat,
  runTests
};
