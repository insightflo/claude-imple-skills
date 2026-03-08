#!/usr/bin/env node
'use strict';

const { runShim } = require('./_project-hook-shim');

runShim('git-commit-checker').catch(() => {
  process.exit(0);
});
