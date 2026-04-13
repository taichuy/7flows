# Backend QA Access Control Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the current access-control gaps by enforcing `state_model` visibility on model-definition detail reads and by landing `state_data` own/all authorization in the runtime CRUD path.

**Architecture:** Keep the existing static permission catalog and current `api-server -> control-plane -> runtime-core -> storage-pg` layering. Repair `state_model` in `control-plane` with an explicit shared-resource permission helper, then move `state_data` authorization into `runtime-core` and `storage-pg` so runtime routes stop relying on “has session” as implicit approval.

**Tech Stack:** Rust stable, Axum, SQLx/PostgreSQL, utoipa, serde_json

**Source Spec:** `docs/superpowers/specs/1flowse/2026-04-13-backend-qa-remediation-design.md`

**Approval:** User approved splitting the remediation work into multiple backend plans on `2026-04-13 14`, with this file covering topic A from the spec.

---

## Scope Notes

- This plan only covers topic A from the remediation design: permission and access-control closure.
- This plan does not move runtime registry refresh out of the route layer. That work belongs to topic D.
- This plan does not do the final OpenAPI cleanup. That work belongs to topic C.

## File Structure

**Create**
- `api/crates/control-plane/src/_tests/model_definition_acl_tests.rs`
- `api/crates/runtime-core/src/runtime_acl.rs`
- `api/crates/runtime-core/src/_tests/runtime_acl_tests.rs`

**Modify**
- `api/crates/control-plane/src/model_definition.rs`
- `api/crates/control-plane/src/_tests/mod.rs`
- `api/crates/runtime-core/src/lib.rs`
- `api/crates/runtime-core/src/runtime_engine.rs`
- `api/crates/runtime-core/src/runtime_record_repository.rs`
- `api/crates/runtime-core/src/_tests/mod.rs`
- `api/crates/runtime-core/src/_tests/runtime_engine_tests.rs`
- `api/crates/storage-pg/src/runtime_record_repository.rs`
- `api/crates/storage-pg/src/_tests/runtime_record_repository_tests.rs`
- `api/apps/api-server/src/routes/model_definitions.rs`
- `api/apps/api-server/src/routes/runtime_models.rs`
- `api/apps/api-server/src/_tests/model_definition_routes.rs`
- `api/apps/api-server/src/_tests/runtime_model_routes.rs`

### Task 1: Repair `state_model` Visibility On Detail Reads

**Files:**
- Create: `api/crates/control-plane/src/_tests/model_definition_acl_tests.rs`
- Modify: `api/crates/control-plane/src/model_definition.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`
- Modify: `api/apps/api-server/src/routes/model_definitions.rs`
- Modify: `api/apps/api-server/src/_tests/model_definition_routes.rs`

- [x] **Step 1: Add failing tests for model-definition detail authorization**

Create `api/crates/control-plane/src/_tests/model_definition_acl_tests.rs` with focused tests for:

```rust
#[tokio::test]
async fn get_model_requires_state_model_visibility() {}

#[tokio::test]
async fn state_model_own_is_treated_as_scope_shared_read() {}
```

Extend `api/apps/api-server/src/_tests/model_definition_routes.rs` with a route regression that:

- creates a team-scoped model as `root`;
- logs in as a non-root actor that only has `state_model.view.own`;
- verifies `GET /api/console/models/{id}` returns `200 OK`;
- verifies a user without `state_model.view.own` or `.all` receives `403`.

- [x] **Step 2: Run the focused failures**

Run: `cargo test -p control-plane get_model_requires_state_model_visibility -- --exact`

Expected: FAIL because `ModelDefinitionService::get_model` currently skips any permission check.

Run: `cargo test -p api-server model_definition_routes_require_state_model_visibility -- --exact`

Expected: FAIL because the route only requires a valid session and does not pass an actor into the service.

- [x] **Step 3: Implement explicit shared-resource state-model checks**

In `api/crates/control-plane/src/model_definition.rs`, change the read path from:

```rust
pub async fn get_model(&self, model_id: Uuid) -> Result<ModelDefinitionRecord>
```

to:

```rust
pub async fn get_model(
    &self,
    actor_user_id: Uuid,
    model_id: Uuid,
) -> Result<ModelDefinitionRecord>
```

Add a helper with the actual first-phase semantics from the spec:

```rust
fn ensure_state_model_permission(
    actor: &domain::ActorContext,
    action: &str,
) -> Result<(), ControlPlaneError> {
    if actor.is_root
        || actor.has_permission(&format!("state_model.{action}.all"))
        || actor.has_permission(&format!("state_model.{action}.own"))
    {
        return Ok(());
    }

    Err(ControlPlaneError::PermissionDenied("permission_denied"))
}
```

Use that helper for:

- `get_model` with `action = "view"`;
- `list_models` with `action = "view"`;
- `update_model`, `add_field`, `update_field`, `delete_model`, `delete_field` with `action = "manage"`.

Update `api/apps/api-server/src/routes/model_definitions.rs` so `get_model` passes `context.user.id` into the service instead of calling a permission-free lookup.

- [x] **Step 4: Re-run the model-definition ACL tests**

Run: `cargo test -p control-plane state_model_own_is_treated_as_scope_shared_read -- --exact`

Expected: PASS

Run: `cargo test -p api-server model_definition_routes_require_state_model_visibility -- --exact`

Expected: PASS

- [x] **Step 5: Commit the `state_model` repair**

```bash
git add api/crates/control-plane/src/model_definition.rs api/crates/control-plane/src/_tests/mod.rs api/crates/control-plane/src/_tests/model_definition_acl_tests.rs api/apps/api-server/src/routes/model_definitions.rs api/apps/api-server/src/_tests/model_definition_routes.rs
git commit -m "fix: enforce state model visibility on detail reads"
```

Execution note (`2026-04-13 16`):
- Red phase used full unit-test paths with `--exact`, for example `cargo test -p control-plane --lib _tests::model_definition_acl_tests::get_model_requires_state_model_visibility -- --exact`, because bare function names would not match src unit tests.
- The control-plane red failure first surfaced as a signature mismatch because the approved fix requires `get_model` to accept `actor_user_id`; after implementing that interface, `cargo test -p control-plane --lib model_definition_acl_tests -- --nocapture` passed.
- The route red failure matched the intended gap: `cargo test -p api-server --lib _tests::model_definition_routes::model_definition_routes_require_state_model_visibility -- --exact` returned `200` for an unprivileged user before the fix, and passed after the route forwarded `context.user.id`.

### Task 2: Land `state_data` Own/All Authorization In Runtime CRUD

**Files:**
- Create: `api/crates/runtime-core/src/runtime_acl.rs`
- Create: `api/crates/runtime-core/src/_tests/runtime_acl_tests.rs`
- Modify: `api/crates/runtime-core/src/lib.rs`
- Modify: `api/crates/runtime-core/src/runtime_engine.rs`
- Modify: `api/crates/runtime-core/src/runtime_record_repository.rs`
- Modify: `api/crates/runtime-core/src/_tests/mod.rs`
- Modify: `api/crates/runtime-core/src/_tests/runtime_engine_tests.rs`
- Modify: `api/crates/storage-pg/src/runtime_record_repository.rs`
- Modify: `api/crates/storage-pg/src/_tests/runtime_record_repository_tests.rs`
- Modify: `api/apps/api-server/src/routes/runtime_models.rs`
- Modify: `api/apps/api-server/src/_tests/runtime_model_routes.rs`

- [x] **Step 1: Add failing ACL tests in runtime-core and storage-pg**

Create `api/crates/runtime-core/src/_tests/runtime_acl_tests.rs` with targeted coverage for:

```rust
#[tokio::test]
async fn state_data_view_own_filters_list_by_created_by() {}

#[tokio::test]
async fn state_data_edit_own_rejects_updating_another_users_record() {}

#[tokio::test]
async fn state_data_delete_all_allows_cross_owner_delete() {}
```

Extend `api/crates/storage-pg/src/_tests/runtime_record_repository_tests.rs` with two SQL-backed regressions:

- own-scope list/get/update/delete only sees rows where `created_by = actor_user_id`;
- all-scope list/get/update/delete reaches any row in the same runtime scope.

Add one route-level regression in `api/apps/api-server/src/_tests/runtime_model_routes.rs` for a manager/admin/root matrix on the same model code.

- [x] **Step 2: Run the focused failures**

Run: `cargo test -p runtime-core state_data_view_own_filters_list_by_created_by -- --exact`

Expected: FAIL because `RuntimeEngine` currently receives only `actor_user_id` and never checks permission codes.

Run: `cargo test -p storage-pg runtime_record_repository_enforces_owner_scope -- --exact`

Expected: FAIL because the repository only filters by runtime scope, never by `created_by`.

- [x] **Step 3: Implement runtime ACL evaluation and owner-aware repository calls**

Create `api/crates/runtime-core/src/runtime_acl.rs` with explicit first-phase rules:

```rust
pub enum RuntimeDataAction {
    View,
    Create,
    Edit,
    Delete,
}

pub struct RuntimeAccessScope {
    pub owner_user_id: Option<uuid::Uuid>,
}
```

Keep the rules aligned to the spec:

- `state_data.create.all` is required for create;
- `view/edit/delete/manage.own` means `created_by == actor.user_id`;
- `view/edit/delete/manage.all` means same runtime scope, regardless of creator;
- `root` short-circuits all runtime ACL checks.

Refactor `api/crates/runtime-core/src/runtime_engine.rs` so every input carries `domain::ActorContext`:

```rust
pub struct RuntimeListInput {
    pub actor: domain::ActorContext,
    pub app_id: Option<Uuid>,
    pub model_code: String,
    ...
}
```

Update `api/crates/runtime-core/src/runtime_record_repository.rs` so runtime-core can pass owner scope down to the repository instead of post-filtering after SQL fetch:

```rust
pub struct RuntimeListQuery {
    pub scope_id: Uuid,
    pub owner_user_id: Option<Uuid>,
    ...
}
```

Apply the same idea to `get_record`, `update_record`, and `delete_record` by adding an `owner_user_id: Option<Uuid>` argument. In `api/crates/storage-pg/src/runtime_record_repository.rs`, append:

```sql
and created_by = $n
```

whenever the request is running in own-scope mode.

Update `api/apps/api-server/src/routes/runtime_models.rs` so every runtime call passes `context.actor.clone()` into the engine instead of only `context.user.id` and `context.actor.team_id`.

- [x] **Step 4: Re-run the runtime ACL regressions**

Run: `cargo test -p runtime-core runtime_acl -- --nocapture`

Expected: PASS

Run: `cargo test -p storage-pg runtime_record_repository_supports_crud_filter_sort_and_relation_expansion -- --exact`

Expected: PASS with the new ACL-aware repository signature updated.

Run: `cargo test -p api-server runtime_model_routes_enforce_state_data_acl -- --exact`

Expected: PASS

- [x] **Step 5: Commit the runtime ACL slice**

```bash
git add api/crates/runtime-core/src/lib.rs api/crates/runtime-core/src/runtime_acl.rs api/crates/runtime-core/src/runtime_engine.rs api/crates/runtime-core/src/runtime_record_repository.rs api/crates/runtime-core/src/_tests/mod.rs api/crates/runtime-core/src/_tests/runtime_acl_tests.rs api/crates/runtime-core/src/_tests/runtime_engine_tests.rs api/crates/storage-pg/src/runtime_record_repository.rs api/crates/storage-pg/src/_tests/runtime_record_repository_tests.rs api/apps/api-server/src/routes/runtime_models.rs api/apps/api-server/src/_tests/runtime_model_routes.rs
git commit -m "fix: enforce state data own all authorization"
```

Execution note (`2026-04-13 16`):
- Red phase confirmed the intended interface gap: `runtime-core` tests failed because `Runtime*Input` still only accepted `actor_user_id/team_id`, and `storage-pg` tests failed because `RuntimeListQuery` and repository methods still lacked `owner_user_id`.
- The route regression failed on the expected behavior gap: `cargo test -p api-server --lib _tests::runtime_model_routes::runtime_model_routes_enforce_state_data_acl -- --exact` initially returned `total = 3` for the manager list instead of `1`.
- Green verification used:
  - `cargo test -p runtime-core runtime_acl -- --nocapture`
  - `cargo test -p storage-pg --lib _tests::runtime_record_repository_tests::runtime_record_repository_enforces_owner_scope -- --exact`
  - `cargo test -p storage-pg --lib _tests::runtime_record_repository_tests::runtime_record_repository_supports_crud_filter_sort_and_relation_expansion -- --exact`
  - `cargo test -p api-server --lib _tests::runtime_model_routes::runtime_model_routes_enforce_state_data_acl -- --exact`
- During implementation, two non-design issues were corrected before green runs:
  - `RuntimeEngine::for_tests()` only registers metadata for `team_id = nil`, so the new runtime-core ACL tests were aligned to that scope.
  - The in-memory repository needed to serialize `created_by` as a string `Uuid`, not attempt `serde_json::Value::from(Uuid)`.

### Task 3: Run The Topic-A Verification Sweep

**Files:**
- Test: `api/crates/control-plane/src/_tests/model_definition_acl_tests.rs`
- Test: `api/crates/runtime-core/src/_tests/runtime_acl_tests.rs`
- Test: `api/crates/storage-pg/src/_tests/runtime_record_repository_tests.rs`
- Test: `api/apps/api-server/src/_tests/model_definition_routes.rs`
- Test: `api/apps/api-server/src/_tests/runtime_model_routes.rs`

- [ ] **Step 1: Run the control-plane access-control regressions**

Run: `cargo test -p control-plane model_definition_acl -- --nocapture`

Expected: PASS

- [ ] **Step 2: Run the runtime-core and storage-pg regressions**

Run: `cargo test -p runtime-core runtime_acl -- --nocapture`

Expected: PASS

Run: `cargo test -p storage-pg runtime_record_repository -- --nocapture`

Expected: PASS

- [ ] **Step 3: Run the api-server access-control regressions**

Run: `cargo test -p api-server model_definition_routes_require_state_model_visibility -- --exact`

Expected: PASS

Run: `cargo test -p api-server runtime_model_routes_enforce_state_data_acl -- --exact`

Expected: PASS

- [ ] **Step 4: Run the unified backend verification**

Run: `node scripts/node/verify-backend.js`

Expected: PASS

- [ ] **Step 5: Commit the verified topic-A batch**

```bash
git add .
git commit -m "test: verify backend qa access control closure"
```

Plan complete and saved to `docs/superpowers/plans/2026-04-13-backend-qa-access-control-closure.md`.
