use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplicationVisibility {
    Own,
    All,
}

#[derive(Debug, Clone)]
pub struct CreateApplicationInput {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub application_type: domain::ApplicationType,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub icon_type: Option<String>,
    pub icon_background: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UpdateApplicationInput {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub application_id: Uuid,
    pub name: String,
    pub description: String,
    pub tag_ids: Vec<Uuid>,
}

#[derive(Debug, Clone)]
pub struct DeleteApplicationInput {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub application_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct CreateApplicationTagInput {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
}

#[async_trait]
pub trait ApplicationRepository: Send + Sync {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> anyhow::Result<domain::ActorContext>;
    async fn list_applications(
        &self,
        workspace_id: Uuid,
        actor_user_id: Uuid,
        visibility: ApplicationVisibility,
    ) -> anyhow::Result<Vec<domain::ApplicationRecord>>;
    async fn create_application(
        &self,
        input: &CreateApplicationInput,
    ) -> anyhow::Result<domain::ApplicationRecord>;
    async fn update_application(
        &self,
        input: &UpdateApplicationInput,
    ) -> anyhow::Result<domain::ApplicationRecord>;
    async fn delete_application(&self, input: &DeleteApplicationInput) -> anyhow::Result<()>;
    async fn get_application(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
    ) -> anyhow::Result<Option<domain::ApplicationRecord>>;
    async fn list_application_tags(
        &self,
        workspace_id: Uuid,
        actor_user_id: Uuid,
        visibility: ApplicationVisibility,
    ) -> anyhow::Result<Vec<domain::ApplicationTagCatalogEntry>>;
    async fn create_application_tag(
        &self,
        input: &CreateApplicationTagInput,
    ) -> anyhow::Result<domain::ApplicationTagCatalogEntry>;
    async fn append_audit_log(&self, event: &domain::AuditLogRecord) -> anyhow::Result<()>;
}
