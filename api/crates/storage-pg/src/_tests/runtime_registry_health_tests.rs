use control_plane::ports::{CreateModelDefinitionInput, ModelDefinitionRepository};
use domain::DataModelScopeKind;
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

#[tokio::test]
async fn list_runtime_model_metadata_marks_model_unavailable_when_table_is_missing() {
    let pool = connect(&isolated_database_url().await).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let tenant_id: Uuid = sqlx::query_scalar("select id from tenants where code = 'root-tenant'")
        .fetch_one(store.pool())
        .await
        .unwrap();
    let workspace_id = Uuid::now_v7();
    let workspace_name = format!("Runtime Health {}", workspace_id.simple());
    let model_code = format!("orders_{}", Uuid::now_v7().simple());

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
            code: model_code.clone(),
            title: "Orders".into(),
        },
    )
    .await
    .unwrap();

    let initial_metadata = store.list_runtime_model_metadata().await.unwrap();
    assert!(initial_metadata
        .iter()
        .any(|model| model.model_id == created.id));

    let drop_statement = format!("drop table if exists \"{}\"", created.physical_table_name);
    sqlx::query(&drop_statement)
        .execute(store.pool())
        .await
        .unwrap();

    let metadata = store.list_runtime_model_metadata().await.unwrap();

    assert!(!metadata.iter().any(|model| model.model_id == created.id));
}
