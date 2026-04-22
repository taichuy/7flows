const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createArtifactRoot } = require('../fs.js');
const { readPluginCode } = require('../manifest.js');
const { parseRustTargetTriple } = require('../package.js');
const { payloadSha256 } = require('../release.js');

test('readPluginCode prefers plugin_id from manifest', () => {
  const pluginPath = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-manifest-'));
  fs.writeFileSync(
    path.join(pluginPath, 'manifest.yaml'),
    'plugin_id: acme_provider@0.2.0\nversion: 0.2.0\n',
    'utf8'
  );

  assert.equal(readPluginCode(pluginPath), 'acme_provider');
});

test('readPluginCode ignores legacy plugin_code fallback once plugin_id is the only supported manifest key', () => {
  const pluginPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-manifest-no-legacy-')),
    'acme-openai-compatible'
  );
  fs.mkdirSync(pluginPath, { recursive: true });
  fs.writeFileSync(
    path.join(pluginPath, 'manifest.yaml'),
    'plugin_code: legacy_provider_code\nversion: 0.2.0\n',
    'utf8'
  );

  assert.equal(readPluginCode(pluginPath), 'acme_openai_compatible');
});

test('createArtifactRoot excludes requested top-level entries', () => {
  const pluginPath = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-artifact-'));
  fs.writeFileSync(path.join(pluginPath, 'manifest.yaml'), 'plugin_id: acme_provider@0.1.0\n', 'utf8');
  fs.mkdirSync(path.join(pluginPath, 'demo'), { recursive: true });
  fs.writeFileSync(path.join(pluginPath, 'demo', 'index.html'), '<h1>demo</h1>', 'utf8');
  fs.mkdirSync(path.join(pluginPath, 'provider'), { recursive: true });
  fs.writeFileSync(path.join(pluginPath, 'provider', 'acme_provider.yaml'), 'provider_code: acme_provider\n', 'utf8');

  const artifactRoot = createArtifactRoot(pluginPath, {
    excludedEntries: ['demo'],
    prefix: 'oneflowbase-plugin-artifact-test',
  });

  assert.equal(fs.existsSync(path.join(artifactRoot, 'manifest.yaml')), true);
  assert.equal(fs.existsSync(path.join(artifactRoot, 'provider', 'acme_provider.yaml')), true);
  assert.equal(fs.existsSync(path.join(artifactRoot, 'demo')), false);
});

test('parseRustTargetTriple returns expected asset suffix for windows target', () => {
  assert.deepEqual(parseRustTargetTriple('x86_64-pc-windows-msvc'), {
    rustTargetTriple: 'x86_64-pc-windows-msvc',
    os: 'windows',
    arch: 'amd64',
    libc: 'msvc',
    assetSuffix: 'windows-amd64',
    executableSuffix: '.exe',
  });
});

test('payloadSha256 ignores release metadata under _meta', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-release-'));
  fs.mkdirSync(path.join(rootDir, '_meta'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'provider'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'provider', 'acme_provider.yaml'), 'provider_code: acme_provider\n', 'utf8');
  fs.writeFileSync(path.join(rootDir, '_meta', 'official-release.json'), '{"schema_version":1}', 'utf8');

  const baseline = payloadSha256(rootDir);
  fs.writeFileSync(path.join(rootDir, '_meta', 'official-release.sig'), 'signature-bytes', 'utf8');

  assert.equal(payloadSha256(rootDir), baseline);
});
