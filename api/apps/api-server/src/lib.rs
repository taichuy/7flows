extern crate self as api_server;

pub mod app_state;
pub mod config;
pub mod error_response;
pub mod host_extension_loader;
pub mod middleware;
pub mod official_plugin_registry;
pub mod openapi;
pub mod openapi_docs;
pub mod provider_runtime;
pub mod response;
pub mod routes;
pub mod runtime_profile_client;
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
use storage_durable::build_main_durable_postgres;
use storage_ephemeral::{EphemeralBackendKind, MemorySessionStore, RedisBackedSessionStore};
use time::OffsetDateTime;
use tokio::sync::RwLock;
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
    host_extension_loader::load_host_extensions_at_startup,
    provider_runtime::ApiProviderRuntime,
    provider_runtime::ApiRuntimeServices,
    runtime_profile_client::{HostApiRuntimeProfileCollector, HttpPluginRunnerSystemClient},
};

pub const DEFAULT_API_SERVER_ADDR: &str = "0.0.0.0:7800";
const SESSION_STORE_NAMESPACE: &str = "flowbase:console:session";

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

fn base_router(include_docs_ui: bool) -> Router {
    let router = Router::new()
        .route("/health", get(health))
        .route("/api/console/health", get(console_health));

    if include_docs_ui {
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
        .nest("/api/console", routes::applications::router())
        .nest("/api/console", routes::application_orchestration::router())
        .nest("/api/console", routes::application_runtime::router())
        .nest("/api/console", routes::docs::router())
        .nest("/api/console", routes::data_sources::router())
        .nest("/api/console", routes::me::router())
        .nest("/api/console", routes::workspace::router())
        .nest("/api/console", routes::members::router())
        .nest("/api/console", routes::model_definitions::router())
        .nest("/api/console", routes::model_providers::router())
        .nest("/api/console", routes::node_contributions::router())
        .nest("/api/console", routes::roles::router())
        .nest("/api/console", routes::permissions::router())
        .nest("/api/console", routes::plugins::router())
        .nest("/api/console", routes::session::router())
        .nest("/api/console", routes::system::router())
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
    let durable = build_main_durable_postgres(&config.database_url).await?;
    let store = durable.store.clone();
    let session_store = match config.ephemeral_backend {
        EphemeralBackendKind::Memory => {
            SessionStoreHandle::Memory(MemorySessionStore::new(SESSION_STORE_NAMESPACE))
        }
        EphemeralBackendKind::Redis => SessionStoreHandle::Redis(Box::new(
            RedisBackedSessionStore::new(
                config.ephemeral_redis_url.as_deref().unwrap(),
                SESSION_STORE_NAMESPACE,
            )
            .await?,
        )),
    };
    let salt = SaltString::generate(&mut OsRng);
    let root_password_hash = Argon2::default()
        .hash_password(config.bootstrap_root_password.as_bytes(), &salt)
        .map_err(|err| anyhow::anyhow!("failed to hash bootstrap root password: {err}"))?
        .to_string();
    let _file_storage_registry = Arc::new(storage_object::builtin_driver_registry());

    let bootstrap_result = BootstrapService::new(store.clone())
        .run(&BootstrapConfig {
            workspace_name: config.bootstrap_workspace_name.clone(),
            root_account: config.bootstrap_root_account.clone(),
            root_email: config.bootstrap_root_email.clone(),
            root_password_hash,
            root_name: config.bootstrap_root_name.clone(),
            root_nickname: config.bootstrap_root_nickname.clone(),
        })
        .await?;
    let default_storage = if let Some(existing) =
        <storage_durable::MainDurableStore as control_plane::ports::FileManagementRepository>::get_default_file_storage(&store)
            .await?
    {
        existing
    } else {
        control_plane::file_management::FileStorageService::new(store.clone())
            .create_storage(control_plane::file_management::CreateFileStorageCommand {
                actor_user_id: bootstrap_result.root_user_id,
                code: "local_default".into(),
                title: "Local".into(),
                driver_type: "local".into(),
                enabled: true,
                is_default: true,
                config_json: serde_json::json!({
                    "root_path": config.business_file_local_root.clone(),
                    "public_base_url": null
                }),
                rule_json: serde_json::json!({}),
            })
            .await?
    };
    control_plane::file_management::FileManagementBootstrapService::new(store.clone())
        .ensure_builtin_attachments(
            bootstrap_result.root_user_id,
            default_storage.id,
            "attachments",
        )
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
    let resolved_official_source = config.resolve_official_plugin_source();
    let trusted_public_keys = config.official_plugin_trusted_public_keys()?;
    let process_started_at = OffsetDateTime::now_utc();

    let state = Arc::new(ApiState {
        store,
        runtime_engine,
        provider_runtime: Arc::new(ApiRuntimeServices::new(
            Arc::new(RwLock::new(
                plugin_runner::provider_host::ProviderHost::default(),
            )),
            Arc::new(RwLock::new(
                plugin_runner::capability_host::CapabilityHost::default(),
            )),
            Arc::new(RwLock::new(
                plugin_runner::data_source_host::DataSourceHost::default(),
            )),
        )),
        process_started_at,
        api_runtime_profile: Arc::new(HostApiRuntimeProfileCollector),
        plugin_runner_system: Arc::new(HttpPluginRunnerSystemClient::new(
            config.plugin_runner_internal_base_url.clone(),
        )),
        official_plugin_source: Arc::new(official_plugin_registry::ApiOfficialPluginRegistry::new(
            resolved_official_source,
            trusted_public_keys,
        )),
        provider_install_root: config.provider_install_root.clone(),
        provider_secret_master_key: config.provider_secret_master_key.clone(),
        host_extension_dropin_root: config.host_extension_dropin_root.clone(),
        allow_unverified_filesystem_dropins: config.allow_unverified_filesystem_dropins,
        allow_uploaded_host_extensions: config.allow_uploaded_host_extensions,
        session_store,
        api_docs,
        cookie_name: config.cookie_name.clone(),
        session_ttl_days: config.session_ttl_days,
        bootstrap_workspace_name: config.bootstrap_workspace_name.clone(),
    });
    control_plane::plugin_management::PluginManagementService::new(
        state.store.clone(),
        ApiProviderRuntime::new(state.provider_runtime.clone()),
        state.official_plugin_source.clone(),
        state.provider_install_root.clone(),
    )
    .with_allow_uploaded_host_extensions(state.allow_uploaded_host_extensions)
    .reconcile_all_installations()
    .await?;
    load_host_extensions_at_startup(&state).await?;

    Ok(app_with_state_and_config(state, config))
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
