use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlowRunMode {
    DebugNodePreview,
    DebugFlowRun,
    PublishedApiRun,
}

impl FlowRunMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::DebugNodePreview => "debug_node_preview",
            Self::DebugFlowRun => "debug_flow_run",
            Self::PublishedApiRun => "published_api_run",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallbackTaskStatus {
    Pending,
    Completed,
    Cancelled,
}

impl CallbackTaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlowRunStatus {
    Queued,
    Running,
    WaitingCallback,
    WaitingHuman,
    Paused,
    Succeeded,
    Failed,
    Cancelled,
}

impl FlowRunStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::WaitingCallback => "waiting_callback",
            Self::WaitingHuman => "waiting_human",
            Self::Paused => "paused",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeRunStatus {
    Pending,
    Ready,
    Running,
    Streaming,
    WaitingTool,
    WaitingCallback,
    WaitingHuman,
    Retrying,
    Succeeded,
    Failed,
    Skipped,
}

impl NodeRunStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Ready => "ready",
            Self::Running => "running",
            Self::Streaming => "streaming",
            Self::WaitingTool => "waiting_tool",
            Self::WaitingCallback => "waiting_callback",
            Self::WaitingHuman => "waiting_human",
            Self::Retrying => "retrying",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Skipped => "skipped",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompiledPlanRecord {
    pub id: Uuid,
    pub flow_id: Uuid,
    pub draft_id: Uuid,
    pub schema_version: String,
    pub document_hash: String,
    pub document_updated_at: OffsetDateTime,
    pub plan: serde_json::Value,
    pub created_by: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FlowRunRecord {
    pub id: Uuid,
    pub application_id: Uuid,
    pub flow_id: Uuid,
    pub draft_id: Uuid,
    pub compiled_plan_id: Option<Uuid>,
    pub debug_session_id: String,
    pub flow_schema_version: String,
    pub document_hash: String,
    pub run_mode: FlowRunMode,
    pub target_node_id: Option<String>,
    pub status: FlowRunStatus,
    pub input_payload: serde_json::Value,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub created_by: Uuid,
    pub api_key_id: Option<Uuid>,
    pub publication_version_id: Option<Uuid>,
    pub external_user: Option<String>,
    pub external_conversation_id: Option<String>,
    pub external_trace_id: Option<String>,
    pub compatibility_mode: Option<String>,
    pub idempotency_key: Option<String>,
    pub started_at: OffsetDateTime,
    pub finished_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NodeRunRecord {
    pub id: Uuid,
    pub flow_run_id: Uuid,
    pub node_id: String,
    pub node_type: String,
    pub node_alias: String,
    pub status: NodeRunStatus,
    pub input_payload: serde_json::Value,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub metrics_payload: serde_json::Value,
    pub debug_payload: serde_json::Value,
    pub started_at: OffsetDateTime,
    pub finished_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CheckpointRecord {
    pub id: Uuid,
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub status: String,
    pub reason: String,
    pub locator_payload: serde_json::Value,
    pub variable_snapshot: serde_json::Value,
    pub external_ref_payload: Option<serde_json::Value>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CallbackTaskRecord {
    pub id: Uuid,
    pub flow_run_id: Uuid,
    pub node_run_id: Uuid,
    pub callback_kind: String,
    pub status: CallbackTaskStatus,
    pub request_payload: serde_json::Value,
    pub response_payload: Option<serde_json::Value>,
    pub external_ref_payload: Option<serde_json::Value>,
    pub created_at: OffsetDateTime,
    pub completed_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunEventRecord {
    pub id: Uuid,
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub sequence: i64,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeDebugArtifactRecord {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub application_id: Uuid,
    pub flow_run_id: Option<Uuid>,
    pub node_run_id: Option<Uuid>,
    pub run_event_id: Option<Uuid>,
    pub artifact_kind: String,
    pub content_type: String,
    pub original_size_bytes: i64,
    pub preview_size_bytes: i64,
    pub storage_id: Uuid,
    pub storage_ref: String,
    pub retention_state: String,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DataModelSideEffectReceiptRecord {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub application_id: Uuid,
    pub draft_id: Uuid,
    pub flow_run_id: Uuid,
    pub node_run_id: Uuid,
    pub node_id: String,
    pub action: String,
    pub model_code: String,
    pub record_id: Option<String>,
    pub deleted_id: Option<String>,
    pub affected_count: i64,
    pub idempotency_key: String,
    pub payload_hash: String,
    pub actor_user_id: Uuid,
    pub scope_id: Uuid,
    pub status: String,
    pub output_payload: serde_json::Value,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplicationRunSummary {
    pub id: Uuid,
    pub run_mode: FlowRunMode,
    pub status: FlowRunStatus,
    pub target_node_id: Option<String>,
    pub started_at: OffsetDateTime,
    pub finished_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplicationRunDetail {
    pub flow_run: FlowRunRecord,
    pub node_runs: Vec<NodeRunRecord>,
    pub checkpoints: Vec<CheckpointRecord>,
    pub callback_tasks: Vec<CallbackTaskRecord>,
    pub events: Vec<RunEventRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NodeLastRun {
    pub flow_run: FlowRunRecord,
    pub node_run: NodeRunRecord,
    pub checkpoints: Vec<CheckpointRecord>,
    pub events: Vec<RunEventRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NodeDebugPreviewResult {
    pub flow_run: FlowRunRecord,
    pub node_run: NodeRunRecord,
    pub events: Vec<RunEventRecord>,
    pub preview_payload: serde_json::Value,
}
