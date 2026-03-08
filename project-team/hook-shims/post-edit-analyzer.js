#!/usr/bin/env node
'use strict';

const { runShim } = require('./_project-hook-shim');

runShim('post-edit-analyzer').catch(() => {
  process.exit(0);
});
