use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

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

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Default)]
#[serde(deny_unknown_fields)]
pub struct NodeContributionDependencyManifest {
    pub installation_kind: String,
    pub plugin_version_range: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct JsDependencyPermissionsManifest {
    #[serde(default = "default_dependency_permission")]
    pub network: String,
    #[serde(default = "default_dependency_permission")]
    pub filesystem: String,
    #[serde(default = "default_dependency_permission")]
    pub env: String,
}

fn default_dependency_permission() -> String {
    "none".to_string()
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct JsDependencyManifest {
    pub alias: String,
    pub package: String,
    pub version: String,
    pub targets: Vec<String>,
    #[serde(default)]
    pub artifacts: BTreeMap<String, String>,
    pub integrity: String,
    #[serde(default)]
    pub permissions: JsDependencyPermissionsManifest,
    #[serde(default)]
    pub native_addon: bool,
    #[serde(default)]
    pub lifecycle_scripts: bool,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
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
    pub side_effect_policy: String,
    #[serde(default)]
    pub infra_contracts: Vec<String>,
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
    #[serde(default)]
    pub js_dependencies: Vec<JsDependencyManifest>,
}

impl PluginManifestV1 {
    pub fn plugin_code(&self) -> FrameworkResult<&str> {
        plugin_code_from_identity(&self.plugin_id, &self.version)
    }

    pub fn versioned_plugin_id(&self) -> FrameworkResult<String> {
        Ok(format!("{}@{}", self.plugin_code()?, self.version))
    }
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
    plugin_code_from_identity(&manifest.plugin_id, &manifest.version)?;
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
    validate_slot_codes(manifest)?;

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
        && !manifest.slot_codes.iter().any(|slot| slot == "node_contribution")
        && !manifest.slot_codes.iter().any(|slot| slot == "js_dependency_pack")
    {
        return Err(PluginFrameworkError::invalid_provider_package(
            "capability_plugin must declare node_contributions or js_dependency_pack",
        ));
    }

    if manifest.slot_codes.iter().any(|slot| slot == "node_contribution") {
        for node_contribution in &manifest.node_contributions {
            validate_non_empty(
                &node_contribution.contribution_code,
                "node_contributions[].contribution_code",
            )?;
            validate_non_empty(
                &node_contribution.node_shell,
                "node_contributions[].node_shell",
            )?;
            validate_non_empty(&node_contribution.category, "node_contributions[].category")?;
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
                &["1flowbase.node-contribution/v2"],
            )?;
            validate_allowed(
                &node_contribution.side_effect_policy,
                "node_contributions[].side_effect_policy",
                &["none", "external_read", "external_write", "durable_write"],
            )?;
            validate_node_contribution_schema_ui(&node_contribution.schema_ui)?;
            validate_node_contribution_output_schema(&node_contribution.output_schema)?;
            validate_node_contribution_infra_contracts(&node_contribution.infra_contracts)?;
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
    }

    if manifest.slot_codes.iter().any(|slot| slot == "js_dependency_pack") {
        validate_js_dependencies(&manifest.js_dependencies)?;
    }

    Ok(())
}

const NODE_CONTRIBUTION_ALLOWED_RENDERERS: &[&str] = &[
    "text",
    "static_select",
    "data_model",
    "data_model_query",
    "llm_model",
    "llm_prompt_messages",
    "llm_response_format",
    "number",
    "selector",
    "selector_list",
    "templated_text",
    "named_bindings",
    "condition_group",
    "state_write",
    "output_contract_definition",
    "start_input_fields",
    "header_alias",
    "header_description",
    "card_eyebrow",
    "card_model",
    "card_description",
    "summary",
    "output_contract",
    "policy_group",
    "relations",
    "runtime_summary",
    "runtime_io",
    "runtime_metadata",
];

const RESERVED_PUBLIC_OUTPUT_KEYS: &[&str] = &[
    "metadata",
    "usage",
    "debug",
    "error",
    "route",
    "attempts",
    "finish_reason",
    "provider_instance_id",
    "provider_code",
    "protocol",
    "model",
    "event_count",
    "queue_snapshot_id",
    "provider_metadata",
    "provider_events",
    "tool_calls",
    "mcp_calls",
    "raw_response_ref",
    "raw_response_refs",
    "raw_ref",
    "raw_refs",
    "context_projection_ref",
    "context_projection_refs",
    "attempt_ref",
    "attempt_refs",
];

const FORBIDDEN_NODE_CONTRIBUTION_INFRA_CONTRACTS: &[&str] = &[
    "cache-store",
    "cache_store",
    "distributed-lock",
    "distributed_lock",
    "event-bus",
    "event_bus",
    "task-queue",
    "task_queue",
    "rate-limit-store",
    "rate_limit_store",
    "storage-durable",
    "storage_durable",
    "storage-ephemeral",
    "storage_ephemeral",
    "storage-object",
    "storage_object",
    "object-storage",
    "object_storage",
];

fn validate_node_contribution_schema_ui(schema_ui: &Value) -> FrameworkResult<()> {
    fn walk(value: &Value) -> FrameworkResult<()> {
        match value {
            Value::Object(object) => {
                for key in object.keys() {
                    if matches!(
                        key.as_str(),
                        "react_panel"
                            | "reactPanel"
                            | "panel_component"
                            | "panelComponent"
                            | "component"
                            | "component_path"
                            | "componentPath"
                            | "module"
                            | "import"
                    ) {
                        return Err(PluginFrameworkError::invalid_provider_package(
                            "node_contributions[].schema_ui cannot declare plugin-provided React panels",
                        ));
                    }
                }

                if let Some(renderer) = object.get("renderer").and_then(Value::as_str) {
                    validate_allowed(
                        renderer,
                        "node_contributions[].schema_ui.renderer",
                        NODE_CONTRIBUTION_ALLOWED_RENDERERS,
                    )
                    .map_err(|_| {
                        PluginFrameworkError::invalid_provider_package(format!(
                            "unknown node contribution renderer: {renderer}"
                        ))
                    })?;
                }

                for child in object.values() {
                    walk(child)?;
                }
            }
            Value::Array(items) => {
                for item in items {
                    walk(item)?;
                }
            }
            _ => {}
        }

        Ok(())
    }

    walk(schema_ui)
}

fn validate_node_contribution_output_schema(output_schema: &Value) -> FrameworkResult<()> {
    let Some(object) = output_schema.as_object() else {
        return Err(PluginFrameworkError::invalid_provider_package(
            "node_contributions[].output_schema must be an object",
        ));
    };

    for bucket in ["metrics", "metric", "errors", "error", "debug"] {
        if object.contains_key(bucket) {
            return Err(PluginFrameworkError::invalid_provider_package(
                "node_contributions[].output_schema cannot declare metrics, error, or debug fields",
            ));
        }
    }

    let Some(outputs) = object.get("outputs").and_then(Value::as_array) else {
        return Err(PluginFrameworkError::invalid_provider_package(
            "node_contributions[].output_schema.outputs must be an array",
        ));
    };

    for output in outputs {
        let key = required_output_schema_string(output, "key")?;
        let _title = required_output_schema_string(output, "title")?;
        let _value_type = required_output_schema_string(output, "valueType")?;

        if key.starts_with("__") || RESERVED_PUBLIC_OUTPUT_KEYS.contains(&key.as_str()) {
            return Err(PluginFrameworkError::invalid_provider_package(format!(
                "reserved public output key `{key}` cannot be declared by node_contributions[].output_schema"
            )));
        }
    }

    Ok(())
}

fn required_output_schema_string(output: &Value, field: &'static str) -> FrameworkResult<String> {
    output
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| {
            PluginFrameworkError::invalid_provider_package(format!(
                "node_contributions[].output_schema.outputs[].{field} cannot be empty"
            ))
        })
}

fn validate_node_contribution_infra_contracts(infra_contracts: &[String]) -> FrameworkResult<()> {
    for contract in infra_contracts {
        if FORBIDDEN_NODE_CONTRIBUTION_INFRA_CONTRACTS.contains(&contract.as_str()) {
            return Err(PluginFrameworkError::invalid_provider_package(format!(
                "capability node contribution cannot request host infrastructure contract `{contract}`"
            )));
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

fn plugin_code_from_identity<'a>(plugin_id: &'a str, version: &str) -> FrameworkResult<&'a str> {
    if let Some((plugin_code, plugin_version)) = plugin_id.split_once('@') {
        if plugin_code.trim().is_empty() || plugin_version.trim().is_empty() {
            return Err(PluginFrameworkError::invalid_provider_package(
                "plugin_id must use a non-empty stable id",
            ));
        }
        if plugin_version != version {
            return Err(PluginFrameworkError::invalid_provider_package(
                "plugin_id version suffix must match version",
            ));
        }
        return Ok(plugin_code);
    }

    if plugin_id.trim().is_empty() {
        return Err(PluginFrameworkError::invalid_provider_package(
            "plugin_id must use a non-empty stable id",
        ));
    }

    Ok(plugin_id)
}

fn validate_allowed(value: &str, field: &str, allowed: &[&str]) -> FrameworkResult<()> {
    if allowed.contains(&value) {
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

fn validate_slot_codes(manifest: &PluginManifestV1) -> FrameworkResult<()> {
    const RUNTIME_EXTENSION_ALLOWED: &[&str] = &[
        "model_provider",
        "embedding_provider",
        "reranker_provider",
        "data_source",
        "data_import_snapshot",
        "file_processor",
        "record_validator",
        "field_computed_value",
    ];
    const HOST_EXTENSION_ALLOWED: &[&str] = &["host_bootstrap"];
    const CAPABILITY_PLUGIN_ALLOWED: &[&str] = &["node_contribution", "js_dependency_pack"];

    let allowed = match manifest.consumption_kind {
        PluginConsumptionKind::HostExtension => HOST_EXTENSION_ALLOWED,
        PluginConsumptionKind::RuntimeExtension => RUNTIME_EXTENSION_ALLOWED,
        PluginConsumptionKind::CapabilityPlugin => CAPABILITY_PLUGIN_ALLOWED,
    };

    for slot in &manifest.slot_codes {
        validate_allowed(slot, "slot_codes[]", allowed)?;
    }

    Ok(())
}

fn validate_js_dependencies(dependencies: &[JsDependencyManifest]) -> FrameworkResult<()> {
    if dependencies.is_empty() {
        return Err(PluginFrameworkError::invalid_provider_package(
            "js_dependency_pack requires at least one js_dependencies entry",
        ));
    }

    let mut seen_alias = HashSet::new();
    for dependency in dependencies {
        validate_non_empty(&dependency.alias, "js_dependencies[].alias")?;
        validate_non_empty(&dependency.package, "js_dependencies[].package")?;
        validate_non_empty(&dependency.version, "js_dependencies[].version")?;

        if dependency.lifecycle_scripts {
            return Err(PluginFrameworkError::invalid_provider_package(
                "js_dependency_pack does not support lifecycle_scripts",
            ));
        }

        if dependency.native_addon {
            return Err(PluginFrameworkError::invalid_provider_package(
                "js_dependency_pack does not support native_addon",
            ));
        }

        if !seen_alias.insert(dependency.alias.clone()) {
            return Err(PluginFrameworkError::invalid_provider_package(format!(
                "duplicate js dependency alias `{}`",
                dependency.alias
            )));
        }

        validate_non_empty(&dependency.integrity, "js_dependencies[].integrity")?;
        if !dependency.integrity.starts_with("sha256-") {
            return Err(PluginFrameworkError::invalid_provider_package(
                "js_dependencies[].integrity must be sha256-*",
            ));
        }

        validate_js_dependency_permissions(&dependency.permissions)?;

        if dependency.targets.is_empty() {
            return Err(PluginFrameworkError::invalid_provider_package(
                "js_dependencies[].targets cannot be empty",
            ));
        }

        for target in &dependency.targets {
            validate_allowed(
                target,
                "js_dependencies[].targets[]",
                &["backend_code"],
            )?;

            let artifact = dependency
                .artifacts
                .get(target)
                .ok_or_else(|| {
                    PluginFrameworkError::invalid_provider_package(
                        "js_dependencies[].artifacts must include each declared target",
                    )
                })?;
            validate_non_empty(artifact, "js_dependencies[].artifacts[target]")?;
        }
    }

    Ok(())
}

fn validate_js_dependency_permissions(
    permissions: &JsDependencyPermissionsManifest,
) -> FrameworkResult<()> {
    validate_allowed(
        &permissions.network,
        "js_dependencies[].permissions.network",
        &["none", "deny", "outbound_only"],
    )?;
    validate_allowed(
        &permissions.filesystem,
        "js_dependencies[].permissions.filesystem",
        &["none", "deny"],
    )?;
    validate_allowed(
        &permissions.env,
        "js_dependencies[].permissions.env",
        &["none", "deny"],
    )?;

    Ok(())
}

fn validate_permission_values(permissions: &PluginPermissionManifest) -> FrameworkResult<()> {
    validate_allowed(
        &permissions.network,
        "permissions.network",
        &["none", "outbound_only"],
    )?;
    validate_allowed(
        &permissions.secrets,
        "permissions.secrets",
        &["none", "provider_instance_only", "host_managed"],
    )?;
    validate_allowed(
        &permissions.storage,
        "permissions.storage",
        &["none", "host_managed"],
    )?;
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
        PluginConsumptionKind::RuntimeExtension => {
            if manifest
                .slot_codes
                .iter()
                .any(|slot| matches!(slot.as_str(), "data_source" | "data_import_snapshot"))
            {
                "1flowbase.data_source/v1"
            } else {
                "1flowbase.provider/v1"
            }
        }
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
