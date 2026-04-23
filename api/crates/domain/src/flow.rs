use serde::{Deserialize, Serialize};
use serde_json::json;
use time::OffsetDateTime;
use uuid::Uuid;

pub const FLOW_SCHEMA_VERSION: &str = "1flowbase.flow/v1";
pub const FLOW_AUTOSAVE_INTERVAL_SECONDS: u16 = 30;
pub const FLOW_HISTORY_LIMIT: usize = 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlowChangeKind {
    Layout,
    Logical,
}

impl FlowChangeKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Layout => "layout",
            Self::Logical => "logical",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlowVersionTrigger {
    Autosave,
    Restore,
}

impl FlowVersionTrigger {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Autosave => "autosave",
            Self::Restore => "restore",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowRecord {
    pub id: Uuid,
    pub application_id: Uuid,
    pub created_by: Uuid,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowDraftRecord {
    pub id: Uuid,
    pub flow_id: Uuid,
    pub schema_version: String,
    pub document: serde_json::Value,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowVersionRecord {
    pub id: Uuid,
    pub flow_id: Uuid,
    pub sequence: i64,
    pub trigger: FlowVersionTrigger,
    pub change_kind: FlowChangeKind,
    pub summary: String,
    pub document: serde_json::Value,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlowEditorState {
    pub flow: FlowRecord,
    pub draft: FlowDraftRecord,
    pub versions: Vec<FlowVersionRecord>,
    pub autosave_interval_seconds: u16,
}

pub fn default_flow_document(flow_id: Uuid) -> serde_json::Value {
    json!({
        "schemaVersion": FLOW_SCHEMA_VERSION,
        "meta": {
            "flowId": flow_id.to_string(),
            "name": "Untitled agentFlow",
            "description": "",
            "tags": [],
        },
        "graph": {
            "nodes": [
                {
                    "id": "node-start",
                    "type": "start",
                    "alias": "Start",
                    "description": "",
                    "containerId": serde_json::Value::Null,
                    "position": { "x": 80, "y": 220 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {},
                    "outputs": [{ "key": "query", "title": "用户输入", "valueType": "string" }],
                },
                {
                    "id": "node-llm",
                    "type": "llm",
                    "alias": "LLM",
                    "description": "",
                    "containerId": serde_json::Value::Null,
                    "position": { "x": 360, "y": 220 },
                    "configVersion": 1,
                    "config": {
                        "model_provider": {
                            "provider_code": "",
                            "source_instance_id": "",
                            "model_id": ""
                        },
                        "model": "",
                        "temperature": 0.7
                    },
                    "bindings": {
                        "user_prompt": { "kind": "selector", "value": ["node-start", "query"] },
                    },
                    "outputs": [{ "key": "text", "title": "模型输出", "valueType": "string" }],
                },
                {
                    "id": "node-answer",
                    "type": "answer",
                    "alias": "Answer",
                    "description": "",
                    "containerId": serde_json::Value::Null,
                    "position": { "x": 640, "y": 220 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {
                        "answer_template": { "kind": "selector", "value": ["node-llm", "text"] },
                    },
                    "outputs": [{ "key": "answer", "title": "对话输出", "valueType": "string" }],
                },
            ],
            "edges": [
                {
                    "id": "edge-start-llm",
                    "source": "node-start",
                    "target": "node-llm",
                    "sourceHandle": serde_json::Value::Null,
                    "targetHandle": serde_json::Value::Null,
                    "containerId": serde_json::Value::Null,
                    "points": [],
                },
                {
                    "id": "edge-llm-answer",
                    "source": "node-llm",
                    "target": "node-answer",
                    "sourceHandle": serde_json::Value::Null,
                    "targetHandle": serde_json::Value::Null,
                    "containerId": serde_json::Value::Null,
                    "points": [],
                },
            ],
        },
        "editor": {
            "viewport": { "x": 0, "y": 0, "zoom": 1 },
            "annotations": [],
            "activeContainerPath": [],
        },
    })
}
