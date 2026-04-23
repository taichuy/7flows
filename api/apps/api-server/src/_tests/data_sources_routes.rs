use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::_tests::support::{
    login_and_capture_cookie, test_api_state_with_database_url, test_config, write_test_executable,
};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use control_plane::ports::{CreatePluginAssignmentInput, UpsertPluginInstallationInput};
use domain::{
    PluginArtifactStatus, PluginAvailabilityStatus, PluginDesiredState, PluginRuntimeStatus,
    PluginVerificationStatus,
};
use serde_json::{json, Value};
use tower::ServiceExt;

struct TempDataSourcePackage {
    root: PathBuf,
}

impl TempDataSourcePackage {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("api-server-data-source-routes-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        Self { root }
    }

    fn path(&self) -> &Path {
        &self.root
    }

    fn write(&self, relative_path: &str, content: &str) {
        let path = self.root.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }
}

impl Drop for TempDataSourcePackage {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn create_fixture_package() -> TempDataSourcePackage {
    let package = TempDataSourcePackage::new();
    fs::create_dir_all(package.path().join("bin")).unwrap();
    fs::create_dir_all(package.path().join("datasource")).unwrap();
    package.write(
        "manifest.yaml",
        r#"manifest_version: 1
plugin_id: fixture_data_source@0.1.0
version: 0.1.0
vendor: 1flowbase tests
display_name: Fixture Data Source
description: Fixture Data Source
icon: icon.svg
source_kind: uploaded
trust_level: unverified
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - data_source
binding_targets:
  - workspace
selection_mode: assignment_then_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.data_source/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: provider_instance_only
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/fixture_data_source
"#,
    );
    package.write(
        "datasource/fixture_data_source.yaml",
        r#"source_code: fixture_data_source
display_name: Fixture Data Source
auth_modes:
  - api_key
capabilities:
  - validate_config
  - test_connection
  - discover_catalog
  - describe_resource
  - preview_read
  - import_snapshot
supports_sync: true
supports_webhook: false
resource_kinds:
  - object
config_schema:
  - key: client_id
    label: Client ID
    type: string
    required: true
"#,
    );
    write_test_executable(
        &package.path().join("bin/fixture_data_source"),
        r#"#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"
case "${payload}" in
  *'"method":"validate_config"'*)
    printf '%s' '{"ok":true,"result":{"ok":true}}'
    ;;
  *'"method":"test_connection"'*)
    printf '%s' '{"ok":true,"result":{"status":"ok"}}'
    ;;
  *'"method":"discover_catalog"'*)
    printf '%s' '{"ok":true,"result":[{"resource_key":"contacts","display_name":"Contacts","resource_kind":"object","metadata":{}}]}'
    ;;
  *'"method":"preview_read"'*)
    printf '%s' '{"ok":true,"result":{"rows":[{"id":"1","email":"person@example.com"}],"next_cursor":null}}'
    ;;
  *)
    printf '%s' '{"ok":false,"error":{"message":"unknown method","provider_summary":null}}'
    exit 1
    ;;
esac
"#,
    );
    package
}

async fn seed_data_source_installation(
    state: &crate::app_state::ApiState,
    package_root: &Path,
) -> String {
    let root = state
        .store
        .find_user_for_password_login("root")
        .await
        .unwrap()
        .unwrap();
    let scope =
        <storage_durable::MainDurableStore as control_plane::ports::AuthRepository>::default_scope_for_user(
            &state.store,
            root.id,
        )
        .await
        .unwrap();
    let installation_id = uuid::Uuid::now_v7();

    <storage_durable::MainDurableStore as control_plane::ports::PluginRepository>::upsert_installation(
        &state.store,
        &UpsertPluginInstallationInput {
            installation_id,
            provider_code: "fixture_data_source".into(),
            plugin_id: "fixture_data_source@0.1.0".into(),
            plugin_version: "0.1.0".into(),
            contract_version: "1flowbase.data_source/v1".into(),
            protocol: "stdio_json".into(),
            display_name: "Fixture Data Source".into(),
            source_kind: "uploaded".into(),
            trust_level: "unverified".into(),
            verification_status: PluginVerificationStatus::Valid,
            desired_state: PluginDesiredState::ActiveRequested,
            artifact_status: PluginArtifactStatus::Ready,
            runtime_status: PluginRuntimeStatus::Active,
            availability_status: PluginAvailabilityStatus::Available,
            package_path: None,
            installed_path: package_root.display().to_string(),
            checksum: None,
            manifest_fingerprint: None,
            signature_status: None,
            signature_algorithm: None,
            signing_key_id: None,
            last_load_error: None,
            metadata_json: json!({}),
            actor_user_id: root.id,
        },
    )
    .await
    .unwrap();

    <storage_durable::MainDurableStore as control_plane::ports::PluginRepository>::create_assignment(
        &state.store,
        &CreatePluginAssignmentInput {
            installation_id,
            workspace_id: scope.workspace_id,
            provider_code: "fixture_data_source".into(),
            actor_user_id: root.id,
        },
    )
    .await
    .unwrap();

    installation_id.to_string()
}

#[tokio::test]
async fn data_source_routes_create_validate_preview_and_catalog() {
    let package = create_fixture_package();
    let (state, _database_url) = test_api_state_with_database_url().await;
    let config = test_config();
    let app = crate::app_with_state_and_config(state.clone(), &config);
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let installation_id = seed_data_source_installation(&state, package.path()).await;

    let catalog = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/data-sources/catalog")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(catalog.status(), StatusCode::OK);
    let catalog_payload: Value =
        serde_json::from_slice(&to_bytes(catalog.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(
        catalog_payload["data"]["entries"][0]["source_code"].as_str(),
        Some("fixture_data_source")
    );

    let create = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/data-sources/instances")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "source_code": "fixture_data_source",
                        "display_name": "Fixture Data Source",
                        "installation_id": installation_id,
                        "config_json": { "client_id": "abc" },
                        "secret_json": { "client_secret": "secret" }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create.status(), StatusCode::CREATED);
    let create_payload: Value =
        serde_json::from_slice(&to_bytes(create.into_body(), usize::MAX).await.unwrap()).unwrap();
    let instance_id = create_payload["data"]["id"].as_str().unwrap().to_string();
    assert_eq!(create_payload["data"]["status"].as_str(), Some("draft"));

    let validate = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/data-sources/instances/{instance_id}/validate"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(validate.status(), StatusCode::OK);
    let validate_payload: Value =
        serde_json::from_slice(&to_bytes(validate.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(
        validate_payload["data"]["instance"]["status"].as_str(),
        Some("ready")
    );
    assert_eq!(
        validate_payload["data"]["catalog"]["refresh_status"].as_str(),
        Some("ready")
    );

    let preview = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/console/data-sources/instances/{instance_id}/preview-read"
                ))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "resource_key": "contacts",
                        "limit": 20,
                        "options_json": { "sample": true }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(preview.status(), StatusCode::OK);
    let preview_payload: Value =
        serde_json::from_slice(&to_bytes(preview.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(
        preview_payload["data"]["output"]["rows"][0]["email"].as_str(),
        Some("person@example.com")
    );
}
