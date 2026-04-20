use crate::_tests::support::{login_and_capture_cookie, test_app};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn patch_me_route_updates_editable_fields() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/console/me")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "name": "Root Next",
                        "nickname": "Captain Root",
                        "email": "root-next@example.com",
                        "phone": "13900000000",
                        "avatar_url": "https://example.com/avatar-next.png",
                        "introduction": "updated intro",
                        "preferred_locale": "zh_Hans"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let payload: serde_json::Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["data"]["preferred_locale"], "zh_Hans");

    let me_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/console/me")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(me_response.status(), StatusCode::OK);
    let updated: serde_json::Value =
        serde_json::from_slice(&to_bytes(me_response.into_body(), usize::MAX).await.unwrap())
            .unwrap();
    assert_eq!(updated["data"]["preferred_locale"], "zh_Hans");

    let clear_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/console/me")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "name": "Root Next",
                        "nickname": "Captain Root",
                        "email": "root-next@example.com",
                        "phone": "13900000000",
                        "avatar_url": "https://example.com/avatar-next.png",
                        "introduction": "updated intro",
                        "preferred_locale": null
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(clear_response.status(), StatusCode::OK);
    let cleared: serde_json::Value = serde_json::from_slice(
        &to_bytes(clear_response.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(cleared["data"]["preferred_locale"], serde_json::Value::Null);
}

#[tokio::test]
async fn patch_me_route_rejects_unsupported_locale() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri("/api/console/me")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "name": "Root Next",
                        "nickname": "Captain Root",
                        "email": "root-next@example.com",
                        "phone": "13900000000",
                        "avatar_url": "https://example.com/avatar-next.png",
                        "introduction": "updated intro",
                        "preferred_locale": "fr_FR"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let error: serde_json::Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(error["code"], "unsupported_locale");
}

#[tokio::test]
async fn change_password_route_invalidates_old_session() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/me/actions/change-password")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "old_password": "change-me",
                        "new_password": "next-pass"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    let old_session_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/console/session")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(old_session_response.status(), StatusCode::UNAUTHORIZED);

    let new_login_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/public/auth/providers/password-local/sign-in")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "identifier": "root",
                        "password": "next-pass"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(new_login_response.status(), StatusCode::OK);
}
