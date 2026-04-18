use std::path::PathBuf;

use uuid::Uuid;

use crate::{
    provider_contract::{ModelDiscoveryMode, ProviderModelDescriptor},
    provider_package::{ProviderConfigField, ProviderPackage},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginInstallationSource {
    Registry,
    Upload,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginVerificationStatus {
    Pending,
    Valid,
    Invalid,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderInstallation {
    pub plugin_id: String,
    pub provider_code: String,
    pub plugin_version: String,
    pub contract_version: String,
    pub protocol: String,
    pub source: PluginInstallationSource,
    pub verification_status: PluginVerificationStatus,
    pub enabled: bool,
    pub install_path: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginTaskKind {
    Install,
    Upgrade,
    Uninstall,
    Enable,
    Disable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginTaskStatus {
    Pending,
    Running,
    Success,
    Failed,
    Canceled,
    TimedOut,
}

impl PluginTaskStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Success | Self::Failed | Self::Canceled | Self::TimedOut
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderPluginTask {
    pub id: Uuid,
    pub plugin_id: String,
    pub kind: PluginTaskKind,
    pub status: PluginTaskStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CatalogRefreshStatus {
    Idle,
    Refreshing,
    Fresh,
    Failed,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProviderModelCatalogCache {
    pub provider_instance_id: Uuid,
    pub discovery_mode: ModelDiscoveryMode,
    pub refresh_status: CatalogRefreshStatus,
    pub models: Vec<ProviderModelDescriptor>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProviderCatalogEntry {
    pub provider_code: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub contract_version: String,
    pub protocol: String,
    pub display_name: String,
    pub icon: Option<String>,
    pub help_url: Option<String>,
    pub form_schema: Vec<ProviderConfigField>,
    pub predefined_models: Vec<ProviderModelDescriptor>,
    pub default_base_url: Option<String>,
    pub download_url: Option<String>,
    pub checksum: Option<String>,
    pub signature_status: Option<String>,
}

impl ProviderCatalogEntry {
    pub fn from_package(package: &ProviderPackage) -> Self {
        Self {
            provider_code: package.provider.provider_code.clone(),
            plugin_id: package.identifier(),
            plugin_version: package.manifest.version.clone(),
            contract_version: package.manifest.contract_version.clone(),
            protocol: package.provider.protocol.clone(),
            display_name: package.manifest.display_name.clone(),
            icon: None,
            help_url: package.provider.help_url.clone(),
            form_schema: package.provider.form_schema.clone(),
            predefined_models: package.predefined_models.clone(),
            default_base_url: package.provider.default_base_url.clone(),
            download_url: None,
            checksum: None,
            signature_status: None,
        }
    }
}
