use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    body::{to_bytes, Body},
    http::{Method, Request, StatusCode},
    Router,
};
use plugin_runner::app;
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
        let root = std::env::temp_dir().join(format!("plugin-runner-data-source-tests-{nonce}"));
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

fn write_fixture_runtime(package: &TempDataSourcePackage) {
    let validate_output = json!({
        "ok": true,
        "result": {
            "ok": true,
            "sanitized": {
                "client_id": "***"
            }
        }
    })
    .to_string();
    let connection_output = json!({
        "ok": true,
        "result": {
            "status": "ok"
        }
    })
    .to_string();
    let catalog_output = json!({
        "ok": true,
        "result": [{
            "resource_key": "contacts",
            "display_name": "Contacts",
            "resource_kind": "object",
            "metadata": {}
        }]
    })
    .to_string();
    let describe_output = json!({
        "ok": true,
        "result": {
            "resource_key": "contacts",
            "primary_key": "id",
            "fields": [],
            "supports_preview_read": true,
            "supports_import_snapshot": true,
            "metadata": {}
        }
    })
    .to_string();
    let preview_output = json!({
        "ok": true,
        "result": {
            "rows": [{
                "id": "1",
                "email": "person@example.com"
            }],
            "next_cursor": null
        }
    })
    .to_string();
    let import_output = json!({
        "ok": true,
        "result": {
            "rows": [{
                "id": "1",
                "email": "person@example.com"
            }],
            "schema_version": "v1",
            "metadata": {}
        }
    })
    .to_string();
    let error_output = json!({
        "ok": false,
        "error": {
            "message": "unknown method",
            "provider_summary": null
        }
    })
    .to_string();

    package.write(
        "bin/fixture_data_source",
        &format!(
            r#"#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"
case "${{payload}}" in
  *'"method":"validate_config"'*)
    printf '%s' '{validate_output}'
    ;;
  *'"method":"test_connection"'*)
    printf '%s' '{connection_output}'
    ;;
  *'"method":"discover_catalog"'*)
    printf '%s' '{catalog_output}'
    ;;
  *'"method":"describe_resource"'*)
    printf '%s' '{describe_output}'
    ;;
  *'"method":"preview_read"'*)
    printf '%s' '{preview_output}'
    ;;
  *'"method":"import_snapshot"'*)
    printf '%s' '{import_output}'
    ;;
  *)
    printf '%s' '{error_output}'
    exit 1
    ;;
esac
"#
        ),
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let path = package.path().join("bin/fixture_data_source");
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).unwrap();
    }
}

fn make_fixture_package() -> TempDataSourcePackage {
    let package = TempDataSourcePackage::new();
    package.write(
        "manifest.yaml",
        r#"manifest_version: 1
plugin_id: fixture_data_source@0.1.0
version: 0.1.0
vendor: taichuy
display_name: Fixture Data Source
description: Fixture Data Source
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
  limits:
    memory_bytes: 134217728
    timeout_ms: 5000
node_contributions: []
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
    write_fixture_runtime(&package);
    package
}

async fn request_json(app: &Router, method: Method, uri: &str, body: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method(method)
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload = serde_json::from_slice(&body).unwrap();
    (status, payload)
}

#[tokio::test]
async fn validates_and_discovers_catalog_through_data_source_routes() {
    let package = make_fixture_package();
    let app = app();

    let (status, load_payload) = request_json(
        &app,
        Method::POST,
        "/data-sources/load",
        json!({
            "package_root": package.path(),
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let plugin_id = load_payload["plugin_id"].as_str().unwrap().to_string();

    let (status, validate_payload) = request_json(
        &app,
        Method::POST,
        "/data-sources/validate-config",
        json!({
            "plugin_id": plugin_id,
            "config_json": {
                "client_id": "abc"
            },
            "secret_json": {
                "client_secret": "secret"
            }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(validate_payload["output"]["ok"], true);

    let (status, connection_payload) = request_json(
        &app,
        Method::POST,
        "/data-sources/test-connection",
        json!({
            "plugin_id": load_payload["plugin_id"],
            "config_json": {
                "client_id": "abc"
            },
            "secret_json": {
                "client_secret": "secret"
            }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(connection_payload["output"]["status"], "ok");

    let (status, catalog_payload) = request_json(
        &app,
        Method::POST,
        "/data-sources/discover-catalog",
        json!({
            "plugin_id": load_payload["plugin_id"],
            "config_json": {
                "client_id": "abc"
            },
            "secret_json": {
                "client_secret": "secret"
            }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(catalog_payload["entries"][0]["resource_key"], "contacts");

    let (status, describe_payload) = request_json(
        &app,
        Method::POST,
        "/data-sources/describe-resource",
        json!({
            "plugin_id": load_payload["plugin_id"],
            "config_json": {
                "client_id": "abc"
            },
            "secret_json": {
                "client_secret": "secret"
            },
            "resource_key": "contacts"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(describe_payload["descriptor"]["primary_key"], "id");

    let (status, preview_payload) = request_json(
        &app,
        Method::POST,
        "/data-sources/preview-read",
        json!({
            "plugin_id": load_payload["plugin_id"],
            "input": {
                "config_json": {
                    "client_id": "abc"
                },
                "secret_json": {
                    "client_secret": "secret"
                },
                "resource_key": "contacts",
                "limit": 20,
                "cursor": null,
                "options_json": {}
            }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(preview_payload["rows"][0]["email"], "person@example.com");

    let (status, import_payload) = request_json(
        &app,
        Method::POST,
        "/data-sources/import-snapshot",
        json!({
            "plugin_id": load_payload["plugin_id"],
            "input": {
                "config_json": {
                    "client_id": "abc"
                },
                "secret_json": {
                    "client_secret": "secret"
                },
                "resource_key": "contacts",
                "limit": 20,
                "cursor": null,
                "options_json": {}
            }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(import_payload["schema_version"], "v1");
}

#[tokio::test]
async fn loads_checked_in_data_source_template_package() {
    let package_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../plugins/templates/data_source_http_fixture");

    let app = app();
    let (status, payload) = request_json(
        &app,
        Method::POST,
        "/data-sources/load",
        json!({
            "package_root": package_root,
        }),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        payload["plugin_id"].as_str(),
        Some("data_source_http_fixture@0.1.0")
    );
}
