use std::{fs, path::Path};

use crate::_tests::support::{
    login_and_capture_cookie, test_app, write_provider_manifest_v2, write_provider_runtime_script,
};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use ed25519_dalek::{Signer, SigningKey};
use flate2::{write::GzEncoder, Compression};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tar::Builder;
use tower::ServiceExt;

async fn create_member(
    app: &axum::Router,
    cookie: &str,
    csrf: &str,
    account: &str,
    password: &str,
) -> String {
    let create_response = app
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
    assert_eq!(create_response.status(), StatusCode::CREATED);
    let body = to_bytes(create_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    payload["data"]["id"].as_str().unwrap().to_string()
}

async fn create_role(app: &axum::Router, cookie: &str, csrf: &str, role_code: &str) {
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
                        "code": role_code,
                        "name": role_code,
                        "introduction": role_code
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
                    json!({ "permission_codes": permission_codes }).to_string(),
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
                .body(Body::from(json!({ "role_codes": role_codes }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

fn create_fixture_provider_package(root: &Path, version: &str) {
    fs::create_dir_all(root.join("provider")).unwrap();
    fs::create_dir_all(root.join("bin")).unwrap();
    fs::create_dir_all(root.join("models/llm")).unwrap();
    fs::create_dir_all(root.join("i18n")).unwrap();
    fs::create_dir_all(root.join("demo")).unwrap();
    fs::create_dir_all(root.join("scripts")).unwrap();
    write_provider_manifest_v2(root, "fixture_provider", "Fixture Provider", version);
    fs::write(
        root.join("provider/fixture_provider.yaml"),
        r#"provider_code: fixture_provider
display_name: Fixture Provider
protocol: openai_compatible
help_url: https://example.com/help
default_base_url: https://api.example.com
model_discovery: hybrid
config_schema:
  - key: base_url
    type: string
    required: true
  - key: api_key
    type: secret
    required: true
"#,
    )
    .unwrap();
    write_provider_runtime_script(
        &root.join("bin/fixture_provider-provider"),
        "fixture_chat",
        "Fixture Chat",
        None,
    );
    fs::write(
        root.join("models/llm/_position.yaml"),
        "items:\n  - fixture_chat\n",
    )
    .unwrap();
    fs::write(
        root.join("models/llm/fixture_chat.yaml"),
        r#"model: fixture_chat
label: Fixture Chat
family: llm
capabilities:
  - stream
"#,
    )
    .unwrap();
    fs::write(
        root.join("i18n/en_US.json"),
        r#"{ "plugin": { "label": "Fixture Provider" } }"#,
    )
    .unwrap();
    fs::write(root.join("demo/index.html"), "<html></html>").unwrap();
    fs::write(root.join("scripts/demo.sh"), "echo demo").unwrap();
}

fn create_openai_compatible_package(root: &Path, version: &str) {
    fs::create_dir_all(root.join("provider")).unwrap();
    fs::create_dir_all(root.join("bin")).unwrap();
    fs::create_dir_all(root.join("models/llm")).unwrap();
    fs::create_dir_all(root.join("i18n")).unwrap();
    write_provider_manifest_v2(root, "openai_compatible", "OpenAI Compatible", version);
    fs::write(
        root.join("provider/openai_compatible.yaml"),
        r#"provider_code: openai_compatible
display_name: OpenAI Compatible
protocol: openai_compatible
help_url: https://platform.openai.com/docs/api-reference
default_base_url: https://api.openai.com/v1
model_discovery: hybrid
config_schema:
  - key: base_url
    type: string
    required: true
  - key: api_key
    type: secret
    required: true
"#,
    )
    .unwrap();
    write_provider_runtime_script(
        &root.join("bin/openai_compatible-provider"),
        "openai_compatible_chat",
        "OpenAI Compatible Chat",
        None,
    );
    fs::write(
        root.join("models/llm/_position.yaml"),
        "items:\n  - openai_compatible_chat\n",
    )
    .unwrap();
    fs::write(
        root.join("models/llm/openai_compatible_chat.yaml"),
        r#"model: openai_compatible_chat
label: OpenAI Compatible Chat
family: llm
capabilities:
  - stream
"#,
    )
    .unwrap();
    fs::write(
        root.join("i18n/en_US.json"),
        r#"{ "plugin": { "label": "OpenAI Compatible" } }"#,
    )
    .unwrap();
}

fn build_signed_openai_upload_package(version: &str) -> Vec<u8> {
    let package_root = std::env::temp_dir().join(format!(
        "plugin-route-upload-openai-{}",
        uuid::Uuid::now_v7()
    ));
    create_openai_compatible_package(&package_root, version);

    let payload_sha256 = sha256_directory_tree(&package_root);
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let release = serde_json::json!({
        "schema_version": 1,
        "plugin_id": "1flowbase.openai_compatible",
        "provider_code": "openai_compatible",
        "version": version,
        "contract_version": "1flowbase.provider/v1",
        "artifact_sha256": "sha256:fixture-artifact",
        "payload_sha256": payload_sha256,
        "signature_algorithm": "ed25519",
        "signing_key_id": "official-key-2026-04",
        "issued_at": "2026-04-19T15:00:00Z"
    });
    let release_bytes = serde_json::to_vec(&release).unwrap();
    let signature = signing_key.sign(&release_bytes).to_bytes();
    fs::create_dir_all(package_root.join("_meta")).unwrap();
    fs::write(
        package_root.join("_meta/official-release.json"),
        release_bytes,
    )
    .unwrap();
    fs::write(package_root.join("_meta/official-release.sig"), signature).unwrap();

    let bytes = pack_tar_gz(&package_root);
    let _ = fs::remove_dir_all(&package_root);
    bytes
}

fn build_upload_body(boundary: &str, file_name: &str, package_bytes: &[u8]) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend_from_slice(
        format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{file_name}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(package_bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    body
}

fn pack_tar_gz(root: &Path) -> Vec<u8> {
    let encoder = GzEncoder::new(Vec::new(), Compression::default());
    let mut builder = Builder::new(encoder);
    append_dir_to_tar(&mut builder, root, root);
    builder.finish().unwrap();
    builder.into_inner().unwrap().finish().unwrap()
}

fn append_dir_to_tar(builder: &mut Builder<GzEncoder<Vec<u8>>>, root: &Path, current: &Path) {
    let mut children = fs::read_dir(current)
        .unwrap()
        .map(|entry| entry.unwrap())
        .collect::<Vec<_>>();
    children.sort_by_key(|entry| entry.path());
    for entry in children {
        let path = entry.path();
        let relative = path.strip_prefix(root).unwrap();
        if path.is_dir() {
            builder.append_dir(relative, &path).unwrap();
            append_dir_to_tar(builder, root, &path);
            continue;
        }
        builder.append_path_with_name(&path, relative).unwrap();
    }
}

fn sha256_directory_tree(root: &Path) -> String {
    let mut hasher = Sha256::new();
    hash_dir_recursive(root, root, &mut hasher);
    format!("sha256:{:x}", hasher.finalize())
}

fn hash_dir_recursive(root: &Path, current: &Path, hasher: &mut Sha256) {
    let mut children = fs::read_dir(current)
        .unwrap()
        .map(|entry| entry.unwrap())
        .collect::<Vec<_>>();
    children.sort_by_key(|entry| entry.path());
    for entry in children {
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        if relative.starts_with("_meta/") {
            continue;
        }
        if path.is_dir() {
            hash_dir_recursive(root, &path, hasher);
            continue;
        }
        hasher.update(relative.as_bytes());
        hasher.update([0]);
        hasher.update(fs::read(&path).unwrap());
        hasher.update([0]);
    }
}

#[tokio::test]
async fn plugin_routes_install_enable_assign_and_query_tasks() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let package_root = std::env::temp_dir().join(format!("plugin-route-{}", uuid::Uuid::now_v7()));
    create_fixture_provider_package(&package_root, "0.1.0");

    let install = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "package_root": package_root.display().to_string() }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(install.status(), StatusCode::CREATED);
    let install_payload: Value =
        serde_json::from_slice(&to_bytes(install.into_body(), usize::MAX).await.unwrap()).unwrap();
    let installation_id = install_payload["data"]["installation"]["id"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(
        install_payload["data"]["installation"]["source_kind"],
        "uploaded"
    );
    assert_eq!(
        install_payload["data"]["installation"]["signature_status"],
        "unsigned"
    );
    let install_path = install_payload["data"]["installation"]["install_path"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(!Path::new(&install_path).join("demo").exists());
    assert!(!Path::new(&install_path).join("scripts").exists());

    let enable = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/plugins/{installation_id}/enable"))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(enable.status(), StatusCode::OK);

    let assign = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/plugins/{installation_id}/assign"))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(assign.status(), StatusCode::OK);

    let catalog = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/plugins/catalog")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(catalog.status(), StatusCode::OK);
    let catalog_payload: Value =
        serde_json::from_slice(&to_bytes(catalog.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(catalog_payload["data"].as_array().unwrap().len(), 1);
    assert_eq!(
        catalog_payload["data"][0]["assigned_to_current_workspace"].as_bool(),
        Some(true)
    );

    let tasks = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/plugins/tasks")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(tasks.status(), StatusCode::OK);
    let tasks_payload: Value =
        serde_json::from_slice(&to_bytes(tasks.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(tasks_payload["data"].as_array().unwrap().len(), 3);
    let task_id = tasks_payload["data"][0]["id"].as_str().unwrap().to_string();

    let task = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/console/plugins/tasks/{task_id}"))
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(task.status(), StatusCode::OK);
}

#[tokio::test]
async fn plugin_routes_allow_view_only_users_to_read_but_not_install() {
    let app = test_app().await;
    let (root_cookie, root_csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    create_role(&app, &root_cookie, &root_csrf, "plugin_viewer").await;
    replace_role_permissions(
        &app,
        &root_cookie,
        &root_csrf,
        "plugin_viewer",
        &["plugin_config.view.all"],
    )
    .await;
    let member_id =
        create_member(&app, &root_cookie, &root_csrf, "plugin-viewer", "change-me").await;
    replace_member_roles(
        &app,
        &root_cookie,
        &root_csrf,
        &member_id,
        &["plugin_viewer"],
    )
    .await;

    let (viewer_cookie, viewer_csrf) =
        login_and_capture_cookie(&app, "plugin-viewer", "change-me").await;

    let catalog = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/plugins/catalog")
                .header("cookie", &viewer_cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(catalog.status(), StatusCode::OK);

    let denied = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install")
                .header("cookie", &viewer_cookie)
                .header("x-csrf-token", &viewer_csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "package_root": "/tmp/none" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(denied.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn plugin_routes_list_official_catalog_and_install_official_package() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let catalog = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/console/plugins/official-catalog")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(catalog.status(), StatusCode::OK);

    let install = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install-official")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "plugin_id": "1flowbase.openai_compatible" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(install.status(), StatusCode::CREATED);
}

#[tokio::test]
async fn plugin_routes_list_official_catalog_with_source_metadata() {
    let app = test_app().await;
    let (cookie, _csrf) = login_and_capture_cookie(&app, "root", "change-me").await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/console/plugins/official-catalog")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["data"]["source_kind"], "mirror_registry");
    assert_eq!(payload["data"]["source_label"], "镜像源");
    assert_eq!(
        payload["data"]["entries"][0]["plugin_id"],
        "1flowbase.openai_compatible"
    );
}

#[tokio::test]
async fn plugin_routes_install_upload_accepts_multipart_package() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let boundary = "----1flowbase-test-boundary";
    let package_bytes = build_signed_openai_upload_package("0.2.0");
    let body = build_upload_body(
        boundary,
        "openai_compatible-0.2.0.1flowbasepkg",
        &package_bytes,
    );

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install-upload")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header(
                    "content-type",
                    format!("multipart/form-data; boundary={boundary}"),
                )
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["data"]["installation"]["source_kind"], "uploaded");
    assert_eq!(
        payload["data"]["installation"]["signature_status"],
        "verified"
    );
}

#[tokio::test]
async fn plugin_routes_list_families_and_switch_local_version() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let package_root_v1 =
        std::env::temp_dir().join(format!("plugin-route-switch-v1-{}", uuid::Uuid::now_v7()));
    let package_root_v2 =
        std::env::temp_dir().join(format!("plugin-route-switch-v2-{}", uuid::Uuid::now_v7()));
    create_fixture_provider_package(&package_root_v1, "0.1.0");
    create_fixture_provider_package(&package_root_v2, "0.2.0");

    let install_v1 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "package_root": package_root_v1.display().to_string() }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(install_v1.status(), StatusCode::CREATED);
    let install_v1_payload: Value =
        serde_json::from_slice(&to_bytes(install_v1.into_body(), usize::MAX).await.unwrap())
            .unwrap();
    let installation_v1_id = install_v1_payload["data"]["installation"]["id"]
        .as_str()
        .unwrap()
        .to_string();

    let install_v2 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "package_root": package_root_v2.display().to_string() }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(install_v2.status(), StatusCode::CREATED);
    let install_v2_payload: Value =
        serde_json::from_slice(&to_bytes(install_v2.into_body(), usize::MAX).await.unwrap())
            .unwrap();
    let installation_v2_id = install_v2_payload["data"]["installation"]["id"]
        .as_str()
        .unwrap()
        .to_string();

    let enable_v1 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/plugins/{installation_v1_id}/enable"))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(enable_v1.status(), StatusCode::OK);

    let assign_v1 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/plugins/{installation_v1_id}/assign"))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(assign_v1.status(), StatusCode::OK);

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/console/plugins/families")
                .header("cookie", &cookie)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_response.status(), StatusCode::OK);

    let switch_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/families/fixture_provider/switch-version")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "installation_id": installation_v2_id }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(switch_response.status(), StatusCode::OK);
}

#[tokio::test]
async fn plugin_routes_upgrade_family_to_latest_official_version() {
    let app = test_app().await;
    let (cookie, csrf) = login_and_capture_cookie(&app, "root", "change-me").await;
    let package_root_v1 =
        std::env::temp_dir().join(format!("plugin-route-openai-v1-{}", uuid::Uuid::now_v7()));
    create_openai_compatible_package(&package_root_v1, "0.1.0");

    let install_v1 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/install")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "package_root": package_root_v1.display().to_string() }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(install_v1.status(), StatusCode::CREATED);
    let install_v1_payload: Value =
        serde_json::from_slice(&to_bytes(install_v1.into_body(), usize::MAX).await.unwrap())
            .unwrap();
    let installation_v1_id = install_v1_payload["data"]["installation"]["id"]
        .as_str()
        .unwrap()
        .to_string();

    let enable_v1 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/plugins/{installation_v1_id}/enable"))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(enable_v1.status(), StatusCode::OK);

    let assign_v1 = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/console/plugins/{installation_v1_id}/assign"))
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(assign_v1.status(), StatusCode::OK);

    let upgrade_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/console/plugins/families/openai_compatible/upgrade-latest")
                .header("cookie", &cookie)
                .header("x-csrf-token", &csrf)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(upgrade_response.status(), StatusCode::OK);
}
