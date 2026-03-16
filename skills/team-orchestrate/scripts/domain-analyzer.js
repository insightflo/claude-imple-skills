#!/usr/bin/env node
/**
 * Domain Analyzer for Agent Teams
 *
 * [파일 목적] TASKS.md를 파싱하여 도메인별 작업을 분류하고 팀 형성 프롬프트를 생성
 * [주요 흐름]
 *   1. TASKS.md 파싱 (내장 파서)
 *   2. 도메인별 작업 분류
 *   3. 팀원 배정 (team-topology.json 매핑)
 *   4. 팀 형성 프롬프트 JSON 출력
 * [외부 연결] team-topology.json (매핑)
 * [수정시 주의] TASKS.md 포맷 변경 시 parseTasks 수정 필요
 */

'use strict';

const fs = require('fs');
const path = require('path');

// TASKS.md 파서 (내장)
const parseTasks = null;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * [목적] 도메인→팀원 매핑 설정 로드
 * [출력] topology 객체
 */
function loadTopology() {
  const topologyPath = path.join(__dirname, '..', 'config', 'team-topology.json');

  if (fs.existsSync(topologyPath)) {
    try {
      return JSON.parse(fs.readFileSync(topologyPath, 'utf8'));
    } catch {
      // 파싱 실패 시 기본값 사용
    }
  }

  // 기본 토폴로지
  return {
    domainMapping: {
      backend: 'architecture-lead',
      api: 'architecture-lead',
      architecture: 'architecture-lead',
      shared: 'architecture-lead',
      frontend: 'design-lead',
      design: 'design-lead',
      ui: 'design-lead',
      test: 'qa-lead',
      quality: 'qa-lead',
      security: 'qa-lead',
    },
    teammates: {
      'architecture-lead': {
        executors: ['builder', 'reviewer'],
        domains: ['backend', 'api', 'architecture', 'shared'],
      },
      'qa-lead': {
        executors: ['reviewer', 'test-specialist'],
        domains: ['test', 'quality', 'security'],
      },
      'design-lead': {
        executors: ['designer', 'builder'],
        domains: ['frontend', 'design', 'ui'],
      },
    },
    defaultTeammate: 'architecture-lead',
  };
}

// ---------------------------------------------------------------------------
// Minimal TASKS.md Parser (fallback)
// ---------------------------------------------------------------------------

/**
 * [목적] scheduler.js를 사용할 수 없을 때의 경량 TASKS.md 파서
 * [입력] tasksPath — TASKS.md 경로
 * [출력] 태스크 배열
 */
function parseTasksFallback(tasksPath) {
  const content = fs.readFileSync(tasksPath, 'utf8');
  const lines = content.split('\n');
  const tasks = [];
  let currentTask = null;

  const taskPattern = /^-\s*\[([xX ])\]\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*(?:\.\d+)*):\s*(.+?)\s*$/;
  const metaPattern = /^\s{2,}-\s*(\w+):\s*(.+?)\s*$/;

  for (const line of lines) {
    const taskMatch = line.match(taskPattern);
    if (taskMatch) {
      if (currentTask) tasks.push(currentTask);
      currentTask = {
        id: taskMatch[2],
        description: taskMatch[3].trim(),
        status: taskMatch[1].toLowerCase() === 'x' ? 'completed' : 'pending',
        deps: [],
        domain: null,
        risk: 'low',
        files: [],
        owner: null,
      };
      continue;
    }

    if (currentTask) {
      const metaMatch = line.match(metaPattern);
      if (metaMatch) {
        const key = metaMatch[1].toLowerCase();
        const value = metaMatch[2].trim();

        if (key === 'deps') {
          currentTask.deps = value.replace(/^\[/, '').replace(/\]$/, '')
            .split(',').map((s) => s.trim()).filter(Boolean);
        } else if (key === 'domain') {
          currentTask.domain = value;
        } else if (key === 'risk') {
          currentTask.risk = value;
        } else if (key === 'files') {
          currentTask.files = value.split(',').map((s) => s.trim()).filter(Boolean);
        } else if (key === 'owner') {
          currentTask.owner = value;
        }
      }
    }
  }

  if (currentTask) tasks.push(currentTask);
  return tasks;
}

// ---------------------------------------------------------------------------
// Domain Analysis
// ---------------------------------------------------------------------------

/**
 * [목적] 태스크를 도메인별로 분류하고 팀원에게 배정
 * [입력] tasks — 태스크 배열, topology — 매핑 설정
 * [출력] 팀원별 배정 결과
 */
function analyzeDomains(tasks, topology) {
  const assignments = {};

  // 팀원별 초기화
  for (const [teammate, config] of Object.entries(topology.teammates)) {
    assignments[teammate] = {
      tasks: [],
      executors: config.executors,
      domains: new Set(),
      totalRisk: { low: 0, medium: 0, high: 0, critical: 0 },
    };
  }

  for (const task of tasks) {
    // 이미 완료된 태스크는 건너뛰기
    if (task.status === 'completed') continue;

    // 팀원 결정: owner 명시 > domain 매핑 > default
    let teammate;
    if (task.owner && topology.teammates[task.owner]) {
      teammate = task.owner;
    } else if (task.domain && topology.domainMapping[task.domain]) {
      teammate = topology.domainMapping[task.domain];
    } else {
      teammate = topology.defaultTeammate;
    }

    // 팀원이 assignments에 없으면 추가
    if (!assignments[teammate]) {
      assignments[teammate] = {
        tasks: [],
        executors: topology.teammates[teammate]?.executors || ['builder'],
        domains: new Set(),
        totalRisk: { low: 0, medium: 0, high: 0, critical: 0 },
      };
    }

    assignments[teammate].tasks.push(task);
    if (task.domain) assignments[teammate].domains.add(task.domain);
    const risk = task.risk || 'low';
    if (assignments[teammate].totalRisk[risk] !== undefined) {
      assignments[teammate].totalRisk[risk]++;
    }
  }

  // Set → Array로 변환
  for (const teammate of Object.keys(assignments)) {
    assignments[teammate].domains = Array.from(assignments[teammate].domains);
  }

  return assignments;
}

/**
 * [목적] 팀 형성 프롬프트 생성
 * [입력] assignments — 팀원별 배정 결과
 * [출력] 팀 형성에 필요한 구조화된 프롬프트 데이터
 */
function generateTeamFormation(assignments) {
  const activeTeammates = Object.entries(assignments)
    .filter(([, data]) => data.tasks.length > 0)
    .map(([teammate, data]) => ({
      agent: teammate,
      taskCount: data.tasks.length,
      taskIds: data.tasks.map((t) => t.id),
      executors: data.executors,
      domains: data.domains,
      riskProfile: data.totalRisk,
    }));

  const totalTasks = activeTeammates.reduce((sum, t) => sum + t.taskCount, 0);

  return {
    leader: 'team-lead',
    teammates: activeTeammates,
    summary: {
      totalTasks,
      activeTeammates: activeTeammates.length,
      domains: [...new Set(activeTeammates.flatMap((t) => t.domains))],
    },
  };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  // --tasks-file 파싱
  let tasksFile = 'TASKS.md';
  const tasksFileArg = args.find((a) => a.startsWith('--tasks-file'));
  if (tasksFileArg) {
    if (tasksFileArg.includes('=')) {
      tasksFile = tasksFileArg.split('=')[1];
    } else {
      const idx = args.indexOf(tasksFileArg);
      if (idx + 1 < args.length) tasksFile = args[idx + 1];
    }
  }

  // --json 플래그
  const jsonOutput = args.includes('--json');

  const tasksPath = path.resolve(tasksFile);
  if (!fs.existsSync(tasksPath)) {
    const error = { error: `TASKS.md not found: ${tasksPath}` };
    if (jsonOutput) {
      process.stdout.write(JSON.stringify(error, null, 2));
    } else {
      console.error(error.error);
    }
    process.exit(1);
  }

  // 태스크 파싱
  let tasks;
  if (parseTasks) {
    tasks = parseTasks(tasksPath);
  } else {
    tasks = parseTasksFallback(tasksPath);
  }

  // 토폴로지 로드 및 도메인 분석
  const topology = loadTopology();
  const assignments = analyzeDomains(tasks, topology);
  const formation = generateTeamFormation(assignments);

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(formation, null, 2));
  } else {
    console.log(`\nAgent Teams Domain Analysis`);
    console.log(`${'='.repeat(50)}`);
    console.log(`Total tasks: ${formation.summary.totalTasks}`);
    console.log(`Active teammates: ${formation.summary.activeTeammates}`);
    console.log(`Domains: ${formation.summary.domains.join(', ')}`);
    console.log(`\nTeam Formation:`);
    console.log(`  Leader: ${formation.leader}`);

    for (const tm of formation.teammates) {
      console.log(`\n  ${tm.agent} (${tm.taskCount} tasks)`);
      console.log(`     Domains: ${tm.domains.join(', ')}`);
      console.log(`     Executors: ${tm.executors.join(', ')}`);
      console.log(`     Tasks: ${tm.taskIds.join(', ')}`);
      console.log(`     Risk: L=${tm.riskProfile.low} M=${tm.riskProfile.medium} H=${tm.riskProfile.high} C=${tm.riskProfile.critical}`);
    }
  }
}

if (require.main === module) {
  main();
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

module.exports = {
  loadTopology,
  parseTasksFallback,
  analyzeDomains,
  generateTeamFormation,
};
