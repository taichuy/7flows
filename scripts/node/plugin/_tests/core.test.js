const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { main, startDemoServer } = require('../core.js');

function makeTempPluginPath(prefix = 'oneflowbase-plugin-') {
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

function payloadSha256(rootDir) {
  const entries = [];

  function walk(currentDir) {
    const children = fs
      .readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const child of children) {
      const absolutePath = path.join(currentDir, child.name);
      const relativePath = path
        .relative(rootDir, absolutePath)
        .split(path.sep)
        .join('/');

      if (relativePath.startsWith('_meta/')) {
        continue;
      }

      if (child.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      entries.push([relativePath, fs.readFileSync(absolutePath)]);
    }
  }

  walk(rootDir);

  const hasher = crypto.createHash('sha256');
  for (const [relativePath, content] of entries) {
    hasher.update(relativePath);
    hasher.update(Buffer.from([0]));
    hasher.update(content);
    hasher.update(Buffer.from([0]));
  }

  return `sha256:${hasher.digest('hex')}`;
}

function writeFakeRuntimeBinary(outputDir, fileName = 'acme_openai_compatible-provider') {
  const binaryPath = path.join(outputDir, fileName);
  fs.writeFileSync(binaryPath, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
  fs.chmodSync(binaryPath, 0o755);
  return binaryPath;
}

test('plugin init scaffolds rust provider source and executable manifest', async () => {
  const pluginPath = makeTempPluginPath();

  await main(['init', pluginPath]);

  const manifest = fs.readFileSync(path.join(pluginPath, 'manifest.yaml'), 'utf8');
  assert.match(manifest, /schema_version: 2/);
  assert.match(manifest, /plugin_type: model_provider/);
  assert.match(manifest, /plugin_code: acme_openai_compatible/);
  assert.match(manifest, /label:\n    en_US: acme-openai-compatible/);
  assert.match(manifest, /label:\n    en_US: acme-openai-compatible\n    zh_Hans: acme-openai-compatible/);
  assert.match(
    manifest,
    /description:\n    en_US: Provider plugin for services that expose an OpenAI-compatible API surface\./
  );
  assert.match(
    manifest,
    /description:\n    en_US: Provider plugin for services that expose an OpenAI-compatible API surface\.\n    zh_Hans: 面向 OpenAI 兼容接口服务的模型供应商插件。/
  );
  assert.match(manifest, /kind: executable/);
  assert.match(manifest, /protocol: stdio-json/);
  assert.match(manifest, /path: bin\/acme_openai_compatible-provider/);
  assert.equal(fs.existsSync(path.join(pluginPath, 'Cargo.toml')), true);
  assert.equal(fs.existsSync(path.join(pluginPath, 'src', 'main.rs')), true);
  assert.equal(
    fs.existsSync(path.join(pluginPath, 'provider', 'acme_openai_compatible.yaml')),
    true
  );
  assert.equal(
    fs.existsSync(path.join(pluginPath, 'provider', 'acme_openai_compatible.js')),
    false
  );
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
    assert.match(indexResponse.body, /1flowbase Plugin Demo/);

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

test('plugin package copies a target binary into bin and encodes the target in the asset name', async () => {
  const pluginPath = makeTempPluginPath();
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-dist-'));

  await main(['init', pluginPath]);
  const fakeBinary = writeFakeRuntimeBinary(outputDir);

  const result = await main([
    'package',
    pluginPath,
    '--out',
    outputDir,
    '--runtime-binary',
    fakeBinary,
    '--target',
    'x86_64-unknown-linux-musl',
  ]);

  assert.match(result.packageFile, /@linux-amd64@[a-f0-9]{64}\.1flowbasepkg$/);
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(result.packageFile), true);

  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-extract-'));
  const unpack = spawnSync('tar', ['-xzf', result.packageFile, '-C', extractedDir]);
  assert.equal(unpack.status, 0);
  assert.equal(
    fs.existsSync(path.join(extractedDir, 'bin', 'acme_openai_compatible-provider')),
    true
  );
});

test('plugin package excludes demo and scripts from the packaged artifact', async () => {
  const pluginPath = makeTempPluginPath();
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-dist-'));

  await main(['init', pluginPath]);
  await main(['demo', 'init', pluginPath]);
  const fakeBinary = writeFakeRuntimeBinary(outputDir);

  const result = await main([
    'package',
    pluginPath,
    '--out',
    outputDir,
    '--runtime-binary',
    fakeBinary,
    '--target',
    'x86_64-unknown-linux-musl',
  ]);
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-extract-'));
  const unpack = spawnSync('tar', ['-xzf', result.packageFile, '-C', extractedDir]);

  assert.equal(unpack.status, 0);
  assert.equal(fs.existsSync(path.join(pluginPath, 'demo')), true);
  assert.equal(fs.existsSync(path.join(pluginPath, 'scripts')), true);
  assert.equal(fs.existsSync(path.join(extractedDir, 'demo')), false);
  assert.equal(fs.existsSync(path.join(extractedDir, 'scripts')), false);
});

test('plugin package writes official signature metadata when signing inputs are provided', async () => {
  const pluginPath = makeTempPluginPath();
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-dist-'));
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-extract-'));
  const signingKeyFile = path.join(outputDir, 'official-signing-key.pem');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

  await main(['init', pluginPath]);
  const fakeBinary = writeFakeRuntimeBinary(outputDir);
  fs.writeFileSync(
    signingKeyFile,
    privateKey.export({ format: 'pem', type: 'pkcs8' }),
    'utf8'
  );

  const result = await main([
    'package',
    pluginPath,
    '--out',
    outputDir,
    '--runtime-binary',
    fakeBinary,
    '--target',
    'x86_64-unknown-linux-musl',
    '--signing-key-pem-file',
    signingKeyFile,
    '--signing-key-id',
    'official-key-2026-04',
    '--issued-at',
    '2026-04-19T13:00:00Z',
  ]);

  const unpack = spawnSync('tar', ['-xzf', result.packageFile, '-C', extractedDir]);
  assert.equal(unpack.status, 0);

  const releasePath = path.join(extractedDir, '_meta', 'official-release.json');
  const signaturePath = path.join(extractedDir, '_meta', 'official-release.sig');
  assert.equal(fs.existsSync(releasePath), true);
  assert.equal(fs.existsSync(signaturePath), true);

  const releaseBytes = fs.readFileSync(releasePath);
  const release = JSON.parse(releaseBytes.toString('utf8'));
  const signature = fs.readFileSync(signaturePath);

  assert.equal(release.schema_version, 1);
  assert.equal(release.plugin_id, '1flowbase.acme_openai_compatible');
  assert.equal(release.provider_code, 'acme_openai_compatible');
  assert.equal(release.version, '0.1.0');
  assert.equal(release.contract_version, '1flowbase.provider/v1');
  assert.equal(release.signature_algorithm, 'ed25519');
  assert.equal(release.signing_key_id, 'official-key-2026-04');
  assert.equal(release.issued_at, '2026-04-19T13:00:00Z');
  assert.equal(release.payload_sha256, payloadSha256(extractedDir));
  assert.equal(
    crypto.verify(null, releaseBytes, publicKey, signature),
    true
  );
});
