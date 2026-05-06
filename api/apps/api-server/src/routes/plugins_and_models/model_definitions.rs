use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, patch, post},
    Json, Router,
};
use control_plane::model_definition::{
    AddModelFieldCommand, CreateModelDefinitionCommand, CreateScopeDataModelGrantCommand,
    DeleteModelDefinitionCommand, DeleteModelFieldCommand, DeleteScopeDataModelGrantCommand,
    ModelDefinitionService, UpdateModelDefinitionCommand, UpdateModelDefinitionStatusCommand,
    UpdateModelFieldCommand, UpdateScopeDataModelGrantCommand,
};
use control_plane::runtime_registry_sync::ModelDefinitionMutationService;
use serde::{Deserialize, Serialize};
use storage_durable::MainDurableStore;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    response::ApiSuccess,
    runtime_registry_sync::ApiRuntimeRegistrySync,
};

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateModelDefinitionBody {
    pub scope_kind: String,
    pub data_source_instance_id: Option<String>,
    pub external_resource_key: Option<String>,
    pub external_table_id: Option<String>,
    pub code: String,
    pub title: String,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateModelDefinitionBody {
    pub title: Option<String>,
    pub status: Option<String>,
    pub api_exposure_status: Option<String>,
    pub external_table_id: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateModelFieldBody {
    pub code: String,
    pub title: String,
    pub external_field_key: Option<String>,
    pub field_kind: String,
    #[serde(default)]
    pub is_required: bool,
    #[serde(default)]
    pub is_unique: bool,
    pub default_value: Option<serde_json::Value>,
    pub display_interface: Option<String>,
    #[serde(default = "empty_json_object")]
    pub display_options: serde_json::Value,
    pub relation_target_model_id: Option<String>,
    #[serde(default = "empty_json_object")]
    pub relation_options: serde_json::Value,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateModelFieldBody {
    pub title: String,
    #[serde(default)]
    pub is_required: bool,
    #[serde(default)]
    pub is_unique: bool,
    pub default_value: Option<serde_json::Value>,
    pub display_interface: Option<String>,
    #[serde(default = "empty_json_object")]
    pub display_options: serde_json::Value,
    #[serde(default = "empty_json_object")]
    pub relation_options: serde_json::Value,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateScopeGrantBody {
    pub scope_kind: String,
    pub scope_id: Uuid,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub permission_profile: String,
    #[serde(default)]
    pub confirm_unsafe_external_source_system_all: bool,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateScopeGrantBody {
    pub enabled: Option<bool>,
    pub permission_profile: Option<String>,
    #[serde(default)]
    pub confirm_unsafe_external_source_system_all: bool,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmationQuery {
    pub confirmed: Option<bool>,
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct ListModelsQuery {
    pub data_source_instance_id: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ModelFieldResponse {
    pub id: String,
    pub code: String,
    pub title: String,
    pub physical_column_name: String,
    pub external_field_key: Option<String>,
    pub field_kind: String,
    pub is_required: bool,
    pub is_unique: bool,
    #[schema(value_type = Object)]
    pub default_value: Option<serde_json::Value>,
    pub display_interface: Option<String>,
    #[schema(value_type = Object)]
    pub display_options: serde_json::Value,
    pub relation_target_model_id: Option<String>,
    #[schema(value_type = Object)]
    pub relation_options: serde_json::Value,
    pub sort_order: i32,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ModelDefinitionResponse {
    pub id: String,
    pub scope_kind: String,
    pub scope_id: String,
    pub code: String,
    pub title: String,
    pub status: String,
    pub api_exposure_status: String,
    pub runtime_availability: String,
    pub data_source_instance_id: Option<String>,
    pub source_kind: String,
    pub external_resource_key: Option<String>,
    pub external_table_id: Option<String>,
    pub physical_table_name: String,
    pub acl_namespace: String,
    pub audit_namespace: String,
    pub fields: Vec<ModelFieldResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DeletedResponse {
    pub deleted: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ScopeGrantResponse {
    pub id: String,
    pub scope_kind: String,
    pub scope_id: String,
    pub data_model_id: String,
    pub enabled: bool,
    pub permission_profile: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DataModelAdvisorFindingResponse {
    pub id: String,
    pub data_model_id: String,
    pub severity: String,
    pub code: String,
    pub message: String,
    pub recommended_action: String,
    pub can_acknowledge: bool,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/models", get(list_models).post(create_model))
        .route(
            "/models/:id",
            get(get_model).patch(update_model).delete(delete_model),
        )
        .route("/models/:id/advisor-findings", get(get_advisor_findings))
        .route("/models/:id/fields", post(create_field))
        .route(
            "/models/:id/fields/:field_id",
            patch(update_field).delete(delete_field),
        )
        .route(
            "/models/:id/scope-grants",
            get(list_scope_grants).post(create_scope_grant),
        )
        .route(
            "/models/:id/scope-grants/:grant_id",
            patch(update_scope_grant).delete(delete_scope_grant),
        )
}

fn empty_json_object() -> serde_json::Value {
    serde_json::json!({})
}

fn default_true() -> bool {
    true
}

fn to_model_field_response(field: domain::ModelFieldRecord) -> ModelFieldResponse {
    ModelFieldResponse {
        id: field.id.to_string(),
        code: field.code,
        title: field.title,
        physical_column_name: field.physical_column_name,
        external_field_key: field.external_field_key,
        field_kind: field.field_kind.as_str().to_string(),
        is_required: field.is_required,
        is_unique: field.is_unique,
        default_value: field.default_value,
        display_interface: field.display_interface,
        display_options: field.display_options,
        relation_target_model_id: field.relation_target_model_id.map(|id| id.to_string()),
        relation_options: field.relation_options,
        sort_order: field.sort_order,
    }
}

pub(super) fn to_model_definition_response(
    model: domain::ModelDefinitionRecord,
) -> ModelDefinitionResponse {
    ModelDefinitionResponse {
        id: model.id.to_string(),
        scope_kind: model.scope_kind.as_str().to_string(),
        scope_id: model.scope_id.to_string(),
        code: model.code,
        title: model.title,
        status: model.status.as_str().to_string(),
        api_exposure_status: model.api_exposure_status.as_str().to_string(),
        runtime_availability: runtime_availability_for_status(model.status).to_string(),
        data_source_instance_id: model.data_source_instance_id.map(|id| id.to_string()),
        source_kind: model.source_kind.as_str().to_string(),
        external_resource_key: model.external_resource_key,
        external_table_id: model.external_table_id,
        physical_table_name: model.physical_table_name,
        acl_namespace: model.acl_namespace,
        audit_namespace: model.audit_namespace,
        fields: model
            .fields
            .into_iter()
            .map(to_model_field_response)
            .collect(),
    }
}

fn to_scope_grant_response(grant: domain::ScopeDataModelGrantRecord) -> ScopeGrantResponse {
    ScopeGrantResponse {
        id: grant.id.to_string(),
        scope_kind: grant.scope_kind.as_str().to_string(),
        scope_id: grant.scope_id.to_string(),
        data_model_id: grant.data_model_id.to_string(),
        enabled: grant.enabled,
        permission_profile: grant.permission_profile.as_str().to_string(),
    }
}

fn to_advisor_finding_response(
    finding: domain::DataModelAdvisorFinding,
) -> DataModelAdvisorFindingResponse {
    DataModelAdvisorFindingResponse {
        id: finding.id,
        data_model_id: finding.data_model_id.to_string(),
        severity: finding.severity.as_str().to_string(),
        code: finding.code,
        message: finding.message,
        recommended_action: finding.recommended_action,
        can_acknowledge: finding.can_acknowledge,
    }
}

fn runtime_availability_for_status(status: domain::DataModelStatus) -> &'static str {
    match runtime_core::runtime_model_registry::RuntimeDataModelAvailability::from_status(status) {
        runtime_core::runtime_model_registry::RuntimeDataModelAvailability::Available => {
            "available"
        }
        runtime_core::runtime_model_registry::RuntimeDataModelAvailability::NotPublished => {
            "not_published"
        }
        runtime_core::runtime_model_registry::RuntimeDataModelAvailability::Disabled => "disabled",
        runtime_core::runtime_model_registry::RuntimeDataModelAvailability::Broken => "broken",
    }
}

fn parse_uuid(raw: &str, field: &'static str) -> Result<Uuid, ApiError> {
    Uuid::parse_str(raw)
        .map_err(|_| control_plane::errors::ControlPlaneError::InvalidInput(field).into())
}

fn parse_scope_kind(raw: &str) -> Result<domain::DataModelScopeKind, ApiError> {
    match raw {
        "workspace" => Ok(domain::DataModelScopeKind::Workspace),
        "system" => Ok(domain::DataModelScopeKind::System),
        _ => Err(control_plane::errors::ControlPlaneError::InvalidInput("scope_kind").into()),
    }
}

fn parse_model_status(raw: &str) -> Result<domain::DataModelStatus, ApiError> {
    match raw {
        "draft" => Ok(domain::DataModelStatus::Draft),
        "published" => Ok(domain::DataModelStatus::Published),
        "disabled" => Ok(domain::DataModelStatus::Disabled),
        "broken" => Ok(domain::DataModelStatus::Broken),
        _ => Err(control_plane::errors::ControlPlaneError::InvalidInput("status").into()),
    }
}

fn parse_api_exposure_status(raw: &str) -> Result<domain::ApiExposureStatus, ApiError> {
    match raw {
        "draft" => Ok(domain::ApiExposureStatus::Draft),
        "published_not_exposed" => Ok(domain::ApiExposureStatus::PublishedNotExposed),
        "api_exposed_no_permission" => Ok(domain::ApiExposureStatus::ApiExposedNoPermission),
        "api_exposed_ready" => Ok(domain::ApiExposureStatus::ApiExposedReady),
        "unsafe_external_source" => Ok(domain::ApiExposureStatus::UnsafeExternalSource),
        _ => Err(
            control_plane::errors::ControlPlaneError::InvalidInput("api_exposure_status").into(),
        ),
    }
}

fn parse_field_kind(raw: &str) -> Result<domain::ModelFieldKind, ApiError> {
    match raw {
        "string" => Ok(domain::ModelFieldKind::String),
        "number" => Ok(domain::ModelFieldKind::Number),
        "boolean" => Ok(domain::ModelFieldKind::Boolean),
        "datetime" => Ok(domain::ModelFieldKind::Datetime),
        "enum" => Ok(domain::ModelFieldKind::Enum),
        "text" => Ok(domain::ModelFieldKind::Text),
        "json" => Ok(domain::ModelFieldKind::Json),
        "many_to_one" => Ok(domain::ModelFieldKind::ManyToOne),
        "one_to_many" => Ok(domain::ModelFieldKind::OneToMany),
        "many_to_many" => Ok(domain::ModelFieldKind::ManyToMany),
        _ => Err(control_plane::errors::ControlPlaneError::InvalidInput("field_kind").into()),
    }
}

fn mutation_service(
    state: &ApiState,
) -> ModelDefinitionMutationService<MainDurableStore, ApiRuntimeRegistrySync> {
    ModelDefinitionMutationService::new(
        state.store.clone(),
        ApiRuntimeRegistrySync::new(state.store.clone(), state.runtime_engine.registry().clone()),
    )
}

#[utoipa::path(
    get,
    path = "/api/console/models",
    responses((status = 200, body = [ModelDefinitionResponse]), (status = 401, body = crate::error_response::ErrorBody))
)]
pub async fn list_models(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Query(query): Query<ListModelsQuery>,
) -> Result<Json<ApiSuccess<Vec<ModelDefinitionResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let mut models = ModelDefinitionService::new(state.store.clone())
        .list_models(context.user.id)
        .await?;
    if let Some(data_source_instance_id) = query.data_source_instance_id.as_deref() {
        if data_source_instance_id == "main_source" {
            models.retain(|model| {
                model.source_kind == domain::DataModelSourceKind::MainSource
                    && model.data_source_instance_id.is_none()
            });
        } else {
            let data_source_instance_id =
                parse_uuid(data_source_instance_id, "data_source_instance_id")?;
            models.retain(|model| {
                model.source_kind == domain::DataModelSourceKind::ExternalSource
                    && model.data_source_instance_id == Some(data_source_instance_id)
            });
        }
    }

    Ok(Json(ApiSuccess::new(
        models
            .into_iter()
            .map(to_model_definition_response)
            .collect(),
    )))
}

#[utoipa::path(
    post,
    path = "/api/console/models",
    request_body = CreateModelDefinitionBody,
    responses((status = 201, body = ModelDefinitionResponse), (status = 400, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn create_model(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Json(body): Json<CreateModelDefinitionBody>,
) -> Result<(StatusCode, Json<ApiSuccess<ModelDefinitionResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;
    let scope_kind = parse_scope_kind(&body.scope_kind)?;
    let requested_status = body.status.as_deref().map(parse_model_status).transpose()?;

    let mutation_service = mutation_service(&state);
    let model = mutation_service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: context.user.id,
            scope_kind,
            data_source_instance_id: body
                .data_source_instance_id
                .as_deref()
                .map(|value| parse_uuid(value, "data_source_instance_id"))
                .transpose()?,
            external_resource_key: body.external_resource_key,
            external_table_id: body.external_table_id,
            code: body.code,
            title: body.title,
            status: requested_status,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(to_model_definition_response(model))),
    ))
}

#[utoipa::path(
    get,
    path = "/api/console/models/{id}",
    params(("id" = String, Path, description = "Model definition id")),
    responses((status = 200, body = ModelDefinitionResponse), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn get_model(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
) -> Result<Json<ApiSuccess<ModelDefinitionResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let model = ModelDefinitionService::new(state.store.clone())
        .get_model(context.user.id, parse_uuid(&model_id, "model_id")?)
        .await?;

    Ok(Json(ApiSuccess::new(to_model_definition_response(model))))
}

#[utoipa::path(
    get,
    path = "/api/console/models/{id}/advisor-findings",
    params(("id" = String, Path, description = "Model definition id")),
    responses((status = 200, body = [DataModelAdvisorFindingResponse]), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn get_advisor_findings(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
) -> Result<Json<ApiSuccess<Vec<DataModelAdvisorFindingResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let findings = ModelDefinitionService::new(state.store.clone())
        .advisor_findings(context.user.id, parse_uuid(&model_id, "model_id")?)
        .await?;

    Ok(Json(ApiSuccess::new(
        findings
            .into_iter()
            .map(to_advisor_finding_response)
            .collect(),
    )))
}

#[utoipa::path(
    get,
    path = "/api/console/models/{id}/scope-grants",
    params(("id" = String, Path, description = "Model definition id")),
    responses((status = 200, body = [ScopeGrantResponse]), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn list_scope_grants(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
) -> Result<Json<ApiSuccess<Vec<ScopeGrantResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let grants = ModelDefinitionService::new(state.store.clone())
        .list_scope_grants(context.user.id, parse_uuid(&model_id, "model_id")?)
        .await?;

    Ok(Json(ApiSuccess::new(
        grants.into_iter().map(to_scope_grant_response).collect(),
    )))
}

#[utoipa::path(
    patch,
    path = "/api/console/models/{id}",
    request_body = UpdateModelDefinitionBody,
    params(("id" = String, Path, description = "Model definition id")),
    responses((status = 200, body = ModelDefinitionResponse), (status = 400, body = crate::error_response::ErrorBody), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn update_model(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
    Json(body): Json<UpdateModelDefinitionBody>,
) -> Result<Json<ApiSuccess<ModelDefinitionResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let model_id = parse_uuid(&model_id, "model_id")?;
    let requested_status = body.status.as_deref().map(parse_model_status).transpose()?;
    let requested_api_exposure_status = body
        .api_exposure_status
        .as_deref()
        .map(parse_api_exposure_status)
        .transpose()?;
    let mutation_service = mutation_service(&state);
    let mut model = None;
    if body.title.is_some() || body.external_table_id.is_some() {
        let current_model = ModelDefinitionService::new(state.store.clone())
            .get_model(context.user.id, model_id)
            .await?;
        let title = match body.title {
            Some(title) => title,
            None => current_model.title,
        };
        model = Some(
            mutation_service
                .update_model(UpdateModelDefinitionCommand {
                    actor_user_id: context.user.id,
                    model_id,
                    external_table_id: body.external_table_id.or(current_model.external_table_id),
                    title,
                })
                .await?,
        );
    }
    if requested_status.is_some() || requested_api_exposure_status.is_some() {
        let status = if let Some(status) = requested_status {
            status
        } else if let Some(model) = model.as_ref() {
            model.status
        } else {
            ModelDefinitionService::new(state.store.clone())
                .get_model(context.user.id, model_id)
                .await?
                .status
        };
        model = Some(
            mutation_service
                .update_model_status(UpdateModelDefinitionStatusCommand {
                    actor_user_id: context.user.id,
                    model_id,
                    status,
                    api_exposure_status: requested_api_exposure_status
                        .unwrap_or_else(|| domain::ApiExposureStatus::default_for_status(status)),
                })
                .await?,
        );
    }
    let model = model.ok_or(control_plane::errors::ControlPlaneError::InvalidInput(
        "model_update",
    ))?;

    Ok(Json(ApiSuccess::new(to_model_definition_response(model))))
}

#[utoipa::path(
    delete,
    path = "/api/console/models/{id}",
    params(
        ("id" = String, Path, description = "Model definition id"),
        ("confirmed" = Option<bool>, Query, description = "Must be true to confirm deletion")
    ),
    responses((status = 200, body = DeletedResponse), (status = 400, body = crate::error_response::ErrorBody), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn delete_model(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
    Query(query): Query<ConfirmationQuery>,
) -> Result<Json<ApiSuccess<serde_json::Value>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    mutation_service(&state)
        .delete_model(DeleteModelDefinitionCommand {
            actor_user_id: context.user.id,
            model_id: parse_uuid(&model_id, "model_id")?,
            confirmed: query.confirmed.unwrap_or(false),
        })
        .await?;

    Ok(Json(ApiSuccess::new(
        serde_json::json!({ "deleted": true }),
    )))
}

#[utoipa::path(
    post,
    path = "/api/console/models/{id}/fields",
    request_body = CreateModelFieldBody,
    params(("id" = String, Path, description = "Model definition id")),
    responses((status = 201, body = ModelFieldResponse), (status = 400, body = crate::error_response::ErrorBody), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn create_field(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
    Json(body): Json<CreateModelFieldBody>,
) -> Result<(StatusCode, Json<ApiSuccess<ModelFieldResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let field = mutation_service(&state)
        .add_field(AddModelFieldCommand {
            actor_user_id: context.user.id,
            model_id: parse_uuid(&model_id, "model_id")?,
            code: body.code,
            title: body.title,
            external_field_key: body.external_field_key,
            field_kind: parse_field_kind(&body.field_kind)?,
            is_required: body.is_required,
            is_unique: body.is_unique,
            default_value: body.default_value,
            display_interface: body.display_interface,
            display_options: body.display_options,
            relation_target_model_id: body
                .relation_target_model_id
                .as_deref()
                .map(|value| parse_uuid(value, "relation_target_model_id"))
                .transpose()?,
            relation_options: body.relation_options,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(to_model_field_response(field))),
    ))
}

#[utoipa::path(
    patch,
    path = "/api/console/models/{id}/fields/{field_id}",
    request_body = UpdateModelFieldBody,
    params(
        ("id" = String, Path, description = "Model definition id"),
        ("field_id" = String, Path, description = "Model field id")
    ),
    responses((status = 200, body = ModelFieldResponse), (status = 400, body = crate::error_response::ErrorBody), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn update_field(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((model_id, field_id)): Path<(String, String)>,
    Json(body): Json<UpdateModelFieldBody>,
) -> Result<Json<ApiSuccess<ModelFieldResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let field = mutation_service(&state)
        .update_field(UpdateModelFieldCommand {
            actor_user_id: context.user.id,
            model_id: parse_uuid(&model_id, "model_id")?,
            field_id: parse_uuid(&field_id, "field_id")?,
            title: body.title,
            is_required: body.is_required,
            is_unique: body.is_unique,
            default_value: body.default_value,
            display_interface: body.display_interface,
            display_options: body.display_options,
            relation_options: body.relation_options,
        })
        .await?;

    Ok(Json(ApiSuccess::new(to_model_field_response(field))))
}

#[utoipa::path(
    delete,
    path = "/api/console/models/{id}/fields/{field_id}",
    params(
        ("id" = String, Path, description = "Model definition id"),
        ("field_id" = String, Path, description = "Model field id"),
        ("confirmed" = Option<bool>, Query, description = "Must be true to confirm deletion")
    ),
    responses((status = 200, body = DeletedResponse), (status = 400, body = crate::error_response::ErrorBody), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn delete_field(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((model_id, field_id)): Path<(String, String)>,
    Query(query): Query<ConfirmationQuery>,
) -> Result<Json<ApiSuccess<serde_json::Value>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    mutation_service(&state)
        .delete_field(DeleteModelFieldCommand {
            actor_user_id: context.user.id,
            model_id: parse_uuid(&model_id, "model_id")?,
            field_id: parse_uuid(&field_id, "field_id")?,
            confirmed: query.confirmed.unwrap_or(false),
        })
        .await?;

    Ok(Json(ApiSuccess::new(
        serde_json::json!({ "deleted": true }),
    )))
}

#[utoipa::path(
    post,
    path = "/api/console/models/{id}/scope-grants",
    request_body = CreateScopeGrantBody,
    params(("id" = String, Path, description = "Model definition id")),
    responses((status = 201, body = ScopeGrantResponse), (status = 400, body = crate::error_response::ErrorBody), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn create_scope_grant(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
    Json(body): Json<CreateScopeGrantBody>,
) -> Result<(StatusCode, Json<ApiSuccess<ScopeGrantResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let grant = ModelDefinitionService::new(state.store.clone())
        .create_scope_grant(CreateScopeDataModelGrantCommand {
            actor_user_id: context.user.id,
            scope_kind: parse_scope_kind(&body.scope_kind)?,
            scope_id: body.scope_id,
            data_model_id: parse_uuid(&model_id, "model_id")?,
            enabled: body.enabled,
            permission_profile: body.permission_profile,
            confirm_unsafe_external_source_system_all: body
                .confirm_unsafe_external_source_system_all,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(to_scope_grant_response(grant))),
    ))
}

#[utoipa::path(
    patch,
    path = "/api/console/models/{id}/scope-grants/{grant_id}",
    request_body = UpdateScopeGrantBody,
    params(
        ("id" = String, Path, description = "Model definition id"),
        ("grant_id" = String, Path, description = "Scope grant id")
    ),
    responses((status = 200, body = ScopeGrantResponse), (status = 400, body = crate::error_response::ErrorBody), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn update_scope_grant(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((model_id, grant_id)): Path<(String, String)>,
    Json(body): Json<UpdateScopeGrantBody>,
) -> Result<Json<ApiSuccess<ScopeGrantResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;
    if body.enabled.is_none() && body.permission_profile.is_none() {
        return Err(
            control_plane::errors::ControlPlaneError::InvalidInput("scope_grant_update").into(),
        );
    }

    let grant = ModelDefinitionService::new(state.store.clone())
        .update_scope_grant(UpdateScopeDataModelGrantCommand {
            actor_user_id: context.user.id,
            data_model_id: parse_uuid(&model_id, "model_id")?,
            grant_id: parse_uuid(&grant_id, "grant_id")?,
            enabled: body.enabled,
            permission_profile: body.permission_profile,
            confirm_unsafe_external_source_system_all: body
                .confirm_unsafe_external_source_system_all,
        })
        .await?;

    Ok(Json(ApiSuccess::new(to_scope_grant_response(grant))))
}

#[utoipa::path(
    delete,
    path = "/api/console/models/{id}/scope-grants/{grant_id}",
    params(
        ("id" = String, Path, description = "Model definition id"),
        ("grant_id" = String, Path, description = "Scope grant id")
    ),
    responses((status = 200, body = DeletedResponse), (status = 400, body = crate::error_response::ErrorBody), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn delete_scope_grant(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((model_id, grant_id)): Path<(String, String)>,
) -> Result<Json<ApiSuccess<serde_json::Value>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    ModelDefinitionService::new(state.store.clone())
        .delete_scope_grant(DeleteScopeDataModelGrantCommand {
            actor_user_id: context.user.id,
            data_model_id: parse_uuid(&model_id, "model_id")?,
            grant_id: parse_uuid(&grant_id, "grant_id")?,
        })
        .await?;

    Ok(Json(ApiSuccess::new(
        serde_json::json!({ "deleted": true }),
    )))
}
