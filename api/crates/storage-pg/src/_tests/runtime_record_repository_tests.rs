use control_plane::ports::{
    AddModelFieldInput, CreateModelDefinitionInput, ModelDefinitionRepository,
};
use domain::{DataModelScopeKind, ModelFieldKind};
use runtime_core::runtime_record_repository::{
    RuntimeFilterInput, RuntimeRecordRepository, RuntimeSortInput,
};
use serde_json::json;
use storage_pg::{connect, run_migrations, PgControlPlaneStore};
use uuid::Uuid;

fn database_url() -> String {
    std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows".into())
}

#[tokio::test]
async fn runtime_record_repository_supports_crud_filter_sort_and_relation_expansion() {
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

    let customer_model = ModelDefinitionRepository::create_model_definition(
        &store,
        &CreateModelDefinitionInput {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Team,
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
            scope_kind: DataModelScopeKind::Team,
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
        team_id,
        &[RuntimeFilterInput {
            field_code: "status".into(),
            operator: "eq".into(),
            value: json!("paid"),
        }],
        &[RuntimeSortInput {
            field_code: "title".into(),
            direction: "desc".into(),
        }],
        &["customer".into()],
        1,
        20,
    )
    .await
    .unwrap();
    assert_eq!(listed.total, 1);
    assert_eq!(listed.items[0]["title"], json!("A-002"));
    assert_eq!(listed.items[0]["customer"]["name"], json!("Bob"));

    let fetched = RuntimeRecordRepository::get_record(&store, &order_metadata, team_id, &first_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(fetched["title"], json!("A-001"));

    let updated = RuntimeRecordRepository::update_record(
        &store,
        &order_metadata,
        Uuid::nil(),
        team_id,
        &order_id,
        json!({ "title": "A-002X", "status": "paid", "customer": bob_id }),
    )
    .await
    .unwrap();
    assert_eq!(updated["title"], json!("A-002X"));

    let customers = RuntimeRecordRepository::list_records(
        &store,
        &customer_metadata,
        team_id,
        &[],
        &[],
        &["orders".into()],
        1,
        20,
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
        RuntimeRecordRepository::delete_record(&store, &order_metadata, team_id, &order_id)
            .await
            .unwrap();
    assert!(deleted);
}
