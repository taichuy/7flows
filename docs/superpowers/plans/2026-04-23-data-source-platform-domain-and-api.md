# Data Source Platform Domain And API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `data-source-platform` domain records, control-plane services and ports, PostgreSQL persistence, API-server runtime wiring, and console routes so the platform can register, validate, preview, and import external data sources through the new plugin contract.

**Architecture:** Reuse the successful `model_provider` pattern instead of inventing a second architecture. Domain owns the new records; control-plane owns the business commands and runtime port; `storage-postgres` owns persistence and migrations; API-server owns the protocol surface and runtime-host composition. The platform stores only metadata and controlled imports, never external source schemas as platform-owned truth.

**Tech Stack:** Rust workspace crates, `sqlx`, `axum`, `utoipa`, targeted `cargo test`.

**Source Discussion:** This is the platform half of the approved data-source architecture after the plugin contract root exists.

---

## File Structure

**Create**
- `api/crates/domain/src/data_source.rs`
- `api/crates/control-plane/src/data_source.rs`
- `api/crates/control-plane/src/ports/data_source.rs`
- `api/crates/control-plane/src/_tests/data_source_service_tests.rs`
- `api/crates/storage-postgres/src/data_source_repository.rs`
- `api/crates/storage-postgres/src/_tests/data_source_repository_tests.rs`
- `api/crates/storage-postgres/migrations/20260423190000_add_data_source_platform.sql`
- `api/apps/api-server/src/routes/plugins_and_models/data_sources.rs`
- `api/apps/api-server/src/_tests/data_sources_routes.rs`

**Modify**
- `api/crates/domain/src/lib.rs`
- `api/crates/control-plane/src/lib.rs`
- `api/crates/control-plane/src/ports/mod.rs`
- `api/crates/control-plane/src/ports/runtime.rs`
- `api/crates/storage-postgres/src/lib.rs`
- `api/crates/storage-postgres/src/_tests/mod.rs`
- `api/apps/api-server/src/provider_runtime.rs`
- `api/apps/api-server/src/app_state.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/routes/plugins_and_models/mod.rs`
- `api/apps/api-server/src/routes/mod.rs`
- `api/apps/api-server/src/openapi.rs`

**Notes**
- Keep naming at the resource level. Use `resource_key`, not `table_name`, in shared platform contracts.
- V1 does not add generic write-back routes.

### Task 1: Add Domain Records, Control-Plane Ports, And Service Commands

**Files:**
- Create: `api/crates/domain/src/data_source.rs`
- Modify: `api/crates/domain/src/lib.rs`
- Create: `api/crates/control-plane/src/ports/data_source.rs`
- Modify: `api/crates/control-plane/src/ports/mod.rs`
- Modify: `api/crates/control-plane/src/ports/runtime.rs`
- Create: `api/crates/control-plane/src/data_source.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Create: `api/crates/control-plane/src/_tests/data_source_service_tests.rs`

- [x] **Step 1: Write failing service tests for instance validation and preview**

Create `api/crates/control-plane/src/_tests/data_source_service_tests.rs` with a repository stub and runtime stub:

```rust
#[tokio::test]
async fn validate_instance_updates_status_and_catalog_cache() {
    let repository = InMemoryDataSourceRepository::default();
    let runtime = StubDataSourceRuntime::ready();
    let service = DataSourceService::new(repository.clone(), runtime);

    let created = service
        .create_instance(CreateDataSourceInstanceCommand {
            actor_user_id: user_id(),
            workspace_id: workspace_id(),
            installation_id: installation_id(),
            source_code: "acme_hubspot_source".into(),
            display_name: "HubSpot".into(),
            config_json: serde_json::json!({ "client_id": "abc" }),
            secret_json: serde_json::json!({ "client_secret": "secret" }),
        })
        .await
        .unwrap();

    let validated = service
        .validate_instance(ValidateDataSourceInstanceCommand {
            actor_user_id: user_id(),
            workspace_id: workspace_id(),
            instance_id: created.instance.id,
        })
        .await
        .unwrap();

    assert_eq!(validated.instance.status, domain::DataSourceInstanceStatus::Ready);
    assert_eq!(validated.catalog.refresh_status, domain::DataSourceCatalogRefreshStatus::Ready);
}
```

- [x] **Step 2: Run the focused control-plane test to verify failure**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane data_source_service_tests -- --nocapture
```

Expected:

- FAIL because the domain records, service, and ports do not exist yet.

- [x] **Step 3: Add the new records, repository port, runtime port, and service**

Create `api/crates/domain/src/data_source.rs` with the V1 record set:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataSourceInstanceStatus {
    Draft,
    Ready,
    Invalid,
    Disabled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataSourceCatalogRefreshStatus {
    Idle,
    Ready,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DataSourceInstanceRecord {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub installation_id: Uuid,
    pub source_code: String,
    pub display_name: String,
    pub status: DataSourceInstanceStatus,
    pub config_json: serde_json::Value,
    pub metadata_json: serde_json::Value,
    pub created_by: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}
```

Create `api/crates/control-plane/src/ports/data_source.rs`:

```rust
#[async_trait]
pub trait DataSourceRepository: Send + Sync {
    async fn create_instance(
        &self,
        input: &CreateDataSourceInstanceInput,
    ) -> anyhow::Result<domain::DataSourceInstanceRecord>;
    async fn update_instance_status(
        &self,
        input: &UpdateDataSourceInstanceStatusInput,
    ) -> anyhow::Result<domain::DataSourceInstanceRecord>;
    async fn get_instance(
        &self,
        workspace_id: Uuid,
        instance_id: Uuid,
    ) -> anyhow::Result<Option<domain::DataSourceInstanceRecord>>;
    async fn upsert_secret(
        &self,
        input: &UpsertDataSourceSecretInput,
    ) -> anyhow::Result<domain::DataSourceSecretRecord>;
    async fn upsert_catalog_cache(
        &self,
        input: &UpsertDataSourceCatalogCacheInput,
    ) -> anyhow::Result<domain::DataSourceCatalogCacheRecord>;
    async fn create_preview_session(
        &self,
        input: &CreateDataSourcePreviewSessionInput,
    ) -> anyhow::Result<domain::DataSourcePreviewSessionRecord>;
}
```

Extend `api/crates/control-plane/src/ports/runtime.rs`:

```rust
#[async_trait]
pub trait DataSourceRuntimePort: Send + Sync {
    async fn ensure_loaded(
        &self,
        installation: &domain::PluginInstallationRecord,
    ) -> anyhow::Result<()>;
    async fn validate_config(
        &self,
        installation: &domain::PluginInstallationRecord,
        config_json: serde_json::Value,
        secret_json: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value>;
    async fn test_connection(
        &self,
        installation: &domain::PluginInstallationRecord,
        config_json: serde_json::Value,
        secret_json: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value>;
    async fn discover_catalog(
        &self,
        installation: &domain::PluginInstallationRecord,
        config_json: serde_json::Value,
        secret_json: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value>;
    async fn preview_read(
        &self,
        installation: &domain::PluginInstallationRecord,
        input: plugin_framework::data_source_contract::DataSourcePreviewReadInput,
    ) -> anyhow::Result<plugin_framework::data_source_contract::DataSourcePreviewReadOutput>;
}
```

Create `api/crates/control-plane/src/data_source.rs` with service methods:

```rust
pub struct DataSourceService<R, H> {
    repository: R,
    runtime: H,
}

impl<R, H> DataSourceService<R, H>
where
    R: AuthRepository + PluginRepository + DataSourceRepository,
    H: DataSourceRuntimePort,
{
    pub async fn create_instance(&self, command: CreateDataSourceInstanceCommand) -> Result<DataSourceInstanceView> { ... }
    pub async fn validate_instance(&self, command: ValidateDataSourceInstanceCommand) -> Result<ValidateDataSourceInstanceResult> { ... }
    pub async fn preview_read(&self, command: PreviewDataSourceReadCommand) -> Result<PreviewDataSourceReadResult> { ... }
}
```

- [x] **Step 4: Re-run the control-plane data-source tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane data_source_service_tests -- --nocapture
```

Expected:

- PASS with the new service layer and ports rooted.

- [x] **Step 5: Commit the domain and control-plane surface**

```bash
git add api/crates/domain api/crates/control-plane
git commit -m "feat: add data source platform domain and service"
```

### Task 2: Add PostgreSQL Persistence And Migrations For Data-Source Platform State

**Files:**
- Create: `api/crates/storage-postgres/src/data_source_repository.rs`
- Create: `api/crates/storage-postgres/src/_tests/data_source_repository_tests.rs`
- Create: `api/crates/storage-postgres/migrations/20260423190000_add_data_source_platform.sql`
- Modify: `api/crates/storage-postgres/src/lib.rs`
- Modify: `api/crates/storage-postgres/src/_tests/mod.rs`

- [x] **Step 1: Write the failing repository tests**

Create `api/crates/storage-postgres/src/_tests/data_source_repository_tests.rs`:

```rust
#[tokio::test]
async fn creates_instance_secret_and_catalog_cache_rows() {
    let pool = storage_postgres::connect(&isolated_database_url().await).await.unwrap();
    storage_postgres::run_migrations(&pool).await.unwrap();
    let store = storage_postgres::PgControlPlaneStore::new(pool);

    let created = <storage_postgres::PgControlPlaneStore as DataSourceRepository>::create_instance(
        &store,
        &CreateDataSourceInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: seed_workspace(&store).await,
            installation_id: seed_installation(&store).await,
            source_code: "acme_hubspot_source".into(),
            display_name: "HubSpot".into(),
            status: domain::DataSourceInstanceStatus::Draft,
            config_json: serde_json::json!({ "client_id": "abc" }),
            metadata_json: serde_json::json!({}),
            created_by: seed_user(&store).await,
        },
    )
    .await
    .unwrap();

    assert_eq!(created.source_code, "acme_hubspot_source");
}
```

- [x] **Step 2: Run the focused repository test to verify failure**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-postgres data_source_repository_tests -- --nocapture
```

Expected:

- FAIL because the migration, repository file, and trait impl do not exist yet.

- [x] **Step 3: Add the migration and repository implementation**

Create `api/crates/storage-postgres/migrations/20260423190000_add_data_source_platform.sql`:

```sql
create table data_source_instances (
    id uuid primary key,
    workspace_id uuid not null references workspaces(id) on delete cascade,
    installation_id uuid not null references plugin_installations(id) on delete cascade,
    source_code text not null,
    display_name text not null,
    status text not null,
    config_json jsonb not null default '{}'::jsonb,
    metadata_json jsonb not null default '{}'::jsonb,
    created_by uuid not null references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table data_source_secrets (
    data_source_instance_id uuid primary key references data_source_instances(id) on delete cascade,
    encrypted_secret_json jsonb not null,
    secret_version integer not null,
    updated_at timestamptz not null default now()
);

create table data_source_catalog_caches (
    data_source_instance_id uuid primary key references data_source_instances(id) on delete cascade,
    refresh_status text not null,
    catalog_json jsonb not null default '{}'::jsonb,
    last_error_message text null,
    refreshed_at timestamptz null
);

create table data_source_preview_sessions (
    id uuid primary key,
    workspace_id uuid not null references workspaces(id) on delete cascade,
    actor_user_id uuid not null references users(id),
    data_source_instance_id uuid null references data_source_instances(id) on delete cascade,
    config_fingerprint text not null,
    preview_json jsonb not null,
    expires_at timestamptz not null
);
```

Create `api/crates/storage-postgres/src/data_source_repository.rs` and implement `DataSourceRepository for PgControlPlaneStore`.

Add the new repository module to `api/crates/storage-postgres/src/lib.rs`:

```rust
pub mod data_source_repository;
```

- [x] **Step 4: Re-run the PostgreSQL repository tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-postgres data_source_repository_tests -- --nocapture
```

Expected:

- PASS with the new tables and repository methods working through `PgControlPlaneStore`.

- [ ] **Step 5: Commit the persistence layer**

```bash
git add api/crates/storage-postgres
git commit -m "feat: persist data source platform state"
```

### Task 3: Wire API-Server Runtime And Add Data-Source Console Routes

**Files:**
- Modify: `api/apps/api-server/src/provider_runtime.rs`
- Modify: `api/apps/api-server/src/app_state.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Create: `api/apps/api-server/src/routes/plugins_and_models/data_sources.rs`
- Modify: `api/apps/api-server/src/routes/plugins_and_models/mod.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Create: `api/apps/api-server/src/_tests/data_sources_routes.rs`

- [ ] **Step 1: Write failing route tests for create, validate, and preview**

Create `api/apps/api-server/src/_tests/data_sources_routes.rs`:

```rust
#[tokio::test]
async fn creates_and_validates_a_data_source_instance() {
    let app = test_app_with_fixture_data_source().await;

    let response = app
        .post("/api/console/data-sources/instances")
        .json(&serde_json::json!({
            "source_code": "acme_hubspot_source",
            "display_name": "HubSpot",
            "installation_id": seeded_installation_id(),
            "config_json": { "client_id": "abc" },
            "secret_json": { "client_secret": "secret" }
        }))
        .send()
        .await;

    response.assert_status_ok();
}
```

Also add route tests for:

1. `POST /api/console/data-sources/instances/{id}/validate`
2. `POST /api/console/data-sources/instances/{id}/preview-read`
3. `GET /api/console/data-sources/catalog`

- [ ] **Step 2: Run the focused API-server route test to verify failure**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server data_sources_routes -- --nocapture
```

Expected:

- FAIL because the runtime host wiring and routes do not exist yet.

- [ ] **Step 3: Add API runtime support and route handlers**

Extend `api/apps/api-server/src/provider_runtime.rs` so `ApiRuntimeServices` owns a `DataSourceHost` and the runtime wrapper implements `DataSourceRuntimePort`:

```rust
use control_plane::ports::DataSourceRuntimePort;
use plugin_runner::data_source_host::DataSourceHost;

#[derive(Clone)]
pub struct ApiRuntimeServices {
    provider_host: Arc<RwLock<ProviderHost>>,
    capability_host: Arc<RwLock<CapabilityHost>>,
    data_source_host: Arc<RwLock<DataSourceHost>>,
}
```

Add the new route file `api/apps/api-server/src/routes/plugins_and_models/data_sources.rs` with handlers shaped like:

```rust
pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/data-sources/catalog", get(list_catalog))
        .route("/data-sources/instances", post(create_instance))
        .route("/data-sources/instances/:instance_id/validate", post(validate_instance))
        .route("/data-sources/instances/:instance_id/preview-read", post(preview_read))
}
```

Register it in:

1. `routes/plugins_and_models/mod.rs`
2. `routes/mod.rs`
3. `api/apps/api-server/src/lib.rs`
4. `api/apps/api-server/src/openapi.rs`

- [ ] **Step 4: Re-run the data-source API tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server data_sources_routes -- --nocapture
```

Expected:

- PASS with the API-server owning the protocol surface while still delegating runtime work to the plugin host.

- [ ] **Step 5: Commit the API surface**

```bash
git add api/apps/api-server
git commit -m "feat: add data source platform api"
```
