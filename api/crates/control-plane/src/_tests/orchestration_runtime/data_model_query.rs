use control_plane::orchestration_runtime::{
    ContinueFlowDebugRunCommand, OrchestrationRuntimeService, StartFlowDebugRunCommand,
};
use serde_json::{json, Value};
use uuid::Uuid;

type TestService = OrchestrationRuntimeService<
    crate::orchestration_runtime::test_support::InMemoryOrchestrationRuntimeRepository,
    crate::orchestration_runtime::test_support::InMemoryProviderRuntime,
>;

#[tokio::test]
async fn orchestration_runtime_data_model_list_applies_filter_sort_and_pagination() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![
            create_order_node("node-create-a", "Order A", "draft"),
            create_order_node("node-create-c", "Order C", "paid"),
            create_order_node("node-create-b", "Order B", "paid"),
            data_model_node(
                "node-list",
                "list",
                json!({}),
                json!({
                    "query": data_model_query_binding(json!({
                        "filters": [
                            {
                                "field_code": "status",
                                "operator": "eq",
                                "value": { "kind": "constant", "value": "paid" }
                            }
                        ],
                        "sorts": [{ "field_code": "title", "direction": "desc" }],
                        "expand_relations": [],
                        "page": { "kind": "constant", "value": 2 },
                        "page_size": { "kind": "constant", "value": 1 }
                    }))
                }),
            ),
        ],
        vec![
            ("node-create-a".to_string(), "node-create-c".to_string()),
            ("node-create-c".to_string(), "node-create-b".to_string()),
            ("node-create-b".to_string(), "node-list".to_string()),
        ],
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Succeeded);
    let list_node = node_run(&detail, "node-list");
    assert_eq!(list_node.output_payload["total"], json!(2));
    assert_eq!(
        list_node.output_payload["records"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        list_node.output_payload["records"][0]["title"],
        json!("Order B")
    );
}

#[tokio::test]
async fn orchestration_runtime_data_model_list_clamps_large_page_size() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;
    let create_ids = (0..101)
        .map(|index| format!("node-create-{index:03}"))
        .collect::<Vec<_>>();
    let mut nodes = create_ids
        .iter()
        .enumerate()
        .map(|(index, node_id)| create_order_node(node_id, &format!("Order {index:03}"), "paid"))
        .collect::<Vec<_>>();

    nodes.push(data_model_node(
        "node-list",
        "list",
        json!({}),
        json!({
            "query": data_model_query_binding(json!({
                "filters": [],
                "sorts": [{ "field_code": "title", "direction": "asc" }],
                "expand_relations": [],
                "page": { "kind": "constant", "value": 1 },
                "page_size": { "kind": "constant", "value": 999 }
            }))
        }),
    ));

    let mut edges = create_ids
        .windows(2)
        .map(|pair| (pair[0].clone(), pair[1].clone()))
        .collect::<Vec<_>>();
    edges.push((create_ids.last().unwrap().clone(), "node-list".to_string()));

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        nodes,
        edges,
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Succeeded);
    let list_node = node_run(&detail, "node-list");
    let records = list_node.output_payload["records"].as_array().unwrap();
    assert_eq!(list_node.output_payload["total"], json!(101));
    assert_eq!(records.len(), 100);
}

#[tokio::test]
async fn orchestration_runtime_data_model_create_ignores_residual_query_binding() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node(
            "node-create",
            "create",
            json!({ "payload": { "title": "Order A", "status": "draft" } }),
            json!({
                "query": data_model_query_binding(json!({
                    "filters": [
                        {
                            "field_code": "status",
                            "operator": "contains",
                            "value": { "kind": "constant", "value": "draft" }
                        }
                    ],
                    "sorts": [],
                    "expand_relations": [],
                    "page": { "kind": "constant", "value": 1 },
                    "page_size": { "kind": "constant", "value": 20 }
                }))
            }),
        )],
        vec![],
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Succeeded);
    assert_eq!(
        node_run(&detail, "node-create").output_payload["record"]["title"],
        json!("Order A")
    );
}

#[tokio::test]
async fn orchestration_runtime_data_model_list_reports_invalid_query_operator() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node(
            "node-list",
            "list",
            json!({}),
            json!({
                "query": data_model_query_binding(json!({
                    "filters": [
                        {
                            "field_code": "status",
                            "operator": "contains",
                            "value": { "kind": "constant", "value": "draft" }
                        }
                    ],
                    "sorts": [],
                    "expand_relations": [],
                    "page": { "kind": "constant", "value": 1 },
                    "page_size": { "kind": "constant", "value": 20 }
                }))
            }),
        )],
        vec![],
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Failed);
    assert!(detail
        .flow_run
        .error_payload
        .as_ref()
        .and_then(|payload| payload["message"].as_str())
        .is_some_and(|message| message.contains("filter operator is unsupported")));
}

#[tokio::test]
async fn orchestration_runtime_data_model_list_validates_metadata_query_shape() {
    let cases = [
        (
            json!({
                "filters": [{ "field_code": "status", "operator": "contains", "value": "paid" }],
                "sorts": [],
                "expand_relations": [],
                "page": 1,
                "page_size": 20
            }),
            "filter operator is unsupported",
        ),
        (
            json!({
                "filters": [{ "field_code": "unknown", "operator": "eq", "value": "paid" }],
                "sorts": [],
                "expand_relations": [],
                "page": 1,
                "page_size": 20
            }),
            "undeclared field code",
        ),
        (
            json!({
                "filters": [],
                "sorts": [{ "field_code": "unknown", "direction": "asc" }],
                "expand_relations": [],
                "page": 1,
                "page_size": 20
            }),
            "undeclared sort field",
        ),
        (
            json!({
                "filters": [],
                "sorts": [{ "field_code": "title", "direction": "sideways" }],
                "expand_relations": [],
                "page": 1,
                "page_size": 20
            }),
            "sort direction is unsupported",
        ),
        (
            json!({
                "filters": [],
                "sorts": [],
                "expand_relations": ["unknown"],
                "page": 1,
                "page_size": 20
            }),
            "undeclared relation code",
        ),
        (
            json!({
                "filters": [],
                "sorts": [],
                "expand_relations": ["title"],
                "page": 1,
                "page_size": 20
            }),
            "unsupported relation expansion",
        ),
        (
            json!({
                "filters": [],
                "sorts": [],
                "expand_relations": [],
                "page": "2",
                "page_size": 20
            }),
            "page must be integer",
        ),
        (
            json!({
                "filters": [],
                "sorts": [],
                "expand_relations": [],
                "page": 1,
                "page_size": {}
            }),
            "page_size must be integer",
        ),
    ];

    for (query, expected_message) in cases {
        let detail = run_list_config_query(query).await;

        assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Failed);
        let message = node_run(&detail, "node-list")
            .error_payload
            .as_ref()
            .and_then(|payload| payload["message"].as_str())
            .unwrap_or("");
        assert!(
            message.contains(expected_message),
            "expected {expected_message:?}, got {message:?}",
        );
    }
}

async fn run_list_config_query(query: Value) -> domain::ApplicationRunDetail {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node(
            "node-list",
            "list",
            json!({ "query": query }),
            json!({}),
        )],
        vec![],
    )
    .await
}

async fn run_data_model_flow(
    service: &TestService,
    actor_user_id: Uuid,
    application_id: Uuid,
    flow_id: Uuid,
    nodes: Vec<Value>,
    edges: Vec<(String, String)>,
) -> domain::ApplicationRunDetail {
    let started = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id,
            application_id,
            input_payload: json!({}),
            document_snapshot: Some(data_model_flow_document(flow_id, nodes, edges)),
        })
        .await
        .expect("data model debug run should start");

    service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id,
            flow_run_id: started.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .expect("data model debug run should return persisted detail")
}

fn node_run<'a>(
    detail: &'a domain::ApplicationRunDetail,
    node_id: &str,
) -> &'a domain::NodeRunRecord {
    detail
        .node_runs
        .iter()
        .find(|node_run| node_run.node_id == node_id)
        .unwrap_or_else(|| panic!("node run {node_id} should exist"))
}

fn data_model_flow_document(
    flow_id: Uuid,
    data_model_nodes: Vec<Value>,
    edges: Vec<(String, String)>,
) -> Value {
    let mut nodes = vec![json!({
        "id": "node-start",
        "type": "start",
        "alias": "Start",
        "description": "",
        "containerId": null,
        "position": { "x": 0, "y": 0 },
        "configVersion": 1,
        "config": {},
        "bindings": {},
        "outputs": [{ "key": "query", "title": "Input", "valueType": "string" }]
    })];
    nodes.extend(data_model_nodes);

    json!({
        "schemaVersion": "1flowbase.flow/v1",
        "meta": {
            "flowId": flow_id.to_string(),
            "name": "Data Model Agent",
            "description": "",
            "tags": []
        },
        "graph": {
            "nodes": nodes,
            "edges": edges.into_iter().enumerate().map(|(index, (source, target))| {
                json!({
                    "id": format!("edge-{index}"),
                    "source": source,
                    "target": target,
                    "sourceHandle": null,
                    "targetHandle": null,
                    "containerId": null,
                    "points": []
                })
            }).collect::<Vec<_>>()
        },
        "editor": {
            "viewport": { "x": 0, "y": 0, "zoom": 1 },
            "annotations": [],
            "activeContainerPath": []
        }
    })
}

fn create_order_node(id: &str, title: &str, status: &str) -> Value {
    data_model_node(
        id,
        "create",
        json!({ "payload": { "title": title, "status": status } }),
        json!({}),
    )
}

fn data_model_node(id: &str, action: &str, config_patch: Value, bindings: Value) -> Value {
    let mut config = serde_json::Map::from_iter([("data_model_code".to_string(), json!("orders"))]);
    if let Some(patch) = config_patch.as_object() {
        config.extend(patch.clone());
    }

    json!({
        "id": id,
        "type": data_model_node_type(action),
        "alias": format!("Data Model {}", action),
        "description": "",
        "containerId": null,
        "position": { "x": 240, "y": 0 },
        "configVersion": 1,
        "config": Value::Object(config),
        "bindings": bindings,
        "outputs": [{ "key": "record", "title": "Record", "valueType": "object" }]
    })
}

fn data_model_node_type(action: &str) -> &'static str {
    match action {
        "list" => "data_model_list",
        "get" => "data_model_get",
        "create" => "data_model_create",
        "update" => "data_model_update",
        "delete" => "data_model_delete",
        _ => panic!("unsupported data model action in test: {action}"),
    }
}

fn data_model_query_binding(value: Value) -> Value {
    json!({
        "kind": "data_model_query",
        "value": value
    })
}
