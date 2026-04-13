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
pub struct CreateModelDefinitionBody {
    pub scope_kind: String,
    pub scope_id: Option<String>,
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
        "team" => Ok(domain::DataModelScopeKind::Team),
        "app" => Ok(domain::DataModelScopeKind::App),
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

async fn refresh_runtime_registry(state: &ApiState) -> Result<(), ApiError> {
    let metadata = state.store.list_runtime_model_metadata().await?;
    state.runtime_engine.registry().rebuild(metadata);
    Ok(())
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
    let scope_id = match scope_kind {
        domain::DataModelScopeKind::Team => body
            .scope_id
            .as_deref()
            .map(|value| parse_uuid(value, "scope_id"))
            .transpose()?
            .unwrap_or(context.actor.team_id),
        domain::DataModelScopeKind::App => body
            .scope_id
            .as_deref()
            .ok_or(control_plane::errors::ControlPlaneError::InvalidInput(
                "scope_id",
            ))?
            .pipe(|value| parse_uuid(value, "scope_id"))?,
    };

    let model = ModelDefinitionService::new(state.store.clone())
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: context.user.id,
            scope_kind,
            scope_id,
            code: body.code,
            title: body.title,
        })
        .await?;
    refresh_runtime_registry(&state).await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(to_model_definition_response(model))),
    ))
}

pub async fn get_model(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
) -> Result<Json<ApiSuccess<ModelDefinitionResponse>>, ApiError> {
    let _context = require_session(&state, &headers).await?;
    let model = ModelDefinitionService::new(state.store.clone())
        .get_model(parse_uuid(&model_id, "model_id")?)
        .await?;

    Ok(Json(ApiSuccess::new(to_model_definition_response(model))))
}

pub async fn update_model(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
    Json(body): Json<UpdateModelDefinitionBody>,
) -> Result<Json<ApiSuccess<ModelDefinitionResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let model = ModelDefinitionService::new(state.store.clone())
        .update_model(UpdateModelDefinitionCommand {
            actor_user_id: context.user.id,
            model_id: parse_uuid(&model_id, "model_id")?,
            title: body.title,
        })
        .await?;
    refresh_runtime_registry(&state).await?;

    Ok(Json(ApiSuccess::new(to_model_definition_response(model))))
}

pub async fn delete_model(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
    Query(query): Query<ConfirmationQuery>,
) -> Result<Json<ApiSuccess<serde_json::Value>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    ModelDefinitionService::new(state.store.clone())
        .delete_model(DeleteModelDefinitionCommand {
            actor_user_id: context.user.id,
            model_id: parse_uuid(&model_id, "model_id")?,
            confirmed: query.confirmed.unwrap_or(false),
        })
        .await?;
    refresh_runtime_registry(&state).await?;

    Ok(Json(ApiSuccess::new(
        serde_json::json!({ "deleted": true }),
    )))
}

pub async fn create_field(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
    Json(body): Json<CreateModelFieldBody>,
) -> Result<(StatusCode, Json<ApiSuccess<ModelFieldResponse>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let field = ModelDefinitionService::new(state.store.clone())
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
    refresh_runtime_registry(&state).await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(to_model_field_response(field))),
    ))
}

pub async fn update_field(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((model_id, field_id)): Path<(String, String)>,
    Json(body): Json<UpdateModelFieldBody>,
) -> Result<Json<ApiSuccess<ModelFieldResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let field = ModelDefinitionService::new(state.store.clone())
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
    refresh_runtime_registry(&state).await?;

    Ok(Json(ApiSuccess::new(to_model_field_response(field))))
}

pub async fn delete_field(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((model_id, field_id)): Path<(String, String)>,
    Query(query): Query<ConfirmationQuery>,
) -> Result<Json<ApiSuccess<serde_json::Value>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    ModelDefinitionService::new(state.store.clone())
        .delete_field(DeleteModelFieldCommand {
            actor_user_id: context.user.id,
            model_id: parse_uuid(&model_id, "model_id")?,
            field_id: parse_uuid(&field_id, "field_id")?,
            confirmed: query.confirmed.unwrap_or(false),
        })
        .await?;
    refresh_runtime_registry(&state).await?;

    Ok(Json(ApiSuccess::new(
        serde_json::json!({ "deleted": true }),
    )))
}

trait Pipe: Sized {
    fn pipe<T>(self, f: impl FnOnce(Self) -> T) -> T {
        f(self)
    }
}

impl<T> Pipe for T {}
