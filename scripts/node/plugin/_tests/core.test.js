const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const { main, startDemoServer } = require('../core.js');

function makeTempPluginPath(prefix = 'oneflowse-plugin-') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return path.join(tempDir, 'acme-openai-compatible');
}

function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body,
        });
      });
    });

    req.on('error', reject);
  });
}

test('plugin init scaffolds provider plugin skeleton in target path', async () => {
  const pluginPath = makeTempPluginPath();

  await main(['init', pluginPath]);

  assert.equal(fs.existsSync(path.join(pluginPath, 'manifest.yaml')), true);
  assert.equal(
    fs.existsSync(path.join(pluginPath, 'provider', 'acme_openai_compatible.yaml')),
    true
  );
  assert.equal(
    fs.existsSync(path.join(pluginPath, 'provider', 'acme_openai_compatible.js')),
    true
  );
  assert.equal(fs.existsSync(path.join(pluginPath, 'models', 'llm', '_position.yaml')), true);
  assert.equal(fs.existsSync(path.join(pluginPath, 'i18n', 'en_US.json')), true);
  assert.equal(fs.existsSync(path.join(pluginPath, 'readme', 'README_en_US.md')), true);
  assert.equal(fs.existsSync(path.join(pluginPath, 'demo')), true);
  assert.equal(fs.existsSync(path.join(pluginPath, 'scripts')), true);

  const manifest = fs.readFileSync(path.join(pluginPath, 'manifest.yaml'), 'utf8');
  assert.match(manifest, /plugin_code: acme_openai_compatible/);
  assert.match(manifest, /contract_version: 1flowbase\.provider\/v1/);
  assert.match(manifest, /language: nodejs/);
});

test('plugin demo init writes demo assets and helper config files', async () => {
  const pluginPath = makeTempPluginPath();

  await main(['init', pluginPath]);
  await main(['demo', 'init', pluginPath]);

  const indexHtml = path.join(pluginPath, 'demo', 'index.html');
  const appJs = path.join(pluginPath, 'demo', 'app.js');
  const stylesCss = path.join(pluginPath, 'demo', 'styles.css');
  const helperConfig = path.join(pluginPath, 'scripts', 'demo.runner.example.json');

  assert.equal(fs.existsSync(indexHtml), true);
  assert.equal(fs.existsSync(appJs), true);
  assert.equal(fs.existsSync(stylesCss), true);
  assert.equal(fs.existsSync(helperConfig), true);

  const html = fs.readFileSync(indexHtml, 'utf8');
  assert.match(html, /Provider Instance/);
  assert.match(html, /Validate/);
  assert.match(html, /List Models/);
  assert.match(html, /Prompt \/ Stream/);
  assert.match(html, /Tool Call \/ MCP/);
  assert.match(html, /Usage \/ Token/);
});

test('plugin demo dev serves static demo assets and injected runtime config', async () => {
  const pluginPath = makeTempPluginPath();

  await main(['init', pluginPath]);
  await main(['demo', 'init', pluginPath]);

  const serverHandle = await startDemoServer({
    pluginPath,
    host: '127.0.0.1',
    port: 0,
    runnerUrl: 'http://127.0.0.1:7801',
    silent: true,
  });

  let config;
  try {
    const indexResponse = await request(`${serverHandle.baseUrl}/`);
    assert.equal(indexResponse.statusCode, 200);
    assert.match(indexResponse.body, /1Flowbase Plugin Demo/);

    const configResponse = await request(`${serverHandle.baseUrl}/__plugin_demo_config`);
    assert.equal(configResponse.statusCode, 200);

    config = JSON.parse(configResponse.body);
    assert.equal(config.runnerUrl, 'http://127.0.0.1:7801');
    assert.equal(config.providerCode, 'acme_openai_compatible');
    assert.notEqual(config.packageRoot, pluginPath);
    assert.equal(fs.existsSync(path.join(config.packageRoot, 'manifest.yaml')), true);
    assert.equal(fs.existsSync(path.join(config.packageRoot, 'provider')), true);
    assert.equal(fs.existsSync(path.join(config.packageRoot, 'demo')), false);
    assert.equal(fs.existsSync(path.join(config.packageRoot, 'scripts')), false);
  } finally {
    await serverHandle.close();
  }

  assert.equal(fs.existsSync(config.packageRoot), false);
});

test('plugin demo dev rejects target without generated demo assets', async () => {
  const pluginPath = makeTempPluginPath();

  await main(['init', pluginPath]);

  await assert.rejects(
    startDemoServer({
      pluginPath,
      host: '127.0.0.1',
      port: 0,
      runnerUrl: 'http://127.0.0.1:7801',
      silent: true,
    }),
    /缺少 demo 资源/
  );
});

test('plugin package creates a single .1flowbasepkg asset with checksum metadata', async () => {
  const pluginPath = makeTempPluginPath();
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowse-plugin-dist-'));

  await main(['init', pluginPath]);

  const result = await main(['package', pluginPath, '--out', outputDir]);

  assert.match(result.packageFile, /\.1flowbasepkg$/);
  assert.match(result.packageFile, new RegExp(`${result.checksum}\\.1flowbasepkg$`));
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(result.packageFile), true);
});

test('plugin package excludes demo and scripts from the packaged artifact', async () => {
  const pluginPath = makeTempPluginPath();
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowse-plugin-dist-'));

  await main(['init', pluginPath]);
  await main(['demo', 'init', pluginPath]);

  const result = await main(['package', pluginPath, '--out', outputDir]);
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowse-plugin-extract-'));
  const unpack = spawnSync('tar', ['-xzf', result.packageFile, '-C', extractedDir]);

  assert.equal(unpack.status, 0);
  assert.equal(fs.existsSync(path.join(pluginPath, 'demo')), true);
  assert.equal(fs.existsSync(path.join(pluginPath, 'scripts')), true);
  assert.equal(fs.existsSync(path.join(extractedDir, 'demo')), false);
  assert.equal(fs.existsSync(path.join(extractedDir, 'scripts')), false);
});
