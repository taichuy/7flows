use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde_json::Value;

use crate::{
    app_state::ApiState,
    error_response::ApiError,
    middleware::{require_csrf::require_csrf, require_session::require_session},
    response::ApiSuccess,
};

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route(
            "/models/:model_code/records",
            get(list_records).post(create_record),
        )
        .route(
            "/models/:model_code/records/:id/actions/:action_code",
            post(run_action),
        )
}

pub async fn list_records(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_code): Path<String>,
) -> Result<Json<ApiSuccess<Vec<Value>>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    let records = runtime_core::runtime_engine::InMemoryRuntimeEngine::shared()
        .list_records(runtime_core::runtime_engine::RuntimeQueryInput {
            actor_user_id: context.user.id,
            model_code,
        })
        .await?;

    Ok(Json(ApiSuccess::new(records)))
}

pub async fn create_record(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(model_code): Path<String>,
    Json(payload): Json<Value>,
) -> Result<(StatusCode, Json<ApiSuccess<Value>>), ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let record = runtime_core::runtime_engine::InMemoryRuntimeEngine::shared()
        .create_record(runtime_core::runtime_engine::RuntimeCreateInput {
            actor_user_id: context.user.id,
            model_code,
            payload,
        })
        .await?;

    Ok((StatusCode::CREATED, Json(ApiSuccess::new(record))))
}

pub async fn run_action(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path((model_code, record_id, action_code)): Path<(String, String, String)>,
) -> Result<Json<ApiSuccess<Value>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    require_csrf(&headers, &context.session)?;

    let result = runtime_core::runtime_engine::InMemoryRuntimeEngine::shared()
        .run_action(context.user.id, &model_code, &record_id, &action_code)
        .await?;

    Ok(Json(ApiSuccess::new(result)))
}
