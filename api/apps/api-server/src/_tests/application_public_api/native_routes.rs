use crate::_tests::support::{login_and_capture_cookie, test_app};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use serde_json::{json, Value};
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
                        "description": "native public route test",
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
                        "name": "Native route key",
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

async fn publish_native_application(
    app: &Router,
    cookie: &str,
    csrf: &str,
    application_id: &str,
    mapping: Value,
) {
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
                        "mapping": mapping,
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

fn mapping_without_model_target() -> Value {
    json!({
        "input": {
            "query_target": "node-start.query",
            "model_target": null,
            "inputs_target": "node-start",
            "history_target": "node-start.history",
            "attachments_target": "node-start.files"
        },
        "output": {
            "answer_selector": null,
            "usage_selector": null,
            "files_selector": null,
            "error_selector": null
        }
    })
}

fn native_run_body(model: Value) -> Value {
    json!({
        "query": "Summarize the incident",
        "model": model,
        "inputs": {
            "priority": "high"
        },
        "history": [
            {
                "role": "user",
                "content": "The customer cannot log in."
            }
        ],
        "attachments": [
            {
                "type": "file",
                "id": "file-1",
                "name": "screenshot.png"
            }
        ],
        "conversation": {
            "id": "conversation-1"
        },
        "response_mode": "blocking",
        "stream_options": {
            "include_usage": true
        },
        "execution": {
            "timeout_seconds": 30
        },
        "metadata": {
            "request_id": "req-1"
        }
    })
}

async fn post_native_run(app: &Router, token: &str, body: Value) -> axum::response::Response {
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/1flowbase/runs")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn setup_published_native_app(app: &Router, name: &str) -> String {
    let (cookie, csrf) = login_and_capture_cookie(app, "root", "change-me").await;
    let application_id = create_application(app, &cookie, &csrf, name).await;
    let token = create_application_key(app, &cookie, &csrf, &application_id).await;
    publish_native_application(
        app,
        &cookie,
        &csrf,
        &application_id,
        mapping_without_model_target(),
    )
    .await;
    token
}

#[tokio::test]
async fn native_run_route_accepts_any_string_model_and_preserves_metadata_without_node_input_model()
{
    let app = test_app().await;
    let token = setup_published_native_app(&app, "Native Route Model App").await;

    let response = post_native_run(
        &app,
        &token,
        native_run_body(json!("provider/model:any-public-string")),
    )
    .await;

    assert_eq!(response.status(), StatusCode::CREATED);
    let payload = response_json(response).await;
    assert_eq!(
        payload["data"]["metadata"]["model"],
        json!("provider/model:any-public-string")
    );
    assert_eq!(
        payload["data"]["node_input_payload"]["start"]["query"],
        json!("Summarize the incident")
    );
    assert_eq!(
        payload["data"]["node_input_payload"]["start"]["inputs"]["priority"],
        json!("high")
    );
    assert!(payload["data"]["node_input_payload"]["start"]
        .get("model")
        .is_none());
}

#[tokio::test]
async fn native_run_route_rejects_non_string_model_json_values() {
    let app = test_app().await;
    let token = setup_published_native_app(&app, "Native Route Invalid Model App").await;

    for invalid_model in [
        json!(null),
        json!(42),
        json!(true),
        json!({ "name": "gpt" }),
        json!(["gpt"]),
    ] {
        let response = post_native_run(&app, &token, native_run_body(invalid_model)).await;

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let payload = response_json(response).await;
        assert_eq!(payload["code"], json!("model"));
    }
}

#[tokio::test]
async fn native_run_route_validates_public_native_request_fields() {
    let app = test_app().await;
    let token = setup_published_native_app(&app, "Native Route Validation App").await;

    for (field, invalid_value) in [
        ("query", json!(false)),
        ("inputs", json!("not-object")),
        ("history", json!({ "role": "user" })),
        ("attachments", json!({ "id": "file-1" })),
        ("conversation", json!("not-object")),
        ("response_mode", json!(["blocking"])),
        ("stream_options", json!("not-object")),
        ("execution", json!("not-object")),
        ("metadata", json!("not-object")),
    ] {
        let mut body = native_run_body(json!("any-model"));
        body[field] = invalid_value;

        let response = post_native_run(&app, &token, body).await;

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let payload = response_json(response).await;
        assert_eq!(payload["code"], json!(field));
    }
}

#[tokio::test]
async fn native_run_route_returns_application_not_published_for_unpublished_key_application() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let application_id =
        create_application(&app, &cookie, &csrf, "Unpublished Native Route App").await;
    let token = create_application_key(&app, &cookie, &csrf, &application_id).await;

    let response = post_native_run(&app, &token, native_run_body(json!("any-model"))).await;

    assert_eq!(response.status(), StatusCode::CONFLICT);
    let payload = response_json(response).await;
    assert_eq!(payload["code"], json!("application_not_published"));
}

#[tokio::test]
async fn native_run_route_forbids_reading_run_created_by_another_application_api_key() {
    let app = test_app().await;
    let first_token = setup_published_native_app(&app, "First Native Route App").await;
    let second_token = setup_published_native_app(&app, "Second Native Route App").await;
    let created = post_native_run(&app, &first_token, native_run_body(json!("any-model"))).await;
    assert_eq!(created.status(), StatusCode::CREATED);
    let created_payload = response_json(created).await;
    let run_id = created_payload["data"]["id"].as_str().unwrap();

    let forbidden = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/1flowbase/runs/{run_id}"))
                .header("authorization", format!("Bearer {second_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(forbidden.status(), StatusCode::FORBIDDEN);
    let payload = response_json(forbidden).await;
    assert_eq!(payload["code"], json!("application_run_forbidden"));
}
