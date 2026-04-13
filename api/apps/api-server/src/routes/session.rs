use std::sync::Arc;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use control_plane::session_security::{
    LogoutCurrentSessionCommand, RevokeAllSessionsCommand, SessionSecurityService,
};
use serde::Serialize;
use utoipa::ToSchema;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    response::ApiSuccess,
};

#[derive(Debug, Serialize, ToSchema)]
pub struct SessionResponse {
    pub actor: serde_json::Value,
    pub session: serde_json::Value,
}

pub(crate) fn expired_session_cookie(cookie_name: &str) -> Cookie<'static> {
    Cookie::build((cookie_name.to_string(), String::new()))
        .http_only(true)
        .same_site(SameSite::Lax)
        .path("/")
        .build()
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/session", get(get_session).delete(delete_session))
        .route("/session/actions/revoke-all", post(revoke_all_sessions))
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
            "current_workspace_id": context.actor.current_workspace_id,
        }),
        session: serde_json::json!({
            "id": context.session.session_id,
            "user_id": context.session.user_id,
            "tenant_id": context.session.tenant_id,
            "current_workspace_id": context.session.current_workspace_id,
        }),
    })))
}

#[utoipa::path(
    delete,
    path = "/api/console/session",
    responses((status = 204), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn delete_session(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<(CookieJar, StatusCode), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    SessionSecurityService::new(state.store.clone(), state.session_store.clone())
        .logout_current_session(LogoutCurrentSessionCommand {
            session_id: context.session.session_id,
        })
        .await?;

    Ok((
        CookieJar::new().remove(expired_session_cookie(&state.cookie_name)),
        StatusCode::NO_CONTENT,
    ))
}

#[utoipa::path(
    post,
    path = "/api/console/session/actions/revoke-all",
    responses((status = 204), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn revoke_all_sessions(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<(CookieJar, StatusCode), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    SessionSecurityService::new(state.store.clone(), state.session_store.clone())
        .revoke_all_sessions(RevokeAllSessionsCommand {
            actor_user_id: context.user.id,
            session_id: context.session.session_id,
        })
        .await?;

    Ok((
        CookieJar::new().remove(expired_session_cookie(&state.cookie_name)),
        StatusCode::NO_CONTENT,
    ))
}
