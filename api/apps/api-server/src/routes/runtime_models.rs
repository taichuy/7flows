use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    response::ApiSuccess,
};

fn map_runtime_error(error: anyhow::Error) -> ApiError {
    if let Some(runtime_core::runtime_acl::RuntimeAclError::PermissionDenied(reason)) =
        error.downcast_ref::<runtime_core::runtime_acl::RuntimeAclError>()
    {
        return control_plane::errors::ControlPlaneError::PermissionDenied(reason).into();
    }

    if error.to_string().contains("runtime record not found") {
        return control_plane::errors::ControlPlaneError::NotFound("runtime_record").into();
    }

    if error
        .downcast_ref::<runtime_core::runtime_engine::RuntimeModelError>()
        .is_some()
    {
        return control_plane::errors::ControlPlaneError::Conflict("runtime_model_unavailable")
            .into();
    }

    error.into()
}

#[derive(Debug, Deserialize, Default)]
pub struct RuntimeListQueryParams {
    pub filter: Option<String>,
    pub sort: Option<String>,
    pub expand: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

#[derive(Debug, ToSchema)]
#[schema(value_type = Object)]
pub struct RuntimeRecordEnvelope(#[allow(dead_code)] Value);

#[derive(Debug, Serialize, ToSchema)]
pub struct RuntimeListResponse {
    #[schema(value_type = Vec<RuntimeRecordEnvelope>)]
    pub items: Vec<Value>,
    pub total: i64,
}

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route(
            "/models/:model_code/records",
            get(list_records).post(create_record),
        )
        .route(
            "/models/:model_code/records/:id",
            get(get_record).patch(update_record).delete(delete_record),
        )
}

fn parse_filters(
    filter: Option<&str>,
) -> Result<Vec<runtime_core::runtime_engine::RuntimeFilterInput>, ApiError> {
    let Some(filter) = filter else {
        return Ok(vec![]);
    };
    let mut parts = filter.splitn(3, ':');
    let field_code = parts
        .next()
        .ok_or(control_plane::errors::ControlPlaneError::InvalidInput(
            "filter",
        ))?;
    let operator = parts
        .next()
        .ok_or(control_plane::errors::ControlPlaneError::InvalidInput(
            "filter",
        ))?;
    let value = parts
        .next()
        .ok_or(control_plane::errors::ControlPlaneError::InvalidInput(
            "filter",
        ))?;

    Ok(vec![runtime_core::runtime_engine::RuntimeFilterInput {
        field_code: field_code.to_string(),
        operator: operator.to_string(),
        value: serde_json::json!(value),
    }])
}

fn parse_sorts(
    sort: Option<&str>,
) -> Result<Vec<runtime_core::runtime_engine::RuntimeSortInput>, ApiError> {
    let Some(sort) = sort else {
        return Ok(vec![]);
    };
    let mut parts = sort.splitn(2, ':');
    let field_code = parts
        .next()
        .ok_or(control_plane::errors::ControlPlaneError::InvalidInput(
            "sort",
        ))?;
    let direction = parts
        .next()
        .ok_or(control_plane::errors::ControlPlaneError::InvalidInput(
            "sort",
        ))?;

    Ok(vec![runtime_core::runtime_engine::RuntimeSortInput {
        field_code: field_code.to_string(),
        direction: direction.to_string(),
    }])
}

fn parse_expand(expand: Option<&str>) -> Vec<String> {
    expand
        .map(|expand| {
            expand
                .split(',')
                .filter(|item| !item.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

#[utoipa::path(
    get,
    path = "/api/runtime/models/{model_code}/records",
    params(("model_code" = String, Path, description = "Runtime model code")),
    responses((status = 200, body = RuntimeListResponse), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody), (status = 409, body = crate::error_response::ErrorBody))
)]
pub async fn list_records(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_code): Path<String>,
    Query(query): Query<RuntimeListQueryParams>,
) -> Result<Json<ApiSuccess<RuntimeListResponse>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let result = state
        .runtime_engine
        .list_records(runtime_core::runtime_engine::RuntimeListInput {
            actor: context.actor.clone(),
            app_id: None,
            model_code,
            filters: parse_filters(query.filter.as_deref())?,
            sorts: parse_sorts(query.sort.as_deref())?,
            expand_relations: parse_expand(query.expand.as_deref()),
            page: query.page.unwrap_or(1),
            page_size: query.page_size.unwrap_or(20),
        })
        .await
        .map_err(map_runtime_error)?;

    Ok(Json(ApiSuccess::new(RuntimeListResponse {
        items: result.items,
        total: result.total,
    })))
}

#[utoipa::path(
    get,
    path = "/api/runtime/models/{model_code}/records/{id}",
    params(
        ("model_code" = String, Path, description = "Runtime model code"),
        ("id" = String, Path, description = "Runtime record id")
    ),
    responses((status = 200, body = RuntimeRecordEnvelope), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody), (status = 409, body = crate::error_response::ErrorBody))
)]
pub async fn get_record(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((model_code, record_id)): Path<(String, String)>,
) -> Result<Json<ApiSuccess<Value>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let record = state
        .runtime_engine
        .get_record(runtime_core::runtime_engine::RuntimeGetInput {
            actor: context.actor.clone(),
            app_id: None,
            model_code,
            record_id,
        })
        .await
        .map_err(map_runtime_error)?
        .ok_or(control_plane::errors::ControlPlaneError::NotFound(
            "runtime_record",
        ))?;

    Ok(Json(ApiSuccess::new(record)))
}

#[utoipa::path(
    post,
    path = "/api/runtime/models/{model_code}/records",
    request_body = RuntimeRecordEnvelope,
    params(("model_code" = String, Path, description = "Runtime model code")),
    responses((status = 201, body = RuntimeRecordEnvelope), (status = 400, body = crate::error_response::ErrorBody), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody), (status = 409, body = crate::error_response::ErrorBody))
)]
pub async fn create_record(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_code): Path<String>,
    Json(payload): Json<Value>,
) -> Result<(StatusCode, Json<ApiSuccess<Value>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let record = state
        .runtime_engine
        .create_record(runtime_core::runtime_engine::RuntimeCreateInput {
            actor: context.actor.clone(),
            app_id: None,
            model_code,
            payload,
        })
        .await
        .map_err(map_runtime_error)?;

    Ok((StatusCode::CREATED, Json(ApiSuccess::new(record))))
}

#[utoipa::path(
    patch,
    path = "/api/runtime/models/{model_code}/records/{id}",
    request_body = RuntimeRecordEnvelope,
    params(
        ("model_code" = String, Path, description = "Runtime model code"),
        ("id" = String, Path, description = "Runtime record id")
    ),
    responses((status = 200, body = RuntimeRecordEnvelope), (status = 400, body = crate::error_response::ErrorBody), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody), (status = 409, body = crate::error_response::ErrorBody))
)]
pub async fn update_record(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((model_code, record_id)): Path<(String, String)>,
    Json(payload): Json<Value>,
) -> Result<Json<ApiSuccess<Value>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let record = state
        .runtime_engine
        .update_record(runtime_core::runtime_engine::RuntimeUpdateInput {
            actor: context.actor.clone(),
            app_id: None,
            model_code,
            record_id,
            payload,
        })
        .await
        .map_err(map_runtime_error)?;

    Ok(Json(ApiSuccess::new(record)))
}

#[utoipa::path(
    delete,
    path = "/api/runtime/models/{model_code}/records/{id}",
    params(
        ("model_code" = String, Path, description = "Runtime model code"),
        ("id" = String, Path, description = "Runtime record id")
    ),
    responses((status = 200, body = RuntimeRecordEnvelope), (status = 401, body = crate::error_response::ErrorBody), (status = 403, body = crate::error_response::ErrorBody), (status = 404, body = crate::error_response::ErrorBody))
)]
pub async fn delete_record(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((model_code, record_id)): Path<(String, String)>,
) -> Result<Json<ApiSuccess<Value>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let result = state
        .runtime_engine
        .delete_record(runtime_core::runtime_engine::RuntimeDeleteInput {
            actor: context.actor.clone(),
            app_id: None,
            model_code,
            record_id,
        })
        .await
        .map_err(map_runtime_error)?;

    Ok(Json(ApiSuccess::new(result)))
}
