use control_plane::errors::ControlPlaneError;
use control_plane::orchestration_runtime::{
    CancelFlowRunCommand, ContinueFlowDebugRunCommand, OrchestrationRuntimeService,
    StartFlowDebugRunCommand,
};
use domain::FlowRunStatus;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
async fn cancel_flow_run_marks_running_debug_run_as_cancelled() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;
    let started = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: json!({
                "node-start": { "query": "请总结退款政策" }
            }),
        })
        .await
        .unwrap();
    service
        .force_flow_run_status(started.flow_run.id, FlowRunStatus::Running)
        .await;

    let detail = service
        .cancel_flow_run(CancelFlowRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_run_id: started.flow_run.id,
        })
        .await
        .unwrap();

    assert_eq!(detail.flow_run.status, FlowRunStatus::Cancelled);
    assert!(detail
        .events
        .iter()
        .any(|event| event.event_type == "flow_run_cancelled"));
}

#[tokio::test]
async fn cancel_flow_run_rejects_terminal_status() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_human_input_flow("Support Agent").await;
    let started = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: json!({
                "node-start": { "query": "请总结退款政策" }
            }),
        })
        .await
        .unwrap();
    let detail = service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: started.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();
    service
        .force_flow_run_status(detail.flow_run.id, FlowRunStatus::Succeeded)
        .await;

    let error = service
        .cancel_flow_run(CancelFlowRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
        })
        .await
        .unwrap_err();

    assert!(matches!(
        error.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::InvalidStateTransition { resource, from, to, .. })
            if *resource == "flow_run" && from == "succeeded" && to == "cancelled"
    ));
}
