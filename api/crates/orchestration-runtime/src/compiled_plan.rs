use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledPlan {
    pub flow_id: Uuid,
    pub source_draft_id: String,
    pub schema_version: String,
    pub topological_order: Vec<String>,
    pub nodes: BTreeMap<String, CompiledNode>,
    #[serde(default)]
    pub compile_issues: Vec<CompileIssue>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledNode {
    pub node_id: String,
    pub node_type: String,
    pub alias: String,
    pub container_id: Option<String>,
    pub dependency_node_ids: Vec<String>,
    pub downstream_node_ids: Vec<String>,
    pub bindings: BTreeMap<String, CompiledBinding>,
    pub outputs: Vec<CompiledOutput>,
    pub config: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugin_runtime: Option<CompiledPluginRuntime>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub llm_runtime: Option<CompiledLlmRuntime>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code_runtime: Option<CompiledCodeRuntime>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledBinding {
    pub kind: String,
    pub raw_value: serde_json::Value,
    pub selector_paths: Vec<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledOutput {
    pub key: String,
    pub title: String,
    pub value_type: String,
    pub selector: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LlmRoutingMode {
    FixedModel,
    FailoverQueue,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledLlmRouting {
    pub routing_mode: LlmRoutingMode,
    pub fixed_model_target: Option<serde_json::Value>,
    pub queue_template_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub queue_snapshot_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub queue_targets: Vec<CompiledLlmRouteTarget>,
    pub context_policy: serde_json::Value,
    pub stream_policy: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledLlmRouteTarget {
    pub provider_instance_id: String,
    pub provider_code: String,
    pub protocol: String,
    pub upstream_model_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledLlmRuntime {
    pub provider_instance_id: String,
    pub provider_code: String,
    pub protocol: String,
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub routing: Option<CompiledLlmRouting>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledCodeRuntime {
    pub language: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_ref: Option<String>,
    pub entrypoint: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub imports: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub dependencies: Vec<CompiledCodeDependency>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledCodeDependency {
    pub alias: String,
    pub target: String,
    pub artifact_path: String,
    pub artifact_hash: String,
    pub integrity: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledPluginRuntime {
    pub installation_id: Uuid,
    pub plugin_unique_identifier: String,
    pub package_id: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub contribution_code: String,
    pub node_shell: String,
    pub schema_version: String,
    pub contribution_checksum: String,
    pub compiled_contribution_hash: String,
    pub output_schema_snapshot: Vec<CompiledOutput>,
    pub side_effect_policy: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompileIssueCode {
    MissingProviderInstance,
    ProviderInstanceNotFound,
    ProviderInstanceNotReady,
    MissingModel,
    ModelNotAvailable,
    MissingPluginId,
    MissingPluginVersion,
    MissingContributionCode,
    MissingNodeShell,
    MissingSchemaVersion,
    MissingPluginUniqueIdentifier,
    MissingPackageId,
    MissingContributionChecksum,
    MissingCompiledContributionHash,
    MissingOutputSchemaSnapshot,
    UnsupportedPluginContributionSchemaVersion,
    MissingPluginContribution,
    PluginContributionDependencyNotReady,
    PluginContributionChecksumMismatch,
    PluginContributionOutputSchemaMismatch,
    JsDependencyImportNotEnabled,
    InvalidJsDependencyImport,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompileIssue {
    pub node_id: String,
    pub code: CompileIssueCode,
    pub message: String,
}
