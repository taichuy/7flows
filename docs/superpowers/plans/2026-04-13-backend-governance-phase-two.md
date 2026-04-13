# Backend Governance Phase Two Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the hidden `root tenant` foundation, thread `current_workspace_id` through auth and request handling, eliminate implicit workspace inference from backend state paths, harden runtime metadata self-healing, and codify stable backend execution rules in `api/AGENTS.md` without expanding the visible product surface.

**Architecture:** Keep the current `api-server + control-plane + storage-pg + runtime-core` shape and the existing `/api/console/*` HTTP surface, but refactor the internals so the persistence model becomes `tenant -> workspace`, auth/session state always carries an explicit current workspace, repository and service boundaries stop guessing the first team, runtime metadata becomes health-aware, and plugin binding semantics stop depending on the removed `app` scope.

**Tech Stack:** Rust stable, Axum, Tokio, SQLx, PostgreSQL migrations, Redis session store, utoipa, Node.js verification scripts

**Source Specs:** `docs/superpowers/specs/1flowse/2026-04-13-backend-governance-phase-two-design.md`, `docs/superpowers/specs/1flowse/2026-04-12-backend-interface-kernel-design.md`, `docs/superpowers/specs/1flowse/2026-04-12-backend-engineering-quality-design.md`

**Execution Mode:** Execute in the current repository. Do not create a git worktree for this plan.

## Execution Status

- Completed at `2026-04-14 00`.
- Task 1 to Task 3 had already been completed and committed before this recovery pass:
  - `8f0e14f8` `feat: seed hidden root tenant and workspace scope`
  - `80a5212c` `feat: carry current workspace through auth sessions`
  - `c06dcd75` `refactor: require explicit workspace scope in backend services`
- Task 4 and Task 5 were completed in this recovery pass, including the final backend verification.
- Because the targeted Rust unit tests live under `src/_tests`, every `cargo test ... -- --exact` command in actual execution used the full module path form such as `_tests::runtime_model_routes::runtime_model_routes_create_fetch_update_delete_and_filter_records`.
- Final verification executed `node scripts/node/verify-backend.js` successfully at `2026-04-14 00`.

## Scope

This plan covers:

- hidden `root tenant` persistence and bootstrap
- explicit `current_workspace_id` in session/auth/request context
- explicit workspace propagation across control-plane and runtime state paths
- runtime metadata availability tracking and registry self-healing
- plugin binding cleanup after removing `app` scope
- short local `api/AGENTS.md` rules

This plan does not cover:

- tenant management routes or UI
- workspace switch API or frontend selector
- billing, pricing, or license logic
- user ID type migration
- public plugin installation endpoints

## File Map

**Create**

- `api/crates/domain/src/scope.rs`
- `api/crates/storage-pg/migrations/20260413220000_add_tenant_workspace_scope.sql`
- `api/crates/storage-pg/migrations/20260413223000_add_runtime_metadata_health.sql`
- `api/crates/storage-pg/src/_tests/workspace_scope_tests.rs`
- `api/crates/storage-pg/src/_tests/runtime_registry_health_tests.rs`
- `api/AGENTS.md`

**Modify**

- `api/crates/domain/src/lib.rs`
- `api/crates/domain/src/auth.rs`
- `api/crates/domain/src/modeling.rs`
- `api/crates/domain/src/team.rs`
- `api/crates/control-plane/src/bootstrap.rs`
- `api/crates/control-plane/src/auth.rs`
- `api/crates/control-plane/src/member.rs`
- `api/crates/control-plane/src/role.rs`
- `api/crates/control-plane/src/model_definition.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/_tests/bootstrap_tests.rs`
- `api/crates/control-plane/src/_tests/role_service_tests.rs`
- `api/crates/control-plane/src/_tests/support.rs`
- `api/apps/api-server/src/app_state.rs`
- `api/apps/api-server/src/config.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/middleware/require_session.rs`
- `api/apps/api-server/src/routes/auth.rs`
- `api/apps/api-server/src/routes/session.rs`
- `api/apps/api-server/src/routes/team.rs`
- `api/apps/api-server/src/routes/members.rs`
- `api/apps/api-server/src/routes/roles.rs`
- `api/apps/api-server/src/routes/model_definitions.rs`
- `api/apps/api-server/src/routes/runtime_models.rs`
- `api/apps/api-server/src/runtime_registry_sync.rs`
- `api/apps/api-server/src/_tests/support.rs`
- `api/apps/api-server/src/_tests/auth_routes.rs`
- `api/apps/api-server/src/_tests/session_routes.rs`
- `api/apps/api-server/src/_tests/role_routes.rs`
- `api/apps/api-server/src/_tests/runtime_model_routes.rs`
- `api/crates/storage-pg/src/repositories.rs`
- `api/crates/storage-pg/src/auth_repository.rs`
- `api/crates/storage-pg/src/member_repository.rs`
- `api/crates/storage-pg/src/role_repository.rs`
- `api/crates/storage-pg/src/team_repository.rs`
- `api/crates/storage-pg/src/model_definition_repository.rs`
- `api/crates/storage-pg/src/runtime_record_repository.rs`
- `api/crates/storage-pg/src/_tests/migration_smoke.rs`
- `api/crates/storage-pg/src/_tests/runtime_record_repository_tests.rs`
- `api/crates/runtime-core/src/runtime_model_registry.rs`
- `api/crates/runtime-core/src/runtime_engine.rs`
- `api/crates/plugin-framework/src/assignment.rs`
- `api/crates/plugin-framework/src/_tests/assignment_tests.rs`

## Task 1: Seed The Hidden Root Tenant And Workspace Scope Foundation

**Goal:** make tenant persistence real, keep it hidden, and bootstrap one default workspace beneath the seeded `root tenant`.

**Files**

- `api/crates/domain/src/scope.rs`
- `api/crates/domain/src/lib.rs`
- `api/crates/domain/src/auth.rs`
- `api/crates/domain/src/team.rs`
- `api/crates/control-plane/src/bootstrap.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/_tests/bootstrap_tests.rs`
- `api/crates/control-plane/src/_tests/support.rs`
- `api/crates/storage-pg/migrations/20260413220000_add_tenant_workspace_scope.sql`
- `api/crates/storage-pg/src/auth_repository.rs`
- `api/crates/storage-pg/src/repositories.rs`
- `api/crates/storage-pg/src/_tests/migration_smoke.rs`

- [x] **Step 1: add failing schema and bootstrap tests**

Update `api/crates/storage-pg/src/_tests/migration_smoke.rs` with a new test named `migration_smoke_creates_tenant_table_and_workspace_scope_column` that asserts:

- `tenants` exists
- `teams.tenant_id` exists
- the seeded tenant row exists with code `root-tenant`

Update `api/crates/control-plane/src/_tests/bootstrap_tests.rs` with a new test named `bootstrap_service_seeds_single_root_tenant_and_default_workspace` that runs bootstrap twice and asserts:

- root tenant upsert runs twice without duplicating rows
- workspace upsert runs twice without duplicating rows
- root user creation still happens only once

- [x] **Step 2: run focused tests and confirm failure**

Run:

```bash
cargo test -p storage-pg migration_smoke_creates_tenant_table_and_workspace_scope_column -- --exact
cargo test -p control-plane bootstrap_service_seeds_single_root_tenant_and_default_workspace -- --exact
```

Expected:

- the migration test fails because `tenants` and `teams.tenant_id` do not exist yet
- the bootstrap test fails because the repository trait has no tenant/workspace bootstrap API yet

- [x] **Step 3: implement tenant/workspace domain and bootstrap support**

Create `api/crates/domain/src/scope.rs` with:

- `TenantRecord { id, code, name, is_root, is_hidden }`
- `WorkspaceRecord { id, tenant_id, name, logo_url, introduction }`
- `ScopeContext { tenant_id, workspace_id }`

Update `api/crates/domain/src/lib.rs` to export the new module.

Update `api/crates/domain/src/auth.rs`:

- change `RoleScopeKind` from `App/Team` to `System/Workspace`
- change `BoundRole.team_id` to `workspace_id`
- change `ActorContext.team_id` to `tenant_id` plus `current_workspace_id`
- change `SessionRecord.team_id` to `tenant_id` plus `current_workspace_id`

Update `api/crates/domain/src/team.rs` so `TeamRecord` gains `tenant_id`. Keep the type name for now to avoid a wide rename in one step; treat it as the persistence backing for workspace semantics.

Create `api/crates/storage-pg/migrations/20260413220000_add_tenant_workspace_scope.sql` with:

- `create table tenants (...)`
- `alter table teams add column tenant_id uuid references tenants(id)`
- seed row for `root tenant` using code `root-tenant`
- backfill all existing teams to the seeded tenant
- `alter table teams alter column tenant_id set not null`
- unique index on `(tenant_id, lower(name))`

Update `api/crates/control-plane/src/ports.rs` `BootstrapRepository` to expose:

- `upsert_root_tenant() -> TenantRecord`
- `upsert_workspace(tenant_id, workspace_name) -> TeamRecord`
- existing `upsert_authenticator`, `upsert_permission_catalog`, `upsert_builtin_roles`, and `upsert_root_user`

Update `api/crates/control-plane/src/bootstrap.rs` so bootstrap order becomes:

1. upsert builtin authenticator
2. upsert permission catalog
3. upsert hidden `root tenant`
4. upsert default workspace under that tenant
5. upsert builtin roles for the workspace
6. upsert root user in that workspace

Update `api/crates/storage-pg/src/auth_repository.rs` and `api/crates/storage-pg/src/repositories.rs` to implement tenant/workspace bootstrap helpers and to expose pooled access needed by the migration and repository tests.

Update `api/crates/control-plane/src/_tests/support.rs` so the in-memory bootstrap repository tracks:

- root tenant upsert count
- workspace upsert count
- root user creation count

- [x] **Step 4: rerun focused tests and verify pass**

Run:

```bash
cargo test -p storage-pg migration_smoke_creates_tenant_table_and_workspace_scope_column -- --exact
cargo test -p control-plane bootstrap_service_seeds_single_root_tenant_and_default_workspace -- --exact
```

Expected: both tests pass.

- [x] **Step 5: commit the task**

```bash
git add api/crates/domain/src/scope.rs \
  api/crates/domain/src/lib.rs \
  api/crates/domain/src/auth.rs \
  api/crates/domain/src/team.rs \
  api/crates/control-plane/src/bootstrap.rs \
  api/crates/control-plane/src/ports.rs \
  api/crates/control-plane/src/_tests/bootstrap_tests.rs \
  api/crates/control-plane/src/_tests/support.rs \
  api/crates/storage-pg/migrations/20260413220000_add_tenant_workspace_scope.sql \
  api/crates/storage-pg/src/auth_repository.rs \
  api/crates/storage-pg/src/repositories.rs \
  api/crates/storage-pg/src/_tests/migration_smoke.rs
git commit -m "feat: seed hidden root tenant and workspace scope"
```

## Task 2: Carry `current_workspace_id` Through Login, Session, And Request Context

**Goal:** make auth/session state explicit so every request has one current workspace without mutating state during login.

**Files**

- `api/crates/control-plane/src/auth.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/apps/api-server/src/app_state.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/middleware/require_session.rs`
- `api/apps/api-server/src/routes/auth.rs`
- `api/apps/api-server/src/routes/session.rs`
- `api/apps/api-server/src/_tests/support.rs`
- `api/apps/api-server/src/_tests/auth_routes.rs`
- `api/apps/api-server/src/_tests/session_routes.rs`
- `api/crates/storage-pg/src/auth_repository.rs`

- [x] **Step 1: add failing auth/session tests**

Update `api/apps/api-server/src/_tests/auth_routes.rs` `public_auth_sign_in_sets_cookie_and_returns_wrapped_payload` so it asserts:

- `data.csrf_token` exists
- `data.current_workspace_id` exists
- `data.effective_display_role` still exists

Update `api/apps/api-server/src/_tests/session_routes.rs` `session_route_returns_wrapped_actor_payload` so it asserts:

- `data.actor.current_workspace_id` exists
- `data.session.current_workspace_id` exists
- the actor and session workspace ids match

- [x] **Step 2: run focused tests and confirm failure**

Run:

```bash
cargo test -p api-server public_auth_sign_in_sets_cookie_and_returns_wrapped_payload -- --exact
cargo test -p api-server session_route_returns_wrapped_actor_payload -- --exact
```

Expected:

- sign-in test fails because the response does not return `current_workspace_id`
- session route test fails because the route payload does not expose workspace context

- [x] **Step 3: implement explicit workspace session context**

Update `api/crates/control-plane/src/ports.rs` `AuthRepository`:

- add `default_scope_for_user(user_id) -> ScopeContext`
- change `load_actor_context(user_id, team_id, display_role)` to `load_actor_context(user_id, tenant_id, workspace_id, display_role)`
- keep existing `find_authenticator`, `find_user_for_password_login`, `find_user_by_id`, `update_password_hash`, `bump_session_version`, `list_permissions`, and `append_audit_log`

Update `api/crates/control-plane/src/auth.rs`:

- remove `team_id` from `LoginCommand`
- after authenticating the user, call `default_scope_for_user(user.id)`
- load the actor with `tenant_id` and `workspace_id`
- issue the session with `tenant_id` and `current_workspace_id`

Update `SessionIssuer::issue(...)` to accept `(user_id, tenant_id, current_workspace_id, session_version)`.

Update `api/crates/storage-pg/src/auth_repository.rs`:

- implement `default_scope_for_user` by resolving the user’s root-tenant-backed membership and default workspace without writing to the database
- update actor loading SQL to scope role resolution and permissions by explicit workspace id

Update `api/apps/api-server/src/routes/auth.rs`:

- remove any bootstrap-style `upsert_team(...)` call from the public sign-in flow
- return `csrf_token`, `effective_display_role`, and `current_workspace_id`

Update `api/apps/api-server/src/middleware/require_session.rs`:

- load the actor with `session.tenant_id` and `session.current_workspace_id`
- store the full actor/session pair in request extensions

Update `api/apps/api-server/src/routes/session.rs`:

- include `current_workspace_id` in both the `actor` and `session` payload sections

- [x] **Step 4: rerun focused tests and verify pass**

Run:

```bash
cargo test -p api-server public_auth_sign_in_sets_cookie_and_returns_wrapped_payload -- --exact
cargo test -p api-server session_route_returns_wrapped_actor_payload -- --exact
```

Expected: both tests pass.

- [x] **Step 5: commit the task**

```bash
git add api/crates/control-plane/src/auth.rs \
  api/crates/control-plane/src/ports.rs \
  api/apps/api-server/src/app_state.rs \
  api/apps/api-server/src/lib.rs \
  api/apps/api-server/src/middleware/require_session.rs \
  api/apps/api-server/src/routes/auth.rs \
  api/apps/api-server/src/routes/session.rs \
  api/apps/api-server/src/_tests/support.rs \
  api/apps/api-server/src/_tests/auth_routes.rs \
  api/apps/api-server/src/_tests/session_routes.rs \
  api/crates/storage-pg/src/auth_repository.rs
git commit -m "feat: carry current workspace through auth sessions"
```

## Task 3: Remove Implicit Workspace Inference And Close Missing Audit Coverage

**Goal:** stop all business state paths from guessing the first workspace, and make role updates/deletes audit-complete.

**Files**

- `api/crates/storage-pg/src/_tests/workspace_scope_tests.rs`
- `api/crates/control-plane/src/member.rs`
- `api/crates/control-plane/src/role.rs`
- `api/crates/control-plane/src/model_definition.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/_tests/role_service_tests.rs`
- `api/crates/control-plane/src/_tests/support.rs`
- `api/apps/api-server/src/routes/team.rs`
- `api/apps/api-server/src/routes/members.rs`
- `api/apps/api-server/src/routes/roles.rs`
- `api/apps/api-server/src/routes/model_definitions.rs`
- `api/apps/api-server/src/routes/runtime_models.rs`
- `api/crates/storage-pg/src/repositories.rs`
- `api/crates/storage-pg/src/member_repository.rs`
- `api/crates/storage-pg/src/role_repository.rs`
- `api/crates/storage-pg/src/team_repository.rs`
- `api/crates/storage-pg/src/model_definition_repository.rs`
- `api/crates/storage-pg/src/runtime_record_repository.rs`

- [x] **Step 1: add failing explicit-scope and audit tests**

Create `api/crates/storage-pg/src/_tests/workspace_scope_tests.rs` with:

- `role_queries_respect_requested_workspace_instead_of_first_workspace`
- seed two workspaces under the same tenant
- create a role only in the second workspace
- assert that listing roles for the second workspace returns exactly that role

Update `api/crates/control-plane/src/_tests/role_service_tests.rs` `role_service_rejects_root_mutation_and_replaces_permissions_for_team_roles` so it also asserts that the in-memory repository captured:

- `role.created`
- `role.updated`
- `role.deleted`
- `role.permissions_replaced`

- [x] **Step 2: run focused tests and confirm failure**

Run:

```bash
cargo test -p storage-pg role_queries_respect_requested_workspace_instead_of_first_workspace -- --exact
cargo test -p control-plane role_service_rejects_root_mutation_and_replaces_permissions_for_team_roles -- --exact
```

Expected:

- the storage test fails because repository list/update paths still infer a primary team
- the role service test fails because update/delete audit events are missing

- [x] **Step 3: thread explicit workspace ids through stateful paths**

Update `api/crates/control-plane/src/ports.rs`:

- `MemberRepository::list_members(workspace_id)`
- `RoleRepository::list_roles(workspace_id)`
- `RoleRepository::create_team_role(actor_user_id, workspace_id, ...)`
- `RoleRepository::update_team_role(actor_user_id, workspace_id, role_code, ...)`
- `RoleRepository::delete_team_role(actor_user_id, workspace_id, role_code)`
- `RoleRepository::replace_role_permissions(actor_user_id, workspace_id, role_code, permission_codes)`
- `RoleRepository::list_role_permissions(workspace_id, role_code)`
- `ModelDefinitionRepository::list_model_definitions(workspace_id)`
- `ModelDefinitionRepository::get_model_definition(workspace_id, model_id)`
- model and field mutation paths accept or derive `workspace_id` from `ActorContext.current_workspace_id`

Update `api/crates/control-plane/src/member.rs`, `role.rs`, and `model_definition.rs` so service entry points always pass `actor.current_workspace_id` into repository calls.

Update `api/apps/api-server/src/routes/members.rs`, `roles.rs`, `model_definitions.rs`, `runtime_models.rs`, and `team.rs` so they only read workspace scope from the authenticated request context and never resolve it by querying the first team.

Update `api/crates/storage-pg/src/member_repository.rs`, `role_repository.rs`, `team_repository.rs`, `model_definition_repository.rs`, and `runtime_record_repository.rs`:

- replace uses of `primary_team_id()` and `team_id_for_user()` in business flows
- add SQL filters on the requested workspace id
- keep small bootstrap-only helpers if they are still needed for migration smoke tests, but do not use them in request paths

Update `api/crates/control-plane/src/role.rs` to append audit events after successful update/delete:

- `role.updated`
- `role.deleted`

Update `api/crates/control-plane/src/_tests/support.rs` `MemoryRoleRepository` so it records audit event names and workspace-scoped role mutations.

- [x] **Step 4: rerun focused tests and verify pass**

Run:

```bash
cargo test -p storage-pg role_queries_respect_requested_workspace_instead_of_first_workspace -- --exact
cargo test -p control-plane role_service_rejects_root_mutation_and_replaces_permissions_for_team_roles -- --exact
```

Expected: both tests pass.

- [x] **Step 5: commit the task**

```bash
git add api/crates/storage-pg/src/_tests/workspace_scope_tests.rs \
  api/crates/control-plane/src/member.rs \
  api/crates/control-plane/src/role.rs \
  api/crates/control-plane/src/model_definition.rs \
  api/crates/control-plane/src/ports.rs \
  api/crates/control-plane/src/_tests/role_service_tests.rs \
  api/crates/control-plane/src/_tests/support.rs \
  api/apps/api-server/src/routes/team.rs \
  api/apps/api-server/src/routes/members.rs \
  api/apps/api-server/src/routes/roles.rs \
  api/apps/api-server/src/routes/model_definitions.rs \
  api/apps/api-server/src/routes/runtime_models.rs \
  api/crates/storage-pg/src/repositories.rs \
  api/crates/storage-pg/src/member_repository.rs \
  api/crates/storage-pg/src/role_repository.rs \
  api/crates/storage-pg/src/team_repository.rs \
  api/crates/storage-pg/src/model_definition_repository.rs \
  api/crates/storage-pg/src/runtime_record_repository.rs
git commit -m "refactor: require explicit workspace scope in backend services"
```

## Task 4: Mark Broken Runtime Metadata Unavailable And Self-Heal The Registry

**Goal:** treat runtime metadata as cacheable-but-fallible state so missing tables or columns isolate only the affected model.

**Files**

- `api/crates/storage-pg/migrations/20260413223000_add_runtime_metadata_health.sql`
- `api/crates/storage-pg/src/_tests/runtime_registry_health_tests.rs`
- `api/crates/domain/src/modeling.rs`
- `api/crates/storage-pg/src/model_definition_repository.rs`
- `api/crates/storage-pg/src/runtime_record_repository.rs`
- `api/crates/storage-pg/src/_tests/runtime_record_repository_tests.rs`
- `api/apps/api-server/src/runtime_registry_sync.rs`
- `api/apps/api-server/src/routes/runtime_models.rs`
- `api/apps/api-server/src/_tests/runtime_model_routes.rs`
- `api/crates/runtime-core/src/runtime_model_registry.rs`
- `api/crates/runtime-core/src/runtime_engine.rs`

- [x] **Step 1: add failing runtime-health tests**

Create `api/crates/storage-pg/src/_tests/runtime_registry_health_tests.rs` with:

- `list_runtime_model_metadata_marks_model_unavailable_when_table_is_missing`
- create a workspace-scoped model
- drop the physical table
- assert that `list_runtime_model_metadata()` no longer returns that model

Update `api/apps/api-server/src/_tests/runtime_model_routes.rs` by extending `runtime_model_routes_create_fetch_update_delete_and_filter_records` with a second phase:

- create a model
- drop its physical table through SQL
- call the runtime record route for that model
- assert `409 Conflict`
- assert body code `runtime_model_unavailable`

- [x] **Step 2: run focused tests and confirm failure**

Run:

```bash
cargo test -p storage-pg list_runtime_model_metadata_marks_model_unavailable_when_table_is_missing -- --exact
cargo test -p api-server runtime_model_routes_create_fetch_update_delete_and_filter_records -- --exact
```

Expected:

- the storage test fails because missing physical tables still produce runtime metadata
- the route test fails because runtime model failures are still exposed as raw repository/runtime errors instead of `runtime_model_unavailable`

- [x] **Step 3: implement metadata availability states and registry self-heal**

Create `api/crates/storage-pg/migrations/20260413223000_add_runtime_metadata_health.sql`:

- add `availability_status` to `model_definitions`
- add `availability_status` to `model_fields`
- allow values `available`, `unavailable`, `broken`

Update `api/crates/domain/src/modeling.rs`:

- add `MetadataAvailabilityStatus`
- add `availability_status` to `ModelDefinitionRecord`
- add `availability_status` to `ModelFieldRecord`
- replace `DataModelScopeKind::App/Team` with `System/Workspace`

Update `api/crates/storage-pg/src/model_definition_repository.rs`:

- persist `availability_status`
- set models or fields to `broken` when DDL creation/update fails
- leave the metadata row present so operators can inspect and recover it

Update `api/crates/storage-pg/src/runtime_record_repository.rs`:

- add a health check method that verifies physical table existence before returning runtime metadata
- verify physical columns against model field metadata
- mark missing tables or columns unavailable
- exclude unavailable or broken models from registry rebuild output

Update `api/apps/api-server/src/runtime_registry_sync.rs` to call the health-aware metadata loader before `registry.rebuild(...)`.

Update `api/crates/runtime-core/src/runtime_model_registry.rs`:

- keep only healthy model metadata in memory
- drop stale entries on rebuild

Update `api/crates/runtime-core/src/runtime_engine.rs` and `api/apps/api-server/src/routes/runtime_models.rs`:

- translate unavailable-model lookup failures into a stable domain error
- map that error to `409 Conflict` with code `runtime_model_unavailable`

- [x] **Step 4: rerun focused tests and verify pass**

Run:

```bash
cargo test -p storage-pg list_runtime_model_metadata_marks_model_unavailable_when_table_is_missing -- --exact
cargo test -p api-server runtime_model_routes_create_fetch_update_delete_and_filter_records -- --exact
```

Expected: both tests pass.

- [x] **Step 5: commit the task**

```bash
git add api/crates/storage-pg/migrations/20260413223000_add_runtime_metadata_health.sql \
  api/crates/storage-pg/src/_tests/runtime_registry_health_tests.rs \
  api/crates/domain/src/modeling.rs \
  api/crates/storage-pg/src/model_definition_repository.rs \
  api/crates/storage-pg/src/runtime_record_repository.rs \
  api/crates/storage-pg/src/_tests/runtime_record_repository_tests.rs \
  api/apps/api-server/src/runtime_registry_sync.rs \
  api/apps/api-server/src/routes/runtime_models.rs \
  api/apps/api-server/src/_tests/runtime_model_routes.rs \
  api/crates/runtime-core/src/runtime_model_registry.rs \
  api/crates/runtime-core/src/runtime_engine.rs
git commit -m "feat: self-heal runtime registry from broken metadata"
```

## Task 5: Align Plugin Binding Targets, Add `api/AGENTS.md`, And Run Full Verification

**Goal:** finish the governance closure by removing `app` binding semantics, codifying local backend rules, and proving the whole backend still verifies cleanly.

**Files**

- `api/crates/plugin-framework/src/assignment.rs`
- `api/crates/plugin-framework/src/_tests/assignment_tests.rs`
- `api/AGENTS.md`

- [x] **Step 1: add failing plugin-binding tests**

Update `api/crates/plugin-framework/src/_tests/assignment_tests.rs`:

- rename `capability_plugin_can_be_assigned_to_single_app_then_selected_in_config` to `capability_plugin_can_be_assigned_to_single_workspace_then_selected_in_config`
- use `BindingTarget::Workspace(...)`
- add `runtime_extension_rejects_tenant_only_binding`

- [x] **Step 2: run focused tests and confirm failure**

Run:

```bash
cargo test -p plugin-framework capability_plugin_can_be_assigned_to_single_workspace_then_selected_in_config -- --exact
cargo test -p plugin-framework runtime_extension_rejects_tenant_only_binding -- --exact
```

Expected:

- the workspace capability test fails because `BindingTarget::Workspace` does not exist yet
- the tenant runtime-extension test fails because tenant-only binding is not rejected yet

- [x] **Step 3: implement binding cleanup and local rules**

Update `api/crates/plugin-framework/src/assignment.rs`:

- replace `BindingTarget::Team` with `BindingTarget::Workspace`
- remove `BindingTarget::App`
- add `BindingTarget::Tenant`
- keep `BindingTarget::Model`
- allow runtime extensions only for `Workspace` or `Model`
- keep capability plugins explicitly selectable after binding

Create `api/AGENTS.md` with exactly this content:

```md
# api 本地硬规则

- session 必须持有一个 `current_workspace_id`。
- `route` 只做协议层、上下文提取、响应映射；不得直接承载业务写入。
- 所有关键写动作必须经过命名明确的 `service command`。
- `repository` 不得承载权限判断、状态流转、HTTP 语义。
- `mapper` 只做转换，不得藏业务规则。
- 成员、角色、权限、模型、会话等关键动作必须写审计日志。
- `runtime extension` 与 `capability plugin` 禁止注册 HTTP 接口；只能挂宿主白名单槽位。
- system 插件只允许 host 安装；workspace / tenant 只允许配置或绑定。
- runtime 模型或字段若对应物理表/列缺失，必须标记不可用并刷新 registry。
- 测试统一放到对应子目录 `_tests`。
- 后端验证统一使用 `node scripts/node/verify-backend.js`。
- 同一工作区内 `cargo` 验证命令默认串行执行，不并发抢锁。

## 新增资源最低结构

- `route`
- `dto`
- `service`
- `repository trait`
- `repository impl`
- `mapper`
- `_tests`
```

- [x] **Step 4: rerun focused tests and full verification**

Run:

```bash
cargo test -p plugin-framework capability_plugin_can_be_assigned_to_single_workspace_then_selected_in_config -- --exact
cargo test -p plugin-framework runtime_extension_rejects_tenant_only_binding -- --exact
node scripts/node/verify-backend.js
```

Expected:

- both focused plugin-framework tests pass
- `verify-backend.js` completes successfully
- verification covers `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, and `cargo check --workspace`

- [x] **Step 5: commit the task**

```bash
git add api/crates/plugin-framework/src/assignment.rs \
  api/crates/plugin-framework/src/_tests/assignment_tests.rs \
  api/AGENTS.md
git commit -m "docs: codify api governance rules and plugin bindings"
```

## Final Verification

After all five tasks are complete, run:

```bash
node scripts/node/verify-backend.js
git status --short
```

Success criteria:

- backend verification passes cleanly
- no request path depends on implicit “first team” inference
- login/session payloads include `current_workspace_id`
- `root tenant` exists in persistence but remains hidden from product APIs
- broken runtime metadata no longer leaks raw SQL or stale-cache behavior
- `api/AGENTS.md` is present and matches the agreed short local rules

## Execution Options

1. **Subagent-Driven Execution (Recommended)**: hand this plan to `superpowers:subagent-driven-development` so each task can be implemented and reviewed as an isolated unit in the current workspace.
2. **Inline Execution**: implement the tasks sequentially in this session without spinning up subagents.
