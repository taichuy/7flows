use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
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
        InstallPluginCommand, PluginManagementService,
    },
    ports::{
        AuthRepository, CreatePluginAssignmentInput, CreatePluginTaskInput,
        DownloadedOfficialPluginPackage, OfficialPluginSourceEntry, OfficialPluginSourcePort,
        PluginRepository, ProviderRuntimeInvocationOutput, ProviderRuntimePort,
        UpdatePluginInstallationEnabledInput, UpdatePluginTaskStatusInput, UpdateProfileInput,
        UpsertPluginInstallationInput,
    },
};
use domain::{
    ActorContext, AuditLogRecord, AuthenticatorRecord, PermissionDefinition,
    PluginAssignmentRecord, PluginInstallationRecord, PluginTaskKind, PluginTaskRecord,
    PluginTaskStatus, ScopeContext, UserRecord,
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
            audit_events: Arc::new(RwLock::new(Vec::new())),
        }
    }

    async fn audit_events(&self) -> Vec<String> {
        self.audit_events.read().await.clone()
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
            assignment.installation_id == input.installation_id
                && assignment.workspace_id == input.workspace_id
        }) {
            existing.assigned_by = input.actor_user_id;
            return Ok(existing.clone());
        }

        let record = PluginAssignmentRecord {
            id: Uuid::now_v7(),
            installation_id: input.installation_id,
            workspace_id: input.workspace_id,
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
            plugin_id: "1flowse.openai_compatible".to_string(),
            provider_code: "openai_compatible".to_string(),
            display_name: "OpenAI Compatible".to_string(),
            protocol: "openai_compatible".to_string(),
            latest_version: "0.1.0".to_string(),
            release_tag: "openai_compatible-v0.1.0".to_string(),
            download_url: "https://example.com/openai-compatible.1flowsepkg".to_string(),
            checksum: "sha256:abc123".to_string(),
            signature_status: "unsigned".to_string(),
            help_url: Some(
                "https://github.com/taichuy/1flowse-official-plugins/tree/main/models/openai_compatible"
                    .to_string(),
            ),
            model_discovery_mode: "hybrid".to_string(),
        }])
    }

    async fn download_plugin(
        &self,
        _entry: &OfficialPluginSourceEntry,
    ) -> Result<DownloadedOfficialPluginPackage> {
        let package_root = std::env::temp_dir().join(format!(
            "official-plugin-source-{}",
            Uuid::now_v7()
        ));
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
contract_version: 1flowse.provider/v1
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
contract_version: 1flowse.provider/v1
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
            plugin_id: "1flowse.openai_compatible".to_string(),
        })
        .await
        .unwrap();

    assert_eq!(install.installation.provider_code, "openai_compatible");
    assert_eq!(install.installation.source_kind, "official_registry");
    assert_eq!(install.installation.checksum.as_deref(), Some("sha256:abc123"));
    assert_eq!(install.task.status, PluginTaskStatus::Success);
}
