#!/usr/bin/env node

const { main: toolingMain } = require('./tooling/index.js');
const main = (argv = []) => toolingMain(['hotspot-review', ...argv]);

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`[1flowbase-hotspot-review] ${error.message}\n`);
  process.exitCode = 1;
});

module.exports = {
  main,
};
