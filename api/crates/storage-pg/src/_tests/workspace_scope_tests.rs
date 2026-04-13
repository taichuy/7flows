use control_plane::ports::RoleRepository;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

fn database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into())
}

#[tokio::test]
async fn role_queries_respect_requested_workspace_instead_of_first_workspace() {
    let pool = connect(&database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let tenant_id: Uuid = sqlx::query_scalar("select id from tenants where code = 'root-tenant'")
        .fetch_one(store.pool())
        .await
        .unwrap();
    let first_workspace_id = Uuid::now_v7();
    let second_workspace_id = Uuid::now_v7();
    let first_workspace_name = format!("Workspace A {}", first_workspace_id.simple());
    let second_workspace_name = format!("Workspace B {}", second_workspace_id.simple());

    sqlx::query(
        r#"
        insert into teams (id, tenant_id, name, created_by, updated_by)
        values ($1, $2, $3, null, null),
               ($4, $2, $5, null, null)
        "#,
    )
    .bind(first_workspace_id)
    .bind(tenant_id)
    .bind(&first_workspace_name)
    .bind(second_workspace_id)
    .bind(&second_workspace_name)
    .execute(store.pool())
    .await
    .unwrap();

    sqlx::query(
        r#"
        insert into roles (
            id, scope_kind, team_id, code, name, introduction, is_builtin, is_editable
        )
        values ($1, 'workspace', $2, 'reviewer', 'Reviewer', '', false, true)
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(second_workspace_id)
    .execute(store.pool())
    .await
    .unwrap();

    let roles = RoleRepository::list_roles(&store, second_workspace_id)
        .await
        .unwrap();

    assert_eq!(roles.len(), 1);
    assert_eq!(roles[0].code, "reviewer");
}
