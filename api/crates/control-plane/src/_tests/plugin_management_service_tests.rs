use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

use anyhow::Result;
use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    plugin_management::{
        AssignPluginCommand, EnablePluginCommand, InstallOfficialPluginCommand,
        InstallPluginCommand, PluginManagementService, SwitchPluginVersionCommand,
        UpgradeLatestPluginFamilyCommand,
    },
    ports::{
        AuthRepository, CreateModelProviderInstanceInput, CreatePluginAssignmentInput,
        CreatePluginTaskInput, ModelProviderRepository,
        DownloadedOfficialPluginPackage, OfficialPluginSourceEntry, OfficialPluginSourcePort,
        PluginRepository, ProviderRuntimeInvocationOutput, ProviderRuntimePort,
        ReassignModelProviderInstancesInput, UpdateModelProviderInstanceInput,
        UpdatePluginInstallationEnabledInput, UpdatePluginTaskStatusInput, UpdateProfileInput,
        UpsertModelProviderCatalogCacheInput, UpsertModelProviderSecretInput,
        UpsertPluginInstallationInput,
    },
};
use domain::{
    ActorContext, AuditLogRecord, AuthenticatorRecord, ModelProviderCatalogCacheRecord,
    ModelProviderCatalogRefreshStatus, ModelProviderCatalogSource, ModelProviderDiscoveryMode,
    ModelProviderInstanceRecord, ModelProviderInstanceStatus, ModelProviderSecretRecord,
    PermissionDefinition, PluginAssignmentRecord, PluginInstallationRecord, PluginTaskKind,
    PluginTaskRecord, PluginTaskStatus, ScopeContext, UserRecord,
};
use plugin_framework::provider_contract::{
    ProviderInvocationInput, ProviderInvocationResult, ProviderModelDescriptor,
};
use time::OffsetDateTime;

#[derive(Clone)]
struct MemoryPluginManagementRepository {
    actor: ActorContext,
    installations: Arc<RwLock<HashMap<Uuid, PluginInstallationRecord>>>,
    plugin_ids: Arc<RwLock<HashMap<String, Uuid>>>,
    assignments: Arc<RwLock<Vec<PluginAssignmentRecord>>>,
    tasks: Arc<RwLock<HashMap<Uuid, PluginTaskRecord>>>,
    instances: Arc<RwLock<HashMap<Uuid, ModelProviderInstanceRecord>>>,
    caches: Arc<RwLock<HashMap<Uuid, ModelProviderCatalogCacheRecord>>>,
    audit_events: Arc<RwLock<Vec<String>>>,
}

impl MemoryPluginManagementRepository {
    fn new(actor: ActorContext) -> Self {
        Self {
            actor,
            installations: Arc::new(RwLock::new(HashMap::new())),
            plugin_ids: Arc::new(RwLock::new(HashMap::new())),
            assignments: Arc::new(RwLock::new(Vec::new())),
            tasks: Arc::new(RwLock::new(HashMap::new())),
            instances: Arc::new(RwLock::new(HashMap::new())),
            caches: Arc::new(RwLock::new(HashMap::new())),
            audit_events: Arc::new(RwLock::new(Vec::new())),
        }
    }

    async fn audit_events(&self) -> Vec<String> {
        self.audit_events.read().await.clone()
    }

    async fn assignment_installation_id(&self, provider_code: &str) -> Uuid {
        self.assignments
            .read()
            .await
            .iter()
            .find(|assignment| assignment.provider_code == provider_code)
            .map(|assignment| assignment.installation_id)
            .unwrap()
    }

    async fn cache_refresh_statuses(&self) -> Vec<String> {
        let mut statuses = self
            .caches
            .read()
            .await
            .values()
            .map(|cache| cache.refresh_status.as_str().to_string())
            .collect::<Vec<_>>();
        statuses.sort();
        statuses
    }

    async fn seed_instance_with_ready_cache(
        &self,
        installation_id: Uuid,
        provider_code: &str,
        display_name: &str,
    ) -> Uuid {
        let now = OffsetDateTime::now_utc();
        let instance_id = Uuid::now_v7();
        self.instances.write().await.insert(
            instance_id,
            ModelProviderInstanceRecord {
                id: instance_id,
                workspace_id: self.actor.current_workspace_id,
                installation_id,
                provider_code: provider_code.to_string(),
                protocol: "openai_compatible".to_string(),
                display_name: display_name.to_string(),
                status: ModelProviderInstanceStatus::Ready,
                config_json: json!({ "base_url": "https://api.example.com" }),
                last_validated_at: Some(now),
                last_validation_status: None,
                last_validation_message: None,
                created_by: self.actor.user_id,
                updated_by: self.actor.user_id,
                created_at: now,
                updated_at: now,
            },
        );
        self.caches.write().await.insert(
            instance_id,
            ModelProviderCatalogCacheRecord {
                provider_instance_id: instance_id,
                model_discovery_mode: ModelProviderDiscoveryMode::Hybrid,
                refresh_status: ModelProviderCatalogRefreshStatus::Ready,
                source: ModelProviderCatalogSource::Hybrid,
                models_json: json!([{ "model_id": "fixture_chat" }]),
                last_error_message: None,
                refreshed_at: Some(now),
                updated_at: now,
            },
        );
        instance_id
    }
}

#[async_trait]
impl AuthRepository for MemoryPluginManagementRepository {
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
impl PluginRepository for MemoryPluginManagementRepository {
    async fn upsert_installation(
        &self,
        input: &UpsertPluginInstallationInput,
    ) -> Result<PluginInstallationRecord> {
        let now = OffsetDateTime::now_utc();
        let existing_id = self.plugin_ids.read().await.get(&input.plugin_id).copied();
        let id = existing_id.unwrap_or(input.installation_id);
        let mut installations = self.installations.write().await;
        let created_at = installations
            .get(&id)
            .map(|item| item.created_at)
            .unwrap_or(now);
        let record = PluginInstallationRecord {
            id,
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
            created_at,
            updated_at: now,
        };
        installations.insert(id, record.clone());
        self.plugin_ids
            .write()
            .await
            .insert(input.plugin_id.clone(), id);
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
        installation.updated_at = OffsetDateTime::now_utc();
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
        let now = OffsetDateTime::now_utc();
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
            created_at: now,
            updated_at: now,
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
impl ModelProviderRepository for MemoryPluginManagementRepository {
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
        _input: &UpsertModelProviderSecretInput,
    ) -> Result<ModelProviderSecretRecord> {
        unimplemented!("not needed in plugin management tests")
    }

    async fn get_secret_json(
        &self,
        _provider_instance_id: Uuid,
        _master_key: &str,
    ) -> Result<Option<Value>> {
        Ok(None)
    }

    async fn get_secret_record(
        &self,
        _provider_instance_id: Uuid,
    ) -> Result<Option<ModelProviderSecretRecord>> {
        Ok(None)
    }

    async fn delete_instance(&self, _workspace_id: Uuid, _instance_id: Uuid) -> Result<()> {
        unimplemented!("not needed in plugin management tests")
    }

    async fn count_instance_references(
        &self,
        _workspace_id: Uuid,
        _instance_id: Uuid,
    ) -> Result<u64> {
        Ok(0)
    }
}

#[derive(Clone, Default)]
struct MemoryProviderRuntime {
    loaded_installations: Arc<RwLock<Vec<Uuid>>>,
}

impl MemoryProviderRuntime {
    async fn loaded_installations(&self) -> Vec<Uuid> {
        self.loaded_installations.read().await.clone()
    }
}

#[derive(Clone, Default)]
struct MemoryOfficialPluginSource;

#[async_trait]
impl OfficialPluginSourcePort for MemoryOfficialPluginSource {
    async fn list_official_catalog(&self) -> Result<Vec<OfficialPluginSourceEntry>> {
        Ok(vec![OfficialPluginSourceEntry {
            plugin_id: "1flowbase.openai_compatible".to_string(),
            provider_code: "openai_compatible".to_string(),
            display_name: "OpenAI Compatible".to_string(),
            protocol: "openai_compatible".to_string(),
            latest_version: "0.1.0".to_string(),
            release_tag: "openai_compatible-v0.1.0".to_string(),
            download_url: "https://example.com/openai-compatible.1flowbasepkg".to_string(),
            checksum: "sha256:abc123".to_string(),
            signature_status: "unsigned".to_string(),
            help_url: Some(
                "https://github.com/taichuy/1flowbase-official-plugins/tree/main/models/openai_compatible"
                    .to_string(),
            ),
            model_discovery_mode: "hybrid".to_string(),
        }])
    }

    async fn download_plugin(
        &self,
        _entry: &OfficialPluginSourceEntry,
    ) -> Result<DownloadedOfficialPluginPackage> {
        let package_root =
            std::env::temp_dir().join(format!("official-plugin-source-{}", Uuid::now_v7()));
        create_openai_compatible_fixture(&package_root);
        Ok(DownloadedOfficialPluginPackage {
            package_root,
            checksum: "sha256:abc123".to_string(),
            signature_status: "unsigned".to_string(),
        })
    }
}

#[async_trait]
impl ProviderRuntimePort for MemoryProviderRuntime {
    async fn ensure_loaded(&self, installation: &PluginInstallationRecord) -> Result<()> {
        if !Path::new(&installation.install_path).is_dir() {
            return Err(ControlPlaneError::NotFound("provider_install_path").into());
        }
        self.loaded_installations
            .write()
            .await
            .push(installation.id);
        Ok(())
    }

    async fn validate_provider(
        &self,
        _installation: &PluginInstallationRecord,
        _provider_config: Value,
    ) -> Result<Value> {
        Ok(json!({ "ok": true }))
    }

    async fn list_models(
        &self,
        _installation: &PluginInstallationRecord,
        _provider_config: Value,
    ) -> Result<Vec<ProviderModelDescriptor>> {
        Ok(vec![ProviderModelDescriptor {
            model_id: "fixture_chat".to_string(),
            display_name: "Fixture Chat".to_string(),
            source: plugin_framework::provider_contract::ProviderModelSource::Dynamic,
            supports_streaming: true,
            supports_tool_call: false,
            supports_multimodal: false,
            context_window: Some(128000),
            max_output_tokens: Some(4096),
            parameter_form: None,
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

pub(super) fn actor_with_permissions(workspace_id: Uuid, permissions: &[&str]) -> ActorContext {
    ActorContext::scoped(
        Uuid::now_v7(),
        workspace_id,
        "manager",
        permissions.iter().map(|value| value.to_string()),
    )
}

pub(super) fn create_provider_fixture(root: &Path) {
    fs::create_dir_all(root.join("provider")).unwrap();
    fs::create_dir_all(root.join("models/llm")).unwrap();
    fs::create_dir_all(root.join("i18n")).unwrap();
    fs::create_dir_all(root.join("demo")).unwrap();
    fs::create_dir_all(root.join("scripts")).unwrap();
    fs::write(
        root.join("manifest.yaml"),
        r#"plugin_code: fixture_provider
display_name: Fixture Provider
version: 0.1.0
contract_version: 1flowbase.provider/v1
supported_model_types:
  - llm
runner:
  language: nodejs
  entrypoint: provider/fixture_provider.js
"#,
    )
    .unwrap();
    fs::write(
        root.join("provider/fixture_provider.yaml"),
        r#"provider_code: fixture_provider
protocol: openai_compatible
help_url: https://example.com/help
default_base_url: https://api.example.com
model_discovery: hybrid
config_schema:
  - key: base_url
    type: string
    required: true
  - key: api_key
    type: secret
    required: true
"#,
    )
    .unwrap();
    fs::write(
        root.join("provider/fixture_provider.js"),
        "module.exports = {};",
    )
    .unwrap();
    fs::write(
        root.join("models/llm/_position.yaml"),
        "items:\n  - fixture_chat\n",
    )
    .unwrap();
    fs::write(
        root.join("models/llm/fixture_chat.yaml"),
        r#"model: fixture_chat
label: Fixture Chat
family: llm
capabilities:
  - stream
"#,
    )
    .unwrap();
    fs::write(
        root.join("i18n/en_US.json"),
        r#"{ "plugin": { "label": "Fixture Provider" } }"#,
    )
    .unwrap();
    fs::write(root.join("demo/index.html"), "<html></html>").unwrap();
    fs::write(root.join("scripts/demo.sh"), "echo demo").unwrap();
}

fn create_openai_compatible_fixture(root: &Path) {
    fs::create_dir_all(root.join("provider")).unwrap();
    fs::create_dir_all(root.join("models/llm")).unwrap();
    fs::create_dir_all(root.join("i18n")).unwrap();
    fs::write(
        root.join("manifest.yaml"),
        r#"plugin_code: openai_compatible
display_name: OpenAI Compatible
version: 0.1.0
contract_version: 1flowbase.provider/v1
supported_model_types:
  - llm
runner:
  language: nodejs
  entrypoint: provider/openai_compatible.js
"#,
    )
    .unwrap();
    fs::write(
        root.join("provider/openai_compatible.yaml"),
        r#"provider_code: openai_compatible
display_name: OpenAI Compatible
protocol: openai_compatible
help_url: https://platform.openai.com/docs/api-reference
default_base_url: https://api.openai.com/v1
model_discovery: hybrid
config_schema:
  - key: base_url
    type: string
    required: true
  - key: api_key
    type: secret
    required: true
"#,
    )
    .unwrap();
    fs::write(
        root.join("provider/openai_compatible.js"),
        "module.exports = {};",
    )
    .unwrap();
    fs::write(
        root.join("models/llm/_position.yaml"),
        "items:\n  - openai_compatible_chat\n",
    )
    .unwrap();
    fs::write(
        root.join("models/llm/openai_compatible_chat.yaml"),
        r#"model: openai_compatible_chat
label: OpenAI Compatible Chat
family: llm
capabilities:
  - stream
"#,
    )
    .unwrap();
    fs::write(
        root.join("i18n/en_US.json"),
        r#"{ "plugin": { "label": "OpenAI Compatible" } }"#,
    )
    .unwrap();
}

async fn seed_test_installation(
    repository: &MemoryPluginManagementRepository,
    install_root: &Path,
    provider_code: &str,
    plugin_version: &str,
    enabled: bool,
) -> Uuid {
    let package_root = install_root.join(format!("{provider_code}-{plugin_version}"));
    fs::create_dir_all(package_root.join("provider")).unwrap();
    fs::create_dir_all(package_root.join("models/llm")).unwrap();
    fs::create_dir_all(package_root.join("i18n")).unwrap();
    fs::write(
        package_root.join("manifest.yaml"),
        format!(
            "plugin_code: {provider_code}\ndisplay_name: Fixture Provider\nversion: {plugin_version}\ncontract_version: 1flowbase.provider/v1\nsupported_model_types:\n  - llm\nrunner:\n  language: nodejs\n  entrypoint: provider/{provider_code}.js\n"
        ),
    )
    .unwrap();
    fs::write(
        package_root.join(format!("provider/{provider_code}.yaml")),
        format!(
            "provider_code: {provider_code}\ndisplay_name: Fixture Provider\nprotocol: openai_compatible\nhelp_url: https://example.com/help\ndefault_base_url: https://api.example.com\nmodel_discovery: hybrid\nconfig_schema:\n  - key: base_url\n    type: string\n    required: true\n  - key: api_key\n    type: secret\n    required: true\n"
        ),
    )
    .unwrap();
    fs::write(
        package_root.join(format!("provider/{provider_code}.js")),
        "module.exports = {};",
    )
    .unwrap();
    fs::write(
        package_root.join("models/llm/_position.yaml"),
        "items:\n  - fixture_chat\n",
    )
    .unwrap();
    fs::write(
        package_root.join("models/llm/fixture_chat.yaml"),
        r#"model: fixture_chat
label: Fixture Chat
family: llm
capabilities:
  - stream
"#,
    )
    .unwrap();
    fs::write(
        package_root.join("i18n/en_US.json"),
        r#"{ "plugin": { "label": "Fixture Provider" } }"#,
    )
    .unwrap();

    repository
        .upsert_installation(&UpsertPluginInstallationInput {
            installation_id: Uuid::now_v7(),
            provider_code: provider_code.into(),
            plugin_id: format!("{provider_code}@{plugin_version}"),
            plugin_version: plugin_version.into(),
            contract_version: "1flowbase.provider/v1".into(),
            protocol: "openai_compatible".into(),
            display_name: "Fixture Provider".into(),
            source_kind: "official_registry".into(),
            verification_status: domain::PluginVerificationStatus::Valid,
            enabled,
            install_path: package_root.display().to_string(),
            checksum: None,
            signature_status: None,
            metadata_json: json!({}),
            actor_user_id: repository.actor.user_id,
        })
        .await
        .unwrap()
        .id
}

#[tokio::test]
async fn plugin_management_service_lists_provider_families_with_current_and_latest_versions() {
    #[derive(Clone)]
    struct OutdatedOfficialSource;

    #[async_trait]
    impl OfficialPluginSourcePort for OutdatedOfficialSource {
        async fn list_official_catalog(&self) -> Result<Vec<OfficialPluginSourceEntry>> {
            Ok(vec![OfficialPluginSourceEntry {
                plugin_id: "1flowbase.openai_compatible".into(),
                provider_code: "openai_compatible".into(),
                display_name: "OpenAI Compatible".into(),
                protocol: "openai_compatible".into(),
                latest_version: "0.2.0".into(),
                release_tag: "openai_compatible-v0.2.0".into(),
                download_url: "https://example.com/openai-compatible.1flowbasepkg".into(),
                checksum: "sha256:abc123".into(),
                signature_status: "unsigned".into(),
                help_url: Some("https://example.com/help".into()),
                model_discovery_mode: "hybrid".into(),
            }])
        }

        async fn download_plugin(
            &self,
            _entry: &OfficialPluginSourceEntry,
        ) -> Result<DownloadedOfficialPluginPackage> {
            unreachable!("download is not used in this read-only test");
        }
    }

    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let install_root = std::env::temp_dir().join(format!("plugin-family-{}", Uuid::now_v7()));
    let service = PluginManagementService::new(
        repository.clone(),
        MemoryProviderRuntime::default(),
        Arc::new(OutdatedOfficialSource),
        &install_root,
    );

    let installation_v1 =
        seed_test_installation(&repository, &install_root, "openai_compatible", "0.1.0", true)
            .await;
    let _installation_v2 =
        seed_test_installation(&repository, &install_root, "openai_compatible", "0.2.0", true)
            .await;
    repository
        .create_assignment(&CreatePluginAssignmentInput {
            installation_id: installation_v1,
            workspace_id: repository.actor.current_workspace_id,
            provider_code: "openai_compatible".into(),
            actor_user_id: repository.actor.user_id,
        })
        .await
        .unwrap();

    let families = service.list_families(repository.actor.user_id).await.unwrap();
    assert_eq!(families.len(), 1);
    assert_eq!(families[0].provider_code, "openai_compatible");
    assert_eq!(families[0].current_version, "0.1.0");
    assert_eq!(families[0].latest_version.as_deref(), Some("0.2.0"));
    assert!(families[0].has_update);
}

#[tokio::test]
async fn plugin_management_service_switches_to_a_local_version_without_redownloading() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let install_root = std::env::temp_dir().join(format!("plugin-switch-{}", Uuid::now_v7()));
    let service = PluginManagementService::new(
        repository.clone(),
        runtime,
        Arc::new(MemoryOfficialPluginSource),
        &install_root,
    );

    let current_installation =
        seed_test_installation(&repository, &install_root, "fixture_provider", "0.1.0", true)
            .await;
    let target_installation =
        seed_test_installation(&repository, &install_root, "fixture_provider", "0.2.0", true)
            .await;
    repository
        .create_assignment(&CreatePluginAssignmentInput {
            installation_id: current_installation,
            workspace_id,
            provider_code: "fixture_provider".into(),
            actor_user_id: repository.actor.user_id,
        })
        .await
        .unwrap();

    let task = service
        .switch_version(SwitchPluginVersionCommand {
            actor_user_id: repository.actor.user_id,
            provider_code: "fixture_provider".into(),
            target_installation_id: target_installation,
        })
        .await
        .unwrap();

    let assignments = repository.list_assignments(workspace_id).await.unwrap();
    assert_eq!(assignments.len(), 1);
    assert_eq!(assignments[0].installation_id, target_installation);
    assert_eq!(task.task_kind, PluginTaskKind::SwitchVersion);
    assert_eq!(task.status, PluginTaskStatus::Success);
}

#[tokio::test]
async fn plugin_management_service_switches_version_and_invalidates_provider_caches() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let install_root = std::env::temp_dir().join(format!("plugin-switch-migrate-{}", Uuid::now_v7()));
    let service = PluginManagementService::new(
        repository.clone(),
        runtime,
        Arc::new(MemoryOfficialPluginSource),
        &install_root,
    );

    let current_installation =
        seed_test_installation(&repository, &install_root, "fixture_provider", "0.1.0", true)
            .await;
    let target_installation =
        seed_test_installation(&repository, &install_root, "fixture_provider", "0.2.0", true)
            .await;
    repository
        .create_assignment(&CreatePluginAssignmentInput {
            installation_id: current_installation,
            workspace_id,
            provider_code: "fixture_provider".into(),
            actor_user_id: repository.actor.user_id,
        })
        .await
        .unwrap();
    repository
        .seed_instance_with_ready_cache(
            current_installation,
            "fixture_provider",
            "Fixture Provider Prod",
        )
        .await;
    repository
        .seed_instance_with_ready_cache(
            current_installation,
            "fixture_provider",
            "Fixture Provider Staging",
        )
        .await;

    let task = service
        .switch_version(SwitchPluginVersionCommand {
            actor_user_id: repository.actor.user_id,
            provider_code: "fixture_provider".into(),
            target_installation_id: target_installation,
        })
        .await
        .unwrap();

    assert_eq!(task.task_kind, PluginTaskKind::SwitchVersion);
    assert_eq!(task.detail_json["migrated_instance_count"], 2);
    assert_eq!(
        repository.assignment_installation_id("fixture_provider").await,
        target_installation
    );
    assert_eq!(
        repository.cache_refresh_statuses().await,
        vec!["idle", "idle"]
    );
}

#[tokio::test]
async fn plugin_management_service_upgrades_to_latest_without_redownloading_when_already_installed_locally(
) {
    #[derive(Clone)]
    struct LatestAlreadyInstalledSource {
        download_calls: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl OfficialPluginSourcePort for LatestAlreadyInstalledSource {
        async fn list_official_catalog(&self) -> Result<Vec<OfficialPluginSourceEntry>> {
            Ok(vec![OfficialPluginSourceEntry {
                plugin_id: "1flowbase.fixture_provider".into(),
                provider_code: "fixture_provider".into(),
                display_name: "Fixture Provider".into(),
                protocol: "openai_compatible".into(),
                latest_version: "0.2.0".into(),
                release_tag: "fixture_provider-v0.2.0".into(),
                download_url: "https://example.com/fixture-provider.1flowbasepkg".into(),
                checksum: "sha256:fixture".into(),
                signature_status: "unsigned".into(),
                help_url: Some("https://example.com/help".into()),
                model_discovery_mode: "hybrid".into(),
            }])
        }

        async fn download_plugin(
            &self,
            _entry: &OfficialPluginSourceEntry,
        ) -> Result<DownloadedOfficialPluginPackage> {
            self.download_calls.fetch_add(1, Ordering::SeqCst);
            anyhow::bail!("download should not be called when latest is already installed")
        }
    }

    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let download_calls = Arc::new(AtomicUsize::new(0));
    let install_root =
        std::env::temp_dir().join(format!("plugin-upgrade-latest-{}", Uuid::now_v7()));
    let service = PluginManagementService::new(
        repository.clone(),
        runtime,
        Arc::new(LatestAlreadyInstalledSource {
            download_calls: download_calls.clone(),
        }),
        &install_root,
    );

    let current_installation =
        seed_test_installation(&repository, &install_root, "fixture_provider", "0.1.0", true)
            .await;
    let target_installation =
        seed_test_installation(&repository, &install_root, "fixture_provider", "0.2.0", false)
            .await;
    repository
        .create_assignment(&CreatePluginAssignmentInput {
            installation_id: current_installation,
            workspace_id,
            provider_code: "fixture_provider".into(),
            actor_user_id: repository.actor.user_id,
        })
        .await
        .unwrap();

    let task = service
        .upgrade_latest(UpgradeLatestPluginFamilyCommand {
            actor_user_id: repository.actor.user_id,
            provider_code: "fixture_provider".into(),
        })
        .await
        .unwrap();

    let assignments = repository.list_assignments(workspace_id).await.unwrap();
    assert_eq!(assignments.len(), 1);
    assert_eq!(assignments[0].installation_id, target_installation);
    assert_eq!(task.task_kind, PluginTaskKind::SwitchVersion);
    assert_eq!(task.status, PluginTaskStatus::Success);
    assert_eq!(download_calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn plugin_management_service_installs_enables_assigns_and_lists_tasks() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let nonce = Uuid::now_v7().to_string();
    let package_root = std::env::temp_dir().join(format!("plugin-source-{nonce}"));
    let install_root = std::env::temp_dir().join(format!("plugin-installed-{nonce}"));
    create_provider_fixture(&package_root);

    let service = PluginManagementService::new(
        repository.clone(),
        runtime.clone(),
        std::sync::Arc::new(MemoryOfficialPluginSource),
        &install_root,
    );

    let install = service
        .install_plugin(InstallPluginCommand {
            actor_user_id: repository.actor.user_id,
            package_root: package_root.display().to_string(),
        })
        .await
        .unwrap();
    assert_eq!(install.task.status, PluginTaskStatus::Success);
    assert!(!install.installation.enabled);
    assert!(PathBuf::from(&install.installation.install_path).is_dir());
    assert!(!Path::new(&install.installation.install_path)
        .join("demo")
        .exists());
    assert!(!Path::new(&install.installation.install_path)
        .join("scripts")
        .exists());

    let enable = service
        .enable_plugin(EnablePluginCommand {
            actor_user_id: repository.actor.user_id,
            installation_id: install.installation.id,
        })
        .await
        .unwrap();
    assert_eq!(enable.status, PluginTaskStatus::Success);

    let assign = service
        .assign_plugin(AssignPluginCommand {
            actor_user_id: repository.actor.user_id,
            installation_id: install.installation.id,
        })
        .await
        .unwrap();
    assert_eq!(assign.status, PluginTaskStatus::Success);

    let catalog = service
        .list_catalog(repository.actor.user_id)
        .await
        .unwrap();
    assert_eq!(catalog.len(), 1);
    assert!(catalog[0].assigned_to_current_workspace);
    assert_eq!(catalog[0].model_discovery_mode, "hybrid");

    let tasks = service.list_tasks(repository.actor.user_id).await.unwrap();
    assert_eq!(tasks.len(), 3);
    let fetched = service
        .get_task(repository.actor.user_id, install.task.id)
        .await
        .unwrap();
    assert_eq!(fetched.task_kind, PluginTaskKind::Install);
    assert_eq!(
        runtime.loaded_installations().await,
        vec![install.installation.id]
    );
    assert_eq!(
        repository.audit_events().await,
        vec!["plugin.installed", "plugin.enabled", "plugin.assigned"]
    );
}

#[tokio::test]
async fn plugin_management_service_blocks_manage_actions_without_configure_permission() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let service = PluginManagementService::new(
        repository.clone(),
        runtime,
        std::sync::Arc::new(MemoryOfficialPluginSource),
        std::env::temp_dir().join(format!("plugin-installed-{}", Uuid::now_v7())),
    );

    let catalog = service
        .list_catalog(repository.actor.user_id)
        .await
        .unwrap();
    assert!(catalog.is_empty());

    let error = service
        .install_plugin(InstallPluginCommand {
            actor_user_id: repository.actor.user_id,
            package_root: "/tmp/missing".to_string(),
        })
        .await
        .unwrap_err();
    assert!(matches!(
        error.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::PermissionDenied("permission_denied"))
    ));
}

#[tokio::test]
async fn plugin_management_service_lists_official_catalog_and_installs_latest_release_asset() {
    let workspace_id = Uuid::now_v7();
    let repository = MemoryPluginManagementRepository::new(actor_with_permissions(
        workspace_id,
        &["plugin_config.view.all", "plugin_config.configure.all"],
    ));
    let runtime = MemoryProviderRuntime::default();
    let service = PluginManagementService::new(
        repository.clone(),
        runtime,
        std::sync::Arc::new(MemoryOfficialPluginSource),
        std::env::temp_dir().join(format!("plugin-installed-{}", Uuid::now_v7())),
    );

    let catalog = service
        .list_official_catalog(repository.actor.user_id)
        .await
        .unwrap();
    assert_eq!(catalog.len(), 1);

    let install = service
        .install_official_plugin(InstallOfficialPluginCommand {
            actor_user_id: repository.actor.user_id,
            plugin_id: "1flowbase.openai_compatible".to_string(),
        })
        .await
        .unwrap();

    assert_eq!(install.installation.provider_code, "openai_compatible");
    assert_eq!(install.installation.source_kind, "official_registry");
    assert_eq!(
        install.installation.checksum.as_deref(),
        Some("sha256:abc123")
    );
    assert_eq!(install.task.status, PluginTaskStatus::Success);
}
