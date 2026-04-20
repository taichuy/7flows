use control_plane::ports::{
    CreatePluginAssignmentInput, NodeContributionRegistryInput, NodeContributionRepository,
    PluginRepository, ReplaceInstallationNodeContributionsInput, UpsertPluginInstallationInput,
};
use domain::{NodeContributionDependencyStatus, PluginVerificationStatus};
use serde_json::json;
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

    (store, workspace, actor)
}

async fn insert_installation(
    store: &PgControlPlaneStore,
    actor_id: Uuid,
    provider_code: &str,
    version: &str,
    enabled: bool,
) -> domain::PluginInstallationRecord {
    PluginRepository::upsert_installation(
        store,
        &UpsertPluginInstallationInput {
            installation_id: Uuid::now_v7(),
            provider_code: provider_code.into(),
            plugin_id: format!("{provider_code}@{version}"),
            plugin_version: version.into(),
            contract_version: "1flowbase.capability/v1".into(),
            protocol: "stdio_json".into(),
            display_name: format!("{provider_code} {version}"),
            source_kind: "uploaded".into(),
            trust_level: "unverified".into(),
            verification_status: PluginVerificationStatus::Valid,
            enabled,
            install_path: format!("/tmp/plugins/{provider_code}/{version}"),
            checksum: None,
            signature_status: None,
            signature_algorithm: None,
            signing_key_id: None,
            metadata_json: json!({}),
            actor_user_id: actor_id,
        },
    )
    .await
    .unwrap()
}

fn contribution_input(
    contribution_code: &str,
    version_range: &str,
) -> ReplaceInstallationNodeContributionsInput {
    ReplaceInstallationNodeContributionsInput {
        installation_id: Uuid::nil(),
        provider_code: String::new(),
        plugin_id: String::new(),
        plugin_version: String::new(),
        entries: vec![NodeContributionRegistryInput {
            contribution_code: contribution_code.into(),
            node_shell: "action".into(),
            category: "ai".into(),
            title: format!("Title {contribution_code}"),
            description: format!("Description {contribution_code}"),
            icon: "spark".into(),
            schema_ui: json!({}),
            schema_version: "1flowbase.node-contribution/v1".into(),
            output_schema: json!({}),
            required_auth: vec!["provider_instance".into()],
            visibility: "public".into(),
            experimental: false,
            dependency_installation_kind: "required".into(),
            dependency_plugin_version_range: version_range.into(),
        }],
    }
}

#[tokio::test]
async fn node_contribution_repository_resolves_workspace_dependency_statuses() {
    let (store, workspace, actor) = seed_store().await;
    let ready = insert_installation(&store, actor.id, "ready_plugin", "0.2.0", true).await;
    let disabled = insert_installation(&store, actor.id, "disabled_plugin", "0.1.0", false).await;
    let mismatch = insert_installation(&store, actor.id, "mismatch_plugin", "0.1.0", true).await;
    let missing = insert_installation(&store, actor.id, "missing_plugin", "0.3.0", true).await;

    let mut ready_input = contribution_input("ready_node", ">=0.2.0");
    ready_input.installation_id = ready.id;
    ready_input.provider_code = ready.provider_code.clone();
    ready_input.plugin_id = ready.plugin_id.clone();
    ready_input.plugin_version = ready.plugin_version.clone();
    NodeContributionRepository::replace_installation_node_contributions(&store, &ready_input)
        .await
        .unwrap();

    let mut disabled_input = contribution_input("disabled_node", ">=0.1.0");
    disabled_input.installation_id = disabled.id;
    disabled_input.provider_code = disabled.provider_code.clone();
    disabled_input.plugin_id = disabled.plugin_id.clone();
    disabled_input.plugin_version = disabled.plugin_version.clone();
    NodeContributionRepository::replace_installation_node_contributions(&store, &disabled_input)
        .await
        .unwrap();

    let mut mismatch_input = contribution_input("mismatch_node", ">=0.2.0");
    mismatch_input.installation_id = mismatch.id;
    mismatch_input.provider_code = mismatch.provider_code.clone();
    mismatch_input.plugin_id = mismatch.plugin_id.clone();
    mismatch_input.plugin_version = mismatch.plugin_version.clone();
    NodeContributionRepository::replace_installation_node_contributions(&store, &mismatch_input)
        .await
        .unwrap();

    let mut missing_input = contribution_input("missing_node", ">=0.3.0");
    missing_input.installation_id = missing.id;
    missing_input.provider_code = missing.provider_code.clone();
    missing_input.plugin_id = missing.plugin_id.clone();
    missing_input.plugin_version = missing.plugin_version.clone();
    NodeContributionRepository::replace_installation_node_contributions(&store, &missing_input)
        .await
        .unwrap();

    PluginRepository::create_assignment(
        &store,
        &CreatePluginAssignmentInput {
            installation_id: ready.id,
            workspace_id: workspace.id,
            provider_code: ready.provider_code.clone(),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap();
    PluginRepository::create_assignment(
        &store,
        &CreatePluginAssignmentInput {
            installation_id: disabled.id,
            workspace_id: workspace.id,
            provider_code: disabled.provider_code.clone(),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap();
    PluginRepository::create_assignment(
        &store,
        &CreatePluginAssignmentInput {
            installation_id: mismatch.id,
            workspace_id: workspace.id,
            provider_code: mismatch.provider_code.clone(),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap();

    let entries = NodeContributionRepository::list_node_contributions(&store, workspace.id)
        .await
        .unwrap();
    let statuses = entries
        .into_iter()
        .map(|entry| (entry.contribution_code, entry.dependency_status))
        .collect::<std::collections::BTreeMap<_, _>>();

    assert_eq!(statuses.len(), 4);
    assert_eq!(
        statuses.get("disabled_node"),
        Some(&NodeContributionDependencyStatus::DisabledPlugin)
    );
    assert_eq!(
        statuses.get("missing_node"),
        Some(&NodeContributionDependencyStatus::MissingPlugin)
    );
    assert_eq!(
        statuses.get("mismatch_node"),
        Some(&NodeContributionDependencyStatus::VersionMismatch)
    );
    assert_eq!(
        statuses.get("ready_node"),
        Some(&NodeContributionDependencyStatus::Ready)
    );
}
