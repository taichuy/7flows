pub mod api_keys;
pub mod compat;
pub mod conversations;
pub mod mapping;
pub mod native;
pub mod publications;
pub mod run_service;

use crate::errors::ControlPlaneError;

pub(crate) fn ensure_application_view_permission(
    actor: &domain::ActorContext,
    application: &domain::ApplicationRecord,
) -> std::result::Result<(), ControlPlaneError> {
    if actor.is_root || actor.has_permission("application.view.all") {
        return Ok(());
    }

    if actor.has_permission("application.view.own") && application.created_by == actor.user_id {
        return Ok(());
    }

    Err(ControlPlaneError::PermissionDenied("permission_denied"))
}

pub(crate) fn ensure_application_edit_permission(
    actor: &domain::ActorContext,
    application: &domain::ApplicationRecord,
) -> std::result::Result<(), ControlPlaneError> {
    if actor.is_root || actor.has_permission("application.edit.all") {
        return Ok(());
    }

    if actor.has_permission("application.edit.own") && application.created_by == actor.user_id {
        return Ok(());
    }

    Err(ControlPlaneError::PermissionDenied("permission_denied"))
}

#[cfg(test)]
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

#[cfg(test)]
use anyhow::Result;
#[cfg(test)]
use async_trait::async_trait;
#[cfg(test)]
use time::OffsetDateTime;
#[cfg(test)]
use uuid::Uuid;

#[cfg(test)]
use crate::ports::{
    ApiKeyRepository, AppendRunEventInput, ApplicationApiMappingRepository,
    ApplicationCompileContextRepository, ApplicationCompiledPlanRepository,
    ApplicationPublicationRepository, ApplicationRepository, ApplicationVisibility, AuthRepository,
    CacheStore, CreateApiKeyInput, CreateApplicationInput,
    CreateApplicationPublicationVersionInput, CreateApplicationTagInput, CreateFlowRunInput,
    DeleteApplicationInput, FlowRepository, ReplaceApplicationApiMappingInput,
    ReplaceApplicationEnvironmentVariablesInput, SetApplicationApiEnabledInput,
    UpdateApplicationInput, UpdateProfileInput, UpsertApiKeyDataModelPermissionInput,
    UpsertCompiledPlanInput,
};

#[cfg(test)]
const TEST_TENANT_ID: Uuid = Uuid::from_u128(0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa);
#[cfg(test)]
const TEST_WORKSPACE_ID: Uuid = Uuid::from_u128(0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);
#[cfg(test)]
const TEST_ROOT_USER_ID: Uuid = Uuid::from_u128(0x33333333333333333333333333333333);

#[cfg(test)]
#[derive(Default)]
struct ApplicationPublicApiTestRepositoryInner {
    applications: HashMap<Uuid, domain::ApplicationRecord>,
    api_keys: HashMap<Uuid, domain::ApiKeyRecord>,
    permissions: HashMap<Uuid, Vec<domain::ApiKeyDataModelPermissionRecord>>,
    conversations:
        HashMap<(Uuid, Uuid, String, String), conversations::ApplicationPublicConversationRecord>,
    run_conversations: HashMap<Uuid, Uuid>,
    actor_permissions: Vec<String>,
    mappings: HashMap<Uuid, mapping::ApplicationApiMappingConfig>,
    editor_states: HashMap<Uuid, domain::FlowEditorState>,
    compiled_plans: HashMap<Uuid, domain::CompiledPlanRecord>,
    publications: HashMap<Uuid, publications::ApplicationPublicationVersionRecord>,
    application_api_enabled: HashMap<Uuid, bool>,
    native_runs: HashMap<Uuid, native::NativeRunResult>,
    flow_runs: HashMap<Uuid, domain::FlowRunRecord>,
    callback_tasks: HashMap<Uuid, domain::CallbackTaskRecord>,
    run_events: HashMap<Uuid, Vec<domain::RunEventRecord>>,
    editor_state_read_count: usize,
    next_flow_ordinal: u128,
    next_flow_version_sequence: i64,
    next_compiled_plan_ordinal: u128,
    next_publication_ordinal: u128,
    api_key_last_used_write_counts: HashMap<Uuid, usize>,
    fail_mark_api_key_used: bool,
}

#[cfg(test)]
#[derive(Clone, Default)]
pub struct ApplicationPublicApiTestRepository {
    inner: Arc<Mutex<ApplicationPublicApiTestRepositoryInner>>,
}

#[cfg(test)]
impl ApplicationPublicApiTestRepository {
    fn with_permissions(permissions: Vec<&str>) -> Self {
        let repository = Self::default();
        repository
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .actor_permissions = permissions.into_iter().map(str::to_string).collect();
        repository
    }

    fn seed_application(&self, actor_user_id: Uuid, name: &str) -> domain::ApplicationRecord {
        let application = domain::ApplicationRecord {
            id: Uuid::now_v7(),
            workspace_id: TEST_WORKSPACE_ID,
            application_type: domain::ApplicationType::AgentFlow,
            name: name.to_string(),
            description: String::new(),
            icon: None,
            icon_type: None,
            icon_background: None,
            created_by: actor_user_id,
            updated_at: OffsetDateTime::now_utc(),
            tags: Vec::new(),
            sections: domain::ApplicationSections {
                orchestration: domain::ApplicationOrchestrationSection {
                    status: "planned".to_string(),
                    subject_kind: "agent_flow".to_string(),
                    subject_status: "unconfigured".to_string(),
                    current_subject_id: None,
                    current_draft_id: None,
                },
                api: domain::ApplicationApiSection {
                    status: "planned".to_string(),
                    credential_kind: "application_api_key".to_string(),
                    invoke_routing_mode: "api_key_bound_application".to_string(),
                    invoke_path_template: Some("/api/1flowbase/runs".to_string()),
                    api_capability_status: "not_published".to_string(),
                    credentials_status: "missing".to_string(),
                },
                logs: domain::ApplicationLogsSection {
                    status: "planned".to_string(),
                    runs_capability_status: "planned".to_string(),
                    run_object_kind: "application_run".to_string(),
                    log_retention_status: "planned".to_string(),
                },
                monitoring: domain::ApplicationMonitoringSection {
                    status: "planned".to_string(),
                    metrics_capability_status: "planned".to_string(),
                    metrics_object_kind: "application_metrics".to_string(),
                    tracing_config_status: "planned".to_string(),
                },
            },
        };
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .applications
            .insert(application.id, application.clone());
        application
    }

    pub fn contains_api_key(&self, api_key_id: Uuid) -> bool {
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .api_keys
            .contains_key(&api_key_id)
    }

    pub fn api_key_last_used_write_count(&self, api_key_id: Uuid) -> usize {
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .api_key_last_used_write_counts
            .get(&api_key_id)
            .copied()
            .unwrap_or_default()
    }

    pub fn fail_mark_api_key_used(&self, fail: bool) {
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .fail_mark_api_key_used = fail;
    }
}

#[cfg(test)]
pub struct ApplicationPublicApiTestHarness {
    repository: ApplicationPublicApiTestRepository,
}

#[cfg(test)]
impl ApplicationPublicApiTestHarness {
    pub fn new() -> Self {
        Self {
            repository: ApplicationPublicApiTestRepository::with_permissions(vec![
                "state_model.manage.all",
                "application.view.all",
                "application.edit.all",
            ]),
        }
    }

    pub fn new_with_permissions(permissions: Vec<&str>) -> Self {
        Self {
            repository: ApplicationPublicApiTestRepository::with_permissions(permissions),
        }
    }

    pub fn repository(&self) -> ApplicationPublicApiTestRepository {
        self.repository.clone()
    }

    pub fn last_used_cache(&self) -> ApplicationPublicApiTestCache {
        ApplicationPublicApiTestCache::default()
    }

    pub fn seed_application(&self, actor_user_id: Uuid, name: &str) -> domain::ApplicationRecord {
        self.repository.seed_application(actor_user_id, name)
    }
}

#[cfg(test)]
#[derive(Clone, Default)]
pub struct ApplicationPublicApiTestCache {
    inner: Arc<Mutex<ApplicationPublicApiTestCacheInner>>,
}

#[cfg(test)]
#[derive(Default)]
struct ApplicationPublicApiTestCacheInner {
    keys: HashMap<String, serde_json::Value>,
    last_ttl: Option<time::Duration>,
}

#[cfg(test)]
impl ApplicationPublicApiTestCache {
    pub fn last_ttl(&self) -> Option<time::Duration> {
        self.inner
            .lock()
            .expect("application public api test cache mutex poisoned")
            .last_ttl
    }
}

#[cfg(test)]
#[async_trait]
impl CacheStore for ApplicationPublicApiTestCache {
    async fn get_json(&self, key: &str) -> Result<Option<serde_json::Value>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test cache mutex poisoned")
            .keys
            .get(key)
            .cloned())
    }

    async fn set_json(
        &self,
        key: &str,
        value: serde_json::Value,
        ttl: Option<time::Duration>,
    ) -> Result<()> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test cache mutex poisoned");
        inner.last_ttl = ttl;
        inner.keys.insert(key.to_string(), value);
        Ok(())
    }

    async fn set_if_absent_json(
        &self,
        key: &str,
        value: serde_json::Value,
        ttl: Option<time::Duration>,
    ) -> Result<bool> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test cache mutex poisoned");
        inner.last_ttl = ttl;
        if inner.keys.contains_key(key) {
            return Ok(false);
        }
        inner.keys.insert(key.to_string(), value);
        Ok(true)
    }

    async fn delete(&self, key: &str) -> Result<()> {
        self.inner
            .lock()
            .expect("application public api test cache mutex poisoned")
            .keys
            .remove(key);
        Ok(())
    }

    async fn touch(&self, key: &str, ttl: time::Duration) -> Result<bool> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test cache mutex poisoned");
        inner.last_ttl = Some(ttl);
        Ok(inner.keys.contains_key(key))
    }
}

#[cfg(test)]
impl Default for ApplicationPublicApiTestHarness {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
#[async_trait]
impl FlowRepository for ApplicationPublicApiTestRepository {
    async fn get_or_create_editor_state(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");
        inner.editor_state_read_count += 1;
        let application = inner
            .applications
            .get(&application_id)
            .filter(|application| application.workspace_id == workspace_id)
            .cloned()
            .ok_or(ControlPlaneError::NotFound("application"))?;
        if let Some(state) = inner.editor_states.get(&application_id).cloned() {
            return Ok(state);
        }

        inner.next_flow_ordinal += 1;
        inner.next_flow_version_sequence += 1;
        let flow_id =
            deterministic_test_id(0x11111111111111110000000000000000, inner.next_flow_ordinal);
        let draft_id =
            deterministic_test_id(0x22222222222222220000000000000000, inner.next_flow_ordinal);
        let version_id =
            deterministic_test_id(0x33333333333333330000000000000000, inner.next_flow_ordinal);
        let now =
            OffsetDateTime::UNIX_EPOCH + time::Duration::seconds(inner.next_flow_ordinal as i64);
        let document = domain::default_flow_document(flow_id);
        let state = domain::FlowEditorState {
            flow: domain::FlowRecord {
                id: flow_id,
                application_id: application.id,
                created_by: actor_user_id,
                updated_at: now,
            },
            draft: domain::FlowDraftRecord {
                id: draft_id,
                flow_id,
                schema_version: domain::FLOW_SCHEMA_VERSION.to_string(),
                document: document.clone(),
                updated_at: now,
            },
            versions: vec![domain::FlowVersionRecord {
                id: version_id,
                flow_id,
                sequence: inner.next_flow_version_sequence,
                trigger: domain::FlowVersionTrigger::Autosave,
                change_kind: domain::FlowChangeKind::Logical,
                summary: "初始化默认草稿".to_string(),
                summary_is_custom: false,
                is_protected: false,
                document,
                created_at: now,
            }],
            autosave_interval_seconds: domain::FLOW_AUTOSAVE_INTERVAL_SECONDS,
        };
        inner.editor_states.insert(application_id, state.clone());
        Ok(state)
    }

    async fn save_draft(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
        document: serde_json::Value,
        change_kind: domain::FlowChangeKind,
        summary: &str,
    ) -> Result<domain::FlowEditorState> {
        let mut state = self
            .get_or_create_editor_state(workspace_id, application_id, actor_user_id)
            .await?;
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");
        inner.next_flow_ordinal += 1;
        let now =
            OffsetDateTime::UNIX_EPOCH + time::Duration::seconds(inner.next_flow_ordinal as i64);
        state.draft.document = document.clone();
        state.draft.schema_version = document
            .get("schemaVersion")
            .and_then(serde_json::Value::as_str)
            .unwrap_or(domain::FLOW_SCHEMA_VERSION)
            .to_string();
        state.draft.updated_at = now;
        state.flow.updated_at = now;

        if matches!(change_kind, domain::FlowChangeKind::Logical) {
            inner.next_flow_version_sequence += 1;
            state.versions.push(domain::FlowVersionRecord {
                id: deterministic_test_id(
                    0x33333333333333330000000000000000,
                    inner.next_flow_version_sequence as u128,
                ),
                flow_id: state.flow.id,
                sequence: inner.next_flow_version_sequence,
                trigger: domain::FlowVersionTrigger::Autosave,
                change_kind,
                summary: summary.to_string(),
                summary_is_custom: false,
                is_protected: false,
                document,
                created_at: now,
            });
        }
        inner.editor_states.insert(application_id, state.clone());
        Ok(state)
    }

    async fn restore_version(
        &self,
        _workspace_id: Uuid,
        _application_id: Uuid,
        _actor_user_id: Uuid,
        _version_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        anyhow::bail!("restore_version not implemented")
    }

    async fn update_version_metadata(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
        version_id: Uuid,
        summary: Option<String>,
        summary_is_custom: Option<bool>,
        is_protected: Option<bool>,
    ) -> Result<domain::FlowEditorState> {
        let mut state = self
            .get_or_create_editor_state(workspace_id, application_id, actor_user_id)
            .await?;
        let version = state
            .versions
            .iter_mut()
            .find(|version| version.id == version_id)
            .ok_or(ControlPlaneError::NotFound("flow_version"))?;
        if let Some(summary) = summary {
            version.summary = summary;
        }
        if let Some(summary_is_custom) = summary_is_custom {
            version.summary_is_custom = summary_is_custom;
        }
        if let Some(is_protected) = is_protected {
            version.is_protected = is_protected;
        }
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .editor_states
            .insert(application_id, state.clone());
        Ok(state)
    }
}

#[cfg(test)]
#[async_trait]
impl AuthRepository for ApplicationPublicApiTestRepository {
    async fn find_authenticator(&self, _name: &str) -> Result<Option<domain::AuthenticatorRecord>> {
        anyhow::bail!("find_authenticator not implemented")
    }

    async fn find_user_for_password_login(
        &self,
        _identifier: &str,
    ) -> Result<Option<domain::UserRecord>> {
        anyhow::bail!("find_user_for_password_login not implemented")
    }

    async fn find_user_by_id(&self, _user_id: Uuid) -> Result<Option<domain::UserRecord>> {
        anyhow::bail!("find_user_by_id not implemented")
    }

    async fn default_scope_for_user(&self, _user_id: Uuid) -> Result<domain::ScopeContext> {
        Ok(domain::ScopeContext {
            tenant_id: TEST_TENANT_ID,
            workspace_id: TEST_WORKSPACE_ID,
        })
    }

    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> Result<domain::ActorContext> {
        if actor_user_id == TEST_ROOT_USER_ID {
            return Ok(domain::ActorContext::root_in_scope(
                actor_user_id,
                TEST_TENANT_ID,
                TEST_WORKSPACE_ID,
                "root",
            ));
        }

        let permissions = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .actor_permissions
            .clone();

        Ok(domain::ActorContext::scoped_in_scope(
            actor_user_id,
            TEST_TENANT_ID,
            TEST_WORKSPACE_ID,
            "manager",
            permissions,
        ))
    }

    async fn load_actor_context(
        &self,
        user_id: Uuid,
        tenant_id: Uuid,
        workspace_id: Uuid,
        _display_role: Option<&str>,
    ) -> Result<domain::ActorContext> {
        Ok(domain::ActorContext::scoped_in_scope(
            user_id,
            tenant_id,
            workspace_id,
            "manager",
            Vec::<String>::new(),
        ))
    }

    async fn update_password_hash(
        &self,
        _user_id: Uuid,
        _password_hash: &str,
        _actor_id: Uuid,
    ) -> Result<i64> {
        anyhow::bail!("update_password_hash not implemented")
    }

    async fn update_profile(&self, _input: &UpdateProfileInput) -> Result<domain::UserRecord> {
        anyhow::bail!("update_profile not implemented")
    }

    async fn bump_session_version(&self, _user_id: Uuid, _actor_id: Uuid) -> Result<i64> {
        anyhow::bail!("bump_session_version not implemented")
    }

    async fn list_permissions(&self) -> Result<Vec<domain::PermissionDefinition>> {
        Ok(Vec::new())
    }

    async fn append_audit_log(&self, _event: &domain::AuditLogRecord) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
#[async_trait]
impl ApiKeyRepository for ApplicationPublicApiTestRepository {
    async fn create_api_key(&self, input: &CreateApiKeyInput) -> Result<domain::ApiKeyRecord> {
        let now = OffsetDateTime::now_utc();
        let api_key = domain::ApiKeyRecord {
            id: input.id,
            name: input.name.clone(),
            token_hash: input.token_hash.clone(),
            token_prefix: input.token_prefix.clone(),
            key_kind: input.key_kind,
            application_id: input.application_id,
            creator_user_id: input.creator_user_id,
            tenant_id: input.tenant_id,
            scope_kind: input.scope_kind,
            scope_id: input.scope_id,
            enabled: input.enabled,
            expires_at: input.expires_at,
            last_used_at: None,
            created_at: now,
            updated_at: now,
        };
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .api_keys
            .insert(api_key.id, api_key.clone());
        Ok(api_key)
    }

    async fn replace_api_key_data_model_permissions(
        &self,
        api_key_id: Uuid,
        permissions: &[UpsertApiKeyDataModelPermissionInput],
    ) -> Result<Vec<domain::ApiKeyDataModelPermissionRecord>> {
        let records = permissions
            .iter()
            .map(|permission| domain::ApiKeyDataModelPermissionRecord {
                api_key_id,
                data_model_id: permission.data_model_id,
                allow_list: permission.allow_list,
                allow_get: permission.allow_get,
                allow_create: permission.allow_create,
                allow_update: permission.allow_update,
                allow_delete: permission.allow_delete,
            })
            .collect::<Vec<_>>();
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .permissions
            .insert(api_key_id, records.clone());
        Ok(records)
    }

    async fn find_api_key_by_token_hash(
        &self,
        token_hash: &str,
    ) -> Result<Option<domain::ApiKeyRecord>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .api_keys
            .values()
            .find(|api_key| api_key.token_hash == token_hash)
            .cloned())
    }

    async fn mark_api_key_used(&self, api_key_id: Uuid) -> Result<()> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");
        if inner.fail_mark_api_key_used {
            anyhow::bail!("mark_api_key_used failed for test");
        }
        let api_key = inner
            .api_keys
            .get_mut(&api_key_id)
            .ok_or(ControlPlaneError::NotFound("api_key"))?;
        api_key.last_used_at = Some(OffsetDateTime::now_utc());
        *inner
            .api_key_last_used_write_counts
            .entry(api_key_id)
            .or_default() += 1;
        Ok(())
    }

    async fn list_application_api_keys(
        &self,
        application_id: Uuid,
        creator_user_id: Uuid,
    ) -> Result<Vec<domain::ApiKeyRecord>> {
        let mut keys = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .api_keys
            .values()
            .filter(|api_key| api_key.key_kind == domain::ApiKeyKind::ApplicationApiKey)
            .filter(|api_key| api_key.application_id == Some(application_id))
            .filter(|api_key| api_key.creator_user_id == creator_user_id)
            .filter(|api_key| api_key.enabled)
            .cloned()
            .collect::<Vec<_>>();
        keys.sort_by(|left, right| {
            right
                .created_at
                .cmp(&left.created_at)
                .then(right.id.cmp(&left.id))
        });
        Ok(keys)
    }

    async fn revoke_application_api_key(
        &self,
        api_key_id: Uuid,
        application_id: Uuid,
        creator_user_id: Uuid,
    ) -> Result<()> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");
        let can_delete = inner
            .api_keys
            .get(&api_key_id)
            .filter(|api_key| api_key.key_kind == domain::ApiKeyKind::ApplicationApiKey)
            .filter(|api_key| api_key.application_id == Some(application_id))
            .filter(|api_key| api_key.creator_user_id == creator_user_id)
            .is_some();
        if !can_delete {
            return Err(ControlPlaneError::NotFound("application_api_key").into());
        }
        inner.api_keys.remove(&api_key_id);
        Ok(())
    }

    async fn list_api_key_data_model_permissions(
        &self,
        api_key_id: Uuid,
    ) -> Result<Vec<domain::ApiKeyDataModelPermissionRecord>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .permissions
            .get(&api_key_id)
            .cloned()
            .unwrap_or_default())
    }
}

#[cfg(test)]
#[async_trait]
impl ApplicationRepository for ApplicationPublicApiTestRepository {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> Result<domain::ActorContext> {
        AuthRepository::load_actor_context_for_user(self, actor_user_id).await
    }

    async fn list_applications(
        &self,
        _workspace_id: Uuid,
        _actor_user_id: Uuid,
        _visibility: ApplicationVisibility,
    ) -> Result<Vec<domain::ApplicationRecord>> {
        anyhow::bail!("list_applications not implemented")
    }

    async fn create_application(
        &self,
        _input: &CreateApplicationInput,
    ) -> Result<domain::ApplicationRecord> {
        anyhow::bail!("create_application not implemented")
    }

    async fn update_application(
        &self,
        _input: &UpdateApplicationInput,
    ) -> Result<domain::ApplicationRecord> {
        anyhow::bail!("update_application not implemented")
    }

    async fn delete_application(&self, _input: &DeleteApplicationInput) -> Result<()> {
        anyhow::bail!("delete_application not implemented")
    }

    async fn get_application(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
    ) -> Result<Option<domain::ApplicationRecord>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .applications
            .get(&application_id)
            .cloned()
            .filter(|application| application.workspace_id == workspace_id))
    }

    async fn list_application_tags(
        &self,
        _workspace_id: Uuid,
        _actor_user_id: Uuid,
        _visibility: ApplicationVisibility,
    ) -> Result<Vec<domain::ApplicationTagCatalogEntry>> {
        Ok(Vec::new())
    }

    async fn create_application_tag(
        &self,
        _input: &CreateApplicationTagInput,
    ) -> Result<domain::ApplicationTagCatalogEntry> {
        anyhow::bail!("create_application_tag not implemented")
    }

    async fn list_application_environment_variables(
        &self,
        _workspace_id: Uuid,
        _application_id: Uuid,
    ) -> Result<Vec<domain::ApplicationEnvironmentVariable>> {
        Ok(Vec::new())
    }

    async fn replace_application_environment_variables(
        &self,
        _input: &ReplaceApplicationEnvironmentVariablesInput,
    ) -> Result<Vec<domain::ApplicationEnvironmentVariable>> {
        Ok(Vec::new())
    }

    async fn append_audit_log(&self, _event: &domain::AuditLogRecord) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
#[async_trait]
impl ApplicationApiMappingRepository for ApplicationPublicApiTestRepository {
    async fn get_application_api_mapping(
        &self,
        application_id: Uuid,
    ) -> Result<Option<mapping::ApplicationApiMappingConfig>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .mappings
            .get(&application_id)
            .cloned())
    }

    async fn replace_application_api_mapping(
        &self,
        input: &ReplaceApplicationApiMappingInput,
    ) -> Result<mapping::ApplicationApiMappingConfig> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");
        if !inner.applications.contains_key(&input.application_id) {
            return Err(ControlPlaneError::NotFound("application").into());
        }
        inner
            .mappings
            .insert(input.application_id, input.mapping.clone());
        Ok(input.mapping.clone())
    }
}

#[cfg(test)]
#[async_trait]
impl ApplicationCompileContextRepository for ApplicationPublicApiTestRepository {
    async fn build_application_compile_context(
        &self,
        _workspace_id: Uuid,
    ) -> Result<orchestration_runtime::compiler::FlowCompileContext> {
        Ok(orchestration_runtime::compiler::FlowCompileContext {
            provider_families: Default::default(),
            provider_instances: Default::default(),
            node_contributions: Default::default(),
        })
    }
}

#[cfg(test)]
#[async_trait]
impl ApplicationCompiledPlanRepository for ApplicationPublicApiTestRepository {
    async fn upsert_application_compiled_plan(
        &self,
        input: &UpsertCompiledPlanInput,
    ) -> Result<domain::CompiledPlanRecord> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");
        inner.next_compiled_plan_ordinal += 1;
        let now = OffsetDateTime::UNIX_EPOCH
            + time::Duration::seconds(inner.next_compiled_plan_ordinal as i64);
        let record = domain::CompiledPlanRecord {
            id: deterministic_test_id(
                0x55555555555555550000000000000000,
                inner.next_compiled_plan_ordinal,
            ),
            flow_id: input.flow_id,
            draft_id: input.flow_draft_id,
            schema_version: input.schema_version.clone(),
            document_hash: input.document_hash.clone(),
            document_updated_at: input.document_updated_at,
            plan: input.plan.clone(),
            created_by: input.actor_user_id,
            created_at: now,
            updated_at: now,
        };
        inner.compiled_plans.insert(record.id, record.clone());
        Ok(record)
    }

    async fn get_application_compiled_plan(
        &self,
        compiled_plan_id: Uuid,
    ) -> Result<Option<domain::CompiledPlanRecord>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .compiled_plans
            .get(&compiled_plan_id)
            .cloned())
    }
}

#[cfg(test)]
impl ApplicationPublicApiTestRepository {
    pub async fn get_or_create_editor_state(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        FlowRepository::get_or_create_editor_state(
            self,
            workspace_id,
            application_id,
            actor_user_id,
        )
        .await
    }

    pub async fn get_compiled_plan(
        &self,
        compiled_plan_id: Uuid,
    ) -> Result<Option<domain::CompiledPlanRecord>> {
        ApplicationCompiledPlanRepository::get_application_compiled_plan(self, compiled_plan_id)
            .await
    }

    pub async fn get_flow_run(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> Result<Option<domain::FlowRunRecord>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .flow_runs
            .get(&flow_run_id)
            .filter(|run| run.application_id == application_id)
            .cloned())
    }

    pub fn clear_native_run_results(&self) {
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .native_runs
            .clear();
    }

    pub fn conversation_record_id_for_run(&self, flow_run_id: Uuid) -> Option<Uuid> {
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .run_conversations
            .get(&flow_run_id)
            .copied()
    }

    pub fn seed_pending_callback_task(&self, flow_run_id: Uuid) -> domain::CallbackTaskRecord {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");
        let node_run_id = Uuid::now_v7();
        let task = domain::CallbackTaskRecord {
            id: Uuid::now_v7(),
            flow_run_id,
            node_run_id,
            callback_kind: "external_callback".to_string(),
            status: domain::CallbackTaskStatus::Pending,
            request_payload: serde_json::json!({ "prompt": "approve" }),
            response_payload: None,
            external_ref_payload: None,
            created_at: OffsetDateTime::now_utc(),
            completed_at: None,
        };
        inner.callback_tasks.insert(task.id, task.clone());
        task
    }

    pub fn run_event_types(&self, flow_run_id: Uuid) -> Vec<String> {
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .run_events
            .get(&flow_run_id)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|event| event.event_type)
            .collect()
    }

    pub fn flow_run_count(&self) -> usize {
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .flow_runs
            .len()
    }

    pub fn reset_editor_state_read_count(&self) {
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .editor_state_read_count = 0;
    }

    pub fn editor_state_read_count(&self) -> usize {
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .editor_state_read_count
    }
}

#[cfg(test)]
#[async_trait]
impl ApplicationPublicationRepository for ApplicationPublicApiTestRepository {
    async fn create_active_application_publication_version(
        &self,
        input: &CreateApplicationPublicationVersionInput,
    ) -> Result<publications::ApplicationPublicationVersionRecord> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");

        if !inner.applications.contains_key(&input.application_id) {
            return Err(ControlPlaneError::NotFound("application").into());
        }

        inner.next_publication_ordinal += 1;
        let ordinal = inner.next_publication_ordinal;
        let version_sequence = inner
            .publications
            .values()
            .filter(|publication| publication.application_id == input.application_id)
            .map(|publication| publication.version_sequence)
            .max()
            .unwrap_or(0)
            + 1;

        for publication in inner
            .publications
            .values_mut()
            .filter(|publication| publication.application_id == input.application_id)
        {
            publication.active = false;
        }

        let publication = publications::ApplicationPublicationVersionRecord {
            id: deterministic_test_id(0x44444444444444440000000000000000, ordinal),
            application_id: input.application_id,
            flow_id: input.flow_id,
            flow_version_id: input.flow_version_id,
            mapping_snapshot: input.mapping_snapshot.clone(),
            compiled_plan_id: input.compiled_plan_id,
            version_sequence,
            active: true,
            api_enabled: input.api_enabled,
            flow_schema_version: input.flow_schema_version.clone(),
            document_hash: input.document_hash.clone(),
            document_snapshot: input.document_snapshot.clone(),
            runtime_profile_snapshot: input.runtime_profile_snapshot.clone(),
            output_selector: input.output_selector.clone(),
            created_by: input.actor_user_id,
            created_at: OffsetDateTime::UNIX_EPOCH + time::Duration::seconds(ordinal as i64),
        };
        inner
            .application_api_enabled
            .insert(input.application_id, input.api_enabled);
        inner
            .publications
            .insert(publication.id, publication.clone());

        Ok(publication)
    }

    async fn get_application_publication_version(
        &self,
        publication_id: Uuid,
    ) -> Result<Option<publications::ApplicationPublicationVersionRecord>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .publications
            .get(&publication_id)
            .cloned())
    }

    async fn list_application_publication_versions(
        &self,
        application_id: Uuid,
    ) -> Result<Vec<publications::ApplicationPublicationVersionRecord>> {
        let mut publications = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .publications
            .values()
            .filter(|publication| publication.application_id == application_id)
            .cloned()
            .collect::<Vec<_>>();
        publications.sort_by(|left, right| {
            right
                .version_sequence
                .cmp(&left.version_sequence)
                .then(right.id.cmp(&left.id))
        });
        Ok(publications)
    }

    async fn load_active_application_publication(
        &self,
        application_id: Uuid,
    ) -> Result<Option<publications::ApplicationPublicationVersionRecord>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .publications
            .values()
            .find(|publication| publication.application_id == application_id && publication.active)
            .cloned())
    }

    async fn set_application_api_enabled(
        &self,
        input: &SetApplicationApiEnabledInput,
    ) -> Result<()> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");
        if !inner.applications.contains_key(&input.application_id) {
            return Err(ControlPlaneError::NotFound("application").into());
        }
        inner
            .application_api_enabled
            .insert(input.application_id, input.api_enabled);
        Ok(())
    }
}

#[cfg(test)]
#[async_trait]
impl conversations::ApplicationPublicConversationRepository for ApplicationPublicApiTestRepository {
    async fn bind_application_public_conversation(
        &self,
        input: &conversations::BindApplicationPublicConversationInput,
    ) -> Result<conversations::ApplicationPublicConversationRecord> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");
        let key = (
            input.application_id,
            input.api_key_id,
            input.external_user.clone(),
            input.external_conversation_id.clone(),
        );
        let now = OffsetDateTime::now_utc();
        if let Some(record) = inner.conversations.get_mut(&key) {
            record.updated_at = now;
            return Ok(record.clone());
        }

        let record = conversations::ApplicationPublicConversationRecord {
            id: Uuid::now_v7(),
            application_id: input.application_id,
            api_key_id: input.api_key_id,
            external_user: input.external_user.clone(),
            external_conversation_id: input.external_conversation_id.clone(),
            created_at: now,
            updated_at: now,
        };
        inner.conversations.insert(key, record.clone());
        Ok(record)
    }
}

#[cfg(test)]
#[async_trait]
impl run_service::ApplicationPublishedFlowRunRepository for ApplicationPublicApiTestRepository {
    async fn create_published_flow_run(
        &self,
        input: &CreateFlowRunInput,
    ) -> Result<domain::FlowRunRecord> {
        let record = domain::FlowRunRecord {
            id: Uuid::now_v7(),
            application_id: input.application_id,
            flow_id: input.flow_id,
            draft_id: input.flow_draft_id,
            compiled_plan_id: Some(input.compiled_plan_id),
            debug_session_id: input.debug_session_id.clone(),
            flow_schema_version: input.flow_schema_version.clone(),
            document_hash: input.document_hash.clone(),
            run_mode: input.run_mode,
            target_node_id: input.target_node_id.clone(),
            title: input.title.clone(),
            status: input.status,
            input_payload: input.input_payload.clone(),
            output_payload: serde_json::json!({}),
            error_payload: None,
            created_by: input.actor_user_id,
            api_key_id: input.api_key_id,
            publication_version_id: input.publication_version_id,
            external_user: input.external_user.clone(),
            external_conversation_id: input.external_conversation_id.clone(),
            external_trace_id: input.external_trace_id.clone(),
            compatibility_mode: input.compatibility_mode.clone(),
            idempotency_key: input.idempotency_key.clone(),
            started_at: input.started_at,
            finished_at: None,
            created_at: input.started_at,
            updated_at: input.started_at,
        };
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");
        if let (Some(api_key_id), Some(external_user), Some(external_conversation_id)) = (
            record.api_key_id,
            record.external_user.as_ref(),
            record.external_conversation_id.as_ref(),
        ) {
            let key = (
                record.application_id,
                api_key_id,
                external_user.clone(),
                external_conversation_id.clone(),
            );
            if let Some(conversation_id) = inner.conversations.get(&key).map(|record| record.id) {
                inner.run_conversations.insert(record.id, conversation_id);
            }
        }
        inner.flow_runs.insert(record.id, record.clone());
        Ok(record)
    }

    async fn find_published_flow_run_by_idempotency_key(
        &self,
        application_id: Uuid,
        api_key_id: Uuid,
        idempotency_key: &str,
    ) -> Result<Option<domain::FlowRunRecord>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .flow_runs
            .values()
            .find(|run| {
                run.application_id == application_id
                    && run.api_key_id == Some(api_key_id)
                    && run.idempotency_key.as_deref() == Some(idempotency_key)
                    && run.run_mode == domain::FlowRunMode::PublishedApiRun
            })
            .cloned())
    }

    async fn append_published_run_event(
        &self,
        input: &AppendRunEventInput,
    ) -> Result<domain::RunEventRecord> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");
        let events = inner.run_events.entry(input.flow_run_id).or_default();
        let record = domain::RunEventRecord {
            id: Uuid::now_v7(),
            flow_run_id: input.flow_run_id,
            node_run_id: input.node_run_id,
            sequence: (events.len() + 1) as i64,
            event_type: input.event_type.clone(),
            payload: input.payload.clone(),
            created_at: OffsetDateTime::now_utc(),
        };
        events.push(record.clone());
        Ok(record)
    }
}

#[cfg(test)]
#[async_trait]
impl run_service::ApplicationPublishedRunControlRepository for ApplicationPublicApiTestRepository {
    async fn get_published_flow_run(
        &self,
        flow_run_id: Uuid,
    ) -> Result<Option<domain::FlowRunRecord>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .flow_runs
            .get(&flow_run_id)
            .filter(|run| run.run_mode == domain::FlowRunMode::PublishedApiRun)
            .cloned())
    }

    async fn cancel_published_flow_run(
        &self,
        input: &run_service::CancelPublishedFlowRunInput,
    ) -> Result<Option<domain::FlowRunRecord>> {
        let mut inner = self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned");
        let Some(record) = inner.flow_runs.get_mut(&input.flow_run_id) else {
            return Ok(None);
        };
        if record.status != input.from_status {
            return Ok(None);
        }
        record.status = domain::FlowRunStatus::Cancelled;
        record.output_payload = input.output_payload.clone();
        record.error_payload = input.error_payload.clone();
        record.finished_at = Some(input.finished_at);
        Ok(Some(record.clone()))
    }

    async fn get_published_callback_task(
        &self,
        callback_task_id: Uuid,
    ) -> Result<Option<domain::CallbackTaskRecord>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .callback_tasks
            .get(&callback_task_id)
            .cloned())
    }
}

#[cfg(test)]
#[async_trait]
impl native::NativeRunRepository for ApplicationPublicApiTestRepository {
    async fn create_native_run_result(
        &self,
        run: &native::NativeRunResult,
    ) -> Result<native::NativeRunResult> {
        self.inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .native_runs
            .insert(run.id, run.clone());
        Ok(run.clone())
    }

    async fn get_native_run_result(&self, run_id: Uuid) -> Result<Option<native::NativeRunResult>> {
        Ok(self
            .inner
            .lock()
            .expect("application public api test repo mutex poisoned")
            .native_runs
            .get(&run_id)
            .cloned())
    }
}

#[cfg(test)]
fn deterministic_test_id(prefix: u128, ordinal: u128) -> Uuid {
    Uuid::from_u128(prefix | ordinal)
}
