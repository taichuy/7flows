use std::{
    fs,
    path::{Path, PathBuf},
};

use plugin_framework::{
    installation::ProviderCatalogEntry,
    provider_contract::{ModelDiscoveryMode, ProviderModelSource},
    provider_package::ProviderPackage,
};
use uuid::Uuid;

struct TempProviderPackage {
    root: PathBuf,
}

impl TempProviderPackage {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("plugin-framework-tests-{}", Uuid::now_v7()));
        fs::create_dir_all(&root).unwrap();
        Self { root }
    }

    fn path(&self) -> &Path {
        &self.root
    }

    fn write(&self, relative_path: &str, content: &str) {
        let path = self.root.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }
}

impl Drop for TempProviderPackage {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn make_package_fixture() -> TempProviderPackage {
    let fixture = TempProviderPackage::new();
    fixture.write(
        "manifest.yaml",
        r#"schema_version: 2
plugin_type: model_provider
plugin_code: acme_openai_compatible
version: 1.2.3
contract_version: 1flowbase.provider/v1
metadata:
  author: taichuy
  icon: icon.svg
provider:
  definition: provider/acme_openai_compatible.yaml
runtime:
  kind: executable
  protocol: stdio-json
  executable:
    path: bin/acme_openai_compatible-provider
limits:
  memory_bytes: 268435456
  invoke_timeout_ms: 30000
capabilities:
  model_types:
    - llm
compat:
  minimum_host_version: 0.1.0
"#,
    );
    fixture.write(
        "provider/acme_openai_compatible.yaml",
        r#"provider_code: acme_openai_compatible
display_name: Acme OpenAI Compatible
protocol: openai_compatible
help_url: https://example.com/help
default_base_url: https://api.example.com
model_discovery: hybrid
supports_model_fetch_without_credentials: true
config_schema:
  - key: base_url
    type: string
    required: true
  - key: api_key
    type: secret
    required: true
"#,
    );
    fixture.write("bin/acme_openai_compatible-provider", "#!/usr/bin/env bash\nexit 0\n");
    fixture.write("models/llm/_position.yaml", "items:\n  - acme_chat\n");
    fixture.write(
        "models/llm/acme_chat.yaml",
        r#"model: acme_chat
label: Acme Chat
family: llm
capabilities:
  - stream
  - tool_call
context_window: 128000
max_output_tokens: 4096
provider_metadata:
  tier: default
"#,
    );
    fixture.write(
        "i18n/en_US.json",
        r#"{
  "plugin": {
    "label": "Acme English",
    "description": "Acme provider"
  },
  "provider": {
    "label": "Acme Provider"
  },
  "fields": {
    "api_key": {
      "label": "API Key"
    }
  }
}
"#,
    );
    fixture.write(
        "i18n/zh_Hans.json",
        r#"{
  "plugin": {
    "label": "Acme 中文"
  }
}
"#,
    );
    fixture
}

#[test]
fn provider_package_loads_manifest_schema_and_static_models() {
    let fixture = make_package_fixture();

    let package = ProviderPackage::load_from_dir(fixture.path()).unwrap();

    assert_eq!(package.identifier(), "acme_openai_compatible@1.2.3");
    assert_eq!(package.provider.provider_code, "acme_openai_compatible");
    assert_eq!(package.provider.protocol, "openai_compatible");
    assert_eq!(
        package.provider.model_discovery_mode,
        ModelDiscoveryMode::Hybrid
    );
    assert!(package.provider.supports_model_fetch_without_credentials);
    assert_eq!(package.predefined_models.len(), 1);

    let model = &package.predefined_models[0];
    assert_eq!(model.model_id, "acme_chat");
    assert_eq!(model.display_name, "Acme Chat");
    assert_eq!(model.source, ProviderModelSource::Static);
    assert!(model.supports_streaming);
    assert!(model.supports_tool_call);
    assert_eq!(model.context_window, Some(128000));
    assert_eq!(model.max_output_tokens, Some(4096));

    let catalog_entry = ProviderCatalogEntry::from_package(&package);
    assert_eq!(catalog_entry.plugin_id, "acme_openai_compatible@1.2.3");
    assert_eq!(catalog_entry.form_schema.len(), 2);
    assert_eq!(catalog_entry.predefined_models.len(), 1);
}

#[test]
fn provider_package_falls_back_to_default_locale_for_missing_keys() {
    let fixture = make_package_fixture();

    let package = ProviderPackage::load_from_dir(fixture.path()).unwrap();

    assert_eq!(
        package.resolve_i18n_value(Some("zh_Hans"), "fields.api_key.label"),
        Some("API Key".to_string())
    );
    assert_eq!(
        package.resolve_i18n_value(Some("fr_FR"), "plugin.label"),
        Some("Acme English".to_string())
    );
}

#[test]
fn provider_package_requires_default_locale_bundle() {
    let fixture = make_package_fixture();
    fs::remove_file(fixture.path().join("i18n/en_US.json")).unwrap();

    let error = ProviderPackage::load_from_dir(fixture.path()).unwrap_err();
    assert!(error.to_string().contains("en_US"));
}

#[test]
fn provider_package_loads_schema_v2_executable_runtime_and_limits() {
    let fixture = TempProviderPackage::new();
    fixture.write(
        "manifest.yaml",
        r#"schema_version: 2
plugin_type: model_provider
plugin_code: acme_openai_compatible
version: 1.2.3
contract_version: 1flowbase.provider/v1
metadata:
  author: taichuy
  icon: icon.svg
provider:
  definition: provider/acme_openai_compatible.yaml
runtime:
  kind: executable
  protocol: stdio-json
  executable:
    path: bin/acme_openai_compatible-provider
limits:
  memory_bytes: 268435456
  invoke_timeout_ms: 30000
capabilities:
  model_types:
    - llm
compat:
  minimum_host_version: 0.1.0
"#,
    );
    fixture.write(
        "provider/acme_openai_compatible.yaml",
        "provider_code: acme_openai_compatible\nmodel_discovery: hybrid\n",
    );
    fixture.write("bin/acme_openai_compatible-provider", "#!/usr/bin/env bash\nexit 0\n");
    fixture.write("i18n/en_US.json", "{ \"plugin\": { \"label\": \"Acme\" } }\n");

    let package = ProviderPackage::load_from_dir(fixture.path()).unwrap();

    assert_eq!(package.manifest.schema_version, 2);
    assert_eq!(package.manifest.runtime.kind, "executable");
    assert_eq!(package.manifest.runtime.protocol, "stdio-json");
    assert_eq!(
        package.manifest.runtime.executable.path,
        "bin/acme_openai_compatible-provider"
    );
    assert_eq!(package.manifest.limits.memory_bytes, Some(268435456));
    assert_eq!(package.manifest.limits.invoke_timeout_ms, Some(30000));
}
