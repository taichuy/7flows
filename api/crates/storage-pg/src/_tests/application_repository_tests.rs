use control_plane::ports::{ApplicationRepository, ApplicationVisibility, CreateApplicationInput};
use sqlx::PgPool;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

fn base_database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase".into())
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

#[tokio::test]
async fn list_applications_scopes_rows_by_workspace_and_owner() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let workspace_id = seed_workspace(&store, "Applications").await;
    let actor_user_id = seed_user(&store, workspace_id, "owner").await;
    let other_user_id = seed_user(&store, workspace_id, "other").await;

    let owned = <PgControlPlaneStore as ApplicationRepository>::create_application(
        &store,
        &CreateApplicationInput {
            actor_user_id,
            workspace_id,
            application_type: domain::ApplicationType::AgentFlow,
            name: "Owned App".into(),
            description: "owned".into(),
            icon: Some("RobotOutlined".into()),
            icon_type: Some("iconfont".into()),
            icon_background: Some("#E6F7F2".into()),
        },
    )
    .await
    .unwrap();

    <PgControlPlaneStore as ApplicationRepository>::create_application(
        &store,
        &CreateApplicationInput {
            actor_user_id: other_user_id,
            workspace_id,
            application_type: domain::ApplicationType::AgentFlow,
            name: "Foreign App".into(),
            description: "foreign".into(),
            icon: None,
            icon_type: None,
            icon_background: None,
        },
    )
    .await
    .unwrap();

    let own_only = <PgControlPlaneStore as ApplicationRepository>::list_applications(
        &store,
        workspace_id,
        actor_user_id,
        ApplicationVisibility::Own,
    )
    .await
    .unwrap();
    let all_rows = <PgControlPlaneStore as ApplicationRepository>::list_applications(
        &store,
        workspace_id,
        actor_user_id,
        ApplicationVisibility::All,
    )
    .await
    .unwrap();

    assert_eq!(own_only.len(), 1);
    assert_eq!(own_only[0].id, owned.id);
    assert_eq!(all_rows.len(), 2);
}

#[tokio::test]
async fn get_application_returns_section_hooks_with_null_runtime_targets() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let workspace_id = seed_workspace(&store, "Applications Detail").await;
    let actor_user_id = seed_user(&store, workspace_id, "detail").await;
    let created = <PgControlPlaneStore as ApplicationRepository>::create_application(
        &store,
        &CreateApplicationInput {
            actor_user_id,
            workspace_id,
            application_type: domain::ApplicationType::AgentFlow,
            name: "Detail App".into(),
            description: "detail".into(),
            icon: None,
            icon_type: None,
            icon_background: None,
        },
    )
    .await
    .unwrap();

    let detail = <PgControlPlaneStore as ApplicationRepository>::get_application(
        &store,
        workspace_id,
        created.id,
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(
        detail.sections.api.invoke_routing_mode,
        "api_key_bound_application"
    );
    assert_eq!(detail.sections.api.invoke_path_template, None);
    assert_eq!(detail.sections.logs.status, "planned");
    assert_eq!(detail.sections.logs.runs_capability_status, "planned");
    assert_eq!(detail.sections.orchestration.current_draft_id, None);
}
