use async_trait::async_trait;
use domain::{
    ActorContext, AuditLogRecord, AuthenticatorRecord, DataModelScopeKind, ModelDefinitionRecord,
    ModelFieldKind, ModelFieldRecord, PermissionDefinition, RoleTemplate, ScopeContext,
    SessionRecord, TeamRecord, TenantRecord, UserRecord,
};
use uuid::Uuid;

#[async_trait]
pub trait SessionStore: Send + Sync {
    async fn put(&self, session: SessionRecord) -> anyhow::Result<()>;
    async fn get(&self, session_id: &str) -> anyhow::Result<Option<SessionRecord>>;
    async fn delete(&self, session_id: &str) -> anyhow::Result<()>;
    async fn touch(&self, session_id: &str, expires_at_unix: i64) -> anyhow::Result<()>;
}

#[async_trait]
pub trait RuntimeRegistrySync: Send + Sync {
    async fn rebuild(&self) -> anyhow::Result<()>;
}

#[async_trait]
pub trait BootstrapRepository: Send + Sync {
    async fn upsert_authenticator(&self, authenticator: &AuthenticatorRecord)
        -> anyhow::Result<()>;
    async fn upsert_permission_catalog(
        &self,
        permissions: &[PermissionDefinition],
    ) -> anyhow::Result<()>;
    async fn upsert_root_tenant(&self) -> anyhow::Result<TenantRecord>;
    async fn upsert_workspace(
        &self,
        tenant_id: Uuid,
        workspace_name: &str,
    ) -> anyhow::Result<TeamRecord>;
    async fn upsert_builtin_roles(&self, workspace_id: Uuid) -> anyhow::Result<()>;
    async fn upsert_root_user(
        &self,
        workspace_id: Uuid,
        account: &str,
        email: &str,
        password_hash: &str,
        name: &str,
        nickname: &str,
    ) -> anyhow::Result<UserRecord>;
}

#[async_trait]
pub trait AuthRepository: Send + Sync {
    async fn find_authenticator(&self, name: &str) -> anyhow::Result<Option<AuthenticatorRecord>>;
    async fn find_user_for_password_login(
        &self,
        identifier: &str,
    ) -> anyhow::Result<Option<UserRecord>>;
    async fn find_user_by_id(&self, user_id: Uuid) -> anyhow::Result<Option<UserRecord>>;
    async fn default_scope_for_user(&self, user_id: Uuid) -> anyhow::Result<ScopeContext>;
    async fn load_actor_context(
        &self,
        user_id: Uuid,
        tenant_id: Uuid,
        workspace_id: Uuid,
        display_role: Option<&str>,
    ) -> anyhow::Result<ActorContext>;
    async fn update_password_hash(
        &self,
        user_id: Uuid,
        password_hash: &str,
        actor_id: Uuid,
    ) -> anyhow::Result<i64>;
    async fn update_profile(&self, input: &UpdateProfileInput) -> anyhow::Result<UserRecord>;
    async fn bump_session_version(&self, user_id: Uuid, actor_id: Uuid) -> anyhow::Result<i64>;
    async fn list_permissions(&self) -> anyhow::Result<Vec<PermissionDefinition>>;
    async fn append_audit_log(&self, event: &AuditLogRecord) -> anyhow::Result<()>;
}

#[async_trait]
pub trait TeamRepository: Send + Sync {
    async fn get_team(&self, team_id: Uuid) -> anyhow::Result<Option<TeamRecord>>;
    async fn list_accessible_workspaces(&self, user_id: Uuid) -> anyhow::Result<Vec<TeamRecord>>;
    async fn get_accessible_workspace(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
    ) -> anyhow::Result<Option<TeamRecord>>;
    async fn update_team(
        &self,
        actor_user_id: Uuid,
        team_id: Uuid,
        name: &str,
        logo_url: Option<&str>,
        introduction: &str,
    ) -> anyhow::Result<TeamRecord>;
}

#[derive(Debug, Clone)]
pub struct CreateMemberInput {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub account: String,
    pub email: String,
    pub phone: Option<String>,
    pub password_hash: String,
    pub name: String,
    pub nickname: String,
    pub introduction: String,
    pub email_login_enabled: bool,
    pub phone_login_enabled: bool,
}

#[derive(Debug, Clone)]
pub struct UpdateProfileInput {
    pub actor_user_id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub nickname: String,
    pub email: String,
    pub phone: Option<String>,
    pub avatar_url: Option<String>,
    pub introduction: String,
}

#[derive(Debug, Clone)]
pub struct CreateModelDefinitionInput {
    pub actor_user_id: Uuid,
    pub scope_kind: DataModelScopeKind,
    pub scope_id: Uuid,
    pub code: String,
    pub title: String,
}

#[derive(Debug, Clone)]
pub struct UpdateModelDefinitionInput {
    pub actor_user_id: Uuid,
    pub model_id: Uuid,
    pub title: String,
}

#[derive(Debug, Clone)]
pub struct AddModelFieldInput {
    pub actor_user_id: Uuid,
    pub model_id: Uuid,
    pub code: String,
    pub title: String,
    pub field_kind: ModelFieldKind,
    pub is_required: bool,
    pub is_unique: bool,
    pub default_value: Option<serde_json::Value>,
    pub display_interface: Option<String>,
    pub display_options: serde_json::Value,
    pub relation_target_model_id: Option<Uuid>,
    pub relation_options: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct UpdateModelFieldInput {
    pub actor_user_id: Uuid,
    pub model_id: Uuid,
    pub field_id: Uuid,
    pub title: String,
    pub is_required: bool,
    pub is_unique: bool,
    pub default_value: Option<serde_json::Value>,
    pub display_interface: Option<String>,
    pub display_options: serde_json::Value,
    pub relation_options: serde_json::Value,
}

#[async_trait]
pub trait MemberRepository: Send + Sync {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> anyhow::Result<ActorContext>;
    async fn create_member_with_default_role(
        &self,
        input: &CreateMemberInput,
    ) -> anyhow::Result<UserRecord>;
    async fn disable_member(&self, actor_user_id: Uuid, target_user_id: Uuid)
        -> anyhow::Result<()>;
    async fn reset_member_password(
        &self,
        actor_user_id: Uuid,
        target_user_id: Uuid,
        password_hash: &str,
    ) -> anyhow::Result<()>;
    async fn replace_member_roles(
        &self,
        actor_user_id: Uuid,
        workspace_id: Uuid,
        target_user_id: Uuid,
        role_codes: &[String],
    ) -> anyhow::Result<()>;
    async fn list_members(&self, workspace_id: Uuid) -> anyhow::Result<Vec<UserRecord>>;
    async fn append_audit_log(&self, event: &AuditLogRecord) -> anyhow::Result<()>;
}

#[async_trait]
pub trait RoleRepository: Send + Sync {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> anyhow::Result<ActorContext>;
    async fn list_roles(&self, workspace_id: Uuid) -> anyhow::Result<Vec<RoleTemplate>>;
    async fn create_team_role(
        &self,
        actor_user_id: Uuid,
        workspace_id: Uuid,
        code: &str,
        name: &str,
        introduction: &str,
    ) -> anyhow::Result<()>;
    async fn update_team_role(
        &self,
        actor_user_id: Uuid,
        workspace_id: Uuid,
        role_code: &str,
        name: &str,
        introduction: &str,
    ) -> anyhow::Result<()>;
    async fn delete_team_role(
        &self,
        actor_user_id: Uuid,
        workspace_id: Uuid,
        role_code: &str,
    ) -> anyhow::Result<()>;
    async fn replace_role_permissions(
        &self,
        actor_user_id: Uuid,
        workspace_id: Uuid,
        role_code: &str,
        permission_codes: &[String],
    ) -> anyhow::Result<()>;
    async fn list_role_permissions(
        &self,
        workspace_id: Uuid,
        role_code: &str,
    ) -> anyhow::Result<Vec<String>>;
    async fn append_audit_log(&self, event: &AuditLogRecord) -> anyhow::Result<()>;
}

#[async_trait]
pub trait ModelDefinitionRepository: Send + Sync {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> anyhow::Result<ActorContext>;
    async fn list_model_definitions(
        &self,
        workspace_id: Uuid,
    ) -> anyhow::Result<Vec<ModelDefinitionRecord>>;
    async fn get_model_definition(
        &self,
        workspace_id: Uuid,
        model_id: Uuid,
    ) -> anyhow::Result<Option<ModelDefinitionRecord>>;
    async fn create_model_definition(
        &self,
        input: &CreateModelDefinitionInput,
    ) -> anyhow::Result<ModelDefinitionRecord>;
    async fn update_model_definition(
        &self,
        input: &UpdateModelDefinitionInput,
    ) -> anyhow::Result<ModelDefinitionRecord>;
    async fn add_model_field(&self, input: &AddModelFieldInput)
        -> anyhow::Result<ModelFieldRecord>;
    async fn update_model_field(
        &self,
        input: &UpdateModelFieldInput,
    ) -> anyhow::Result<ModelFieldRecord>;
    async fn delete_model_definition(
        &self,
        actor_user_id: Uuid,
        model_id: Uuid,
    ) -> anyhow::Result<()>;
    async fn delete_model_field(
        &self,
        actor_user_id: Uuid,
        model_id: Uuid,
        field_id: Uuid,
    ) -> anyhow::Result<()>;
    async fn publish_model_definition(
        &self,
        actor_user_id: Uuid,
        model_id: Uuid,
    ) -> anyhow::Result<ModelDefinitionRecord>;
    async fn append_audit_log(&self, event: &AuditLogRecord) -> anyhow::Result<()>;
}
