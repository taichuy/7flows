use super::*;

#[derive(Debug, Clone)]
pub struct CreateFileStorageInput {
    pub storage_id: Uuid,
    pub actor_user_id: Uuid,
    pub code: String,
    pub title: String,
    pub driver_type: String,
    pub enabled: bool,
    pub is_default: bool,
    pub config_json: serde_json::Value,
    pub rule_json: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct UpdateFileStorageBindingInput {
    pub actor_user_id: Uuid,
    pub file_table_id: Uuid,
    pub bound_storage_id: Uuid,
}

#[async_trait]
pub trait FileManagementRepository: Send + Sync {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> anyhow::Result<ActorContext>;
    async fn create_file_storage(
        &self,
        input: &CreateFileStorageInput,
    ) -> anyhow::Result<domain::FileStorageRecord>;
    async fn list_file_storages(&self) -> anyhow::Result<Vec<domain::FileStorageRecord>>;
    async fn get_default_file_storage(&self) -> anyhow::Result<Option<domain::FileStorageRecord>>;
    async fn get_file_storage(
        &self,
        storage_id: Uuid,
    ) -> anyhow::Result<Option<domain::FileStorageRecord>>;
    async fn list_visible_file_tables(
        &self,
        workspace_id: Uuid,
    ) -> anyhow::Result<Vec<domain::FileTableRecord>>;
    async fn update_file_table_binding(
        &self,
        input: &UpdateFileStorageBindingInput,
    ) -> anyhow::Result<domain::FileTableRecord>;
}
