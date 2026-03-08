#!/usr/bin/env node
'use strict';

const { runShim } = require('./_project-hook-shim');

runShim('session-summary-saver').catch(() => {
  process.exit(0);
});
