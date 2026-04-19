use control_plane::ports::{
    CreateModelProviderInstanceInput, ModelProviderRepository,
    ReassignModelProviderInstancesInput, UpdateModelProviderInstanceInput,
    UpsertModelProviderCatalogCacheInput, UpsertModelProviderSecretInput,
    UpsertPluginInstallationInput,
};
use domain::{
    ModelProviderCatalogRefreshStatus, ModelProviderCatalogSource, ModelProviderDiscoveryMode,
    ModelProviderInstanceStatus, ModelProviderValidationStatus, PluginVerificationStatus,
};
use serde_json::{json, Value};
use sqlx::PgPool;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
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
            provider_code: "fixture_provider".into(),
            plugin_id: "fixture_provider@0.1.0".into(),
            plugin_version: "0.1.0".into(),
            contract_version: "1flowbase.provider/v1".into(),
            protocol: "openai_compatible".into(),
            display_name: "Fixture Provider".into(),
            source_kind: "downloaded_or_uploaded".into(),
            verification_status: PluginVerificationStatus::Valid,
            enabled: true,
            install_path: "/tmp/plugin-installed/fixture_provider/0.1.0".into(),
            checksum: Some("abc123".into()),
            signature_status: Some("unsigned".into()),
            metadata_json: json!({}),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap();

    (store, workspace, actor, installation_id)
}

#[tokio::test]
async fn model_provider_repository_persists_instances_catalog_cache_and_encrypted_secrets() {
    let (store, workspace, actor, installation_id) = seed_store().await;
    let instance_id = Uuid::now_v7();

    let instance = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id,
            workspace_id: workspace.id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Fixture Provider Prod".into(),
            status: ModelProviderInstanceStatus::Draft,
            config_json: json!({ "base_url": "https://api.example.com" }),
            last_validation_status: None,
            last_validation_message: None,
            created_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert_eq!(instance.status, ModelProviderInstanceStatus::Draft);

    let updated = ModelProviderRepository::update_instance(
        &store,
        &UpdateModelProviderInstanceInput {
            instance_id,
            workspace_id: workspace.id,
            display_name: "Fixture Provider Ready".into(),
            status: ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://api.example.com/v1" }),
            last_validated_at: Some(time::OffsetDateTime::now_utc()),
            last_validation_status: Some(ModelProviderValidationStatus::Succeeded),
            last_validation_message: Some("ok".into()),
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert_eq!(updated.status, ModelProviderInstanceStatus::Ready);

    let cache = ModelProviderRepository::upsert_catalog_cache(
        &store,
        &UpsertModelProviderCatalogCacheInput {
            provider_instance_id: instance_id,
            model_discovery_mode: ModelProviderDiscoveryMode::Hybrid,
            refresh_status: ModelProviderCatalogRefreshStatus::Ready,
            source: ModelProviderCatalogSource::Hybrid,
            models_json: json!([
                {
                    "model_id": "fixture_chat",
                    "display_name": "Fixture Chat"
                }
            ]),
            last_error_message: None,
            refreshed_at: Some(time::OffsetDateTime::now_utc()),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        cache.refresh_status,
        ModelProviderCatalogRefreshStatus::Ready
    );

    let secret = ModelProviderRepository::upsert_secret(
        &store,
        &UpsertModelProviderSecretInput {
            provider_instance_id: instance_id,
            plaintext_secret_json: json!({ "api_key": "super-secret" }),
            secret_version: 1,
            master_key: "provider-secret-master-key".into(),
        },
    )
    .await
    .unwrap();
    assert_eq!(secret.secret_version, 1);

    let stored_secret: Value = sqlx::query_scalar(
        "select encrypted_secret_json from model_provider_instance_secrets where provider_instance_id = $1",
    )
    .bind(instance_id)
    .fetch_one(store.pool())
    .await
    .unwrap();
    assert!(!stored_secret.to_string().contains("super-secret"));

    let decrypted =
        ModelProviderRepository::get_secret_json(&store, instance_id, "provider-secret-master-key")
            .await
            .unwrap()
            .unwrap();
    assert_eq!(decrypted["api_key"], "super-secret");

    let instances = ModelProviderRepository::list_instances(&store, workspace.id)
        .await
        .unwrap();
    assert_eq!(instances.len(), 1);
    let cache_record = ModelProviderRepository::get_catalog_cache(&store, instance_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(cache_record.models_json[0]["model_id"], "fixture_chat");
}

#[tokio::test]
async fn model_provider_repository_reassigns_all_instances_for_a_provider() {
    let (store, workspace, actor, installation_v1) = seed_store().await;
    let installation_v2 = control_plane::ports::PluginRepository::upsert_installation(
        &store,
        &UpsertPluginInstallationInput {
            installation_id: Uuid::now_v7(),
            provider_code: "fixture_provider".into(),
            plugin_id: "fixture_provider@0.2.0".into(),
            plugin_version: "0.2.0".into(),
            contract_version: "1flowbase.provider/v1".into(),
            protocol: "openai_compatible".into(),
            display_name: "Fixture Provider".into(),
            source_kind: "official_registry".into(),
            verification_status: PluginVerificationStatus::Valid,
            enabled: true,
            install_path: "/tmp/plugin-installed/fixture_provider/0.2.0".into(),
            checksum: None,
            signature_status: None,
            metadata_json: json!({}),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap()
    .id;
    let instance = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: workspace.id,
            installation_id: installation_v1,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Fixture Provider Prod".into(),
            status: ModelProviderInstanceStatus::Draft,
            config_json: json!({ "base_url": "https://api.example.com" }),
            last_validation_status: None,
            last_validation_message: None,
            created_by: actor.id,
        },
    )
    .await
    .unwrap();

    let moved = ModelProviderRepository::reassign_instances_to_installation(
        &store,
        &ReassignModelProviderInstancesInput {
            workspace_id: workspace.id,
            provider_code: "fixture_provider".into(),
            target_installation_id: installation_v2,
            target_protocol: "openai_compatible".into(),
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();

    assert_eq!(moved.len(), 1);
    assert_eq!(moved[0].id, instance.id);
    assert_eq!(moved[0].installation_id, installation_v2);
}
