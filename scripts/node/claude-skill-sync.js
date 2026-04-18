#!/usr/bin/env node

const { main } = require('./claude-skill-sync/core.js');

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`[1flowbase-claude-skill-sync] ${error.message}\n`);
  process.exitCode = 1;
});
