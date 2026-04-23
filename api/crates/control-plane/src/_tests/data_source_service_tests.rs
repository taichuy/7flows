use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use async_trait::async_trait;
use plugin_framework::data_source_contract::{
    DataSourceCatalogEntry, DataSourceConfigInput, DataSourcePreviewReadInput,
    DataSourcePreviewReadOutput,
};
use serde_json::{json, Value};
use time::OffsetDateTime;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{
    data_source::{
        CreateDataSourceInstanceCommand, DataSourceService, PreviewDataSourceReadCommand,
        ValidateDataSourceInstanceCommand,
    },
    ports::{
        AuthRepository, CreateDataSourceInstanceInput, CreateDataSourcePreviewSessionInput,
        CreatePluginAssignmentInput, CreatePluginTaskInput, DataSourceRepository,
        DataSourceRuntimePort, UpdateDataSourceInstanceStatusInput,
        UpdatePluginArtifactSnapshotInput, UpdatePluginDesiredStateInput,
        UpdatePluginRuntimeSnapshotInput, UpdatePluginTaskStatusInput, UpdateProfileInput,
        UpsertDataSourceCatalogCacheInput, UpsertDataSourceSecretInput,
        UpsertPluginInstallationInput,
    },
};
use domain::{
    ActorContext, AuditLogRecord, AuthenticatorRecord, DataSourceCatalogCacheRecord,
    DataSourceCatalogRefreshStatus, DataSourceInstanceRecord, DataSourceInstanceStatus,
    DataSourcePreviewSessionRecord, DataSourceSecretRecord, PermissionDefinition,
    PluginArtifactStatus, PluginAssignmentRecord, PluginAvailabilityStatus, PluginDesiredState,
    PluginInstallationRecord, PluginRuntimeStatus, PluginTaskRecord, PluginVerificationStatus,
    ScopeContext, UserRecord,
};

fn tenant_id() -> Uuid {
    Uuid::from_u128(0x100)
}

fn workspace_id() -> Uuid {
    Uuid::from_u128(0x200)
}

fn user_id() -> Uuid {
    Uuid::from_u128(0x300)
}

fn installation_id() -> Uuid {
    Uuid::from_u128(0x400)
}

fn actor() -> ActorContext {
    ActorContext::root_in_scope(user_id(), tenant_id(), workspace_id(), "root")
}

fn seeded_installation() -> PluginInstallationRecord {
    PluginInstallationRecord {
        id: installation_id(),
        provider_code: "acme_hubspot_source".to_string(),
        plugin_id: "acme_hubspot_source@0.1.0".to_string(),
        plugin_version: "0.1.0".to_string(),
        contract_version: "1flowbase.data_source/v1".to_string(),
        protocol: "stdio_json".to_string(),
        display_name: "Acme HubSpot Source".to_string(),
        source_kind: "uploaded".to_string(),
        trust_level: "unverified".to_string(),
        verification_status: PluginVerificationStatus::Valid,
        desired_state: PluginDesiredState::ActiveRequested,
        artifact_status: PluginArtifactStatus::Ready,
        runtime_status: PluginRuntimeStatus::Active,
        availability_status: PluginAvailabilityStatus::Available,
        package_path: None,
        installed_path: "/tmp/fixture-data-source".to_string(),
        checksum: None,
        manifest_fingerprint: None,
        signature_status: None,
        signature_algorithm: None,
        signing_key_id: None,
        last_load_error: None,
        metadata_json: json!({}),
        created_by: user_id(),
        created_at: OffsetDateTime::now_utc(),
        updated_at: OffsetDateTime::now_utc(),
    }
}

#[derive(Clone)]
struct InMemoryDataSourceRepository {
    actor: ActorContext,
    installations: Arc<RwLock<HashMap<Uuid, PluginInstallationRecord>>>,
    assignments: Arc<RwLock<Vec<PluginAssignmentRecord>>>,
    instances: Arc<RwLock<HashMap<Uuid, DataSourceInstanceRecord>>>,
    secrets: Arc<RwLock<HashMap<Uuid, Value>>>,
    caches: Arc<RwLock<HashMap<Uuid, DataSourceCatalogCacheRecord>>>,
    preview_sessions: Arc<RwLock<HashMap<Uuid, DataSourcePreviewSessionRecord>>>,
}

impl Default for InMemoryDataSourceRepository {
    fn default() -> Self {
        let actor = actor();
        let installation = seeded_installation();
        let assignment = PluginAssignmentRecord {
            id: Uuid::now_v7(),
            installation_id: installation.id,
            workspace_id: actor.current_workspace_id,
            provider_code: installation.provider_code.clone(),
            assigned_by: actor.user_id,
            created_at: OffsetDateTime::now_utc(),
        };
        Self {
            actor,
            installations: Arc::new(RwLock::new(HashMap::from([(
                installation.id,
                installation,
            )]))),
            assignments: Arc::new(RwLock::new(vec![assignment])),
            instances: Arc::new(RwLock::new(HashMap::new())),
            secrets: Arc::new(RwLock::new(HashMap::new())),
            caches: Arc::new(RwLock::new(HashMap::new())),
            preview_sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

impl InMemoryDataSourceRepository {
    async fn preview_session_count(&self) -> usize {
        self.preview_sessions.read().await.len()
    }

    async fn stored_secret_json(&self, instance_id: Uuid) -> Value {
        self.secrets
            .read()
            .await
            .get(&instance_id)
            .cloned()
            .unwrap_or_else(|| json!({}))
    }
}

#[async_trait]
impl AuthRepository for InMemoryDataSourceRepository {
    async fn find_authenticator(&self, _name: &str) -> Result<Option<AuthenticatorRecord>> {
        Ok(None)
    }

    async fn find_user_for_password_login(&self, _identifier: &str) -> Result<Option<UserRecord>> {
        Ok(None)
    }

    async fn find_user_by_id(&self, _user_id: Uuid) -> Result<Option<UserRecord>> {
        Ok(None)
    }

    async fn default_scope_for_user(&self, _user_id: Uuid) -> Result<ScopeContext> {
        Ok(ScopeContext {
            tenant_id: self.actor.tenant_id,
            workspace_id: self.actor.current_workspace_id,
        })
    }

    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> Result<ActorContext> {
        self.load_actor_context(
            actor_user_id,
            self.actor.tenant_id,
            self.actor.current_workspace_id,
            None,
        )
        .await
    }

    async fn load_actor_context(
        &self,
        user_id: Uuid,
        tenant_id: Uuid,
        workspace_id: Uuid,
        _display_role: Option<&str>,
    ) -> Result<ActorContext> {
        let mut actor = self.actor.clone();
        actor.user_id = user_id;
        actor.tenant_id = tenant_id;
        actor.current_workspace_id = workspace_id;
        Ok(actor)
    }

    async fn update_password_hash(
        &self,
        _user_id: Uuid,
        _password_hash: &str,
        _actor_id: Uuid,
    ) -> Result<i64> {
        Ok(1)
    }

    async fn update_profile(&self, _input: &UpdateProfileInput) -> Result<UserRecord> {
        anyhow::bail!("not implemented")
    }

    async fn bump_session_version(&self, _user_id: Uuid, _actor_id: Uuid) -> Result<i64> {
        Ok(1)
    }

    async fn list_permissions(&self) -> Result<Vec<PermissionDefinition>> {
        Ok(Vec::new())
    }

    async fn append_audit_log(&self, _event: &AuditLogRecord) -> Result<()> {
        Ok(())
    }
}

#[async_trait]
impl crate::ports::PluginRepository for InMemoryDataSourceRepository {
    async fn upsert_installation(
        &self,
        _input: &UpsertPluginInstallationInput,
    ) -> Result<PluginInstallationRecord> {
        anyhow::bail!("not implemented")
    }

    async fn get_installation(
        &self,
        installation_id: Uuid,
    ) -> Result<Option<PluginInstallationRecord>> {
        Ok(self
            .installations
            .read()
            .await
            .get(&installation_id)
            .cloned())
    }

    async fn list_installations(&self) -> Result<Vec<PluginInstallationRecord>> {
        Ok(self.installations.read().await.values().cloned().collect())
    }

    async fn delete_installation(&self, _installation_id: Uuid) -> Result<()> {
        anyhow::bail!("not implemented")
    }

    async fn list_pending_restart_host_extensions(&self) -> Result<Vec<PluginInstallationRecord>> {
        Ok(Vec::new())
    }

    async fn update_desired_state(
        &self,
        _input: &UpdatePluginDesiredStateInput,
    ) -> Result<PluginInstallationRecord> {
        anyhow::bail!("not implemented")
    }

    async fn update_artifact_snapshot(
        &self,
        _input: &UpdatePluginArtifactSnapshotInput,
    ) -> Result<PluginInstallationRecord> {
        anyhow::bail!("not implemented")
    }

    async fn update_runtime_snapshot(
        &self,
        _input: &UpdatePluginRuntimeSnapshotInput,
    ) -> Result<PluginInstallationRecord> {
        anyhow::bail!("not implemented")
    }

    async fn create_assignment(
        &self,
        _input: &CreatePluginAssignmentInput,
    ) -> Result<PluginAssignmentRecord> {
        anyhow::bail!("not implemented")
    }

    async fn list_assignments(&self, workspace_id: Uuid) -> Result<Vec<PluginAssignmentRecord>> {
        Ok(self
            .assignments
            .read()
            .await
            .iter()
            .filter(|assignment| assignment.workspace_id == workspace_id)
            .cloned()
            .collect())
    }

    async fn create_task(&self, _input: &CreatePluginTaskInput) -> Result<PluginTaskRecord> {
        anyhow::bail!("not implemented")
    }

    async fn update_task_status(
        &self,
        _input: &UpdatePluginTaskStatusInput,
    ) -> Result<PluginTaskRecord> {
        anyhow::bail!("not implemented")
    }

    async fn get_task(&self, _task_id: Uuid) -> Result<Option<PluginTaskRecord>> {
        Ok(None)
    }

    async fn list_tasks(&self) -> Result<Vec<PluginTaskRecord>> {
        Ok(Vec::new())
    }
}

#[async_trait]
impl DataSourceRepository for InMemoryDataSourceRepository {
    async fn create_instance(
        &self,
        input: &CreateDataSourceInstanceInput,
    ) -> Result<DataSourceInstanceRecord> {
        let record = DataSourceInstanceRecord {
            id: input.instance_id,
            workspace_id: input.workspace_id,
            installation_id: input.installation_id,
            source_code: input.source_code.clone(),
            display_name: input.display_name.clone(),
            status: input.status,
            config_json: input.config_json.clone(),
            metadata_json: input.metadata_json.clone(),
            created_by: input.created_by,
            created_at: OffsetDateTime::now_utc(),
            updated_at: OffsetDateTime::now_utc(),
        };
        self.instances
            .write()
            .await
            .insert(record.id, record.clone());
        Ok(record)
    }

    async fn update_instance_status(
        &self,
        input: &UpdateDataSourceInstanceStatusInput,
    ) -> Result<DataSourceInstanceRecord> {
        let mut instances = self.instances.write().await;
        let instance = instances
            .get_mut(&input.instance_id)
            .expect("instance should exist for test");
        instance.status = input.status;
        instance.metadata_json = input.metadata_json.clone();
        instance.updated_at = OffsetDateTime::now_utc();
        Ok(instance.clone())
    }

    async fn get_instance(
        &self,
        workspace_id: Uuid,
        instance_id: Uuid,
    ) -> Result<Option<DataSourceInstanceRecord>> {
        Ok(self
            .instances
            .read()
            .await
            .get(&instance_id)
            .filter(|instance| instance.workspace_id == workspace_id)
            .cloned())
    }

    async fn upsert_secret(
        &self,
        input: &UpsertDataSourceSecretInput,
    ) -> Result<DataSourceSecretRecord> {
        self.secrets
            .write()
            .await
            .insert(input.data_source_instance_id, input.secret_json.clone());
        Ok(DataSourceSecretRecord {
            data_source_instance_id: input.data_source_instance_id,
            encrypted_secret_json: input.secret_json.clone(),
            secret_version: input.secret_version,
            updated_at: OffsetDateTime::now_utc(),
        })
    }

    async fn get_secret_json(&self, instance_id: Uuid) -> Result<Option<Value>> {
        Ok(self.secrets.read().await.get(&instance_id).cloned())
    }

    async fn upsert_catalog_cache(
        &self,
        input: &UpsertDataSourceCatalogCacheInput,
    ) -> Result<DataSourceCatalogCacheRecord> {
        let record = DataSourceCatalogCacheRecord {
            data_source_instance_id: input.data_source_instance_id,
            refresh_status: input.refresh_status,
            catalog_json: input.catalog_json.clone(),
            last_error_message: input.last_error_message.clone(),
            refreshed_at: input.refreshed_at,
            updated_at: OffsetDateTime::now_utc(),
        };
        self.caches
            .write()
            .await
            .insert(record.data_source_instance_id, record.clone());
        Ok(record)
    }

    async fn create_preview_session(
        &self,
        input: &CreateDataSourcePreviewSessionInput,
    ) -> Result<DataSourcePreviewSessionRecord> {
        let record = DataSourcePreviewSessionRecord {
            id: input.session_id,
            workspace_id: input.workspace_id,
            actor_user_id: input.actor_user_id,
            data_source_instance_id: input.data_source_instance_id,
            config_fingerprint: input.config_fingerprint.clone(),
            preview_json: input.preview_json.clone(),
            expires_at: input.expires_at,
            created_at: OffsetDateTime::now_utc(),
        };
        self.preview_sessions
            .write()
            .await
            .insert(record.id, record.clone());
        Ok(record)
    }
}

#[derive(Clone)]
struct StubDataSourceRuntime {
    preview_inputs: Arc<RwLock<Vec<DataSourcePreviewReadInput>>>,
}

impl StubDataSourceRuntime {
    fn ready() -> Self {
        Self {
            preview_inputs: Arc::new(RwLock::new(Vec::new())),
        }
    }

    async fn last_preview_input(&self) -> Option<DataSourcePreviewReadInput> {
        self.preview_inputs.read().await.last().cloned()
    }
}

#[async_trait]
impl DataSourceRuntimePort for StubDataSourceRuntime {
    async fn ensure_loaded(&self, _installation: &PluginInstallationRecord) -> Result<()> {
        Ok(())
    }

    async fn validate_config(
        &self,
        _installation: &PluginInstallationRecord,
        _config_json: Value,
        _secret_json: Value,
    ) -> Result<Value> {
        Ok(json!({ "ok": true }))
    }

    async fn test_connection(
        &self,
        _installation: &PluginInstallationRecord,
        _config_json: Value,
        _secret_json: Value,
    ) -> Result<Value> {
        Ok(json!({ "status": "ok" }))
    }

    async fn discover_catalog(
        &self,
        _installation: &PluginInstallationRecord,
        _config_json: Value,
        _secret_json: Value,
    ) -> Result<Value> {
        Ok(serde_json::to_value(vec![DataSourceCatalogEntry {
            resource_key: "contacts".to_string(),
            display_name: "Contacts".to_string(),
            resource_kind: "object".to_string(),
            metadata: json!({}),
        }])?)
    }

    async fn preview_read(
        &self,
        _installation: &PluginInstallationRecord,
        input: DataSourcePreviewReadInput,
    ) -> Result<DataSourcePreviewReadOutput> {
        self.preview_inputs.write().await.push(input);
        Ok(DataSourcePreviewReadOutput {
            rows: vec![json!({ "id": "1", "email": "person@example.com" })],
            next_cursor: None,
        })
    }
}

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
            config_json: json!({ "client_id": "abc" }),
            secret_json: json!({ "client_secret": "secret" }),
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

    assert_eq!(validated.instance.status, DataSourceInstanceStatus::Ready);
    assert_eq!(
        validated.catalog.refresh_status,
        DataSourceCatalogRefreshStatus::Ready
    );
    assert_eq!(
        repository.stored_secret_json(created.instance.id).await,
        json!({ "client_secret": "secret" })
    );
}

#[tokio::test]
async fn preview_read_uses_stored_secret_and_creates_preview_session() {
    let repository = InMemoryDataSourceRepository::default();
    let runtime = StubDataSourceRuntime::ready();
    let service = DataSourceService::new(repository.clone(), runtime.clone());

    let created = service
        .create_instance(CreateDataSourceInstanceCommand {
            actor_user_id: user_id(),
            workspace_id: workspace_id(),
            installation_id: installation_id(),
            source_code: "acme_hubspot_source".into(),
            display_name: "HubSpot".into(),
            config_json: json!({ "client_id": "abc" }),
            secret_json: json!({ "client_secret": "secret" }),
        })
        .await
        .unwrap();

    let preview = service
        .preview_read(PreviewDataSourceReadCommand {
            actor_user_id: user_id(),
            workspace_id: workspace_id(),
            instance_id: created.instance.id,
            resource_key: "contacts".into(),
            limit: Some(20),
            cursor: None,
            options_json: json!({ "sample": true }),
        })
        .await
        .unwrap();

    assert_eq!(preview.output.rows.len(), 1);
    assert_eq!(repository.preview_session_count().await, 1);

    let runtime_input = runtime.last_preview_input().await.unwrap();
    assert_eq!(
        runtime_input.connection,
        DataSourceConfigInput {
            config_json: json!({ "client_id": "abc" }),
            secret_json: json!({ "client_secret": "secret" }),
        }
    );
    assert_eq!(runtime_input.resource_key, "contacts");
}
