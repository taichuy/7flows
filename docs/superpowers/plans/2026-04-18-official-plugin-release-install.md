# Official Plugin Release Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把官方 provider 插件从“本地参考源码”推进到“可打包、可通过 GitHub Release 发布、可在设置页从官方仓库一键安装到当前 workspace”的第一版线上闭环。

**Architecture:** 主仓库继续作为 `plugin CLI` 和宿主安装逻辑的 source of truth。`../1flowse-official-plugins` 只承载 provider 源码、官方索引和 GitHub Actions；它通过调用主仓库的 `plugin package` 产出 `.1flowsepkg` 并发布到 GitHub Release。宿主后端新增官方 catalog 读取与 release asset 下载校验能力，前端设置页新增“安装模型供应商”区域，把 “install -> enable -> assign” 收敛成一个“安装到当前 workspace”产品动作。

**Tech Stack:** Node.js CLI (`scripts/node/plugin.js`), sibling repo `../1flowse-official-plugins`, GitHub Actions, Rust (`control-plane`, `api-server`), `reqwest`, `sha2`, `flate2`, `tar`, React 19, TanStack Query, Ant Design 5, existing `@1flowse/api-client`

**Source Spec:** `docs/superpowers/specs/1flowse/2026-04-18-official-plugin-release-install-design.md`, `docs/superpowers/specs/1flowse/2026-04-18-model-provider-integration-design.md`

**Execution Note:** 按用户当前偏好，计划执行时直接在当前仓库推进，不使用 `git worktree`。涉及 sibling repo `../1flowse-official-plugins` 的提交单独在该仓库内完成，但整体执行仍在当前会话里串行推进。

**Out Of Scope:** 自定义 GitHub 仓库输入、版本下拉选择、真实签名服务、完整 marketplace 搜索/推荐/升级治理、任意第三方 release asset 安装

---

## File Structure

### Main Repo: packaging and release artifact contract

- Modify: `scripts/node/plugin/core.js`
  - 新增 `package` 命令、产物 staging、`sha256` 计算、`.1flowsepkg` 输出与 metadata 返回。
- Modify: `scripts/node/plugin/_tests/core.test.js`
  - 锁住 `package` 命令会过滤 `demo/` 与开发态 `scripts/`，并生成稳定命名的单文件产物。

### Official Plugin Repo: release automation and official registry

- Create: `../1flowse-official-plugins/official-registry.json`
  - 官方 provider 插件稳定索引，作为宿主安装页与宿主后端的产品契约。
- Create: `../1flowse-official-plugins/scripts/update-official-registry.mjs`
  - 根据发布结果更新 `official-registry.json` 的 latest 条目。
- Create: `../1flowse-official-plugins/scripts/_tests/update-official-registry.test.mjs`
  - 锁住 registry upsert 行为、tag/version 匹配和 checksum 写入规则。
- Create: `../1flowse-official-plugins/.github/workflows/provider-ci.yml`
  - PR / push 校验 provider 包结构、`plugin package` dry-run 和 registry 结构。
- Create: `../1flowse-official-plugins/.github/workflows/provider-release.yml`
  - 按插件级 tag 打包 `.1flowsepkg`、上传 GitHub Release asset 并回写 registry。

### Backend: official catalog and install orchestration

- Modify: `api/Cargo.toml`
  - 新增 `reqwest`、`sha2`、`flate2`、`tar` workspace 依赖。
- Modify: `api/apps/api-server/Cargo.toml`
  - 引入上述依赖到 `api-server`。
- Create: `api/apps/api-server/src/official_plugin_registry.rs`
  - 读取官方 registry、下载 release asset、校验 `sha256`、解包到临时目录。
- Modify: `api/apps/api-server/src/config.rs`
  - 新增官方仓库与官方 registry 来源配置。
- Modify: `api/apps/api-server/.env.example`
- Modify: `api/apps/api-server/.env.production.example`
- Modify: `api/apps/api-server/src/app_state.rs`
- Modify: `api/apps/api-server/src/lib.rs`
  - 注入官方 plugin registry adapter。
- Modify: `api/crates/control-plane/src/ports.rs`
  - 新增官方 catalog / 下载端口定义。
- Modify: `api/crates/control-plane/src/plugin_management.rs`
  - 新增 `official-catalog` 查询和 `install-official` 编排，保留 install/enable/assign 幂等语义。
- Modify: `api/apps/api-server/src/routes/plugins.rs`
  - 暴露 `/plugins/official-catalog` 和 `/plugins/install-official`。
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/_tests/config_tests.rs`
- Modify: `api/apps/api-server/src/_tests/support.rs`
- Modify: `api/apps/api-server/src/_tests/plugin_routes.rs`
- Modify: `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`

### Frontend: settings install panel and task polling

- Modify: `web/packages/api-client/src/console-plugins.ts`
  - 新增 official catalog 和 official install 的 TS contract。
- Modify: `web/packages/api-client/src/index.ts`
- Create: `web/app/src/features/settings/api/plugins.ts`
  - 设置页官方安装区的 query / mutation facade。
- Create: `web/app/src/features/settings/components/model-providers/OfficialPluginInstallPanel.tsx`
  - 渲染官方 provider 卡片、latest 版本和安装状态。
- Modify: `web/app/src/features/settings/components/model-providers/model-provider-panel.css`
  - 扩展“安装模型供应商”区域的布局和状态样式。
- Modify: `web/app/src/features/settings/pages/SettingsPage.tsx`
  - 串联 official catalog、install task polling、上半区 installation 刷新。
- Modify: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`
- Modify: `web/app/src/features/settings/_tests/settings-page.test.tsx`
- Modify: `web/app/src/style-boundary/registry.tsx`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`

## Task 1: Add `.1flowsepkg` Packaging To The Main Repo CLI

**Files:**
- Modify: `scripts/node/plugin/core.js`
- Modify: `scripts/node/plugin/_tests/core.test.js`

- [x] **Step 1: Write the failing CLI packaging tests**

Append focused tests to `scripts/node/plugin/_tests/core.test.js`:

```js
const { spawnSync } = require('node:child_process');

test('plugin package creates a single .1flowsepkg asset with checksum metadata', async () => {
  const pluginPath = makeTempPluginPath();
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowse-plugin-dist-'));

  await main(['init', pluginPath]);

  const result = await main(['package', pluginPath, '--out', outputDir]);

  assert.match(result.packageFile, /\.1flowsepkg$/);
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
```

- [x] **Step 2: Run the targeted Node tests to confirm the command does not exist yet**

Run:

```bash
node --test --test-name-pattern "plugin package" scripts/node/plugin/_tests/core.test.js
```

Expected: FAIL with `未知命令：package ...` or an assertion showing `result.packageFile` is missing.

- [x] **Step 3: Implement `package` parsing, staging, checksum, and output metadata**

Update `scripts/node/plugin/core.js` with a dedicated packaging path. Keep the existing scaffold and demo behavior unchanged.

Key additions:

```js
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function createPackageArtifactRoot(pluginPath) {
  const packageRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `1flowse-plugin-package-${sanitizeCode(getPluginName(pluginPath))}-`)
  );

  for (const entry of fs.readdirSync(pluginPath)) {
    if (entry === 'demo' || entry === 'scripts') {
      continue;
    }
    copyTree(path.join(pluginPath, entry), path.join(packageRoot, entry));
  }

  return packageRoot;
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function createPluginPackage(pluginPath, outputDir) {
  ensurePluginScaffoldExists(pluginPath);
  const stagedRoot = createPackageArtifactRoot(pluginPath);
  const pluginCode = readPluginCode(pluginPath);
  const packageFile = path.join(outputDir, `1flowse@${pluginCode}@0.1.0@pending.1flowsepkg`);
  spawnSync('tar', ['-czf', packageFile, '-C', stagedRoot, '.'], { stdio: 'inherit' });
  const checksum = hashFile(packageFile);
  const finalFile = path.join(outputDir, `1flowse@${pluginCode}@0.1.0@${checksum}.1flowsepkg`);
  fs.renameSync(packageFile, finalFile);
  removeDirIfExists(stagedRoot);
  return { pluginPath, packageFile: finalFile, checksum };
}
```

Also extend `usage()`, `parseCliArgs()`, and `main()` with:

```js
if (first === 'package') {
  // parse ../1flowse-official-plugins/models/openai_compatible --out tmp/provider-packages
}
```

- [x] **Step 4: Run the targeted package tests again**

Run:

```bash
node --test --test-name-pattern "plugin package" scripts/node/plugin/_tests/core.test.js
```

Expected: PASS. The returned asset path ends with `.1flowsepkg`, the checksum is a 64-char SHA-256 hex digest, and the packaged artifact omits `demo/` and `scripts/`.

- [x] **Step 5: Commit the main-repo packaging changes**

Run:

```bash
git add scripts/node/plugin/core.js scripts/node/plugin/_tests/core.test.js
git commit -m "feat: add provider plugin package command"
```

## Task 2: Automate Official Registry And GitHub Release Publishing In The Official Plugin Repo

**Files:**
- Create: `../1flowse-official-plugins/official-registry.json`
- Create: `../1flowse-official-plugins/scripts/update-official-registry.mjs`
- Create: `../1flowse-official-plugins/scripts/_tests/update-official-registry.test.mjs`
- Create: `../1flowse-official-plugins/.github/workflows/provider-ci.yml`
- Create: `../1flowse-official-plugins/.github/workflows/provider-release.yml`

- [ ] **Step 1: Write the failing registry updater test in the official plugin repo**

Create `../1flowse-official-plugins/scripts/_tests/update-official-registry.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { upsertRegistryEntry } from '../update-official-registry.mjs';

test('upsertRegistryEntry writes latest release metadata for openai_compatible', () => {
  const registry = { version: 1, generated_at: null, plugins: [] };

  const next = upsertRegistryEntry(registry, {
    plugin_id: '1flowse.openai_compatible',
    provider_code: 'openai_compatible',
    display_name: 'OpenAI Compatible',
    protocol: 'openai_compatible',
    latest_version: '0.1.0',
    release_tag: 'openai_compatible-v0.1.0',
    download_url: 'https://github.com/taichuy/1flowse-official-plugins/releases/download/openai_compatible-v0.1.0/pkg.1flowsepkg',
    checksum: 'sha256:abc123',
    signature_status: 'unsigned',
    help_url: 'https://github.com/taichuy/1flowse-official-plugins/tree/main/models/openai_compatible',
    model_discovery_mode: 'hybrid'
  });

  assert.equal(next.plugins.length, 1);
  assert.equal(next.plugins[0].release_tag, 'openai_compatible-v0.1.0');
});
```

- [ ] **Step 2: Run the official-registry test to verify the helper is missing**

Run:

```bash
node --test ../1flowse-official-plugins/scripts/_tests/update-official-registry.test.mjs
```

Expected: FAIL with `Cannot find module '../update-official-registry.mjs'`.

- [ ] **Step 3: Implement the registry script and GitHub workflows**

Create `../1flowse-official-plugins/official-registry.json`:

```json
{
  "version": 1,
  "generated_at": null,
  "plugins": []
}
```

Create `../1flowse-official-plugins/scripts/update-official-registry.mjs`:

```js
import fs from 'node:fs';

export function upsertRegistryEntry(registry, entry) {
  const plugins = registry.plugins.filter((item) => item.plugin_id !== entry.plugin_id);
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    plugins: [...plugins, entry].sort((left, right) => left.plugin_id.localeCompare(right.plugin_id))
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const filePath = process.argv[2];
  const entry = JSON.parse(process.argv[3]);
  const registry = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  fs.writeFileSync(filePath, JSON.stringify(upsertRegistryEntry(registry, entry), null, 2));
}
```

Create `../1flowse-official-plugins/.github/workflows/provider-ci.yml` with a dry-run packaging job:

```yaml
name: provider-ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  package-dry-run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: taichuy/1flowse
          path: host
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node host/scripts/node/plugin.js package models/openai_compatible --out dist
      - run: node --test scripts/_tests/update-official-registry.test.mjs
```

Create `../1flowse-official-plugins/.github/workflows/provider-release.yml` with tag-triggered release publishing:

```yaml
name: provider-release
on:
  push:
    tags:
      - "openai_compatible-v*"
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          repository: taichuy/1flowse
          path: host
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node host/scripts/node/plugin.js package models/openai_compatible --out dist
      - run: node scripts/update-official-registry.mjs official-registry.json "${REGISTRY_ENTRY_JSON}"
      - uses: softprops/action-gh-release@v2
        with:
          files: dist/*.1flowsepkg
```

- [ ] **Step 4: Run the official repo test and whitespace check**

Run:

```bash
node --test ../1flowse-official-plugins/scripts/_tests/update-official-registry.test.mjs
git -C ../1flowse-official-plugins diff --check
```

Expected: PASS. The registry helper is importable and `git diff --check` returns no whitespace errors.

- [ ] **Step 5: Commit the official repo automation changes**

Run:

```bash
git -C ../1flowse-official-plugins add official-registry.json scripts/update-official-registry.mjs scripts/_tests/update-official-registry.test.mjs .github/workflows/provider-ci.yml .github/workflows/provider-release.yml
git -C ../1flowse-official-plugins commit -m "feat: automate official plugin releases"
```

## Task 3: Add Official Catalog And `install-official` To The Backend

**Files:**
- Modify: `api/Cargo.toml`
- Modify: `api/apps/api-server/Cargo.toml`
- Create: `api/apps/api-server/src/official_plugin_registry.rs`
- Modify: `api/apps/api-server/src/config.rs`
- Modify: `api/apps/api-server/.env.example`
- Modify: `api/apps/api-server/.env.production.example`
- Modify: `api/apps/api-server/src/app_state.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/control-plane/src/plugin_management.rs`
- Modify: `api/apps/api-server/src/routes/plugins.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/_tests/config_tests.rs`
- Modify: `api/apps/api-server/src/_tests/support.rs`
- Modify: `api/apps/api-server/src/_tests/plugin_routes.rs`
- Modify: `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`

- [ ] **Step 1: Write the failing service, route, and config tests**

Append a focused service test to `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`:

```rust
#[tokio::test]
async fn plugin_management_service_lists_official_catalog_and_installs_latest_release_asset() {
    let service = build_service_with_official_source();

    let catalog = service.list_official_catalog(actor_user_id).await.unwrap();
    assert_eq!(catalog.len(), 1);

    let install = service
        .install_official_plugin(InstallOfficialPluginCommand {
            actor_user_id,
            plugin_id: "1flowse.openai_compatible".to_string(),
        })
        .await
        .unwrap();

    assert_eq!(install.installation.provider_code, "openai_compatible");
    assert_eq!(install.task.status, PluginTaskStatus::Success);
}
```

Append a focused route test to `api/apps/api-server/src/_tests/plugin_routes.rs`:

```rust
#[tokio::test]
async fn plugin_routes_list_official_catalog_and_install_official_package() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let catalog = app.clone().oneshot(
        Request::builder()
            .method("GET")
            .uri("/api/console/plugins/official-catalog")
            .header("cookie", &cookie)
            .body(Body::empty())
            .unwrap(),
    ).await.unwrap();

    assert_eq!(catalog.status(), StatusCode::OK);

    let install = app.clone().oneshot(
        Request::builder()
            .method("POST")
            .uri("/api/console/plugins/install-official")
            .header("cookie", &cookie)
            .header("x-csrf-token", &csrf)
            .header("content-type", "application/json")
            .body(Body::from(json!({ "plugin_id": "1flowse.openai_compatible" }).to_string()))
            .unwrap(),
    ).await.unwrap();

    assert_eq!(install.status(), StatusCode::CREATED);
}
```

Append a config test to `api/apps/api-server/src/_tests/config_tests.rs`:

```rust
#[test]
fn api_config_reads_official_plugin_repository_settings() {
    let config = ApiConfig::from_env_map(&[
        ("API_DATABASE_URL", "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows"),
        ("API_REDIS_URL", "redis://:sevenflows@127.0.0.1:36379"),
        ("API_OFFICIAL_PLUGIN_REPOSITORY", "taichuy/1flowse-official-plugins"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1Flowse"),
    ]).unwrap();

    assert_eq!(config.official_plugin_repository, "taichuy/1flowse-official-plugins");
}
```

- [ ] **Step 2: Run the targeted Rust tests to verify the API is missing**

Run:

```bash
cd api && cargo test -p control-plane plugin_management_service_lists_official_catalog_and_installs_latest_release_asset -- --exact
cd api && cargo test -p api-server plugin_routes_list_official_catalog_and_install_official_package -- --exact
cd api && cargo test -p api-server api_config_reads_official_plugin_repository_settings -- --exact
```

Expected: FAIL with missing `InstallOfficialPluginCommand`, missing route handlers, and missing config fields.

- [ ] **Step 3: Implement official catalog ports, adapter, download/sha verification, and official install orchestration**

Update `api/crates/control-plane/src/ports.rs` to add a dedicated official source port:

```rust
#[derive(Debug, Clone)]
pub struct OfficialPluginCatalogEntry {
    pub plugin_id: String,
    pub provider_code: String,
    pub display_name: String,
    pub protocol: String,
    pub latest_version: String,
    pub release_tag: String,
    pub download_url: String,
    pub checksum: String,
    pub signature_status: String,
    pub help_url: Option<String>,
    pub model_discovery_mode: String,
}

#[derive(Debug, Clone)]
pub struct DownloadedOfficialPluginPackage {
    pub package_root: PathBuf,
    pub checksum: String,
    pub signature_status: String,
}

#[async_trait]
pub trait OfficialPluginSourcePort: Send + Sync {
    async fn list_official_catalog(&self) -> anyhow::Result<Vec<OfficialPluginCatalogEntry>>;
    async fn download_plugin(
        &self,
        entry: &OfficialPluginCatalogEntry,
    ) -> anyhow::Result<DownloadedOfficialPluginPackage>;
}
```

Update `api/crates/control-plane/src/plugin_management.rs`:

```rust
pub struct InstallOfficialPluginCommand {
    pub actor_user_id: Uuid,
    pub plugin_id: String,
}

pub async fn install_official_plugin(
    &self,
    command: InstallOfficialPluginCommand,
) -> Result<InstallPluginResult> {
    let catalog = self.official_source.list_official_catalog().await?;
    let entry = catalog
        .into_iter()
        .find(|item| item.plugin_id == command.plugin_id)
        .ok_or(ControlPlaneError::NotFound("official_plugin"))?;
    let downloaded = self.official_source.download_plugin(&entry).await?;
    let install = self.install_plugin(InstallPluginCommand {
        actor_user_id: command.actor_user_id,
        package_root: downloaded.package_root.display().to_string(),
    }).await?;
    self.enable_plugin(EnablePluginCommand { actor_user_id: command.actor_user_id, installation_id: install.installation.id }).await?;
    let final_task = self.assign_plugin(AssignPluginCommand { actor_user_id: command.actor_user_id, installation_id: install.installation.id }).await?;
    let installation = self
        .repository
        .get_installation(install.installation.id)
        .await?
        .expect("installation should exist after official install");
    Ok(InstallPluginResult { installation, task: final_task })
}
```

Create `api/apps/api-server/src/official_plugin_registry.rs`:

```rust
pub struct ApiOfficialPluginRegistry {
    registry_url: String,
    client: reqwest::Client,
}

impl ApiOfficialPluginRegistry {
    pub async fn download_and_extract(&self, entry: &OfficialPluginCatalogEntry) -> anyhow::Result<DownloadedOfficialPluginPackage> {
        let bytes = self.client.get(&entry.download_url).send().await?.bytes().await?;
        verify_sha256(&bytes, &entry.checksum)?;
        let extract_root = tempdir()?;
        let archive = flate2::read::GzDecoder::new(std::io::Cursor::new(bytes));
        tar::Archive::new(archive).unpack(extract_root.path())?;
        Ok(DownloadedOfficialPluginPackage {
            package_root: extract_root.into_path(),
            checksum: entry.checksum.clone(),
            signature_status: entry.signature_status.clone(),
        })
    }
}
```

Update `api/apps/api-server/src/routes/plugins.rs` with:

```rust
.route("/plugins/official-catalog", get(list_official_catalog))
.route("/plugins/install-official", post(install_official_plugin))
```

Also wire new env vars into `config.rs`, `.env.example`, `.env.production.example`, `app_state.rs`, and `lib.rs`, and add the adapter to test support.

- [ ] **Step 4: Run the targeted backend tests plus the existing plugin route suite**

Run:

```bash
cd api && cargo test -p control-plane plugin_management_service_lists_official_catalog_and_installs_latest_release_asset -- --exact
cd api && cargo test -p api-server plugin_routes_list_official_catalog_and_install_official_package -- --exact
cd api && cargo test -p api-server api_config_reads_official_plugin_repository_settings -- --exact
cd api && cargo test -p api-server plugin_routes_install_enable_assign_and_query_tasks -- --exact
```

Expected: PASS. The new official endpoints exist, `sha256` verification is enforced, and the old manual install route still passes.

- [ ] **Step 5: Commit the backend official-install changes**

Run:

```bash
git add api/Cargo.toml api/apps/api-server/Cargo.toml api/apps/api-server/src/official_plugin_registry.rs api/apps/api-server/src/config.rs api/apps/api-server/.env.example api/apps/api-server/.env.production.example api/apps/api-server/src/app_state.rs api/apps/api-server/src/lib.rs api/apps/api-server/src/routes/plugins.rs api/apps/api-server/src/openapi.rs api/apps/api-server/src/_tests/config_tests.rs api/apps/api-server/src/_tests/support.rs api/apps/api-server/src/_tests/plugin_routes.rs api/crates/control-plane/src/ports.rs api/crates/control-plane/src/plugin_management.rs api/crates/control-plane/src/_tests/plugin_management_service_tests.rs
git commit -m "feat: install official plugins from release assets"
```

## Task 4: Extend Settings With An Official Install Panel And Task Polling

**Files:**
- Modify: `web/packages/api-client/src/console-plugins.ts`
- Modify: `web/packages/api-client/src/index.ts`
- Create: `web/app/src/features/settings/api/plugins.ts`
- Create: `web/app/src/features/settings/components/model-providers/OfficialPluginInstallPanel.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/model-provider-panel.css`
- Modify: `web/app/src/features/settings/pages/SettingsPage.tsx`
- Modify: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`
- Modify: `web/app/src/features/settings/_tests/settings-page.test.tsx`
- Modify: `web/app/src/style-boundary/registry.tsx`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`

- [ ] **Step 1: Write the failing settings page tests for the official install area**

Append focused tests to `web/app/src/features/settings/_tests/model-providers-page.test.tsx`:

```tsx
test('renders official install cards beneath the installed provider area', async () => {
  pluginsApi.fetchSettingsOfficialPluginCatalog.mockResolvedValue([
    {
      plugin_id: '1flowse.openai_compatible',
      provider_code: 'openai_compatible',
      display_name: 'OpenAI Compatible',
      latest_version: '0.1.0',
      protocol: 'openai_compatible',
      help_url: 'https://github.com/taichuy/1flowse-official-plugins/tree/main/models/openai_compatible',
      install_status: 'not_installed'
    }
  ]);

  renderApp('/settings/model-providers');

  expect(await screen.findByRole('heading', { name: '安装模型供应商' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '安装到当前 workspace' })).toBeInTheDocument();
});

test('polls install task until the official plugin finishes installing', async () => {
  pluginsApi.installSettingsOfficialPlugin.mockResolvedValue({
    task: { id: 'task-1', status: 'running', finished_at: null }
  });
  pluginsApi.fetchSettingsPluginTask
    .mockResolvedValueOnce({ id: 'task-1', status: 'running', finished_at: null })
    .mockResolvedValueOnce({ id: 'task-1', status: 'success', finished_at: '2026-04-18T21:00:00Z' });

  renderApp('/settings/model-providers');
  await user.click(await screen.findByRole('button', { name: '安装到当前 workspace' }));

  expect(await screen.findByText('安装中')).toBeInTheDocument();
  expect(await screen.findByText('已安装到当前 workspace')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the targeted Vitest file to confirm the new hooks and panel do not exist yet**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected: FAIL with missing `pluginsApi` mocks, missing `OfficialPluginInstallPanel`, or missing “安装模型供应商” content.

- [ ] **Step 3: Implement official catalog client methods, the install panel, and task polling**

Update `web/packages/api-client/src/console-plugins.ts`:

```ts
export interface ConsoleOfficialPluginCatalogEntry {
  plugin_id: string;
  provider_code: string;
  display_name: string;
  protocol: string;
  latest_version: string;
  help_url: string | null;
  install_status: 'not_installed' | 'installed' | 'assigned' | 'installing' | 'failed';
}

export function listConsoleOfficialPluginCatalog(baseUrl?: string) {
  return apiFetch<ConsoleOfficialPluginCatalogEntry[]>({
    path: '/api/console/plugins/official-catalog',
    baseUrl
  });
}

export function installConsoleOfficialPlugin(input: { plugin_id: string }, csrfToken: string, baseUrl?: string) {
  return apiFetch<InstallConsolePluginResult>({
    path: '/api/console/plugins/install-official',
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}
```

Create `web/app/src/features/settings/api/plugins.ts`:

```ts
import {
  getConsolePluginTask,
  installConsoleOfficialPlugin,
  listConsoleOfficialPluginCatalog
} from '@1flowse/api-client';

export const settingsOfficialPluginsQueryKey = ['settings', 'plugins', 'official-catalog'] as const;

export function fetchSettingsOfficialPluginCatalog() {
  return listConsoleOfficialPluginCatalog();
}

export function installSettingsOfficialPlugin(plugin_id: string, csrfToken: string) {
  return installConsoleOfficialPlugin({ plugin_id }, csrfToken);
}

export function fetchSettingsPluginTask(taskId: string) {
  return getConsolePluginTask(taskId);
}
```

Create `OfficialPluginInstallPanel.tsx`:

```tsx
export function OfficialPluginInstallPanel({ entries, installingPluginId, onInstall }: Props) {
  return (
    <section className="model-provider-panel__official">
      <div className="model-provider-panel__section-head">
        <div>
          <Typography.Title level={5}>安装模型供应商</Typography.Title>
          <Typography.Text type="secondary">
            从官方仓库安装 latest 版本的 provider 插件。
          </Typography.Text>
        </div>
      </div>
      <div className="model-provider-panel__official-grid">
        {entries.map((entry) => (
          <article key={entry.plugin_id} className="model-provider-panel__official-card">
            <Typography.Title level={5}>{entry.display_name}</Typography.Title>
            <Typography.Text type="secondary">
              {entry.protocol} · latest {entry.latest_version}
            </Typography.Text>
            <Button
              type="default"
              loading={installingPluginId === entry.plugin_id}
              onClick={() => onInstall(entry)}
            >
              安装到当前 workspace
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
```

Update `SettingsPage.tsx` to add:

```tsx
const officialCatalogQuery = useQuery({
  queryKey: settingsOfficialPluginsQueryKey,
  queryFn: fetchSettingsOfficialPluginCatalog
});

const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

const pluginTaskQuery = useQuery({
  queryKey: ['settings', 'plugins', 'task', activeTaskId],
  queryFn: () => fetchSettingsPluginTask(activeTaskId!),
  enabled: Boolean(activeTaskId),
  refetchInterval: (query) => query.state.data?.finished_at ? false : 1000
});
```

Also update `model-provider-panel.css` and `style-boundary` fixtures to account for the new lower install section and card grid.

- [ ] **Step 4: Run the focused UI tests and the existing settings style boundary check**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
pnpm --dir web/app test -- src/features/settings/_tests/settings-page.test.tsx
node scripts/node/check-style-boundary.js page page.settings
```

Expected: PASS. The settings page renders both the installed-provider area and the official install area, install task polling reaches terminal state, and the settings page visual contract still passes.

- [ ] **Step 5: Commit the settings install panel changes**

Run:

```bash
git add web/packages/api-client/src/console-plugins.ts web/packages/api-client/src/index.ts web/app/src/features/settings/api/plugins.ts web/app/src/features/settings/components/model-providers/OfficialPluginInstallPanel.tsx web/app/src/features/settings/components/model-providers/model-provider-panel.css web/app/src/features/settings/pages/SettingsPage.tsx web/app/src/features/settings/_tests/model-providers-page.test.tsx web/app/src/features/settings/_tests/settings-page.test.tsx web/app/src/style-boundary/registry.tsx web/app/src/style-boundary/scenario-manifest.json
git commit -m "feat: add official provider install panel"
```

## Task 5: Publish The Official Plugin And Smoke-Test The Live GitHub Install Path

**Files:**
- No committed source-file changes expected in this task.
- Local runtime configuration may need temporary edits in `api/apps/api-server/.env` if the official repository source differs from the default.

- [ ] **Step 1: Push the committed main repo and official plugin repo changes**

Run:

```bash
git push origin HEAD
git -C ../1flowse-official-plugins push origin HEAD
```

Expected: Both repositories push successfully without rejected commits.

- [ ] **Step 2: Create and push the official plugin release tag**

Run:

```bash
git -C ../1flowse-official-plugins tag openai_compatible-v0.1.0
git -C ../1flowse-official-plugins push origin openai_compatible-v0.1.0
```

Expected: GitHub Actions `provider-release` starts for the new tag.

- [ ] **Step 3: Wait for the release workflow and confirm the release asset exists**

Run:

```bash
gh release view openai_compatible-v0.1.0 --repo taichuy/1flowse-official-plugins
gh release download openai_compatible-v0.1.0 --repo taichuy/1flowse-official-plugins --pattern "*.1flowsepkg" --dir /tmp/official-plugin-smoke
```

Expected: `gh release view` shows the release and `gh release download` writes a `.1flowsepkg` file into `/tmp/official-plugin-smoke`.

- [ ] **Step 4: Smoke-test the live install path against the running host**

Run:

```bash
node scripts/node/dev-up.js ensure --backend-only
ROOT_ACCOUNT=$(node -e "const {loadRootCredentials}=require('./scripts/node/page-debug/auth.js'); process.stdout.write(loadRootCredentials({repoRoot:process.cwd()}).account);")
ROOT_PASSWORD=$(node -e "const {loadRootCredentials}=require('./scripts/node/page-debug/auth.js'); process.stdout.write(loadRootCredentials({repoRoot:process.cwd()}).password);")
AUTH_HEADERS=$(mktemp)
AUTH_BODY=$(mktemp)
curl -s -D "$AUTH_HEADERS" -o "$AUTH_BODY" \
  -H 'content-type: application/json' \
  --data "{\"identifier\":\"${ROOT_ACCOUNT}\",\"password\":\"${ROOT_PASSWORD}\"}" \
  http://127.0.0.1:7800/api/public/auth/providers/password-local/sign-in
SESSION_COOKIE=$(grep -i '^set-cookie:' "$AUTH_HEADERS" | head -n1 | cut -d' ' -f2- | cut -d';' -f1 | tr -d '\r')
CSRF_TOKEN=$(node -e "const fs=require('node:fs'); const body=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(body.data.csrf_token);" "$AUTH_BODY")
curl -s http://127.0.0.1:7800/api/console/plugins/official-catalog \
  -H "cookie: $SESSION_COOKIE"
curl -s -X POST http://127.0.0.1:7800/api/console/plugins/install-official \
  -H "content-type: application/json" \
  -H "cookie: $SESSION_COOKIE" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  --data '{"plugin_id":"1flowse.openai_compatible"}'
```

Expected: `official-catalog` returns an entry whose `plugin_id` is `1flowse.openai_compatible`, and `install-official` returns a created installation/task payload whose installation is visible on `/settings/model-providers`.

- [ ] **Step 5: Capture final verification state**

Run:

```bash
git status --short
git -C ../1flowse-official-plugins status --short
```

Expected: No unexpected uncommitted changes remain except intentional local `.env` edits used for the smoke test.
