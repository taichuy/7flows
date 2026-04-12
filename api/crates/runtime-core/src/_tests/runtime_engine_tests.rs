use runtime_core::runtime_engine::{InMemoryRuntimeEngine, RuntimeCreateInput, RuntimeQueryInput};
use uuid::Uuid;

#[tokio::test]
async fn runtime_engine_applies_scope_and_default_slots_before_create() {
    let engine = InMemoryRuntimeEngine::for_tests();

    let created = engine
        .create_record(RuntimeCreateInput {
            actor_user_id: Uuid::nil(),
            model_code: "orders".into(),
            payload: serde_json::json!({ "title": "A-001" }),
        })
        .await
        .unwrap();

    assert_eq!(created["owner_id"], serde_json::json!(Uuid::nil()));
}

#[tokio::test]
async fn runtime_engine_applies_scope_resolver_to_queries() {
    let engine = InMemoryRuntimeEngine::for_tests();

    let scope = engine
        .resolve_scope(RuntimeQueryInput {
            actor_user_id: Uuid::nil(),
            model_code: "orders".into(),
        })
        .await
        .unwrap();

    assert_eq!(scope.scope_code, "own");
}
