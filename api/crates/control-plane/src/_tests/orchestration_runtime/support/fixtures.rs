use super::*;

pub(super) fn write_test_provider_package() -> String {
    use std::fs;

    let root = std::env::temp_dir().join(format!("1flowbase-provider-fixture-{}", Uuid::now_v7()));
    fs::create_dir_all(root.join("provider")).expect("create fixture provider dir");
    fs::create_dir_all(root.join("bin")).expect("create fixture runtime dir");
    fs::create_dir_all(root.join("models/llm")).expect("create fixture models dir");
    fs::create_dir_all(root.join("i18n")).expect("create fixture i18n dir");
    fs::write(
        root.join("manifest.yaml"),
        r#"manifest_version: 1
plugin_id: fixture_provider@0.1.0
version: 0.1.0
vendor: 1flowbase tests
display_name: Fixture Provider
description: Fixture Provider
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
  entry: bin/fixture_provider-provider
"#,
    )
    .expect("write manifest");
    fs::write(
        root.join("provider/fixture_provider.yaml"),
        r#"provider_code: fixture_provider
display_name: Fixture Provider
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
  - key: validate_model
    type: boolean
    required: false
"#,
    )
    .expect("write provider yaml");
    let runtime_path = root.join("bin/fixture_provider-provider");
    fs::write(
        &runtime_path,
        r#"#!/usr/bin/env node
const fs = require('node:fs');

const request = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');

let result = {};
switch (request.method) {
  case 'validate':
    result = {
      sanitized: {
        api_key: request.input?.api_key ? "***" : null
      }
    };
    break;
  case 'list_models':
    result = [
      {
        model_id: "gpt-5.4-mini",
        display_name: "GPT-5.4 Mini",
        source: "dynamic",
        supports_streaming: true,
        supports_tool_call: true,
        supports_multimodal: false,
        provider_metadata: {
          tier: "default"
        }
      }
    ];
    break;
  case 'invoke': {
    const query = request.input?.messages?.[0]?.content ?? "";
    result = {
      events: [
        { type: "text_delta", delta: "reply:" + query },
        { type: "usage_snapshot", usage: { input_tokens: 5, output_tokens: 7, total_tokens: 12 } },
        { type: "finish", reason: "stop" }
      ],
      result: {
        final_content: "reply:" + query,
        usage: { input_tokens: 5, output_tokens: 7, total_tokens: 12 },
        finish_reason: "stop"
      }
    };
    break;
  }
  default:
    result = {};
}

process.stdout.write(JSON.stringify({ ok: true, result }));
"#,
    )
    .expect("write runtime");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = fs::metadata(&runtime_path)
            .expect("read runtime permissions")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&runtime_path, permissions).expect("mark runtime executable");
    }
    fs::write(
        root.join("models/llm/_position.yaml"),
        "items:\n  - fixture_chat\n",
    )
    .expect("write position");
    fs::write(
        root.join("models/llm/fixture_chat.yaml"),
        r#"model: gpt-5.4-mini
label: GPT-5.4 Mini
family: llm
capabilities:
  - stream
  - tool_call
context_window: 128000
max_output_tokens: 4096
provider_metadata:
  tier: default
"#,
    )
    .expect("write model");
    fs::write(
        root.join("i18n/en_US.json"),
        r#"{
  "plugin": {
    "label": "Fixture Provider",
    "description": "Fixture provider"
  },
  "provider": {
    "label": "Fixture Provider"
  }
}"#,
    )
    .expect("write i18n");

    root.to_string_lossy().to_string()
}

pub(super) fn write_test_capability_package() -> String {
    use std::fs;

    let root =
        std::env::temp_dir().join(format!("1flowbase-capability-fixture-{}", Uuid::now_v7()));
    fs::create_dir_all(root.join("bin")).expect("create fixture runtime dir");
    fs::create_dir_all(root.join("i18n")).expect("create fixture i18n dir");
    fs::write(
        root.join("manifest.yaml"),
        r#"manifest_version: 1
plugin_id: fixture_capability@0.1.0
version: 0.1.0
vendor: 1flowbase tests
display_name: Fixture Capability
description: Fixture Capability
icon: icon.svg
source_kind: uploaded
trust_level: unverified
consumption_kind: capability_plugin
execution_mode: process_per_call
slot_codes:
  - node_contribution
binding_targets:
  - workspace
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
  entry: bin/fixture_capability
  limits:
    memory_bytes: 134217728
    timeout_ms: 5000
node_contributions:
  - contribution_code: fixture_action
    node_shell: action
    category: automation
    title: Fixture Action
    description: Fixture capability node
    icon: puzzle
    schema_ui: {}
    schema_version: 1flowbase.node-contribution/v2
    output_schema:
      outputs:
        - key: result
          title: Result
          valueType: json
    side_effect_policy: external_read
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
    .expect("write manifest");
    fs::write(
        root.join("bin/fixture_capability"),
        r#"#!/usr/bin/env bash
set -euo pipefail

payload="$(cat)"
case "${payload}" in
  *'"method":"execute"'*)
    printf '%s' '{"ok":true,"result":{"answer":"world"}}'
    ;;
  *'"method":"validate_config"'*)
    printf '%s' '{"ok":true,"result":{"ok":true}}'
    ;;
  *'"method":"resolve_dynamic_options"'*)
    printf '%s' '{"ok":true,"result":{"fields":[]}}'
    ;;
  *'"method":"resolve_output_schema"'*)
    printf '%s' '{"ok":true,"result":{"schema_version":"1flowbase.capability.output/v1"}}'
    ;;
  *)
    printf '%s' '{"ok":false,"error":{"message":"unknown method"}}'
    exit 1
    ;;
esac
"#,
    )
    .expect("write runtime");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = fs::metadata(root.join("bin/fixture_capability"))
            .expect("read runtime permissions")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(root.join("bin/fixture_capability"), permissions)
            .expect("mark runtime executable");
    }
    fs::write(root.join("i18n/en_US.json"), "{}").expect("write i18n");

    root.to_string_lossy().to_string()
}

pub struct SeededPreviewApplication {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub flow_id: Uuid,
    pub source_provider_instance_id: Uuid,
}

pub struct SeededWaitingHumanRun {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub flow_run_id: Uuid,
    pub checkpoint_id: Uuid,
}

pub struct SeededWaitingCallbackRun {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub callback_task_id: Uuid,
}

impl OrchestrationRuntimeService<InMemoryOrchestrationRuntimeRepository, InMemoryProviderRuntime> {
    pub fn for_tests() -> Self {
        let repository = InMemoryOrchestrationRuntimeRepository::with_permissions(vec![
            "application.view.all",
            "application.create.all",
        ]);
        Self::new(
            repository,
            InMemoryProviderRuntime::default(),
            std::sync::Arc::new(runtime_core::runtime_engine::RuntimeEngine::for_tests()),
            "test-master-key",
        )
    }

    pub fn for_tests_without_data_model_scope_grant() -> Self {
        let repository =
            InMemoryOrchestrationRuntimeRepository::with_permissions_without_data_model_scope_grant(
                vec!["application.view.all", "application.create.all"],
            );
        Self::new(
            repository,
            InMemoryProviderRuntime::default(),
            std::sync::Arc::new(runtime_core::runtime_engine::RuntimeEngine::for_tests()),
            "test-master-key",
        )
    }

    pub fn for_tests_with_provider_delay(invoke_delay: std::time::Duration) -> Self {
        let repository = InMemoryOrchestrationRuntimeRepository::with_permissions(vec![
            "application.view.all",
            "application.create.all",
        ]);
        Self::new(
            repository,
            InMemoryProviderRuntime::with_invoke_delay(invoke_delay),
            std::sync::Arc::new(runtime_core::runtime_engine::RuntimeEngine::for_tests()),
            "test-master-key",
        )
    }

    pub fn for_tests_with_provider_events(provider_events: Vec<ProviderStreamEvent>) -> Self {
        let repository = InMemoryOrchestrationRuntimeRepository::with_permissions(vec![
            "application.view.all",
            "application.create.all",
        ]);
        Self::new(
            repository,
            InMemoryProviderRuntime::with_provider_events(provider_events),
            std::sync::Arc::new(runtime_core::runtime_engine::RuntimeEngine::for_tests()),
            "test-master-key",
        )
    }

    pub fn for_tests_with_live_events_then_error(live_events: Vec<ProviderStreamEvent>) -> Self {
        let repository = InMemoryOrchestrationRuntimeRepository::with_permissions(vec![
            "application.view.all",
            "application.create.all",
        ]);
        Self::new(
            repository,
            InMemoryProviderRuntime::with_live_events_then_error(live_events),
            std::sync::Arc::new(runtime_core::runtime_engine::RuntimeEngine::for_tests()),
            "test-master-key",
        )
    }

    pub fn for_tests_with_fail_before_token_models(models: Vec<&str>) -> Self {
        let repository = InMemoryOrchestrationRuntimeRepository::with_permissions(vec![
            "application.view.all",
            "application.create.all",
        ]);
        Self::new(
            repository,
            InMemoryProviderRuntime::with_fail_before_token_models(models),
            std::sync::Arc::new(runtime_core::runtime_engine::RuntimeEngine::for_tests()),
            "test-master-key",
        )
    }

    pub async fn upsert_data_model_side_effect_receipt_for_tests(
        &self,
        input: &UpsertDataModelSideEffectReceiptInput,
    ) -> domain::DataModelSideEffectReceiptRecord {
        self.repository
            .upsert_data_model_side_effect_receipt(input)
            .await
            .expect("upsert data model side-effect receipt")
    }

    pub async fn seed_application_with_flow(&self, name: &str) -> SeededPreviewApplication {
        let actor_user_id = Uuid::now_v7();
        let application = self
            .repository
            .seed_application_for_actor(actor_user_id, name)
            .await
            .expect("seed application should succeed");
        let _ = FlowRepository::get_or_create_editor_state(
            &self.repository,
            Uuid::nil(),
            application.id,
            actor_user_id,
        )
        .await
        .expect("seed flow should succeed");
        let editor_state = FlowRepository::get_or_create_editor_state(
            &self.repository,
            Uuid::nil(),
            application.id,
            actor_user_id,
        )
        .await
        .expect("seed flow should succeed");
        let _ = FlowRepository::save_draft(
            &self.repository,
            Uuid::nil(),
            application.id,
            actor_user_id,
            build_ready_provider_flow_document(
                editor_state.flow.id,
                self.repository.default_provider_instance_id(),
            ),
            domain::FlowChangeKind::Logical,
            "seed runtime preview flow",
        )
        .await
        .expect("seed preview flow should succeed");

        SeededPreviewApplication {
            actor_user_id,
            application_id: application.id,
            flow_id: editor_state.flow.id,
            source_provider_instance_id: self.repository.default_provider_instance_id(),
        }
    }

    pub fn default_provider_instance_id(&self) -> Uuid {
        self.repository.default_provider_instance_id()
    }

    pub async fn editor_state_for_tests(
        &self,
        application_id: Uuid,
        actor_user_id: Uuid,
    ) -> domain::FlowEditorState {
        FlowRepository::get_or_create_editor_state(
            &self.repository,
            Uuid::nil(),
            application_id,
            actor_user_id,
        )
        .await
        .expect("load editor state")
    }

    pub fn seed_provider_instance(
        &self,
        provider_code: &str,
        display_name: &str,
        included_in_main: bool,
        status: domain::ModelProviderInstanceStatus,
        enabled_model_ids: Vec<&str>,
    ) -> Uuid {
        self.repository.seed_provider_instance(
            provider_code,
            display_name,
            included_in_main,
            status,
            enabled_model_ids,
        )
    }

    pub fn seed_catalog_entries_for_instance(&self, instance_id: Uuid, model_ids: Vec<&str>) {
        self.repository
            .seed_catalog_entries_for_instance(instance_id, model_ids);
    }

    pub async fn seed_application_with_human_input_flow(
        &self,
        name: &str,
    ) -> SeededPreviewApplication {
        self.seed_application_with_document(name, build_human_input_flow_document)
            .await
    }

    pub async fn seed_waiting_human_run(&self, name: &str) -> SeededWaitingHumanRun {
        let seeded = self.seed_application_with_human_input_flow(name).await;
        let started = self
            .start_flow_debug_run(StartFlowDebugRunCommand {
                actor_user_id: seeded.actor_user_id,
                application_id: seeded.application_id,
                input_payload: json!({
                    "node-start": { "query": "请总结退款政策" }
                }),
                document_snapshot: None,
                debug_session_id: None,
            })
            .await
            .expect("seed waiting human run should succeed");
        let detail = self
            .continue_flow_debug_run(ContinueFlowDebugRunCommand {
                application_id: seeded.application_id,
                flow_run_id: started.flow_run.id,
                workspace_id: Uuid::nil(),
            })
            .await
            .expect("continue waiting human run should succeed");

        SeededWaitingHumanRun {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
            checkpoint_id: detail.checkpoints.last().expect("checkpoint").id,
        }
    }

    pub async fn seed_waiting_callback_run(&self, name: &str) -> SeededWaitingCallbackRun {
        let seeded = self
            .seed_application_with_document(name, build_callback_flow_document)
            .await;
        let started = self
            .start_flow_debug_run(StartFlowDebugRunCommand {
                actor_user_id: seeded.actor_user_id,
                application_id: seeded.application_id,
                input_payload: json!({
                    "node-start": { "query": "order_123" }
                }),
                document_snapshot: None,
                debug_session_id: None,
            })
            .await
            .expect("seed waiting callback run should succeed");
        let detail = self
            .continue_flow_debug_run(ContinueFlowDebugRunCommand {
                application_id: seeded.application_id,
                flow_run_id: started.flow_run.id,
                workspace_id: Uuid::nil(),
            })
            .await
            .expect("continue waiting callback run should succeed");

        SeededWaitingCallbackRun {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            callback_task_id: detail.callback_tasks.first().expect("callback task").id,
        }
    }

    pub async fn seed_application_with_plugin_node_flow(
        &self,
        name: &str,
    ) -> SeededPreviewApplication {
        self.seed_application_with_document(name, build_plugin_capability_flow_document)
            .await
    }

    pub async fn seed_application_with_multi_instance_provider_flow(
        &self,
        name: &str,
    ) -> SeededPreviewApplication {
        let seeded = self.seed_application_with_flow(name).await;
        let (source_provider_instance_id, _) = self.repository.seed_included_provider_instances();
        let editor_state = FlowRepository::get_or_create_editor_state(
            &self.repository,
            Uuid::nil(),
            seeded.application_id,
            seeded.actor_user_id,
        )
        .await
        .expect("seed editor state should succeed");
        let _ = FlowRepository::save_draft(
            &self.repository,
            Uuid::nil(),
            seeded.application_id,
            seeded.actor_user_id,
            build_ready_provider_flow_document(editor_state.flow.id, source_provider_instance_id),
            domain::FlowChangeKind::Logical,
            "seed multi instance runtime preview flow",
        )
        .await
        .expect("seed multi instance draft should succeed");

        SeededPreviewApplication {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_id: editor_state.flow.id,
            source_provider_instance_id,
        }
    }

    pub async fn force_flow_run_status(&self, flow_run_id: Uuid, status: domain::FlowRunStatus) {
        self.repository.force_flow_run_status(flow_run_id, status);
    }

    pub async fn force_flow_run_status_after_next_get(
        &self,
        flow_run_id: Uuid,
        status: domain::FlowRunStatus,
    ) {
        self.repository
            .force_flow_run_status_after_next_get(flow_run_id, status);
    }

    pub async fn mark_external_opaque_boundary(
        &self,
        flow_run_id: Uuid,
        payload: serde_json::Value,
    ) -> domain::RuntimeEventRecord {
        crate::runtime_observability::mark_external_opaque_boundary(
            &self.repository,
            flow_run_id,
            payload,
        )
        .await
        .expect("external opaque boundary event should be appended")
    }

    pub async fn list_runtime_spans(&self, flow_run_id: Uuid) -> Vec<domain::RuntimeSpanRecord> {
        OrchestrationRuntimeRepository::list_runtime_spans(&self.repository, flow_run_id)
            .await
            .expect("runtime spans should be readable")
    }

    pub async fn list_runtime_events(
        &self,
        flow_run_id: Uuid,
        after_sequence: i64,
    ) -> Vec<domain::RuntimeEventRecord> {
        OrchestrationRuntimeRepository::list_runtime_events(
            &self.repository,
            flow_run_id,
            after_sequence,
        )
        .await
        .expect("runtime events should be readable")
    }

    pub fn list_run_events(&self, flow_run_id: Uuid) -> Vec<domain::RunEventRecord> {
        self.repository.events_for_flow_run(flow_run_id)
    }

    pub async fn list_runtime_items(&self, flow_run_id: Uuid) -> Vec<domain::RuntimeItemRecord> {
        OrchestrationRuntimeRepository::list_runtime_items(&self.repository, flow_run_id)
            .await
            .expect("runtime items should be readable")
    }

    pub async fn list_context_projections(
        &self,
        flow_run_id: Uuid,
    ) -> Vec<domain::ContextProjectionRecord> {
        OrchestrationRuntimeRepository::list_context_projections(&self.repository, flow_run_id)
            .await
            .expect("context projections should be readable")
    }

    pub async fn list_usage_ledger(&self, flow_run_id: Uuid) -> Vec<domain::UsageLedgerRecord> {
        OrchestrationRuntimeRepository::list_usage_ledger(&self.repository, flow_run_id)
            .await
            .expect("usage ledger should be readable")
    }

    pub async fn list_model_failover_attempt_ledger(
        &self,
        flow_run_id: Uuid,
    ) -> Vec<domain::ModelFailoverAttemptLedgerRecord> {
        OrchestrationRuntimeRepository::list_model_failover_attempt_ledger(
            &self.repository,
            flow_run_id,
        )
        .await
        .expect("model failover attempt ledger should be readable")
    }

    pub async fn list_capability_invocations(
        &self,
        flow_run_id: Uuid,
    ) -> Vec<domain::CapabilityInvocationRecord> {
        OrchestrationRuntimeRepository::list_capability_invocations(&self.repository, flow_run_id)
            .await
            .expect("capability invocations should be readable")
    }

    async fn seed_application_with_document(
        &self,
        name: &str,
        builder: fn(Uuid, Uuid) -> Value,
    ) -> SeededPreviewApplication {
        let seeded = self.seed_application_with_flow(name).await;
        let editor_state = FlowRepository::get_or_create_editor_state(
            &self.repository,
            Uuid::nil(),
            seeded.application_id,
            seeded.actor_user_id,
        )
        .await
        .expect("seed editor state should succeed");
        let _ = FlowRepository::save_draft(
            &self.repository,
            Uuid::nil(),
            seeded.application_id,
            seeded.actor_user_id,
            builder(
                editor_state.flow.id,
                self.repository.default_provider_instance_id(),
            ),
            domain::FlowChangeKind::Logical,
            "seed runtime resume flow",
        )
        .await
        .expect("seed custom draft should succeed");

        seeded
    }

    pub async fn application_runs(
        &self,
        application_id: Uuid,
    ) -> Vec<domain::ApplicationRunSummary> {
        OrchestrationRuntimeRepository::list_application_runs(&self.repository, application_id)
            .await
            .expect("application run list should load")
    }

    pub async fn application_run_detail(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> domain::ApplicationRunDetail {
        OrchestrationRuntimeRepository::get_application_run_detail(
            &self.repository,
            application_id,
            flow_run_id,
        )
        .await
        .expect("application run detail query should succeed")
        .expect("application run detail should exist")
    }

    pub async fn replace_application_environment_variables_for_tests(
        &self,
        actor_user_id: Uuid,
        application_id: Uuid,
        variables: Vec<ApplicationEnvironmentVariableInput>,
    ) {
        ApplicationRepository::replace_application_environment_variables(
            &self.repository,
            &ReplaceApplicationEnvironmentVariablesInput {
                actor_user_id,
                workspace_id: Uuid::nil(),
                application_id,
                variables,
            },
        )
        .await
        .expect("replace application environment variables should succeed");
    }
}

fn build_ready_provider_flow_document(flow_id: Uuid, _provider_instance_id: Uuid) -> Value {
    json!({
        "schemaVersion": "1flowbase.flow/v2",
        "meta": { "flowId": flow_id.to_string(), "name": "Support Agent", "description": "", "tags": [] },
        "graph": {
            "nodes": [
                {
                    "id": "node-start",
                    "type": "start",
                    "alias": "Start",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 0, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {},
                    "outputs": []
                },
                {
                    "id": "node-llm",
                    "type": "llm",
                    "alias": "LLM",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 240, "y": 0 },
                    "configVersion": 1,
                    "config": {
                        "model_provider": {
                            "provider_code": "fixture_provider",
                            "source_instance_id": _provider_instance_id.to_string(),
                            "model_id": "gpt-5.4-mini"
                        },
                        "temperature": 0.2
                    },
                    "bindings": {
                        "prompt_messages": { "kind": "prompt_messages", "value": [{ "id": "user-1", "role": "user", "content": { "kind": "templated_text", "value": "{{node-start.query}}" } }] }
                    },
                    "outputs": [{ "key": "text", "title": "模型输出", "valueType": "string" }]
                },
                {
                    "id": "node-answer",
                    "type": "answer",
                    "alias": "Answer",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 480, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {
                        "answer_template": { "kind": "selector", "value": ["node-llm", "text"] }
                    },
                    "outputs": [{ "key": "answer", "title": "对话输出", "valueType": "string" }]
                }
            ],
            "edges": [
                { "id": "edge-start-llm", "source": "node-start", "target": "node-llm", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] },
                { "id": "edge-llm-answer", "source": "node-llm", "target": "node-answer", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] }
            ]
        },
        "editor": { "viewport": { "x": 0, "y": 0, "zoom": 1 }, "annotations": [], "activeContainerPath": [] }
    })
}

fn build_human_input_flow_document(flow_id: Uuid, _provider_instance_id: Uuid) -> Value {
    json!({
        "schemaVersion": "1flowbase.flow/v2",
        "meta": { "flowId": flow_id.to_string(), "name": "Support Agent", "description": "", "tags": [] },
        "graph": {
            "nodes": [
                {
                    "id": "node-start",
                    "type": "start",
                    "alias": "Start",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 0, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {},
                    "outputs": []
                },
                {
                    "id": "node-llm",
                    "type": "llm",
                    "alias": "LLM",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 240, "y": 0 },
                    "configVersion": 1,
                    "config": {
                        "model_provider": {
                            "provider_code": "fixture_provider",
                            "source_instance_id": _provider_instance_id.to_string(),
                            "model_id": "gpt-5.4-mini"
                        },
                        "temperature": 0.2
                    },
                    "bindings": {
                        "prompt_messages": { "kind": "prompt_messages", "value": [{ "id": "user-1", "role": "user", "content": { "kind": "templated_text", "value": "{{node-start.query}}" } }] }
                    },
                    "outputs": [{ "key": "text", "title": "模型输出", "valueType": "string" }]
                },
                {
                    "id": "node-human",
                    "type": "human_input",
                    "alias": "Human Input",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 480, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {
                        "prompt": { "kind": "templated_text", "value": "请审核：{{ node-llm.text }}" }
                    },
                    "outputs": [{ "key": "input", "title": "人工输入", "valueType": "string" }]
                },
                {
                    "id": "node-answer",
                    "type": "answer",
                    "alias": "Answer",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 720, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {
                        "answer_template": { "kind": "selector", "value": ["node-human", "input"] }
                    },
                    "outputs": [{ "key": "answer", "title": "对话输出", "valueType": "string" }]
                }
            ],
            "edges": [
                { "id": "edge-start-llm", "source": "node-start", "target": "node-llm", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] },
                { "id": "edge-llm-human", "source": "node-llm", "target": "node-human", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] },
                { "id": "edge-human-answer", "source": "node-human", "target": "node-answer", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] }
            ]
        },
        "editor": { "viewport": { "x": 0, "y": 0, "zoom": 1 }, "annotations": [], "activeContainerPath": [] }
    })
}

fn build_callback_flow_document(flow_id: Uuid, _provider_instance_id: Uuid) -> Value {
    json!({
        "schemaVersion": "1flowbase.flow/v2",
        "meta": { "flowId": flow_id.to_string(), "name": "Support Agent", "description": "", "tags": [] },
        "graph": {
            "nodes": [
                {
                    "id": "node-start",
                    "type": "start",
                    "alias": "Start",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 0, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {},
                    "outputs": []
                },
                {
                    "id": "node-tool",
                    "type": "tool",
                    "alias": "Tool",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 240, "y": 0 },
                    "configVersion": 1,
                    "config": { "tool_name": "lookup_order" },
                    "bindings": {
                        "order_id": { "kind": "selector", "value": ["node-start", "query"] }
                    },
                    "outputs": [{ "key": "result", "title": "工具输出", "valueType": "json" }]
                },
                {
                    "id": "node-answer",
                    "type": "answer",
                    "alias": "Answer",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 480, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {
                        "answer_template": { "kind": "selector", "value": ["node-tool", "result"] }
                    },
                    "outputs": [{ "key": "answer", "title": "对话输出", "valueType": "json" }]
                }
            ],
            "edges": [
                { "id": "edge-start-tool", "source": "node-start", "target": "node-tool", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] },
                { "id": "edge-tool-answer", "source": "node-tool", "target": "node-answer", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] }
            ]
        },
        "editor": { "viewport": { "x": 0, "y": 0, "zoom": 1 }, "annotations": [], "activeContainerPath": [] }
    })
}

fn build_plugin_capability_flow_document(flow_id: Uuid, _provider_instance_id: Uuid) -> Value {
    json!({
        "schemaVersion": "1flowbase.flow/v2",
        "meta": { "flowId": flow_id.to_string(), "name": "Support Agent", "description": "", "tags": [] },
        "graph": {
            "nodes": [
                {
                    "id": "node-start",
                    "type": "start",
                    "alias": "Start",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 0, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {},
                    "outputs": []
                },
                {
                    "id": "node-plugin",
                    "type": "plugin_node",
                    "alias": "Plugin Node",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 240, "y": 0 },
                    "configVersion": 1,
                    "plugin_unique_identifier": "fixture_capability",
                    "package_id": "fixture_capability@0.1.0",
                    "plugin_id": "fixture_capability@0.1.0",
                    "plugin_version": "0.1.0",
                    "contribution_code": "fixture_action",
                    "node_shell": "action",
                    "schema_version": "1flowbase.node-contribution/v2",
                    "contribution_checksum": "sha256:contribution",
                    "compiled_contribution_hash": "sha256:compiled",
                    "output_schema_snapshot": {
                        "outputs": [{ "key": "answer", "title": "回答", "valueType": "string" }]
                    },
                    "config": { "prompt": "Hello {{ node-start.query }}" },
                    "bindings": {
                        "query": { "kind": "selector", "value": ["node-start", "query"] }
                    },
                    "outputs": [{ "key": "answer", "title": "回答", "valueType": "string" }]
                }
            ],
            "edges": [
                { "id": "edge-start-plugin", "source": "node-start", "target": "node-plugin", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] }
            ]
        },
        "editor": { "viewport": { "x": 0, "y": 0, "zoom": 1 }, "annotations": [], "activeContainerPath": [] }
    })
}
