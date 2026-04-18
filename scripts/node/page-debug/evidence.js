const fs = require('node:fs');

function createConsoleCollector(now = () => new Date().toISOString()) {
  const entries = [];

  return {
    entries,
    attach(page) {
      page.on('console', async (message) => {
        const location = typeof message.location === 'function' ? message.location() : {};
        entries.push({
          timestamp: now(),
          eventType: 'console',
          level: typeof message.type === 'function' ? message.type() : 'log',
          text: typeof message.text === 'function' ? message.text() : '',
          url: location.url ?? null,
          lineNumber: location.lineNumber ?? null,
          columnNumber: location.columnNumber ?? null,
        });
      });

      page.on('pageerror', (error) => {
        entries.push({
          timestamp: now(),
          eventType: 'pageerror',
          level: 'error',
          text: error instanceof Error ? error.stack || error.message : String(error),
          url: null,
          lineNumber: null,
          columnNumber: null,
        });
      });
    },
  };
}

function serializeConsoleEntries(entries) {
  return entries.map((entry) => JSON.stringify(entry)).join('\n') + (entries.length ? '\n' : '');
}

async function writeEvidence({ page, screenshotPath, consoleLogPath, collector }) {
  await page.screenshot({ path: screenshotPath, fullPage: true });
  fs.writeFileSync(consoleLogPath, serializeConsoleEntries(collector.entries), 'utf8');
}

module.exports = {
  createConsoleCollector,
  serializeConsoleEntries,
  writeEvidence,
};
