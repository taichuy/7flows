use control_plane::orchestration_runtime::{
    OrchestrationRuntimeService, StartFlowDebugRunCommand, StartNodeDebugPreviewCommand,
};

#[tokio::test]
async fn start_node_debug_preview_creates_run_node_run_and_events() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;

    let outcome = service
        .start_node_debug_preview(StartNodeDebugPreviewCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            node_id: "node-llm".to_string(),
            input_payload: serde_json::json!({
                "node-start": { "query": "请总结退款政策" }
            }),
        })
        .await
        .unwrap();

    assert_eq!(outcome.flow_run.status, domain::FlowRunStatus::Succeeded);
    assert_eq!(outcome.node_run.status, domain::NodeRunStatus::Succeeded);
    assert!(outcome
        .events
        .iter()
        .any(|event| event.event_type == "node_preview_completed"));
}

#[tokio::test]
async fn start_node_debug_preview_uses_primary_routed_provider_instance() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service
        .seed_application_with_multi_instance_provider_flow("Support Agent")
        .await;

    let outcome = service
        .start_node_debug_preview(StartNodeDebugPreviewCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            node_id: "node-llm".to_string(),
            input_payload: serde_json::json!({
                "node-start": { "query": "请总结退款政策" }
            }),
        })
        .await
        .unwrap();

    assert_eq!(
        outcome.preview_payload["metrics_payload"]["provider_instance_id"],
        serde_json::json!(seeded.primary_provider_instance_id.to_string())
    );
}

#[tokio::test]
async fn start_flow_debug_run_executes_plugin_node_through_capability_runtime() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service
        .seed_application_with_plugin_node_flow("Capability Agent")
        .await;

    let detail = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({
                "node-start": { "query": "world" }
            }),
        })
        .await
        .unwrap();

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Succeeded);
    assert_eq!(detail.node_runs[1].node_type, "plugin_node");
    assert_eq!(detail.node_runs[1].output_payload["answer"], "world");
}
