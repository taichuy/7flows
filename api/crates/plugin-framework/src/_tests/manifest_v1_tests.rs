use plugin_framework::{
    manifest_v1::PluginExecutionMode, parse_plugin_manifest, PluginConsumptionKind,
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
    assert_eq!(
        manifest.consumption_kind,
        PluginConsumptionKind::RuntimeExtension
    );
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
fn plugin_manifest_v1_parses_capability_plugin_with_js_dependency_pack() {
    let manifest = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: js_zod_pack@0.1.0
version: 0.1.0
vendor: acme
display_name: JS Zod Pack
description: Example JS dependency pack plugin
source_kind: uploaded
trust_level: checksum_only
consumption_kind: capability_plugin
execution_mode: declarative_only
slot_codes:
  - js_dependency_pack
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
  entry: bin/js-zod-pack
js_dependencies:
  - alias: zod
    package: zod
    version: 3.24.0
    targets:
      - backend_code
    artifacts:
      backend_code: artifacts/zod.backend.mjs
    integrity: sha256-example
    permissions:
      network: deny
      filesystem: deny
      env: deny
    native_addon: false
    lifecycle_scripts: false
"#,
    )
    .unwrap();

    assert_eq!(manifest.slot_codes, vec!["js_dependency_pack"]);
    assert_eq!(manifest.consumption_kind, PluginConsumptionKind::CapabilityPlugin);
    assert_eq!(manifest.js_dependencies.len(), 1);
    let dep = &manifest.js_dependencies[0];
    assert_eq!(dep.alias, "zod");
    assert_eq!(dep.package, "zod");
    assert_eq!(dep.version, "3.24.0");
    assert_eq!(dep.targets, vec!["backend_code"]);
    assert_eq!(dep.artifacts.get("backend_code"), Some(&"artifacts/zod.backend.mjs".to_string()));
    assert_eq!(dep.permissions.network, "deny");
    assert_eq!(dep.permissions.filesystem, "deny");
}

#[test]
fn plugin_manifest_v1_rejects_js_dependency_pack_with_invalid_target() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: bad_js_pack@0.1.0
version: 0.1.0
vendor: acme
display_name: Bad JS Pack
description: invalid target
source_kind: uploaded
trust_level: checksum_only
consumption_kind: capability_plugin
execution_mode: declarative_only
slot_codes:
  - js_dependency_pack
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
  entry: bin/bad-js-pack
js_dependencies:
  - alias: bad
    package: bad-lib
    version: 1.0.0
    targets:
      - browser
    artifacts:
      browser: artifacts/bad.browser.js
    integrity: sha256-example
    permissions:
      network: deny
      filesystem: deny
      env: deny
    native_addon: false
    lifecycle_scripts: false
"#,
    )
    .unwrap_err();

    assert!(error.to_string().contains("js_dependencies[].targets[] must be one of backend_code"));
}

#[test]
fn plugin_manifest_v1_rejects_js_dependency_pack_with_native_addon_or_lifecycle_scripts() {
    let native_addon_error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: native_addon_pack@0.1.0
version: 0.1.0
vendor: acme
display_name: Native Addon Pack
description: unsupported
source_kind: uploaded
trust_level: checksum_only
consumption_kind: capability_plugin
execution_mode: declarative_only
slot_codes:
  - js_dependency_pack
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
  entry: bin/native-addon-pack
js_dependencies:
  - alias: has_native
    package: native-lib
    version: 1.0.0
    targets:
      - backend_code
    artifacts:
      backend_code: artifacts/native-lib.mjs
    integrity: sha256-native
    permissions:
      network: deny
      filesystem: deny
      env: deny
    native_addon: true
    lifecycle_scripts: false
"#,
    )
    .unwrap_err();

    assert!(native_addon_error
        .to_string()
        .contains("does not support native_addon"));

    let lifecycle_error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: lifecycle_pack@0.1.0
version: 0.1.0
vendor: acme
display_name: Lifecycle Scripts Pack
description: unsupported
source_kind: uploaded
trust_level: checksum_only
consumption_kind: capability_plugin
execution_mode: declarative_only
slot_codes:
  - js_dependency_pack
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
  entry: bin/lifecycle-pack
js_dependencies:
  - alias: has_lifecycle
    package: lifecycle-lib
    version: 1.0.0
    targets:
      - backend_code
    artifacts:
      backend_code: artifacts/lifecycle-lib.mjs
    integrity: sha256-lifecycle
    permissions:
      network: deny
      filesystem: deny
      env: deny
    native_addon: false
    lifecycle_scripts: true
"#,
    )
    .unwrap_err();

    assert!(lifecycle_error
        .to_string()
        .contains("does not support lifecycle_scripts"));
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

    assert!(error.to_string().contains("manifest_version must be 1"));
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
    schema_version: 1flowbase.node-contribution/v2
    output_schema:
      outputs:
        - key: result
          title: Result
          valueType: json
    side_effect_policy: none
    infra_contracts: []
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
    output_schema:
      outputs:
        - key: result
          title: Result
          valueType: json
    side_effect_policy: none
    infra_contracts: []
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
    schema_version: 1flowbase.node-contribution/v2
    output_schema:
      outputs:
        - key: result
          title: Result
          valueType: json
    side_effect_policy: none
    infra_contracts: []
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
        .contains("contract_version must be 1flowbase.capability/v1 for capability_plugin"));
}

#[test]
fn plugin_manifest_v1_accepts_node_contribution_v2_contract() {
    let manifest = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: prompt_pack@0.1.0
version: 0.1.0
vendor: acme
display_name: Prompt Pack
description: Prompt capability plugin
source_kind: uploaded
trust_level: checksum_only
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
  entry: bin/prompt-pack
node_contributions:
  - contribution_code: openai_prompt
    node_shell: action
    category: ai
    title: OpenAI Prompt
    description: Prompt node
    icon: spark
    schema_ui:
      sections:
        - blocks:
            - kind: field
              renderer: text
              path: config.prompt
              label: Prompt
    schema_version: 1flowbase.node-contribution/v2
    output_schema:
      outputs:
        - key: answer
          title: Answer
          valueType: string
    side_effect_policy: external_read
    infra_contracts: []
    required_auth:
      - provider_instance
    visibility: public
    experimental: false
    dependency:
      installation_kind: required
      plugin_version_range: ">=0.1.0"
"#,
    )
    .unwrap();

    let contribution = &manifest.node_contributions[0];
    assert_eq!(
        contribution.schema_version,
        "1flowbase.node-contribution/v2"
    );
    assert_eq!(contribution.side_effect_policy, "external_read");
}

#[test]
fn plugin_manifest_v1_rejects_node_contribution_v1_schema() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: prompt_pack@0.1.0
version: 0.1.0
vendor: acme
display_name: Prompt Pack
description: Prompt capability plugin
source_kind: uploaded
trust_level: checksum_only
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
  entry: bin/prompt-pack
node_contributions:
  - contribution_code: legacy_prompt
    node_shell: action
    category: ai
    title: Legacy Prompt
    description: Legacy node
    icon: spark
    schema_ui: {}
    schema_version: 1flowbase.node-contribution/v1
    output_schema:
      outputs:
        - key: answer
          title: Answer
          valueType: string
    side_effect_policy: none
    infra_contracts: []
    required_auth: []
    visibility: public
    experimental: false
    dependency:
      installation_kind: required
      plugin_version_range: ">=0.1.0"
"#,
    )
    .unwrap_err();

    assert!(error.to_string().contains(
        "node_contributions[].schema_version must be one of 1flowbase.node-contribution/v2"
    ));
}

#[test]
fn plugin_manifest_v1_rejects_unknown_node_contribution_renderer() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: prompt_pack@0.1.0
version: 0.1.0
vendor: acme
display_name: Prompt Pack
description: Prompt capability plugin
source_kind: uploaded
trust_level: checksum_only
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
  entry: bin/prompt-pack
node_contributions:
  - contribution_code: openai_prompt
    node_shell: action
    category: ai
    title: OpenAI Prompt
    description: Prompt node
    icon: spark
    schema_ui:
      sections:
        - blocks:
            - kind: field
              renderer: plugin_react_panel
              path: config.prompt
              label: Prompt
    schema_version: 1flowbase.node-contribution/v2
    output_schema:
      outputs:
        - key: answer
          title: Answer
          valueType: string
    side_effect_policy: none
    infra_contracts: []
    required_auth: []
    visibility: public
    experimental: false
    dependency:
      installation_kind: required
      plugin_version_range: ">=0.1.0"
"#,
    )
    .unwrap_err();

    assert!(error
        .to_string()
        .contains("unknown node contribution renderer"));
}

#[test]
fn plugin_manifest_v1_rejects_reserved_output_and_host_infra_contracts() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: prompt_pack@0.1.0
version: 0.1.0
vendor: acme
display_name: Prompt Pack
description: Prompt capability plugin
source_kind: uploaded
trust_level: checksum_only
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
  entry: bin/prompt-pack
node_contributions:
  - contribution_code: openai_prompt
    node_shell: action
    category: ai
    title: OpenAI Prompt
    description: Prompt node
    icon: spark
    schema_ui: {}
    schema_version: 1flowbase.node-contribution/v2
    output_schema:
      outputs:
        - key: usage
          title: Usage
          valueType: json
    side_effect_policy: none
    infra_contracts:
      - cache-store
    required_auth: []
    visibility: public
    experimental: false
    dependency:
      installation_kind: required
      plugin_version_range: ">=0.1.0"
"#,
    )
    .unwrap_err();

    assert!(error.to_string().contains("reserved public output key"));
}

#[test]
fn plugin_manifest_v1_rejects_storage_host_infra_contracts() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: prompt_pack@0.1.0
version: 0.1.0
vendor: acme
display_name: Prompt Pack
description: Prompt capability plugin
source_kind: uploaded
trust_level: checksum_only
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
  entry: bin/prompt-pack
node_contributions:
  - contribution_code: openai_prompt
    node_shell: action
    category: ai
    title: OpenAI Prompt
    description: Prompt node
    icon: spark
    schema_ui: {}
    schema_version: 1flowbase.node-contribution/v2
    output_schema:
      outputs:
        - key: answer
          title: Answer
          valueType: string
    side_effect_policy: none
    infra_contracts:
      - storage-object
      - rate_limit_store
    required_auth: []
    visibility: public
    experimental: false
    dependency:
      installation_kind: required
      plugin_version_range: ">=0.1.0"
"#,
    )
    .unwrap_err();

    assert!(error.to_string().contains("host infrastructure contract"));
}

#[test]
fn plugin_manifest_v1_rejects_node_contribution_output_without_title_or_value_type() {
    let error = parse_plugin_manifest(
        r#"
manifest_version: 1
plugin_id: prompt_pack@0.1.0
version: 0.1.0
vendor: acme
display_name: Prompt Pack
description: Prompt capability plugin
source_kind: uploaded
trust_level: checksum_only
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
  entry: bin/prompt-pack
node_contributions:
  - contribution_code: openai_prompt
    node_shell: action
    category: ai
    title: OpenAI Prompt
    description: Prompt node
    icon: spark
    schema_ui: {}
    schema_version: 1flowbase.node-contribution/v2
    output_schema:
      outputs:
        - key: answer
          title: Answer
        - key: raw
          valueType: json
    side_effect_policy: none
    infra_contracts: []
    required_auth: []
    visibility: public
    experimental: false
    dependency:
      installation_kind: required
      plugin_version_range: ">=0.1.0"
"#,
    )
    .unwrap_err();

    assert!(error
        .to_string()
        .contains("output_schema.outputs[].valueType cannot be empty"));
}

#[test]
fn runtime_extension_uses_registered_slot_vocabulary() {
    let raw = r#"
manifest_version: 1
plugin_id: openai_compatible@0.1.0
version: 0.1.0
vendor: acme
display_name: OpenAI Compatible
description: OpenAI-compatible runtime extension
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
"#;

    let manifest = parse_plugin_manifest(raw).expect("manifest should parse");
    assert_eq!(
        manifest.consumption_kind,
        PluginConsumptionKind::RuntimeExtension
    );
    assert_eq!(manifest.slot_codes, vec!["model_provider"]);
}

#[test]
fn runtime_extension_rejects_provider_as_plugin_type_slot() {
    let raw = r#"
manifest_version: 1
plugin_id: legacy_provider@0.1.0
version: 0.1.0
vendor: acme
display_name: Legacy Provider
description: Legacy provider vocabulary
source_kind: official_registry
trust_level: verified_official
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - provider
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
  entry: bin/legacy-provider
"#;

    let error = parse_plugin_manifest(raw).expect_err("provider is not a runtime slot");
    assert!(error.to_string().contains("slot_codes"));
}

#[test]
fn runtime_extension_accepts_data_import_snapshot_slot() {
    let raw = r#"
manifest_version: 1
plugin_id: snapshot_importer@0.1.0
version: 0.1.0
vendor: acme
display_name: Snapshot Importer
description: Data import snapshot runtime extension
source_kind: official_registry
trust_level: verified_official
consumption_kind: runtime_extension
execution_mode: process_per_call
slot_codes:
  - data_import_snapshot
binding_targets:
  - workspace
selection_mode: assignment_then_select
minimum_host_version: 0.1.0
contract_version: 1flowbase.data_source/v1
schema_version: 1flowbase.plugin.manifest/v1
permissions:
  network: outbound_only
  secrets: provider_instance_only
  storage: none
  mcp: none
  subprocess: deny
runtime:
  protocol: stdio_json
  entry: bin/snapshot-importer
"#;

    let manifest = parse_plugin_manifest(raw).expect("manifest should parse");
    assert_eq!(manifest.slot_codes, vec!["data_import_snapshot"]);
    assert_eq!(manifest.contract_version, "1flowbase.data_source/v1");
}
