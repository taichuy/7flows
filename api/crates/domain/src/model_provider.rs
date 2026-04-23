use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginVerificationStatus {
    Pending,
    Valid,
    Invalid,
}

impl PluginVerificationStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Valid => "valid",
            Self::Invalid => "invalid",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginTaskKind {
    Install,
    Upgrade,
    Uninstall,
    Enable,
    Disable,
    Assign,
    Unassign,
    SwitchVersion,
}

impl PluginTaskKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Install => "install",
            Self::Upgrade => "upgrade",
            Self::Uninstall => "uninstall",
            Self::Enable => "enable",
            Self::Disable => "disable",
            Self::Assign => "assign",
            Self::Unassign => "unassign",
            Self::SwitchVersion => "switch_version",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginDesiredState {
    Disabled,
    PendingRestart,
    ActiveRequested,
}

impl PluginDesiredState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::PendingRestart => "pending_restart",
            Self::ActiveRequested => "active_requested",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginArtifactStatus {
    Missing,
    Staged,
    Ready,
    Corrupted,
    InstallIncomplete,
}

impl PluginArtifactStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Missing => "missing",
            Self::Staged => "staged",
            Self::Ready => "ready",
            Self::Corrupted => "corrupted",
            Self::InstallIncomplete => "install_incomplete",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginRuntimeStatus {
    Inactive,
    Active,
    LoadFailed,
}

impl PluginRuntimeStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Inactive => "inactive",
            Self::Active => "active",
            Self::LoadFailed => "load_failed",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginAvailabilityStatus {
    Disabled,
    PendingRestart,
    ArtifactMissing,
    InstallIncomplete,
    LoadFailed,
    Available,
}

impl PluginAvailabilityStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::PendingRestart => "pending_restart",
            Self::ArtifactMissing => "artifact_missing",
            Self::InstallIncomplete => "install_incomplete",
            Self::LoadFailed => "load_failed",
            Self::Available => "available",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginTaskStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Canceled,
    TimedOut,
}

impl PluginTaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Canceled => "canceled",
            Self::TimedOut => "timed_out",
        }
    }

    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Succeeded | Self::Failed | Self::Canceled | Self::TimedOut
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginInstallationRecord {
    pub id: Uuid,
    pub provider_code: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub contract_version: String,
    pub protocol: String,
    pub display_name: String,
    pub source_kind: String,
    pub trust_level: String,
    pub verification_status: PluginVerificationStatus,
    pub desired_state: PluginDesiredState,
    pub artifact_status: PluginArtifactStatus,
    pub runtime_status: PluginRuntimeStatus,
    pub availability_status: PluginAvailabilityStatus,
    pub package_path: Option<String>,
    pub installed_path: String,
    pub checksum: Option<String>,
    pub manifest_fingerprint: Option<String>,
    pub signature_status: Option<String>,
    pub signature_algorithm: Option<String>,
    pub signing_key_id: Option<String>,
    pub last_load_error: Option<String>,
    pub metadata_json: serde_json::Value,
    pub created_by: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginAssignmentRecord {
    pub id: Uuid,
    pub installation_id: Uuid,
    pub workspace_id: Uuid,
    pub provider_code: String,
    pub assigned_by: Uuid,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginTaskRecord {
    pub id: Uuid,
    pub installation_id: Option<Uuid>,
    pub workspace_id: Option<Uuid>,
    pub provider_code: String,
    pub task_kind: PluginTaskKind,
    pub status: PluginTaskStatus,
    pub status_message: Option<String>,
    pub detail_json: serde_json::Value,
    pub created_by: Option<Uuid>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
    pub finished_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelProviderInstanceStatus {
    Draft,
    Ready,
    Invalid,
    Disabled,
}

impl ModelProviderInstanceStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Ready => "ready",
            Self::Invalid => "invalid",
            Self::Disabled => "disabled",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelProviderValidationStatus {
    Succeeded,
    Failed,
}

impl ModelProviderValidationStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelProviderDiscoveryMode {
    Static,
    Dynamic,
    Hybrid,
}

impl ModelProviderDiscoveryMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Static => "static",
            Self::Dynamic => "dynamic",
            Self::Hybrid => "hybrid",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelProviderCatalogRefreshStatus {
    Idle,
    Refreshing,
    Ready,
    Failed,
}

impl ModelProviderCatalogRefreshStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Refreshing => "refreshing",
            Self::Ready => "ready",
            Self::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelProviderCatalogSource {
    Static,
    Dynamic,
    Hybrid,
}

impl ModelProviderCatalogSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Static => "static",
            Self::Dynamic => "dynamic",
            Self::Hybrid => "hybrid",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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
pub struct ModelProviderConfiguredModel {
    pub model_id: String,
    pub enabled: bool,
    pub context_window_override_tokens: Option<u64>,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelProviderMainInstanceRecord {
    pub workspace_id: Uuid,
    pub provider_code: String,
    pub auto_include_new_instances: bool,
    pub created_by: Uuid,
    pub updated_by: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelProviderInstanceRecord {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub installation_id: Uuid,
    pub provider_code: String,
    pub protocol: String,
    pub display_name: String,
    pub status: ModelProviderInstanceStatus,
    pub config_json: serde_json::Value,
    pub configured_models: Vec<ModelProviderConfiguredModel>,
    pub enabled_model_ids: Vec<String>,
    pub included_in_main: bool,
    pub created_by: Uuid,
    pub updated_by: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelProviderPreviewSessionRecord {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub actor_user_id: Uuid,
    pub installation_id: Option<Uuid>,
    pub instance_id: Option<Uuid>,
    pub config_fingerprint: String,
    pub models_json: serde_json::Value,
    pub expires_at: OffsetDateTime,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelProviderCatalogCacheRecord {
    pub provider_instance_id: Uuid,
    pub model_discovery_mode: ModelProviderDiscoveryMode,
    pub refresh_status: ModelProviderCatalogRefreshStatus,
    pub source: ModelProviderCatalogSource,
    pub models_json: serde_json::Value,
    pub last_error_message: Option<String>,
    pub refreshed_at: Option<OffsetDateTime>,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelProviderSecretRecord {
    pub provider_instance_id: Uuid,
    pub encrypted_secret_json: serde_json::Value,
    pub secret_version: i32,
    pub updated_at: OffsetDateTime,
}
