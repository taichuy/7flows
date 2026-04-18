const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const MODES = new Set(['component', 'page', 'file', 'all-pages']);

function getRepoRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

function parseCliArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    return { mode: 'all-pages', target: null, help: true };
  }

  const [mode, target = null] = argv;

  if (!MODES.has(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  if (mode !== 'all-pages' && !target) {
    throw new Error(`Mode ${mode} requires a target`);
  }

  return {
    mode,
    target,
    help: false
  };
}

function usage() {
  process.stdout.write(`用法：node scripts/node/check-style-boundary.js <component|page|file|all-pages> [target]

示例：
  node scripts/node/check-style-boundary.js component component.account-popup
  node scripts/node/check-style-boundary.js page page.home
  node scripts/node/check-style-boundary.js file web/app/src/styles/global.css
  node scripts/node/check-style-boundary.js all-pages
`);
}

function loadManifest(repoRoot) {
  const manifestPath = path.join(
    repoRoot,
    'web',
    'app',
    'src',
    'style-boundary',
    'scenario-manifest.json'
  );

  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function resolveSceneIds(manifest, options) {
  switch (options.mode) {
    case 'component':
    case 'page':
      return [options.target];
    case 'all-pages':
      return manifest.filter((scene) => scene.kind === 'page').map((scene) => scene.id);
    case 'file': {
      const matched = manifest
        .filter((scene) => scene.impactFiles.includes(options.target))
        .map((scene) => scene.id);

      if (matched.length === 0) {
        throw new Error(`样式扩散失败：未声明 ${options.target} 的页面/组件场景映射`);
      }

      return matched;
    }
    default:
      throw new Error(`Unsupported mode: ${options.mode}`);
  }
}

function createProbeUrl(baseUrl, sceneId) {
  return `${baseUrl}/style-boundary.html?scene=${encodeURIComponent(sceneId)}`;
}

async function ensureFrontendHost(repoRoot) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(repoRoot, 'scripts', 'node', 'dev-up.js'),
        'ensure',
        '--frontend-only',
        '--skip-docker'
      ],
      {
        cwd: repoRoot,
        stdio: 'inherit'
      }
    );

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`dev-up ensure failed with exit code ${code}`));
    });
  });
}

function loadPlaywright(repoRoot) {
  const webRequire = createRequire(path.join(repoRoot, 'web', 'package.json'));
  return webRequire('playwright');
}

async function collectNodeResult(page, cdp, styleSheets, node) {
  const locator = page.locator(node.selector).first();
  await locator.waitFor();

  await locator.evaluate((element) => {
    element.setAttribute('data-style-boundary-probe', 'active');
  });

  const actual = await locator.evaluate((element, propertyAssertions) => {
    const styles = window.getComputedStyle(element);

    return Object.fromEntries(
      propertyAssertions.map((assertion) => [
        assertion.property,
        styles.getPropertyValue(assertion.property)
      ])
    );
  }, node.propertyAssertions);

  const { root } = await cdp.send('DOM.getDocument', {});
  const nodeId = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '[data-style-boundary-probe="active"]'
  });
  const matched = await cdp.send('CSS.getMatchedStylesForNode', { nodeId: nodeId.nodeId });

  await locator.evaluate((element) => {
    element.removeAttribute('data-style-boundary-probe');
  });

  return {
    node,
    actual,
    matchedRules: (matched.matchedCSSRules || []).map((ruleMatch) => ({
      selector: ruleMatch.rule.selectorList.text,
      origin: ruleMatch.rule.origin,
      sourceUrl: styleSheets.get(ruleMatch.rule.style.styleSheetId) || 'inline'
    }))
  };
}

function collectViolations(results) {
  return results.flatMap((result) =>
    result.node.propertyAssertions
      .filter((assertion) => result.actual[assertion.property] !== assertion.expected)
      .map((assertion) => ({
        nodeId: result.node.id,
        selector: result.node.selector,
        property: assertion.property,
        expected: assertion.expected,
        actual: result.actual[assertion.property],
        matchedRules: result.matchedRules
      }))
  );
}

function formatBoundaryFailure(sceneId, violations) {
  return `样式边界失败：${sceneId} ${violations
    .map(
      (violation) =>
        `${violation.nodeId}.${violation.property} expected=${violation.expected} actual=${violation.actual} source=${violation.matchedRules
          .map((rule) => `${rule.sourceUrl}::${rule.selector}`)
          .join('|')}`
    )
    .join(', ')}`;
}

async function runScene(browser, baseUrl, scene) {
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  const styleSheets = new Map();

  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  cdp.on('CSS.styleSheetAdded', (event) => {
    styleSheets.set(event.header.styleSheetId, event.header.sourceURL || 'inline');
  });

  await page.goto(createProbeUrl(baseUrl, scene.id), {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForFunction(() => window.__STYLE_BOUNDARY__?.ready === true);

  const nodeResults = [];

  for (const node of scene.boundaryNodes) {
    nodeResults.push(await collectNodeResult(page, cdp, styleSheets, node));
  }

  return {
    page,
    scene,
    violations: collectViolations(nodeResults)
  };
}

function ensureUploadsDir(repoRoot) {
  const uploadsDir = path.join(repoRoot, 'uploads', 'style-boundary');
  fs.mkdirSync(uploadsDir, { recursive: true });
  return uploadsDir;
}

async function main(argv) {
  const options = parseCliArgs(argv);

  if (options.help) {
    usage();
    return;
  }

  const repoRoot = getRepoRoot();
  const manifest = loadManifest(repoRoot);
  const sceneIds = resolveSceneIds(manifest, options);
  const uploadsDir = ensureUploadsDir(repoRoot);

  await ensureFrontendHost(repoRoot);

  const { chromium } = loadPlaywright(repoRoot);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });

  try {
    for (const sceneId of sceneIds) {
      const scene = manifest.find((entry) => entry.id === sceneId);

      if (!scene) {
        throw new Error(`Unknown style boundary scene: ${sceneId}`);
      }

      const result = await runScene(browser, 'http://127.0.0.1:3100', scene);

      if (result.violations.length > 0) {
        const screenshotPath = path.join(uploadsDir, `${scene.id}.png`);
        await result.page.screenshot({ path: screenshotPath, fullPage: true });
        throw new Error(formatBoundaryFailure(scene.id, result.violations));
      }

      process.stdout.write(`[1flowbase-style-boundary] PASS ${scene.id}\n`);
      await result.page.close();
    }
  } finally {
    await browser.close();
  }
}

module.exports = {
  createProbeUrl,
  formatBoundaryFailure,
  main,
  parseCliArgs,
  resolveSceneIds
};
