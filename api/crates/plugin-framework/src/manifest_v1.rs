use serde::Deserialize;
use serde_json::Value;

use crate::{
    capability_kind::PluginConsumptionKind,
    error::{FrameworkResult, PluginFrameworkError},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginExecutionMode {
    InProcess,
    ProcessPerCall,
    DeclarativeOnly,
}

impl PluginExecutionMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::InProcess => "in_process",
            Self::ProcessPerCall => "process_per_call",
            Self::DeclarativeOnly => "declarative_only",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginPermissionManifest {
    pub network: String,
    pub secrets: String,
    pub storage: String,
    pub mcp: String,
    pub subprocess: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct PluginRuntimeLimits {
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub memory_bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginRuntimeManifest {
    pub protocol: String,
    pub entry: String,
    #[serde(default)]
    pub limits: PluginRuntimeLimits,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub struct NodeContributionDependencyManifest {
    pub installation_kind: String,
    pub plugin_version_range: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NodeContributionManifest {
    pub contribution_code: String,
    pub node_shell: String,
    pub category: String,
    pub title: String,
    pub description: String,
    pub icon: String,
    pub schema_ui: Value,
    pub schema_version: String,
    pub output_schema: Value,
    pub required_auth: Vec<String>,
    pub visibility: String,
    pub experimental: bool,
    pub dependency: NodeContributionDependencyManifest,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginManifestV1 {
    pub manifest_version: u32,
    pub plugin_id: String,
    pub version: String,
    pub vendor: String,
    pub display_name: String,
    pub description: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub source_kind: String,
    pub trust_level: String,
    pub consumption_kind: PluginConsumptionKind,
    pub execution_mode: PluginExecutionMode,
    #[serde(default)]
    pub slot_codes: Vec<String>,
    #[serde(default)]
    pub binding_targets: Vec<String>,
    pub selection_mode: String,
    pub minimum_host_version: String,
    pub contract_version: String,
    pub schema_version: String,
    pub permissions: PluginPermissionManifest,
    pub runtime: PluginRuntimeManifest,
    #[serde(default)]
    pub node_contributions: Vec<NodeContributionManifest>,
}

pub fn parse_plugin_manifest(raw: &str) -> FrameworkResult<PluginManifestV1> {
    let manifest: PluginManifestV1 = serde_yaml::from_str(raw)
        .map_err(|error| PluginFrameworkError::invalid_provider_package(error.to_string()))?;
    validate_plugin_manifest(&manifest)?;
    Ok(manifest)
}

fn validate_plugin_manifest(manifest: &PluginManifestV1) -> FrameworkResult<()> {
    if manifest.manifest_version != 1 {
        return Err(PluginFrameworkError::invalid_provider_package(
            "manifest_version must be 1",
        ));
    }
    if manifest.schema_version != "1flowbase.plugin.manifest/v1" {
        return Err(PluginFrameworkError::invalid_provider_package(
            "schema_version must be 1flowbase.plugin.manifest/v1",
        ));
    }

    validate_non_empty(&manifest.plugin_id, "plugin_id")?;
    validate_non_empty(&manifest.version, "version")?;
    validate_non_empty(&manifest.vendor, "vendor")?;
    validate_non_empty(&manifest.display_name, "display_name")?;
    validate_non_empty(&manifest.description, "description")?;
    validate_non_empty(&manifest.source_kind, "source_kind")?;
    validate_non_empty(&manifest.trust_level, "trust_level")?;
    validate_non_empty(&manifest.selection_mode, "selection_mode")?;
    validate_non_empty(&manifest.minimum_host_version, "minimum_host_version")?;
    validate_non_empty(&manifest.contract_version, "contract_version")?;
    validate_contract_version(manifest)?;
    validate_allowed(
        &manifest.source_kind,
        "source_kind",
        &[
            "official_registry",
            "mirror_registry",
            "uploaded",
            "filesystem_dropin",
        ],
    )?;
    validate_allowed(
        &manifest.trust_level,
        "trust_level",
        &["verified_official", "checksum_only", "unverified"],
    )?;
    validate_allowed(
        &manifest.selection_mode,
        "selection_mode",
        &["assignment_then_select", "manual_select", "auto_activate"],
    )?;
    validate_non_empty(&manifest.runtime.protocol, "runtime.protocol")?;
    validate_non_empty(&manifest.runtime.entry, "runtime.entry")?;
    validate_allowed(
        &manifest.runtime.protocol,
        "runtime.protocol",
        &["stdio_json", "native_host"],
    )?;
    validate_permission_values(&manifest.permissions)?;
    validate_binding_targets(&manifest.binding_targets)?;

    if manifest.consumption_kind == PluginConsumptionKind::HostExtension
        && manifest
            .binding_targets
            .iter()
            .any(|target| target == "workspace")
    {
        return Err(PluginFrameworkError::invalid_provider_package(
            "host_extension cannot declare workspace binding_targets",
        ));
    }

    if manifest.consumption_kind == PluginConsumptionKind::RuntimeExtension
        && (manifest.binding_targets.is_empty()
            || manifest
                .binding_targets
                .iter()
                .any(|target| !matches!(target.as_str(), "workspace" | "model")))
    {
        return Err(PluginFrameworkError::invalid_provider_package(
            "runtime_extension binding_targets must only contain workspace or model",
        ));
    }

    if manifest.consumption_kind == PluginConsumptionKind::CapabilityPlugin
        && manifest.node_contributions.is_empty()
    {
        return Err(PluginFrameworkError::invalid_provider_package(
            "capability_plugin must declare node_contributions",
        ));
    }

    for node_contribution in &manifest.node_contributions {
        validate_non_empty(
            &node_contribution.contribution_code,
            "node_contributions[].contribution_code",
        )?;
        validate_non_empty(
            &node_contribution.node_shell,
            "node_contributions[].node_shell",
        )?;
        validate_non_empty(
            &node_contribution.category,
            "node_contributions[].category",
        )?;
        validate_non_empty(&node_contribution.title, "node_contributions[].title")?;
        validate_non_empty(
            &node_contribution.description,
            "node_contributions[].description",
        )?;
        validate_non_empty(&node_contribution.icon, "node_contributions[].icon")?;
        validate_non_empty(
            &node_contribution.schema_version,
            "node_contributions[].schema_version",
        )?;
        validate_allowed(
            &node_contribution.node_shell,
            "node_contributions[].node_shell",
            &["action"],
        )?;
        validate_allowed(
            &node_contribution.schema_version,
            "node_contributions[].schema_version",
            &["1flowbase.node-contribution/v1"],
        )?;
        validate_required_auth(&node_contribution.required_auth)?;
        validate_allowed(
            &node_contribution.visibility,
            "node_contributions[].visibility",
            &["public"],
        )?;
        validate_allowed(
            &node_contribution.dependency.installation_kind,
            "node_contributions[].dependency.installation_kind",
            &["optional", "required"],
        )?;
        validate_non_empty(
            &node_contribution.dependency.installation_kind,
            "node_contributions[].dependency.installation_kind",
        )?;
        validate_non_empty(
            &node_contribution.dependency.plugin_version_range,
            "node_contributions[].dependency.plugin_version_range",
        )?;
        if node_contribution.schema_ui.is_null() {
            return Err(PluginFrameworkError::invalid_provider_package(
                "node_contributions[].schema_ui cannot be null",
            ));
        }
        if node_contribution.output_schema.is_null() {
            return Err(PluginFrameworkError::invalid_provider_package(
                "node_contributions[].output_schema cannot be null",
            ));
        }
    }

    Ok(())
}

fn validate_non_empty(value: &str, field: &str) -> FrameworkResult<()> {
    if value.trim().is_empty() {
        return Err(PluginFrameworkError::invalid_provider_package(format!(
            "{field} cannot be empty"
        )));
    }
    Ok(())
}

fn validate_allowed(value: &str, field: &str, allowed: &[&str]) -> FrameworkResult<()> {
    if allowed.iter().any(|candidate| value == *candidate) {
        return Ok(());
    }

    Err(PluginFrameworkError::invalid_provider_package(format!(
        "{field} must be one of {}",
        allowed.join(", ")
    )))
}

fn validate_binding_targets(binding_targets: &[String]) -> FrameworkResult<()> {
    for binding_target in binding_targets {
        validate_allowed(
            binding_target,
            "binding_targets[]",
            &["workspace", "model", "tenant"],
        )?;
    }
    Ok(())
}

fn validate_permission_values(permissions: &PluginPermissionManifest) -> FrameworkResult<()> {
    validate_allowed(&permissions.network, "permissions.network", &["none", "outbound_only"])?;
    validate_allowed(
        &permissions.secrets,
        "permissions.secrets",
        &["none", "provider_instance_only"],
    )?;
    validate_allowed(&permissions.storage, "permissions.storage", &["none", "host_managed"])?;
    validate_allowed(&permissions.mcp, "permissions.mcp", &["none"])?;
    validate_allowed(&permissions.subprocess, "permissions.subprocess", &["deny"])?;
    Ok(())
}

fn validate_required_auth(required_auth: &[String]) -> FrameworkResult<()> {
    for entry in required_auth {
        validate_allowed(
            entry,
            "node_contributions[].required_auth[]",
            &["provider_instance"],
        )?;
    }
    Ok(())
}

fn validate_contract_version(manifest: &PluginManifestV1) -> FrameworkResult<()> {
    let expected = match manifest.consumption_kind {
        PluginConsumptionKind::HostExtension => "1flowbase.host_extension/v1",
        PluginConsumptionKind::RuntimeExtension => "1flowbase.provider/v1",
        PluginConsumptionKind::CapabilityPlugin => "1flowbase.capability/v1",
    };

    if manifest.contract_version == expected {
        return Ok(());
    }

    Err(PluginFrameworkError::invalid_provider_package(format!(
        "contract_version must be {expected} for {}",
        manifest.consumption_kind.as_str()
    )))
}
