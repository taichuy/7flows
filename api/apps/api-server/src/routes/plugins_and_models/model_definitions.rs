use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, patch, post},
    Json, Router,
};
use control_plane::model_definition::{
    AddModelFieldCommand, CreateModelDefinitionCommand, DeleteModelDefinitionCommand,
    DeleteModelFieldCommand, ModelDefinitionService, UpdateModelDefinitionCommand,
    UpdateModelFieldCommand,
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
    pub code: String,
    pub title: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateModelDefinitionBody {
    pub title: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateModelFieldBody {
    pub code: String,
    pub title: String,
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

#[derive(Debug, Deserialize)]
pub struct ConfirmationQuery {
    pub confirmed: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ModelFieldResponse {
    pub id: String,
    pub code: String,
    pub title: String,
    pub physical_column_name: String,
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
    pub physical_table_name: String,
    pub acl_namespace: String,
    pub audit_namespace: String,
    pub fields: Vec<ModelFieldResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DeletedResponse {
    pub deleted: bool,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/models", get(list_models).post(create_model))
        .route(
            "/models/:id",
            get(get_model).patch(update_model).delete(delete_model),
        )
        .route("/models/:id/fields", post(create_field))
        .route(
            "/models/:id/fields/:field_id",
            patch(update_field).delete(delete_field),
        )
}

fn empty_json_object() -> serde_json::Value {
    serde_json::json!({})
}

fn to_model_field_response(field: domain::ModelFieldRecord) -> ModelFieldResponse {
    ModelFieldResponse {
        id: field.id.to_string(),
        code: field.code,
        title: field.title,
        physical_column_name: field.physical_column_name,
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

fn to_model_definition_response(model: domain::ModelDefinitionRecord) -> ModelDefinitionResponse {
    ModelDefinitionResponse {
        id: model.id.to_string(),
        scope_kind: model.scope_kind.as_str().to_string(),
        scope_id: model.scope_id.to_string(),
        code: model.code,
        title: model.title,
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
) -> Result<Json<ApiSuccess<Vec<ModelDefinitionResponse>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let models = ModelDefinitionService::new(state.store.clone())
        .list_models(context.user.id)
        .await?;

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
    responses((status = 201, body = ModelDefinitionResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn create_model(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Json(body): Json<CreateModelDefinitionBody>,
) -> Result<(StatusCode, Json<ApiSuccess<ModelDefinitionResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;
    let scope_kind = parse_scope_kind(&body.scope_kind)?;

    let model = mutation_service(&state)
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: context.user.id,
            scope_kind,
            code: body.code,
            title: body.title,
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

    let model = mutation_service(&state)
        .update_model(UpdateModelDefinitionCommand {
            actor_user_id: context.user.id,
            model_id: parse_uuid(&model_id, "model_id")?,
            title: body.title,
        })
        .await?;

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
