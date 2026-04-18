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

fn write_fixture_runtime(package: &TempProviderPackage, dynamic_label: &str) {
    package.write(
        "provider/fixture_provider.js",
        &format!(
            r#"'use strict';

module.exports = {{
  providerCode: 'fixture_provider',

  async validateProviderCredentials(input) {{
    return {{
      ok: true,
      sanitized: {{
        base_url: input?.base_url ?? null,
        api_key: input?.api_key ? '***' : null,
      }},
    }};
  }},

  async listModels() {{
    return [
      {{
        model_id: 'fixture_dynamic',
        display_name: '{dynamic_label}',
        source: 'dynamic',
        supports_streaming: true,
        supports_tool_call: true,
        supports_multimodal: false,
        context_window: 64000,
        max_output_tokens: 4096,
        provider_metadata: {{
          tier: 'dynamic',
        }},
      }},
    ];
  }},

  async invoke(request) {{
    return {{
      events: [
        {{
          type: 'text_delta',
          delta: 'echo:' + request.model,
        }},
        {{
          type: 'tool_call_commit',
          call: {{
            id: 'tool-1',
            name: 'search_docs',
            arguments: {{
              query: 'provider host',
            }},
          }},
        }},
        {{
          type: 'mcp_call_commit',
          call: {{
            id: 'mcp-1',
            server: 'docs',
            method: 'search',
            arguments: {{
              query: 'provider host',
            }},
          }},
        }},
        {{
          type: 'usage_snapshot',
          usage: {{
            input_tokens: 5,
            output_tokens: 7,
            total_tokens: 12,
          }},
        }},
        {{
          type: 'finish',
          reason: 'stop',
        }},
      ],
      result: {{
        final_content: 'echo:' + request.model,
        tool_calls: [
          {{
            id: 'tool-1',
            name: 'search_docs',
            arguments: {{
              query: 'provider host',
            }},
          }},
        ],
        mcp_calls: [
          {{
            id: 'mcp-1',
            server: 'docs',
            method: 'search',
            arguments: {{
              query: 'provider host',
            }},
          }},
        ],
        usage: {{
          input_tokens: 5,
          output_tokens: 7,
          total_tokens: 12,
        }},
        finish_reason: 'stop',
        provider_metadata: {{
          provider_code: 'fixture_provider',
        }},
      }},
    }};
  }},
}};
"#
        ),
    );
}

fn make_fixture_package() -> TempProviderPackage {
    let package = TempProviderPackage::new();
    package.write(
        "manifest.yaml",
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
