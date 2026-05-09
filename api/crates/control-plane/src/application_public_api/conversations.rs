use anyhow::Result;
use async_trait::async_trait;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplicationPublicConversationRecord {
    pub id: Uuid,
    pub application_id: Uuid,
    pub api_key_id: Uuid,
    pub external_user: String,
    pub external_conversation_id: String,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BindApplicationPublicConversationInput {
    pub application_id: Uuid,
    pub api_key_id: Uuid,
    pub external_user: String,
    pub external_conversation_id: String,
}

#[async_trait]
pub trait ApplicationPublicConversationRepository: Send + Sync {
    async fn bind_application_public_conversation(
        &self,
        input: &BindApplicationPublicConversationInput,
    ) -> Result<ApplicationPublicConversationRecord>;
}
