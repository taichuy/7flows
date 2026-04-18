#!/usr/bin/env node

const { main } = require('./page-debug/core.js');

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`[1flowbase-page-debug] ${error.message}\n`);
  process.exitCode = 1;
});
