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
}
