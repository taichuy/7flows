#!/usr/bin/env node

const { main } = require('./mock-ui-sync/core.js');

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`[1flowbase-mock-ui-sync] ${error.message}\n`);
  process.exitCode = 1;
});
