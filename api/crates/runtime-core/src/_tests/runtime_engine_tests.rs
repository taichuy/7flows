use runtime_core::runtime_engine::{
    RuntimeCreateInput, RuntimeDeleteInput, RuntimeEngine, RuntimeFilterInput, RuntimeGetInput,
    RuntimeListInput, RuntimeSortInput, RuntimeUpdateInput,
};
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
async fn runtime_engine_runs_full_crud_against_repository_and_scope_context() {
    let engine = RuntimeEngine::for_tests();
    let first = engine
        .create_record(RuntimeCreateInput {
            actor_user_id: Uuid::nil(),
            team_id: Uuid::nil(),
            app_id: None,
            model_code: "orders".into(),
            payload: json!({ "title": "A-001", "status": "draft" }),
        })
        .await
        .unwrap();

    let created = engine
        .create_record(RuntimeCreateInput {
            actor_user_id: Uuid::nil(),
            team_id: Uuid::nil(),
            app_id: None,
            model_code: "orders".into(),
            payload: json!({ "title": "A-002", "status": "paid" }),
        })
        .await
        .unwrap();

    let first_record_id = first["id"].as_str().unwrap().to_string();
    let record_id = created["id"].as_str().unwrap().to_string();

    let listed = engine
        .list_records(RuntimeListInput {
            actor_user_id: Uuid::nil(),
            team_id: Uuid::nil(),
            app_id: None,
            model_code: "orders".into(),
            filters: vec![RuntimeFilterInput {
                field_code: "status".into(),
                operator: "eq".into(),
                value: json!("paid"),
            }],
            sorts: vec![RuntimeSortInput {
                field_code: "title".into(),
                direction: "desc".into(),
            }],
            expand_relations: vec![],
            page: 1,
            page_size: 20,
        })
        .await
        .unwrap();
    assert_eq!(listed.items.len(), 1);
    assert_eq!(listed.items[0]["title"], json!("A-002"));

    let fetched = engine
        .get_record(RuntimeGetInput {
            actor_user_id: Uuid::nil(),
            team_id: Uuid::nil(),
            app_id: None,
            model_code: "orders".into(),
            record_id: first_record_id,
        })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(fetched["title"], json!("A-001"));

    let updated = engine
        .update_record(RuntimeUpdateInput {
            actor_user_id: Uuid::nil(),
            team_id: Uuid::nil(),
            app_id: None,
            model_code: "orders".into(),
            record_id: record_id.clone(),
            payload: json!({ "title": "A-002" }),
        })
        .await
        .unwrap();
    assert_eq!(updated["title"], json!("A-002"));

    let deleted = engine
        .delete_record(RuntimeDeleteInput {
            actor_user_id: Uuid::nil(),
            team_id: Uuid::nil(),
            app_id: None,
            model_code: "orders".into(),
            record_id,
        })
        .await
        .unwrap();
    assert_eq!(deleted["deleted"], json!(true));
}
