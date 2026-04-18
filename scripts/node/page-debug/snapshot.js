const fs = require('node:fs');
const path = require('node:path');

const INLINE_STYLE_PREFIX = '__PAGE_DEBUG_INLINE_STYLE_';
const INLINE_SCRIPT_PREFIX = '__PAGE_DEBUG_INLINE_SCRIPT_';

function slugFromUrl(resourceUrl, fallback) {
  const pathname = new URL(resourceUrl).pathname;
  const basename = path.basename(pathname).replace(/\.[^.]+$/u, '');
  return basename.replace(/[^a-z0-9]+/giu, '-').replace(/^-+|-+$/gu, '') || fallback;
}

function rewriteCssUrls(source, stylesheetUrl) {
  return source.replace(/url\((['"]?)([^)'"]+)\1\)/gu, (_match, quote, rawUrl) => {
    if (/^(data:|https?:|blob:|#)/u.test(rawUrl)) {
      return `url(${quote}${rawUrl}${quote})`;
    }

    return `url(${quote}${new URL(rawUrl, stylesheetUrl).toString()}${quote})`;
  });
}

function rewriteSnapshotHtml(html, { externalStyles, externalScripts, inlineStyles, inlineScripts }) {
  let next = html;

  for (const style of externalStyles) {
    next = next.split(style.originalUrl).join(style.localPath);
  }
  for (const script of externalScripts) {
    next = next.split(script.originalUrl).join(script.localPath);
  }
  for (const inlineStyle of inlineStyles) {
    next = next.split(inlineStyle.placeholder).join(inlineStyle.localPath);
  }
  for (const inlineScript of inlineScripts) {
    next = next.split(inlineScript.placeholder).join(inlineScript.localPath);
  }

  return next;
}

function assignLocalResourcePaths(records) {
  let styleIndex = 0;
  let scriptIndex = 0;

  return records.map((record) => {
    if (record.kind === 'stylesheet') {
      styleIndex += 1;
      return {
        ...record,
        localPath: `css/${String(styleIndex).padStart(3, '0')}-${slugFromUrl(record.originalUrl, 'style')}.css`,
      };
    }

    if (record.kind === 'script') {
      scriptIndex += 1;
      return {
        ...record,
        localPath: `js/${String(scriptIndex).padStart(3, '0')}-${slugFromUrl(record.originalUrl, 'script')}.js`,
      };
    }

    return record;
  });
}

function assignInlineArtifactPaths({ inlineStyles, inlineScripts, externalStyles, externalScripts }) {
  return {
    inlineStyles: inlineStyles.map((entry, index) => ({
      ...entry,
      localPath: `css/${String(externalStyles.length + index + 1).padStart(3, '0')}-inline.css`,
    })),
    inlineScripts: inlineScripts.map((entry, index) => ({
      ...entry,
      localPath: `js/${String(externalScripts.length + index + 1).padStart(3, '0')}-inline.js`,
    })),
  };
}

function buildMetaPayload({
  requestedUrl,
  finalUrl,
  webBaseUrl,
  apiBaseUrl,
  account,
  readyState,
  storageStatePath,
  screenshotPath,
  consoleLogPath,
  consoleEntries,
  resources,
  warnings,
}) {
  return {
    requestedUrl,
    finalUrl,
    capturedAt: new Date().toISOString(),
    webBaseUrl,
    apiBaseUrl,
    account,
    readyState,
    storageStatePath,
    screenshotPath,
    consoleLogPath,
    consoleEntryCount: consoleEntries.length,
    pageErrorCount: consoleEntries.filter((entry) => entry.eventType === 'pageerror').length,
    resources,
    warnings,
  };
}

function writeSnapshotArtifacts({
  runDir,
  htmlPath,
  metaPath,
  html,
  meta,
  externalStyles,
  externalScripts,
  inlineStyles,
  inlineScripts,
}) {
  fs.mkdirSync(path.join(runDir, 'css'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'js'), { recursive: true });

  for (const style of externalStyles) {
    fs.writeFileSync(path.join(runDir, style.localPath), rewriteCssUrls(style.body, style.originalUrl), 'utf8');
  }
  for (const script of externalScripts) {
    fs.writeFileSync(path.join(runDir, script.localPath), script.body, 'utf8');
  }
  for (const inlineStyle of inlineStyles) {
    fs.writeFileSync(path.join(runDir, inlineStyle.localPath), inlineStyle.content, 'utf8');
  }
  for (const inlineScript of inlineScripts) {
    fs.writeFileSync(path.join(runDir, inlineScript.localPath), inlineScript.content, 'utf8');
  }

  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
}

module.exports = {
  INLINE_SCRIPT_PREFIX,
  INLINE_STYLE_PREFIX,
  assignInlineArtifactPaths,
  assignLocalResourcePaths,
  buildMetaPayload,
  rewriteCssUrls,
  rewriteSnapshotHtml,
  writeSnapshotArtifacts,
};
