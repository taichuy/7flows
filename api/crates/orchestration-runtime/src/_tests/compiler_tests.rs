use orchestration_runtime::compiler::FlowCompiler;
use serde_json::json;
use uuid::Uuid;

fn sample_document(flow_id: Uuid) -> serde_json::Value {
    json!({
        "schemaVersion": "1flowse.flow/v1",
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
                    "config": { "model": "gpt-5.4-mini", "temperature": 0.2 },
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
fn compile_flow_document_emits_topology_and_selector_dependencies() {
    let flow_id = Uuid::now_v7();
    let plan = FlowCompiler::compile(flow_id, "draft-1", &sample_document(flow_id)).unwrap();

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
}

#[test]
fn compile_rejects_edge_that_targets_unknown_node() {
    let flow_id = Uuid::now_v7();
    let mut document = sample_document(flow_id);
    document["graph"]["edges"][0]["target"] = json!("missing-node");

    let error = FlowCompiler::compile(flow_id, "draft-1", &document).unwrap_err();

    assert!(error.to_string().contains("missing-node"));
}
