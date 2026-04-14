use control_plane::ports::{CreateModelDefinitionInput, ModelDefinitionRepository};
use domain::{DataModelScopeKind, SYSTEM_SCOPE_ID};
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

async fn root_tenant_id(store: &PgControlPlaneStore) -> Uuid {
    sqlx::query_scalar("select id from tenants where code = 'root-tenant'")
        .fetch_one(store.pool())
        .await
        .unwrap()
}

#[tokio::test]
async fn model_definition_repository_creates_scope_bound_metadata_without_publish_state() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let workspace_id = Uuid::now_v7();
    let tenant_id = root_tenant_id(&store).await;
    let workspace_name = format!("Core Workspace {}", workspace_id.simple());
    let code = format!("orders_{}", Uuid::now_v7().simple());
    sqlx::query(
        "insert into workspaces (id, tenant_id, name, created_by, updated_by) values ($1, $2, $3, null, null)",
    )
    .bind(workspace_id)
    .bind(tenant_id)
    .bind(&workspace_name)
    .execute(store.pool())
    .await
    .unwrap();

    let created = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            scope_id: workspace_id,
            code: code.clone(),
            title: "Orders".into(),
        },
    )
    .await
    .unwrap();

    assert_eq!(created.scope_kind, DataModelScopeKind::Workspace);
    assert_eq!(created.scope_id, workspace_id);
    assert_eq!(created.code, code);
    assert_eq!(created.title, "Orders");
    assert!(created.physical_table_name.starts_with("rtm_workspace_"));
    assert_eq!(created.fields.len(), 0);

    let system_created = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::System,
            scope_id: SYSTEM_SCOPE_ID,
            code: format!("system_{}", Uuid::now_v7().simple()),
            title: "System Orders".into(),
        },
    )
    .await
    .unwrap();

    assert_eq!(system_created.scope_kind, DataModelScopeKind::System);
    assert_eq!(system_created.scope_id, SYSTEM_SCOPE_ID);
    assert!(system_created
        .physical_table_name
        .starts_with("rtm_system_"));
}
