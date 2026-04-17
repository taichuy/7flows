use crate::_tests::support::{login_and_capture_cookie, test_app};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use tower::ServiceExt;

async fn seed_agent_flow_application(
    app: &axum::Router,
    cookie: &str,
    csrf: &str,
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
    payload["data"]["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn application_runtime_routes_start_node_preview_and_query_logs() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let application_id = seed_agent_flow_application(&app, &cookie, &csrf).await;

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
        preview_payload["data"]["events"][0]["event_type"].as_str(),
        Some("node_preview_started")
    );
    assert_eq!(
        preview_payload["data"]["events"][1]["event_type"].as_str(),
        Some("node_preview_completed")
    );

    let list = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/console/applications/{application_id}/logs/runs"))
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
