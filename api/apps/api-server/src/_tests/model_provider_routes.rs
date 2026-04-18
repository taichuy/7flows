use std::{fs, path::Path};

use crate::_tests::support::{login_and_capture_cookie, test_app};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use tower::ServiceExt;

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

async fn install_enable_assign(app: &axum::Router, cookie: &str, csrf: &str) -> String {
    let package_root =
        std::env::temp_dir().join(format!("model-provider-route-{}", uuid::Uuid::now_v7()));
    create_provider_fixture(&package_root);

    let install = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install")
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
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

    let enable = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/plugins/{installation_id}/enable"))
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
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
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(assign.status(), StatusCode::OK);

    installation_id
}

#[tokio::test]
async fn model_provider_routes_hide_secret_and_return_ready_options() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let installation_id = install_enable_assign(&app, &cookie, &csrf).await;

    let create = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/model-providers")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "installation_id": installation_id,
                        "display_name": "Fixture Prod",
                        "config": {
                            "base_url": "https://api.example.com",
                            "api_key": "super-secret"
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create.status(), StatusCode::CREATED);
    let create_payload: Value =
        serde_json::from_slice(&to_bytes(create.into_body(), usize::MAX).await.unwrap()).unwrap();
    let instance_id = create_payload["data"]["id"].as_str().unwrap().to_string();

    let list = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/model-providers")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list.status(), StatusCode::OK);
    let list_payload: Value =
        serde_json::from_slice(&to_bytes(list.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(
        list_payload["data"][0]["config_json"]["base_url"].as_str(),
        Some("https://api.example.com")
    );
    assert!(list_payload["data"][0]["config_json"]
        .get("api_key")
        .is_none());

    let validate = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/model-providers/{instance_id}/validate"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(validate.status(), StatusCode::OK);
    let validate_payload: Value =
        serde_json::from_slice(&to_bytes(validate.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(
        validate_payload["data"]["instance"]["status"].as_str(),
        Some("ready")
    );
    assert_eq!(
        validate_payload["data"]["output"]["sanitized"]["api_key"].as_str(),
        Some("***")
    );

    let options = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/model-providers/options")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(options.status(), StatusCode::OK);
    let options_payload: Value =
        serde_json::from_slice(&to_bytes(options.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(
        options_payload["data"]["instances"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        options_payload["data"]["instances"][0]["models"][0]["model_id"].as_str(),
        Some("fixture_chat")
    );
}
