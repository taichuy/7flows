use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;

use crate::model_metadata::ModelMetadata;

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeFilterInput {
    pub field_code: String,
    pub operator: String,
    pub value: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeSortInput {
    pub field_code: String,
    pub direction: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeListResult {
    pub items: Vec<Value>,
    pub total: i64,
}

#[async_trait]
pub trait RuntimeRecordRepository: Send + Sync {
    async fn list_records(
        &self,
        metadata: &ModelMetadata,
        scope_id: uuid::Uuid,
        filters: &[RuntimeFilterInput],
        sorts: &[RuntimeSortInput],
        expand_relations: &[String],
        page: i64,
        page_size: i64,
    ) -> Result<RuntimeListResult>;
    async fn get_record(
        &self,
        metadata: &ModelMetadata,
        scope_id: uuid::Uuid,
        record_id: &str,
    ) -> Result<Option<Value>>;
    async fn create_record(
        &self,
        metadata: &ModelMetadata,
        actor_user_id: uuid::Uuid,
        scope_id: uuid::Uuid,
        payload: Value,
    ) -> Result<Value>;
    async fn update_record(
        &self,
        metadata: &ModelMetadata,
        actor_user_id: uuid::Uuid,
        scope_id: uuid::Uuid,
        record_id: &str,
        payload: Value,
    ) -> Result<Value>;
    async fn delete_record(
        &self,
        metadata: &ModelMetadata,
        scope_id: uuid::Uuid,
        record_id: &str,
    ) -> Result<bool>;
}
