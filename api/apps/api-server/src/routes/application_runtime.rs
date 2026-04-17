use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use control_plane::{
    application::ApplicationService,
    errors::ControlPlaneError,
    orchestration_runtime::{
        CompleteCallbackTaskCommand, OrchestrationRuntimeService, ResumeFlowRunCommand,
        StartFlowDebugRunCommand, StartNodeDebugPreviewCommand,
    },
    ports::OrchestrationRuntimeRepository,
};
use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    response::ApiSuccess,
};

#[derive(Debug, Deserialize, ToSchema)]
pub struct StartNodeDebugPreviewBody {
    pub input_payload: serde_json::Value,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct StartFlowDebugRunBody {
    pub input_payload: serde_json::Value,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ResumeFlowRunBody {
    pub checkpoint_id: String,
    pub input_payload: serde_json::Value,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CompleteCallbackTaskBody {
    pub response_payload: serde_json::Value,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FlowRunSummaryResponse {
    pub id: String,
    pub run_mode: String,
    pub status: String,
    pub target_node_id: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FlowRunResponse {
    pub id: String,
    pub application_id: String,
    pub flow_id: String,
    pub draft_id: String,
    pub compiled_plan_id: String,
    pub run_mode: String,
    pub status: String,
    pub target_node_id: Option<String>,
    pub input_payload: serde_json::Value,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub created_by: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct NodeRunResponse {
    pub id: String,
    pub flow_run_id: String,
    pub node_id: String,
    pub node_type: String,
    pub node_alias: String,
    pub status: String,
    pub input_payload: serde_json::Value,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub metrics_payload: serde_json::Value,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CheckpointResponse {
    pub id: String,
    pub flow_run_id: String,
    pub node_run_id: Option<String>,
    pub status: String,
    pub reason: String,
    pub locator_payload: serde_json::Value,
    pub variable_snapshot: serde_json::Value,
    pub external_ref_payload: Option<serde_json::Value>,
    pub created_at: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CallbackTaskResponse {
    pub id: String,
    pub flow_run_id: String,
    pub node_run_id: String,
    pub callback_kind: String,
    pub status: String,
    pub request_payload: serde_json::Value,
    pub response_payload: Option<serde_json::Value>,
    pub external_ref_payload: Option<serde_json::Value>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RunEventResponse {
    pub id: String,
    pub flow_run_id: String,
    pub node_run_id: Option<String>,
    pub sequence: i64,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub created_at: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApplicationRunDetailResponse {
    pub flow_run: FlowRunResponse,
    pub node_runs: Vec<NodeRunResponse>,
    pub checkpoints: Vec<CheckpointResponse>,
    pub callback_tasks: Vec<CallbackTaskResponse>,
    pub events: Vec<RunEventResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct NodeLastRunResponse {
    pub flow_run: FlowRunResponse,
    pub node_run: NodeRunResponse,
    pub checkpoints: Vec<CheckpointResponse>,
    pub events: Vec<RunEventResponse>,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route(
            "/applications/:id/orchestration/debug-runs",
            post(start_flow_debug_run),
        )
        .route(
            "/applications/:id/orchestration/runs/:run_id/resume",
            post(resume_flow_run),
        )
        .route(
            "/applications/:id/orchestration/callback-tasks/:callback_task_id/complete",
            post(complete_callback_task),
        )
        .route(
            "/applications/:id/orchestration/nodes/:node_id/debug-runs",
            post(start_node_debug_preview),
        )
        .route("/applications/:id/logs/runs", get(list_application_runs))
        .route(
            "/applications/:id/logs/runs/:run_id",
            get(get_application_run_detail),
        )
        .route(
            "/applications/:id/orchestration/nodes/:node_id/last-run",
            get(get_node_last_run),
        )
}

fn format_time(value: time::OffsetDateTime) -> String {
    value.format(&Rfc3339).unwrap()
}

fn format_optional_time(value: Option<time::OffsetDateTime>) -> Option<String> {
    value.map(format_time)
}

fn to_flow_run_summary_response(summary: domain::ApplicationRunSummary) -> FlowRunSummaryResponse {
    FlowRunSummaryResponse {
        id: summary.id.to_string(),
        run_mode: summary.run_mode.as_str().to_string(),
        status: summary.status.as_str().to_string(),
        target_node_id: summary.target_node_id,
        started_at: format_time(summary.started_at),
        finished_at: format_optional_time(summary.finished_at),
    }
}

fn to_flow_run_response(run: domain::FlowRunRecord) -> FlowRunResponse {
    FlowRunResponse {
        id: run.id.to_string(),
        application_id: run.application_id.to_string(),
        flow_id: run.flow_id.to_string(),
        draft_id: run.draft_id.to_string(),
        compiled_plan_id: run.compiled_plan_id.to_string(),
        run_mode: run.run_mode.as_str().to_string(),
        status: run.status.as_str().to_string(),
        target_node_id: run.target_node_id,
        input_payload: run.input_payload,
        output_payload: run.output_payload,
        error_payload: run.error_payload,
        created_by: run.created_by.to_string(),
        started_at: format_time(run.started_at),
        finished_at: format_optional_time(run.finished_at),
        created_at: format_time(run.created_at),
    }
}

fn to_node_run_response(run: domain::NodeRunRecord) -> NodeRunResponse {
    NodeRunResponse {
        id: run.id.to_string(),
        flow_run_id: run.flow_run_id.to_string(),
        node_id: run.node_id,
        node_type: run.node_type,
        node_alias: run.node_alias,
        status: run.status.as_str().to_string(),
        input_payload: run.input_payload,
        output_payload: run.output_payload,
        error_payload: run.error_payload,
        metrics_payload: run.metrics_payload,
        started_at: format_time(run.started_at),
        finished_at: format_optional_time(run.finished_at),
    }
}

fn to_checkpoint_response(checkpoint: domain::CheckpointRecord) -> CheckpointResponse {
    CheckpointResponse {
        id: checkpoint.id.to_string(),
        flow_run_id: checkpoint.flow_run_id.to_string(),
        node_run_id: checkpoint.node_run_id.map(|value| value.to_string()),
        status: checkpoint.status,
        reason: checkpoint.reason,
        locator_payload: checkpoint.locator_payload,
        variable_snapshot: checkpoint.variable_snapshot,
        external_ref_payload: checkpoint.external_ref_payload,
        created_at: format_time(checkpoint.created_at),
    }
}

fn to_callback_task_response(task: domain::CallbackTaskRecord) -> CallbackTaskResponse {
    CallbackTaskResponse {
        id: task.id.to_string(),
        flow_run_id: task.flow_run_id.to_string(),
        node_run_id: task.node_run_id.to_string(),
        callback_kind: task.callback_kind,
        status: task.status.as_str().to_string(),
        request_payload: task.request_payload,
        response_payload: task.response_payload,
        external_ref_payload: task.external_ref_payload,
        created_at: format_time(task.created_at),
        completed_at: format_optional_time(task.completed_at),
    }
}

fn to_run_event_response(event: domain::RunEventRecord) -> RunEventResponse {
    RunEventResponse {
        id: event.id.to_string(),
        flow_run_id: event.flow_run_id.to_string(),
        node_run_id: event.node_run_id.map(|value| value.to_string()),
        sequence: event.sequence,
        event_type: event.event_type,
        payload: event.payload,
        created_at: format_time(event.created_at),
    }
}

fn to_application_run_detail_response(
    detail: domain::ApplicationRunDetail,
) -> ApplicationRunDetailResponse {
    ApplicationRunDetailResponse {
        flow_run: to_flow_run_response(detail.flow_run),
        node_runs: detail
            .node_runs
            .into_iter()
            .map(to_node_run_response)
            .collect(),
        checkpoints: detail
            .checkpoints
            .into_iter()
            .map(to_checkpoint_response)
            .collect(),
        callback_tasks: detail
            .callback_tasks
            .into_iter()
            .map(to_callback_task_response)
            .collect(),
        events: detail
            .events
            .into_iter()
            .map(to_run_event_response)
            .collect(),
    }
}

fn to_node_last_run_response(last_run: domain::NodeLastRun) -> NodeLastRunResponse {
    NodeLastRunResponse {
        flow_run: to_flow_run_response(last_run.flow_run),
        node_run: to_node_run_response(last_run.node_run),
        checkpoints: last_run
            .checkpoints
            .into_iter()
            .map(to_checkpoint_response)
            .collect(),
        events: last_run
            .events
            .into_iter()
            .map(to_run_event_response)
            .collect(),
    }
}

async fn ensure_application_visible(
    state: &Arc<ApiState>,
    actor_user_id: Uuid,
    application_id: Uuid,
) -> Result<(), ApiError> {
    ApplicationService::new(state.store.clone())
        .get_application(actor_user_id, application_id)
        .await?;
    Ok(())
}

#[utoipa::path(
    post,
    path = "/api/console/applications/{id}/orchestration/debug-runs",
    request_body = StartFlowDebugRunBody,
    params(
        ("id" = String, Path, description = "Application id")
    ),
    responses(
        (status = 201, body = ApplicationRunDetailResponse),
        (status = 400, body = crate::error_response::ErrorBody),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody),
        (status = 404, body = crate::error_response::ErrorBody)
    )
)]
pub async fn start_flow_debug_run(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<StartFlowDebugRunBody>,
) -> Result<(StatusCode, Json<ApiSuccess<ApplicationRunDetailResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let detail = OrchestrationRuntimeService::new(state.store.clone())
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: context.user.id,
            application_id: id,
            input_payload: body.input_payload,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(to_application_run_detail_response(detail))),
    ))
}

#[utoipa::path(
    post,
    path = "/api/console/applications/{id}/orchestration/runs/{run_id}/resume",
    request_body = ResumeFlowRunBody,
    params(
        ("id" = String, Path, description = "Application id"),
        ("run_id" = String, Path, description = "Flow run id")
    ),
    responses(
        (status = 200, body = ApplicationRunDetailResponse),
        (status = 400, body = crate::error_response::ErrorBody),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody),
        (status = 404, body = crate::error_response::ErrorBody)
    )
)]
pub async fn resume_flow_run(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((id, run_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<ResumeFlowRunBody>,
) -> Result<Json<ApiSuccess<ApplicationRunDetailResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let checkpoint_id = Uuid::parse_str(&body.checkpoint_id)
        .map_err(|_| ControlPlaneError::InvalidInput("checkpoint_id"))?;
    let detail = OrchestrationRuntimeService::new(state.store.clone())
        .resume_flow_run(ResumeFlowRunCommand {
            actor_user_id: context.user.id,
            application_id: id,
            flow_run_id: run_id,
            checkpoint_id,
            input_payload: body.input_payload,
        })
        .await?;

    Ok(Json(ApiSuccess::new(to_application_run_detail_response(
        detail,
    ))))
}

#[utoipa::path(
    post,
    path = "/api/console/applications/{id}/orchestration/callback-tasks/{callback_task_id}/complete",
    request_body = CompleteCallbackTaskBody,
    params(
        ("id" = String, Path, description = "Application id"),
        ("callback_task_id" = String, Path, description = "Callback task id")
    ),
    responses(
        (status = 200, body = ApplicationRunDetailResponse),
        (status = 400, body = crate::error_response::ErrorBody),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody),
        (status = 404, body = crate::error_response::ErrorBody)
    )
)]
pub async fn complete_callback_task(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((id, callback_task_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<CompleteCallbackTaskBody>,
) -> Result<Json<ApiSuccess<ApplicationRunDetailResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let detail = OrchestrationRuntimeService::new(state.store.clone())
        .complete_callback_task(CompleteCallbackTaskCommand {
            actor_user_id: context.user.id,
            application_id: id,
            callback_task_id,
            response_payload: body.response_payload,
        })
        .await?;

    Ok(Json(ApiSuccess::new(to_application_run_detail_response(
        detail,
    ))))
}

#[utoipa::path(
    post,
    path = "/api/console/applications/{id}/orchestration/nodes/{node_id}/debug-runs",
    request_body = StartNodeDebugPreviewBody,
    params(
        ("id" = String, Path, description = "Application id"),
        ("node_id" = String, Path, description = "Node id")
    ),
    responses(
        (status = 201, body = NodeLastRunResponse),
        (status = 400, body = crate::error_response::ErrorBody),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody),
        (status = 404, body = crate::error_response::ErrorBody)
    )
)]
pub async fn start_node_debug_preview(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((id, node_id)): Path<(Uuid, String)>,
    Json(body): Json<StartNodeDebugPreviewBody>,
) -> Result<(StatusCode, Json<ApiSuccess<NodeLastRunResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let outcome = OrchestrationRuntimeService::new(state.store.clone())
        .start_node_debug_preview(StartNodeDebugPreviewCommand {
            actor_user_id: context.user.id,
            application_id: id,
            node_id,
            input_payload: body.input_payload,
        })
        .await?;

    let response = to_node_last_run_response(domain::NodeLastRun {
        flow_run: outcome.flow_run,
        node_run: outcome.node_run,
        checkpoints: Vec::new(),
        events: outcome.events,
    });

    Ok((StatusCode::CREATED, Json(ApiSuccess::new(response))))
}

#[utoipa::path(
    get,
    path = "/api/console/applications/{id}/logs/runs",
    params(
        ("id" = String, Path, description = "Application id")
    ),
    responses(
        (status = 200, body = [FlowRunSummaryResponse]),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody),
        (status = 404, body = crate::error_response::ErrorBody)
    )
)]
pub async fn list_application_runs(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiSuccess<Vec<FlowRunSummaryResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    ensure_application_visible(&state, context.user.id, id).await?;

    let runs =
        <storage_pg::PgControlPlaneStore as OrchestrationRuntimeRepository>::list_application_runs(
            &state.store,
            id,
        )
        .await?
        .into_iter()
        .map(to_flow_run_summary_response)
        .collect();

    Ok(Json(ApiSuccess::new(runs)))
}

#[utoipa::path(
    get,
    path = "/api/console/applications/{id}/logs/runs/{run_id}",
    params(
        ("id" = String, Path, description = "Application id"),
        ("run_id" = String, Path, description = "Flow run id")
    ),
    responses(
        (status = 200, body = ApplicationRunDetailResponse),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody),
        (status = 404, body = crate::error_response::ErrorBody)
    )
)]
pub async fn get_application_run_detail(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((id, run_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<ApiSuccess<ApplicationRunDetailResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    ensure_application_visible(&state, context.user.id, id).await?;

    let detail =
        <storage_pg::PgControlPlaneStore as OrchestrationRuntimeRepository>::get_application_run_detail(
            &state.store,
            id,
            run_id,
        )
        .await?
        .ok_or(ControlPlaneError::NotFound("flow_run"))?;

    Ok(Json(ApiSuccess::new(to_application_run_detail_response(
        detail,
    ))))
}

#[utoipa::path(
    get,
    path = "/api/console/applications/{id}/orchestration/nodes/{node_id}/last-run",
    params(
        ("id" = String, Path, description = "Application id"),
        ("node_id" = String, Path, description = "Node id")
    ),
    responses(
        (status = 200, body = NodeLastRunResponse),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody),
        (status = 404, body = crate::error_response::ErrorBody)
    )
)]
pub async fn get_node_last_run(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((id, node_id)): Path<(Uuid, String)>,
) -> Result<Json<ApiSuccess<Option<NodeLastRunResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    ensure_application_visible(&state, context.user.id, id).await?;

    let last_run =
        <storage_pg::PgControlPlaneStore as OrchestrationRuntimeRepository>::get_latest_node_run(
            &state.store,
            id,
            &node_id,
        )
        .await?
        .map(to_node_last_run_response);

    Ok(Json(ApiSuccess::new(last_run)))
}
