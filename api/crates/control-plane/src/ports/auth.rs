use super::*;
use std::sync::Arc;

#[async_trait]
pub trait SessionStore: Send + Sync {
    async fn put(&self, session: SessionRecord) -> anyhow::Result<()>;
    async fn get(&self, session_id: &str) -> anyhow::Result<Option<SessionRecord>>;
    async fn delete(&self, session_id: &str) -> anyhow::Result<()>;
    async fn touch(&self, session_id: &str, expires_at_unix: i64) -> anyhow::Result<()>;
}

#[async_trait]
impl<T> SessionStore for Arc<T>
where
    T: SessionStore + ?Sized,
{
    async fn put(&self, session: SessionRecord) -> anyhow::Result<()> {
        (**self).put(session).await
    }

    async fn get(&self, session_id: &str) -> anyhow::Result<Option<SessionRecord>> {
        (**self).get(session_id).await
    }

    async fn delete(&self, session_id: &str) -> anyhow::Result<()> {
        (**self).delete(session_id).await
    }

    async fn touch(&self, session_id: &str, expires_at_unix: i64) -> anyhow::Result<()> {
        (**self).touch(session_id, expires_at_unix).await
    }
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
    ) -> anyhow::Result<WorkspaceRecord>;
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
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> anyhow::Result<ActorContext>;
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

#[derive(Debug, Clone)]
pub struct CreateApiKeyInput {
    pub id: Uuid,
    pub name: String,
    pub token_hash: String,
    pub token_prefix: String,
    pub key_kind: domain::ApiKeyKind,
    pub application_id: Option<Uuid>,
    pub creator_user_id: Uuid,
    pub tenant_id: Uuid,
    pub scope_kind: DataModelScopeKind,
    pub scope_id: Uuid,
    pub enabled: bool,
    pub expires_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct UpsertApiKeyDataModelPermissionInput {
    pub api_key_id: Uuid,
    pub data_model_id: Uuid,
    pub allow_list: bool,
    pub allow_get: bool,
    pub allow_create: bool,
    pub allow_update: bool,
    pub allow_delete: bool,
}

#[async_trait]
pub trait ApiKeyRepository: Send + Sync {
    async fn create_api_key(&self, input: &CreateApiKeyInput) -> anyhow::Result<ApiKeyRecord>;
    async fn replace_api_key_data_model_permissions(
        &self,
        api_key_id: Uuid,
        permissions: &[UpsertApiKeyDataModelPermissionInput],
    ) -> anyhow::Result<Vec<ApiKeyDataModelPermissionRecord>>;
    async fn find_api_key_by_token_hash(
        &self,
        token_hash: &str,
    ) -> anyhow::Result<Option<ApiKeyRecord>>;
    async fn list_application_api_keys(
        &self,
        application_id: Uuid,
        creator_user_id: Uuid,
    ) -> anyhow::Result<Vec<ApiKeyRecord>>;
    async fn revoke_application_api_key(
        &self,
        api_key_id: Uuid,
        application_id: Uuid,
        creator_user_id: Uuid,
    ) -> anyhow::Result<()>;
    async fn list_api_key_data_model_permissions(
        &self,
        api_key_id: Uuid,
    ) -> anyhow::Result<Vec<ApiKeyDataModelPermissionRecord>>;
}

#[async_trait]
pub trait WorkspaceRepository: Send + Sync {
    async fn get_workspace(&self, workspace_id: Uuid) -> anyhow::Result<Option<WorkspaceRecord>>;
    async fn list_accessible_workspaces(
        &self,
        user_id: Uuid,
    ) -> anyhow::Result<Vec<WorkspaceRecord>>;
    async fn get_accessible_workspace(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
    ) -> anyhow::Result<Option<WorkspaceRecord>>;
    async fn update_workspace(
        &self,
        actor_user_id: Uuid,
        workspace_id: Uuid,
        name: &str,
        logo_url: Option<&str>,
        introduction: &str,
    ) -> anyhow::Result<WorkspaceRecord>;
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
    pub preferred_locale: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CreateWorkspaceRoleInput {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub code: String,
    pub name: String,
    pub introduction: String,
    pub auto_grant_new_permissions: bool,
    pub is_default_member_role: bool,
}

#[derive(Debug, Clone)]
pub struct UpdateWorkspaceRoleInput {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub role_code: String,
    pub name: String,
    pub introduction: String,
    pub auto_grant_new_permissions: Option<bool>,
    pub is_default_member_role: Option<bool>,
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
    async fn create_team_role(&self, input: &CreateWorkspaceRoleInput) -> anyhow::Result<()>;
    async fn update_team_role(&self, input: &UpdateWorkspaceRoleInput) -> anyhow::Result<()>;
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
