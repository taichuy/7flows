# File Management Control Plane And Postgres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the durable metadata layer for `file_storages` and `file_tables`, including domain records, permission catalog entries, control-plane services, and PostgreSQL repositories that later API and UI slices can safely consume.

**Architecture:** Model file management as control-plane metadata, not runtime file content. `domain` owns durable record types, `access-control` owns the new management permission catalog, `control-plane` owns permission-checked services and ports, and `storage-postgres` owns migrations plus SQL implementations. This plan must not provision the built-in `attachments` runtime table yet; it only creates the metadata and service foundation that later plans depend on.

**Tech Stack:** Rust workspace crates, `sqlx`, targeted `cargo test`.

**Source Discussion:** Approved by the current file-manager storage spec; metadata must live in PostgreSQL while file bytes stay behind `storage-object` drivers.

---

## File Structure

**Create**
- `api/crates/domain/src/file_management.rs`
- `api/crates/access-control/src/_tests/catalog_file_management_tests.rs`
- `api/crates/control-plane/src/file_management/mod.rs`
- `api/crates/control-plane/src/file_management/storage_service.rs`
- `api/crates/control-plane/src/file_management/table_service.rs`
- `api/crates/control-plane/src/ports/file_management.rs`
- `api/crates/control-plane/src/_tests/file_management_service_tests.rs`
- `api/crates/storage-postgres/src/file_management_repository.rs`
- `api/crates/storage-postgres/src/_tests/file_management_repository_tests.rs`
- `api/crates/storage-postgres/migrations/20260423203000_add_file_management_platform.sql`

**Modify**
- `api/crates/domain/src/lib.rs`
- `api/crates/access-control/src/_tests/mod.rs`
- `api/crates/access-control/src/catalog.rs`
- `api/crates/control-plane/src/lib.rs`
- `api/crates/control-plane/src/ports/mod.rs`
- `api/crates/control-plane/src/_tests/mod.rs`
- `api/crates/control-plane/src/_tests/support.rs`
- `api/crates/storage-postgres/src/lib.rs`
- `api/crates/storage-postgres/src/_tests/mod.rs`

**Notes**
- This plan owns metadata tables and services only. Do not add upload routes, multipart parsing, or runtime file-record insertion here.
- `file_table` permissions cover file-table registration actions, not runtime record CRUD. Runtime file records still use `state_data.*`.
- `bound_storage_id` must be mutable only through the service layer and only by `root`.

### Task 1: Add Domain Records And Permission Catalog Entries

**Files:**
- Create: `api/crates/domain/src/file_management.rs`
- Create: `api/crates/access-control/src/_tests/catalog_file_management_tests.rs`
- Modify: `api/crates/domain/src/lib.rs`
- Modify: `api/crates/access-control/src/catalog.rs`
- Modify: `api/crates/access-control/src/_tests/mod.rs`

- [ ] **Step 1: Write the failing permission-catalog tests**

Create `api/crates/access-control/src/_tests/catalog_file_management_tests.rs`:

```rust
use access_control::permission_catalog;

#[test]
fn permission_catalog_includes_file_management_resources() {
    let codes = permission_catalog()
        .into_iter()
        .map(|permission| permission.code)
        .collect::<Vec<_>>();

    assert!(codes.contains(&"file_storage.view.all".to_string()));
    assert!(codes.contains(&"file_storage.manage.all".to_string()));
    assert!(codes.contains(&"file_table.view.all".to_string()));
    assert!(codes.contains(&"file_table.view.own".to_string()));
    assert!(codes.contains(&"file_table.create.all".to_string()));
    assert!(codes.contains(&"file_table.delete.own".to_string()));
    assert!(codes.contains(&"file_table.bind.all".to_string()));
}
```

Update `api/crates/access-control/src/_tests/mod.rs`:

```rust
mod catalog_file_management_tests;
mod catalog_tests;
```

- [ ] **Step 2: Run the focused permission-catalog test to verify it fails**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p access-control permission_catalog_includes_file_management_resources -- --nocapture
```

Expected:

- FAIL because the catalog does not yet contain `file_storage` or `file_table` resources.

- [ ] **Step 3: Add domain record types and the new permission resources**

Create `api/crates/domain/src/file_management.rs`:

```rust
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileStorageHealthStatus {
    Unknown,
    Ready,
    Failed,
}

impl FileStorageHealthStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Unknown => "unknown",
            Self::Ready => "ready",
            Self::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileTableScopeKind {
    System,
    Workspace,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileStorageRecord {
    pub id: Uuid,
    pub code: String,
    pub title: String,
    pub driver_type: String,
    pub enabled: bool,
    pub is_default: bool,
    pub config_json: serde_json::Value,
    pub rule_json: serde_json::Value,
    pub health_status: FileStorageHealthStatus,
    pub last_health_error: Option<String>,
    pub created_by: Uuid,
    pub updated_by: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileTableRecord {
    pub id: Uuid,
    pub code: String,
    pub title: String,
    pub scope_kind: FileTableScopeKind,
    pub scope_id: Uuid,
    pub model_definition_id: Uuid,
    pub bound_storage_id: Uuid,
    pub is_builtin: bool,
    pub is_default: bool,
    pub status: String,
    pub created_by: Uuid,
    pub updated_by: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}
```

Update `api/crates/domain/src/lib.rs`:

```rust
pub mod file_management;

pub use file_management::{FileStorageHealthStatus, FileStorageRecord, FileTableRecord, FileTableScopeKind};
```

Update `api/crates/access-control/src/catalog.rs`:

```rust
    push_permissions(
        &mut permissions,
        "file_storage",
        &[("view", &["all"]), ("manage", &["all"])],
    );
    push_permissions(
        &mut permissions,
        "file_table",
        &[
            ("view", &["own", "all"]),
            ("create", &["all"]),
            ("delete", &["own", "all"]),
            ("bind", &["all"]),
        ],
    );
```

- [ ] **Step 4: Re-run the focused permission-catalog test**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p access-control permission_catalog_includes_file_management_resources -- --nocapture
```

Expected:

- PASS with the new file-management codes present exactly once.

- [ ] **Step 5: Commit the domain and ACL foundation**

```bash
git add api/crates/domain api/crates/access-control
git commit -m "feat: add file management domain and permissions"
```

### Task 2: Add Control-Plane Ports And Permission-Checked Services

**Files:**
- Create: `api/crates/control-plane/src/file_management/mod.rs`
- Create: `api/crates/control-plane/src/file_management/storage_service.rs`
- Create: `api/crates/control-plane/src/file_management/table_service.rs`
- Create: `api/crates/control-plane/src/ports/file_management.rs`
- Create: `api/crates/control-plane/src/_tests/file_management_service_tests.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports/mod.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`
- Modify: `api/crates/control-plane/src/_tests/support.rs`

- [ ] **Step 1: Write the failing service-level authorization tests**

Create `api/crates/control-plane/src/_tests/file_management_service_tests.rs`:

```rust
use control_plane::file_management::{
    BindFileTableStorageCommand, CreateFileStorageCommand, FileStorageService, FileTableService,
};
use control_plane::_tests::support::{
    memory_actor_context, MemoryFileManagementRepository,
};
use uuid::Uuid;

#[tokio::test]
async fn only_root_can_create_file_storage() {
    let repository = MemoryFileManagementRepository::new(memory_actor_context(false, &[]));
    let service = FileStorageService::new(repository);

    let error = service
        .create_storage(CreateFileStorageCommand {
            actor_user_id: Uuid::now_v7(),
            code: "local-default".into(),
            title: "Local".into(),
            driver_type: "local".into(),
            enabled: true,
            is_default: true,
            config_json: serde_json::json!({ "root_path": "api/storage" }),
            rule_json: serde_json::json!({}),
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("permission_denied"));
}

#[tokio::test]
async fn only_root_can_rebind_file_table_storage() {
    let repository = MemoryFileManagementRepository::new(memory_actor_context(false, &[]));
    let service = FileTableService::new(repository);

    let error = service
        .bind_storage(BindFileTableStorageCommand {
            actor_user_id: Uuid::now_v7(),
            file_table_id: Uuid::now_v7(),
            bound_storage_id: Uuid::now_v7(),
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("permission_denied"));
}
```

- [ ] **Step 2: Run the focused control-plane tests to verify they fail**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane file_management_service_tests -- --nocapture
```

Expected:

- FAIL because the file-management ports, commands, and test repository do not exist yet.

- [ ] **Step 3: Define repository ports and service commands**

Create `api/crates/control-plane/src/ports/file_management.rs`:

```rust
use super::*;

#[derive(Debug, Clone)]
pub struct CreateFileStorageInput {
    pub storage_id: Uuid,
    pub actor_user_id: Uuid,
    pub code: String,
    pub title: String,
    pub driver_type: String,
    pub enabled: bool,
    pub is_default: bool,
    pub config_json: serde_json::Value,
    pub rule_json: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct UpdateFileStorageBindingInput {
    pub actor_user_id: Uuid,
    pub file_table_id: Uuid,
    pub bound_storage_id: Uuid,
}

#[async_trait]
pub trait FileManagementRepository: Send + Sync {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> anyhow::Result<ActorContext>;
    async fn create_file_storage(
        &self,
        input: &CreateFileStorageInput,
    ) -> anyhow::Result<domain::FileStorageRecord>;
    async fn list_file_storages(&self) -> anyhow::Result<Vec<domain::FileStorageRecord>>;
    async fn get_default_file_storage(&self) -> anyhow::Result<Option<domain::FileStorageRecord>>;
    async fn get_file_storage(
        &self,
        storage_id: Uuid,
    ) -> anyhow::Result<Option<domain::FileStorageRecord>>;
    async fn list_visible_file_tables(
        &self,
        workspace_id: Uuid,
    ) -> anyhow::Result<Vec<domain::FileTableRecord>>;
    async fn update_file_table_binding(
        &self,
        input: &UpdateFileStorageBindingInput,
    ) -> anyhow::Result<domain::FileTableRecord>;
}
```

Create `api/crates/control-plane/src/file_management/storage_service.rs`:

```rust
use anyhow::Result;
use uuid::Uuid;

use crate::{errors::ControlPlaneError, ports::FileManagementRepository};

pub struct CreateFileStorageCommand {
    pub actor_user_id: Uuid,
    pub code: String,
    pub title: String,
    pub driver_type: String,
    pub enabled: bool,
    pub is_default: bool,
    pub config_json: serde_json::Value,
    pub rule_json: serde_json::Value,
}

pub struct FileStorageService<R> {
    repository: R,
}

impl<R> FileStorageService<R>
where
    R: FileManagementRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn create_storage(
        &self,
        command: CreateFileStorageCommand,
    ) -> Result<domain::FileStorageRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        if !actor.is_root {
            return Err(ControlPlaneError::PermissionDenied("permission_denied").into());
        }

        self.repository
            .create_file_storage(&crate::ports::CreateFileStorageInput {
                storage_id: Uuid::now_v7(),
                actor_user_id: command.actor_user_id,
                code: command.code,
                title: command.title,
                driver_type: command.driver_type,
                enabled: command.enabled,
                is_default: command.is_default,
                config_json: command.config_json,
                rule_json: command.rule_json,
            })
            .await
    }
}
```

Create `api/crates/control-plane/src/file_management/table_service.rs`:

```rust
use anyhow::Result;
use uuid::Uuid;

use crate::{errors::ControlPlaneError, ports::FileManagementRepository};

pub struct BindFileTableStorageCommand {
    pub actor_user_id: Uuid,
    pub file_table_id: Uuid,
    pub bound_storage_id: Uuid,
}

pub struct FileTableService<R> {
    repository: R,
}

impl<R> FileTableService<R>
where
    R: FileManagementRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn bind_storage(
        &self,
        command: BindFileTableStorageCommand,
    ) -> Result<domain::FileTableRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        if !actor.is_root {
            return Err(ControlPlaneError::PermissionDenied("permission_denied").into());
        }

        self.repository
            .update_file_table_binding(&crate::ports::UpdateFileStorageBindingInput {
                actor_user_id: command.actor_user_id,
                file_table_id: command.file_table_id,
                bound_storage_id: command.bound_storage_id,
            })
            .await
    }
}
```

Wire exports in `api/crates/control-plane/src/file_management/mod.rs`:

```rust
mod storage_service;
mod table_service;

pub use storage_service::*;
pub use table_service::*;
```

Update `api/crates/control-plane/src/lib.rs` and `api/crates/control-plane/src/ports/mod.rs`:

```rust
pub mod file_management;
mod file_management;
pub use file_management::*;
```

- [ ] **Step 4: Re-run the focused control-plane tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane file_management_service_tests -- --nocapture
```

Expected:

- PASS with non-root actors denied for storage creation and binding changes.

- [ ] **Step 5: Commit the control-plane service layer**

```bash
git add api/crates/control-plane
git commit -m "feat: add file management control plane services"
```

### Task 3: Add PostgreSQL Tables And Repository Implementations

**Files:**
- Create: `api/crates/storage-postgres/migrations/20260423203000_add_file_management_platform.sql`
- Create: `api/crates/storage-postgres/src/file_management_repository.rs`
- Create: `api/crates/storage-postgres/src/_tests/file_management_repository_tests.rs`
- Modify: `api/crates/storage-postgres/src/lib.rs`
- Modify: `api/crates/storage-postgres/src/_tests/mod.rs`

- [ ] **Step 1: Write the failing PostgreSQL repository tests**

Create `api/crates/storage-postgres/src/_tests/file_management_repository_tests.rs`:

```rust
use control_plane::ports::{CreateFileStorageInput, FileManagementRepository, UpdateFileStorageBindingInput};
use storage_postgres::connect;
use uuid::Uuid;

#[tokio::test]
async fn file_management_repository_creates_default_storage_and_updates_bindings() {
    let durable = connect("postgres://postgres:postgres@127.0.0.1:5432/flowbase_test")
        .await
        .unwrap();
    let store = durable.store;

    let storage = store
        .create_file_storage(&CreateFileStorageInput {
            storage_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            code: "local-default".into(),
            title: "Local".into(),
            driver_type: "local".into(),
            enabled: true,
            is_default: true,
            config_json: serde_json::json!({ "root_path": "api/storage" }),
            rule_json: serde_json::json!({}),
        })
        .await
        .unwrap();
    assert_eq!(storage.driver_type, "local");
    assert!(storage.is_default);

    let file_tables = store.list_visible_file_tables(domain::SYSTEM_SCOPE_ID).await.unwrap();
    assert!(file_tables.is_empty());

    let update = store
        .update_file_table_binding(&UpdateFileStorageBindingInput {
            actor_user_id: Uuid::now_v7(),
            file_table_id: Uuid::now_v7(),
            bound_storage_id: storage.id,
        })
        .await;
    assert!(update.is_err());
}
```

- [ ] **Step 2: Run the focused storage-postgres tests to verify they fail**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-postgres file_management_repository_tests -- --nocapture
```

Expected:

- FAIL because the migration, repository file, and exports do not exist yet.

- [ ] **Step 3: Add the migration and repository implementation**

Create `api/crates/storage-postgres/migrations/20260423203000_add_file_management_platform.sql`:

```sql
create table if not exists file_storages (
    id uuid primary key,
    code text not null unique,
    title text not null,
    driver_type text not null,
    enabled boolean not null default true,
    is_default boolean not null default false,
    config_json jsonb not null default '{}'::jsonb,
    rule_json jsonb not null default '{}'::jsonb,
    health_status text not null default 'unknown',
    last_health_error text null,
    created_by uuid not null references users(id),
    updated_by uuid not null references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists file_storages_single_default_idx
    on file_storages ((is_default))
    where is_default = true;

create table if not exists file_tables (
    id uuid primary key,
    code text not null unique,
    title text not null,
    scope_kind text not null,
    scope_id uuid not null,
    model_definition_id uuid not null references model_definitions(id),
    bound_storage_id uuid not null references file_storages(id),
    is_builtin boolean not null default false,
    is_default boolean not null default false,
    status text not null default 'active',
    created_by uuid not null references users(id),
    updated_by uuid not null references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists file_tables_scope_idx
    on file_tables (scope_kind, scope_id, created_at desc);
```

Create `api/crates/storage-postgres/src/file_management_repository.rs`:

```rust
use anyhow::Result;
use async_trait::async_trait;
use control_plane::ports::{CreateFileStorageInput, FileManagementRepository, UpdateFileStorageBindingInput};
use sqlx::Row;
use uuid::Uuid;

use crate::repositories::PgControlPlaneStore;

fn parse_health_status(value: &str) -> Result<domain::FileStorageHealthStatus> {
    match value {
        "unknown" => Ok(domain::FileStorageHealthStatus::Unknown),
        "ready" => Ok(domain::FileStorageHealthStatus::Ready),
        "failed" => Ok(domain::FileStorageHealthStatus::Failed),
        _ => anyhow::bail!("invalid file storage health status"),
    }
}

fn parse_scope_kind(value: &str) -> Result<domain::FileTableScopeKind> {
    match value {
        "system" => Ok(domain::FileTableScopeKind::System),
        "workspace" => Ok(domain::FileTableScopeKind::Workspace),
        _ => anyhow::bail!("invalid file table scope kind"),
    }
}

fn map_file_table(row: sqlx::postgres::PgRow) -> Result<domain::FileTableRecord> {
    Ok(domain::FileTableRecord {
        id: row.get("id"),
        code: row.get("code"),
        title: row.get("title"),
        scope_kind: parse_scope_kind(row.get::<String, _>("scope_kind").as_str())?,
        scope_id: row.get("scope_id"),
        model_definition_id: row.get("model_definition_id"),
        bound_storage_id: row.get("bound_storage_id"),
        is_builtin: row.get("is_builtin"),
        is_default: row.get("is_default"),
        status: row.get("status"),
        created_by: row.get("created_by"),
        updated_by: row.get("updated_by"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

#[async_trait]
impl FileManagementRepository for PgControlPlaneStore {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> Result<domain::ActorContext> {
        crate::auth_repository::load_actor_context(self.pool(), actor_user_id).await
    }

    async fn create_file_storage(
        &self,
        input: &CreateFileStorageInput,
    ) -> Result<domain::FileStorageRecord> {
        let row = sqlx::query(
            r#"
            insert into file_storages (
                id, code, title, driver_type, enabled, is_default,
                config_json, rule_json, health_status, created_by, updated_by
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, 'unknown', $9, $9)
            returning *
            "#,
        )
        .bind(input.storage_id)
        .bind(&input.code)
        .bind(&input.title)
        .bind(&input.driver_type)
        .bind(input.enabled)
        .bind(input.is_default)
        .bind(&input.config_json)
        .bind(&input.rule_json)
        .bind(input.actor_user_id)
        .fetch_one(self.pool())
        .await?;

        Ok(domain::FileStorageRecord {
            id: row.get("id"),
            code: row.get("code"),
            title: row.get("title"),
            driver_type: row.get("driver_type"),
            enabled: row.get("enabled"),
            is_default: row.get("is_default"),
            config_json: row.get("config_json"),
            rule_json: row.get("rule_json"),
            health_status: parse_health_status(row.get::<String, _>("health_status").as_str())?,
            last_health_error: row.get("last_health_error"),
            created_by: row.get("created_by"),
            updated_by: row.get("updated_by"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
    }

    async fn list_file_storages(&self) -> Result<Vec<domain::FileStorageRecord>> {
        let rows = sqlx::query("select * from file_storages order by is_default desc, created_at asc")
            .fetch_all(self.pool())
            .await?;
        rows.into_iter().map(|row| {
            Ok(domain::FileStorageRecord {
                id: row.get("id"),
                code: row.get("code"),
                title: row.get("title"),
                driver_type: row.get("driver_type"),
                enabled: row.get("enabled"),
                is_default: row.get("is_default"),
                config_json: row.get("config_json"),
                rule_json: row.get("rule_json"),
                health_status: parse_health_status(row.get::<String, _>("health_status").as_str())?,
                last_health_error: row.get("last_health_error"),
                created_by: row.get("created_by"),
                updated_by: row.get("updated_by"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            })
        }).collect()
    }

    async fn get_default_file_storage(&self) -> Result<Option<domain::FileStorageRecord>> {
        let rows = self.list_file_storages().await?;
        Ok(rows.into_iter().find(|record| record.is_default))
    }

    async fn get_file_storage(
        &self,
        storage_id: Uuid,
    ) -> Result<Option<domain::FileStorageRecord>> {
        let rows = self.list_file_storages().await?;
        Ok(rows.into_iter().find(|record| record.id == storage_id))
    }

    async fn list_visible_file_tables(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<domain::FileTableRecord>> {
        let rows = sqlx::query(
            r#"
            select *
            from file_tables
            where (scope_kind = 'system' and scope_id = $1)
               or (scope_kind = 'workspace' and scope_id = $2)
            order by is_default desc, created_at asc
            "#,
        )
        .bind(domain::SYSTEM_SCOPE_ID)
        .bind(workspace_id)
        .fetch_all(self.pool())
        .await?;

        rows.into_iter().map(map_file_table).collect()
    }

    async fn update_file_table_binding(
        &self,
        input: &UpdateFileStorageBindingInput,
    ) -> Result<domain::FileTableRecord> {
        let row = sqlx::query(
            r#"
            update file_tables
            set bound_storage_id = $3, updated_by = $1, updated_at = now()
            where id = $2
            returning *
            "#,
        )
        .bind(input.actor_user_id)
        .bind(input.file_table_id)
        .bind(input.bound_storage_id)
        .fetch_one(self.pool())
        .await?;

        map_file_table(row)
    }
}
```

Update `api/crates/storage-postgres/src/lib.rs` and `_tests/mod.rs`:

```rust
pub mod file_management_repository;
mod file_management_repository_tests;
```

- [ ] **Step 4: Re-run the focused storage-postgres tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-postgres file_management_repository_tests -- --nocapture
```

Expected:

- PASS with the migration applied and basic create/list/binding behavior available.

- [ ] **Step 5: Commit the durable metadata layer**

```bash
git add api/crates/storage-postgres
git commit -m "feat: persist file management metadata in postgres"
```

### Task 4: Close The Metadata Slice With Cross-Crate Regression

**Files:**
- Modify: `api/crates/control-plane/src/_tests/support.rs`

- [ ] **Step 1: Add a minimal in-memory file-management repository to test support**

Add to `api/crates/control-plane/src/_tests/support.rs`:

```rust
#[derive(Clone, Default)]
pub struct MemoryFileManagementRepository {
    actor: domain::ActorContext,
}

impl MemoryFileManagementRepository {
    pub fn new(actor: domain::ActorContext) -> Self {
        Self { actor }
    }
}

pub fn memory_actor_context(is_root: bool, permissions: &[&str]) -> domain::ActorContext {
    domain::ActorContext {
        user_id: uuid::Uuid::now_v7(),
        tenant_id: domain::SYSTEM_SCOPE_ID,
        current_workspace_id: uuid::Uuid::now_v7(),
        is_root,
        permissions: permissions.iter().map(|value| value.to_string()).collect(),
    }
}
```

- [ ] **Step 2: Run the focused control-plane and repository tests together**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane file_management_service_tests -- --nocapture
cargo test --manifest-path api/Cargo.toml -p storage-postgres file_management_repository_tests -- --nocapture
```

Expected:

- PASS for both crates with the same metadata semantics.

- [ ] **Step 3: Run the bootstrap-related smoke tests to protect catalog growth**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-postgres role_policy_tests -- --nocapture
```

Expected:

- PASS, confirming new permissions do not break auto-grant role behavior.

- [ ] **Step 4: Review the diff for scope leakage**

Run:

```bash
git diff -- api/crates/domain api/crates/access-control api/crates/control-plane api/crates/storage-postgres
```

Expected:

- `storage-object` not touched here, and no multipart or route code appears in this metadata plan.

- [ ] **Step 5: Commit the completed control-plane and persistence foundation**

```bash
git add api/crates/domain api/crates/access-control api/crates/control-plane api/crates/storage-postgres
git commit -m "feat: finalize file management metadata foundation"
```
