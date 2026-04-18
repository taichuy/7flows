use std::{collections::HashMap, sync::Arc};

use anyhow::Result;
use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    model_provider::{
        CreateModelProviderInstanceCommand, DeleteModelProviderInstanceCommand,
        ModelProviderService,
    },
    ports::{
        AuthRepository, CreateModelProviderInstanceInput, CreatePluginAssignmentInput,
        CreatePluginTaskInput, ModelProviderRepository, PluginRepository,
        ProviderRuntimeInvocationOutput, ProviderRuntimePort, UpdateModelProviderInstanceInput,
        UpdatePluginInstallationEnabledInput, UpdatePluginTaskStatusInput, UpdateProfileInput,
        UpsertModelProviderCatalogCacheInput, UpsertModelProviderSecretInput,
        UpsertPluginInstallationInput,
    },
};
use domain::{
    ActorContext, AuditLogRecord, AuthenticatorRecord, ModelProviderCatalogCacheRecord,
    ModelProviderCatalogRefreshStatus, ModelProviderInstanceRecord, ModelProviderInstanceStatus,
    ModelProviderSecretRecord, ModelProviderValidationStatus, PermissionDefinition,
    PluginAssignmentRecord, PluginInstallationRecord, PluginTaskRecord, PluginVerificationStatus,
    ScopeContext, UserRecord,
};
use plugin_framework::provider_contract::{
    ProviderInvocationInput, ProviderInvocationResult, ProviderModelDescriptor, ProviderModelSource,
};
use time::OffsetDateTime;

use super::plugin_management_service_tests::{actor_with_permissions, create_provider_fixture};

#[derive(Clone)]
struct MemoryModelProviderRepository {
    actor: ActorContext,
    installations: Arc<RwLock<HashMap<Uuid, PluginInstallationRecord>>>,
    assignments: Arc<RwLock<Vec<PluginAssignmentRecord>>>,
    tasks: Arc<RwLock<HashMap<Uuid, PluginTaskRecord>>>,
    instances: Arc<RwLock<HashMap<Uuid, ModelProviderInstanceRecord>>>,
    caches: Arc<RwLock<HashMap<Uuid, ModelProviderCatalogCacheRecord>>>,
    secrets: Arc<RwLock<HashMap<Uuid, (ModelProviderSecretRecord, Value)>>>,
    references: Arc<RwLock<HashMap<Uuid, u64>>>,
    audit_events: Arc<RwLock<Vec<String>>>,
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
            secrets: Arc::new(RwLock::new(HashMap::new())),
            references: Arc::new(RwLock::new(HashMap::new())),
            audit_events: Arc::new(RwLock::new(Vec::new())),
        }
    }

    async fn seed_installation(&self, install_path: &str, enabled: bool, assigned: bool) -> Uuid {
        let installation_id = Uuid::now_v7();
        let installation = PluginInstallationRecord {
            id: installation_id,
            provider_code: "fixture_provider".to_string(),
            plugin_id: "fixture_provider@0.1.0".to_string(),
            plugin_version: "0.1.0".to_string(),
            contract_version: "1flowbase.provider/v1".to_string(),
            protocol: "openai_compatible".to_string(),
            display_name: "Fixture Provider".to_string(),
            source_kind: "downloaded_or_uploaded".to_string(),
            verification_status: PluginVerificationStatus::Valid,
            enabled,
            install_path: install_path.to_string(),
            checksum: None,
            signature_status: None,
            metadata_json: json!({}),
            created_by: self.actor.user_id,
            created_at: OffsetDateTime::now_utc(),
            updated_at: OffsetDateTime::now_utc(),
        };
        self.installations
            .write()
            .await
            .insert(installation_id, installation);
        if assigned {
            self.assignments.write().await.push(PluginAssignmentRecord {
                id: Uuid::now_v7(),
                installation_id,
                workspace_id: self.actor.current_workspace_id,
                assigned_by: self.actor.user_id,
                created_at: OffsetDateTime::now_utc(),
            });
        }
        installation_id
    }

    async fn secret_json(&self, instance_id: Uuid) -> Value {
        self.secrets
            .read()
            .await
            .get(&instance_id)
            .map(|(_, value)| value.clone())
            .unwrap_or_else(|| json!({}))
    }

    async fn set_reference_count(&self, instance_id: Uuid, count: u64) {
        self.references.write().await.insert(instance_id, count);
    }

    async fn audit_events(&self) -> Vec<String> {
        self.audit_events.read().await.clone()
    }
}

#[async_trait]
impl AuthRepository for MemoryModelProviderRepository {
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

    async fn append_audit_log(&self, event: &AuditLogRecord) -> Result<()> {
        self.audit_events
            .write()
            .await
            .push(event.event_code.clone());
        Ok(())
    }
}

#[async_trait]
impl PluginRepository for MemoryModelProviderRepository {
    async fn upsert_installation(
        &self,
        input: &UpsertPluginInstallationInput,
    ) -> Result<PluginInstallationRecord> {
        let record = PluginInstallationRecord {
            id: input.installation_id,
            provider_code: input.provider_code.clone(),
            plugin_id: input.plugin_id.clone(),
            plugin_version: input.plugin_version.clone(),
            contract_version: input.contract_version.clone(),
            protocol: input.protocol.clone(),
            display_name: input.display_name.clone(),
            source_kind: input.source_kind.clone(),
            verification_status: input.verification_status,
            enabled: input.enabled,
            install_path: input.install_path.clone(),
            checksum: input.checksum.clone(),
            signature_status: input.signature_status.clone(),
            metadata_json: input.metadata_json.clone(),
            created_by: input.actor_user_id,
            created_at: OffsetDateTime::now_utc(),
            updated_at: OffsetDateTime::now_utc(),
        };
        self.installations
            .write()
            .await
            .insert(record.id, record.clone());
        Ok(record)
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

    async fn update_installation_enabled(
        &self,
        input: &UpdatePluginInstallationEnabledInput,
    ) -> Result<PluginInstallationRecord> {
        let mut installations = self.installations.write().await;
        let installation = installations
            .get_mut(&input.installation_id)
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        installation.enabled = input.enabled;
        Ok(installation.clone())
    }

    async fn create_assignment(
        &self,
        input: &CreatePluginAssignmentInput,
    ) -> Result<PluginAssignmentRecord> {
        let record = PluginAssignmentRecord {
            id: Uuid::now_v7(),
            installation_id: input.installation_id,
            workspace_id: input.workspace_id,
            assigned_by: input.actor_user_id,
            created_at: OffsetDateTime::now_utc(),
        };
        self.assignments.write().await.push(record.clone());
        Ok(record)
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

    async fn create_task(&self, input: &CreatePluginTaskInput) -> Result<PluginTaskRecord> {
        let record = PluginTaskRecord {
            id: input.task_id,
            installation_id: input.installation_id,
            workspace_id: input.workspace_id,
            provider_code: input.provider_code.clone(),
            task_kind: input.task_kind,
            status: input.status,
            status_message: input.status_message.clone(),
            detail_json: input.detail_json.clone(),
            created_by: input.actor_user_id,
            created_at: OffsetDateTime::now_utc(),
            updated_at: OffsetDateTime::now_utc(),
            finished_at: None,
        };
        self.tasks.write().await.insert(record.id, record.clone());
        Ok(record)
    }

    async fn update_task_status(
        &self,
        input: &UpdatePluginTaskStatusInput,
    ) -> Result<PluginTaskRecord> {
        let mut tasks = self.tasks.write().await;
        let task = tasks
            .get_mut(&input.task_id)
            .ok_or(ControlPlaneError::NotFound("plugin_task"))?;
        task.status = input.status;
        task.status_message = input.status_message.clone();
        task.detail_json = input.detail_json.clone();
        task.updated_at = OffsetDateTime::now_utc();
        task.finished_at = input.status.is_terminal().then_some(task.updated_at);
        Ok(task.clone())
    }

    async fn get_task(&self, task_id: Uuid) -> Result<Option<PluginTaskRecord>> {
        Ok(self.tasks.read().await.get(&task_id).cloned())
    }

    async fn list_tasks(&self) -> Result<Vec<PluginTaskRecord>> {
        Ok(self.tasks.read().await.values().cloned().collect())
    }
}

#[async_trait]
impl ModelProviderRepository for MemoryModelProviderRepository {
    async fn create_instance(
        &self,
        input: &CreateModelProviderInstanceInput,
    ) -> Result<ModelProviderInstanceRecord> {
        let now = OffsetDateTime::now_utc();
        let record = ModelProviderInstanceRecord {
            id: input.instance_id,
            workspace_id: input.workspace_id,
            installation_id: input.installation_id,
            provider_code: input.provider_code.clone(),
            protocol: input.protocol.clone(),
            display_name: input.display_name.clone(),
            status: input.status,
            config_json: input.config_json.clone(),
            last_validated_at: None,
            last_validation_status: input.last_validation_status,
            last_validation_message: input.last_validation_message.clone(),
            created_by: input.created_by,
            updated_by: input.created_by,
            created_at: now,
            updated_at: now,
        };
        self.instances
            .write()
            .await
            .insert(record.id, record.clone());
        Ok(record)
    }

    async fn update_instance(
        &self,
        input: &UpdateModelProviderInstanceInput,
    ) -> Result<ModelProviderInstanceRecord> {
        let mut instances = self.instances.write().await;
        let instance = instances
            .get_mut(&input.instance_id)
            .ok_or(ControlPlaneError::NotFound("model_provider_instance"))?;
        instance.display_name = input.display_name.clone();
        instance.status = input.status;
        instance.config_json = input.config_json.clone();
        instance.last_validated_at = input.last_validated_at;
        instance.last_validation_status = input.last_validation_status;
        instance.last_validation_message = input.last_validation_message.clone();
        instance.updated_by = input.updated_by;
        instance.updated_at = OffsetDateTime::now_utc();
        Ok(instance.clone())
    }

    async fn get_instance(
        &self,
        workspace_id: Uuid,
        instance_id: Uuid,
    ) -> Result<Option<ModelProviderInstanceRecord>> {
        Ok(self
            .instances
            .read()
            .await
            .get(&instance_id)
            .filter(|instance| instance.workspace_id == workspace_id)
            .cloned())
    }

    async fn list_instances(&self, workspace_id: Uuid) -> Result<Vec<ModelProviderInstanceRecord>> {
        Ok(self
            .instances
            .read()
            .await
            .values()
            .filter(|instance| instance.workspace_id == workspace_id)
            .cloned()
            .collect())
    }

    async fn upsert_catalog_cache(
        &self,
        input: &UpsertModelProviderCatalogCacheInput,
    ) -> Result<ModelProviderCatalogCacheRecord> {
        let record = ModelProviderCatalogCacheRecord {
            provider_instance_id: input.provider_instance_id,
            model_discovery_mode: input.model_discovery_mode,
            refresh_status: input.refresh_status,
            source: input.source,
            models_json: input.models_json.clone(),
            last_error_message: input.last_error_message.clone(),
            refreshed_at: input.refreshed_at,
            updated_at: OffsetDateTime::now_utc(),
        };
        self.caches
            .write()
            .await
            .insert(record.provider_instance_id, record.clone());
        Ok(record)
    }

    async fn get_catalog_cache(
        &self,
        provider_instance_id: Uuid,
    ) -> Result<Option<ModelProviderCatalogCacheRecord>> {
        Ok(self.caches.read().await.get(&provider_instance_id).cloned())
    }

    async fn upsert_secret(
        &self,
        input: &UpsertModelProviderSecretInput,
    ) -> Result<ModelProviderSecretRecord> {
        let record = ModelProviderSecretRecord {
            provider_instance_id: input.provider_instance_id,
            encrypted_secret_json: json!({ "masked": true }),
            secret_version: input.secret_version,
            updated_at: OffsetDateTime::now_utc(),
        };
        self.secrets.write().await.insert(
            input.provider_instance_id,
            (record.clone(), input.plaintext_secret_json.clone()),
        );
        Ok(record)
    }

    async fn get_secret_json(
        &self,
        provider_instance_id: Uuid,
        _master_key: &str,
    ) -> Result<Option<Value>> {
        Ok(self
            .secrets
            .read()
            .await
            .get(&provider_instance_id)
            .map(|(_, value)| value.clone()))
    }

    async fn get_secret_record(
        &self,
        provider_instance_id: Uuid,
    ) -> Result<Option<ModelProviderSecretRecord>> {
        Ok(self
            .secrets
            .read()
            .await
            .get(&provider_instance_id)
            .map(|(record, _)| record.clone()))
    }

    async fn delete_instance(&self, workspace_id: Uuid, instance_id: Uuid) -> Result<()> {
        let mut instances = self.instances.write().await;
        let instance = instances
            .get(&instance_id)
            .ok_or(ControlPlaneError::NotFound("model_provider_instance"))?;
        if instance.workspace_id != workspace_id {
            return Err(ControlPlaneError::NotFound("model_provider_instance").into());
        }
        instances.remove(&instance_id);
        self.caches.write().await.remove(&instance_id);
        self.secrets.write().await.remove(&instance_id);
        Ok(())
    }

    async fn count_instance_references(
        &self,
        _workspace_id: Uuid,
        instance_id: Uuid,
    ) -> Result<u64> {
        Ok(*self.references.read().await.get(&instance_id).unwrap_or(&0))
    }
}

#[derive(Clone, Default)]
struct MemoryProviderRuntime {
    validate_calls: Arc<RwLock<Vec<Uuid>>>,
    list_model_calls: Arc<RwLock<Vec<Uuid>>>,
}

#[async_trait]
impl ProviderRuntimePort for MemoryProviderRuntime {
    async fn ensure_loaded(&self, _installation: &PluginInstallationRecord) -> Result<()> {
        Ok(())
    }

    async fn validate_provider(
        &self,
        installation: &PluginInstallationRecord,
        provider_config: Value,
    ) -> Result<Value> {
        self.validate_calls.write().await.push(installation.id);
        Ok(json!({
            "sanitized": {
                "base_url": provider_config["base_url"],
                "api_key": "***"
            }
        }))
    }

    async fn list_models(
        &self,
        installation: &PluginInstallationRecord,
        _provider_config: Value,
    ) -> Result<Vec<ProviderModelDescriptor>> {
        self.list_model_calls.write().await.push(installation.id);
        Ok(vec![ProviderModelDescriptor {
            model_id: "fixture_chat".to_string(),
            display_name: "Fixture Chat".to_string(),
            source: ProviderModelSource::Dynamic,
            supports_streaming: true,
            supports_tool_call: false,
            supports_multimodal: false,
            context_window: Some(128000),
            max_output_tokens: Some(4096),
            provider_metadata: json!({}),
        }])
    }

    async fn invoke_stream(
        &self,
        _installation: &PluginInstallationRecord,
        _input: ProviderInvocationInput,
    ) -> Result<ProviderRuntimeInvocationOutput> {
        Ok(ProviderRuntimeInvocationOutput {
            events: Vec::new(),
            result: ProviderInvocationResult::default(),
        })
    }
}

#[tokio::test]
async fn model_provider_service_creates_validates_and_builds_ready_options_without_leaking_secret()
{
    let workspace_id = Uuid::now_v7();
    let repository = MemoryModelProviderRepository::new(actor_with_permissions(
        workspace_id,
        &["state_model.view.all", "state_model.manage.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let package_root = std::env::temp_dir().join(format!("provider-model-{}", Uuid::now_v7()));
    create_provider_fixture(&package_root);
    let installation_id = repository
        .seed_installation(&package_root.display().to_string(), true, true)
        .await;

    let service =
        ModelProviderService::new(repository.clone(), runtime, "provider-secret-master-key");

    let created = service
        .create_instance(CreateModelProviderInstanceCommand {
            actor_user_id: repository.actor.user_id,
            installation_id,
            display_name: "Fixture Prod".to_string(),
            config_json: json!({
                "base_url": "https://api.example.com",
                "api_key": "super-secret"
            }),
        })
        .await
        .unwrap();
    assert_eq!(created.instance.status, ModelProviderInstanceStatus::Draft);
    assert_eq!(
        created.instance.config_json["base_url"],
        "https://api.example.com"
    );
    assert!(created.instance.config_json.get("api_key").is_none());
    assert_eq!(
        repository.secret_json(created.instance.id).await["api_key"],
        "super-secret"
    );

    let listed = service
        .list_instances(repository.actor.user_id)
        .await
        .unwrap();
    assert_eq!(listed.len(), 1);
    assert!(listed[0].instance.config_json.get("api_key").is_none());

    let validated = service
        .validate_instance(repository.actor.user_id, created.instance.id)
        .await
        .unwrap();
    assert_eq!(
        validated.instance.status,
        ModelProviderInstanceStatus::Ready
    );
    assert_eq!(
        validated.instance.last_validation_status,
        Some(ModelProviderValidationStatus::Succeeded)
    );
    assert_eq!(
        validated.cache.refresh_status,
        ModelProviderCatalogRefreshStatus::Ready
    );
    assert_eq!(validated.output["sanitized"]["api_key"], "***");

    let options = service.options(repository.actor.user_id).await.unwrap();
    assert_eq!(options.len(), 1);
    assert_eq!(options[0].models.len(), 1);
    assert_eq!(options[0].models[0].model_id, "fixture_chat");

    let refreshed = service
        .refresh_models(repository.actor.user_id, created.instance.id)
        .await
        .unwrap();
    assert_eq!(refreshed.models.len(), 1);
    assert_eq!(
        repository.audit_events().await,
        vec![
            "model_provider.created",
            "model_provider.validated",
            "model_provider.models_refreshed"
        ]
    );
}

#[tokio::test]
async fn model_provider_service_enforces_permissions_and_audits_delete_conflict() {
    let workspace_id = Uuid::now_v7();
    let manager_repository = MemoryModelProviderRepository::new(actor_with_permissions(
        workspace_id,
        &["state_model.view.all", "state_model.manage.all"],
    ));
    let package_root = std::env::temp_dir().join(format!("provider-model-{}", Uuid::now_v7()));
    create_provider_fixture(&package_root);
    let installation_id = manager_repository
        .seed_installation(&package_root.display().to_string(), true, true)
        .await;
    let manager_service = ModelProviderService::new(
        manager_repository.clone(),
        MemoryProviderRuntime::default(),
        "provider-secret-master-key",
    );
    let created = manager_service
        .create_instance(CreateModelProviderInstanceCommand {
            actor_user_id: manager_repository.actor.user_id,
            installation_id,
            display_name: "Fixture Prod".to_string(),
            config_json: json!({
                "base_url": "https://api.example.com",
                "api_key": "super-secret"
            }),
        })
        .await
        .unwrap();
    manager_repository
        .set_reference_count(created.instance.id, 2)
        .await;

    let error = manager_service
        .delete_instance(DeleteModelProviderInstanceCommand {
            actor_user_id: manager_repository.actor.user_id,
            instance_id: created.instance.id,
        })
        .await
        .unwrap_err();
    assert!(matches!(
        error.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::Conflict("model_provider_in_use"))
    ));
    assert_eq!(
        manager_repository.audit_events().await,
        vec!["model_provider.created", "model_provider.delete_conflict"]
    );

    let viewer_repository = MemoryModelProviderRepository::new(actor_with_permissions(
        workspace_id,
        &["state_model.view.all"],
    ));
    let viewer_service = ModelProviderService::new(
        viewer_repository.clone(),
        MemoryProviderRuntime::default(),
        "provider-secret-master-key",
    );
    let catalog = viewer_service
        .list_catalog(viewer_repository.actor.user_id)
        .await
        .unwrap();
    assert!(catalog.is_empty());

    let error = viewer_service
        .create_instance(CreateModelProviderInstanceCommand {
            actor_user_id: viewer_repository.actor.user_id,
            installation_id: Uuid::now_v7(),
            display_name: "Nope".to_string(),
            config_json: json!({}),
        })
        .await
        .unwrap_err();
    assert!(matches!(
        error.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::PermissionDenied("permission_denied"))
    ));
}
