use std::sync::Arc;

use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post, put},
    Json, Router,
};
use control_plane::member::{
    CreateMemberCommand, DisableMemberCommand, MemberService, ReplaceMemberRolesCommand,
    ResetMemberPasswordCommand,
};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    response::ApiSuccess,
};

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateMemberBody {
    pub account: String,
    pub email: String,
    pub phone: Option<String>,
    pub password: String,
    pub name: String,
    pub nickname: String,
    pub introduction: String,
    pub email_login_enabled: bool,
    pub phone_login_enabled: bool,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ResetMemberPasswordBody {
    pub new_password: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ReplaceMemberRolesBody {
    pub role_codes: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MemberResponse {
    pub id: String,
    pub account: String,
    pub email: String,
    pub phone: Option<String>,
    pub name: String,
    pub nickname: String,
    pub introduction: String,
    pub default_display_role: Option<String>,
    pub email_login_enabled: bool,
    pub phone_login_enabled: bool,
    pub status: String,
    pub role_codes: Vec<String>,
}

fn parse_member_id(member_id: &str) -> Result<Uuid, ApiError> {
    Uuid::parse_str(member_id)
        .map_err(|_| control_plane::errors::ControlPlaneError::InvalidInput("member_id").into())
}

fn hash_password(password: &str) -> Result<String, ApiError> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|err| anyhow::anyhow!("failed to hash password: {err}"))?
        .to_string())
}

fn to_member_response(user: domain::UserRecord) -> MemberResponse {
    let resolved_display_role = user.resolved_display_role();
    let domain::UserRecord {
        id,
        account,
        email,
        phone,
        name,
        nickname,
        introduction,
        email_login_enabled,
        phone_login_enabled,
        status,
        roles,
        ..
    } = user;
    let mut role_codes = roles.into_iter().map(|role| role.code).collect::<Vec<_>>();
    role_codes.sort();
    role_codes.dedup();

    MemberResponse {
        id: id.to_string(),
        account,
        email,
        phone,
        name,
        nickname,
        introduction,
        default_display_role: resolved_display_role,
        email_login_enabled,
        phone_login_enabled,
        status: match status {
            domain::UserStatus::Active => "active".to_string(),
            domain::UserStatus::Disabled => "disabled".to_string(),
        },
        role_codes,
    }
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/members", get(list_members).post(create_member))
        .route("/members/:id/actions/disable", post(disable_member))
        .route("/members/:id/actions/reset-password", post(reset_member))
        .route("/members/:id/roles", put(replace_member_roles))
}

#[utoipa::path(
    get,
    path = "/api/console/members",
    responses((status = 200, body = [MemberResponse]), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn list_members(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<Vec<MemberResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let members = MemberService::new(state.store.clone())
        .list_members(context.user.id)
        .await?;

    Ok(Json(ApiSuccess::new(
        members
            .into_iter()
            .map(to_member_response)
            .collect::<Vec<_>>(),
    )))
}

#[utoipa::path(
    post,
    path = "/api/console/members",
    request_body = CreateMemberBody,
    responses((status = 201, body = MemberResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn create_member(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Json(body): Json<CreateMemberBody>,
) -> Result<(StatusCode, Json<ApiSuccess<MemberResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let user = MemberService::new(state.store.clone())
        .create_member(CreateMemberCommand {
            actor_user_id: context.user.id,
            account: body.account,
            email: body.email,
            phone: body.phone,
            password_hash: hash_password(&body.password)?,
            name: body.name,
            nickname: body.nickname,
            introduction: body.introduction,
            email_login_enabled: body.email_login_enabled,
            phone_login_enabled: body.phone_login_enabled,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(to_member_response(user))),
    ))
}

#[utoipa::path(
    post,
    path = "/api/console/members/{id}/actions/disable",
    params(("id" = String, Path, description = "Member user id")),
    responses((status = 204), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn disable_member(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(member_id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    MemberService::new(state.store.clone())
        .disable_member(DisableMemberCommand {
            actor_user_id: context.user.id,
            target_user_id: parse_member_id(&member_id)?,
        })
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/api/console/members/{id}/actions/reset-password",
    request_body = ResetMemberPasswordBody,
    params(("id" = String, Path, description = "Member user id")),
    responses((status = 204), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn reset_member(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(member_id): Path<String>,
    Json(body): Json<ResetMemberPasswordBody>,
) -> Result<StatusCode, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    MemberService::new(state.store.clone())
        .reset_member_password(ResetMemberPasswordCommand {
            actor_user_id: context.user.id,
            target_user_id: parse_member_id(&member_id)?,
            password_hash: hash_password(&body.new_password)?,
        })
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    put,
    path = "/api/console/members/{id}/roles",
    request_body = ReplaceMemberRolesBody,
    params(("id" = String, Path, description = "Member user id")),
    responses((status = 204), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn replace_member_roles(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(member_id): Path<String>,
    Json(body): Json<ReplaceMemberRolesBody>,
) -> Result<StatusCode, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    MemberService::new(state.store.clone())
        .replace_member_roles(ReplaceMemberRolesCommand {
            actor_user_id: context.user.id,
            target_user_id: parse_member_id(&member_id)?,
            role_codes: body.role_codes,
        })
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
