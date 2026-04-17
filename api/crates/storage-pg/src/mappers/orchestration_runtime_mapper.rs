use anyhow::{anyhow, Result};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct StoredCompiledPlanRow {
    pub id: Uuid,
    pub flow_id: Uuid,
    pub flow_draft_id: Uuid,
    pub schema_version: String,
    pub document_updated_at: OffsetDateTime,
    pub plan: serde_json::Value,
    pub created_by: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct StoredFlowRunRow {
    pub id: Uuid,
    pub application_id: Uuid,
    pub flow_id: Uuid,
    pub flow_draft_id: Uuid,
    pub compiled_plan_id: Uuid,
    pub run_mode: String,
    pub target_node_id: Option<String>,
    pub status: String,
    pub input_payload: serde_json::Value,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub created_by: Uuid,
    pub started_at: OffsetDateTime,
    pub finished_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct StoredNodeRunRow {
    pub id: Uuid,
    pub flow_run_id: Uuid,
    pub node_id: String,
    pub node_type: String,
    pub node_alias: String,
    pub status: String,
    pub input_payload: serde_json::Value,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub metrics_payload: serde_json::Value,
    pub started_at: OffsetDateTime,
    pub finished_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct StoredCheckpointRow {
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

#[derive(Debug, Clone)]
pub struct StoredRunEventRow {
    pub id: Uuid,
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub sequence: i64,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct StoredApplicationRunSummaryRow {
    pub id: Uuid,
    pub run_mode: String,
    pub status: String,
    pub target_node_id: Option<String>,
    pub started_at: OffsetDateTime,
    pub finished_at: Option<OffsetDateTime>,
}

pub struct PgOrchestrationRuntimeMapper;

impl PgOrchestrationRuntimeMapper {
    pub fn to_compiled_plan_record(row: StoredCompiledPlanRow) -> domain::CompiledPlanRecord {
        domain::CompiledPlanRecord {
            id: row.id,
            flow_id: row.flow_id,
            draft_id: row.flow_draft_id,
            schema_version: row.schema_version,
            document_updated_at: row.document_updated_at,
            plan: row.plan,
            created_by: row.created_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }

    pub fn to_flow_run_record(row: StoredFlowRunRow) -> Result<domain::FlowRunRecord> {
        Ok(domain::FlowRunRecord {
            id: row.id,
            application_id: row.application_id,
            flow_id: row.flow_id,
            draft_id: row.flow_draft_id,
            compiled_plan_id: row.compiled_plan_id,
            run_mode: parse_flow_run_mode(&row.run_mode)?,
            target_node_id: row.target_node_id,
            status: parse_flow_run_status(&row.status)?,
            input_payload: row.input_payload,
            output_payload: row.output_payload,
            error_payload: row.error_payload,
            created_by: row.created_by,
            started_at: row.started_at,
            finished_at: row.finished_at,
            created_at: row.created_at,
        })
    }

    pub fn to_node_run_record(row: StoredNodeRunRow) -> Result<domain::NodeRunRecord> {
        Ok(domain::NodeRunRecord {
            id: row.id,
            flow_run_id: row.flow_run_id,
            node_id: row.node_id,
            node_type: row.node_type,
            node_alias: row.node_alias,
            status: parse_node_run_status(&row.status)?,
            input_payload: row.input_payload,
            output_payload: row.output_payload,
            error_payload: row.error_payload,
            metrics_payload: row.metrics_payload,
            started_at: row.started_at,
            finished_at: row.finished_at,
        })
    }

    pub fn to_checkpoint_record(row: StoredCheckpointRow) -> domain::CheckpointRecord {
        domain::CheckpointRecord {
            id: row.id,
            flow_run_id: row.flow_run_id,
            node_run_id: row.node_run_id,
            status: row.status,
            reason: row.reason,
            locator_payload: row.locator_payload,
            variable_snapshot: row.variable_snapshot,
            external_ref_payload: row.external_ref_payload,
            created_at: row.created_at,
        }
    }

    pub fn to_run_event_record(row: StoredRunEventRow) -> domain::RunEventRecord {
        domain::RunEventRecord {
            id: row.id,
            flow_run_id: row.flow_run_id,
            node_run_id: row.node_run_id,
            sequence: row.sequence,
            event_type: row.event_type,
            payload: row.payload,
            created_at: row.created_at,
        }
    }

    pub fn to_application_run_summary(
        row: StoredApplicationRunSummaryRow,
    ) -> Result<domain::ApplicationRunSummary> {
        Ok(domain::ApplicationRunSummary {
            id: row.id,
            run_mode: parse_flow_run_mode(&row.run_mode)?,
            status: parse_flow_run_status(&row.status)?,
            target_node_id: row.target_node_id,
            started_at: row.started_at,
            finished_at: row.finished_at,
        })
    }
}

pub fn parse_flow_run_mode(value: &str) -> Result<domain::FlowRunMode> {
    match value {
        "debug_node_preview" => Ok(domain::FlowRunMode::DebugNodePreview),
        _ => Err(anyhow!("unknown flow run mode: {value}")),
    }
}

pub fn parse_flow_run_status(value: &str) -> Result<domain::FlowRunStatus> {
    match value {
        "queued" => Ok(domain::FlowRunStatus::Queued),
        "running" => Ok(domain::FlowRunStatus::Running),
        "waiting_callback" => Ok(domain::FlowRunStatus::WaitingCallback),
        "waiting_human" => Ok(domain::FlowRunStatus::WaitingHuman),
        "paused" => Ok(domain::FlowRunStatus::Paused),
        "succeeded" => Ok(domain::FlowRunStatus::Succeeded),
        "failed" => Ok(domain::FlowRunStatus::Failed),
        "cancelled" => Ok(domain::FlowRunStatus::Cancelled),
        _ => Err(anyhow!("unknown flow run status: {value}")),
    }
}

pub fn parse_node_run_status(value: &str) -> Result<domain::NodeRunStatus> {
    match value {
        "pending" => Ok(domain::NodeRunStatus::Pending),
        "ready" => Ok(domain::NodeRunStatus::Ready),
        "running" => Ok(domain::NodeRunStatus::Running),
        "streaming" => Ok(domain::NodeRunStatus::Streaming),
        "waiting_tool" => Ok(domain::NodeRunStatus::WaitingTool),
        "waiting_callback" => Ok(domain::NodeRunStatus::WaitingCallback),
        "waiting_human" => Ok(domain::NodeRunStatus::WaitingHuman),
        "retrying" => Ok(domain::NodeRunStatus::Retrying),
        "succeeded" => Ok(domain::NodeRunStatus::Succeeded),
        "failed" => Ok(domain::NodeRunStatus::Failed),
        "skipped" => Ok(domain::NodeRunStatus::Skipped),
        _ => Err(anyhow!("unknown node run status: {value}")),
    }
}
