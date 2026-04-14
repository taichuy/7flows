use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use axum::{
    body::{to_bytes, Body},
    http::Request,
    Router,
};
use control_plane::bootstrap::{BootstrapConfig, BootstrapService};
use serde_json::json;
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

use crate::{
    app_state::{ApiState, SessionStoreHandle},
    config::ApiConfig,
};

fn default_test_config() -> ApiConfig {
    ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows",
        ),
        ("API_REDIS_URL", "redis://:sevenflows@127.0.0.1:36379"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "change-me"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1Flowse"),
    ])
    .unwrap()
}

async fn isolated_database_url(base_url: &str) -> String {
    let admin_pool = PgPool::connect(base_url).await.unwrap();
    let schema = format!("test_{}", Uuid::now_v7().to_string().replace('-', ""));
    sqlx::query(&format!("create schema if not exists {schema}"))
        .execute(&admin_pool)
        .await
        .unwrap();

    format!("{base_url}?options=-csearch_path%3D{schema}")
}

pub async fn test_app_with_database_url() -> (Router, String) {
    let mut config = default_test_config();
    config.database_url = isolated_database_url(&config.database_url).await;
    let pool = storage_pg::connect(&config.database_url).await.unwrap();
    storage_pg::run_migrations(&pool).await.unwrap();

    let store = storage_pg::PgControlPlaneStore::new(pool);
    let salt = SaltString::generate(&mut rand_core::OsRng);
    let root_password_hash = Argon2::default()
        .hash_password(config.bootstrap_root_password.as_bytes(), &salt)
        .unwrap()
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
        .await
        .unwrap();
    let runtime_registry = runtime_core::runtime_model_registry::RuntimeModelRegistry::default();
    runtime_registry.rebuild(store.list_runtime_model_metadata().await.unwrap());
    let runtime_engine = std::sync::Arc::new(runtime_core::runtime_engine::RuntimeEngine::new(
        runtime_registry,
        std::sync::Arc::new(store.clone()),
    ));
    let api_docs =
        std::sync::Arc::new(crate::openapi_docs::build_default_api_docs_registry().unwrap());

    let app = crate::app_with_state_and_config(
        std::sync::Arc::new(ApiState {
            store,
            runtime_engine,
            session_store: SessionStoreHandle::InMemory(
                storage_redis::InMemorySessionStore::default(),
            ),
            api_docs,
            cookie_name: config.cookie_name.clone(),
            session_ttl_days: config.session_ttl_days,
            bootstrap_workspace_name: config.bootstrap_workspace_name.clone(),
        }),
        &config,
    );

    (app, config.database_url)
}

pub async fn test_app() -> Router {
    test_app_with_database_url().await.0
}

pub async fn login_and_capture_cookie(
    app: &Router,
    identifier: &str,
    password: &str,
) -> (String, String) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/public/auth/providers/password-local/sign-in")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "identifier": identifier,
                        "password": password
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let cookie = response
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();

    (
        cookie,
        payload["data"]["csrf_token"].as_str().unwrap().to_string(),
    )
}

pub async fn seed_workspace(database_url: &str, workspace_name: &str) -> Uuid {
    let pool = storage_pg::connect(database_url).await.unwrap();
    let tenant_id: Uuid = sqlx::query_scalar("select id from tenants where code = 'root-tenant'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let workspace_id = Uuid::now_v7();

    sqlx::query(
        "insert into workspaces (id, tenant_id, name, created_by, updated_by) values ($1, $2, $3, null, null)",
    )
    .bind(workspace_id)
    .bind(tenant_id)
    .bind(workspace_name)
    .execute(&pool)
    .await
    .unwrap();

    workspace_id
}
