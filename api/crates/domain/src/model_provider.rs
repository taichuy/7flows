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
pub enum PluginTaskStatus {
    Pending,
    Running,
    Success,
    Failed,
    Canceled,
    TimedOut,
}

impl PluginTaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Success => "success",
            Self::Failed => "failed",
            Self::Canceled => "canceled",
            Self::TimedOut => "timed_out",
        }
    }

    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Success | Self::Failed | Self::Canceled | Self::TimedOut
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
    pub verification_status: PluginVerificationStatus,
    pub enabled: bool,
    pub install_path: String,
    pub checksum: Option<String>,
    pub signature_status: Option<String>,
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
    pub last_validated_at: Option<OffsetDateTime>,
    pub last_validation_status: Option<ModelProviderValidationStatus>,
    pub last_validation_message: Option<String>,
    pub created_by: Uuid,
    pub updated_by: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
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
