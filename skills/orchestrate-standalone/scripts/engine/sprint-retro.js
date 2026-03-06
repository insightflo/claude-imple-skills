#!/usr/bin/env node
/**
 * Sprint Retrospective for Orchestrate Standalone
 *
 * Calculates sprint completion metrics, appends retrospective notes,
 * adjusts velocity recommendation, and transitions sprint state.
 *
 * @TASK orchestrate-standalone
 * @SPEC SKILL.md
 */

const fs = require('fs');
const path = require('path');
const state = require('./sprint-state');

const ROOT = process.cwd();
const TASKS_FILE = path.join(ROOT, 'TASKS.md');
const RETRO_FILE = path.join(ROOT, '.claude', 'sprint-retro.md');

function toInt(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const n = parseInt(value.replace(/,/g, '').trim(), 10);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function formatDateLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCurrentSprintIndex(sprintState) {
  if (!sprintState || !Array.isArray(sprintState.sprints) || sprintState.sprints.length === 0) {
    return -1;
  }

  const current = sprintState.current_sprint;

  if (Number.isInteger(current) && current >= 1 && current <= sprintState.sprints.length) {
    return current - 1;
  }

  if (typeof current === 'string' && current.trim()) {
    const key = current.trim();
    const idx = sprintState.sprints.findIndex((s) => {
      if (!s || typeof s !== 'object') return false;
      return s.id === key || s.sprint_id === key || s.name === key;
    });
    if (idx >= 0) return idx;
  }

  return 0;
}

function getCurrentSprintNumber(sprintState, index) {
  if (Number.isInteger(sprintState && sprintState.current_sprint) && sprintState.current_sprint > 0) {
    return sprintState.current_sprint;
  }

  const sprint = sprintState && Array.isArray(sprintState.sprints) ? sprintState.sprints[index] : null;
  const n = toInt(sprint && (sprint.sprint_id || sprint.sprint || sprint.number), 0);
  return n > 0 ? n : (index + 1);
}

function getPlannedTaskCount(sprint) {
  if (!sprint || typeof sprint !== 'object') return 0;

  const planned = toInt(
    sprint.task_count ||
      sprint.total_tasks ||
      sprint.planned_task_count ||
      sprint.planned_total ||
      sprint.total,
    0
  );

  if (planned > 0) return planned;
  if (Array.isArray(sprint.tasks)) return sprint.tasks.length;
  if (Array.isArray(sprint.task_ids)) return sprint.task_ids.length;

  return 0;
}

function normalizeTaskId(id) {
  return String(id || '').trim().toUpperCase();
}

function getSprintTaskIds(sprint) {
  const ids = [];

  if (Array.isArray(sprint && sprint.tasks)) {
    for (const task of sprint.tasks) {
      if (typeof task === 'string') {
        const id = normalizeTaskId(task);
        if (id) ids.push(id);
        continue;
      }
      if (task && typeof task === 'object') {
        const id = normalizeTaskId(task.id || task.task_id || task.taskId || task.name);
        if (id) ids.push(id);
      }
    }
  }

  if (ids.length === 0 && Array.isArray(sprint && sprint.task_ids)) {
    for (const taskId of sprint.task_ids) {
      const id = normalizeTaskId(taskId);
      if (id) ids.push(id);
    }
  }

  return Array.from(new Set(ids));
}

function parseCompletedTaskIds(tasksPath) {
  let content;
  try {
    content = fs.readFileSync(tasksPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('TASKS.md 파일을 찾을 수 없습니다.');
    }
    throw new Error(`TASKS.md 읽기 실패: ${error.message}`);
  }

  const completed = new Set();
  const lines = content.split(/\r?\n/);
  let parsedTaskLines = 0;

  // Supports:
  // - [x] T1.1: ...
  // ### [x] P1-T2: ...
  const taskLineRegex = /^\s*(?:[-*]\s*)?(?:#+\s*)?\[(x|X| )\]\s+([A-Za-z]\d+(?:[.\-][A-Za-z0-9]+)*)\b/;

  for (const line of lines) {
    const m = line.match(taskLineRegex);
    if (!m) continue;

    parsedTaskLines += 1;
    const checked = m[1].toLowerCase() === 'x';
    const taskId = normalizeTaskId(m[2]);

    if (checked && taskId) {
      completed.add(taskId);
    }
  }

  if (parsedTaskLines === 0) {
    throw new Error('TASKS.md 파싱 실패: 체크박스 태스크를 찾을 수 없습니다.');
  }

  return completed;
}

function countCompletedInSprint(sprintTaskIds, completedTaskIds) {
  let completed = 0;
  for (const id of sprintTaskIds) {
    if (completedTaskIds.has(normalizeTaskId(id))) completed += 1;
  }
  return completed;
}

function getBlockedSummary(sprint, sprintState) {
  let count = 0;

  if (Array.isArray(sprint && sprint.blocked_tasks)) {
    count = sprint.blocked_tasks.length;
  } else if (Array.isArray(sprint && sprint.tasks)) {
    count = sprint.tasks.filter((t) => {
      if (!t || typeof t !== 'object') return false;
      const status = String(t.status || '').toLowerCase();
      return t.blocked === true || status === 'blocked';
    }).length;
  }

  const byCountField = toInt(
    sprint && (sprint.blocked_count || sprint.blocked || sprint.total_blocked),
    -1
  );
  if (byCountField >= 0) count = byCountField;

  const reason =
    (sprint && (sprint.blocked_reason || sprint.blockedReason)) ||
    (sprintState && (sprintState.blocked_reason || sprintState.blockedReason)) ||
    '외부 의존성';

  return { count, reason: String(reason || '외부 의존성') };
}

function getTestFailureCount(sprint, sprintState) {
  const fromSprint = toInt(
    sprint &&
      (sprint.test_failures ||
        sprint.test_failed ||
        sprint.failed_tests ||
        (sprint.test_summary && sprint.test_summary.failed)),
    -1
  );
  if (fromSprint >= 0) return fromSprint;

  const fromState = toInt(
    sprintState &&
      sprintState.review &&
      (sprintState.review.test_failures || sprintState.review.test_failed),
    -1
  );
  if (fromState >= 0) return fromState;

  return 0;
}

function getUserFixRequest(sprint, sprintState) {
  const candidates = [
    sprint && sprint.user_fix_request,
    sprint && sprint.user_change_request,
    sprint && sprint.revision_request,
    sprint && sprint.review && sprint.review.instructions,
    sprintState && sprintState.review && sprintState.review.instructions
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '없음';
}

function calculateNextSprintSize(currentSize, completionRate) {
  if (completionRate < 80) {
    return Math.max(1, Math.round(currentSize * 0.85));
  }
  return Math.max(1, currentSize);
}

function appendRetroEntry(entry) {
  fs.mkdirSync(path.dirname(RETRO_FILE), { recursive: true });

  let prefix = '';
  if (fs.existsSync(RETRO_FILE)) {
    const existing = fs.readFileSync(RETRO_FILE, 'utf8');
    if (existing.trim().length > 0) {
      prefix = existing.endsWith('\n') ? '\n' : '\n\n';
    }
  }

  const lines = [
    `## Sprint ${entry.sprintNumber} Retro — ${entry.date}`,
    `- 완료율: ${entry.completionRate}% (${entry.completed}/${entry.planned})`,
    `- 차단: ${entry.blockedCount} tasks (${entry.blockedReason})`,
    `- 테스트 실패: ${entry.testFailures}`,
    `- 사용자 수정 요청: ${entry.userFixRequest}`,
    `- 다음 스프린트 권장 크기: ${entry.nextSprintSize} tasks (속도 조정)`,
    ''
  ];

  fs.appendFileSync(RETRO_FILE, prefix + lines.join('\n'), 'utf8');
}

function transitionSprintState(sprintState, currentIndex, nextSprintSize, completionRate) {
  const sprints = Array.isArray(sprintState.sprints) ? sprintState.sprints : [];
  const hasNextSprint = currentIndex >= 0 && currentIndex < (sprints.length - 1);

  sprintState.velocity = {
    last_completion_rate: completionRate,
    next_sprint_size: nextSprintSize,
    adjusted_at: new Date().toISOString()
  };

  if (hasNextSprint) {
    const nextSprint = sprints[currentIndex + 1];
    if (nextSprint && typeof nextSprint === 'object') {
      nextSprint.recommended_task_count = nextSprintSize;
    }

    if (Number.isInteger(sprintState.current_sprint)) {
      sprintState.current_sprint += 1;
    } else if (nextSprint && typeof nextSprint === 'object') {
      sprintState.current_sprint = nextSprint.sprint_id || nextSprint.id || nextSprint.name || (currentIndex + 2);
    } else {
      sprintState.current_sprint = currentIndex + 2;
    }

    state.transition('next_sprint');
    return;
  }

  state.transition('pi_complete');
}

function main() {
  try {
    const sprintState = state.get();
    if (!sprintState) {
      throw new Error('sprint-state.json 파일을 찾을 수 없습니다.');
    }

    if (!Array.isArray(sprintState.sprints) || sprintState.sprints.length === 0) {
      throw new Error('sprint-state.json 파싱 실패: sprints 정보가 없습니다.');
    }

    const currentIndex = getCurrentSprintIndex(sprintState);
    if (currentIndex < 0 || currentIndex >= sprintState.sprints.length) {
      throw new Error('sprint-state.json 파싱 실패: 현재 스프린트를 확인할 수 없습니다.');
    }

    const currentSprint = sprintState.sprints[currentIndex];
    const planned = getPlannedTaskCount(currentSprint);
    if (planned <= 0) {
      throw new Error('sprint-state.json 파싱 실패: 현재 스프린트의 계획 태스크 수가 없습니다.');
    }

    const sprintTaskIds = getSprintTaskIds(currentSprint);
    if (sprintTaskIds.length === 0) {
      throw new Error('sprint-state.json 파싱 실패: 현재 스프린트 task IDs가 없습니다.');
    }

    const completedTaskIds = parseCompletedTaskIds(TASKS_FILE);
    const completed = countCompletedInSprint(sprintTaskIds, completedTaskIds);
    const completionRate = Math.round((completed / planned) * 100);
    const nextSprintSize = calculateNextSprintSize(planned, completionRate);

    const blocked = getBlockedSummary(currentSprint, sprintState);
    const testFailures = getTestFailureCount(currentSprint, sprintState);
    const userFixRequest = getUserFixRequest(currentSprint, sprintState);

    appendRetroEntry({
      sprintNumber: getCurrentSprintNumber(sprintState, currentIndex),
      date: formatDateLocal(new Date()),
      completionRate,
      completed,
      planned,
      blockedCount: blocked.count,
      blockedReason: blocked.reason,
      testFailures,
      userFixRequest,
      nextSprintSize
    });

    transitionSprintState(sprintState, currentIndex, nextSprintSize, completionRate);
  } catch (error) {
    console.error(`오류: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main
};
