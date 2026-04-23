use super::*;
use plugin_framework::data_source_contract::{
    DataSourcePreviewReadInput, DataSourcePreviewReadOutput,
};

#[async_trait]
pub trait RuntimeRegistrySync: Send + Sync {
    async fn rebuild(&self) -> anyhow::Result<()>;
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

#[derive(Debug, Clone, PartialEq)]
pub struct ProviderRuntimeInvocationOutput {
    pub events: Vec<ProviderStreamEvent>,
    pub result: ProviderInvocationResult,
}

#[async_trait]
pub trait ProviderRuntimePort: Send + Sync {
    async fn ensure_loaded(
        &self,
        installation: &domain::PluginInstallationRecord,
    ) -> anyhow::Result<()>;
    async fn validate_provider(
        &self,
        installation: &domain::PluginInstallationRecord,
        provider_config: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value>;
    async fn list_models(
        &self,
        installation: &domain::PluginInstallationRecord,
        provider_config: serde_json::Value,
    ) -> anyhow::Result<Vec<ProviderModelDescriptor>>;
    async fn invoke_stream(
        &self,
        installation: &domain::PluginInstallationRecord,
        input: ProviderInvocationInput,
    ) -> anyhow::Result<ProviderRuntimeInvocationOutput>;
}

#[async_trait]
pub trait DataSourceRuntimePort: Send + Sync {
    async fn ensure_loaded(
        &self,
        installation: &domain::PluginInstallationRecord,
    ) -> anyhow::Result<()>;
    async fn validate_config(
        &self,
        installation: &domain::PluginInstallationRecord,
        config_json: serde_json::Value,
        secret_json: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value>;
    async fn test_connection(
        &self,
        installation: &domain::PluginInstallationRecord,
        config_json: serde_json::Value,
        secret_json: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value>;
    async fn discover_catalog(
        &self,
        installation: &domain::PluginInstallationRecord,
        config_json: serde_json::Value,
        secret_json: serde_json::Value,
    ) -> anyhow::Result<serde_json::Value>;
    async fn preview_read(
        &self,
        installation: &domain::PluginInstallationRecord,
        input: DataSourcePreviewReadInput,
    ) -> anyhow::Result<DataSourcePreviewReadOutput>;
}
