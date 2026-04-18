use std::collections::{BTreeMap, BTreeSet};

use orchestration_runtime::compiled_plan::CompileIssueCode;
use orchestration_runtime::compiler::{
    FlowCompileContext, FlowCompileProviderInstance, FlowCompiler,
};
use serde_json::json;
use uuid::Uuid;

fn compile_context() -> FlowCompileContext {
    FlowCompileContext {
        provider_instances: BTreeMap::from([(
            "provider-ready".to_string(),
            FlowCompileProviderInstance {
                provider_instance_id: "provider-ready".to_string(),
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                is_ready: true,
                available_models: BTreeSet::from(["gpt-5.4-mini".to_string()]),
                allow_custom_models: false,
            },
        )]),
    }
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
                        "provider_instance_id": "provider-ready",
                        "model": "gpt-5.4-mini",
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
        "provider_instance_id": "provider-ready",
        "model": "unknown-model"
    });

    let plan = FlowCompiler::compile(flow_id, "draft-1", &document, &compile_context()).unwrap();

    assert_eq!(plan.compile_issues.len(), 1);
    assert_eq!(
        plan.compile_issues[0].code,
        CompileIssueCode::ModelNotAvailable
    );
}
