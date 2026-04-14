use std::{
    collections::{HashMap, HashSet},
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
    SessionStore, UpdateProfileInput, WorkspaceRepository,
};
use domain::{
    ActorContext, AuditLogRecord, AuthenticatorRecord, BoundRole, PermissionDefinition,
    RoleScopeKind, RoleTemplate, ScopeContext, SessionRecord, TenantRecord, UserRecord, UserStatus,
    WorkspaceRecord,
};

#[derive(Default, Clone)]
pub struct MemoryBootstrapRepository {
    inner: Arc<MemoryBootstrapRepositoryInner>,
}

#[derive(Default)]
struct MemoryBootstrapRepositoryInner {
    authenticator_upserts: AtomicUsize,
    root_tenant_upserts: AtomicUsize,
    workspace_upserts: AtomicUsize,
    root_user_creates: AtomicUsize,
    root_tenant: RwLock<Option<TenantRecord>>,
    workspace: RwLock<Option<WorkspaceRecord>>,
    root_user: RwLock<Option<UserRecord>>,
}

impl MemoryBootstrapRepository {
    pub fn authenticator_upserts(&self) -> usize {
        self.inner.authenticator_upserts.load(Ordering::SeqCst)
    }

    pub fn root_user_creates(&self) -> usize {
        self.inner.root_user_creates.load(Ordering::SeqCst)
    }

    pub fn root_tenant_upserts(&self) -> usize {
        self.inner.root_tenant_upserts.load(Ordering::SeqCst)
    }

    pub fn workspace_upserts(&self) -> usize {
        self.inner.workspace_upserts.load(Ordering::SeqCst)
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

    async fn upsert_root_tenant(&self) -> Result<TenantRecord> {
        self.inner
            .root_tenant_upserts
            .fetch_add(1, Ordering::SeqCst);
        if let Some(tenant) = self.inner.root_tenant.read().await.clone() {
            return Ok(tenant);
        }

        let tenant = TenantRecord {
            id: Uuid::now_v7(),
            code: "root-tenant".to_string(),
            name: "Root Tenant".to_string(),
            is_root: true,
            is_hidden: true,
        };
        *self.inner.root_tenant.write().await = Some(tenant.clone());
        Ok(tenant)
    }

    async fn upsert_workspace(
        &self,
        tenant_id: Uuid,
        workspace_name: &str,
    ) -> Result<WorkspaceRecord> {
        self.inner.workspace_upserts.fetch_add(1, Ordering::SeqCst);
        if let Some(workspace) = self.inner.workspace.read().await.clone() {
            return Ok(workspace);
        }

        let workspace = WorkspaceRecord {
            id: Uuid::now_v7(),
            tenant_id,
            name: workspace_name.to_string(),
            logo_url: None,
            introduction: String::new(),
        };
        *self.inner.workspace.write().await = Some(workspace.clone());
        Ok(workspace)
    }

    async fn upsert_builtin_roles(&self, _workspace_id: Uuid) -> Result<()> {
        Ok(())
    }

    async fn upsert_root_user(
        &self,
        _workspace_id: Uuid,
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
                scope_kind: RoleScopeKind::System,
                workspace_id: None,
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
                scope_kind: RoleScopeKind::Workspace,
                workspace_id: Some(Uuid::nil()),
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
        _workspace_id: Uuid,
        _target_user_id: Uuid,
        _role_codes: &[String],
    ) -> Result<()> {
        Ok(())
    }

    async fn list_members(&self, _workspace_id: Uuid) -> Result<Vec<UserRecord>> {
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
    audit_events: Arc<RwLock<Vec<String>>>,
    touched_workspaces: Arc<RwLock<Vec<Uuid>>>,
}

impl Default for MemoryRoleRepository {
    fn default() -> Self {
        Self {
            root_user_id: Uuid::now_v7(),
            roles: Arc::new(RwLock::new(Vec::new())),
            audit_events: Arc::new(RwLock::new(Vec::new())),
            touched_workspaces: Arc::new(RwLock::new(Vec::new())),
        }
    }
}

impl MemoryRoleRepository {
    pub fn root_user_id(&self) -> Uuid {
        self.root_user_id
    }

    pub fn audit_events(&self) -> Vec<String> {
        self.audit_events
            .try_read()
            .expect("audit_events lock should be free in assertions")
            .clone()
    }
}

#[async_trait]
impl RoleRepository for MemoryRoleRepository {
    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> Result<ActorContext> {
        Ok(ActorContext::root(actor_user_id, Uuid::nil(), "root"))
    }

    async fn list_roles(&self, _workspace_id: Uuid) -> Result<Vec<RoleTemplate>> {
        Ok(self.roles.read().await.clone())
    }

    async fn create_team_role(
        &self,
        _actor_user_id: Uuid,
        workspace_id: Uuid,
        code: &str,
        name: &str,
        _introduction: &str,
        auto_grant_new_permissions: bool,
        is_default_member_role: bool,
    ) -> Result<()> {
        self.touched_workspaces.write().await.push(workspace_id);
        let mut roles = self.roles.write().await;
        if is_default_member_role {
            for role in roles.iter_mut() {
                if matches!(role.scope_kind, RoleScopeKind::Workspace) {
                    role.is_default_member_role = false;
                }
            }
        }
        roles.push(RoleTemplate {
            code: code.to_string(),
            name: name.to_string(),
            scope_kind: RoleScopeKind::Workspace,
            is_builtin: false,
            is_editable: true,
            auto_grant_new_permissions,
            is_default_member_role,
            permissions: Vec::new(),
        });
        Ok(())
    }

    async fn update_team_role(
        &self,
        _actor_user_id: Uuid,
        workspace_id: Uuid,
        role_code: &str,
        name: &str,
        _introduction: &str,
        auto_grant_new_permissions: Option<bool>,
        is_default_member_role: Option<bool>,
    ) -> Result<()> {
        self.touched_workspaces.write().await.push(workspace_id);
        let mut roles = self.roles.write().await;
        let role_index = roles.iter().position(|role| role.code == role_code);

        if matches!(is_default_member_role, Some(false))
            && role_index
                .and_then(|index| roles.get(index))
                .map(|role| role.is_default_member_role)
                .unwrap_or(false)
        {
            anyhow::bail!(crate::errors::ControlPlaneError::InvalidInput(
                "default_member_role_required"
            ));
        }

        if matches!(is_default_member_role, Some(true)) {
            for role in roles.iter_mut() {
                if matches!(role.scope_kind, RoleScopeKind::Workspace) && role.code != role_code {
                    role.is_default_member_role = false;
                }
            }
        }

        if let Some(role) = role_index.and_then(|index| roles.get_mut(index)) {
            role.name = name.to_string();
            if let Some(value) = auto_grant_new_permissions {
                role.auto_grant_new_permissions = value;
            }
            if let Some(value) = is_default_member_role {
                role.is_default_member_role = value;
            }
        }
        Ok(())
    }

    async fn delete_team_role(
        &self,
        _actor_user_id: Uuid,
        workspace_id: Uuid,
        role_code: &str,
    ) -> Result<()> {
        self.touched_workspaces.write().await.push(workspace_id);
        self.roles
            .write()
            .await
            .retain(|role| role.code != role_code);
        Ok(())
    }

    async fn replace_role_permissions(
        &self,
        _actor_user_id: Uuid,
        workspace_id: Uuid,
        role_code: &str,
        permission_codes: &[String],
    ) -> Result<()> {
        self.touched_workspaces.write().await.push(workspace_id);
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

    async fn list_role_permissions(
        &self,
        _workspace_id: Uuid,
        role_code: &str,
    ) -> Result<Vec<String>> {
        Ok(self
            .roles
            .read()
            .await
            .iter()
            .find(|role| role.code == role_code)
            .map(|role| role.permissions.clone())
            .unwrap_or_default())
    }

    async fn append_audit_log(&self, event: &AuditLogRecord) -> Result<()> {
        self.audit_events
            .write()
            .await
            .push(event.event_code.clone());
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

#[derive(Default, Clone)]
pub struct MemoryWorkspaceRepository {
    workspaces: Arc<RwLock<HashMap<Uuid, WorkspaceRecord>>>,
    accessible_workspaces: Arc<RwLock<HashMap<Uuid, Vec<Uuid>>>>,
    root_user_ids: Arc<RwLock<HashSet<Uuid>>>,
}

impl MemoryWorkspaceRepository {
    #[allow(dead_code)]
    pub async fn upsert_workspace(&self, workspace: WorkspaceRecord) {
        self.workspaces
            .write()
            .await
            .insert(workspace.id, workspace);
    }

    pub async fn set_accessible_workspaces(&self, user_id: Uuid, workspaces: Vec<WorkspaceRecord>) {
        let workspace_ids: Vec<Uuid> = workspaces.iter().map(|workspace| workspace.id).collect();
        let mut stored_workspaces = self.workspaces.write().await;
        for workspace in workspaces {
            stored_workspaces.insert(workspace.id, workspace);
        }
        drop(stored_workspaces);

        self.accessible_workspaces
            .write()
            .await
            .insert(user_id, workspace_ids);
    }

    #[allow(dead_code)]
    pub async fn mark_root_user(&self, user_id: Uuid) {
        self.root_user_ids.write().await.insert(user_id);
    }
}

#[async_trait]
impl WorkspaceRepository for MemoryWorkspaceRepository {
    async fn get_workspace(&self, workspace_id: Uuid) -> Result<Option<WorkspaceRecord>> {
        Ok(self.workspaces.read().await.get(&workspace_id).cloned())
    }

    async fn list_accessible_workspaces(&self, user_id: Uuid) -> Result<Vec<WorkspaceRecord>> {
        let stored_workspaces = self.workspaces.read().await;
        let mut workspaces = if self.root_user_ids.read().await.contains(&user_id) {
            stored_workspaces.values().cloned().collect::<Vec<_>>()
        } else {
            self.accessible_workspaces
                .read()
                .await
                .get(&user_id)
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|workspace_id| stored_workspaces.get(&workspace_id).cloned())
                .collect::<Vec<_>>()
        };

        workspaces.sort_by(|left, right| {
            left.name
                .to_lowercase()
                .cmp(&right.name.to_lowercase())
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(workspaces)
    }

    async fn get_accessible_workspace(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
    ) -> Result<Option<WorkspaceRecord>> {
        let workspaces = self.workspaces.read().await;
        if self.root_user_ids.read().await.contains(&user_id) {
            return Ok(workspaces.get(&workspace_id).cloned());
        }

        let is_accessible = self
            .accessible_workspaces
            .read()
            .await
            .get(&user_id)
            .map(|workspace_ids| workspace_ids.contains(&workspace_id))
            .unwrap_or(false);

        Ok(is_accessible
            .then(|| workspaces.get(&workspace_id).cloned())
            .flatten())
    }

    async fn update_workspace(
        &self,
        _actor_user_id: Uuid,
        workspace_id: Uuid,
        name: &str,
        logo_url: Option<&str>,
        introduction: &str,
    ) -> Result<WorkspaceRecord> {
        let mut workspaces = self.workspaces.write().await;
        let workspace = workspaces
            .entry(workspace_id)
            .or_insert_with(|| WorkspaceRecord {
                id: workspace_id,
                tenant_id: Uuid::nil(),
                name: String::new(),
                logo_url: None,
                introduction: String::new(),
            });
        workspace.name = name.to_string();
        workspace.logo_url = logo_url.map(str::to_string);
        workspace.introduction = introduction.to_string();
        Ok(workspace.clone())
    }
}

#[derive(Clone)]
pub struct MemoryAuthRepository {
    user: Arc<RwLock<UserRecord>>,
    audit_events: Arc<RwLock<Vec<String>>>,
    audit_logs: Arc<RwLock<Vec<AuditLogRecord>>>,
    bump_session_version_calls: Arc<RwLock<Vec<(Uuid, Uuid)>>>,
}

impl MemoryAuthRepository {
    pub fn new(user: UserRecord) -> Self {
        Self {
            user: Arc::new(RwLock::new(user)),
            audit_events: Arc::new(RwLock::new(Vec::new())),
            audit_logs: Arc::new(RwLock::new(Vec::new())),
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

    pub fn audit_logs(&self) -> Vec<AuditLogRecord> {
        self.audit_logs
            .try_read()
            .expect("audit_logs lock should be free in assertions")
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

    async fn default_scope_for_user(&self, _user_id: Uuid) -> Result<ScopeContext> {
        Ok(ScopeContext {
            tenant_id: Uuid::nil(),
            workspace_id: Uuid::nil(),
        })
    }

    async fn load_actor_context(
        &self,
        user_id: Uuid,
        tenant_id: Uuid,
        workspace_id: Uuid,
        display_role: Option<&str>,
    ) -> Result<ActorContext> {
        let user = self.user.read().await.clone();
        let codes: Vec<String> = user
            .roles
            .iter()
            .filter(|role| {
                matches!(role.scope_kind, RoleScopeKind::System)
                    || role.workspace_id == Some(workspace_id)
            })
            .map(|role| role.code.clone())
            .collect();
        let effective_display_role = display_role
            .filter(|candidate| codes.iter().any(|code| code == *candidate))
            .map(str::to_string)
            .or_else(|| codes.first().cloned())
            .unwrap_or_else(|| "manager".to_string());

        Ok(ActorContext {
            user_id,
            tenant_id,
            current_workspace_id: workspace_id,
            effective_display_role,
            is_root: codes.iter().any(|code| code == "root"),
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

    async fn update_profile(&self, input: &UpdateProfileInput) -> Result<UserRecord> {
        let mut user = self.user.write().await;
        anyhow::ensure!(user.id == input.user_id, "unknown user");
        user.name = input.name.clone();
        user.nickname = input.nickname.clone();
        user.email = input.email.clone();
        user.phone = input.phone.clone();
        user.avatar_url = input.avatar_url.clone();
        user.introduction = input.introduction.clone();
        Ok(user.clone())
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
        self.audit_logs.write().await.push(event.clone());
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
