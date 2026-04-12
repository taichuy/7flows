use async_trait::async_trait;
use domain::{
    ActorContext, AuditLogRecord, AuthenticatorRecord, PermissionDefinition, SessionRecord,
    TeamRecord, UserRecord,
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
pub trait BootstrapRepository: Send + Sync {
    async fn upsert_authenticator(&self, authenticator: &AuthenticatorRecord) -> anyhow::Result<()>;
    async fn upsert_team(&self, team_name: &str) -> anyhow::Result<TeamRecord>;
    async fn upsert_builtin_roles(&self, team_id: Uuid) -> anyhow::Result<()>;
    async fn upsert_root_user(
        &self,
        team_id: Uuid,
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
    async fn find_user_for_password_login(&self, identifier: &str) -> anyhow::Result<Option<UserRecord>>;
    async fn find_user_by_id(&self, user_id: Uuid) -> anyhow::Result<Option<UserRecord>>;
    async fn load_actor_context(
        &self,
        user_id: Uuid,
        team_id: Uuid,
        display_role: Option<&str>,
    ) -> anyhow::Result<ActorContext>;
    async fn update_password_hash(
        &self,
        user_id: Uuid,
        password_hash: &str,
        actor_id: Uuid,
    ) -> anyhow::Result<i64>;
    async fn bump_session_version(&self, user_id: Uuid, actor_id: Uuid) -> anyhow::Result<i64>;
    async fn list_permissions(&self) -> anyhow::Result<Vec<PermissionDefinition>>;
    async fn append_audit_log(&self, event: &AuditLogRecord) -> anyhow::Result<()>;
}
