#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const DEFAULT_STATE = {
  project: {
    name: 'SI 프로젝트',
    domain: '미지정',
    created: '',
    updated: '',
    status: '초기화 필요',
    version: '1.0.0'
  },
  requirements: {
    total: 0,
    functional: 0,
    non_functional: 0,
    by_priority: { must: 0, should: 0, could: 0, wont: 0 },
    by_status: { confirmed: 0, draft: 0, changed: 0, deleted: 0 },
    ambiguity_score: 1.0,
    items: []
  },
  functions: { total: 0, items: [] },
  screens: { total: 0, items: [] },
  traceability: {
    rd_to_fn: { mapped: 0, unmapped: 0 },
    fn_to_sc: { mapped: 0, unmapped: 0 },
    sc_to_tc: { mapped: 0, unmapped: 0 },
    coverage_percent: 0
  },
  domain_checklist: {
    domain: '',
    total: 0,
    passed: 0,
    failed: 0,
    pending: 0,
    items: []
  },
  changes: [],
  documents: [],
  phases: [
    { id: 0, name: '도메인 프로파일', status: 'pending', progress: 0 },
    { id: 1, name: '요구사항 수집', status: 'pending', progress: 0 },
    { id: 2, name: '분석 + Gap Detection', status: 'pending', progress: 0 },
    { id: 3, name: '산출물 생성', status: 'pending', progress: 0 },
    { id: 4, name: '검증 + 핸드오프', status: 'pending', progress: 0 }
  ],
  gaps: []
};

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    port: 0,
    browser: true,
    projectDir: process.cwd(),
    help: false
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--no-browser') {
      options.browser = false;
      continue;
    }
    if (arg.startsWith('--port=')) {
      const value = Number(arg.slice('--port='.length));
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new Error('유효한 포트를 입력하세요: --port=0~65535');
      }
      options.port = value;
      continue;
    }
    if (arg.startsWith('--project-dir=')) {
      const value = arg.slice('--project-dir='.length).trim();
      if (!value) {
        throw new Error('프로젝트 디렉토리를 입력하세요: --project-dir=/path');
      }
      options.projectDir = path.resolve(value);
      continue;
    }
    throw new Error('알 수 없는 옵션: ' + arg);
  }

  return options;
}

function printHelp() {
  process.stdout.write(
    [
      'SI Dashboard',
      '',
      '사용법:',
      '  node si-dashboard.js                    기본 (port 0 = OS 자동 할당)',
      '  node si-dashboard.js --port=3030        포트 지정',
      '  node si-dashboard.js --no-browser       브라우저 안 열기',
      '  node si-dashboard.js --project-dir=/path 프로젝트 디렉토리 지정',
      '  node si-dashboard.js --help             사용법 출력',
      ''
    ].join('\n')
  );
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function flushParagraph(buffer, html) {
  if (!buffer.length) {
    return;
  }
  html.push('<p>' + buffer.join('<br>') + '</p>');
  buffer.length = 0;
}

function flushList(items, html) {
  if (!items.length) {
    return;
  }
  html.push('<ul>' + items.map((item) => '<li>' + item + '</li>').join('') + '</ul>');
  items.length = 0;
}

function flushTable(rows, html) {
  if (!rows.length) {
    return;
  }
  const normalized = rows
    .map((row) =>
      row
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => applyInlineMarkdown(cell.trim()))
    )
    .filter((row) => row.length > 0);

  if (normalized.length < 1) {
    rows.length = 0;
    return;
  }

  const header = normalized[0];
  let bodyRows = normalized.slice(1);
  if (bodyRows[0] && bodyRows[0].every((cell) => /^:?-{3,}:?$/.test(cell.replace(/<[^>]+>/g, '')))) {
    bodyRows = bodyRows.slice(1);
  }

  html.push(
    '<table><thead><tr>' +
      header.map((cell) => '<th>' + cell + '</th>').join('') +
      '</tr></thead><tbody>' +
      bodyRows
        .map((row) => '<tr>' + row.map((cell) => '<td>' + cell + '</td>').join('') + '</tr>')
        .join('') +
      '</tbody></table>'
  );
  rows.length = 0;
}

function markdownToHtml(md) {
  const source = String(md || '').replace(/\r\n/g, '\n');
  const codeBlocks = [];
  const withPlaceholders = source.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const block = '<pre><code class="language-' + escapeHtml(lang || 'plain') + '">' + escapeHtml(code) + '</code></pre>';
    const token = '@@CODEBLOCK_' + codeBlocks.length + '@@';
    codeBlocks.push(block);
    return token;
  });

  const lines = withPlaceholders.split('\n');
  const html = [];
  const paragraph = [];
  const listItems = [];
  const tableRows = [];

  function flushAll() {
    flushParagraph(paragraph, html);
    flushList(listItems, html);
    flushTable(tableRows, html);
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushAll();
      continue;
    }

    if (line.startsWith('@@CODEBLOCK_')) {
      flushAll();
      html.push(line);
      continue;
    }

    if (/^\|.+\|$/.test(line)) {
      flushParagraph(paragraph, html);
      flushList(listItems, html);
      tableRows.push(line);
      continue;
    }

    flushTable(tableRows, html);

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (headingMatch) {
      flushParagraph(paragraph, html);
      flushList(listItems, html);
      const level = headingMatch[1].length;
      html.push('<h' + level + '>' + applyInlineMarkdown(headingMatch[2].trim()) + '</h' + level + '>');
      continue;
    }

    const listMatch = /^-\s+(.+)$/.exec(line.trim());
    if (listMatch) {
      flushParagraph(paragraph, html);
      listItems.push(applyInlineMarkdown(listMatch[1]));
      continue;
    }

    flushList(listItems, html);
    paragraph.push(applyInlineMarkdown(line.trim()));
  }

  flushAll();

  return html
    .join('\n')
    .replace(/@@CODEBLOCK_(\d+)@@/g, (_, index) => codeBlocks[Number(index)] || '');
}

function getSiDir(projectDir) {
  return path.join(projectDir, 'docs', 'si');
}

function readMarkdownSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return null;
  }
}

function slugToLabel(slug) {
  return String(slug || '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeDocument(entry) {
  if (!entry) {
    return null;
  }
  if (typeof entry === 'string') {
    return { name: entry, title: slugToLabel(entry) };
  }
  const name = entry.name || entry.slug || entry.id || '';
  if (!name) {
    return null;
  }
  return {
    name: name,
    title: entry.title || entry.label || slugToLabel(name)
  };
}

function listMarkdownDocuments(siDir, state) {
  const items = [];
  const seen = new Set();

  const declaredDocs = Array.isArray(state.documents) ? state.documents : [];
  for (const entry of declaredDocs) {
    const normalized = normalizeDocument(entry);
    if (!normalized || seen.has(normalized.name)) {
      continue;
    }
    seen.add(normalized.name);
    items.push(normalized);
  }

  try {
    const files = fs.readdirSync(siDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.md')) {
        continue;
      }
      const name = file.name.slice(0, -3);
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      items.push({ name: name, title: slugToLabel(name) });
    }
  } catch (error) {
    return items;
  }

  return items;
}

function buildState(projectDir) {
  const siDir = getSiDir(projectDir);
  const statePath = path.join(siDir, 'si-state.json');
  const fallback = cloneDefaultState();
  const raw = readJsonSafe(statePath, fallback);
  const state = Object.assign(fallback, raw || {});

  state.project = Object.assign({}, fallback.project, raw && raw.project);
  state.requirements = Object.assign({}, fallback.requirements, raw && raw.requirements);
  state.requirements.by_priority = Object.assign({}, fallback.requirements.by_priority, state.requirements.by_priority);
  state.requirements.by_status = Object.assign({}, fallback.requirements.by_status, state.requirements.by_status);
  state.traceability = Object.assign({}, fallback.traceability, raw && raw.traceability);
  state.traceability.rd_to_fn = Object.assign({}, fallback.traceability.rd_to_fn, state.traceability.rd_to_fn);
  state.traceability.fn_to_sc = Object.assign({}, fallback.traceability.fn_to_sc, state.traceability.fn_to_sc);
  state.traceability.sc_to_tc = Object.assign({}, fallback.traceability.sc_to_tc, state.traceability.sc_to_tc);
  state.domain_checklist = Object.assign({}, fallback.domain_checklist, raw && raw.domain_checklist);
  state.documents = listMarkdownDocuments(siDir, state);
  state.phases = Array.isArray(state.phases) ? state.phases : fallback.phases;
  state.changes = Array.isArray(state.changes) ? state.changes : [];
  state.gaps = Array.isArray(state.gaps) ? state.gaps : [];
  state.domain_checklist.items = Array.isArray(state.domain_checklist.items) ? state.domain_checklist.items : [];

  return state;
}

function getTraceabilityTone(coverage) {
  if (coverage >= 90) {
    return 'good';
  }
  if (coverage >= 70) {
    return 'warn';
  }
  return 'danger';
}

function formatDate(value) {
  return value || '-';
}

function renderMetrics(state) {
  const requirements = state.requirements || {};
  const checklist = state.domain_checklist || {};
  const traceability = state.traceability || {};
  const coverage = Number(traceability.coverage_percent || 0);
  const traceTone = getTraceabilityTone(coverage);

  return (
    '<div class="metric-grid">' +
    '<div class="metric-card">' +
    '<p class="metric-label">요구사항</p>' +
    '<p class="metric-value">' + escapeHtml(requirements.total || 0) + '건</p>' +
    '<p class="metric-detail">FR: ' + escapeHtml(requirements.functional || 0) + ' · NFR: ' + escapeHtml(requirements.non_functional || 0) + '</p>' +
    '</div>' +
    '<div class="metric-card metric-card--' + traceTone + '">' +
    '<p class="metric-label">추적성</p>' +
    '<p class="metric-value">' + escapeHtml(coverage) + '%</p>' +
    '<p class="metric-detail">RD→FN ' + escapeHtml((traceability.rd_to_fn || {}).mapped || 0) + ' · FN→SC ' + escapeHtml((traceability.fn_to_sc || {}).mapped || 0) + '</p>' +
    '</div>' +
    '<div class="metric-card">' +
    '<p class="metric-label">도메인 체크</p>' +
    '<p class="metric-value">' + escapeHtml(checklist.passed || 0) + '/' + escapeHtml(checklist.total || 0) + '</p>' +
    '<p class="metric-detail">실패 ' + escapeHtml(checklist.failed || 0) + ' · 보류 ' + escapeHtml(checklist.pending || 0) + '</p>' +
    '</div>' +
    '<div class="metric-card">' +
    '<p class="metric-label">변경 요청</p>' +
    '<p class="metric-value">' + escapeHtml((state.changes || []).length) + '건</p>' +
    '<p class="metric-detail">최근 업데이트 기준</p>' +
    '</div>' +
    '</div>'
  );
}

function renderPhases(phases) {
  const icons = {
    complete: '✓',
    in_progress: '●',
    pending: '○'
  };

  return (
    '<div class="phase-track">' +
    (Array.isArray(phases) ? phases : [])
      .map((phase) => {
        const status = phase.status || 'pending';
        const progress = Math.max(0, Math.min(100, Number(phase.progress || 0)));
        return (
          '<div class="phase-step phase-step--' +
          escapeHtml(status) +
          '">' +
          '<div class="phase-node">' +
          '<span class="phase-icon">' +
          escapeHtml(icons[status] || icons.pending) +
          '</span>' +
          '</div>' +
          '<div class="phase-body">' +
          '<p class="phase-name">' +
          escapeHtml(phase.name || '미정') +
          '</p>' +
          '<p class="phase-meta">' +
          escapeHtml(status) +
          ' · ' +
          escapeHtml(progress) +
          '%</p>' +
          '<div class="phase-progress"><span style="width:' +
          escapeHtml(progress) +
          '%"></span></div>' +
          '</div>' +
          '</div>'
        );
      })
      .join('') +
    '</div>'
  );
}

function renderDocList(documents) {
  if (!documents.length) {
    return '<p class="empty-state">표시할 산출물이 없습니다.</p>';
  }
  return (
    '<div class="doc-list">' +
    documents
      .map(
        (doc) =>
          '<button class="doc-link" type="button" data-doc-name="' +
          escapeHtml(doc.name) +
          '">' +
          '<span class="doc-title">' +
          escapeHtml(doc.title) +
          '</span>' +
          '<span class="doc-slug">' +
          escapeHtml(doc.name) +
          '.md</span>' +
          '</button>'
      )
      .join('') +
    '</div>'
  );
}

function renderGapList(state) {
  const checklist = Array.isArray(state.domain_checklist && state.domain_checklist.items) ? state.domain_checklist.items : [];
  const failedChecklist = checklist.filter((item) => {
    const status = String(item.status || '').toLowerCase();
    return status === 'failed' || status === 'fail' || status === 'false' || status === '❌';
  });
  const gaps = (state.gaps || []).map((gap) => ({ type: 'gap', data: gap }));
  const issues = failedChecklist.map((item) => ({ type: 'check', data: item }));
  const allItems = issues.concat(gaps);

  if (!allItems.length) {
    return '<p class="empty-state">현재 확인된 Gap / 이슈가 없습니다.</p>';
  }

  return (
    '<div class="gap-list">' +
    allItems
      .map((entry) => {
        if (entry.type === 'check') {
          const item = entry.data;
          return (
            '<article class="gap-item gap-item--danger">' +
            '<p class="gap-title">' +
            escapeHtml(item.id || '체크리스트') +
            '</p>' +
            '<p class="gap-copy">' +
            escapeHtml(item.name || item.title || item.item || '점검 항목 실패') +
            '</p>' +
            '<p class="gap-meta">도메인 체크리스트 실패</p>' +
            '</article>'
          );
        }

        const gap = entry.data;
        return (
          '<article class="gap-item gap-item--warn">' +
          '<p class="gap-title">' +
          escapeHtml(gap.id || gap.type || 'GAP') +
          '</p>' +
          '<p class="gap-copy">' +
          escapeHtml(gap.description || gap.title || gap.message || String(gap)) +
          '</p>' +
          '<p class="gap-meta">' +
          escapeHtml(gap.severity || gap.status || '확인 필요') +
          '</p>' +
          '</article>'
        );
      })
      .join('') +
    '</div>'
  );
}

function renderPriorityChart(priority) {
  const values = {
    must: Number(priority.must || 0),
    should: Number(priority.should || 0),
    could: Number(priority.could || 0),
    wont: Number(priority.wont || 0)
  };
  const total = values.must + values.should + values.could + values.wont;
  const labels = [
    ['Must', 'must'],
    ['Should', 'should'],
    ['Could', 'could'],
    ['Won\'t', 'wont']
  ];

  return (
    '<div class="priority-chart">' +
    labels
      .map(([label, key]) => {
        const value = values[key];
        const percent = total > 0 ? Math.round((value / total) * 100) : 0;
        return (
          '<div class="priority-row">' +
          '<div class="priority-head"><span>' +
          label +
          '</span><strong>' +
          value +
          '</strong></div>' +
          '<div class="priority-bar priority-bar--' +
          key +
          '" style="--value:' +
          percent +
          '%"><span></span></div>' +
          '<p class="priority-meta">' +
          percent +
          '%</p>' +
          '</div>'
        );
      })
      .join('') +
    '</div>'
  );
}

function renderChangeLog(changes) {
  const items = Array.isArray(changes) ? changes : [];
  if (!items.length) {
    return '<p class="empty-state">변경 이력이 없습니다.</p>';
  }

  return (
    '<div class="change-log"><table><thead><tr><th>ID</th><th>일자</th><th>유형</th><th>대상</th><th>상태</th></tr></thead><tbody>' +
    items
      .map(
        (change) =>
          '<tr>' +
          '<td>' +
          escapeHtml(change.id || change.cr_id || '-') +
          '</td>' +
          '<td>' +
          escapeHtml(change.date || change.updated || '-') +
          '</td>' +
          '<td>' +
          escapeHtml(change.type || '-') +
          '</td>' +
          '<td>' +
          escapeHtml(change.target || change.scope || '-') +
          '</td>' +
          '<td>' +
          escapeHtml(change.status || '-') +
          '</td>' +
          '</tr>'
      )
      .join('') +
    '</tbody></table></div>'
  );
}

function buildDashboardHtml(state) {
  const safeState = state || cloneDefaultState();
  const project = safeState.project || {};

  return (
    '<!DOCTYPE html>' +
    '<html lang="ko">' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>SI Dashboard</title>' +
    '<style>' +
    ':root{' +
    '--page:#f8fafc;--card:rgba(255,255,255,0.96);--ink:#1e293b;--muted:#64748b;--line:#e2e8f0;--accent:#3b82f6;--accent-soft:#eff6ff;--success:#16a34a;--success-soft:#f0fdf4;--warn:#d97706;--warn-soft:#fffbeb;--danger:#dc2626;--danger-soft:#fef2f2;' +
    '}' +
    '*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at top left,#dbeafe 0,transparent 30%),linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%);color:var(--ink)}' +
    '.app-shell{max-width:1440px;margin:0 auto;padding:32px 20px 48px}.hero-card,.section-card,.metric-card{background:var(--card);backdrop-filter:blur(12px);border:1px solid rgba(226,232,240,.8);box-shadow:0 18px 40px rgba(15,23,42,.08)}' +
    '.hero-card{padding:28px;border-radius:28px;margin-bottom:24px}.hero-grid{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.eyebrow{margin:0 0 10px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700}.hero-title{margin:0;font-size:clamp(28px,4vw,48px);line-height:1.06}.hero-copy{margin:12px 0 0;color:var(--muted);font-size:15px}.status-stack{display:flex;flex-direction:column;gap:10px;align-items:flex-end}.badge{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:999px;font-size:13px;font-weight:700}.domain-badge{background:var(--accent-soft);color:var(--accent)}.version-badge{background:#eff6ff;color:#1d4ed8}' +
    '.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:24px}.metric-card{padding:20px;border-radius:22px}.metric-card--good{background:linear-gradient(180deg,#fff 0%,var(--success-soft) 100%)}.metric-card--warn{background:linear-gradient(180deg,#fff 0%,var(--warn-soft) 100%)}.metric-card--danger{background:linear-gradient(180deg,#fff 0%,var(--danger-soft) 100%)}.metric-label{margin:0;font-size:13px;font-weight:700;color:var(--muted)}.metric-value{margin:12px 0 8px;font-size:34px;font-weight:800;letter-spacing:-.03em}.metric-detail{margin:0;color:var(--muted);font-size:14px}' +
    '.section-card{padding:22px;border-radius:24px}.section-title{margin:0 0 18px;font-size:18px;letter-spacing:-.02em}.phase-track{display:flex;gap:14px;flex-wrap:wrap}.phase-step{display:flex;gap:14px;align-items:flex-start;flex:1 1 220px;padding:16px;border-radius:18px;background:#f8fafc;border:1px solid var(--line)}.phase-node{width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:800;flex:0 0 auto}.phase-step--complete .phase-node{background:var(--success);color:#fff}.phase-step--in_progress .phase-node{background:var(--accent);color:#fff;animation:pulse 1.6s infinite}.phase-step--pending .phase-node{background:#e2e8f0;color:#64748b}.phase-body{min-width:0;flex:1}.phase-name{margin:0 0 6px;font-weight:700}.phase-meta{margin:0 0 10px;font-size:13px;color:var(--muted)}.phase-progress{height:8px;border-radius:999px;background:#e2e8f0;overflow:hidden}.phase-progress span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),#60a5fa)}@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(59,130,246,.35)}70%{box-shadow:0 0 0 12px rgba(59,130,246,0)}100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}' +
    '.main-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(320px,.9fr);gap:20px;margin-top:24px}.stack{display:flex;flex-direction:column;gap:20px}.doc-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:18px}.doc-link{appearance:none;border:1px solid var(--line);background:#fff;border-radius:18px;padding:16px;text-align:left;cursor:pointer;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.doc-link:hover{transform:translateY(-1px);border-color:#bfdbfe;box-shadow:0 12px 24px rgba(59,130,246,.12)}.doc-title{display:block;font-weight:700}.doc-slug{display:block;margin-top:6px;font-size:12px;color:var(--muted)}.doc-viewer{min-height:320px;border:1px solid var(--line);border-radius:20px;background:#fff;padding:20px;overflow:auto}.placeholder,.empty-state{margin:0;color:var(--muted)}' +
    '.doc-viewer h1,.doc-viewer h2,.doc-viewer h3,.doc-viewer h4{margin:1.1em 0 .5em;letter-spacing:-.02em}.doc-viewer p,.doc-viewer ul{margin:.75em 0;line-height:1.7}.doc-viewer code{font-family:"SFMono-Regular",Consolas,monospace;background:#eff6ff;border-radius:6px;padding:2px 6px;font-size:.92em}.doc-viewer pre{margin:1em 0;padding:16px;border-radius:16px;background:#0f172a;color:#e2e8f0;overflow:auto}.doc-viewer pre code{padding:0;background:none;color:inherit}.doc-viewer table,.change-log table{width:100%;border-collapse:collapse}.doc-viewer th,.doc-viewer td,.change-log th,.change-log td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.doc-viewer th,.change-log th{font-size:13px;color:var(--muted)}' +
    '.gap-list{display:flex;flex-direction:column;gap:12px}.gap-item{padding:16px;border-radius:18px;border:1px solid var(--line)}.gap-item--danger{background:var(--danger-soft);border-color:#fecaca}.gap-item--warn{background:var(--warn-soft);border-color:#fde68a}.gap-title{margin:0 0 6px;font-size:13px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.gap-copy{margin:0 0 8px;font-weight:700;line-height:1.5}.gap-meta{margin:0;font-size:13px;color:var(--muted)}' +
    '.priority-chart{display:flex;flex-direction:column;gap:14px}.priority-row{display:grid;grid-template-columns:88px 1fr 48px;align-items:center;gap:12px}.priority-head{display:flex;justify-content:space-between;gap:10px;font-size:14px}.priority-bar{height:12px;border-radius:999px;background:#e2e8f0;overflow:hidden}.priority-bar span{display:block;height:100%;width:var(--value);border-radius:inherit}.priority-bar--must span{background:linear-gradient(90deg,#1d4ed8,#3b82f6)}.priority-bar--should span{background:linear-gradient(90deg,#0891b2,#22d3ee)}.priority-bar--could span{background:linear-gradient(90deg,#16a34a,#4ade80)}.priority-bar--wont span{background:linear-gradient(90deg,#9ca3af,#cbd5e1)}.priority-meta{margin:0;font-size:13px;color:var(--muted);text-align:right}' +
    '@media (max-width:1040px){.main-grid,.metric-grid{grid-template-columns:1fr}.hero-grid{flex-direction:column}.status-stack{align-items:flex-start;flex-direction:row;flex-wrap:wrap}}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="app-shell">' +
    '<header class="hero-card">' +
    '<div class="hero-grid">' +
    '<div>' +
    '<p class="eyebrow">SI 요구사항 대시보드</p>' +
    '<h1 class="hero-title" id="hero-title">' + escapeHtml(project.name || 'SI 프로젝트') + '</h1>' +
    '<p class="hero-copy" id="hero-copy">' + escapeHtml(project.status || '-') + ' · 마지막 업데이트: ' + escapeHtml(formatDate(project.updated)) + '</p>' +
    '</div>' +
    '<div class="status-stack">' +
    '<span class="badge domain-badge" id="hero-domain">' + escapeHtml(project.domain || '미지정') + '</span>' +
    '<span class="badge version-badge" id="hero-version">v' + escapeHtml(project.version || '1.0.0') + '</span>' +
    '</div>' +
    '</div>' +
    '</header>' +
    '<section id="metrics-root">' + renderMetrics(safeState) + '</section>' +
    '<section class="section-card"><h2 class="section-title">Phase 진행</h2><div id="phase-root">' + renderPhases(safeState.phases) + '</div></section>' +
    '<div class="main-grid">' +
    '<div class="stack">' +
    '<section class="section-card"><h2 class="section-title">산출물</h2><div id="doc-list-root">' + renderDocList(safeState.documents || []) + '</div><div class="doc-viewer" id="doc-viewer"><p class="placeholder">문서를 선택하세요</p></div></section>' +
    '</div>' +
    '<div class="stack">' +
    '<section class="section-card"><h2 class="section-title">Gap / 이슈</h2><div id="gap-root">' + renderGapList(safeState) + '</div></section>' +
    '<section class="section-card"><h2 class="section-title">우선순위 분포</h2><div id="priority-root">' + renderPriorityChart((safeState.requirements || {}).by_priority || {}) + '</div></section>' +
    '<section class="section-card"><h2 class="section-title">변경 이력</h2><div id="change-root">' + renderChangeLog(safeState.changes || []) + '</div></section>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<script>' +
    'const initialState=' + JSON.stringify(safeState) + ';' +
    'function escapeHtml(value){return String(value==null?\'\':value).replace(/&/g,\'&amp;\').replace(/</g,\'&lt;\').replace(/>/g,\'&gt;\').replace(/"/g,\'&quot;\').replace(/\\\'/g,\'&#39;\')}' +
    'function applyInlineMarkdown(text){return escapeHtml(text).replace(/\\*\\*([^*]+)\\*\\*/g,\'<strong>$1</strong>\').replace(/`([^`]+)`/g,\'<code>$1</code>\')}' +
    'function flushParagraph(buffer,html){if(!buffer.length)return;html.push(\'<p>\'+buffer.join(\'<br>\')+\'</p>\');buffer.length=0}' +
    'function flushList(items,html){if(!items.length)return;html.push(\'<ul>\'+items.map((item)=>\'<li>\'+item+\'</li>\').join(\'\')+\'</ul>\');items.length=0}' +
    'function flushTable(rows,html){if(!rows.length)return;const normalized=rows.map((row)=>row.trim().replace(/^\\|/,\'\').replace(/\\|$/,\'\').split(\'|\').map((cell)=>applyInlineMarkdown(cell.trim()))).filter((row)=>row.length>0);if(!normalized.length){rows.length=0;return}const header=normalized[0];let bodyRows=normalized.slice(1);if(bodyRows[0]&&bodyRows[0].every((cell)=>/^:?-{3,}:?$/.test(cell.replace(/<[^>]+>/g,\'\')))){bodyRows=bodyRows.slice(1)}html.push(\'<table><thead><tr>\'+header.map((cell)=>\'<th>\'+cell+\'</th>\').join(\'\')+\'</tr></thead><tbody>\'+bodyRows.map((row)=>\'<tr>\'+row.map((cell)=>\'<td>\'+cell+\'</td>\').join(\'\')+\'</tr>\').join(\'\')+\'</tbody></table>\');rows.length=0}' +
    'function markdownToHtml(md){const source=String(md||\'\').replace(/\\r\\n/g,\'\\n\');const codeBlocks=[];const withPlaceholders=source.replace(/```([\\w-]*)\\n([\\s\\S]*?)```/g,(_,lang,code)=>{const block=\'<pre><code class="language-\'+escapeHtml(lang||\'plain\')+\'">\'+escapeHtml(code)+\'</code></pre>\';const token=\'@@CODEBLOCK_\'+codeBlocks.length+\'@@\';codeBlocks.push(block);return token});const lines=withPlaceholders.split(\'\\n\');const html=[];const paragraph=[];const listItems=[];const tableRows=[];function flushAll(){flushParagraph(paragraph,html);flushList(listItems,html);flushTable(tableRows,html)}for(const rawLine of lines){const line=rawLine.trimEnd();if(!line.trim()){flushAll();continue}if(line.startsWith(\'@@CODEBLOCK_\')){flushAll();html.push(line);continue}if(/^\\|.+\\|$/.test(line)){flushParagraph(paragraph,html);flushList(listItems,html);tableRows.push(line);continue}flushTable(tableRows,html);const headingMatch=/^(#{1,6})\\s+(.+)$/.exec(line.trim());if(headingMatch){flushParagraph(paragraph,html);flushList(listItems,html);const level=headingMatch[1].length;html.push(\'<h\'+level+\'>\'+applyInlineMarkdown(headingMatch[2].trim())+\'</h\'+level+\'>\');continue}const listMatch=/^-\\s+(.+)$/.exec(line.trim());if(listMatch){flushParagraph(paragraph,html);listItems.push(applyInlineMarkdown(listMatch[1]));continue}flushList(listItems,html);paragraph.push(applyInlineMarkdown(line.trim()))}flushAll();return html.join(\'\\n\').replace(/@@CODEBLOCK_(\\d+)@@/g,(_,index)=>codeBlocks[Number(index)]||\'\')}' +
    'function getTraceabilityTone(coverage){if(coverage>=90)return\'good\';if(coverage>=70)return\'warn\';return\'danger\'}' +
    'function renderMetrics(state){const requirements=state.requirements||{};const checklist=state.domain_checklist||{};const traceability=state.traceability||{};const coverage=Number(traceability.coverage_percent||0);const tone=getTraceabilityTone(coverage);return \'<div class="metric-grid"><div class="metric-card"><p class="metric-label">요구사항</p><p class="metric-value">\'+escapeHtml(requirements.total||0)+\'건</p><p class="metric-detail">FR: \'+escapeHtml(requirements.functional||0)+\' · NFR: \'+escapeHtml(requirements.non_functional||0)+\'</p></div><div class="metric-card metric-card--\'+tone+\'"><p class="metric-label">추적성</p><p class="metric-value">\'+escapeHtml(coverage)+\'%</p><p class="metric-detail">RD→FN \'+escapeHtml((traceability.rd_to_fn||{}).mapped||0)+\' · FN→SC \'+escapeHtml((traceability.fn_to_sc||{}).mapped||0)+\'</p></div><div class="metric-card"><p class="metric-label">도메인 체크</p><p class="metric-value">\'+escapeHtml(checklist.passed||0)+\'/\'+escapeHtml(checklist.total||0)+\'</p><p class="metric-detail">실패 \'+escapeHtml(checklist.failed||0)+\' · 보류 \'+escapeHtml(checklist.pending||0)+\'</p></div><div class="metric-card"><p class="metric-label">변경 요청</p><p class="metric-value">\'+escapeHtml((state.changes||[]).length)+\'건</p><p class="metric-detail">최근 업데이트 기준</p></div></div>\'}' +
    'function renderPhases(phases){const icons={complete:\'✓\',in_progress:\'●\',pending:\'○\'};return \'<div class="phase-track">\'+(Array.isArray(phases)?phases:[]).map((phase)=>{const status=phase.status||\'pending\';const progress=Math.max(0,Math.min(100,Number(phase.progress||0)));return \'<div class="phase-step phase-step--\'+escapeHtml(status)+\'"><div class="phase-node"><span class="phase-icon">\'+escapeHtml(icons[status]||icons.pending)+\'</span></div><div class="phase-body"><p class="phase-name">\'+escapeHtml(phase.name||\'미정\')+\'</p><p class="phase-meta">\'+escapeHtml(status)+\' · \'+escapeHtml(progress)+\'%</p><div class="phase-progress"><span style="width:\'+escapeHtml(progress)+\'%"></span></div></div></div>\'}).join(\'\')+\'</div>\'}' +
    'function renderDocList(documents){if(!documents.length)return \'<p class="empty-state">표시할 산출물이 없습니다.</p>\';return \'<div class="doc-list">\'+documents.map((doc)=>\'<button class="doc-link" type="button" data-doc-name="\'+escapeHtml(doc.name)+\'"><span class="doc-title">\'+escapeHtml(doc.title)+\'</span><span class="doc-slug">\'+escapeHtml(doc.name)+\'.md</span></button>\').join(\'\')+\'</div>\'}' +
    'function renderGapList(state){const checklist=Array.isArray(state.domain_checklist&&state.domain_checklist.items)?state.domain_checklist.items:[];const failedChecklist=checklist.filter((item)=>{const status=String(item.status||\'\').toLowerCase();return status===\'failed\'||status===\'fail\'||status===\'false\'||status===\'❌\'});const allItems=failedChecklist.map((item)=>({type:\'check\',data:item})).concat((state.gaps||[]).map((gap)=>({type:\'gap\',data:gap})));if(!allItems.length)return \'<p class="empty-state">현재 확인된 Gap / 이슈가 없습니다.</p>\';return \'<div class="gap-list">\'+allItems.map((entry)=>{if(entry.type===\'check\'){const item=entry.data;return \'<article class="gap-item gap-item--danger"><p class="gap-title">\'+escapeHtml(item.id||\'체크리스트\')+\'</p><p class="gap-copy">\'+escapeHtml(item.name||item.title||item.item||\'점검 항목 실패\')+\'</p><p class="gap-meta">도메인 체크리스트 실패</p></article>\'}const gap=entry.data;return \'<article class="gap-item gap-item--warn"><p class="gap-title">\'+escapeHtml(gap.id||gap.type||\'GAP\')+\'</p><p class="gap-copy">\'+escapeHtml(gap.description||gap.title||gap.message||String(gap))+\'</p><p class="gap-meta">\'+escapeHtml(gap.severity||gap.status||\'확인 필요\')+\'</p></article>\'}).join(\'\')+\'</div>\'}' +
    'function renderPriorityChart(priority){const values={must:Number(priority.must||0),should:Number(priority.should||0),could:Number(priority.could||0),wont:Number(priority.wont||0)};const total=values.must+values.should+values.could+values.wont;const labels=[[\'Must\',\'must\'],[\'Should\',\'should\'],[\'Could\',\'could\'],[\'Won\\\'t\',\'wont\']];return \'<div class="priority-chart">\'+labels.map(([label,key])=>{const value=values[key];const percent=total>0?Math.round(value/total*100):0;return \'<div class="priority-row"><div class="priority-head"><span>\'+label+\'</span><strong>\'+value+\'</strong></div><div class="priority-bar priority-bar--\'+key+\'" style="--value:\'+percent+\'%"><span></span></div><p class="priority-meta">\'+percent+\'%</p></div>\'}).join(\'\')+\'</div>\'}' +
    'function renderChangeLog(changes){const items=Array.isArray(changes)?changes:[];if(!items.length)return \'<p class="empty-state">변경 이력이 없습니다.</p>\';return \'<div class="change-log"><table><thead><tr><th>ID</th><th>일자</th><th>유형</th><th>대상</th><th>상태</th></tr></thead><tbody>\'+items.map((change)=>\'<tr><td>\'+escapeHtml(change.id||change.cr_id||\'-\')+\'</td><td>\'+escapeHtml(change.date||change.updated||\'-\')+\'</td><td>\'+escapeHtml(change.type||\'-\')+\'</td><td>\'+escapeHtml(change.target||change.scope||\'-\')+\'</td><td>\'+escapeHtml(change.status||\'-\')+\'</td></tr>\').join(\'\')+\'</tbody></table></div>\'}' +
    'function applyState(state){const project=state.project||{};document.getElementById(\'hero-title\').textContent=project.name||\'SI 프로젝트\';document.getElementById(\'hero-copy\').textContent=(project.status||\'-\')+\' · 마지막 업데이트: \'+(project.updated||\'-\');document.getElementById(\'hero-domain\').textContent=project.domain||\'미지정\';document.getElementById(\'hero-version\').textContent=\'v\'+(project.version||\'1.0.0\');document.getElementById(\'metrics-root\').innerHTML=renderMetrics(state);document.getElementById(\'phase-root\').innerHTML=renderPhases(state.phases||[]);document.getElementById(\'doc-list-root\').innerHTML=renderDocList(state.documents||[]);document.getElementById(\'gap-root\').innerHTML=renderGapList(state);document.getElementById(\'priority-root\').innerHTML=renderPriorityChart((state.requirements||{}).by_priority||{});document.getElementById(\'change-root\').innerHTML=renderChangeLog(state.changes||[])}' +
    'async function loadDoc(name){const viewer=document.getElementById(\'doc-viewer\');viewer.innerHTML=\'<p class="placeholder">문서를 불러오는 중...</p>\';try{const response=await fetch(\'/api/doc?name=\'+encodeURIComponent(name));if(!response.ok)throw new Error(\'문서를 찾을 수 없습니다.\');const md=await response.text();viewer.innerHTML=markdownToHtml(md)}catch(error){viewer.innerHTML=\'<p class="placeholder">\'+escapeHtml(error.message)+\'</p>\'}}' +
    'document.addEventListener(\'click\',(event)=>{const button=event.target.closest(\'[data-doc-name]\');if(!button)return;loadDoc(button.getAttribute(\'data-doc-name\'))})' +
    'async function refreshState(){try{const response=await fetch(\'/api/state\',{cache:\'no-store\'});if(!response.ok)throw new Error(\'state fetch failed\');const state=await response.json();applyState(state)}catch(error){}}' +
    'applyState(initialState);setInterval(refreshState,5000);' +
    '</script>' +
    '</body>' +
    '</html>'
  );
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;
  if (!command) {
    return;
  }
  try {
    const child = spawn(command, [url], { stdio: 'ignore', detached: true });
    child.unref();
  } catch (error) {
    process.stderr.write('[si-dashboard] 브라우저 열기 실패: ' + error.message + '\n');
  }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendText(res, statusCode, body, contentType) {
  const text = String(body);
  res.writeHead(statusCode, {
    'Content-Type': contentType || 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store'
  });
  res.end(text);
}

function startServer(options) {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = requestUrl.pathname;

    if (pathname === '/api/state') {
      return sendJson(res, 200, buildState(options.projectDir));
    }

    if (pathname === '/api/doc') {
      const name = (requestUrl.searchParams.get('name') || '').trim();
      if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
        return sendText(res, 400, 'invalid document name', 'text/plain; charset=utf-8');
      }
      const docPath = path.join(getSiDir(options.projectDir), name + '.md');
      const doc = readMarkdownSafe(docPath);
      if (doc == null) {
        return sendText(res, 404, 'document not found', 'text/plain; charset=utf-8');
      }
      return sendText(res, 200, doc, 'text/markdown; charset=utf-8');
    }

    if (pathname === '/') {
      const html = buildDashboardHtml(buildState(options.projectDir));
      return sendText(res, 200, html, 'text/html; charset=utf-8');
    }

    return sendText(res, 404, 'not found', 'text/plain; charset=utf-8');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server: server,
        url: 'http://127.0.0.1:' + address.port
      });
    });
  });
}

async function main() {
  let options;
  try {
    options = parseArgs();
  } catch (error) {
    process.stderr.write('[si-dashboard] ' + error.message + '\n');
    process.stderr.write('`--help`로 사용법을 확인하세요.\n');
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    printHelp();
    return;
  }

  const { server, url } = await startServer(options);
  process.stdout.write('[si-dashboard] listening on ' + url + '\n');
  process.stdout.write('[si-dashboard] projectDir: ' + options.projectDir + '\n');

  let closing = false;
  function shutdown(signal) {
    if (closing) {
      return;
    }
    closing = true;
    process.stdout.write('[si-dashboard] shutting down (' + signal + ')\n');
    server.close(() => {
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  if (options.browser) {
    openBrowser(url);
  }
}

main().catch((error) => {
  process.stderr.write('[si-dashboard] ' + (error && error.stack ? error.stack : String(error)) + '\n');
  process.exit(1);
});
