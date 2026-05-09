use super::*;

use crate::application_public_api::mapping::ApplicationApiMappingConfig;

#[derive(Debug, Clone)]
pub struct ReplaceApplicationApiMappingInput {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub mapping: ApplicationApiMappingConfig,
}

#[derive(Debug, Clone)]
pub struct CreateApplicationPublicationVersionInput {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub mapping_snapshot: ApplicationApiMappingConfig,
    pub api_enabled: bool,
    pub compiled_plan_id: Uuid,
    pub flow_id: Uuid,
    pub flow_version_id: Uuid,
    pub flow_schema_version: String,
    pub document_hash: String,
    pub document_snapshot: serde_json::Value,
    pub runtime_profile_snapshot: serde_json::Value,
    pub output_selector: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct SetApplicationApiEnabledInput {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub api_enabled: bool,
}

#[async_trait]
pub trait ApplicationApiMappingRepository: Send + Sync {
    async fn get_application_api_mapping(
        &self,
        application_id: Uuid,
    ) -> anyhow::Result<Option<ApplicationApiMappingConfig>>;

    async fn replace_application_api_mapping(
        &self,
        input: &ReplaceApplicationApiMappingInput,
    ) -> anyhow::Result<ApplicationApiMappingConfig>;
}

#[async_trait]
pub trait ApplicationCompiledPlanRepository: Send + Sync {
    async fn upsert_application_compiled_plan(
        &self,
        input: &UpsertCompiledPlanInput,
    ) -> anyhow::Result<domain::CompiledPlanRecord>;

    async fn get_application_compiled_plan(
        &self,
        compiled_plan_id: Uuid,
    ) -> anyhow::Result<Option<domain::CompiledPlanRecord>>;
}

#[async_trait]
pub trait ApplicationCompileContextRepository: Send + Sync {
    async fn build_application_compile_context(
        &self,
        workspace_id: Uuid,
    ) -> anyhow::Result<orchestration_runtime::compiler::FlowCompileContext>;
}

#[async_trait]
impl<T> ApplicationCompileContextRepository for T
where
    T: ModelProviderRepository + NodeContributionRepository + PluginRepository + Send + Sync,
{
    async fn build_application_compile_context(
        &self,
        workspace_id: Uuid,
    ) -> anyhow::Result<orchestration_runtime::compiler::FlowCompileContext> {
        crate::orchestration_runtime::compile_context::build_compile_context(self, workspace_id)
            .await
    }
}

#[async_trait]
impl<T> ApplicationCompiledPlanRepository for T
where
    T: OrchestrationRuntimeRepository + Send + Sync,
{
    async fn upsert_application_compiled_plan(
        &self,
        input: &UpsertCompiledPlanInput,
    ) -> anyhow::Result<domain::CompiledPlanRecord> {
        OrchestrationRuntimeRepository::upsert_compiled_plan(self, input).await
    }

    async fn get_application_compiled_plan(
        &self,
        compiled_plan_id: Uuid,
    ) -> anyhow::Result<Option<domain::CompiledPlanRecord>> {
        OrchestrationRuntimeRepository::get_compiled_plan(self, compiled_plan_id).await
    }
}

#[async_trait]
pub trait ApplicationPublicationRepository: Send + Sync {
    async fn create_active_application_publication_version(
        &self,
        input: &CreateApplicationPublicationVersionInput,
    ) -> anyhow::Result<
        crate::application_public_api::publications::ApplicationPublicationVersionRecord,
    >;

    async fn get_application_publication_version(
        &self,
        publication_id: Uuid,
    ) -> anyhow::Result<
        Option<crate::application_public_api::publications::ApplicationPublicationVersionRecord>,
    >;

    async fn list_application_publication_versions(
        &self,
        application_id: Uuid,
    ) -> anyhow::Result<
        Vec<crate::application_public_api::publications::ApplicationPublicationVersionRecord>,
    >;

    async fn load_active_application_publication(
        &self,
        application_id: Uuid,
    ) -> anyhow::Result<
        Option<crate::application_public_api::publications::ApplicationPublicationVersionRecord>,
    >;

    async fn set_application_api_enabled(
        &self,
        input: &SetApplicationApiEnabledInput,
    ) -> anyhow::Result<()>;
}
