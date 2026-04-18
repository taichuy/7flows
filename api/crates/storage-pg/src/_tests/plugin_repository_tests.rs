use control_plane::ports::{
    CreatePluginAssignmentInput, CreatePluginTaskInput, PluginRepository,
    UpdatePluginTaskStatusInput, UpsertPluginInstallationInput,
};
use domain::{PluginTaskKind, PluginTaskStatus, PluginVerificationStatus};
use serde_json::json;
use sqlx::PgPool;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

fn base_database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into())
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
        .upsert_workspace(tenant.id, "1Flowbase")
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

#[tokio::test]
async fn plugin_repository_persists_installations_assignments_and_tasks() {
    let (store, workspace, actor) = seed_store().await;
    let installation_id = Uuid::now_v7();
    let task_id = Uuid::now_v7();

    let installation = PluginRepository::upsert_installation(
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
            metadata_json: json!({ "help_url": "https://example.com/help" }),
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap();

    assert_eq!(installation.id, installation_id);
    assert!(installation.enabled);

    let assignment = PluginRepository::create_assignment(
        &store,
        &CreatePluginAssignmentInput {
            installation_id,
            workspace_id: workspace.id,
            actor_user_id: actor.id,
        },
    )
    .await
    .unwrap();
    assert_eq!(assignment.installation_id, installation_id);

    let task = PluginRepository::create_task(
        &store,
        &CreatePluginTaskInput {
            task_id,
            installation_id: Some(installation_id),
            workspace_id: Some(workspace.id),
            provider_code: "fixture_provider".into(),
            task_kind: PluginTaskKind::Install,
            status: PluginTaskStatus::Pending,
            status_message: Some("waiting".into()),
            detail_json: json!({ "step": "download" }),
            actor_user_id: Some(actor.id),
        },
    )
    .await
    .unwrap();
    assert_eq!(task.status, PluginTaskStatus::Pending);

    let completed_task = PluginRepository::update_task_status(
        &store,
        &UpdatePluginTaskStatusInput {
            task_id,
            status: PluginTaskStatus::Success,
            status_message: Some("done".into()),
            detail_json: json!({ "step": "enabled" }),
        },
    )
    .await
    .unwrap();

    assert_eq!(completed_task.status, PluginTaskStatus::Success);
    assert!(completed_task.finished_at.is_some());

    let installations = PluginRepository::list_installations(&store).await.unwrap();
    assert_eq!(installations.len(), 1);
    let assignments = PluginRepository::list_assignments(&store, workspace.id)
        .await
        .unwrap();
    assert_eq!(assignments.len(), 1);
}
