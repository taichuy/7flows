# Capability Plugin Process Per Call Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute third-party `CapabilityPlugin` nodes out of process through `plugin-runner`, starting with `process_per_call` for `validate_config`, `resolve_dynamic_options`, `resolve_output_schema`, and `execute`.

**Architecture:** Reuse `plugin-runner` as the only out-of-process executor. `plugin-framework` already owns package metadata and manifest parsing; this plan adds a capability runtime adapter in `plugin-runner`, a control-plane port for capability invocation, and worker lease snapshots in PostgreSQL so orchestration can call plugin-contributed nodes without moving third-party code into the host process. The orchestration engine resolves contributed nodes by `contribution_code`, checks dependency status, then shells out per request and lets the operating system reclaim resources at the end of each call.

**Tech Stack:** Rust (`plugin-runner`, `control-plane`, `orchestration-runtime`, `storage-pg`, `api-server`), PostgreSQL migrations with `sqlx`, targeted `cargo test`.

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-20-plugin-architecture-and-node-contribution-design.md`, `docs/superpowers/specs/1flowbase/modules/08-plugin-framework/README.md`

---

## File Structure

**Create**
- `api/crates/domain/src/plugin_worker.rs`
- `api/crates/control-plane/src/capability_plugin_runtime.rs`
- `api/crates/control-plane/src/_tests/capability_plugin_runtime_tests.rs`
- `api/crates/storage-pg/migrations/20260421123000_create_plugin_worker_lease_tables.sql`
- `api/crates/storage-pg/src/plugin_worker_repository.rs`
- `api/crates/storage-pg/src/_tests/plugin_worker_repository_tests.rs`
- `api/apps/plugin-runner/src/capability_host.rs`
- `api/apps/plugin-runner/src/capability_stdio.rs`
- `api/apps/plugin-runner/tests/capability_runtime_routes.rs`

**Modify**
- `api/crates/domain/src/lib.rs`
- `api/crates/control-plane/src/lib.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/orchestration_runtime.rs`
- `api/crates/orchestration-runtime/src/compiler.rs`
- `api/crates/orchestration-runtime/src/compiled_plan.rs`
- `api/crates/orchestration-runtime/src/execution_engine.rs`
- `api/apps/plugin-runner/src/lib.rs`
- `api/apps/plugin-runner/src/package_loader.rs`
- `api/apps/api-server/src/provider_runtime.rs`
- `api/apps/api-server/src/lib.rs`

**Notes**
- This plan depends on `2026-04-21-plugin-manifest-v1-and-package-contract.md`.
- It also depends on `2026-04-21-node-contribution-registry-and-block-selector.md` because execution resolves by contribution identity, not by the old built-in `node_type` enum alone.
- `warm_worker` remains out of scope; worker leases are still useful as observable runtime snapshots even when every request runs its own process.

### Task 1: Add Capability Runtime Contracts And Worker Lease Storage

**Files:**
- Create: `api/crates/domain/src/plugin_worker.rs`
- Create: `api/crates/control-plane/src/capability_plugin_runtime.rs`
- Create: `api/crates/control-plane/src/_tests/capability_plugin_runtime_tests.rs`
- Create: `api/crates/storage-pg/migrations/20260421123000_create_plugin_worker_lease_tables.sql`
- Create: `api/crates/storage-pg/src/plugin_worker_repository.rs`
- Create: `api/crates/storage-pg/src/_tests/plugin_worker_repository_tests.rs`
- Modify: `api/crates/domain/src/lib.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports.rs`

- [x] **Step 1: Write failing tests for worker leases and capability invocations**

Add tests like:

```rust
#[tokio::test]
async fn plugin_worker_repository_tracks_process_per_call_worker_lifecycle() {
    let lease = repository
        .create_worker_lease(&CreatePluginWorkerLeaseInput {
            installation_id,
            worker_key: "capability:openai_prompt".into(),
            status: PluginWorkerStatus::Starting,
        })
        .await
        .unwrap();

    assert_eq!(lease.status, PluginWorkerStatus::Starting);
}

#[tokio::test]
async fn capability_runtime_port_returns_execute_payload() {
    let result = runtime
        .execute_node(ExecuteCapabilityNodeInput {
            installation_id,
            contribution_code: "openai_prompt".into(),
            config_payload: json!({ "prompt": "hello" }),
            input_payload: json!({ "query": "hi" }),
        })
        .await
        .unwrap();

    assert_eq!(result.output_payload["answer"], "hi");
}
```

- [x] **Step 2: Run RED verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-pg plugin_worker_repository -- --nocapture
cargo test --manifest-path api/Cargo.toml -p control-plane capability_plugin_runtime -- --nocapture
```

Expected:

- FAIL because there is no worker lease table and no capability runtime port yet.

- [x] **Step 3: Implement worker snapshots and runtime port contracts**

Create the migration:

```sql
create table plugin_worker_leases (
    id uuid primary key,
    installation_id uuid not null references plugin_installations(id) on delete cascade,
    worker_key text not null,
    status text not null,
    runtime_scope jsonb not null default '{}'::jsonb,
    last_heartbeat_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

And define:

```rust
pub enum PluginWorkerStatus {
    Unloaded,
    Starting,
    Idle,
    Busy,
    Recycled,
    Crashed,
}

#[async_trait]
pub trait CapabilityPluginRuntimePort: Send + Sync {
    async fn validate_config(&self, input: ValidateCapabilityConfigInput) -> anyhow::Result<Value>;
    async fn resolve_dynamic_options(&self, input: ResolveCapabilityOptionsInput) -> anyhow::Result<Value>;
    async fn resolve_output_schema(&self, input: ResolveCapabilityOutputSchemaInput) -> anyhow::Result<Value>;
    async fn execute_node(&self, input: ExecuteCapabilityNodeInput) -> anyhow::Result<CapabilityExecutionOutput>;
}
```

- [x] **Step 4: Re-run the backend tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-pg plugin_worker_repository -- --nocapture
cargo test --manifest-path api/Cargo.toml -p control-plane capability_plugin_runtime -- --nocapture
```

Expected:

- PASS with persistent worker lease snapshots and a capability runtime port available to orchestration.

- [x] **Step 5: Commit the runtime contracts**

```bash
git add api/crates/domain/src/lib.rs api/crates/domain/src/plugin_worker.rs api/crates/control-plane/src/lib.rs api/crates/control-plane/src/ports.rs api/crates/control-plane/src/capability_plugin_runtime.rs api/crates/control-plane/src/_tests/capability_plugin_runtime_tests.rs api/crates/storage-pg/migrations/20260421123000_create_plugin_worker_lease_tables.sql api/crates/storage-pg/src/plugin_worker_repository.rs api/crates/storage-pg/src/_tests/plugin_worker_repository_tests.rs
git commit -m "feat: add capability plugin runtime contracts"
```

### Task 2: Teach Plugin Runner To Execute Capability Plugins

**Files:**
- Create: `api/apps/plugin-runner/src/capability_host.rs`
- Create: `api/apps/plugin-runner/src/capability_stdio.rs`
- Create: `api/apps/plugin-runner/tests/capability_runtime_routes.rs`
- Modify: `api/apps/plugin-runner/src/lib.rs`
- Modify: `api/apps/plugin-runner/src/package_loader.rs`

- [ ] **Step 1: Write failing plugin-runner route tests**

Add tests like:

```rust
#[tokio::test]
async fn execute_capability_route_runs_process_per_call_plugin() {
    let response = app
        .oneshot(post_json(
            "/capabilities/execute",
            json!({
                "plugin_id": "prompt_pack@0.1.0",
                "contribution_code": "openai_prompt",
                "config_payload": { "template": "Hello {{query}}" },
                "input_payload": { "query": "world" }
            }),
        ))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-runner capability_runtime_routes -- --nocapture
```

Expected:

- FAIL because `plugin-runner` only exposes provider routes today.

- [ ] **Step 3: Implement capability runtime endpoints**

Add a host like:

```rust
pub struct CapabilityHost {
    loaded_packages: HashMap<String, LoadedCapabilityPackage>,
}

impl CapabilityHost {
    pub async fn execute(
        &self,
        plugin_id: &str,
        contribution_code: &str,
        config_payload: Value,
        input_payload: Value,
    ) -> FrameworkResult<CapabilityExecutionOutput> {
        let loaded = self.loaded_package(plugin_id)?;
        call_capability_executable(
            &loaded.runtime_executable,
            contribution_code,
            config_payload,
            input_payload,
            &loaded.package.manifest.runtime.limits,
        )
        .await
    }
}
```

And wire routes:

```rust
.route("/capabilities/validate-config", post(validate_capability_config))
.route("/capabilities/resolve-dynamic-options", post(resolve_dynamic_options))
.route("/capabilities/resolve-output-schema", post(resolve_output_schema))
.route("/capabilities/execute", post(execute_capability))
```

- [ ] **Step 4: Re-run the plugin-runner tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-runner capability_runtime_routes -- --nocapture
```

Expected:

- PASS with `plugin-runner` able to load capability packages and execute them per request.

- [ ] **Step 5: Commit the plugin-runner path**

```bash
git add api/apps/plugin-runner/src/lib.rs api/apps/plugin-runner/src/package_loader.rs api/apps/plugin-runner/src/capability_host.rs api/apps/plugin-runner/src/capability_stdio.rs api/apps/plugin-runner/tests/capability_runtime_routes.rs
git commit -m "feat: add capability plugin runner endpoints"
```

### Task 3: Wire Orchestration To Execute Plugin-contributed Nodes

**Files:**
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`
- Modify: `api/crates/orchestration-runtime/src/compiler.rs`
- Modify: `api/crates/orchestration-runtime/src/compiled_plan.rs`
- Modify: `api/crates/orchestration-runtime/src/execution_engine.rs`
- Modify: `api/apps/api-server/src/provider_runtime.rs`
- Modify: `api/apps/api-server/src/lib.rs`

- [ ] **Step 1: Write failing orchestration tests for plugin nodes**

Add cases like:

```rust
#[tokio::test]
async fn execution_engine_routes_plugin_node_to_capability_runtime() {
    let outcome = run_debug_flow(document_with_plugin_node()).await.unwrap();

    assert_eq!(outcome.node_runs[1].node_type, "plugin_node");
    assert_eq!(outcome.node_runs[1].output_payload["answer"], "world");
}
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p orchestration-runtime execution_engine -- --nocapture
cargo test --manifest-path api/Cargo.toml -p control-plane orchestration_runtime -- --nocapture
```

Expected:

- FAIL because the compiler and runtime only understand built-in node execution branches.

- [ ] **Step 3: Extend compiled-plan and execution dispatch**

Introduce a compiled node reference shaped like:

```rust
pub struct CompiledPluginNodeRef {
    pub plugin_id: String,
    pub plugin_version: String,
    pub contribution_code: String,
    pub node_shell: String,
}
```

And dispatch plugin nodes in the execution engine:

```rust
match node.node_type.as_str() {
    "plugin_node" => execute_capability_plugin_node(node, state, invoker).await,
    "llm" => execute_llm_node(node, state, invoker).await,
    ...
}
```

- [ ] **Step 4: Re-run orchestration verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p orchestration-runtime execution_engine -- --nocapture
cargo test --manifest-path api/Cargo.toml -p control-plane orchestration_runtime -- --nocapture
git diff --check
```

Expected:

- PASS with plugin-contributed action nodes executing through `CapabilityPluginRuntimePort` and recording worker lease snapshots.

- [ ] **Step 5: Commit the orchestration execute path**

```bash
git add api/crates/control-plane/src/orchestration_runtime.rs api/crates/orchestration-runtime/src/compiler.rs api/crates/orchestration-runtime/src/compiled_plan.rs api/crates/orchestration-runtime/src/execution_engine.rs api/apps/api-server/src/provider_runtime.rs api/apps/api-server/src/lib.rs
git commit -m "feat: execute capability plugin nodes out of process"
```

## Self-Review

- Spec coverage: this plan covers `process_per_call`, `plugin_worker_lease`, capability-runtime methods, and orchestration dispatch for third-party action nodes.
- Placeholder scan: concrete runtime endpoints, tables, and compiled-plan fields are all named.
- Type consistency: later tasks keep `CapabilityPluginRuntimePort`, `PluginWorkerStatus`, `contribution_code`, and `plugin_node` naming stable.
