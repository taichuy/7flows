use std::collections::BTreeMap;

use orchestration_runtime::binding_runtime::resolve_node_inputs;
use orchestration_runtime::compiled_plan::{CompiledBinding, CompiledNode};
use serde_json::{json, Map, Value};

fn compiled_node(binding: CompiledBinding) -> CompiledNode {
    CompiledNode {
        node_id: "node-data-model".to_string(),
        node_type: "data_model_list".to_string(),
        alias: "Orders".to_string(),
        container_id: None,
        dependency_node_ids: Vec::new(),
        downstream_node_ids: Vec::new(),
        bindings: BTreeMap::from([("query".to_string(), binding)]),
        outputs: Vec::new(),
        config: json!({ "data_model_code": "orders" }),
        plugin_runtime: None,
        llm_runtime: None,
    }
}

#[test]
fn resolve_data_model_query_binding_with_constant_and_selector_values() {
    let node = compiled_node(CompiledBinding {
        kind: "data_model_query".to_string(),
        raw_value: json!({
            "filters": [
                { "field_code": "status", "operator": "eq", "value": { "kind": "constant", "value": "paid" } },
                { "field_code": "customer_id", "operator": "eq", "value": { "kind": "selector", "selector": ["node-start", "customer_id"] } }
            ],
            "sorts": [{ "field_code": "created_at", "direction": "desc" }],
            "expand_relations": ["customer"],
            "page": { "kind": "constant", "value": 1 },
            "page_size": { "kind": "selector", "selector": ["node-start", "page_size"] }
        }),
        selector_paths: vec![],
    });
    let variable_pool = Map::from_iter([(
        "node-start".to_string(),
        json!({ "customer_id": "customer-1", "page_size": 50 }),
    )]);

    let resolved = resolve_node_inputs(&node, &variable_pool).unwrap();

    assert_eq!(
        resolved["query"],
        json!({
            "filters": [
                { "field_code": "status", "operator": "eq", "value": "paid" },
                { "field_code": "customer_id", "operator": "eq", "value": "customer-1" }
            ],
            "sorts": [{ "field_code": "created_at", "direction": "desc" }],
            "expand_relations": ["customer"],
            "page": 1,
            "page_size": 50
        })
    );
}

#[test]
fn resolve_data_model_query_rejects_invalid_operator() {
    let node = compiled_node(CompiledBinding {
        kind: "data_model_query".to_string(),
        raw_value: json!({
            "filters": [
                { "field_code": "status", "operator": "contains", "value": { "kind": "constant", "value": "paid" } }
            ],
            "sorts": [],
            "expand_relations": [],
            "page": { "kind": "constant", "value": 1 },
            "page_size": { "kind": "constant", "value": 20 }
        }),
        selector_paths: vec![],
    });

    let error = resolve_node_inputs(&node, &Map::<String, Value>::new()).unwrap_err();

    assert!(error
        .to_string()
        .contains("data_model list filter operator is unsupported"));
}
