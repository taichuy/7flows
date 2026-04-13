use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, patch},
    Json, Router,
};
use control_plane::role::{
    CreateRoleCommand, DeleteRoleCommand, ReplaceRolePermissionsCommand, RoleService,
    UpdateRoleCommand,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    response::ApiSuccess,
};

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateRoleBody {
    pub code: String,
    pub name: String,
    pub introduction: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateRoleBody {
    pub name: String,
    pub introduction: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ReplaceRolePermissionsBody {
    pub permission_codes: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RoleResponse {
    pub code: String,
    pub name: String,
    pub scope_kind: String,
    pub is_builtin: bool,
    pub is_editable: bool,
    pub permission_codes: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RolePermissionsResponse {
    pub role_code: String,
    pub permission_codes: Vec<String>,
}

fn to_role_response(role: domain::RoleTemplate) -> RoleResponse {
    RoleResponse {
        code: role.code,
        name: role.name,
        scope_kind: match role.scope_kind {
            domain::RoleScopeKind::System => "system".to_string(),
            domain::RoleScopeKind::Workspace => "workspace".to_string(),
        },
        is_builtin: role.is_builtin,
        is_editable: role.is_editable,
        permission_codes: role.permissions,
    }
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/roles", get(list_roles).post(create_role))
        .route("/roles/:id", patch(update_role).delete(delete_role))
        .route(
            "/roles/:id/permissions",
            get(get_role_permissions).put(replace_role_permissions),
        )
}

#[utoipa::path(
    get,
    path = "/api/console/roles",
    responses((status = 200, body = [RoleResponse]), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn list_roles(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<Vec<RoleResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let roles = RoleService::new(state.store.clone())
        .list_roles(context.user.id)
        .await?;

    Ok(Json(ApiSuccess::new(
        roles.into_iter().map(to_role_response).collect::<Vec<_>>(),
    )))
}

#[utoipa::path(
    post,
    path = "/api/console/roles",
    request_body = CreateRoleBody,
    responses((status = 201, body = RoleResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn create_role(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Json(body): Json<CreateRoleBody>,
) -> Result<(StatusCode, Json<ApiSuccess<RoleResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    RoleService::new(state.store.clone())
        .create_role(CreateRoleCommand {
            actor_user_id: context.user.id,
            code: body.code.clone(),
            name: body.name.clone(),
            introduction: body.introduction,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(RoleResponse {
            code: body.code,
            name: body.name,
            scope_kind: "workspace".to_string(),
            is_builtin: false,
            is_editable: true,
            permission_codes: Vec::new(),
        })),
    ))
}

#[utoipa::path(
    patch,
    path = "/api/console/roles/{id}",
    request_body = UpdateRoleBody,
    params(("id" = String, Path, description = "Role code")),
    responses((status = 204), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn update_role(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(role_code): Path<String>,
    Json(body): Json<UpdateRoleBody>,
) -> Result<StatusCode, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    RoleService::new(state.store.clone())
        .update_role(UpdateRoleCommand {
            actor_user_id: context.user.id,
            role_code,
            name: body.name,
            introduction: body.introduction,
        })
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    delete,
    path = "/api/console/roles/{id}",
    params(("id" = String, Path, description = "Role code")),
    responses((status = 204), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn delete_role(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(role_code): Path<String>,
) -> Result<StatusCode, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    RoleService::new(state.store.clone())
        .delete_role(DeleteRoleCommand {
            actor_user_id: context.user.id,
            role_code,
        })
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/api/console/roles/{id}/permissions",
    params(("id" = String, Path, description = "Role code")),
    responses((status = 200, body = RolePermissionsResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn get_role_permissions(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(role_code): Path<String>,
) -> Result<Json<ApiSuccess<RolePermissionsResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let permission_codes = RoleService::new(state.store.clone())
        .get_role_permissions(context.user.id, &role_code)
        .await?;

    Ok(Json(ApiSuccess::new(RolePermissionsResponse {
        role_code,
        permission_codes,
    })))
}

#[utoipa::path(
    put,
    path = "/api/console/roles/{id}/permissions",
    request_body = ReplaceRolePermissionsBody,
    params(("id" = String, Path, description = "Role code")),
    responses((status = 204), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn replace_role_permissions(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(role_code): Path<String>,
    Json(body): Json<ReplaceRolePermissionsBody>,
) -> Result<StatusCode, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    RoleService::new(state.store.clone())
        .replace_permissions(ReplaceRolePermissionsCommand {
            actor_user_id: context.user.id,
            role_code,
            permission_codes: body.permission_codes,
        })
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
