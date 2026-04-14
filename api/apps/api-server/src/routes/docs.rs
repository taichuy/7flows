use std::sync::Arc;

use access_control::ensure_permission;
use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::get,
    Json, Router,
};
use control_plane::errors::ControlPlaneError;
use serde_json::Value;

use crate::{
    app_state::ApiState, error_response::ApiError, middleware::require_session::require_session,
    openapi_docs::DocsCatalog, response::ApiSuccess,
};

pub fn router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/docs/catalog", get(get_docs_catalog))
        .route(
            "/docs/operations/:operation_id/openapi.json",
            get(get_operation_openapi),
        )
}

pub async fn get_docs_catalog(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<DocsCatalog>>, ApiError> {
    let context = require_session(&state, &headers).await?;
    ensure_permission(&context.actor, "api_reference.view.all")
        .map_err(ControlPlaneError::PermissionDenied)?;

    Ok(Json(ApiSuccess::new(state.api_docs.catalog().clone())))
}

pub async fn get_operation_openapi(
    State(state): State<Arc<ApiState>>,
    headers: HeaderMap,
    Path(operation_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let context = require_session(&state, &headers).await?;
    ensure_permission(&context.actor, "api_reference.view.all")
        .map_err(ControlPlaneError::PermissionDenied)?;

    let spec = state
        .api_docs
        .operation_spec(&operation_id)
        .cloned()
        .ok_or(ControlPlaneError::NotFound("operation_id"))?;

    Ok(Json(spec))
}
