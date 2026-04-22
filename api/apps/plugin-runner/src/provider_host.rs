use std::collections::{BTreeMap, HashMap};

use plugin_framework::{
    error::{FrameworkResult, PluginFrameworkError},
    provider_contract::{
        ModelDiscoveryMode, ProviderInvocationInput, ProviderInvocationResult,
        ProviderModelDescriptor, ProviderStdioMethod, ProviderStdioRequest, ProviderStreamEvent,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::package_loader::{LoadedProviderPackage, PackageLoader};
use crate::stdio_runtime::call_executable;

#[derive(Debug, Clone, Serialize)]
pub struct LoadedProviderSummary {
    pub plugin_id: String,
    pub provider_code: String,
    pub plugin_version: String,
    pub protocol: String,
    pub model_discovery_mode: ModelDiscoveryMode,
}

impl LoadedProviderSummary {
    fn from_loaded(loaded: &LoadedProviderPackage) -> Self {
        Self {
            plugin_id: loaded.package.identifier(),
            provider_code: loaded.package.provider.provider_code.clone(),
            plugin_version: loaded.package.manifest.version.clone(),
            protocol: loaded.package.provider.protocol.clone(),
            model_discovery_mode: loaded.package.provider.model_discovery_mode,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderValidationOutput {
    pub output: Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderModelsOutput {
    pub models: Vec<ProviderModelDescriptor>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderInvokeStreamOutput {
    pub events: Vec<ProviderStreamEvent>,
    pub result: ProviderInvocationResult,
}

#[derive(Debug, Default)]
pub struct ProviderHost {
    loaded_packages: HashMap<String, LoadedProviderPackage>,
}

impl ProviderHost {
    pub fn load(&mut self, package_root: &str) -> FrameworkResult<LoadedProviderSummary> {
        let loaded = PackageLoader::load(package_root)?;
        let summary = LoadedProviderSummary::from_loaded(&loaded);
        self.loaded_packages
            .insert(summary.plugin_id.clone(), loaded);
        Ok(summary)
    }

    pub fn reload(&mut self, plugin_id: &str) -> FrameworkResult<LoadedProviderSummary> {
        let package_root = self
            .loaded_packages
            .get(plugin_id)
            .ok_or_else(|| {
                PluginFrameworkError::invalid_provider_package(format!(
                    "provider package is not loaded: {plugin_id}"
                ))
            })?
            .package_root
            .clone();
        let loaded = PackageLoader::load(&package_root)?;
        let summary = LoadedProviderSummary::from_loaded(&loaded);
        self.loaded_packages.remove(plugin_id);
        self.loaded_packages
            .insert(summary.plugin_id.clone(), loaded);
        Ok(summary)
    }

    pub async fn validate(
        &self,
        plugin_id: &str,
        provider_config: Value,
    ) -> FrameworkResult<ProviderValidationOutput> {
        let loaded = self.loaded_package(plugin_id)?;
        let output = self
            .call_runtime(loaded, ProviderStdioMethod::Validate, provider_config)
            .await?;
        Ok(ProviderValidationOutput { output })
    }

    pub async fn list_models(
        &self,
        plugin_id: &str,
        provider_config: Value,
    ) -> FrameworkResult<ProviderModelsOutput> {
        let loaded = self.loaded_package(plugin_id)?;
        let models = match loaded.package.provider.model_discovery_mode {
            ModelDiscoveryMode::Static => loaded.package.predefined_models.clone(),
            ModelDiscoveryMode::Dynamic => {
                let dynamic = self
                    .call_runtime(loaded, ProviderStdioMethod::ListModels, provider_config)
                    .await?;
                normalize_models(dynamic)?
            }
            ModelDiscoveryMode::Hybrid => {
                let dynamic = self
                    .call_runtime(loaded, ProviderStdioMethod::ListModels, provider_config)
                    .await?;
                merge_models(
                    &loaded.package.predefined_models,
                    normalize_models(dynamic)?,
                )
            }
        };
        Ok(ProviderModelsOutput { models })
    }

    pub async fn invoke_stream(
        &self,
        plugin_id: &str,
        input: ProviderInvocationInput,
    ) -> FrameworkResult<ProviderInvokeStreamOutput> {
        let loaded = self.loaded_package(plugin_id)?;
        let output = self
            .call_runtime(
                loaded,
                ProviderStdioMethod::Invoke,
                serde_json::to_value(input).unwrap(),
            )
            .await?;
        normalize_invoke_output(output)
    }

    fn loaded_package(&self, plugin_id: &str) -> FrameworkResult<&LoadedProviderPackage> {
        self.loaded_packages.get(plugin_id).ok_or_else(|| {
            PluginFrameworkError::invalid_provider_package(format!(
                "provider package is not loaded: {plugin_id}"
            ))
        })
    }

    async fn call_runtime(
        &self,
        loaded: &LoadedProviderPackage,
        method: ProviderStdioMethod,
        input: Value,
    ) -> FrameworkResult<Value> {
        let request = ProviderStdioRequest { method, input };
        call_executable(
            &loaded.runtime_executable,
            &request,
            &loaded.package.manifest.runtime.limits,
        )
        .await
    }
}

#[derive(Debug, Deserialize)]
struct RuntimeInvocationEnvelope {
    events: Vec<ProviderStreamEvent>,
    result: ProviderInvocationResult,
}

fn normalize_models(raw: Value) -> FrameworkResult<Vec<ProviderModelDescriptor>> {
    serde_json::from_value(raw)
        .map_err(|error| PluginFrameworkError::invalid_provider_contract(error.to_string()))
}

fn merge_models(
    static_models: &[ProviderModelDescriptor],
    dynamic_models: Vec<ProviderModelDescriptor>,
) -> Vec<ProviderModelDescriptor> {
    let mut merged = BTreeMap::new();
    for model in static_models {
        merged.insert(model.model_id.clone(), model.clone());
    }
    for model in dynamic_models {
        merged.insert(model.model_id.clone(), model);
    }
    merged.into_values().collect()
}

fn normalize_invoke_output(raw: Value) -> FrameworkResult<ProviderInvokeStreamOutput> {
    let envelope: RuntimeInvocationEnvelope = serde_json::from_value(raw)
        .map_err(|error| PluginFrameworkError::invalid_provider_contract(error.to_string()))?;
    Ok(ProviderInvokeStreamOutput {
        events: envelope.events,
        result: envelope.result,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalize_models_accepts_current_provider_descriptor_shape() {
        let models = normalize_models(json!([{
            "model_id": "gpt-4o-mini",
            "display_name": "GPT-4o mini",
            "source": "dynamic",
            "supports_streaming": true,
            "supports_tool_call": false,
            "supports_multimodal": false,
            "context_window": null,
            "max_output_tokens": null,
            "parameter_form": null,
            "provider_metadata": {}
        }]))
        .expect("current provider descriptor shape should stay supported");

        assert_eq!(models.len(), 1);
        assert_eq!(models[0].model_id, "gpt-4o-mini");
    }

    #[test]
    fn normalize_models_rejects_legacy_provider_descriptor_shape() {
        assert!(
            normalize_models(json!([{
                "code": "gpt-4o-mini",
                "label": "GPT-4o mini",
                "family": "llm",
                "mode": "chat"
            }]))
            .is_err(),
            "legacy code/label model descriptors should be rejected once current contract is the only supported shape"
        );
    }
}
