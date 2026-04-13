use domain::ActorContext;
use runtime_core::runtime_engine::{
    RuntimeCreateInput, RuntimeDeleteInput, RuntimeEngine, RuntimeGetInput, RuntimeListInput,
    RuntimeUpdateInput,
};
use serde_json::json;
use uuid::Uuid;

fn scoped_actor(
    user_id: Uuid,
    team_id: Uuid,
    permissions: impl IntoIterator<Item = &'static str>,
) -> ActorContext {
    ActorContext::scoped(
        user_id,
        team_id,
        "member",
        permissions.into_iter().map(str::to_string),
    )
}

#[tokio::test]
async fn state_data_view_own_filters_list_by_created_by() {
    let team_id = Uuid::nil();
    let manager_user_id = Uuid::now_v7();
    let manager = scoped_actor(
        manager_user_id,
        team_id,
        ["state_data.create.all", "state_data.view.own"],
    );
    let admin = scoped_actor(
        Uuid::now_v7(),
        team_id,
        ["state_data.create.all", "state_data.view.all"],
    );
    let engine = RuntimeEngine::for_tests();

    engine
        .create_record(RuntimeCreateInput {
            actor: manager.clone(),
            app_id: None,
            model_code: "orders".into(),
            payload: json!({ "title": "manager-order", "status": "draft" }),
        })
        .await
        .unwrap();
    engine
        .create_record(RuntimeCreateInput {
            actor: admin,
            app_id: None,
            model_code: "orders".into(),
            payload: json!({ "title": "admin-order", "status": "draft" }),
        })
        .await
        .unwrap();

    let listed = engine
        .list_records(RuntimeListInput {
            actor: manager,
            app_id: None,
            model_code: "orders".into(),
            filters: vec![],
            sorts: vec![],
            expand_relations: vec![],
            page: 1,
            page_size: 20,
        })
        .await
        .unwrap();

    assert_eq!(listed.total, 1);
    assert_eq!(listed.items.len(), 1);
    assert_eq!(listed.items[0]["title"], json!("manager-order"));
}

#[tokio::test]
async fn state_data_edit_own_rejects_updating_another_users_record() {
    let team_id = Uuid::nil();
    let manager = scoped_actor(
        Uuid::now_v7(),
        team_id,
        ["state_data.create.all", "state_data.edit.own"],
    );
    let admin = scoped_actor(
        Uuid::now_v7(),
        team_id,
        ["state_data.create.all", "state_data.edit.all"],
    );
    let engine = RuntimeEngine::for_tests();

    let foreign_record = engine
        .create_record(RuntimeCreateInput {
            actor: admin,
            app_id: None,
            model_code: "orders".into(),
            payload: json!({ "title": "admin-order", "status": "draft" }),
        })
        .await
        .unwrap();
    let foreign_record_id = foreign_record["id"].as_str().unwrap().to_string();

    let error = engine
        .update_record(RuntimeUpdateInput {
            actor: manager,
            app_id: None,
            model_code: "orders".into(),
            record_id: foreign_record_id,
            payload: json!({ "title": "blocked-update", "status": "draft" }),
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("runtime record not found"));
}

#[tokio::test]
async fn state_data_delete_all_allows_cross_owner_delete() {
    let team_id = Uuid::nil();
    let manager = scoped_actor(
        Uuid::now_v7(),
        team_id,
        [
            "state_data.create.all",
            "state_data.delete.own",
            "state_data.view.own",
        ],
    );
    let admin = scoped_actor(
        Uuid::now_v7(),
        team_id,
        ["state_data.delete.all", "state_data.view.all"],
    );
    let engine = RuntimeEngine::for_tests();

    let record = engine
        .create_record(RuntimeCreateInput {
            actor: manager.clone(),
            app_id: None,
            model_code: "orders".into(),
            payload: json!({ "title": "manager-order", "status": "draft" }),
        })
        .await
        .unwrap();
    let record_id = record["id"].as_str().unwrap().to_string();

    let deleted = engine
        .delete_record(RuntimeDeleteInput {
            actor: admin.clone(),
            app_id: None,
            model_code: "orders".into(),
            record_id: record_id.clone(),
        })
        .await
        .unwrap();
    assert_eq!(deleted["deleted"], json!(true));

    let fetched = engine
        .get_record(RuntimeGetInput {
            actor: admin,
            app_id: None,
            model_code: "orders".into(),
            record_id,
        })
        .await
        .unwrap();
    assert!(fetched.is_none());
}
