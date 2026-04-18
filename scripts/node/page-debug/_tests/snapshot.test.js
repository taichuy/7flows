const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assignInlineArtifactPaths,
  assignLocalResourcePaths,
  buildMetaPayload,
  rewriteCssUrls,
  rewriteSnapshotHtml,
} = require('../snapshot.js');

test('rewriteCssUrls converts relative stylesheet urls to absolute source urls', () => {
  assert.equal(
    rewriteCssUrls('.hero{background:url("../assets/hero.png")}', 'http://127.0.0.1:3100/src/app.css'),
    '.hero{background:url("http://127.0.0.1:3100/assets/hero.png")}'
  );
});

test('rewriteSnapshotHtml swaps external urls and inline placeholders for local artifacts', () => {
  const html = [
    '<html><head>',
    '<link rel="stylesheet" href="http://127.0.0.1:3100/src/app.css">',
    '<link rel="stylesheet" href="__PAGE_DEBUG_INLINE_STYLE_1__">',
    '</head><body>',
    '<script src="http://127.0.0.1:3100/src/main.tsx"></script>',
    '<script src="__PAGE_DEBUG_INLINE_SCRIPT_1__"></script>',
    '</body></html>',
  ].join('');

  assert.equal(
    rewriteSnapshotHtml(html, {
      externalStyles: [{ originalUrl: 'http://127.0.0.1:3100/src/app.css', localPath: 'css/001-app.css' }],
      externalScripts: [{ originalUrl: 'http://127.0.0.1:3100/src/main.tsx', localPath: 'js/001-main.js' }],
      inlineStyles: [{ placeholder: '__PAGE_DEBUG_INLINE_STYLE_1__', localPath: 'css/002-inline.css' }],
      inlineScripts: [{ placeholder: '__PAGE_DEBUG_INLINE_SCRIPT_1__', localPath: 'js/002-inline.js' }],
    }),
    '<html><head><link rel="stylesheet" href="css/001-app.css"><link rel="stylesheet" href="css/002-inline.css"></head><body><script src="js/001-main.js"></script><script src="js/002-inline.js"></script></body></html>'
  );
});

test('assignLocalResourcePaths numbers stylesheet and script outputs separately', () => {
  assert.deepEqual(
    assignLocalResourcePaths([
      { kind: 'stylesheet', originalUrl: 'http://127.0.0.1:3100/src/app.css', body: 'body{}' },
      { kind: 'script', originalUrl: 'http://127.0.0.1:3100/src/main.tsx', body: 'console.log(1);' },
    ]),
    [
      {
        kind: 'stylesheet',
        originalUrl: 'http://127.0.0.1:3100/src/app.css',
        body: 'body{}',
        localPath: 'css/001-app.css',
      },
      {
        kind: 'script',
        originalUrl: 'http://127.0.0.1:3100/src/main.tsx',
        body: 'console.log(1);',
        localPath: 'js/001-main.js',
      },
    ]
  );
});

test('buildMetaPayload records evidence counts and artifact paths', () => {
  assert.deepEqual(
    buildMetaPayload({
      requestedUrl: '/settings',
      finalUrl: 'http://127.0.0.1:3100/settings/members',
      webBaseUrl: 'http://127.0.0.1:3100',
      apiBaseUrl: 'http://127.0.0.1:7800',
      account: 'root',
      readyState: 'ready_with_selector',
      storageStatePath: '/tmp/run/storage-state.json',
      screenshotPath: '/tmp/run/page.png',
      consoleLogPath: '/tmp/run/console.ndjson',
      consoleEntries: [{ eventType: 'console' }],
      resources: [{ kind: 'stylesheet', localPath: 'css/001-app.css' }],
      warnings: [],
    }).pageErrorCount,
    0
  );
});
