use async_trait::async_trait;
use domain::{
    ActorContext, AuditLogRecord, AuthenticatorRecord, DataModelScopeKind, ModelDefinitionRecord,
    ModelFieldKind, ModelFieldRecord, PermissionDefinition, RoleTemplate, ScopeContext,
    SessionRecord, TenantRecord, UserRecord, WorkspaceRecord,
};
use time::OffsetDateTime;
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

#[async_trait]
pub trait FlowRepository: Send + Sync {
    async fn get_or_create_editor_state(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
    ) -> anyhow::Result<domain::FlowEditorState>;
    async fn save_draft(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
        document: serde_json::Value,
        change_kind: domain::FlowChangeKind,
        summary: &str,
    ) -> anyhow::Result<domain::FlowEditorState>;
    async fn restore_version(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
        version_id: Uuid,
    ) -> anyhow::Result<domain::FlowEditorState>;
}

#[derive(Debug, Clone)]
pub struct UpsertCompiledPlanInput {
    pub actor_user_id: Uuid,
    pub flow_id: Uuid,
    pub flow_draft_id: Uuid,
    pub schema_version: String,
    pub document_updated_at: OffsetDateTime,
    pub plan: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct CreateFlowRunInput {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub flow_id: Uuid,
    pub flow_draft_id: Uuid,
    pub compiled_plan_id: Uuid,
    pub run_mode: domain::FlowRunMode,
    pub target_node_id: Option<String>,
    pub status: domain::FlowRunStatus,
    pub input_payload: serde_json::Value,
    pub started_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct CreateNodeRunInput {
    pub flow_run_id: Uuid,
    pub node_id: String,
    pub node_type: String,
    pub node_alias: String,
    pub status: domain::NodeRunStatus,
    pub input_payload: serde_json::Value,
    pub started_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct UpdateNodeRunInput {
    pub node_run_id: Uuid,
    pub status: domain::NodeRunStatus,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub metrics_payload: serde_json::Value,
    pub finished_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct CompleteNodeRunInput {
    pub node_run_id: Uuid,
    pub status: domain::NodeRunStatus,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub metrics_payload: serde_json::Value,
    pub finished_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct UpdateFlowRunInput {
    pub flow_run_id: Uuid,
    pub status: domain::FlowRunStatus,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub finished_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct CompleteFlowRunInput {
    pub flow_run_id: Uuid,
    pub status: domain::FlowRunStatus,
    pub output_payload: serde_json::Value,
    pub error_payload: Option<serde_json::Value>,
    pub finished_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct AppendRunEventInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub event_type: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct CreateCheckpointInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Option<Uuid>,
    pub status: String,
    pub reason: String,
    pub locator_payload: serde_json::Value,
    pub variable_snapshot: serde_json::Value,
    pub external_ref_payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct CreateCallbackTaskInput {
    pub flow_run_id: Uuid,
    pub node_run_id: Uuid,
    pub callback_kind: String,
    pub request_payload: serde_json::Value,
    pub external_ref_payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct CompleteCallbackTaskInput {
    pub callback_task_id: Uuid,
    pub response_payload: serde_json::Value,
    pub completed_at: OffsetDateTime,
}

#[async_trait]
pub trait OrchestrationRuntimeRepository: Send + Sync {
    async fn upsert_compiled_plan(
        &self,
        input: &UpsertCompiledPlanInput,
    ) -> anyhow::Result<domain::CompiledPlanRecord>;
    async fn get_compiled_plan(
        &self,
        compiled_plan_id: Uuid,
    ) -> anyhow::Result<Option<domain::CompiledPlanRecord>>;
    async fn create_flow_run(
        &self,
        input: &CreateFlowRunInput,
    ) -> anyhow::Result<domain::FlowRunRecord>;
    async fn get_flow_run(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> anyhow::Result<Option<domain::FlowRunRecord>>;
    async fn create_node_run(
        &self,
        input: &CreateNodeRunInput,
    ) -> anyhow::Result<domain::NodeRunRecord>;
    async fn update_node_run(
        &self,
        input: &UpdateNodeRunInput,
    ) -> anyhow::Result<domain::NodeRunRecord>;
    async fn complete_node_run(
        &self,
        input: &CompleteNodeRunInput,
    ) -> anyhow::Result<domain::NodeRunRecord>;
    async fn update_flow_run(
        &self,
        input: &UpdateFlowRunInput,
    ) -> anyhow::Result<domain::FlowRunRecord>;
    async fn complete_flow_run(
        &self,
        input: &CompleteFlowRunInput,
    ) -> anyhow::Result<domain::FlowRunRecord>;
    async fn get_checkpoint(
        &self,
        flow_run_id: Uuid,
        checkpoint_id: Uuid,
    ) -> anyhow::Result<Option<domain::CheckpointRecord>>;
    async fn create_checkpoint(
        &self,
        input: &CreateCheckpointInput,
    ) -> anyhow::Result<domain::CheckpointRecord>;
    async fn create_callback_task(
        &self,
        input: &CreateCallbackTaskInput,
    ) -> anyhow::Result<domain::CallbackTaskRecord>;
    async fn complete_callback_task(
        &self,
        input: &CompleteCallbackTaskInput,
    ) -> anyhow::Result<domain::CallbackTaskRecord>;
    async fn append_run_event(
        &self,
        input: &AppendRunEventInput,
    ) -> anyhow::Result<domain::RunEventRecord>;
    async fn list_application_runs(
        &self,
        application_id: Uuid,
    ) -> anyhow::Result<Vec<domain::ApplicationRunSummary>>;
    async fn get_application_run_detail(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> anyhow::Result<Option<domain::ApplicationRunDetail>>;
    async fn get_latest_node_run(
        &self,
        application_id: Uuid,
        node_id: &str,
    ) -> anyhow::Result<Option<domain::NodeLastRun>>;
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

#[derive(Debug, Clone)]
pub struct UpsertPluginInstallationInput {
    pub installation_id: Uuid,
    pub provider_code: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub contract_version: String,
    pub protocol: String,
    pub display_name: String,
    pub source_kind: String,
    pub verification_status: domain::PluginVerificationStatus,
    pub enabled: bool,
    pub install_path: String,
    pub checksum: Option<String>,
    pub signature_status: Option<String>,
    pub metadata_json: serde_json::Value,
    pub actor_user_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct CreatePluginAssignmentInput {
    pub installation_id: Uuid,
    pub workspace_id: Uuid,
    pub actor_user_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct CreatePluginTaskInput {
    pub task_id: Uuid,
    pub installation_id: Option<Uuid>,
    pub workspace_id: Option<Uuid>,
    pub provider_code: String,
    pub task_kind: domain::PluginTaskKind,
    pub status: domain::PluginTaskStatus,
    pub status_message: Option<String>,
    pub detail_json: serde_json::Value,
    pub actor_user_id: Option<Uuid>,
}

#[derive(Debug, Clone)]
pub struct UpdatePluginTaskStatusInput {
    pub task_id: Uuid,
    pub status: domain::PluginTaskStatus,
    pub status_message: Option<String>,
    pub detail_json: serde_json::Value,
}

#[async_trait]
pub trait PluginRepository: Send + Sync {
    async fn upsert_installation(
        &self,
        input: &UpsertPluginInstallationInput,
    ) -> anyhow::Result<domain::PluginInstallationRecord>;
    async fn get_installation(
        &self,
        installation_id: Uuid,
    ) -> anyhow::Result<Option<domain::PluginInstallationRecord>>;
    async fn list_installations(&self) -> anyhow::Result<Vec<domain::PluginInstallationRecord>>;
    async fn create_assignment(
        &self,
        input: &CreatePluginAssignmentInput,
    ) -> anyhow::Result<domain::PluginAssignmentRecord>;
    async fn list_assignments(
        &self,
        workspace_id: Uuid,
    ) -> anyhow::Result<Vec<domain::PluginAssignmentRecord>>;
    async fn create_task(
        &self,
        input: &CreatePluginTaskInput,
    ) -> anyhow::Result<domain::PluginTaskRecord>;
    async fn update_task_status(
        &self,
        input: &UpdatePluginTaskStatusInput,
    ) -> anyhow::Result<domain::PluginTaskRecord>;
}

#[derive(Debug, Clone)]
pub struct CreateModelProviderInstanceInput {
    pub instance_id: Uuid,
    pub workspace_id: Uuid,
    pub installation_id: Uuid,
    pub provider_code: String,
    pub protocol: String,
    pub display_name: String,
    pub status: domain::ModelProviderInstanceStatus,
    pub config_json: serde_json::Value,
    pub last_validation_status: Option<domain::ModelProviderValidationStatus>,
    pub last_validation_message: Option<String>,
    pub created_by: Uuid,
}

#[derive(Debug, Clone)]
pub struct UpdateModelProviderInstanceInput {
    pub instance_id: Uuid,
    pub workspace_id: Uuid,
    pub display_name: String,
    pub status: domain::ModelProviderInstanceStatus,
    pub config_json: serde_json::Value,
    pub last_validated_at: Option<OffsetDateTime>,
    pub last_validation_status: Option<domain::ModelProviderValidationStatus>,
    pub last_validation_message: Option<String>,
    pub updated_by: Uuid,
}

#[derive(Debug, Clone)]
pub struct UpsertModelProviderCatalogCacheInput {
    pub provider_instance_id: Uuid,
    pub model_discovery_mode: domain::ModelProviderDiscoveryMode,
    pub refresh_status: domain::ModelProviderCatalogRefreshStatus,
    pub source: domain::ModelProviderCatalogSource,
    pub models_json: serde_json::Value,
    pub last_error_message: Option<String>,
    pub refreshed_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct UpsertModelProviderSecretInput {
    pub provider_instance_id: Uuid,
    pub plaintext_secret_json: serde_json::Value,
    pub secret_version: i32,
    pub master_key: String,
}

#[async_trait]
pub trait ModelProviderRepository: Send + Sync {
    async fn create_instance(
        &self,
        input: &CreateModelProviderInstanceInput,
    ) -> anyhow::Result<domain::ModelProviderInstanceRecord>;
    async fn update_instance(
        &self,
        input: &UpdateModelProviderInstanceInput,
    ) -> anyhow::Result<domain::ModelProviderInstanceRecord>;
    async fn get_instance(
        &self,
        workspace_id: Uuid,
        instance_id: Uuid,
    ) -> anyhow::Result<Option<domain::ModelProviderInstanceRecord>>;
    async fn list_instances(
        &self,
        workspace_id: Uuid,
    ) -> anyhow::Result<Vec<domain::ModelProviderInstanceRecord>>;
    async fn upsert_catalog_cache(
        &self,
        input: &UpsertModelProviderCatalogCacheInput,
    ) -> anyhow::Result<domain::ModelProviderCatalogCacheRecord>;
    async fn get_catalog_cache(
        &self,
        provider_instance_id: Uuid,
    ) -> anyhow::Result<Option<domain::ModelProviderCatalogCacheRecord>>;
    async fn upsert_secret(
        &self,
        input: &UpsertModelProviderSecretInput,
    ) -> anyhow::Result<domain::ModelProviderSecretRecord>;
    async fn get_secret_json(
        &self,
        provider_instance_id: Uuid,
        master_key: &str,
    ) -> anyhow::Result<Option<serde_json::Value>>;
}
