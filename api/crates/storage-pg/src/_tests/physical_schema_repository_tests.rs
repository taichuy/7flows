use control_plane::ports::{
    AddModelFieldInput, CreateModelDefinitionInput, ModelDefinitionRepository,
};
use domain::{DataModelScopeKind, ModelFieldKind};
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

fn database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into())
}

#[tokio::test]
async fn add_scalar_field_creates_real_postgres_column_and_unique_index() {
    let pool = connect(&database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let team_id = Uuid::now_v7();
    sqlx::query(
        "insert into teams (id, name, created_by, updated_by) values ($1, 'Core Team', null, null)",
    )
    .bind(team_id)
    .execute(store.pool())
    .await
    .unwrap();

    let model = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Team,
            scope_id: team_id,
            code: "orders".into(),
            title: "Orders".into(),
        },
    )
    .await
    .unwrap();

    let field = ModelDefinitionRepository::add_model_field(
        &store,
        &AddModelFieldInput {
            actor_user_id: Uuid::nil(),
            model_id: model.id,
            code: "external_no".into(),
            title: "External No".into(),
            field_kind: ModelFieldKind::String,
            is_required: true,
            is_unique: true,
            default_value: None,
            display_interface: Some("input".into()),
            display_options: serde_json::json!({}),
            relation_target_model_id: None,
            relation_options: serde_json::json!({}),
        },
    )
    .await
    .unwrap();

    let columns: Vec<String> = sqlx::query_scalar(
        r#"
        select column_name
        from information_schema.columns
        where table_name = $1
        order by ordinal_position
        "#,
    )
    .bind(&model.physical_table_name)
    .fetch_all(store.pool())
    .await
    .unwrap();

    let index_defs: Vec<String> = sqlx::query_scalar(
        r#"
        select indexdef
        from pg_indexes
        where schemaname = current_schema()
          and tablename = $1
        "#,
    )
    .bind(&model.physical_table_name)
    .fetch_all(store.pool())
    .await
    .unwrap();

    assert!(columns.contains(&field.physical_column_name));
    assert!(index_defs
        .iter()
        .any(|def| { def.contains("UNIQUE") && def.contains(&field.physical_column_name) }));
}

#[tokio::test]
async fn add_one_to_many_field_only_writes_metadata_without_creating_column() {
    let pool = connect(&database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let team_id = Uuid::now_v7();
    sqlx::query(
        "insert into teams (id, name, created_by, updated_by) values ($1, 'Core Team', null, null)",
    )
    .bind(team_id)
    .execute(store.pool())
    .await
    .unwrap();

    let parent = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Team,
            scope_id: team_id,
            code: "orders".into(),
            title: "Orders".into(),
        },
    )
    .await
    .unwrap();
    let child = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Team,
            scope_id: team_id,
            code: "order_items".into(),
            title: "Order Items".into(),
        },
    )
    .await
    .unwrap();

    let field = ModelDefinitionRepository::add_model_field(
        &store,
        &AddModelFieldInput {
            actor_user_id: Uuid::nil(),
            model_id: parent.id,
            code: "items".into(),
            title: "Items".into(),
            field_kind: ModelFieldKind::OneToMany,
            is_required: false,
            is_unique: false,
            default_value: None,
            display_interface: None,
            display_options: serde_json::json!({}),
            relation_target_model_id: Some(child.id),
            relation_options: serde_json::json!({ "mapped_by": "order_id" }),
        },
    )
    .await
    .unwrap();

    let columns: Vec<String> = sqlx::query_scalar(
        r#"
        select column_name
        from information_schema.columns
        where table_name = $1
        order by ordinal_position
        "#,
    )
    .bind(&parent.physical_table_name)
    .fetch_all(store.pool())
    .await
    .unwrap();

    assert_eq!(field.field_kind, ModelFieldKind::OneToMany);
    assert!(!columns.contains(&"items".to_string()));
}

#[tokio::test]
async fn add_many_to_many_field_creates_host_managed_join_table() {
    let pool = connect(&database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let team_id = Uuid::now_v7();
    sqlx::query(
        "insert into teams (id, name, created_by, updated_by) values ($1, 'Core Team', null, null)",
    )
    .bind(team_id)
    .execute(store.pool())
    .await
    .unwrap();

    let left = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Team,
            scope_id: team_id,
            code: "orders".into(),
            title: "Orders".into(),
        },
    )
    .await
    .unwrap();
    let right = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Team,
            scope_id: team_id,
            code: "tags".into(),
            title: "Tags".into(),
        },
    )
    .await
    .unwrap();

    ModelDefinitionRepository::add_model_field(
        &store,
        &AddModelFieldInput {
            actor_user_id: Uuid::nil(),
            model_id: left.id,
            code: "tags".into(),
            title: "Tags".into(),
            field_kind: ModelFieldKind::ManyToMany,
            is_required: false,
            is_unique: false,
            default_value: None,
            display_interface: None,
            display_options: serde_json::json!({}),
            relation_target_model_id: Some(right.id),
            relation_options: serde_json::json!({}),
        },
    )
    .await
    .unwrap();

    let tables: Vec<String> = sqlx::query_scalar(
        r#"
        select table_name
        from information_schema.tables
        where table_schema = current_schema()
        "#,
    )
    .fetch_all(store.pool())
    .await
    .unwrap();

    assert!(tables.iter().any(|name| name.starts_with("rtm_rel_")));
}
