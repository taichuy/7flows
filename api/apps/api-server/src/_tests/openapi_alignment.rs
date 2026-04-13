use api_server::app;
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::{Map, Value};
use tower::ServiceExt;

async fn openapi_paths() -> Map<String, Value> {
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

    payload["paths"].as_object().cloned().unwrap_or_default()
}

#[tokio::test]
async fn openapi_contains_runtime_and_model_detail_routes() {
    let paths = openapi_paths().await;

    for route in [
        "/api/console/models/{id}",
        "/api/console/models/{id}/fields",
        "/api/runtime/models/{model_code}/records",
        "/api/runtime/models/{model_code}/records/{id}",
        "/api/console/session/actions/revoke-all",
        "/api/console/me/actions/change-password",
    ] {
        assert!(
            paths.contains_key(route),
            "expected openapi to contain path {route}, got: {:?}",
            paths.keys().collect::<Vec<_>>()
        );
    }
}

#[tokio::test]
async fn openapi_excludes_legacy_member_mutation_routes() {
    let paths = openapi_paths().await;

    for route in [
        "/api/console/members/{id}/disable",
        "/api/console/members/{id}/reset-password",
    ] {
        assert!(
            !paths.contains_key(route),
            "expected openapi to exclude legacy path {route}"
        );
    }
}
