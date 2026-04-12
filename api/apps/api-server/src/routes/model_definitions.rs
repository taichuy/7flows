use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use control_plane::model_definition::{
    CreateModelDefinitionCommand, ModelDefinitionService, PublishModelCommand,
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
    pub code: String,
    pub name: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ModelDefinitionResponse {
    pub id: String,
    pub code: String,
    pub name: String,
    pub status: String,
    pub published_version: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ResourceDescriptorResponse {
    pub code: String,
    pub kind: String,
    pub plane: String,
    pub exposure: String,
    pub tenant_scope: String,
    pub trust_level: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PublishModelResponse {
    pub model: ModelDefinitionResponse,
    pub resource: ResourceDescriptorResponse,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/models", get(list_models).post(create_model))
        .route("/models/:id/actions/publish", post(publish_model))
}

fn to_model_definition_response(model: domain::ModelDefinitionRecord) -> ModelDefinitionResponse {
    ModelDefinitionResponse {
        id: model.id.to_string(),
        code: model.code,
        name: model.name,
        status: model.status.as_str().to_string(),
        published_version: model.published_version,
    }
}

fn to_resource_descriptor_response(
    resource: runtime_core::resource_descriptor::ResourceDescriptor,
) -> ResourceDescriptorResponse {
    ResourceDescriptorResponse {
        code: resource.code,
        kind: format!("{:?}", resource.kind),
        plane: format!("{:?}", resource.plane),
        exposure: format!("{:?}", resource.exposure),
        tenant_scope: format!("{:?}", resource.tenant_scope),
        trust_level: format!("{:?}", resource.trust_level),
    }
}

fn parse_model_id(model_id: &str) -> Result<Uuid, ApiError> {
    Uuid::parse_str(model_id)
        .map_err(|_| control_plane::errors::ControlPlaneError::InvalidInput("model_id").into())
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

    let model = ModelDefinitionService::new(state.store.clone())
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: context.user.id,
            code: body.code,
            name: body.name,
        })
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ApiSuccess::new(to_model_definition_response(model))),
    ))
}

#[utoipa::path(
    post,
    path = "/api/console/models/{id}/actions/publish",
    params(("id" = String, Path, description = "Model definition id")),
    responses((status = 200, body = PublishModelResponse), (status = 403, body = crate::error_response::ErrorBody))
)]
pub async fn publish_model(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
) -> Result<Json<ApiSuccess<PublishModelResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let published = ModelDefinitionService::new(state.store.clone())
        .publish_model(PublishModelCommand {
            actor_user_id: context.user.id,
            model_id: parse_model_id(&model_id)?,
        })
        .await?;

    Ok(Json(ApiSuccess::new(PublishModelResponse {
        model: to_model_definition_response(published.model),
        resource: to_resource_descriptor_response(published.resource),
    })))
}
