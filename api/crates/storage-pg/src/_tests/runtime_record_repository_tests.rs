use control_plane::ports::{
    AddModelFieldInput, CreateModelDefinitionInput, ModelDefinitionRepository,
};
use domain::{DataModelScopeKind, ModelFieldKind};
use runtime_core::runtime_record_repository::{
    RuntimeFilterInput, RuntimeListQuery, RuntimeRecordRepository, RuntimeSortInput,
};
use serde_json::json;
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

async fn insert_user(store: &PgControlPlaneStore, user_id: Uuid, account: &str) {
    let unique_account = format!("{account}-{}", user_id.simple());
    sqlx::query(
        r#"
        insert into users (
            id, account, email, phone, password_hash, name, nickname, avatar_url, introduction,
            default_display_role, email_login_enabled, phone_login_enabled, status, session_version,
            created_by, updated_by
        )
        values (
            $1, $2, $3, null, 'hash', $4, $5, null, '', 'manager', true, false, 'active', 1, null, null
        )
        "#,
    )
    .bind(user_id)
    .bind(&unique_account)
    .bind(format!("{unique_account}@example.com"))
    .bind(&unique_account)
    .bind(&unique_account)
    .execute(store.pool())
    .await
    .unwrap();
}

#[tokio::test]
async fn runtime_record_repository_supports_crud_filter_sort_and_relation_expansion() {
    let pool = connect(&database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let team_id = Uuid::now_v7();
    let tenant_id = root_tenant_id(&store).await;
    let team_name = format!("Core Team {}", team_id.simple());
    sqlx::query(
        "insert into workspaces (id, tenant_id, name, created_by, updated_by) values ($1, $2, $3, null, null)",
    )
    .bind(team_id)
    .bind(tenant_id)
    .bind(&team_name)
    .execute(store.pool())
    .await
    .unwrap();

    let customer_model = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            scope_id: team_id,
            code: "customers".into(),
            title: "Customers".into(),
        },
    )
    .await
    .unwrap();
    let order_model = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            scope_id: team_id,
            code: "orders".into(),
            title: "Orders".into(),
        },
    )
    .await
    .unwrap();

    ModelDefinitionRepository::add_model_field(
        &store,
        &AddModelFieldInput {
            actor_user_id: Uuid::nil(),
            model_id: customer_model.id,
            code: "name".into(),
            title: "Name".into(),
            field_kind: ModelFieldKind::String,
            is_required: true,
            is_unique: false,
            default_value: None,
            display_interface: Some("input".into()),
            display_options: json!({}),
            relation_target_model_id: None,
            relation_options: json!({}),
        },
    )
    .await
    .unwrap();
    ModelDefinitionRepository::add_model_field(
        &store,
        &AddModelFieldInput {
            actor_user_id: Uuid::nil(),
            model_id: order_model.id,
            code: "title".into(),
            title: "Title".into(),
            field_kind: ModelFieldKind::String,
            is_required: true,
            is_unique: false,
            default_value: None,
            display_interface: Some("input".into()),
            display_options: json!({}),
            relation_target_model_id: None,
            relation_options: json!({}),
        },
    )
    .await
    .unwrap();
    ModelDefinitionRepository::add_model_field(
        &store,
        &AddModelFieldInput {
            actor_user_id: Uuid::nil(),
            model_id: order_model.id,
            code: "status".into(),
            title: "Status".into(),
            field_kind: ModelFieldKind::Enum,
            is_required: true,
            is_unique: false,
            default_value: None,
            display_interface: Some("select".into()),
            display_options: json!({ "options": ["draft", "paid"] }),
            relation_target_model_id: None,
            relation_options: json!({}),
        },
    )
    .await
    .unwrap();
    ModelDefinitionRepository::add_model_field(
        &store,
        &AddModelFieldInput {
            actor_user_id: Uuid::nil(),
            model_id: order_model.id,
            code: "customer".into(),
            title: "Customer".into(),
            field_kind: ModelFieldKind::ManyToOne,
            is_required: true,
            is_unique: false,
            default_value: None,
            display_interface: Some("select".into()),
            display_options: json!({}),
            relation_target_model_id: Some(customer_model.id),
            relation_options: json!({}),
        },
    )
    .await
    .unwrap();
    ModelDefinitionRepository::add_model_field(
        &store,
        &AddModelFieldInput {
            actor_user_id: Uuid::nil(),
            model_id: customer_model.id,
            code: "orders".into(),
            title: "Orders".into(),
            field_kind: ModelFieldKind::OneToMany,
            is_required: false,
            is_unique: false,
            default_value: None,
            display_interface: None,
            display_options: json!({}),
            relation_target_model_id: Some(order_model.id),
            relation_options: json!({ "mapped_by": "customer" }),
        },
    )
    .await
    .unwrap();

    let mut metadata = store.list_runtime_model_metadata().await.unwrap();
    metadata.sort_by(|left, right| left.model_code.cmp(&right.model_code));
    let customer_metadata = metadata
        .iter()
        .find(|model| model.model_code == "customers" && model.scope_id == team_id)
        .unwrap()
        .clone();
    let order_metadata = metadata
        .iter()
        .find(|model| model.model_code == "orders" && model.scope_id == team_id)
        .unwrap()
        .clone();

    let alice = RuntimeRecordRepository::create_record(
        &store,
        &customer_metadata,
        Uuid::nil(),
        team_id,
        json!({ "name": "Alice" }),
    )
    .await
    .unwrap();
    let bob = RuntimeRecordRepository::create_record(
        &store,
        &customer_metadata,
        Uuid::nil(),
        team_id,
        json!({ "name": "Bob" }),
    )
    .await
    .unwrap();

    let alice_id = alice["id"].as_str().unwrap().to_string();
    let bob_id = bob["id"].as_str().unwrap().to_string();

    let first = RuntimeRecordRepository::create_record(
        &store,
        &order_metadata,
        Uuid::nil(),
        team_id,
        json!({ "title": "A-001", "status": "draft", "customer": alice_id }),
    )
    .await
    .unwrap();
    let created = RuntimeRecordRepository::create_record(
        &store,
        &order_metadata,
        Uuid::nil(),
        team_id,
        json!({ "title": "A-002", "status": "paid", "customer": bob_id.clone() }),
    )
    .await
    .unwrap();

    let first_id = first["id"].as_str().unwrap().to_string();
    let order_id = created["id"].as_str().unwrap().to_string();

    let listed = RuntimeRecordRepository::list_records(
        &store,
        &order_metadata,
        RuntimeListQuery {
            scope_id: team_id,
            owner_user_id: None,
            filters: vec![RuntimeFilterInput {
                field_code: "status".into(),
                operator: "eq".into(),
                value: json!("paid"),
            }],
            sorts: vec![RuntimeSortInput {
                field_code: "title".into(),
                direction: "desc".into(),
            }],
            expand_relations: vec!["customer".into()],
            page: 1,
            page_size: 20,
        },
    )
    .await
    .unwrap();
    assert_eq!(listed.total, 1);
    assert_eq!(listed.items[0]["title"], json!("A-002"));
    assert_eq!(listed.items[0]["customer"]["name"], json!("Bob"));

    let fetched =
        RuntimeRecordRepository::get_record(&store, &order_metadata, team_id, None, &first_id)
            .await
            .unwrap()
            .unwrap();
    assert_eq!(fetched["title"], json!("A-001"));

    let updated = RuntimeRecordRepository::update_record(
        &store,
        &order_metadata,
        Uuid::nil(),
        team_id,
        None,
        &order_id,
        json!({ "title": "A-002X", "status": "paid", "customer": bob_id }),
    )
    .await
    .unwrap();
    assert_eq!(updated["title"], json!("A-002X"));

    let customers = RuntimeRecordRepository::list_records(
        &store,
        &customer_metadata,
        RuntimeListQuery {
            scope_id: team_id,
            owner_user_id: None,
            filters: vec![],
            sorts: vec![],
            expand_relations: vec!["orders".into()],
            page: 1,
            page_size: 20,
        },
    )
    .await
    .unwrap();
    let alice_row = customers
        .items
        .iter()
        .find(|item| item["name"] == json!("Alice"))
        .unwrap();
    assert_eq!(alice_row["orders"].as_array().unwrap().len(), 1);

    let deleted =
        RuntimeRecordRepository::delete_record(&store, &order_metadata, team_id, None, &order_id)
            .await
            .unwrap();
    assert!(deleted);
}

#[tokio::test]
async fn runtime_record_repository_enforces_owner_scope() {
    let pool = connect(&database_url()).await.unwrap();
    run_migrations(&pool).await.unwrap();
    let store = PgControlPlaneStore::new(pool);
    let team_id = Uuid::now_v7();
    let owner_user_id = Uuid::now_v7();
    let other_user_id = Uuid::now_v7();
    let tenant_id = root_tenant_id(&store).await;
    let team_name = format!("Core Team {}", team_id.simple());

    sqlx::query(
        "insert into workspaces (id, tenant_id, name, created_by, updated_by) values ($1, $2, $3, null, null)",
    )
    .bind(team_id)
    .bind(tenant_id)
    .bind(&team_name)
    .execute(store.pool())
    .await
    .unwrap();
    insert_user(&store, owner_user_id, "owner-user").await;
    insert_user(&store, other_user_id, "other-user").await;

    let order_model = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            scope_id: team_id,
            code: "orders_acl".into(),
            title: "Orders ACL".into(),
        },
    )
    .await
    .unwrap();
    ModelDefinitionRepository::add_model_field(
        &store,
        &AddModelFieldInput {
            actor_user_id: Uuid::nil(),
            model_id: order_model.id,
            code: "title".into(),
            title: "Title".into(),
            field_kind: ModelFieldKind::String,
            is_required: true,
            is_unique: false,
            default_value: None,
            display_interface: Some("input".into()),
            display_options: json!({}),
            relation_target_model_id: None,
            relation_options: json!({}),
        },
    )
    .await
    .unwrap();

    let metadata = store
        .list_runtime_model_metadata()
        .await
        .unwrap()
        .into_iter()
        .find(|model| model.model_code == "orders_acl" && model.scope_id == team_id)
        .unwrap();

    let owner_record = RuntimeRecordRepository::create_record(
        &store,
        &metadata,
        owner_user_id,
        team_id,
        json!({ "title": "owner-record" }),
    )
    .await
    .unwrap();
    let other_record = RuntimeRecordRepository::create_record(
        &store,
        &metadata,
        other_user_id,
        team_id,
        json!({ "title": "other-record" }),
    )
    .await
    .unwrap();
    let owner_record_id = owner_record["id"].as_str().unwrap().to_string();
    let other_record_id = other_record["id"].as_str().unwrap().to_string();

    let own_list = RuntimeRecordRepository::list_records(
        &store,
        &metadata,
        RuntimeListQuery {
            scope_id: team_id,
            owner_user_id: Some(owner_user_id),
            filters: vec![],
            sorts: vec![],
            expand_relations: vec![],
            page: 1,
            page_size: 20,
        },
    )
    .await
    .unwrap();
    assert_eq!(own_list.total, 1);
    assert_eq!(own_list.items[0]["title"], json!("owner-record"));

    let own_get = RuntimeRecordRepository::get_record(
        &store,
        &metadata,
        team_id,
        Some(owner_user_id),
        &owner_record_id,
    )
    .await
    .unwrap();
    assert!(own_get.is_some());
    let blocked_get = RuntimeRecordRepository::get_record(
        &store,
        &metadata,
        team_id,
        Some(owner_user_id),
        &other_record_id,
    )
    .await
    .unwrap();
    assert!(blocked_get.is_none());

    let updated = RuntimeRecordRepository::update_record(
        &store,
        &metadata,
        owner_user_id,
        team_id,
        Some(owner_user_id),
        &owner_record_id,
        json!({ "title": "owner-record-updated" }),
    )
    .await
    .unwrap();
    assert_eq!(updated["title"], json!("owner-record-updated"));

    let blocked_update = RuntimeRecordRepository::update_record(
        &store,
        &metadata,
        owner_user_id,
        team_id,
        Some(owner_user_id),
        &other_record_id,
        json!({ "title": "blocked-update" }),
    )
    .await;
    assert!(blocked_update.is_err());

    let blocked_delete = RuntimeRecordRepository::delete_record(
        &store,
        &metadata,
        team_id,
        Some(owner_user_id),
        &other_record_id,
    )
    .await
    .unwrap();
    assert!(!blocked_delete);

    let all_list = RuntimeRecordRepository::list_records(
        &store,
        &metadata,
        RuntimeListQuery {
            scope_id: team_id,
            owner_user_id: None,
            filters: vec![],
            sorts: vec![],
            expand_relations: vec![],
            page: 1,
            page_size: 20,
        },
    )
    .await
    .unwrap();
    assert_eq!(all_list.total, 2);

    let all_get =
        RuntimeRecordRepository::get_record(&store, &metadata, team_id, None, &other_record_id)
            .await
            .unwrap();
    assert!(all_get.is_some());

    let all_updated = RuntimeRecordRepository::update_record(
        &store,
        &metadata,
        owner_user_id,
        team_id,
        None,
        &other_record_id,
        json!({ "title": "other-record-updated" }),
    )
    .await
    .unwrap();
    assert_eq!(all_updated["title"], json!("other-record-updated"));

    let all_deleted =
        RuntimeRecordRepository::delete_record(&store, &metadata, team_id, None, &other_record_id)
            .await
            .unwrap();
    assert!(all_deleted);
}
