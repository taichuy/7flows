use std::sync::Arc;

use axum::{extract::State, http::HeaderMap, routing::get, Json, Router};
use serde::Serialize;
use utoipa::ToSchema;

use crate::{
    app_state::ApiState, error_response::ApiError, middleware::require_session::require_session,
    response::ApiSuccess,
};

#[derive(Debug, Serialize, ToSchema)]
pub struct SessionResponse {
    pub actor: serde_json::Value,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new().route("/session", get(get_session))
}

#[utoipa::path(
    get,
    path = "/api/console/session",
    responses((status = 200, body = SessionResponse), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn get_session(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<SessionResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;

    Ok(Json(ApiSuccess::new(SessionResponse {
        actor: serde_json::json!({
            "id": context.user.id,
            "account": context.user.account,
            "effective_display_role": context.actor.effective_display_role,
        }),
    })))
}
