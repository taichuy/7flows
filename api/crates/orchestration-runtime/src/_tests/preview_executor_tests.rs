use std::collections::BTreeMap;

use serde_json::json;
use uuid::Uuid;

use crate::{
    compiled_plan::{CompiledBinding, CompiledNode, CompiledOutput, CompiledPlan},
    preview_executor,
};

fn sample_compiled_plan() -> CompiledPlan {
    let flow_id = Uuid::now_v7();
    let mut bindings = BTreeMap::new();
    bindings.insert(
        "user_prompt".to_string(),
        CompiledBinding {
            kind: "selector".to_string(),
            raw_value: json!(["node-start", "query"]),
            selector_paths: vec![vec!["node-start".to_string(), "query".to_string()]],
        },
    );
    bindings.insert(
        "system_prompt".to_string(),
        CompiledBinding {
            kind: "templated_text".to_string(),
            raw_value: json!("You are helpful."),
            selector_paths: Vec::new(),
        },
    );

    let mut nodes = BTreeMap::new();
    nodes.insert(
        "node-llm".to_string(),
        CompiledNode {
            node_id: "node-llm".to_string(),
            node_type: "llm".to_string(),
            alias: "LLM".to_string(),
            container_id: None,
            dependency_node_ids: vec!["node-start".to_string()],
            downstream_node_ids: Vec::new(),
            bindings,
            outputs: vec![CompiledOutput {
                key: "text".to_string(),
                title: "模型输出".to_string(),
                value_type: "string".to_string(),
            }],
            config: json!({ "model": "gpt-5.4-mini" }),
        },
    );

    CompiledPlan {
        flow_id,
        source_draft_id: "draft-1".to_string(),
        schema_version: "1flowse.flow/v1".to_string(),
        topological_order: vec!["node-start".to_string(), "node-llm".to_string()],
        nodes,
    }
}

#[test]
fn preview_executor_resolves_bindings_and_renders_prompt_for_target_node() {
    let plan = sample_compiled_plan();
    let outcome = preview_executor::run_node_preview(
        &plan,
        "node-llm",
        &serde_json::json!({ "node-start": { "query": "退款流程是什么？" } }),
    )
    .unwrap();

    assert_eq!(outcome.target_node_id, "node-llm");
    assert_eq!(outcome.resolved_inputs["user_prompt"], "退款流程是什么？");
    assert_eq!(outcome.rendered_templates["system_prompt"], "You are helpful.");
}
