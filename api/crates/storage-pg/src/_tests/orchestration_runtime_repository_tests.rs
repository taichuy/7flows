use control_plane::ports::{
    AppendRunEventInput, ApplicationRepository, CreateApplicationInput, CreateFlowRunInput,
    CreateNodeRunInput, FlowRepository, OrchestrationRuntimeRepository, UpsertCompiledPlanInput,
};
use domain::{ApplicationType, FlowRunMode, FlowRunStatus, NodeRunStatus};
use serde_json::json;
use sqlx::PgPool;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use time::{macros::datetime, Duration, OffsetDateTime};
use uuid::Uuid;

fn base_database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into())
}

async fn isolated_database_url() -> String {
    let admin_pool = PgPool::connect(&base_database_url()).await.unwrap();
    let schema = format!("test_{}", Uuid::now_v7().simple());
    sqlx::query(&format!("create schema if not exists {schema}"))
        .execute(&admin_pool)
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

#[derive(Debug, Clone)]
struct RuntimeSeedState {
    application_id: Uuid,
    actor_user_id: Uuid,
    flow_id: Uuid,
    draft_id: Uuid,
    draft_updated_at: OffsetDateTime,
}

async fn seed_runtime_base(store: &PgControlPlaneStore) -> RuntimeSeedState {
    let workspace_id = seed_workspace(store, "Runtime").await;
    let actor_user_id = seed_user(store, workspace_id, "runtime-owner").await;
    let application = <PgControlPlaneStore as ApplicationRepository>::create_application(
        store,
        &CreateApplicationInput {
            actor_user_id,
            workspace_id,
            application_type: ApplicationType::AgentFlow,
            name: "Runtime App".into(),
            description: "runtime".into(),
            icon: None,
            icon_type: None,
            icon_background: None,
        },
    )
    .await
    .unwrap();
    let editor_state = <PgControlPlaneStore as FlowRepository>::get_or_create_editor_state(
        store,
        workspace_id,
        application.id,
        actor_user_id,
    )
    .await
    .unwrap();

    RuntimeSeedState {
        application_id: application.id,
        actor_user_id,
        flow_id: editor_state.flow.id,
        draft_id: editor_state.draft.id,
        draft_updated_at: editor_state.draft.updated_at,
    }
}

async fn seed_compiled_plan(
    store: &PgControlPlaneStore,
    seeded: &RuntimeSeedState,
) -> domain::CompiledPlanRecord {
    <PgControlPlaneStore as OrchestrationRuntimeRepository>::upsert_compiled_plan(
        store,
        &UpsertCompiledPlanInput {
            actor_user_id: seeded.actor_user_id,
            flow_id: seeded.flow_id,
            flow_draft_id: seeded.draft_id,
            schema_version: "1flowse.flow/v1".into(),
            document_updated_at: seeded.draft_updated_at,
            plan: json!({
                "schema_version": "1flowse.flow/v1",
                "topological_order": ["node-start", "node-llm"]
            }),
        },
    )
    .await
    .unwrap()
}

async fn seed_flow_run(
    store: &PgControlPlaneStore,
    seeded: &RuntimeSeedState,
    compiled: &domain::CompiledPlanRecord,
    started_at: OffsetDateTime,
) -> domain::FlowRunRecord {
    <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_flow_run(
        store,
        &CreateFlowRunInput {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_id: seeded.flow_id,
            flow_draft_id: seeded.draft_id,
            compiled_plan_id: compiled.id,
            run_mode: FlowRunMode::DebugNodePreview,
            target_node_id: Some("node-llm".into()),
            status: FlowRunStatus::Running,
            input_payload: json!({ "node-start": { "query": "总结退款政策" } }),
            started_at,
        },
    )
    .await
    .unwrap()
}

async fn seed_node_run(
    store: &PgControlPlaneStore,
    flow_run: &domain::FlowRunRecord,
    started_at: OffsetDateTime,
) -> domain::NodeRunRecord {
    <PgControlPlaneStore as OrchestrationRuntimeRepository>::create_node_run(
        store,
        &CreateNodeRunInput {
            flow_run_id: flow_run.id,
            node_id: "node-llm".into(),
            node_type: "llm".into(),
            node_alias: "LLM".into(),
            status: NodeRunStatus::Running,
            input_payload: json!({ "user_prompt": "总结退款政策" }),
            started_at,
        },
    )
    .await
    .unwrap()
}

async fn append_event(
    store: &PgControlPlaneStore,
    flow_run: &domain::FlowRunRecord,
    node_run: Option<&domain::NodeRunRecord>,
    event_type: &str,
) -> domain::RunEventRecord {
    <PgControlPlaneStore as OrchestrationRuntimeRepository>::append_run_event(
        store,
        &AppendRunEventInput {
            flow_run_id: flow_run.id,
            node_run_id: node_run.map(|value| value.id),
            event_type: event_type.into(),
            payload: json!({ "event_type": event_type }),
        },
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn orchestration_runtime_repository_persists_compiled_plan_runs_and_events() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let started_at = datetime!(2026-04-17 09:00:00 UTC);
    let run = seed_flow_run(&store, &seeded, &compiled, started_at).await;
    let node_run = seed_node_run(&store, &run, started_at + Duration::seconds(1)).await;
    append_event(&store, &run, Some(&node_run), "node_run_completed").await;

    let detail =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_application_run_detail(
            &store,
            run.application_id,
            run.id,
        )
        .await
        .unwrap()
        .unwrap();

    assert_eq!(detail.flow_run.id, run.id);
    assert_eq!(detail.node_runs.len(), 1);
    assert_eq!(detail.events[0].event_type, "node_run_completed");
}

#[tokio::test]
async fn latest_node_run_returns_most_recent_run_for_node() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let seeded = seed_runtime_base(&store).await;
    let compiled = seed_compiled_plan(&store, &seeded).await;
    let first_started_at = datetime!(2026-04-17 09:00:00 UTC);
    let second_started_at = first_started_at + Duration::minutes(5);
    let first_run = seed_flow_run(&store, &seeded, &compiled, first_started_at).await;
    let _ = seed_node_run(&store, &first_run, first_started_at + Duration::seconds(1)).await;
    let second_run = seed_flow_run(&store, &seeded, &compiled, second_started_at).await;
    let second_node_run = seed_node_run(
        &store,
        &second_run,
        second_started_at + Duration::seconds(1),
    )
    .await;

    let node_last_run =
        <PgControlPlaneStore as OrchestrationRuntimeRepository>::get_latest_node_run(
            &store,
            seeded.application_id,
            "node-llm",
        )
        .await
        .unwrap()
        .unwrap();

    assert_eq!(node_last_run.node_run.id, second_node_run.id);
}
