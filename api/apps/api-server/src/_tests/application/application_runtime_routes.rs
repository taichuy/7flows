use std::{fs, path::Path};

use crate::_tests::support::{
    login_and_capture_cookie, test_app, test_app_with_database_url, write_provider_manifest_v2,
};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use tower::ServiceExt;
use uuid::Uuid;

const DEBUG_SESSION_ID: &str = "application-runtime-debug-session";

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
      send_mode: optional
      enabled_by_default: true
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
        root.join("bin/fixture_provider-provider"),
        r#"#!/usr/bin/env node
const fs = require('node:fs');

const request = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');

let result = {};
switch (request.method) {
  case 'validate':
    result = { sanitized: { api_key: request.input?.api_key ? "***" : null } };
    break;
  case 'list_models':
    result = [{
      model_id: "fixture_chat",
      display_name: "Fixture Chat",
      source: "dynamic",
      supports_streaming: true,
      supports_tool_call: false,
      supports_multimodal: false,
      provider_metadata: {}
    }];
    break;
  case 'invoke': {
    const query = request.input?.messages?.[0]?.content ?? "";
    const text = "reply:" + query;
    const lines = [
      ...Array.from(text.padEnd(70, "."), (delta) => ({ type: "text_delta", delta })),
      { type: "usage_snapshot", usage: { input_tokens: 5, output_tokens: 7, total_tokens: 12 } },
      { type: "finish", reason: "stop" },
      {
        type: "result",
        result: {
          final_content: text,
          usage: { input_tokens: 5, output_tokens: 7, total_tokens: 12 },
          finish_reason: "stop"
        }
      }
    ];
    process.stdout.write(lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
    process.exit(0);
  }
  default:
    result = {};
}

process.stdout.write(JSON.stringify({ ok: true, result }));
"#,
    )
    .unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let runtime_path = root.join("bin/fixture_provider-provider");
        let mut permissions = fs::metadata(&runtime_path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(runtime_path, permissions).unwrap();
    }
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

pub(super) async fn create_ready_provider_instance(
    app: &axum::Router,
    cookie: &str,
    csrf: &str,
) -> String {
    let package_root = std::env::temp_dir().join(format!(
        "application-runtime-provider-{}",
        uuid::Uuid::now_v7()
    ));
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

    for suffix in ["enable", "assign"] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/console/plugins/{installation_id}/{suffix}"))
                    .header("cookie", cookie)
                    .header("x-csrf-token", csrf)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    let create = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/model-providers")
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "installation_id": installation_id,
                        "display_name": "Fixture Runtime",
                        "configured_models": [
                            { "model_id": "fixture_chat", "enabled": true }
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

    let validate = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/model-providers/{instance_id}/validate"
                ))
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(validate.status(), StatusCode::OK);

    instance_id
}

fn build_ready_provider_document(flow_id: &str, provider_instance_id: &str) -> Value {
    json!({
        "schemaVersion": "1flowbase.flow/v2",
        "meta": { "flowId": flow_id, "name": "Support Agent", "description": "", "tags": [] },
        "graph": {
            "nodes": [
                {
                    "id": "node-start",
                    "type": "start",
                    "alias": "Start",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 0, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {},
                    "outputs": []
                },
                {
                    "id": "node-llm",
                    "type": "llm",
                    "alias": "LLM",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 240, "y": 0 },
                    "configVersion": 1,
                    "config": {
                        "model_provider": {
                            "provider_code": "fixture_provider",
                            "source_instance_id": provider_instance_id,
                            "model_id": "fixture_chat"
                        },
                        "temperature": 0.2
                    },
                    "bindings": {
                        "prompt_messages": { "kind": "prompt_messages", "value": [{ "id": "user-1", "role": "user", "content": { "kind": "templated_text", "value": "{{node-start.query}}" } }] }
                    },
                    "outputs": [{ "key": "text", "title": "模型输出", "valueType": "string" }]
                },
                {
                    "id": "node-answer",
                    "type": "answer",
                    "alias": "Answer",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 480, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {
                        "answer_template": { "kind": "selector", "value": ["node-llm", "text"] }
                    },
                    "outputs": [{ "key": "answer", "title": "对话输出", "valueType": "string" }]
                }
            ],
            "edges": [
                { "id": "edge-start-llm", "source": "node-start", "target": "node-llm", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] },
                { "id": "edge-llm-answer", "source": "node-llm", "target": "node-answer", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] }
            ]
        },
        "editor": { "viewport": { "x": 0, "y": 0, "zoom": 1 }, "annotations": [], "activeContainerPath": [] }
    })
}

pub(super) async fn seed_agent_flow_application(
    app: &axum::Router,
    cookie: &str,
    csrf: &str,
    provider_instance_id: &str,
) -> String {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/applications")
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "application_type": "agent_flow",
                        "name": "Support Agent",
                        "description": "runtime",
                        "icon": "RobotOutlined",
                        "icon_type": "iconfont",
                        "icon_background": "#E6F7F2"
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
    let application_id = payload["data"]["id"].as_str().unwrap().to_string();
    let state = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration"
                ))
                .header("cookie", cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(state.status(), StatusCode::OK);
    let state_body = to_bytes(state.into_body(), usize::MAX).await.unwrap();
    let state_payload: Value = serde_json::from_slice(&state_body).unwrap();
    let flow_id = state_payload["data"]["draft"]["document"]["meta"]["flowId"]
        .as_str()
        .unwrap();

    let save = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/draft"
                ))
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "document": build_ready_provider_document(flow_id, provider_instance_id),
                        "change_kind": "logical",
                        "summary": "seed provider-ready flow"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(save.status(), StatusCode::OK);
    application_id
}

fn build_human_input_document(flow_id: &str, provider_instance_id: &str) -> Value {
    json!({
        "schemaVersion": "1flowbase.flow/v2",
        "meta": { "flowId": flow_id, "name": "Support Agent", "description": "", "tags": [] },
        "graph": {
            "nodes": [
                {
                    "id": "node-start",
                    "type": "start",
                    "alias": "Start",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 0, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {},
                    "outputs": []
                },
                {
                    "id": "node-llm",
                    "type": "llm",
                    "alias": "LLM",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 240, "y": 0 },
                    "configVersion": 1,
                    "config": {
                        "model_provider": {
                            "provider_code": "fixture_provider",
                            "source_instance_id": provider_instance_id,
                            "model_id": "fixture_chat"
                        },
                        "temperature": 0.2
                    },
                    "bindings": {
                        "prompt_messages": { "kind": "prompt_messages", "value": [{ "id": "user-1", "role": "user", "content": { "kind": "templated_text", "value": "{{node-start.query}}" } }] }
                    },
                    "outputs": [{ "key": "text", "title": "模型输出", "valueType": "string" }]
                },
                {
                    "id": "node-human",
                    "type": "human_input",
                    "alias": "Human Input",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 480, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {
                        "prompt": { "kind": "templated_text", "value": "请审核：{{ node-llm.text }}" }
                    },
                    "outputs": [{ "key": "input", "title": "人工输入", "valueType": "string" }]
                },
                {
                    "id": "node-answer",
                    "type": "answer",
                    "alias": "Answer",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 720, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {
                        "answer_template": { "kind": "selector", "value": ["node-human", "input"] }
                    },
                    "outputs": [{ "key": "answer", "title": "对话输出", "valueType": "string" }]
                }
            ],
            "edges": [
                { "id": "edge-start-llm", "source": "node-start", "target": "node-llm", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] },
                { "id": "edge-llm-human", "source": "node-llm", "target": "node-human", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] },
                { "id": "edge-human-answer", "source": "node-human", "target": "node-answer", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] }
            ]
        },
        "editor": { "viewport": { "x": 0, "y": 0, "zoom": 1 }, "annotations": [], "activeContainerPath": [] }
    })
}

async fn seed_human_input_application(
    app: &axum::Router,
    cookie: &str,
    csrf: &str,
    provider_instance_id: &str,
) -> String {
    let application_id = seed_agent_flow_application(app, cookie, csrf, provider_instance_id).await;
    let state = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration"
                ))
                .header("cookie", cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(state.status(), StatusCode::OK);
    let state_body = to_bytes(state.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&state_body).unwrap();
    let flow_id = payload["data"]["draft"]["document"]["meta"]["flowId"]
        .as_str()
        .unwrap();

    let save = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/draft"
                ))
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "document": build_human_input_document(flow_id, provider_instance_id),
                        "change_kind": "logical",
                        "summary": "seed human input flow"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(save.status(), StatusCode::OK);
    application_id
}

async fn wait_for_run_detail(
    app: &axum::Router,
    cookie: &str,
    application_id: &str,
    run_id: &str,
    expected_statuses: &[&str],
) -> Value {
    let mut last_status = String::new();
    let mut last_error = Value::Null;
    for _ in 0..200 {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/console/applications/{application_id}/logs/runs/{run_id}"
                    ))
                    .header("cookie", cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        let status = payload["data"]["flow_run"]["status"]
            .as_str()
            .unwrap_or_default();
        last_status = status.to_string();
        last_error = payload["data"]["flow_run"]["error_payload"].clone();
        if expected_statuses.contains(&status) {
            return payload["data"].clone();
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }

    panic!(
        "timed out waiting for run status: {expected_statuses:?}, last status: {last_status}, last error: {last_error}"
    );
}

async fn resolve_runtime_debug_artifact_value(
    app: &axum::Router,
    cookie: &str,
    application_id: &str,
    value: &Value,
) -> Value {
    if value["__runtime_debug_artifact"] != true {
        return value.clone();
    }

    let artifact_ref = value["artifact_ref"]
        .as_str()
        .expect("debug artifact preview should include artifact_ref");
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/debug-artifacts/{artifact_ref}"
                ))
                .header("cookie", cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    serde_json::from_slice(&body).unwrap()
}

async fn wait_for_persisted_text_delta_events(
    app: &axum::Router,
    cookie: &str,
    application_id: &str,
    run_id: &str,
) -> Vec<Value> {
    wait_for_run_detail(
        app,
        cookie,
        application_id,
        run_id,
        &["succeeded", "failed", "cancelled"],
    )
    .await;
    let mut last_event_types = Vec::new();
    for _ in 0..200 {
        let detail = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/console/applications/{application_id}/logs/runs/{run_id}/debug-stream"
                    ))
                    .header("cookie", cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(detail.status(), StatusCode::OK);
        let body = to_bytes(detail.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        let parts = payload["data"]["parts"].as_array().unwrap();
        last_event_types = parts
            .iter()
            .filter_map(|part| {
                part["payload"]["event_type"]
                    .as_str()
                    .map(ToString::to_string)
            })
            .collect();
        let has_terminal_stream_event = parts.iter().any(|part| {
            matches!(
                part["payload"]["event_type"].as_str(),
                Some(
                    "flow_finished"
                        | "flow_failed"
                        | "flow_cancelled"
                        | "finish"
                        | "flow_run_completed"
                        | "flow_run_failed"
                        | "flow_run_cancelled"
                )
            )
        });
        if has_terminal_stream_event {
            let text_delta_events = parts
                .iter()
                .filter(|part| part["payload"]["event_type"].as_str() == Some("text_delta"))
                .cloned()
                .collect::<Vec<_>>();
            if !text_delta_events.is_empty() {
                return text_delta_events;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }

    panic!(
        "timed out waiting for persisted runtime stream terminal event, last event types: {last_event_types:?}"
    );
}

fn sse_data_payload(frame: &str) -> Value {
    let data = frame
        .lines()
        .find_map(|line| line.strip_prefix("data:"))
        .expect("sse frame should include data")
        .trim();
    serde_json::from_str(data).expect("sse data should be json")
}

#[tokio::test]
async fn get_runtime_debug_stream_returns_trusted_parts() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let provider_instance_id = create_ready_provider_instance(&app, &cookie, &csrf).await;
    let application_id =
        seed_agent_flow_application(&app, &cookie, &csrf, &provider_instance_id).await;

    let preview = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/nodes/node-llm/debug-runs"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "input_payload": {
                            "node-start": { "query": "总结退款政策" },
                            "node-llm": { "prompt_messages": ["resolved prompt must stay audit-only"] }
                        },
                        "debug_session_id": DEBUG_SESSION_ID
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(preview.status(), StatusCode::CREATED);
    let preview_body = to_bytes(preview.into_body(), usize::MAX).await.unwrap();
    let preview_payload: Value = serde_json::from_slice(&preview_body).unwrap();
    let run_id = preview_payload["data"]["flow_run"]["id"].as_str().unwrap();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!(
                    "/api/console/applications/{application_id}/logs/runs/{run_id}/debug-stream"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert!(payload["data"]["parts"]
        .as_array()
        .unwrap()
        .iter()
        .any(|part| part["trust_level"] == "host_fact"));
}

#[tokio::test]
async fn get_debug_variable_snapshot_restores_latest_preview_inputs_and_outputs() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let provider_instance_id = create_ready_provider_instance(&app, &cookie, &csrf).await;
    let application_id =
        seed_agent_flow_application(&app, &cookie, &csrf, &provider_instance_id).await;

    let preview = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/nodes/node-llm/debug-runs"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "input_payload": {
                            "node-start": { "query": "总结退款政策" },
                            "node-llm": { "prompt_messages": ["resolved prompt must stay audit-only"] }
                        },
                        "debug_session_id": DEBUG_SESSION_ID
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(preview.status(), StatusCode::CREATED);
    let preview_body = to_bytes(preview.into_body(), usize::MAX).await.unwrap();
    let preview_payload: Value = serde_json::from_slice(&preview_body).unwrap();
    let flow_run_id = preview_payload["data"]["flow_run"]["id"].as_str().unwrap();
    let draft_id = preview_payload["data"]["flow_run"]["draft_id"]
        .as_str()
        .unwrap();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/debug-variable-snapshot"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(
        payload["data"]["snapshot_schema_version"],
        "1flowbase.debug-variable-snapshot/v1"
    );
    assert!(payload["data"]["workspace_id"].is_string());
    assert!(payload["data"]["actor_user_id"].is_string());
    assert_eq!(payload["data"]["draft_id"], draft_id);
    assert_eq!(payload["data"]["flow_schema_version"], "1flowbase.flow/v2");
    let document_hash = payload["data"]["document_hash"].as_str().unwrap();
    assert!(document_hash.starts_with("sha256:"));
    let debug_session_id = payload["data"]["debug_session_id"].as_str().unwrap();
    assert_eq!(debug_session_id, "");
    assert!(payload["data"]["document_hash"]
        .as_str()
        .unwrap()
        .starts_with("sha256:"));
    assert_eq!(payload["data"]["snapshot_completeness"], "complete");
    assert_eq!(
        payload["data"]["latest_run_scope"],
        json!({
            "flow_run_id": flow_run_id,
            "run_mode": "debug_node_preview",
            "status": "succeeded",
            "target_node_id": "node-llm"
        })
    );
    assert_eq!(
        payload["data"]["variable_cache"]["node-start"]["query"],
        "总结退款政策"
    );
    assert_eq!(payload["data"]["source_flow_run_ids"], json!({}));
    assert!(payload["data"]["variable_cache"]["node-llm"]["prompt_messages"].is_null());
    assert_eq!(
        payload["data"]["variable_cache"]["node-llm"]["text"],
        "reply:总结退款政策"
    );
    assert!(payload["data"]["source_node_run_ids"]["node-llm"]["text"].is_null());
}

#[tokio::test]
async fn external_agent_opaque_boundary_keeps_external_trust_level() {
    let (app, database_url) = test_app_with_database_url().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let provider_instance_id = create_ready_provider_instance(&app, &cookie, &csrf).await;
    let application_id =
        seed_agent_flow_application(&app, &cookie, &csrf, &provider_instance_id).await;

    let preview = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/nodes/node-llm/debug-runs"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "input_payload": {
                            "node-start": { "query": "总结退款政策" }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(preview.status(), StatusCode::CREATED);
    let preview_body = to_bytes(preview.into_body(), usize::MAX).await.unwrap();
    let preview_payload: Value = serde_json::from_slice(&preview_body).unwrap();
    let run_id =
        Uuid::parse_str(preview_payload["data"]["flow_run"]["id"].as_str().unwrap()).unwrap();
    let store = storage_durable::build_main_durable_postgres(&database_url)
        .await
        .unwrap()
        .store;
    control_plane::runtime_observability::mark_external_opaque_boundary(
        &store,
        run_id,
        json!({ "reason": "external local tool execution not observed" }),
    )
    .await
    .unwrap();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!(
                    "/api/console/applications/{application_id}/logs/runs/{run_id}/debug-stream"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert!(payload["data"]["parts"]
        .as_array()
        .unwrap()
        .iter()
        .any(|part| {
            part["trust_level"] == "external_opaque"
                && part["payload"]["event_type"] == "external_agent_opaque_boundary_marked"
        }));
}

#[tokio::test]
async fn application_runtime_routes_start_node_preview_and_query_logs() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let provider_instance_id = create_ready_provider_instance(&app, &cookie, &csrf).await;
    let application_id =
        seed_agent_flow_application(&app, &cookie, &csrf, &provider_instance_id).await;

    let preview = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/nodes/node-llm/debug-runs"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "input_payload": {
                            "node-start": { "query": "总结退款政策" }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let preview_status = preview.status();
    let preview_body = to_bytes(preview.into_body(), usize::MAX).await.unwrap();
    assert_eq!(
        preview_status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&preview_body)
    );
    let preview_payload: Value = serde_json::from_slice(&preview_body).unwrap();
    let flow_run_id = preview_payload["data"]["flow_run"]["id"]
        .as_str()
        .unwrap()
        .to_string();

    assert_eq!(
        preview_payload["data"]["flow_run"]["run_mode"].as_str(),
        Some("debug_node_preview")
    );
    assert_eq!(
        preview_payload["data"]["node_run"]["node_id"].as_str(),
        Some("node-llm")
    );
    assert_eq!(
        preview_payload["data"]["node_run"]["output_payload"]["text"],
        json!("reply:总结退款政策")
    );
    for hidden_key in [
        "resolved_inputs",
        "rendered_templates",
        "output_contract",
        "metrics_payload",
        "debug_payload",
        "provider_events",
    ] {
        assert!(
            preview_payload["data"]["node_run"]["output_payload"]
                .get(hidden_key)
                .is_none(),
            "{hidden_key} must not leak into node output"
        );
        assert!(
            preview_payload["data"]["flow_run"]["output_payload"]
                .get(hidden_key)
                .is_none(),
            "{hidden_key} must not leak into flow output"
        );
    }
    assert_eq!(
        preview_payload["data"]["events"][0]["event_type"].as_str(),
        Some("node_preview_started")
    );
    let event_types = preview_payload["data"]["events"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|event| event["event_type"].as_str())
        .collect::<Vec<_>>();
    assert!(event_types.contains(&"text_delta"));
    assert!(event_types.contains(&"usage_snapshot"));
    assert!(event_types.contains(&"finish"));
    assert!(event_types.contains(&"node_preview_completed"));

    let list = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/logs/runs"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(list.status(), StatusCode::OK);
    let list_body = to_bytes(list.into_body(), usize::MAX).await.unwrap();
    let list_payload: Value = serde_json::from_slice(&list_body).unwrap();
    assert_eq!(list_payload["data"].as_array().unwrap().len(), 1);
    assert_eq!(
        list_payload["data"][0]["id"].as_str(),
        Some(flow_run_id.as_str())
    );

    let detail = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/logs/runs/{flow_run_id}"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(detail.status(), StatusCode::OK);
    let detail_body = to_bytes(detail.into_body(), usize::MAX).await.unwrap();
    let detail_payload: Value = serde_json::from_slice(&detail_body).unwrap();
    assert_eq!(
        detail_payload["data"]["flow_run"]["id"].as_str(),
        Some(flow_run_id.as_str())
    );
    assert_eq!(
        detail_payload["data"]["node_runs"][0]["node_alias"].as_str(),
        Some("LLM")
    );
    let scoped_node_run = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/logs/runs/{flow_run_id}/nodes/node-llm"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(scoped_node_run.status(), StatusCode::OK);
    let scoped_node_run_body = to_bytes(scoped_node_run.into_body(), usize::MAX)
        .await
        .unwrap();
    let scoped_node_run_payload: Value = serde_json::from_slice(&scoped_node_run_body).unwrap();
    assert_eq!(
        scoped_node_run_payload["data"]["node_run"]["node_id"].as_str(),
        Some("node-llm")
    );
    assert!(scoped_node_run_payload["data"]["events"]
        .as_array()
        .unwrap()
        .iter()
        .all(|event| event["node_run_id"].as_str()
            == Some(
                scoped_node_run_payload["data"]["node_run"]["id"]
                    .as_str()
                    .unwrap()
            )));

    let last_run = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/nodes/node-llm/last-run"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(last_run.status(), StatusCode::OK);
    let last_run_body = to_bytes(last_run.into_body(), usize::MAX).await.unwrap();
    let last_run_payload: Value = serde_json::from_slice(&last_run_body).unwrap();
    assert_eq!(
        last_run_payload["data"]["node_run"]["node_id"].as_str(),
        Some("node-llm")
    );
    assert_eq!(
        last_run_payload["data"]["flow_run"]["id"].as_str(),
        Some(flow_run_id.as_str())
    );
}

#[tokio::test]
async fn application_runtime_routes_start_debug_run_and_resume_waiting_human() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let provider_instance_id = create_ready_provider_instance(&app, &cookie, &csrf).await;
    let application_id =
        seed_human_input_application(&app, &cookie, &csrf, &provider_instance_id).await;

    let start = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/debug-runs"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "input_payload": {
                            "node-start": { "query": "请总结退款政策" }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let start_status = start.status();
    let start_body = to_bytes(start.into_body(), usize::MAX).await.unwrap();
    assert_eq!(
        start_status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&start_body)
    );
    let payload: Value = serde_json::from_slice(&start_body).unwrap();
    let run_id = payload["data"]["flow_run"]["id"].as_str().unwrap();
    assert_eq!(
        payload["data"]["flow_run"]["status"].as_str(),
        Some("running")
    );
    let detail =
        wait_for_run_detail(&app, &cookie, &application_id, run_id, &["waiting_human"]).await;
    let checkpoint_id = detail["checkpoints"][0]["id"].as_str().unwrap();

    let resume = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/runs/{run_id}/resume"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "checkpoint_id": checkpoint_id,
                        "input_payload": {
                            "node-human": { "input": "已审核通过" }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(resume.status(), StatusCode::OK);
}

#[tokio::test]
async fn application_runtime_routes_start_debug_run_persists_gateway_billing_audit() {
    let (app, database_url) = test_app_with_database_url().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let provider_instance_id = create_ready_provider_instance(&app, &cookie, &csrf).await;
    let application_id =
        seed_agent_flow_application(&app, &cookie, &csrf, &provider_instance_id).await;

    let start = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/debug-runs"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "input_payload": {
                            "node-start": { "query": "请总结退款政策" }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let start_status = start.status();
    let start_body = to_bytes(start.into_body(), usize::MAX).await.unwrap();
    assert_eq!(
        start_status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&start_body)
    );
    let payload: Value = serde_json::from_slice(&start_body).unwrap();
    let run_id = Uuid::parse_str(payload["data"]["flow_run"]["id"].as_str().unwrap()).unwrap();
    let event_types = payload["data"]["events"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|event| event["event_type"].as_str())
        .collect::<Vec<_>>();
    assert!(event_types.contains(&"gateway_billing_session_reserved"));

    let pool = sqlx::PgPool::connect(&database_url).await.unwrap();
    let (billing_count,): (i64,) =
        sqlx::query_as("select count(*) from billing_sessions where flow_run_id = $1")
            .bind(run_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let (cost_count,): (i64,) =
        sqlx::query_as("select count(*) from runtime_cost_ledger where flow_run_id = $1")
            .bind(run_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let (credit_count,): (i64,) =
        sqlx::query_as("select count(*) from runtime_credit_ledger where flow_run_id = $1")
            .bind(run_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let (audit_count,): (i64,) =
        sqlx::query_as("select count(*) from runtime_audit_hashes where flow_run_id = $1")
            .bind(run_id)
            .fetch_one(&pool)
            .await
            .unwrap();

    assert_eq!(billing_count, 1);
    assert_eq!(cost_count, 1);
    assert_eq!(credit_count, 1);
    assert_eq!(audit_count, 3);
}

#[tokio::test]
async fn application_runtime_routes_cancel_waiting_flow_run() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let provider_instance_id = create_ready_provider_instance(&app, &cookie, &csrf).await;
    let application_id =
        seed_human_input_application(&app, &cookie, &csrf, &provider_instance_id).await;

    let start = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/debug-runs"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "input_payload": {
                            "node-start": { "query": "请总结退款政策" }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(start.status(), StatusCode::CREATED);
    let start_body = to_bytes(start.into_body(), usize::MAX).await.unwrap();
    let start_payload: Value = serde_json::from_slice(&start_body).unwrap();
    let run_id = start_payload["data"]["flow_run"]["id"].as_str().unwrap();
    let waiting_detail =
        wait_for_run_detail(&app, &cookie, &application_id, run_id, &["waiting_human"]).await;
    assert_eq!(
        waiting_detail["flow_run"]["status"].as_str(),
        Some("waiting_human")
    );

    let cancel = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/runs/{run_id}/cancel"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(cancel.status(), StatusCode::OK);
    let cancel_body = to_bytes(cancel.into_body(), usize::MAX).await.unwrap();
    let cancel_payload: Value = serde_json::from_slice(&cancel_body).unwrap();
    assert_eq!(
        cancel_payload["data"]["flow_run"]["status"].as_str(),
        Some("cancelled")
    );
    assert!(cancel_payload["data"]["events"]
        .as_array()
        .unwrap()
        .iter()
        .any(|event| event["event_type"].as_str() == Some("flow_run_cancelled")));
}

#[tokio::test]
async fn stream_debug_run_returns_flow_accepted_before_background_compile_finishes() {
    let (state, _database_url) = crate::_tests::support::test_api_state_with_database_url().await;
    let app = crate::app_with_state(state.clone());
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let create = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/applications")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "application_type": "agent_flow",
                        "name": "Fast Start SSE",
                        "description": "runtime stream",
                        "icon": "RobotOutlined",
                        "icon_type": "iconfont",
                        "icon_background": "#E6F7F2"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create.status(), StatusCode::CREATED);
    let body = to_bytes(create.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    let application_id = payload["data"]["id"].as_str().unwrap();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/debug-runs/stream"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("accept", "text/event-stream")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "input_payload": { "node-start": { "query": "hello" } }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), axum::http::StatusCode::OK);
    let body = crate::_tests::support::read_first_sse_frame(response).await;
    assert!(body.contains("\"type\":\"flow_accepted\""), "{body}");
    assert!(!body.contains("\"type\":\"flow_started\""), "{body}");
}

#[tokio::test]
async fn application_runtime_routes_stream_debug_run_returns_flow_accepted() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let provider_instance_id = create_ready_provider_instance(&app, &cookie, &csrf).await;
    let application_id =
        seed_agent_flow_application(&app, &cookie, &csrf, &provider_instance_id).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/debug-runs/stream"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("accept", "text/event-stream")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "input_payload": {
                            "node-start": { "query": "请总结退款政策" }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers()["content-type"].to_str().unwrap(),
        "text/event-stream"
    );
    let stream_text = crate::_tests::support::read_first_sse_frame(response).await;

    assert!(
        stream_text.contains("event: flow_accepted"),
        "{stream_text}"
    );
    assert!(
        stream_text.contains("\"type\":\"flow_accepted\""),
        "{stream_text}"
    );
    let run_id = sse_data_payload(&stream_text)["run_id"]
        .as_str()
        .unwrap()
        .to_string();
    let text_delta_events =
        wait_for_persisted_text_delta_events(&app, &cookie, &application_id, &run_id).await;
    assert_eq!(
        text_delta_events.len(),
        1,
        "streamed debug run should persist one logical durable text_delta event: {text_delta_events:?}"
    );
    let text_delta = &text_delta_events[0];
    let text_delta_payload = resolve_runtime_debug_artifact_value(
        &app,
        &cookie,
        &application_id,
        &text_delta["payload"]["payload"],
    )
    .await;
    assert!(!text_delta_payload["text"].as_str().unwrap().is_empty());
    assert!(
        text_delta_payload["delta"].is_null(),
        "streamed debug run should not persist legacy provider delta payload: {text_delta_payload:?}"
    );
}

#[tokio::test]
async fn application_runtime_routes_runtime_debug_artifact_full_load_returns_original_payload() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let provider_instance_id = create_ready_provider_instance(&app, &cookie, &csrf).await;
    let application_id =
        seed_agent_flow_application(&app, &cookie, &csrf, &provider_instance_id).await;
    let other_application_id =
        seed_agent_flow_application(&app, &cookie, &csrf, &provider_instance_id).await;
    let large_query = "退款政策".repeat(900);
    let debug_session_id = "runtime-debug-artifact-session";

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/debug-runs"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "debug_session_id": debug_session_id,
                        "input_payload": {
                            "node-start": { "query": large_query }
                        }
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
    let run_id = payload["data"]["flow_run"]["id"].as_str().unwrap();

    let snapshot_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/debug-variable-snapshot"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(snapshot_response.status(), StatusCode::OK);
    let snapshot_body = to_bytes(snapshot_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let snapshot_payload: Value = serde_json::from_slice(&snapshot_body).unwrap();
    assert!(snapshot_payload["data"]["variable_cache"]["node-start"].is_null());

    let detail = wait_for_run_detail(
        &app,
        &cookie,
        &application_id,
        run_id,
        &["succeeded", "failed", "cancelled"],
    )
    .await;
    let preview = &detail["flow_run"]["input_payload"];

    assert_eq!(preview["__runtime_debug_artifact"], true);
    assert_eq!(preview["is_truncated"], true);
    assert!(preview["preview"].as_str().unwrap().len() < large_query.len());
    let artifact_ref = preview["artifact_ref"].as_str().unwrap();

    let unauthorized_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/debug-artifacts/{artifact_ref}"
                ))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauthorized_response.status(), StatusCode::UNAUTHORIZED);

    let wrong_application_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{other_application_id}/orchestration/debug-artifacts/{artifact_ref}"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(wrong_application_response.status(), StatusCode::NOT_FOUND);

    let artifact_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/orchestration/debug-artifacts/{artifact_ref}"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(artifact_response.status(), StatusCode::OK);
    assert_eq!(
        artifact_response.headers()["content-type"]
            .to_str()
            .unwrap(),
        "application/json"
    );
    let artifact_body = to_bytes(artifact_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let full_payload: Value = serde_json::from_slice(&artifact_body).unwrap();

    assert_eq!(full_payload["node-start"]["query"], large_query);
}
