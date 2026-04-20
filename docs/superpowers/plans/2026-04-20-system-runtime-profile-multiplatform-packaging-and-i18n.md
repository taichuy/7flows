# System Runtime Profile, Multiplatform Provider Packaging, And I18n Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver six-target provider packaging, dedicated runtime-profile diagnostics, account-level locale closure, and plugin/model-provider i18n contracts without moving frontend translation logic into the backend.

**Architecture:** Add a shared `runtime-profile` crate that owns locale resolution, host fingerprinting, and lightweight machine snapshots; keep provider distribution thin by selecting exactly one target artifact per host; refactor plugin and model-provider listing APIs around `plugin_type`, `namespace`, `key`, and trimmed bundles instead of server-resolved display strings. `api-server` stays the public aggregation entrypoint, `plugin-runner` only exposes an internal system snapshot route, and `../1flowbase-official-plugins` remains the release and registry source of truth.

**Tech Stack:** Rust (`plugin-framework`, `runtime-profile`, `plugin-runner`, `api-server`, `control-plane`, `storage-pg`, `access-control`), Node.js (`scripts/node/plugin.js`), GitHub Actions, PostgreSQL migrations, targeted `cargo test`, `node --test`, `node scripts/node/verify-backend.js`

---

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-20-system-runtime-profile-and-multiplatform-provider-packaging-design.md`, `.memory/project-memory/2026-04-20-system-runtime-profile-multiplatform-i18n-design-approved.md`

**Execution Note:** This rollout spans two git repos. Host runtime, API, storage, and packaging CLI changes land in `1flowbase`; official release workflow and registry-shaping changes land in `../1flowbase-official-plugins`. During execution, update this plan file after every completed task so the user can track progress directly in `docs/superpowers/plans`.

**Out Of Scope:** Frontend page refactors, fat packages as the default distribution format, heavy host monitoring, arbitrary runtime-generated parameter-form i18n normalization, and marketplace search/recommendation features

## File Structure

**Create**
- `api/crates/runtime-profile/Cargo.toml` - new shared crate for host fingerprinting, locale resolution, and runtime snapshot assembly
- `api/crates/runtime-profile/src/lib.rs` - crate exports for locale resolution, fingerprinting, and runtime profile capture
- `api/crates/runtime-profile/src/fingerprint.rs` - stable, non-reversible `host_fingerprint` generation
- `api/crates/runtime-profile/src/locale.rs` - locale normalization and precedence resolution
- `api/crates/runtime-profile/src/profile.rs` - `RuntimeProfile` capture, bytes-to-GB formatting, and lightweight system stats
- `api/crates/runtime-profile/src/_tests/mod.rs` - runtime-profile crate test wiring
- `api/crates/runtime-profile/src/_tests/fingerprint_tests.rs` - host fingerprint determinism coverage
- `api/crates/runtime-profile/src/_tests/locale_tests.rs` - locale precedence and normalization coverage
- `api/crates/runtime-profile/src/_tests/profile_tests.rs` - memory/unit formatting and snapshot shaping coverage
- `api/crates/control-plane/src/i18n.rs` - shared trimmed-bundle helpers and service-level i18n structs
- `api/crates/control-plane/src/system_runtime.rs` - permission and user-locale access service for runtime-profile routes
- `api/crates/control-plane/src/_tests/system_runtime_service_tests.rs` - system runtime permission and locale-loading tests
- `api/crates/storage-pg/migrations/20260420120000_add_user_preferred_locale.sql` - additive migration for `users.preferred_locale`
- `api/apps/api-server/src/runtime_profile_client.rs` - `api-server` adapter for internal `plugin-runner` runtime-profile fetches
- `api/apps/api-server/src/routes/system.rs` - public `/api/console/system/runtime-profile` route
- `api/apps/api-server/src/_tests/system_routes.rs` - route coverage for runtime-profile aggregation and locale meta
- `api/apps/plugin-runner/tests/system_routes.rs` - internal runner route coverage
- `../1flowbase-official-plugins/scripts/build-registry-entry.mjs` - reusable registry-entry builder with `plugin_type` and `i18n_summary`
- `../1flowbase-official-plugins/scripts/_tests/build-registry-entry.test.mjs` - build-registry-entry coverage

**Modify**
- `api/Cargo.toml` - add `runtime-profile` workspace member and shared dependencies such as `sysinfo`
- `api/crates/plugin-framework/src/runtime_target.rs` - add six-target parsing, host-target mapping, artifact suffix, executable suffix
- `api/crates/plugin-framework/src/_tests/runtime_target_tests.rs` - extend target coverage beyond Linux
- `api/crates/plugin-framework/src/lib.rs` - re-export target helpers if required by new callers
- `scripts/node/plugin/core.js` - accept six official targets and write correct executable names per target
- `scripts/node/plugin/_tests/core.test.js` - package CLI coverage for macOS/Windows target metadata
- `api/crates/domain/src/auth.rs` - add `preferred_locale` to `UserRecord`
- `api/crates/domain/src/_tests/auth_domain_tests.rs` - update user fixtures
- `api/crates/control-plane/src/lib.rs` - export new `i18n` and `system_runtime` modules
- `api/crates/control-plane/src/ports.rs` - add `preferred_locale`, official registry i18n metadata, plugin filters, and selected artifact contracts
- `api/crates/control-plane/src/profile.rs` - persist and validate `preferred_locale`
- `api/crates/control-plane/src/plugin_management.rs` - plugin-type filtering and unified i18n catalog responses
- `api/crates/control-plane/src/model_provider.rs` - unified i18n contract for catalog and options routes
- `api/crates/control-plane/src/_tests/profile_service_tests.rs` - `preferred_locale` persistence tests
- `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs` - plugin-type filtering and i18n catalog tests
- `api/crates/control-plane/src/_tests/model_provider_service_tests.rs` - model-provider i18n contract tests
- `api/crates/control-plane/src/_tests/support.rs` - fixture users and official source entries gain locale/i18n fields
- `api/crates/access-control/src/catalog.rs` - add `system_runtime.view.all`
- `api/crates/storage-pg/src/auth_repository.rs` - load and update `preferred_locale`
- `api/crates/storage-pg/src/member_repository.rs` - include `preferred_locale` when hydrating users
- `api/crates/storage-pg/src/mappers/member_mapper.rs` - map `preferred_locale` from storage rows
- `api/apps/plugin-runner/Cargo.toml` - depend on `runtime-profile`
- `api/apps/plugin-runner/src/lib.rs` - expose internal `/system/runtime-profile`
- `api/apps/api-server/Cargo.toml` - depend on `runtime-profile` and runtime-profile client pieces
- `api/apps/api-server/src/app_state.rs` - store runtime-profile client / URL
- `api/apps/api-server/src/config.rs` - add `API_PLUGIN_RUNNER_INTERNAL_URL`
- `api/apps/api-server/src/lib.rs` - register system route and wire new client into `ApiState`
- `api/apps/api-server/src/openapi.rs` - add system route schemas and updated plugin/model-provider schemas
- `api/apps/api-server/src/routes/mod.rs` - export `system`
- `api/apps/api-server/src/routes/me.rs` - expose and patch `preferred_locale`
- `api/apps/api-server/src/routes/plugins.rs` - add `plugin_type` query + i18n contract
- `api/apps/api-server/src/routes/model_providers.rs` - add `locale_meta + i18n_catalog + key` responses
- `api/apps/api-server/src/official_plugin_registry.rs` - parse `plugin_type`, `i18n_summary`, and selected artifact metadata
- `api/apps/api-server/src/_tests/config_tests.rs` - config coverage for internal runner URL
- `api/apps/api-server/src/_tests/me_routes.rs` - locale round-trip route tests
- `api/apps/api-server/src/_tests/plugin_routes.rs` - plugin-type and i18n route tests
- `api/apps/api-server/src/_tests/model_provider_routes.rs` - model-provider i18n route tests
- `api/apps/api-server/src/_tests/official_plugin_registry_tests.rs` - official registry metadata parsing tests
- `api/apps/api-server/src/_tests/openapi_alignment.rs` - updated schema expectations
- `api/apps/api-server/src/_tests/openapi_docs_tests.rs` - updated OpenAPI snapshots
- `api/apps/api-server/src/_tests/support.rs` - in-memory runtime-profile and official-source test doubles
- `../1flowbase-official-plugins/.github/workflows/provider-ci.yml` - keep dry-run/package validation aligned with new registry builder
- `../1flowbase-official-plugins/.github/workflows/provider-release.yml` - split release packaging by OS family and emit six target artifacts
- `../1flowbase-official-plugins/scripts/update-official-registry.mjs` - preserve new registry fields while upserting entries
- `../1flowbase-official-plugins/scripts/_tests/update-official-registry.test.mjs` - registry-upsert coverage for `plugin_type` and `i18n_summary`

**Notes**
- Keep the backend route/service boundary intact: permission decisions and user-profile loading go through `control-plane`; route modules only parse requests, call services/adapters, and map responses.
- Do not add frontend translation logic. Backend only resolves locale metadata, validates stored locale values, trims bundles, and returns `namespace + key + bundles`.
- Keep migration additive. Do not edit historical migration files for `users`.
- Treat `plugin-runner` runtime-profile reachability as best-effort. The public API must degrade to `runner_unreachable` rather than fail the whole request.

### Task 1: Expand Runtime Targets And Host Packager To The Six Official Targets

**Files:**
- Modify: `api/crates/plugin-framework/src/runtime_target.rs`
- Modify: `api/crates/plugin-framework/src/_tests/runtime_target_tests.rs`
- Modify: `api/crates/plugin-framework/src/lib.rs`
- Modify: `scripts/node/plugin/core.js`
- Modify: `scripts/node/plugin/_tests/core.test.js`

- [x] **Step 1: Write the failing target and packaging tests**

Add Rust coverage like this to `api/crates/plugin-framework/src/_tests/runtime_target_tests.rs`:

```rust
#[test]
fn runtime_target_parses_darwin_and_windows_triples() {
    let darwin = RuntimeTarget::from_rust_target_triple("aarch64-apple-darwin").unwrap();
    assert_eq!(darwin.os, "darwin");
    assert_eq!(darwin.arch, "arm64");
    assert_eq!(darwin.libc, None);
    assert_eq!(darwin.asset_suffix(), "darwin-arm64");
    assert_eq!(darwin.executable_suffix(), "");

    let windows = RuntimeTarget::from_rust_target_triple("x86_64-pc-windows-msvc").unwrap();
    assert_eq!(windows.os, "windows");
    assert_eq!(windows.arch, "amd64");
    assert_eq!(windows.libc.as_deref(), Some("msvc"));
    assert_eq!(windows.asset_suffix(), "windows-amd64");
    assert_eq!(windows.executable_suffix(), ".exe");
}

#[test]
fn runtime_target_builds_host_targets_from_os_and_arch_pairs() {
    let linux = RuntimeTarget::from_host_parts("linux", "x86_64").unwrap();
    assert_eq!(linux.rust_target_triple, "x86_64-unknown-linux-musl");

    let windows = RuntimeTarget::from_host_parts("windows", "aarch64").unwrap();
    assert_eq!(windows.rust_target_triple, "aarch64-pc-windows-msvc");
}
```

Add Node coverage like this to `scripts/node/plugin/_tests/core.test.js`:

```javascript
test('plugin package writes a windows executable and asset suffix', async () => {
  const pluginPath = makeTempPluginPath();
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-dist-'));

  await main(['init', pluginPath]);

  const runtimeBinary = path.join(outputDir, 'acme_openai_compatible-provider.exe');
  fs.mkdirSync(path.dirname(runtimeBinary), { recursive: true });
  fs.writeFileSync(runtimeBinary, 'echo demo');

  const result = await main([
    'package',
    pluginPath,
    '--out',
    outputDir,
    '--runtime-binary',
    runtimeBinary,
    '--target',
    'x86_64-pc-windows-msvc',
  ]);

  assert.match(result.packageFile, /@windows-amd64@[a-f0-9]{64}\.1flowbasepkg$/);
  assert.ok(fs.readdirSync(outputDir).some((name) => name.includes('@windows-amd64@')));
});
```

- [x] **Step 2: Run the focused host target tests and confirm RED**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p plugin-framework runtime_target -- --nocapture
rtk node --test scripts/node/_tests/core.test.js --test-name-pattern "windows executable"
```

Expected: FAIL because `RuntimeTarget` only knows Linux triples today and `parseRustTargetTriple()` in `scripts/node/plugin/core.js` still rejects macOS/Windows targets.

- [x] **Step 3: Implement the six-target target model and CLI packaging rules**

Update `api/crates/plugin-framework/src/runtime_target.rs` around a reusable host helper:

```rust
impl RuntimeTarget {
    fn new(raw: &str, os: &str, arch: &str, libc: Option<&str>) -> Self {
        Self {
            rust_target_triple: raw.trim().to_string(),
            os: os.to_string(),
            arch: arch.to_string(),
            libc: libc.map(str::to_string),
        }
    }

    pub fn from_rust_target_triple(raw: &str) -> FrameworkResult<Self> {
        match raw.trim() {
            "x86_64-unknown-linux-musl" => Ok(Self::new(raw, "linux", "amd64", Some("musl"))),
            "aarch64-unknown-linux-musl" => Ok(Self::new(raw, "linux", "arm64", Some("musl"))),
            "x86_64-apple-darwin" => Ok(Self::new(raw, "darwin", "amd64", None)),
            "aarch64-apple-darwin" => Ok(Self::new(raw, "darwin", "arm64", None)),
            "x86_64-pc-windows-msvc" => Ok(Self::new(raw, "windows", "amd64", Some("msvc"))),
            "aarch64-pc-windows-msvc" => Ok(Self::new(raw, "windows", "arm64", Some("msvc"))),
            other => Err(PluginFrameworkError::invalid_provider_contract(format!(
                "unsupported rust target triple: {other}"
            ))),
        }
    }

    pub fn from_host_parts(os: &str, arch: &str) -> FrameworkResult<Self> {
        match (os, arch) {
            ("linux", "x86_64") => Self::from_rust_target_triple("x86_64-unknown-linux-musl"),
            ("linux", "aarch64") => Self::from_rust_target_triple("aarch64-unknown-linux-musl"),
            ("macos", "x86_64") => Self::from_rust_target_triple("x86_64-apple-darwin"),
            ("macos", "aarch64") => Self::from_rust_target_triple("aarch64-apple-darwin"),
            ("windows", "x86_64") => Self::from_rust_target_triple("x86_64-pc-windows-msvc"),
            ("windows", "aarch64") => Self::from_rust_target_triple("aarch64-pc-windows-msvc"),
            (left_os, left_arch) => Err(PluginFrameworkError::invalid_provider_contract(
                format!("unsupported host target: {left_os}/{left_arch}"),
            )),
        }
    }

    pub fn executable_suffix(&self) -> &'static str {
        if self.os == "windows" { ".exe" } else { "" }
    }
}
```

Update `scripts/node/plugin/core.js` to mirror the same truth table:

```javascript
function parseRustTargetTriple(raw) {
  switch (String(raw || '').trim()) {
    case 'x86_64-unknown-linux-musl':
      return { rustTargetTriple: raw, os: 'linux', arch: 'amd64', libc: 'musl', assetSuffix: 'linux-amd64' };
    case 'aarch64-unknown-linux-musl':
      return { rustTargetTriple: raw, os: 'linux', arch: 'arm64', libc: 'musl', assetSuffix: 'linux-arm64' };
    case 'x86_64-apple-darwin':
      return { rustTargetTriple: raw, os: 'darwin', arch: 'amd64', libc: null, assetSuffix: 'darwin-amd64' };
    case 'aarch64-apple-darwin':
      return { rustTargetTriple: raw, os: 'darwin', arch: 'arm64', libc: null, assetSuffix: 'darwin-arm64' };
    case 'x86_64-pc-windows-msvc':
      return { rustTargetTriple: raw, os: 'windows', arch: 'amd64', libc: 'msvc', assetSuffix: 'windows-amd64' };
    case 'aarch64-pc-windows-msvc':
      return { rustTargetTriple: raw, os: 'windows', arch: 'arm64', libc: 'msvc', assetSuffix: 'windows-arm64' };
    default:
      throw new Error(`暂不支持的 rust target: ${raw}`);
  }
}
```

- [x] **Step 4: Run the focused tests again and confirm GREEN**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p plugin-framework runtime_target -- --nocapture
rtk node --test scripts/node/_tests/core.test.js --test-name-pattern "windows executable"
```

Expected: PASS with `RuntimeTarget` recognizing six release targets and the packaging CLI emitting Windows/macOS asset metadata without changing the thin-package contract.

- [x] **Step 5: Commit the host target expansion**

```bash
rtk git add api/crates/plugin-framework/src/runtime_target.rs api/crates/plugin-framework/src/_tests/runtime_target_tests.rs api/crates/plugin-framework/src/lib.rs scripts/node/plugin/core.js scripts/node/plugin/_tests/core.test.js
rtk git commit -m "feat: expand provider packaging targets"
```

### Task 2: Extend Official Release Automation And Registry Metadata In The Sibling Plugin Repo

**Files:**
- Create: `../1flowbase-official-plugins/scripts/build-registry-entry.mjs`
- Create: `../1flowbase-official-plugins/scripts/_tests/build-registry-entry.test.mjs`
- Modify: `../1flowbase-official-plugins/.github/workflows/provider-ci.yml`
- Modify: `../1flowbase-official-plugins/.github/workflows/provider-release.yml`
- Modify: `../1flowbase-official-plugins/scripts/update-official-registry.mjs`
- Modify: `../1flowbase-official-plugins/scripts/_tests/update-official-registry.test.mjs`

- [x] **Step 1: Write the failing registry-shaping tests**

Add a new builder test like this in `../1flowbase-official-plugins/scripts/_tests/build-registry-entry.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildRegistryEntry } from '../build-registry-entry.mjs';

test('buildRegistryEntry emits plugin_type and i18n_summary', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'official-registry-entry-'));
  mkdirSync(path.join(root, 'provider'), { recursive: true });
  mkdirSync(path.join(root, 'i18n'), { recursive: true });

  writeFileSync(path.join(root, 'manifest.yaml'), 'plugin_type: model_provider\nversion: 0.2.1\n');
  writeFileSync(path.join(root, 'provider', 'openai_compatible.yaml'), 'provider_code: openai_compatible\nprotocol: openai_compatible\nmodel_discovery: hybrid\n');
  writeFileSync(path.join(root, 'i18n', 'en_US.json'), JSON.stringify({ plugin: { label: 'OpenAI-Compatible API Provider', description: 'English description' }, provider: { label: 'OpenAI-Compatible API Provider' } }));
  writeFileSync(path.join(root, 'i18n', 'zh_Hans.json'), JSON.stringify({ plugin: { label: 'OpenAI-Compatible API Provider', description: '中文描述' }, provider: { label: 'OpenAI-Compatible API Provider' } }));

  const entry = buildRegistryEntry({
    pluginDir: root,
    providerCode: 'openai_compatible',
    version: '0.2.1',
    artifacts: [{ os: 'linux', arch: 'amd64', libc: 'musl', rust_target: 'x86_64-unknown-linux-musl', download_url: 'https://example.test/linux', checksum: 'sha256:abc' }],
  });

  assert.equal(entry.plugin_type, 'model_provider');
  assert.deepEqual(entry.i18n_summary.available_locales, ['en_US', 'zh_Hans']);
  assert.equal(entry.i18n_summary.default_locale, 'en_US');
  assert.equal(entry.i18n_summary.bundles.zh_Hans.plugin.description, '中文描述');
});
```

Extend `../1flowbase-official-plugins/scripts/_tests/update-official-registry.test.mjs` with:

```javascript
assert.equal(updated.plugins[0].plugin_type, 'model_provider');
assert.equal(updated.plugins[0].i18n_summary.default_locale, 'en_US');
```

- [x] **Step 2: Run the sibling-repo script tests and confirm RED**

Run in `../1flowbase-official-plugins`:

```bash
rtk node --test scripts/_tests/*.test.mjs
```

Expected: FAIL because no reusable registry builder exists yet and the current registry updater/tests know nothing about `plugin_type` or `i18n_summary`.

- [x] **Step 3: Implement reusable registry-entry building and split release packaging by OS family**

Create `../1flowbase-official-plugins/scripts/build-registry-entry.mjs` around a tested helper:

```javascript
export function buildRegistryEntry({ pluginDir, providerCode, version, artifacts }) {
  const manifest = fs.readFileSync(path.join(pluginDir, 'manifest.yaml'), 'utf8');
  const pluginType = readField(manifest, 'plugin_type', 'model_provider');
  const providerPath = path.join(pluginDir, 'provider', `${providerCode}.yaml`);
  const providerYaml = fs.readFileSync(providerPath, 'utf8');

  return {
    plugin_id: `1flowbase.${providerCode}`,
    plugin_type: pluginType,
    provider_code: providerCode,
    protocol: readField(providerYaml, 'protocol', providerCode),
    latest_version: version,
    help_url: nullableField(providerYaml, 'help_url'),
    model_discovery_mode: readField(providerYaml, 'model_discovery', 'hybrid'),
    i18n_summary: buildI18nSummary(path.join(pluginDir, 'i18n')),
    artifacts,
  };
}
```

Refactor `../1flowbase-official-plugins/.github/workflows/provider-release.yml` so packaging is no longer a single Ubuntu-only loop. The matrix should be OS-scoped, for example:

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - runs_on: ubuntu-latest
        rust_target: x86_64-unknown-linux-musl
        os: linux
        arch: amd64
        libc: musl
      - runs_on: ubuntu-latest
        rust_target: aarch64-unknown-linux-musl
        os: linux
        arch: arm64
        libc: musl
      - runs_on: macos-latest
        rust_target: x86_64-apple-darwin
        os: darwin
        arch: amd64
      - runs_on: macos-latest
        rust_target: aarch64-apple-darwin
        os: darwin
        arch: arm64
      - runs_on: windows-latest
        rust_target: x86_64-pc-windows-msvc
        os: windows
        arch: amd64
        libc: msvc
      - runs_on: windows-latest
        rust_target: aarch64-pc-windows-msvc
        os: windows
        arch: arm64
        libc: msvc
```

Replace the inline Node heredoc with the reusable builder:

```bash
entry_json="$(node scripts/build-registry-entry.mjs "${PLUGIN_DIR}" "${PROVIDER_CODE}" "${VERSION}" "${ARTIFACTS_JSON}")"
```

- [x] **Step 4: Run the sibling script tests again and confirm GREEN**

Run in `../1flowbase-official-plugins`:

```bash
rtk node --test scripts/_tests/*.test.mjs
```

Expected: PASS with registry entries preserving `plugin_type`, carrying lightweight two-locale `i18n_summary`, and workflow logic ready to emit six target-specific packages into one logical registry entry.

- [x] **Step 5: Commit the sibling repo workflow and registry changes**

Run in `../1flowbase-official-plugins`:

```bash
rtk git add .github/workflows/provider-ci.yml .github/workflows/provider-release.yml scripts/build-registry-entry.mjs scripts/_tests/build-registry-entry.test.mjs scripts/update-official-registry.mjs scripts/_tests/update-official-registry.test.mjs
rtk git commit -m "feat: add multiplatform provider release metadata"
```

### Task 3: Introduce A Shared Runtime-Profile Crate For Fingerprints, Locale Resolution, And Snapshots

**Files:**
- Create: `api/crates/runtime-profile/Cargo.toml`
- Create: `api/crates/runtime-profile/src/lib.rs`
- Create: `api/crates/runtime-profile/src/fingerprint.rs`
- Create: `api/crates/runtime-profile/src/locale.rs`
- Create: `api/crates/runtime-profile/src/profile.rs`
- Create: `api/crates/runtime-profile/src/_tests/mod.rs`
- Create: `api/crates/runtime-profile/src/_tests/fingerprint_tests.rs`
- Create: `api/crates/runtime-profile/src/_tests/locale_tests.rs`
- Create: `api/crates/runtime-profile/src/_tests/profile_tests.rs`
- Modify: `api/Cargo.toml`

- [x] **Step 1: Write the failing crate tests first**

Add locale and fingerprint tests like these:

```rust
#[test]
fn resolve_locale_prefers_user_preference_over_accept_language() {
    let resolution = resolve_locale(LocaleResolutionInput {
        query_locale: None,
        explicit_header_locale: None,
        user_preferred_locale: Some("zh_Hans".into()),
        accept_language: Some("en-US,en;q=0.9".into()),
        fallback_locale: "en_US",
        supported_locales: vec!["en_US".into(), "zh_Hans".into()],
    });

    assert_eq!(resolution.resolved_locale, "zh_Hans");
    assert_eq!(resolution.source, LocaleSource::UserPreferredLocale);
}

#[test]
fn host_fingerprint_hashes_sorted_fallback_identifiers() {
    let left = build_host_fingerprint(HostFingerprintInput {
        machine_id: None,
        stable_ids: vec!["en0:aa-bb".into(), "eth0:11-22".into()],
    });
    let right = build_host_fingerprint(HostFingerprintInput {
        machine_id: None,
        stable_ids: vec!["eth0:11-22".into(), "en0:aa-bb".into()],
    });

    assert_eq!(left, right);
    assert!(left.starts_with("host_"));
}

#[test]
fn runtime_profile_formats_memory_in_gb_with_two_decimals() {
    assert_eq!(bytes_to_gb(201_326_592), 0.19);
    assert_eq!(bytes_to_gb(17_179_869_184), 16.0);
}
```

- [x] **Step 2: Run the new crate tests and confirm RED**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p runtime-profile -- --nocapture
```

Expected: FAIL because the workspace does not yet contain a `runtime-profile` crate or any locale/fingerprint/profile helpers.

- [x] **Step 3: Implement the shared runtime-profile crate**

Add the crate to `api/Cargo.toml` and implement core helpers like this:

```rust
pub const FALLBACK_LOCALE: &str = "en_US";
pub const SUPPORTED_LOCALES: [&str; 2] = ["en_US", "zh_Hans"];

pub fn bytes_to_gb(bytes: u64) -> f64 {
    ((bytes as f64 / 1024_f64.powi(3)) * 100.0).round() / 100.0
}

pub fn build_host_fingerprint(input: HostFingerprintInput) -> String {
    let mut normalized = if let Some(machine_id) = input.machine_id {
        vec![machine_id.trim().to_ascii_lowercase()]
    } else {
        let mut ids = input
            .stable_ids
            .into_iter()
            .map(|value| value.trim().to_ascii_lowercase())
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();
        ids.sort();
        ids
    };
    normalized.sort();

    let digest = sha2::Sha256::digest(normalized.join("|").as_bytes());
    let encoded = format!("{digest:x}");
    format!("host_{}", &encoded[..32])
}
```

Resolve locale precedence in `src/locale.rs`:

```rust
pub fn resolve_locale(input: LocaleResolutionInput) -> LocaleResolution {
    if let Some(locale) = input.query_locale.as_deref().and_then(normalize_supported_locale) {
        return LocaleResolution::new(locale, input.fallback_locale, input.supported_locales, LocaleSource::Query);
    }
    if let Some(locale) = input.explicit_header_locale.as_deref().and_then(normalize_supported_locale) {
        return LocaleResolution::new(locale, input.fallback_locale, input.supported_locales, LocaleSource::ExplicitHeader);
    }
    if let Some(locale) = input.user_preferred_locale.as_deref().and_then(normalize_supported_locale) {
        return LocaleResolution::new(locale, input.fallback_locale, input.supported_locales, LocaleSource::UserPreferredLocale);
    }
    if let Some(locale) = normalize_accept_language(input.accept_language.as_deref()) {
        return LocaleResolution::new(locale.as_str(), input.fallback_locale, input.supported_locales, LocaleSource::AcceptLanguage);
    }

    LocaleResolution::new(
        input.fallback_locale.to_string(),
        input.fallback_locale,
        input.supported_locales,
        LocaleSource::Fallback,
    )
}
```

Capture the lightweight runtime snapshot in `src/profile.rs`:

```rust
pub fn collect_runtime_profile(
    service: &'static str,
    service_version: &'static str,
    process_start: OffsetDateTime,
    status: &'static str,
) -> anyhow::Result<RuntimeProfile> {
    let mut system = sysinfo::System::new_all();
    system.refresh_all();

    let target = RuntimeTarget::current_host()?;
    let process = sysinfo::get_current_pid()
        .ok()
        .and_then(|pid| system.process(pid))
        .map(|entry| entry.memory())
        .unwrap_or_default();

    Ok(RuntimeProfile {
        host_fingerprint: detect_host_fingerprint()?,
        platform: RuntimePlatform::from_target(&target),
        cpu: RuntimeCpu { logical_count: system.cpus().len() as u64 },
        memory: RuntimeMemory::from_bytes(system.total_memory(), system.available_memory(), process),
        uptime_seconds: system.uptime(),
        started_at: process_start,
        captured_at: OffsetDateTime::now_utc(),
        service,
        service_version,
        service_status: status,
    })
}
```

- [x] **Step 4: Run the crate tests again and confirm GREEN**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p runtime-profile -- --nocapture
```

Expected: PASS with deterministic fingerprint generation, the agreed locale precedence, and memory byte/GB conversions rounded to two decimals.

- [ ] **Step 5: Commit the shared runtime-profile crate**

```bash
rtk git add api/Cargo.toml api/crates/runtime-profile
rtk git commit -m "feat: add runtime profile shared crate"
```

### Task 4: Persist Preferred Locale And Add Runtime-Profile Authorization In Control Plane

**Files:**
- Create: `api/crates/control-plane/src/system_runtime.rs`
- Create: `api/crates/control-plane/src/_tests/system_runtime_service_tests.rs`
- Create: `api/crates/storage-pg/migrations/20260420120000_add_user_preferred_locale.sql`
- Modify: `api/crates/domain/src/auth.rs`
- Modify: `api/crates/domain/src/_tests/auth_domain_tests.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/control-plane/src/profile.rs`
- Modify: `api/crates/control-plane/src/_tests/profile_service_tests.rs`
- Modify: `api/crates/control-plane/src/_tests/support.rs`
- Modify: `api/crates/access-control/src/catalog.rs`
- Modify: `api/crates/storage-pg/src/auth_repository.rs`
- Modify: `api/crates/storage-pg/src/member_repository.rs`
- Modify: `api/crates/storage-pg/src/mappers/member_mapper.rs`
- Modify: `api/apps/api-server/src/routes/me.rs`
- Modify: `api/apps/api-server/src/_tests/me_routes.rs`

- [ ] **Step 1: Write the failing profile and permission tests**

Add service coverage in `api/crates/control-plane/src/_tests/profile_service_tests.rs`:

```rust
#[tokio::test]
async fn update_me_persists_preferred_locale() {
    let repository = TestAuthRepository::new(test_user());
    let service = ProfileService::new(repository.clone());

    let profile = service
        .update_me(UpdateMeCommand {
            actor_user_id: repository.user().id,
            tenant_id: Uuid::nil(),
            workspace_id: Uuid::nil(),
            name: "Root".into(),
            nickname: "Root".into(),
            email: "root@example.com".into(),
            phone: None,
            avatar_url: None,
            introduction: "intro".into(),
            preferred_locale: Some("zh_Hans".into()),
        })
        .await
        .unwrap();

    assert_eq!(profile.user.preferred_locale.as_deref(), Some("zh_Hans"));
}
```

Add permission coverage in `api/crates/control-plane/src/_tests/system_runtime_service_tests.rs`:

```rust
#[tokio::test]
async fn authorize_view_requires_system_runtime_permission_for_non_root() {
    let store = TestAuthRepository::scoped_user(&["plugin_config.view.all"]);
    let service = SystemRuntimeService::new(store.clone());

    let error = service.authorize_view(store.user().id).await.unwrap_err();
    assert!(error.to_string().contains("system_runtime.view.all"));
}

#[tokio::test]
async fn authorize_view_returns_user_locale_for_root() {
    let store = TestAuthRepository::root_user(Some("en_US"));
    let service = SystemRuntimeService::new(store.clone());

    let access = service.authorize_view(store.user().id).await.unwrap();
    assert_eq!(access.preferred_locale.as_deref(), Some("en_US"));
}
```

Add route coverage in `api/apps/api-server/src/_tests/me_routes.rs`:

```rust
assert_eq!(payload["data"]["preferred_locale"], "zh_Hans");
assert_eq!(updated["data"]["preferred_locale"], serde_json::Value::Null);
assert_eq!(error["error"]["code"], "unsupported_locale");
```

- [ ] **Step 2: Run the profile/service/route tests and confirm RED**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p control-plane profile_service_tests -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p control-plane system_runtime_service_tests -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server me_routes -- --nocapture
```

Expected: FAIL because `UserRecord` and profile updates do not carry `preferred_locale`, there is no `SystemRuntimeService`, and `/api/console/me` does not yet round-trip locale changes.

- [ ] **Step 3: Implement additive locale persistence and system runtime access**

Create the migration:

```sql
ALTER TABLE users
ADD COLUMN preferred_locale TEXT NULL;

ALTER TABLE users
ADD CONSTRAINT users_preferred_locale_check
CHECK (preferred_locale IS NULL OR preferred_locale IN ('en_US', 'zh_Hans'));
```

Use an explicit patch field in `api/apps/api-server/src/routes/me.rs` so `null` means “clear” and missing is rejected:

```rust
#[derive(Debug, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum PreferredLocalePatch {
    Value(String),
    Null,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PatchMeBody {
    pub name: String,
    pub nickname: String,
    pub email: String,
    pub phone: Option<String>,
    pub avatar_url: Option<String>,
    pub introduction: String,
    pub preferred_locale: PreferredLocalePatch,
}
```

Plumb the value through `control-plane` and storage:

```rust
pub struct UpdateProfileInput {
    pub actor_user_id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub nickname: String,
    pub email: String,
    pub phone: Option<String>,
    pub avatar_url: Option<String>,
    pub introduction: String,
    pub preferred_locale: Option<String>,
}
```

Add the authorization service in `api/crates/control-plane/src/system_runtime.rs`:

```rust
pub struct SystemRuntimeAccess {
    pub actor: ActorContext,
    pub preferred_locale: Option<String>,
}

pub async fn authorize_view(&self, actor_user_id: Uuid) -> Result<SystemRuntimeAccess> {
    let actor = self.repository.load_actor_context_for_user(actor_user_id).await?;
    ensure_permission(&actor, "system_runtime.view.all")
        .map_err(ControlPlaneError::PermissionDenied)?;
    let user = self
        .repository
        .find_user_by_id(actor_user_id)
        .await?
        .ok_or(ControlPlaneError::NotFound("user"))?;

    Ok(SystemRuntimeAccess {
        actor,
        preferred_locale: user.preferred_locale,
    })
}
```

- [ ] **Step 4: Re-run the profile/service/route tests and confirm GREEN**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p control-plane profile_service_tests -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p control-plane system_runtime_service_tests -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server me_routes -- --nocapture
```

Expected: PASS with `preferred_locale` stored on users, root bypassing permission checks automatically, non-root users requiring `system_runtime.view.all`, and `/api/console/me` correctly updating/clearing locale.

- [ ] **Step 5: Commit locale persistence and runtime authorization**

```bash
rtk git add api/crates/domain/src/auth.rs api/crates/domain/src/_tests/auth_domain_tests.rs api/crates/control-plane/src/lib.rs api/crates/control-plane/src/ports.rs api/crates/control-plane/src/profile.rs api/crates/control-plane/src/system_runtime.rs api/crates/control-plane/src/_tests/profile_service_tests.rs api/crates/control-plane/src/_tests/system_runtime_service_tests.rs api/crates/control-plane/src/_tests/support.rs api/crates/access-control/src/catalog.rs api/crates/storage-pg/migrations/20260420120000_add_user_preferred_locale.sql api/crates/storage-pg/src/auth_repository.rs api/crates/storage-pg/src/member_repository.rs api/crates/storage-pg/src/mappers/member_mapper.rs api/apps/api-server/src/routes/me.rs api/apps/api-server/src/_tests/me_routes.rs
rtk git commit -m "feat: persist preferred locale and runtime access"
```

### Task 5: Expose Internal And Public Runtime-Profile Routes With Host Aggregation

**Files:**
- Create: `api/apps/api-server/src/runtime_profile_client.rs`
- Create: `api/apps/api-server/src/routes/system.rs`
- Create: `api/apps/api-server/src/_tests/system_routes.rs`
- Create: `api/apps/plugin-runner/tests/system_routes.rs`
- Modify: `api/apps/plugin-runner/Cargo.toml`
- Modify: `api/apps/plugin-runner/src/lib.rs`
- Modify: `api/apps/api-server/Cargo.toml`
- Modify: `api/apps/api-server/src/app_state.rs`
- Modify: `api/apps/api-server/src/config.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/_tests/config_tests.rs`
- Modify: `api/apps/api-server/src/_tests/openapi_alignment.rs`
- Modify: `api/apps/api-server/src/_tests/openapi_docs_tests.rs`
- Modify: `api/apps/api-server/src/_tests/support.rs`

- [ ] **Step 1: Write the failing route tests first**

Add runner-route coverage in `api/apps/plugin-runner/tests/system_routes.rs`:

```rust
#[tokio::test]
async fn runner_runtime_profile_route_returns_snapshot() {
    let response = app()
        .oneshot(Request::builder().uri("/system/runtime-profile").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let payload: serde_json::Value = read_json(response).await;
    assert_eq!(payload["service"], "plugin-runner");
    assert!(payload["host_fingerprint"].as_str().unwrap().starts_with("host_"));
    assert!(payload["memory"]["total_gb"].is_number());
}
```

Add public aggregation coverage in `api/apps/api-server/src/_tests/system_routes.rs`:

```rust
#[tokio::test]
async fn runtime_profile_merges_same_host_services() {
    let (app, cookie) = test_app_with_runtime_profiles(
        sample_api_profile("host_same"),
        Some(sample_runner_profile("host_same")),
        &["system_runtime.view.all"],
        Some("zh_Hans"),
    )
    .await;

    let payload = get_json(&app, "/api/console/system/runtime-profile", &cookie).await;
    assert_eq!(payload["data"]["topology"]["relationship"], "same_host");
    assert_eq!(payload["data"]["hosts"].as_array().unwrap().len(), 1);
    assert_eq!(payload["data"]["locale_meta"]["source"], "user_preferred_locale");
}

#[tokio::test]
async fn runtime_profile_reports_runner_unreachable_without_failing_request() {
    let (app, cookie) = test_app_with_runtime_profile_error(&["system_runtime.view.all"]).await;
    let payload = get_json(&app, "/api/console/system/runtime-profile", &cookie).await;
    assert_eq!(payload["data"]["topology"]["relationship"], "runner_unreachable");
    assert_eq!(payload["data"]["services"]["plugin_runner"]["reachable"], false);
}
```

- [ ] **Step 2: Run the new route/config/OpenAPI tests and confirm RED**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p plugin-runner --test system_routes -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server system_routes -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server config_tests -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server openapi_docs_tests -- --nocapture
```

Expected: FAIL because neither app exposes runtime-profile routes today, `ApiState` has no internal runner client, and config/OpenAPI do not know about the new public endpoint.

- [ ] **Step 3: Implement internal runner snapshots and public aggregation**

Add a small client seam in `api/apps/api-server/src/runtime_profile_client.rs`:

```rust
#[async_trait]
pub trait PluginRunnerSystemPort: Send + Sync {
    async fn fetch_runtime_profile(&self) -> anyhow::Result<runtime_profile::RuntimeProfile>;
}

#[derive(Clone)]
pub struct HttpPluginRunnerSystemClient {
    base_url: String,
    client: reqwest::Client,
}

#[async_trait]
impl PluginRunnerSystemPort for HttpPluginRunnerSystemClient {
    async fn fetch_runtime_profile(&self) -> anyhow::Result<runtime_profile::RuntimeProfile> {
        self.client
            .get(format!("{}/system/runtime-profile", self.base_url.trim_end_matches('/')))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
            .map_err(Into::into)
    }
}
```

Expose the internal route from `api/apps/plugin-runner/src/lib.rs`:

```rust
static STARTED_AT: OnceLock<OffsetDateTime> = OnceLock::new();

async fn system_runtime_profile() -> Result<Json<runtime_profile::RuntimeProfile>, (StatusCode, Json<ErrorResponse>)> {
    runtime_profile::collect_runtime_profile(
        "plugin-runner",
        env!("CARGO_PKG_VERSION"),
        *STARTED_AT.get_or_init(OffsetDateTime::now_utc),
        "ok",
    )
    .map(Json)
    .map_err(map_anyhow_error)
}
```

Implement the public route in `api/apps/api-server/src/routes/system.rs`:

```rust
pub async fn get_runtime_profile(
    State(state): State<Arc<ApiState>>,
    Query(query): Query<SystemRuntimeProfileQuery>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<SystemRuntimeProfileResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let access = SystemRuntimeService::new(state.store.clone())
        .authorize_view(context.user.id)
        .await?;

    let locale = runtime_profile::resolve_locale(runtime_profile::LocaleResolutionInput {
        query_locale: query.locale.clone(),
        explicit_header_locale: header_locale(&headers),
        user_preferred_locale: access.preferred_locale.clone(),
        accept_language: header_accept_language(&headers),
        fallback_locale: runtime_profile::FALLBACK_LOCALE,
        supported_locales: runtime_profile::supported_locales(),
    });

    let api_profile = runtime_profile::collect_runtime_profile(
        "api-server",
        env!("CARGO_PKG_VERSION"),
        state.process_started_at,
        "ok",
    )?;
    let runner_profile = state.plugin_runner_system.fetch_runtime_profile().await.ok();

    Ok(Json(ApiSuccess::new(merge_runtime_profiles(locale, api_profile, runner_profile))))
}
```

- [ ] **Step 4: Re-run the new route/config/OpenAPI tests and confirm GREEN**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p plugin-runner --test system_routes -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server system_routes -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server config_tests -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server openapi_docs_tests -- --nocapture
```

Expected: PASS with `plugin-runner` exposing its own snapshot, `api-server` aggregating same-host/split-host/runner-unreachable states, locale metadata honoring the agreed precedence, and OpenAPI reflecting the new route.

- [ ] **Step 5: Commit runtime-profile routing and aggregation**

```bash
rtk git add api/apps/plugin-runner/Cargo.toml api/apps/plugin-runner/src/lib.rs api/apps/plugin-runner/tests/system_routes.rs api/apps/api-server/Cargo.toml api/apps/api-server/src/app_state.rs api/apps/api-server/src/config.rs api/apps/api-server/src/lib.rs api/apps/api-server/src/openapi.rs api/apps/api-server/src/runtime_profile_client.rs api/apps/api-server/src/routes/mod.rs api/apps/api-server/src/routes/system.rs api/apps/api-server/src/_tests/config_tests.rs api/apps/api-server/src/_tests/openapi_alignment.rs api/apps/api-server/src/_tests/openapi_docs_tests.rs api/apps/api-server/src/_tests/support.rs api/apps/api-server/src/_tests/system_routes.rs
rtk git commit -m "feat: add runtime profile system routes"
```

### Task 6: Refactor Plugin Catalog APIs Around `plugin_type`, Selected Artifacts, And Trimmed I18n Bundles

**Files:**
- Create: `api/crates/control-plane/src/i18n.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/control-plane/src/plugin_management.rs`
- Modify: `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`
- Modify: `api/apps/api-server/src/official_plugin_registry.rs`
- Modify: `api/apps/api-server/src/routes/plugins.rs`
- Modify: `api/apps/api-server/src/_tests/official_plugin_registry_tests.rs`
- Modify: `api/apps/api-server/src/_tests/plugin_routes.rs`
- Modify: `api/apps/api-server/src/_tests/openapi_alignment.rs`
- Modify: `api/apps/api-server/src/_tests/openapi_docs_tests.rs`
- Modify: `api/apps/api-server/src/_tests/support.rs`

- [ ] **Step 1: Write the failing plugin catalog tests**

Extend `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs` with:

```rust
fn sample_artifact(os: &str, arch: &str, libc: Option<&str>) -> OfficialPluginArtifact {
    OfficialPluginArtifact {
        os: os.into(),
        arch: arch.into(),
        libc: libc.map(str::to_string),
        rust_target: "x86_64-unknown-linux-musl".into(),
        download_url: "https://example.test/openai_compatible.1flowbasepkg".into(),
        checksum: "sha256:abc".into(),
        signature_algorithm: Some("ed25519".into()),
        signing_key_id: Some("official-key".into()),
    }
}

fn sample_i18n_summary() -> OfficialPluginI18nSummary {
    OfficialPluginI18nSummary {
        default_locale: "en_US".into(),
        available_locales: vec!["en_US".into(), "zh_Hans".into()],
        bundles: BTreeMap::from([
            ("en_US".into(), serde_json::json!({ "plugin": { "label": "OpenAI-Compatible API Provider" } })),
            ("zh_Hans".into(), serde_json::json!({ "plugin": { "label": "OpenAI-Compatible API Provider" } })),
        ]),
    }
}

#[tokio::test]
async fn list_official_catalog_filters_by_plugin_type_and_trims_i18n_bundles() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all"],
    ));
    let service = PluginManagementService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        Arc::new(MemoryOfficialPluginSource::default()),
        std::env::temp_dir().join(format!("plugin-list-{}", Uuid::now_v7())),
    );

    let view = service
        .list_official_catalog(
            repository.actor.user_id,
            PluginCatalogFilter { plugin_type: Some("model_provider".into()) },
            RequestedLocales::new("zh_Hans", "en_US"),
        )
        .await
        .unwrap();
    let entry = &view.entries[0];

    let reference = OfficialPluginSourceEntry {
        plugin_id: "1flowbase.openai_compatible".into(),
        plugin_type: "model_provider".into(),
        provider_code: "openai_compatible".into(),
        namespace: "plugin.openai_compatible".into(),
        protocol: "openai_compatible".into(),
        latest_version: "0.2.1".into(),
        selected_artifact: sample_artifact("linux", "amd64", Some("musl")),
        i18n_summary: sample_i18n_summary(),
        release_tag: "openai_compatible-v0.2.1".into(),
        trust_mode: "signature_required".into(),
        help_url: Some("https://example.test/help".into()),
        model_discovery_mode: "hybrid".into(),
    };

    assert_eq!(view.entries.len(), 1);
    assert_eq!(entry.plugin_type, reference.plugin_type);
    assert_eq!(entry.namespace, reference.namespace);
    assert!(view.i18n_catalog["plugin.openai_compatible"].get("zh_Hans").is_some());
    assert!(view.i18n_catalog["plugin.openai_compatible"].get("fr_FR").is_none());
}
```

Extend `api/apps/api-server/src/_tests/plugin_routes.rs` with assertions like:

```rust
assert_eq!(payload["data"]["entries"][0]["plugin_type"], "model_provider");
assert_eq!(payload["data"]["entries"][0]["namespace"], "plugin.openai_compatible");
assert_eq!(payload["data"]["entries"][0]["label_key"], "plugin.label");
assert!(payload["data"]["entries"][0].get("display_name").is_none());
assert!(payload["data"]["i18n_catalog"]["plugin.openai_compatible"]["zh_Hans"].is_object());
```

- [ ] **Step 2: Run the plugin catalog tests and confirm RED**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management_service_tests -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server official_plugin_registry_tests -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server plugin_routes -- --nocapture
```

Expected: FAIL because official entries still use `display_name` as the primary contract, `plugin_type` is missing, `artifacts[]` are flattened too early without i18n metadata, and route responses do not expose `namespace + key + i18n_catalog`.

- [ ] **Step 3: Implement the new plugin catalog contract**

Create `api/crates/control-plane/src/i18n.rs` with reusable trimming helpers:

```rust
pub type I18nCatalog = BTreeMap<String, BTreeMap<String, serde_json::Value>>;

pub fn trim_provider_bundles(
    namespace: &str,
    catalog: &plugin_framework::provider_package::ProviderI18nCatalog,
    locales: &RequestedLocales,
) -> I18nCatalog {
    let mut bundles = BTreeMap::new();
    for locale in [locales.resolved_locale.as_str(), locales.fallback_locale.as_str()] {
        if let Some(bundle) = catalog.bundles.get(locale) {
            bundles.insert(locale.to_string(), bundle.clone());
        }
    }

    BTreeMap::from([(namespace.to_string(), bundles)])
}
```

Extend the official source contract in `api/crates/control-plane/src/ports.rs`:

```rust
pub struct OfficialPluginArtifact {
    pub os: String,
    pub arch: String,
    pub libc: Option<String>,
    pub rust_target: String,
    pub download_url: String,
    pub checksum: String,
    pub signature_algorithm: Option<String>,
    pub signing_key_id: Option<String>,
}

pub struct OfficialPluginI18nSummary {
    pub default_locale: String,
    pub available_locales: Vec<String>,
    pub bundles: BTreeMap<String, serde_json::Value>,
}

pub struct OfficialPluginSourceEntry {
    pub plugin_id: String,
    pub plugin_type: String,
    pub provider_code: String,
    pub namespace: String,
    pub protocol: String,
    pub latest_version: String,
    pub selected_artifact: OfficialPluginArtifact,
    pub i18n_summary: OfficialPluginI18nSummary,
    // keep help_url, discovery mode, release/signature fields
}
```

Refactor `api/apps/api-server/src/routes/plugins.rs` responses around list-level locale and bundle metadata:

```rust
#[derive(Debug, Serialize, ToSchema)]
pub struct PluginCatalogResponse {
    pub locale_meta: LocaleMetaResponse,
    #[schema(value_type = Object)]
    pub i18n_catalog: serde_json::Value,
    pub entries: Vec<PluginCatalogEntryResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PluginCatalogEntryResponse {
    #[serde(flatten)]
    pub installation: PluginInstallationResponse,
    pub plugin_type: String,
    pub namespace: String,
    pub label_key: String,
    pub description_key: Option<String>,
    pub provider_label_key: String,
    pub help_url: Option<String>,
    pub default_base_url: Option<String>,
    pub model_discovery_mode: String,
    pub assigned_to_current_workspace: bool,
}
```

- [ ] **Step 4: Re-run the plugin catalog tests and confirm GREEN**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management_service_tests -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server official_plugin_registry_tests -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server plugin_routes -- --nocapture
```

Expected: PASS with official catalog filtering on `plugin_type`, local catalog/family endpoints using the same classification field, and all plugin list routes returning `locale_meta + i18n_catalog + namespace + key` while defaulting to the current host’s selected artifact only.

- [ ] **Step 5: Commit the plugin catalog contract refactor**

```bash
rtk git add api/crates/control-plane/src/i18n.rs api/crates/control-plane/src/lib.rs api/crates/control-plane/src/ports.rs api/crates/control-plane/src/plugin_management.rs api/crates/control-plane/src/_tests/plugin_management_service_tests.rs api/apps/api-server/src/official_plugin_registry.rs api/apps/api-server/src/routes/plugins.rs api/apps/api-server/src/_tests/official_plugin_registry_tests.rs api/apps/api-server/src/_tests/plugin_routes.rs api/apps/api-server/src/_tests/openapi_alignment.rs api/apps/api-server/src/_tests/openapi_docs_tests.rs api/apps/api-server/src/_tests/support.rs
rtk git commit -m "feat: refactor plugin catalogs for i18n"
```

### Task 7: Refactor Model-Provider Catalog And Options Endpoints To The Same I18n Contract

**Files:**
- Modify: `api/crates/control-plane/src/model_provider.rs`
- Modify: `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`
- Modify: `api/apps/api-server/src/routes/model_providers.rs`
- Modify: `api/apps/api-server/src/_tests/model_provider_routes.rs`
- Modify: `api/apps/api-server/src/_tests/openapi_alignment.rs`
- Modify: `api/apps/api-server/src/_tests/openapi_docs_tests.rs`

- [ ] **Step 1: Write the failing model-provider catalog/option tests**

Add service coverage in `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`:

```rust
#[tokio::test]
async fn list_catalog_returns_i18n_namespace_and_keys() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryModelProviderRepository::new(actor_with_permissions(
        workspace_id,
        &["state_model.view.all"],
    ));
    let package_root = std::env::temp_dir().join(format!("provider-catalog-{}", Uuid::now_v7()));
    create_provider_fixture(&package_root);
    let installation_id = repository
        .seed_installation(&package_root.display().to_string(), true, true)
        .await;
    repository
        .seed_assignment(workspace_id, installation_id, "fixture_provider")
        .await;
    let service = ModelProviderService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        "provider-secret-master-key",
    );

    let entries = service
        .list_catalog(repository.actor.user_id, RequestedLocales::new("zh_Hans", "en_US"))
        .await
        .unwrap();

    assert_eq!(entries.i18n_catalog["plugin.openai_compatible"].get("zh_Hans").is_some(), true);
    assert_eq!(entries.entries[0].namespace, "plugin.openai_compatible");
    assert_eq!(entries.entries[0].label_key, "provider.label");
}
```

Add route coverage in `api/apps/api-server/src/_tests/model_provider_routes.rs`:

```rust
assert_eq!(payload["data"]["entries"][0]["namespace"], "plugin.openai_compatible");
assert_eq!(payload["data"]["entries"][0]["label_key"], "provider.label");
assert_eq!(payload["data"]["entries"][0]["predefined_models"][0]["label_key"], "models.gpt_4o.label");
assert_eq!(payload["data"]["instances"][0]["models"][0]["display_name_fallback"], "gpt-4o");
```

- [ ] **Step 2: Run the model-provider tests and confirm RED**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p control-plane model_provider_service_tests -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server model_provider_routes -- --nocapture
```

Expected: FAIL because model-provider catalog and options responses still expose plain `display_name` fields instead of `namespace + key + i18n_catalog`, and predefined model descriptors do not carry key-based references yet.

- [ ] **Step 3: Implement the model-provider response refactor**

Refactor the service view in `api/crates/control-plane/src/model_provider.rs`:

```rust
pub struct ModelProviderCatalogEntry {
    pub installation_id: Uuid,
    pub provider_code: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub plugin_type: String,
    pub namespace: String,
    pub label_key: String,
    pub description_key: Option<String>,
    pub protocol: String,
    pub help_url: Option<String>,
    pub default_base_url: Option<String>,
    pub model_discovery_mode: String,
    pub supports_model_fetch_without_credentials: bool,
    pub enabled: bool,
    pub form_schema: Vec<ProviderConfigField>,
    pub predefined_models: Vec<ModelTextRef>,
}
```

Refactor the route DTOs in `api/apps/api-server/src/routes/model_providers.rs`:

```rust
#[derive(Debug, Serialize, ToSchema)]
pub struct ProviderModelDescriptorResponse {
    pub model_id: String,
    pub namespace: Option<String>,
    pub label_key: Option<String>,
    pub description_key: Option<String>,
    pub display_name_fallback: Option<String>,
    pub source: String,
    pub supports_streaming: bool,
    pub supports_tool_call: bool,
    pub supports_multimodal: bool,
    pub context_window: Option<u64>,
    pub max_output_tokens: Option<u64>,
    pub parameter_form: Option<PluginFormSchemaResponse>,
    #[schema(value_type = Object)]
    pub provider_metadata: serde_json::Value,
}
```

Use a dual-path model mapping rule:

```rust
fn model_text_ref(namespace: &str, model: &ProviderModelDescriptor) -> ProviderModelDescriptorResponse {
    ProviderModelDescriptorResponse {
        model_id: model.model_id.clone(),
        namespace: Some(namespace.to_string()),
        label_key: Some(format!("models.{}.label", model.model_id)),
        description_key: Some(format!("models.{}.description", model.model_id)),
        display_name_fallback: Some(model.display_name.clone()),
        // copy capability fields unchanged
    }
}
```

If a model comes from runtime discovery and there is no package-backed translation key, return `namespace: null`, `label_key: null`, `description_key: null`, and preserve `display_name_fallback` as pass-through.

- [ ] **Step 4: Re-run the model-provider tests and confirm GREEN**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p control-plane model_provider_service_tests -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server model_provider_routes -- --nocapture
```

Expected: PASS with `/api/console/model-providers/catalog` and `/api/console/model-providers/options` returning the same locale metadata and i18n bundle pattern as plugin catalog endpoints, while still allowing dynamic runtime-sourced model text to pass through as fallback-only data.

- [ ] **Step 5: Commit the model-provider i18n refactor**

```bash
rtk git add api/crates/control-plane/src/model_provider.rs api/crates/control-plane/src/_tests/model_provider_service_tests.rs api/apps/api-server/src/routes/model_providers.rs api/apps/api-server/src/_tests/model_provider_routes.rs api/apps/api-server/src/_tests/openapi_alignment.rs api/apps/api-server/src/_tests/openapi_docs_tests.rs
rtk git commit -m "feat: add i18n contract to model providers"
```

### Task 8: Run The Full Verification Sweep Before Declaring The Rollout Done

**Files:**
- Test: `api/apps/api-server/src/_tests/*`
- Test: `api/apps/plugin-runner/tests/*`
- Test: `api/crates/control-plane/src/_tests/*`
- Test: `../1flowbase-official-plugins/scripts/_tests/*`

- [ ] **Step 1: Run the full host-repo backend verification**

Run:

```bash
rtk node scripts/node/verify-backend.js
```

Expected: PASS with no failing Rust route/service/storage suites and no OpenAPI drift left behind.

- [ ] **Step 2: Re-run the sibling repo script tests after the host verification is green**

Run in `../1flowbase-official-plugins`:

```bash
rtk node --test scripts/_tests/*.test.mjs
```

Expected: PASS with official registry shaping and release metadata tests still green after the host-side contract changes.

- [ ] **Step 3: Inspect both git worktrees for leftover unstaged or unintended changes**

Run in `1flowbase` and `../1flowbase-official-plugins`:

```bash
rtk git status --short
```

Expected: only intentional implementation files remain; no stray temp files, generated archives, or half-updated snapshots.

- [ ] **Step 4: Commit final verification-only adjustments if the verification sweep changed fixtures**

If Step 3 is clean, do not create an extra commit. If the verification sweep forced only the documented API fixture files to change, commit exactly those files with:

```bash
rtk git add api/apps/api-server/src/_tests/openapi_alignment.rs api/apps/api-server/src/_tests/openapi_docs_tests.rs
rtk git commit -m "test: refresh verified runtime profile snapshots"
```

Expected: no commit needed if the tree is already clean after Step 3.
