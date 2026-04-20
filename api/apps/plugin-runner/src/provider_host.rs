use std::collections::{BTreeMap, HashMap};

use plugin_framework::{
    error::{FrameworkResult, PluginFrameworkError},
    provider_contract::{
        ModelDiscoveryMode, ProviderFinishReason, ProviderInvocationInput,
        ProviderInvocationResult, ProviderModelDescriptor, ProviderModelSource,
        ProviderStdioMethod, ProviderStdioRequest, ProviderStreamEvent,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

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
struct LegacyModelDescriptor {
    code: String,
    label: String,
    family: Option<String>,
    mode: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RuntimeInvocationEnvelope {
    #[serde(default)]
    events: Vec<ProviderStreamEvent>,
    #[serde(default)]
    result: ProviderInvocationResult,
}

#[derive(Debug, Deserialize)]
struct LegacyInvokeOutput {
    output_text: String,
}

fn normalize_models(raw: Value) -> FrameworkResult<Vec<ProviderModelDescriptor>> {
    if raw
        .as_array()
        .and_then(|models| models.first())
        .and_then(|model| model.get("model_id"))
        .is_some()
    {
        return serde_json::from_value(raw)
            .map_err(|error| PluginFrameworkError::invalid_provider_contract(error.to_string()));
    }

    let legacy_models: Vec<LegacyModelDescriptor> = serde_json::from_value(raw)
        .map_err(|error| PluginFrameworkError::invalid_provider_contract(error.to_string()))?;
    Ok(legacy_models
        .into_iter()
        .map(|model| ProviderModelDescriptor {
            model_id: model.code,
            display_name: model.label,
            source: ProviderModelSource::Dynamic,
            supports_streaming: true,
            supports_tool_call: false,
            supports_multimodal: model.mode.as_deref() == Some("multimodal"),
            context_window: None,
            max_output_tokens: None,
            parameter_form: None,
            provider_metadata: legacy_model_metadata(model.family, model.mode),
        })
        .collect())
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

fn legacy_model_metadata(family: Option<String>, mode: Option<String>) -> Value {
    let mut object = Map::new();
    if let Some(family) = family {
        object.insert("family".to_string(), Value::String(family));
    }
    if let Some(mode) = mode {
        object.insert("mode".to_string(), Value::String(mode));
    }
    Value::Object(object)
}

fn normalize_invoke_output(raw: Value) -> FrameworkResult<ProviderInvokeStreamOutput> {
    if raw.get("events").is_some() || raw.get("result").is_some() {
        let envelope: RuntimeInvocationEnvelope = serde_json::from_value(raw)
            .map_err(|error| PluginFrameworkError::invalid_provider_contract(error.to_string()))?;
        return Ok(ProviderInvokeStreamOutput {
            events: envelope.events,
            result: envelope.result,
        });
    }

    let legacy: LegacyInvokeOutput = serde_json::from_value(raw)
        .map_err(|error| PluginFrameworkError::invalid_provider_contract(error.to_string()))?;
    let text_delta = legacy.output_text.clone();
    Ok(ProviderInvokeStreamOutput {
        events: vec![
            ProviderStreamEvent::TextDelta { delta: text_delta },
            ProviderStreamEvent::Finish {
                reason: ProviderFinishReason::Stop,
            },
        ],
        result: ProviderInvocationResult {
            final_content: Some(legacy.output_text),
            finish_reason: Some(ProviderFinishReason::Stop),
            ..ProviderInvocationResult::default()
        },
    })
}
