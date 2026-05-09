extern crate self as domain;

pub mod application;
pub mod audit;
pub mod auth;
pub mod base;
pub mod data_source;
pub mod file_management;
pub mod flow;
pub mod host_extension;
pub mod model_provider;
pub mod modeling;
pub mod node_contribution;
pub mod orchestration;
pub mod plugin_worker;
pub mod resource;
pub mod runtime_observability;
pub mod scope;

pub use application::{
    ApplicationApiSection, ApplicationEnvironmentVariable, ApplicationLogsSection,
    ApplicationMonitoringSection, ApplicationOrchestrationSection, ApplicationRecord,
    ApplicationSections, ApplicationTag, ApplicationTagCatalogEntry, ApplicationType,
};
pub use audit::AuditLogRecord;
pub use auth::{
    ActorContext, ApiKeyDataModelAction, ApiKeyDataModelPermissionRecord, ApiKeyKind, ApiKeyRecord,
    AuthenticatorRecord, BoundRole, PermissionDefinition, RoleScopeKind, RoleTemplate,
    SessionRecord, UserAuthIdentity, UserRecord, UserStatus,
};
pub use base::BaseFields;
pub use data_source::{
    data_source_secret_ref, DataSourceCatalogCacheRecord, DataSourceCatalogRefreshStatus,
    DataSourceDefaults, DataSourceInstanceRecord, DataSourceInstanceStatus,
    DataSourcePreviewSessionRecord, DataSourceSecretRecord,
};
pub use file_management::{
    FileStorageHealthStatus, FileStorageRecord, FileTableRecord, FileTableScopeKind,
};
pub use flow::{
    default_flow_document, FlowChangeKind, FlowDraftRecord, FlowEditorState, FlowRecord,
    FlowVersionRecord, FlowVersionTrigger, FLOW_AUTOSAVE_INTERVAL_SECONDS, FLOW_HISTORY_LIMIT,
    FLOW_SCHEMA_VERSION,
};
pub use host_extension::{
    HostExtensionActivationStatus, HostExtensionInventoryRecord, HostExtensionTrustLevel,
    HostInfrastructureConfigStatus, HostInfrastructureProviderConfigRecord,
};
pub use model_provider::{
    ModelCatalogSyncRunRecord, ModelFailoverQueueItemRecord, ModelFailoverQueueSnapshotRecord,
    ModelFailoverQueueTemplateRecord, ModelProviderCatalogCacheRecord,
    ModelProviderCatalogEntryRecord, ModelProviderCatalogRefreshStatus, ModelProviderCatalogSource,
    ModelProviderCatalogSourceRecord, ModelProviderConfiguredModel, ModelProviderDiscoveryMode,
    ModelProviderInstanceRecord, ModelProviderInstanceStatus, ModelProviderMainInstanceRecord,
    ModelProviderPreviewSessionRecord, ModelProviderSecretRecord, ModelProviderValidationStatus,
    PluginArtifactStatus, PluginAssignmentRecord, PluginAvailabilityStatus, PluginDesiredState,
    PluginInstallationRecord, PluginRuntimeStatus, PluginTaskKind, PluginTaskRecord,
    PluginTaskStatus, PluginVerificationStatus,
};
pub use modeling::{
    ApiExposureReadiness, ApiExposureStatus, DataModelAdvisorFinding, DataModelAdvisorSeverity,
    DataModelOwnerKind, DataModelProtection, DataModelScopeKind, DataModelSourceKind,
    DataModelStatus, ExposureCompatibility, ExternalSourceValidation, MetadataAvailabilityStatus,
    ModelDefinitionRecord, ModelFieldKind, ModelFieldRecord, RuntimeAvailability,
    ScopeDataModelGrantRecord, ScopeDataModelPermissionProfile,
};
pub use node_contribution::{NodeContributionDependencyStatus, NodeContributionRegistryEntry};
pub use orchestration::{
    ApplicationRunDetail, ApplicationRunSummary, CallbackTaskRecord, CallbackTaskStatus,
    CheckpointRecord, CompiledPlanRecord, DataModelSideEffectReceiptRecord, FlowRunMode,
    FlowRunRecord, FlowRunStatus, NodeDebugPreviewResult, NodeLastRun, NodeRunRecord,
    NodeRunStatus, RunEventRecord, RuntimeDebugArtifactRecord,
};
pub use plugin_worker::{PluginWorkerLeaseRecord, PluginWorkerStatus};
pub use resource::runtime_model_resource_code;
pub use runtime_observability::{
    AuditHashRecord, BillingSessionRecord, BillingSessionStatus, CapabilityInvocationRecord,
    ContextProjectionRecord, CostLedgerRecord, CreditLedgerRecord,
    ModelFailoverAttemptLedgerRecord, RuntimeEventDurability, RuntimeEventLayer,
    RuntimeEventRecord, RuntimeEventSource, RuntimeEventVisibility, RuntimeItemKind,
    RuntimeItemRecord, RuntimeItemStatus, RuntimeSpanKind, RuntimeSpanRecord, RuntimeSpanStatus,
    RuntimeTrustLevel, UsageLedgerRecord, UsageLedgerStatus,
};
pub use scope::{ScopeContext, TenantRecord, WorkspaceRecord, DEFAULT_SCOPE_ID, SYSTEM_SCOPE_ID};

pub fn crate_name() -> &'static str {
    "domain"
}

#[cfg(test)]
mod _tests;
