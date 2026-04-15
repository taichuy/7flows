use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{get, post, put},
    Json, Router,
};
use control_plane::{
    errors::ControlPlaneError,
    flow::{FlowService, SaveFlowDraftCommand},
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
pub struct SaveDraftBody {
    pub document: serde_json::Value,
    pub change_kind: String,
    pub summary: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FlowVersionResponse {
    pub id: String,
    pub sequence: i64,
    pub trigger: String,
    pub change_kind: String,
    pub summary: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FlowDraftResponse {
    pub id: String,
    pub flow_id: String,
    pub document: serde_json::Value,
    pub updated_at: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OrchestrationStateResponse {
    pub flow_id: String,
    pub draft: FlowDraftResponse,
    pub versions: Vec<FlowVersionResponse>,
    pub autosave_interval_seconds: u16,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/applications/:id/orchestration", get(get_orchestration))
        .route("/applications/:id/orchestration/draft", put(save_draft))
        .route(
            "/applications/:id/orchestration/versions/:version_id/restore",
            post(restore_version),
        )
}

fn to_response(state: domain::FlowEditorState) -> OrchestrationStateResponse {
    OrchestrationStateResponse {
        flow_id: state.flow.id.to_string(),
        draft: FlowDraftResponse {
            id: state.draft.id.to_string(),
            flow_id: state.draft.flow_id.to_string(),
            document: state.draft.document,
            updated_at: state.draft.updated_at.format(&Rfc3339).unwrap(),
        },
        versions: state
            .versions
            .into_iter()
            .map(|version| FlowVersionResponse {
                id: version.id.to_string(),
                sequence: version.sequence,
                trigger: version.trigger.as_str().to_string(),
                change_kind: version.change_kind.as_str().to_string(),
                summary: version.summary,
                created_at: version.created_at.format(&Rfc3339).unwrap(),
            })
            .collect(),
        autosave_interval_seconds: state.autosave_interval_seconds,
    }
}

fn parse_change_kind(value: &str) -> Result<domain::FlowChangeKind, ApiError> {
    match value {
        "layout" => Ok(domain::FlowChangeKind::Layout),
        "logical" => Ok(domain::FlowChangeKind::Logical),
        _ => Err(ControlPlaneError::InvalidInput("change_kind").into()),
    }
}

#[utoipa::path(
    get,
    path = "/api/console/applications/{id}/orchestration",
    params(
        ("id" = String, Path, description = "Application id")
    ),
    responses(
        (status = 200, body = OrchestrationStateResponse),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody),
        (status = 404, body = crate::error_response::ErrorBody)
    )
)]
pub async fn get_orchestration(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiSuccess<OrchestrationStateResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let flow_state = FlowService::new(state.store.clone())
        .get_or_create_editor_state(context.user.id, id)
        .await?;

    Ok(Json(ApiSuccess::new(to_response(flow_state))))
}

#[utoipa::path(
    put,
    path = "/api/console/applications/{id}/orchestration/draft",
    request_body = SaveDraftBody,
    params(
        ("id" = String, Path, description = "Application id")
    ),
    responses(
        (status = 200, body = OrchestrationStateResponse),
        (status = 400, body = crate::error_response::ErrorBody),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody),
        (status = 404, body = crate::error_response::ErrorBody)
    )
)]
pub async fn save_draft(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<SaveDraftBody>,
) -> Result<Json<ApiSuccess<OrchestrationStateResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let flow_state = FlowService::new(state.store.clone())
        .save_draft(SaveFlowDraftCommand {
            actor_user_id: context.user.id,
            application_id: id,
            document: body.document,
            change_kind: parse_change_kind(&body.change_kind)?,
            summary: body.summary,
        })
        .await?;

    Ok(Json(ApiSuccess::new(to_response(flow_state))))
}

#[utoipa::path(
    post,
    path = "/api/console/applications/{id}/orchestration/versions/{version_id}/restore",
    params(
        ("id" = String, Path, description = "Application id"),
        ("version_id" = String, Path, description = "Flow version id")
    ),
    responses(
        (status = 200, body = OrchestrationStateResponse),
        (status = 401, body = crate::error_response::ErrorBody),
        (status = 403, body = crate::error_response::ErrorBody),
        (status = 404, body = crate::error_response::ErrorBody)
    )
)]
pub async fn restore_version(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((id, version_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<ApiSuccess<OrchestrationStateResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let flow_state = FlowService::new(state.store.clone())
        .restore_version(context.user.id, id, version_id)
        .await?;

    Ok(Json(ApiSuccess::new(to_response(flow_state))))
}
