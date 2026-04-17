use std::sync::{Arc, OnceLock};

use control_plane::ports::{ApplicationRepository, CreateApplicationInput, FlowRepository};
use domain::{ApplicationType, FlowChangeKind, FlowVersionTrigger};
use serde_json::json;
use sqlx::{Connection, PgConnection};
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use tokio::sync::Semaphore;
use uuid::Uuid;

fn repository_test_semaphore() -> Arc<Semaphore> {
    static SEMAPHORE: OnceLock<Arc<Semaphore>> = OnceLock::new();
    SEMAPHORE
        .get_or_init(|| Arc::new(Semaphore::new(1)))
        .clone()
}

fn base_database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into())
}

async fn isolated_database_url() -> String {
    let mut admin_connection = PgConnection::connect(&base_database_url()).await.unwrap();
    let schema = format!("test_{}", Uuid::now_v7().simple());
    sqlx::query(&format!("create schema if not exists {schema}"))
        .execute(&mut admin_connection)
        .await
        .unwrap();

    format!("{}?options=-csearch_path%3D{schema}", base_database_url())
}

async fn root_tenant_id(store: &PgControlPlaneStore) -> Uuid {
    sqlx::query_scalar("select id from tenants where code = 'root-tenant'")
        .fetch_one(store.pool())
        .await
        .unwrap()
}

async fn seed_workspace(store: &PgControlPlaneStore, name: &str) -> Uuid {
    let workspace_id = Uuid::now_v7();
    sqlx::query(
        "insert into workspaces (id, tenant_id, name, created_by, updated_by) values ($1, $2, $3, null, null)",
    )
    .bind(workspace_id)
    .bind(root_tenant_id(store).await)
    .bind(name)
    .execute(store.pool())
    .await
    .unwrap();
    workspace_id
}

async fn seed_user(store: &PgControlPlaneStore, workspace_id: Uuid, account_prefix: &str) -> Uuid {
    let user_id = Uuid::now_v7();
    let account = format!("{account_prefix}-{}", user_id.simple());
    sqlx::query(
        r#"
        insert into users (
            id, account, email, phone, password_hash, name, nickname, avatar_url, introduction,
            default_display_role, email_login_enabled, phone_login_enabled, status, session_version,
            created_by, updated_by
        ) values (
            $1, $2, $3, null, 'hash', $4, $5, null, '', 'manager', true, false, 'active', 1, null, null
        )
        "#,
    )
    .bind(user_id)
    .bind(&account)
    .bind(format!("{account}@example.com"))
    .bind(&account)
    .bind(&account)
    .execute(store.pool())
    .await
    .unwrap();

    sqlx::query(
        "insert into workspace_memberships (id, workspace_id, user_id, introduction) values ($1, $2, $3, '')",
    )
    .bind(Uuid::now_v7())
    .bind(workspace_id)
    .bind(user_id)
    .execute(store.pool())
    .await
    .unwrap();

    user_id
}

async fn seed_agent_flow_application(
    store: &PgControlPlaneStore,
    workspace_id: Uuid,
    actor_user_id: Uuid,
) -> domain::ApplicationRecord {
    <PgControlPlaneStore as ApplicationRepository>::create_application(
        store,
        &CreateApplicationInput {
            actor_user_id,
            workspace_id,
            application_type: ApplicationType::AgentFlow,
            name: "Support Agent".into(),
            description: "customer support".into(),
            icon: None,
            icon_type: None,
            icon_background: None,
        },
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn get_or_create_editor_state_bootstraps_default_draft_and_first_version() {
    let _permit = repository_test_semaphore().acquire_owned().await.unwrap();
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let workspace_id = seed_workspace(&store, "Flow Workspace").await;
    let actor_user_id = seed_user(&store, workspace_id, "flow-owner").await;
    let application = seed_agent_flow_application(&store, workspace_id, actor_user_id).await;

    let state = <PgControlPlaneStore as FlowRepository>::get_or_create_editor_state(
        &store,
        workspace_id,
        application.id,
        actor_user_id,
    )
    .await
    .unwrap();

    assert_eq!(
        state.draft.document["graph"]["nodes"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(state.versions.len(), 1);
    assert_eq!(state.versions[0].trigger, FlowVersionTrigger::Autosave);

    let detail = <PgControlPlaneStore as ApplicationRepository>::get_application(
        &store,
        workspace_id,
        application.id,
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(detail.sections.orchestration.status, "ready");
    assert_eq!(
        detail.sections.orchestration.current_subject_id,
        Some(state.flow.id)
    );
    assert_eq!(
        detail.sections.orchestration.current_draft_id,
        Some(state.draft.id)
    );
    assert_eq!(detail.sections.logs.status, "ready");
    assert_eq!(detail.sections.logs.runs_capability_status, "queryable");
}

#[tokio::test]
async fn save_draft_only_appends_history_for_logical_changes() {
    let _permit = repository_test_semaphore().acquire_owned().await.unwrap();
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let workspace_id = seed_workspace(&store, "Flow Workspace").await;
    let actor_user_id = seed_user(&store, workspace_id, "flow-owner").await;
    let application = seed_agent_flow_application(&store, workspace_id, actor_user_id).await;
    let initial = <PgControlPlaneStore as FlowRepository>::get_or_create_editor_state(
        &store,
        workspace_id,
        application.id,
        actor_user_id,
    )
    .await
    .unwrap();

    let mut layout_only = initial.draft.document.clone();
    layout_only["editor"]["viewport"] = json!({ "x": 240, "y": 32, "zoom": 0.8 });

    let layout_state = <PgControlPlaneStore as FlowRepository>::save_draft(
        &store,
        workspace_id,
        application.id,
        actor_user_id,
        layout_only,
        FlowChangeKind::Layout,
        "viewport update",
    )
    .await
    .unwrap();

    assert_eq!(layout_state.versions.len(), 1);

    let mut logical_change = layout_state.draft.document.clone();
    logical_change["graph"]["nodes"][1]["bindings"]["system_prompt"] =
        json!({ "kind": "templated_text", "value": "You are a support agent." });

    let logical_state = <PgControlPlaneStore as FlowRepository>::save_draft(
        &store,
        workspace_id,
        application.id,
        actor_user_id,
        logical_change,
        FlowChangeKind::Logical,
        "update llm prompt",
    )
    .await
    .unwrap();

    assert_eq!(logical_state.versions.len(), 2);
    assert_eq!(logical_state.versions[1].summary, "update llm prompt");
    assert_eq!(
        logical_state.versions[1].change_kind,
        FlowChangeKind::Logical
    );
}

#[tokio::test]
async fn restore_version_replaces_current_draft_and_appends_restore_history() {
    let _permit = repository_test_semaphore().acquire_owned().await.unwrap();
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let workspace_id = seed_workspace(&store, "Flow Workspace").await;
    let actor_user_id = seed_user(&store, workspace_id, "flow-owner").await;
    let application = seed_agent_flow_application(&store, workspace_id, actor_user_id).await;
    let initial = <PgControlPlaneStore as FlowRepository>::get_or_create_editor_state(
        &store,
        workspace_id,
        application.id,
        actor_user_id,
    )
    .await
    .unwrap();

    let mut logical_change = initial.draft.document.clone();
    logical_change["graph"]["nodes"][1]["bindings"]["system_prompt"] =
        json!({ "kind": "templated_text", "value": "You are a support agent." });
    let updated = <PgControlPlaneStore as FlowRepository>::save_draft(
        &store,
        workspace_id,
        application.id,
        actor_user_id,
        logical_change,
        FlowChangeKind::Logical,
        "update llm prompt",
    )
    .await
    .unwrap();

    let restored = <PgControlPlaneStore as FlowRepository>::restore_version(
        &store,
        workspace_id,
        application.id,
        actor_user_id,
        updated.versions[0].id,
    )
    .await
    .unwrap();

    assert_eq!(restored.draft.document, initial.draft.document);
    assert_eq!(restored.versions.len(), 3);
    assert_eq!(
        restored.versions.last().unwrap().trigger,
        FlowVersionTrigger::Restore
    );
}
