#!/usr/bin/env node

const { main } = require('./dev-up/core.js');

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`[1flowbase-dev-up] ${error.message}\n`);
  process.exitCode = 1;
});
