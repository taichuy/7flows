use control_plane::model_definition::{ModelDefinitionService, PublishModelCommand};
use runtime_core::resource_descriptor::ResourceKind;

#[tokio::test]
async fn publish_model_returns_runtime_resource_descriptor() {
    let service = ModelDefinitionService::for_tests();
    let published = service
        .publish_model(PublishModelCommand {
            actor_user_id: uuid::Uuid::nil(),
            model_id: uuid::Uuid::nil(),
        })
        .await
        .unwrap();

    assert_eq!(published.resource.kind, ResourceKind::RuntimeModel);
    assert_eq!(published.resource.code, "models.runtime.nil");
}
