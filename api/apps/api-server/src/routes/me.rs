use std::sync::Arc;

use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::cookie::CookieJar;
use control_plane::profile::ProfileService;
use control_plane::session_security::{ChangeOwnPasswordCommand, SessionSecurityService};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    response::ApiSuccess,
    routes::session::expired_session_cookie,
};

#[derive(Debug, Serialize, ToSchema)]
pub struct MeResponse {
    pub id: String,
    pub account: String,
    pub email: String,
    pub nickname: String,
    pub name: String,
    pub effective_display_role: String,
    pub permissions: Vec<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ChangePasswordBody {
    pub old_password: String,
    pub new_password: String,
}

fn hash_password(password: &str) -> Result<String, ApiError> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|err| anyhow::anyhow!("failed to hash password: {err}"))?
        .to_string())
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/me", get(get_me))
        .route("/me/actions/change-password", post(change_password))
}

#[utoipa::path(
    get,
    path = "/api/console/me",
    responses((status = 200, body = MeResponse), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn get_me(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<MeResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let profile = ProfileService::new(state.store.clone())
        .get_me(context.user.id, context.session.team_id)
        .await?;
    let mut permissions = profile.actor.permissions.into_iter().collect::<Vec<_>>();
    permissions.sort();

    Ok(Json(ApiSuccess::new(MeResponse {
        id: profile.user.id.to_string(),
        account: profile.user.account,
        email: profile.user.email,
        nickname: profile.user.nickname,
        name: profile.user.name,
        effective_display_role: profile.actor.effective_display_role,
        permissions,
    })))
}

#[utoipa::path(
    post,
    path = "/api/console/me/actions/change-password",
    request_body = ChangePasswordBody,
    responses((status = 204), (status = 400, body = crate::error_response::ErrorBody), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn change_password(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Json(body): Json<ChangePasswordBody>,
) -> Result<(CookieJar, StatusCode), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    SessionSecurityService::new(state.store.clone(), state.session_store.clone())
        .change_own_password(ChangeOwnPasswordCommand {
            actor_user_id: context.user.id,
            session_id: context.session.session_id,
            old_password: body.old_password,
            new_password_hash: hash_password(&body.new_password)?,
        })
        .await?;

    Ok((
        CookieJar::new().remove(expired_session_cookie(&state.cookie_name)),
        StatusCode::NO_CONTENT,
    ))
}
