use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

use anyhow::Result;
use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use async_trait::async_trait;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::ports::{
    AuthRepository, BootstrapRepository, CreateMemberInput, MemberRepository, RoleRepository,
    SessionStore,
};
use domain::{
    ActorContext, AuditLogRecord, AuthenticatorRecord, BoundRole, PermissionDefinition,
    RoleScopeKind, RoleTemplate, SessionRecord, TeamRecord, UserRecord, UserStatus,
};

#[derive(Default, Clone)]
pub struct MemoryBootstrapRepository {
    inner: Arc<MemoryBootstrapRepositoryInner>,
}

#[derive(Default)]
struct MemoryBootstrapRepositoryInner {
    authenticator_upserts: AtomicUsize,
    root_user_creates: AtomicUsize,
    team: RwLock<Option<TeamRecord>>,
    root_user: RwLock<Option<UserRecord>>,
}

impl MemoryBootstrapRepository {
    pub fn authenticator_upserts(&self) -> usize {
        self.inner.authenticator_upserts.load(Ordering::SeqCst)
    }

    pub fn root_user_creates(&self) -> usize {
        self.inner.root_user_creates.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl BootstrapRepository for MemoryBootstrapRepository {
    async fn upsert_authenticator(&self, _authenticator: &AuthenticatorRecord) -> Result<()> {
        self.inner
            .authenticator_upserts
            .fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    async fn upsert_permission_catalog(&self, _permissions: &[PermissionDefinition]) -> Result<()> {
        Ok(())
    }

    async fn upsert_team(&self, team_name: &str) -> Result<TeamRecord> {
        if let Some(team) = self.inner.team.read().await.clone() {
            return Ok(team);
        }

        let team = TeamRecord {
            id: Uuid::now_v7(),
            name: team_name.to_string(),
            logo_url: None,
            introduction: String::new(),
        };
        *self.inner.team.write().await = Some(team.clone());
        Ok(team)
    }

    async fn upsert_builtin_roles(&self, _team_id: Uuid) -> Result<()> {
        Ok(())
    }

    async fn upsert_root_user(
        &self,
        team_id: Uuid,
        account: &str,
        email: &str,
        password_hash: &str,
        name: &str,
        nickname: &str,
    ) -> Result<UserRecord> {
        if let Some(user) = self.inner.root_user.read().await.clone() {
            return Ok(user);
        }

        self.inner.root_user_creates.fetch_add(1, Ordering::SeqCst);
        let user = UserRecord {
            id: Uuid::now_v7(),
            account: account.to_string(),
            email: email.to_string(),
            phone: None,
            password_hash: password_hash.to_string(),
            name: name.to_string(),
            nickname: nickname.to_string(),
            avatar_url: None,
            introduction: String::new(),
            default_display_role: Some("root".to_string()),
            email_login_enabled: true,
            phone_login_enabled: false,
            status: UserStatus::Active,
            session_version: 1,
            roles: vec![BoundRole {
                code: "root".to_string(),
                scope_kind: RoleScopeKind::App,
                team_id: Some(team_id),
            }],
        };
        *self.inner.root_user.write().await = Some(user.clone());
        Ok(user)
    }
}

#[derive(Debug, Clone)]
pub struct CreatedMember {
    pub role_codes: Vec<String>,
}

#[derive(Clone)]
pub struct MemoryMemberRepository {
    root_user_id: Uuid,
    created_members: Arc<RwLock<Vec<CreatedMember>>>,
    audit_events: Arc<RwLock<Vec<String>>>,
}

impl Default for MemoryMemberRepository {
    fn default() -> Self {
        Self {
            root_user_id: Uuid::now_v7(),
            created_members: Arc::new(RwLock::new(Vec::new())),
            audit_events: Arc::new(RwLock::new(Vec::new())),
        }
    }
}

impl MemoryMemberRepository {
    pub fn root_user_id(&self) -> Uuid {
        self.root_user_id
    }

    pub fn created_members(&self) -> Vec<CreatedMember> {
        self.created_members
            .try_read()
            .expect("created_members lock should be free in assertions")
            .clone()
    }

    pub fn audit_events(&self) -> Vec<String> {
        self.audit_events
            .try_read()
            .expect("audit_events lock should be free in assertions")
            .clone()
    }
}

#[async_trait]
impl MemberRepository for MemoryMemberRepository {
    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> Result<ActorContext> {
        Ok(ActorContext::root(actor_user_id, Uuid::nil(), "root"))
    }

    async fn create_member_with_default_role(
        &self,
        _input: &CreateMemberInput,
    ) -> Result<UserRecord> {
        self.created_members.write().await.push(CreatedMember {
            role_codes: vec!["manager".to_string()],
        });
        Ok(UserRecord {
            id: Uuid::now_v7(),
            account: "manager-1".to_string(),
            email: "manager-1@example.com".to_string(),
            phone: Some("13800000000".to_string()),
            password_hash: "hash".to_string(),
            name: "Manager 1".to_string(),
            nickname: "Manager 1".to_string(),
            avatar_url: None,
            introduction: String::new(),
            default_display_role: Some("manager".to_string()),
            email_login_enabled: true,
            phone_login_enabled: false,
            status: UserStatus::Active,
            session_version: 1,
            roles: vec![BoundRole {
                code: "manager".to_string(),
                scope_kind: RoleScopeKind::Team,
                team_id: Some(Uuid::nil()),
            }],
        })
    }

    async fn disable_member(&self, _actor_user_id: Uuid, _target_user_id: Uuid) -> Result<()> {
        Ok(())
    }

    async fn reset_member_password(
        &self,
        _actor_user_id: Uuid,
        _target_user_id: Uuid,
        _password_hash: &str,
    ) -> Result<()> {
        Ok(())
    }

    async fn replace_member_roles(
        &self,
        _actor_user_id: Uuid,
        _target_user_id: Uuid,
        _role_codes: &[String],
    ) -> Result<()> {
        Ok(())
    }

    async fn list_members(&self) -> Result<Vec<UserRecord>> {
        Ok(Vec::new())
    }

    async fn append_audit_log(&self, event: &AuditLogRecord) -> Result<()> {
        self.audit_events
            .write()
            .await
            .push(event.event_code.clone());
        Ok(())
    }
}

#[derive(Clone)]
pub struct MemoryRoleRepository {
    root_user_id: Uuid,
    roles: Arc<RwLock<Vec<RoleTemplate>>>,
}

impl Default for MemoryRoleRepository {
    fn default() -> Self {
        Self {
            root_user_id: Uuid::now_v7(),
            roles: Arc::new(RwLock::new(Vec::new())),
        }
    }
}

impl MemoryRoleRepository {
    pub fn root_user_id(&self) -> Uuid {
        self.root_user_id
    }
}

#[async_trait]
impl RoleRepository for MemoryRoleRepository {
    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> Result<ActorContext> {
        Ok(ActorContext::root(actor_user_id, Uuid::nil(), "root"))
    }

    async fn list_roles(&self) -> Result<Vec<RoleTemplate>> {
        Ok(self.roles.read().await.clone())
    }

    async fn create_team_role(
        &self,
        _actor_user_id: Uuid,
        code: &str,
        name: &str,
        _introduction: &str,
    ) -> Result<()> {
        self.roles.write().await.push(RoleTemplate {
            code: code.to_string(),
            name: name.to_string(),
            scope_kind: RoleScopeKind::Team,
            is_builtin: false,
            is_editable: true,
            permissions: Vec::new(),
        });
        Ok(())
    }

    async fn update_team_role(
        &self,
        _actor_user_id: Uuid,
        _role_code: &str,
        _name: &str,
        _introduction: &str,
    ) -> Result<()> {
        Ok(())
    }

    async fn delete_team_role(&self, _actor_user_id: Uuid, _role_code: &str) -> Result<()> {
        Ok(())
    }

    async fn replace_role_permissions(
        &self,
        _actor_user_id: Uuid,
        role_code: &str,
        permission_codes: &[String],
    ) -> Result<()> {
        if let Some(role) = self
            .roles
            .write()
            .await
            .iter_mut()
            .find(|role| role.code == role_code)
        {
            role.permissions = permission_codes.to_vec();
        }
        Ok(())
    }

    async fn list_role_permissions(&self, role_code: &str) -> Result<Vec<String>> {
        Ok(self
            .roles
            .read()
            .await
            .iter()
            .find(|role| role.code == role_code)
            .map(|role| role.permissions.clone())
            .unwrap_or_default())
    }

    async fn append_audit_log(&self, _event: &AuditLogRecord) -> Result<()> {
        Ok(())
    }
}

pub fn password_hash(password: &str) -> String {
    let salt = SaltString::encode_b64(b"session-security-tests")
        .expect("static salt should be valid base64");
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .expect("password hashing should succeed in tests")
        .to_string()
}

#[derive(Clone)]
pub struct MemoryAuthRepository {
    user: Arc<RwLock<UserRecord>>,
    audit_events: Arc<RwLock<Vec<String>>>,
    bump_session_version_calls: Arc<RwLock<Vec<(Uuid, Uuid)>>>,
}

impl MemoryAuthRepository {
    pub fn new(user: UserRecord) -> Self {
        Self {
            user: Arc::new(RwLock::new(user)),
            audit_events: Arc::new(RwLock::new(Vec::new())),
            bump_session_version_calls: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn user(&self) -> UserRecord {
        self.user
            .try_read()
            .expect("user lock should be free in assertions")
            .clone()
    }

    pub fn audit_events(&self) -> Vec<String> {
        self.audit_events
            .try_read()
            .expect("audit_events lock should be free in assertions")
            .clone()
    }

    pub fn bump_session_version_calls(&self) -> Vec<(Uuid, Uuid)> {
        self.bump_session_version_calls
            .try_read()
            .expect("bump_session_version_calls lock should be free in assertions")
            .clone()
    }
}

#[async_trait]
impl AuthRepository for MemoryAuthRepository {
    async fn find_authenticator(&self, _name: &str) -> Result<Option<AuthenticatorRecord>> {
        Ok(None)
    }

    async fn find_user_for_password_login(&self, _identifier: &str) -> Result<Option<UserRecord>> {
        Ok(None)
    }

    async fn find_user_by_id(&self, user_id: Uuid) -> Result<Option<UserRecord>> {
        let user = self.user.read().await.clone();
        Ok((user.id == user_id).then_some(user))
    }

    async fn load_actor_context(
        &self,
        user_id: Uuid,
        team_id: Uuid,
        display_role: Option<&str>,
    ) -> Result<ActorContext> {
        Ok(ActorContext {
            user_id,
            team_id,
            effective_display_role: display_role.unwrap_or("manager").to_string(),
            is_root: false,
            permissions: Default::default(),
        })
    }

    async fn update_password_hash(
        &self,
        user_id: Uuid,
        password_hash: &str,
        _actor_id: Uuid,
    ) -> Result<i64> {
        let mut user = self.user.write().await;
        anyhow::ensure!(user.id == user_id, "unknown user");
        user.password_hash = password_hash.to_string();
        user.session_version += 1;
        Ok(user.session_version)
    }

    async fn bump_session_version(&self, user_id: Uuid, actor_id: Uuid) -> Result<i64> {
        let mut user = self.user.write().await;
        anyhow::ensure!(user.id == user_id, "unknown user");
        user.session_version += 1;
        self.bump_session_version_calls
            .write()
            .await
            .push((user_id, actor_id));
        Ok(user.session_version)
    }

    async fn list_permissions(&self) -> Result<Vec<PermissionDefinition>> {
        Ok(Vec::new())
    }

    async fn append_audit_log(&self, event: &AuditLogRecord) -> Result<()> {
        self.audit_events
            .write()
            .await
            .push(event.event_code.clone());
        Ok(())
    }
}

#[derive(Default, Clone)]
pub struct MemorySessionStore {
    sessions: Arc<RwLock<HashMap<String, SessionRecord>>>,
    deleted_session_ids: Arc<RwLock<Vec<String>>>,
}

impl MemorySessionStore {
    pub fn deleted_session_ids(&self) -> Vec<String> {
        self.deleted_session_ids
            .try_read()
            .expect("deleted_session_ids lock should be free in assertions")
            .clone()
    }
}

#[async_trait]
impl SessionStore for MemorySessionStore {
    async fn put(&self, session: SessionRecord) -> Result<()> {
        self.sessions
            .write()
            .await
            .insert(session.session_id.clone(), session);
        Ok(())
    }

    async fn get(&self, session_id: &str) -> Result<Option<SessionRecord>> {
        Ok(self.sessions.read().await.get(session_id).cloned())
    }

    async fn delete(&self, session_id: &str) -> Result<()> {
        self.sessions.write().await.remove(session_id);
        self.deleted_session_ids
            .write()
            .await
            .push(session_id.to_string());
        Ok(())
    }

    async fn touch(&self, session_id: &str, expires_at_unix: i64) -> Result<()> {
        if let Some(existing) = self.sessions.write().await.get_mut(session_id) {
            existing.expires_at_unix = expires_at_unix;
        }
        Ok(())
    }
}
