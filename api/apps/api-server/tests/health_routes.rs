use api_server::{
    app,
    app_state::{ApiState, SessionStoreHandle},
    app_with_state_and_config,
    config::{ApiConfig, ApiEnvironment},
};
use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use async_trait::async_trait;
use axum::{
    body::{to_bytes, Body},
    http::{HeaderValue, Request, StatusCode},
    Router,
};
use control_plane::bootstrap::{BootstrapConfig, BootstrapService};
use control_plane::ports::{
    DownloadedOfficialPluginPackage, OfficialPluginSourceEntry, OfficialPluginSourcePort,
};
use serde_json::Value;
use sqlx::PgPool;
use tokio::sync::RwLock;
use tower::ServiceExt;
use uuid::Uuid;

#[derive(Clone, Default)]
struct NoopOfficialPluginSource;

#[async_trait]
impl OfficialPluginSourcePort for NoopOfficialPluginSource {
    async fn list_official_catalog(&self) -> anyhow::Result<Vec<OfficialPluginSourceEntry>> {
        Ok(Vec::new())
    }

    async fn download_plugin(
        &self,
        _entry: &OfficialPluginSourceEntry,
    ) -> anyhow::Result<DownloadedOfficialPluginPackage> {
        anyhow::bail!("official plugin source not configured for health route tests")
    }
}

fn default_test_config() -> ApiConfig {
    ApiConfig::from_env_map(&[
        (
            "API_DATABASE_URL",
            "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase",
        ),
        ("API_REDIS_URL", "redis://:1flowbase@127.0.0.1:36379"),
        ("BOOTSTRAP_ROOT_ACCOUNT", "root"),
        ("BOOTSTRAP_ROOT_EMAIL", "root@example.com"),
        ("BOOTSTRAP_ROOT_PASSWORD", "change-me"),
        ("BOOTSTRAP_WORKSPACE_NAME", "1Flowbase"),
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

async fn test_app() -> Router {
    test_app_with_config(default_test_config()).await
}

async fn test_app_with_config(mut config: ApiConfig) -> Router {
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
        std::sync::Arc::new(api_server::openapi_docs::build_default_api_docs_registry().unwrap());

    app_with_state_and_config(
        std::sync::Arc::new(ApiState {
            store,
            runtime_engine,
            provider_runtime: std::sync::Arc::new(RwLock::new(
                plugin_runner::provider_host::ProviderHost::default(),
            )),
            official_plugin_source: std::sync::Arc::new(NoopOfficialPluginSource),
            provider_install_root: config.provider_install_root.clone(),
            provider_secret_master_key: config.provider_secret_master_key.clone(),
            session_store: SessionStoreHandle::InMemory(
                storage_redis::InMemorySessionStore::default(),
            ),
            api_docs,
            cookie_name: config.cookie_name.clone(),
            session_ttl_days: config.session_ttl_days,
            bootstrap_workspace_name: config.bootstrap_workspace_name.clone(),
        }),
        &config,
    )
}

async fn login_and_capture_cookie(
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
                    serde_json::json!({
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
    let payload: Value = serde_json::from_slice(&body).unwrap();

    (
        cookie,
        payload["data"]["csrf_token"].as_str().unwrap().to_string(),
    )
}

async fn create_member(app: &Router, cookie: &str, csrf: &str, account: &str) -> String {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/members")
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "account": account,
                        "email": format!("{account}@example.com"),
                        "phone": null,
                        "password": "temp-pass",
                        "name": account,
                        "nickname": account,
                        "introduction": "",
                        "email_login_enabled": true,
                        "phone_login_enabled": false
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    payload["data"]["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn health_route_returns_ok_payload() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["service"], "api-server");
    assert_eq!(payload["status"], "ok");
}

#[tokio::test]
async fn openapi_route_exposes_api_title() {
    let response = app()
        .oneshot(
            Request::builder()
                .uri("/openapi.json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["info"]["title"], "1Flowbase API");
}

#[tokio::test]
async fn member_action_routes_remove_legacy_aliases() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let action_member_id = create_member(&app, &cookie, &csrf, "action-route-member").await;
    let legacy_member_id = create_member(&app, &cookie, &csrf, "legacy-route-member").await;

    let action_reset_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/members/{action_member_id}/actions/reset-password"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "new_password": "next-pass"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(action_reset_response.status(), StatusCode::NO_CONTENT);

    let action_disable_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/members/{action_member_id}/actions/disable"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(action_disable_response.status(), StatusCode::NO_CONTENT);

    let legacy_reset_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/members/{legacy_member_id}/reset-password"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "new_password": "legacy-pass"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(legacy_reset_response.status(), StatusCode::NOT_FOUND);

    let legacy_disable_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/members/{legacy_member_id}/disable"))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(legacy_disable_response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn production_router_hides_legacy_openapi_endpoints() {
    let mut config = default_test_config();
    config.env = ApiEnvironment::Production;
    config.cors_allowed_origins = Some(vec![HeaderValue::from_static("http://127.0.0.1:3100")]);
    let app = test_app_with_config(config).await;

    let docs_response = app
        .clone()
        .oneshot(Request::builder().uri("/docs").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(docs_response.status(), StatusCode::NOT_FOUND);

    let openapi_response = app
        .oneshot(
            Request::builder()
                .uri("/openapi.json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(openapi_response.status(), StatusCode::NOT_FOUND);
}
