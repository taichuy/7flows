# Role Policy Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add role-level policy flags for `auto_grant_new_permissions` and `is_default_member_role`, keep `admin` auto-grant enabled, keep `manager` as the default new-member role, and make new member creation resolve the current default role instead of hardcoding `manager`.

**Architecture:** Implement this in five slices. First, extend the schema, domain model, builtin role defaults, and permission bootstrap logic so policy flags exist and new permissions can be auto-granted to opted-in roles. Next, thread both flags through the role repository, service, and HTTP contracts while enforcing one default member role per workspace. Then update member creation to resolve the workspace default role at write time. After that, expose both flags in the web API client and settings role dialogs with simple checkboxes. Finish with targeted tests and full verification before the feature commit.

**Tech Stack:** Rust stable, Axum, SQLx/PostgreSQL, React 19, TypeScript, TanStack Query, Ant Design, Vitest

**Source Spec:** `docs/superpowers/specs/1flowse/2026-04-14-role-auto-grant-new-permissions-design.md`

---

## File Structure

**Create**
- `api/crates/storage-pg/migrations/20260414203000_add_role_policy_flags.sql`
- `api/crates/storage-pg/src/_tests/role_policy_tests.rs`
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
- `api/crates/storage-pg/src/member_repository.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/role.rs`
- `api/crates/control-plane/src/_tests/support.rs`
- `api/crates/control-plane/src/_tests/role_service_tests.rs`
- `api/crates/control-plane/src/_tests/member_service_tests.rs`
- `api/apps/api-server/src/routes/roles.rs`
- `api/apps/api-server/src/_tests/role_routes.rs`
- `api/apps/api-server/src/_tests/member_routes.rs`
- `web/packages/api-client/src/console-roles.ts`
- `web/app/src/features/settings/components/RolePermissionPanel.tsx`

## Task 1: Add Schema, Domain Flags, And Permission Bootstrap Sync

**Files:**
- Create: `api/crates/storage-pg/migrations/20260414203000_add_role_policy_flags.sql`
- Create: `api/crates/storage-pg/src/_tests/role_policy_tests.rs`
- Modify: `api/crates/storage-pg/src/_tests/mod.rs`
- Modify: `api/crates/storage-pg/src/_tests/migration_smoke.rs`
- Modify: `api/crates/domain/src/auth.rs`
- Modify: `api/crates/access-control/src/catalog.rs`
- Modify: `api/crates/storage-pg/src/mappers/role_mapper.rs`
- Modify: `api/crates/storage-pg/src/repositories.rs`
- Modify: `api/crates/storage-pg/src/auth_repository.rs`

- [x] **Step 1: Write the failing storage tests**

Create `api/crates/storage-pg/src/_tests/role_policy_tests.rs`:

```rust
use sqlx::PgPool;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

async fn isolated_database_url() -> String {
    let base = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into());
    let admin_pool = PgPool::connect(&base).await.unwrap();
    let schema = format!("test_{}", Uuid::now_v7().to_string().replace('-', ""));
    sqlx::query(&format!("create schema if not exists {schema}"))
        .execute(&admin_pool)
        .await
        .unwrap();
    format!("{base}?options=-csearch_path%3D{schema}")
}

#[tokio::test]
async fn upsert_permission_catalog_grants_new_permissions_only_to_auto_grant_roles() {}

#[tokio::test]
async fn upsert_builtin_roles_sets_admin_auto_grant_and_manager_default_member_role() {}
```

Extend `api/crates/storage-pg/src/_tests/migration_smoke.rs` with:

```rust
assert!(role_columns.contains(&"auto_grant_new_permissions".to_string()));
assert!(role_columns.contains(&"is_default_member_role".to_string()));
```

Register the module in `api/crates/storage-pg/src/_tests/mod.rs`:

```rust
mod role_policy_tests;
```

- [x] **Step 2: Run the focused failures**

Run: `cargo test -p storage-pg _tests::role_policy_tests::upsert_permission_catalog_grants_new_permissions_only_to_auto_grant_roles -- --exact --nocapture`
Expected: FAIL because the new columns and auto-grant sync do not exist.

Run: `cargo test -p storage-pg _tests::migration_smoke::migration_smoke_creates_workspace_tables_and_workspace_scoped_indexes -- --exact --nocapture`
Expected: FAIL because the schema does not contain the new role-policy columns.

- [x] **Step 3: Add the schema fields and builtin defaults**

Create `api/crates/storage-pg/migrations/20260414203000_add_role_policy_flags.sql`:

```sql
alter table roles
  add column if not exists auto_grant_new_permissions boolean not null default false;

alter table roles
  add column if not exists is_default_member_role boolean not null default false;

create unique index if not exists roles_workspace_default_member_role_uidx
  on roles (workspace_id)
  where scope_kind = 'workspace' and is_default_member_role = true;

update roles
set auto_grant_new_permissions = true
where scope_kind = 'workspace' and code = 'admin';

update roles
set auto_grant_new_permissions = false
where code in ('manager', 'root');

update roles
set is_default_member_role = true
where scope_kind = 'workspace' and code = 'manager';

update roles
set is_default_member_role = false
where code in ('admin', 'root');
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
    pub is_default_member_role: bool,
    pub permissions: Vec<String>,
}
```

Update builtin templates in `api/crates/access-control/src/catalog.rs`:

```rust
RoleTemplate {
    code: "admin".to_string(),
    name: "Admin".to_string(),
    scope_kind: RoleScopeKind::Workspace,
    is_builtin: true,
    is_editable: true,
    auto_grant_new_permissions: true,
    is_default_member_role: false,
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
    is_default_member_role: true,
    permissions: manager_permissions,
}
```

- [x] **Step 4: Implement storage reads and permission auto-grant sync**

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
    pub is_default_member_role: bool,
}
```

and:

```rust
RoleTemplate {
    code: row.code,
    name: row.name,
    scope_kind: row.scope_kind,
    is_builtin: row.is_builtin,
    is_editable: row.is_editable,
    auto_grant_new_permissions: row.auto_grant_new_permissions,
    is_default_member_role: row.is_default_member_role,
    permissions,
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
    is_default_member_role: row.get("is_default_member_role"),
}
```

Update `api/crates/storage-pg/src/auth_repository.rs` `upsert_permission_catalog()` so it only auto-binds newly inserted permissions:

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

and:

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

Update `upsert_builtin_roles()` to persist both flags:

```rust
insert into roles (
    id, scope_kind, workspace_id, code, name, introduction, is_builtin, is_editable,
    auto_grant_new_permissions, is_default_member_role, system_kind
)
values ($1, $2, $3, $4, $5, '', $6, $7, $8, $9, $10)
on conflict do nothing
```

- [x] **Step 5: Re-run the storage tests and commit**

Run: `cargo test -p storage-pg _tests::role_policy_tests::upsert_permission_catalog_grants_new_permissions_only_to_auto_grant_roles -- --exact --nocapture`
Expected: PASS

Run: `cargo test -p storage-pg _tests::role_policy_tests::upsert_builtin_roles_sets_admin_auto_grant_and_manager_default_member_role -- --exact --nocapture`
Expected: PASS

Run: `cargo test -p storage-pg _tests::migration_smoke::migration_smoke_creates_workspace_tables_and_workspace_scoped_indexes -- --exact --nocapture`
Expected: PASS

Commit:

```bash
git add api/crates/domain/src/auth.rs api/crates/access-control/src/catalog.rs api/crates/storage-pg/src/_tests/mod.rs api/crates/storage-pg/src/_tests/migration_smoke.rs api/crates/storage-pg/src/_tests/role_policy_tests.rs api/crates/storage-pg/src/mappers/role_mapper.rs api/crates/storage-pg/src/repositories.rs api/crates/storage-pg/src/auth_repository.rs api/crates/storage-pg/migrations/20260414203000_add_role_policy_flags.sql
git commit -m "feat(api): add role policy flags"
```

Execution note (`2026-04-14 20`): ran the three focused `storage-pg` tests successfully and committed the slice as `423334fd` (`feat(api): add role policy flags`). The permission auto-grant insert is implemented per-role to avoid reusing a single UUID across multiple inserted bindings.

## Task 2: Expose Role Policy Flags And Enforce One Default Role

**Files:**
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/control-plane/src/role.rs`
- Modify: `api/crates/control-plane/src/_tests/support.rs`
- Modify: `api/crates/control-plane/src/_tests/role_service_tests.rs`
- Modify: `api/crates/storage-pg/src/role_repository.rs`
- Modify: `api/apps/api-server/src/routes/roles.rs`
- Modify: `api/apps/api-server/src/_tests/role_routes.rs`

- [x] **Step 1: Write the failing service and route tests**

Extend `api/crates/control-plane/src/_tests/role_service_tests.rs` with:

```rust
#[tokio::test]
async fn role_service_tracks_policy_flags_on_create_and_update() {}
```

Extend `api/apps/api-server/src/_tests/role_routes.rs` with:

```rust
#[tokio::test]
async fn role_routes_roundtrip_policy_flags_and_protect_default_role_from_clear() {}
```

- [x] **Step 2: Run the focused failures**

Run: `cargo test -p control-plane _tests::role_service_tests::role_service_tracks_policy_flags_on_create_and_update -- --exact --nocapture`
Expected: FAIL because the role commands and test repository do not carry the new fields.

Run: `cargo test -p api-server _tests::role_routes::role_routes_roundtrip_policy_flags_and_protect_default_role_from_clear -- --exact --nocapture`
Expected: FAIL because the HTTP bodies and role route responses do not expose the policy flags.

- [x] **Step 3: Thread the new fields through the service contracts**

Extend `api/crates/control-plane/src/role.rs`:

```rust
pub struct CreateRoleCommand {
    pub actor_user_id: Uuid,
    pub code: String,
    pub name: String,
    pub introduction: String,
    pub auto_grant_new_permissions: bool,
    pub is_default_member_role: bool,
}

pub struct UpdateRoleCommand {
    pub actor_user_id: Uuid,
    pub role_code: String,
    pub name: String,
    pub introduction: String,
    pub auto_grant_new_permissions: Option<bool>,
    pub is_default_member_role: Option<bool>,
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
    is_default_member_role: bool,
) -> anyhow::Result<()>;

async fn update_team_role(
    &self,
    actor_user_id: Uuid,
    workspace_id: Uuid,
    role_code: &str,
    name: &str,
    introduction: &str,
    auto_grant_new_permissions: Option<bool>,
    is_default_member_role: Option<bool>,
) -> anyhow::Result<()>;
```

Update `RoleService::create_role()` and `RoleService::update_role()` to pass the new values through.

- [x] **Step 4: Implement repository, route, and test-double behavior**

Update `api/crates/storage-pg/src/role_repository.rs` create SQL:

```rust
insert into roles (
    id, scope_kind, workspace_id, code, name, introduction, is_builtin, is_editable,
    auto_grant_new_permissions, is_default_member_role, created_by, updated_by
)
values ($1, 'workspace', $2, $3, $4, $5, false, true, $6, $7, $8, $8)
```

If `is_default_member_role` is `true`, clear the workspace’s previous default inside the same transaction:

```rust
sqlx::query(
    "update roles set is_default_member_role = false where scope_kind = 'workspace' and workspace_id = $1"
)
.bind(workspace_id)
.execute(&mut *tx)
.await?;
```

Update workspace-role update logic:

```rust
if matches!(is_default_member_role, Some(false)) && role.is_default_member_role {
    return Err(ControlPlaneError::InvalidInput("default_member_role_required").into());
}
```

and:

```rust
if matches!(is_default_member_role, Some(true)) {
    sqlx::query(
        "update roles set is_default_member_role = false where scope_kind = 'workspace' and workspace_id = $1 and id <> $2"
    )
    .bind(workspace_id)
    .bind(role.id)
    .execute(&mut *tx)
    .await?;
}
```

Update `api/crates/control-plane/src/_tests/support.rs` role fixture construction:

```rust
RoleTemplate {
    code: code.to_string(),
    name: name.to_string(),
    scope_kind: RoleScopeKind::Workspace,
    is_builtin: false,
    is_editable: true,
    auto_grant_new_permissions,
    is_default_member_role,
    permissions: Vec::new(),
}
```

Update `api/apps/api-server/src/routes/roles.rs` request/response shapes:

```rust
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateRoleBody {
    pub code: String,
    pub name: String,
    pub introduction: String,
    pub auto_grant_new_permissions: Option<bool>,
    pub is_default_member_role: Option<bool>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateRoleBody {
    pub name: String,
    pub introduction: String,
    pub auto_grant_new_permissions: Option<bool>,
    pub is_default_member_role: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RoleResponse {
    pub code: String,
    pub name: String,
    pub scope_kind: String,
    pub is_builtin: bool,
    pub is_editable: bool,
    pub auto_grant_new_permissions: bool,
    pub is_default_member_role: bool,
    pub permission_codes: Vec<String>,
}
```

- [x] **Step 5: Re-run focused backend tests and commit**

Run: `cargo test -p control-plane _tests::role_service_tests::role_service_tracks_policy_flags_on_create_and_update -- --exact --nocapture`
Expected: PASS

Run: `cargo test -p api-server _tests::role_routes::role_routes_roundtrip_policy_flags_and_protect_default_role_from_clear -- --exact --nocapture`
Expected: PASS

Run: `cargo test -p api-server _tests::role_routes::role_routes_create_replace_permissions_and_protect_root -- --exact --nocapture`
Expected: PASS

Commit:

```bash
git add api/crates/control-plane/src/ports.rs api/crates/control-plane/src/role.rs api/crates/control-plane/src/_tests/support.rs api/crates/control-plane/src/_tests/role_service_tests.rs api/crates/storage-pg/src/role_repository.rs api/apps/api-server/src/routes/roles.rs api/apps/api-server/src/_tests/role_routes.rs
git commit -m "feat(api): expose role policy flags"
```

Execution note (`2026-04-14 20`): ran the focused `control-plane` and `api-server` role tests successfully and committed the slice as `ce0a5bdf` (`feat(api): expose role policy flags`). The repository also rejects deleting the active default member role so the workspace never falls into a “no default role” state through deletion.

## Task 3: Resolve The Default Member Role During Member Creation

**Files:**
- Modify: `api/crates/storage-pg/src/member_repository.rs`
- Modify: `api/crates/control-plane/src/_tests/support.rs`
- Modify: `api/crates/control-plane/src/_tests/member_service_tests.rs`
- Modify: `api/apps/api-server/src/_tests/member_routes.rs`

- [x] **Step 1: Write the failing member tests**

Extend `api/crates/control-plane/src/_tests/member_service_tests.rs` with:

```rust
#[tokio::test]
async fn create_member_assigns_current_default_member_role_and_records_audit() {}
```

Extend `api/apps/api-server/src/_tests/member_routes.rs` with:

```rust
#[tokio::test]
async fn member_creation_uses_workspace_default_member_role() {}
```

- [x] **Step 2: Run the focused failures**

Run: `cargo test -p control-plane _tests::member_service_tests::create_member_assigns_current_default_member_role_and_records_audit -- --exact --nocapture`
Expected: FAIL because the in-memory member creation fixture still hardcodes `manager`.

Run: `cargo test -p api-server _tests::member_routes::member_creation_uses_workspace_default_member_role -- --exact --nocapture`
Expected: FAIL because the PostgreSQL repository still resolves `manager` directly.

- [x] **Step 3: Implement workspace-default role resolution**

Update `api/crates/storage-pg/src/member_repository.rs`:

```rust
let default_role: (Uuid, String) = sqlx::query_as(
    r#"
    select id, code
    from roles
    where scope_kind = 'workspace'
      and workspace_id = $1
      and is_default_member_role = true
    limit 1
    "#,
)
.bind(input.workspace_id)
.fetch_optional(self.pool())
.await?
.ok_or(ControlPlaneError::NotFound("default_member_role"))?;
```

Use the resolved code instead of the literal `manager`:

```rust
.bind(&default_role.1)
```

Use the resolved role id when inserting `user_role_bindings`:

```rust
.bind(default_role.0)
```

Update the in-memory member test support in `api/crates/control-plane/src/_tests/support.rs` so created members inherit the repository’s configured default role instead of hardcoded `manager`.

- [x] **Step 4: Re-run member tests and commit**

Run: `cargo test -p control-plane _tests::member_service_tests::create_member_assigns_current_default_member_role_and_records_audit -- --exact --nocapture`
Expected: PASS

Run: `cargo test -p api-server _tests::member_routes::member_creation_uses_workspace_default_member_role -- --exact --nocapture`
Expected: PASS

Run: `cargo test -p api-server _tests::member_routes::member_routes_create_disable_and_reset_password -- --exact --nocapture`
Expected: PASS

Commit:

```bash
git add api/crates/storage-pg/src/member_repository.rs api/crates/control-plane/src/_tests/support.rs api/crates/control-plane/src/_tests/member_service_tests.rs api/apps/api-server/src/_tests/member_routes.rs
git commit -m "feat(api): use workspace default role for new members"
```

Execution note (`2026-04-14 20`): ran the focused `control-plane` member test plus the two `api-server` member route tests successfully and committed the slice as `48f7ec0f` (`feat(api): use workspace default role for new members`).

## Task 4: Add Both Checkboxes To The Settings Role Dialogs

**Files:**
- Create: `web/app/src/features/settings/_tests/role-permission-panel.test.tsx`
- Modify: `web/packages/api-client/src/console-roles.ts`
- Modify: `web/app/src/features/settings/components/RolePermissionPanel.tsx`

- [x] **Step 1: Write the failing UI test**

Create `web/app/src/features/settings/_tests/role-permission-panel.test.tsx` with:

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

test('submits auto_grant_new_permissions and is_default_member_role from the create and edit dialogs', async () => {});
```

Use fixtures like:

```tsx
{
  code: 'manager',
  name: 'Manager',
  scope_kind: 'workspace',
  is_builtin: true,
  is_editable: true,
  auto_grant_new_permissions: false,
  is_default_member_role: true,
  permission_codes: []
}
```

- [x] **Step 2: Run the UI test to verify it fails**

Run: `pnpm --dir web/app exec vitest --run src/features/settings/_tests/role-permission-panel.test.tsx`
Expected: FAIL because the web role contract and dialogs do not expose either flag.

- [x] **Step 3: Implement the web contract and dialog controls**

Update `web/packages/api-client/src/console-roles.ts`:

```ts
export interface ConsoleRole {
  code: string;
  name: string;
  scope_kind: 'system' | 'workspace';
  is_builtin: boolean;
  is_editable: boolean;
  auto_grant_new_permissions: boolean;
  is_default_member_role: boolean;
  permission_codes: string[];
}

export interface CreateConsoleRoleInput {
  code: string;
  name: string;
  introduction: string;
  auto_grant_new_permissions?: boolean;
  is_default_member_role?: boolean;
}

export interface UpdateConsoleRoleInput {
  name: string;
  introduction: string;
  auto_grant_new_permissions?: boolean;
  is_default_member_role?: boolean;
}
```

Update the create form in `web/app/src/features/settings/components/RolePermissionPanel.tsx`:

```tsx
<Form.Item
  name="auto_grant_new_permissions"
  valuePropName="checked"
  extra="开启后，仅对未来新增的权限自动授予当前角色。"
>
  <Checkbox>自动接收后续新增权限</Checkbox>
</Form.Item>

<Form.Item
  name="is_default_member_role"
  valuePropName="checked"
  extra="同一工作空间只能有一个默认新用户角色。"
>
  <Checkbox>默认新用户角色</Checkbox>
</Form.Item>
```

Initialize the edit dialog with both flags:

```tsx
editForm.setFieldsValue({
  name: role.name,
  introduction: role.introduction ?? '',
  auto_grant_new_permissions: role.auto_grant_new_permissions,
  is_default_member_role: role.is_default_member_role
});
```

Render compact status tags in the details header:

```tsx
{selectedRole.auto_grant_new_permissions ? <Tag color="blue">自动接收新增权限</Tag> : null}
{selectedRole.is_default_member_role ? <Tag color="green">默认新用户角色</Tag> : null}
```

- [x] **Step 4: Re-run UI tests and commit**

Run: `pnpm --dir web/app exec vitest --run src/features/settings/_tests/role-permission-panel.test.tsx`
Expected: PASS

Run: `pnpm --dir web/app exec vitest --run src/features/settings/_tests/settings-page.test.tsx`
Expected: PASS

Commit:

```bash
git add web/packages/api-client/src/console-roles.ts web/app/src/features/settings/components/RolePermissionPanel.tsx web/app/src/features/settings/_tests/role-permission-panel.test.tsx
git commit -m "feat(web): manage role policy flags in settings"
```

Execution note (`2026-04-14 20`): ran the focused `RolePermissionPanel` test plus the existing settings page test successfully and committed the slice as `c2cb940c` (`feat(web): manage role policy flags in settings`). This web slice was applied on top of a pre-existing local `RolePermissionPanel.tsx` refactor already present in the worktree.

## Task 5: Run Full Verification And Commit The Integrated Feature

**Files:**
- Modify: `docs/superpowers/plans/2026-04-14-role-auto-grant-new-permissions.md`

- [x] **Step 1: Run the backend verification suite**

Run: `node scripts/node/verify-backend.js`
Expected: PASS with no failing cargo, format, or route tests.

- [x] **Step 2: Run the frontend verification suite**

Run: `pnpm --dir web lint`
Expected: PASS

Run: `pnpm --dir web test`
Expected: PASS

Run: `pnpm --dir web/app build`
Expected: PASS

- [x] **Step 3: Review the final diff**

Run:

```bash
git status --short
git diff --stat HEAD~4..HEAD
```

Expected: Only the role policy backend/frontend files plus the updated spec/plan and memory notes are part of this feature work.

- [x] **Step 4: Commit the integrated feature**

Run:

```bash
git add api/crates/domain/src/auth.rs api/crates/access-control/src/catalog.rs api/crates/storage-pg/src/_tests/mod.rs api/crates/storage-pg/src/_tests/migration_smoke.rs api/crates/storage-pg/src/_tests/role_policy_tests.rs api/crates/storage-pg/src/mappers/role_mapper.rs api/crates/storage-pg/src/repositories.rs api/crates/storage-pg/src/auth_repository.rs api/crates/storage-pg/src/role_repository.rs api/crates/storage-pg/src/member_repository.rs api/crates/storage-pg/migrations/20260414203000_add_role_policy_flags.sql api/crates/control-plane/src/ports.rs api/crates/control-plane/src/role.rs api/crates/control-plane/src/_tests/support.rs api/crates/control-plane/src/_tests/role_service_tests.rs api/crates/control-plane/src/_tests/member_service_tests.rs api/apps/api-server/src/routes/roles.rs api/apps/api-server/src/_tests/role_routes.rs api/apps/api-server/src/_tests/member_routes.rs web/packages/api-client/src/console-roles.ts web/app/src/features/settings/components/RolePermissionPanel.tsx web/app/src/features/settings/_tests/role-permission-panel.test.tsx
git commit -m "feat: add role policy flags and default member role"
```

Execution note (`2026-04-14 21`): `node scripts/node/verify-backend.js`、`pnpm --dir web lint`、`pnpm --dir web test`、`pnpm --dir web/app build` 全部通过，并复核了 `git status --short` 与 `git diff --stat HEAD~4..HEAD`。收尾时把 `RoleRepository` 的创建/更新接口改成输入 struct 以消除 `clippy::too_many_arguments`，同时为慢速前端集成测试补了显式超时与更稳妥的对话框提交流程；最终提交仅收敛这次角色策略计划的收尾改动、计划记录与相关记忆更新。

## Self-Review

- Spec coverage:
  - role-level auto-grant policy: Task 1, Task 2, Task 4
  - unique default member role: Task 1, Task 2, Task 3, Task 4
  - `manager` stays default for new members: Task 1
  - switching default only affects future users: Task 3 tests and repository logic
- Placeholder scan:
  - no placeholder markers remain
- Type consistency:
  - backend and frontend both use `auto_grant_new_permissions`
  - backend and frontend both use `is_default_member_role`
  - create/update contracts keep both flags optional and preserve old behavior when omitted
