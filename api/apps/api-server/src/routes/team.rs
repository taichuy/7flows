use std::sync::Arc;

use axum::{extract::State, http::HeaderMap, routing::get, Json, Router};
use control_plane::team::{TeamService, UpdateTeamCommand};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    response::ApiSuccess,
};

#[derive(Debug, Deserialize, ToSchema)]
pub struct PatchTeamBody {
    pub name: String,
    pub logo_url: Option<String>,
    pub introduction: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TeamResponse {
    pub id: String,
    pub name: String,
    pub logo_url: Option<String>,
    pub introduction: String,
}

fn to_team_response(team: domain::TeamRecord) -> TeamResponse {
    TeamResponse {
        id: team.id.to_string(),
        name: team.name,
        logo_url: team.logo_url,
        introduction: team.introduction,
    }
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new().route("/team", get(get_team).patch(patch_team))
}

#[utoipa::path(
    get,
    path = "/api/console/team",
    responses((status = 200, body = TeamResponse), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn get_team(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<TeamResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let team = TeamService::new(state.store.clone())
        .get_team(context.session.current_workspace_id)
        .await?;

    Ok(Json(ApiSuccess::new(to_team_response(team))))
}

#[utoipa::path(
    patch,
    path = "/api/console/team",
    request_body = PatchTeamBody,
    responses((status = 200, body = TeamResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn patch_team(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Json(body): Json<PatchTeamBody>,
) -> Result<Json<ApiSuccess<TeamResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let team = TeamService::new(state.store.clone())
        .update_team(UpdateTeamCommand {
            actor: context.actor,
            team_id: context.session.current_workspace_id,
            name: body.name,
            logo_url: body.logo_url,
            introduction: body.introduction,
        })
        .await?;

    Ok(Json(ApiSuccess::new(to_team_response(team))))
}
