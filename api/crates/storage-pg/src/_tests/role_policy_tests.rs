use domain::PermissionDefinition;
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

async fn bootstrapped_store() -> (PgControlPlaneStore, Uuid) {
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

    (store, workspace.id)
}

#[tokio::test]
async fn upsert_permission_catalog_grants_new_permissions_only_to_auto_grant_roles() {
    let (store, workspace_id) = bootstrapped_store().await;

    store
        .upsert_permission_catalog(&[PermissionDefinition {
            code: "workspace.audit.all".to_string(),
            resource: "workspace".to_string(),
            action: "audit".to_string(),
            scope: "all".to_string(),
            name: "workspace:audit:all".to_string(),
        }])
        .await
        .unwrap();

    let granted_roles: Vec<String> = sqlx::query_scalar(
        r#"
        select r.code
        from role_permissions rp
        join roles r on r.id = rp.role_id
        join permission_definitions pd on pd.id = rp.permission_id
        where pd.code = $1
          and ((r.scope_kind = 'workspace' and r.workspace_id = $2) or r.scope_kind = 'system')
        order by r.code asc
        "#,
    )
    .bind("workspace.audit.all")
    .bind(workspace_id)
    .fetch_all(store.pool())
    .await
    .unwrap();

    assert_eq!(granted_roles, vec!["admin"]);
}

#[tokio::test]
async fn upsert_builtin_roles_sets_admin_auto_grant_and_manager_default_member_role() {
    let (store, workspace_id) = bootstrapped_store().await;

    let role_flags: Vec<(String, bool, bool)> = sqlx::query_as(
        r#"
        select code, auto_grant_new_permissions, is_default_member_role
        from roles
        where (scope_kind = 'workspace' and workspace_id = $1) or scope_kind = 'system'
        order by scope_kind asc, code asc
        "#,
    )
    .bind(workspace_id)
    .fetch_all(store.pool())
    .await
    .unwrap();

    assert_eq!(
        role_flags,
        vec![
            ("root".to_string(), false, false),
            ("admin".to_string(), true, false),
            ("manager".to_string(), false, true),
        ]
    );
}
