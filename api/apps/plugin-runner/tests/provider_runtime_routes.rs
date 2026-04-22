use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    body::{to_bytes, Body},
    http::{Method, Request, StatusCode},
    Router,
};
use plugin_runner::app;
use serde_json::{json, Value};
use tower::ServiceExt;

struct TempProviderPackage {
    root: PathBuf,
}

impl TempProviderPackage {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("plugin-runner-tests-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        Self { root }
    }

    fn path(&self) -> &Path {
        &self.root
    }

    fn write(&self, relative_path: &str, content: &str) {
        let path = self.root.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }
}

impl Drop for TempProviderPackage {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn write_fixture_runtime_with_invoke_result(
    package: &TempProviderPackage,
    dynamic_label: &str,
    invoke_result: Value,
) {
    let validate_output = json!({
        "ok": true,
        "result": {
            "ok": true,
            "sanitized": {
                "base_url": "https://api.example.com",
                "api_key": "***"
            }
        }
    })
    .to_string();
    let list_models_output = json!({
        "ok": true,
        "result": [
            {
                "model_id": "fixture_dynamic",
                "display_name": dynamic_label,
                "source": "dynamic",
                "supports_streaming": true,
                "supports_tool_call": true,
                "supports_multimodal": false,
                "context_window": 64000,
                "max_output_tokens": 4096,
                "provider_metadata": {
                    "tier": "dynamic"
                }
            }
        ]
    })
    .to_string();
    let invoke_output = json!({
        "ok": true,
        "result": invoke_result
    })
    .to_string();
    let error_output = json!({
        "ok": false,
        "error": {
            "kind": "provider_invalid_response",
            "message": "unknown method",
            "provider_summary": null
        }
    })
    .to_string();

    package.write(
        "bin/fixture_provider",
        &format!(
            r#"#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"
case "${{payload}}" in
  *'"method":"validate"'*)
    printf '%s' '{validate_output}'
    ;;
  *'"method":"list_models"'*)
    printf '%s' '{list_models_output}'
    ;;
  *'"method":"invoke"'*)
    printf '%s' '{invoke_output}'
    ;;
  *)
    printf '%s' '{error_output}'
    exit 1
    ;;
esac
"#
        ),
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let path = package.path().join("bin/fixture_provider");
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).unwrap();
    }
}

fn write_fixture_runtime(package: &TempProviderPackage, dynamic_label: &str) {
    write_fixture_runtime_with_invoke_result(
        package,
        dynamic_label,
        json!({
            "events": [
                {
                    "type": "text_delta",
                    "delta": "echo:fixture_dynamic"
                },
                {
                    "type": "tool_call_commit",
                    "call": {
                        "id": "tool-1",
                        "name": "search_docs",
                        "arguments": {
                            "query": "provider host"
                        }
                    }
                },
                {
                    "type": "mcp_call_commit",
                    "call": {
                        "id": "mcp-1",
                        "server": "docs",
                        "method": "search",
                        "arguments": {
                            "query": "provider host"
                        }
                    }
                },
                {
                    "type": "usage_snapshot",
                    "usage": {
                        "input_tokens": 5,
                        "output_tokens": 7,
                        "total_tokens": 12
                    }
                },
                {
                    "type": "finish",
                    "reason": "stop"
                }
            ],
            "result": {
                "final_content": "echo:fixture_dynamic",
                "tool_calls": [
                    {
                        "id": "tool-1",
                        "name": "search_docs",
                        "arguments": {
                            "query": "provider host"
                        }
                    }
                ],
                "mcp_calls": [
                    {
                        "id": "mcp-1",
                        "server": "docs",
                        "method": "search",
                        "arguments": {
                            "query": "provider host"
                        }
                    }
                ],
                "usage": {
                    "input_tokens": 5,
                    "output_tokens": 7,
                    "total_tokens": 12
                },
                "finish_reason": "stop",
                "provider_metadata": {
                    "provider_code": "fixture_provider"
                }
            }
        }),
    );
}

fn write_legacy_invoke_runtime(package: &TempProviderPackage) {
    write_fixture_runtime_with_invoke_result(
        package,
        "Fixture Dynamic",
        json!({
            "output_text": "legacy text"
        }),
    );
}

fn make_fixture_package() -> TempProviderPackage {
    let package = TempProviderPackage::new();
    package.write(
        "manifest.yaml",
        r#"manifest_version: 1
plugin_id: fixture_provider@0.1.0
version: 0.1.0
vendor: taichuy
display_name: Fixture Provider
description: Fixture Provider
icon: icon.svg
source_kind: uploaded
trust_level: unverified
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - model_provider
binding_targets:
  - workspace
selection_mode: assignment_then_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.provider/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: provider_instance_only
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/fixture_provider
  limits:
    memory_bytes: 134217728
    timeout_ms: 5000
"#,
    );
    package.write(
        "provider/fixture_provider.yaml",
        r#"provider_code: fixture_provider
display_name: Fixture Provider
protocol: openai_compatible
help_url: https://example.com/help
default_base_url: https://api.example.com
model_discovery: hybrid
supports_model_fetch_without_credentials: true
config_schema:
  - key: base_url
    type: string
    required: true
  - key: api_key
    type: secret
    required: true
"#,
    );
    write_fixture_runtime(&package, "Fixture Dynamic");
    package.write("models/llm/_position.yaml", "items:\n  - fixture_static\n");
    package.write(
        "models/llm/fixture_static.yaml",
        r#"model: fixture_static
label: Fixture Static
family: llm
capabilities:
  - stream
context_window: 32000
max_output_tokens: 2048
"#,
    );
    package.write(
        "i18n/en_US.json",
        r#"{
  "plugin": { "label": "Fixture Provider" },
  "provider": { "label": "Fixture Provider" }
}
"#,
    );
    package
}

async fn request_json(app: &Router, method: Method, uri: &str, body: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload = serde_json::from_slice(&body).unwrap();
    (status, payload)
}

fn find_model<'a>(models: &'a [Value], model_id: &str) -> &'a Value {
    models
        .iter()
        .find(|model| model["model_id"] == model_id)
        .unwrap()
}

#[tokio::test]
async fn provider_runtime_routes_cover_load_reload_validate_list_models_and_invoke_stream() {
    let package = make_fixture_package();
    let app = app();

    let (status, load_payload) = request_json(
        &app,
        Method::POST,
        "/providers/load",
        json!({
            "package_root": package.path(),
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(load_payload["provider_code"], "fixture_provider");
    assert_eq!(load_payload["model_discovery_mode"], "hybrid");
    let plugin_id = load_payload["plugin_id"].as_str().unwrap().to_string();

    let (status, validate_payload) = request_json(
        &app,
        Method::POST,
        "/providers/validate",
        json!({
            "plugin_id": plugin_id,
            "provider_config": {
                "base_url": "https://api.example.com",
                "api_key": "secret",
            }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(validate_payload["output"]["sanitized"]["api_key"], "***");

    let (status, models_payload) = request_json(
        &app,
        Method::POST,
        "/providers/list-models",
        json!({
            "plugin_id": load_payload["plugin_id"],
            "provider_config": {
                "api_key": "secret",
            }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let models = models_payload["models"].as_array().unwrap();
    assert_eq!(models.len(), 2);
    assert_eq!(find_model(models, "fixture_static")["source"], "static");
    assert_eq!(find_model(models, "fixture_dynamic")["source"], "dynamic");
    assert_eq!(
        find_model(models, "fixture_dynamic")["display_name"],
        "Fixture Dynamic"
    );

    let (status, invoke_payload) = request_json(
        &app,
        Method::POST,
        "/providers/invoke-stream",
        json!({
            "plugin_id": load_payload["plugin_id"],
            "input": {
                "provider_instance_id": "instance-1",
                "provider_code": "fixture_provider",
                "protocol": "openai_compatible",
                "model": "fixture_dynamic",
                "messages": [
                    {
                        "role": "user",
                        "content": "hello",
                    }
                ]
            }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let events = invoke_payload["events"].as_array().unwrap();
    assert_eq!(events[0]["type"], "text_delta");
    assert_eq!(events[1]["type"], "tool_call_commit");
    assert_eq!(events[2]["type"], "mcp_call_commit");
    assert_eq!(events[3]["type"], "usage_snapshot");
    assert_eq!(events[4]["type"], "finish");
    assert!(invoke_payload.get("output_text").is_none());
    assert_eq!(invoke_payload["result"]["finish_reason"], "stop");
    assert_eq!(invoke_payload["result"]["usage"]["total_tokens"], 12);

    write_fixture_runtime(&package, "Reloaded Dynamic");

    let (status, _) = request_json(
        &app,
        Method::POST,
        "/providers/reload",
        json!({
            "plugin_id": load_payload["plugin_id"],
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, reloaded_models_payload) = request_json(
        &app,
        Method::POST,
        "/providers/list-models",
        json!({
            "plugin_id": load_payload["plugin_id"],
            "provider_config": {
                "api_key": "secret",
            }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let reloaded_models = reloaded_models_payload["models"].as_array().unwrap();
    assert_eq!(
        find_model(reloaded_models, "fixture_dynamic")["display_name"],
        "Reloaded Dynamic"
    );
}

#[tokio::test]
async fn provider_runtime_routes_rejects_legacy_invoke_payload() {
    let package = make_fixture_package();
    write_legacy_invoke_runtime(&package);
    let app = app();

    let (status, load_payload) = request_json(
        &app,
        Method::POST,
        "/providers/load",
        json!({
            "package_root": package.path(),
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, payload) = request_json(
        &app,
        Method::POST,
        "/providers/invoke-stream",
        json!({
            "plugin_id": load_payload["plugin_id"],
            "input": {
                "provider_instance_id": "instance-1",
                "provider_code": "fixture_provider",
                "protocol": "openai_compatible",
                "model": "fixture_dynamic",
                "messages": [
                    {
                        "role": "user",
                        "content": "hello",
                    }
                ]
            }
        }),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        payload["message"]
            .as_str()
            .unwrap()
            .contains("missing field")
    );
}

#[tokio::test]
async fn provider_load_rejects_source_tree_root() {
    let package = make_fixture_package();
    package.write("demo/index.html", "<!doctype html>");
    package.write("scripts/demo.runner.example.json", "{}");

    let (status, payload) = request_json(
        &app(),
        Method::POST,
        "/providers/load",
        json!({
            "package_root": package.path(),
        }),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(payload["message"].as_str().unwrap().contains("source tree"));
}
