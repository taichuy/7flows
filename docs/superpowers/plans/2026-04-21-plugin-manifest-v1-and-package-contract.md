# Plugin Manifest V1 And Package Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the provider-only manifest parsing path with a generic `plugin manifest v1` contract that captures `consumption_kind`, `execution_mode`, permissions, runtime entry, release metadata, and optional `node_contributions[]`, while preserving the current model-provider runtime path as the first concrete adapter.

**Architecture:** Keep `plugin-framework` as the package contract owner. Introduce one generic manifest model plus one provider-specific adapter: generic parsing and validation happens once in `plugin-framework`, while `ProviderPackage` becomes a typed projection used by current model-provider consumers. The sibling official plugin repo updates its `openai_compatible` example manifest to the new shape so package contract tests and human-facing examples stay aligned.

**Tech Stack:** Rust (`plugin-framework`, `control-plane`, `plugin-runner`, `api-server`), sibling repo YAML manifests, targeted `cargo test`, targeted `node --test`.

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-20-plugin-architecture-and-node-contribution-design.md`, `docs/superpowers/specs/1flowbase/2026-04-19-plugin-trust-source-install-design.md`, `docs/superpowers/specs/1flowbase/2026-04-19-rust-provider-plugin-runtime-distribution-design.md`

---

## File Structure

**Create**
- `api/crates/plugin-framework/src/manifest_v1.rs`
- `api/crates/plugin-framework/src/_tests/manifest_v1_tests.rs`
- `api/crates/plugin-framework/src/_tests/provider_manifest_adapter_tests.rs`

**Modify**
- `api/crates/plugin-framework/src/lib.rs`
- `api/crates/plugin-framework/src/provider_package.rs`
- `api/crates/plugin-framework/src/package_intake.rs`
- `api/crates/plugin-framework/src/_tests/package_intake_tests.rs`
- `api/crates/plugin-framework/src/_tests/provider_package_tests.rs`
- `api/crates/control-plane/src/plugin_management.rs`
- `api/apps/plugin-runner/src/package_loader.rs`
- `api/apps/api-server/src/routes/plugins.rs`
- `../1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/manifest.yaml`
- `../1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/readme/README_en_US.md`

**Notes**
- `source_kind` and `trust_level` stay separate even after the manifest becomes generic.
- `ProviderPackage` remains a first-party adapter; this plan does not make `plugin-runner` load arbitrary capability or host plugins yet.
- `node_contributions[]` can be present in the manifest after this plan, but registry persistence and execution belong to later plans.

### Task 1: Define Generic Manifest Parsing And Validation

**Files:**
- Create: `api/crates/plugin-framework/src/manifest_v1.rs`
- Create: `api/crates/plugin-framework/src/_tests/manifest_v1_tests.rs`
- Modify: `api/crates/plugin-framework/src/lib.rs`

- [x] **Step 1: Write failing manifest-v1 parsing tests**

Create `api/crates/plugin-framework/src/_tests/manifest_v1_tests.rs` with cases like:

```rust
#[test]
fn plugin_manifest_v1_parses_runtime_extension_provider_fields() {
    let manifest = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: openai_compatible@0.4.0
version: 0.4.0
vendor: 1flowbase
display_name: OpenAI Compatible
description: Generic OpenAI-compatible provider runtime extension
source_kind: official_registry
trust_level: verified_official
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - model_provider
binding_targets:
  - workspace
selection_mode: assignment_then_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.provider/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: provider_instance_only
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/openai-compatible-provider
  limits:
    timeout_ms: 30000
    memory_bytes: 268435456
node_contributions: []
"#,
    )
    .unwrap();

    assert_eq!(manifest.consumption_kind.as_str(), "runtime_extension");
    assert_eq!(manifest.execution_mode.as_str(), "process_per_call");
    assert_eq!(manifest.slot_codes, vec!["model_provider"]);
}

#[test]
fn plugin_manifest_v1_rejects_host_extension_with_workspace_binding() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: bad_host@0.1.0
version: 0.1.0
vendor: acme
display_name: Bad Host
description: invalid
source_kind: uploaded
trust_level: unverified
consumption_kind: host_extension
execution_mode: in_process
slot_codes: []
binding_targets:
  - workspace
selection_mode: auto_activate
minimum_host_version: 0.1.0
contract_version: 1flowbase.host_extension/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: none
  storage: host_managed
  mcp: none
  subprocess: deny
runtime:
  protocol: native_host
  entry: lib/bad-host.so
"#,
    )
    .unwrap_err();

    assert!(error.to_string().contains("host_extension"));
}
```

- [x] **Step 2: Run the new manifest tests to capture the RED baseline**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-framework manifest_v1 -- --nocapture
```

Expected:

- FAIL because `plugin-framework` only understands the current provider-specific `schema_version=2` manifest and has no generic `plugin manifest v1` parser.

- [x] **Step 3: Implement `PluginManifestV1` and validation rules**

Create `api/crates/plugin-framework/src/manifest_v1.rs` around these shapes:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct PluginManifestV1 {
    pub manifest_version: u32,
    pub plugin_id: String,
    pub version: String,
    pub vendor: String,
    pub display_name: String,
    pub description: String,
    pub icon: Option<String>,
    pub source_kind: String,
    pub trust_level: String,
    pub consumption_kind: PluginConsumptionKind,
    pub execution_mode: PluginExecutionMode,
    #[serde(default)]
    pub slot_codes: Vec<String>,
    #[serde(default)]
    pub binding_targets: Vec<String>,
    pub selection_mode: String,
    pub minimum_host_version: String,
    pub contract_version: String,
    pub schema_version: String,
    pub permissions: PluginPermissionManifest,
    pub runtime: PluginRuntimeManifest,
    #[serde(default)]
    pub node_contributions: Vec<NodeContributionManifest>,
}

pub fn parse_plugin_manifest(raw: &str) -> FrameworkResult<PluginManifestV1> {
    let manifest: PluginManifestV1 = serde_yaml::from_str(raw)
        .map_err(|error| PluginFrameworkError::invalid_provider_package(error.to_string()))?;
    validate_plugin_manifest(&manifest)?;
    Ok(manifest)
}
```

Validation rules must include:

```rust
if manifest.manifest_version != 1 {
    return Err(PluginFrameworkError::invalid_provider_package(
        "manifest_version must be 1",
    ));
}
if manifest.consumption_kind == PluginConsumptionKind::HostExtension
    && manifest.binding_targets.iter().any(|target| target == "workspace")
{
    return Err(PluginFrameworkError::invalid_provider_package(
        "host_extension cannot declare workspace binding_targets",
    ));
}
if manifest.consumption_kind == PluginConsumptionKind::CapabilityPlugin
    && manifest.node_contributions.is_empty()
{
    return Err(PluginFrameworkError::invalid_provider_package(
        "capability_plugin must declare node_contributions or another explicit capability surface",
    ));
}
```

- [x] **Step 4: Re-run the manifest tests to verify parsing is GREEN**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-framework manifest_v1 -- --nocapture
```

Expected:

- PASS with the new generic parser validating `consumption_kind`, `execution_mode`, and binding rules.

- [x] **Step 5: Commit the manifest-v1 parser**

```bash
git add api/crates/plugin-framework/src/lib.rs api/crates/plugin-framework/src/manifest_v1.rs api/crates/plugin-framework/src/_tests/manifest_v1_tests.rs
git commit -m "feat: add plugin manifest v1 parser"
```

### Task 2: Adapt Provider Package Loading To The Generic Manifest

**Files:**
- Create: `api/crates/plugin-framework/src/_tests/provider_manifest_adapter_tests.rs`
- Modify: `api/crates/plugin-framework/src/provider_package.rs`
- Modify: `api/crates/plugin-framework/src/package_intake.rs`
- Modify: `api/crates/plugin-framework/src/_tests/package_intake_tests.rs`
- Modify: `api/crates/plugin-framework/src/_tests/provider_package_tests.rs`
- Modify: `api/apps/plugin-runner/src/package_loader.rs`
- Modify: `api/crates/control-plane/src/plugin_management.rs`

- [x] **Step 1: Write failing adapter tests for provider packages**

Add tests like:

```rust
#[test]
fn provider_package_adapter_reads_runtime_entry_from_plugin_manifest_v1() {
    let package = ProviderPackage::load_from_dir("src/_tests/fixtures/openai_compatible_v1").unwrap();

    assert_eq!(package.manifest.plugin_id, "openai_compatible@0.4.0");
    assert_eq!(package.manifest.consumption_kind.as_str(), "runtime_extension");
    assert_eq!(package.runtime_entry().to_string_lossy(), "bin/openai-compatible-provider");
}

#[test]
fn provider_package_adapter_rejects_non_provider_slot_manifest() {
    let error = ProviderPackage::load_from_dir("src/_tests/fixtures/bad_capability_manifest").unwrap_err();

    assert!(error.to_string().contains("model_provider"));
}
```

- [x] **Step 2: Run adapter and intake tests to capture RED**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-framework provider_package -- --nocapture
cargo test --manifest-path api/Cargo.toml -p plugin-framework package_intake -- --nocapture
```

Expected:

- FAIL because `ProviderPackage` still expects the old provider-specific top-level manifest keys and `package_intake` still returns only the provider-shaped metadata.

- [x] **Step 3: Refactor provider loading to project from `PluginManifestV1`**

Update `api/crates/plugin-framework/src/provider_package.rs` to use:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderPackage {
    pub root: PathBuf,
    pub manifest: PluginManifestV1,
    pub provider: ProviderDefinition,
    pub predefined_models: Vec<ProviderModelDescriptor>,
    pub i18n: ProviderI18nCatalog,
}

impl ProviderPackage {
    pub fn runtime_entry(&self) -> PathBuf {
        self.root.join(&self.manifest.runtime.entry)
    }
}
```

And keep provider-specific checks explicit:

```rust
if manifest.consumption_kind != PluginConsumptionKind::RuntimeExtension {
    return Err(PluginFrameworkError::invalid_provider_package(
        "model provider package must declare consumption_kind=runtime_extension",
    ));
}
if !manifest.slot_codes.iter().any(|slot| slot == "model_provider") {
    return Err(PluginFrameworkError::invalid_provider_package(
        "model provider package must declare slot_codes including model_provider",
    ));
}
```

Also update `PackageIntakeResult` to carry the generic manifest snapshot:

```rust
pub struct PackageIntakeResult {
    pub extracted_root: PathBuf,
    pub manifest: PluginManifestV1,
    pub package: ProviderPackage,
    pub source_kind: String,
    pub trust_level: String,
    ...
}
```

- [x] **Step 4: Re-run the provider-package and intake tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-framework provider_package -- --nocapture
cargo test --manifest-path api/Cargo.toml -p plugin-framework package_intake -- --nocapture
```

Expected:

- PASS with current provider packages loading through the generic manifest adapter instead of a provider-only top-level manifest.

- [x] **Step 5: Commit the provider manifest adapter**

```bash
git add api/crates/plugin-framework/src/provider_package.rs api/crates/plugin-framework/src/package_intake.rs api/crates/plugin-framework/src/_tests/provider_manifest_adapter_tests.rs api/crates/plugin-framework/src/_tests/package_intake_tests.rs api/crates/plugin-framework/src/_tests/provider_package_tests.rs api/apps/plugin-runner/src/package_loader.rs api/crates/control-plane/src/plugin_management.rs
git commit -m "feat: adapt provider packages to plugin manifest v1"
```

### Task 3: Align The Official Example Manifest And Public API Contract

**Files:**
- Modify: `api/apps/api-server/src/routes/plugins.rs`
- Modify: `../1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/manifest.yaml`
- Modify: `../1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/readme/README_en_US.md`

- [ ] **Step 1: Update the example manifest and document it in tests**

Change the official example manifest toward:

```yaml
manifest_version: 1
plugin_id: openai_compatible@0.4.0
version: 0.4.0
vendor: 1flowbase
display_name: OpenAI Compatible
description: OpenAI-compatible provider runtime extension
source_kind: official_registry
trust_level: verified_official
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - model_provider
binding_targets:
  - workspace
selection_mode: assignment_then_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.provider/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: provider_instance_only
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/openai-compatible-provider
  limits:
    timeout_ms: 30000
    memory_bytes: 268435456
node_contributions: []
```

- [ ] **Step 2: Stop exposing legacy provider-only manifest assumptions in API responses**

Update route DTO comments and field descriptions in `api/apps/api-server/src/routes/plugins.rs` so they no longer describe plugin packages as provider-only by definition. The route should still return current provider catalog data, but the wording must leave room for generic plugin kinds.

- [ ] **Step 3: Run targeted verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-framework manifest_v1 -- --nocapture
cargo test --manifest-path api/Cargo.toml -p plugin-framework provider_package -- --nocapture
git -C ../1flowbase-official-plugins diff --check
git diff --check
```

Expected:

- PASS with the host parser and sibling repo example using the same manifest vocabulary.

- [ ] **Step 4: Commit the contract alignment**

```bash
git add api/apps/api-server/src/routes/plugins.rs ../1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/manifest.yaml ../1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/readme/README_en_US.md
git commit -m "docs: align official example with plugin manifest v1"
```

## Self-Review

- Spec coverage: this plan covers section `7. plugin manifest v1`, preserves source/trust semantics from the trust/install spec, and keeps the current provider runtime path working as the first typed adapter.
- Placeholder scan: every step names concrete files, commands, and code shapes; no placeholder markers or deferred adapter names remain.
- Type consistency: later tasks keep the same names for `PluginManifestV1`, `PluginConsumptionKind`, `PluginExecutionMode`, `slot_codes`, `binding_targets`, and `node_contributions`.
