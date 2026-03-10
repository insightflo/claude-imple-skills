#!/usr/bin/env node
/**
 * tasks-init Task Generator
 *
 * Specialist 컨텍스트 주입으로 상세 태스크 생성:
 * - Backend Specialist → 백엔드 태스크 상세화
 * - Frontend Specialist → 프론트엔드 태스크 상세화
 * - Security Specialist → 보안 관련 태스크 추가
 * - 의존성 자동 계산
 * - 도메인 분리 (Domain-guarded)
 * - 위험도 자동 분류
 */

const fs = require('fs');

class TaskGenerator {
  constructor(projectInfo, analysisResult) {
    this.projectInfo = projectInfo;
    this.analysis = analysisResult;
    this.tasks = [];
    this.taskIdCounter = { T0: 0, T1: 0, T2: 0, T3: 0 };
  }

  /**
   * TASKS.md 생성
   */
  generate() {
    const tasks = this.generateAllTasks();
    return this.formatTasksMd(tasks);
  }

  generateAllTasks() {
    const allTasks = [];

    // T0 - Skeleton (구조)
    allTasks.push(...this.generateSkeletonTasks());

    // T1 - Muscles (핵심 기능) - Specialist 컨텍스트 주입
    allTasks.push(...this.generateMusclesTasks());

    // T2 - Muscles Advanced (고급 기능)
    allTasks.push(...this.generateAdvancedTasks());

    // T3 - Skin (마무리)
    allTasks.push(...this.generateSkinTasks());

    return allTasks;
  }

  generateSkeletonTasks() {
    const tasks = [];
    const phase = 'T0';

    tasks.push(this.createTask({
      phase,
      title: '프로젝트 초기 설정',
      description: '기본 프로젝트 설정과 구조를 생성합니다.',
      deps: [],
      domain: 'shared',
      risk: 'low',
      owner: 'project-manager',
      files: ['package.json', 'tsconfig.json', '.eslintrc.js']
    }));

    tasks.push(this.createTask({
      phase,
      title: '디렉토리 구조 생성',
      description: 'DDD/레이어드 구조에 맞춰 디렉토리를 생성합니다.',
      deps: [`${phase}.${this.taskIdCounter[phase]}`],
      domain: 'shared',
      risk: 'low',
      owner: 'chief-architect'
    }));

    tasks.push(this.createTask({
      phase,
      title: '타입/모델 정의',
      description: '공통 타입과 데이터 모델을 정의합니다.',
      deps: [`${phase}.${this.taskIdCounter[phase] - 1}`],
      domain: 'shared',
      risk: 'low',
      owner: 'backend-specialist',
      files: ['src/types/**/*.ts']
    }));

    tasks.push(this.createTask({
      phase,
      title: '라우팅/네비게이션 설정',
      description: '기본 라우팅 구조를 설정합니다.',
      deps: [`${phase}.${this.taskIdCounter[phase] - 2}`],
      domain: 'frontend',
      risk: 'low',
      owner: 'frontend-specialist'
    }));

    return tasks;
  }

  generateMusclesTasks() {
    const tasks = [];
    const phase = 'T1';

    // 사용자가 입력한 기능 목록을 기반으로 태스크 생성
    for (const feature of this.projectInfo.features || []) {
      const featureTasks = this.generateFeatureTasks(feature, phase);
      tasks.push(...featureTasks);
    }

    return tasks;
  }

  generateFeatureTasks(feature, phase) {
    const tasks = [];
    const featureName = feature.name || feature;
    const featureDesc = feature.description || '';

    // 백엔드 태스크 (Backend Specialist 컨텍스트)
    const backendTask = this.createTask({
      phase,
      title: `${featureName} API 설계`,
      description: `${featureName} 기능을 위한 백엔드 API를 설계합니다. ${featureDesc}`,
      deps: this.calculateBackendDeps(featureName),
      domain: 'backend',
      risk: this.calculateRisk(featureName, 'backend'),
      owner: 'backend-specialist',
      files: this.guessBackendFiles(featureName),
      metadata: this.getBackendContext(featureName)
    });
    tasks.push(backendTask);

    const backendImplTask = this.createTask({
      phase,
      title: `${featureName} API 구현`,
      description: `${featureName} API를 구현하고 테스트합니다.`,
      deps: [backendTask.id],
      domain: 'backend',
      risk: this.calculateRisk(featureName, 'implementation'),
      owner: 'backend-specialist',
      files: this.guessBackendFiles(featureName)
    });
    tasks.push(backendImplTask);

    // 프론트엔드 태스크 (Frontend Specialist 컨텍스트)
    const frontendTask = this.createTask({
      phase,
      title: `${featureName} 화면 구현`,
      description: `${featureName} 기능을 위한 UI를 구현합니다. ${featureDesc}`,
      deps: [backendImplTask.id],
      domain: 'frontend',
      risk: 'low',
      owner: 'frontend-specialist',
      files: this.guessFrontendFiles(featureName),
      metadata: this.getFrontendContext(featureName)
    });
    tasks.push(frontendTask);

    return tasks;
  }

  generateAdvancedTasks() {
    const tasks = [];
    const phase = 'T2';

    const advancedFeatures = [
      { name: '에러 핸들링', domain: 'shared', owner: 'backend-specialist' },
      { name: '로딩 상태 관리', domain: 'frontend', owner: 'frontend-specialist' },
      { name: '캐싱 레이어', domain: 'backend', owner: 'backend-specialist' },
      { name: '검증/폼 처리', domain: 'frontend', owner: 'frontend-specialist' }
    ];

    for (const feature of advancedFeatures) {
      tasks.push(this.createTask({
        phase,
        title: feature.name,
        description: `${feature.name} 기능을 구현합니다.`,
        deps: ['T1.*'], // 모든 T1 완료 후
        domain: feature.domain,
        risk: 'medium',
        owner: feature.owner
      }));
    }

    return tasks;
  }

  generateSkinTasks() {
    const tasks = [];
    const phase = 'T3';

    const skinFeatures = [
      { name: '디자인 시스템 적용', owner: 'chief-designer' },
      { name: '반응형 레이아웃', owner: 'frontend-specialist' },
      { name: '애니메이션/전환 효과', owner: 'frontend-specialist' },
      { name: '접근성 검토', owner: 'qa-manager' }
    ];

    for (const feature of skinFeatures) {
      tasks.push(this.createTask({
        phase,
        title: feature.name,
        description: `${feature.name}을/를 적용합니다.`,
        deps: ['T2.*'],
        domain: 'frontend',
        risk: 'low',
        owner: feature.owner
      }));
    }

    return tasks;
  }

  /**
   * 태스크 생성 헬퍼
   */
  createTask(options) {
    const { phase, title, description, deps = [], domain, risk, owner, model, files = [], metadata = {} } = options;

    // 태스크 ID 생성 (T1.1, T1.2, ...)
    const idNum = ++this.taskIdCounter[phase];
    const id = `${phase}.${idNum}`;

    return {
      id,
      title,
      description,
      deps: this.normalizeDeps(deps),
      domain,
      risk: risk || 'low',
      owner,
      model: model || null,
      files: Array.isArray(files) ? files : [],
      metadata,
      status: 'pending'
    };
  }

  normalizeDeps(deps) {
    // 와일드카드 의존성 처리 (예: ['T1.*', 'T2.1'])
    if (deps.includes('T0.*')) return [];
    if (deps.includes('T1.*')) {
      const t1Deps = [];
      for (let i = 1; i <= this.taskIdCounter.T1; i++) {
        t1Deps.push(`T1.${i}`);
      }
      return t1Deps;
    }
    if (deps.includes('T2.*')) {
      const t2Deps = [];
      for (let i = 1; i <= this.taskIdCounter.T2; i++) {
        t2Deps.push(`T2.${i}`);
      }
      return t2Deps;
    }
    return deps;
  }

  /**
   * 의존성 계산
   */
  calculateBackendDeps() {
    // 기존 코드 분석 기반 의존성 감지
    const deps = [];

    // 같은 도메인의 이전 태스크 참조
    if (this.taskIdCounter.T1 > 0) {
      deps.push(`T1.${this.taskIdCounter.T1}`);
    }

    return deps;
  }

  /**
   * 위험도 계산
   */
  calculateRisk(featureName, type) {
    const criticalFeatures = ['auth', 'payment', 'password', 'delete', 'admin'];
    const highFeatures = ['email', 'upload', 'external', 'api'];

    const name = featureName.toLowerCase();

    if (criticalFeatures.some(f => name.includes(f))) {
      return 'critical';
    }
    if (highFeatures.some(f => name.includes(f))) {
      return 'medium';
    }
    if (type === 'implementation') {
      return 'medium';
    }
    return 'low';
  }

  /**
   * 파일 경로 추정
   */
  guessBackendFiles(featureName) {
    const kebab = this.toKebabCase(featureName);
    return [
      `src/domains/${kebab}/*.ts`,
      `src/api/${kebab}/*.ts`,
      `src/services/${kebab}/*.ts`
    ];
  }

  guessFrontendFiles(featureName) {
    const kebab = this.toKebabCase(featureName);
    return [
      `src/screens/${kebab}/*.tsx`,
      `src/components/${kebab}/*.tsx`,
      `src/pages/${kebab}/*.tsx`
    ];
  }

  toKebabCase(str) {
    return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  /**
   * Specialist 컨텍스트 주입
   */
  getBackendContext() {
    return {
      specialist: 'backend-specialist',
      considerations: [
        'API endpoint design (RESTful)',
        'Data validation and sanitization',
        'Error handling and logging',
        'Database transaction safety',
        'Performance (indexing, caching)',
        'Security (SQL injection, XSS prevention)'
      ],
      techStack: this.analysis.techStack?.stacks?.backend || []
    };
  }

  getFrontendContext() {
    return {
      specialist: 'frontend-specialist',
      considerations: [
        'Responsive design (mobile-first)',
        'Loading states and skeletons',
        'Error handling and user feedback',
        'Accessibility (ARIA, keyboard nav)',
        'Performance (lazy loading, code splitting)',
        'State management (API integration)'
      ],
      techStack: this.analysis.techStack?.stacks?.frontend || []
    };
  }

  /**
   * TASKS.md 포맷팅
   */
  formatTasksMd(tasks) {
    const lines = [];
    const date = new Date().toISOString().split('T')[0];

    lines.push('# TASKS.md');
    lines.push('');
    lines.push(`> 생성일: ${date}`);
    lines.push(`> 프로젝트: ${this.projectInfo.name || 'Unnamed Project'}`);
    lines.push(`> 태스크 수: ${tasks.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Phase별 그룹화
    const phases = { T0: [], T1: [], T2: [], T3: [] };
    for (const task of tasks) {
      const phase = task.id.split('.')[0];
      phases[phase].push(task);
    }

    const phaseNames = {
      T0: 'Skeleton (구조)',
      T1: 'Muscles (핵심 기능)',
      T2: 'Muscles Advanced (고급 기능)',
      T3: 'Skin (마무리)'
    };

    for (const [phase, phaseTasks] of Object.entries(phases)) {
      if (phaseTasks.length === 0) continue;

      lines.push(`## ${phase} - ${phaseNames[phase]}`);
      lines.push('');

      for (const task of phaseTasks) {
        lines.push(`- [ ] ${task.id}: ${task.title}`);
        lines.push(`  - description: ${task.description}`);
        if (task.deps.length > 0) {
          lines.push(`  - deps: [${task.deps.join(', ')}]`);
        }
        lines.push(`  - domain: ${task.domain}`);
        lines.push(`  - risk: ${task.risk}`);
        if (task.files.length > 0) {
          lines.push(`  - files: ${task.files.join(', ')}`);
        }
        lines.push(`  - owner: ${task.owner}`);
        if (task.model) {
          lines.push(`  - model: ${task.model}`);
        }
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
    lines.push('## 메타데이터 설명');
    lines.push('');
    lines.push('```yaml');
    lines.push('# deps: 의존 태스크 ID 목록 (선행 태스크)');
    lines.push('# domain: backend | frontend | shared');
    lines.push('# risk: low | medium | critical (병렬 실행 제어용)');
    lines.push('# files: 영향받는 파일 패턴 (충돌 감지용)');
    lines.push('# owner: 담당 에이전트');
    lines.push('# model: 선택적 override (owner/model-routing 자동 라우팅을 덮을 때만 사용)');
    lines.push('```');

    return lines.join('\n');
  }
}

// CLI 실행
if (require.main === module) {
  const projectInfo = {
    name: process.env.PROJECT_NAME || 'Sample Project',
    features: (process.env.FEATURES || '').split(',').filter(Boolean)
  };

  const analysisPath = process.env.ANALYSIS_RESULT;
  let analysis = {};

  if (analysisPath && fs.existsSync(analysisPath)) {
    analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
  }

  const generator = new TaskGenerator(projectInfo, analysis);
  const tasksMd = generator.generate();

  console.log(tasksMd);
}

module.exports = TaskGenerator;
