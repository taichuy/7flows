use std::{
    collections::{BTreeMap, HashMap},
    process::Stdio,
};

use plugin_framework::{
    error::{FrameworkResult, PluginFrameworkError},
    provider_contract::{
        ModelDiscoveryMode, ProviderFinishReason, ProviderInvocationInput, ProviderInvocationResult,
        ProviderModelDescriptor, ProviderModelSource, ProviderRuntimeError, ProviderStreamEvent,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tokio::{io::AsyncWriteExt, process::Command};

use crate::package_loader::{LoadedProviderPackage, PackageLoader};

const NODE_BRIDGE_SCRIPT: &str = r#"
const fs = require('node:fs');

async function main() {
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  const runtime = require(payload.entrypoint);
  const method = payload.method;
  if (typeof runtime[method] !== 'function') {
    throw new Error(`provider runtime does not export ${method}`);
  }

  const result = await runtime[method](payload.input);
  process.stdout.write(JSON.stringify({ ok: true, result }));
}

main().catch((error) => {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: {
        message: error?.message || String(error),
        stack: error?.stack || null,
      },
    })
  );
  process.exit(1);
});
"#;

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
            .call_runtime(loaded, "validateProviderCredentials", provider_config)
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
                    .call_runtime(loaded, "listModels", provider_config)
                    .await?;
                normalize_models(dynamic)?
            }
            ModelDiscoveryMode::Hybrid => {
                let dynamic = self
                    .call_runtime(loaded, "listModels", provider_config)
                    .await?;
                merge_models(&loaded.package.predefined_models, normalize_models(dynamic)?)
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
            .call_runtime(loaded, "invoke", serde_json::to_value(input).unwrap())
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
        method: &str,
        input: Value,
    ) -> FrameworkResult<Value> {
        let payload = json!({
            "entrypoint": loaded.runtime_entrypoint,
            "method": method,
            "input": input,
        });

        let mut child = Command::new("node")
            .arg("-e")
            .arg(NODE_BRIDGE_SCRIPT)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| PluginFrameworkError::io(None, error.to_string()))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(payload.to_string().as_bytes())
                .await
                .map_err(|error| PluginFrameworkError::io(None, error.to_string()))?;
        }

        let output = child
            .wait_with_output()
            .await
            .map_err(|error| PluginFrameworkError::io(None, error.to_string()))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(PluginFrameworkError::runtime(ProviderRuntimeError::normalize(
                method,
                if stderr.is_empty() {
                    "provider runtime returned empty output"
                } else {
                    stderr.as_str()
                },
                None,
            )));
        }

        let envelope = serde_json::from_str::<Value>(&stdout)
            .map_err(|error| PluginFrameworkError::serialization(None, error.to_string()))?;

        if envelope.get("ok") == Some(&Value::Bool(true)) {
            return Ok(envelope.get("result").cloned().unwrap_or(Value::Null));
        }

        let error_object = envelope
            .get("error")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let message = error_object
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("provider runtime execution failed");
        let summary = error_object.get("stack").and_then(Value::as_str);
        Err(PluginFrameworkError::runtime(ProviderRuntimeError::normalize(
            method, message, summary,
        )))
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
