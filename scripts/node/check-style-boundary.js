#!/usr/bin/env node

const { main } = require('./check-style-boundary/core.js');

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`[1flowbase-style-boundary] ${error.message}\n`);
  process.exitCode = 1;
});
