# File Table Template Upload And Runtime Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision the built-in `attachments` file table, let workspaces create real file tables from the same fixed template, and expose backend APIs for storage management, file-table management, upload, and content read while preserving record-level `storage_id` snapshots.

**Architecture:** Reuse the existing dynamic-model path instead of inventing a second runtime system. A file-table provisioning service should create and publish model definitions from the fixed attachments template, then register them in `file_tables`. Upload routes must resolve the current table binding, validate through the selected `storage-object` driver, write the object, and insert the file record through `RuntimeEngine`. Content-read routes must use the stored `storage_id` snapshot on the record, not the table’s current binding.

**Tech Stack:** Rust workspace crates, `axum`, `tokio`, `serde_json`, `runtime-core`, targeted `cargo test`.

**Source Discussion:** Approved by the current file-manager storage spec; upload stays `Browser -> API Server -> storage-object driver` in V1.

---

## File Structure

**Create**
- `api/crates/control-plane/src/file_management/bootstrap.rs`
- `api/crates/control-plane/src/file_management/template.rs`
- `api/crates/control-plane/src/file_management/upload_service.rs`
- `api/crates/control-plane/src/_tests/file_management_bootstrap_tests.rs`
- `api/crates/control-plane/src/_tests/file_management_upload_tests.rs`
- `api/apps/api-server/src/routes/files.rs`
- `api/apps/api-server/src/routes/settings/file_storages.rs`
- `api/apps/api-server/src/routes/settings/file_tables.rs`
- `api/apps/api-server/src/_tests/file_management_routes.rs`

**Modify**
- `api/crates/control-plane/src/bootstrap.rs`
- `api/crates/control-plane/src/file_management/mod.rs`
- `api/crates/control-plane/src/ports/file_management.rs`
- `api/crates/control-plane/src/_tests/mod.rs`
- `api/crates/control-plane/src/_tests/support.rs`
- `api/crates/control-plane/src/_tests/bootstrap_tests.rs`
- `api/crates/storage-postgres/src/file_management_repository.rs`
- `api/crates/storage-postgres/src/_tests/file_management_repository_tests.rs`
- `api/apps/api-server/src/app_state.rs`
- `api/apps/api-server/src/config.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/openapi.rs`
- `api/apps/api-server/src/routes/mod.rs`
- `api/apps/api-server/src/routes/settings/mod.rs`

**Notes**
- This plan owns the first real end-to-end file flow. Do not add browser direct-upload or migration jobs here.
- `attachments` must exist before `runtime_registry.rebuild(...)` so `RuntimeEngine` sees it on server startup.
- The default local storage root must resolve to `api/storage`, separate from `api/plugins`.
- Keep `url` on the file record as optional cached output only; content-read must still resolve by `storage_id + path`.

### Task 1: Add The Fixed Attachments Template And Provisioning Services

**Files:**
- Create: `api/crates/control-plane/src/file_management/template.rs`
- Create: `api/crates/control-plane/src/file_management/bootstrap.rs`
- Create: `api/crates/control-plane/src/_tests/file_management_bootstrap_tests.rs`
- Modify: `api/crates/control-plane/src/file_management/mod.rs`
- Modify: `api/crates/control-plane/src/ports/file_management.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`
- Modify: `api/crates/control-plane/src/_tests/support.rs`

- [ ] **Step 1: Write the failing provisioning tests for builtin and workspace file tables**

Create `api/crates/control-plane/src/_tests/file_management_bootstrap_tests.rs`:

```rust
use control_plane::file_management::{
    attachments_template_fields, CreateWorkspaceFileTableCommand, FileManagementBootstrapService,
    FileTableProvisioningService,
};
use control_plane::_tests::support::MemoryProvisioningRepository;
use domain::FileTableScopeKind;
use uuid::Uuid;

#[test]
fn attachments_template_fields_match_the_approved_v1_schema() {
    let codes = attachments_template_fields()
        .into_iter()
        .map(|field| field.code)
        .collect::<Vec<_>>();

    assert_eq!(
        codes,
        vec![
            "title",
            "filename",
            "extname",
            "size",
            "mimetype",
            "path",
            "meta",
            "url",
            "storage_id",
        ]
    );
}

#[tokio::test]
async fn bootstrap_creates_builtin_attachments_once() {
    let repository = MemoryProvisioningRepository::default();
    let service = FileManagementBootstrapService::new(repository.clone());

    let first = service
        .ensure_builtin_attachments(Uuid::now_v7(), Uuid::now_v7(), "attachments")
        .await
        .unwrap();
    let second = service
        .ensure_builtin_attachments(Uuid::now_v7(), first.bound_storage_id, "attachments")
        .await
        .unwrap();

    assert_eq!(first.id, second.id);
    assert_eq!(first.scope_kind, FileTableScopeKind::System);
}

#[tokio::test]
async fn workspace_file_tables_reuse_the_same_template_and_default_storage() {
    let repository = MemoryProvisioningRepository::default();
    let service = FileTableProvisioningService::new(repository.clone());
    let default_storage_id = Uuid::now_v7();

    let created = service
        .create_workspace_file_table(CreateWorkspaceFileTableCommand {
            actor_user_id: Uuid::now_v7(),
            workspace_id: Uuid::now_v7(),
            code: "project_assets".into(),
            title: "Project Assets".into(),
            default_storage_id,
        })
        .await
        .unwrap();

    assert_eq!(created.scope_kind, FileTableScopeKind::Workspace);
    assert_eq!(created.bound_storage_id, default_storage_id);
}
```

- [ ] **Step 2: Run the focused provisioning tests to verify they fail**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane file_management_bootstrap_tests -- --nocapture
```

Expected:

- FAIL because the template helpers, bootstrap service, and provisioning service do not exist yet.

- [ ] **Step 3: Implement the fixed template and provisioning helpers**

Create `api/crates/control-plane/src/file_management/template.rs`:

```rust
use domain::ModelFieldKind;

#[derive(Debug, Clone)]
pub struct FileFieldTemplate {
    pub code: String,
    pub title: String,
    pub field_kind: ModelFieldKind,
    pub is_required: bool,
}

pub fn attachments_template_fields() -> Vec<FileFieldTemplate> {
    vec![
        FileFieldTemplate { code: "title".into(), title: "标题".into(), field_kind: ModelFieldKind::String, is_required: false },
        FileFieldTemplate { code: "filename".into(), title: "文件名".into(), field_kind: ModelFieldKind::String, is_required: true },
        FileFieldTemplate { code: "extname".into(), title: "扩展名".into(), field_kind: ModelFieldKind::String, is_required: false },
        FileFieldTemplate { code: "size".into(), title: "大小".into(), field_kind: ModelFieldKind::Number, is_required: true },
        FileFieldTemplate { code: "mimetype".into(), title: "MIME 类型".into(), field_kind: ModelFieldKind::String, is_required: true },
        FileFieldTemplate { code: "path".into(), title: "存储路径".into(), field_kind: ModelFieldKind::String, is_required: true },
        FileFieldTemplate { code: "meta".into(), title: "元数据".into(), field_kind: ModelFieldKind::Json, is_required: true },
        FileFieldTemplate { code: "url".into(), title: "缓存地址".into(), field_kind: ModelFieldKind::String, is_required: false },
        FileFieldTemplate { code: "storage_id".into(), title: "存储器 ID".into(), field_kind: ModelFieldKind::String, is_required: true },
    ]
}
```

Create `api/crates/control-plane/src/file_management/bootstrap.rs`:

```rust
use anyhow::Result;
use domain::{DataModelScopeKind, FileTableScopeKind, SYSTEM_SCOPE_ID};
use uuid::Uuid;

use crate::{file_management::attachments_template_fields, ports::{AddModelFieldInput, FileManagementRepository, ModelDefinitionRepository}};

pub struct FileManagementBootstrapService<R> {
    repository: R,
}

impl<R> FileManagementBootstrapService<R>
where
    R: FileManagementRepository + ModelDefinitionRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn ensure_builtin_attachments(
        &self,
        actor_user_id: Uuid,
        default_storage_id: Uuid,
        default_code: &str,
    ) -> Result<domain::FileTableRecord> {
        if let Some(existing) = self
            .repository
            .find_file_table_by_code(default_code)
            .await?
        {
            return Ok(existing);
        }

        let model = self
            .repository
            .create_model_definition(&crate::ports::CreateModelDefinitionInput {
                actor_user_id,
                scope_kind: DataModelScopeKind::System,
                scope_id: SYSTEM_SCOPE_ID,
                code: default_code.to_string(),
                title: "Attachments".into(),
            })
            .await?;

        for field in attachments_template_fields() {
            self.repository
                .add_model_field(&AddModelFieldInput {
                    actor_user_id,
                    model_id: model.id,
                    code: field.code,
                    title: field.title,
                    field_kind: field.field_kind,
                    is_required: field.is_required,
                    is_unique: false,
                    default_value: None,
                    display_interface: None,
                    display_options: serde_json::json!({}),
                    relation_target_model_id: None,
                    relation_options: serde_json::json!({}),
                })
                .await?;
        }

        let published = self
            .repository
            .publish_model_definition(actor_user_id, model.id)
            .await?;

        self.repository
            .create_file_table_registration(&crate::ports::CreateFileTableRegistrationInput {
                file_table_id: Uuid::now_v7(),
                actor_user_id,
                code: published.code,
                title: published.title,
                scope_kind: FileTableScopeKind::System,
                scope_id: SYSTEM_SCOPE_ID,
                model_definition_id: published.id,
                bound_storage_id: default_storage_id,
                is_builtin: true,
                is_default: true,
            })
            .await
    }
}
```

Add the workspace provisioner in `api/crates/control-plane/src/file_management/mod.rs`:

```rust
mod bootstrap;
mod template;
mod upload_service;

pub use bootstrap::*;
pub use template::*;
pub use upload_service::*;
```

And add `CreateWorkspaceFileTableCommand` plus `FileTableProvisioningService`:

```rust
pub struct CreateWorkspaceFileTableCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub code: String,
    pub title: String,
    pub default_storage_id: Uuid,
}

pub struct FileTableProvisioningService<R> {
    repository: R,
}
```

Update `api/crates/control-plane/src/ports/file_management.rs` with the extra registration lookups used by provisioning and upload:

```rust
#[derive(Debug, Clone)]
pub struct CreateFileTableRegistrationInput {
    pub file_table_id: Uuid,
    pub actor_user_id: Uuid,
    pub code: String,
    pub title: String,
    pub scope_kind: domain::FileTableScopeKind,
    pub scope_id: Uuid,
    pub model_definition_id: Uuid,
    pub bound_storage_id: Uuid,
    pub is_builtin: bool,
    pub is_default: bool,
}

#[async_trait]
pub trait FileManagementRepository: Send + Sync {
    async fn find_file_table_by_code(
        &self,
        code: &str,
    ) -> anyhow::Result<Option<domain::FileTableRecord>>;
    async fn get_file_table(
        &self,
        file_table_id: Uuid,
    ) -> anyhow::Result<Option<domain::FileTableRecord>>;
    async fn create_file_table_registration(
        &self,
        input: &CreateFileTableRegistrationInput,
    ) -> anyhow::Result<domain::FileTableRecord>;
}
```

Update `api/crates/storage-postgres/src/file_management_repository.rs` with the matching repository methods:

```rust
    async fn find_file_table_by_code(
        &self,
        code: &str,
    ) -> Result<Option<domain::FileTableRecord>> {
        let row = sqlx::query("select * from file_tables where code = $1")
            .bind(code)
            .fetch_optional(self.pool())
            .await?;
        row.map(map_file_table).transpose()
    }

    async fn get_file_table(
        &self,
        file_table_id: Uuid,
    ) -> Result<Option<domain::FileTableRecord>> {
        let row = sqlx::query("select * from file_tables where id = $1")
            .bind(file_table_id)
            .fetch_optional(self.pool())
            .await?;
        row.map(map_file_table).transpose()
    }

    async fn create_file_table_registration(
        &self,
        input: &CreateFileTableRegistrationInput,
    ) -> Result<domain::FileTableRecord> {
        let row = sqlx::query(
            r#"
            insert into file_tables (
                id, code, title, scope_kind, scope_id, model_definition_id,
                bound_storage_id, is_builtin, is_default, status, created_by, updated_by
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $10)
            returning *
            "#,
        )
        .bind(input.file_table_id)
        .bind(&input.code)
        .bind(&input.title)
        .bind(match input.scope_kind {
            domain::FileTableScopeKind::System => "system",
            domain::FileTableScopeKind::Workspace => "workspace",
        })
        .bind(input.scope_id)
        .bind(input.model_definition_id)
        .bind(input.bound_storage_id)
        .bind(input.is_builtin)
        .bind(input.is_default)
        .bind(input.actor_user_id)
        .fetch_one(self.pool())
        .await?;

        map_file_table(row)
    }
```

Update `api/crates/control-plane/src/_tests/support.rs` with the in-memory provisioning fake used by the new tests:

```rust
#[derive(Clone, Default)]
pub struct MemoryProvisioningRepository {
    pub file_tables: Arc<Mutex<Vec<domain::FileTableRecord>>>,
}

impl MemoryProvisioningRepository {
    pub fn recorded_file_tables(&self) -> Vec<domain::FileTableRecord> {
        self.file_tables.lock().unwrap().clone()
    }
}
```

- [ ] **Step 4: Re-run the focused provisioning tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane file_management_bootstrap_tests -- --nocapture
```

Expected:

- PASS with the fixed field codes in order and `attachments` bootstrap idempotent.

- [ ] **Step 5: Commit the provisioning layer**

```bash
git add api/crates/control-plane api/crates/storage-postgres
git commit -m "feat: add file table provisioning services"
```

### Task 2: Wire Startup Bootstrap And The Storage Driver Registry Into API State

**Files:**
- Modify: `api/crates/control-plane/src/bootstrap.rs`
- Modify: `api/crates/control-plane/src/_tests/bootstrap_tests.rs`
- Modify: `api/crates/control-plane/src/file_management/storage_service.rs`
- Modify: `api/crates/storage-postgres/src/file_management_repository.rs`
- Modify: `api/crates/storage-postgres/src/_tests/file_management_repository_tests.rs`
- Modify: `api/apps/api-server/src/app_state.rs`
- Modify: `api/apps/api-server/src/config.rs`
- Modify: `api/apps/api-server/src/lib.rs`

- [ ] **Step 1: Write the failing config and startup tests**

Add to `api/apps/api-server/src/_tests/config_tests.rs`:

```rust
#[test]
fn api_config_uses_api_storage_as_default_business_file_root() {
    let config = crate::config::ApiConfig::from_env_map(&[
        ("API_DATABASE_URL", "postgres://postgres:postgres@127.0.0.1:5432/flowbase"),
        ("BOOTSTRAP_WORKSPACE_NAME", "System"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "password"),
    ])
    .unwrap();

    assert!(config.business_file_local_root.ends_with("api/storage"));
}
```

- [ ] **Step 2: Run the focused config test to verify it fails**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server api_config_uses_api_storage_as_default_business_file_root -- --nocapture
```

Expected:

- FAIL because `business_file_local_root` does not exist yet.

- [ ] **Step 3: Add the startup root-path setting and bootstrap call**

Update `api/crates/control-plane/src/bootstrap.rs` so startup can reuse the seeded root user id:

```rust
pub struct BootstrapResult {
    pub workspace_id: uuid::Uuid,
    pub root_user_id: uuid::Uuid,
}

pub async fn run(&self, config: &BootstrapConfig) -> Result<BootstrapResult> {
    // existing setup...
    let root_user = self
        .repository
        .upsert_root_user(
            workspace.id,
            &config.root_account,
            &config.root_email,
            &config.root_password_hash,
            &config.root_name,
            &config.root_nickname,
        )
        .await?;

    Ok(BootstrapResult {
        workspace_id: workspace.id,
        root_user_id: root_user.id,
    })
}
```

Update `api/crates/control-plane/src/file_management/storage_service.rs` with an idempotent local-default helper:

```rust
pub struct EnsureDefaultLocalStorageCommand {
    pub actor_user_id: Uuid,
    pub root_path: String,
}

pub async fn ensure_default_local_storage(
    &self,
    command: EnsureDefaultLocalStorageCommand,
) -> Result<domain::FileStorageRecord> {
    if let Some(existing) = self.repository.get_default_file_storage().await? {
        return Ok(existing);
    }

    self.create_storage(CreateFileStorageCommand {
        actor_user_id: command.actor_user_id,
        code: "local_default".into(),
        title: "Local".into(),
        driver_type: "local".into(),
        enabled: true,
        is_default: true,
        config_json: serde_json::json!({
            "root_path": command.root_path,
            "public_base_url": null
        }),
        rule_json: serde_json::json!({}),
    })
    .await
}
```

Update `api/apps/api-server/src/config.rs`:

```rust
#[derive(Debug, Clone)]
pub struct ApiConfig {
    pub business_file_local_root: String,
    // existing fields...
}

fn default_business_file_local_root() -> String {
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    find_workspace_root(&current_dir)
        .unwrap_or(current_dir)
        .join("api")
        .join("storage")
        .display()
        .to_string()
}
```

And in `ApiConfig::from_env_map`:

```rust
            business_file_local_root: default_business_file_local_root(),
```

Update `api/apps/api-server/src/app_state.rs`:

```rust
#[derive(Clone)]
pub struct ApiState {
    pub file_storage_registry: std::sync::Arc<storage_object::FileStorageDriverRegistry>,
    pub business_file_local_root: String,
    // existing fields...
}
```

Update `api/apps/api-server/src/lib.rs` near startup:

```rust
    let file_storage_registry = std::sync::Arc::new(storage_object::builtin_driver_registry());
    let bootstrap_result = BootstrapService::new(store.clone())
        .run(&BootstrapConfig {
            workspace_name: config.bootstrap_workspace_name.clone(),
            root_account: config.bootstrap_root_account.clone(),
            root_email: config.bootstrap_root_email.clone(),
            root_password_hash,
            root_name: config.bootstrap_root_name.clone(),
            root_nickname: config.bootstrap_root_nickname.clone(),
        })
        .await?;

    let default_storage = control_plane::file_management::FileStorageService::new(store.clone())
        .ensure_default_local_storage(
            control_plane::file_management::EnsureDefaultLocalStorageCommand {
                actor_user_id: bootstrap_result.root_user_id,
                root_path: config.business_file_local_root.clone(),
            },
        )
        .await?;

    control_plane::file_management::FileManagementBootstrapService::new(store.clone())
        .ensure_builtin_attachments(
            bootstrap_result.root_user_id,
            default_storage.id,
            "attachments",
        )
        .await?;

    runtime_registry.rebuild(store.list_runtime_model_metadata().await?);
```

And add the new fields when building `ApiState`:

```rust
        file_storage_registry,
        business_file_local_root: config.business_file_local_root.clone(),
```

- [ ] **Step 4: Re-run the focused config test**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server api_config_uses_api_storage_as_default_business_file_root -- --nocapture
```

Expected:

- PASS with the derived default root ending in `api/storage`.

- [ ] **Step 5: Commit the startup bootstrap wiring**

```bash
git add api/crates/control-plane api/crates/storage-postgres api/apps/api-server
git commit -m "feat: bootstrap file management at api startup"
```

### Task 3: Add File Management, Upload, And Content-Read Routes

**Files:**
- Create: `api/crates/control-plane/src/file_management/upload_service.rs`
- Create: `api/crates/control-plane/src/_tests/file_management_upload_tests.rs`
- Create: `api/apps/api-server/src/routes/files.rs`
- Create: `api/apps/api-server/src/routes/settings/file_storages.rs`
- Create: `api/apps/api-server/src/routes/settings/file_tables.rs`
- Create: `api/apps/api-server/src/_tests/file_management_routes.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/routes/settings/mod.rs`
- Modify: `api/apps/api-server/src/openapi.rs`

- [ ] **Step 1: Write the failing upload and content-route tests**

Create `api/apps/api-server/src/_tests/file_management_routes.rs`:

```rust
use axum::{body::Body, http::{Request, StatusCode}};
use tower::ServiceExt;

use crate::_tests::support::auth::{login_and_capture_cookie, test_app};

#[tokio::test]
async fn file_upload_route_accepts_file_table_id_and_returns_storage_snapshot() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let boundary = "----1flowbase-file-upload";
    let body = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"file_table_id\"\r\n\r\nfile-table-1\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"demo.txt\"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--{boundary}--\r\n"
    );

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/files/upload")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", format!("multipart/form-data; boundary={boundary}"))
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
}

#[tokio::test]
async fn file_content_route_reads_by_record_storage_snapshot() {
    let app = test_app().await;
    let (cookie, _csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/console/files/file-table-1/records/record-1/content")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_ne!(response.status(), StatusCode::NOT_IMPLEMENTED);
}
```

- [ ] **Step 2: Run the focused route tests to verify they fail**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server file_management_routes -- --nocapture
```

Expected:

- FAIL because the new routes and upload service do not exist yet.

- [ ] **Step 3: Implement the upload orchestrator and route handlers**

Create `api/crates/control-plane/src/file_management/upload_service.rs`:

```rust
use anyhow::{anyhow, Result};
use runtime_core::runtime_engine::RuntimeCreateInput;
use uuid::Uuid;

pub struct UploadFileCommand {
    pub actor: domain::ActorContext,
    pub file_table_id: Uuid,
    pub original_filename: String,
    pub content_type: Option<String>,
    pub bytes: Vec<u8>,
}

pub struct UploadedFileView {
    pub record: serde_json::Value,
    pub storage_id: Uuid,
}

pub struct FileUploadService<R> {
    repository: R,
    registry: std::sync::Arc<storage_object::FileStorageDriverRegistry>,
    runtime_engine: std::sync::Arc<runtime_core::runtime_engine::RuntimeEngine>,
}

impl<R> FileUploadService<R>
where
    R: crate::ports::FileManagementRepository + crate::ports::ModelDefinitionRepository + Clone,
{
    pub fn new(
        repository: R,
        registry: std::sync::Arc<storage_object::FileStorageDriverRegistry>,
        runtime_engine: std::sync::Arc<runtime_core::runtime_engine::RuntimeEngine>,
    ) -> Self {
        Self {
            repository,
            registry,
            runtime_engine,
        }
    }

    pub async fn upload(&self, command: UploadFileCommand) -> Result<UploadedFileView> {
        let file_table = self
            .repository
            .get_file_table(command.file_table_id)
            .await?
            .ok_or_else(|| anyhow!("file_table_not_found"))?;
        let storage = self
            .repository
            .get_file_storage(file_table.bound_storage_id)
            .await?
            .ok_or_else(|| anyhow!("file_storage_not_found"))?;
        let model = self
            .repository
            .get_model_definition(command.actor.current_workspace_id, file_table.model_definition_id)
            .await?
            .ok_or_else(|| anyhow!("model_definition_not_found"))?;
        let driver = self
            .registry
            .get(&storage.driver_type)
            .ok_or_else(|| anyhow!("storage_driver_not_registered"))?;

        let file_id = Uuid::now_v7();
        let extname = command
            .original_filename
            .rsplit('.')
            .next()
            .filter(|value| *value != command.original_filename)
            .unwrap_or("")
            .to_string();
        let object_path = format!(
            "{}/{}/{:04}/{:02}/{}.{}",
            if command.actor.is_root { "system" } else { "workspace" },
            model.code,
            2026,
            4,
            file_id,
            extname
        );

        let stored = driver
            .put_object(storage_object::FileStoragePutInput {
                config_json: &storage.config_json,
                object_path: &object_path,
                content_type: command.content_type.as_deref(),
                bytes: &command.bytes,
            })
            .await?;

        let record = self
            .runtime_engine
            .create_record(RuntimeCreateInput {
                actor: command.actor,
                model_code: model.code.clone(),
                payload: serde_json::json!({
                    "title": command.original_filename,
                    "filename": command.original_filename,
                    "extname": extname,
                    "size": command.bytes.len(),
                    "mimetype": command.content_type,
                    "path": stored.path,
                    "meta": stored.metadata_json,
                    "url": stored.url,
                    "storage_id": storage.id.to_string(),
                }),
            })
            .await?;

        Ok(UploadedFileView {
            record,
            storage_id: storage.id,
        })
    }
}
```

Create `api/apps/api-server/src/routes/files.rs`:

```rust
use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    response::ApiSuccess,
};

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct UploadedFileResponse {
    pub storage_id: String,
    #[schema(value_type = Object)]
    pub record: serde_json::Value,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/files/upload", post(upload_file))
        .route("/files/:file_table_id/records/:record_id/content", get(read_file_content))
}

pub async fn upload_file(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<ApiSuccess<UploadedFileResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let mut file_table_id = None;
    let mut filename = None;
    let mut content_type = None;
    let mut bytes = None;

    while let Some(field) = multipart.next_field().await? {
        match field.name() {
            Some("file_table_id") => file_table_id = field.text().await.ok(),
            Some("file") => {
                filename = field.file_name().map(str::to_string);
                content_type = field.content_type().map(str::to_string);
                bytes = Some(field.bytes().await?.to_vec());
            }
            _ => {}
        }
    }

    let uploaded = control_plane::file_management::FileUploadService::new(
        state.store.clone(),
        state.file_storage_registry.clone(),
        state.runtime_engine.clone(),
    )
    .upload(control_plane::file_management::UploadFileCommand {
        actor: context.actor,
        file_table_id: Uuid::parse_str(file_table_id.as_deref().unwrap_or(""))?,
        original_filename: filename.unwrap_or_else(|| "upload.bin".into()),
        content_type,
        bytes: bytes.unwrap_or_default(),
    })
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(UploadedFileResponse {
            storage_id: uploaded.storage_id.to_string(),
            record: uploaded.record,
        })),
    ))
}

pub async fn read_file_content(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((file_table_id, record_id)): Path<(String, String)>,
) -> Result<Response, ApiError> {
    let context = require_session(&state, &headers).await?;
    let file_table = state
        .store
        .get_file_table(Uuid::parse_str(&file_table_id)?)
        .await?
        .ok_or(control_plane::errors::ControlPlaneError::NotFound("file_table"))?;
    let model = state
        .store
        .get_model_definition(context.actor.current_workspace_id, file_table.model_definition_id)
        .await?
        .ok_or(control_plane::errors::ControlPlaneError::NotFound("model_definition"))?;
    let record = state
        .runtime_engine
        .get_record(runtime_core::runtime_engine::RuntimeGetInput {
            actor: context.actor,
            model_code: model.code,
            record_id,
        })
        .await?;

    let payload = record.ok_or(control_plane::errors::ControlPlaneError::NotFound("runtime_record"))?;
    let storage_id = payload
        .get("storage_id")
        .and_then(|value| value.as_str())
        .ok_or(control_plane::errors::ControlPlaneError::InvalidInput("storage_id"))?;
    let path = payload
        .get("path")
        .and_then(|value| value.as_str())
        .ok_or(control_plane::errors::ControlPlaneError::InvalidInput("path"))?;
    let storage = state
        .store
        .get_file_storage(Uuid::parse_str(storage_id)?)
        .await?
        .ok_or(control_plane::errors::ControlPlaneError::NotFound("file_storage"))?;
    let driver = state
        .file_storage_registry
        .get(&storage.driver_type)
        .ok_or(control_plane::errors::ControlPlaneError::Conflict("storage_driver_not_registered"))?;
    let bytes = driver
        .open_read(storage_object::OpenReadInput {
            config_json: &storage.config_json,
            object_path: path,
        })
        .await?;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(
            axum::http::header::CONTENT_TYPE,
            payload
                .get("mimetype")
                .and_then(|value| value.as_str())
                .unwrap_or("application/octet-stream"),
        )
        .body(Body::from(bytes.bytes))
        .unwrap())
}
```

Update `api/apps/api-server/src/routes/settings/mod.rs`:

```rust
pub mod file_storages;
pub mod file_tables;
```

Update `api/apps/api-server/src/routes/mod.rs`:

```rust
#[path = "files.rs"]
mod files_group;

pub use files_group as files;
pub use settings_group::{docs, file_storages, file_tables, members, permissions, roles, system, workspace, workspaces};
```

- [ ] **Step 4: Re-run the focused route tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server file_management_routes -- --nocapture
```

Expected:

- PASS with `/api/console/files/upload` returning `201` and the content route no longer returning `501` or missing-route errors.

- [ ] **Step 5: Commit the file-management APIs**

```bash
git add api/crates/control-plane api/apps/api-server
git commit -m "feat: add file management upload and content routes"
```

### Task 4: Close The Backend Slice With Runtime And OpenAPI Regression

**Files:**
- Modify: `api/apps/api-server/src/openapi.rs`

- [ ] **Step 1: Register the new route handlers and schemas in OpenAPI**

Update `api/apps/api-server/src/openapi.rs`:

```rust
        crate::routes::file_storages::list_file_storages,
        crate::routes::file_storages::create_file_storage,
        crate::routes::file_tables::list_file_tables,
        crate::routes::file_tables::create_file_table,
        crate::routes::file_tables::bind_file_table_storage,
        crate::routes::files::upload_file,
        crate::routes::files::read_file_content,
```

And add the response bodies:

```rust
        crate::routes::files::UploadedFileResponse,
        crate::routes::file_storages::FileStorageResponse,
        crate::routes::file_tables::FileTableResponse,
```

- [ ] **Step 2: Run the focused backend regression set**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane file_management_ -- --nocapture
cargo test --manifest-path api/Cargo.toml -p api-server file_management_routes -- --nocapture
cargo test --manifest-path api/Cargo.toml -p api-server openapi_alignment -- --nocapture
```

Expected:

- PASS with provisioning, upload, route registration, and OpenAPI alignment all green.

- [ ] **Step 3: Run one runtime regression to ensure dynamic record CRUD still works**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server runtime_model_routes -- --nocapture
```

Expected:

- PASS, proving the new file-table provisioning still fits the existing runtime engine behavior.

- [ ] **Step 4: Review the diff for forbidden scope changes**

Run:

```bash
git diff -- api/crates/control-plane api/apps/api-server
```

Expected:

- No direct file bytes stored in PostgreSQL tables.
- No `api/plugins` references in business-file code paths.
- Content read still depends on record-level `storage_id`.

- [ ] **Step 5: Commit the completed backend runtime slice**

```bash
git add api/crates/control-plane api/apps/api-server
git commit -m "feat: finalize file table upload runtime access"
```
