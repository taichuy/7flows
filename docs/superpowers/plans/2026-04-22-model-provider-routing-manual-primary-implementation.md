# Model Provider Routing Manual Primary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current “latest ready instance wins” behavior with an explicit workspace-level provider routing layer that supports `manual_primary` selection, and make settings, model-provider options, and orchestration runtime all resolve through the same primary instance.

**Architecture:** Keep node contracts unchanged: `agent-flow` nodes still store only `provider_code + model_id`. Add a provider routing truth layer in the backend (`workspace + provider_code -> primary_instance_id`), expose that truth in console APIs as `is_primary`, and update runtime compile-context plus settings UI to consume the same routing record instead of inferring instance choice from `updated_at`.

**Tech Stack:** Rust workspace (`domain`, `control-plane`, `storage-pg`, `api-server`, `orchestration-runtime`), PostgreSQL + `sqlx`, Axum + Utoipa, React 19 + TypeScript, TanStack Query, Ant Design 5, existing `@1flowbase/api-client`

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-22-model-provider-routing-manual-primary-design.md`

**Out Of Scope:** automatic failover, candidate pools, cooldown / half-open recovery, per-model routing, runtime health probing, silent fallback to another instance

---

## File Structure

- `api/crates/storage-pg/migrations/20260422223000_create_model_provider_routings.sql`
  - New routing truth table keyed by `workspace_id + provider_code`.
- `api/crates/domain/src/model_provider.rs`
  - Add routing mode enum and routing record domain types.
- `api/crates/domain/src/lib.rs`
  - Export the new routing types.
- `api/crates/control-plane/src/ports/model_provider.rs`
  - Add routing repository inputs and read/write methods.
- `api/crates/storage-pg/src/model_provider_repository.rs`
  - Persist routing records and clear them when deleting the primary instance.
- `api/crates/storage-pg/src/mappers/model_provider_mapper.rs`
  - Map routing rows into domain objects.
- `api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs`
  - Lock routing CRUD and delete cleanup behavior.
- `api/crates/control-plane/src/model_provider.rs`
  - Add routing command / view types and surface `is_primary` in instance views.
- `api/crates/control-plane/src/model_provider/routing.rs`
  - New routing resolver and update flow shared by settings options and runtime consumers.
- `api/crates/control-plane/src/model_provider/catalog.rs`
  - Replace latest-instance inference with explicit routing resolution for `/options`.
- `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`
  - Lock `list_instances`, `/options`, and routing update behavior against explicit primary selection.
- `api/apps/api-server/src/routes/plugins_and_models/model_providers.rs`
  - Add routing update endpoint and include `is_primary` in instance DTOs.
- `api/apps/api-server/src/_tests/model_provider_routes.rs`
  - Lock route shape, CSRF enforcement, and primary-flag echo.
- `api/apps/api-server/src/openapi.rs`
  - Register new routing path plus request/response schemas.
- `api/crates/control-plane/src/orchestration_runtime/compile_context.rs`
  - Resolve compile-time provider family through routing records instead of `updated_at`.
- `api/crates/control-plane/src/_tests/orchestration_runtime/support/repository.rs`
  - Seed multiple provider instances and routing records in the in-memory runtime repository.
- `api/crates/control-plane/src/_tests/orchestration_runtime/service.rs`
  - Assert debug execution uses the routed primary instance, not the newest one.
- `web/packages/api-client/src/console-model-providers.ts`
  - Add `is_primary` to instance DTOs plus routing update DTO/API function.
- `web/app/src/features/settings/api/model-providers.ts`
  - Re-export routing DTOs and wrapper function for the settings feature.
- `web/app/src/features/settings/pages/settings-page/model-providers/shared.ts`
  - Prefer `is_primary` when picking the selected modal instance.
- `web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-data.ts`
  - Derive primary-instance summaries for each provider row.
- `web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-mutations.ts`
  - Add routing mutation and invalidate affected provider queries.
- `web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx`
  - Show provider-level “主实例” summary inline in the installed-provider table.
- `web/app/src/features/settings/components/model-providers/ModelProviderInstancesModal.tsx`
  - Add compact primary-instance selector and primary badge in the instance list.
- `web/app/src/features/settings/components/model-providers/model-provider-panel.css`
  - Style the new primary selector / badge / summary text.
- `web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx`
  - Thread new summary data and routing mutation into the settings section.
- `web/app/src/features/settings/api/_tests/settings-api.test.ts`
  - Lock DTO passthrough for `is_primary` and routing update wrappers.
- `web/app/src/features/settings/_tests/model-providers-page.test.tsx`
  - Verify the modal can switch the primary instance and the catalog row reflects it.

## Task 1: Add Provider Routing Persistence And Repository Methods

**Files:**
- Create: `api/crates/storage-pg/migrations/20260422223000_create_model_provider_routings.sql`
- Modify: `api/crates/domain/src/model_provider.rs`
- Modify: `api/crates/domain/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports/model_provider.rs`
- Modify: `api/crates/storage-pg/src/mappers/model_provider_mapper.rs`
- Modify: `api/crates/storage-pg/src/model_provider_repository.rs`
- Test: `api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs`

- [x] **Step 1: Write the failing storage test for manual-primary routing CRUD**

```rust
#[tokio::test]
async fn model_provider_repository_persists_manual_primary_routing_and_clears_it_on_delete() {
    let (store, workspace, actor, installation_id) = seed_store().await;

    let primary = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: workspace.id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Primary".into(),
            status: ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://primary.example.com/v1" }),
            configured_models: vec![],
            enabled_model_ids: vec!["gpt-4o-mini".into()],
            created_by: actor.id,
        },
    )
    .await
    .unwrap();

    let backup = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: workspace.id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Backup".into(),
            status: ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://backup.example.com/v1" }),
            configured_models: vec![],
            enabled_model_ids: vec!["gpt-4.1-mini".into()],
            created_by: actor.id,
        },
    )
    .await
    .unwrap();

    let routing = ModelProviderRepository::upsert_routing(
        &store,
        &UpsertModelProviderRoutingInput {
            workspace_id: workspace.id,
            provider_code: "fixture_provider".into(),
            routing_mode: domain::ModelProviderRoutingMode::ManualPrimary,
            primary_instance_id: primary.id,
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();

    assert_eq!(routing.primary_instance_id, primary.id);
    assert_eq!(
        ModelProviderRepository::get_routing(&store, workspace.id, "fixture_provider")
            .await
            .unwrap()
            .unwrap()
            .primary_instance_id,
        primary.id
    );

    ModelProviderRepository::delete_instance(&store, workspace.id, backup.id)
        .await
        .unwrap();
    assert_eq!(
        ModelProviderRepository::get_routing(&store, workspace.id, "fixture_provider")
            .await
            .unwrap()
            .unwrap()
            .primary_instance_id,
        primary.id
    );

    ModelProviderRepository::delete_instance(&store, workspace.id, primary.id)
        .await
        .unwrap();
    assert!(
        ModelProviderRepository::get_routing(&store, workspace.id, "fixture_provider")
            .await
            .unwrap()
            .is_none()
    );
}
```

- [x] **Step 2: Run the targeted storage test and verify it fails before implementation**

Run:

```bash
cargo test -p storage-pg model_provider_repository_persists_manual_primary_routing_and_clears_it_on_delete
```

Expected:

- FAIL because `UpsertModelProviderRoutingInput`, `ModelProviderRoutingMode`, and routing repository methods do not exist.
- FAIL because the routing table migration is missing.

- [x] **Step 3: Implement domain types, repository inputs, migration, and SQLx queries**

```rust
// api/crates/domain/src/model_provider.rs
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModelProviderRoutingMode {
    ManualPrimary,
}

impl ModelProviderRoutingMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ManualPrimary => "manual_primary",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelProviderRoutingRecord {
    pub workspace_id: Uuid,
    pub provider_code: String,
    pub routing_mode: ModelProviderRoutingMode,
    pub primary_instance_id: Uuid,
    pub created_by: Uuid,
    pub updated_by: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}
```

```rust
// api/crates/control-plane/src/ports/model_provider.rs
#[derive(Debug, Clone)]
pub struct UpsertModelProviderRoutingInput {
    pub workspace_id: Uuid,
    pub provider_code: String,
    pub routing_mode: domain::ModelProviderRoutingMode,
    pub primary_instance_id: Uuid,
    pub updated_by: Uuid,
}

#[async_trait]
pub trait ModelProviderRepository: Send + Sync {
    async fn upsert_routing(
        &self,
        input: &UpsertModelProviderRoutingInput,
    ) -> anyhow::Result<domain::ModelProviderRoutingRecord>;
    async fn get_routing(
        &self,
        workspace_id: Uuid,
        provider_code: &str,
    ) -> anyhow::Result<Option<domain::ModelProviderRoutingRecord>>;
    async fn list_routings(
        &self,
        workspace_id: Uuid,
    ) -> anyhow::Result<Vec<domain::ModelProviderRoutingRecord>>;
    async fn delete_routing(
        &self,
        workspace_id: Uuid,
        provider_code: &str,
    ) -> anyhow::Result<()>;
}
```

```sql
-- api/crates/storage-pg/migrations/20260422223000_create_model_provider_routings.sql
create table model_provider_routings (
    workspace_id uuid not null references workspaces(id) on delete cascade,
    provider_code text not null,
    routing_mode text not null,
    primary_instance_id uuid not null references model_provider_instances(id) on delete cascade,
    created_by uuid not null references users(id),
    updated_by uuid not null references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, provider_code)
);
```

```rust
// api/crates/storage-pg/src/model_provider_repository.rs
async fn upsert_routing(
    &self,
    input: &UpsertModelProviderRoutingInput,
) -> Result<domain::ModelProviderRoutingRecord> {
    let row = sqlx::query(
        r#"
        insert into model_provider_routings (
            workspace_id,
            provider_code,
            routing_mode,
            primary_instance_id,
            created_by,
            updated_by
        )
        values ($1, $2, $3, $4, $5, $5)
        on conflict (workspace_id, provider_code)
        do update set
            routing_mode = excluded.routing_mode,
            primary_instance_id = excluded.primary_instance_id,
            updated_by = excluded.updated_by,
            updated_at = now()
        returning *
        "#,
    )
    .bind(input.workspace_id)
    .bind(&input.provider_code)
    .bind(input.routing_mode.as_str())
    .bind(input.primary_instance_id)
    .bind(input.updated_by)
    .fetch_one(self.pool())
    .await?;

    map_routing(row)
}

async fn get_routing(
    &self,
    workspace_id: Uuid,
    provider_code: &str,
) -> Result<Option<domain::ModelProviderRoutingRecord>> {
    let row = sqlx::query(
        r#"
        select *
        from model_provider_routings
        where workspace_id = $1 and provider_code = $2
        "#,
    )
    .bind(workspace_id)
    .bind(provider_code)
    .fetch_optional(self.pool())
    .await?;

    row.map(map_routing).transpose()
}

async fn list_routings(
    &self,
    workspace_id: Uuid,
) -> Result<Vec<domain::ModelProviderRoutingRecord>> {
    let rows = sqlx::query(
        r#"
        select *
        from model_provider_routings
        where workspace_id = $1
        order by provider_code asc
        "#,
    )
    .bind(workspace_id)
    .fetch_all(self.pool())
    .await?;

    rows.into_iter().map(map_routing).collect()
}

async fn delete_routing(&self, workspace_id: Uuid, provider_code: &str) -> Result<()> {
    sqlx::query(
        r#"
        delete from model_provider_routings
        where workspace_id = $1 and provider_code = $2
        "#,
    )
    .bind(workspace_id)
    .bind(provider_code)
    .execute(self.pool())
    .await?;

    Ok(())
}
```

- [x] **Step 4: Re-run the storage repository test and the full model-provider repository suite**

Run:

```bash
cargo test -p storage-pg model_provider_repository_persists_manual_primary_routing_and_clears_it_on_delete
cargo test -p storage-pg model_provider_repository_tests
```

Expected:

- PASS for the new routing CRUD coverage.
- PASS for the existing instance / cache / secret repository coverage.

- [x] **Step 5: Commit the persistence layer**

```bash
git add api/crates/domain/src/model_provider.rs \
  api/crates/domain/src/lib.rs \
  api/crates/control-plane/src/ports/model_provider.rs \
  api/crates/storage-pg/migrations/20260422223000_create_model_provider_routings.sql \
  api/crates/storage-pg/src/mappers/model_provider_mapper.rs \
  api/crates/storage-pg/src/model_provider_repository.rs \
  api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs
git commit -m "feat: persist model provider manual primary routing"
```

## Task 2: Add Control-Plane Routing Resolution And Console API Support

**Files:**
- Modify: `api/crates/control-plane/src/model_provider.rs`
- Create: `api/crates/control-plane/src/model_provider/routing.rs`
- Modify: `api/crates/control-plane/src/model_provider/catalog.rs`
- Test: `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`
- Modify: `api/apps/api-server/src/routes/plugins_and_models/model_providers.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Test: `api/apps/api-server/src/_tests/model_provider_routes.rs`

- [x] **Step 1: Write failing service and route tests for explicit primary routing**

```rust
// api/crates/control-plane/src/_tests/model_provider_service_tests.rs
async fn seed_instance(
    repository: &MemoryModelProviderRepository,
    installation_id: Uuid,
    display_name: &str,
    model_ids: &[&str],
) -> domain::ModelProviderInstanceRecord {
    repository
        .create_instance(&CreateModelProviderInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: repository.actor.current_workspace_id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: display_name.into(),
            status: domain::ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": format!("https://{}.example.com/v1", display_name) }),
            configured_models: model_ids
                .iter()
                .map(|model_id| domain::ModelProviderConfiguredModel {
                    model_id: (*model_id).to_string(),
                    enabled: true,
                })
                .collect(),
            enabled_model_ids: model_ids.iter().map(|model_id| (*model_id).to_string()).collect(),
            created_by: repository.actor.user_id,
        })
        .await
        .unwrap()
}

#[tokio::test]
async fn model_provider_service_marks_primary_instance_and_options_use_primary_routing() {
    let repository = MemoryModelProviderRepository::new(actor_with_permissions(&[
        "state_model.view.all",
        "state_model.manage.all",
    ]));
    let installation_id = repository
        .seed_installation(&create_provider_fixture().await, domain::PluginDesiredState::ActiveRequested, true)
        .await;

    let primary = repository
        .seed_instance(
            installation_id,
            "OpenAI Production",
            domain::ModelProviderInstanceStatus::Ready,
            vec!["gpt-4o-mini"],
        )
        .await;
    let backup = repository
        .seed_instance(
            installation_id,
            "OpenAI Backup",
            domain::ModelProviderInstanceStatus::Ready,
            vec!["gpt-4.1-mini"],
        )
        .await;

    repository
        .upsert_routing(&crate::ports::UpsertModelProviderRoutingInput {
            workspace_id: repository.actor.current_workspace_id,
            provider_code: "fixture_provider".into(),
            routing_mode: domain::ModelProviderRoutingMode::ManualPrimary,
            primary_instance_id: primary.id,
            updated_by: repository.actor.user_id,
        })
        .await
        .unwrap();

    let service = ModelProviderService::new(repository.clone(), MemoryProviderRuntime::default(), "test-master-key");
    let instances = service.list_instances(repository.actor.user_id).await.unwrap();
    assert!(instances.iter().find(|view| view.instance.id == primary.id).unwrap().is_primary);
    assert!(!instances.iter().find(|view| view.instance.id == backup.id).unwrap().is_primary);

    let options = service
        .options(repository.actor.user_id, RequestedLocales::new("zh_Hans", "en_US"))
        .await
        .unwrap();
    assert_eq!(options.providers[0].effective_instance_display_name, "OpenAI Production");
    assert_eq!(options.providers[0].models[0].descriptor.model_id, "gpt-4o-mini");
}
```

```rust
// api/apps/api-server/src/_tests/model_provider_routes.rs
#[tokio::test]
async fn model_provider_routes_update_routing_marks_primary_instance() {
    let app = build_test_app().await;

    let response = app
        .put("/api/console/model-providers/providers/openai_compatible/routing")
        .header("x-csrf-token", "csrf-123")
        .json(&serde_json::json!({
            "routing_mode": "manual_primary",
            "primary_instance_id": "provider-1"
        }))
        .send()
        .await;

    response.assert_status_ok();
    response.assert_json_path(
        "$.data.primary_instance_id",
        serde_json::json!("provider-1")
    );

    let list = app.get("/api/console/model-providers").send().await;
    list.assert_status_ok();
    list.assert_json_path("$.data[0].is_primary", serde_json::json!(true));
}
```

- [x] **Step 2: Run the targeted control-plane and api-server tests and verify they fail**

Run:

```bash
cargo test -p control-plane model_provider_service_marks_primary_instance_and_options_use_primary_routing
cargo test -p api-server model_provider_routes_update_routing_marks_primary_instance
```

Expected:

- FAIL because `ModelProviderInstanceView` has no `is_primary`.
- FAIL because `ModelProviderService` has no routing update flow.
- FAIL because the new `PUT /model-providers/providers/:provider_code/routing` route does not exist.

- [x] **Step 3: Implement routing commands, service views, `/options` resolution, and the console route**

```rust
// api/crates/control-plane/src/model_provider.rs
pub struct UpdateModelProviderRoutingCommand {
    pub actor_user_id: Uuid,
    pub provider_code: String,
    pub routing_mode: domain::ModelProviderRoutingMode,
    pub primary_instance_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct ModelProviderRoutingView {
    pub provider_code: String,
    pub routing_mode: String,
    pub primary_instance_id: Uuid,
    pub primary_instance_display_name: String,
}

#[derive(Debug, Clone)]
pub struct ModelProviderInstanceView {
    pub instance: domain::ModelProviderInstanceRecord,
    pub cache: Option<domain::ModelProviderCatalogCacheRecord>,
    pub is_primary: bool,
}

let routings = self
    .repository
    .list_routings(actor.current_workspace_id)
    .await?
    .into_iter()
    .map(|routing| (routing.provider_code, routing.primary_instance_id))
    .collect::<HashMap<_, _>>();

output.push(ModelProviderInstanceView {
    is_primary: routings.get(&instance.provider_code) == Some(&instance.id),
    instance,
    cache,
});
```

```rust
// api/crates/control-plane/src/model_provider/routing.rs
pub(super) async fn resolve_primary_instance<R>(
    repository: &R,
    workspace_id: Uuid,
    provider_code: &str,
) -> Result<Option<domain::ModelProviderInstanceRecord>>
where
    R: ModelProviderRepository,
{
    let Some(routing) = repository.get_routing(workspace_id, provider_code).await? else {
        return Ok(None);
    };

    let instance = repository
        .get_instance(workspace_id, routing.primary_instance_id)
        .await?;

    Ok(instance.filter(|record| record.status == domain::ModelProviderInstanceStatus::Ready))
}
```

```rust
// api/crates/control-plane/src/_tests/model_provider_service_tests.rs
#[derive(Clone)]
struct MemoryModelProviderRepository {
    actor: ActorContext,
    installations: Arc<RwLock<HashMap<Uuid, PluginInstallationRecord>>>,
    assignments: Arc<RwLock<Vec<PluginAssignmentRecord>>>,
    tasks: Arc<RwLock<HashMap<Uuid, PluginTaskRecord>>>,
    instances: Arc<RwLock<HashMap<Uuid, ModelProviderInstanceRecord>>>,
    caches: Arc<RwLock<HashMap<Uuid, ModelProviderCatalogCacheRecord>>>,
    preview_sessions: Arc<RwLock<HashMap<Uuid, ModelProviderPreviewSessionRecord>>>,
    secrets: Arc<RwLock<HashMap<Uuid, (ModelProviderSecretRecord, Value)>>>,
    references: Arc<RwLock<HashMap<Uuid, u64>>>,
    audit_events: Arc<RwLock<Vec<String>>>,
    routings: Arc<RwLock<HashMap<String, domain::ModelProviderRoutingRecord>>>,
}

impl MemoryModelProviderRepository {
    fn new(actor: ActorContext) -> Self {
        Self {
            actor,
            installations: Arc::new(RwLock::new(HashMap::new())),
            assignments: Arc::new(RwLock::new(Vec::new())),
            tasks: Arc::new(RwLock::new(HashMap::new())),
            instances: Arc::new(RwLock::new(HashMap::new())),
            caches: Arc::new(RwLock::new(HashMap::new())),
            preview_sessions: Arc::new(RwLock::new(HashMap::new())),
            secrets: Arc::new(RwLock::new(HashMap::new())),
            references: Arc::new(RwLock::new(HashMap::new())),
            audit_events: Arc::new(RwLock::new(Vec::new())),
            routings: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[async_trait]
impl ModelProviderRepository for MemoryModelProviderRepository {
    async fn upsert_routing(
        &self,
        input: &crate::ports::UpsertModelProviderRoutingInput,
    ) -> Result<domain::ModelProviderRoutingRecord> {
        let record = domain::ModelProviderRoutingRecord {
            workspace_id: input.workspace_id,
            provider_code: input.provider_code.clone(),
            routing_mode: input.routing_mode,
            primary_instance_id: input.primary_instance_id,
            created_by: input.updated_by,
            updated_by: input.updated_by,
            created_at: OffsetDateTime::now_utc(),
            updated_at: OffsetDateTime::now_utc(),
        };
        self.routings
            .write()
            .await
            .insert(record.provider_code.clone(), record.clone());
        Ok(record)
    }

    async fn get_routing(
        &self,
        _workspace_id: Uuid,
        provider_code: &str,
    ) -> Result<Option<domain::ModelProviderRoutingRecord>> {
        Ok(self.routings.read().await.get(provider_code).cloned())
    }

    async fn list_routings(
        &self,
        _workspace_id: Uuid,
    ) -> Result<Vec<domain::ModelProviderRoutingRecord>> {
        Ok(self.routings.read().await.values().cloned().collect())
    }

    async fn delete_routing(&self, _workspace_id: Uuid, provider_code: &str) -> Result<()> {
        self.routings.write().await.remove(provider_code);
        Ok(())
    }
}
```

```rust
// api/apps/api-server/src/routes/plugins_and_models/model_providers.rs
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateModelProviderRoutingBody {
    pub routing_mode: String,
    pub primary_instance_id: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ModelProviderRoutingResponse {
    pub provider_code: String,
    pub routing_mode: String,
    pub primary_instance_id: String,
    pub primary_instance_display_name: String,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/model-providers/catalog", get(list_catalog))
        .route("/model-providers", get(list_instances).post(create_instance))
        .route(
            "/model-providers/providers/:provider_code/routing",
            put(update_routing),
        )
        .route("/model-providers/preview-models", post(preview_models))
        .route("/model-providers/options", get(list_options))
        .route("/model-providers/:id", patch(update_instance).delete(delete_instance))
        .route("/model-providers/:id/validate", post(validate_instance))
        .route("/model-providers/:id/secrets/reveal", post(reveal_secret))
        .route("/model-providers/:id/models", get(list_models))
        .route("/model-providers/:id/models/refresh", post(refresh_models))
}
```

- [x] **Step 4: Re-run the targeted tests plus the broader model-provider service/route suites**

Run:

```bash
cargo test -p control-plane model_provider_service_tests
cargo test -p api-server model_provider_routes
```

Expected:

- PASS for primary-flag and options-routing behavior.
- PASS for existing catalog / instance / validate / refresh route coverage.

- [x] **Step 5: Commit the control-plane and API surface**

```bash
git add api/crates/control-plane/src/model_provider.rs \
  api/crates/control-plane/src/model_provider/routing.rs \
  api/crates/control-plane/src/model_provider/catalog.rs \
  api/crates/control-plane/src/_tests/model_provider_service_tests.rs \
  api/apps/api-server/src/routes/plugins_and_models/model_providers.rs \
  api/apps/api-server/src/openapi.rs \
  api/apps/api-server/src/_tests/model_provider_routes.rs
git commit -m "feat: add manual primary provider routing api"
```

## Task 3: Route Orchestration Runtime Through The Primary Instance Resolver

**Files:**
- Modify: `api/crates/control-plane/src/orchestration_runtime/compile_context.rs`
- Modify: `api/crates/control-plane/src/_tests/orchestration_runtime/support/repository.rs`
- Modify: `api/crates/control-plane/src/_tests/orchestration_runtime/support/fixtures.rs`
- Test: `api/crates/control-plane/src/_tests/orchestration_runtime/service.rs`

- [x] **Step 1: Write the failing runtime test that proves compile-time routing no longer follows `updated_at`**

```rust
#[tokio::test]
async fn start_node_debug_preview_uses_primary_routed_provider_instance() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service
        .seed_application_with_multi_instance_provider_flow("Support Agent")
        .await;

    let outcome = service
        .start_node_debug_preview(StartNodeDebugPreviewCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            node_id: "node-llm".to_string(),
            input_payload: serde_json::json!({
                "node-start": { "query": "请总结退款政策" }
            }),
        })
        .await
        .unwrap();

    assert_eq!(
        outcome.node_run.metrics_payload["provider_instance_id"],
        serde_json::json!(seeded.primary_provider_instance_id.to_string())
    );
}
```

- [x] **Step 2: Run the targeted orchestration runtime test and verify it fails**

Run:

```bash
cargo test -p control-plane start_node_debug_preview_uses_primary_routed_provider_instance
```

Expected:

- FAIL because the in-memory orchestration repository seeds only one effective instance.
- FAIL because compile context still picks the latest ready instance via `updated_at`.

- [x] **Step 3: Refactor compile-context resolution to load explicit routing records**

```rust
// api/crates/control-plane/src/orchestration_runtime/compile_context.rs
pub(super) async fn build_compile_context<R>(
    repository: &R,
    workspace_id: Uuid,
) -> Result<orchestration_runtime::compiler::FlowCompileContext>
where
    R: ModelProviderRepository + NodeContributionRepository,
{
    let instances = repository.list_instances(workspace_id).await?;
    let routings = repository.list_routings(workspace_id).await?;
    let routing_by_provider = routings
        .into_iter()
        .map(|routing| (routing.provider_code.clone(), routing))
        .collect::<BTreeMap<_, _>>();
    let instances_by_id = instances
        .into_iter()
        .map(|instance| (instance.id, instance))
        .collect::<BTreeMap<_, _>>();

    for (provider_code, routing) in routing_by_provider {
        let Some(instance) = instances_by_id.get(&routing.primary_instance_id) else {
            continue;
        };
        let available_models = repository
            .get_catalog_cache(instance.id)
            .await?
            .and_then(|cache| cache.models_json.as_array().cloned())
            .unwrap_or_default()
            .into_iter()
            .filter_map(|model| model.get("model_id").and_then(Value::as_str).map(str::to_string))
            .collect::<BTreeSet<_>>();

        provider_families.insert(
            provider_code.clone(),
            orchestration_runtime::compiler::FlowCompileProviderFamily {
                effective_instance_id: instance.id.to_string(),
                provider_code,
                protocol: instance.protocol.clone(),
                is_ready: instance.status == domain::ModelProviderInstanceStatus::Ready,
                available_models,
                allow_custom_models: allow_custom_models(instance),
            },
        );
    }
}
```

```rust
// api/crates/control-plane/src/_tests/orchestration_runtime/support/repository.rs
#[derive(Default)]
struct InMemoryOrchestrationRuntimeState {
    routings_by_provider: HashMap<String, domain::ModelProviderRoutingRecord>,
}

pub(super) fn seed_primary_and_backup_provider_instances(&self) -> (Uuid, Uuid) {
    let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
    let now = OffsetDateTime::now_utc();
    let installation_id = inner
        .installations_by_id
        .values()
        .find(|record| record.provider_code == "fixture_provider")
        .expect("fixture provider installation should exist")
        .id;
    let primary_id = Uuid::now_v7();
    let backup_id = Uuid::now_v7();

    inner.instances_by_id.insert(
        primary_id,
        domain::ModelProviderInstanceRecord {
            id: primary_id,
            workspace_id: Uuid::nil(),
            installation_id,
            provider_code: "fixture_provider".to_string(),
            protocol: "openai_compatible".to_string(),
            display_name: "Fixture Primary".to_string(),
            status: domain::ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://primary.example.com/v1" }),
            configured_models: vec![domain::ModelProviderConfiguredModel {
                model_id: "gpt-5.4-mini".to_string(),
                enabled: true,
            }],
            enabled_model_ids: vec!["gpt-5.4-mini".to_string()],
            created_by: Uuid::nil(),
            updated_by: Uuid::nil(),
            created_at: now,
            updated_at: now - time::Duration::minutes(5),
        },
    );
    inner.instances_by_id.insert(
        backup_id,
        domain::ModelProviderInstanceRecord {
            id: backup_id,
            workspace_id: Uuid::nil(),
            installation_id,
            provider_code: "fixture_provider".to_string(),
            protocol: "openai_compatible".to_string(),
            display_name: "Fixture Backup".to_string(),
            status: domain::ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://backup.example.com/v1" }),
            configured_models: vec![domain::ModelProviderConfiguredModel {
                model_id: "gpt-4.1-mini".to_string(),
                enabled: true,
            }],
            enabled_model_ids: vec!["gpt-4.1-mini".to_string()],
            created_by: Uuid::nil(),
            updated_by: Uuid::nil(),
            created_at: now,
            updated_at: now,
        },
    );
    inner.routings_by_provider.insert(
        "fixture_provider".to_string(),
        domain::ModelProviderRoutingRecord {
            workspace_id: Uuid::nil(),
            provider_code: "fixture_provider".to_string(),
            routing_mode: domain::ModelProviderRoutingMode::ManualPrimary,
            primary_instance_id: primary_id,
            created_by: Uuid::nil(),
            updated_by: Uuid::nil(),
            created_at: now,
            updated_at: now,
        },
    );

    (primary_id, backup_id)
}

#[async_trait]
impl ModelProviderRepository for InMemoryOrchestrationRuntimeRepository {
    async fn get_routing(
        &self,
        workspace_id: Uuid,
        provider_code: &str,
    ) -> Result<Option<domain::ModelProviderRoutingRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .routings_by_provider
            .get(provider_code)
            .filter(|record| record.workspace_id == workspace_id)
            .cloned())
    }

    async fn list_routings(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<domain::ModelProviderRoutingRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .routings_by_provider
            .values()
            .filter(|record| record.workspace_id == workspace_id)
            .cloned()
            .collect())
    }

    async fn upsert_routing(
        &self,
        input: &crate::ports::UpsertModelProviderRoutingInput,
    ) -> Result<domain::ModelProviderRoutingRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let record = domain::ModelProviderRoutingRecord {
            workspace_id: input.workspace_id,
            provider_code: input.provider_code.clone(),
            routing_mode: input.routing_mode,
            primary_instance_id: input.primary_instance_id,
            created_by: input.updated_by,
            updated_by: input.updated_by,
            created_at: OffsetDateTime::now_utc(),
            updated_at: OffsetDateTime::now_utc(),
        };
        inner
            .routings_by_provider
            .insert(record.provider_code.clone(), record.clone());
        Ok(record)
    }

    async fn delete_routing(&self, workspace_id: Uuid, provider_code: &str) -> Result<()> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        if inner
            .routings_by_provider
            .get(provider_code)
            .map(|record| record.workspace_id == workspace_id)
            .unwrap_or(false)
        {
            inner.routings_by_provider.remove(provider_code);
        }
        Ok(())
    }
}
```

```rust
// api/crates/control-plane/src/_tests/orchestration_runtime/support/fixtures.rs
pub struct SeededPreviewApplication {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub primary_provider_instance_id: Uuid,
}

pub async fn seed_application_with_flow(&self, name: &str) -> SeededPreviewApplication {
    let actor_user_id = Uuid::now_v7();
    let application = self
        .repository
        .seed_application_for_actor(actor_user_id, name)
        .await
        .expect("seed application should succeed");

    SeededPreviewApplication {
        actor_user_id,
        application_id: application.id,
        primary_provider_instance_id: self.repository.default_provider_instance_id(),
    }
}

pub async fn seed_application_with_multi_instance_provider_flow(
    &self,
    name: &str,
) -> SeededPreviewApplication {
    let (primary_provider_instance_id, _) =
        self.repository.seed_primary_and_backup_provider_instances();

    let seeded = self.seed_application_with_flow(name).await;
    SeededPreviewApplication {
        actor_user_id: seeded.actor_user_id,
        application_id: seeded.application_id,
        primary_provider_instance_id,
    }
}
```

- [x] **Step 4: Re-run targeted and broader orchestration runtime tests**

Run:

```bash
cargo test -p control-plane start_node_debug_preview_uses_primary_routed_provider_instance
cargo test -p control-plane orchestration_runtime
```

Expected:

- PASS for the new primary-routing assertion.
- PASS for existing debug preview / resume / callback / plugin runtime coverage.

- [x] **Step 5: Commit the runtime resolver change**

```bash
git add api/crates/control-plane/src/orchestration_runtime/compile_context.rs \
  api/crates/control-plane/src/_tests/orchestration_runtime/support/repository.rs \
  api/crates/control-plane/src/_tests/orchestration_runtime/support/fixtures.rs \
  api/crates/control-plane/src/_tests/orchestration_runtime/service.rs
git commit -m "feat: route orchestration runtime through primary provider instance"
```

## Task 4: Update Settings UI, Client Contract, And Frontend Tests

**Files:**
- Modify: `web/packages/api-client/src/console-model-providers.ts`
- Modify: `web/app/src/features/settings/api/model-providers.ts`
- Modify: `web/app/src/features/settings/pages/settings-page/model-providers/shared.ts`
- Modify: `web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-data.ts`
- Modify: `web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-mutations.ts`
- Modify: `web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/ModelProviderInstancesModal.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/model-provider-panel.css`
- Test: `web/app/src/features/settings/api/_tests/settings-api.test.ts`
- Test: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`

- [ ] **Step 1: Write failing frontend API and settings-page tests**

```ts
// web/app/src/features/settings/api/_tests/settings-api.test.ts
test('fetchSettingsModelProviderInstances keeps the primary flag and routing update uses the new endpoint', async () => {
  vi.mocked(listConsoleModelProviderInstances).mockResolvedValueOnce([
    {
      id: 'provider-1',
      installation_id: 'installation-1',
      provider_code: 'openai_compatible',
      protocol: 'openai_compatible',
      display_name: 'OpenAI Production',
      status: 'ready',
      config_json: { base_url: 'https://api.openai.com/v1' },
      configured_models: [],
      enabled_model_ids: ['gpt-4o-mini'],
      catalog_refresh_status: 'ready',
      catalog_last_error_message: null,
      catalog_refreshed_at: '2026-04-18T10:01:00Z',
      model_count: 2,
      is_primary: true,
    },
  ]);

  const instances = await fetchSettingsModelProviderInstances();
  expect(instances[0]?.is_primary).toBe(true);

  await updateSettingsModelProviderRouting(
    'openai_compatible',
    {
      routing_mode: 'manual_primary',
      primary_instance_id: 'provider-1',
    },
    'csrf-123'
  );

  expect(updateConsoleModelProviderRouting).toHaveBeenCalledWith(
    'openai_compatible',
    {
      routing_mode: 'manual_primary',
      primary_instance_id: 'provider-1',
    },
    'csrf-123'
  );
});
```

```tsx
// web/app/src/features/settings/_tests/model-providers-page.test.tsx
test('switches the primary instance from the provider instances modal', async () => {
  authenticateWithPermissions([
    'route_page.view.all',
    'state_model.view.all',
    'state_model.manage.all',
  ]);

  renderApp('/settings/model-providers');
  const modal = await openProviderInstancesModal();

  fireEvent.mouseDown(within(modal).getByRole('combobox', { name: '主实例' }));
  fireEvent.click(await screen.findByRole('option', { name: 'OpenAI Backup' }));

  await waitFor(() => {
    expect(modelProvidersApi.updateSettingsModelProviderRouting).toHaveBeenCalledWith(
      'openai_compatible',
      {
        routing_mode: 'manual_primary',
        primary_instance_id: 'provider-2',
      },
      'csrf-123'
    );
  });

  expect(within(modal).getByText('主实例')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the targeted frontend tests and verify they fail**

Run:

```bash
pnpm --dir web/app test -- --run src/features/settings/api/_tests/settings-api.test.ts src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- FAIL because `ConsoleModelProviderInstance` lacks `is_primary`.
- FAIL because the routing update wrapper/mutation does not exist.
- FAIL because the modal has no primary-instance selector.

- [ ] **Step 3: Implement DTOs, mutation wiring, modal selector, and provider summary**

```ts
// web/packages/api-client/src/console-model-providers.ts
export interface ConsoleModelProviderInstance {
  id: string;
  installation_id: string;
  provider_code: string;
  protocol: string;
  display_name: string;
  status: string;
  config_json: Record<string, unknown>;
  configured_models: ConsoleModelProviderConfiguredModel[];
  enabled_model_ids: string[];
  catalog_refresh_status: string | null;
  catalog_last_error_message: string | null;
  catalog_refreshed_at: string | null;
  model_count: number;
  is_primary: boolean;
}

export interface UpdateConsoleModelProviderRoutingInput {
  routing_mode: 'manual_primary';
  primary_instance_id: string;
}

export interface ConsoleModelProviderRouting {
  provider_code: string;
  routing_mode: string;
  primary_instance_id: string;
  primary_instance_display_name: string;
}

export function updateConsoleModelProviderRouting(
  providerCode: string,
  input: UpdateConsoleModelProviderRoutingInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleModelProviderRouting>({
    path: `/api/console/model-providers/providers/${providerCode}/routing`,
    method: 'PUT',
    body: input,
    csrfToken,
    baseUrl,
  });
}
```

```ts
// web/app/src/features/settings/api/model-providers.ts
export type UpdateSettingsModelProviderRoutingInput =
  UpdateConsoleModelProviderRoutingInput;
export type SettingsModelProviderRouting = ConsoleModelProviderRouting;

export function updateSettingsModelProviderRouting(
  providerCode: string,
  input: UpdateSettingsModelProviderRoutingInput,
  csrfToken: string
) {
  return updateConsoleModelProviderRouting(providerCode, input, csrfToken);
}
```

```ts
// web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-data.ts
const primaryInstanceSummary = useMemo(() => {
  return Object.fromEntries(
    Object.entries(instancesByProviderCode).map(([providerCode, providerInstances]) => [
      providerCode,
      providerInstances.find((instance) => instance.is_primary)?.display_name ?? '未设置',
    ]),
  );
}, [instancesByProviderCode]);

return {
  catalogQuery,
  familiesQuery,
  officialCatalogQuery,
  instancesQuery,
  modelsQuery,
  instances,
  families,
  officialCatalogEntries,
  officialSourceMeta,
  currentCatalogEntriesByProviderCode,
  familiesByProviderCode,
  instancesByProviderCode,
  instanceCounts,
  primaryInstanceSummary,
  editingInstance,
  drawerCatalogEntry,
  modalInstances,
  modalSelectedInstanceId,
  modalCatalogEntry,
  overviewRows,
};
```

```ts
// web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-mutations.ts
const updateRoutingMutation = useMutation({
  mutationFn: async (input: {
    providerCode: string;
    primaryInstanceId: string;
  }) => {
    if (!csrfToken) {
      throw new Error('missing csrf token');
    }

    return updateSettingsModelProviderRouting(
      input.providerCode,
      {
        routing_mode: 'manual_primary',
        primary_instance_id: input.primaryInstanceId,
      },
      csrfToken,
    );
  },
  onSuccess: invalidateModelProviderQueries,
});

return {
  createMutation,
  updateMutation,
  previewMutation,
  validateMutation,
  refreshMutation,
  revealSecretMutation,
  deleteMutation,
  familyDeleteMutation,
  officialInstallMutation,
  uploadMutation,
  versionMutation,
  updateRoutingMutation,
};
```

```ts
// web/app/src/features/settings/pages/settings-page/model-providers/shared.ts
export function pickPreferredInstanceId(
  instances: { id: string; status: string; is_primary?: boolean }[]
) {
  return (
    instances.find((instance) => instance.is_primary)?.id ??
    instances.find((instance) => instance.status === 'ready')?.id ??
    instances[0]?.id ??
    null
  );
}
```

```tsx
// web/app/src/features/settings/components/model-providers/ModelProviderInstancesModal.tsx
export function ModelProviderInstancesModal({
  open,
  catalogEntry,
  instances,
  modelCatalog,
  modelsLoading,
  refreshingCandidates,
  refreshing,
  deleting,
  canManage,
  versionSwitchNotice,
  onClose,
  onChangeInstance,
  onEdit,
  onFetchModels,
  onRefreshCandidates,
  onRefreshModels,
  onDelete,
  onUpdatePrimary,
}: {
  open: boolean;
  catalogEntry: SettingsModelProviderCatalogEntry | null;
  instances: SettingsModelProviderInstance[];
  modelCatalog: SettingsModelProviderModelCatalog | null;
  modelsLoading: boolean;
  refreshingCandidates: boolean;
  refreshing: boolean;
  deleting: boolean;
  canManage: boolean;
  versionSwitchNotice: {
    targetVersion: string | null;
    migratedInstanceCount: number | null;
  } | null;
  onClose: () => void;
  onChangeInstance: (instanceId: string) => void;
  onEdit: (instance: SettingsModelProviderInstance) => void;
  onFetchModels: (instance: SettingsModelProviderInstance) => void;
  onRefreshCandidates: (instance: SettingsModelProviderInstance) => void;
  onRefreshModels: (instance: SettingsModelProviderInstance) => void;
  onDelete: (instance: SettingsModelProviderInstance) => void;
  onUpdatePrimary: (instanceId: string) => void;
}) {
  return (
<div className="model-provider-panel__instances-modal-head">
  <div>
    <Typography.Text strong>查看供应商实例</Typography.Text>
    <Typography.Paragraph type="secondary">
      为该供应商选择一个主实例；`agent-flow` 和运行时都会按这个主实例解析。
    </Typography.Paragraph>
  </div>
  {canManage ? (
    <Select
      aria-label="主实例"
      value={instances.find((instance) => instance.is_primary)?.id}
      options={instances
        .filter((instance) => instance.status === 'ready')
        .map((instance) => ({
          value: instance.id,
          label: instance.display_name,
        }))}
      onChange={(instanceId) => onUpdatePrimary(instanceId)}
    />
  ) : null}
</div>
  );
}
```

```tsx
// web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx
export function ModelProviderCatalogPanel({
  entries,
  currentCatalogEntries,
  instanceCounts,
  primaryInstanceSummary,
  loading,
  canManage,
  deletingProviderCode,
  switchingProviderCode,
  upgradingProviderCode,
  onCreate,
  onViewInstances,
  onUpgradeLatest,
  onSwitchVersion,
  onDelete,
}: {
  entries: SettingsPluginFamilyEntry[];
  currentCatalogEntries: Record<string, SettingsModelProviderCatalogEntry | null>;
  instanceCounts: Record<string, number>;
  primaryInstanceSummary: Record<string, string>;
  loading?: boolean;
  canManage: boolean;
  deletingProviderCode?: string | null;
  switchingProviderCode?: string | null;
  upgradingProviderCode?: string | null;
  onCreate: (entry: SettingsPluginFamilyEntry) => void;
  onViewInstances: (entry: SettingsPluginFamilyEntry) => void;
  onUpgradeLatest: (entry: SettingsPluginFamilyEntry) => void;
  onSwitchVersion: (
    entry: SettingsPluginFamilyEntry,
    installationId: string,
  ) => void;
  onDelete: (entry: SettingsPluginFamilyEntry) => void;
}) {
  return (
    <Typography.Text type="secondary">
      主实例：{primaryInstanceSummary[entry.provider_code] ?? '未设置'}
    </Typography.Text>
  );
}
```

```tsx
// web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx
const {
  families,
  modalCatalogEntry,
  modalInstances,
  currentCatalogEntriesByProviderCode,
  instancesByProviderCode,
  instanceCounts,
  primaryInstanceSummary,
} = useModelProviderData({
  drawerState,
  instanceModalState,
  setInstanceModalState,
});

const {
  validateMutation,
  refreshMutation,
  deleteMutation,
  familyDeleteMutation,
  versionMutation,
  updateRoutingMutation,
} = useModelProviderMutations({
  csrfToken,
  queryClient,
  setDrawerState,
  setInstanceModalState,
  setOfficialInstallState,
  setUploadValidationMessage,
  setUploadResultSummary,
  setRecentVersionSwitchNotice,
});

<ModelProviderCatalogPanel
  entries={families}
  currentCatalogEntries={currentCatalogEntriesByProviderCode}
  instanceCounts={instanceCounts}
  primaryInstanceSummary={primaryInstanceSummary}
  loading={catalogQuery.isLoading || familiesQuery.isLoading}
  canManage={canManage}
  deletingProviderCode={
    familyDeleteMutation.isPending ? (familyDeleteMutation.variables ?? null) : null
  }
  switchingProviderCode={
    versionMutation.isPending && versionMutation.variables.mode === 'switch'
      ? versionMutation.variables.providerCode
      : null
  }
  upgradingProviderCode={
    versionMutation.isPending && versionMutation.variables.mode === 'upgrade'
      ? versionMutation.variables.providerCode
      : null
  }
  onCreate={(entry) => {
    setDrawerState({ mode: 'create', providerCode: entry.provider_code });
  }}
  onViewInstances={(entry) => {
    setInstanceModalState({
      providerCode: entry.provider_code,
      selectedInstanceId: pickPreferredInstanceId(
        instancesByProviderCode[entry.provider_code] ?? [],
      ),
    });
  }}
  onUpgradeLatest={(entry) => {
    versionMutation.mutate({ mode: 'upgrade', providerCode: entry.provider_code });
  }}
  onSwitchVersion={(entry, installationId) => {
    versionMutation.mutate({
      mode: 'switch',
      providerCode: entry.provider_code,
      installationId,
    });
  }}
  onDelete={(entry) => {
    void modal.confirm({ title: `删除 ${entry.display_name}` });
  }}
/>

<ModelProviderInstancesModal
  open={instanceModalState !== null}
  catalogEntry={modalCatalogEntry}
  instances={modalInstances}
  modelCatalog={modelsQuery.data ?? null}
  modelsLoading={modelsQuery.isFetching}
  refreshingCandidates={validateMutation.isPending}
  refreshing={refreshMutation.isPending}
  deleting={deleteMutation.isPending}
  canManage={canManage}
  versionSwitchNotice={null}
  onClose={() => setInstanceModalState(null)}
  onChangeInstance={(instanceId) => {
    setInstanceModalState((current) =>
      current ? { ...current, selectedInstanceId: instanceId } : current,
    );
  }}
  onEdit={(instance) => {
    setInstanceModalState(null);
    setDrawerState({ mode: 'edit', instanceId: instance.id });
  }}
  onFetchModels={(instance) => {
    void queryClient.fetchQuery({
      queryKey: settingsModelProviderModelsQueryKey(instance.id),
      queryFn: () => fetchSettingsModelProviderModels(instance.id),
    });
  }}
  onRefreshCandidates={(instance) => {
    validateMutation.mutate(instance.id);
  }}
  onRefreshModels={(instance) => {
    refreshMutation.mutate(instance.id);
  }}
  onDelete={(instance) => {
    deleteMutation.mutate(instance.id);
  }}
  onUpdatePrimary={(instanceId) => {
    if (!instanceModalState) {
      return;
    }

    updateRoutingMutation.mutate({
      providerCode: instanceModalState.providerCode,
      primaryInstanceId: instanceId,
    });
  }}
/>
```

- [ ] **Step 4: Re-run targeted frontend tests and then the shared settings / agent-flow contract consumers**

Run:

```bash
pnpm --dir web/app test -- --run src/features/settings/api/_tests/settings-api.test.ts src/features/settings/_tests/model-providers-page.test.tsx
pnpm --dir web/app test -- --run src/features/settings/api/_tests/settings-api.test.ts src/features/settings/_tests/model-providers-page.test.tsx src/features/agent-flow/_tests/llm-model-provider-field.test.tsx
```

Expected:

- PASS for primary routing UI and API wrappers.
- PASS for existing `agent-flow` model-provider field tests without changing node contracts.

- [ ] **Step 5: Commit the frontend routing UI**

```bash
git add web/packages/api-client/src/console-model-providers.ts \
  web/app/src/features/settings/api/model-providers.ts \
  web/app/src/features/settings/pages/settings-page/model-providers/shared.ts \
  web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-data.ts \
  web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-mutations.ts \
  web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx \
  web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx \
  web/app/src/features/settings/components/model-providers/ModelProviderInstancesModal.tsx \
  web/app/src/features/settings/components/model-providers/model-provider-panel.css \
  web/app/src/features/settings/api/_tests/settings-api.test.ts \
  web/app/src/features/settings/_tests/model-providers-page.test.tsx
git commit -m "feat: add primary instance controls to model provider settings"
```

## Final Verification

- [ ] Run the focused backend suites:

```bash
cargo test -p storage-pg model_provider_repository_tests
cargo test -p control-plane model_provider_service_tests orchestration_runtime
cargo test -p api-server model_provider_routes
```

Expected:

- All routing, service, runtime, and route tests pass.

- [ ] Run the focused frontend suites:

```bash
pnpm --dir web/app test -- --run src/features/settings/api/_tests/settings-api.test.ts src/features/settings/_tests/model-providers-page.test.tsx src/features/agent-flow/_tests/llm-model-provider-field.test.tsx
```

Expected:

- PASS for settings API wrappers, provider settings page interactions, and unchanged `agent-flow` node contract behavior.

- [ ] Update this plan’s checkbox state as tasks complete, then create a final integration commit:
- [ ] Update this plan’s checkbox state as tasks complete, then confirm the worktree is clean except for intentional plan-checkbox edits:

```bash
git status --short
```
