extern crate self as api_server;

pub mod app_state;
pub mod config;
pub mod error_response;
pub mod middleware;
pub mod openapi;
pub mod openapi_docs;
pub mod response;
pub mod routes;
pub mod runtime_registry_sync;

use std::{net::SocketAddr, sync::Arc};

use anyhow::Result;
use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use axum::{routing::get, Json, Router};
use control_plane::bootstrap::{BootstrapConfig, BootstrapService};
use rand_core::OsRng;
use serde::Serialize;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use storage_redis::RedisSessionStore;
use tower_http::{
    cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use utoipa::{OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;

use crate::{
    app_state::{ApiState, SessionStoreHandle},
    config::{ApiConfig, ApiEnvironment},
};

pub const DEFAULT_API_SERVER_ADDR: &str = "0.0.0.0:7800";

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct HealthResponse {
    pub service: &'static str,
    pub status: &'static str,
    pub version: &'static str,
}

#[utoipa::path(get, path = "/health", responses((status = 200, body = HealthResponse)))]
async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        service: "api-server",
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[utoipa::path(
    get,
    path = "/api/console/health",
    responses((status = 200, body = HealthResponse))
)]
async fn console_health() -> Json<HealthResponse> {
    health().await
}

pub fn parse_bind_addr(candidate: Option<&str>, default_addr: &str) -> SocketAddr {
    candidate
        .and_then(|value| value.parse().ok())
        .unwrap_or_else(|| default_addr.parse().unwrap())
}

fn development_cors_layer() -> CorsLayer {
    CorsLayer::very_permissive()
}

fn cors_layer(config: &ApiConfig) -> CorsLayer {
    let base = CorsLayer::new()
        .allow_credentials(true)
        .allow_headers(AllowHeaders::mirror_request())
        .allow_methods(AllowMethods::mirror_request());

    match &config.cors_allowed_origins {
        Some(origins) => base.allow_origin(AllowOrigin::list(origins.clone())),
        None => development_cors_layer(),
    }
}

fn base_router(include_legacy_docs: bool) -> Router {
    let router = Router::new()
        .route("/health", get(health))
        .route("/api/console/health", get(console_health));

    if include_legacy_docs {
        router.merge(SwaggerUi::new("/docs").url("/openapi.json", openapi::ApiDoc::openapi()))
    } else {
        router
    }
}

pub fn app() -> Router {
    base_router(true)
        .layer(development_cors_layer())
        .layer(TraceLayer::new_for_http())
}

pub fn app_with_state(state: Arc<ApiState>) -> Router {
    base_router(true)
        .merge(console_router(state))
        .layer(development_cors_layer())
        .layer(TraceLayer::new_for_http())
}

fn console_router(state: Arc<ApiState>) -> Router {
    Router::new()
        .nest("/api/console", routes::docs::router())
        .nest("/api/console", routes::me::router())
        .nest("/api/console", routes::workspace::router())
        .nest("/api/console", routes::members::router())
        .nest("/api/console", routes::model_definitions::router())
        .nest("/api/console", routes::roles::router())
        .nest("/api/console", routes::permissions::router())
        .nest("/api/console", routes::session::router())
        .nest("/api/console", routes::workspaces::router())
        .nest("/api/runtime", routes::runtime_models::router())
        .nest("/api/public/auth", routes::auth::router())
        .with_state(state)
}

pub fn app_with_state_and_config(state: Arc<ApiState>, config: &ApiConfig) -> Router {
    base_router(config.env != ApiEnvironment::Production)
        .merge(console_router(state))
        .layer(cors_layer(config))
        .layer(TraceLayer::new_for_http())
}

pub async fn app_from_env() -> Result<Router> {
    let config = ApiConfig::from_env()?;
    app_from_config(&config).await
}

pub async fn app_from_config(config: &ApiConfig) -> Result<Router> {
    let pool = connect(&config.database_url).await?;
    run_migrations(&pool).await?;

    let store = PgControlPlaneStore::new(pool);
    let session_store = RedisSessionStore::new(&config.redis_url).await?;
    let salt = SaltString::generate(&mut OsRng);
    let root_password_hash = Argon2::default()
        .hash_password(config.bootstrap_root_password.as_bytes(), &salt)
        .map_err(|err| anyhow::anyhow!("failed to hash bootstrap root password: {err}"))?
        .to_string();

    BootstrapService::new(store.clone())
        .run(&BootstrapConfig {
            workspace_name: config.bootstrap_workspace_name.clone(),
            root_account: config.bootstrap_root_account.clone(),
            root_email: config.bootstrap_root_email.clone(),
            root_password_hash,
            root_name: config.bootstrap_root_name.clone(),
            root_nickname: config.bootstrap_root_nickname.clone(),
        })
        .await?;
    let runtime_registry = runtime_core::runtime_model_registry::RuntimeModelRegistry::default();
    runtime_registry.rebuild(store.list_runtime_model_metadata().await?);
    let runtime_engine = Arc::new(runtime_core::runtime_engine::RuntimeEngine::new(
        runtime_registry,
        Arc::new(store.clone()),
    ));
    let api_docs = Arc::new(
        openapi_docs::build_default_api_docs_registry_with_cookie_name(&config.cookie_name)?,
    );

    Ok(app_with_state_and_config(
        Arc::new(ApiState {
            store,
            runtime_engine,
            session_store: SessionStoreHandle::Redis(Box::new(session_store)),
            api_docs,
            cookie_name: config.cookie_name.clone(),
            session_ttl_days: config.session_ttl_days,
            bootstrap_workspace_name: config.bootstrap_workspace_name.clone(),
        }),
        config,
    ))
}

pub fn init_tracing() {
    let _ = tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .try_init();
}

#[cfg(test)]
mod tests {
    use super::{parse_bind_addr, DEFAULT_API_SERVER_ADDR};

    #[test]
    fn parse_bind_addr_uses_new_default_api_port() {
        let addr = parse_bind_addr(None, DEFAULT_API_SERVER_ADDR);

        assert_eq!(addr.to_string(), "0.0.0.0:7800");
    }

    #[test]
    fn parse_bind_addr_falls_back_when_value_is_invalid() {
        let addr = parse_bind_addr(Some("not-an-addr"), DEFAULT_API_SERVER_ADDR);

        assert_eq!(addr.to_string(), "0.0.0.0:7800");
    }
}

#[cfg(test)]
mod _tests;
