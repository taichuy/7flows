use crate::_tests::support::{login_and_capture_cookie, test_app};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use tower::ServiceExt;

async fn create_member(
    app: &axum::Router,
    cookie: &str,
    csrf: &str,
    account: &str,
    password: &str,
) -> String {
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
                        "password": password,
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

async fn create_role(app: &axum::Router, cookie: &str, csrf: &str, code: &str) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/roles")
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "code": code,
                        "name": code,
                        "introduction": "docs test role"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);
}

async fn replace_role_permissions(
    app: &axum::Router,
    cookie: &str,
    csrf: &str,
    role_code: &str,
    permission_codes: &[&str],
) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/console/roles/{role_code}/permissions"))
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "permission_codes": permission_codes,
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

async fn replace_member_roles(
    app: &axum::Router,
    cookie: &str,
    csrf: &str,
    member_id: &str,
    role_codes: &[&str],
) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/console/members/{member_id}/roles"))
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "role_codes": role_codes,
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn docs_catalog_requires_session_and_permission() {
    let app = test_app().await;

    let unauthenticated_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/docs/catalog")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(unauthenticated_response.status(), StatusCode::UNAUTHORIZED);

    let (root_cookie, root_csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    create_member(&app, &root_cookie, &root_csrf, "docs-blocked", "temp-pass").await;
    let (member_cookie, _) = login_and_capture_cookie(&app, "docs-blocked", "temp-pass").await;

    let forbidden_response = app
        .oneshot(
            Request::builder()
                .uri("/api/console/docs/catalog")
                .header("cookie", member_cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(forbidden_response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn docs_routes_allow_root_and_granted_members() {
    let app = test_app().await;
    let (root_cookie, root_csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let catalog_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/docs/catalog")
                .header("cookie", &root_cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(catalog_response.status(), StatusCode::OK);
    let catalog_body = to_bytes(catalog_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let catalog_payload: Value = serde_json::from_slice(&catalog_body).unwrap();
    assert!(!catalog_payload["data"]["categories"]
        .as_array()
        .unwrap()
        .is_empty());

    let category_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/docs/categories/console/openapi.json")
                .header("cookie", &root_cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(category_response.status(), StatusCode::OK);
    let category_body = to_bytes(category_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let category_payload: Value = serde_json::from_slice(&category_body).unwrap();
    assert_eq!(category_payload["info"]["title"], "1Flowbase API");
    assert!(category_payload["paths"]["/api/console/me"]["patch"].is_object());
    assert!(category_payload["paths"]["/api/console/members"]["get"].is_object());

    let operation_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/docs/operations/patch_me/openapi.json")
                .header("cookie", &root_cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(operation_response.status(), StatusCode::OK);
    let operation_body = to_bytes(operation_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let operation_payload: Value = serde_json::from_slice(&operation_body).unwrap();
    assert_eq!(operation_payload["servers"][0]["url"], "/");
    assert_eq!(
        operation_payload["security"],
        json!([{ "sessionCookie": [], "csrfHeader": [] }])
    );
    assert_eq!(
        operation_payload["components"]["securitySchemes"]["sessionCookie"]["in"],
        "cookie"
    );
    assert_eq!(
        operation_payload["components"]["securitySchemes"]["csrfHeader"]["name"],
        "x-csrf-token"
    );

    let member_id = create_member(&app, &root_cookie, &root_csrf, "docs-viewer", "temp-pass").await;
    create_role(&app, &root_cookie, &root_csrf, "docs_viewer").await;
    replace_role_permissions(
        &app,
        &root_cookie,
        &root_csrf,
        "docs_viewer",
        &["api_reference.view.all"],
    )
    .await;
    replace_member_roles(&app, &root_cookie, &root_csrf, &member_id, &["docs_viewer"]).await;
    let (member_cookie, _) = login_and_capture_cookie(&app, "docs-viewer", "temp-pass").await;

    let member_catalog_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/docs/catalog")
                .header("cookie", &member_cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(member_catalog_response.status(), StatusCode::OK);

    let member_category_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/docs/categories/console/openapi.json")
                .header("cookie", &member_cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(member_category_response.status(), StatusCode::OK);
}

#[tokio::test]
async fn docs_operation_route_returns_404_for_unknown_operation() {
    let app = test_app().await;
    let (cookie, _) = login_and_capture_cookie(&app, "root", "change-me").await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/console/docs/operations/unknown_operation/openapi.json")
                .header("cookie", cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn docs_category_route_returns_404_for_unknown_category() {
    let app = test_app().await;
    let (cookie, _) = login_and_capture_cookie(&app, "root", "change-me").await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/console/docs/categories/missing/openapi.json")
                .header("cookie", cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
