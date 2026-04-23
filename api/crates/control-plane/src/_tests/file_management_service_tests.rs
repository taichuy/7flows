use uuid::Uuid;

use control_plane::_tests::support::{memory_actor_context, MemoryFileManagementRepository};
use control_plane::file_management::{
    BindFileTableStorageCommand, CreateFileStorageCommand, FileStorageService, FileTableService,
};

#[tokio::test]
async fn only_root_can_create_file_storage() {
    let repository = MemoryFileManagementRepository::new(memory_actor_context(false, &[]));
    let service = FileStorageService::new(repository);

    let error = service
        .create_storage(CreateFileStorageCommand {
            actor_user_id: Uuid::now_v7(),
            code: "local-default".into(),
            title: "Local".into(),
            driver_type: "local".into(),
            enabled: true,
            is_default: true,
            config_json: serde_json::json!({ "root_path": "api/storage" }),
            rule_json: serde_json::json!({}),
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("permission_denied"));
}

#[tokio::test]
async fn only_root_can_rebind_file_table_storage() {
    let repository = MemoryFileManagementRepository::new(memory_actor_context(false, &[]));
    let service = FileTableService::new(repository);

    let error = service
        .bind_storage(BindFileTableStorageCommand {
            actor_user_id: Uuid::now_v7(),
            file_table_id: Uuid::now_v7(),
            bound_storage_id: Uuid::now_v7(),
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("permission_denied"));
}
