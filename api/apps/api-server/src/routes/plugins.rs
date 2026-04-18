use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use control_plane::plugin_management::{
    AssignPluginCommand, EnablePluginCommand, InstallOfficialPluginCommand,
    InstallPluginCommand, OfficialPluginCatalogEntry, PluginCatalogEntry, PluginManagementService,
};
use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    provider_runtime::ApiProviderRuntime,
    response::ApiSuccess,
};

#[derive(Debug, Deserialize, ToSchema)]
pub struct InstallPluginBody {
    pub package_root: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct InstallOfficialPluginBody {
    pub plugin_id: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PluginInstallationResponse {
    pub id: String,
    pub provider_code: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub contract_version: String,
    pub protocol: String,
    pub display_name: String,
    pub source_kind: String,
    pub verification_status: String,
    pub enabled: bool,
    pub install_path: String,
    pub checksum: Option<String>,
    pub signature_status: Option<String>,
    #[schema(value_type = Object)]
    pub metadata_json: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PluginCatalogEntryResponse {
    #[serde(flatten)]
    pub installation: PluginInstallationResponse,
    pub help_url: Option<String>,
    pub default_base_url: Option<String>,
    pub model_discovery_mode: String,
    pub assigned_to_current_workspace: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OfficialPluginCatalogEntryResponse {
    pub plugin_id: String,
    pub provider_code: String,
    pub display_name: String,
    pub protocol: String,
    pub latest_version: String,
    pub help_url: Option<String>,
    pub model_discovery_mode: String,
    pub install_status: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PluginTaskResponse {
    pub id: String,
    pub installation_id: Option<String>,
    pub workspace_id: Option<String>,
    pub provider_code: String,
    pub task_kind: String,
    pub status: String,
    pub status_message: Option<String>,
    #[schema(value_type = Object)]
    pub detail_json: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct InstallPluginResponse {
    pub installation: PluginInstallationResponse,
    pub task: PluginTaskResponse,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/plugins/catalog", get(list_catalog))
        .route("/plugins/official-catalog", get(list_official_catalog))
        .route("/plugins/install", post(install_plugin))
        .route("/plugins/install-official", post(install_official_plugin))
        .route("/plugins/:installation_id/enable", post(enable_plugin))
        .route("/plugins/:installation_id/assign", post(assign_plugin))
        .route("/plugins/tasks", get(list_tasks))
        .route("/plugins/tasks/:task_id", get(get_task))
}

fn service(
    state: &ApiState,
) -> PluginManagementService<storage_pg::PgControlPlaneStore, ApiProviderRuntime> {
    PluginManagementService::new(
        state.store.clone(),
        ApiProviderRuntime::new(state.provider_runtime.clone()),
        state.official_plugin_source.clone(),
        state.provider_install_root.clone(),
    )
}

fn format_time(value: time::OffsetDateTime) -> String {
    value.format(&Rfc3339).unwrap()
}

fn format_optional_time(value: Option<time::OffsetDateTime>) -> Option<String> {
    value.map(format_time)
}

fn parse_uuid(raw: &str, field: &'static str) -> Result<Uuid, ApiError> {
    Uuid::parse_str(raw)
        .map_err(|_| control_plane::errors::ControlPlaneError::InvalidInput(field).into())
}

fn to_installation_response(
    installation: domain::PluginInstallationRecord,
) -> PluginInstallationResponse {
    PluginInstallationResponse {
        id: installation.id.to_string(),
        provider_code: installation.provider_code,
        plugin_id: installation.plugin_id,
        plugin_version: installation.plugin_version,
        contract_version: installation.contract_version,
        protocol: installation.protocol,
        display_name: installation.display_name,
        source_kind: installation.source_kind,
        verification_status: installation.verification_status.as_str().to_string(),
        enabled: installation.enabled,
        install_path: installation.install_path,
        checksum: installation.checksum,
        signature_status: installation.signature_status,
        metadata_json: installation.metadata_json,
        created_at: format_time(installation.created_at),
        updated_at: format_time(installation.updated_at),
    }
}

fn to_catalog_response(entry: PluginCatalogEntry) -> PluginCatalogEntryResponse {
    PluginCatalogEntryResponse {
        installation: to_installation_response(entry.installation),
        help_url: entry.help_url,
        default_base_url: entry.default_base_url,
        model_discovery_mode: entry.model_discovery_mode,
        assigned_to_current_workspace: entry.assigned_to_current_workspace,
    }
}

fn to_official_catalog_response(
    entry: OfficialPluginCatalogEntry,
) -> OfficialPluginCatalogEntryResponse {
    OfficialPluginCatalogEntryResponse {
        plugin_id: entry.plugin_id,
        provider_code: entry.provider_code,
        display_name: entry.display_name,
        protocol: entry.protocol,
        latest_version: entry.latest_version,
        help_url: entry.help_url,
        model_discovery_mode: entry.model_discovery_mode,
        install_status: entry.install_status.as_str().to_string(),
    }
}

fn to_task_response(task: domain::PluginTaskRecord) -> PluginTaskResponse {
    PluginTaskResponse {
        id: task.id.to_string(),
        installation_id: task.installation_id.map(|id| id.to_string()),
        workspace_id: task.workspace_id.map(|id| id.to_string()),
        provider_code: task.provider_code,
        task_kind: task.task_kind.as_str().to_string(),
        status: task.status.as_str().to_string(),
        status_message: task.status_message,
        detail_json: task.detail_json,
        created_at: format_time(task.created_at),
        updated_at: format_time(task.updated_at),
        finished_at: format_optional_time(task.finished_at),
    }
}

#[utoipa::path(
    get,
    path = "/api/console/plugins/catalog",
    operation_id = "plugin_list_catalog",
    responses((status = 200, body = [PluginCatalogEntryResponse]), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn list_catalog(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<Vec<PluginCatalogEntryResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let catalog = service(&state).list_catalog(context.user.id).await?;
    Ok(Json(ApiSuccess::new(
        catalog.into_iter().map(to_catalog_response).collect(),
    )))
}

#[utoipa::path(
    get,
    path = "/api/console/plugins/official-catalog",
    operation_id = "plugin_list_official_catalog",
    responses((status = 200, body = [OfficialPluginCatalogEntryResponse]), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn list_official_catalog(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<Vec<OfficialPluginCatalogEntryResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let catalog = service(&state).list_official_catalog(context.user.id).await?;
    Ok(Json(ApiSuccess::new(
        catalog
            .into_iter()
            .map(to_official_catalog_response)
            .collect(),
    )))
}

#[utoipa::path(
    post,
    path = "/api/console/plugins/install",
    operation_id = "plugin_install",
    request_body = InstallPluginBody,
    responses((status = 201, body = InstallPluginResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn install_plugin(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Json(body): Json<InstallPluginBody>,
) -> Result<(StatusCode, Json<ApiSuccess<InstallPluginResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;
    let result = service(&state)
        .install_plugin(InstallPluginCommand {
            actor_user_id: context.user.id,
            package_root: body.package_root,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(InstallPluginResponse {
            installation: to_installation_response(result.installation),
            task: to_task_response(result.task),
        })),
    ))
}

#[utoipa::path(
    post,
    path = "/api/console/plugins/install-official",
    operation_id = "plugin_install_official",
    request_body = InstallOfficialPluginBody,
    responses((status = 201, body = InstallPluginResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn install_official_plugin(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Json(body): Json<InstallOfficialPluginBody>,
) -> Result<(StatusCode, Json<ApiSuccess<InstallPluginResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;
    let result = service(&state)
        .install_official_plugin(InstallOfficialPluginCommand {
            actor_user_id: context.user.id,
            plugin_id: body.plugin_id,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(InstallPluginResponse {
            installation: to_installation_response(result.installation),
            task: to_task_response(result.task),
        })),
    ))
}

#[utoipa::path(
    post,
    path = "/api/console/plugins/{installation_id}/enable",
    operation_id = "plugin_enable",
    responses((status = 200, body = PluginTaskResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn enable_plugin(
    State(state): State<Arc<ApiState>>,
    Path(installation_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<PluginTaskResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;
    let task = service(&state)
        .enable_plugin(EnablePluginCommand {
            actor_user_id: context.user.id,
            installation_id: parse_uuid(&installation_id, "installation_id")?,
        })
        .await?;
    Ok(Json(ApiSuccess::new(to_task_response(task))))
}

#[utoipa::path(
    post,
    path = "/api/console/plugins/{installation_id}/assign",
    operation_id = "plugin_assign",
    responses((status = 200, body = PluginTaskResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn assign_plugin(
    State(state): State<Arc<ApiState>>,
    Path(installation_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<PluginTaskResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;
    let task = service(&state)
        .assign_plugin(AssignPluginCommand {
            actor_user_id: context.user.id,
            installation_id: parse_uuid(&installation_id, "installation_id")?,
        })
        .await?;
    Ok(Json(ApiSuccess::new(to_task_response(task))))
}

#[utoipa::path(
    get,
    path = "/api/console/plugins/tasks",
    operation_id = "plugin_list_tasks",
    responses((status = 200, body = [PluginTaskResponse]), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn list_tasks(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<Vec<PluginTaskResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let tasks = service(&state).list_tasks(context.user.id).await?;
    Ok(Json(ApiSuccess::new(
        tasks.into_iter().map(to_task_response).collect(),
    )))
}

#[utoipa::path(
    get,
    path = "/api/console/plugins/tasks/{task_id}",
    operation_id = "plugin_get_task",
    responses((status = 200, body = PluginTaskResponse), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn get_task(
    State(state): State<Arc<ApiState>>,
    Path(task_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<PluginTaskResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let task = service(&state)
        .get_task(context.user.id, parse_uuid(&task_id, "task_id")?)
        .await?;
    Ok(Json(ApiSuccess::new(to_task_response(task))))
}
