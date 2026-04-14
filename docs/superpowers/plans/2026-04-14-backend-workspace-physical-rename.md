# Backend Workspace Physical Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every active backend `team/app` naming surface with final `workspace/system` semantics, including static control-plane tables, runtime metadata, routes, OpenAPI, permission codes, env vars, tests, and verification gates, without keeping any compatibility alias.

**Architecture:** Execute the rename in five slices that keep the repository understandable while allowing the baseline schema to be rewritten. First, rename the static control-plane foundation (`Team*`, `teams`, `team_id`, `BOOTSTRAP_TEAM_NAME`) to `Workspace*` and `workspace_id`, including audit storage. Next, switch public console routes and permission/resource namespaces so the externally visible protocol is clean. Then lock model-definition scope contracts to final `workspace/system` rules with a fixed `SYSTEM_SCOPE_ID`. After that, collapse runtime physical columns to generic `scope_id` and remove the last `app_id` plumbing. Finish with a grep-based naming sweep plus the unified backend verification gate.

**Tech Stack:** Rust stable, Axum, SQLx/PostgreSQL, Redis session store, utoipa, Node.js backend verification scripts

**Source Specs:** `docs/superpowers/specs/1flowse/2026-04-14-backend-workspace-physical-rename-design.md`, `docs/superpowers/specs/1flowse/2026-04-13-backend-governance-phase-two-design.md`, `docs/superpowers/specs/1flowse/2026-04-13-data-model-physical-table-design.md`

**Approval:** User approved turning the design doc into an implementation plan on `2026-04-14 13`.

**Execution Mode:** Execute in the current repository. Do not create a git worktree.

---

## Scope Notes

- This plan supersedes the temporary naming assumption in `docs/superpowers/plans/2026-04-14-backend-workspace-switch.md` that still allowed `teams` and `TeamRecord` as the persistence carrier.
- The database may be reset, so baseline migrations should be rewritten to final names instead of adding compatibility rename steps.
- No alias, serde compatibility layer, legacy route shadow, or env fallback is allowed in active backend code.
- `tenant` remains a hidden structural parent only; this plan does not add tenant product APIs or frontend UI.
- Historical hits under `docs/superpowers/specs`, `docs/superpowers/plans/history`, or git history may stay. Active code under `api/` may not.

## Scope

This plan covers:

- static control-plane table and column renames to `workspaces`, `workspace_memberships`, and `workspace_id`
- domain/service/repository/module renames from `Team*` to `Workspace*`
- `workspace.configure.all` permission rollout
- `/api/console/workspace` route, OpenAPI, and backend test alignment
- `BOOTSTRAP_WORKSPACE_NAME` bootstrap/config rollout
- data-model `scope_kind` contract restricted to `workspace/system`
- fixed `SYSTEM_SCOPE_ID` behavior
- runtime physical `scope_id` column rollout and `app_id` removal
- grep-based naming sweep and unified backend verification

This plan does not cover:

- frontend workspace selector or console navigation changes
- tenant management UI or tenant product APIs
- external system compatibility migrations
- rewriting historical docs or archived plans

## File Structure

**Create**

- `api/crates/control-plane/src/workspace.rs`
- `api/crates/control-plane/src/_tests/workspace_service_tests.rs`
- `api/crates/storage-pg/src/workspace_repository.rs`
- `api/crates/storage-pg/src/mappers/workspace_mapper.rs`
- `api/apps/api-server/src/routes/workspace.rs`

**Modify**

- `api/crates/domain/src/lib.rs`
- `api/crates/domain/src/scope.rs`
- `api/crates/domain/src/modeling.rs`
- `api/crates/domain/src/audit.rs`
- `api/crates/control-plane/src/lib.rs`
- `api/crates/control-plane/src/bootstrap.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/audit.rs`
- `api/crates/control-plane/src/member.rs`
- `api/crates/control-plane/src/model_definition.rs`
- `api/crates/control-plane/src/role.rs`
- `api/crates/control-plane/src/workspace_session.rs`
- `api/crates/control-plane/src/_tests/mod.rs`
- `api/crates/control-plane/src/_tests/support.rs`
- `api/crates/control-plane/src/_tests/model_definition_acl_tests.rs`
- `api/crates/control-plane/src/_tests/model_definition_runtime_sync_tests.rs`
- `api/crates/control-plane/src/_tests/model_definition_service_tests.rs`
- `api/crates/control-plane/src/_tests/role_service_tests.rs`
- `api/crates/control-plane/src/_tests/workspace_session_service_tests.rs`
- `api/crates/access-control/src/catalog.rs`
- `api/crates/access-control/src/_tests/catalog_tests.rs`
- `api/crates/storage-pg/src/lib.rs`
- `api/crates/storage-pg/src/repositories.rs`
- `api/crates/storage-pg/src/auth_repository.rs`
- `api/crates/storage-pg/src/member_repository.rs`
- `api/crates/storage-pg/src/model_definition_repository.rs`
- `api/crates/storage-pg/src/physical_schema_repository.rs`
- `api/crates/storage-pg/src/role_repository.rs`
- `api/crates/storage-pg/src/runtime_record_repository.rs`
- `api/crates/storage-pg/src/_tests/mod.rs`
- `api/crates/storage-pg/src/_tests/migration_smoke.rs`
- `api/crates/storage-pg/src/_tests/model_definition_repository_tests.rs`
- `api/crates/storage-pg/src/_tests/physical_schema_repository_tests.rs`
- `api/crates/storage-pg/src/_tests/runtime_record_repository_tests.rs`
- `api/crates/storage-pg/src/_tests/runtime_registry_health_tests.rs`
- `api/crates/storage-pg/src/_tests/workspace_access_tests.rs`
- `api/crates/storage-pg/src/_tests/workspace_scope_tests.rs`
- `api/crates/storage-pg/migrations/20260412183000_create_auth_team_acl_tables.sql`
- `api/crates/storage-pg/migrations/20260412230000_create_model_definition_tables.sql`
- `api/crates/storage-pg/migrations/20260413103000_align_model_definition_physical_schema.sql`
- `api/crates/storage-pg/migrations/20260413220000_add_tenant_workspace_scope.sql`
- `api/crates/runtime-core/src/runtime_engine.rs`
- `api/crates/runtime-core/src/_tests/runtime_acl_tests.rs`
- `api/crates/runtime-core/src/_tests/runtime_engine_tests.rs`
- `api/crates/runtime-core/src/_tests/runtime_model_registry_tests.rs`
- `api/apps/api-server/src/app_state.rs`
- `api/apps/api-server/src/config.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/openapi.rs`
- `api/apps/api-server/src/bin/reset_root_password.rs`
- `api/apps/api-server/src/routes/mod.rs`
- `api/apps/api-server/src/routes/model_definitions.rs`
- `api/apps/api-server/src/routes/runtime_models.rs`
- `api/apps/api-server/src/routes/workspaces.rs`
- `api/apps/api-server/src/_tests/config_tests.rs`
- `api/apps/api-server/src/_tests/model_definition_routes.rs`
- `api/apps/api-server/src/_tests/openapi_alignment.rs`
- `api/apps/api-server/src/_tests/role_routes.rs`
- `api/apps/api-server/src/_tests/runtime_model_routes.rs`
- `api/apps/api-server/src/_tests/support.rs`
- `api/apps/api-server/src/_tests/workspace_routes.rs`

**Delete After Migration**

- `api/crates/domain/src/team.rs`
- `api/crates/control-plane/src/team.rs`
- `api/crates/storage-pg/src/team_repository.rs`
- `api/crates/storage-pg/src/mappers/team_mapper.rs`
- `api/apps/api-server/src/routes/team.rs`
- `api/apps/api-server/src/_tests/team_routes.rs`

### Task 1: Rename Static Workspace Foundations

**Goal:** move the static control-plane foundation from `team` to `workspace` in one slice, including domain types, repository boundaries, audit storage, baseline schema, and bootstrap/config naming.

**Files:**

- Create: `api/crates/control-plane/src/workspace.rs`
- Create: `api/crates/control-plane/src/_tests/workspace_service_tests.rs`
- Create: `api/crates/storage-pg/src/workspace_repository.rs`
- Create: `api/crates/storage-pg/src/mappers/workspace_mapper.rs`
- Modify: `api/crates/domain/src/lib.rs`
- Modify: `api/crates/domain/src/scope.rs`
- Modify: `api/crates/domain/src/audit.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/bootstrap.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/control-plane/src/audit.rs`
- Modify: `api/crates/control-plane/src/workspace_session.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`
- Modify: `api/crates/control-plane/src/_tests/support.rs`
- Modify: `api/crates/control-plane/src/_tests/workspace_session_service_tests.rs`
- Modify: `api/crates/storage-pg/src/lib.rs`
- Modify: `api/crates/storage-pg/src/repositories.rs`
- Modify: `api/crates/storage-pg/src/auth_repository.rs`
- Modify: `api/crates/storage-pg/src/member_repository.rs`
- Modify: `api/crates/storage-pg/src/model_definition_repository.rs`
- Modify: `api/crates/storage-pg/src/role_repository.rs`
- Modify: `api/crates/storage-pg/src/_tests/migration_smoke.rs`
- Modify: `api/crates/storage-pg/src/_tests/workspace_access_tests.rs`
- Modify: `api/crates/storage-pg/src/_tests/workspace_scope_tests.rs`
- Modify: `api/crates/storage-pg/migrations/20260412183000_create_auth_team_acl_tables.sql`
- Modify: `api/crates/storage-pg/migrations/20260413220000_add_tenant_workspace_scope.sql`
- Modify: `api/apps/api-server/src/app_state.rs`
- Modify: `api/apps/api-server/src/config.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/bin/reset_root_password.rs`
- Modify: `api/apps/api-server/src/_tests/support.rs`
- Modify: `api/apps/api-server/src/_tests/config_tests.rs`

- [ ] **Step 1: Add the failing foundation coverage**

Create `api/crates/control-plane/src/_tests/workspace_service_tests.rs` with:

```rust
#[tokio::test]
async fn get_workspace_returns_not_found_for_unknown_id() {}

#[tokio::test]
async fn update_workspace_requires_workspace_configure_permission() {}
```

Extend `api/crates/control-plane/src/_tests/workspace_session_service_tests.rs` with:

```rust
#[tokio::test]
async fn switch_workspace_writes_workspace_id_into_audit_log() {}
```

Extend `api/apps/api-server/src/_tests/config_tests.rs` with:

```rust
#[test]
fn api_config_reads_bootstrap_workspace_name() {}
```

Replace the legacy migration smoke assertions in `api/crates/storage-pg/src/_tests/migration_smoke.rs` so they check:

- `workspaces` exists instead of `teams`
- `workspace_memberships` exists instead of `team_memberships`
- `roles.workspace_id` and `audit_logs.workspace_id` exist
- the seeded permission catalog contains `workspace.configure.all`

- [ ] **Step 2: Run focused failures**

Run:

```bash
cargo test -p control-plane _tests::workspace_service_tests::get_workspace_returns_not_found_for_unknown_id -- --exact
cargo test -p control-plane _tests::workspace_session_service_tests::switch_workspace_writes_workspace_id_into_audit_log -- --exact
cargo test -p api-server _tests::config_tests::api_config_reads_bootstrap_workspace_name -- --exact
cargo test -p storage-pg _tests::migration_smoke::migration_smoke_creates_workspace_tables_and_workspace_scoped_indexes -- --exact
```

Expected:

- `workspace` modules and tests fail to compile because the repository and service are still named `team`
- config tests fail because only `BOOTSTRAP_TEAM_NAME` exists
- migration smoke fails because the baseline schema still creates `teams`, `team_memberships`, and `team_id`

- [ ] **Step 3: Implement the static rename foundation**

Move the stable core to `WorkspaceRecord` and `WorkspaceRepository` instead of `TeamRecord` and `TeamRepository`.

In `api/crates/control-plane/src/ports.rs`, replace the team repository contract with:

```rust
#[async_trait]
pub trait WorkspaceRepository: Send + Sync {
    async fn get_workspace(
        &self,
        workspace_id: Uuid,
    ) -> anyhow::Result<Option<WorkspaceRecord>>;

    async fn list_accessible_workspaces(
        &self,
        user_id: Uuid,
    ) -> anyhow::Result<Vec<WorkspaceRecord>>;

    async fn get_accessible_workspace(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
    ) -> anyhow::Result<Option<WorkspaceRecord>>;

    async fn update_workspace(
        &self,
        actor_user_id: Uuid,
        workspace_id: Uuid,
        name: &str,
        logo_url: Option<&str>,
        introduction: &str,
    ) -> anyhow::Result<WorkspaceRecord>;
}
```

In `api/crates/control-plane/src/workspace.rs`, expose:

```rust
pub struct UpdateWorkspaceCommand {
    pub actor: ActorContext,
    pub workspace_id: Uuid,
    pub name: String,
    pub logo_url: Option<String>,
    pub introduction: String,
}

pub struct WorkspaceService<R> {
    repository: R,
}
```

and enforce:

```rust
ensure_permission(&command.actor, "workspace.configure.all")
    .map_err(ControlPlaneError::PermissionDenied)?;
```

Rewrite the domain audit shape to final naming:

```rust
pub struct AuditLogRecord {
    pub id: Uuid,
    pub workspace_id: Option<Uuid>,
    pub actor_user_id: Option<Uuid>,
    pub target_type: String,
    pub target_id: Option<Uuid>,
    pub event_code: String,
    pub payload: Value,
    pub created_at: OffsetDateTime,
}
```

and change the helper in `api/crates/control-plane/src/audit.rs` to accept explicit workspace context:

```rust
pub fn audit_log(
    workspace_id: Option<Uuid>,
    actor_user_id: Option<Uuid>,
    target_type: &str,
    target_id: Option<Uuid>,
    event_code: &str,
    payload: serde_json::Value,
) -> AuditLogRecord { ... }
```

Update every current caller so audit writes carry the active workspace:

- `WorkspaceService` uses `Some(command.workspace_id)`
- `WorkspaceSessionService` uses `Some(next_session.current_workspace_id)`
- role/member/profile/session/model-definition writes use `Some(actor.current_workspace_id)`

Rewrite the storage layer to final static names:

```sql
create table if not exists workspaces (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  logo_url text,
  introduction text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists workspace_memberships (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  introduction text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
```

Update `roles` and `audit_logs` in the same baseline migration to use `workspace_id`, and keep `20260413220000_add_tenant_workspace_scope.sql` only for non-naming leftovers or convert it to a documented no-op so empty-database replays land directly on final names.

Update config/bootstrap naming everywhere:

```rust
pub struct ApiConfig {
    pub bootstrap_workspace_name: String,
    // ...
}

pub struct BootstrapConfig {
    pub workspace_name: String,
    // ...
}
```

and replace every `BOOTSTRAP_TEAM_NAME` reference with `BOOTSTRAP_WORKSPACE_NAME`.

Finally, move the storage implementation to the new file/module names:

- `team_repository.rs -> workspace_repository.rs`
- `team_mapper.rs -> workspace_mapper.rs`
- `domain::TeamRecord` usage -> `domain::WorkspaceRecord`
- repository helpers `primary_team_id`, `team_id_for_user`, and `tenant_id_for_team` -> `primary_workspace_id`, `workspace_id_for_user`, and `tenant_id_for_workspace`

- [ ] **Step 4: Rerun the focused foundation tests**

Run:

```bash
cargo test -p control-plane _tests::workspace_service_tests::get_workspace_returns_not_found_for_unknown_id -- --exact
cargo test -p control-plane _tests::workspace_service_tests::update_workspace_requires_workspace_configure_permission -- --exact
cargo test -p control-plane _tests::workspace_session_service_tests::switch_workspace_writes_workspace_id_into_audit_log -- --exact
cargo test -p api-server _tests::config_tests::api_config_reads_bootstrap_workspace_name -- --exact
cargo test -p storage-pg _tests::migration_smoke::migration_smoke_creates_workspace_tables_and_workspace_scoped_indexes -- --exact
```

Expected: all focused tests pass, and the new baseline schema uses only `workspace` static naming.

- [ ] **Step 5: Commit the foundation rename**

```bash
git add \
  api/crates/domain/src/lib.rs \
  api/crates/domain/src/scope.rs \
  api/crates/domain/src/audit.rs \
  api/crates/control-plane/src/lib.rs \
  api/crates/control-plane/src/bootstrap.rs \
  api/crates/control-plane/src/ports.rs \
  api/crates/control-plane/src/audit.rs \
  api/crates/control-plane/src/workspace.rs \
  api/crates/control-plane/src/workspace_session.rs \
  api/crates/control-plane/src/_tests/mod.rs \
  api/crates/control-plane/src/_tests/support.rs \
  api/crates/control-plane/src/_tests/workspace_service_tests.rs \
  api/crates/control-plane/src/_tests/workspace_session_service_tests.rs \
  api/crates/storage-pg/src/lib.rs \
  api/crates/storage-pg/src/repositories.rs \
  api/crates/storage-pg/src/auth_repository.rs \
  api/crates/storage-pg/src/member_repository.rs \
  api/crates/storage-pg/src/model_definition_repository.rs \
  api/crates/storage-pg/src/role_repository.rs \
  api/crates/storage-pg/src/workspace_repository.rs \
  api/crates/storage-pg/src/mappers/workspace_mapper.rs \
  api/crates/storage-pg/src/_tests/migration_smoke.rs \
  api/crates/storage-pg/src/_tests/workspace_access_tests.rs \
  api/crates/storage-pg/src/_tests/workspace_scope_tests.rs \
  api/crates/storage-pg/migrations/20260412183000_create_auth_team_acl_tables.sql \
  api/crates/storage-pg/migrations/20260413220000_add_tenant_workspace_scope.sql \
  api/apps/api-server/src/app_state.rs \
  api/apps/api-server/src/config.rs \
  api/apps/api-server/src/lib.rs \
  api/apps/api-server/src/bin/reset_root_password.rs \
  api/apps/api-server/src/_tests/support.rs \
  api/apps/api-server/src/_tests/config_tests.rs
git commit -m "refactor: rename workspace foundation"
```

### Task 2: Expose Workspace-Only Console Protocol

**Goal:** remove the last public `team` protocol surface so routes, OpenAPI, and permission codes all speak only `workspace`.

**Files:**

- Create: `api/apps/api-server/src/routes/workspace.rs`
- Modify: `api/crates/access-control/src/catalog.rs`
- Modify: `api/crates/access-control/src/_tests/catalog_tests.rs`
- Modify: `api/crates/control-plane/src/workspace.rs`
- Modify: `api/crates/control-plane/src/role.rs`
- Modify: `api/crates/control-plane/src/_tests/role_service_tests.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/routes/workspaces.rs`
- Modify: `api/apps/api-server/src/_tests/openapi_alignment.rs`
- Modify: `api/apps/api-server/src/_tests/role_routes.rs`
- Modify: `api/apps/api-server/src/_tests/workspace_routes.rs`

- [ ] **Step 1: Add failing route and catalog coverage**

Extend `api/apps/api-server/src/_tests/workspace_routes.rs` with:

```rust
#[tokio::test]
async fn current_workspace_route_reads_and_updates_workspace_metadata() {}
```

Extend `api/apps/api-server/src/_tests/openapi_alignment.rs` with:

```rust
#[tokio::test]
async fn openapi_contains_workspace_detail_path_and_omits_team_path() {}
```

Update `api/crates/access-control/src/_tests/catalog_tests.rs` so it asserts:

```rust
assert!(codes.contains(&"workspace.configure.all".to_string()));
assert!(!codes.contains(&"team.configure.all".to_string()));
```

Update role service and route assertions so every permission payload uses `workspace.configure.all`.

- [ ] **Step 2: Run the focused failures**

Run:

```bash
cargo test -p access-control _tests::catalog_tests::permission_catalog_seeds_expected_codes -- --exact
cargo test -p api-server _tests::workspace_routes::current_workspace_route_reads_and_updates_workspace_metadata -- --exact
cargo test -p api-server _tests::openapi_alignment::openapi_contains_workspace_detail_path_and_omits_team_path -- --exact
```

Expected:

- access-control tests fail because the catalog still seeds `team.configure.all`
- route tests fail because `/api/console/workspace` is not registered yet
- OpenAPI still references `crate::routes::team::*`

- [ ] **Step 3: Implement the protocol cleanup**

Create `api/apps/api-server/src/routes/workspace.rs` with the final route:

```rust
pub fn router() -> Router<Arc<ApiState>> {
    Router::new().route("/workspace", get(get_workspace).patch(patch_workspace))
}
```

and the final response contract:

```rust
#[derive(Debug, Serialize, ToSchema)]
pub struct WorkspaceResponse {
    pub id: String,
    pub name: String,
    pub logo_url: Option<String>,
    pub introduction: String,
}
```

Wire the new route through:

- `api/apps/api-server/src/routes/mod.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/openapi.rs`

Delete the legacy `team` route module after the new `workspace` route compiles and the tests are moved.

Rename the permission namespace in both the catalog and service checks:

```rust
push_permissions(
    &mut permissions,
    "workspace",
    &[("view", &["all"]), ("configure", &["all"])],
);
```

and keep the write path guarded by:

```rust
ensure_permission(&command.actor, "workspace.configure.all")
    .map_err(ControlPlaneError::PermissionDenied)?;
```

Update `api/apps/api-server/src/routes/workspaces.rs` to depend on `WorkspaceService` and `WorkspaceRecord`, not the deleted `TeamService` and `TeamRecord`.

- [ ] **Step 4: Rerun the protocol checks**

Run:

```bash
cargo test -p access-control _tests::catalog_tests::permission_catalog_seeds_expected_codes -- --exact
cargo test -p api-server _tests::workspace_routes::current_workspace_route_reads_and_updates_workspace_metadata -- --exact
cargo test -p api-server _tests::openapi_alignment::openapi_contains_workspace_detail_path_and_omits_team_path -- --exact
```

Expected: the console detail route, OpenAPI schema, and permission catalog all expose only `workspace` terminology.

- [ ] **Step 5: Commit the public protocol rename**

```bash
git add \
  api/crates/access-control/src/catalog.rs \
  api/crates/access-control/src/_tests/catalog_tests.rs \
  api/crates/control-plane/src/workspace.rs \
  api/crates/control-plane/src/role.rs \
  api/crates/control-plane/src/_tests/role_service_tests.rs \
  api/apps/api-server/src/lib.rs \
  api/apps/api-server/src/openapi.rs \
  api/apps/api-server/src/routes/mod.rs \
  api/apps/api-server/src/routes/workspace.rs \
  api/apps/api-server/src/routes/workspaces.rs \
  api/apps/api-server/src/_tests/openapi_alignment.rs \
  api/apps/api-server/src/_tests/role_routes.rs \
  api/apps/api-server/src/_tests/workspace_routes.rs
git commit -m "refactor: expose workspace-only console protocol"
```

### Task 3: Finalize Model Definition Scope Contract

**Goal:** remove the last `team/app` scope contract from model-definition creation, persistence, and tests so only `workspace/system` remains, with `SYSTEM_SCOPE_ID` as the fixed system scope.

**Files:**

- Modify: `api/crates/domain/src/scope.rs`
- Modify: `api/crates/domain/src/modeling.rs`
- Modify: `api/crates/control-plane/src/model_definition.rs`
- Modify: `api/crates/control-plane/src/_tests/model_definition_acl_tests.rs`
- Modify: `api/crates/control-plane/src/_tests/model_definition_runtime_sync_tests.rs`
- Modify: `api/crates/control-plane/src/_tests/model_definition_service_tests.rs`
- Modify: `api/crates/storage-pg/src/model_definition_repository.rs`
- Modify: `api/crates/storage-pg/src/mappers/model_definition_mapper.rs`
- Modify: `api/crates/storage-pg/src/_tests/model_definition_repository_tests.rs`
- Modify: `api/crates/storage-pg/migrations/20260412230000_create_model_definition_tables.sql`
- Modify: `api/apps/api-server/src/routes/model_definitions.rs`
- Modify: `api/apps/api-server/src/_tests/model_definition_routes.rs`
- Modify: `api/apps/api-server/src/_tests/runtime_model_routes.rs`

- [ ] **Step 1: Add failing scope-contract coverage**

Extend `api/crates/control-plane/src/_tests/model_definition_service_tests.rs` with:

```rust
#[tokio::test]
async fn create_system_model_uses_fixed_system_scope_id() {}

#[tokio::test]
async fn create_workspace_model_uses_current_workspace_id() {}
```

Extend `api/apps/api-server/src/_tests/model_definition_routes.rs` with:

```rust
#[tokio::test]
async fn create_model_route_accepts_workspace_and_system_scope_kinds_only() {}
```

Update the existing `model_definition_repository_creates_scope_bound_metadata_without_publish_state` test in `api/crates/storage-pg/src/_tests/model_definition_repository_tests.rs` so it expects:

- `created.scope_kind == DataModelScopeKind::Workspace`
- `created.physical_table_name.starts_with("rtm_workspace_")`
- system-scoped records use `scope_id == domain::SYSTEM_SCOPE_ID`

- [ ] **Step 2: Run the focused failures**

Run:

```bash
cargo test -p control-plane _tests::model_definition_service_tests::create_system_model_uses_fixed_system_scope_id -- --exact
cargo test -p storage-pg _tests::model_definition_repository_tests::model_definition_repository_creates_scope_bound_metadata_without_publish_state -- --exact
cargo test -p api-server _tests::model_definition_routes::create_model_route_accepts_workspace_and_system_scope_kinds_only -- --exact
```

Expected:

- tests fail because `DataModelScopeKind::Team/App` aliases are still active
- route parsing still accepts legacy `"team"` / `"app"`
- physical table names still start with `rtm_team_` or `rtm_app_`

- [ ] **Step 3: Implement the final `workspace/system` contract**

Define the fixed system scope in `api/crates/domain/src/scope.rs`:

```rust
pub const SYSTEM_SCOPE_ID: Uuid = uuid::uuid!("00000000-0000-0000-0000-000000000000");
```

Remove every legacy alias from `DataModelScopeKind` and keep only the final strings:

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DataModelScopeKind {
    Workspace,
    System,
}
```

Update model-definition creation so the service derives scope ids instead of accepting old semantics:

```rust
let scope_id = match command.scope_kind {
    DataModelScopeKind::Workspace => actor.current_workspace_id,
    DataModelScopeKind::System => domain::SYSTEM_SCOPE_ID,
};
```

Tighten the HTTP create body in `api/apps/api-server/src/routes/model_definitions.rs` to final inputs only:

```rust
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateModelDefinitionBody {
    pub scope_kind: String,
    pub code: String,
    pub title: String,
}
```

and parse only:

```rust
match raw {
    "workspace" => Ok(domain::DataModelScopeKind::Workspace),
    "system" => Ok(domain::DataModelScopeKind::System),
    _ => Err(control_plane::errors::ControlPlaneError::InvalidInput("scope_kind").into()),
}
```

Rewrite physical table prefixes in both control-plane and storage-pg:

```rust
let prefix = match scope_kind {
    DataModelScopeKind::Workspace => "workspace",
    DataModelScopeKind::System => "system",
};
```

and update `20260412230000_create_model_definition_tables.sql` so `scope_kind` checks only allow `workspace` and `system`.

- [ ] **Step 4: Rerun the scope-contract tests**

Run:

```bash
cargo test -p control-plane _tests::model_definition_service_tests::create_workspace_model_uses_current_workspace_id -- --exact
cargo test -p control-plane _tests::model_definition_service_tests::create_system_model_uses_fixed_system_scope_id -- --exact
cargo test -p storage-pg _tests::model_definition_repository_tests::model_definition_repository_creates_scope_bound_metadata_without_publish_state -- --exact
cargo test -p api-server _tests::model_definition_routes::create_model_route_accepts_workspace_and_system_scope_kinds_only -- --exact
```

Expected: model-definition creation and persistence expose only final `workspace/system` semantics.

- [ ] **Step 5: Commit the scope-contract changes**

```bash
git add \
  api/crates/domain/src/scope.rs \
  api/crates/domain/src/modeling.rs \
  api/crates/control-plane/src/model_definition.rs \
  api/crates/control-plane/src/_tests/model_definition_acl_tests.rs \
  api/crates/control-plane/src/_tests/model_definition_runtime_sync_tests.rs \
  api/crates/control-plane/src/_tests/model_definition_service_tests.rs \
  api/crates/storage-pg/src/model_definition_repository.rs \
  api/crates/storage-pg/src/mappers/model_definition_mapper.rs \
  api/crates/storage-pg/src/_tests/model_definition_repository_tests.rs \
  api/crates/storage-pg/migrations/20260412230000_create_model_definition_tables.sql \
  api/apps/api-server/src/routes/model_definitions.rs \
  api/apps/api-server/src/_tests/model_definition_routes.rs \
  api/apps/api-server/src/_tests/runtime_model_routes.rs
git commit -m "refactor: finalize model definition scope naming"
```

### Task 4: Unify Runtime Physical Scope To `scope_id`

**Goal:** finish the rename in runtime so dynamic physical tables, metadata, registry lookup, and CRUD inputs all use generic `scope_id` plus the fixed `SYSTEM_SCOPE_ID`.

**Files:**

- Modify: `api/crates/storage-pg/src/physical_schema_repository.rs`
- Modify: `api/crates/storage-pg/src/runtime_record_repository.rs`
- Modify: `api/crates/storage-pg/src/_tests/physical_schema_repository_tests.rs`
- Modify: `api/crates/storage-pg/src/_tests/runtime_record_repository_tests.rs`
- Modify: `api/crates/storage-pg/src/_tests/runtime_registry_health_tests.rs`
- Modify: `api/crates/storage-pg/migrations/20260413103000_align_model_definition_physical_schema.sql`
- Modify: `api/crates/runtime-core/src/runtime_engine.rs`
- Modify: `api/crates/runtime-core/src/_tests/runtime_acl_tests.rs`
- Modify: `api/crates/runtime-core/src/_tests/runtime_engine_tests.rs`
- Modify: `api/crates/runtime-core/src/_tests/runtime_model_registry_tests.rs`
- Modify: `api/apps/api-server/src/routes/runtime_models.rs`
- Modify: `api/apps/api-server/src/_tests/runtime_model_routes.rs`

- [ ] **Step 1: Add failing runtime coverage**

Extend `api/crates/runtime-core/src/_tests/runtime_engine_tests.rs` with:

```rust
#[tokio::test]
async fn runtime_engine_uses_fixed_system_scope_id_for_system_models() {}

#[tokio::test]
async fn runtime_engine_prefers_workspace_metadata_before_system_fallback() {}
```

Extend `api/crates/storage-pg/src/_tests/physical_schema_repository_tests.rs` with:

```rust
#[tokio::test]
async fn create_runtime_model_table_always_uses_scope_id_column() {}
```

Update the existing runtime CRUD suites so they assert final runtime scope naming:

- `api/crates/storage-pg/src/_tests/runtime_record_repository_tests.rs` should inspect `scope_id`
- `api/apps/api-server/src/_tests/runtime_model_routes.rs` should create runtime models with `scope_kind = "workspace"` and keep the drop-table unavailable flow working against the renamed physical schema

Update `api/crates/runtime-core/src/_tests/runtime_model_registry_tests.rs` so the registry fixture uses:

```rust
physical_table_name: "rtm_workspace_demo_orders".into(),
scope_column_name: "scope_id".into(),
```

- [ ] **Step 2: Run the focused runtime failures**

Run:

```bash
cargo test -p runtime-core _tests::runtime_engine_tests::runtime_engine_uses_fixed_system_scope_id_for_system_models -- --exact
cargo test -p runtime-core _tests::runtime_engine_tests::runtime_engine_prefers_workspace_metadata_before_system_fallback -- --exact
cargo test -p storage-pg _tests::physical_schema_repository_tests::create_runtime_model_table_always_uses_scope_id_column -- --exact
```

Expected:

- runtime inputs still carry `app_id`
- runtime table creation still injects `team_id` or `app_id`
- metadata mapping still emits `scope_column_name = "team_id"` or `"app_id"`

- [ ] **Step 3: Implement the runtime cleanup**

Remove `app_id` from the runtime engine input structs so the API no longer transports legacy system scope context:

```rust
#[derive(Debug, Clone)]
pub struct RuntimeListInput {
    pub actor: domain::ActorContext,
    pub model_code: String,
    pub filters: Vec<RuntimeFilterInput>,
    pub sorts: Vec<RuntimeSortInput>,
    pub expand_relations: Vec<String>,
    pub page: i64,
    pub page_size: i64,
}
```

Load metadata by trying workspace first and then the fixed system scope:

```rust
fn load_metadata(&self, model_code: &str, workspace_id: Uuid) -> Result<ModelMetadata> {
    self.registry
        .get(domain::DataModelScopeKind::Workspace, workspace_id, model_code)
        .or_else(|| {
            self.registry
                .get(domain::DataModelScopeKind::System, domain::SYSTEM_SCOPE_ID, model_code)
        })
        .ok_or_else(|| RuntimeModelError::unavailable(model_code).into())
}
```

Derive runtime scope ids from metadata only:

```rust
fn scope_id_for(&self, metadata: &ModelMetadata, workspace_id: Uuid) -> Uuid {
    match metadata.scope_kind {
        domain::DataModelScopeKind::Workspace => workspace_id,
        domain::DataModelScopeKind::System => domain::SYSTEM_SCOPE_ID,
    }
}
```

Rewrite physical runtime tables to always inject:

```sql
scope_id uuid not null
```

and update storage-pg metadata mapping to always emit:

```rust
scope_column_name: "scope_id".into(),
```

Update the runtime HTTP route callers to stop passing `app_id: None` after the engine input structs are simplified.

- [ ] **Step 4: Rerun the runtime checks**

Run:

```bash
cargo test -p runtime-core _tests::runtime_engine_tests::runtime_engine_uses_fixed_system_scope_id_for_system_models -- --exact
cargo test -p runtime-core _tests::runtime_engine_tests::runtime_engine_prefers_workspace_metadata_before_system_fallback -- --exact
cargo test -p runtime-core _tests::runtime_model_registry_tests::runtime_model_registry_rebuilds_and_refreshes_by_model_code -- --exact
cargo test -p storage-pg _tests::physical_schema_repository_tests::create_runtime_model_table_always_uses_scope_id_column -- --exact
cargo test -p storage-pg _tests::runtime_record_repository_tests::runtime_record_repository_supports_crud_filter_sort_and_relation_expansion -- --exact
cargo test -p api-server _tests::runtime_model_routes::runtime_model_routes_create_fetch_update_delete_and_filter_records -- --exact
```

Expected: runtime metadata, physical tables, and CRUD routes all rely on `scope_id`, and system-scoped models resolve through `SYSTEM_SCOPE_ID`.

- [ ] **Step 5: Commit the runtime rename**

```bash
git add \
  api/crates/storage-pg/src/physical_schema_repository.rs \
  api/crates/storage-pg/src/runtime_record_repository.rs \
  api/crates/storage-pg/src/_tests/physical_schema_repository_tests.rs \
  api/crates/storage-pg/src/_tests/runtime_record_repository_tests.rs \
  api/crates/storage-pg/src/_tests/runtime_registry_health_tests.rs \
  api/crates/storage-pg/migrations/20260413103000_align_model_definition_physical_schema.sql \
  api/crates/runtime-core/src/runtime_engine.rs \
  api/crates/runtime-core/src/_tests/runtime_acl_tests.rs \
  api/crates/runtime-core/src/_tests/runtime_engine_tests.rs \
  api/crates/runtime-core/src/_tests/runtime_model_registry_tests.rs \
  api/apps/api-server/src/routes/runtime_models.rs \
  api/apps/api-server/src/_tests/runtime_model_routes.rs
git commit -m "refactor: unify runtime scope columns"
```

### Task 5: Sweep Legacy Terms And Run Full Verification

**Goal:** clear remaining active-code stragglers, prove that no live backend path still uses `team/app`, and close with the unified backend verification gate.

**Files:**

- Modify: any remaining active backend file under `api/` surfaced by the final grep sweep

- [ ] **Step 1: Run the legacy-term sweep**

Run:

```bash
rg -n "/api/console/team|team\\.configure\\.all|BOOTSTRAP_TEAM_NAME|\\bTeamRecord\\b|\\bTeamService\\b|\\bUpdateTeamCommand\\b|\\bteam_id\\b|\\bapp_id\\b|scope_kind[^\n]*['\\\"](team|app)['\\\"]" api -g '!api/target/**'
```

Expected: no matches from active backend code or tests.

- [ ] **Step 2: Fix any active-code stragglers before broad verification**

If the sweep finds live matches, clear them in place before running the broad gates. The allowed end state is:

- no `/api/console/team`
- no `team.configure.all`
- no `BOOTSTRAP_TEAM_NAME`
- no `TeamRecord`, `TeamService`, or `UpdateTeamCommand`
- no active `team_id` or `app_id` columns in runtime/control-plane code
- no active `scope_kind = 'team'` or `scope_kind = 'app'`

- [ ] **Step 3: Run the focused regression clusters serially**

Run:

```bash
cargo test -p control-plane -- --test-threads=1
cargo test -p storage-pg -- --test-threads=1
cargo test -p runtime-core -- --test-threads=1
cargo test -p api-server -- --test-threads=1
```

Expected: all four crates pass in serial mode without reintroducing legacy names.

- [ ] **Step 4: Run the unified backend verification gate**

Run:

```bash
node scripts/node/verify-backend.js
```

Expected: `cargo fmt --check`, `cargo clippy --workspace --all-targets -D warnings`, `cargo test --workspace`, and `cargo check --workspace` all pass from the repo root.

- [ ] **Step 5: Commit the cleanup and verification pass**

```bash
git add api
git commit -m "refactor: finalize backend workspace physical naming"
```
