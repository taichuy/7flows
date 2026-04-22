use std::sync::Arc;

use axum::{
    extract::{Multipart, Path, Query, State},
    http::{header::ACCEPT_LANGUAGE, HeaderMap, StatusCode},
    routing::{delete, get, post},
    Json, Router,
};
use control_plane::plugin_management::{
    AssignPluginCommand, DeletePluginFamilyCommand, EnablePluginCommand,
    InstallOfficialPluginCommand, InstallPluginCommand, InstallPluginResult,
    InstallUploadedPluginCommand, OfficialPluginCatalogEntry, OfficialPluginCatalogView,
    PluginCatalogEntry, PluginCatalogFilter, PluginFamilyView, PluginInstalledVersionView,
    PluginManagementService, SwitchPluginVersionCommand, UpgradeLatestPluginFamilyCommand,
};
use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    provider_runtime::ApiProviderRuntime,
    response::ApiSuccess,
    routes::system::LocaleMetaResponse,
};

#[derive(Debug, Deserialize, ToSchema)]
pub struct InstallPluginBody {
    pub package_root: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct InstallOfficialPluginBody {
    pub plugin_id: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SwitchPluginVersionBody {
    pub installation_id: String,
}

#[derive(Debug, Deserialize, IntoParams, Clone)]
pub struct PluginCatalogQuery {
    /// Optional plugin kind filter for catalog views.
    pub plugin_type: Option<String>,
    pub locale: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
#[schema(description = "Installation record returned by the plugin API.")]
pub struct PluginInstallationResponse {
    pub id: String,
    pub provider_code: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub contract_version: String,
    pub protocol: String,
    pub display_name: String,
    pub source_kind: String,
    pub trust_level: String,
    pub verification_status: String,
    pub desired_state: String,
    pub artifact_status: String,
    pub runtime_status: String,
    pub availability_status: String,
    pub package_path: Option<String>,
    pub installed_path: String,
    pub checksum: Option<String>,
    pub manifest_fingerprint: Option<String>,
    pub signature_status: Option<String>,
    pub signature_algorithm: Option<String>,
    pub signing_key_id: Option<String>,
    pub last_load_error: Option<String>,
    #[schema(value_type = Object)]
    pub metadata_json: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[schema(description = "Catalog entry returned by the plugin API.")]
pub struct PluginCatalogEntryResponse {
    pub installation: PluginInstallationResponse,
    pub plugin_type: String,
    pub namespace: String,
    pub label_key: String,
    pub description_key: Option<String>,
    pub provider_label_key: String,
    pub help_url: Option<String>,
    pub default_base_url: Option<String>,
    pub model_discovery_mode: String,
    pub assigned_to_current_workspace: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PluginCatalogResponse {
    pub locale_meta: LocaleMetaResponse,
    #[schema(value_type = Object)]
    pub i18n_catalog: serde_json::Value,
    pub entries: Vec<PluginCatalogEntryResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OfficialPluginArtifactResponse {
    pub os: String,
    pub arch: String,
    pub libc: Option<String>,
    pub rust_target: String,
    pub download_url: String,
    pub checksum: String,
    pub signature_algorithm: Option<String>,
    pub signing_key_id: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
#[schema(description = "Official registry entry returned by the plugin API.")]
pub struct OfficialPluginCatalogEntryResponse {
    pub plugin_id: String,
    pub plugin_type: String,
    pub provider_code: String,
    pub namespace: String,
    pub label_key: String,
    pub description_key: Option<String>,
    pub provider_label_key: String,
    pub protocol: String,
    pub latest_version: String,
    pub selected_artifact: OfficialPluginArtifactResponse,
    pub help_url: Option<String>,
    pub model_discovery_mode: String,
    pub install_status: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OfficialPluginCatalogResponse {
    pub source_kind: String,
    pub source_label: String,
    pub registry_url: String,
    pub locale_meta: LocaleMetaResponse,
    #[schema(value_type = Object)]
    pub i18n_catalog: serde_json::Value,
    pub entries: Vec<OfficialPluginCatalogEntryResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PluginInstalledVersionResponse {
    pub installation_id: String,
    pub plugin_version: String,
    pub source_kind: String,
    pub trust_level: String,
    pub desired_state: String,
    pub availability_status: String,
    pub created_at: String,
    pub is_current: bool,
}

#[derive(Debug, Serialize, ToSchema)]
#[schema(description = "Family view for plugin entries in the current registry.")]
pub struct PluginFamilyResponse {
    pub provider_code: String,
    pub plugin_type: String,
    pub namespace: String,
    pub label_key: String,
    pub description_key: Option<String>,
    pub provider_label_key: String,
    pub protocol: String,
    pub help_url: Option<String>,
    pub default_base_url: Option<String>,
    pub model_discovery_mode: String,
    pub current_installation_id: String,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub has_update: bool,
    pub installed_versions: Vec<PluginInstalledVersionResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PluginFamilyCatalogResponse {
    pub locale_meta: LocaleMetaResponse,
    #[schema(value_type = Object)]
    pub i18n_catalog: serde_json::Value,
    pub entries: Vec<PluginFamilyResponse>,
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
        .route("/plugins/families", get(list_families))
        .route(
            "/plugins/families/:provider_code/upgrade-latest",
            post(upgrade_latest),
        )
        .route(
            "/plugins/families/:provider_code/switch-version",
            post(switch_version),
        )
        .route("/plugins/families/:provider_code", delete(delete_family))
        .route("/plugins/official-catalog", get(list_official_catalog))
        .route("/plugins/install-upload", post(install_uploaded_plugin))
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
    .with_allow_uploaded_host_extensions(state.allow_uploaded_host_extensions)
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

async fn read_upload_file(multipart: &mut Multipart) -> Result<(String, Vec<u8>), ApiError> {
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| control_plane::errors::ControlPlaneError::InvalidInput("plugin_file"))?
    {
        if field.name() != Some("file") {
            continue;
        }

        let file_name = field
            .file_name()
            .map(str::to_string)
            .filter(|value| !value.trim().is_empty())
            .ok_or(control_plane::errors::ControlPlaneError::InvalidInput(
                "plugin_file_name",
            ))?;
        let bytes = field
            .bytes()
            .await
            .map_err(|_| control_plane::errors::ControlPlaneError::InvalidInput("plugin_file"))?;
        if bytes.is_empty() {
            return Err(
                control_plane::errors::ControlPlaneError::InvalidInput("plugin_file").into(),
            );
        }
        return Ok((file_name, bytes.to_vec()));
    }

    Err(control_plane::errors::ControlPlaneError::InvalidInput("plugin_file").into())
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
        trust_level: installation.trust_level,
        verification_status: installation.verification_status.as_str().to_string(),
        desired_state: installation.desired_state.as_str().to_string(),
        artifact_status: installation.artifact_status.as_str().to_string(),
        runtime_status: installation.runtime_status.as_str().to_string(),
        availability_status: installation.availability_status.as_str().to_string(),
        package_path: installation.package_path,
        installed_path: installation.installed_path,
        checksum: installation.checksum,
        manifest_fingerprint: installation.manifest_fingerprint,
        signature_status: installation.signature_status,
        signature_algorithm: installation.signature_algorithm,
        signing_key_id: installation.signing_key_id,
        last_load_error: installation.last_load_error,
        metadata_json: installation.metadata_json,
        created_at: format_time(installation.created_at),
        updated_at: format_time(installation.updated_at),
    }
}

fn to_install_response(result: InstallPluginResult) -> InstallPluginResponse {
    InstallPluginResponse {
        installation: to_installation_response(result.installation),
        task: to_task_response(result.task),
    }
}

fn to_catalog_response(entry: PluginCatalogEntry) -> PluginCatalogEntryResponse {
    PluginCatalogEntryResponse {
        installation: to_installation_response(entry.installation),
        plugin_type: entry.plugin_type,
        namespace: entry.namespace,
        label_key: entry.label_key,
        description_key: entry.description_key,
        provider_label_key: entry.provider_label_key,
        help_url: entry.help_url,
        default_base_url: entry.default_base_url,
        model_discovery_mode: entry.model_discovery_mode,
        assigned_to_current_workspace: entry.assigned_to_current_workspace,
    }
}

fn to_official_catalog_entry_response(
    entry: OfficialPluginCatalogEntry,
) -> OfficialPluginCatalogEntryResponse {
    OfficialPluginCatalogEntryResponse {
        plugin_id: entry.plugin_id,
        plugin_type: entry.plugin_type,
        provider_code: entry.provider_code,
        namespace: entry.namespace,
        label_key: entry.label_key,
        description_key: entry.description_key,
        provider_label_key: entry.provider_label_key,
        protocol: entry.protocol,
        latest_version: entry.latest_version,
        selected_artifact: OfficialPluginArtifactResponse {
            os: entry.selected_artifact.os,
            arch: entry.selected_artifact.arch,
            libc: entry.selected_artifact.libc,
            rust_target: entry.selected_artifact.rust_target,
            download_url: entry.selected_artifact.download_url,
            checksum: entry.selected_artifact.checksum,
            signature_algorithm: entry.selected_artifact.signature_algorithm,
            signing_key_id: entry.selected_artifact.signing_key_id,
        },
        help_url: entry.help_url,
        model_discovery_mode: entry.model_discovery_mode,
        install_status: entry.install_status.as_str().to_string(),
    }
}

fn to_official_catalog_response(
    locale_meta: LocaleMetaResponse,
    catalog: OfficialPluginCatalogView,
) -> OfficialPluginCatalogResponse {
    OfficialPluginCatalogResponse {
        source_kind: catalog.source_kind,
        source_label: catalog.source_label,
        registry_url: catalog.registry_url,
        locale_meta,
        i18n_catalog: serde_json::to_value(catalog.i18n_catalog).unwrap(),
        entries: catalog
            .entries
            .into_iter()
            .map(to_official_catalog_entry_response)
            .collect(),
    }
}

fn to_installed_version_response(
    version: PluginInstalledVersionView,
) -> PluginInstalledVersionResponse {
    PluginInstalledVersionResponse {
        installation_id: version.installation_id.to_string(),
        plugin_version: version.plugin_version,
        source_kind: version.source_kind,
        trust_level: version.trust_level,
        desired_state: version.desired_state,
        availability_status: version.availability_status,
        created_at: format_time(version.created_at),
        is_current: version.is_current,
    }
}

fn to_family_response(entry: PluginFamilyView) -> PluginFamilyResponse {
    PluginFamilyResponse {
        provider_code: entry.provider_code,
        plugin_type: entry.plugin_type,
        namespace: entry.namespace,
        label_key: entry.label_key,
        description_key: entry.description_key,
        provider_label_key: entry.provider_label_key,
        protocol: entry.protocol,
        help_url: entry.help_url,
        default_base_url: entry.default_base_url,
        model_discovery_mode: entry.model_discovery_mode,
        current_installation_id: entry.current_installation_id.to_string(),
        current_version: entry.current_version,
        latest_version: entry.latest_version,
        has_update: entry.has_update,
        installed_versions: entry
            .installed_versions
            .into_iter()
            .map(to_installed_version_response)
            .collect(),
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

fn resolve_locale_meta(
    headers: &HeaderMap,
    query_locale: Option<String>,
    user_preferred_locale: Option<String>,
) -> LocaleMetaResponse {
    runtime_profile::resolve_locale(runtime_profile::LocaleResolutionInput {
        query_locale,
        explicit_header_locale: headers
            .get("x-1flowbase-locale")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string),
        user_preferred_locale,
        accept_language: headers
            .get(ACCEPT_LANGUAGE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string),
        fallback_locale: runtime_profile::FALLBACK_LOCALE,
        supported_locales: runtime_profile::SUPPORTED_LOCALES
            .iter()
            .map(|value| value.to_string())
            .collect(),
    })
    .into()
}

fn requested_locales(locale_meta: &LocaleMetaResponse) -> control_plane::i18n::RequestedLocales {
    control_plane::i18n::RequestedLocales::new(
        locale_meta.resolved_locale.clone(),
        locale_meta.fallback_locale.clone(),
    )
}

fn filter_from_query(query: &PluginCatalogQuery) -> PluginCatalogFilter {
    PluginCatalogFilter {
        plugin_type: query.plugin_type.clone(),
    }
}

#[utoipa::path(
    get,
    path = "/api/console/plugins/catalog",
    params(PluginCatalogQuery),
    operation_id = "plugin_list_catalog",
    responses((status = 200, body = PluginCatalogResponse), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn list_catalog(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Query(query): Query<PluginCatalogQuery>,
) -> Result<Json<ApiSuccess<PluginCatalogResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let locale_meta = resolve_locale_meta(
        &headers,
        query.locale.clone(),
        context.user.preferred_locale,
    );
    let catalog = service(&state)
        .list_catalog(
            context.user.id,
            filter_from_query(&query),
            requested_locales(&locale_meta),
        )
        .await?;
    Ok(Json(ApiSuccess::new(PluginCatalogResponse {
        locale_meta,
        i18n_catalog: serde_json::to_value(catalog.i18n_catalog).unwrap(),
        entries: catalog
            .entries
            .into_iter()
            .map(to_catalog_response)
            .collect(),
    })))
}

#[utoipa::path(
    get,
    path = "/api/console/plugins/families",
    params(PluginCatalogQuery),
    operation_id = "plugin_list_families",
    responses((status = 200, body = PluginFamilyCatalogResponse), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn list_families(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Query(query): Query<PluginCatalogQuery>,
) -> Result<Json<ApiSuccess<PluginFamilyCatalogResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let locale_meta = resolve_locale_meta(
        &headers,
        query.locale.clone(),
        context.user.preferred_locale,
    );
    let families = service(&state)
        .list_families(
            context.user.id,
            filter_from_query(&query),
            requested_locales(&locale_meta),
        )
        .await?;
    Ok(Json(ApiSuccess::new(PluginFamilyCatalogResponse {
        locale_meta,
        i18n_catalog: serde_json::to_value(families.i18n_catalog).unwrap(),
        entries: families
            .entries
            .into_iter()
            .map(to_family_response)
            .collect(),
    })))
}

#[utoipa::path(
    get,
    path = "/api/console/plugins/official-catalog",
    params(PluginCatalogQuery),
    operation_id = "plugin_list_official_catalog",
    responses((status = 200, body = OfficialPluginCatalogResponse), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn list_official_catalog(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Query(query): Query<PluginCatalogQuery>,
) -> Result<Json<ApiSuccess<OfficialPluginCatalogResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let locale_meta = resolve_locale_meta(
        &headers,
        query.locale.clone(),
        context.user.preferred_locale,
    );
    let catalog = service(&state)
        .list_official_catalog(
            context.user.id,
            filter_from_query(&query),
            requested_locales(&locale_meta),
        )
        .await?;
    Ok(Json(ApiSuccess::new(to_official_catalog_response(
        locale_meta,
        catalog,
    ))))
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
        Json(ApiSuccess::new(to_install_response(result))),
    ))
}

#[utoipa::path(
    post,
    path = "/api/console/plugins/install-upload",
    operation_id = "plugin_install_upload",
    responses((status = 201, body = InstallPluginResponse), (status = 400, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn install_uploaded_plugin(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<ApiSuccess<InstallPluginResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;
    let (file_name, package_bytes) = read_upload_file(&mut multipart).await?;
    let result = service(&state)
        .install_uploaded_plugin(InstallUploadedPluginCommand {
            actor_user_id: context.user.id,
            file_name,
            package_bytes,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(to_install_response(result))),
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
        Json(ApiSuccess::new(to_install_response(result))),
    ))
}

#[utoipa::path(
    post,
    path = "/api/console/plugins/families/{provider_code}/upgrade-latest",
    operation_id = "plugin_upgrade_family_latest",
    responses((status = 200, body = PluginTaskResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn upgrade_latest(
    State(state): State<Arc<ApiState>>,
    Path(provider_code): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<PluginTaskResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;
    let task = service(&state)
        .upgrade_latest(UpgradeLatestPluginFamilyCommand {
            actor_user_id: context.user.id,
            provider_code,
        })
        .await?;
    Ok(Json(ApiSuccess::new(to_task_response(task))))
}

#[utoipa::path(
    post,
    path = "/api/console/plugins/families/{provider_code}/switch-version",
    operation_id = "plugin_switch_family_version",
    request_body = SwitchPluginVersionBody,
    responses((status = 200, body = PluginTaskResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn switch_version(
    State(state): State<Arc<ApiState>>,
    Path(provider_code): Path<String>,
    headers: HeaderMap,
    Json(body): Json<SwitchPluginVersionBody>,
) -> Result<Json<ApiSuccess<PluginTaskResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;
    let task = service(&state)
        .switch_version(SwitchPluginVersionCommand {
            actor_user_id: context.user.id,
            provider_code,
            target_installation_id: parse_uuid(&body.installation_id, "installation_id")?,
        })
        .await?;
    Ok(Json(ApiSuccess::new(to_task_response(task))))
}

#[utoipa::path(
    delete,
    path = "/api/console/plugins/families/{provider_code}",
    operation_id = "plugin_delete_family",
    responses((status = 200, body = PluginTaskResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn delete_family(
    State(state): State<Arc<ApiState>>,
    Path(provider_code): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<PluginTaskResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;
    let task = service(&state)
        .delete_family(DeletePluginFamilyCommand {
            actor_user_id: context.user.id,
            provider_code,
        })
        .await?;
    Ok(Json(ApiSuccess::new(to_task_response(task))))
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
