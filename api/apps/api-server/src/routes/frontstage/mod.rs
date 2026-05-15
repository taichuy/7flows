use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::get,
    Json, Router,
};
use control_plane::workspace::WorkspaceService;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    app_state::ApiState, error_response::ApiError, middleware::require_session::require_session,
    response::ApiSuccess,
};

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum FrontstagePageTreeNodeKind {
    Group,
    Page,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FrontstagePageTreeNodeResponse {
    pub id: String,
    pub title: Option<String>,
    pub kind: FrontstagePageTreeNodeKind,
    #[serde(default)]
    pub children: Vec<FrontstagePageTreeNodeResponse>,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new().route("/frontstage/:workspace_id/pages", get(list_frontstage_pages))
}

#[utoipa::path(
    get,
    path = "/api/console/frontstage/{workspace_id}/pages",
    params(
        ("workspace_id" = String, Path, description = "Workspace id"),
    ),
    responses((status = 200, body = [FrontstagePageTreeNodeResponse]), (status = 400, body = crate::error_response::ErrorBody), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn list_frontstage_pages(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(workspace_id): Path<String>,
) -> Result<Json<ApiSuccess<Vec<FrontstagePageTreeNodeResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;

    let workspace_id = parse_uuid(&workspace_id, "workspace_id")?;
    WorkspaceService::new(state.store.clone())
        .get_accessible_workspace(context.user.id, workspace_id)
        .await?;

    Ok(Json(ApiSuccess::new(vec![])))
}

fn parse_uuid(raw: &str, field: &'static str) -> Result<Uuid, ApiError> {
    Uuid::parse_str(raw).map_err(|_| control_plane::errors::ControlPlaneError::InvalidInput(field).into())
}
