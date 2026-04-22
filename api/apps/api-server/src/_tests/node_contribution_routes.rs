use crate::_tests::support::{login_and_capture_cookie, test_app_with_database_url};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

async fn create_application(app: &axum::Router, cookie: &str, csrf: &str, name: &str) -> String {
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
                        "description": "node contribution test application",
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

async fn seed_node_contribution_registry(database_url: &str) -> (Uuid, Uuid) {
    let pool = PgPool::connect(database_url).await.unwrap();
    let workspace_id: Uuid =
        sqlx::query_scalar("select id from workspaces order by created_at asc limit 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    let actor_id: Uuid = sqlx::query_scalar("select id from users where account = 'root' limit 1")
        .fetch_one(&pool)
        .await
        .unwrap();

    let installation_id = Uuid::now_v7();
    let contribution_id = Uuid::now_v7();
    let assignment_id = Uuid::now_v7();

    sqlx::query(
        r#"
        insert into plugin_installations (
            id,
            provider_code,
            plugin_id,
            plugin_version,
            contract_version,
            protocol,
            display_name,
            source_kind,
            trust_level,
            verification_status,
            desired_state,
            artifact_status,
            runtime_status,
            availability_status,
            package_path,
            installed_path,
            checksum,
            manifest_fingerprint,
            signature_status,
            signature_algorithm,
            signing_key_id,
            last_load_error,
            metadata_json,
            created_by
        ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        )
        "#,
    )
    .bind(installation_id)
    .bind("fixture_provider")
    .bind("fixture_provider@1.2.3")
    .bind("1.2.3")
    .bind("1flowbase.capability/v1")
    .bind("stdio_json")
    .bind("Fixture Provider")
    .bind("uploaded")
    .bind("verified_official")
    .bind("valid")
    .bind("active_requested")
    .bind("ready")
    .bind("inactive")
    .bind("available")
    .bind::<Option<String>>(None)
    .bind("/tmp/plugins/fixture_provider/1.2.3")
    .bind::<Option<String>>(None)
    .bind::<Option<String>>(None)
    .bind(Some("verified"))
    .bind(Some("ed25519"))
    .bind(Some("fixture-key"))
    .bind::<Option<String>>(None)
    .bind(json!({}))
    .bind(actor_id)
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        r#"
        insert into plugin_assignments (
            id,
            installation_id,
            workspace_id,
            provider_code,
            assigned_by
        ) values ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(assignment_id)
    .bind(installation_id)
    .bind(workspace_id)
    .bind("fixture_provider")
    .bind(actor_id)
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        r#"
        insert into node_contribution_registry (
            id,
            installation_id,
            provider_code,
            plugin_id,
            plugin_version,
            contribution_code,
            node_shell,
            category,
            title,
            description,
            icon,
            schema_ui,
            schema_version,
            output_schema,
            required_auth,
            visibility,
            experimental,
            dependency_installation_kind,
            dependency_plugin_version_range
        ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        )
        "#,
    )
    .bind(contribution_id)
    .bind(installation_id)
    .bind("fixture_provider")
    .bind("fixture_provider@1.2.3")
    .bind("1.2.3")
    .bind("fixture_prompt")
    .bind("action")
    .bind("ai")
    .bind("Fixture Prompt")
    .bind("Prompt node fixture")
    .bind("spark")
    .bind(json!({"type":"object"}))
    .bind("1flowbase.node-contribution/v1")
    .bind(json!({"type":"object"}))
    .bind(json!(["provider_instance"]))
    .bind("public")
    .bind(false)
    .bind("required")
    .bind(">=1.2.3")
    .execute(&pool)
    .await
    .unwrap();

    (workspace_id, actor_id)
}

#[tokio::test]
async fn node_contribution_routes_list_registry_entries_for_application_workspace() {
    let (app, database_url) = test_app_with_database_url().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let application_id = create_application(&app, &cookie, &csrf, "Node Contribution Target").await;
    let _ = seed_node_contribution_registry(&database_url).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!(
                    "/api/console/node-contributions?application_id={application_id}"
                ))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    let entry = payload["data"][0].clone();

    assert_eq!(payload["data"].as_array().unwrap().len(), 1);
    assert_eq!(entry["plugin_id"].as_str(), Some("fixture_provider@1.2.3"));
    assert_eq!(entry["plugin_version"].as_str(), Some("1.2.3"));
    assert_eq!(entry["contribution_code"].as_str(), Some("fixture_prompt"));
    assert_eq!(entry["node_shell"].as_str(), Some("action"));
    assert_eq!(entry["category"].as_str(), Some("ai"));
    assert_eq!(entry["title"].as_str(), Some("Fixture Prompt"));
    assert_eq!(entry["description"].as_str(), Some("Prompt node fixture"));
    assert_eq!(entry["dependency_status"].as_str(), Some("ready"));
    assert_eq!(
        entry["schema_version"].as_str(),
        Some("1flowbase.node-contribution/v1")
    );
    assert_eq!(entry["experimental"].as_bool(), Some(false));
}
