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
                        "description": "application api docs test",
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
                                "inputs_target": "node-start",
                                "history_target": "node-start.history",
                                "attachments_target": "node-start.files"
                            },
                            "output": {
                                "answer_selector": "answer",
                                "usage_selector": "usage",
                                "files_selector": null,
                                "error_selector": "error"
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

async fn setup_published_app(app: &Router) -> (String, String) {
    let (cookie, csrf) = login_and_capture_cookie(app, "root", "change-me").await;
    let application_id = create_application(app, &cookie, &csrf, "Application API Docs App").await;
    publish_application(app, &cookie, &csrf, &application_id).await;
    (cookie, application_id)
}

#[tokio::test]
async fn application_api_docs_catalog_lists_public_api_categories() {
    let app = test_app().await;
    let (cookie, application_id) = setup_published_app(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/api-docs/catalog"
                ))
                .header("cookie", cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let payload = response_json(response).await;
    let labels = payload["data"]["categories"]
        .as_array()
        .unwrap()
        .iter()
        .map(|category| category["label"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert!(labels.contains(&"Application Native API"));
    assert!(labels.contains(&"OpenAI Compatible API"));
    assert!(labels.contains(&"Anthropic Compatible API"));
}

#[tokio::test]
async fn application_api_docs_category_and_operation_specs_use_public_paths_only() {
    let app = test_app().await;
    let (cookie, application_id) = setup_published_app(&app).await;

    let operations = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/api-docs/categories/openai-compatible-api/operations"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(operations.status(), StatusCode::OK);
    let operations_payload = response_json(operations).await;
    assert_eq!(
        operations_payload["data"]["operations"][0]["path"],
        json!("/v1/chat/completions")
    );

    let spec = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/api-docs/operations/applicationOpenAiCreateChatCompletion/openapi.json"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(spec.status(), StatusCode::OK);
    let spec_payload = response_json(spec).await;
    assert!(spec_payload["paths"].get("/v1/chat/completions").is_some());
    assert!(spec_payload["paths"]
        .as_object()
        .unwrap()
        .keys()
        .all(|path| !path.contains("application_id")));
    assert_eq!(
        spec_payload["x-1flowbase-application"]["api_enabled"],
        json!(true)
    );
    assert_eq!(
        spec_payload["x-1flowbase-application"]["mapping"]["model_target"],
        Value::Null
    );
    let description = spec_payload["paths"]["/v1/chat/completions"]["post"]["description"]
        .as_str()
        .unwrap();
    assert!(description.contains("Unsupported in this v1 compatible endpoint"));
}

#[tokio::test]
async fn application_api_docs_routes_require_session_access() {
    let app = test_app().await;
    let (_, application_id) = setup_published_app(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/applications/{application_id}/api-docs/catalog"
                ))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
