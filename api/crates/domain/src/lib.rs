extern crate self as domain;

pub mod application;
pub mod audit;
pub mod auth;
pub mod base;
pub mod flow;
pub mod model_provider;
pub mod modeling;
pub mod node_contribution;
pub mod orchestration;
pub mod plugin_worker;
pub mod resource;
pub mod scope;

pub use application::{
    ApplicationApiSection, ApplicationLogsSection, ApplicationMonitoringSection,
    ApplicationOrchestrationSection, ApplicationRecord, ApplicationSections, ApplicationTag,
    ApplicationTagCatalogEntry, ApplicationType,
};
pub use audit::AuditLogRecord;
pub use auth::{
    ActorContext, AuthenticatorRecord, BoundRole, PermissionDefinition, RoleScopeKind,
    RoleTemplate, SessionRecord, UserAuthIdentity, UserRecord, UserStatus,
};
pub use base::BaseFields;
pub use flow::{
    default_flow_document, FlowChangeKind, FlowDraftRecord, FlowEditorState, FlowRecord,
    FlowVersionRecord, FlowVersionTrigger, FLOW_AUTOSAVE_INTERVAL_SECONDS, FLOW_HISTORY_LIMIT,
    FLOW_SCHEMA_VERSION,
};
pub use model_provider::{
    ModelProviderCatalogCacheRecord, ModelProviderCatalogRefreshStatus,
    ModelProviderCatalogSource, ModelProviderConfiguredModel, ModelProviderDiscoveryMode,
    ModelProviderInstanceRecord, ModelProviderInstanceStatus, ModelProviderPreviewSessionRecord,
    ModelProviderSecretRecord, ModelProviderValidationStatus,
    PluginArtifactStatus, PluginAssignmentRecord, PluginAvailabilityStatus, PluginDesiredState,
    PluginInstallationRecord, PluginRuntimeStatus, PluginTaskKind, PluginTaskRecord,
    PluginTaskStatus, PluginVerificationStatus,
};
pub use modeling::{
    DataModelScopeKind, MetadataAvailabilityStatus, ModelDefinitionRecord, ModelFieldKind,
    ModelFieldRecord,
};
pub use node_contribution::{NodeContributionDependencyStatus, NodeContributionRegistryEntry};
pub use orchestration::{
    ApplicationRunDetail, ApplicationRunSummary, CallbackTaskRecord, CallbackTaskStatus,
    CheckpointRecord, CompiledPlanRecord, FlowRunMode, FlowRunRecord, FlowRunStatus,
    NodeDebugPreviewResult, NodeLastRun, NodeRunRecord, NodeRunStatus, RunEventRecord,
};
pub use plugin_worker::{PluginWorkerLeaseRecord, PluginWorkerStatus};
pub use resource::runtime_model_resource_code;
pub use scope::{ScopeContext, TenantRecord, WorkspaceRecord, SYSTEM_SCOPE_ID};

pub fn crate_name() -> &'static str {
    "domain"
}

#[cfg(test)]
mod _tests;
