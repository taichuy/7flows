use std::sync::Arc;

use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use control_plane::auth::{AuthKernel, LoginCommand, SessionIssuer};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{app_state::ApiState, error_response::ApiError, response::ApiSuccess};

#[derive(Debug, Serialize, ToSchema)]
pub struct AuthProviderResponse {
    pub name: String,
    pub auth_type: String,
    pub title: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct LoginBody {
    pub authenticator: Option<String>,
    pub identifier: String,
    pub password: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct LoginResponse {
    pub csrf_token: String,
    pub effective_display_role: String,
    pub current_workspace_id: String,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/providers", get(list_providers))
        .route("/providers/password-local/sign-in", post(sign_in))
}

#[utoipa::path(
    get,
    path = "/api/public/auth/providers",
    responses((status = 200, body = [AuthProviderResponse]), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn list_providers(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<ApiSuccess<Vec<AuthProviderResponse>>>, ApiError> {
    let provider = state
        .store
        .find_authenticator("password-local")
        .await?
        .map(|authenticator| AuthProviderResponse {
            name: authenticator.name,
            auth_type: authenticator.auth_type,
            title: authenticator.title,
        });

    Ok(Json(ApiSuccess::new(provider.into_iter().collect())))
}

#[utoipa::path(
    post,
    path = "/api/public/auth/providers/password-local/sign-in",
    request_body = LoginBody,
    responses((status = 200, body = LoginResponse), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn sign_in(
    State(state): State<Arc<ApiState>>,
    Json(body): Json<LoginBody>,
) -> Result<(CookieJar, Json<ApiSuccess<LoginResponse>>), ApiError> {
    let kernel = AuthKernel::new(
        state.store.clone(),
        SessionIssuer::new(state.session_store.clone(), state.session_ttl_days),
    );
    let result = kernel
        .login(LoginCommand {
            authenticator: body
                .authenticator
                .unwrap_or_else(|| "password-local".to_string()),
            identifier: body.identifier,
            password: body.password,
        })
        .await?;

    let cookie = Cookie::build((state.cookie_name.clone(), result.session.session_id.clone()))
        .http_only(true)
        .same_site(SameSite::Lax)
        .path("/")
        .build();
    let jar = CookieJar::new().add(cookie);

    Ok((
        jar,
        Json(ApiSuccess::new(LoginResponse {
            csrf_token: result.session.csrf_token,
            effective_display_role: result.actor.effective_display_role,
            current_workspace_id: result.session.current_workspace_id.to_string(),
        })),
    ))
}
