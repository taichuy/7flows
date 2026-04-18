use std::{fs, path::Path};

use crate::_tests::support::{login_and_capture_cookie, test_app};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use tower::ServiceExt;

async fn create_member(
    app: &axum::Router,
    cookie: &str,
    csrf: &str,
    account: &str,
    password: &str,
) -> String {
    let create_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/members")
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "account": account,
                        "email": format!("{account}@example.com"),
                        "phone": null,
                        "password": password,
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
    assert_eq!(create_response.status(), StatusCode::CREATED);
    let body = to_bytes(create_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    payload["data"]["id"].as_str().unwrap().to_string()
}

async fn create_role(app: &axum::Router, cookie: &str, csrf: &str, role_code: &str) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/roles")
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "code": role_code,
                        "name": role_code,
                        "introduction": role_code
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
}

async fn replace_role_permissions(
    app: &axum::Router,
    cookie: &str,
    csrf: &str,
    role_code: &str,
    permission_codes: &[&str],
) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/console/roles/{role_code}/permissions"))
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "permission_codes": permission_codes }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

async fn replace_member_roles(
    app: &axum::Router,
    cookie: &str,
    csrf: &str,
    member_id: &str,
    role_codes: &[&str],
) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/console/members/{member_id}/roles"))
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(json!({ "role_codes": role_codes }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

fn create_provider_fixture(root: &Path) {
    fs::create_dir_all(root.join("provider")).unwrap();
    fs::create_dir_all(root.join("models/llm")).unwrap();
    fs::create_dir_all(root.join("i18n")).unwrap();
    fs::create_dir_all(root.join("demo")).unwrap();
    fs::create_dir_all(root.join("scripts")).unwrap();
    fs::write(
        root.join("manifest.yaml"),
        r#"plugin_code: fixture_provider
display_name: Fixture Provider
version: 0.1.0
contract_version: 1flowbase.provider/v1
supported_model_types:
  - llm
runner:
  language: nodejs
  entrypoint: provider/fixture_provider.js
"#,
    )
    .unwrap();
    fs::write(
        root.join("provider/fixture_provider.yaml"),
        r#"provider_code: fixture_provider
protocol: openai_compatible
help_url: https://example.com/help
default_base_url: https://api.example.com
model_discovery: hybrid
config_schema:
  - key: base_url
    type: string
    required: true
  - key: api_key
    type: secret
    required: true
"#,
    )
    .unwrap();
    fs::write(
        root.join("provider/fixture_provider.js"),
        r#"module.exports = {
  async validateProviderCredentials(input) {
    return { sanitized: { api_key: input.api_key ? "***" : null } };
  },
  async listModels() {
    return [
      {
        model_id: "fixture_chat",
        display_name: "Fixture Chat",
        source: "dynamic",
        supports_streaming: true,
        supports_tool_call: false,
        supports_multimodal: false,
        provider_metadata: {}
      }
    ];
  },
  async invoke() {
    return { events: [], result: { final_content: "ok" } };
  }
};
"#,
    )
    .unwrap();
    fs::write(
        root.join("models/llm/_position.yaml"),
        "items:\n  - fixture_chat\n",
    )
    .unwrap();
    fs::write(
        root.join("models/llm/fixture_chat.yaml"),
        r#"model: fixture_chat
label: Fixture Chat
family: llm
capabilities:
  - stream
"#,
    )
    .unwrap();
    fs::write(
        root.join("i18n/en_US.json"),
        r#"{ "plugin": { "label": "Fixture Provider" } }"#,
    )
    .unwrap();
    fs::write(root.join("demo/index.html"), "<html></html>").unwrap();
    fs::write(root.join("scripts/demo.sh"), "echo demo").unwrap();
}

#[tokio::test]
async fn plugin_routes_install_enable_assign_and_query_tasks() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let package_root = std::env::temp_dir().join(format!("plugin-route-{}", uuid::Uuid::now_v7()));
    create_provider_fixture(&package_root);

    let install = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "package_root": package_root.display().to_string() }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(install.status(), StatusCode::CREATED);
    let install_payload: Value =
        serde_json::from_slice(&to_bytes(install.into_body(), usize::MAX).await.unwrap()).unwrap();
    let installation_id = install_payload["data"]["installation"]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let install_path = install_payload["data"]["installation"]["install_path"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(!Path::new(&install_path).join("demo").exists());
    assert!(!Path::new(&install_path).join("scripts").exists());

    let enable = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/plugins/{installation_id}/enable"))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(enable.status(), StatusCode::OK);

    let assign = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/plugins/{installation_id}/assign"))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(assign.status(), StatusCode::OK);

    let catalog = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/plugins/catalog")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(catalog.status(), StatusCode::OK);
    let catalog_payload: Value =
        serde_json::from_slice(&to_bytes(catalog.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(catalog_payload["data"].as_array().unwrap().len(), 1);
    assert_eq!(
        catalog_payload["data"][0]["assigned_to_current_workspace"].as_bool(),
        Some(true)
    );

    let tasks = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/plugins/tasks")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(tasks.status(), StatusCode::OK);
    let tasks_payload: Value =
        serde_json::from_slice(&to_bytes(tasks.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(tasks_payload["data"].as_array().unwrap().len(), 3);
    let task_id = tasks_payload["data"][0]["id"].as_str().unwrap().to_string();

    let task = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/console/plugins/tasks/{task_id}"))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(task.status(), StatusCode::OK);
}

#[tokio::test]
async fn plugin_routes_allow_view_only_users_to_read_but_not_install() {
    let app = test_app().await;
    let (root_cookie, root_csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    create_role(&app, &root_cookie, &root_csrf, "plugin_viewer").await;
    replace_role_permissions(
        &app,
        &root_cookie,
        &root_csrf,
        "plugin_viewer",
        &["plugin_config.view.all"],
    )
    .await;
    let member_id =
        create_member(&app, &root_cookie, &root_csrf, "plugin-viewer", "change-me").await;
    replace_member_roles(
        &app,
        &root_cookie,
        &root_csrf,
        &member_id,
        &["plugin_viewer"],
    )
    .await;

    let (viewer_cookie, viewer_csrf) =
        login_and_capture_cookie(&app, "plugin-viewer", "change-me").await;

    let catalog = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/plugins/catalog")
                .header("cookie", &viewer_cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(catalog.status(), StatusCode::OK);

    let denied = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install")
                .header("cookie", &viewer_cookie)
                .header("x-csrf-token", &viewer_csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "package_root": "/tmp/none" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn plugin_routes_list_official_catalog_and_install_official_package() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let catalog = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/console/plugins/official-catalog")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(catalog.status(), StatusCode::OK);

    let install = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install-official")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "plugin_id": "1flowbase.openai_compatible" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(install.status(), StatusCode::CREATED);
}
