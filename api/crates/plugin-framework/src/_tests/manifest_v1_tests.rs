use plugin_framework::{
    manifest_v1::PluginExecutionMode,
    parse_plugin_manifest,
    PluginConsumptionKind,
};

#[test]
fn plugin_manifest_v1_parses_runtime_extension_provider_fields() {
    let manifest = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: openai_compatible@0.4.0
version: 0.4.0
vendor: 1flowbase
display_name: OpenAI Compatible
description: Generic OpenAI-compatible provider runtime extension
icon: icon.svg
source_kind: official_registry
trust_level: verified_official
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - model_provider
binding_targets:
  - workspace
selection_mode: assignment_then_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.provider/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: provider_instance_only
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/openai-compatible-provider
  limits:
    timeout_ms: 30000
    memory_bytes: 268435456
node_contributions: []
"#,
    )
    .unwrap();

    assert_eq!(manifest.manifest_version, 1);
    assert_eq!(manifest.plugin_id, "openai_compatible@0.4.0");
    assert_eq!(manifest.version, "0.4.0");
    assert_eq!(manifest.vendor, "1flowbase");
    assert_eq!(manifest.display_name, "OpenAI Compatible");
    assert_eq!(manifest.consumption_kind, PluginConsumptionKind::RuntimeExtension);
    assert_eq!(manifest.execution_mode, PluginExecutionMode::ProcessPerCall);
    assert_eq!(manifest.consumption_kind.as_str(), "runtime_extension");
    assert_eq!(manifest.execution_mode.as_str(), "process_per_call");
    assert_eq!(manifest.slot_codes, vec!["model_provider"]);
    assert_eq!(manifest.binding_targets, vec!["workspace"]);
    assert_eq!(manifest.runtime.protocol, "stdio_json");
    assert_eq!(manifest.runtime.entry, "bin/openai-compatible-provider");
    assert_eq!(manifest.runtime.limits.timeout_ms, Some(30000));
    assert_eq!(manifest.runtime.limits.memory_bytes, Some(268435456));
    assert!(manifest.node_contributions.is_empty());
}

#[test]
fn plugin_manifest_v1_rejects_host_extension_with_workspace_binding() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: bad_host@0.1.0
version: 0.1.0
vendor: acme
display_name: Bad Host
description: invalid
source_kind: uploaded
trust_level: unverified
consumption_kind: host_extension
execution_mode: in_process
slot_codes: []
binding_targets:
  - workspace
selection_mode: auto_activate
minimum_host_version: 0.1.0
contract_version: 1flowbase.host_extension/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: none
  storage: host_managed
  mcp: none
  subprocess: deny
runtime:
  protocol: native_host
  entry: lib/bad-host.so
"#,
    )
    .unwrap_err();

    assert!(error
        .to_string()
        .contains("host_extension cannot declare workspace binding_targets"));
}

#[test]
fn plugin_manifest_v1_rejects_capability_plugin_without_node_contributions() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: bad_capability@0.1.0
version: 0.1.0
vendor: acme
display_name: Bad Capability
description: invalid
source_kind: official_registry
trust_level: verified_official
consumption_kind: capability_plugin
execution_mode: declarative_only
slot_codes:
  - node_contribution
binding_targets: []
selection_mode: manual_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.capability/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: none
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/bad-capability
node_contributions: []
"#,
    )
    .unwrap_err();

    assert!(error
        .to_string()
        .contains("capability_plugin must declare node_contributions"));
}

#[test]
fn plugin_manifest_v1_rejects_manifest_version_other_than_one() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 2
plugin_id: bad_version@0.1.0
version: 0.1.0
vendor: acme
display_name: Bad Version
description: invalid
source_kind: uploaded
trust_level: unverified
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - model_provider
binding_targets:
  - workspace
selection_mode: assignment_then_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.provider/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: provider_instance_only
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/bad-version
node_contributions: []
"#,
    )
    .unwrap_err();

    assert!(error
        .to_string()
        .contains("manifest_version must be 1"));
}

#[test]
fn plugin_manifest_v1_rejects_runtime_extension_without_supported_binding_target() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: bad_binding@0.1.0
version: 0.1.0
vendor: acme
display_name: Bad Binding
description: invalid
source_kind: official_registry
trust_level: verified_official
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - model_provider
binding_targets: []
selection_mode: assignment_then_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.provider/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: provider_instance_only
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/bad-binding
node_contributions: []
"#,
    )
    .unwrap_err();

    assert!(error
        .to_string()
        .contains("runtime_extension binding_targets must only contain workspace or model"));
}

#[test]
fn plugin_manifest_v1_rejects_capability_plugin_with_incomplete_node_contribution() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: bad_node@0.1.0
version: 0.1.0
vendor: acme
display_name: Bad Node
description: invalid
source_kind: uploaded
trust_level: unverified
consumption_kind: capability_plugin
execution_mode: declarative_only
slot_codes:
  - node_contribution
binding_targets: []
selection_mode: manual_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.capability/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: none
  secrets: none
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/bad-node
node_contributions:
  - contribution_code: ""
    node_shell: action
    category: http
    title: Broken Node
    description: Broken node description
    icon: globe
    schema_ui: {}
    schema_version: 1flowbase.node.schema-ui/v1
    output_schema: {}
    required_auth:
      - provider_instance
    visibility: public
    experimental: false
    dependency:
      installation_kind: optional
      plugin_version_range: ">=0.1.0"
"#,
    )
    .unwrap_err();

    assert!(error
        .to_string()
        .contains("node_contributions[].contribution_code cannot be empty"));
}

#[test]
fn plugin_manifest_v1_rejects_runtime_extension_with_tenant_binding_target() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: bad_tenant_binding@0.1.0
version: 0.1.0
vendor: acme
display_name: Bad Tenant Binding
description: invalid
source_kind: official_registry
trust_level: verified_official
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - model_provider
binding_targets:
  - workspace
  - tenant
selection_mode: assignment_then_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.provider/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: provider_instance_only
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/bad-tenant-binding
node_contributions: []
"#,
    )
    .unwrap_err();

    assert!(error
        .to_string()
        .contains("runtime_extension binding_targets must only contain workspace or model"));
}

#[test]
fn plugin_manifest_v1_rejects_capability_plugin_with_invalid_node_contract_values() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: bad_node_contract@0.1.0
version: 0.1.0
vendor: acme
display_name: Bad Node Contract
description: invalid
source_kind: uploaded
trust_level: unverified
consumption_kind: capability_plugin
execution_mode: declarative_only
slot_codes:
  - node_contribution
binding_targets: []
selection_mode: manual_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.capability/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: none
  secrets: none
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/bad-node-contract
node_contributions:
  - contribution_code: bad_contract
    node_shell: control_flow
    category: http
    title: Broken Node
    description: Broken node description
    icon: globe
    schema_ui: {}
    schema_version: invalid-schema
    output_schema: {}
    required_auth:
      - provider_instance
    visibility: internal
    experimental: false
    dependency:
      installation_kind: dynamic
      plugin_version_range: ">=0.1.0"
"#,
    )
    .unwrap_err();

    assert!(error
        .to_string()
        .contains("node_contributions[].node_shell must be one of action"));
}

#[test]
fn plugin_manifest_v1_rejects_unknown_source_kind() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: bad_source@0.1.0
version: 0.1.0
vendor: acme
display_name: Bad Source
description: invalid
source_kind: side_loaded
trust_level: unverified
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - model_provider
binding_targets:
  - workspace
selection_mode: assignment_then_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.provider/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: provider_instance_only
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/bad-source
node_contributions: []
"#,
    )
    .unwrap_err();

    assert!(error
        .to_string()
        .contains("source_kind must be one of official_registry, mirror_registry, uploaded, filesystem_dropin"));
}

#[test]
fn plugin_manifest_v1_rejects_contract_version_mismatch_for_capability_plugin() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: bad_contract_version@0.1.0
version: 0.1.0
vendor: acme
display_name: Bad Contract Version
description: invalid
source_kind: uploaded
trust_level: unverified
consumption_kind: capability_plugin
execution_mode: declarative_only
slot_codes:
  - node_contribution
binding_targets: []
selection_mode: manual_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.provider/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: none
  secrets: none
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/bad-contract-version
node_contributions:
  - contribution_code: valid_node
    node_shell: action
    category: http
    title: Valid Node
    description: Valid node description
    icon: globe
    schema_ui: {}
    schema_version: 1flowbase.node-contribution/v1
    output_schema: {}
    required_auth:
      - provider_instance
    visibility: public
    experimental: false
    dependency:
      installation_kind: optional
      plugin_version_range: ">=0.1.0"
"#,
    )
    .unwrap_err();

    assert!(error.to_string().contains(
        "contract_version must be 1flowbase.capability/v1 for capability_plugin"
    ));
}
