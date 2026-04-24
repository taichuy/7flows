use super::*;

#[derive(Debug, Clone)]
pub struct UpsertPluginInstallationInput {
    pub installation_id: Uuid,
    pub provider_code: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub contract_version: String,
    pub protocol: String,
    pub display_name: String,
    pub source_kind: String,
    pub trust_level: String,
    pub verification_status: domain::PluginVerificationStatus,
    pub desired_state: domain::PluginDesiredState,
    pub artifact_status: domain::PluginArtifactStatus,
    pub runtime_status: domain::PluginRuntimeStatus,
    pub availability_status: domain::PluginAvailabilityStatus,
    pub package_path: Option<String>,
    pub installed_path: String,
    pub checksum: Option<String>,
    pub manifest_fingerprint: Option<String>,
    pub signature_status: Option<String>,
    pub signature_algorithm: Option<String>,
    pub signing_key_id: Option<String>,
    pub last_load_error: Option<String>,
    pub metadata_json: serde_json::Value,
    pub actor_user_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct CreatePluginAssignmentInput {
    pub installation_id: Uuid,
    pub workspace_id: Uuid,
    pub provider_code: String,
    pub actor_user_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct CreatePluginTaskInput {
    pub task_id: Uuid,
    pub installation_id: Option<Uuid>,
    pub workspace_id: Option<Uuid>,
    pub provider_code: String,
    pub task_kind: domain::PluginTaskKind,
    pub status: domain::PluginTaskStatus,
    pub status_message: Option<String>,
    pub detail_json: serde_json::Value,
    pub actor_user_id: Option<Uuid>,
}

#[derive(Debug, Clone)]
pub struct UpdatePluginTaskStatusInput {
    pub task_id: Uuid,
    pub status: domain::PluginTaskStatus,
    pub status_message: Option<String>,
    pub detail_json: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct UpdatePluginDesiredStateInput {
    pub installation_id: Uuid,
    pub desired_state: domain::PluginDesiredState,
    pub availability_status: domain::PluginAvailabilityStatus,
}

#[derive(Debug, Clone)]
pub struct UpdatePluginArtifactSnapshotInput {
    pub installation_id: Uuid,
    pub artifact_status: domain::PluginArtifactStatus,
    pub availability_status: domain::PluginAvailabilityStatus,
    pub package_path: Option<String>,
    pub installed_path: String,
    pub checksum: Option<String>,
    pub manifest_fingerprint: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UpdatePluginRuntimeSnapshotInput {
    pub installation_id: Uuid,
    pub runtime_status: domain::PluginRuntimeStatus,
    pub availability_status: domain::PluginAvailabilityStatus,
    pub last_load_error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OfficialPluginCatalogSource {
    pub source_kind: String,
    pub source_label: String,
    pub registry_url: String,
}

#[derive(Debug, Clone)]
pub struct OfficialPluginArtifact {
    pub os: String,
    pub arch: String,
    pub libc: Option<String>,
    pub rust_target: String,
    pub download_url: String,
    pub checksum: String,
    pub signature_algorithm: Option<String>,
    pub signing_key_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OfficialPluginI18nSummary {
    pub default_locale: String,
    pub available_locales: Vec<String>,
    pub bundles: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct OfficialPluginSourceEntry {
    pub plugin_id: String,
    pub plugin_type: String,
    pub provider_code: String,
    pub namespace: String,
    pub protocol: String,
    pub latest_version: String,
    pub icon: Option<String>,
    pub selected_artifact: OfficialPluginArtifact,
    pub i18n_summary: OfficialPluginI18nSummary,
    pub release_tag: String,
    pub trust_mode: String,
    pub help_url: Option<String>,
    pub model_discovery_mode: String,
}

#[derive(Debug, Clone)]
pub struct OfficialPluginCatalogSnapshot {
    pub source: OfficialPluginCatalogSource,
    pub entries: Vec<OfficialPluginSourceEntry>,
}

#[derive(Debug, Clone)]
pub struct DownloadedOfficialPluginPackage {
    pub file_name: String,
    pub package_bytes: Vec<u8>,
}

#[async_trait]
pub trait OfficialPluginSourcePort: Send + Sync {
    async fn list_official_catalog(&self) -> anyhow::Result<OfficialPluginCatalogSnapshot>;
    async fn download_plugin(
        &self,
        entry: &OfficialPluginSourceEntry,
    ) -> anyhow::Result<DownloadedOfficialPluginPackage>;
    fn trusted_public_keys(&self) -> Vec<plugin_framework::TrustedPublicKey>;
}

#[async_trait]
pub trait PluginRepository: Send + Sync {
    async fn upsert_installation(
        &self,
        input: &UpsertPluginInstallationInput,
    ) -> anyhow::Result<domain::PluginInstallationRecord>;
    async fn get_installation(
        &self,
        installation_id: Uuid,
    ) -> anyhow::Result<Option<domain::PluginInstallationRecord>>;
    async fn list_installations(&self) -> anyhow::Result<Vec<domain::PluginInstallationRecord>>;
    async fn delete_installation(&self, installation_id: Uuid) -> anyhow::Result<()>;
    async fn list_pending_restart_host_extensions(
        &self,
    ) -> anyhow::Result<Vec<domain::PluginInstallationRecord>>;
    async fn update_desired_state(
        &self,
        input: &UpdatePluginDesiredStateInput,
    ) -> anyhow::Result<domain::PluginInstallationRecord>;
    async fn update_artifact_snapshot(
        &self,
        input: &UpdatePluginArtifactSnapshotInput,
    ) -> anyhow::Result<domain::PluginInstallationRecord>;
    async fn update_runtime_snapshot(
        &self,
        input: &UpdatePluginRuntimeSnapshotInput,
    ) -> anyhow::Result<domain::PluginInstallationRecord>;
    async fn create_assignment(
        &self,
        input: &CreatePluginAssignmentInput,
    ) -> anyhow::Result<domain::PluginAssignmentRecord>;
    async fn list_assignments(
        &self,
        workspace_id: Uuid,
    ) -> anyhow::Result<Vec<domain::PluginAssignmentRecord>>;
    async fn create_task(
        &self,
        input: &CreatePluginTaskInput,
    ) -> anyhow::Result<domain::PluginTaskRecord>;
    async fn update_task_status(
        &self,
        input: &UpdatePluginTaskStatusInput,
    ) -> anyhow::Result<domain::PluginTaskRecord>;
    async fn get_task(&self, task_id: Uuid) -> anyhow::Result<Option<domain::PluginTaskRecord>>;
    async fn list_tasks(&self) -> anyhow::Result<Vec<domain::PluginTaskRecord>>;
}

#[derive(Debug, Clone)]
pub struct NodeContributionRegistryInput {
    pub contribution_code: String,
    pub node_shell: String,
    pub category: String,
    pub title: String,
    pub description: String,
    pub icon: String,
    pub schema_ui: serde_json::Value,
    pub schema_version: String,
    pub output_schema: serde_json::Value,
    pub required_auth: Vec<String>,
    pub visibility: String,
    pub experimental: bool,
    pub dependency_installation_kind: String,
    pub dependency_plugin_version_range: String,
}

#[derive(Debug, Clone)]
pub struct ReplaceInstallationNodeContributionsInput {
    pub installation_id: Uuid,
    pub provider_code: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub entries: Vec<NodeContributionRegistryInput>,
}

#[async_trait]
pub trait NodeContributionRepository: Send + Sync {
    async fn replace_installation_node_contributions(
        &self,
        input: &ReplaceInstallationNodeContributionsInput,
    ) -> anyhow::Result<()>;
    async fn list_node_contributions(
        &self,
        workspace_id: Uuid,
    ) -> anyhow::Result<Vec<domain::NodeContributionRegistryEntry>>;
}
#[derive(Debug, Clone)]
pub struct CreatePluginWorkerLeaseInput {
    pub installation_id: Uuid,
    pub worker_key: String,
    pub status: domain::PluginWorkerStatus,
}

#[async_trait]
pub trait PluginWorkerRepository: Send + Sync {
    async fn create_worker_lease(
        &self,
        input: &CreatePluginWorkerLeaseInput,
    ) -> anyhow::Result<domain::PluginWorkerLeaseRecord>;
}
