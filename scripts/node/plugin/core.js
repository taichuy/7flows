const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const DEFAULT_DEMO_HOST = '127.0.0.1';
const DEFAULT_DEMO_PORT = 4310;
const DEFAULT_RUNNER_URL = 'http://127.0.0.1:7801';

function log(message, options = {}) {
  if (options.silent) {
    return;
  }

  process.stdout.write(`[1flowbase-plugin] ${message}\n`);
}

function usage() {
  process.stdout.write(`用法：node scripts/node/plugin.js <command> [options]

命令：
  init [plugin-path]
    生成 provider plugin 基础源码结构；未提供路径时默认使用当前目录。

  demo init <plugin-path>
    在目标插件目录下生成 demo 页面与本地辅助脚本。

  demo dev <plugin-path> [--host <host>] [--port <port>] [--runner-url <url>]
    启动目标插件目录下 demo/ 的本地静态服务。

  package <plugin-path> --out <output-dir>
    生成过滤 demo/scripts/target 后的 .1flowbasepkg 安装产物，并返回 sha256 元数据。
    可选传入官方签名参数，将 _meta/official-release.json 与 .sig 一并写入包内。

选项：
  --runtime-binary <file>  package 时写入 bin/ 的已编译 provider 可执行文件
  --target <triple>        package 时指定 rust target triple，例如 x86_64-unknown-linux-musl
  --host <host>        demo dev 监听地址，默认 127.0.0.1
  --port <port>        demo dev 监听端口，默认 4310；传 0 表示自动分配
  --runner-url <url>   传给 demo 页面显示的 plugin-runner 地址，默认 http://127.0.0.1:7801
  --signing-key-pem-file <file>  package 时使用的 ed25519 PKCS8 私钥 PEM 文件
  --signing-key-id <id>          package 时写入官方签名 key id
  --issued-at <iso8601>          package 时写入官方签名签发时间，默认当前 UTC 时间
  -h, --help           查看帮助

示例：
  node scripts/node/plugin.js init ../1flowbase-official-plugins/models/openai_compatible
  node scripts/node/plugin.js demo init ../1flowbase-official-plugins/models/openai_compatible
  node scripts/node/plugin.js demo dev ../1flowbase-official-plugins/models/openai_compatible --port 4310
  node scripts/node/plugin.js package ../1flowbase-official-plugins/models/openai_compatible --out ./dist
  node scripts/node/plugin.js package ../1flowbase-official-plugins/models/openai_compatible --out ./dist --signing-key-pem-file ./official-plugin-signing-key.pem --signing-key-id official-key-2026-04
`);
}

function sanitizeCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function assertNonEmptyCode(value, label) {
  if (!value) {
    throw new Error(`${label} 不能为空`);
  }

  return value;
}

function getPluginName(pluginPath) {
  return path.basename(path.resolve(pluginPath));
}

function ensureTargetDirForInit(pluginPath) {
  if (!fs.existsSync(pluginPath)) {
    fs.mkdirSync(pluginPath, { recursive: true });
    return;
  }

  const entries = fs.readdirSync(pluginPath);
  if (entries.length > 0) {
    throw new Error(`目标目录非空，拒绝覆盖：${pluginPath}`);
  }
}

function ensurePluginScaffoldExists(pluginPath) {
  if (!fs.existsSync(pluginPath)) {
    throw new Error(`目标插件目录不存在：${pluginPath}`);
  }

  const manifestPath = path.join(pluginPath, 'manifest.yaml');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`缺少 manifest.yaml，请先执行 plugin init：${pluginPath}`);
  }
}

function writeFile(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function writeKeepFile(targetPath) {
  writeFile(targetPath, '');
}

function copyTree(sourcePath, targetPath) {
  const stats = fs.statSync(sourcePath);
  if (stats.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath)) {
      copyTree(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function createArtifactRoot(pluginPath, options = {}) {
  const excludedEntries = new Set(options.excludedEntries || []);
  const prefix = options.prefix || '1flowbase-plugin-artifact';
  const artifactRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `${prefix}-${sanitizeCode(getPluginName(pluginPath))}-`)
  );

  for (const entry of fs.readdirSync(pluginPath)) {
    if (excludedEntries.has(entry)) {
      continue;
    }
    copyTree(path.join(pluginPath, entry), path.join(artifactRoot, entry));
  }

  return artifactRoot;
}

function createDemoPackageRoot(pluginPath) {
  return createArtifactRoot(pluginPath, {
    prefix: '1flowbase-plugin-demo',
    excludedEntries: ['demo', 'scripts'],
  });
}

function createPackageArtifactRoot(pluginPath) {
  return createArtifactRoot(pluginPath, {
    prefix: '1flowbase-plugin-package',
    excludedEntries: ['demo', 'scripts', 'target'],
  });
}

function removeDirIfExists(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
}

function createManifestTemplate({ pluginCode, pluginName }) {
  return `schema_version: 2
plugin_type: model_provider
plugin_code: ${pluginCode}
version: 0.1.0
contract_version: 1flowbase.provider/v1
metadata:
  author: taichuy
  label:
    en_US: ${pluginName}
    zh_Hans: ${pluginName}
  description:
    en_US: Provider plugin for services that expose an OpenAI-compatible API surface.
    zh_Hans: 面向 OpenAI 兼容接口服务的模型供应商插件。
provider:
  definition: provider/${pluginCode}.yaml
runtime:
  kind: executable
  protocol: stdio-json
  executable:
    path: bin/${pluginCode}-provider
limits:
  memory_bytes: 268435456
  invoke_timeout_ms: 30000
capabilities:
  model_types:
    - llm
compat:
  minimum_host_version: 0.1.0
`;
}

function createProviderYamlTemplate({ pluginCode, pluginName }) {
  return `provider_code: ${pluginCode}
display_name: ${pluginName}
help_url: https://example.com/${pluginCode}
default_base_url: https://api.example.com
model_discovery: hybrid
config_schema:
  - key: base_url
    type: string
    required: true
  - key: api_key
    type: secret
    required: true
`;
}

function createCargoTomlTemplate({ pluginCode }) {
  return `[package]
name = "${pluginCode}-provider"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
`;
}

function createRustMainTemplate({ pluginCode }) {
  return `use std::io::{self, Read};

fn main() {
    let mut stdin = String::new();
    io::stdin().read_to_string(&mut stdin).unwrap();

    let payload: serde_json::Value =
        serde_json::from_str(&stdin).unwrap_or(serde_json::Value::Null);
    let model = payload
        .get("input")
        .and_then(|value| value.get("model"))
        .and_then(|value| value.as_str())
        .unwrap_or("generated-rust-scaffold");

    println!(
        "{}",
        serde_json::json!({
            "ok": true,
            "result": {
                "provider_code": "${pluginCode}",
                "message": "generated rust scaffold",
                "echo_model": model,
            }
        })
    );
}
`;
}

function createExampleModelYaml({ pluginCode }) {
  return `model: ${pluginCode}_chat
label: Example Chat Model
family: llm
capabilities:
  - stream
  - tool_call
  - usage
`;
}

function createI18nTemplate({ pluginName }) {
  return JSON.stringify(
    {
      plugin: {
        label: pluginName,
        description: `${pluginName} provider plugin scaffold`,
      },
      provider: {
        label: pluginName,
      },
      demo: {
        title: `${pluginName} Demo`,
      },
    },
    null,
    2
  ) + '\n';
}

function createReadmeTemplate({ pluginCode, pluginName }) {
  return `# ${pluginName}

` +
    `This scaffold was generated by \`node scripts/node/plugin.js init\`.

## Provider Code

- \`${pluginCode}\`

## Next Steps

1. Replace \`src/main.rs\` with the real provider runtime.
2. Update \`provider/${pluginCode}.yaml\` and \`models/llm/*.yaml\`.
3. Build a target binary with \`cargo build --release --target x86_64-unknown-linux-musl\`.
4. Run \`node scripts/node/plugin.js package <plugin-path> --out <dir> --runtime-binary <file> --target x86_64-unknown-linux-musl\`.
5. Run \`node scripts/node/plugin.js demo init <plugin-path>\` to generate the local demo.
`;
}

function createDemoIndexHtml({ pluginName }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>1flowbase Plugin Demo</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="layout">
      <header class="hero">
        <p class="eyebrow">1flowbase Plugin Demo</p>
        <h1>${pluginName}</h1>
        <p class="subtitle">Local provider demo scaffold generated by the host-side plugin CLI.</p>
        <div class="meta">
          <span id="runner-status" class="status-chip">Runner: checking</span>
          <span id="runner-url" class="status-chip">URL: loading</span>
        </div>
      </header>

      <section class="card" id="provider-instance">
        <h2>Provider Instance</h2>
        <label>Base URL <input id="base-url" value="https://api.example.com" /></label>
        <label>API Key <input id="api-key" type="password" value="sk-demo-key" /></label>
        <label>Default Model <input id="default-model" value="example-chat" /></label>
      </section>

      <section class="card">
        <div class="card-header">
          <h2>Validate</h2>
          <button id="validate-button" type="button">Run Validate</button>
        </div>
        <pre id="validate-output">Waiting for validation.</pre>
      </section>

      <section class="card">
        <div class="card-header">
          <h2>List Models</h2>
          <button id="list-models-button" type="button">List Models</button>
        </div>
        <pre id="models-output">No models fetched yet.</pre>
      </section>

      <section class="card">
        <div class="card-header">
          <h2>Prompt / Stream</h2>
          <button id="stream-button" type="button">Run Stream</button>
        </div>
        <textarea id="prompt-input" rows="4">Write a concise summary of this provider integration.</textarea>
        <pre id="stream-output">No stream yet.</pre>
      </section>

      <section class="card">
        <div class="card-header">
          <h2>Tool Call / MCP</h2>
          <button id="tool-button" type="button">Simulate Tool Call</button>
        </div>
        <pre id="tool-output">No tool call yet.</pre>
      </section>

      <section class="card">
        <h2>Usage / Token</h2>
        <dl class="usage-grid">
          <div>
            <dt>Prompt Tokens</dt>
            <dd id="prompt-tokens">0</dd>
          </div>
          <div>
            <dt>Completion Tokens</dt>
            <dd id="completion-tokens">0</dd>
          </div>
          <div>
            <dt>Total Tokens</dt>
            <dd id="total-tokens">0</dd>
          </div>
        </dl>
      </section>
    </main>

    <script src="./app.js"></script>
  </body>
</html>
`;
}

function createDemoStylesCss() {
  return `:root {
  color-scheme: light;
  --bg: #f4efe6;
  --panel: rgba(255, 250, 242, 0.92);
  --panel-strong: #fff7ec;
  --text: #1e1a17;
  --muted: #6f6258;
  --accent: #a24d2c;
  --accent-ink: #fff8f0;
  --border: rgba(162, 77, 44, 0.18);
  --shadow: 0 18px 48px rgba(104, 63, 41, 0.12);
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(255, 213, 170, 0.5), transparent 32%),
    linear-gradient(180deg, #f7f1e8 0%, #efe4d6 100%);
  color: var(--text);
}

.layout {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0 56px;
  display: grid;
  gap: 18px;
}

.hero,
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 22px;
  box-shadow: var(--shadow);
}

.hero {
  padding: 28px;
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero h1,
.card h2 {
  margin: 0;
  font-family: "IBM Plex Serif", "Georgia", serif;
}

.subtitle {
  margin: 10px 0 0;
  color: var(--muted);
  line-height: 1.5;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--panel-strong);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 13px;
}

.card {
  padding: 22px;
  display: grid;
  gap: 14px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

label {
  display: grid;
  gap: 8px;
  font-weight: 600;
}

input,
textarea,
button {
  font: inherit;
}

input,
textarea {
  width: 100%;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(111, 98, 88, 0.22);
  background: #fffdf9;
}

button {
  border: 0;
  border-radius: 14px;
  padding: 11px 16px;
  background: var(--accent);
  color: var(--accent-ink);
  cursor: pointer;
  font-weight: 700;
}

button:hover {
  filter: brightness(1.06);
}

pre {
  margin: 0;
  padding: 16px;
  border-radius: 16px;
  background: #1f1b18;
  color: #f6efe7;
  overflow: auto;
  white-space: pre-wrap;
}

.usage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin: 0;
}

.usage-grid div {
  padding: 14px;
  border-radius: 16px;
  background: var(--panel-strong);
  border: 1px solid var(--border);
}

.usage-grid dt {
  margin: 0 0 6px;
  color: var(--muted);
  font-size: 13px;
}

.usage-grid dd {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
}

@media (max-width: 720px) {
  .layout {
    width: min(100%, calc(100% - 20px));
    padding-top: 18px;
  }

  .hero,
  .card {
    border-radius: 18px;
    padding: 18px;
  }

  .card-header {
    flex-direction: column;
    align-items: stretch;
  }
}
`;
}

function createDemoAppJs() {
  return `(async function bootstrapDemo() {
  const state = {
    promptTokens: 0,
    completionTokens: 0,
  };

  async function loadConfig() {
    const response = await fetch('/__plugin_demo_config');
    return response.json();
  }

  function setOutput(id, value) {
    document.getElementById(id).textContent =
      typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }

  function updateUsage(promptTokens, completionTokens) {
    state.promptTokens = promptTokens;
    state.completionTokens = completionTokens;
    document.getElementById('prompt-tokens').textContent = String(promptTokens);
    document.getElementById('completion-tokens').textContent = String(completionTokens);
    document.getElementById('total-tokens').textContent = String(promptTokens + completionTokens);
  }

  const config = await loadConfig();
  document.getElementById('runner-url').textContent = 'URL: ' + config.runnerUrl;

  try {
    const healthResponse = await fetch(config.runnerUrl.replace(/\\/$/, '') + '/health');
    document.getElementById('runner-status').textContent =
      healthResponse.ok ? 'Runner: reachable' : 'Runner: unavailable';
  } catch (error) {
    document.getElementById('runner-status').textContent = 'Runner: unreachable';
  }

  document.getElementById('validate-button').addEventListener('click', () => {
    const baseUrl = document.getElementById('base-url').value;
    const apiKey = document.getElementById('api-key').value;
    setOutput('validate-output', {
      ok: true,
      providerCode: config.providerCode,
      base_url: baseUrl,
      api_key_present: Boolean(apiKey),
      note: 'This is a scaffold response. Wire it to the real debug runtime later.',
    });
  });

  document.getElementById('list-models-button').addEventListener('click', () => {
    setOutput('models-output', [
      { code: config.providerCode + '_chat', label: 'Example Chat Model', mode: 'chat' },
      { code: config.providerCode + '_reasoning', label: 'Example Reasoning Model', mode: 'reasoning' },
      { code: config.providerCode + '_vision', label: 'Example Vision Model', mode: 'multimodal' },
    ]);
  });

  document.getElementById('stream-button').addEventListener('click', async () => {
    const prompt = document.getElementById('prompt-input').value.trim();
    const tokens = prompt ? Math.max(8, Math.ceil(prompt.length / 4)) : 8;
    const chunks = [
      'Streaming scaffold connected. ',
      'Replace this animation with real provider events. ',
      'Prompt preview: ' + prompt.slice(0, 48),
    ];

    setOutput('stream-output', '');
    let rendered = '';
    for (const chunk of chunks) {
      rendered += chunk;
      setOutput('stream-output', rendered);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }

    updateUsage(tokens, 24);
  });

  document.getElementById('tool-button').addEventListener('click', () => {
    setOutput('tool-output', {
      tool_call: {
        tool: 'search_docs',
        arguments: { query: 'provider kernel contract' },
      },
      mcp_call: {
        server: 'docs',
        method: 'search',
      },
      status: 'scaffold_only',
    });
  });

  updateUsage(0, 0);
})();`;
}

function createDemoRunnerConfigTemplate({ pluginCode }) {
  return JSON.stringify(
    {
      providerCode: pluginCode,
      runnerUrl: DEFAULT_RUNNER_URL,
      notes: [
        'This file is for local demo wiring hints only.',
        'Real plugin-runner debug runtime integration is not implemented in this scaffold yet.',
      ],
    },
    null,
    2
  ) + '\n';
}

function readPluginCode(pluginPath) {
  const manifestPath = path.join(pluginPath, 'manifest.yaml');
  if (!fs.existsSync(manifestPath)) {
    return sanitizeCode(getPluginName(pluginPath));
  }

  const content = fs.readFileSync(manifestPath, 'utf8');
  const match = content.match(/^plugin_code:\s*(.+)$/m);
  return sanitizeCode(match ? match[1] : getPluginName(pluginPath));
}

function readManifestField(pluginPath, fieldName, fallbackValue) {
  const manifestPath = path.join(pluginPath, 'manifest.yaml');
  if (!fs.existsSync(manifestPath)) {
    return fallbackValue;
  }

  const content = fs.readFileSync(manifestPath, 'utf8');
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^${escapedField}:\\s*(.+)$`, 'm'));
  if (!match) {
    return fallbackValue;
  }

  const value = String(match[1] || '').trim();
  return value || fallbackValue;
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseRustTargetTriple(raw) {
  switch (String(raw || '').trim()) {
    case 'x86_64-unknown-linux-musl':
      return {
        rustTargetTriple: raw,
        os: 'linux',
        arch: 'amd64',
        libc: 'musl',
        assetSuffix: 'linux-amd64',
      };
    case 'aarch64-unknown-linux-musl':
      return {
        rustTargetTriple: raw,
        os: 'linux',
        arch: 'arm64',
        libc: 'musl',
        assetSuffix: 'linux-arm64',
      };
    default:
      throw new Error(`暂不支持的 rust target: ${raw}`);
  }
}

function payloadSha256(rootDir) {
  const files = [];

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

      files.push([relativePath, fs.readFileSync(absolutePath)]);
    }
  }

  walk(rootDir);

  const hasher = crypto.createHash('sha256');
  for (const [relativePath, content] of files) {
    hasher.update(relativePath);
    hasher.update(Buffer.from([0]));
    hasher.update(content);
    hasher.update(Buffer.from([0]));
  }

  return `sha256:${hasher.digest('hex')}`;
}

function writeOfficialSignatureFiles(stagedRoot, options) {
  const privateKeyPem = fs.readFileSync(options.signingKeyPemFile, 'utf8');
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const release = {
    schema_version: 1,
    plugin_id: options.pluginId,
    provider_code: options.providerCode,
    version: options.version,
    contract_version: options.contractVersion,
    artifact_sha256: options.artifactSha256,
    payload_sha256: payloadSha256(stagedRoot),
    signature_algorithm: 'ed25519',
    signing_key_id: options.signingKeyId,
    issued_at: options.issuedAt,
  };
  const releaseBytes = Buffer.from(JSON.stringify(release), 'utf8');
  const signature = crypto.sign(null, releaseBytes, privateKey);
  const metaDir = path.join(stagedRoot, '_meta');

  fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(path.join(metaDir, 'official-release.json'), releaseBytes);
  fs.writeFileSync(path.join(metaDir, 'official-release.sig'), signature);

  return {
    signatureAlgorithm: release.signature_algorithm,
    signingKeyId: release.signing_key_id,
  };
}

function createPluginPackage(pluginPath, outputDir, options = {}) {
  ensurePluginScaffoldExists(pluginPath);

  const resolvedPluginPath = path.resolve(pluginPath);
  const resolvedOutputDir = path.resolve(outputDir);
  const runtimeBinaryFile = options.runtimeBinaryFile
    ? path.resolve(options.runtimeBinaryFile)
    : null;
  if (!runtimeBinaryFile) {
    throw new Error('package 需要 --runtime-binary 指向已编译 provider 可执行文件');
  }
  if (!options.targetTriple) {
    throw new Error('package 需要 --target 指定 rust target triple');
  }
  const target = parseRustTargetTriple(options.targetTriple);
  const stagedRoot = createPackageArtifactRoot(resolvedPluginPath);
  const pluginCode = readPluginCode(resolvedPluginPath);
  const version = readManifestField(resolvedPluginPath, 'version', '0.1.0');
  const contractVersion = readManifestField(
    resolvedPluginPath,
    'contract_version',
    '1flowbase.provider/v1'
  );

  if (!fs.existsSync(runtimeBinaryFile)) {
    throw new Error(`runtime binary 不存在：${runtimeBinaryFile}`);
  }

  fs.mkdirSync(resolvedOutputDir, { recursive: true });

  const binaryName = target.os === 'windows'
    ? `${pluginCode}-provider.exe`
    : `${pluginCode}-provider`;
  const stagedBinaryPath = path.join(stagedRoot, 'bin', binaryName);
  fs.mkdirSync(path.dirname(stagedBinaryPath), { recursive: true });
  fs.copyFileSync(runtimeBinaryFile, stagedBinaryPath);
  fs.chmodSync(stagedBinaryPath, 0o755);

  const pendingFile = path.join(
    resolvedOutputDir,
    `1flowbase@${pluginCode}@${version}@${target.assetSuffix}@pending.1flowbasepkg`
  );

  try {
    let signatureMetadata = null;
    if (options.signingKeyPemFile && options.signingKeyId) {
      signatureMetadata = writeOfficialSignatureFiles(stagedRoot, {
        pluginId: `1flowbase.${pluginCode}`,
        providerCode: pluginCode,
        version,
        contractVersion,
        artifactSha256: payloadSha256(stagedRoot),
        signingKeyPemFile: path.resolve(options.signingKeyPemFile),
        signingKeyId: options.signingKeyId,
        issuedAt: options.issuedAt || new Date().toISOString(),
      });
    }

    const result = spawnSync('tar', ['-czf', pendingFile, '-C', stagedRoot, '.'], {
      stdio: 'pipe',
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      const stderr = result.stderr ? result.stderr.toString('utf8').trim() : '';
      throw new Error(stderr || `tar 打包失败，退出码 ${result.status}`);
    }

    const checksum = hashFile(pendingFile);
    const finalFile = path.join(
      resolvedOutputDir,
      `1flowbase@${pluginCode}@${version}@${target.assetSuffix}@${checksum}.1flowbasepkg`
    );
    fs.renameSync(pendingFile, finalFile);

    return {
      pluginPath: resolvedPluginPath,
      packageFile: finalFile,
      packageName: path.basename(finalFile),
      checksum,
      os: target.os,
      arch: target.arch,
      libc: target.libc,
      rustTarget: target.rustTargetTriple,
      signatureAlgorithm: signatureMetadata?.signatureAlgorithm ?? null,
      signingKeyId: signatureMetadata?.signingKeyId ?? null,
    };
  } finally {
    removeDirIfExists(stagedRoot);
    removeDirIfExists(pendingFile);
  }
}

function createPluginScaffold(pluginPath, options = {}) {
  const pluginName = getPluginName(pluginPath);
  const pluginCode = assertNonEmptyCode(
    sanitizeCode(options.providerCode || pluginName),
    'provider code'
  );

  ensureTargetDirForInit(pluginPath);

  writeFile(
    path.join(pluginPath, 'manifest.yaml'),
    createManifestTemplate({ pluginCode, pluginName })
  );
  writeFile(
    path.join(pluginPath, 'provider', `${pluginCode}.yaml`),
    createProviderYamlTemplate({ pluginCode, pluginName })
  );
  writeFile(path.join(pluginPath, 'Cargo.toml'), createCargoTomlTemplate({ pluginCode }));
  writeFile(
    path.join(pluginPath, 'src', 'main.rs'),
    createRustMainTemplate({ pluginCode })
  );
  writeFile(
    path.join(pluginPath, 'models', 'llm', '_position.yaml'),
    'items:\n  - example\n'
  );
  writeFile(
    path.join(pluginPath, 'models', 'llm', `${pluginCode}_chat.yaml`),
    createExampleModelYaml({ pluginCode })
  );
  writeFile(path.join(pluginPath, 'i18n', 'en_US.json'), createI18nTemplate({ pluginName }));
  writeFile(
    path.join(pluginPath, 'readme', 'README_en_US.md'),
    createReadmeTemplate({ pluginCode, pluginName })
  );
  writeKeepFile(path.join(pluginPath, 'demo', '.gitkeep'));
  writeKeepFile(path.join(pluginPath, 'scripts', '.gitkeep'));
  writeKeepFile(path.join(pluginPath, '_assets', '.gitkeep'));

  return {
    pluginPath,
    pluginName,
    pluginCode,
  };
}

function createPluginDemoScaffold(pluginPath) {
  ensurePluginScaffoldExists(pluginPath);

  const pluginName = getPluginName(pluginPath);
  const pluginCode = readPluginCode(pluginPath);

  writeFile(path.join(pluginPath, 'demo', 'index.html'), createDemoIndexHtml({ pluginName }));
  writeFile(path.join(pluginPath, 'demo', 'styles.css'), createDemoStylesCss());
  writeFile(path.join(pluginPath, 'demo', 'app.js'), createDemoAppJs());
  writeFile(
    path.join(pluginPath, 'scripts', 'demo.runner.example.json'),
    createDemoRunnerConfigTemplate({ pluginCode })
  );

  return {
    pluginPath,
    pluginName,
    pluginCode,
  };
}

function resolvePort(value) {
  if (value == null) {
    return DEFAULT_DEMO_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`非法端口：${value}`);
  }

  return port;
}

function getContentType(filePath) {
  if (filePath.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }
  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  if (filePath.endsWith('.js')) {
    return 'application/javascript; charset=utf-8';
  }
  if (filePath.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }
  return 'text/plain; charset=utf-8';
}

function readStaticFile(demoDir, requestPath) {
  const normalized = requestPath === '/' ? '/index.html' : requestPath;
  const fullPath = path.normalize(path.join(demoDir, normalized));

  if (!fullPath.startsWith(path.normalize(demoDir + path.sep))) {
    return null;
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return null;
  }

  return fullPath;
}

async function startDemoServer(options) {
  const pluginPath = path.resolve(options.pluginPath);
  const demoDir = path.join(pluginPath, 'demo');
  const indexPath = path.join(demoDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`缺少 demo 资源，请先执行 plugin demo init：${pluginPath}`);
  }

  const pluginCode = readPluginCode(pluginPath);
  const host = options.host || DEFAULT_DEMO_HOST;
  const port = resolvePort(options.port);
  const runnerUrl = options.runnerUrl || DEFAULT_RUNNER_URL;
  const silent = Boolean(options.silent);
  const packageRoot = createDemoPackageRoot(pluginPath);

  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/__plugin_demo_config') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(
        JSON.stringify(
          {
            providerCode: pluginCode,
            pluginPath,
            packageRoot,
            runnerUrl,
          },
          null,
          2
        )
      );
      return;
    }

    const staticPath = readStaticFile(demoDir, url.pathname);
    if (!staticPath) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
      return;
    }

    response.writeHead(200, { 'content-type': getContentType(staticPath) });
    response.end(fs.readFileSync(staticPath));
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
  } catch (error) {
    removeDirIfExists(packageRoot);
    throw error;
  }

  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;
  const baseUrl = `http://${host}:${resolvedPort}`;
  log(`Demo server ready at ${baseUrl}`, { silent });
  log(`Runner URL set to ${runnerUrl}`, { silent });
  let closed = false;

  return {
    server,
    baseUrl,
    close: () =>
      new Promise((resolve, reject) => {
        if (closed) {
          resolve();
          return;
        }
        closed = true;
        server.close((error) => {
          removeDirIfExists(packageRoot);
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

function parseCliArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help') || argv.length === 0) {
    return { command: 'help' };
  }

  const [first, second, third, ...rest] = argv;

  if (first === 'init') {
    if (rest.length > 0) {
      throw new Error(`未知参数：${rest[0]}`);
    }
    return {
      command: 'init',
      pluginPath: second ? path.resolve(second) : process.cwd(),
    };
  }

  if (first === 'demo' && second === 'init') {
    if (!third) {
      throw new Error('demo init 需要提供 <plugin-path>');
    }
    if (rest.length > 0) {
      throw new Error(`未知参数：${rest[0]}`);
    }
    return {
      command: 'demo-init',
      pluginPath: path.resolve(third),
    };
  }

  if (first === 'demo' && second === 'dev') {
    if (!third) {
      throw new Error('demo dev 需要提供 <plugin-path>');
    }

    const options = {
      command: 'demo-dev',
      pluginPath: path.resolve(third),
      host: DEFAULT_DEMO_HOST,
      port: DEFAULT_DEMO_PORT,
      runnerUrl: DEFAULT_RUNNER_URL,
    };

    for (let index = 0; index < rest.length; index += 1) {
      const arg = rest[index];
      const next = rest[index + 1];
      if (arg === '--host') {
        if (!next) {
          throw new Error('--host 需要值');
        }
        options.host = next;
        index += 1;
        continue;
      }
      if (arg === '--port') {
        if (!next) {
          throw new Error('--port 需要值');
        }
        options.port = resolvePort(next);
        index += 1;
        continue;
      }
      if (arg === '--runner-url') {
        if (!next) {
          throw new Error('--runner-url 需要值');
        }
        options.runnerUrl = next;
        index += 1;
        continue;
      }
      throw new Error(`未知参数：${arg}`);
    }

    return options;
  }

  if (first === 'package') {
    if (!second) {
      throw new Error('package 需要提供 <plugin-path>');
    }

    const packageArgs = [third, ...rest].filter(Boolean);
    const options = {
      command: 'package',
      pluginPath: path.resolve(second),
      outputDir: null,
      runtimeBinaryFile: null,
      targetTriple: null,
      signingKeyPemFile: null,
      signingKeyId: null,
      issuedAt: null,
    };

    for (let index = 0; index < packageArgs.length; index += 1) {
      const arg = packageArgs[index];
      const next = packageArgs[index + 1];
      if (arg === '--out') {
        if (!next) {
          throw new Error('--out 需要值');
        }
        options.outputDir = path.resolve(next);
        index += 1;
        continue;
      }
      if (arg === '--runtime-binary') {
        if (!next) {
          throw new Error('--runtime-binary 需要值');
        }
        options.runtimeBinaryFile = path.resolve(next);
        index += 1;
        continue;
      }
      if (arg === '--target') {
        if (!next) {
          throw new Error('--target 需要值');
        }
        options.targetTriple = next;
        index += 1;
        continue;
      }
      if (arg === '--signing-key-pem-file') {
        if (!next) {
          throw new Error('--signing-key-pem-file 需要值');
        }
        options.signingKeyPemFile = path.resolve(next);
        index += 1;
        continue;
      }
      if (arg === '--signing-key-id') {
        if (!next) {
          throw new Error('--signing-key-id 需要值');
        }
        options.signingKeyId = next;
        index += 1;
        continue;
      }
      if (arg === '--issued-at') {
        if (!next) {
          throw new Error('--issued-at 需要值');
        }
        options.issuedAt = next;
        index += 1;
        continue;
      }
      throw new Error(`未知参数：${arg}`);
    }

    if (!options.outputDir) {
      throw new Error('package 需要提供 --out <output-dir>');
    }
    if (!options.runtimeBinaryFile) {
      throw new Error('package 需要 --runtime-binary 指向已编译 provider 可执行文件');
    }
    if (!options.targetTriple) {
      throw new Error('package 需要 --target 指定 rust target triple');
    }
    if (options.signingKeyPemFile && !options.signingKeyId) {
      throw new Error('package 使用签名时需要提供 --signing-key-id');
    }
    if (options.signingKeyId && !options.signingKeyPemFile) {
      throw new Error('package 使用签名时需要提供 --signing-key-pem-file');
    }

    return options;
  }

  throw new Error(`未知命令：${argv.join(' ')}`);
}

async function waitForTermination(handle) {
  await new Promise((resolve) => {
    const shutdown = async () => {
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
      await handle.close();
      resolve();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}

async function main(argv) {
  const parsed = parseCliArgs(argv);

  if (parsed.command === 'help') {
    usage();
    return null;
  }

  if (parsed.command === 'init') {
    const result = createPluginScaffold(parsed.pluginPath);
    log(`Plugin scaffold created at ${result.pluginPath}`);
    return result;
  }

  if (parsed.command === 'demo-init') {
    const result = createPluginDemoScaffold(parsed.pluginPath);
    log(`Demo scaffold created at ${path.join(result.pluginPath, 'demo')}`);
    return result;
  }

  if (parsed.command === 'demo-dev') {
    const handle = await startDemoServer(parsed);
    await waitForTermination(handle);
    return handle;
  }

  if (parsed.command === 'package') {
    const result = createPluginPackage(parsed.pluginPath, parsed.outputDir, parsed);
    log(`Plugin package created at ${result.packageFile}`);
    return result;
  }

  throw new Error(`未知命令：${parsed.command}`);
}

module.exports = {
  DEFAULT_DEMO_HOST,
  DEFAULT_DEMO_PORT,
  DEFAULT_RUNNER_URL,
  createPluginScaffold,
  createPluginPackage,
  createPluginDemoScaffold,
  main,
  parseCliArgs,
  sanitizeCode,
  startDemoServer,
};
