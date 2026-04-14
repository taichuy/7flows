use control_plane::model_definition::{
    AddModelFieldCommand, CreateModelDefinitionCommand, DeleteModelDefinitionCommand,
    ModelDefinitionService,
};
use domain::{DataModelScopeKind, ModelFieldKind, SYSTEM_SCOPE_ID};
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
async fn add_field_returns_immediately_usable_metadata_without_publish_step() {
    let service = ModelDefinitionService::for_tests();
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            code: "orders".into(),
            title: "Orders".into(),
        })
        .await
        .unwrap();

    let field = service
        .add_field(AddModelFieldCommand {
            actor_user_id: Uuid::nil(),
            model_id: created.id,
            code: "status".into(),
            title: "Status".into(),
            field_kind: ModelFieldKind::Enum,
            is_required: true,
            is_unique: false,
            default_value: Some(json!("draft")),
            display_interface: Some("select".into()),
            display_options: json!({ "options": ["draft", "paid"] }),
            relation_target_model_id: None,
            relation_options: json!({}),
        })
        .await
        .unwrap();

    assert_eq!(field.physical_column_name, "status");

    let updated = service.get_model(Uuid::nil(), created.id).await.unwrap();
    assert_eq!(updated.fields.len(), 1);
}

#[tokio::test]
async fn delete_model_requires_explicit_confirmation() {
    let service = ModelDefinitionService::for_tests();
    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            code: "orders".into(),
            title: "Orders".into(),
        })
        .await
        .unwrap();

    let error = service
        .delete_model(DeleteModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            model_id: created.id,
            confirmed: false,
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("confirmation"));
}

#[tokio::test]
async fn create_system_model_uses_fixed_system_scope_id() {
    let service = ModelDefinitionService::for_tests();

    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::System,
            code: "system_orders".into(),
            title: "System Orders".into(),
        })
        .await
        .unwrap();

    assert_eq!(created.scope_kind, DataModelScopeKind::System);
    assert_eq!(created.scope_id, SYSTEM_SCOPE_ID);
}

#[tokio::test]
async fn create_workspace_model_uses_current_workspace_id() {
    let service = ModelDefinitionService::for_tests();

    let created = service
        .create_model(CreateModelDefinitionCommand {
            actor_user_id: Uuid::nil(),
            scope_kind: DataModelScopeKind::Workspace,
            code: "workspace_orders".into(),
            title: "Workspace Orders".into(),
        })
        .await
        .unwrap();

    assert_eq!(created.scope_kind, DataModelScopeKind::Workspace);
    assert_eq!(created.scope_id, Uuid::nil());
}
