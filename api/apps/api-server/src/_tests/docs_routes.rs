use crate::_tests::support::{login_and_capture_cookie, test_app, test_app_with_database_url};
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

async fn create_model(app: &axum::Router, cookie: &str, csrf: &str, code: &str) -> String {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/models")
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "scope_kind": "workspace",
                        "code": code,
                        "title": code
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

async fn create_scope_grant(
    app: &axum::Router,
    cookie: &str,
    csrf: &str,
    model_id: &str,
) -> String {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/models/{model_id}/scope-grants"))
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "scope_kind": "system",
                        "scope_id": domain::SYSTEM_SCOPE_ID,
                        "enabled": true,
                        "permission_profile": "scope_all"
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

async fn create_api_key(app: &axum::Router, cookie: &str, csrf: &str, model_id: &str) -> String {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/api-keys")
                .header("cookie", cookie)
                .header("x-csrf-token", csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "name": "docs dynamic data model key",
                        "scope_kind": "system",
                        "scope_id": domain::SYSTEM_SCOPE_ID,
                        "permissions": [{
                            "data_model_id": model_id,
                            "list": true,
                            "get": true,
                            "create": true,
                            "update": true,
                            "delete": true
                        }]
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
    payload["data"]["token"].as_str().unwrap().to_string()
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
    assert_eq!(category_payload["info"]["title"], "1flowbase API");
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

#[tokio::test]
async fn docs_routes_append_dynamic_data_model_api_category_and_specs() {
    let (app, _database_url) = test_app_with_database_url().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let ready_model_id = create_model(&app, &cookie, &csrf, "docs_ready_orders").await;
    create_scope_grant(&app, &cookie, &csrf, &ready_model_id).await;
    create_api_key(&app, &cookie, &csrf, &ready_model_id).await;

    let hidden_model_id = create_model(&app, &cookie, &csrf, "docs_hidden_orders").await;
    assert_ne!(ready_model_id, hidden_model_id);

    let catalog_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/docs/catalog")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(catalog_response.status(), StatusCode::OK);
    let catalog_payload: Value = serde_json::from_slice(
        &to_bytes(catalog_response.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    let dynamic_category = catalog_payload["data"]["categories"]
        .as_array()
        .unwrap()
        .iter()
        .find(|category| category["id"] == json!("data-model-apis"))
        .cloned()
        .expect("dynamic data model api category should exist");
    assert_eq!(dynamic_category["label"], json!("Data Model APIs"));
    assert_eq!(dynamic_category["operation_count"], json!(5));

    let operations_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/docs/categories/data-model-apis/operations")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(operations_response.status(), StatusCode::OK);
    let operations_payload: Value = serde_json::from_slice(
        &to_bytes(operations_response.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    let operations = operations_payload["data"]["operations"]
        .as_array()
        .unwrap()
        .to_vec();
    assert_eq!(operations.len(), 5);
    assert!(operations.iter().all(|operation| {
        operation["path"]
            .as_str()
            .is_some_and(|path| path.contains("/api/runtime/models/docs_ready_orders/records"))
    }));
    assert!(!operations.iter().any(|operation| {
        operation["path"]
            .as_str()
            .is_some_and(|path| path.contains("docs_hidden_orders"))
    }));

    let category_spec_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/docs/categories/data-model-apis/openapi.json")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(category_spec_response.status(), StatusCode::OK);
    let category_spec: Value = serde_json::from_slice(
        &to_bytes(category_spec_response.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert!(
        category_spec["paths"]["/api/runtime/models/docs_ready_orders/records"]["get"].is_object()
    );
    assert!(
        category_spec["paths"]["/api/runtime/models/docs_ready_orders/records/{id}"]["patch"]
            .is_object()
    );
    assert!(category_spec["paths"]
        .get("/api/runtime/models/docs_hidden_orders/records")
        .is_none());

    let list_operation = operations
        .iter()
        .find(|operation| {
            operation["method"] == json!("GET")
                && operation["path"] == json!("/api/runtime/models/docs_ready_orders/records")
        })
        .expect("list operation should exist");
    let list_operation_id = list_operation["id"].as_str().unwrap();

    let operation_spec_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/console/docs/operations/{list_operation_id}/openapi.json"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(operation_spec_response.status(), StatusCode::OK);
    let operation_spec: Value = serde_json::from_slice(
        &to_bytes(operation_spec_response.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert!(
        operation_spec["paths"]["/api/runtime/models/docs_ready_orders/records"]["get"].is_object()
    );
    assert!(operation_spec["paths"]
        .get("/api/runtime/models/{model_code}/records")
        .is_none());
    assert!(
        operation_spec["paths"]["/api/runtime/models/docs_ready_orders/records"]["post"].is_null()
    );
    assert_eq!(
        operation_spec["components"]["securitySchemes"]["apiKeyBearer"]["scheme"],
        json!("bearer")
    );
}
