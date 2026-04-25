use std::{fs, path::Path};

use crate::_tests::support::{
    login_and_capture_cookie, test_app, write_provider_manifest_v2, write_provider_runtime_script,
};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use tower::ServiceExt;

fn create_provider_fixture(root: &Path) {
    fs::create_dir_all(root.join("provider")).unwrap();
    fs::create_dir_all(root.join("bin")).unwrap();
    fs::create_dir_all(root.join("models/llm")).unwrap();
    fs::create_dir_all(root.join("i18n")).unwrap();
    fs::create_dir_all(root.join("demo")).unwrap();
    fs::create_dir_all(root.join("scripts")).unwrap();
    write_provider_manifest_v2(root, "fixture_provider", "Fixture Provider", "0.1.0");
    fs::write(
        root.join("provider/fixture_provider.yaml"),
        r#"provider_code: fixture_provider
display_name: Fixture Provider
protocol: openai_compatible
help_url: https://example.com/help
default_base_url: https://api.example.com
model_discovery: hybrid
parameter_form:
  schema_version: 1.0.0
  title: LLM Parameters
  fields:
    - key: temperature
      label: Temperature
      type: number
      control: slider
      send_mode: optional
      enabled_by_default: true
      default_value: 0.7
      min: 0
      max: 2
      step: 0.1
config_schema:
  - key: base_url
    type: string
    required: true
  - key: api_key
    type: secret
    required: true
  - key: organization
    type: string
    required: false
    advanced: true
"#,
    )
    .unwrap();
    write_provider_runtime_script(
        &root.join("bin/fixture_provider-provider"),
        "fixture_chat",
        "Fixture Chat",
    );
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
        r#"{
  "plugin": {
    "label": "Fixture Provider",
    "description": "Fixture provider plugin"
  },
  "provider": {
    "label": "Fixture Provider",
    "description": "Fixture provider"
  },
  "models": {
    "fixture_chat": {
      "label": "Fixture Chat",
      "description": "Fixture chat model"
    }
  }
}"#,
    )
    .unwrap();
    fs::write(
        root.join("i18n/zh_Hans.json"),
        r#"{
  "plugin": {
    "label": "示例供应商插件",
    "description": "示例供应商插件"
  },
  "provider": {
    "label": "示例供应商",
    "description": "示例供应商"
  },
  "models": {
    "fixture_chat": {
      "label": "示例聊天模型",
      "description": "示例聊天模型"
    }
  }
}"#,
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

async fn openapi_payload() -> Value {
    let response = crate::app()
        .oneshot(
            Request::builder()
                .uri("/openapi.json")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap()
}

fn schema_ref_name(schema: &Value) -> Option<String> {
    schema
        .get("$ref")
        .and_then(Value::as_str)
        .and_then(|value| value.split('/').next_back())
        .map(str::to_string)
        .or_else(|| {
            schema
                .get("allOf")
                .and_then(Value::as_array)
                .and_then(|items| items.iter().find_map(schema_ref_name))
        })
        .or_else(|| {
            schema
                .get("anyOf")
                .and_then(Value::as_array)
                .and_then(|items| items.iter().find_map(schema_ref_name))
        })
        .or_else(|| {
            schema
                .get("oneOf")
                .and_then(Value::as_array)
                .and_then(|items| items.iter().find_map(schema_ref_name))
        })
        .or_else(|| {
            schema
                .get("properties")
                .and_then(Value::as_object)
                .and_then(|properties| properties.get("data"))
                .and_then(schema_ref_name)
        })
}

#[tokio::test]
async fn model_provider_routes_mask_secret_until_reveal_and_keep_ready_options() {
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
                        "enabled_model_ids": [],
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
    assert_eq!(
        create_payload["data"]["included_in_main"].as_bool(),
        Some(true)
    );
    assert!(create_payload["data"].get("is_primary").is_none());
    assert_eq!(create_payload["data"]["enabled_model_ids"], json!([]));
    assert!(create_payload["data"].get("validation_model_id").is_none());

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
    assert_eq!(
        list_payload["data"][0]["config_json"]["api_key"].as_str(),
        Some("supe****cret")
    );
    assert_eq!(
        list_payload["data"][0]["included_in_main"].as_bool(),
        Some(true)
    );
    assert!(list_payload["data"][0].get("is_primary").is_none());
    assert_eq!(list_payload["data"][0]["enabled_model_ids"], json!([]));
    assert!(list_payload["data"][0].get("validation_model_id").is_none());

    let reveal = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/model-providers/{instance_id}/secrets/reveal"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "key": "api_key"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(reveal.status(), StatusCode::OK);
    let reveal_payload: Value =
        serde_json::from_slice(&to_bytes(reveal.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(reveal_payload["data"]["key"].as_str(), Some("api_key"));
    assert_eq!(
        reveal_payload["data"]["value"].as_str(),
        Some("super-secret")
    );

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
        Some("draft")
    );
    assert_eq!(
        validate_payload["data"]["instance"]["enabled_model_ids"],
        json!([])
    );
    assert_eq!(
        validate_payload["data"]["instance"]["included_in_main"].as_bool(),
        Some(true)
    );
    assert!(validate_payload["data"]["instance"]
        .get("is_primary")
        .is_none());
    assert!(validate_payload["data"]["instance"]
        .get("validation_model_id")
        .is_none());
    assert_eq!(
        validate_payload["data"]["output"]["sanitized"]["api_key"].as_str(),
        Some("***")
    );

    let catalog = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/model-providers/catalog?locale=zh_Hans")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(catalog.status(), StatusCode::OK);
    let catalog_payload: Value =
        serde_json::from_slice(&to_bytes(catalog.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(
        catalog_payload["data"]["locale_meta"]["resolved_locale"].as_str(),
        Some("zh_Hans")
    );
    assert!(
        catalog_payload["data"]["i18n_catalog"]["plugin.fixture_provider"]["zh_Hans"].is_object()
    );
    assert_eq!(
        catalog_payload["data"]["entries"][0]["namespace"].as_str(),
        Some("plugin.fixture_provider")
    );
    assert_eq!(
        catalog_payload["data"]["entries"][0]["label_key"].as_str(),
        Some("provider.label")
    );
    assert_eq!(
        catalog_payload["data"]["entries"][0]["predefined_models"][0]["label_key"].as_str(),
        Some("models.fixture_chat.label")
    );
    assert_eq!(
        catalog_payload["data"]["entries"][0]["form_schema"][2]["key"].as_str(),
        Some("organization")
    );
    assert_eq!(
        catalog_payload["data"]["entries"][0]["form_schema"][2]["advanced"].as_bool(),
        Some(true)
    );

    let options = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/model-providers/options?locale=zh_Hans")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(options.status(), StatusCode::OK);
    let options_payload: Value =
        serde_json::from_slice(&to_bytes(options.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(options_payload["data"]["providers"], json!([]));
    assert_eq!(
        options_payload["data"]["locale_meta"]["resolved_locale"].as_str(),
        Some("zh_Hans")
    );
    assert_eq!(options_payload["data"]["i18n_catalog"], json!({}));
}

#[tokio::test]
async fn model_provider_routes_preview_models_from_draft_config_and_existing_secret() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let installation_id = install_enable_assign(&app, &cookie, &csrf).await;

    let preview_create = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/model-providers/preview-models")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "installation_id": installation_id,
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
    assert_eq!(preview_create.status(), StatusCode::OK);
    let preview_create_payload: Value = serde_json::from_slice(
        &to_bytes(preview_create.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        preview_create_payload["data"]["models"][0]["model_id"].as_str(),
        Some("fixture_chat")
    );

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
                        "enabled_model_ids": [],
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

    let preview_edit = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/model-providers/preview-models")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "instance_id": instance_id,
                        "config": {
                            "base_url": "https://api.example.com"
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(preview_edit.status(), StatusCode::OK);
    let preview_edit_payload: Value = serde_json::from_slice(
        &to_bytes(preview_edit.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        preview_edit_payload["data"]["models"][0]["model_id"].as_str(),
        Some("fixture_chat")
    );
}

#[tokio::test]
async fn model_provider_routes_create_instance_accepts_configured_models_with_preview_token() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let installation_id = install_enable_assign(&app, &cookie, &csrf).await;

    let preview = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/model-providers/preview-models")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "installation_id": installation_id,
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
    assert_eq!(preview.status(), StatusCode::OK);
    let preview_payload: Value =
        serde_json::from_slice(&to_bytes(preview.into_body(), usize::MAX).await.unwrap()).unwrap();
    let preview_token = preview_payload["data"]["preview_token"]
        .as_str()
        .expect("preview token should exist");

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
                        "configured_models": [
                            { "model_id": "fixture_chat", "enabled": true, "context_window_override_tokens": 128000 },
                            { "model_id": "custom-preview", "enabled": false, "context_window_override_tokens": null }
                        ],
                        "preview_token": preview_token,
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
    assert_eq!(create_payload["data"]["status"].as_str(), Some("ready"));
    assert_eq!(
        create_payload["data"]["configured_models"],
        json!([
            { "model_id": "fixture_chat", "enabled": true, "context_window_override_tokens": 128000 },
            { "model_id": "custom-preview", "enabled": false, "context_window_override_tokens": null }
        ])
    );
    assert_eq!(
        create_payload["data"]["enabled_model_ids"],
        json!(["fixture_chat"])
    );
    assert!(create_payload["data"].get("validation_model_id").is_none());
    assert_eq!(create_payload["data"]["model_count"].as_u64(), Some(1));
}

#[tokio::test]
async fn model_provider_routes_update_instance_accepts_configured_models() {
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
                        "display_name": "Fixture Draft",
                        "configured_models": [],
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

    let update = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/api/console/model-providers/{instance_id}"))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "display_name": "Fixture Ready",
                        "included_in_main": true,
                        "configured_models": [
                            { "model_id": " fixture_chat ", "enabled": true, "context_window_override_tokens": 64000 },
                            { "model_id": "custom-preview", "enabled": false, "context_window_override_tokens": null },
                            { "model_id": "fixture_chat", "enabled": true, "context_window_override_tokens": 128000 },
                            { "model_id": "", "enabled": true, "context_window_override_tokens": 32000 }
                        ],
                        "config": {}
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(update.status(), StatusCode::OK);
    let update_payload: Value =
        serde_json::from_slice(&to_bytes(update.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(update_payload["data"]["status"].as_str(), Some("ready"));
    assert_eq!(
        update_payload["data"]["configured_models"],
        json!([
            { "model_id": "fixture_chat", "enabled": true, "context_window_override_tokens": 64000 },
            { "model_id": "custom-preview", "enabled": false, "context_window_override_tokens": null }
        ])
    );
    assert_eq!(
        update_payload["data"]["enabled_model_ids"],
        json!(["fixture_chat"])
    );
    assert_eq!(
        update_payload["data"]["included_in_main"].as_bool(),
        Some(true)
    );
    assert!(update_payload["data"].get("is_primary").is_none());
    assert!(update_payload["data"].get("validation_model_id").is_none());

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
        list_payload["data"][0]["configured_models"],
        json!([
            { "model_id": "fixture_chat", "enabled": true, "context_window_override_tokens": 64000 },
            { "model_id": "custom-preview", "enabled": false, "context_window_override_tokens": null }
        ])
    );
    assert_eq!(
        list_payload["data"][0]["enabled_model_ids"],
        json!(["fixture_chat"])
    );
    assert_eq!(
        list_payload["data"][0]["included_in_main"].as_bool(),
        Some(true)
    );
    assert!(list_payload["data"][0].get("is_primary").is_none());
    assert!(list_payload["data"][0].get("validation_model_id").is_none());
}

#[tokio::test]
async fn model_provider_routes_create_instance_allows_preview_token_with_empty_configured_models() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let installation_id = install_enable_assign(&app, &cookie, &csrf).await;

    let preview = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/model-providers/preview-models")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "installation_id": installation_id,
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
    assert_eq!(preview.status(), StatusCode::OK);
    let preview_payload: Value =
        serde_json::from_slice(&to_bytes(preview.into_body(), usize::MAX).await.unwrap()).unwrap();
    let preview_token = preview_payload["data"]["preview_token"]
        .as_str()
        .expect("preview token should exist");

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
                        "display_name": "Fixture Draft",
                        "configured_models": [],
                        "preview_token": preview_token,
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
    assert_eq!(create_payload["data"]["status"].as_str(), Some("draft"));
    assert_eq!(create_payload["data"]["configured_models"], json!([]));
    assert_eq!(create_payload["data"]["enabled_model_ids"], json!([]));
    assert!(create_payload["data"].get("validation_model_id").is_none());
}

#[tokio::test]
async fn model_provider_routes_refresh_models_keeps_enabled_model_ids_unchanged() {
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
                        "display_name": "Fixture Ready",
                        "configured_models": [
                            { "model_id": "fixture_chat", "enabled": true, "context_window_override_tokens": 128000 },
                            { "model_id": "custom-refresh", "enabled": false, "context_window_override_tokens": null }
                        ],
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

    let refresh = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/model-providers/{instance_id}/models/refresh"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(refresh.status(), StatusCode::OK);
    let refresh_payload: Value =
        serde_json::from_slice(&to_bytes(refresh.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(
        refresh_payload["data"]["refresh_status"].as_str(),
        Some("ready")
    );
    assert_eq!(
        refresh_payload["data"]["models"][0]["model_id"].as_str(),
        Some("fixture_chat")
    );

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
        list_payload["data"][0]["configured_models"],
        json!([
            { "model_id": "fixture_chat", "enabled": true, "context_window_override_tokens": 128000 },
            { "model_id": "custom-refresh", "enabled": false, "context_window_override_tokens": null }
        ])
    );
    assert_eq!(
        list_payload["data"][0]["enabled_model_ids"],
        json!(["fixture_chat"])
    );
    assert!(list_payload["data"][0].get("validation_model_id").is_none());
    assert_eq!(list_payload["data"][0]["model_count"].as_u64(), Some(1));
}

#[tokio::test]
async fn model_provider_routes_main_instance_settings_drive_inclusion_and_grouped_options() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let installation_id = install_enable_assign(&app, &cookie, &csrf).await;

    let openapi = openapi_payload().await;
    let paths = openapi["paths"].as_object().unwrap();
    assert!(
        paths.contains_key("/api/console/model-providers/providers/{provider_code}/main-instance")
    );
    assert!(!paths.contains_key("/api/console/model-providers/providers/{provider_code}/routing"));
    assert!(
        paths["/api/console/model-providers/providers/{provider_code}/main-instance"]
            .get("get")
            .is_some()
    );
    assert!(
        paths["/api/console/model-providers/providers/{provider_code}/main-instance"]["get"]
            ["responses"]
            .get("404")
            .is_some()
    );
    let main_instance_operation =
        &paths["/api/console/model-providers/providers/{provider_code}/main-instance"]["put"];
    assert!(main_instance_operation["responses"].get("404").is_some());
    let request_schema_name = main_instance_operation["requestBody"]["content"]["application/json"]
        ["schema"]["$ref"]
        .as_str()
        .and_then(|value| value.split('/').next_back())
        .expect("main-instance request schema ref");
    let response_schema_name = schema_ref_name(
        &main_instance_operation["responses"]["200"]["content"]["application/json"]["schema"],
    )
    .expect("main-instance response schema ref");
    let schemas = openapi["components"]["schemas"].as_object().unwrap();
    assert_eq!(
        schemas[request_schema_name]["properties"]["auto_include_new_instances"]["type"].as_str(),
        Some("boolean")
    );
    assert!(schemas[request_schema_name]
        .get("properties")
        .and_then(|properties| properties.get("routing_mode"))
        .is_none());
    assert_eq!(
        schemas["ModelProviderInstanceResponse"]["properties"]["included_in_main"]["type"].as_str(),
        Some("boolean")
    );
    assert!(schemas["ModelProviderInstanceResponse"]
        .get("properties")
        .and_then(|properties| properties.get("is_primary"))
        .is_none());
    assert!(schemas[&response_schema_name]
        .get("properties")
        .and_then(|properties| properties.get("primary_instance_id"))
        .is_none());
    assert_eq!(
        schemas["ModelProviderOptionResponse"]["properties"]["main_instance"]["$ref"]
            .as_str()
            .and_then(|value| value.split('/').next_back()),
        Some("ModelProviderMainInstanceSummaryResponse")
    );
    assert_eq!(
        schemas["ModelProviderOptionResponse"]["properties"]["model_groups"]["items"]["$ref"]
            .as_str()
            .and_then(|value| value.split('/').next_back()),
        Some("ModelProviderOptionGroupResponse")
    );
    assert_eq!(
        schema_ref_name(&schemas["ModelProviderOptionResponse"]["properties"]["parameter_form"])
            .as_deref(),
        Some("PluginFormSchemaResponse")
    );
    assert!(schemas["ProviderModelDescriptorResponse"]
        .get("properties")
        .and_then(|properties| properties.get("parameter_form"))
        .is_none());
    let override_schema =
        &schemas["ConfiguredModelResponse"]["properties"]["context_window_override_tokens"];
    assert!(
        override_schema["type"].as_str() == Some("integer")
            || override_schema["type"]
                .as_array()
                .is_some_and(|items| items.iter().any(|item| item.as_str() == Some("integer")))
            || override_schema
                .get("anyOf")
                .and_then(Value::as_array)
                .is_some_and(|items| items
                    .iter()
                    .any(|item| item["type"].as_str() == Some("integer")))
    );
    assert!(schemas["ModelProviderOptionResponse"]
        .get("properties")
        .and_then(|properties| properties.get("effective_instance_id"))
        .is_none());

    let get_main_instance = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/model-providers/providers/fixture_provider/main-instance")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get_main_instance.status(), StatusCode::OK);
    let get_main_instance_payload: Value = serde_json::from_slice(
        &to_bytes(get_main_instance.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        get_main_instance_payload["data"]["provider_code"].as_str(),
        Some("fixture_provider")
    );
    assert_eq!(
        get_main_instance_payload["data"]["auto_include_new_instances"].as_bool(),
        Some(true)
    );

    let update_main_instance = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/console/model-providers/providers/fixture_provider/main-instance")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "auto_include_new_instances": false
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(update_main_instance.status(), StatusCode::OK);
    let update_main_instance_payload: Value = serde_json::from_slice(
        &to_bytes(update_main_instance.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        update_main_instance_payload["data"]["provider_code"].as_str(),
        Some("fixture_provider")
    );
    assert_eq!(
        update_main_instance_payload["data"]["auto_include_new_instances"].as_bool(),
        Some(false)
    );

    let excluded = app
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
                        "display_name": "Excluded By Default",
                        "enabled_model_ids": ["fixture_chat"],
                        "config": {
                            "base_url": "https://excluded.example.com/v1",
                            "api_key": "super-secret"
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(excluded.status(), StatusCode::CREATED);
    let excluded_payload: Value =
        serde_json::from_slice(&to_bytes(excluded.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(
        excluded_payload["data"]["included_in_main"].as_bool(),
        Some(false)
    );
    assert!(excluded_payload["data"].get("is_primary").is_none());

    let alpha = app
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
                        "display_name": "Alpha",
                        "configured_models": [
                            {
                                "model_id": "fixture_chat",
                                "enabled": true,
                                "context_window_override_tokens": 256000
                            }
                        ],
                        "enabled_model_ids": ["fixture_chat"],
                        "included_in_main": true,
                        "config": {
                            "base_url": "https://alpha.example.com/v1",
                            "api_key": "super-secret"
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(alpha.status(), StatusCode::CREATED);
    let alpha_payload: Value =
        serde_json::from_slice(&to_bytes(alpha.into_body(), usize::MAX).await.unwrap()).unwrap();
    let alpha_id = alpha_payload["data"]["id"].as_str().unwrap().to_string();
    assert_eq!(
        alpha_payload["data"]["included_in_main"].as_bool(),
        Some(true)
    );

    let beta = app
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
                        "display_name": "Beta",
                        "enabled_model_ids": ["custom-beta"],
                        "included_in_main": true,
                        "config": {
                            "base_url": "https://beta.example.com/v1",
                            "api_key": "super-secret"
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(beta.status(), StatusCode::CREATED);
    let beta_payload: Value =
        serde_json::from_slice(&to_bytes(beta.into_body(), usize::MAX).await.unwrap()).unwrap();
    let beta_id = beta_payload["data"]["id"].as_str().unwrap().to_string();
    assert_eq!(
        beta_payload["data"]["included_in_main"].as_bool(),
        Some(true)
    );

    let options = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/model-providers/options?locale=zh_Hans")
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
        options_payload["data"]["providers"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(options_payload["data"]["providers"][0]
        .get("effective_instance_id")
        .is_none());
    assert_eq!(
        options_payload["data"]["providers"][0]["icon"].as_str(),
        Some("icon.svg")
    );
    assert_eq!(
        options_payload["data"]["providers"][0]["main_instance"]["provider_code"].as_str(),
        Some("fixture_provider")
    );
    assert_eq!(
        options_payload["data"]["providers"][0]["main_instance"]["auto_include_new_instances"]
            .as_bool(),
        Some(false)
    );
    assert_eq!(
        options_payload["data"]["providers"][0]["main_instance"]["group_count"].as_u64(),
        Some(2)
    );
    assert_eq!(
        options_payload["data"]["providers"][0]["main_instance"]["model_count"].as_u64(),
        Some(2)
    );
    assert_eq!(
        options_payload["data"]["providers"][0]["parameter_form"]["fields"][0]["key"].as_str(),
        Some("temperature")
    );
    let groups = options_payload["data"]["providers"][0]["model_groups"]
        .as_array()
        .unwrap();
    assert_eq!(groups.len(), 2);
    let alpha_group = groups
        .iter()
        .find(|group| group["source_instance_id"].as_str() == Some(alpha_id.as_str()))
        .expect("alpha group");
    assert_eq!(
        alpha_group["source_instance_display_name"].as_str(),
        Some("Alpha")
    );
    assert_eq!(
        alpha_group["models"][0]["model_id"].as_str(),
        Some("fixture_chat")
    );
    assert_eq!(
        alpha_group["models"][0]["context_window"].as_u64(),
        Some(256000)
    );
    assert!(alpha_group["models"][0].get("parameter_form").is_none());
    let beta_group = groups
        .iter()
        .find(|group| group["source_instance_id"].as_str() == Some(beta_id.as_str()))
        .expect("beta group");
    assert_eq!(
        beta_group["source_instance_display_name"].as_str(),
        Some("Beta")
    );
    assert_eq!(
        beta_group["models"][0]["model_id"].as_str(),
        Some("custom-beta")
    );
    assert!(beta_group["models"][0].get("parameter_form").is_none());

    let legacy_routing = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/console/model-providers/providers/fixture_provider/routing")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "routing_mode": "manual_primary",
                        "primary_instance_id": alpha_id
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(legacy_routing.status(), StatusCode::NOT_FOUND);
}
