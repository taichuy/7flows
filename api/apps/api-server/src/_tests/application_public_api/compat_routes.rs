use crate::_tests::support::{login_and_capture_cookie, test_app};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use serde_json::{json, Value};
use tokio::time::{timeout, Duration};
use tower::ServiceExt;

async fn response_json(response: axum::response::Response) -> Value {
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    serde_json::from_slice(&body).unwrap()
}

async fn create_application(app: &Router, cookie: &str, csrf: &str, name: &str) -> String {
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
                        "name": name,
                        "description": "compatible public route test",
                        "icon": null,
                        "icon_type": null,
                        "icon_background": null
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    response_json(response).await["data"]["id"]
        .as_str()
        .unwrap()
        .to_string()
}

async fn create_application_key(
    app: &Router,
    cookie: &str,
    csrf: &str,
    application_id: &str,
) -> String {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/api-keys"
                ))
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "name": "Compatible route key",
                        "expires_at": null
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
    response_json(response).await["data"]["token"]
        .as_str()
        .unwrap()
        .to_string()
}

async fn publish_application(app: &Router, cookie: &str, csrf: &str, application_id: &str) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/applications/{application_id}/api-publications"
                ))
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "mapping": {
                            "input": {
                                "query_target": "node-start.query",
                                "model_target": null,
                                "inputs_target": null,
                                "history_target": "node-start.history",
                                "attachments_target": null
                            },
                            "output": {
                                "answer_selector": "answer",
                                "usage_selector": null,
                                "files_selector": null,
                                "error_selector": null
                            }
                        },
                        "api_enabled": true
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
}

async fn setup_published_app(app: &Router, name: &str) -> String {
    let (cookie, csrf) = login_and_capture_cookie(app, "root", "change-me").await;
    let application_id = create_application(app, &cookie, &csrf, name).await;
    let token = create_application_key(app, &cookie, &csrf, &application_id).await;
    publish_application(app, &cookie, &csrf, &application_id).await;
    token
}

async fn setup_unpublished_app_key(app: &Router, name: &str) -> String {
    let (cookie, csrf) = login_and_capture_cookie(app, "root", "change-me").await;
    let application_id = create_application(app, &cookie, &csrf, name).await;
    create_application_key(app, &cookie, &csrf, &application_id).await
}

async fn post_json(
    app: &Router,
    uri: &str,
    token_header: (&str, String),
    body: Value,
) -> axum::response::Response {
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .header(token_header.0, token_header.1)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap()
}

fn openai_body(stream: bool) -> Value {
    json!({
        "model": "provider/custom-model:latest",
        "stream": stream,
        "messages": [
            {"role": "system", "content": "Use the support playbook."},
            {"role": "user", "content": "Earlier question"},
            {"role": "assistant", "content": "Earlier answer"},
            {"role": "user", "content": "Final question"}
        ],
        "metadata": {
            "trace_id": "trace-openai"
        }
    })
}

fn anthropic_body(stream: bool) -> Value {
    json!({
        "model": "anthropic/custom-model:latest",
        "max_tokens": 512,
        "stream": stream,
        "system": "Use the support playbook.",
        "messages": [
            {"role": "user", "content": "Earlier question"},
            {"role": "assistant", "content": "Earlier answer"},
            {"role": "user", "content": [{"type": "text", "text": "Final question"}]}
        ],
        "metadata": {
            "user_id": "external-user-123"
        }
    })
}

#[tokio::test]
async fn compatible_routes_require_application_api_key() {
    let app = test_app().await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/chat/completions")
                .header("content-type", "application/json")
                .body(Body::from(openai_body(false).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let payload = response_json(response).await;
    assert_eq!(payload["error"]["code"], json!("not_authenticated"));
}

#[tokio::test]
async fn compatible_routes_return_not_published_for_unpublished_key_application() {
    let app = test_app().await;
    let token = setup_unpublished_app_key(&app, "Compatible Unpublished Route App").await;

    let response = post_json(
        &app,
        "/v1/messages",
        ("x-api-key", token),
        anthropic_body(false),
    )
    .await;

    assert_eq!(response.status(), StatusCode::CONFLICT);
    let payload = response_json(response).await;
    assert_eq!(payload["error"]["type"], json!("application_not_published"));
}

#[tokio::test]
async fn openai_chat_completions_accepts_bearer_and_preserves_model() {
    let app = test_app().await;
    let token = setup_published_app(&app, "OpenAI Compatible Route App").await;

    let response = post_json(
        &app,
        "/v1/chat/completions",
        ("authorization", format!("Bearer {token}")),
        openai_body(false),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    let payload = response_json(response).await;
    assert_eq!(payload["object"], json!("chat.completion"));
    assert_eq!(payload["model"], json!("provider/custom-model:latest"));
    assert_eq!(payload["choices"][0]["message"]["role"], json!("assistant"));
}

#[tokio::test]
async fn openai_chat_completions_accepts_tools_for_agent_framework_compatibility() {
    let app = test_app().await;
    let token = setup_published_app(&app, "OpenAI Tool Compatible Route App").await;
    let mut body = openai_body(false);
    body["tools"] = json!([{"type": "function", "function": {"name": "lookup"}}]);
    body["tool_choice"] = json!("auto");

    let response = post_json(
        &app,
        "/v1/chat/completions",
        ("authorization", format!("Bearer {token}")),
        body,
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    let payload = response_json(response).await;
    assert_eq!(payload["object"], json!("chat.completion"));
    assert_eq!(payload["model"], json!("provider/custom-model:latest"));
}

#[tokio::test]
async fn anthropic_messages_accepts_x_api_key_and_preserves_model() {
    let app = test_app().await;
    let token = setup_published_app(&app, "Anthropic Compatible Route App").await;

    let response = post_json(
        &app,
        "/v1/messages",
        ("x-api-key", token),
        anthropic_body(false),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    let payload = response_json(response).await;
    assert_eq!(payload["type"], json!("message"));
    assert_eq!(payload["model"], json!("anthropic/custom-model:latest"));
    assert_eq!(payload["content"][0]["type"], json!("text"));
}

#[tokio::test]
async fn anthropic_messages_accepts_agent_tool_definitions() {
    let app = test_app().await;
    let token = setup_published_app(&app, "Anthropic Tool Compatible Route App").await;
    let mut body = anthropic_body(false);
    body["tools"] = json!([
        {
            "name": "lookup_order",
            "description": "Find an order",
            "input_schema": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string"}
                }
            }
        }
    ]);
    body["tool_choice"] = json!({"type": "auto"});

    let response = post_json(&app, "/v1/messages", ("x-api-key", token), body).await;

    assert_eq!(response.status(), StatusCode::OK);
    let payload = response_json(response).await;
    assert_eq!(payload["type"], json!("message"));
    assert_eq!(payload["model"], json!("anthropic/custom-model:latest"));
}

#[tokio::test]
async fn compatible_streaming_routes_return_protocol_sse() {
    let app = test_app().await;
    let token = setup_published_app(&app, "Compatible Streaming Route App").await;

    let openai = post_json(
        &app,
        "/v1/chat/completions",
        ("authorization", format!("Bearer {token}")),
        openai_body(true),
    )
    .await;
    assert_eq!(openai.status(), StatusCode::OK);
    assert_eq!(
        openai.headers().get("content-type").unwrap(),
        "text/event-stream"
    );
    let openai_body = timeout(
        Duration::from_secs(5),
        to_bytes(openai.into_body(), usize::MAX),
    )
    .await
    .expect("OpenAI compatible SSE should finish")
    .unwrap();
    let openai_body = String::from_utf8(openai_body.to_vec()).unwrap();
    assert!(openai_body.contains("[DONE]"), "{openai_body}");
    assert!(
        !openai_body.contains("event: workflow.event"),
        "{openai_body}"
    );

    let anthropic = post_json(
        &app,
        "/v1/messages",
        ("x-api-key", token),
        anthropic_body(true),
    )
    .await;
    assert_eq!(anthropic.status(), StatusCode::OK);
    assert_eq!(
        anthropic.headers().get("content-type").unwrap(),
        "text/event-stream"
    );
    let anthropic_body = timeout(
        Duration::from_secs(5),
        to_bytes(anthropic.into_body(), usize::MAX),
    )
    .await
    .expect("Anthropic compatible SSE should finish")
    .unwrap();
    let anthropic_body = String::from_utf8(anthropic_body.to_vec()).unwrap();
    assert!(
        anthropic_body.contains("event: message_stop") || anthropic_body.contains("event: error"),
        "{anthropic_body}"
    );
    assert!(
        !anthropic_body.contains("event: workflow.event"),
        "{anthropic_body}"
    );
}
