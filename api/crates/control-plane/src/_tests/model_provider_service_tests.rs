use std::{collections::HashMap, fs, sync::Arc};

use anyhow::Result;
use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    i18n::RequestedLocales,
    model_provider::{
        CreateModelProviderInstanceCommand, DeleteModelProviderInstanceCommand,
        ModelProviderService,
    },
    ports::{
        AuthRepository, CreateModelProviderInstanceInput, CreatePluginAssignmentInput,
        CreatePluginTaskInput, ModelProviderRepository, PluginRepository,
        ProviderRuntimeInvocationOutput, ProviderRuntimePort, ReassignModelProviderInstancesInput,
        UpdateModelProviderInstanceInput, UpdatePluginArtifactSnapshotInput,
        UpdatePluginDesiredStateInput, UpdatePluginRuntimeSnapshotInput,
        UpdatePluginTaskStatusInput, UpdateProfileInput, UpsertModelProviderCatalogCacheInput,
        UpsertModelProviderSecretInput, UpsertPluginInstallationInput,
    },
};
use domain::{
    ActorContext, AuditLogRecord, AuthenticatorRecord, ModelProviderCatalogCacheRecord,
    ModelProviderCatalogRefreshStatus, ModelProviderInstanceRecord, ModelProviderInstanceStatus,
    ModelProviderSecretRecord, ModelProviderValidationStatus, PermissionDefinition,
    PluginArtifactStatus, PluginAssignmentRecord, PluginAvailabilityStatus, PluginDesiredState,
    PluginInstallationRecord, PluginRuntimeStatus, PluginTaskRecord, PluginVerificationStatus,
    ScopeContext, UserRecord,
};
use plugin_framework::provider_contract::{
    ProviderInvocationInput, ProviderInvocationResult, ProviderModelDescriptor, ProviderModelSource,
};
use time::OffsetDateTime;

use super::plugin_management::support::{actor_with_permissions, create_provider_fixture};

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

    async fn seed_installation(
        &self,
        install_path: &str,
        desired_state: PluginDesiredState,
        assigned: bool,
    ) -> Uuid {
        let installation_id = Uuid::now_v7();
        let installation = PluginInstallationRecord {
            id: installation_id,
            provider_code: "fixture_provider".to_string(),
            plugin_id: "fixture_provider@0.1.0".to_string(),
            plugin_version: "0.1.0".to_string(),
            contract_version: "1flowbase.provider/v1".to_string(),
            protocol: "openai_compatible".to_string(),
            display_name: "Fixture Provider".to_string(),
            source_kind: "uploaded".to_string(),
            trust_level: "unverified".to_string(),
            verification_status: PluginVerificationStatus::Valid,
            desired_state,
            artifact_status: PluginArtifactStatus::Ready,
            runtime_status: if matches!(desired_state, PluginDesiredState::Disabled) {
                PluginRuntimeStatus::Inactive
            } else {
                PluginRuntimeStatus::Active
            },
            availability_status: if matches!(desired_state, PluginDesiredState::Disabled) {
                PluginAvailabilityStatus::Disabled
            } else {
                PluginAvailabilityStatus::Available
            },
            package_path: None,
            installed_path: install_path.to_string(),
            checksum: None,
            manifest_fingerprint: None,
            signature_status: None,
            signature_algorithm: None,
            signing_key_id: None,
            last_load_error: None,
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
                provider_code: "fixture_provider".to_string(),
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

    async fn set_instance_status(&self, instance_id: Uuid, status: ModelProviderInstanceStatus) {
        let mut instances = self.instances.write().await;
        let instance = instances
            .get_mut(&instance_id)
            .expect("instance should exist for test");
        instance.status = status;
    }

    async fn audit_events(&self) -> Vec<String> {
        self.audit_events.read().await.clone()
    }

    async fn installation(&self, installation_id: Uuid) -> PluginInstallationRecord {
        self.installations
            .read()
            .await
            .get(&installation_id)
            .cloned()
            .expect("installation should exist for test")
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
            trust_level: input.trust_level.clone(),
            verification_status: input.verification_status,
            desired_state: input.desired_state,
            artifact_status: input.artifact_status,
            runtime_status: input.runtime_status,
            availability_status: input.availability_status,
            package_path: input.package_path.clone(),
            installed_path: input.installed_path.clone(),
            checksum: input.checksum.clone(),
            manifest_fingerprint: input.manifest_fingerprint.clone(),
            signature_status: input.signature_status.clone(),
            signature_algorithm: input.signature_algorithm.clone(),
            signing_key_id: input.signing_key_id.clone(),
            last_load_error: input.last_load_error.clone(),
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

    async fn delete_installation(&self, installation_id: Uuid) -> Result<()> {
        if self
            .installations
            .write()
            .await
            .remove(&installation_id)
            .is_some()
        {
            Ok(())
        } else {
            Err(ControlPlaneError::NotFound("plugin_installation").into())
        }
    }

    async fn list_pending_restart_host_extensions(&self) -> Result<Vec<PluginInstallationRecord>> {
        Ok(self
            .installations
            .read()
            .await
            .values()
            .filter(|installation| {
                matches!(
                    installation.desired_state,
                    PluginDesiredState::PendingRestart
                )
            })
            .cloned()
            .collect())
    }

    async fn update_desired_state(
        &self,
        input: &UpdatePluginDesiredStateInput,
    ) -> Result<PluginInstallationRecord> {
        let mut installations = self.installations.write().await;
        let installation = installations
            .get_mut(&input.installation_id)
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        installation.desired_state = input.desired_state;
        installation.availability_status = input.availability_status;
        Ok(installation.clone())
    }

    async fn update_artifact_snapshot(
        &self,
        input: &UpdatePluginArtifactSnapshotInput,
    ) -> Result<PluginInstallationRecord> {
        let mut installations = self.installations.write().await;
        let installation = installations
            .get_mut(&input.installation_id)
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        installation.artifact_status = input.artifact_status;
        installation.availability_status = input.availability_status;
        installation.package_path = input.package_path.clone();
        installation.installed_path = input.installed_path.clone();
        installation.checksum = input.checksum.clone();
        installation.manifest_fingerprint = input.manifest_fingerprint.clone();
        Ok(installation.clone())
    }

    async fn update_runtime_snapshot(
        &self,
        input: &UpdatePluginRuntimeSnapshotInput,
    ) -> Result<PluginInstallationRecord> {
        let mut installations = self.installations.write().await;
        let installation = installations
            .get_mut(&input.installation_id)
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        installation.runtime_status = input.runtime_status;
        installation.availability_status = input.availability_status;
        installation.last_load_error = input.last_load_error.clone();
        Ok(installation.clone())
    }

    async fn create_assignment(
        &self,
        input: &CreatePluginAssignmentInput,
    ) -> Result<PluginAssignmentRecord> {
        let mut assignments = self.assignments.write().await;
        if let Some(existing) = assignments.iter_mut().find(|assignment| {
            assignment.workspace_id == input.workspace_id
                && assignment.provider_code == input.provider_code
        }) {
            existing.installation_id = input.installation_id;
            existing.assigned_by = input.actor_user_id;
            return Ok(existing.clone());
        }

        let record = PluginAssignmentRecord {
            id: Uuid::now_v7(),
            installation_id: input.installation_id,
            workspace_id: input.workspace_id,
            provider_code: input.provider_code.clone(),
            assigned_by: input.actor_user_id,
            created_at: OffsetDateTime::now_utc(),
        };
        assignments.push(record.clone());
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

    async fn list_instances_by_provider_code(
        &self,
        provider_code: &str,
    ) -> Result<Vec<ModelProviderInstanceRecord>> {
        Ok(self
            .instances
            .read()
            .await
            .values()
            .filter(|instance| instance.provider_code == provider_code)
            .cloned()
            .collect())
    }

    async fn reassign_instances_to_installation(
        &self,
        input: &ReassignModelProviderInstancesInput,
    ) -> Result<Vec<ModelProviderInstanceRecord>> {
        let mut instances = self.instances.write().await;
        let mut migrated = Vec::new();
        for instance in instances.values_mut() {
            if instance.workspace_id == input.workspace_id
                && instance.provider_code == input.provider_code
            {
                instance.installation_id = input.target_installation_id;
                instance.protocol = input.target_protocol.clone();
                instance.updated_by = input.updated_by;
                instance.updated_at = OffsetDateTime::now_utc();
                migrated.push(instance.clone());
            }
        }
        Ok(migrated)
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
            parameter_form: Some(plugin_framework::provider_contract::PluginFormSchema {
                schema_version: "1.0.0".to_string(),
                title: Some("LLM Parameters".to_string()),
                description: None,
                fields: vec![plugin_framework::provider_contract::PluginFormFieldSchema {
                    key: "temperature".to_string(),
                    label: "Temperature".to_string(),
                    field_type: "number".to_string(),
                    control: Some("slider".to_string()),
                    group: Some("sampling".to_string()),
                    order: Some(10),
                    advanced: Some(false),
                    required: Some(false),
                    send_mode: Some("optional".to_string()),
                    enabled_by_default: Some(true),
                    description: Some("Controls randomness.".to_string()),
                    placeholder: None,
                    default_value: Some(json!(0.7)),
                    min: Some(0.0),
                    max: Some(2.0),
                    step: Some(0.1),
                    precision: Some(1),
                    unit: None,
                    options: Vec::new(),
                    visible_when: Vec::new(),
                    disabled_when: Vec::new(),
                }],
            }),
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
async fn model_provider_service_masks_secret_in_views_and_reveals_on_demand() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryModelProviderRepository::new(actor_with_permissions(
        workspace_id,
        &["state_model.view.all", "state_model.manage.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let package_root = std::env::temp_dir().join(format!("provider-model-{}", Uuid::now_v7()));
    create_provider_fixture(&package_root);
    let installation_id = repository
        .seed_installation(
            &package_root.display().to_string(),
            PluginDesiredState::ActiveRequested,
            true,
        )
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
    assert_eq!(created.instance.config_json["api_key"], "supe****cret");
    assert_eq!(
        repository.secret_json(created.instance.id).await["api_key"],
        "super-secret"
    );

    let listed = service
        .list_instances(repository.actor.user_id)
        .await
        .unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].instance.config_json["api_key"], "supe****cret");

    let revealed = service
        .reveal_secret(repository.actor.user_id, created.instance.id, "api_key")
        .await
        .unwrap();
    assert_eq!(revealed, "super-secret");

    let validated = service
        .validate_instance(repository.actor.user_id, created.instance.id)
        .await
        .unwrap();
    assert_eq!(
        validated.instance.status,
        ModelProviderInstanceStatus::Ready
    );
    assert_eq!(validated.instance.config_json["api_key"], "supe****cret");
    assert_eq!(
        validated.instance.last_validation_status,
        Some(ModelProviderValidationStatus::Succeeded)
    );
    assert_eq!(
        validated.cache.refresh_status,
        ModelProviderCatalogRefreshStatus::Ready
    );
    assert_eq!(validated.output["sanitized"]["api_key"], "***");

    let options = service
        .options(
            repository.actor.user_id,
            RequestedLocales::new("zh_Hans", "en_US"),
        )
        .await
        .unwrap();
    assert_eq!(options.providers.len(), 1);
    assert!(options.i18n_catalog["plugin.fixture_provider"].contains_key("zh_Hans"));
    assert_eq!(options.providers[0].models.len(), 1);
    assert_eq!(
        options.providers[0].models[0].descriptor.model_id,
        "fixture_chat"
    );
    assert_eq!(
        options.providers[0].models[0]
            .descriptor
            .parameter_form
            .as_ref()
            .expect("parameter form should exist")
            .fields[0]
            .key,
        "temperature"
    );
    assert_eq!(
        options.providers[0].models[0]
            .descriptor
            .parameter_form
            .as_ref()
            .unwrap()
            .schema_version,
        "1.0.0"
    );

    let refreshed = service
        .refresh_models(repository.actor.user_id, created.instance.id)
        .await
        .unwrap();
    assert_eq!(refreshed.models.len(), 1);
    assert_eq!(
        refreshed.models[0]
            .parameter_form
            .as_ref()
            .expect("refreshed models should keep parameter form")
            .fields[0]
            .key,
        "temperature"
    );
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
async fn list_catalog_returns_i18n_namespace_and_keys() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryModelProviderRepository::new(actor_with_permissions(
        workspace_id,
        &["state_model.view.all"],
    ));
    let package_root = std::env::temp_dir().join(format!("provider-catalog-{}", Uuid::now_v7()));
    create_provider_fixture(&package_root);
    repository
        .seed_installation(
            &package_root.display().to_string(),
            PluginDesiredState::ActiveRequested,
            true,
        )
        .await;
    let service = ModelProviderService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        "provider-secret-master-key",
    );

    let entries = service
        .list_catalog(
            repository.actor.user_id,
            RequestedLocales::new("zh_Hans", "en_US"),
        )
        .await
        .unwrap();

    assert!(entries.i18n_catalog["plugin.fixture_provider"].contains_key("zh_Hans"));
    assert_eq!(entries.entries[0].namespace, "plugin.fixture_provider");
    assert_eq!(entries.entries[0].label_key, "provider.label");
    assert_eq!(
        entries.entries[0].predefined_models[0].label_key.as_deref(),
        Some("models.fixture_chat.label")
    );
}

#[tokio::test]
async fn list_catalog_reconciles_missing_artifacts_before_returning_entries() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryModelProviderRepository::new(actor_with_permissions(
        workspace_id,
        &["state_model.view.all"],
    ));
    let package_root =
        std::env::temp_dir().join(format!("provider-catalog-missing-{}", Uuid::now_v7()));
    create_provider_fixture(&package_root);
    let installation_id = repository
        .seed_installation(
            &package_root.display().to_string(),
            PluginDesiredState::ActiveRequested,
            true,
        )
        .await;
    fs::remove_dir_all(&package_root).unwrap();
    let service = ModelProviderService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        "provider-secret-master-key",
    );

    let catalog = service
        .list_catalog(
            repository.actor.user_id,
            RequestedLocales::new("zh_Hans", "en_US"),
        )
        .await
        .unwrap();
    let installation = repository.installation(installation_id).await;

    assert!(catalog.entries.is_empty());
    assert_eq!(installation.artifact_status, PluginArtifactStatus::Missing);
    assert_eq!(
        installation.availability_status,
        PluginAvailabilityStatus::ArtifactMissing
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
        .seed_installation(
            &package_root.display().to_string(),
            PluginDesiredState::ActiveRequested,
            true,
        )
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
        .list_catalog(
            viewer_repository.actor.user_id,
            RequestedLocales::new("en_US", "en_US"),
        )
        .await
        .unwrap();
    assert!(catalog.entries.is_empty());

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

#[tokio::test]
async fn model_provider_service_rejects_validating_disabled_instance() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryModelProviderRepository::new(actor_with_permissions(
        workspace_id,
        &["state_model.view.all", "state_model.manage.all"],
    ));
    let package_root =
        std::env::temp_dir().join(format!("provider-model-disabled-{}", Uuid::now_v7()));
    create_provider_fixture(&package_root);
    let installation_id = repository
        .seed_installation(
            &package_root.display().to_string(),
            PluginDesiredState::ActiveRequested,
            true,
        )
        .await;
    let service = ModelProviderService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        "provider-secret-master-key",
    );

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
    repository
        .set_instance_status(created.instance.id, ModelProviderInstanceStatus::Disabled)
        .await;

    let error = service
        .validate_instance(repository.actor.user_id, created.instance.id)
        .await
        .unwrap_err();

    assert!(matches!(
        error.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::InvalidStateTransition { resource, from, to, .. })
            if *resource == "model_provider_instance" && from == "disabled" && to == "ready"
    ));
}
