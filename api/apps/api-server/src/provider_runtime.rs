use std::sync::Arc;

use async_trait::async_trait;
use control_plane::{
    capability_plugin_runtime::{
        CapabilityExecutionOutput, CapabilityPluginRuntimePort, ExecuteCapabilityNodeInput,
        ResolveCapabilityOptionsInput, ResolveCapabilityOutputSchemaInput,
        ValidateCapabilityConfigInput,
    },
    errors::ControlPlaneError,
    ports::{DataSourceRuntimePort, ProviderRuntimeInvocationOutput, ProviderRuntimePort},
};
use plugin_framework::{
    data_source_contract::{
        DataSourceConfigInput, DataSourcePreviewReadInput, DataSourcePreviewReadOutput,
    },
    error::PluginFrameworkError,
    provider_contract::{ProviderInvocationInput, ProviderModelDescriptor},
};
use plugin_runner::{
    capability_host::CapabilityHost, data_source_host::DataSourceHost, provider_host::ProviderHost,
};
use serde_json::Value;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct ApiRuntimeServices {
    provider_host: Arc<RwLock<ProviderHost>>,
    capability_host: Arc<RwLock<CapabilityHost>>,
    data_source_host: Arc<RwLock<DataSourceHost>>,
}

impl ApiRuntimeServices {
    pub fn new(
        provider_host: Arc<RwLock<ProviderHost>>,
        capability_host: Arc<RwLock<CapabilityHost>>,
        data_source_host: Arc<RwLock<DataSourceHost>>,
    ) -> Self {
        Self {
            provider_host,
            capability_host,
            data_source_host,
        }
    }
}

#[derive(Clone)]
pub struct ApiProviderRuntime {
    services: Arc<ApiRuntimeServices>,
}

impl ApiProviderRuntime {
    pub fn new(services: Arc<ApiRuntimeServices>) -> Self {
        Self { services }
    }
}

#[async_trait]
impl ProviderRuntimePort for ApiProviderRuntime {
    async fn ensure_loaded(
        &self,
        installation: &domain::PluginInstallationRecord,
    ) -> anyhow::Result<()> {
        let mut host = self.services.provider_host.write().await;
        match host.reload(&installation.plugin_id) {
            Ok(_) => Ok(()),
            Err(_) => host
                .load(&installation.installed_path)
                .map(|_| ())
                .map_err(|error| map_framework_error(error, "provider_runtime")),
        }
    }

    async fn validate_provider(
        &self,
        installation: &domain::PluginInstallationRecord,
        provider_config: Value,
    ) -> anyhow::Result<Value> {
        self.ensure_provider_loaded(installation).await?;
        let host = self.services.provider_host.read().await;
        host.validate(&installation.plugin_id, provider_config)
            .await
            .map(|output| output.output)
            .map_err(|error| map_framework_error(error, "provider_runtime"))
    }

    async fn list_models(
        &self,
        installation: &domain::PluginInstallationRecord,
        provider_config: Value,
    ) -> anyhow::Result<Vec<ProviderModelDescriptor>> {
        self.ensure_provider_loaded(installation).await?;
        let host = self.services.provider_host.read().await;
        host.list_models(&installation.plugin_id, provider_config)
            .await
            .map(|output| output.models)
            .map_err(|error| map_framework_error(error, "provider_runtime"))
    }

    async fn invoke_stream(
        &self,
        installation: &domain::PluginInstallationRecord,
        input: ProviderInvocationInput,
    ) -> anyhow::Result<ProviderRuntimeInvocationOutput> {
        self.ensure_provider_loaded(installation).await?;
        let host = self.services.provider_host.read().await;
        host.invoke_stream(&installation.plugin_id, input)
            .await
            .map(|output| ProviderRuntimeInvocationOutput {
                events: output.events,
                result: output.result,
            })
            .map_err(|error| map_framework_error(error, "provider_runtime"))
    }
}

#[async_trait]
impl DataSourceRuntimePort for ApiProviderRuntime {
    async fn ensure_loaded(
        &self,
        installation: &domain::PluginInstallationRecord,
    ) -> anyhow::Result<()> {
        let mut host = self.services.data_source_host.write().await;
        match host.reload(&installation.plugin_id) {
            Ok(_) => Ok(()),
            Err(_) => host
                .load(&installation.installed_path)
                .map(|_| ())
                .map_err(|error| map_framework_error(error, "data_source_runtime")),
        }
    }

    async fn validate_config(
        &self,
        installation: &domain::PluginInstallationRecord,
        config_json: Value,
        secret_json: Value,
    ) -> anyhow::Result<Value> {
        self.ensure_data_source_loaded(installation).await?;
        let host = self.services.data_source_host.read().await;
        host.validate_config(
            &installation.plugin_id,
            DataSourceConfigInput {
                config_json,
                secret_json,
            },
        )
        .await
        .map(|output| output.output)
        .map_err(|error| map_framework_error(error, "data_source_runtime"))
    }

    async fn test_connection(
        &self,
        installation: &domain::PluginInstallationRecord,
        config_json: Value,
        secret_json: Value,
    ) -> anyhow::Result<Value> {
        self.ensure_data_source_loaded(installation).await?;
        let host = self.services.data_source_host.read().await;
        host.test_connection(
            &installation.plugin_id,
            DataSourceConfigInput {
                config_json,
                secret_json,
            },
        )
        .await
        .map(|output| output.output)
        .map_err(|error| map_framework_error(error, "data_source_runtime"))
    }

    async fn discover_catalog(
        &self,
        installation: &domain::PluginInstallationRecord,
        config_json: Value,
        secret_json: Value,
    ) -> anyhow::Result<Value> {
        self.ensure_data_source_loaded(installation).await?;
        let host = self.services.data_source_host.read().await;
        let output = host
            .discover_catalog(
                &installation.plugin_id,
                DataSourceConfigInput {
                    config_json,
                    secret_json,
                },
            )
            .await
            .map_err(|error| map_framework_error(error, "data_source_runtime"))?;
        Ok(serde_json::to_value(output.entries)?)
    }

    async fn preview_read(
        &self,
        installation: &domain::PluginInstallationRecord,
        input: DataSourcePreviewReadInput,
    ) -> anyhow::Result<DataSourcePreviewReadOutput> {
        self.ensure_data_source_loaded(installation).await?;
        let host = self.services.data_source_host.read().await;
        host.preview_read(&installation.plugin_id, input)
            .await
            .map_err(|error| map_framework_error(error, "data_source_runtime"))
    }
}

#[async_trait]
impl CapabilityPluginRuntimePort for ApiProviderRuntime {
    async fn validate_config(&self, input: ValidateCapabilityConfigInput) -> anyhow::Result<Value> {
        self.ensure_capability_loaded(&input.installation).await?;
        let host = self.services.capability_host.read().await;
        host.validate_config(
            &input.installation.plugin_id,
            &input.contribution_code,
            input.config_payload,
        )
        .await
        .map(|output| output.output)
        .map_err(|error| map_framework_error(error, "capability_runtime"))
    }

    async fn resolve_dynamic_options(
        &self,
        input: ResolveCapabilityOptionsInput,
    ) -> anyhow::Result<Value> {
        self.ensure_capability_loaded(&input.installation).await?;
        let host = self.services.capability_host.read().await;
        host.resolve_dynamic_options(
            &input.installation.plugin_id,
            &input.contribution_code,
            input.config_payload,
        )
        .await
        .map(|output| output.output)
        .map_err(|error| map_framework_error(error, "capability_runtime"))
    }

    async fn resolve_output_schema(
        &self,
        input: ResolveCapabilityOutputSchemaInput,
    ) -> anyhow::Result<Value> {
        self.ensure_capability_loaded(&input.installation).await?;
        let host = self.services.capability_host.read().await;
        host.resolve_output_schema(
            &input.installation.plugin_id,
            &input.contribution_code,
            input.config_payload,
        )
        .await
        .map(|output| output.output)
        .map_err(|error| map_framework_error(error, "capability_runtime"))
    }

    async fn execute_node(
        &self,
        input: ExecuteCapabilityNodeInput,
    ) -> anyhow::Result<CapabilityExecutionOutput> {
        self.ensure_capability_loaded(&input.installation).await?;
        let host = self.services.capability_host.read().await;
        host.execute(
            &input.installation.plugin_id,
            &input.contribution_code,
            input.config_payload,
            input.input_payload,
        )
        .await
        .map(|output| CapabilityExecutionOutput {
            output_payload: output.output_payload,
        })
        .map_err(|error| map_framework_error(error, "capability_runtime"))
    }
}

impl ApiProviderRuntime {
    async fn ensure_provider_loaded(
        &self,
        installation: &domain::PluginInstallationRecord,
    ) -> anyhow::Result<()> {
        let mut host = self.services.provider_host.write().await;
        match host.reload(&installation.plugin_id) {
            Ok(_) => Ok(()),
            Err(_) => host
                .load(&installation.installed_path)
                .map(|_| ())
                .map_err(|error| map_framework_error(error, "provider_runtime")),
        }
    }

    async fn ensure_capability_loaded(
        &self,
        installation: &domain::PluginInstallationRecord,
    ) -> anyhow::Result<()> {
        let mut host = self.services.capability_host.write().await;
        host.load(&installation.installed_path)
            .map(|_| ())
            .map_err(|error| map_framework_error(error, "capability_runtime"))
    }

    async fn ensure_data_source_loaded(
        &self,
        installation: &domain::PluginInstallationRecord,
    ) -> anyhow::Result<()> {
        let mut host = self.services.data_source_host.write().await;
        match host.reload(&installation.plugin_id) {
            Ok(_) => Ok(()),
            Err(_) => host
                .load(&installation.installed_path)
                .map(|_| ())
                .map_err(|error| map_framework_error(error, "data_source_runtime")),
        }
    }
}

fn map_framework_error(error: PluginFrameworkError, service_name: &'static str) -> anyhow::Error {
    match error {
        PluginFrameworkError::InvalidAssignment { .. }
        | PluginFrameworkError::InvalidProviderPackage { .. }
        | PluginFrameworkError::InvalidProviderContract { .. }
        | PluginFrameworkError::Serialization { .. } => {
            ControlPlaneError::InvalidInput(service_name).into()
        }
        PluginFrameworkError::Io { .. } | PluginFrameworkError::RuntimeContract { .. } => {
            ControlPlaneError::UpstreamUnavailable(service_name).into()
        }
    }
}
