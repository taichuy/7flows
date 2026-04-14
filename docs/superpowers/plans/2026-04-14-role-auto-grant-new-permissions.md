# Role Auto-Grant New Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a role-level `auto_grant_new_permissions` policy so roles can automatically receive future permission-catalog additions, with `admin=true`, `manager=false`, no historical backfill, and a settings-page checkbox for create/edit flows.

**Architecture:** Implement this in four slices. First, extend the PostgreSQL schema and bootstrap/storage sync so new permission definitions can be detected and granted to roles that opted in. Next, thread the new field through the domain, service, and HTTP role contracts. Then update the web API client and role-management UI so the policy is visible and editable. Finish with targeted and full verification before the feature commit.

**Tech Stack:** Rust stable, Axum, SQLx/PostgreSQL, React 19, TypeScript, TanStack Query, Ant Design, Vitest

**Source Spec:** `docs/superpowers/specs/1flowse/2026-04-14-role-auto-grant-new-permissions-design.md`

---

## File Structure

**Create**
- `api/crates/storage-pg/migrations/20260414193000_add_role_auto_grant_new_permissions.sql`
- `api/crates/storage-pg/src/_tests/role_auto_grant_tests.rs`
- `web/app/src/features/settings/_tests/role-permission-panel.test.tsx`

**Modify**
- `api/crates/domain/src/auth.rs`
- `api/crates/access-control/src/catalog.rs`
- `api/crates/storage-pg/src/_tests/mod.rs`
- `api/crates/storage-pg/src/_tests/migration_smoke.rs`
- `api/crates/storage-pg/src/mappers/role_mapper.rs`
- `api/crates/storage-pg/src/repositories.rs`
- `api/crates/storage-pg/src/auth_repository.rs`
- `api/crates/storage-pg/src/role_repository.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/role.rs`
- `api/crates/control-plane/src/_tests/support.rs`
- `api/crates/control-plane/src/_tests/role_service_tests.rs`
- `api/apps/api-server/src/routes/roles.rs`
- `api/apps/api-server/src/_tests/role_routes.rs`
- `web/packages/api-client/src/console-roles.ts`
- `web/app/src/features/settings/components/RolePermissionPanel.tsx`

## Task 1: Add Schema And Storage Auto-Grant Sync

**Files:**
- Create: `api/crates/storage-pg/migrations/20260414193000_add_role_auto_grant_new_permissions.sql`
- Create: `api/crates/storage-pg/src/_tests/role_auto_grant_tests.rs`
- Modify: `api/crates/storage-pg/src/_tests/mod.rs`
- Modify: `api/crates/storage-pg/src/_tests/migration_smoke.rs`
- Modify: `api/crates/domain/src/auth.rs`
- Modify: `api/crates/access-control/src/catalog.rs`
- Modify: `api/crates/storage-pg/src/mappers/role_mapper.rs`
- Modify: `api/crates/storage-pg/src/repositories.rs`
- Modify: `api/crates/storage-pg/src/auth_repository.rs`

- [ ] **Step 1: Write the failing storage tests**

Create `api/crates/storage-pg/src/_tests/role_auto_grant_tests.rs`:

```rust
use sqlx::PgPool;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

async fn isolated_database_url() -> String {
    let admin_pool = PgPool::connect(
        &std::env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into()
        }),
    )
    .await
    .unwrap();
    let schema = format!("test_{}", Uuid::now_v7().to_string().replace('-', ""));
    sqlx::query(&format!("create schema if not exists {schema}"))
        .execute(&admin_pool)
        .await
        .unwrap();
    format!(
        "{}?options=-csearch_path%3D{schema}",
        std::env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into()
        })
    )
}

#[tokio::test]
async fn upsert_permission_catalog_grants_new_permissions_only_to_auto_grant_roles() {}

#[tokio::test]
async fn upsert_builtin_roles_sets_admin_true_and_manager_false() {}
```

Extend `api/crates/storage-pg/src/_tests/migration_smoke.rs` with:

```rust
assert!(role_columns.contains(&"auto_grant_new_permissions".to_string()));
```

Register the new test module in `api/crates/storage-pg/src/_tests/mod.rs`:

```rust
mod role_auto_grant_tests;
```

- [ ] **Step 2: Run the storage tests to verify they fail**

Run: `cargo test -p storage-pg _tests::role_auto_grant_tests::upsert_permission_catalog_grants_new_permissions_only_to_auto_grant_roles -- --exact --nocapture`
Expected: FAIL because `roles.auto_grant_new_permissions` does not exist and no auto-grant logic runs.

Run: `cargo test -p storage-pg _tests::migration_smoke::migration_smoke_creates_workspace_tables_and_workspace_scoped_indexes -- --exact --nocapture`
Expected: FAIL because the new column assertion is missing from the schema.

- [ ] **Step 3: Add the schema field and builtin defaults**

Create `api/crates/storage-pg/migrations/20260414193000_add_role_auto_grant_new_permissions.sql`:

```sql
alter table roles
  add column if not exists auto_grant_new_permissions boolean not null default false;

update roles
set auto_grant_new_permissions = true
where scope_kind = 'workspace' and code = 'admin';

update roles
set auto_grant_new_permissions = false
where code in ('manager', 'root');
```

Extend `api/crates/domain/src/auth.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RoleTemplate {
    pub code: String,
    pub name: String,
    pub scope_kind: RoleScopeKind,
    pub is_builtin: bool,
    pub is_editable: bool,
    pub auto_grant_new_permissions: bool,
    pub permissions: Vec<String>,
}
```

Extend `api/crates/access-control/src/catalog.rs` builtin roles:

```rust
RoleTemplate {
    code: "admin".to_string(),
    name: "Admin".to_string(),
    scope_kind: RoleScopeKind::Workspace,
    is_builtin: true,
    is_editable: true,
    auto_grant_new_permissions: true,
    permissions: all_codes.clone(),
}
```

and:

```rust
RoleTemplate {
    code: "manager".to_string(),
    name: "Manager".to_string(),
    scope_kind: RoleScopeKind::Workspace,
    is_builtin: true,
    is_editable: true,
    auto_grant_new_permissions: false,
    permissions: manager_permissions,
}
```

- [ ] **Step 4: Implement storage read/write and new-permission sync**

Update `api/crates/storage-pg/src/mappers/role_mapper.rs`:

```rust
#[derive(Debug, Clone)]
pub struct StoredRoleRow {
    pub id: Uuid,
    pub code: String,
    pub name: String,
    pub scope_kind: RoleScopeKind,
    pub is_builtin: bool,
    pub is_editable: bool,
    pub auto_grant_new_permissions: bool,
}

impl PgRoleMapper {
    pub fn to_role_template(row: StoredRoleRow, permissions: Vec<String>) -> RoleTemplate {
        RoleTemplate {
            code: row.code,
            name: row.name,
            scope_kind: row.scope_kind,
            is_builtin: row.is_builtin,
            is_editable: row.is_editable,
            auto_grant_new_permissions: row.auto_grant_new_permissions,
            permissions,
        }
    }
}
```

Update `api/crates/storage-pg/src/repositories.rs`:

```rust
StoredRoleRow {
    id: row.get("id"),
    code: row.get("code"),
    name: row.get("name"),
    scope_kind: decode_role_scope_kind(&scope_kind),
    is_builtin: row.get("is_builtin"),
    is_editable: row.get("is_editable"),
    auto_grant_new_permissions: row.get("auto_grant_new_permissions"),
}
```

Update `api/crates/storage-pg/src/auth_repository.rs` `upsert_permission_catalog()` so it collects newly inserted permission ids:

```rust
let inserted_permission_id: Option<Uuid> = sqlx::query_scalar(
    r#"
    insert into permission_definitions (id, resource, action, scope, code, name, introduction)
    values ($1, $2, $3, $4, $5, $6, '')
    on conflict (code) do nothing
    returning id
    "#,
)
```

Then auto-bind only those new ids:

```rust
for permission_id in inserted_permission_ids {
    sqlx::query(
        r#"
        insert into role_permissions (id, role_id, permission_id)
        select $1, roles.id, $2
        from roles
        where roles.auto_grant_new_permissions = true
        on conflict (role_id, permission_id) do nothing
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(permission_id)
    .execute(&mut *tx)
    .await?;
}
```

Update `upsert_builtin_roles()` to persist the new field:

```rust
insert into roles (
    id, scope_kind, workspace_id, code, name, introduction, is_builtin, is_editable,
    auto_grant_new_permissions, system_kind
)
values ($1, $2, $3, $4, $5, '', $6, $7, $8, $9)
on conflict do nothing
```

with:

```rust
.bind(role.auto_grant_new_permissions)
```

- [ ] **Step 5: Re-run the storage tests and commit**

Run: `cargo test -p storage-pg _tests::role_auto_grant_tests::upsert_permission_catalog_grants_new_permissions_only_to_auto_grant_roles -- --exact --nocapture`
Expected: PASS

Run: `cargo test -p storage-pg _tests::role_auto_grant_tests::upsert_builtin_roles_sets_admin_true_and_manager_false -- --exact --nocapture`
Expected: PASS

Run: `cargo test -p storage-pg _tests::migration_smoke::migration_smoke_creates_workspace_tables_and_workspace_scoped_indexes -- --exact --nocapture`
Expected: PASS

Commit:

```bash
git add api/crates/domain/src/auth.rs api/crates/access-control/src/catalog.rs api/crates/storage-pg/src/mappers/role_mapper.rs api/crates/storage-pg/src/repositories.rs api/crates/storage-pg/src/auth_repository.rs api/crates/storage-pg/src/_tests/mod.rs api/crates/storage-pg/src/_tests/migration_smoke.rs api/crates/storage-pg/src/_tests/role_auto_grant_tests.rs api/crates/storage-pg/migrations/20260414193000_add_role_auto_grant_new_permissions.sql
git commit -m "feat(api): auto grant new permissions for opted-in roles"
```

## Task 2: Thread The Policy Through Role Service And Routes

**Files:**
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/control-plane/src/role.rs`
- Modify: `api/crates/control-plane/src/_tests/support.rs`
- Modify: `api/crates/control-plane/src/_tests/role_service_tests.rs`
- Modify: `api/crates/storage-pg/src/role_repository.rs`
- Modify: `api/apps/api-server/src/routes/roles.rs`
- Modify: `api/apps/api-server/src/_tests/role_routes.rs`

- [ ] **Step 1: Write the failing service and route tests**

Extend `api/crates/control-plane/src/_tests/role_service_tests.rs` with:

```rust
#[tokio::test]
async fn role_service_tracks_auto_grant_policy_on_create_and_update() {}
```

Extend `api/apps/api-server/src/_tests/role_routes.rs` with:

```rust
#[tokio::test]
async fn role_routes_roundtrip_auto_grant_policy() {}
```

- [ ] **Step 2: Run the focused failures**

Run: `cargo test -p control-plane _tests::role_service_tests::role_service_tracks_auto_grant_policy_on_create_and_update -- --exact --nocapture`
Expected: FAIL because the role commands and memory repository do not carry the new field.

Run: `cargo test -p api-server _tests::role_routes::role_routes_roundtrip_auto_grant_policy -- --exact --nocapture`
Expected: FAIL because the HTTP request/response bodies do not expose `auto_grant_new_permissions`.

- [ ] **Step 3: Update the role command and repository contracts**

Extend `api/crates/control-plane/src/role.rs`:

```rust
pub struct CreateRoleCommand {
    pub actor_user_id: Uuid,
    pub code: String,
    pub name: String,
    pub introduction: String,
    pub auto_grant_new_permissions: bool,
}

pub struct UpdateRoleCommand {
    pub actor_user_id: Uuid,
    pub role_code: String,
    pub name: String,
    pub introduction: String,
    pub auto_grant_new_permissions: Option<bool>,
}
```

Extend `api/crates/control-plane/src/ports.rs`:

```rust
async fn create_team_role(
    &self,
    actor_user_id: Uuid,
    workspace_id: Uuid,
    code: &str,
    name: &str,
    introduction: &str,
    auto_grant_new_permissions: bool,
) -> anyhow::Result<()>;

async fn update_team_role(
    &self,
    actor_user_id: Uuid,
    workspace_id: Uuid,
    role_code: &str,
    name: &str,
    introduction: &str,
    auto_grant_new_permissions: Option<bool>,
) -> anyhow::Result<()>;
```

Update `RoleService::create_role()` and `RoleService::update_role()` to pass the new values straight through to the repository.

- [ ] **Step 4: Implement storage, route, and test-double support**

Update `api/crates/storage-pg/src/role_repository.rs` create/update SQL:

```rust
insert into roles (
    id, scope_kind, workspace_id, code, name, introduction, is_builtin, is_editable,
    auto_grant_new_permissions, created_by, updated_by
)
values ($1, 'workspace', $2, $3, $4, $5, false, true, $6, $7, $7)
```

and:

```rust
update roles
set name = $2,
    introduction = $3,
    auto_grant_new_permissions = coalesce($4, auto_grant_new_permissions),
    updated_by = $5,
    updated_at = now()
where id = $1
```

Update `api/crates/control-plane/src/_tests/support.rs`:

```rust
RoleTemplate {
    code: code.to_string(),
    name: name.to_string(),
    scope_kind: RoleScopeKind::Workspace,
    is_builtin: false,
    is_editable: true,
    auto_grant_new_permissions,
    permissions: Vec::new(),
}
```

Update `api/apps/api-server/src/routes/roles.rs` bodies and response:

```rust
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateRoleBody {
    pub code: String,
    pub name: String,
    pub introduction: String,
    pub auto_grant_new_permissions: Option<bool>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateRoleBody {
    pub name: String,
    pub introduction: String,
    pub auto_grant_new_permissions: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RoleResponse {
    pub code: String,
    pub name: String,
    pub scope_kind: String,
    pub is_builtin: bool,
    pub is_editable: bool,
    pub auto_grant_new_permissions: bool,
    pub permission_codes: Vec<String>,
}
```

Route create should default to `false`:

```rust
auto_grant_new_permissions: body.auto_grant_new_permissions.unwrap_or(false),
```

- [ ] **Step 5: Re-run focused backend tests and commit**

Run: `cargo test -p control-plane _tests::role_service_tests::role_service_tracks_auto_grant_policy_on_create_and_update -- --exact --nocapture`
Expected: PASS

Run: `cargo test -p api-server _tests::role_routes::role_routes_roundtrip_auto_grant_policy -- --exact --nocapture`
Expected: PASS

Run: `cargo test -p api-server _tests::role_routes::role_routes_create_replace_permissions_and_protect_root -- --exact --nocapture`
Expected: PASS

Commit:

```bash
git add api/crates/control-plane/src/ports.rs api/crates/control-plane/src/role.rs api/crates/control-plane/src/_tests/support.rs api/crates/control-plane/src/_tests/role_service_tests.rs api/crates/storage-pg/src/role_repository.rs api/apps/api-server/src/routes/roles.rs api/apps/api-server/src/_tests/role_routes.rs
git commit -m "feat(api): expose role auto grant policy"
```

## Task 3: Add The Settings Checkbox And Web Contract

**Files:**
- Create: `web/app/src/features/settings/_tests/role-permission-panel.test.tsx`
- Modify: `web/packages/api-client/src/console-roles.ts`
- Modify: `web/app/src/features/settings/components/RolePermissionPanel.tsx`

- [ ] **Step 1: Write the failing UI test**

Create `web/app/src/features/settings/_tests/role-permission-panel.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const rolesApi = vi.hoisted(() => ({
  settingsRolesQueryKey: ['settings', 'roles'],
  settingsRolePermissionsQueryKey: vi.fn((roleCode: string) => ['settings', 'roles', roleCode, 'permissions']),
  fetchSettingsRoles: vi.fn(),
  createSettingsRole: vi.fn(),
  updateSettingsRole: vi.fn(),
  deleteSettingsRole: vi.fn(),
  fetchSettingsRolePermissions: vi.fn(),
  replaceSettingsRolePermissions: vi.fn()
}));

test('submits auto_grant_new_permissions from the create and edit dialogs', async () => {});
```

Use role fixtures like:

```tsx
{
  code: 'admin',
  name: 'Admin',
  scope_kind: 'workspace',
  is_builtin: true,
  is_editable: true,
  auto_grant_new_permissions: true,
  permission_codes: []
}
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `pnpm --dir web/app exec vitest --run src/features/settings/_tests/role-permission-panel.test.tsx`
Expected: FAIL because `ConsoleRole` and the role forms do not know about `auto_grant_new_permissions`.

- [ ] **Step 3: Implement the API client and checkbox UI**

Update `web/packages/api-client/src/console-roles.ts`:

```ts
export interface ConsoleRole {
  code: string;
  name: string;
  scope_kind: 'system' | 'workspace';
  is_builtin: boolean;
  is_editable: boolean;
  auto_grant_new_permissions: boolean;
  permission_codes: string[];
}

export interface CreateConsoleRoleInput {
  code: string;
  name: string;
  introduction: string;
  auto_grant_new_permissions?: boolean;
}

export interface UpdateConsoleRoleInput {
  name: string;
  introduction: string;
  auto_grant_new_permissions?: boolean;
}
```

Update the create modal in `web/app/src/features/settings/components/RolePermissionPanel.tsx`:

```tsx
<Form.Item
  name="auto_grant_new_permissions"
  valuePropName="checked"
  extra="开启后，仅对未来新增的权限自动授予当前角色。"
>
  <Checkbox>自动接收后续新增权限</Checkbox>
</Form.Item>
```

Initialize the edit form with the selected role:

```tsx
editForm.setFieldsValue({
  name: role.name,
  introduction: '',
  auto_grant_new_permissions: role.auto_grant_new_permissions
});
```

Show the current policy in the details header:

```tsx
<Tag color={selectedRole.auto_grant_new_permissions ? 'blue' : 'default'}>
  {selectedRole.auto_grant_new_permissions ? '自动接收新增权限' : '手动维护权限'}
</Tag>
```

- [ ] **Step 4: Re-run the UI tests and commit**

Run: `pnpm --dir web/app exec vitest --run src/features/settings/_tests/role-permission-panel.test.tsx`
Expected: PASS

Run: `pnpm --dir web/app exec vitest --run src/features/settings/_tests/settings-page.test.tsx`
Expected: PASS

Commit:

```bash
git add web/packages/api-client/src/console-roles.ts web/app/src/features/settings/components/RolePermissionPanel.tsx web/app/src/features/settings/_tests/role-permission-panel.test.tsx
git commit -m "feat(web): manage role auto grant policy in settings"
```

## Task 4: Full Verification And Final Feature Commit

**Files:**
- Modify: `docs/superpowers/plans/2026-04-14-role-auto-grant-new-permissions.md`

- [ ] **Step 1: Run the backend verification suite**

Run: `node scripts/node/verify-backend.js`
Expected: PASS with no failing cargo or formatting checks.

- [ ] **Step 2: Run the frontend verification suite**

Run: `pnpm --dir web lint`
Expected: PASS

Run: `pnpm --dir web test`
Expected: PASS

Run: `pnpm --dir web/app build`
Expected: PASS

- [ ] **Step 3: Review the final diff**

Run:

```bash
git status --short
git diff --stat HEAD~3..HEAD
```

Expected: Only the role auto-grant backend/frontend files and this plan/spec chain are part of the feature diff.

- [ ] **Step 4: Commit the integrated feature**

Run:

```bash
git add api/crates/domain/src/auth.rs api/crates/access-control/src/catalog.rs api/crates/storage-pg/src/_tests/mod.rs api/crates/storage-pg/src/_tests/migration_smoke.rs api/crates/storage-pg/src/_tests/role_auto_grant_tests.rs api/crates/storage-pg/src/mappers/role_mapper.rs api/crates/storage-pg/src/repositories.rs api/crates/storage-pg/src/auth_repository.rs api/crates/storage-pg/src/role_repository.rs api/crates/storage-pg/migrations/20260414193000_add_role_auto_grant_new_permissions.sql api/crates/control-plane/src/ports.rs api/crates/control-plane/src/role.rs api/crates/control-plane/src/_tests/support.rs api/crates/control-plane/src/_tests/role_service_tests.rs api/apps/api-server/src/routes/roles.rs api/apps/api-server/src/_tests/role_routes.rs web/packages/api-client/src/console-roles.ts web/app/src/features/settings/components/RolePermissionPanel.tsx web/app/src/features/settings/_tests/role-permission-panel.test.tsx
git commit -m "feat: auto grant new permissions for opted-in roles"
```

## Self-Review

- Spec coverage:
  - role-level policy field: Task 1 and Task 2
  - builtin defaults `admin=true`, `manager=false`: Task 1
  - only future permissions, no backfill: Task 1 storage sync logic and tests
  - settings checkbox create/edit/save: Task 3
- Placeholder scan:
  - no placeholder markers remain
- Type consistency:
  - backend field name is always `auto_grant_new_permissions`
  - create/update API contracts use `Option<bool>` / optional boolean consistently
  - frontend uses the same snake_case field to match the existing API shape
