use control_plane::ports::{
    CreateDataSourceInstanceInput, CreateDataSourcePreviewSessionInput, DataSourceRepository,
    UpsertDataSourceCatalogCacheInput, UpsertDataSourceSecretInput, UpsertPluginInstallationInput,
};
use domain::{
    DataSourceCatalogRefreshStatus, DataSourceInstanceStatus, PluginArtifactStatus,
    PluginAvailabilityStatus, PluginDesiredState, PluginRuntimeStatus, PluginVerificationStatus,
};
use serde_json::json;
use sqlx::PgPool;
use storage_postgres::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

fn base_database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase".into())
}

async fn isolated_database_url() -> String {
    let admin_pool = PgPool::connect(&base_database_url()).await.unwrap();
    let schema = format!("test_{}", Uuid::now_v7().to_string().replace('-', ""));
    sqlx::query(&format!("create schema if not exists {schema}"))
        .execute(&admin_pool)
        .await
        .unwrap();

    format!("{}?options=-csearch_path%3D{schema}", base_database_url())
}

async fn seed_store() -> (
    PgControlPlaneStore,
    domain::WorkspaceRecord,
    domain::UserRecord,
    Uuid,
) {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);

    let tenant = store.upsert_root_tenant().await.unwrap();
    let workspace = store
        .upsert_workspace(tenant.id, "1flowbase")
        .await
        .unwrap();
    store
        .upsert_permission_catalog(&access_control::permission_catalog())
        .await
        .unwrap();
    store.upsert_builtin_roles(workspace.id).await.unwrap();
    store
        .upsert_authenticator(&domain::AuthenticatorRecord {
            name: "password-local".into(),
            auth_type: "password-local".into(),
            title: "Password".into(),
            enabled: true,
            is_builtin: true,
            options: serde_json::json!({}),
        })
        .await
        .unwrap();
    let actor = store
        .upsert_root_user(
            workspace.id,
            "root",
            "root@example.com",
            "$argon2id$v=19$m=19456,t=2,p=1$test$test",
            "Root",
            "Root",
        )
        .await
        .unwrap();

    let installation_id = Uuid::now_v7();
    control_plane::ports::PluginRepository::upsert_installation(
        &store,
        &UpsertPluginInstallationInput {
            installation_id,
            provider_code: "acme_hubspot_source".into(),
            plugin_id: "acme_hubspot_source@0.1.0".into(),
            plugin_version: "0.1.0".into(),
            contract_version: "1flowbase.data_source/v1".into(),
            protocol: "stdio_json".into(),
            display_name: "Acme HubSpot Source".into(),
            source_kind: "uploaded".into(),
            trust_level: "unverified".into(),
            verification_status: PluginVerificationStatus::Valid,
            desired_state: PluginDesiredState::ActiveRequested,
            artifact_status: PluginArtifactStatus::Ready,
            runtime_status: PluginRuntimeStatus::Active,
            availability_status: PluginAvailabilityStatus::Available,
            package_path: None,
            installed_path: "/tmp/plugin-installed/acme_hubspot_source/0.1.0".into(),
            checksum: Some("abc123".into()),
            manifest_fingerprint: None,
            signature_status: Some("unsigned".into()),
            signature_algorithm: None,
            signing_key_id: None,
            last_load_error: None,
            metadata_json: json!({}),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap();

    (store, workspace, actor, installation_id)
}

#[tokio::test]
async fn creates_instance_secret_and_catalog_cache_rows() {
    let (store, workspace, actor, installation_id) = seed_store().await;
    let instance_id = Uuid::now_v7();

    let created = <PgControlPlaneStore as DataSourceRepository>::create_instance(
        &store,
        &CreateDataSourceInstanceInput {
            instance_id,
            workspace_id: workspace.id,
            installation_id,
            source_code: "acme_hubspot_source".into(),
            display_name: "HubSpot".into(),
            status: domain::DataSourceInstanceStatus::Draft,
            config_json: json!({ "client_id": "abc" }),
            metadata_json: json!({}),
            created_by: actor.id,
        },
    )
    .await
    .unwrap();

    assert_eq!(created.source_code, "acme_hubspot_source");

    let secret = <PgControlPlaneStore as DataSourceRepository>::upsert_secret(
        &store,
        &UpsertDataSourceSecretInput {
            data_source_instance_id: created.id,
            secret_json: json!({ "client_secret": "secret" }),
            secret_version: 1,
        },
    )
    .await
    .unwrap();
    assert_eq!(secret.data_source_instance_id, created.id);

    let cache = <PgControlPlaneStore as DataSourceRepository>::upsert_catalog_cache(
        &store,
        &UpsertDataSourceCatalogCacheInput {
            data_source_instance_id: created.id,
            refresh_status: DataSourceCatalogRefreshStatus::Ready,
            catalog_json: json!([
                {
                    "resource_key": "contacts",
                    "display_name": "Contacts",
                    "resource_kind": "object",
                    "metadata": {}
                }
            ]),
            last_error_message: None,
            refreshed_at: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(cache.refresh_status, DataSourceCatalogRefreshStatus::Ready);

    let loaded_secret =
        <PgControlPlaneStore as DataSourceRepository>::get_secret_json(&store, created.id)
            .await
            .unwrap()
            .unwrap();
    assert_eq!(loaded_secret, json!({ "client_secret": "secret" }));
}

#[tokio::test]
async fn creates_preview_session_rows() {
    let (store, workspace, actor, installation_id) = seed_store().await;
    let instance_id = Uuid::now_v7();
    let created = <PgControlPlaneStore as DataSourceRepository>::create_instance(
        &store,
        &CreateDataSourceInstanceInput {
            instance_id,
            workspace_id: workspace.id,
            installation_id,
            source_code: "acme_hubspot_source".into(),
            display_name: "HubSpot".into(),
            status: DataSourceInstanceStatus::Draft,
            config_json: json!({ "client_id": "abc" }),
            metadata_json: json!({}),
            created_by: actor.id,
        },
    )
    .await
    .unwrap();

    let preview_session = <PgControlPlaneStore as DataSourceRepository>::create_preview_session(
        &store,
        &CreateDataSourcePreviewSessionInput {
            session_id: Uuid::now_v7(),
            workspace_id: workspace.id,
            actor_user_id: actor.id,
            data_source_instance_id: Some(created.id),
            config_fingerprint: "preview:contacts".into(),
            preview_json: json!({
                "rows": [{ "id": "1" }],
                "next_cursor": null
            }),
            expires_at: time::OffsetDateTime::now_utc() + time::Duration::minutes(10),
        },
    )
    .await
    .unwrap();

    assert_eq!(preview_session.data_source_instance_id, Some(created.id));
}
