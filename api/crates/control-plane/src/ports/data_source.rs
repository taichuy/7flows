use super::*;

#[derive(Debug, Clone)]
pub struct CreateDataSourceInstanceInput {
    pub instance_id: Uuid,
    pub workspace_id: Uuid,
    pub installation_id: Uuid,
    pub source_code: String,
    pub display_name: String,
    pub status: domain::DataSourceInstanceStatus,
    pub config_json: serde_json::Value,
    pub metadata_json: serde_json::Value,
    pub created_by: Uuid,
}

#[derive(Debug, Clone)]
pub struct UpdateDataSourceInstanceStatusInput {
    pub workspace_id: Uuid,
    pub instance_id: Uuid,
    pub status: domain::DataSourceInstanceStatus,
    pub metadata_json: serde_json::Value,
    pub updated_by: Uuid,
}

#[derive(Debug, Clone)]
pub struct UpsertDataSourceSecretInput {
    pub data_source_instance_id: Uuid,
    pub secret_json: serde_json::Value,
    pub secret_version: i32,
}

#[derive(Debug, Clone)]
pub struct UpsertDataSourceCatalogCacheInput {
    pub data_source_instance_id: Uuid,
    pub refresh_status: domain::DataSourceCatalogRefreshStatus,
    pub catalog_json: serde_json::Value,
    pub last_error_message: Option<String>,
    pub refreshed_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct CreateDataSourcePreviewSessionInput {
    pub session_id: Uuid,
    pub workspace_id: Uuid,
    pub actor_user_id: Uuid,
    pub data_source_instance_id: Option<Uuid>,
    pub config_fingerprint: String,
    pub preview_json: serde_json::Value,
    pub expires_at: OffsetDateTime,
}

#[async_trait]
pub trait DataSourceRepository: Send + Sync {
    async fn create_instance(
        &self,
        input: &CreateDataSourceInstanceInput,
    ) -> anyhow::Result<domain::DataSourceInstanceRecord>;
    async fn update_instance_status(
        &self,
        input: &UpdateDataSourceInstanceStatusInput,
    ) -> anyhow::Result<domain::DataSourceInstanceRecord>;
    async fn get_instance(
        &self,
        workspace_id: Uuid,
        instance_id: Uuid,
    ) -> anyhow::Result<Option<domain::DataSourceInstanceRecord>>;
    async fn upsert_secret(
        &self,
        input: &UpsertDataSourceSecretInput,
    ) -> anyhow::Result<domain::DataSourceSecretRecord>;
    async fn get_secret_json(&self, instance_id: Uuid)
        -> anyhow::Result<Option<serde_json::Value>>;
    async fn upsert_catalog_cache(
        &self,
        input: &UpsertDataSourceCatalogCacheInput,
    ) -> anyhow::Result<domain::DataSourceCatalogCacheRecord>;
    async fn create_preview_session(
        &self,
        input: &CreateDataSourcePreviewSessionInput,
    ) -> anyhow::Result<domain::DataSourcePreviewSessionRecord>;
}
