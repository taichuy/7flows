use crate::_tests::support::{login_and_capture_cookie, test_app};
use api_server::app;
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::{json, Map, Value};
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

async fn create_member(app: &axum::Router, cookie: &str, csrf: &str, account: &str) -> String {
    let response = app
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
                        "password": "temp-pass",
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

    assert_eq!(response.status(), StatusCode::CREATED);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    payload["data"]["id"].as_str().unwrap().to_string()
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
async fn openapi_contains_session_csrf_and_patch_me_routes() {
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
    let paths = payload["paths"].as_object().cloned().unwrap_or_default();
    let components = payload["components"]["schemas"]
        .as_object()
        .cloned()
        .unwrap_or_default();

    assert!(paths.contains_key("/api/console/session"));
    assert_eq!(
        paths["/api/console/me"]["patch"]["operationId"].as_str(),
        Some("patch_me")
    );
    assert!(components.contains_key("PatchMeBody"));
    assert_eq!(
        components["SessionResponse"]["properties"]["csrf_token"]["type"].as_str(),
        Some("string")
    );
}

#[tokio::test]
async fn openapi_contains_workspace_switch_routes() {
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
    let paths = payload["paths"].as_object().cloned().unwrap_or_default();
    let components = payload["components"]["schemas"]
        .as_object()
        .cloned()
        .unwrap_or_default();

    assert!(paths.contains_key("/api/console/workspaces"));
    assert!(paths.contains_key("/api/console/session/actions/switch-workspace"));
    assert!(components.contains_key("WorkspaceSummaryResponse"));
    assert!(components.contains_key("SwitchWorkspaceBody"));
}

#[tokio::test]
async fn openapi_excludes_legacy_member_mutation_routes() {
    let paths = openapi_paths().await;
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let action_member_id = create_member(&app, &cookie, &csrf, "action-member").await;
    let legacy_member_id = create_member(&app, &cookie, &csrf, "legacy-member").await;

    for route in [
        "/api/console/members/{id}/disable",
        "/api/console/members/{id}/reset-password",
    ] {
        assert!(
            !paths.contains_key(route),
            "expected openapi to exclude legacy path {route}"
        );
    }

    let member_mutation_paths = paths
        .keys()
        .filter(|route| {
            route.starts_with("/api/console/members/{id}/")
                && (route.contains("disable") || route.contains("reset-password"))
        })
        .cloned()
        .collect::<Vec<_>>();
    assert_eq!(
        member_mutation_paths,
        vec![
            "/api/console/members/{id}/actions/disable".to_string(),
            "/api/console/members/{id}/actions/reset-password".to_string(),
        ]
    );

    let action_reset_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/members/{action_member_id}/actions/reset-password"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "new_password": "next-pass"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(action_reset_response.status(), StatusCode::NO_CONTENT);

    let action_disable_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/members/{action_member_id}/actions/disable"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(action_disable_response.status(), StatusCode::NO_CONTENT);

    let legacy_reset_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/members/{legacy_member_id}/reset-password"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "new_password": "legacy-pass"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(legacy_reset_response.status(), StatusCode::NOT_FOUND);

    let legacy_disable_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/members/{legacy_member_id}/disable"))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(legacy_disable_response.status(), StatusCode::NOT_FOUND);
}
