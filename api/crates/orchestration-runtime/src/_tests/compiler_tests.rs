use std::collections::{BTreeMap, BTreeSet};

use orchestration_runtime::compiled_plan::CompileIssueCode;
use orchestration_runtime::compiler::{
    FlowCompileContext, FlowCompileNodeContribution, FlowCompileProviderFamily,
    FlowCompileProviderInstance, FlowCompiler,
};
use serde_json::{json, Value};
use uuid::Uuid;

fn compile_context() -> FlowCompileContext {
    FlowCompileContext {
        provider_families: BTreeMap::from([(
            "fixture_provider".to_string(),
            FlowCompileProviderFamily {
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                is_ready: true,
                available_models: BTreeSet::from(["gpt-5.4-mini".to_string()]),
                allow_custom_models: false,
            },
        )]),
        provider_instances: BTreeMap::from([(
            "provider-selected".to_string(),
            FlowCompileProviderInstance {
                provider_instance_id: "provider-selected".to_string(),
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                is_ready: true,
                is_runnable: true,
                included_in_main: true,
                available_models: BTreeSet::from(["gpt-5.4-mini".to_string()]),
                allow_custom_models: false,
            },
        )]),
        node_contributions: BTreeMap::new(),
    }
}

fn plugin_compile_context() -> FlowCompileContext {
    let mut context = compile_context();
    context.node_contributions.insert(
        "prompt_pack@0.1.0::0.1.0::openai_prompt::action::1flowbase.node-contribution/v1"
            .to_string(),
        FlowCompileNodeContribution {
            installation_id: Uuid::now_v7(),
            plugin_id: "prompt_pack@0.1.0".to_string(),
            plugin_version: "0.1.0".to_string(),
            contribution_code: "openai_prompt".to_string(),
            node_shell: "action".to_string(),
            schema_version: "1flowbase.node-contribution/v1".to_string(),
            dependency_status: "ready".to_string(),
        },
    );
    context
}

fn sample_document(flow_id: Uuid) -> serde_json::Value {
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
                            "source_instance_id": "provider-selected",
                            "model_id": "gpt-5.4-mini"
                        },
                        "temperature": 0.2
                    },
                    "bindings": {
                        "user_prompt": { "kind": "selector", "value": ["node-start", "query"] },
                        "system_prompt": { "kind": "templated_text", "value": "You are helpful." }
                    },
                    "outputs": [{ "key": "text", "title": "模型输出", "valueType": "string" }]
                }
            ],
            "edges": [
                {
                    "id": "edge-start-llm",
                    "source": "node-start",
                    "target": "node-llm",
                    "sourceHandle": null,
                    "targetHandle": null,
                    "containerId": null,
                    "points": []
                }
            ]
        },
        "editor": { "viewport": { "x": 0, "y": 0, "zoom": 1 }, "annotations": [], "activeContainerPath": [] }
    })
}

fn plugin_document(flow_id: Uuid) -> serde_json::Value {
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
                    "position": { "x": 480, "y": 0 },
                    "configVersion": 1,
                    "plugin_id": "prompt_pack@0.1.0",
                    "plugin_version": "0.1.0",
                    "contribution_code": "openai_prompt",
                    "node_shell": "action",
                    "schema_version": "1flowbase.node-contribution/v1",
                    "config": {
                        "prompt": "Hello {{ node-start.query }}"
                    },
                    "bindings": {
                        "query": { "kind": "selector", "value": ["node-start", "query"] }
                    },
                    "outputs": [{ "key": "answer", "title": "回答", "valueType": "string" }]
                }
            ],
            "edges": [
                {
                    "id": "edge-start-plugin",
                    "source": "node-start",
                    "target": "node-plugin",
                    "sourceHandle": null,
                    "targetHandle": null,
                    "containerId": null,
                    "points": []
                }
            ]
        },
        "editor": { "viewport": { "x": 0, "y": 0, "zoom": 1 }, "annotations": [], "activeContainerPath": [] }
    })
}

#[test]
fn compile_flow_document_emits_topology_selector_dependencies_and_provider_runtime() {
    let flow_id = Uuid::now_v7();
    let plan = FlowCompiler::compile(
        flow_id,
        "draft-1",
        &sample_document(flow_id),
        &compile_context(),
    )
    .unwrap();

    assert_eq!(plan.flow_id, flow_id);
    assert_eq!(plan.topological_order, vec!["node-start", "node-llm"]);
    assert_eq!(
        plan.nodes["node-llm"].dependency_node_ids,
        vec!["node-start"]
    );
    assert_eq!(
        plan.nodes["node-llm"].bindings["user_prompt"].selector_paths,
        vec![vec!["node-start".to_string(), "query".to_string()]]
    );
    assert_eq!(
        plan.nodes["node-llm"]
            .llm_runtime
            .as_ref()
            .unwrap()
            .provider_code,
        "fixture_provider"
    );
    assert_eq!(
        plan.nodes["node-llm"]
            .llm_runtime
            .as_ref()
            .unwrap()
            .provider_instance_id,
        "provider-selected"
    );
    assert!(plan.compile_issues.is_empty());
}

#[test]
fn compile_rejects_edge_that_targets_unknown_node() {
    let flow_id = Uuid::now_v7();
    let mut document = sample_document(flow_id);
    document["graph"]["edges"][0]["target"] = json!("missing-node");

    let error =
        FlowCompiler::compile(flow_id, "draft-1", &document, &compile_context()).unwrap_err();

    assert!(error.to_string().contains("missing-node"));
}

#[test]
fn compile_collects_provider_compile_issues() {
    let flow_id = Uuid::now_v7();
    let mut document = sample_document(flow_id);
    document["graph"]["nodes"][1]["config"] = json!({
        "model_provider": {
            "provider_code": "fixture_provider",
            "source_instance_id": "provider-selected",
            "model_id": "unknown-model"
        }
    });

    let plan = FlowCompiler::compile(flow_id, "draft-1", &document, &compile_context()).unwrap();

    assert_eq!(plan.compile_issues.len(), 1);
    assert_eq!(
        plan.compile_issues[0].code,
        CompileIssueCode::ModelNotAvailable
    );
}

#[test]
fn compile_uses_selected_instance_models_instead_of_provider_family_aggregate() {
    let flow_id = Uuid::now_v7();
    let mut context = compile_context();
    context.provider_families.insert(
        "fixture_provider".to_string(),
        FlowCompileProviderFamily {
            provider_code: "fixture_provider".to_string(),
            protocol: "openai_compatible".to_string(),
            is_ready: true,
            available_models: BTreeSet::from([
                "gpt-5.4-mini".to_string(),
                "other-model".to_string(),
            ]),
            allow_custom_models: false,
        },
    );
    context.provider_instances.insert(
        "provider-selected".to_string(),
        FlowCompileProviderInstance {
            provider_instance_id: "provider-selected".to_string(),
            provider_code: "fixture_provider".to_string(),
            protocol: "openai_compatible".to_string(),
            is_ready: true,
            is_runnable: true,
            included_in_main: true,
            available_models: BTreeSet::from(["other-model".to_string()]),
            allow_custom_models: false,
        },
    );

    let plan = FlowCompiler::compile(flow_id, "draft-1", &sample_document(flow_id), &context).unwrap();

    assert!(
        plan.compile_issues
            .iter()
            .any(|issue| issue.code == CompileIssueCode::ModelNotAvailable)
    );
}

#[test]
fn compile_collects_missing_source_instance_issue() {
    let flow_id = Uuid::now_v7();
    let mut document = sample_document(flow_id);
    document["graph"]["nodes"][1]["config"]["model_provider"]["source_instance_id"] = Value::Null;

    let plan = FlowCompiler::compile(flow_id, "draft-1", &document, &compile_context()).unwrap();

    assert!(
        plan.compile_issues
            .iter()
            .any(|issue| issue.code == CompileIssueCode::MissingProviderInstance)
    );
}

#[test]
fn compile_rejects_legacy_top_level_llm_config_shape() {
    let flow_id = Uuid::now_v7();
    let mut document = sample_document(flow_id);
    document["graph"]["nodes"][1]["config"] = json!({
        "provider_code": "fixture_provider",
        "source_instance_id": "provider-selected",
        "model": "gpt-5.4-mini"
    });

    let plan = FlowCompiler::compile(flow_id, "draft-1", &document, &compile_context()).unwrap();

    assert!(
        plan.compile_issues
            .iter()
            .any(|issue| issue.code == CompileIssueCode::MissingProviderInstance)
    );
    assert!(
        plan.compile_issues
            .iter()
            .any(|issue| issue.code == CompileIssueCode::MissingModel)
    );
}

#[test]
fn compile_plugin_node_emits_runtime_reference_from_registry_identity() {
    let flow_id = Uuid::now_v7();
    let plugin_context = plugin_compile_context();
    let installation_id = plugin_context
        .node_contributions
        .values()
        .next()
        .expect("plugin contribution should exist")
        .installation_id;
    let plan = FlowCompiler::compile(
        flow_id,
        "draft-1",
        &plugin_document(flow_id),
        &plugin_context,
    )
    .unwrap();

    let plan_json = serde_json::to_value(&plan).unwrap();

    assert_eq!(
        plan_json["nodes"]["node-plugin"]["node_type"],
        "plugin_node"
    );
    assert_eq!(
        plan_json["nodes"]["node-plugin"]["plugin_runtime"]["contribution_code"],
        "openai_prompt"
    );
    assert_eq!(
        plan_json["nodes"]["node-plugin"]["plugin_runtime"]["installation_id"],
        installation_id.to_string()
    );
}

#[test]
fn compile_plugin_node_reports_dependency_issue_when_registry_information_is_missing() {
    let flow_id = Uuid::now_v7();
    let plan = FlowCompiler::compile(
        flow_id,
        "draft-1",
        &plugin_document(flow_id),
        &compile_context(),
    )
    .unwrap();

    assert!(
        plan.compile_issues
            .iter()
            .any(|issue| issue.node_id == "node-plugin"),
        "expected a compile issue for the plugin node, got {:?}",
        plan.compile_issues
    );
}
