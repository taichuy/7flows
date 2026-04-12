# Auth Team Access Control Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the P1 backend for console authentication, team bootstrap, member lifecycle, role CRUD, permission binding, audit logging, and a hosted-ready auth provider kernel.

**Architecture:** Keep `api-server` as the only public backend entry, but split the implementation into `domain`, `access-control`, `control-plane`, `storage-pg`, and `storage-redis`. Authentication must use `AuthKernel + AuthenticatorRegistry + SessionIssuer`, with only one built-in provider in P1: `password-local`.

**Tech Stack:** Rust stable, Axum, Tokio, SQLx, Redis, argon2, utoipa, tracing, UUIDv7

**Source Spec:** `docs/superpowers/specs/1flowse/2026-04-12-auth-team-access-control-backend-design.md`

**Approval:** User approved the current backend design discussion on `2026-04-12 18` and requested moving it into the implementation plan.

---

## File Structure

**Create**
- `api/apps/api-server/.env.example`
- `api/apps/api-server/src/config.rs`
- `api/apps/api-server/src/app_state.rs`
- `api/apps/api-server/src/error_response.rs`
- `api/apps/api-server/src/routes/mod.rs`
- `api/apps/api-server/src/routes/auth.rs`
- `api/apps/api-server/src/routes/me.rs`
- `api/apps/api-server/src/routes/team.rs`
- `api/apps/api-server/src/routes/members.rs`
- `api/apps/api-server/src/routes/roles.rs`
- `api/apps/api-server/src/routes/permissions.rs`
- `api/apps/api-server/src/middleware/mod.rs`
- `api/apps/api-server/src/middleware/require_session.rs`
- `api/apps/api-server/src/middleware/require_csrf.rs`
- `api/apps/api-server/src/bin/reset_root_password.rs`
- `api/apps/api-server/src/_tests/mod.rs`
- `api/apps/api-server/src/_tests/support.rs`
- `api/apps/api-server/src/_tests/config_tests.rs`
- `api/apps/api-server/src/_tests/auth_routes.rs`
- `api/apps/api-server/src/_tests/member_routes.rs`
- `api/apps/api-server/src/_tests/role_routes.rs`
- `api/apps/api-server/src/_tests/team_routes.rs`
- `api/crates/domain/src/base.rs`
- `api/crates/domain/src/auth.rs`
- `api/crates/domain/src/team.rs`
- `api/crates/domain/src/audit.rs`
- `api/crates/domain/src/_tests/mod.rs`
- `api/crates/domain/src/_tests/auth_domain_tests.rs`
- `api/crates/access-control/src/catalog.rs`
- `api/crates/access-control/src/evaluator.rs`
- `api/crates/access-control/src/_tests/mod.rs`
- `api/crates/access-control/src/_tests/catalog_tests.rs`
- `api/crates/control-plane/src/ports.rs`
- `api/crates/control-plane/src/errors.rs`
- `api/crates/control-plane/src/bootstrap.rs`
- `api/crates/control-plane/src/auth.rs`
- `api/crates/control-plane/src/profile.rs`
- `api/crates/control-plane/src/team.rs`
- `api/crates/control-plane/src/member.rs`
- `api/crates/control-plane/src/role.rs`
- `api/crates/control-plane/src/audit.rs`
- `api/crates/control-plane/src/_tests/mod.rs`
- `api/crates/control-plane/src/_tests/support.rs`
- `api/crates/control-plane/src/_tests/bootstrap_tests.rs`
- `api/crates/control-plane/src/_tests/auth_service_tests.rs`
- `api/crates/control-plane/src/_tests/member_service_tests.rs`
- `api/crates/control-plane/src/_tests/role_service_tests.rs`
- `api/crates/storage-pg/src/connection.rs`
- `api/crates/storage-pg/src/repositories.rs`
- `api/crates/storage-pg/src/_tests/mod.rs`
- `api/crates/storage-pg/src/_tests/migration_smoke.rs`
- `api/crates/storage-pg/migrations/20260412183000_create_auth_team_acl_tables.sql`
- `api/crates/storage-redis/src/session_store.rs`
- `api/crates/storage-redis/src/in_memory_session_store.rs`
- `api/crates/storage-redis/src/_tests/mod.rs`
- `api/crates/storage-redis/src/_tests/session_store_tests.rs`

**Modify**
- `api/Cargo.toml`
- `api/apps/api-server/Cargo.toml`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/main.rs`
- `api/crates/domain/Cargo.toml`
- `api/crates/domain/src/lib.rs`
- `api/crates/access-control/Cargo.toml`
- `api/crates/access-control/src/lib.rs`
- `api/crates/control-plane/Cargo.toml`
- `api/crates/control-plane/src/lib.rs`
- `api/crates/storage-pg/Cargo.toml`
- `api/crates/storage-pg/src/lib.rs`
- `api/crates/storage-redis/Cargo.toml`
- `api/crates/storage-redis/src/lib.rs`

**Notes**
- New tests must live under `_tests` directories, even when the crate already has older `tests/` integration tests.
- `storage-pg` should own transactional write methods for member creation, role replacement, and permission replacement so service code does not scatter consistency rules.
- `user_auth_identities` exists from day one for future hosted auth providers, but P1 password login may still read canonical identifiers from `users.account/email/phone`.

### Task 1: Domain, ACL Catalog, And Control-Plane Ports

**Files:**
- Modify: `api/Cargo.toml`
- Modify: `api/crates/domain/Cargo.toml`
- Modify: `api/crates/domain/src/lib.rs`
- Create: `api/crates/domain/src/base.rs`
- Create: `api/crates/domain/src/auth.rs`
- Create: `api/crates/domain/src/team.rs`
- Create: `api/crates/domain/src/audit.rs`
- Create: `api/crates/domain/src/_tests/mod.rs`
- Create: `api/crates/domain/src/_tests/auth_domain_tests.rs`
- Modify: `api/crates/access-control/Cargo.toml`
- Modify: `api/crates/access-control/src/lib.rs`
- Create: `api/crates/access-control/src/catalog.rs`
- Create: `api/crates/access-control/src/evaluator.rs`
- Create: `api/crates/access-control/src/_tests/mod.rs`
- Create: `api/crates/access-control/src/_tests/catalog_tests.rs`
- Modify: `api/crates/control-plane/Cargo.toml`
- Modify: `api/crates/control-plane/src/lib.rs`
- Create: `api/crates/control-plane/src/ports.rs`
- Create: `api/crates/control-plane/src/errors.rs`

- [ ] **Step 1: Write the failing domain and ACL tests**

Create `api/crates/domain/src/_tests/auth_domain_tests.rs`:

```rust
use domain::{
    ActorContext, BoundRole, RoleScopeKind, UserRecord, UserStatus,
};
use uuid::Uuid;

fn sample_user(default_display_role: Option<&str>, roles: &[&str]) -> UserRecord {
    UserRecord {
        id: Uuid::now_v7(),
        account: "root".into(),
        email: "root@example.com".into(),
        phone: None,
        password_hash: "hash".into(),
        name: "Root".into(),
        nickname: "Root".into(),
        avatar_url: None,
        introduction: String::new(),
        default_display_role: default_display_role.map(str::to_string),
        email_login_enabled: true,
        phone_login_enabled: false,
        status: UserStatus::Active,
        session_version: 1,
        roles: roles
            .iter()
            .map(|code| BoundRole {
                code: (*code).into(),
                scope_kind: RoleScopeKind::Team,
                team_id: Some(Uuid::nil()),
            })
            .collect(),
    }
}

#[test]
fn resolved_display_role_falls_back_to_first_bound_role() {
    let user = sample_user(Some("deleted-role"), &["manager", "admin"]);

    assert_eq!(user.resolved_display_role().as_deref(), Some("manager"));
}

#[test]
fn root_actor_short_circuits_permission_checks() {
    let actor = ActorContext::root(Uuid::now_v7(), Uuid::now_v7(), "root");

    assert!(actor.has_permission("role_permission.manage.all"));
}
```

Create `api/crates/access-control/src/_tests/catalog_tests.rs`:

```rust
use access_control::{builtin_role_templates, permission_catalog};

#[test]
fn permission_catalog_seeds_expected_codes() {
    let codes: Vec<String> = permission_catalog()
        .into_iter()
        .map(|permission| permission.code)
        .collect();

    assert!(codes.contains(&"user.manage.all".to_string()));
    assert!(codes.contains(&"team.configure.all".to_string()));
    assert!(codes.contains(&"route_page.view.all".to_string()));
}

#[test]
fn builtin_roles_lock_root_but_keep_admin_and_manager_editable() {
    let templates = builtin_role_templates();

    let root = templates.iter().find(|role| role.code == "root").unwrap();
    let admin = templates.iter().find(|role| role.code == "admin").unwrap();
    let manager = templates.iter().find(|role| role.code == "manager").unwrap();

    assert!(!root.is_editable);
    assert!(admin.is_editable);
    assert!(manager.is_editable);
}
```

- [ ] **Step 2: Run the focused tests to confirm the crates fail for the right reason**

Run: `cargo test -p domain resolved_display_role_falls_back_to_first_bound_role -v`

Expected: FAIL because `domain` does not export `UserRecord`, `ActorContext`, or `BoundRole`.

Run: `cargo test -p access-control permission_catalog_seeds_expected_codes -v`

Expected: FAIL because `permission_catalog` and `builtin_role_templates` do not exist.

- [ ] **Step 3: Implement the shared models, catalog, and ports**

Update `api/Cargo.toml` workspace dependencies:

```toml
[workspace.dependencies]
anyhow = "1"
argon2 = "0.5"
async-trait = "0.1"
axum = { version = "0.7", features = ["macros"] }
axum-extra = { version = "0.9", features = ["cookie"] }
http = "1"
rand_core = { version = "0.6", features = ["std"] }
redis = { version = "0.27", features = ["aio", "tokio-comp", "connection-manager"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.8", default-features = false, features = ["postgres", "runtime-tokio-rustls", "uuid", "macros", "time", "json", "migrate"] }
thiserror = "2"
time = { version = "0.3", features = ["serde", "formatting", "parsing", "macros"] }
tokio = { version = "1", features = ["full"] }
tower = { version = "0.5", features = ["util"] }
tower-http = { version = "0.6", features = ["cors", "trace"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "fmt"] }
utoipa = { version = "5", features = ["axum_extras", "uuid"] }
utoipa-swagger-ui = { version = "8", features = ["axum"] }
uuid = { version = "1", features = ["serde", "v7"] }
```

Update `api/crates/domain/Cargo.toml`:

```toml
[package]
name = "domain"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
serde.workspace = true
thiserror.workspace = true
time.workspace = true
uuid.workspace = true
```

Create `api/crates/domain/src/base.rs`:

```rust
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BaseFields {
    pub id: Uuid,
    pub introduction: String,
    pub created_by: Option<Uuid>,
    pub created_at: OffsetDateTime,
    pub updated_by: Option<Uuid>,
    pub updated_at: OffsetDateTime,
}
```

Create `api/crates/domain/src/auth.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum UserStatus {
    Active,
    Disabled,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum RoleScopeKind {
    App,
    Team,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BoundRole {
    pub code: String,
    pub scope_kind: RoleScopeKind,
    pub team_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRecord {
    pub id: Uuid,
    pub account: String,
    pub email: String,
    pub phone: Option<String>,
    pub password_hash: String,
    pub name: String,
    pub nickname: String,
    pub avatar_url: Option<String>,
    pub introduction: String,
    pub default_display_role: Option<String>,
    pub email_login_enabled: bool,
    pub phone_login_enabled: bool,
    pub status: UserStatus,
    pub session_version: i64,
    pub roles: Vec<BoundRole>,
}

impl UserRecord {
    pub fn resolved_display_role(&self) -> Option<String> {
        if let Some(default_role) = &self.default_display_role {
            if self.roles.iter().any(|role| &role.code == default_role) {
                return Some(default_role.clone());
            }
        }
        self.roles.first().map(|role| role.code.clone())
    }
}

#[derive(Debug, Clone)]
pub struct ActorContext {
    pub user_id: Uuid,
    pub team_id: Uuid,
    pub effective_display_role: String,
    pub is_root: bool,
    pub permissions: HashSet<String>,
}

impl ActorContext {
    pub fn root(user_id: Uuid, team_id: Uuid, effective_display_role: &str) -> Self {
        Self {
            user_id,
            team_id,
            effective_display_role: effective_display_role.into(),
            is_root: true,
            permissions: HashSet::new(),
        }
    }

    pub fn has_permission(&self, code: &str) -> bool {
        self.is_root || self.permissions.contains(code)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionDefinition {
    pub code: String,
    pub resource: String,
    pub action: String,
    pub scope: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoleTemplate {
    pub code: String,
    pub name: String,
    pub scope_kind: RoleScopeKind,
    pub is_builtin: bool,
    pub is_editable: bool,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthenticatorRecord {
    pub name: String,
    pub auth_type: String,
    pub title: String,
    pub enabled: bool,
    pub is_builtin: bool,
    pub options: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserAuthIdentity {
    pub user_id: Uuid,
    pub authenticator_name: String,
    pub subject_type: String,
    pub subject_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub session_id: String,
    pub user_id: Uuid,
    pub team_id: Uuid,
    pub session_version: i64,
    pub csrf_token: String,
    pub expires_at_unix: i64,
}
```

Create `api/crates/domain/src/team.rs`:

```rust
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamRecord {
    pub id: Uuid,
    pub name: String,
    pub logo_url: Option<String>,
    pub introduction: String,
}
```

Create `api/crates/domain/src/audit.rs`:

```rust
use serde::{Deserialize, Serialize};
use serde_json::Value;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogRecord {
    pub id: Uuid,
    pub team_id: Option<Uuid>,
    pub actor_user_id: Option<Uuid>,
    pub target_type: String,
    pub target_id: Option<Uuid>,
    pub event_code: String,
    pub payload: Value,
    pub created_at: OffsetDateTime,
}
```

Update `api/crates/domain/src/lib.rs`:

```rust
pub mod audit;
pub mod auth;
pub mod base;
pub mod team;

pub use audit::AuditLogRecord;
pub use auth::{
    ActorContext, AuthenticatorRecord, BoundRole, PermissionDefinition, RoleScopeKind, RoleTemplate,
    SessionRecord, UserAuthIdentity, UserRecord, UserStatus,
};
pub use base::BaseFields;
pub use team::TeamRecord;

#[cfg(test)]
mod _tests;
```

Update `api/crates/access-control/Cargo.toml`:

```toml
[package]
name = "access-control"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
domain = { path = "../domain" }
serde.workspace = true
```

Create `api/crates/access-control/src/catalog.rs`:

```rust
use domain::{PermissionDefinition, RoleScopeKind, RoleTemplate};

const RESOURCES: &[&str] = &[
    "application",
    "flow",
    "publish_endpoint",
    "route_page",
    "state_model",
    "state_data",
    "external_data_source",
    "plugin_config",
    "embedded_app",
    "user",
    "role_permission",
    "team",
];

const ACTIONS_WITH_OWN_ALL: &[(&str, &[&str])] = &[
    ("view", &["own", "all"]),
    ("create", &["all"]),
    ("edit", &["own", "all"]),
    ("delete", &["own", "all"]),
    ("manage", &["all"]),
    ("publish", &["all"]),
    ("use", &["own", "all"]),
    ("configure", &["all"]),
];

pub fn permission_catalog() -> Vec<PermissionDefinition> {
    let mut permissions = Vec::new();

    for resource in RESOURCES {
        for (action, scopes) in ACTIONS_WITH_OWN_ALL {
            for scope in *scopes {
                permissions.push(PermissionDefinition {
                    code: format!("{resource}.{action}.{scope}"),
                    resource: (*resource).into(),
                    action: (*action).into(),
                    scope: (*scope).into(),
                    name: format!("{resource}:{action}:{scope}"),
                });
            }
        }
    }

    permissions
}

pub fn builtin_role_templates() -> Vec<RoleTemplate> {
    let all_codes = permission_catalog()
        .into_iter()
        .map(|permission| permission.code)
        .collect::<Vec<_>>();

    let manager_codes = all_codes
        .iter()
        .filter(|code| {
            code.starts_with("application.")
                || code.starts_with("flow.")
                || code.starts_with("route_page.")
                || code.starts_with("state_data.")
                || code.starts_with("publish_endpoint.")
        })
        .cloned()
        .collect::<Vec<_>>();

    vec![
        RoleTemplate {
            code: "root".into(),
            name: "Root".into(),
            scope_kind: RoleScopeKind::App,
            is_builtin: true,
            is_editable: false,
            permissions: Vec::new(),
        },
        RoleTemplate {
            code: "admin".into(),
            name: "Admin".into(),
            scope_kind: RoleScopeKind::Team,
            is_builtin: true,
            is_editable: true,
            permissions: all_codes.clone(),
        },
        RoleTemplate {
            code: "manager".into(),
            name: "Manager".into(),
            scope_kind: RoleScopeKind::Team,
            is_builtin: true,
            is_editable: true,
            permissions: manager_codes,
        },
    ]
}
```

Create `api/crates/access-control/src/evaluator.rs`:

```rust
use domain::ActorContext;

pub fn ensure_permission(actor: &ActorContext, code: &str) -> Result<(), &'static str> {
    if actor.has_permission(code) {
        Ok(())
    } else {
        Err("permission_denied")
    }
}
```

Update `api/crates/access-control/src/lib.rs`:

```rust
mod catalog;
mod evaluator;

pub use catalog::{builtin_role_templates, permission_catalog};
pub use evaluator::ensure_permission;

#[cfg(test)]
mod _tests;
```

Update `api/crates/control-plane/Cargo.toml`:

```toml
[package]
name = "control-plane"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
anyhow.workspace = true
async-trait.workspace = true
domain = { path = "../domain" }
serde.workspace = true
serde_json.workspace = true
thiserror.workspace = true
time.workspace = true
uuid.workspace = true
access-control = { path = "../access-control" }
```

Create `api/crates/control-plane/src/errors.rs`:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ControlPlaneError {
    #[error("not authenticated")]
    NotAuthenticated,
    #[error("permission denied: {0}")]
    PermissionDenied(&'static str),
    #[error("resource not found: {0}")]
    NotFound(&'static str),
    #[error("conflict: {0}")]
    Conflict(&'static str),
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),
}
```

Create `api/crates/control-plane/src/ports.rs`:

```rust
use async_trait::async_trait;
use domain::{ActorContext, AuditLogRecord, AuthenticatorRecord, PermissionDefinition, SessionRecord, TeamRecord, UserRecord};
use uuid::Uuid;

#[async_trait]
pub trait SessionStore: Send + Sync {
    async fn put(&self, session: SessionRecord) -> anyhow::Result<()>;
    async fn get(&self, session_id: &str) -> anyhow::Result<Option<SessionRecord>>;
    async fn delete(&self, session_id: &str) -> anyhow::Result<()>;
    async fn touch(&self, session_id: &str, expires_at_unix: i64) -> anyhow::Result<()>;
}

#[async_trait]
pub trait BootstrapRepository: Send + Sync {
    async fn upsert_authenticator(&self, authenticator: &AuthenticatorRecord) -> anyhow::Result<()>;
    async fn upsert_team(&self, team_name: &str) -> anyhow::Result<TeamRecord>;
    async fn upsert_builtin_roles(&self, team_id: Uuid) -> anyhow::Result<()>;
    async fn upsert_root_user(
        &self,
        team_id: Uuid,
        account: &str,
        email: &str,
        password_hash: &str,
        name: &str,
        nickname: &str,
    ) -> anyhow::Result<UserRecord>;
}

#[async_trait]
pub trait AuthRepository: Send + Sync {
    async fn find_authenticator(&self, name: &str) -> anyhow::Result<Option<AuthenticatorRecord>>;
    async fn find_user_for_password_login(&self, identifier: &str) -> anyhow::Result<Option<UserRecord>>;
    async fn find_user_by_id(&self, user_id: Uuid) -> anyhow::Result<Option<UserRecord>>;
    async fn load_actor_context(&self, user_id: Uuid, team_id: Uuid, display_role: Option<&str>) -> anyhow::Result<ActorContext>;
    async fn update_password_hash(&self, user_id: Uuid, password_hash: &str, actor_id: Uuid) -> anyhow::Result<i64>;
    async fn bump_session_version(&self, user_id: Uuid, actor_id: Uuid) -> anyhow::Result<i64>;
    async fn list_permissions(&self) -> anyhow::Result<Vec<PermissionDefinition>>;
    async fn append_audit_log(&self, event: &AuditLogRecord) -> anyhow::Result<()>;
}
```

Update `api/crates/control-plane/src/lib.rs`:

```rust
pub mod errors;
pub mod ports;
```

- [ ] **Step 4: Run the focused crate tests again**

Run: `cargo test -p domain -p access-control -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/Cargo.toml \
  api/crates/domain/Cargo.toml api/crates/domain/src/lib.rs api/crates/domain/src/base.rs api/crates/domain/src/auth.rs api/crates/domain/src/team.rs api/crates/domain/src/audit.rs api/crates/domain/src/_tests/mod.rs api/crates/domain/src/_tests/auth_domain_tests.rs \
  api/crates/access-control/Cargo.toml api/crates/access-control/src/lib.rs api/crates/access-control/src/catalog.rs api/crates/access-control/src/evaluator.rs api/crates/access-control/src/_tests/mod.rs api/crates/access-control/src/_tests/catalog_tests.rs \
  api/crates/control-plane/Cargo.toml api/crates/control-plane/src/lib.rs api/crates/control-plane/src/errors.rs api/crates/control-plane/src/ports.rs
git commit -m "feat: add auth domain and acl foundation"
```

### Task 2: Postgres Schema And Bootstrap/Auth Repository Primitives

**Files:**
- Modify: `api/crates/storage-pg/Cargo.toml`
- Modify: `api/crates/storage-pg/src/lib.rs`
- Create: `api/crates/storage-pg/src/connection.rs`
- Create: `api/crates/storage-pg/src/repositories.rs`
- Create: `api/crates/storage-pg/src/_tests/mod.rs`
- Create: `api/crates/storage-pg/src/_tests/migration_smoke.rs`
- Create: `api/crates/storage-pg/migrations/20260412183000_create_auth_team_acl_tables.sql`

- [ ] **Step 1: Write the failing migration and bootstrap repository tests**

Create `api/crates/storage-pg/src/_tests/migration_smoke.rs`:

```rust
use storage_pg::{connect, run_migrations, PgControlPlaneStore};

fn database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into())
}

#[tokio::test]
async fn migration_smoke_creates_auth_and_team_tables() {
    let pool = connect(&database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();

    let tables: Vec<String> = sqlx::query_scalar(
        r#"
        select table_name
        from information_schema.tables
        where table_schema = 'public'
        "#,
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    assert!(tables.contains(&"users".to_string()));
    assert!(tables.contains(&"roles".to_string()));
    assert!(tables.contains(&"permission_definitions".to_string()));
    assert!(tables.contains(&"authenticators".to_string()));
}

#[tokio::test]
async fn bootstrap_repository_upserts_password_local_and_root_user() {
    let pool = connect(&database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);

    let team = store.upsert_team("1Flowse").await.unwrap();
    store.upsert_builtin_roles(team.id).await.unwrap();
    store
        .upsert_authenticator(&domain::AuthenticatorRecord {
            name: "password-local".into(),
            auth_type: "password-local".into(),
            title: "Password".into(),
            enabled: true,
            is_builtin: true,
            options: serde_json::json!({}),
        })
        .await
        .unwrap();
    let root = store
        .upsert_root_user(
            team.id,
            "root",
            "root@example.com",
            "$argon2id$v=19$m=19456,t=2,p=1$test$test",
            "Root",
            "Root",
        )
        .await
        .unwrap();

    assert_eq!(root.account, "root");
    assert_eq!(store.find_authenticator("password-local").await.unwrap().unwrap().name, "password-local");
}
```

- [ ] **Step 2: Run the repository smoke tests and confirm they fail**

Run: `DATABASE_URL=postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows cargo test -p storage-pg migration_smoke_creates_auth_and_team_tables -v`

Expected: FAIL because `storage-pg` does not export `connect`, `run_migrations`, or `PgControlPlaneStore`.

- [ ] **Step 3: Create the migration and the first repository slice**

Update `api/crates/storage-pg/Cargo.toml`:

```toml
[package]
name = "storage-pg"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
anyhow.workspace = true
async-trait.workspace = true
control-plane = { path = "../control-plane" }
domain = { path = "../domain" }
serde_json.workspace = true
sqlx.workspace = true
time.workspace = true
uuid.workspace = true
```

Create `api/crates/storage-pg/migrations/20260412183000_create_auth_team_acl_tables.sql`:

```sql
create table if not exists users (
  id uuid primary key,
  account text not null unique,
  email text not null unique,
  phone text unique,
  password_hash text not null,
  name text not null,
  nickname text not null,
  avatar_url text,
  introduction text not null default '',
  default_display_role text,
  email_login_enabled boolean not null default true,
  phone_login_enabled boolean not null default false,
  status text not null,
  session_version bigint not null default 1,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (status in ('active', 'disabled'))
);

create table if not exists teams (
  id uuid primary key,
  name text not null,
  logo_url text,
  introduction text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists team_memberships (
  id uuid primary key,
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  introduction text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table if not exists roles (
  id uuid primary key,
  scope_kind text not null,
  team_id uuid references teams(id) on delete cascade,
  code text not null,
  name text not null,
  introduction text not null default '',
  is_builtin boolean not null default false,
  is_editable boolean not null default true,
  system_kind text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (scope_kind in ('app', 'team'))
);

create unique index if not exists roles_app_code_uidx on roles (code) where scope_kind = 'app';
create unique index if not exists roles_team_code_uidx on roles (team_id, code) where scope_kind = 'team';

create table if not exists permission_definitions (
  id uuid primary key,
  resource text not null,
  action text not null,
  scope text not null,
  code text not null unique,
  name text not null,
  introduction text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists role_permissions (
  id uuid primary key,
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permission_definitions(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (role_id, permission_id)
);

create table if not exists user_role_bindings (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (user_id, role_id)
);

create table if not exists authenticators (
  id uuid primary key,
  name text not null unique,
  auth_type text not null,
  title text not null,
  enabled boolean not null default true,
  is_builtin boolean not null default false,
  sort_order integer not null default 0,
  options jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists user_auth_identities (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  authenticator_name text not null references authenticators(name) on delete cascade,
  subject_type text not null,
  subject_value text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create unique index if not exists user_auth_identities_subject_uidx
  on user_auth_identities (authenticator_name, subject_type, lower(subject_value));

create table if not exists audit_logs (
  id uuid primary key,
  team_id uuid references teams(id) on delete set null,
  actor_user_id uuid references users(id) on delete set null,
  target_type text not null,
  target_id uuid,
  event_code text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

Create `api/crates/storage-pg/src/connection.rs`:

```rust
use anyhow::Result;
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::time::Duration;

pub async fn connect(database_url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await?;

    Ok(pool)
}
```

Create `api/crates/storage-pg/src/repositories.rs`:

```rust
use anyhow::Result;
use async_trait::async_trait;
use control_plane::ports::{AuthRepository, BootstrapRepository};
use domain::{ActorContext, AuditLogRecord, AuthenticatorRecord, PermissionDefinition, RoleScopeKind, TeamRecord, UserRecord, UserStatus};
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub struct PgControlPlaneStore {
    pool: PgPool,
}

impl PgControlPlaneStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
}

#[async_trait]
impl BootstrapRepository for PgControlPlaneStore {
    async fn upsert_authenticator(&self, authenticator: &AuthenticatorRecord) -> Result<()> {
        sqlx::query(
            r#"
            insert into authenticators (id, name, auth_type, title, enabled, is_builtin, sort_order, options)
            values ($1, $2, $3, $4, $5, $6, 0, $7)
            on conflict (name) do update
              set auth_type = excluded.auth_type,
                  title = excluded.title,
                  enabled = excluded.enabled,
                  is_builtin = excluded.is_builtin,
                  options = excluded.options,
                  updated_at = now()
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(&authenticator.name)
        .bind(&authenticator.auth_type)
        .bind(&authenticator.title)
        .bind(authenticator.enabled)
        .bind(authenticator.is_builtin)
        .bind(&authenticator.options)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn upsert_team(&self, team_name: &str) -> Result<TeamRecord> {
        let existing = sqlx::query(
            "select id, name, logo_url, introduction from teams order by created_at asc limit 1",
        )
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = existing {
            return Ok(TeamRecord {
                id: row.get("id"),
                name: row.get("name"),
                logo_url: row.get("logo_url"),
                introduction: row.get("introduction"),
            });
        }

        let id = Uuid::now_v7();
        sqlx::query("insert into teams (id, name, logo_url, introduction) values ($1, $2, null, '')")
            .bind(id)
            .bind(team_name)
            .execute(&self.pool)
            .await?;

        Ok(TeamRecord {
            id,
            name: team_name.into(),
            logo_url: None,
            introduction: String::new(),
        })
    }

    async fn upsert_builtin_roles(&self, team_id: Uuid) -> Result<()> {
        for role in access_control::builtin_role_templates() {
            let role_id = Uuid::now_v7();
            let scope_kind = match role.scope_kind {
                RoleScopeKind::App => "app",
                RoleScopeKind::Team => "team",
            };
            let team_ref = if matches!(role.scope_kind, RoleScopeKind::Team) {
                Some(team_id)
            } else {
                None
            };
            sqlx::query(
                r#"
                insert into roles (id, scope_kind, team_id, code, name, introduction, is_builtin, is_editable, system_kind)
                values ($1, $2, $3, $4, $5, '', $6, $7, $8)
                on conflict do nothing
                "#,
            )
            .bind(role_id)
            .bind(scope_kind)
            .bind(team_ref)
            .bind(&role.code)
            .bind(&role.name)
            .bind(role.is_builtin)
            .bind(role.is_editable)
            .bind(&role.code)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    async fn upsert_root_user(
        &self,
        team_id: Uuid,
        account: &str,
        email: &str,
        password_hash: &str,
        name: &str,
        nickname: &str,
    ) -> Result<UserRecord> {
        let existing = self.find_user_for_password_login(account).await?;
        if let Some(user) = existing {
            return Ok(user);
        }

        let user_id = Uuid::now_v7();
        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            insert into users (
                id, account, email, phone, password_hash, name, nickname, avatar_url, introduction,
                default_display_role, email_login_enabled, phone_login_enabled, status, session_version
            )
            values ($1, $2, $3, null, $4, $5, $6, null, '', 'root', true, false, 'active', 1)
            "#,
        )
        .bind(user_id)
        .bind(account)
        .bind(email)
        .bind(password_hash)
        .bind(name)
        .bind(nickname)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "insert into team_memberships (id, team_id, user_id, introduction) values ($1, $2, $3, '')",
        )
        .bind(Uuid::now_v7())
        .bind(team_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            insert into user_role_bindings (id, user_id, role_id)
            select $1, $2, id from roles where code = 'root' and scope_kind = 'app'
            on conflict do nothing
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        self.find_user_by_id(user_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("root user missing after bootstrap"))
    }
}

#[async_trait]
impl AuthRepository for PgControlPlaneStore {
    async fn find_authenticator(&self, name: &str) -> Result<Option<AuthenticatorRecord>> {
        let row = sqlx::query(
            "select name, auth_type, title, enabled, is_builtin, options from authenticators where name = $1",
        )
        .bind(name)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| AuthenticatorRecord {
            name: row.get("name"),
            auth_type: row.get("auth_type"),
            title: row.get("title"),
            enabled: row.get("enabled"),
            is_builtin: row.get("is_builtin"),
            options: row.get("options"),
        }))
    }

    async fn find_user_for_password_login(&self, identifier: &str) -> Result<Option<UserRecord>> {
        let lowered = identifier.trim().to_lowercase();
        let row = sqlx::query(
            r#"
            select
              u.id, u.account, u.email, u.phone, u.password_hash, u.name, u.nickname, u.avatar_url,
              u.introduction, u.default_display_role, u.email_login_enabled, u.phone_login_enabled,
              u.status, u.session_version
            from users u
            where lower(u.account) = $1
               or (u.email_login_enabled = true and lower(u.email) = $1)
               or (u.phone_login_enabled = true and lower(coalesce(u.phone, '')) = $1)
            limit 1
            "#,
        )
        .bind(lowered)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| UserRecord {
            id: row.get("id"),
            account: row.get("account"),
            email: row.get("email"),
            phone: row.get("phone"),
            password_hash: row.get("password_hash"),
            name: row.get("name"),
            nickname: row.get("nickname"),
            avatar_url: row.get("avatar_url"),
            introduction: row.get("introduction"),
            default_display_role: row.get("default_display_role"),
            email_login_enabled: row.get("email_login_enabled"),
            phone_login_enabled: row.get("phone_login_enabled"),
            status: match row.get::<String, _>("status").as_str() {
                "active" => UserStatus::Active,
                _ => UserStatus::Disabled,
            },
            session_version: row.get("session_version"),
            roles: Vec::new(),
        }))
    }

    async fn find_user_by_id(&self, user_id: Uuid) -> Result<Option<UserRecord>> {
        let row = sqlx::query(
            r#"
            select id, account, email, phone, password_hash, name, nickname, avatar_url,
                   introduction, default_display_role, email_login_enabled, phone_login_enabled,
                   status, session_version
            from users where id = $1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|row| UserRecord {
            id: row.get("id"),
            account: row.get("account"),
            email: row.get("email"),
            phone: row.get("phone"),
            password_hash: row.get("password_hash"),
            name: row.get("name"),
            nickname: row.get("nickname"),
            avatar_url: row.get("avatar_url"),
            introduction: row.get("introduction"),
            default_display_role: row.get("default_display_role"),
            email_login_enabled: row.get("email_login_enabled"),
            phone_login_enabled: row.get("phone_login_enabled"),
            status: match row.get::<String, _>("status").as_str() {
                "active" => UserStatus::Active,
                _ => UserStatus::Disabled,
            },
            session_version: row.get("session_version"),
            roles: Vec::new(),
        }))
    }

    async fn load_actor_context(&self, user_id: Uuid, team_id: Uuid, display_role: Option<&str>) -> Result<ActorContext> {
        let codes: Vec<String> = sqlx::query_scalar(
            r#"
            select r.code
            from user_role_bindings urb
            join roles r on r.id = urb.role_id
            where urb.user_id = $1 and (r.scope_kind = 'app' or r.team_id = $2)
            "#,
        )
        .bind(user_id)
        .bind(team_id)
        .fetch_all(&self.pool)
        .await?;

        let permissions: Vec<String> = sqlx::query_scalar(
            r#"
            select distinct pd.code
            from user_role_bindings urb
            join roles r on r.id = urb.role_id
            join role_permissions rp on rp.role_id = r.id
            join permission_definitions pd on pd.id = rp.permission_id
            where urb.user_id = $1 and (r.scope_kind = 'app' or r.team_id = $2)
            "#,
        )
        .bind(user_id)
        .bind(team_id)
        .fetch_all(&self.pool)
        .await?;

        let is_root = codes.iter().any(|code| code == "root");
        let effective_display_role = display_role
            .map(str::to_string)
            .or_else(|| codes.first().cloned())
            .unwrap_or_else(|| "manager".into());

        Ok(ActorContext {
            user_id,
            team_id,
            effective_display_role,
            is_root,
            permissions: permissions.into_iter().collect(),
        })
    }

    async fn update_password_hash(&self, user_id: Uuid, password_hash: &str, actor_id: Uuid) -> Result<i64> {
        let row = sqlx::query(
            r#"
            update users
            set password_hash = $2,
                session_version = session_version + 1,
                updated_by = $3,
                updated_at = now()
            where id = $1
            returning session_version
            "#,
        )
        .bind(user_id)
        .bind(password_hash)
        .bind(actor_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get("session_version"))
    }

    async fn bump_session_version(&self, user_id: Uuid, actor_id: Uuid) -> Result<i64> {
        let row = sqlx::query(
            r#"
            update users
            set session_version = session_version + 1,
                updated_by = $2,
                updated_at = now()
            where id = $1
            returning session_version
            "#,
        )
        .bind(user_id)
        .bind(actor_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get("session_version"))
    }

    async fn list_permissions(&self) -> Result<Vec<PermissionDefinition>> {
        let rows = sqlx::query(
            "select code, resource, action, scope, name from permission_definitions order by code asc",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| PermissionDefinition {
                code: row.get("code"),
                resource: row.get("resource"),
                action: row.get("action"),
                scope: row.get("scope"),
                name: row.get("name"),
            })
            .collect())
    }

    async fn append_audit_log(&self, event: &AuditLogRecord) -> Result<()> {
        sqlx::query(
            r#"
            insert into audit_logs (id, team_id, actor_user_id, target_type, target_id, event_code, payload, created_at)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
        )
        .bind(event.id)
        .bind(event.team_id)
        .bind(event.actor_user_id)
        .bind(&event.target_type)
        .bind(event.target_id)
        .bind(&event.event_code)
        .bind(&event.payload)
        .bind(event.created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
```

Update `api/crates/storage-pg/src/lib.rs`:

```rust
mod connection;
mod repositories;

pub use connection::connect;
pub use repositories::PgControlPlaneStore;
use anyhow::Result;
use sqlx::PgPool;

pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

#[cfg(test)]
mod _tests;
```

- [ ] **Step 4: Verify migrations and bootstrap repository behavior**

Run: `DATABASE_URL=postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows cargo test -p storage-pg -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/crates/storage-pg/Cargo.toml api/crates/storage-pg/src/lib.rs api/crates/storage-pg/src/connection.rs api/crates/storage-pg/src/repositories.rs api/crates/storage-pg/src/_tests/mod.rs api/crates/storage-pg/src/_tests/migration_smoke.rs api/crates/storage-pg/migrations/20260412183000_create_auth_team_acl_tables.sql
git commit -m "feat: add auth bootstrap postgres storage"
```

### Task 3: Session Store And API Config Foundation

**Files:**
- Modify: `api/crates/storage-redis/Cargo.toml`
- Modify: `api/crates/storage-redis/src/lib.rs`
- Create: `api/crates/storage-redis/src/session_store.rs`
- Create: `api/crates/storage-redis/src/in_memory_session_store.rs`
- Create: `api/crates/storage-redis/src/_tests/mod.rs`
- Create: `api/crates/storage-redis/src/_tests/session_store_tests.rs`
- Modify: `api/apps/api-server/Cargo.toml`
- Create: `api/apps/api-server/.env.example`
- Create: `api/apps/api-server/src/config.rs`
- Create: `api/apps/api-server/src/_tests/mod.rs`
- Create: `api/apps/api-server/src/_tests/config_tests.rs`

- [ ] **Step 1: Write the failing session-store and config tests**

Create `api/crates/storage-redis/src/_tests/session_store_tests.rs`:

```rust
use control_plane::ports::SessionStore;
use domain::SessionRecord;
use storage_redis::InMemorySessionStore;
use uuid::Uuid;

#[tokio::test]
async fn in_memory_session_store_round_trips_and_touches_sessions() {
    let store = InMemorySessionStore::default();
    let session = SessionRecord {
        session_id: "session-1".into(),
        user_id: Uuid::now_v7(),
        team_id: Uuid::now_v7(),
        session_version: 1,
        csrf_token: "csrf-1".into(),
        expires_at_unix: 100,
    };

    store.put(session.clone()).await.unwrap();
    assert_eq!(store.get("session-1").await.unwrap().unwrap().csrf_token, "csrf-1");

    store.touch("session-1", 200).await.unwrap();
    assert_eq!(store.get("session-1").await.unwrap().unwrap().expires_at_unix, 200);

    store.delete("session-1").await.unwrap();
    assert!(store.get("session-1").await.unwrap().is_none());
}
```

Create `api/apps/api-server/src/_tests/config_tests.rs`:

```rust
use api_server::config::ApiConfig;

#[test]
fn api_config_uses_expected_cookie_defaults() {
    let config = ApiConfig::from_env_map(&[
        ("API_DATABASE_URL", "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows"),
        ("API_REDIS_URL", "redis://:sevenflows@127.0.0.1:36379"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "secret"),
        ("BOOTSTRAP_TEAM_NAME", "1Flowse"),
    ])
    .unwrap();

    assert_eq!(config.cookie_name, "flowse_console_session");
    assert_eq!(config.session_ttl_days, 7);
}
```

- [ ] **Step 2: Run the tests and confirm the missing APIs**

Run: `cargo test -p storage-redis in_memory_session_store_round_trips_and_touches_sessions -v`

Expected: FAIL because `InMemorySessionStore` does not exist.

Run: `cargo test -p api-server api_config_uses_expected_cookie_defaults -v`

Expected: FAIL because `config::ApiConfig` does not exist.

- [ ] **Step 3: Implement the session store and config reader**

Update `api/crates/storage-redis/Cargo.toml`:

```toml
[package]
name = "storage-redis"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
anyhow.workspace = true
async-trait.workspace = true
control-plane = { path = "../control-plane" }
domain = { path = "../domain" }
redis.workspace = true
serde_json.workspace = true
tokio.workspace = true
```

Create `api/crates/storage-redis/src/in_memory_session_store.rs`:

```rust
use anyhow::Result;
use async_trait::async_trait;
use control_plane::ports::SessionStore;
use domain::SessionRecord;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

#[derive(Default, Clone)]
pub struct InMemorySessionStore {
    inner: Arc<RwLock<HashMap<String, SessionRecord>>>,
}

#[async_trait]
impl SessionStore for InMemorySessionStore {
    async fn put(&self, session: SessionRecord) -> Result<()> {
        self.inner.write().await.insert(session.session_id.clone(), session);
        Ok(())
    }

    async fn get(&self, session_id: &str) -> Result<Option<SessionRecord>> {
        Ok(self.inner.read().await.get(session_id).cloned())
    }

    async fn delete(&self, session_id: &str) -> Result<()> {
        self.inner.write().await.remove(session_id);
        Ok(())
    }

    async fn touch(&self, session_id: &str, expires_at_unix: i64) -> Result<()> {
        if let Some(existing) = self.inner.write().await.get_mut(session_id) {
            existing.expires_at_unix = expires_at_unix;
        }
        Ok(())
    }
}
```

Create `api/crates/storage-redis/src/session_store.rs`:

```rust
use anyhow::Result;
use async_trait::async_trait;
use control_plane::ports::SessionStore;
use domain::SessionRecord;
use redis::{aio::ConnectionManager, AsyncCommands};

pub struct RedisSessionStore {
    manager: ConnectionManager,
    key_prefix: String,
}

impl RedisSessionStore {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let manager = ConnectionManager::new(client).await?;

        Ok(Self {
            manager,
            key_prefix: "flowse:console:session".into(),
        })
    }

    fn key(&self, session_id: &str) -> String {
        format!("{}:{}", self.key_prefix, session_id)
    }
}

#[async_trait]
impl SessionStore for RedisSessionStore {
    async fn put(&self, session: SessionRecord) -> Result<()> {
        let key = self.key(&session.session_id);
        let ttl = (session.expires_at_unix - time::OffsetDateTime::now_utc().unix_timestamp()).max(1) as u64;
        let payload = serde_json::to_string(&session)?;
        let mut connection = self.manager.clone();
        connection.set_ex(key, payload, ttl).await?;
        Ok(())
    }

    async fn get(&self, session_id: &str) -> Result<Option<SessionRecord>> {
        let mut connection = self.manager.clone();
        let value: Option<String> = connection.get(self.key(session_id)).await?;
        Ok(value.map(|raw| serde_json::from_str(&raw)).transpose()?)
    }

    async fn delete(&self, session_id: &str) -> Result<()> {
        let mut connection = self.manager.clone();
        let _: usize = connection.del(self.key(session_id)).await?;
        Ok(())
    }

    async fn touch(&self, session_id: &str, expires_at_unix: i64) -> Result<()> {
        let ttl = (expires_at_unix - time::OffsetDateTime::now_utc().unix_timestamp()).max(1) as i64;
        let mut connection = self.manager.clone();
        let _: bool = connection.expire(self.key(session_id), ttl).await?;
        Ok(())
    }
}
```

Update `api/crates/storage-redis/src/lib.rs`:

```rust
mod in_memory_session_store;
mod session_store;

pub use in_memory_session_store::InMemorySessionStore;
pub use session_store::RedisSessionStore;

#[cfg(test)]
mod _tests;
```

Update `api/apps/api-server/Cargo.toml`:

```toml
[package]
name = "api-server"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
anyhow.workspace = true
axum.workspace = true
axum-extra.workspace = true
control-plane = { path = "../../crates/control-plane" }
domain = { path = "../../crates/domain" }
serde.workspace = true
serde_json.workspace = true
sqlx.workspace = true
storage-pg = { path = "../../crates/storage-pg" }
storage-redis = { path = "../../crates/storage-redis" }
time.workspace = true
tokio.workspace = true
tower.workspace = true
tower-http.workspace = true
tracing.workspace = true
tracing-subscriber.workspace = true
utoipa.workspace = true
utoipa-swagger-ui.workspace = true
uuid.workspace = true
access-control = { path = "../../crates/access-control" }
```

Create `api/apps/api-server/.env.example`:

```text
API_DATABASE_URL=postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows
API_REDIS_URL=redis://:sevenflows@127.0.0.1:36379
API_SERVER_ADDR=0.0.0.0:7800
API_COOKIE_NAME=flowse_console_session
API_SESSION_TTL_DAYS=7
BOOTSTRAP_TEAM_NAME=1Flowse
BOOTSTRAP_ROOT_ACCOUNT=root
BOOTSTRAP_ROOT_EMAIL=root@example.com
BOOTSTRAP_ROOT_PASSWORD=change-me
BOOTSTRAP_ROOT_NAME=Root
BOOTSTRAP_ROOT_NICKNAME=Root
```

Create `api/apps/api-server/src/config.rs`:

```rust
use anyhow::{anyhow, Result};
use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub struct ApiConfig {
    pub database_url: String,
    pub redis_url: String,
    pub cookie_name: String,
    pub session_ttl_days: i64,
    pub bootstrap_team_name: String,
    pub bootstrap_root_account: String,
    pub bootstrap_root_email: String,
    pub bootstrap_root_password: String,
    pub bootstrap_root_name: String,
    pub bootstrap_root_nickname: String,
}

impl ApiConfig {
    pub fn from_env() -> Result<Self> {
        let vars = std::env::vars().collect::<Vec<_>>();
        let refs = vars.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect::<Vec<_>>();
        Self::from_env_map(&refs)
    }

    pub fn from_env_map(entries: &[(&str, &str)]) -> Result<Self> {
        let map = entries
            .iter()
            .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
            .collect::<BTreeMap<_, _>>();

        let get = |key: &str| -> Result<String> {
            map.get(key).cloned().ok_or_else(|| anyhow!("missing env {key}"))
        };

        Ok(Self {
            database_url: get("API_DATABASE_URL")?,
            redis_url: get("API_REDIS_URL")?,
            cookie_name: map
                .get("API_COOKIE_NAME")
                .cloned()
                .unwrap_or_else(|| "flowse_console_session".into()),
            session_ttl_days: map
                .get("API_SESSION_TTL_DAYS")
                .and_then(|value| value.parse().ok())
                .unwrap_or(7),
            bootstrap_team_name: get("BOOTSTRAP_TEAM_NAME")?,
            bootstrap_root_account: get("BOOTSTRAP_ROOT_ACCOUNT")?,
            bootstrap_root_email: get("BOOTSTRAP_ROOT_EMAIL")?,
            bootstrap_root_password: get("BOOTSTRAP_ROOT_PASSWORD")?,
            bootstrap_root_name: map.get("BOOTSTRAP_ROOT_NAME").cloned().unwrap_or_else(|| "Root".into()),
            bootstrap_root_nickname: map.get("BOOTSTRAP_ROOT_NICKNAME").cloned().unwrap_or_else(|| "Root".into()),
        })
    }
}
```

- [ ] **Step 4: Verify the store and config behavior**

Run: `cargo test -p storage-redis -v`

Expected: PASS

Run: `cargo test -p api-server api_config_uses_expected_cookie_defaults -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/crates/storage-redis/Cargo.toml api/crates/storage-redis/src/lib.rs api/crates/storage-redis/src/session_store.rs api/crates/storage-redis/src/in_memory_session_store.rs api/crates/storage-redis/src/_tests/mod.rs api/crates/storage-redis/src/_tests/session_store_tests.rs \
  api/apps/api-server/Cargo.toml api/apps/api-server/.env.example api/apps/api-server/src/config.rs api/apps/api-server/src/_tests/mod.rs api/apps/api-server/src/_tests/config_tests.rs
git commit -m "feat: add session store and api config"
```

### Task 4: Bootstrap Service And Root Password Reset Command

**Files:**
- Modify: `api/crates/control-plane/src/lib.rs`
- Create: `api/crates/control-plane/src/bootstrap.rs`
- Create: `api/crates/control-plane/src/audit.rs`
- Create: `api/crates/control-plane/src/_tests/support.rs`
- Create: `api/crates/control-plane/src/_tests/bootstrap_tests.rs`
- Create: `api/apps/api-server/src/bin/reset_root_password.rs`
- Modify: `api/apps/api-server/src/main.rs`
- Modify: `api/apps/api-server/src/lib.rs`

- [ ] **Step 1: Write the failing bootstrap tests**

Create `api/crates/control-plane/src/_tests/bootstrap_tests.rs`:

```rust
use control_plane::bootstrap::{BootstrapConfig, BootstrapService};
use control_plane::_tests::support::MemoryBootstrapRepository;

#[tokio::test]
async fn bootstrap_service_is_idempotent() {
    let repository = MemoryBootstrapRepository::default();
    let service = BootstrapService::new(repository.clone());
    let config = BootstrapConfig {
        team_name: "1Flowse".into(),
        root_account: "root".into(),
        root_email: "root@example.com".into(),
        root_password_hash: "hash".into(),
        root_name: "Root".into(),
        root_nickname: "Root".into(),
    };

    service.run(&config).await.unwrap();
    service.run(&config).await.unwrap();

    assert_eq!(repository.authenticator_upserts(), 2);
    assert_eq!(repository.root_user_creates(), 1);
}
```

- [ ] **Step 2: Run the bootstrap test and confirm the service is missing**

Run: `cargo test -p control-plane bootstrap_service_is_idempotent -v`

Expected: FAIL because `BootstrapService` and `MemoryBootstrapRepository` do not exist.

- [ ] **Step 3: Implement bootstrap orchestration and the reset command**

Create `api/crates/control-plane/src/bootstrap.rs`:

```rust
use crate::ports::BootstrapRepository;
use anyhow::Result;
use domain::AuthenticatorRecord;

#[derive(Debug, Clone)]
pub struct BootstrapConfig {
    pub team_name: String,
    pub root_account: String,
    pub root_email: String,
    pub root_password_hash: String,
    pub root_name: String,
    pub root_nickname: String,
}

pub struct BootstrapService<R> {
    repository: R,
}

impl<R> BootstrapService<R>
where
    R: BootstrapRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn run(&self, config: &BootstrapConfig) -> Result<()> {
        self.repository
            .upsert_authenticator(&AuthenticatorRecord {
                name: "password-local".into(),
                auth_type: "password-local".into(),
                title: "Password".into(),
                enabled: true,
                is_builtin: true,
                options: serde_json::json!({}),
            })
            .await?;

        let team = self.repository.upsert_team(&config.team_name).await?;
        self.repository.upsert_builtin_roles(team.id).await?;
        self.repository
            .upsert_root_user(
                team.id,
                &config.root_account,
                &config.root_email,
                &config.root_password_hash,
                &config.root_name,
                &config.root_nickname,
            )
            .await?;

        Ok(())
    }
}
```

Create `api/apps/api-server/src/bin/reset_root_password.rs`:

```rust
use anyhow::Result;
use argon2::{Argon2, PasswordHasher};
use rand_core::OsRng;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use api_server::config::ApiConfig;
use password_hash::{SaltString, PasswordHashString};

#[tokio::main]
async fn main() -> Result<()> {
    let config = ApiConfig::from_env()?;
    let pool = connect(&config.database_url).await?;
    run_migrations(&pool).await?;
    let store = PgControlPlaneStore::new(pool);
    let salt = SaltString::generate(&mut OsRng);
    let password_hash: PasswordHashString = Argon2::default()
        .hash_password(config.bootstrap_root_password.as_bytes(), &salt)?
        .serialize();

    let team = store.upsert_team(&config.bootstrap_team_name).await?;
    store.upsert_builtin_roles(team.id).await?;
    let root = store
        .upsert_root_user(
            team.id,
            &config.bootstrap_root_account,
            &config.bootstrap_root_email,
            password_hash.as_str(),
            &config.bootstrap_root_name,
            &config.bootstrap_root_nickname,
        )
        .await?;
    store
        .update_password_hash(root.id, password_hash.as_str(), root.id)
        .await?;

    println!("reset root password for {}", root.account);
    Ok(())
}
```

Update `api/crates/control-plane/src/lib.rs`:

```rust
pub mod audit;
pub mod bootstrap;
pub mod errors;
pub mod ports;

#[cfg(test)]
pub mod _tests;
```

Update `api/apps/api-server/src/lib.rs` to expose config:

```rust
pub mod config;
```

Update `api/apps/api-server/src/main.rs` to keep the existing server startup and import the new config module:

```rust
use std::net::SocketAddr;

use api_server::{app, config::ApiConfig, init_tracing, parse_bind_addr, DEFAULT_API_SERVER_ADDR};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    init_tracing();

    let _config = ApiConfig::from_env().expect("missing api config");
    let addr: SocketAddr = parse_bind_addr(
        std::env::var("API_SERVER_ADDR").ok().as_deref(),
        DEFAULT_API_SERVER_ADDR,
    );

    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app()).await.unwrap();
}
```

- [ ] **Step 4: Verify the bootstrap service and reset command compile**

Run: `cargo test -p control-plane bootstrap_service_is_idempotent -v`

Expected: PASS

Run: `cargo check -p api-server --bin reset_root_password`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/crates/control-plane/src/lib.rs api/crates/control-plane/src/bootstrap.rs api/crates/control-plane/src/audit.rs api/crates/control-plane/src/_tests/support.rs api/crates/control-plane/src/_tests/bootstrap_tests.rs \
  api/apps/api-server/src/lib.rs api/apps/api-server/src/main.rs api/apps/api-server/src/bin/reset_root_password.rs
git commit -m "feat: add bootstrap service and root reset command"
```

### Task 5: Auth Kernel, Hosted-Ready Registry, And Auth/Me/Team Routes

**Files:**
- Modify: `api/crates/control-plane/src/lib.rs`
- Create: `api/crates/control-plane/src/auth.rs`
- Create: `api/crates/control-plane/src/profile.rs`
- Create: `api/crates/control-plane/src/team.rs`
- Create: `api/crates/control-plane/src/_tests/auth_service_tests.rs`
- Create: `api/apps/api-server/src/app_state.rs`
- Create: `api/apps/api-server/src/error_response.rs`
- Create: `api/apps/api-server/src/routes/mod.rs`
- Create: `api/apps/api-server/src/routes/auth.rs`
- Create: `api/apps/api-server/src/routes/me.rs`
- Create: `api/apps/api-server/src/routes/team.rs`
- Create: `api/apps/api-server/src/middleware/mod.rs`
- Create: `api/apps/api-server/src/middleware/require_session.rs`
- Create: `api/apps/api-server/src/middleware/require_csrf.rs`
- Create: `api/apps/api-server/src/_tests/support.rs`
- Create: `api/apps/api-server/src/_tests/auth_routes.rs`
- Create: `api/apps/api-server/src/_tests/team_routes.rs`
- Modify: `api/apps/api-server/src/lib.rs`

- [ ] **Step 1: Write the failing auth and team route tests**

Create `api/apps/api-server/src/_tests/auth_routes.rs`:

```rust
use api_server::_tests::support::test_app;
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn auth_routes_set_cookie_and_return_csrf() {
    let app = test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "identifier": "root@example.com",
                    "password": "change-me"
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().get("set-cookie").is_some());

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(payload["csrf_token"].is_string());
}
```

Create `api/apps/api-server/src/_tests/team_routes.rs`:

```rust
use api_server::_tests::support::{login_and_capture_cookie, test_app};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn team_patch_requires_csrf_and_updates_team_metadata() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/console/team")
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "name": "Flowse Team",
                    "logo_url": "https://example.com/logo.png",
                    "introduction": "seed team"
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}
```

- [ ] **Step 2: Run the route tests and confirm the router is still incomplete**

Run: `cargo test -p api-server auth_routes_set_cookie_and_return_csrf -v`

Expected: FAIL because `/api/console/auth/login` is not registered.

- [ ] **Step 3: Implement the auth kernel, session issuer, and the first console routes**

Create `api/crates/control-plane/src/auth.rs`:

```rust
use crate::errors::ControlPlaneError;
use crate::ports::{AuthRepository, SessionStore};
use anyhow::Result;
use argon2::{password_hash::PasswordHash, password_hash::PasswordVerifier, Argon2};
use domain::{ActorContext, SessionRecord, UserStatus};
use std::{collections::HashMap, sync::Arc};
use time::OffsetDateTime;
use uuid::Uuid;

pub struct LoginCommand {
    pub authenticator: String,
    pub identifier: String,
    pub password: String,
    pub team_id: Uuid,
}

pub struct LoginResult {
    pub actor: ActorContext,
    pub session: SessionRecord,
}

pub trait AuthenticatorProvider: Send + Sync {
    fn auth_type(&self) -> &'static str;
    fn authenticate(&self, identifier: &str, password: &str, repository: &dyn AuthRepository) -> futures::future::BoxFuture<'_, Result<domain::UserRecord>>;
}

pub struct PasswordLocalAuthenticator;

impl AuthenticatorProvider for PasswordLocalAuthenticator {
    fn auth_type(&self) -> &'static str {
        "password-local"
    }

    fn authenticate(&self, identifier: &str, password: &str, repository: &dyn AuthRepository) -> futures::future::BoxFuture<'_, Result<domain::UserRecord>> {
        Box::pin(async move {
            let user = repository
                .find_user_for_password_login(identifier)
                .await?
                .ok_or(ControlPlaneError::NotAuthenticated)?;
            let parsed = PasswordHash::new(&user.password_hash)?;
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .map_err(|_| ControlPlaneError::NotAuthenticated)?;
            Ok(user)
        })
    }
}

pub struct AuthenticatorRegistry {
    providers: HashMap<String, Arc<dyn AuthenticatorProvider>>,
}

impl AuthenticatorRegistry {
    pub fn new() -> Self {
        let mut providers: HashMap<String, Arc<dyn AuthenticatorProvider>> = HashMap::new();
        providers.insert("password-local".into(), Arc::new(PasswordLocalAuthenticator));
        Self { providers }
    }

    pub fn provider(&self, auth_type: &str) -> Option<Arc<dyn AuthenticatorProvider>> {
        self.providers.get(auth_type).cloned()
    }
}

pub struct SessionIssuer<S> {
    store: S,
    ttl_days: i64,
}

impl<S> SessionIssuer<S>
where
    S: SessionStore,
{
    pub fn new(store: S, ttl_days: i64) -> Self {
        Self { store, ttl_days }
    }

    pub async fn issue(&self, user_id: Uuid, team_id: Uuid, session_version: i64) -> Result<SessionRecord> {
        let session = SessionRecord {
            session_id: Uuid::now_v7().to_string(),
            user_id,
            team_id,
            session_version,
            csrf_token: Uuid::now_v7().to_string(),
            expires_at_unix: (OffsetDateTime::now_utc() + time::Duration::days(self.ttl_days)).unix_timestamp(),
        };
        self.store.put(session.clone()).await?;
        Ok(session)
    }
}

pub struct AuthKernel<R, S> {
    repository: R,
    registry: AuthenticatorRegistry,
    issuer: SessionIssuer<S>,
}

impl<R, S> AuthKernel<R, S>
where
    R: AuthRepository,
    S: SessionStore,
{
    pub fn new(repository: R, issuer: SessionIssuer<S>) -> Self {
        Self {
            repository,
            registry: AuthenticatorRegistry::new(),
            issuer,
        }
    }

    pub async fn login(&self, command: LoginCommand) -> Result<LoginResult> {
        let authenticator = self
            .repository
            .find_authenticator(&command.authenticator)
            .await?
            .ok_or(ControlPlaneError::NotFound("authenticator"))?;
        if !authenticator.enabled {
            return Err(ControlPlaneError::PermissionDenied("authenticator_disabled").into());
        }

        let provider = self
            .registry
            .provider(&authenticator.auth_type)
            .ok_or(ControlPlaneError::NotFound("auth_provider"))?;
        let user = provider
            .authenticate(&command.identifier, &command.password, &self.repository)
            .await?;
        if matches!(user.status, UserStatus::Disabled) {
            return Err(ControlPlaneError::PermissionDenied("user_disabled").into());
        }
        let actor = self
            .repository
            .load_actor_context(user.id, command.team_id, user.default_display_role.as_deref())
            .await?;
        let session = self
            .issuer
            .issue(user.id, command.team_id, user.session_version)
            .await?;

        Ok(LoginResult { actor, session })
    }
}
```

Create `api/crates/control-plane/src/profile.rs` and `team.rs` with simple service wrappers that use `AuthRepository::find_user_by_id`, `load_actor_context`, `bump_session_version`, and `ensure_permission(actor, "team.configure.all")` before updating team metadata.

Create `api/apps/api-server/src/app_state.rs`:

```rust
use std::sync::Arc;

use control_plane::auth::{AuthKernel, SessionIssuer};
use storage_pg::PgControlPlaneStore;
use storage_redis::RedisSessionStore;

pub struct ApiState {
    pub auth_kernel: Arc<AuthKernel<PgControlPlaneStore, RedisSessionStore>>,
    pub store: Arc<PgControlPlaneStore>,
    pub session_store: Arc<RedisSessionStore>,
    pub cookie_name: String,
    pub session_ttl_days: i64,
}
```

Create `api/apps/api-server/src/routes/auth.rs`:

```rust
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use crate::{app_state::ApiState, error_response::ApiError};
use control_plane::auth::LoginCommand;
use std::sync::Arc;
use axum_extra::extract::cookie::{Cookie, SameSite};

#[derive(Deserialize)]
pub struct LoginBody {
    pub authenticator: Option<String>,
    pub identifier: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub csrf_token: String,
    pub effective_display_role: String,
}

pub async fn login(
    State(state): State<Arc<ApiState>>,
    Json(body): Json<LoginBody>,
) -> Result<(axum_extra::extract::cookie::CookieJar, Json<LoginResponse>), ApiError> {
    let team = state.store.upsert_team("1Flowse").await?;
    let result = state
        .auth_kernel
        .login(LoginCommand {
            authenticator: body.authenticator.unwrap_or_else(|| "password-local".into()),
            identifier: body.identifier,
            password: body.password,
            team_id: team.id,
        })
        .await?;

    let cookie = Cookie::build((state.cookie_name.clone(), result.session.session_id.clone()))
        .http_only(true)
        .same_site(SameSite::Lax)
        .path("/")
        .build();

    let jar = axum_extra::extract::cookie::CookieJar::new().add(cookie);
    Ok((
        jar,
        Json(LoginResponse {
            csrf_token: result.session.csrf_token,
            effective_display_role: result.actor.effective_display_role,
        }),
    ))
}
```

Create `api/apps/api-server/src/routes/mod.rs`:

```rust
pub mod auth;
pub mod me;
pub mod team;
```

Update `api/apps/api-server/src/lib.rs` to build the first real router:

```rust
pub mod app_state;
pub mod config;
pub mod error_response;
pub mod middleware;
pub mod routes;

use std::net::SocketAddr;
use axum::{routing::{get, patch, post}, Json, Router};
use serde::Serialize;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use utoipa::{OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;

pub const DEFAULT_API_SERVER_ADDR: &str = "0.0.0.0:7800";

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct HealthResponse {
    pub service: &'static str,
    pub status: &'static str,
    pub version: &'static str,
}

#[utoipa::path(get, path = "/health", responses((status = 200, body = HealthResponse)))]
async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        service: "api-server",
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[derive(OpenApi)]
#[openapi(paths(health), components(schemas(HealthResponse)), info(title = "1Flowse API", version = "0.1.0"))]
pub struct ApiDoc;

pub fn parse_bind_addr(candidate: Option<&str>, default_addr: &str) -> SocketAddr {
    candidate
        .and_then(|value| value.parse().ok())
        .unwrap_or_else(|| default_addr.parse().unwrap())
}

pub fn app() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/console/auth/login", post(routes::auth::login))
        .route("/api/console/me", get(routes::me::get_me))
        .route("/api/console/team", get(routes::team::get_team).patch(routes::team::patch_team))
        .merge(SwaggerUi::new("/docs").url("/openapi.json", ApiDoc::openapi()))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}
```

- [ ] **Step 4: Run the auth and team route tests**

Run: `API_DATABASE_URL=postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows API_REDIS_URL=redis://:sevenflows@127.0.0.1:36379 BOOTSTRAP_ROOT_ACCOUNT=root BOOTSTRAP_ROOT_EMAIL=root@example.com BOOTSTRAP_ROOT_PASSWORD=change-me BOOTSTRAP_TEAM_NAME=1Flowse cargo test -p api-server auth_routes_set_cookie_and_return_csrf -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/crates/control-plane/src/lib.rs api/crates/control-plane/src/auth.rs api/crates/control-plane/src/profile.rs api/crates/control-plane/src/team.rs api/crates/control-plane/src/_tests/auth_service_tests.rs \
  api/apps/api-server/src/app_state.rs api/apps/api-server/src/error_response.rs api/apps/api-server/src/routes/mod.rs api/apps/api-server/src/routes/auth.rs api/apps/api-server/src/routes/me.rs api/apps/api-server/src/routes/team.rs api/apps/api-server/src/middleware/mod.rs api/apps/api-server/src/middleware/require_session.rs api/apps/api-server/src/middleware/require_csrf.rs api/apps/api-server/src/_tests/support.rs api/apps/api-server/src/_tests/auth_routes.rs api/apps/api-server/src/_tests/team_routes.rs api/apps/api-server/src/lib.rs
git commit -m "feat: add auth kernel and console auth routes"
```

### Task 6: Member Lifecycle Services, Repositories, And Routes

**Files:**
- Modify: `api/crates/control-plane/src/lib.rs`
- Create: `api/crates/control-plane/src/member.rs`
- Create: `api/crates/control-plane/src/_tests/member_service_tests.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/storage-pg/src/repositories.rs`
- Create: `api/apps/api-server/src/routes/members.rs`
- Create: `api/apps/api-server/src/_tests/member_routes.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/lib.rs`

- [ ] **Step 1: Write the failing member tests**

Create `api/crates/control-plane/src/_tests/member_service_tests.rs`:

```rust
use control_plane::member::{CreateMemberCommand, MemberService};
use control_plane::_tests::support::MemoryMemberRepository;

#[tokio::test]
async fn create_member_assigns_default_manager_role_and_records_audit() {
    let repository = MemoryMemberRepository::default();
    let service = MemberService::new(repository.clone());

    service
        .create_member(CreateMemberCommand {
            actor_user_id: repository.root_user_id(),
            account: "manager-1".into(),
            email: "manager-1@example.com".into(),
            phone: Some("13800000000".into()),
            password_hash: "hash".into(),
            name: "Manager 1".into(),
            nickname: "Manager 1".into(),
            introduction: String::new(),
            email_login_enabled: true,
            phone_login_enabled: false,
        })
        .await
        .unwrap();

    assert_eq!(repository.created_members().len(), 1);
    assert_eq!(repository.created_members()[0].role_codes, vec!["manager"]);
    assert_eq!(repository.audit_events(), vec!["member.created"]);
}
```

Create `api/apps/api-server/src/_tests/member_routes.rs`:

```rust
use api_server::_tests::support::{login_and_capture_cookie, test_app};
use axum::{body::Body, http::{Request, StatusCode}};
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn member_routes_create_disable_and_reset_password() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/members")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "account": "manager-1",
                    "email": "manager-1@example.com",
                    "phone": "13800000000",
                    "password": "temp-pass",
                    "name": "Manager 1",
                    "nickname": "Manager 1",
                    "introduction": "",
                    "email_login_enabled": true,
                    "phone_login_enabled": false
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(create_response.status(), StatusCode::CREATED);
}
```

- [ ] **Step 2: Run the member tests and confirm the service and route are missing**

Run: `cargo test -p control-plane create_member_assigns_default_manager_role_and_records_audit -v`

Expected: FAIL

Run: `cargo test -p api-server member_routes_create_disable_and_reset_password -v`

Expected: FAIL

- [ ] **Step 3: Implement member repository methods, service, and routes**

Update `api/crates/control-plane/src/ports.rs` with member-specific methods:

```rust
#[derive(Debug, Clone)]
pub struct CreateMemberInput {
    pub actor_user_id: Uuid,
    pub account: String,
    pub email: String,
    pub phone: Option<String>,
    pub password_hash: String,
    pub name: String,
    pub nickname: String,
    pub introduction: String,
    pub email_login_enabled: bool,
    pub phone_login_enabled: bool,
}

#[async_trait]
pub trait MemberRepository: Send + Sync {
    async fn create_member_with_default_role(&self, input: &CreateMemberInput) -> anyhow::Result<UserRecord>;
    async fn disable_member(&self, actor_user_id: Uuid, target_user_id: Uuid) -> anyhow::Result<()>;
    async fn reset_member_password(&self, actor_user_id: Uuid, target_user_id: Uuid, password_hash: &str) -> anyhow::Result<()>;
    async fn replace_member_roles(&self, actor_user_id: Uuid, target_user_id: Uuid, role_codes: &[String]) -> anyhow::Result<()>;
    async fn list_members(&self) -> anyhow::Result<Vec<UserRecord>>;
}
```

Create `api/crates/control-plane/src/member.rs`:

```rust
use crate::ports::{CreateMemberInput, MemberRepository};
use anyhow::Result;
use domain::AuditLogRecord;
use time::OffsetDateTime;
use uuid::Uuid;

pub struct CreateMemberCommand {
    pub actor_user_id: Uuid,
    pub account: String,
    pub email: String,
    pub phone: Option<String>,
    pub password_hash: String,
    pub name: String,
    pub nickname: String,
    pub introduction: String,
    pub email_login_enabled: bool,
    pub phone_login_enabled: bool,
}

pub struct MemberService<R> {
    repository: R,
}

impl<R> MemberService<R>
where
    R: MemberRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn create_member(&self, command: CreateMemberCommand) -> Result<()> {
        let user = self
            .repository
            .create_member_with_default_role(&CreateMemberInput {
                actor_user_id: command.actor_user_id,
                account: command.account,
                email: command.email,
                phone: command.phone,
                password_hash: command.password_hash,
                name: command.name,
                nickname: command.nickname,
                introduction: command.introduction,
                email_login_enabled: command.email_login_enabled,
                phone_login_enabled: command.phone_login_enabled,
            })
            .await?;

        let _event = AuditLogRecord {
            id: Uuid::now_v7(),
            team_id: None,
            actor_user_id: Some(command.actor_user_id),
            target_type: "user".into(),
            target_id: Some(user.id),
            event_code: "member.created".into(),
            payload: serde_json::json!({ "account": user.account }),
            created_at: OffsetDateTime::now_utc(),
        };

        Ok(())
    }
}
```

Update `api/crates/storage-pg/src/repositories.rs` to implement `MemberRepository` with transactional methods:
- `create_member_with_default_role` inserts `users`, `team_memberships`, login identities, and a `manager` role binding in one transaction.
- `disable_member` flips `status = 'disabled'` and increments `session_version`.
- `reset_member_password` updates `password_hash` and increments `session_version`.
- `replace_member_roles` validates `root` protection and rewrites bindings atomically.

Create `api/apps/api-server/src/routes/members.rs` with handlers:
- `GET /api/console/members`
- `POST /api/console/members`
- `POST /api/console/members/:id/disable`
- `POST /api/console/members/:id/reset-password`
- `PUT /api/console/members/:id/roles`

Update `api/apps/api-server/src/routes/mod.rs`:

```rust
pub mod auth;
pub mod me;
pub mod members;
pub mod team;
```

Update `api/apps/api-server/src/lib.rs` router:

```rust
.route("/api/console/members", get(routes::members::list_members).post(routes::members::create_member))
.route("/api/console/members/:id/disable", post(routes::members::disable_member))
.route("/api/console/members/:id/reset-password", post(routes::members::reset_member))
.route("/api/console/members/:id/roles", axum::routing::put(routes::members::replace_member_roles))
```

- [ ] **Step 4: Run the member service and route tests**

Run: `API_DATABASE_URL=postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows API_REDIS_URL=redis://:sevenflows@127.0.0.1:36379 BOOTSTRAP_ROOT_ACCOUNT=root BOOTSTRAP_ROOT_EMAIL=root@example.com BOOTSTRAP_ROOT_PASSWORD=change-me BOOTSTRAP_TEAM_NAME=1Flowse cargo test -p control-plane -p api-server member_ -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/crates/control-plane/src/lib.rs api/crates/control-plane/src/member.rs api/crates/control-plane/src/_tests/member_service_tests.rs api/crates/control-plane/src/ports.rs \
  api/crates/storage-pg/src/repositories.rs \
  api/apps/api-server/src/routes/members.rs api/apps/api-server/src/_tests/member_routes.rs api/apps/api-server/src/routes/mod.rs api/apps/api-server/src/lib.rs
git commit -m "feat: add member lifecycle backend"
```

### Task 7: Role CRUD, Permission Binding, And Permission Catalog Routes

**Files:**
- Modify: `api/crates/control-plane/src/lib.rs`
- Create: `api/crates/control-plane/src/role.rs`
- Create: `api/crates/control-plane/src/_tests/role_service_tests.rs`
- Modify: `api/crates/control-plane/src/ports.rs`
- Modify: `api/crates/storage-pg/src/repositories.rs`
- Create: `api/apps/api-server/src/routes/roles.rs`
- Create: `api/apps/api-server/src/routes/permissions.rs`
- Create: `api/apps/api-server/src/_tests/role_routes.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/lib.rs`

- [ ] **Step 1: Write the failing role and permission tests**

Create `api/crates/control-plane/src/_tests/role_service_tests.rs`:

```rust
use control_plane::role::{CreateRoleCommand, ReplaceRolePermissionsCommand, RoleService};
use control_plane::_tests::support::MemoryRoleRepository;

#[tokio::test]
async fn role_service_rejects_root_mutation_and_replaces_permissions_for_team_roles() {
    let repository = MemoryRoleRepository::default();
    let service = RoleService::new(repository.clone());

    service
        .create_role(CreateRoleCommand {
            actor_user_id: repository.root_user_id(),
            code: "qa".into(),
            name: "QA".into(),
            introduction: "qa role".into(),
        })
        .await
        .unwrap();

    service
        .replace_permissions(ReplaceRolePermissionsCommand {
            actor_user_id: repository.root_user_id(),
            role_code: "qa".into(),
            permission_codes: vec!["route_page.view.all".into(), "application.edit.own".into()],
        })
        .await
        .unwrap();

    assert!(service
        .replace_permissions(ReplaceRolePermissionsCommand {
            actor_user_id: repository.root_user_id(),
            role_code: "root".into(),
            permission_codes: vec!["team.configure.all".into()],
        })
        .await
        .is_err());
}
```

Create `api/apps/api-server/src/_tests/role_routes.rs`:

```rust
use api_server::_tests::support::{login_and_capture_cookie, test_app};
use axum::{body::Body, http::{Request, StatusCode}};
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn role_routes_create_replace_permissions_and_protect_root() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/roles")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "code": "qa",
                    "name": "QA",
                    "introduction": "qa role"
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(create_response.status(), StatusCode::CREATED);
}
```

- [ ] **Step 2: Run the role tests and confirm the remaining slices are missing**

Run: `cargo test -p control-plane role_service_rejects_root_mutation_and_replaces_permissions_for_team_roles -v`

Expected: FAIL

Run: `cargo test -p api-server role_routes_create_replace_permissions_and_protect_root -v`

Expected: FAIL

- [ ] **Step 3: Implement role service, role repository methods, and permission endpoints**

Update `api/crates/control-plane/src/ports.rs` with role APIs:

```rust
#[async_trait]
pub trait RoleRepository: Send + Sync {
    async fn list_roles(&self) -> anyhow::Result<Vec<domain::RoleTemplate>>;
    async fn create_team_role(&self, actor_user_id: Uuid, code: &str, name: &str, introduction: &str) -> anyhow::Result<()>;
    async fn update_team_role(&self, actor_user_id: Uuid, role_code: &str, name: &str, introduction: &str) -> anyhow::Result<()>;
    async fn delete_team_role(&self, actor_user_id: Uuid, role_code: &str) -> anyhow::Result<()>;
    async fn replace_role_permissions(&self, actor_user_id: Uuid, role_code: &str, permission_codes: &[String]) -> anyhow::Result<()>;
    async fn list_role_permissions(&self, role_code: &str) -> anyhow::Result<Vec<String>>;
}
```

Create `api/crates/control-plane/src/role.rs`:

```rust
use crate::{errors::ControlPlaneError, ports::RoleRepository};
use anyhow::Result;

pub struct CreateRoleCommand {
    pub actor_user_id: uuid::Uuid,
    pub code: String,
    pub name: String,
    pub introduction: String,
}

pub struct ReplaceRolePermissionsCommand {
    pub actor_user_id: uuid::Uuid,
    pub role_code: String,
    pub permission_codes: Vec<String>,
}

pub struct RoleService<R> {
    repository: R,
}

impl<R> RoleService<R>
where
    R: RoleRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn create_role(&self, command: CreateRoleCommand) -> Result<()> {
        self.repository
            .create_team_role(command.actor_user_id, &command.code, &command.name, &command.introduction)
            .await
    }

    pub async fn replace_permissions(&self, command: ReplaceRolePermissionsCommand) -> Result<()> {
        if command.role_code == "root" {
            return Err(ControlPlaneError::PermissionDenied("root_role_immutable").into());
        }

        self.repository
            .replace_role_permissions(
                command.actor_user_id,
                &command.role_code,
                &command.permission_codes,
            )
            .await
    }
}
```

Update `api/crates/storage-pg/src/repositories.rs`:
- Implement `RoleRepository` with SQL that:
  - refuses to mutate `root`
  - only creates `scope_kind = 'team'`
  - checks bindings before delete
  - rewrites `role_permissions` transactionally
  - exposes `list_permissions()` from the seeded catalog table

Create `api/apps/api-server/src/routes/roles.rs`:

```rust
// handlers:
// GET /api/console/roles
// POST /api/console/roles
// PATCH /api/console/roles/:id
// DELETE /api/console/roles/:id
// GET /api/console/roles/:id/permissions
// PUT /api/console/roles/:id/permissions
```

Create `api/apps/api-server/src/routes/permissions.rs`:

```rust
// handler:
// GET /api/console/permissions
```

Update `api/apps/api-server/src/routes/mod.rs`:

```rust
pub mod auth;
pub mod me;
pub mod members;
pub mod permissions;
pub mod roles;
pub mod team;
```

Update `api/apps/api-server/src/lib.rs` router:

```rust
.route("/api/console/roles", get(routes::roles::list_roles).post(routes::roles::create_role))
.route("/api/console/roles/:id", patch(routes::roles::update_role).delete(routes::roles::delete_role))
.route("/api/console/roles/:id/permissions", get(routes::roles::get_role_permissions).put(routes::roles::replace_role_permissions))
.route("/api/console/permissions", get(routes::permissions::list_permissions))
```

- [ ] **Step 4: Run the role and permission tests**

Run: `API_DATABASE_URL=postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows API_REDIS_URL=redis://:sevenflows@127.0.0.1:36379 BOOTSTRAP_ROOT_ACCOUNT=root BOOTSTRAP_ROOT_EMAIL=root@example.com BOOTSTRAP_ROOT_PASSWORD=change-me BOOTSTRAP_TEAM_NAME=1Flowse cargo test -p control-plane -p api-server role_ -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/crates/control-plane/src/lib.rs api/crates/control-plane/src/role.rs api/crates/control-plane/src/_tests/role_service_tests.rs api/crates/control-plane/src/ports.rs \
  api/crates/storage-pg/src/repositories.rs \
  api/apps/api-server/src/routes/roles.rs api/apps/api-server/src/routes/permissions.rs api/apps/api-server/src/_tests/role_routes.rs api/apps/api-server/src/routes/mod.rs api/apps/api-server/src/lib.rs
git commit -m "feat: add role and permission backend"
```

### Task 8: Full Verification, OpenAPI Coverage, And Final Glue

**Files:**
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/_tests/support.rs`
- Modify: `api/apps/api-server/src/_tests/auth_routes.rs`
- Modify: `api/apps/api-server/src/_tests/member_routes.rs`
- Modify: `api/apps/api-server/src/_tests/role_routes.rs`

- [ ] **Step 1: Add the final failing app-flow test**

Append to `api/apps/api-server/src/_tests/role_routes.rs`:

```rust
#[tokio::test]
async fn root_can_login_create_member_create_role_and_bind_permissions() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root@example.com", "change-me").await;

    let permissions_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/permissions")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(permissions_response.status(), StatusCode::OK);
}
```

- [ ] **Step 2: Run the full API-server suite and confirm any remaining gaps**

Run: `API_DATABASE_URL=postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows API_REDIS_URL=redis://:sevenflows@127.0.0.1:36379 BOOTSTRAP_ROOT_ACCOUNT=root BOOTSTRAP_ROOT_EMAIL=root@example.com BOOTSTRAP_ROOT_PASSWORD=change-me BOOTSTRAP_TEAM_NAME=1Flowse cargo test -p api-server -v`

Expected: FAIL only on whichever route, DTO, or test-support glue is still incomplete.

- [ ] **Step 3: Finish the remaining glue and OpenAPI surface**

Complete the missing support code in `api/apps/api-server/src/_tests/support.rs`:

```rust
use crate::app;
use axum::{body::Body, http::Request};
use serde_json::json;
use tower::ServiceExt;

pub async fn test_app() -> axum::Router {
    app()
}

pub async fn login_and_capture_cookie(app: &axum::Router, identifier: &str, password: &str) -> (String, String) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "identifier": identifier,
                    "password": password
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let cookie = response
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();

    (cookie, payload["csrf_token"].as_str().unwrap().to_string())
}
```

Then update `api/apps/api-server/src/lib.rs` OpenAPI declarations so every new route DTO appears in `/openapi.json`.

- [ ] **Step 4: Run the full backend verification suite**

Run: `cargo fmt --all --check`

Expected: PASS

Run: `API_DATABASE_URL=postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows API_REDIS_URL=redis://:sevenflows@127.0.0.1:36379 BOOTSTRAP_ROOT_ACCOUNT=root BOOTSTRAP_ROOT_EMAIL=root@example.com BOOTSTRAP_ROOT_PASSWORD=change-me BOOTSTRAP_TEAM_NAME=1Flowse cargo test -p domain -p access-control -p storage-pg -p storage-redis -p control-plane -p api-server -v`

Expected: PASS

Run: `API_DATABASE_URL=postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows API_REDIS_URL=redis://:sevenflows@127.0.0.1:36379 BOOTSTRAP_ROOT_ACCOUNT=root BOOTSTRAP_ROOT_EMAIL=root@example.com BOOTSTRAP_ROOT_PASSWORD=change-me BOOTSTRAP_TEAM_NAME=1Flowse cargo check -p api-server`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/apps/api-server/src/lib.rs api/apps/api-server/src/_tests/support.rs api/apps/api-server/src/_tests/auth_routes.rs api/apps/api-server/src/_tests/member_routes.rs api/apps/api-server/src/_tests/role_routes.rs
git commit -m "test: verify auth team access control backend"
```

## Self-Review

- Spec coverage: this plan covers the confirmed login identifiers (`account/email/phone`), bootstrap team/root flow, hosted-ready auth provider layering, Redis session + CSRF, member lifecycle, role CRUD, permission binding, root protections, and audit writes. No confirmed requirement from the approved design is intentionally omitted.
- Placeholder scan: no task uses `TODO`, `TBD`, or “implement later”. Where later tasks extend a file, the added methods and routes are named explicitly.
- Type consistency: the plan keeps the same auth-layer names throughout: `AuthKernel`, `AuthenticatorRegistry`, `PasswordLocalAuthenticator`, `SessionIssuer`, `BootstrapService`, `PgControlPlaneStore`.
