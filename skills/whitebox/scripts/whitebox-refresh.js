#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { readMarkers } = require('../../../project-team/scripts/collab-derived-meta');
const { refreshWhiteboxSummary } = require('./whitebox-summary');
const { refreshControlState } = require('./whitebox-control-state');

const BOARD_ARTIFACT = '.claude/collab/board-state.json';
const SUMMARY_ARTIFACT = '.claude/collab/whitebox-summary.json';
const CONTROL_ARTIFACT = '.claude/collab/control-state.json';

function artifactPath(projectDir, artifact) {
  return path.join(projectDir, artifact);
}

function hasActiveMarker(projectDir, artifact) {
  return readMarkers(projectDir).some((entry) => entry && !entry.cleared_by && entry.artifact === artifact);
}

function needsRefresh(projectDir, artifact, force) {
  if (force) return true;
  if (!fs.existsSync(artifactPath(projectDir, artifact))) return true;
  return hasActiveMarker(projectDir, artifact);
}

function ensureWhiteboxArtifacts(options = {}) {
  const projectDir = options.projectDir || process.cwd();
  const force = Boolean(options.force);
  const rebuilt = [];
  const failures = [];

  if (needsRefresh(projectDir, CONTROL_ARTIFACT, force)) {
    try {
      refreshControlState({ projectDir });
      rebuilt.push(CONTROL_ARTIFACT);
    } catch (error) {
      failures.push({ artifact: CONTROL_ARTIFACT, message: error.message });
    }
  }

  if (needsRefresh(projectDir, SUMMARY_ARTIFACT, force) || rebuilt.includes(BOARD_ARTIFACT) || rebuilt.includes(CONTROL_ARTIFACT)) {
    try {
      refreshWhiteboxSummary({ projectDir });
      rebuilt.push(SUMMARY_ARTIFACT);
    } catch (error) {
      failures.push({ artifact: SUMMARY_ARTIFACT, message: error.message });
    }
  }

  return {
    ok: failures.length === 0,
    rebuilt,
    failures,
  };
}

module.exports = {
  BOARD_ARTIFACT,
  CONTROL_ARTIFACT,
  SUMMARY_ARTIFACT,
  ensureWhiteboxArtifacts,
  needsRefresh,
};
