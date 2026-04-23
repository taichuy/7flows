use control_plane::ports::{
    CreateModelProviderInstanceInput, ModelProviderRepository, ReassignModelProviderInstancesInput,
    UpdateModelProviderInstanceInput, UpsertModelProviderCatalogCacheInput,
    UpsertModelProviderMainInstanceInput, UpsertModelProviderRoutingInput,
    UpsertModelProviderSecretInput, UpsertPluginInstallationInput,
};
use domain::{
    ModelProviderCatalogRefreshStatus, ModelProviderCatalogSource, ModelProviderDiscoveryMode,
    ModelProviderInstanceStatus, ModelProviderRoutingMode, PluginArtifactStatus,
    PluginAvailabilityStatus, PluginDesiredState, PluginRuntimeStatus, PluginVerificationStatus,
};
use serde_json::{json, Value};
use sqlx::PgPool;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

const PRE_MAIN_INSTANCE_AGGREGATION_MIGRATIONS: &[&str] = &[
    include_str!("../../migrations/20260412183000_create_auth_team_acl_tables.sql"),
    include_str!("../../migrations/20260412230000_create_model_definition_tables.sql"),
    include_str!("../../migrations/20260413103000_align_model_definition_physical_schema.sql"),
    include_str!("../../migrations/20260413220000_add_tenant_workspace_scope.sql"),
    include_str!("../../migrations/20260413223000_add_runtime_metadata_health.sql"),
    include_str!("../../migrations/20260414203000_add_role_policy_flags.sql"),
    include_str!("../../migrations/20260415093000_create_application_tables.sql"),
    include_str!("../../migrations/20260415113000_create_flow_tables.sql"),
    include_str!("../../migrations/20260416174500_add_application_tags.sql"),
    include_str!("../../migrations/20260417173000_create_orchestration_runtime_tables.sql"),
    include_str!("../../migrations/20260417210000_add_flow_run_resume_and_callback_tasks.sql"),
    include_str!("../../migrations/20260418120000_create_provider_kernel_tables.sql"),
    include_str!("../../migrations/20260418123000_create_model_provider_instance_tables.sql"),
    include_str!("../../migrations/20260419143000_add_plugin_version_pointer.sql"),
    include_str!("../../migrations/20260419183000_add_plugin_install_trust_fields.sql"),
    include_str!("../../migrations/20260420120000_add_user_preferred_locale.sql"),
    include_str!("../../migrations/20260420203000_add_plugin_lifecycle_snapshots.sql"),
    include_str!("../../migrations/20260421113000_create_node_contribution_registry_tables.sql"),
    include_str!("../../migrations/20260421123000_create_plugin_worker_lease_tables.sql"),
    include_str!(
        "../../migrations/20260422121000_add_model_provider_validation_and_preview_sessions.sql"
    ),
    include_str!(
        "../../migrations/20260422180000_replace_validation_model_with_enabled_models.sql"
    ),
    include_str!("../../migrations/20260422193000_add_model_provider_configured_models.sql"),
    include_str!("../../migrations/20260422223000_create_model_provider_routings.sql"),
];

const MAIN_INSTANCE_AGGREGATION_MIGRATION_SQL: &str = include_str!(
    "../../migrations/20260423093000_replace_manual_primary_with_main_instance_aggregation.sql"
);

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
            source_kind: "uploaded".into(),
            trust_level: "unverified".into(),
            verification_status: PluginVerificationStatus::Valid,
            desired_state: PluginDesiredState::ActiveRequested,
            artifact_status: PluginArtifactStatus::Ready,
            runtime_status: PluginRuntimeStatus::Inactive,
            availability_status: PluginAvailabilityStatus::InstallIncomplete,
            package_path: None,
            installed_path: "/tmp/plugin-installed/fixture_provider/0.1.0".into(),
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

async fn seed_store_before_main_instance_aggregation() -> (
    PgControlPlaneStore,
    domain::WorkspaceRecord,
    domain::UserRecord,
    Uuid,
) {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    for migration_sql in PRE_MAIN_INSTANCE_AGGREGATION_MIGRATIONS {
        sqlx::raw_sql(migration_sql).execute(&pool).await.unwrap();
    }

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
            source_kind: "uploaded".into(),
            trust_level: "unverified".into(),
            verification_status: PluginVerificationStatus::Valid,
            desired_state: PluginDesiredState::ActiveRequested,
            artifact_status: PluginArtifactStatus::Ready,
            runtime_status: PluginRuntimeStatus::Inactive,
            availability_status: PluginAvailabilityStatus::InstallIncomplete,
            package_path: None,
            installed_path: "/tmp/plugin-installed/fixture_provider/0.1.0".into(),
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

async fn insert_legacy_instance(
    store: &PgControlPlaneStore,
    workspace_id: Uuid,
    installation_id: Uuid,
    actor_id: Uuid,
    display_name: &str,
    enabled_model_ids: Vec<String>,
) -> Uuid {
    let instance_id = Uuid::now_v7();
    sqlx::query(
        r#"
        insert into model_provider_instances (
            id,
            workspace_id,
            installation_id,
            provider_code,
            protocol,
            display_name,
            status,
            config_json,
            configured_models_json,
            enabled_model_ids,
            created_by,
            updated_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
        "#,
    )
    .bind(instance_id)
    .bind(workspace_id)
    .bind(installation_id)
    .bind("fixture_provider")
    .bind("openai_compatible")
    .bind(display_name)
    .bind(ModelProviderInstanceStatus::Ready.as_str())
    .bind(json!({ "base_url": format!("https://{}.example.com/v1", display_name.to_lowercase()) }))
    .bind(
        Value::Array(
            enabled_model_ids
                .iter()
                .map(|model_id| {
                    json!({
                        "model_id": model_id,
                        "enabled": true
                    })
                })
                .collect(),
        ),
    )
    .bind(enabled_model_ids)
    .bind(actor_id)
    .execute(store.pool())
    .await
    .unwrap();

    instance_id
}

#[tokio::test]
async fn model_provider_repository_persists_instances_catalog_cache_and_encrypted_secrets() {
    let (store, workspace, actor, installation_id) = seed_store().await;
    let empty_instance_id = Uuid::now_v7();
    let empty_instance = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: empty_instance_id,
            workspace_id: workspace.id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Fixture Provider Prod".into(),
            status: ModelProviderInstanceStatus::Draft,
            config_json: json!({ "base_url": "https://api.example.com" }),
            configured_models: vec![],
            enabled_model_ids: vec![],
            included_in_main: None,
            created_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert_eq!(empty_instance.status, ModelProviderInstanceStatus::Draft);
    assert_eq!(empty_instance.enabled_model_ids, Vec::<String>::new());

    let empty_updated = ModelProviderRepository::update_instance(
        &store,
        &UpdateModelProviderInstanceInput {
            instance_id: empty_instance_id,
            workspace_id: workspace.id,
            display_name: "Fixture Provider Draft".into(),
            status: ModelProviderInstanceStatus::Draft,
            config_json: json!({ "base_url": "https://api.example.com/v1" }),
            configured_models: vec![],
            enabled_model_ids: vec![],
            included_in_main: true,
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert_eq!(empty_updated.status, ModelProviderInstanceStatus::Draft);
    assert_eq!(empty_updated.enabled_model_ids, Vec::<String>::new());

    let pair_instance_id = Uuid::now_v7();
    let pair_instance = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: pair_instance_id,
            workspace_id: workspace.id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Fixture Provider Ready".into(),
            status: ModelProviderInstanceStatus::Draft,
            config_json: json!({ "base_url": "https://api.example.com" }),
            configured_models: vec![
                domain::ModelProviderConfiguredModel {
                    model_id: "qwen-max".into(),
                    enabled: true,
                    context_window_override_tokens: Some(128_000),
                },
                domain::ModelProviderConfiguredModel {
                    model_id: "qwen-plus".into(),
                    enabled: false,
                    context_window_override_tokens: None,
                },
            ],
            enabled_model_ids: vec!["qwen-max".into(), "qwen-plus".into()],
            included_in_main: None,
            created_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert_eq!(
        pair_instance.enabled_model_ids,
        vec!["qwen-max".to_string(), "qwen-plus".to_string()]
    );
    assert_eq!(
        pair_instance.configured_models,
        vec![
            domain::ModelProviderConfiguredModel {
                model_id: "qwen-max".to_string(),
                enabled: true,
                context_window_override_tokens: Some(128_000),
            },
            domain::ModelProviderConfiguredModel {
                model_id: "qwen-plus".to_string(),
                enabled: false,
                context_window_override_tokens: None,
            },
        ]
    );

    let pair_updated = ModelProviderRepository::update_instance(
        &store,
        &UpdateModelProviderInstanceInput {
            instance_id: pair_instance_id,
            workspace_id: workspace.id,
            display_name: "Fixture Provider Ready".into(),
            status: ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://api.example.com/v1" }),
            configured_models: vec![
                domain::ModelProviderConfiguredModel {
                    model_id: "qwen-max".into(),
                    enabled: true,
                    context_window_override_tokens: Some(256_000),
                },
                domain::ModelProviderConfiguredModel {
                    model_id: "qwen-plus".into(),
                    enabled: false,
                    context_window_override_tokens: None,
                },
            ],
            enabled_model_ids: vec!["qwen-max".into(), "qwen-plus".into()],
            included_in_main: true,
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert_eq!(pair_updated.status, ModelProviderInstanceStatus::Ready);
    assert_eq!(
        pair_updated.enabled_model_ids,
        vec!["qwen-max".to_string(), "qwen-plus".to_string()]
    );
    assert_eq!(
        pair_updated.configured_models,
        vec![
            domain::ModelProviderConfiguredModel {
                model_id: "qwen-max".to_string(),
                enabled: true,
                context_window_override_tokens: Some(256_000),
            },
            domain::ModelProviderConfiguredModel {
                model_id: "qwen-plus".to_string(),
                enabled: false,
                context_window_override_tokens: None,
            },
        ]
    );

    let cache = ModelProviderRepository::upsert_catalog_cache(
        &store,
        &UpsertModelProviderCatalogCacheInput {
            provider_instance_id: pair_instance_id,
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
            provider_instance_id: pair_instance_id,
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
    .bind(pair_instance_id)
    .fetch_one(store.pool())
    .await
    .unwrap();
    assert!(!stored_secret.to_string().contains("super-secret"));

    let decrypted = ModelProviderRepository::get_secret_json(
        &store,
        pair_instance_id,
        "provider-secret-master-key",
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(decrypted["api_key"], "super-secret");

    let instances = ModelProviderRepository::list_instances(&store, workspace.id)
        .await
        .unwrap();
    assert_eq!(instances.len(), 2);
    let cache_record = ModelProviderRepository::get_catalog_cache(&store, pair_instance_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(cache_record.models_json[0]["model_id"], "fixture_chat");
}

#[tokio::test]
async fn model_provider_repository_persists_main_instance_defaults_and_instance_inclusion_flags() {
    let (store, workspace, actor, installation_id) = seed_store().await;

    let default_include = ModelProviderRepository::upsert_main_instance(
        &store,
        &UpsertModelProviderMainInstanceInput {
            workspace_id: workspace.id,
            provider_code: "fixture_provider".into(),
            auto_include_new_instances: true,
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert!(default_include.auto_include_new_instances);
    assert!(
        ModelProviderRepository::get_main_instance(&store, workspace.id, "fixture_provider")
            .await
            .unwrap()
            .unwrap()
            .auto_include_new_instances
    );

    let inherits_true = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: workspace.id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Primary".into(),
            status: ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://primary.example.com/v1" }),
            configured_models: vec![],
            enabled_model_ids: vec!["gpt-4o-mini".into()],
            included_in_main: None,
            created_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert!(inherits_true.included_in_main);

    let default_exclude = ModelProviderRepository::upsert_main_instance(
        &store,
        &UpsertModelProviderMainInstanceInput {
            workspace_id: workspace.id,
            provider_code: "fixture_provider".into(),
            auto_include_new_instances: false,
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert!(!default_exclude.auto_include_new_instances);
    assert!(
        !ModelProviderRepository::get_main_instance(&store, workspace.id, "fixture_provider")
            .await
            .unwrap()
            .unwrap()
            .auto_include_new_instances
    );

    let inherits_false = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: workspace.id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Backup".into(),
            status: ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://backup.example.com/v1" }),
            configured_models: vec![],
            enabled_model_ids: vec!["gpt-4.1-mini".into()],
            included_in_main: None,
            created_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert!(!inherits_false.included_in_main);

    let updated_false = ModelProviderRepository::update_instance(
        &store,
        &UpdateModelProviderInstanceInput {
            instance_id: inherits_true.id,
            workspace_id: workspace.id,
            display_name: inherits_true.display_name.clone(),
            status: inherits_true.status,
            config_json: inherits_true.config_json.clone(),
            configured_models: inherits_true.configured_models.clone(),
            enabled_model_ids: inherits_true.enabled_model_ids.clone(),
            included_in_main: false,
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert!(!updated_false.included_in_main);

    let updated_true = ModelProviderRepository::update_instance(
        &store,
        &UpdateModelProviderInstanceInput {
            instance_id: inherits_false.id,
            workspace_id: workspace.id,
            display_name: inherits_false.display_name.clone(),
            status: inherits_false.status,
            config_json: inherits_false.config_json.clone(),
            configured_models: inherits_false.configured_models.clone(),
            enabled_model_ids: inherits_false.enabled_model_ids.clone(),
            included_in_main: true,
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert!(updated_true.included_in_main);
}

#[tokio::test]
async fn model_provider_repository_defaults_included_in_main_to_true_without_main_instance_row() {
    let (store, workspace, actor, installation_id) = seed_store().await;

    let created = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: workspace.id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Implicit Include".into(),
            status: ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://implicit-include.example.com/v1" }),
            configured_models: vec![],
            enabled_model_ids: vec!["gpt-4o-mini".into()],
            included_in_main: None,
            created_by: actor.id,
        },
    )
    .await
    .unwrap();

    assert!(created.included_in_main);
    assert!(
        ModelProviderRepository::get_main_instance(&store, workspace.id, "fixture_provider")
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn model_provider_repository_backfills_main_instance_settings_when_upgrading_legacy_schema() {
    let (store, workspace, actor, installation_id) =
        seed_store_before_main_instance_aggregation().await;
    let primary_id = insert_legacy_instance(
        &store,
        workspace.id,
        installation_id,
        actor.id,
        "Primary",
        vec!["gpt-4o-mini".into()],
    )
    .await;
    let backup_id = insert_legacy_instance(
        &store,
        workspace.id,
        installation_id,
        actor.id,
        "Backup",
        vec!["gpt-4.1-mini".into()],
    )
    .await;

    sqlx::raw_sql(MAIN_INSTANCE_AGGREGATION_MIGRATION_SQL)
        .execute(store.pool())
        .await
        .unwrap();

    let main_instance =
        ModelProviderRepository::get_main_instance(&store, workspace.id, "fixture_provider")
            .await
            .unwrap()
            .unwrap();
    assert!(main_instance.auto_include_new_instances);
    let main_instance_count: i64 = sqlx::query_scalar(
        r#"
        select count(*)::bigint
        from model_provider_main_instances
        where workspace_id = $1
          and provider_code = $2
        "#,
    )
    .bind(workspace.id)
    .bind("fixture_provider")
    .fetch_one(store.pool())
    .await
    .unwrap();
    assert_eq!(main_instance_count, 1);

    let included_flags: Vec<bool> = sqlx::query_scalar(
        r#"
        select included_in_main
        from model_provider_instances
        where workspace_id = $1
          and id = any($2)
        order by display_name asc
        "#,
    )
    .bind(workspace.id)
    .bind(vec![primary_id, backup_id])
    .fetch_all(store.pool())
    .await
    .unwrap();
    assert_eq!(included_flags, vec![true, true]);

    let instances = ModelProviderRepository::list_instances(&store, workspace.id)
        .await
        .unwrap();
    assert_eq!(instances.len(), 2);
    assert!(instances.iter().all(|instance| instance.included_in_main));
}

#[tokio::test]
async fn model_provider_repository_backfills_missing_context_window_override_tokens_when_upgrading_legacy_schema(
) {
    let (store, workspace, actor, installation_id) =
        seed_store_before_main_instance_aggregation().await;
    sqlx::raw_sql(MAIN_INSTANCE_AGGREGATION_MIGRATION_SQL)
        .execute(store.pool())
        .await
        .unwrap();
    let instance_id = insert_legacy_instance(
        &store,
        workspace.id,
        installation_id,
        actor.id,
        "Legacy",
        vec!["gpt-4o-mini".into(), "gpt-4.1-mini".into()],
    )
    .await;
    let migration_sql = std::fs::read_to_string(
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("migrations/20260423235000_add_model_provider_context_window_override.sql"),
    )
    .unwrap();

    sqlx::raw_sql(&migration_sql).execute(store.pool()).await.unwrap();

    let instance = ModelProviderRepository::get_instance(&store, workspace.id, instance_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        instance.configured_models,
        vec![
            domain::ModelProviderConfiguredModel {
                model_id: "gpt-4o-mini".to_string(),
                enabled: true,
                context_window_override_tokens: None,
            },
            domain::ModelProviderConfiguredModel {
                model_id: "gpt-4.1-mini".to_string(),
                enabled: true,
                context_window_override_tokens: None,
            },
        ]
    );
}

#[tokio::test]
async fn model_provider_repository_lists_instances_without_routing_dependency() {
    let (store, workspace, actor, installation_id) = seed_store().await;

    let primary = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: workspace.id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Primary".into(),
            status: ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://primary.example.com/v1" }),
            configured_models: vec![],
            enabled_model_ids: vec!["gpt-4o-mini".into()],
            included_in_main: Some(true),
            created_by: actor.id,
        },
    )
    .await
    .unwrap();
    let backup = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: workspace.id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Backup".into(),
            status: ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://backup.example.com/v1" }),
            configured_models: vec![],
            enabled_model_ids: vec!["gpt-4.1-mini".into()],
            included_in_main: Some(false),
            created_by: actor.id,
        },
    )
    .await
    .unwrap();

    ModelProviderRepository::upsert_routing(
        &store,
        &UpsertModelProviderRoutingInput {
            workspace_id: workspace.id,
            provider_code: "fixture_provider".into(),
            routing_mode: ModelProviderRoutingMode::ManualPrimary,
            primary_instance_id: primary.id,
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();

    let listed = ModelProviderRepository::list_instances(&store, workspace.id)
        .await
        .unwrap();
    assert_eq!(listed.len(), 2);
    assert_eq!(
        listed
            .iter()
            .find(|instance| instance.id == primary.id)
            .unwrap()
            .included_in_main,
        true
    );
    assert_eq!(
        listed
            .iter()
            .find(|instance| instance.id == backup.id)
            .unwrap()
            .included_in_main,
        false
    );

    ModelProviderRepository::upsert_routing(
        &store,
        &UpsertModelProviderRoutingInput {
            workspace_id: workspace.id,
            provider_code: "fixture_provider".into(),
            routing_mode: ModelProviderRoutingMode::ManualPrimary,
            primary_instance_id: backup.id,
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();

    let listed_after_routing_change =
        ModelProviderRepository::list_instances_by_provider_code(&store, "fixture_provider")
            .await
            .unwrap();
    assert_eq!(listed_after_routing_change.len(), 2);
    assert_eq!(
        listed_after_routing_change
            .iter()
            .find(|instance| instance.id == primary.id)
            .unwrap()
            .included_in_main,
        true
    );
    assert_eq!(
        listed_after_routing_change
            .iter()
            .find(|instance| instance.id == backup.id)
            .unwrap()
            .included_in_main,
        false
    );

    ModelProviderRepository::delete_routing(&store, workspace.id, "fixture_provider")
        .await
        .unwrap();

    let listed_without_routing = ModelProviderRepository::list_instances(&store, workspace.id)
        .await
        .unwrap();
    assert_eq!(listed_without_routing.len(), 2);
    assert_eq!(
        listed_without_routing
            .iter()
            .find(|instance| instance.id == primary.id)
            .unwrap()
            .included_in_main,
        true
    );
    assert_eq!(
        listed_without_routing
            .iter()
            .find(|instance| instance.id == backup.id)
            .unwrap()
            .included_in_main,
        false
    );
}

#[tokio::test]
async fn model_provider_repository_persists_routing_and_cleans_it_up_on_delete() {
    let (store, workspace, actor, installation_id) = seed_store().await;

    let primary = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: workspace.id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Primary".into(),
            status: ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://primary.example.com/v1" }),
            configured_models: vec![],
            enabled_model_ids: vec!["gpt-4o-mini".into()],
            included_in_main: Some(true),
            created_by: actor.id,
        },
    )
    .await
    .unwrap();

    let backup = ModelProviderRepository::create_instance(
        &store,
        &CreateModelProviderInstanceInput {
            instance_id: Uuid::now_v7(),
            workspace_id: workspace.id,
            installation_id,
            provider_code: "fixture_provider".into(),
            protocol: "openai_compatible".into(),
            display_name: "Backup".into(),
            status: ModelProviderInstanceStatus::Ready,
            config_json: json!({ "base_url": "https://backup.example.com/v1" }),
            configured_models: vec![],
            enabled_model_ids: vec!["gpt-4.1-mini".into()],
            included_in_main: Some(false),
            created_by: actor.id,
        },
    )
    .await
    .unwrap();

    let created = ModelProviderRepository::upsert_routing(
        &store,
        &UpsertModelProviderRoutingInput {
            workspace_id: workspace.id,
            provider_code: "fixture_provider".into(),
            routing_mode: ModelProviderRoutingMode::ManualPrimary,
            primary_instance_id: primary.id,
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert_eq!(created.primary_instance_id, primary.id);

    let updated = ModelProviderRepository::upsert_routing(
        &store,
        &UpsertModelProviderRoutingInput {
            workspace_id: workspace.id,
            provider_code: "fixture_provider".into(),
            routing_mode: ModelProviderRoutingMode::ManualPrimary,
            primary_instance_id: backup.id,
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();
    assert_eq!(updated.primary_instance_id, backup.id);
    assert_eq!(updated.created_at, created.created_at);
    assert_eq!(updated.created_by, created.created_by);

    assert_eq!(
        ModelProviderRepository::get_routing(&store, workspace.id, "fixture_provider")
            .await
            .unwrap()
            .unwrap()
            .primary_instance_id,
        backup.id
    );
    assert_eq!(
        ModelProviderRepository::list_routings(&store, workspace.id)
            .await
            .unwrap()
            .len(),
        1
    );

    ModelProviderRepository::delete_instance(&store, workspace.id, backup.id)
        .await
        .unwrap();
    assert!(
        ModelProviderRepository::get_routing(&store, workspace.id, "fixture_provider")
            .await
            .unwrap()
            .is_none()
    );

    ModelProviderRepository::upsert_routing(
        &store,
        &UpsertModelProviderRoutingInput {
            workspace_id: workspace.id,
            provider_code: "fixture_provider".into(),
            routing_mode: ModelProviderRoutingMode::ManualPrimary,
            primary_instance_id: primary.id,
            updated_by: actor.id,
        },
    )
    .await
    .unwrap();
    ModelProviderRepository::delete_routing(&store, workspace.id, "fixture_provider")
        .await
        .unwrap();
    assert!(
        ModelProviderRepository::get_routing(&store, workspace.id, "fixture_provider")
            .await
            .unwrap()
            .is_none()
    );
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
            trust_level: "checksum_only".into(),
            verification_status: PluginVerificationStatus::Valid,
            desired_state: PluginDesiredState::ActiveRequested,
            artifact_status: PluginArtifactStatus::Ready,
            runtime_status: PluginRuntimeStatus::Inactive,
            availability_status: PluginAvailabilityStatus::InstallIncomplete,
            package_path: None,
            installed_path: "/tmp/plugin-installed/fixture_provider/0.2.0".into(),
            checksum: None,
            manifest_fingerprint: None,
            signature_status: None,
            signature_algorithm: None,
            signing_key_id: None,
            last_load_error: None,
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
            configured_models: vec![],
            enabled_model_ids: vec![],
            included_in_main: None,
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
