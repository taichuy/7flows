# Backend QA Runtime Registry Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `runtime registry` rebuild side effects from the HTTP route layer and move model-definition mutation orchestration into an application-layer entry that works for route and non-route callers alike.

**Architecture:** Keep `api-server` as the composition root, but introduce an explicit registry-sync port in `control-plane`. Model-definition mutation methods become orchestration entry points that mutate metadata first and then request a full registry rebuild through an injected adapter implemented by `api-server`.

**Tech Stack:** Rust stable, Axum, SQLx/PostgreSQL, runtime-core

**Source Spec:** `docs/superpowers/specs/1flowse/2026-04-13-backend-qa-remediation-design.md`

**Approval:** User approved splitting the remediation work into multiple backend plans on `2026-04-13 14`, with this file covering topic D from the spec.

---

## Scope Notes

- This plan only covers registry-refresh entry-point closure.
- Keep the refresh strategy as full `rebuild`. Do not introduce incremental upsert/remove in this phase.
- This plan may touch the same model-definition files as topic A, but it should not change ACL semantics.

## File Structure

**Create**
- `api/crates/control-plane/src/runtime_registry_sync.rs`
- `api/crates/control-plane/src/_tests/model_definition_runtime_sync_tests.rs`
- `api/apps/api-server/src/runtime_registry_sync.rs`

**Modify**
- `api/crates/control-plane/src/lib.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/model_definition.rs`
- `api/crates/control-plane/src/_tests/mod.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/routes/model_definitions.rs`
- `api/apps/api-server/src/_tests/model_definition_routes.rs`
- `api/apps/api-server/src/_tests/support.rs`

### Task 1: Add A Registry-Sync Port In `control-plane`

**Files:**
- Create: `api/crates/control-plane/src/runtime_registry_sync.rs`
- Create: `api/crates/control-plane/src/_tests/model_definition_runtime_sync_tests.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/control-plane/src/model_definition.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`

- [ ] **Step 1: Add failing orchestration tests**

Create `api/crates/control-plane/src/_tests/model_definition_runtime_sync_tests.rs` with in-memory doubles and focused coverage for:

```rust
#[tokio::test]
async fn create_model_rebuilds_runtime_registry_once() {}

#[tokio::test]
async fn add_field_rebuilds_runtime_registry_once() {}

#[tokio::test]
async fn delete_model_rebuilds_runtime_registry_once() {}
```

The test double should count calls to a new sync port rather than asserting on HTTP behavior.

- [ ] **Step 2: Run the focused failures**

Run: `cargo test -p control-plane create_model_rebuilds_runtime_registry_once -- --exact`

Expected: FAIL because there is no registry-sync port in `control-plane` and no orchestration entry point that owns rebuild side effects.

- [ ] **Step 3: Introduce the sync port and mutation orchestrator**

Add a new port to `api/crates/control-plane/src/ports.rs`:

```rust
#[async_trait]
pub trait RuntimeRegistrySync: Send + Sync {
    async fn rebuild(&self) -> anyhow::Result<()>;
}
```

Create `api/crates/control-plane/src/runtime_registry_sync.rs` and move mutation orchestration there, for example:

```rust
pub struct ModelDefinitionMutationService<R, S> {
    repository: R,
    sync: S,
}
```

Each mutation entry point must:

1. call the existing model-definition service/repository logic;
2. call `sync.rebuild().await?`;
3. return the same payload as before.

Cover:

- `create_model`
- `update_model`
- `add_field`
- `update_field`
- `delete_model`
- `delete_field`

- [ ] **Step 4: Re-run the orchestration tests**

Run: `cargo test -p control-plane model_definition_runtime_sync -- --nocapture`

Expected: PASS

- [ ] **Step 5: Commit the control-plane orchestration slice**

```bash
git add api/crates/control-plane/src/runtime_registry_sync.rs api/crates/control-plane/src/lib.rs api/crates/control-plane/src/ports.rs api/crates/control-plane/src/model_definition.rs api/crates/control-plane/src/_tests/mod.rs api/crates/control-plane/src/_tests/model_definition_runtime_sync_tests.rs
git commit -m "refactor: move runtime registry sync into control plane orchestration"
```

### Task 2: Wire The Api-Server Adapter And Remove Route-Level Rebuilds

**Files:**
- Create: `api/apps/api-server/src/runtime_registry_sync.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/routes/model_definitions.rs`
- Modify: `api/apps/api-server/src/_tests/support.rs`
- Modify: `api/apps/api-server/src/_tests/model_definition_routes.rs`

- [ ] **Step 1: Add a failing route regression**

Extend `api/apps/api-server/src/_tests/model_definition_routes.rs` so a create/update/delete/field-mutation sequence still leaves runtime CRUD immediately usable after the refactor.

Use the existing pattern:

```rust
let model_id = create_model(...).await;
create_field(...).await;
create_runtime_record(...).await;
```

The test should not call any route-local helper; it should only hit HTTP endpoints.

- [ ] **Step 2: Run the focused failure after removing the helper**

Run: `cargo test -p api-server model_definition_routes_manage_models_and_fields_without_publish -- --exact`

Expected: FAIL once the route-local rebuild helper is removed and before the adapter is wired in.

- [ ] **Step 3: Implement the api-server adapter**

Create `api/apps/api-server/src/runtime_registry_sync.rs`:

```rust
#[derive(Clone)]
pub struct ApiRuntimeRegistrySync {
    store: storage_pg::PgControlPlaneStore,
    registry: runtime_core::runtime_model_registry::RuntimeModelRegistry,
}
```

Implement the `control_plane::ports::RuntimeRegistrySync` port by reusing the current full-rebuild logic:

```rust
let metadata = self.store.list_runtime_model_metadata().await?;
self.registry.rebuild(metadata);
```

Then update `api/apps/api-server/src/routes/model_definitions.rs` to:

- delete the local `refresh_runtime_registry` helper;
- instantiate `ModelDefinitionMutationService::new(state.store.clone(), ApiRuntimeRegistrySync::new(...))`;
- call the mutation service for every create/update/delete/field-mutation route.

Keep `list_models` and `get_model` on the read-only service path.

- [ ] **Step 4: Re-run the route regression**

Run: `cargo test -p api-server model_definition_routes_manage_models_and_fields_without_publish -- --exact`

Expected: PASS

- [ ] **Step 5: Commit the api-server adapter slice**

```bash
git add api/apps/api-server/src/runtime_registry_sync.rs api/apps/api-server/src/lib.rs api/apps/api-server/src/routes/model_definitions.rs api/apps/api-server/src/_tests/support.rs api/apps/api-server/src/_tests/model_definition_routes.rs
git commit -m "refactor: remove route level runtime registry rebuilds"
```

### Task 3: Run The Topic-D Verification Sweep

**Files:**
- Test: `api/crates/control-plane/src/_tests/model_definition_runtime_sync_tests.rs`
- Test: `api/apps/api-server/src/_tests/model_definition_routes.rs`
- Test: `api/apps/api-server/src/_tests/runtime_model_routes.rs`

- [ ] **Step 1: Run the control-plane sync-orchestration tests**

Run: `cargo test -p control-plane model_definition_runtime_sync -- --nocapture`

Expected: PASS

- [ ] **Step 2: Run the api-server model and runtime regressions**

Run: `cargo test -p api-server model_definition_routes_manage_models_and_fields_without_publish -- --exact --nocapture`

Expected: PASS

Run: `cargo test -p api-server runtime_model_routes_create_fetch_update_delete_and_filter_records -- --exact --nocapture`

Expected: PASS

- [ ] **Step 3: Run the unified backend verification**

Run: `node scripts/node/verify-backend.js`

Expected: PASS

- [ ] **Step 4: Confirm route layer no longer rebuilds the registry directly**

Run: `rg -n "registry\\(\\)\\.rebuild|runtime_registry\\.rebuild" api/apps/api-server/src/routes`

Expected: no matches under `api/apps/api-server/src/routes`.

- [ ] **Step 5: Commit the verified topic-D batch**

```bash
git add .
git commit -m "test: verify backend runtime registry closure"
```

Plan complete and saved to `docs/superpowers/plans/2026-04-13-backend-qa-runtime-registry-closure.md`.
