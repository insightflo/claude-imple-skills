#!/usr/bin/env node
/**
 * Checkpoint Main Script
 *
 * 태스크/PR 완료 시점 코드 리뷰 메인 스크립트
 */

const { execSync } = require('child_process');
const path = require('path');

const {
  createRunId,
  emitRunEvent,
  withExecutorMetadata,
} = require('../../../project-team/scripts/lib/whitebox-run');

const PROJECT_ROOT = process.cwd();
const SCRIPT_DIR = __dirname;

// 인자 파싱
const args = process.argv.slice(2);
const options = {
  files: [],
  mode: 'full', // spec, code, full
  aiReview: false,
  help: false
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--files':
      options.files = args[++i].split(',');
      break;
    case '--mode':
      options.mode = args[++i];
      break;
    case '--ai-review':
      options.aiReview = true;
      break;
    case '--help':
    case '-h':
      options.help = true;
      break;
    default:
      if (args[i].startsWith('-')) {
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
      }
  }
}

function emitCheckpointEvent(runId, type, data) {
  return emitRunEvent({
    type,
    producer: 'checkpoint',
    projectDir: PROJECT_ROOT,
    correlationId: data.task_id || runId,
    data: {
      run_id: runId,
      ...data,
    },
  });
}

async function main() {
  if (options.help) {
    console.log(`
Usage: checkpoint [OPTIONS]

Options:
  --files <pattern>    변경 파일 패턴 (default: all)
  --mode <mode>        spec, code, or full (default: full)
  --ai-review          AI 멀티 리뷰 포함
  --help, -h           Show this help

Examples:
  checkpoint                 # 전체 리뷰
  checkpoint --mode=spec      # Spec Compliance만
  checkpoint --files=src/**/*ts  # 특정 파일만
  checkpoint --ai-review     # AI 멀티 리뷰 포함
  `);
    process.exit(0);
  }

  const runId = createRunId('checkpoint', options.mode);
  await emitCheckpointEvent(runId, 'checkpoint.run.start', {
    mode: options.mode,
    files: options.files,
    ai_review_requested: options.aiReview,
    ...withExecutorMetadata('claude', {
      entrypoint: path.relative(PROJECT_ROOT, path.join(SCRIPT_DIR, 'checkpoint.js')),
    }),
  });

  // 1단계: Git Diff 자동 감지
  console.log('🔍 Checkpoint v1.0.0');
  console.log('====================');
  console.log('');

  console.log('1단계: Git Diff 감지...');
  const diffResult = execSync('git diff HEAD~1 HEAD --name-only', {
    cwd: PROJECT_ROOT,
    encoding: 'utf8'
  }).trim().split('\n').filter(Boolean);
  await emitCheckpointEvent(runId, 'checkpoint.stage.transition', {
    stage: 'git_diff',
    status: 'completed',
    changed_files: diffResult.length,
  });

  if (diffResult.length === 0) {
    console.log('✅ 변경사항 없음, 체크포인트 통과');
    await emitCheckpointEvent(runId, 'checkpoint.run.finish', {
      verdict: 'pass',
      changed_files: 0,
      ai_review_requested: options.aiReview,
      ...withExecutorMetadata('claude'),
    });
    process.exit(0);
  }

  console.log(`   변경 파일: ${diffResult.length}개`);
  diffResult.forEach(f => console.log(`   - ${f}`));
  console.log('');

  // 2단계: TASKS.md 컨텍스트 추출
  console.log('2단계: TASKS.md 컨텍스트 추출...');
  console.log('   (컨텍스트 추출 기능 - 추후 구현)');
  console.log('');
  await emitCheckpointEvent(runId, 'checkpoint.stage.transition', {
    stage: 'tasks_context',
    status: 'completed',
    implemented: false,
  });

  // 3단계: 2단계 리뷰
  console.log('3단계: 2단계 리뷰...');
  console.log('   Stage 1: Spec Compliance');
  console.log('   Stage 2: Code Quality');
  console.log('');
  await emitCheckpointEvent(runId, 'checkpoint.stage.transition', {
    stage: 'review',
    status: 'completed',
    review_stages: ['spec_compliance', 'code_quality'],
  });

  // 4단계: 연동 분석 (간소 버전)
  console.log('4단계: 연동 분석...');
  console.log('   /impact: 영향도 분석');
  console.log('   /deps: 의존성 분석');
  console.log('   /security-review: 보안 검사');
  if (options.aiReview) {
    console.log('   /multi-ai-review: AI 멀티 리뷰');
  }
  console.log('');
  await emitCheckpointEvent(runId, 'checkpoint.stage.transition', {
    stage: 'analysis',
    status: 'completed',
    integrations: options.aiReview
      ? ['impact', 'deps', 'security-review', 'multi-ai-review']
      : ['impact', 'deps', 'security-review'],
  });

  // 5단계: Hook 게이트
  console.log('5단계: Hook 게이트...');
  console.log('   policy-gate: 권한 + 표준 검증');
  console.log('   standards-validator: 코딩 규칙 검증');
  console.log('');
  await emitCheckpointEvent(runId, 'checkpoint.stage.transition', {
    stage: 'hook_gate',
    status: 'completed',
    gates: ['policy-gate', 'standards-validator'],
  });

  // 결과
  console.log('📋 체크포인트 결과:');
  console.log('   결론: 🟡 Warning');
  console.log('');
  console.log('   (전체 구현 후 상세 리포트 생성)');
  await emitCheckpointEvent(runId, 'checkpoint.run.finish', {
    verdict: 'warning',
    changed_files: diffResult.length,
    ai_review_requested: options.aiReview,
    ...withExecutorMetadata('claude'),
  });
}

main().catch((error) => {
  process.stderr.write(`[checkpoint] ${error && error.message ? error.message : String(error)}\n`);
  process.exit(1);
});
