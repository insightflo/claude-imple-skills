'use strict';

/**
 * [파일 목적] Provider 설정 및 변환 로직
 * [주요 흐름] PROVIDER_CONFIG → createTransformer() → 스킬별 변환
 * [외부 연결] build.js에서 import
 */

const PROVIDER_CONFIG = {
  cursor: {
    provider: 'cursor',
    configDir: '.cursor',
    skillsDir: 'skills',
    // Cursor는 frontmatter에서 name, description만 지원
    // allowed-tools, user-invocable 등은 제거
    supportedFrontmatter: ['name', 'description'],
    variables: {
      command_prefix: '/',
      model: 'claude-sonnet-4-5',
      config_file: '.cursorrules',
    },
  },
  gemini: {
    provider: 'gemini',
    configDir: '.gemini',
    skillsDir: 'skills',
    // Gemini는 name, description만 검증
    supportedFrontmatter: ['name', 'description'],
    variables: {
      command_prefix: '/',
      model: 'gemini-2.5-pro',
      config_file: 'GEMINI.md',
    },
  },
  codex: {
    provider: 'codex',
    configDir: '.codex',
    skillsDir: 'skills',
    // Codex는 자체 sidecar 형식
    supportedFrontmatter: ['name', 'description'],
    variables: {
      command_prefix: '/',
      model: 'gpt-5.4',
      config_file: 'AGENTS.md',
    },
  },
  universal: {
    provider: 'universal',
    configDir: '',
    skillsDir: 'skills',
    supportedFrontmatter: ['name', 'description', 'version', 'updated'],
    variables: {
      command_prefix: '/',
      model: '(provider-specific)',
      config_file: '(provider-specific)',
    },
  },
};

module.exports = { PROVIDER_CONFIG };
