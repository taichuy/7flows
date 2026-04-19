# Rust Provider Plugin Runtime Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Rust-first provider runtime distribution chain end-to-end: schema v2 executable packages, `plugin-runner` `stdio-json` execution, artifact-aware official registry selection, target-specific host packaging, and the first migrated official Rust plugin `openai_compatible`.

**Architecture:** Cut the current Node.js `runner.entrypoint` package contract over to a schema-v2 executable contract that always points at a packaged binary under `bin/`. Keep the official catalog latest-only, but let the host-side registry client select the matching artifact for the current Linux target from `artifacts[]` before the control plane downloads and installs it. Reuse the host repo `plugin CLI` as the only packaging source of truth, while the sibling official-plugin repo builds per-target binaries and publishes one logical registry entry with multiple artifacts.

**Tech Stack:** Rust (`plugin-framework`, `plugin-runner`, `api-server`), Node.js (`scripts/node/plugin.js`), GitHub Actions, sibling repo `../1flowbase-official-plugins`, targeted `cargo test`, `node --test`

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-19-rust-provider-plugin-runtime-distribution-design.md`, `.memory/project-memory/2026-04-19-rust-provider-runtime-distribution-thin-package-direction.md`

**Execution Note:** This plan intentionally spans two git repos. Host-repo changes live in `1flowbase`; official-plugin source, workflow, and registry changes live in `../1flowbase-official-plugins` and must be committed there separately. During execution, update this plan file after every completed task so the user can track progress in `docs/superpowers/plans`.

**Out Of Scope:** Windows/macOS rollout, fat package as the default `.1flowbasepkg`, keeping Node.js runtime compatibility, introducing container-image plugin distribution, a generic plugin marketplace UI

---

## File Structure

**Create**
- `api/crates/plugin-framework/src/runtime_target.rs`
- `api/crates/plugin-framework/src/_tests/runtime_target_tests.rs`
- `api/apps/plugin-runner/src/stdio_runtime.rs`
- `api/apps/api-server/src/_tests/official_plugin_registry_tests.rs`
- `../1flowbase-official-plugins/models/openai_compatible/Cargo.toml`
- `../1flowbase-official-plugins/models/openai_compatible/src/lib.rs`
- `../1flowbase-official-plugins/models/openai_compatible/src/main.rs`
- `docs/superpowers/plans/2026-04-19-rust-provider-plugin-runtime-distribution.md`

**Modify**
- `api/crates/plugin-framework/src/lib.rs`
- `api/crates/plugin-framework/src/provider_package.rs`
- `api/crates/plugin-framework/src/provider_contract.rs`
- `api/crates/plugin-framework/src/package_intake.rs`
- `api/crates/plugin-framework/src/_tests/mod.rs`
- `api/crates/plugin-framework/src/_tests/provider_package_tests.rs`
- `api/crates/plugin-framework/src/_tests/provider_contract_tests.rs`
- `api/crates/plugin-framework/src/_tests/package_intake_tests.rs`
- `api/apps/plugin-runner/Cargo.toml`
- `api/apps/plugin-runner/src/lib.rs`
- `api/apps/plugin-runner/src/package_loader.rs`
- `api/apps/plugin-runner/src/provider_host.rs`
- `api/apps/plugin-runner/tests/provider_runtime_routes.rs`
- `api/apps/api-server/src/official_plugin_registry.rs`
- `api/apps/api-server/src/_tests/mod.rs`
- `scripts/node/plugin/core.js`
- `scripts/node/plugin/_tests/core.test.js`
- `../1flowbase-official-plugins/.github/workflows/provider-ci.yml`
- `../1flowbase-official-plugins/.github/workflows/provider-release.yml`
- `../1flowbase-official-plugins/scripts/update-official-registry.mjs`
- `../1flowbase-official-plugins/scripts/_tests/update-official-registry.test.mjs`
- `../1flowbase-official-plugins/models/openai_compatible/manifest.yaml`
- `../1flowbase-official-plugins/models/openai_compatible/provider/openai_compatible.yaml`
- `../1flowbase-official-plugins/models/openai_compatible/readme/README_en_US.md`
- `../1flowbase-official-plugins/README.md`

**Delete During Execution**
- `../1flowbase-official-plugins/models/openai_compatible/provider/openai_compatible.js`

**Notes**
- Treat the current host repo `plugin CLI` as the packaging source of truth; do not fork a second packager into `1flowbase-official-plugins`.
- Keep the control-plane `OfficialPluginSourceEntry` flattened. Parse `artifacts[]` in `api-server`, select the current host artifact there, and only then hand a single chosen artifact to the rest of the backend.
- Keep the official registry latest-only. The one logical plugin entry stays under `plugins[]`; only the per-version payload becomes `artifacts[]`.
- First-round target support stays limited to `x86_64-unknown-linux-musl` and `aarch64-unknown-linux-musl`.

### Task 1: Promote Provider Packages To Schema V2 Executable Runtime Contracts

**Files:**
- Create: `api/crates/plugin-framework/src/runtime_target.rs`
- Create: `api/crates/plugin-framework/src/_tests/runtime_target_tests.rs`
- Modify: `api/crates/plugin-framework/src/lib.rs`
- Modify: `api/crates/plugin-framework/src/provider_package.rs`
- Modify: `api/crates/plugin-framework/src/package_intake.rs`
- Modify: `api/crates/plugin-framework/src/_tests/mod.rs`
- Modify: `api/crates/plugin-framework/src/_tests/provider_package_tests.rs`
- Modify: `api/crates/plugin-framework/src/_tests/package_intake_tests.rs`

- [x] **Step 1: Write the failing package-contract tests for schema-v2 executable manifests and target parsing**

Add tests like these:

```rust
#[test]
fn provider_package_loads_schema_v2_executable_runtime_and_limits() {
    let fixture = TempProviderPackage::new();
    fixture.write(
        "manifest.yaml",
        r#"schema_version: 2
plugin_type: model_provider
plugin_code: acme_openai_compatible
version: 1.2.3
contract_version: 1flowbase.provider/v1
metadata:
  author: taichuy
  icon: icon.svg
provider:
  definition: provider/acme_openai_compatible.yaml
runtime:
  kind: executable
  protocol: stdio-json
  executable:
    path: bin/acme_openai_compatible-provider
limits:
  memory_bytes: 268435456
  invoke_timeout_ms: 30000
capabilities:
  model_types:
    - llm
compat:
  minimum_host_version: 0.1.0
"#,
    );
    fixture.write("provider/acme_openai_compatible.yaml", "provider_code: acme_openai_compatible\nmodel_discovery: hybrid\n");
    fixture.write("bin/acme_openai_compatible-provider", "#!/usr/bin/env bash\nexit 0\n");
    fixture.write("i18n/en_US.json", "{ \"plugin\": { \"label\": \"Acme\" } }\n");

    let package = ProviderPackage::load_from_dir(fixture.path()).unwrap();

    assert_eq!(package.manifest.schema_version, 2);
    assert_eq!(package.manifest.runtime.kind, "executable");
    assert_eq!(package.manifest.runtime.protocol, "stdio-json");
    assert_eq!(
        package.manifest.runtime.executable.path,
        "bin/acme_openai_compatible-provider"
    );
    assert_eq!(package.manifest.limits.memory_bytes, Some(268435456));
    assert_eq!(package.manifest.limits.invoke_timeout_ms, Some(30000));
}

#[test]
fn runtime_target_parses_linux_musl_rust_triples() {
    let target = RuntimeTarget::from_rust_target_triple("aarch64-unknown-linux-musl").unwrap();

    assert_eq!(target.os, "linux");
    assert_eq!(target.arch, "arm64");
    assert_eq!(target.libc.as_deref(), Some("musl"));
    assert_eq!(target.asset_suffix(), "linux-arm64");
}
```

- [x] **Step 2: Run the `plugin-framework` package tests to capture the RED baseline**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p plugin-framework provider_package -- --nocapture
```

Expected: FAIL because `ProviderManifest` still expects `runner.language + runner.entrypoint`, `RuntimeTarget` does not exist, and the fixture shape no longer matches the current parser.

- [x] **Step 3: Implement `schema_version: 2` package parsing and the reusable runtime target helper**

Create `api/crates/plugin-framework/src/runtime_target.rs` and reshape `provider_package.rs` around explicit executable runtime fields:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeTarget {
    pub rust_target_triple: String,
    pub os: String,
    pub arch: String,
    pub libc: Option<String>,
}

impl RuntimeTarget {
    pub fn from_rust_target_triple(raw: &str) -> FrameworkResult<Self> {
        match raw.trim() {
            "x86_64-unknown-linux-musl" => Ok(Self {
                rust_target_triple: raw.to_string(),
                os: "linux".into(),
                arch: "amd64".into(),
                libc: Some("musl".into()),
            }),
            "aarch64-unknown-linux-musl" => Ok(Self {
                rust_target_triple: raw.to_string(),
                os: "linux".into(),
                arch: "arm64".into(),
                libc: Some("musl".into()),
            }),
            other => Err(PluginFrameworkError::invalid_provider_contract(format!(
                "unsupported rust target triple: {other}"
            ))),
        }
    }

    pub fn asset_suffix(&self) -> String {
        format!("{}-{}", self.os, self.arch)
    }

    pub fn current_host() -> FrameworkResult<Self> {
        match (std::env::consts::OS, std::env::consts::ARCH) {
            ("linux", "x86_64") => Ok(Self {
                rust_target_triple: "x86_64-unknown-linux-gnu".into(),
                os: "linux".into(),
                arch: "amd64".into(),
                libc: Some("gnu".into()),
            }),
            ("linux", "aarch64") => Ok(Self {
                rust_target_triple: "aarch64-unknown-linux-gnu".into(),
                os: "linux".into(),
                arch: "arm64".into(),
                libc: Some("gnu".into()),
            }),
            (os, arch) => Err(PluginFrameworkError::invalid_provider_contract(format!(
                "unsupported host target: {os}/{arch}"
            ))),
        }
    }
}
```

```rust
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ProviderExecutableSpec {
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ProviderRuntimeSpec {
    pub kind: String,
    pub protocol: String,
    pub executable: ProviderExecutableSpec,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
pub struct ProviderRuntimeLimits {
    pub memory_bytes: Option<u64>,
    pub invoke_timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ProviderManifest {
    pub schema_version: u32,
    pub plugin_type: String,
    pub plugin_code: String,
    pub version: String,
    pub contract_version: String,
    pub metadata: ProviderMetadata,
    pub provider: ProviderDefinitionRef,
    pub runtime: ProviderRuntimeSpec,
    #[serde(default)]
    pub limits: ProviderRuntimeLimits,
    pub capabilities: ProviderCapabilitiesManifest,
    pub compat: ProviderCompat,
}
```

Validation requirements:

```rust
fn validate_manifest(manifest: &ProviderManifest) -> FrameworkResult<()> {
    if manifest.schema_version != 2 {
        return Err(PluginFrameworkError::invalid_provider_package(
            "manifest.schema_version must be 2",
        ));
    }
    if manifest.plugin_type != "model_provider" {
        return Err(PluginFrameworkError::invalid_provider_package(
            "manifest.plugin_type must be model_provider",
        ));
    }
    if manifest.runtime.kind != "executable" {
        return Err(PluginFrameworkError::invalid_provider_package(
            "manifest.runtime.kind must be executable",
        ));
    }
    if manifest.runtime.protocol != "stdio-json" {
        return Err(PluginFrameworkError::invalid_provider_package(
            "manifest.runtime.protocol must be stdio-json",
        ));
    }
    Ok(())
}
```

- [x] **Step 4: Update intake fixtures and rerun the focused `plugin-framework` test set**

Update every old `runner:` fixture in `provider_package_tests.rs` and `package_intake_tests.rs` to the new manifest shape:

```rust
fixture.write(
    "manifest.yaml",
    format!(
        "schema_version: 2\nplugin_type: model_provider\nplugin_code: {plugin_code}\nversion: {version}\ncontract_version: 1flowbase.provider/v1\nmetadata:\n  author: taichuy\nprovider:\n  definition: provider/{plugin_code}.yaml\nruntime:\n  kind: executable\n  protocol: stdio-json\n  executable:\n    path: bin/{plugin_code}-provider\nlimits:\n  memory_bytes: 268435456\n  invoke_timeout_ms: 30000\ncapabilities:\n  model_types:\n    - llm\ncompat:\n  minimum_host_version: 0.1.0\n"
    ),
);
```

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p plugin-framework provider_package -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p plugin-framework package_intake -- --nocapture
```

Expected: PASS with the new schema-v2 manifest parser and unchanged signed-package intake behavior.

- [x] **Step 5: Commit the package-contract cutover**

```bash
git add \
  api/crates/plugin-framework/src/lib.rs \
  api/crates/plugin-framework/src/runtime_target.rs \
  api/crates/plugin-framework/src/provider_package.rs \
  api/crates/plugin-framework/src/package_intake.rs \
  api/crates/plugin-framework/src/_tests/mod.rs \
  api/crates/plugin-framework/src/_tests/runtime_target_tests.rs \
  api/crates/plugin-framework/src/_tests/provider_package_tests.rs \
  api/crates/plugin-framework/src/_tests/package_intake_tests.rs
git commit -m "feat: add executable provider package schema"
```

### Task 2: Replace The Node Bridge With Executable `stdio-json` Provider Runtime Execution

**Files:**
- Create: `api/apps/plugin-runner/src/stdio_runtime.rs`
- Modify: `api/crates/plugin-framework/src/provider_contract.rs`
- Modify: `api/crates/plugin-framework/src/_tests/provider_contract_tests.rs`
- Modify: `api/apps/plugin-runner/Cargo.toml`
- Modify: `api/apps/plugin-runner/src/lib.rs`
- Modify: `api/apps/plugin-runner/src/package_loader.rs`
- Modify: `api/apps/plugin-runner/src/provider_host.rs`
- Modify: `api/apps/plugin-runner/tests/provider_runtime_routes.rs`

- [ ] **Step 1: Write the failing `plugin-runner` integration test against an executable fixture**

Replace the Node.js runtime fixture in `api/apps/plugin-runner/tests/provider_runtime_routes.rs` with a temp executable:

```rust
fn write_fixture_runtime(package: &TempProviderPackage) {
    package.write(
        "bin/fixture_provider",
        r#"#!/usr/bin/env bash
set -euo pipefail
payload="$(cat)"
case "${payload}" in
  *'"method":"validate"'*)
    printf '%s' '{"ok":true,"result":{"ok":true,"sanitized":{"api_key":"***"}}}'
    ;;
  *'"method":"list_models"'*)
    printf '%s' '{"ok":true,"result":[{"model_id":"fixture_dynamic","display_name":"Fixture Dynamic","source":"dynamic","supports_streaming":true,"supports_tool_call":true,"supports_multimodal":false,"context_window":64000,"max_output_tokens":4096,"provider_metadata":{"tier":"dynamic"}}]}'
    ;;
  *'"method":"invoke"'*)
    printf '%s' '{"ok":true,"result":{"events":[{"type":"text_delta","delta":"echo:fixture-model"},{"type":"finish","reason":"stop"}],"result":{"final_content":"echo:fixture-model","usage":{"input_tokens":5,"output_tokens":7,"total_tokens":12},"finish_reason":"stop","provider_metadata":{"provider_code":"fixture_provider"}}}}'
    ;;
  *)
    printf '%s' '{"ok":false,"error":{"kind":"provider_invalid_response","message":"unknown method","provider_summary":null}}'
    exit 1
    ;;
esac
"#,
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let path = package.path().join("bin/fixture_provider");
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).unwrap();
    }
}
```

And update the manifest fixture to:

```rust
package.write(
    "manifest.yaml",
    r#"schema_version: 2
plugin_type: model_provider
plugin_code: fixture_provider
version: 0.1.0
contract_version: 1flowbase.provider/v1
metadata:
  author: taichuy
provider:
  definition: provider/fixture_provider.yaml
runtime:
  kind: executable
  protocol: stdio-json
  executable:
    path: bin/fixture_provider
limits:
  memory_bytes: 134217728
  invoke_timeout_ms: 5000
capabilities:
  model_types:
    - llm
compat:
  minimum_host_version: 0.1.0
"#,
);
```

- [ ] **Step 2: Run the `plugin-runner` route tests to capture the RED baseline**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p plugin-runner provider_runtime_routes -- --nocapture
```

Expected: FAIL because `plugin-runner` still shells out to `node -e ...`, `PackageLoader` still reads `manifest.runner.entrypoint`, and there is no shared `stdio-json` request envelope.

- [ ] **Step 3: Implement the shared `stdio-json` protocol types and executable child-process client**

First, add the minimal wire contract to `api/crates/plugin-framework/src/provider_contract.rs`:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderStdioMethod {
    Validate,
    ListModels,
    Invoke,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderStdioRequest {
    pub method: ProviderStdioMethod,
    #[serde(default)]
    pub input: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderStdioError {
    pub kind: ProviderRuntimeErrorKind,
    pub message: String,
    #[serde(default)]
    pub provider_summary: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProviderStdioResponse {
    pub ok: bool,
    #[serde(default)]
    pub result: Value,
    #[serde(default)]
    pub error: Option<ProviderStdioError>,
}
```

Then implement `api/apps/plugin-runner/src/stdio_runtime.rs`:

```rust
pub async fn call_executable(
    executable_path: &Path,
    request: &ProviderStdioRequest,
    limits: &ProviderRuntimeLimits,
) -> FrameworkResult<Value> {
    let mut command = Command::new(executable_path);
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    apply_memory_limit(&mut command, limits.memory_bytes)?;

    let mut child = command
        .spawn()
        .map_err(|error| PluginFrameworkError::io(Some(executable_path), error.to_string()))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(serde_json::to_vec(request).unwrap().as_slice())
            .await
            .map_err(|error| PluginFrameworkError::io(Some(executable_path), error.to_string()))?;
    }

    let output = tokio::time::timeout(
        Duration::from_millis(limits.invoke_timeout_ms.unwrap_or(30_000)),
        child.wait_with_output(),
    )
    .await
    .map_err(|_| {
        PluginFrameworkError::runtime(ProviderRuntimeError::normalize(
            "invoke",
            "provider runtime timed out",
            None,
        ))
    })?
    .map_err(|error| PluginFrameworkError::io(Some(executable_path), error.to_string()))?;

    parse_stdio_response(executable_path, &output.stdout, &output.stderr)
}
```

And update `provider_host.rs` to send explicit methods instead of Node bridge strings:

```rust
let request = ProviderStdioRequest {
    method: ProviderStdioMethod::ListModels,
    input: provider_config,
};
let output = call_executable(
    &loaded.runtime_executable,
    &request,
    &loaded.package.manifest.limits,
)
.await?;
```

- [ ] **Step 4: Rerun the focused runner and shared-contract test suite**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p plugin-framework provider_contract -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p plugin-runner provider_runtime_routes -- --nocapture
```

Expected: PASS with `plugin-runner` spawning packaged executables, parsing the common request/response envelope, enforcing timeout, and honoring the packaged executable path.

- [ ] **Step 5: Commit the runner runtime cutover**

```bash
git add \
  api/crates/plugin-framework/src/provider_contract.rs \
  api/crates/plugin-framework/src/_tests/provider_contract_tests.rs \
  api/apps/plugin-runner/Cargo.toml \
  api/apps/plugin-runner/src/lib.rs \
  api/apps/plugin-runner/src/package_loader.rs \
  api/apps/plugin-runner/src/provider_host.rs \
  api/apps/plugin-runner/src/stdio_runtime.rs \
  api/apps/plugin-runner/tests/provider_runtime_routes.rs
git commit -m "feat: run provider binaries over stdio json"
```

### Task 3: Parse Artifact-Aware Official Registry Entries And Select The Current Host Target

**Files:**
- Create: `api/apps/api-server/src/_tests/official_plugin_registry_tests.rs`
- Modify: `api/apps/api-server/src/_tests/mod.rs`
- Modify: `api/apps/api-server/src/official_plugin_registry.rs`

- [ ] **Step 1: Write the failing registry-selection tests for `artifacts[]`**

Create `api/apps/api-server/src/_tests/official_plugin_registry_tests.rs` with focused unit tests:

```rust
use crate::official_plugin_registry::{
    OfficialRegistryArtifact, OfficialRegistryEntry, select_artifact_for_host,
};
use plugin_framework::RuntimeTarget;

#[test]
fn select_artifact_prefers_exact_linux_match() {
    let host = RuntimeTarget {
        rust_target_triple: "x86_64-unknown-linux-gnu".into(),
        os: "linux".into(),
        arch: "amd64".into(),
        libc: Some("gnu".into()),
    };
    let entry = OfficialRegistryEntry {
        plugin_id: "1flowbase.openai_compatible".into(),
        provider_code: "openai_compatible".into(),
        display_name: "OpenAI-Compatible API Provider".into(),
        protocol: "openai_compatible".into(),
        latest_version: "0.2.1".into(),
        help_url: None,
        model_discovery_mode: "hybrid".into(),
        artifacts: vec![
            OfficialRegistryArtifact {
                os: "linux".into(),
                arch: "amd64".into(),
                libc: Some("musl".into()),
                rust_target: "x86_64-unknown-linux-musl".into(),
                download_url: "https://example.com/linux-amd64.1flowbasepkg".into(),
                checksum: "sha256:linux-amd64".into(),
                signature_algorithm: Some("ed25519".into()),
                signing_key_id: Some("official-key-2026-04".into()),
            },
            OfficialRegistryArtifact {
                os: "linux".into(),
                arch: "arm64".into(),
                libc: Some("musl".into()),
                rust_target: "aarch64-unknown-linux-musl".into(),
                download_url: "https://example.com/linux-arm64.1flowbasepkg".into(),
                checksum: "sha256:linux-arm64".into(),
                signature_algorithm: Some("ed25519".into()),
                signing_key_id: Some("official-key-2026-04".into()),
            },
        ],
    };

    let selected = select_artifact_for_host(&entry, &host).unwrap();
    assert_eq!(selected.download_url, "https://example.com/linux-amd64.1flowbasepkg");
}

#[test]
fn select_artifact_returns_none_when_no_platform_matches() {
    let host = RuntimeTarget {
        rust_target_triple: "aarch64-apple-darwin".into(),
        os: "macos".into(),
        arch: "arm64".into(),
        libc: None,
    };
    let entry = OfficialRegistryEntry {
        plugin_id: "1flowbase.openai_compatible".into(),
        provider_code: "openai_compatible".into(),
        display_name: "OpenAI-Compatible API Provider".into(),
        protocol: "openai_compatible".into(),
        latest_version: "0.2.1".into(),
        help_url: None,
        model_discovery_mode: "hybrid".into(),
        artifacts: vec![OfficialRegistryArtifact {
            os: "linux".into(),
            arch: "amd64".into(),
            libc: Some("musl".into()),
            rust_target: "x86_64-unknown-linux-musl".into(),
            download_url: "https://example.com/linux-amd64.1flowbasepkg".into(),
            checksum: "sha256:linux-amd64".into(),
            signature_algorithm: None,
            signing_key_id: None,
        }],
    };

    assert!(select_artifact_for_host(&entry, &host).is_none());
}
```

- [ ] **Step 2: Run the focused `api-server` tests to capture the RED baseline**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p api-server official_plugin_registry -- --nocapture
```

Expected: FAIL because the registry parser still expects `download_url` and `checksum` at the top level and has no `artifacts[]` selection helper.

- [ ] **Step 3: Implement the artifact parser and host-target selection inside the registry client**

Reshape `api/apps/api-server/src/official_plugin_registry.rs` like this:

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct OfficialRegistryArtifact {
    pub os: String,
    pub arch: String,
    #[serde(default)]
    pub libc: Option<String>,
    pub rust_target: String,
    pub download_url: String,
    pub checksum: String,
    #[serde(default)]
    pub signature_algorithm: Option<String>,
    #[serde(default)]
    pub signing_key_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OfficialRegistryEntry {
    pub plugin_id: String,
    pub provider_code: String,
    pub display_name: String,
    pub protocol: String,
    pub latest_version: String,
    pub help_url: Option<String>,
    pub model_discovery_mode: String,
    #[serde(default)]
    pub artifacts: Vec<OfficialRegistryArtifact>,
}

pub fn select_artifact_for_host(
    entry: &OfficialRegistryEntry,
    host: &RuntimeTarget,
) -> Option<OfficialRegistryArtifact> {
    entry.artifacts.iter().cloned().max_by_key(|artifact| {
        if artifact.os != host.os || artifact.arch != host.arch {
            return 0_u8;
        }
        match (host.libc.as_deref(), artifact.libc.as_deref()) {
            (Some(left), Some(right)) if left == right => 3,
            (Some("gnu"), Some("musl")) if host.os == "linux" => 2,
            (_, None) => 1,
            (None, Some(_)) => 1,
            _ => 0,
        }
    }).filter(|artifact| artifact.os == host.os && artifact.arch == host.arch)
}
```

Then flatten only the selected artifact into the existing backend entry:

```rust
let host = RuntimeTarget::current_host()
    .unwrap_or_else(|_| RuntimeTarget::from_rust_target_triple("x86_64-unknown-linux-musl").unwrap());

let entries = document
    .plugins
    .into_iter()
    .filter_map(|entry| {
        let selected = select_artifact_for_host(&entry, &host)?;
        Some(OfficialPluginSourceEntry {
            plugin_id: entry.plugin_id,
            provider_code: entry.provider_code,
            display_name: entry.display_name,
            protocol: entry.protocol,
            latest_version: entry.latest_version,
            release_tag: format!("{}-v{}", entry.provider_code, entry.latest_version),
            download_url: selected.download_url,
            checksum: selected.checksum,
            trust_mode: default_trust_mode(),
            signature_algorithm: selected.signature_algorithm,
            signing_key_id: selected.signing_key_id,
            help_url: entry.help_url,
            model_discovery_mode: entry.model_discovery_mode,
        })
    })
    .collect();
```

- [ ] **Step 4: Rerun the registry client tests**

Run:

```bash
rtk cargo test --manifest-path api/Cargo.toml -p api-server official_plugin_registry -- --nocapture
```

Expected: PASS, with the host repo only ever exposing one selected artifact per logical official plugin entry.

- [ ] **Step 5: Commit the host-side artifact selection**

```bash
git add \
  api/apps/api-server/src/official_plugin_registry.rs \
  api/apps/api-server/src/_tests/mod.rs \
  api/apps/api-server/src/_tests/official_plugin_registry_tests.rs
git commit -m "feat: select official plugin artifacts by host target"
```

### Task 4: Teach The Host `plugin CLI` To Scaffold Rust Plugins And Package Target-Specific Binaries

**Files:**
- Modify: `scripts/node/plugin/core.js`
- Modify: `scripts/node/plugin/_tests/core.test.js`

- [ ] **Step 1: Write the failing Node tests for Rust scaffolds and target-specific packages**

Add tests like these to `scripts/node/plugin/_tests/core.test.js`:

```js
test('plugin init scaffolds rust provider source and executable manifest', async () => {
  const pluginPath = makeTempPluginPath();

  await main(['init', pluginPath]);

  const manifest = fs.readFileSync(path.join(pluginPath, 'manifest.yaml'), 'utf8');
  assert.match(manifest, /schema_version: 2/);
  assert.match(manifest, /plugin_type: model_provider/);
  assert.match(manifest, /kind: executable/);
  assert.match(manifest, /protocol: stdio-json/);
  assert.match(manifest, /path: bin\/acme_openai_compatible-provider/);
  assert.equal(fs.existsSync(path.join(pluginPath, 'Cargo.toml')), true);
  assert.equal(fs.existsSync(path.join(pluginPath, 'src', 'main.rs')), true);
  assert.equal(
    fs.existsSync(path.join(pluginPath, 'provider', 'acme_openai_compatible.js')),
    false
  );
});

test('plugin package copies a target binary into bin and encodes the target in the asset name', async () => {
  const pluginPath = makeTempPluginPath();
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-dist-'));
  const fakeBinary = path.join(outputDir, 'acme-openai-compatible-provider');

  await main(['init', pluginPath]);
  fs.writeFileSync(fakeBinary, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
  fs.chmodSync(fakeBinary, 0o755);

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
  const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-plugin-extract-'));
  const unpack = spawnSync('tar', ['-xzf', result.packageFile, '-C', extractedDir]);
  assert.equal(unpack.status, 0);
  assert.equal(
    fs.existsSync(path.join(extractedDir, 'bin', 'acme_openai_compatible-provider')),
    true
  );
});
```

- [ ] **Step 2: Run the focused CLI tests to capture the RED baseline**

Run:

```bash
rtk node --test scripts/node/plugin/_tests/core.test.js
```

Expected: FAIL because `plugin init` still emits Node.js `runner:` manifests and `provider/*.js`, while `plugin package` does not accept `--runtime-binary` or `--target`.

- [ ] **Step 3: Implement Rust scaffolding and target-aware package staging**

Update `scripts/node/plugin/core.js` in three places.

First, make the scaffold Rust-first:

```js
function createManifestTemplate({ pluginCode }) {
  return `schema_version: 2
plugin_type: model_provider
plugin_code: ${pluginCode}
version: 0.1.0
contract_version: 1flowbase.provider/v1
metadata:
  author: taichuy
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
```

Then generate `Cargo.toml` and `src/main.rs` instead of `provider/*.js`:

```js
writeFile(
  path.join(pluginPath, 'Cargo.toml'),
  `[package]
name = "${pluginCode}-provider"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
`
);
writeFile(
  path.join(pluginPath, 'src', 'main.rs'),
  `use std::io::{self, Read};

fn main() {
    let mut stdin = String::new();
    io::stdin().read_to_string(&mut stdin).unwrap();
    println!("{{\\"ok\\":true,\\"result\\":{{\\"provider_code\\":\\"${pluginCode}\\",\\"message\\":\\"generated rust scaffold\\"}}}}");
}
`
);
```

Finally, require a compiled runtime binary during packaging:

```js
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

function createPluginPackage(pluginPath, outputDir, options = {}) {
  if (!options.runtimeBinaryFile) {
    throw new Error('package 需要 --runtime-binary 指向已编译 provider 可执行文件');
  }
  if (!options.targetTriple) {
    throw new Error('package 需要 --target 指定 rust target triple');
  }

  const target = parseRustTargetTriple(options.targetTriple);
  const stagedRoot = createPackageArtifactRoot(resolvedPluginPath);
  const binaryName = target.os === 'windows'
    ? `${pluginCode}-provider.exe`
    : `${pluginCode}-provider`;
  const stagedBinaryPath = path.join(stagedRoot, 'bin', binaryName);
  fs.mkdirSync(path.dirname(stagedBinaryPath), { recursive: true });
  fs.copyFileSync(path.resolve(options.runtimeBinaryFile), stagedBinaryPath);
  fs.chmodSync(stagedBinaryPath, 0o755);

  const pendingFile = path.join(
    resolvedOutputDir,
    `1flowbase@${pluginCode}@${version}@${target.assetSuffix}@pending.1flowbasepkg`
  );
  const result = spawnSync('tar', ['-czf', pendingFile, '-C', stagedRoot, '.'], { stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(result.stderr.toString('utf8').trim() || 'tar 打包失败');
  }
  const checksum = hashFile(pendingFile);
  const finalFile = path.join(
    resolvedOutputDir,
    `1flowbase@${pluginCode}@${version}@${target.assetSuffix}@${checksum}.1flowbasepkg`
  );
  fs.renameSync(pendingFile, finalFile);

  return {
    packageFile: finalFile,
    packageName: path.basename(finalFile),
    checksum,
    os: target.os,
    arch: target.arch,
    libc: target.libc,
    rustTarget: target.rustTargetTriple,
  };
}
```

- [ ] **Step 4: Rerun the CLI tests**

Run:

```bash
rtk node --test scripts/node/plugin/_tests/core.test.js
```

Expected: PASS with Rust scaffold output and per-target `.1flowbasepkg` naming such as `1flowbase@openai_compatible@0.2.1@linux-amd64@<sha>.1flowbasepkg`.

- [ ] **Step 5: Commit the host CLI changes**

```bash
git add scripts/node/plugin/core.js scripts/node/plugin/_tests/core.test.js
git commit -m "feat: package rust provider binaries per target"
```

### Task 5: Update The Official Plugin Repo Release Automation For Multi-Artifact Latest-Only Publishing

**Files:**
- Modify: `../1flowbase-official-plugins/.github/workflows/provider-ci.yml`
- Modify: `../1flowbase-official-plugins/.github/workflows/provider-release.yml`
- Modify: `../1flowbase-official-plugins/scripts/update-official-registry.mjs`
- Modify: `../1flowbase-official-plugins/scripts/_tests/update-official-registry.test.mjs`

- [ ] **Step 1: Write the failing registry-updater test for one logical entry with multiple artifacts**

Replace the old flat-entry expectation in `../1flowbase-official-plugins/scripts/_tests/update-official-registry.test.mjs` with:

```js
test('upsertRegistryEntry replaces one provider entry and preserves artifacts array', () => {
  const registry = {
    version: 1,
    generated_at: '2026-04-19T00:00:00Z',
    plugins: [
      {
        plugin_id: '1flowbase.openai_compatible',
        provider_code: 'openai_compatible',
        latest_version: '0.2.0',
        artifacts: [{ os: 'linux', arch: 'amd64', libc: 'musl', download_url: 'old', checksum: 'sha256:old' }],
      },
    ],
  };

  const next = upsertRegistryEntry(registry, {
    plugin_id: '1flowbase.openai_compatible',
    provider_code: 'openai_compatible',
    display_name: 'OpenAI-Compatible API Provider',
    protocol: 'openai_compatible',
    latest_version: '0.2.1',
    help_url: 'https://platform.openai.com/docs/api-reference',
    model_discovery_mode: 'hybrid',
    artifacts: [
      { os: 'linux', arch: 'amd64', libc: 'musl', rust_target: 'x86_64-unknown-linux-musl', download_url: 'amd64', checksum: 'sha256:amd64' },
      { os: 'linux', arch: 'arm64', libc: 'musl', rust_target: 'aarch64-unknown-linux-musl', download_url: 'arm64', checksum: 'sha256:arm64' },
    ],
  });

  assert.equal(next.plugins.length, 1);
  assert.equal(next.plugins[0].latest_version, '0.2.1');
  assert.equal(next.plugins[0].artifacts.length, 2);
});
```

- [ ] **Step 2: Run the sibling-repo script tests to capture the RED baseline**

Run:

```bash
cd ../1flowbase-official-plugins && node --test scripts/_tests/*.test.mjs
```

Expected: FAIL because the updater and release workflow still assume a flat `download_url/checksum` entry and only package one artifact.

- [ ] **Step 3: Implement the multi-artifact release workflow and latest-only registry writer**

Keep provider detection by version bump, but build both Linux targets inside one provider release job.

Update `../1flowbase-official-plugins/.github/workflows/provider-release.yml` like this:

```yaml
      - name: Setup Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-unknown-linux-musl,aarch64-unknown-linux-musl

      - name: Install cross
        run: cargo install cross --git https://github.com/cross-rs/cross

      - name: Build and package provider artifacts
        id: package
        env:
          PLUGIN_DIR: ${{ matrix.plugin_dir }}
          PROVIDER_CODE: ${{ matrix.provider_code }}
          VERSION: ${{ matrix.version }}
          RELEASE_TAG: ${{ matrix.release_tag }}
        shell: bash
        run: |
          set -euo pipefail
          rm -rf dist
          mkdir -p dist
          artifacts_json='[]'
          for target_spec in \
            "x86_64-unknown-linux-musl|linux|amd64|musl" \
            "aarch64-unknown-linux-musl|linux|arm64|musl"
          do
            IFS='|' read -r rust_target os arch libc <<<"${target_spec}"
            cross build --manifest-path "${PLUGIN_DIR}/Cargo.toml" --release --target "${rust_target}"
            binary_path="${PLUGIN_DIR}/target/${rust_target}/release/${PROVIDER_CODE}-provider"
            package_json="$(node host/scripts/node/plugin.js package "${PLUGIN_DIR}" --out dist --runtime-binary "${binary_path}" --target "${rust_target}")"
            package_name="$(node --input-type=module -e "const data = JSON.parse(process.argv[1]); process.stdout.write(data.packageName);" "${package_json}")"
            checksum="$(node --input-type=module -e "const data = JSON.parse(process.argv[1]); process.stdout.write(data.checksum);" "${package_json}")"
            download_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/releases/download/${RELEASE_TAG}/${package_name}"
            artifacts_json="$(node --input-type=module -e "const current = JSON.parse(process.argv[1]); current.push({ os: process.argv[2], arch: process.argv[3], libc: process.argv[4], rust_target: process.argv[5], download_url: process.argv[6], checksum: \`sha256:${process.argv[7]}\`, signature_algorithm: 'ed25519', signing_key_id: process.env.OFFICIAL_PLUGIN_SIGNING_KEY_ID }); process.stdout.write(JSON.stringify(current));" "${artifacts_json}" "${os}" "${arch}" "${libc}" "${rust_target}" "${download_url}" "${checksum}")"
          done
          echo "artifacts_json=${artifacts_json}" >> "${GITHUB_OUTPUT}"
```

Then update the registry-entry writer to emit one logical plugin row:

```js
export function upsertRegistryEntry(registry, entry) {
  const plugins = Array.isArray(registry?.plugins) ? registry.plugins : [];
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    plugins: [
      ...plugins.filter((item) => item?.provider_code !== entry.provider_code),
      entry,
    ].sort((left, right) => left.provider_code.localeCompare(right.provider_code)),
  };
}
```

Also update `provider-ci.yml` to compile and package at least the host `x86_64-unknown-linux-musl` target in dry-run mode before script tests.

- [ ] **Step 4: Rerun the sibling-repo script test suite**

Run:

```bash
cd ../1flowbase-official-plugins && node --test scripts/_tests/*.test.mjs
```

Expected: PASS, with `official-registry.json` writer ready to store one latest-only plugin entry containing an `artifacts[]` array.

- [ ] **Step 5: Commit the sibling-repo release automation**

```bash
git -C ../1flowbase-official-plugins add \
  .github/workflows/provider-ci.yml \
  .github/workflows/provider-release.yml \
  scripts/update-official-registry.mjs \
  scripts/_tests/update-official-registry.test.mjs
git -C ../1flowbase-official-plugins commit -m "chore: publish multi-target official provider assets"
```

### Task 6: Migrate `openai_compatible` To A Rust Executable Plugin And Verify The Whole Chain

**Files:**
- Create: `../1flowbase-official-plugins/models/openai_compatible/Cargo.toml`
- Create: `../1flowbase-official-plugins/models/openai_compatible/src/lib.rs`
- Create: `../1flowbase-official-plugins/models/openai_compatible/src/main.rs`
- Modify: `../1flowbase-official-plugins/models/openai_compatible/manifest.yaml`
- Modify: `../1flowbase-official-plugins/models/openai_compatible/provider/openai_compatible.yaml`
- Modify: `../1flowbase-official-plugins/models/openai_compatible/readme/README_en_US.md`
- Modify: `../1flowbase-official-plugins/README.md`
- Delete: `../1flowbase-official-plugins/models/openai_compatible/provider/openai_compatible.js`

- [ ] **Step 1: Write the failing Rust unit tests for config normalization and invocation mapping**

Start `../1flowbase-official-plugins/models/openai_compatible/src/lib.rs` with unit tests like:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalize_provider_config_requires_base_url_and_api_key() {
        let error = normalize_provider_config(&json!({ "base_url": "", "api_key": "" }))
            .expect_err("missing credentials must fail");

        assert!(error.to_string().contains("base_url"));
    }

    #[test]
    fn normalize_usage_maps_openai_usage_fields() {
        let usage = normalize_usage(&json!({
            "prompt_tokens": 5,
            "completion_tokens": 7,
            "total_tokens": 12
        }));

        assert_eq!(usage.input_tokens, Some(5));
        assert_eq!(usage.output_tokens, Some(7));
        assert_eq!(usage.total_tokens, Some(12));
    }
}
```

- [ ] **Step 2: Run the plugin crate test command to capture the RED baseline**

Run:

```bash
rtk cargo test --manifest-path ../1flowbase-official-plugins/models/openai_compatible/Cargo.toml -- --nocapture
```

Expected: FAIL immediately because the Rust crate does not exist yet and the plugin still ships a Node.js runtime file.

- [ ] **Step 3: Implement the Rust crate, executable main, and schema-v2 manifest**

Create `Cargo.toml` with the minimal dependencies:

```toml
[package]
name = "openai_compatible-provider"
version = "0.2.1"
edition = "2021"

[dependencies]
anyhow = "1"
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

Cut `manifest.yaml` over to schema v2:

```yaml
schema_version: 2
plugin_type: model_provider
plugin_code: openai_compatible
version: 0.2.1
contract_version: 1flowbase.provider/v1

metadata:
  author: taichuy
  icon: icon.svg

provider:
  definition: provider/openai_compatible.yaml

runtime:
  kind: executable
  protocol: stdio-json
  executable:
    path: bin/openai_compatible-provider

limits:
  memory_bytes: 268435456
  invoke_timeout_ms: 30000

capabilities:
  model_types:
    - llm

compat:
  minimum_host_version: 0.1.0
```

Implement the executable entrypoint in `src/main.rs`:

```rust
use std::io::{self, Read};

use openai_compatible_provider::{handle_request, ProviderStdioRequest, ProviderStdioResponse};

#[tokio::main]
async fn main() {
    let mut stdin = String::new();
    io::stdin().read_to_string(&mut stdin).unwrap();
    let request: ProviderStdioRequest = serde_json::from_str(&stdin).unwrap();
    let response: ProviderStdioResponse = handle_request(request).await.unwrap_or_else(|error| {
        ProviderStdioResponse::error("provider_invalid_response", error.to_string())
    });
    print!("{}", serde_json::to_string(&response).unwrap());
}
```

And implement `src/lib.rs` with the migrated OpenAI-compatible logic:

```rust
impl ProviderStdioResponse {
    pub fn ok(result: serde_json::Value) -> Self {
        Self {
            ok: true,
            result,
            error: None,
        }
    }

    pub fn error(kind: &str, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            result: serde_json::Value::Null,
            error: Some(ProviderStdioError {
                kind: kind.to_string(),
                message: message.into(),
                provider_summary: None,
            }),
        }
    }
}

pub async fn handle_request(request: ProviderStdioRequest) -> anyhow::Result<ProviderStdioResponse> {
    match request.method.as_str() {
        "validate" => {
            let config = normalize_provider_config(&request.input)?;
            let payload = request_json(&config, "/models", None).await?;
            Ok(ProviderStdioResponse::ok(json!({
                "ok": true,
                "provider_code": "openai_compatible",
                "sanitized": {
                    "base_url": config.base_url,
                    "api_key": "***",
                    "organization": config.organization,
                    "project": config.project,
                    "api_version": config.api_version,
                    "default_headers": config.default_headers.keys().collect::<Vec<_>>(),
                },
                "model_count": payload["data"].as_array().map(|items| items.len()).unwrap_or(0),
            })))
        }
        "list_models" => {
            let config = normalize_provider_config(&request.input)?;
            let payload = request_json(&config, "/models", None).await?;
            Ok(ProviderStdioResponse::ok(json!(normalize_model_entries(&payload["data"])?)))
        }
        "invoke" => {
            let input: ProviderInvocationInput = serde_json::from_value(request.input)?;
            Ok(ProviderStdioResponse::ok(serde_json::to_value(invoke_chat_completion(input).await?)?))
        }
        other => Ok(ProviderStdioResponse::error(
            "provider_invalid_response",
            format!("unsupported method: {other}"),
        )),
    }
}
```

Keep `normalize_provider_config`, `request_json`, `normalize_model_entries`, `normalize_usage`, and `invoke_chat_completion` as private helpers inside `src/lib.rs`, ported directly from the current `provider/openai_compatible.js` behavior before deleting that file.

- [ ] **Step 4: Run the full focused verification set across both repos**

Run:

```bash
rtk cargo test --manifest-path ../1flowbase-official-plugins/models/openai_compatible/Cargo.toml -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p plugin-framework provider_package -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p plugin-runner provider_runtime_routes -- --nocapture
rtk cargo test --manifest-path api/Cargo.toml -p api-server official_plugin_registry -- --nocapture
rtk node --test scripts/node/plugin/_tests/core.test.js
cd ../1flowbase-official-plugins && node --test scripts/_tests/*.test.mjs
```

Expected: PASS, proving the new schema-v2 package parser, executable runner host, target-aware artifact selection, host packaging CLI, official repo release scripts, and Rust `openai_compatible` sample are aligned.

- [ ] **Step 5: Commit the sample-plugin migration in the sibling repo**

```bash
git -C ../1flowbase-official-plugins add \
  models/openai_compatible/Cargo.toml \
  models/openai_compatible/src/lib.rs \
  models/openai_compatible/src/main.rs \
  models/openai_compatible/manifest.yaml \
  models/openai_compatible/provider/openai_compatible.yaml \
  models/openai_compatible/readme/README_en_US.md \
  README.md
git -C ../1flowbase-official-plugins rm models/openai_compatible/provider/openai_compatible.js
git -C ../1flowbase-official-plugins commit -m "feat: migrate openai_compatible provider to rust"
```
