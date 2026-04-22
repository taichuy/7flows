use anyhow::{anyhow, Result};
use serde_json::json;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::ports::{
    CompleteFlowRunInput, CompleteNodeRunInput, CreateFlowRunInput, CreateNodeRunInput,
    UpsertCompiledPlanInput,
};

pub(super) fn build_compiled_plan_input(
    actor_user_id: Uuid,
    editor_state: &domain::FlowEditorState,
    compiled_plan: &orchestration_runtime::compiled_plan::CompiledPlan,
) -> Result<UpsertCompiledPlanInput> {
    Ok(UpsertCompiledPlanInput {
        actor_user_id,
        flow_id: editor_state.flow.id,
        flow_draft_id: editor_state.draft.id,
        schema_version: compiled_plan.schema_version.clone(),
        document_updated_at: editor_state.draft.updated_at,
        plan: serde_json::to_value(compiled_plan)?,
    })
}

pub(super) fn build_flow_run_input(
    actor_user_id: Uuid,
    application_id: Uuid,
    editor_state: &domain::FlowEditorState,
    compiled_record: &domain::CompiledPlanRecord,
    command: &crate::orchestration_runtime::StartNodeDebugPreviewCommand,
    started_at: OffsetDateTime,
) -> CreateFlowRunInput {
    CreateFlowRunInput {
        actor_user_id,
        application_id,
        flow_id: editor_state.flow.id,
        flow_draft_id: editor_state.draft.id,
        compiled_plan_id: compiled_record.id,
        run_mode: domain::FlowRunMode::DebugNodePreview,
        target_node_id: Some(command.node_id.clone()),
        status: domain::FlowRunStatus::Running,
        input_payload: command.input_payload.clone(),
        started_at,
    }
}

pub(super) fn build_node_run_input(
    flow_run_id: Uuid,
    compiled_plan: &orchestration_runtime::compiled_plan::CompiledPlan,
    target_node_id: &str,
    preview: &orchestration_runtime::preview_executor::NodePreviewOutcome,
    started_at: OffsetDateTime,
) -> Result<CreateNodeRunInput> {
    let node = compiled_plan
        .nodes
        .get(target_node_id)
        .ok_or_else(|| anyhow!("target node not found in compiled plan: {target_node_id}"))?;

    Ok(CreateNodeRunInput {
        flow_run_id,
        node_id: node.node_id.clone(),
        node_type: node.node_type.clone(),
        node_alias: node.alias.clone(),
        status: domain::NodeRunStatus::Running,
        input_payload: json!(preview.resolved_inputs),
        started_at,
    })
}

pub(super) fn build_complete_node_run_input(
    node_run: &domain::NodeRunRecord,
    preview: &orchestration_runtime::preview_executor::NodePreviewOutcome,
    finished_at: OffsetDateTime,
) -> CompleteNodeRunInput {
    CompleteNodeRunInput {
        node_run_id: node_run.id,
        status: if preview.is_failed() {
            domain::NodeRunStatus::Failed
        } else {
            domain::NodeRunStatus::Succeeded
        },
        output_payload: preview.as_payload(),
        error_payload: preview.error_payload.clone(),
        metrics_payload: json!({
            "output_contract_count": preview.output_contract.len(),
            "provider_events": preview.provider_events.len(),
            "runtime": preview.metrics_payload,
        }),
        finished_at,
    }
}

pub(super) fn build_complete_flow_run_input(
    flow_run: &domain::FlowRunRecord,
    preview: &orchestration_runtime::preview_executor::NodePreviewOutcome,
    finished_at: OffsetDateTime,
) -> CompleteFlowRunInput {
    CompleteFlowRunInput {
        flow_run_id: flow_run.id,
        status: if preview.is_failed() {
            domain::FlowRunStatus::Failed
        } else {
            domain::FlowRunStatus::Succeeded
        },
        output_payload: preview.as_payload(),
        error_payload: preview.error_payload.clone(),
        finished_at,
    }
}
