const test = require('node:test');
const assert = require('node:assert/strict');

const { serializeConsoleEntries } = require('../evidence.js');

test('serializeConsoleEntries writes ndjson for console and pageerror events', () => {
  const payload = serializeConsoleEntries([
    {
      timestamp: '2026-04-18T12:00:00.000Z',
      eventType: 'console',
      level: 'error',
      text: 'boom',
      url: 'http://127.0.0.1:3100/src/main.tsx',
      lineNumber: 10,
      columnNumber: 2,
    },
    {
      timestamp: '2026-04-18T12:00:01.000Z',
      eventType: 'pageerror',
      level: 'error',
      text: 'ReferenceError: missingVar',
      url: null,
      lineNumber: null,
      columnNumber: null,
    },
  ]);

  assert.match(payload, /"eventType":"console"/u);
  assert.match(payload, /"eventType":"pageerror"/u);
  assert.equal(payload.trim().split('\n').length, 2);
});
