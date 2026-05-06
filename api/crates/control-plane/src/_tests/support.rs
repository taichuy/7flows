use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};

use anyhow::Result;
use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use async_trait::async_trait;
use time::OffsetDateTime;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::ports::{
    AddModelFieldInput, AuthRepository, BootstrapRepository, CreateFileStorageInput,
    CreateFileTableRegistrationInput, CreateMemberInput, CreateModelDefinitionInput,
    CreateScopeDataModelGrantInput, CreateWorkspaceRoleInput, FileManagementRepository,
    MemberRepository, ModelDefinitionRepository, RoleRepository, RuntimeEventCloseReason,
    RuntimeEventEnvelope, RuntimeEventPayload, RuntimeEventStream, RuntimeEventStreamPolicy,
    RuntimeEventSubscription, RuntimeEventTrimPolicy, SessionStore, UpdateFileStorageBindingInput,
    UpdateModelDefinitionInput, UpdateModelFieldInput, UpdateProfileInput,
    UpdateWorkspaceRoleInput, WorkspaceRepository,
};
use domain::{
    ActorContext, AuditLogRecord, AuthenticatorRecord, BoundRole, DataModelScopeKind,
    FileStorageHealthStatus, FileStorageRecord, FileTableRecord, FileTableScopeKind,
    MetadataAvailabilityStatus, ModelDefinitionRecord, ModelFieldRecord, PermissionDefinition,
    RoleScopeKind, RoleTemplate, ScopeContext, ScopeDataModelGrantRecord, SessionRecord,
    TenantRecord, UserRecord, UserStatus, WorkspaceRecord,
};

#[derive(Default)]
pub struct RecordingRuntimeEventStream {
    events: Mutex<Vec<RuntimeEventEnvelope>>,
    close_calls: Mutex<Vec<(Uuid, RuntimeEventCloseReason)>>,
}

impl RecordingRuntimeEventStream {
    pub fn events(&self) -> Vec<RuntimeEventEnvelope> {
        self.events
            .lock()
            .expect("runtime event stream lock should be available")
            .clone()
    }

    pub fn close_calls(&self) -> Vec<(Uuid, RuntimeEventCloseReason)> {
        self.close_calls
            .lock()
            .expect("runtime event stream close lock should be available")
            .clone()
    }
}

#[async_trait]
impl RuntimeEventStream for RecordingRuntimeEventStream {
    async fn open_run(&self, _run_id: Uuid, _policy: RuntimeEventStreamPolicy) -> Result<()> {
        Ok(())
    }

    async fn append(
        &self,
        run_id: Uuid,
        event: RuntimeEventPayload,
    ) -> Result<RuntimeEventEnvelope> {
        let mut events = self
            .events
            .lock()
            .expect("runtime event stream lock should be available");
        let envelope = RuntimeEventEnvelope::new(run_id, events.len() as i64 + 1, event);
        events.push(envelope.clone());
        Ok(envelope)
    }

    async fn subscribe(
        &self,
        _run_id: Uuid,
        _from_sequence: Option<i64>,
    ) -> Result<RuntimeEventSubscription> {
        let (_sender, receiver) = tokio::sync::mpsc::unbounded_channel();
        Ok(RuntimeEventSubscription {
            replay: self.events(),
            live_events: receiver,
        })
    }

    async fn replay(
        &self,
        _run_id: Uuid,
        from_sequence: Option<i64>,
        limit: usize,
    ) -> Result<Vec<RuntimeEventEnvelope>> {
        Ok(self
            .events()
            .into_iter()
            .filter(|event| from_sequence.is_none_or(|sequence| event.sequence > sequence))
            .take(limit)
            .collect())
    }

    async fn close_run(&self, run_id: Uuid, reason: RuntimeEventCloseReason) -> Result<()> {
        self.close_calls
            .lock()
            .expect("runtime event stream close lock should be available")
            .push((run_id, reason));
        Ok(())
    }

    async fn trim(&self, _run_id: Uuid, _policy: RuntimeEventTrimPolicy) -> Result<()> {
        Ok(())
    }
}

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
            preferred_locale: None,
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
    default_role_code: Arc<RwLock<String>>,
    created_members: Arc<RwLock<Vec<CreatedMember>>>,
    audit_events: Arc<RwLock<Vec<String>>>,
}

impl Default for MemoryMemberRepository {
    fn default() -> Self {
        Self::with_default_role("manager")
    }
}

impl MemoryMemberRepository {
    pub fn with_default_role(role_code: &str) -> Self {
        Self {
            root_user_id: Uuid::now_v7(),
            default_role_code: Arc::new(RwLock::new(role_code.to_string())),
            created_members: Arc::new(RwLock::new(Vec::new())),
            audit_events: Arc::new(RwLock::new(Vec::new())),
        }
    }

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
        let default_role_code = self.default_role_code.read().await.clone();
        self.created_members.write().await.push(CreatedMember {
            role_codes: vec![default_role_code.clone()],
        });
        Ok(UserRecord {
            id: Uuid::now_v7(),
            account: format!("{default_role_code}-1"),
            email: format!("{default_role_code}-1@example.com"),
            phone: Some("13800000000".to_string()),
            password_hash: "hash".to_string(),
            name: format!("{} 1", default_role_code.to_uppercase()),
            nickname: format!("{} 1", default_role_code.to_uppercase()),
            avatar_url: None,
            introduction: String::new(),
            preferred_locale: None,
            default_display_role: Some(default_role_code.clone()),
            email_login_enabled: true,
            phone_login_enabled: false,
            status: UserStatus::Active,
            session_version: 1,
            roles: vec![BoundRole {
                code: default_role_code,
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

    async fn create_team_role(&self, input: &CreateWorkspaceRoleInput) -> Result<()> {
        self.touched_workspaces
            .write()
            .await
            .push(input.workspace_id);
        let mut roles = self.roles.write().await;
        if input.is_default_member_role {
            for role in roles.iter_mut() {
                if matches!(role.scope_kind, RoleScopeKind::Workspace) {
                    role.is_default_member_role = false;
                }
            }
        }
        roles.push(RoleTemplate {
            code: input.code.clone(),
            name: input.name.clone(),
            introduction: input.introduction.clone(),
            scope_kind: RoleScopeKind::Workspace,
            is_builtin: false,
            is_editable: true,
            auto_grant_new_permissions: input.auto_grant_new_permissions,
            is_default_member_role: input.is_default_member_role,
            permissions: Vec::new(),
        });
        Ok(())
    }

    async fn update_team_role(&self, input: &UpdateWorkspaceRoleInput) -> Result<()> {
        self.touched_workspaces
            .write()
            .await
            .push(input.workspace_id);
        let mut roles = self.roles.write().await;
        let role_index = roles.iter().position(|role| role.code == input.role_code);

        if matches!(input.is_default_member_role, Some(false))
            && role_index
                .and_then(|index| roles.get(index))
                .map(|role| role.is_default_member_role)
                .unwrap_or(false)
        {
            anyhow::bail!(crate::errors::ControlPlaneError::InvalidInput(
                "default_member_role_required"
            ));
        }

        if matches!(input.is_default_member_role, Some(true)) {
            for role in roles.iter_mut() {
                if matches!(role.scope_kind, RoleScopeKind::Workspace)
                    && role.code != input.role_code
                {
                    role.is_default_member_role = false;
                }
            }
        }

        if let Some(role) = role_index.and_then(|index| roles.get_mut(index)) {
            role.name = input.name.clone();
            role.introduction = input.introduction.clone();
            if let Some(value) = input.auto_grant_new_permissions {
                role.auto_grant_new_permissions = value;
            }
            if let Some(value) = input.is_default_member_role {
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
    permissions: Arc<RwLock<HashSet<String>>>,
    audit_events: Arc<RwLock<Vec<String>>>,
    audit_logs: Arc<RwLock<Vec<AuditLogRecord>>>,
    bump_session_version_calls: Arc<RwLock<Vec<(Uuid, Uuid)>>>,
}

impl MemoryAuthRepository {
    pub fn new(user: UserRecord) -> Self {
        Self {
            user: Arc::new(RwLock::new(user)),
            permissions: Arc::new(RwLock::new(HashSet::new())),
            audit_events: Arc::new(RwLock::new(Vec::new())),
            audit_logs: Arc::new(RwLock::new(Vec::new())),
            bump_session_version_calls: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn root_user(preferred_locale: Option<&str>) -> Self {
        Self::new(UserRecord {
            id: Uuid::now_v7(),
            account: "root".to_string(),
            email: "root@example.com".to_string(),
            phone: None,
            password_hash: "password-hash".to_string(),
            name: "Root".to_string(),
            nickname: "Root".to_string(),
            avatar_url: None,
            introduction: String::new(),
            preferred_locale: preferred_locale.map(str::to_string),
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
        })
    }

    pub fn scoped_user(permissions: &[&str]) -> Self {
        let repository = Self::new(UserRecord {
            id: Uuid::now_v7(),
            account: "manager".to_string(),
            email: "manager@example.com".to_string(),
            phone: None,
            password_hash: "password-hash".to_string(),
            name: "Manager".to_string(),
            nickname: "Manager".to_string(),
            avatar_url: None,
            introduction: String::new(),
            preferred_locale: None,
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
        });
        repository
            .permissions
            .try_write()
            .expect("permissions lock should be free while constructing repository")
            .extend(permissions.iter().map(|value| value.to_string()));
        repository
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

    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> Result<ActorContext> {
        let scope = self.default_scope_for_user(actor_user_id).await?;
        self.load_actor_context(actor_user_id, scope.tenant_id, scope.workspace_id, None)
            .await
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
            permissions: self.permissions.read().await.clone(),
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
        user.preferred_locale = input.preferred_locale.clone();
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

pub fn memory_actor_context(is_root: bool, permissions: &[&str]) -> ActorContext {
    let user_id = Uuid::now_v7();
    let workspace_id = Uuid::nil();
    if is_root {
        ActorContext::root(user_id, workspace_id, "root")
    } else {
        ActorContext::scoped(
            user_id,
            workspace_id,
            "manager",
            permissions.iter().map(|permission| permission.to_string()),
        )
    }
}

#[derive(Clone)]
pub struct MemoryFileManagementRepository {
    actor: ActorContext,
    file_storages: Arc<RwLock<HashMap<Uuid, FileStorageRecord>>>,
    file_tables: Arc<RwLock<HashMap<Uuid, FileTableRecord>>>,
    models: Arc<Mutex<HashMap<Uuid, ModelDefinitionRecord>>>,
    grants: Arc<Mutex<Vec<ScopeDataModelGrantRecord>>>,
}

impl MemoryFileManagementRepository {
    pub fn new(actor: ActorContext) -> Self {
        Self {
            actor,
            file_storages: Arc::new(RwLock::new(HashMap::new())),
            file_tables: Arc::new(RwLock::new(HashMap::new())),
            models: Arc::new(Mutex::new(HashMap::new())),
            grants: Arc::default(),
        }
    }

    pub async fn insert_file_storage(&self, record: FileStorageRecord) {
        self.file_storages.write().await.insert(record.id, record);
    }

    pub async fn insert_file_table(&self, record: FileTableRecord) {
        self.file_tables.write().await.insert(record.id, record);
    }

    pub fn insert_model_definition(&self, model: ModelDefinitionRecord) {
        self.models
            .lock()
            .expect("model lock poisoned")
            .insert(model.id, model);
    }

    pub fn insert_scope_grant(&self, grant: ScopeDataModelGrantRecord) {
        self.grants.lock().expect("grant lock poisoned").push(grant);
    }
}

#[async_trait]
impl FileManagementRepository for MemoryFileManagementRepository {
    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> Result<ActorContext> {
        let mut actor = self.actor.clone();
        actor.user_id = actor_user_id;
        Ok(actor)
    }

    async fn find_file_table_by_code(&self, code: &str) -> Result<Option<FileTableRecord>> {
        Ok(self
            .file_tables
            .read()
            .await
            .values()
            .find(|record| record.code == code)
            .cloned())
    }

    async fn get_file_table(&self, file_table_id: Uuid) -> Result<Option<FileTableRecord>> {
        Ok(self.file_tables.read().await.get(&file_table_id).cloned())
    }

    async fn create_file_storage(
        &self,
        input: &CreateFileStorageInput,
    ) -> Result<FileStorageRecord> {
        let now = OffsetDateTime::now_utc();
        let record = FileStorageRecord {
            id: input.storage_id,
            code: input.code.clone(),
            title: input.title.clone(),
            driver_type: input.driver_type.clone(),
            enabled: input.enabled,
            is_default: input.is_default,
            config_json: input.config_json.clone(),
            rule_json: input.rule_json.clone(),
            health_status: FileStorageHealthStatus::Unknown,
            last_health_error: None,
            created_by: input.actor_user_id,
            updated_by: input.actor_user_id,
            created_at: now,
            updated_at: now,
        };
        self.file_storages
            .write()
            .await
            .insert(record.id, record.clone());
        Ok(record)
    }

    async fn create_file_table_registration(
        &self,
        input: &CreateFileTableRegistrationInput,
    ) -> Result<FileTableRecord> {
        let now = OffsetDateTime::now_utc();
        let record = FileTableRecord {
            id: input.file_table_id,
            code: input.code.clone(),
            title: input.title.clone(),
            scope_kind: input.scope_kind,
            scope_id: input.scope_id,
            model_definition_id: input.model_definition_id,
            bound_storage_id: input.bound_storage_id,
            is_builtin: input.is_builtin,
            is_default: input.is_default,
            status: "active".to_string(),
            created_by: input.actor_user_id,
            updated_by: input.actor_user_id,
            created_at: now,
            updated_at: now,
        };
        self.file_tables
            .write()
            .await
            .insert(record.id, record.clone());
        Ok(record)
    }

    async fn list_file_storages(&self) -> Result<Vec<FileStorageRecord>> {
        Ok(self.file_storages.read().await.values().cloned().collect())
    }

    async fn get_default_file_storage(&self) -> Result<Option<FileStorageRecord>> {
        Ok(self
            .file_storages
            .read()
            .await
            .values()
            .find(|record| record.is_default)
            .cloned())
    }

    async fn get_file_storage(&self, storage_id: Uuid) -> Result<Option<FileStorageRecord>> {
        Ok(self.file_storages.read().await.get(&storage_id).cloned())
    }

    async fn list_visible_file_tables(&self, workspace_id: Uuid) -> Result<Vec<FileTableRecord>> {
        Ok(self
            .file_tables
            .read()
            .await
            .values()
            .filter(|record| {
                matches!(record.scope_kind, FileTableScopeKind::System)
                    || record.scope_id == workspace_id
            })
            .cloned()
            .collect())
    }

    async fn update_file_table_binding(
        &self,
        input: &UpdateFileStorageBindingInput,
    ) -> Result<FileTableRecord> {
        let mut file_tables = self.file_tables.write().await;
        let now = OffsetDateTime::now_utc();
        let record = file_tables
            .entry(input.file_table_id)
            .or_insert_with(|| FileTableRecord {
                id: input.file_table_id,
                code: format!("file-table-{}", input.file_table_id),
                title: "File Table".to_string(),
                scope_kind: FileTableScopeKind::Workspace,
                scope_id: Uuid::nil(),
                model_definition_id: Uuid::nil(),
                bound_storage_id: input.bound_storage_id,
                is_builtin: false,
                is_default: false,
                status: "active".to_string(),
                created_by: input.actor_user_id,
                updated_by: input.actor_user_id,
                created_at: now,
                updated_at: now,
            });
        record.bound_storage_id = input.bound_storage_id;
        record.updated_by = input.actor_user_id;
        record.updated_at = now;
        Ok(record.clone())
    }
}

#[async_trait]
impl ModelDefinitionRepository for MemoryFileManagementRepository {
    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> Result<ActorContext> {
        let mut actor = self.actor.clone();
        actor.user_id = actor_user_id;
        Ok(actor)
    }

    async fn list_model_definitions(
        &self,
        _workspace_id: Uuid,
    ) -> Result<Vec<ModelDefinitionRecord>> {
        Ok(self
            .models
            .lock()
            .expect("model lock poisoned")
            .values()
            .cloned()
            .collect())
    }

    async fn get_model_definition(
        &self,
        workspace_id: Uuid,
        model_id: Uuid,
    ) -> Result<Option<ModelDefinitionRecord>> {
        Ok(self
            .models
            .lock()
            .expect("model lock poisoned")
            .get(&model_id)
            .filter(|model| {
                workspace_id.is_nil()
                    || !matches!(model.scope_kind, domain::DataModelScopeKind::Workspace)
                    || model.scope_id == workspace_id
            })
            .cloned())
    }

    async fn create_model_definition(
        &self,
        input: &CreateModelDefinitionInput,
    ) -> Result<ModelDefinitionRecord> {
        let model = ModelDefinitionRecord {
            id: Uuid::now_v7(),
            scope_kind: input.scope_kind,
            scope_id: input.scope_id,
            code: input.code.clone(),
            title: input.title.clone(),
            physical_table_name: format!("rtm_{}_{}", input.scope_kind.as_str(), input.code),
            acl_namespace: format!("state_model.{}", input.code),
            audit_namespace: format!("audit.state_model.{}", input.code),
            fields: vec![],
            availability_status: MetadataAvailabilityStatus::Available,
            data_source_instance_id: input.data_source_instance_id,
            source_kind: input.source_kind,
            external_resource_key: input.external_resource_key.clone(),
            external_table_id: input.external_table_id.clone(),
            external_capability_snapshot: None,
            status: input.status,
            api_exposure_status: input.api_exposure_status,
            protection: input.protection.clone(),
        };
        self.models
            .lock()
            .expect("model lock poisoned")
            .insert(model.id, model.clone());
        Ok(model)
    }

    async fn update_model_definition(
        &self,
        input: &UpdateModelDefinitionInput,
    ) -> Result<ModelDefinitionRecord> {
        let mut models = self.models.lock().expect("model lock poisoned");
        let model = models
            .get_mut(&input.model_id)
            .expect("model should exist for updates");
        model.title = input.title.clone();
        Ok(model.clone())
    }

    async fn add_model_field(&self, input: &AddModelFieldInput) -> Result<ModelFieldRecord> {
        let mut models = self.models.lock().expect("model lock poisoned");
        let model = models
            .get_mut(&input.model_id)
            .expect("model should exist for field inserts");
        let field = ModelFieldRecord {
            id: Uuid::now_v7(),
            data_model_id: input.model_id,
            code: input.code.clone(),
            title: input.title.clone(),
            physical_column_name: input
                .physical_column_name
                .clone()
                .unwrap_or_else(|| input.code.replace('-', "_")),
            external_field_key: input.external_field_key.clone(),
            field_kind: input.field_kind,
            is_system: input.is_system,
            is_writable: input.is_writable,
            is_required: input.is_required,
            is_unique: input.is_unique,
            default_value: input.default_value.clone(),
            display_interface: input.display_interface.clone(),
            display_options: input.display_options.clone(),
            relation_target_model_id: input.relation_target_model_id,
            relation_options: input.relation_options.clone(),
            sort_order: model.fields.len() as i32,
            availability_status: MetadataAvailabilityStatus::Available,
        };
        model.fields.push(field.clone());
        Ok(field)
    }

    async fn update_model_field(&self, input: &UpdateModelFieldInput) -> Result<ModelFieldRecord> {
        let mut models = self.models.lock().expect("model lock poisoned");
        let model = models
            .get_mut(&input.model_id)
            .expect("model should exist for field updates");
        let field = model
            .fields
            .iter_mut()
            .find(|field| field.id == input.field_id)
            .expect("field should exist for updates");
        field.title = input.title.clone();
        field.is_required = input.is_required;
        field.is_unique = input.is_unique;
        field.default_value = input.default_value.clone();
        field.display_interface = input.display_interface.clone();
        field.display_options = input.display_options.clone();
        field.relation_options = input.relation_options.clone();
        Ok(field.clone())
    }

    async fn delete_model_definition(&self, _actor_user_id: Uuid, model_id: Uuid) -> Result<()> {
        self.models
            .lock()
            .expect("model lock poisoned")
            .remove(&model_id);
        Ok(())
    }

    async fn delete_model_field(
        &self,
        _actor_user_id: Uuid,
        model_id: Uuid,
        field_id: Uuid,
    ) -> Result<()> {
        let mut models = self.models.lock().expect("model lock poisoned");
        if let Some(model) = models.get_mut(&model_id) {
            model.fields.retain(|field| field.id != field_id);
        }
        Ok(())
    }

    async fn publish_model_definition(
        &self,
        _actor_user_id: Uuid,
        model_id: Uuid,
    ) -> Result<ModelDefinitionRecord> {
        Ok(self
            .models
            .lock()
            .expect("model lock poisoned")
            .get(&model_id)
            .expect("model should exist for publish")
            .clone())
    }

    async fn create_scope_data_model_grant(
        &self,
        input: &CreateScopeDataModelGrantInput,
    ) -> Result<ScopeDataModelGrantRecord> {
        let now = OffsetDateTime::now_utc();
        let grant = ScopeDataModelGrantRecord {
            id: input.grant_id,
            scope_kind: input.scope_kind,
            scope_id: input.scope_id,
            data_model_id: input.data_model_id,
            enabled: input.enabled,
            permission_profile: input.permission_profile,
            created_by: input.created_by,
            created_at: now,
            updated_at: now,
        };
        self.insert_scope_grant(grant.clone());
        Ok(grant)
    }

    async fn list_scope_data_model_grants(
        &self,
        scope_kind: domain::DataModelScopeKind,
        scope_id: Uuid,
    ) -> Result<Vec<ScopeDataModelGrantRecord>> {
        Ok(self
            .grants
            .lock()
            .expect("grant lock poisoned")
            .iter()
            .filter(|grant| grant.scope_kind == scope_kind && grant.scope_id == scope_id)
            .cloned()
            .collect())
    }

    async fn append_audit_log(&self, _event: &AuditLogRecord) -> Result<()> {
        Ok(())
    }
}

#[derive(Clone, Default)]
pub struct MemoryProvisioningRepository {
    models: Arc<Mutex<HashMap<Uuid, ModelDefinitionRecord>>>,
    grants: Arc<Mutex<Vec<ScopeDataModelGrantRecord>>>,
    pub file_tables: Arc<Mutex<Vec<FileTableRecord>>>,
}

impl MemoryProvisioningRepository {
    pub fn recorded_file_tables(&self) -> Vec<FileTableRecord> {
        self.file_tables
            .lock()
            .expect("file table lock should be free in assertions")
            .clone()
    }
}

#[async_trait]
impl FileManagementRepository for MemoryProvisioningRepository {
    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> Result<ActorContext> {
        Ok(ActorContext::root(actor_user_id, Uuid::nil(), "root"))
    }

    async fn find_file_table_by_code(&self, code: &str) -> Result<Option<FileTableRecord>> {
        Ok(self
            .file_tables
            .lock()
            .expect("file table lock poisoned")
            .iter()
            .find(|record| record.code == code)
            .cloned())
    }

    async fn get_file_table(&self, file_table_id: Uuid) -> Result<Option<FileTableRecord>> {
        Ok(self
            .file_tables
            .lock()
            .expect("file table lock poisoned")
            .iter()
            .find(|record| record.id == file_table_id)
            .cloned())
    }

    async fn create_file_storage(
        &self,
        _input: &CreateFileStorageInput,
    ) -> Result<FileStorageRecord> {
        anyhow::bail!("not implemented for provisioning tests")
    }

    async fn create_file_table_registration(
        &self,
        input: &CreateFileTableRegistrationInput,
    ) -> Result<FileTableRecord> {
        let now = OffsetDateTime::now_utc();
        let record = FileTableRecord {
            id: input.file_table_id,
            code: input.code.clone(),
            title: input.title.clone(),
            scope_kind: input.scope_kind,
            scope_id: input.scope_id,
            model_definition_id: input.model_definition_id,
            bound_storage_id: input.bound_storage_id,
            is_builtin: input.is_builtin,
            is_default: input.is_default,
            status: "active".to_string(),
            created_by: input.actor_user_id,
            updated_by: input.actor_user_id,
            created_at: now,
            updated_at: now,
        };
        self.file_tables
            .lock()
            .expect("file table lock poisoned")
            .push(record.clone());
        Ok(record)
    }

    async fn list_file_storages(&self) -> Result<Vec<FileStorageRecord>> {
        Ok(vec![])
    }

    async fn get_default_file_storage(&self) -> Result<Option<FileStorageRecord>> {
        Ok(None)
    }

    async fn get_file_storage(&self, _storage_id: Uuid) -> Result<Option<FileStorageRecord>> {
        Ok(None)
    }

    async fn list_visible_file_tables(&self, workspace_id: Uuid) -> Result<Vec<FileTableRecord>> {
        Ok(self
            .file_tables
            .lock()
            .expect("file table lock poisoned")
            .iter()
            .filter(|record| {
                matches!(record.scope_kind, FileTableScopeKind::System)
                    || record.scope_id == workspace_id
            })
            .cloned()
            .collect())
    }

    async fn update_file_table_binding(
        &self,
        _input: &UpdateFileStorageBindingInput,
    ) -> Result<FileTableRecord> {
        anyhow::bail!("not implemented for provisioning tests")
    }
}

#[async_trait]
impl ModelDefinitionRepository for MemoryProvisioningRepository {
    async fn load_actor_context_for_user(&self, actor_user_id: Uuid) -> Result<ActorContext> {
        Ok(ActorContext::root(actor_user_id, Uuid::nil(), "root"))
    }

    async fn list_model_definitions(
        &self,
        _workspace_id: Uuid,
    ) -> Result<Vec<ModelDefinitionRecord>> {
        Ok(self
            .models
            .lock()
            .expect("model lock poisoned")
            .values()
            .cloned()
            .collect())
    }

    async fn get_model_definition(
        &self,
        _workspace_id: Uuid,
        model_id: Uuid,
    ) -> Result<Option<ModelDefinitionRecord>> {
        Ok(self
            .models
            .lock()
            .expect("model lock poisoned")
            .get(&model_id)
            .cloned())
    }

    async fn create_model_definition(
        &self,
        input: &CreateModelDefinitionInput,
    ) -> Result<ModelDefinitionRecord> {
        let model = ModelDefinitionRecord {
            id: Uuid::now_v7(),
            scope_kind: input.scope_kind,
            scope_id: input.scope_id,
            code: input.code.clone(),
            title: input.title.clone(),
            physical_table_name: format!("rtm_{}_{}", input.scope_kind.as_str(), input.code),
            acl_namespace: format!("state_model.{}", input.code),
            audit_namespace: format!("audit.state_model.{}", input.code),
            fields: vec![],
            availability_status: MetadataAvailabilityStatus::Available,
            data_source_instance_id: input.data_source_instance_id,
            source_kind: input.source_kind,
            external_resource_key: input.external_resource_key.clone(),
            external_table_id: input.external_table_id.clone(),
            external_capability_snapshot: None,
            status: input.status,
            api_exposure_status: input.api_exposure_status,
            protection: input.protection.clone(),
        };
        self.models
            .lock()
            .expect("model lock poisoned")
            .insert(model.id, model.clone());
        Ok(model)
    }

    async fn update_model_definition(
        &self,
        input: &UpdateModelDefinitionInput,
    ) -> Result<ModelDefinitionRecord> {
        let mut models = self.models.lock().expect("model lock poisoned");
        let model = models
            .get_mut(&input.model_id)
            .expect("model should exist for test updates");
        model.title = input.title.clone();
        Ok(model.clone())
    }

    async fn add_model_field(&self, input: &AddModelFieldInput) -> Result<ModelFieldRecord> {
        let mut models = self.models.lock().expect("model lock poisoned");
        let model = models
            .get_mut(&input.model_id)
            .expect("model should exist for field inserts");
        let field = ModelFieldRecord {
            id: Uuid::now_v7(),
            data_model_id: input.model_id,
            code: input.code.clone(),
            title: input.title.clone(),
            physical_column_name: input
                .physical_column_name
                .clone()
                .unwrap_or_else(|| input.code.replace('-', "_")),
            external_field_key: input.external_field_key.clone(),
            field_kind: input.field_kind,
            is_system: input.is_system,
            is_writable: input.is_writable,
            is_required: input.is_required,
            is_unique: input.is_unique,
            default_value: input.default_value.clone(),
            display_interface: input.display_interface.clone(),
            display_options: input.display_options.clone(),
            relation_target_model_id: input.relation_target_model_id,
            relation_options: input.relation_options.clone(),
            sort_order: model.fields.len() as i32,
            availability_status: MetadataAvailabilityStatus::Available,
        };
        model.fields.push(field.clone());
        Ok(field)
    }

    async fn update_model_field(&self, input: &UpdateModelFieldInput) -> Result<ModelFieldRecord> {
        let mut models = self.models.lock().expect("model lock poisoned");
        let model = models
            .get_mut(&input.model_id)
            .expect("model should exist for field updates");
        let field = model
            .fields
            .iter_mut()
            .find(|field| field.id == input.field_id)
            .expect("field should exist for updates");
        field.title = input.title.clone();
        field.is_required = input.is_required;
        field.is_unique = input.is_unique;
        field.default_value = input.default_value.clone();
        field.display_interface = input.display_interface.clone();
        field.display_options = input.display_options.clone();
        field.relation_options = input.relation_options.clone();
        Ok(field.clone())
    }

    async fn delete_model_definition(&self, _actor_user_id: Uuid, model_id: Uuid) -> Result<()> {
        self.models
            .lock()
            .expect("model lock poisoned")
            .remove(&model_id);
        Ok(())
    }

    async fn delete_model_field(
        &self,
        _actor_user_id: Uuid,
        model_id: Uuid,
        field_id: Uuid,
    ) -> Result<()> {
        let mut models = self.models.lock().expect("model lock poisoned");
        if let Some(model) = models.get_mut(&model_id) {
            model.fields.retain(|field| field.id != field_id);
        }
        Ok(())
    }

    async fn publish_model_definition(
        &self,
        _actor_user_id: Uuid,
        model_id: Uuid,
    ) -> Result<ModelDefinitionRecord> {
        Ok(self
            .models
            .lock()
            .expect("model lock poisoned")
            .get(&model_id)
            .expect("model should exist for publish")
            .clone())
    }

    async fn create_scope_data_model_grant(
        &self,
        input: &CreateScopeDataModelGrantInput,
    ) -> Result<ScopeDataModelGrantRecord> {
        self.models
            .lock()
            .expect("model lock poisoned")
            .get(&input.data_model_id)
            .filter(|model| matches!(model.scope_kind, DataModelScopeKind::System))
            .expect("grant target should be a system model");

        let now = OffsetDateTime::now_utc();
        let grant = ScopeDataModelGrantRecord {
            id: input.grant_id,
            scope_kind: input.scope_kind,
            scope_id: input.scope_id,
            data_model_id: input.data_model_id,
            enabled: input.enabled,
            permission_profile: input.permission_profile,
            created_by: input.created_by,
            created_at: now,
            updated_at: now,
        };
        self.grants
            .lock()
            .expect("grant lock poisoned")
            .push(grant.clone());
        Ok(grant)
    }

    async fn list_scope_data_model_grants(
        &self,
        scope_kind: DataModelScopeKind,
        scope_id: Uuid,
    ) -> Result<Vec<ScopeDataModelGrantRecord>> {
        Ok(self
            .grants
            .lock()
            .expect("grant lock poisoned")
            .iter()
            .filter(|grant| grant.scope_kind == scope_kind && grant.scope_id == scope_id)
            .cloned()
            .collect())
    }

    async fn append_audit_log(&self, _event: &AuditLogRecord) -> Result<()> {
        Ok(())
    }
}
