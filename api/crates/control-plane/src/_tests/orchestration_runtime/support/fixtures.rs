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
        Self::new(
            InMemoryOrchestrationRuntimeRepository::with_permissions(vec![
                "application.view.all",
                "application.create.all",
            ]),
            InMemoryProviderRuntime,
            "test-master-key",
        )
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
        }
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
        let detail = self
            .start_flow_debug_run(StartFlowDebugRunCommand {
                actor_user_id: seeded.actor_user_id,
                application_id: seeded.application_id,
                input_payload: json!({
                    "node-start": { "query": "请总结退款政策" }
                }),
            })
            .await
            .expect("seed waiting human run should succeed");

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
        let detail = self
            .start_flow_debug_run(StartFlowDebugRunCommand {
                actor_user_id: seeded.actor_user_id,
                application_id: seeded.application_id,
                input_payload: json!({
                    "node-start": { "query": "order_123" }
                }),
            })
            .await
            .expect("seed waiting callback run should succeed");

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

    pub async fn force_flow_run_status(&self, flow_run_id: Uuid, status: domain::FlowRunStatus) {
        self.repository.force_flow_run_status(flow_run_id, status);
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
}

fn build_ready_provider_flow_document(flow_id: Uuid, _provider_instance_id: Uuid) -> Value {
    json!({
        "schemaVersion": "1flowbase.flow/v1",
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
                    "outputs": [{ "key": "query", "title": "用户输入", "valueType": "string" }]
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
                            "model_id": "gpt-5.4-mini"
                        },
                        "temperature": 0.2
                    },
                    "bindings": {
                        "user_prompt": { "kind": "selector", "value": ["node-start", "query"] }
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
        "schemaVersion": "1flowbase.flow/v1",
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
                    "outputs": [{ "key": "query", "title": "用户输入", "valueType": "string" }]
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
                            "model_id": "gpt-5.4-mini"
                        },
                        "temperature": 0.2
                    },
                    "bindings": {
                        "user_prompt": { "kind": "selector", "value": ["node-start", "query"] }
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
        "schemaVersion": "1flowbase.flow/v1",
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
                    "outputs": [{ "key": "query", "title": "用户输入", "valueType": "string" }]
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
        "schemaVersion": "1flowbase.flow/v1",
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
                    "outputs": [{ "key": "query", "title": "用户输入", "valueType": "string" }]
                },
                {
                    "id": "node-plugin",
                    "type": "plugin_node",
                    "alias": "Plugin Node",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 240, "y": 0 },
                    "configVersion": 1,
                    "plugin_id": "fixture_capability@0.1.0",
                    "plugin_version": "0.1.0",
                    "contribution_code": "fixture_action",
                    "node_shell": "action",
                    "schema_version": "1flowbase.node-contribution/v1",
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
