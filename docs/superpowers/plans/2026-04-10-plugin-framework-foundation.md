# 08 Plugin Framework Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first executable backend slice of the `08` plugin framework: Rust workspace scaffold, plugin manifest/schema validation, lifecycle policy, local runner RPC contract, and team/app scope registry primitives.

**Architecture:** Start with a Rust workspace and isolate plugin concerns in `crates/plugin-framework`. Keep this first slice limited to domain models, validation, policy, and contract types so later control-plane API and runtime-worker integration can depend on stable plugin semantics without refactoring the core model.

**Tech Stack:** Rust workspace, `serde`, `serde_json`, `thiserror`, `schemars`, `tokio`, `cargo test`

---

## Scope Split

`08` 规格已经完成，但实现上不适合一口气横跨所有子系统。这里先落第一份计划，只覆盖插件后端基础层。后续应继续补两份计划：

1. `08-control-plane`：插件安装、启停、分配、审计的控制面 API 与后台入口。
2. `08-runtime-integration`：运行时、发布网关与插件能力消费链路。

本计划的完成标准是：仓库具备可编译的 Rust workspace，`plugin-framework` crate 拥有稳定的 manifest/schema、生命周期规则、RPC 契约和安装注册表模型，并由测试锁住。

## File Structure

**Create**
- `Cargo.toml`
- `rust-toolchain.toml`
- `apps/api-server/Cargo.toml`
- `apps/api-server/src/main.rs`
- `apps/runtime-worker/Cargo.toml`
- `apps/runtime-worker/src/main.rs`
- `crates/plugin-framework/Cargo.toml`
- `crates/plugin-framework/src/lib.rs`
- `crates/plugin-framework/src/error.rs`
- `crates/plugin-framework/src/manifest.rs`
- `crates/plugin-framework/src/schema.rs`
- `crates/plugin-framework/src/lifecycle.rs`
- `crates/plugin-framework/src/rpc.rs`
- `crates/plugin-framework/src/registry.rs`
- `crates/plugin-framework/tests/workspace_smoke.rs`
- `crates/plugin-framework/tests/manifest_validation.rs`
- `crates/plugin-framework/tests/lifecycle_policy.rs`
- `crates/plugin-framework/tests/rpc_contract.rs`
- `crates/plugin-framework/tests/registry_scope.rs`

**Modify**
- None

**Notes**
- `apps/api-server` 和 `apps/runtime-worker` 只建立最小可编译入口，不在本计划中加入真实业务逻辑。
- `crates/plugin-framework` 是本计划唯一需要有真实实现的 crate。

### Task 1: Scaffold Rust Workspace And Plugin Crate

**Files:**
- Create: `Cargo.toml`
- Create: `rust-toolchain.toml`
- Create: `apps/api-server/Cargo.toml`
- Create: `apps/api-server/src/main.rs`
- Create: `apps/runtime-worker/Cargo.toml`
- Create: `apps/runtime-worker/src/main.rs`
- Create: `crates/plugin-framework/Cargo.toml`
- Create: `crates/plugin-framework/src/lib.rs`
- Create: `crates/plugin-framework/src/error.rs`
- Test: `crates/plugin-framework/tests/workspace_smoke.rs`

- [ ] **Step 1: Write the failing test**

```rust
use plugin_framework::PluginFrameworkError;

#[test]
fn workspace_exposes_plugin_framework_error_type() {
    let error = PluginFrameworkError::InvalidStateTransition {
        from: "installed".to_string(),
        to: "active".to_string(),
    };

    assert!(error
        .to_string()
        .contains("invalid plugin state transition"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p plugin-framework workspace_exposes_plugin_framework_error_type -- --exact`

Expected: FAIL with a workspace or unresolved crate error because the Rust workspace and `plugin-framework` crate do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `Cargo.toml`:

```toml
[workspace]
members = [
  "apps/api-server",
  "apps/runtime-worker",
  "crates/plugin-framework",
]
resolver = "2"

[workspace.package]
edition = "2021"
license = "MIT"
version = "0.1.0"

[workspace.dependencies]
schemars = "0.8"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

Create `rust-toolchain.toml`:

```toml
[toolchain]
channel = "stable"
components = ["clippy", "rustfmt"]
```

Create `apps/api-server/Cargo.toml`:

```toml
[package]
name = "api-server"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
tokio.workspace = true
plugin-framework = { path = "../../crates/plugin-framework" }
```

Create `apps/api-server/src/main.rs`:

```rust
fn main() {
    println!("api-server bootstrap");
}
```

Create `apps/runtime-worker/Cargo.toml`:

```toml
[package]
name = "runtime-worker"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
tokio.workspace = true
plugin-framework = { path = "../../crates/plugin-framework" }
```

Create `apps/runtime-worker/src/main.rs`:

```rust
fn main() {
    println!("runtime-worker bootstrap");
}
```

Create `crates/plugin-framework/Cargo.toml`:

```toml
[package]
name = "plugin-framework"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
schemars.workspace = true
serde.workspace = true
serde_json.workspace = true
thiserror.workspace = true
```

Create `crates/plugin-framework/src/lib.rs`:

```rust
pub mod error;
pub mod lifecycle;
pub mod manifest;
pub mod registry;
pub mod rpc;
pub mod schema;

pub use error::PluginFrameworkError;
```

Create `crates/plugin-framework/src/error.rs`:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PluginFrameworkError {
    #[error("invalid plugin state transition: {from} -> {to}")]
    InvalidStateTransition { from: String, to: String },

    #[error("manifest validation error: {0}")]
    ManifestValidation(String),

    #[error("registry error: {0}")]
    Registry(String),
}
```

Create placeholder files so the crate compiles before later tasks fill them in.

Create `crates/plugin-framework/src/lifecycle.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaceholderLifecycle {
    Stub,
}
```

Create `crates/plugin-framework/src/manifest.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaceholderManifest {
    Stub,
}
```

Create `crates/plugin-framework/src/schema.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaceholderSchema {
    Stub,
}
```

Create `crates/plugin-framework/src/rpc.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaceholderRpc {
    Stub,
}
```

Create `crates/plugin-framework/src/registry.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaceholderRegistry {
    Stub,
}
```

Create `crates/plugin-framework/tests/workspace_smoke.rs`:

```rust
use plugin_framework::PluginFrameworkError;

#[test]
fn workspace_exposes_plugin_framework_error_type() {
    let error = PluginFrameworkError::InvalidStateTransition {
        from: "installed".to_string(),
        to: "active".to_string(),
    };

    assert!(error
        .to_string()
        .contains("invalid plugin state transition"));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p plugin-framework workspace_exposes_plugin_framework_error_type -- --exact`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add Cargo.toml rust-toolchain.toml apps/api-server apps/runtime-worker crates/plugin-framework
git commit -m "feat: scaffold plugin framework workspace"
```

### Task 2: Add Manifest And Schema Validation

**Files:**
- Modify: `crates/plugin-framework/src/lib.rs`
- Modify: `crates/plugin-framework/src/error.rs`
- Modify: `crates/plugin-framework/src/manifest.rs`
- Modify: `crates/plugin-framework/src/schema.rs`
- Test: `crates/plugin-framework/tests/manifest_validation.rs`

- [ ] **Step 1: Write the failing test**

Create `crates/plugin-framework/tests/manifest_validation.rs`:

```rust
use plugin_framework::manifest::{
    CompatibilityRange, PluginCapability, PluginKind, PluginManifest, PluginPermission,
    PluginSourceLevel, RuntimeMode,
};
use plugin_framework::schema::{IoSchema, PluginSchemas};

fn valid_manifest() -> PluginManifest {
    PluginManifest {
        api_version: "1".to_string(),
        kind: PluginKind::Provider,
        plugin_id: "provider.openai".to_string(),
        version: "0.1.0".to_string(),
        display_name: "OpenAI Provider".to_string(),
        source_level: PluginSourceLevel::OfficialWhitelist,
        runtime_mode: RuntimeMode::Hosted,
        entry: None,
        capabilities: vec![PluginCapability::Provider],
        compatibility: CompatibilityRange {
            host_api_version: "1".to_string(),
            min_runner_version: None,
        },
        permissions: vec![PluginPermission::Use],
    }
}

#[test]
fn manifest_validation_rejects_empty_plugin_id() {
    let mut manifest = valid_manifest();
    manifest.plugin_id = String::new();

    let error = manifest.validate().unwrap_err();

    assert!(error.to_string().contains("plugin_id"));
}

#[test]
fn manifest_validation_rejects_runner_mode_without_entry() {
    let mut manifest = valid_manifest();
    manifest.runtime_mode = RuntimeMode::RunnerWasm;

    let error = manifest.validate().unwrap_err();

    assert!(error.to_string().contains("entry"));
}

#[test]
fn schemas_require_io_contract_for_node_plugins() {
    let manifest = PluginManifest {
        kind: PluginKind::Node,
        ..valid_manifest()
    };
    let schemas = PluginSchemas {
        config_schema: serde_json::json!({"type": "object"}),
        secret_schema: serde_json::json!({"type": "object"}),
        io_schema: IoSchema::default(),
    };

    let error = schemas.validate_for(&manifest).unwrap_err();

    assert!(error.to_string().contains("io_schema"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p plugin-framework manifest_validation_rejects_empty_plugin_id -- --exact`

Expected: FAIL with unresolved imports or missing `validate` methods.

- [ ] **Step 3: Write minimal implementation**

Replace `crates/plugin-framework/src/manifest.rs` with:

```rust
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::PluginFrameworkError;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginKind {
    Provider,
    Node,
    DataSource,
    PublishAdapter,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginCapability {
    Provider,
    Node,
    DataSource,
    PublishAdapter,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginPermission {
    View,
    Use,
    Configure,
    Manage,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginSourceLevel {
    OfficialWhitelist,
    Community,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeMode {
    Hosted,
    RunnerWasm,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub struct CompatibilityRange {
    pub host_api_version: String,
    pub min_runner_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub struct PluginManifest {
    pub api_version: String,
    pub kind: PluginKind,
    pub plugin_id: String,
    pub version: String,
    pub display_name: String,
    pub source_level: PluginSourceLevel,
    pub runtime_mode: RuntimeMode,
    pub entry: Option<String>,
    pub capabilities: Vec<PluginCapability>,
    pub compatibility: CompatibilityRange,
    pub permissions: Vec<PluginPermission>,
}

impl PluginManifest {
    pub fn validate(&self) -> Result<(), PluginFrameworkError> {
        if self.plugin_id.trim().is_empty() {
            return Err(PluginFrameworkError::ManifestValidation(
                "plugin_id must not be empty".to_string(),
            ));
        }

        if self.api_version.trim().is_empty() {
            return Err(PluginFrameworkError::ManifestValidation(
                "api_version must not be empty".to_string(),
            ));
        }

        if matches!(self.runtime_mode, RuntimeMode::RunnerWasm)
            && self.entry.as_deref().unwrap_or_default().trim().is_empty()
        {
            return Err(PluginFrameworkError::ManifestValidation(
                "entry is required for runner_wasm plugins".to_string(),
            ));
        }

        Ok(())
    }
}
```

Replace `crates/plugin-framework/src/schema.rs` with:

```rust
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::manifest::{PluginKind, PluginManifest};
use crate::PluginFrameworkError;

#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct IoSchema {
    pub input: Option<Value>,
    pub output: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct PluginSchemas {
    pub config_schema: Value,
    pub secret_schema: Value,
    pub io_schema: IoSchema,
}

impl PluginSchemas {
    pub fn validate_for(&self, manifest: &PluginManifest) -> Result<(), PluginFrameworkError> {
        match manifest.kind {
            PluginKind::Node | PluginKind::DataSource | PluginKind::PublishAdapter => {
                if self.io_schema.input.is_none() && self.io_schema.output.is_none() {
                    return Err(PluginFrameworkError::ManifestValidation(
                        "io_schema must declare at least one input or output contract".to_string(),
                    ));
                }
            }
            PluginKind::Provider => {}
        }

        Ok(())
    }
}
```

Update `crates/plugin-framework/src/lib.rs`:

```rust
pub mod error;
pub mod lifecycle;
pub mod manifest;
pub mod registry;
pub mod rpc;
pub mod schema;

pub use error::PluginFrameworkError;
pub use manifest::{PluginManifest, PluginSourceLevel, RuntimeMode};
pub use schema::{IoSchema, PluginSchemas};
```

Update `crates/plugin-framework/src/error.rs`:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PluginFrameworkError {
    #[error("invalid plugin state transition: {from} -> {to}")]
    InvalidStateTransition { from: String, to: String },

    #[error("manifest validation error: {0}")]
    ManifestValidation(String),

    #[error("registry error: {0}")]
    Registry(String),

    #[error("rpc contract error: {0}")]
    RpcContract(String),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p plugin-framework --test manifest_validation`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/plugin-framework/src/lib.rs crates/plugin-framework/src/error.rs crates/plugin-framework/src/manifest.rs crates/plugin-framework/src/schema.rs crates/plugin-framework/tests/manifest_validation.rs
git commit -m "feat: add plugin manifest validation"
```

### Task 3: Encode Lifecycle Policy And Risk-Source Enable Rules

**Files:**
- Modify: `crates/plugin-framework/src/lifecycle.rs`
- Modify: `crates/plugin-framework/src/lib.rs`
- Test: `crates/plugin-framework/tests/lifecycle_policy.rs`

- [ ] **Step 1: Write the failing test**

Create `crates/plugin-framework/tests/lifecycle_policy.rs`:

```rust
use plugin_framework::lifecycle::{PluginLifecycleState, PluginRiskApproval};
use plugin_framework::manifest::PluginSourceLevel;

#[test]
fn unknown_code_plugin_requires_manual_approval() {
    let approval = PluginRiskApproval::for_install(
        PluginSourceLevel::Unknown,
        true,
    );

    assert!(approval.requires_root_or_admin_confirmation);
    assert_eq!(approval.default_state, PluginLifecycleState::Disabled);
}

#[test]
fn official_plugin_can_activate_directly() {
    let approval = PluginRiskApproval::for_install(
        PluginSourceLevel::OfficialWhitelist,
        false,
    );

    assert!(!approval.requires_root_or_admin_confirmation);
    assert_eq!(approval.default_state, PluginLifecycleState::Enabled);
}

#[test]
fn lifecycle_rejects_removed_to_active_transition() {
    let error = PluginLifecycleState::Removed
        .transition_to(PluginLifecycleState::Active)
        .unwrap_err();

    assert!(error
        .to_string()
        .contains("invalid plugin state transition"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p plugin-framework unknown_code_plugin_requires_manual_approval -- --exact`

Expected: FAIL with missing lifecycle types or methods.

- [ ] **Step 3: Write minimal implementation**

Replace `crates/plugin-framework/src/lifecycle.rs` with:

```rust
use crate::manifest::PluginSourceLevel;
use crate::PluginFrameworkError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginLifecycleState {
    Downloaded,
    Installed,
    Disabled,
    Enabled,
    Active,
    Unhealthy,
    Removed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PluginRiskApproval {
    pub requires_root_or_admin_confirmation: bool,
    pub default_state: PluginLifecycleState,
}

impl PluginRiskApproval {
    pub fn for_install(source_level: PluginSourceLevel, has_wasm: bool) -> Self {
        let risky_code_plugin = has_wasm
            && matches!(
                source_level,
                PluginSourceLevel::Community | PluginSourceLevel::Unknown
            );

        if risky_code_plugin {
            return Self {
                requires_root_or_admin_confirmation: true,
                default_state: PluginLifecycleState::Disabled,
            };
        }

        Self {
            requires_root_or_admin_confirmation: false,
            default_state: PluginLifecycleState::Enabled,
        }
    }
}

impl PluginLifecycleState {
    pub fn transition_to(self, next: PluginLifecycleState) -> Result<PluginLifecycleState, PluginFrameworkError> {
        let allowed = matches!(
            (self, next),
            (PluginLifecycleState::Downloaded, PluginLifecycleState::Installed)
                | (PluginLifecycleState::Installed, PluginLifecycleState::Disabled)
                | (PluginLifecycleState::Disabled, PluginLifecycleState::Enabled)
                | (PluginLifecycleState::Enabled, PluginLifecycleState::Active)
                | (PluginLifecycleState::Active, PluginLifecycleState::Unhealthy)
                | (PluginLifecycleState::Active, PluginLifecycleState::Disabled)
                | (PluginLifecycleState::Unhealthy, PluginLifecycleState::Disabled)
                | (_, PluginLifecycleState::Removed)
        );

        if allowed {
            Ok(next)
        } else {
            Err(PluginFrameworkError::InvalidStateTransition {
                from: format!("{self:?}").to_lowercase(),
                to: format!("{next:?}").to_lowercase(),
            })
        }
    }
}
```

Update `crates/plugin-framework/src/lib.rs`:

```rust
pub mod error;
pub mod lifecycle;
pub mod manifest;
pub mod registry;
pub mod rpc;
pub mod schema;

pub use error::PluginFrameworkError;
pub use lifecycle::{PluginLifecycleState, PluginRiskApproval};
pub use manifest::{PluginManifest, PluginSourceLevel, RuntimeMode};
pub use schema::{IoSchema, PluginSchemas};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p plugin-framework --test lifecycle_policy`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/plugin-framework/src/lib.rs crates/plugin-framework/src/lifecycle.rs crates/plugin-framework/tests/lifecycle_policy.rs
git commit -m "feat: add plugin lifecycle policy"
```

### Task 4: Define Local Runner RPC Contract

**Files:**
- Modify: `crates/plugin-framework/src/rpc.rs`
- Modify: `crates/plugin-framework/src/lib.rs`
- Test: `crates/plugin-framework/tests/rpc_contract.rs`

- [ ] **Step 1: Write the failing test**

Create `crates/plugin-framework/tests/rpc_contract.rs`:

```rust
use plugin_framework::rpc::{
    PluginRpcErrorCode, PluginRpcMethod, PluginRpcRequest, LOAD_TIMEOUT_MS,
};

#[test]
fn rpc_request_captures_required_routing_fields() {
    let request = PluginRpcRequest {
        request_id: "req-1".to_string(),
        trace_id: "trace-1".to_string(),
        team_id: "team-1".to_string(),
        app_id: Some("app-1".to_string()),
        plugin_id: "provider.openai".to_string(),
        plugin_version: "0.1.0".to_string(),
        timeout_ms: LOAD_TIMEOUT_MS,
        caller_context: serde_json::json!({"actor": "system"}),
        method: PluginRpcMethod::Load,
        payload: serde_json::json!({"entry": null}),
    };

    assert_eq!(request.plugin_id, "provider.openai");
}

#[test]
fn rpc_error_codes_stay_stable() {
    assert_eq!(PluginRpcErrorCode::InvokeTimeout.as_str(), "INVOKE_TIMEOUT");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p plugin-framework rpc_request_captures_required_routing_fields -- --exact`

Expected: FAIL with unresolved RPC types.

- [ ] **Step 3: Write minimal implementation**

Replace `crates/plugin-framework/src/rpc.rs` with:

```rust
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const LOAD_TIMEOUT_MS: u64 = 10_000;
pub const INVOKE_TIMEOUT_MS: u64 = 30_000;
pub const HEALTH_TIMEOUT_MS: u64 = 3_000;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PluginRpcMethod {
    Load,
    Unload,
    Invoke,
    Health,
    ListLoaded,
    Reload,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub struct PluginRpcRequest {
    pub request_id: String,
    pub trace_id: String,
    pub team_id: String,
    pub app_id: Option<String>,
    pub plugin_id: String,
    pub plugin_version: String,
    pub timeout_ms: u64,
    pub caller_context: Value,
    pub method: PluginRpcMethod,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub struct PluginRpcResponse {
    pub ok: bool,
    pub payload: Value,
    pub error: Option<PluginRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub struct PluginRpcError {
    pub code: PluginRpcErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq, Eq)]
pub enum PluginRpcErrorCode {
    InvalidManifest,
    IncompatibleHost,
    LoadFailed,
    InvokeTimeout,
    PermissionDenied,
    Unhealthy,
    InternalPanic,
}

impl PluginRpcErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::InvalidManifest => "INVALID_MANIFEST",
            Self::IncompatibleHost => "INCOMPATIBLE_HOST",
            Self::LoadFailed => "LOAD_FAILED",
            Self::InvokeTimeout => "INVOKE_TIMEOUT",
            Self::PermissionDenied => "PERMISSION_DENIED",
            Self::Unhealthy => "UNHEALTHY",
            Self::InternalPanic => "INTERNAL_PANIC",
        }
    }
}
```

Update `crates/plugin-framework/src/lib.rs`:

```rust
pub mod error;
pub mod lifecycle;
pub mod manifest;
pub mod registry;
pub mod rpc;
pub mod schema;

pub use error::PluginFrameworkError;
pub use lifecycle::{PluginLifecycleState, PluginRiskApproval};
pub use manifest::{PluginManifest, PluginSourceLevel, RuntimeMode};
pub use rpc::{
    PluginRpcErrorCode, PluginRpcMethod, PluginRpcRequest, PluginRpcResponse,
    HEALTH_TIMEOUT_MS, INVOKE_TIMEOUT_MS, LOAD_TIMEOUT_MS,
};
pub use schema::{IoSchema, PluginSchemas};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p plugin-framework --test rpc_contract`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/plugin-framework/src/lib.rs crates/plugin-framework/src/rpc.rs crates/plugin-framework/tests/rpc_contract.rs
git commit -m "feat: add plugin runner rpc contract"
```

### Task 5: Add Installation Registry And Team/App Scope Assignment

**Files:**
- Modify: `crates/plugin-framework/src/registry.rs`
- Modify: `crates/plugin-framework/src/lib.rs`
- Test: `crates/plugin-framework/tests/registry_scope.rs`

- [ ] **Step 1: Write the failing test**

Create `crates/plugin-framework/tests/registry_scope.rs`:

```rust
use plugin_framework::lifecycle::PluginLifecycleState;
use plugin_framework::manifest::PluginSourceLevel;
use plugin_framework::registry::{
    InstalledPluginRecord, PluginAssignment, PluginAssignmentScope,
};

#[test]
fn team_installed_plugin_can_be_assigned_to_single_app() {
    let record = InstalledPluginRecord {
        team_id: "team-1".to_string(),
        plugin_id: "provider.openai".to_string(),
        version: "0.1.0".to_string(),
        source_level: PluginSourceLevel::OfficialWhitelist,
        has_wasm: false,
        state: PluginLifecycleState::Active,
    };

    let assignment = PluginAssignment::app("app-1", &record);

    assert_eq!(assignment.scope, PluginAssignmentScope::App);
    assert_eq!(assignment.app_id.as_deref(), Some("app-1"));
}

#[test]
fn active_references_block_uninstall() {
    let record = InstalledPluginRecord {
        team_id: "team-1".to_string(),
        plugin_id: "provider.openai".to_string(),
        version: "0.1.0".to_string(),
        source_level: PluginSourceLevel::OfficialWhitelist,
        has_wasm: false,
        state: PluginLifecycleState::Disabled,
    };

    let references = vec!["flow.node.provider".to_string()];
    let error = record.assert_can_remove(&references).unwrap_err();

    assert!(error.to_string().contains("still referenced"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p plugin-framework team_installed_plugin_can_be_assigned_to_single_app -- --exact`

Expected: FAIL with missing registry models.

- [ ] **Step 3: Write minimal implementation**

Replace `crates/plugin-framework/src/registry.rs` with:

```rust
use crate::lifecycle::PluginLifecycleState;
use crate::manifest::PluginSourceLevel;
use crate::PluginFrameworkError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstalledPluginRecord {
    pub team_id: String,
    pub plugin_id: String,
    pub version: String,
    pub source_level: PluginSourceLevel,
    pub has_wasm: bool,
    pub state: PluginLifecycleState,
}

impl InstalledPluginRecord {
    pub fn assert_can_remove(&self, references: &[String]) -> Result<(), PluginFrameworkError> {
        if references.is_empty() {
            return Ok(());
        }

        Err(PluginFrameworkError::Registry(format!(
            "plugin {}:{} is still referenced by {} consumer(s)",
            self.plugin_id,
            self.version,
            references.len()
        )))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginAssignmentScope {
    Team,
    App,
    GlobalAccept,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginAssignment {
    pub team_id: String,
    pub plugin_id: String,
    pub version: String,
    pub scope: PluginAssignmentScope,
    pub app_id: Option<String>,
}

impl PluginAssignment {
    pub fn app(app_id: &str, record: &InstalledPluginRecord) -> Self {
        Self {
            team_id: record.team_id.clone(),
            plugin_id: record.plugin_id.clone(),
            version: record.version.clone(),
            scope: PluginAssignmentScope::App,
            app_id: Some(app_id.to_string()),
        }
    }

    pub fn team(record: &InstalledPluginRecord) -> Self {
        Self {
            team_id: record.team_id.clone(),
            plugin_id: record.plugin_id.clone(),
            version: record.version.clone(),
            scope: PluginAssignmentScope::Team,
            app_id: None,
        }
    }

    pub fn global_accept(record: &InstalledPluginRecord) -> Self {
        Self {
            team_id: record.team_id.clone(),
            plugin_id: record.plugin_id.clone(),
            version: record.version.clone(),
            scope: PluginAssignmentScope::GlobalAccept,
            app_id: None,
        }
    }
}
```

Update `crates/plugin-framework/src/lib.rs`:

```rust
pub mod error;
pub mod lifecycle;
pub mod manifest;
pub mod registry;
pub mod rpc;
pub mod schema;

pub use error::PluginFrameworkError;
pub use lifecycle::{PluginLifecycleState, PluginRiskApproval};
pub use manifest::{PluginManifest, PluginSourceLevel, RuntimeMode};
pub use registry::{InstalledPluginRecord, PluginAssignment, PluginAssignmentScope};
pub use rpc::{
    PluginRpcErrorCode, PluginRpcMethod, PluginRpcRequest, PluginRpcResponse,
    HEALTH_TIMEOUT_MS, INVOKE_TIMEOUT_MS, LOAD_TIMEOUT_MS,
};
pub use schema::{IoSchema, PluginSchemas};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p plugin-framework --test registry_scope`

Expected: PASS

- [ ] **Step 5: Run the package test suite and commit**

Run: `cargo test -p plugin-framework`

Expected: PASS

Commit:

```bash
git add crates/plugin-framework/src/lib.rs crates/plugin-framework/src/registry.rs crates/plugin-framework/tests/registry_scope.rs
git commit -m "feat: add plugin registry scope models"
```

## Follow-Up Plans

After this plan lands, write and execute these follow-up plans in order:

1. `2026-04-10-plugin-framework-control-plane.md`
   - Plugin install task API
   - Enable/disable/upgrade endpoints
   - Team/app assignment API
   - Risk confirmation and audit trail
2. `2026-04-10-plugin-framework-runtime-integration.md`
   - `runtime-worker` consumption of provider/node/data-source plugins
   - `publish-gateway` consumption of publish adapter plugins
   - `plugin-runner` process bootstrap and local RPC client

## Self-Review

- Spec coverage: this plan covers `08` 当前已定稿中的统一包结构、`manifest/schema`、生命周期状态、风险来源启用规则、本机 RPC 契约、团队级安装与应用级分配、卸载引用保护。控制面 API、审计落库、运行时实际插件调用被明确留给后续两份计划，没有遗漏但刻意拆开。
- Placeholder scan: no `TODO` / `TBD` placeholders remain; every task包含明确文件、测试、命令和提交点。
- Type consistency: `PluginSourceLevel`、`RuntimeMode`、`PluginLifecycleState`、`PluginRpcMethod`、`PluginAssignmentScope` 在任务间名称保持一致，后续任务直接复用前序定义。
