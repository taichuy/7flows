use std::{net::SocketAddr, sync::Arc};

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use plugin_framework::{
    error::{PluginFrameworkError, PluginFrameworkErrorKind},
    provider_contract::ProviderInvocationInput,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::provider_host::{
    LoadedProviderSummary, ProviderHost, ProviderInvokeStreamOutput, ProviderModelsOutput,
    ProviderValidationOutput,
};

pub const DEFAULT_PLUGIN_RUNNER_ADDR: &str = "0.0.0.0:7801";

pub mod package_loader;
pub mod provider_host;

#[derive(Debug, Clone, Serialize)]
pub struct HealthResponse {
    pub service: &'static str,
    pub status: &'static str,
    pub version: &'static str,
}

#[derive(Debug, Clone, Default)]
pub struct AppState {
    provider_host: Arc<RwLock<ProviderHost>>,
}

#[derive(Debug, Deserialize)]
struct LoadProviderRequest {
    package_root: String,
}

#[derive(Debug, Deserialize)]
struct ReloadProviderRequest {
    plugin_id: String,
}

#[derive(Debug, Deserialize)]
struct ValidateProviderRequest {
    plugin_id: String,
    #[serde(default)]
    provider_config: Value,
}

#[derive(Debug, Deserialize)]
struct ListModelsRequest {
    plugin_id: String,
    #[serde(default)]
    provider_config: Value,
}

#[derive(Debug, Deserialize)]
struct InvokeProviderRequest {
    plugin_id: String,
    input: ProviderInvocationInput,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    message: String,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        service: "plugin-runner",
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn load_provider(
    State(state): State<AppState>,
    Json(request): Json<LoadProviderRequest>,
) -> Result<Json<LoadedProviderSummary>, (StatusCode, Json<ErrorResponse>)> {
    let mut host = state.provider_host.write().await;
    host.load(&request.package_root)
        .map(Json)
        .map_err(map_framework_error)
}

async fn reload_provider(
    State(state): State<AppState>,
    Json(request): Json<ReloadProviderRequest>,
) -> Result<Json<LoadedProviderSummary>, (StatusCode, Json<ErrorResponse>)> {
    let mut host = state.provider_host.write().await;
    host.reload(&request.plugin_id)
        .map(Json)
        .map_err(map_framework_error)
}

async fn validate_provider(
    State(state): State<AppState>,
    Json(request): Json<ValidateProviderRequest>,
) -> Result<Json<ProviderValidationOutput>, (StatusCode, Json<ErrorResponse>)> {
    let host = state.provider_host.read().await;
    host.validate(&request.plugin_id, request.provider_config)
        .await
        .map(Json)
        .map_err(map_framework_error)
}

async fn list_models(
    State(state): State<AppState>,
    Json(request): Json<ListModelsRequest>,
) -> Result<Json<ProviderModelsOutput>, (StatusCode, Json<ErrorResponse>)> {
    let host = state.provider_host.read().await;
    host.list_models(&request.plugin_id, request.provider_config)
        .await
        .map(Json)
        .map_err(map_framework_error)
}

async fn invoke_stream(
    State(state): State<AppState>,
    Json(request): Json<InvokeProviderRequest>,
) -> Result<Json<ProviderInvokeStreamOutput>, (StatusCode, Json<ErrorResponse>)> {
    let host = state.provider_host.read().await;
    host.invoke_stream(&request.plugin_id, request.input)
        .await
        .map(Json)
        .map_err(map_framework_error)
}

pub fn parse_bind_addr(candidate: Option<&str>, default_addr: &str) -> SocketAddr {
    candidate
        .and_then(|value| value.parse().ok())
        .unwrap_or_else(|| default_addr.parse().unwrap())
}

pub fn app() -> Router {
    app_with_state(AppState::default())
}

pub fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/providers/load", post(load_provider))
        .route("/providers/reload", post(reload_provider))
        .route("/providers/validate", post(validate_provider))
        .route("/providers/list-models", post(list_models))
        .route("/providers/invoke-stream", post(invoke_stream))
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

pub fn init_tracing() {
    let _ = tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .try_init();
}

fn map_framework_error(error: PluginFrameworkError) -> (StatusCode, Json<ErrorResponse>) {
    let status = match error.kind() {
        PluginFrameworkErrorKind::Io | PluginFrameworkErrorKind::RuntimeContract => {
            StatusCode::BAD_GATEWAY
        }
        PluginFrameworkErrorKind::InvalidAssignment
        | PluginFrameworkErrorKind::InvalidProviderPackage
        | PluginFrameworkErrorKind::InvalidProviderContract
        | PluginFrameworkErrorKind::Serialization => StatusCode::BAD_REQUEST,
    };
    (
        status,
        Json(ErrorResponse {
            message: error.to_string(),
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::{parse_bind_addr, DEFAULT_PLUGIN_RUNNER_ADDR};

    #[test]
    fn parse_bind_addr_uses_runner_default_port() {
        let addr = parse_bind_addr(None, DEFAULT_PLUGIN_RUNNER_ADDR);

        assert_eq!(addr.to_string(), "0.0.0.0:7801");
    }

    #[test]
    fn parse_bind_addr_keeps_valid_override() {
        let addr = parse_bind_addr(Some("127.0.0.1:8899"), DEFAULT_PLUGIN_RUNNER_ADDR);

        assert_eq!(addr.to_string(), "127.0.0.1:8899");
    }
}
