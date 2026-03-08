#!/usr/bin/env node
'use strict';

const { runShim } = require('./_project-hook-shim');

runShim('error-recovery-advisor').catch(() => {
  process.exit(0);
});
