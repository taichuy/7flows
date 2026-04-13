use control_plane::ports::{CreateModelDefinitionInput, ModelDefinitionRepository};
use domain::DataModelScopeKind;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

fn database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into())
}

async fn root_tenant_id(store: &PgControlPlaneStore) -> Uuid {
    sqlx::query_scalar("select id from tenants where code = 'root-tenant'")
        .fetch_one(store.pool())
        .await
        .unwrap()
}

#[tokio::test]
async fn model_definition_repository_creates_scope_bound_metadata_without_publish_state() {
    let pool = connect(&database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let team_id = Uuid::now_v7();
    let tenant_id = root_tenant_id(&store).await;
    let team_name = format!("Core Team {}", team_id.simple());
    let code = format!("orders_{}", Uuid::now_v7().simple());
    sqlx::query(
        "insert into teams (id, tenant_id, name, created_by, updated_by) values ($1, $2, $3, null, null)",
    )
    .bind(team_id)
    .bind(tenant_id)
    .bind(&team_name)
    .execute(store.pool())
    .await
    .unwrap();

    let created = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Team,
            scope_id: team_id,
            code: code.clone(),
            title: "Orders".into(),
        },
    )
    .await
    .unwrap();

    assert_eq!(created.scope_kind, DataModelScopeKind::Team);
    assert_eq!(created.scope_id, team_id);
    assert_eq!(created.code, code);
    assert_eq!(created.title, "Orders");
    assert!(created.physical_table_name.starts_with("rtm_team_"));
    assert_eq!(created.fields.len(), 0);
}
