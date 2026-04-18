use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::{Path, PathBuf},
};

use serde::Deserialize;
use serde_json::Value;

use crate::{
    error::{FrameworkResult, PluginFrameworkError},
    provider_contract::{ModelDiscoveryMode, ProviderModelDescriptor, ProviderModelSource},
};

pub const DEFAULT_PROVIDER_LOCALE: &str = "en_US";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ProviderRunnerSpec {
    pub language: String,
    pub entrypoint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ProviderManifest {
    pub plugin_code: String,
    pub display_name: String,
    pub version: String,
    pub contract_version: String,
    #[serde(default)]
    pub supported_model_types: Vec<String>,
    pub runner: ProviderRunnerSpec,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ProviderConfigField {
    pub key: String,
    #[serde(rename = "type")]
    pub field_type: String,
    #[serde(default)]
    pub required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderDefinition {
    pub provider_code: String,
    pub display_name: String,
    pub protocol: String,
    pub help_url: Option<String>,
    pub default_base_url: Option<String>,
    pub model_discovery_mode: ModelDiscoveryMode,
    pub supports_model_fetch_without_credentials: bool,
    pub form_schema: Vec<ProviderConfigField>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProviderI18nCatalog {
    pub default_locale: String,
    pub bundles: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProviderPackage {
    pub root: PathBuf,
    pub manifest: ProviderManifest,
    pub provider: ProviderDefinition,
    pub predefined_models: Vec<ProviderModelDescriptor>,
    pub i18n: ProviderI18nCatalog,
}

impl ProviderPackage {
    pub fn load_from_dir(path: impl AsRef<Path>) -> FrameworkResult<Self> {
        let root = path.as_ref().to_path_buf();
        if !root.is_dir() {
            return Err(PluginFrameworkError::invalid_provider_package(format!(
                "provider package root must be a directory: {}",
                root.display()
            )));
        }

        let manifest_path = root.join("manifest.yaml");
        let manifest: ProviderManifest = load_yaml(&manifest_path)?;
        validate_manifest(&manifest)?;

        let entrypoint_path = root.join(&manifest.runner.entrypoint);
        if !entrypoint_path.is_file() {
            return Err(PluginFrameworkError::invalid_provider_package(format!(
                "runner entrypoint does not exist: {}",
                entrypoint_path.display()
            )));
        }

        let provider_path = root
            .join("provider")
            .join(format!("{}.yaml", manifest.plugin_code));
        let raw_provider: RawProviderDefinition = load_yaml(&provider_path)?;
        if raw_provider.provider_code != manifest.plugin_code {
            return Err(PluginFrameworkError::invalid_provider_package(format!(
                "provider_code {} does not match plugin_code {}",
                raw_provider.provider_code, manifest.plugin_code
            )));
        }

        let provider = ProviderDefinition {
            provider_code: raw_provider.provider_code.clone(),
            display_name: raw_provider.display_name.unwrap_or_else(|| manifest.display_name.clone()),
            protocol: raw_provider
                .protocol
                .unwrap_or_else(|| raw_provider.provider_code.clone()),
            help_url: raw_provider.help_url,
            default_base_url: raw_provider.default_base_url,
            model_discovery_mode: ModelDiscoveryMode::try_from(raw_provider.model_discovery)?,
            supports_model_fetch_without_credentials: raw_provider
                .supports_model_fetch_without_credentials,
            form_schema: raw_provider.config_schema,
        };

        let i18n = load_i18n_catalog(&root.join("i18n"))?;
        let predefined_models = load_predefined_models(&root.join("models").join("llm"))?;

        Ok(Self {
            root,
            manifest,
            provider,
            predefined_models,
            i18n,
        })
    }

    pub fn identifier(&self) -> String {
        format!("{}@{}", self.manifest.plugin_code, self.manifest.version)
    }

    pub fn resolve_i18n_value(&self, locale: Option<&str>, key: &str) -> Option<String> {
        if let Some(locale) = locale {
            if let Some(bundle) = self.i18n.bundles.get(locale) {
                if let Some(value) = resolve_nested_string(bundle, key) {
                    return Some(value);
                }
            }
        }

        self.i18n
            .bundles
            .get(&self.i18n.default_locale)
            .and_then(|bundle| resolve_nested_string(bundle, key))
    }
}

#[derive(Debug, Deserialize)]
struct RawProviderDefinition {
    provider_code: String,
    display_name: Option<String>,
    protocol: Option<String>,
    help_url: Option<String>,
    default_base_url: Option<String>,
    model_discovery: String,
    #[serde(default)]
    supports_model_fetch_without_credentials: bool,
    #[serde(default)]
    config_schema: Vec<ProviderConfigField>,
}

#[derive(Debug, Deserialize)]
struct RawModelDescriptor {
    model: String,
    label: String,
    family: Option<String>,
    #[serde(default)]
    capabilities: Vec<String>,
    context_window: Option<u64>,
    max_output_tokens: Option<u64>,
    #[serde(default)]
    provider_metadata: Value,
}

#[derive(Debug, Default, Deserialize)]
struct RawModelPositions {
    #[serde(default)]
    items: Vec<String>,
}

fn validate_manifest(manifest: &ProviderManifest) -> FrameworkResult<()> {
    if manifest.plugin_code.trim().is_empty() {
        return Err(PluginFrameworkError::invalid_provider_package(
            "manifest.plugin_code cannot be empty",
        ));
    }
    if manifest.version.trim().is_empty() {
        return Err(PluginFrameworkError::invalid_provider_package(
            "manifest.version cannot be empty",
        ));
    }
    if manifest.contract_version.trim().is_empty() {
        return Err(PluginFrameworkError::invalid_provider_package(
            "manifest.contract_version cannot be empty",
        ));
    }
    Ok(())
}

fn load_predefined_models(models_dir: &Path) -> FrameworkResult<Vec<ProviderModelDescriptor>> {
    if !models_dir.is_dir() {
        return Ok(Vec::new());
    }

    let positions_path = models_dir.join("_position.yaml");
    let positions = if positions_path.is_file() {
        load_yaml::<RawModelPositions>(&positions_path)?.items
    } else {
        Vec::new()
    };
    let order_lookup: HashMap<String, usize> = positions
        .into_iter()
        .enumerate()
        .map(|(index, item)| (item, index))
        .collect();

    let mut models = Vec::new();
    for entry in read_dir_sorted(models_dir)? {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.file_name().and_then(|value| value.to_str()) == Some("_position.yaml") {
            continue;
        }
        if !matches!(path.extension().and_then(|value| value.to_str()), Some("yaml" | "yml")) {
            continue;
        }

        let raw_model: RawModelDescriptor = load_yaml(&path)?;
        if raw_model.family.as_deref() != Some("llm") {
            continue;
        }

        let capabilities = raw_model
            .capabilities
            .iter()
            .map(|value| value.to_ascii_lowercase())
            .collect::<Vec<_>>();
        models.push(ProviderModelDescriptor {
            model_id: raw_model.model,
            display_name: raw_model.label,
            source: ProviderModelSource::Static,
            supports_streaming: capabilities.iter().any(|value| value == "stream"),
            supports_tool_call: capabilities.iter().any(|value| value == "tool_call"),
            supports_multimodal: capabilities.iter().any(|value| value == "multimodal"),
            context_window: raw_model.context_window,
            max_output_tokens: raw_model.max_output_tokens,
            provider_metadata: raw_model.provider_metadata,
        });
    }

    models.sort_by(|left, right| {
        let left_order = order_lookup
            .get(&left.model_id)
            .copied()
            .unwrap_or(usize::MAX);
        let right_order = order_lookup
            .get(&right.model_id)
            .copied()
            .unwrap_or(usize::MAX);
        left_order
            .cmp(&right_order)
            .then_with(|| left.model_id.cmp(&right.model_id))
    });

    Ok(models)
}

fn load_i18n_catalog(i18n_dir: &Path) -> FrameworkResult<ProviderI18nCatalog> {
    if !i18n_dir.is_dir() {
        return Err(PluginFrameworkError::invalid_provider_package(format!(
            "missing i18n directory: {}",
            i18n_dir.display()
        )));
    }

    let mut bundles = BTreeMap::new();
    for entry in read_dir_sorted(i18n_dir)? {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let locale = path
            .file_stem()
            .and_then(|value| value.to_str())
            .ok_or_else(|| {
                PluginFrameworkError::invalid_provider_package(format!(
                    "invalid locale file name: {}",
                    path.display()
                ))
            })?
            .to_string();
        let content = fs::read_to_string(&path)
            .map_err(|error| PluginFrameworkError::io(Some(&path), error.to_string()))?;
        let bundle = serde_json::from_str::<Value>(&content)
            .map_err(|error| PluginFrameworkError::serialization(Some(&path), error.to_string()))?;
        bundles.insert(locale, bundle);
    }

    if !bundles.contains_key(DEFAULT_PROVIDER_LOCALE) {
        return Err(PluginFrameworkError::invalid_provider_package(format!(
            "provider package must include default locale bundle: {DEFAULT_PROVIDER_LOCALE}"
        )));
    }

    Ok(ProviderI18nCatalog {
        default_locale: DEFAULT_PROVIDER_LOCALE.to_string(),
        bundles,
    })
}

fn resolve_nested_string(value: &Value, key: &str) -> Option<String> {
    let mut cursor = value;
    for segment in key.split('.') {
        cursor = cursor.get(segment)?;
    }
    cursor.as_str().map(ToOwned::to_owned)
}

fn load_yaml<T>(path: &Path) -> FrameworkResult<T>
where
    T: for<'de> Deserialize<'de>,
{
    let content = fs::read_to_string(path)
        .map_err(|error| PluginFrameworkError::io(Some(path), error.to_string()))?;
    serde_yaml::from_str::<T>(&content)
        .map_err(|error| PluginFrameworkError::serialization(Some(path), error.to_string()))
}

fn read_dir_sorted(dir: &Path) -> FrameworkResult<Vec<fs::DirEntry>> {
    let mut entries = fs::read_dir(dir)
        .map_err(|error| PluginFrameworkError::io(Some(dir), error.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| PluginFrameworkError::io(Some(dir), error.to_string()))?;
    entries.sort_by_key(|entry| entry.file_name());
    Ok(entries)
}
