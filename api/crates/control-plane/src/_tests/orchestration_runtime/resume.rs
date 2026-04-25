use control_plane::errors::ControlPlaneError;
use control_plane::orchestration_runtime::{
    CompleteCallbackTaskCommand, ContinueFlowDebugRunCommand, OrchestrationRuntimeService,
    ResumeFlowRunCommand, StartFlowDebugRunCommand,
};
use domain::FlowRunStatus;
use serde_json::json;
use uuid::Uuid;

#[tokio::test]
async fn continue_flow_debug_run_stops_at_human_input_and_persists_waiting_state() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service
        .seed_application_with_human_input_flow("Support Agent")
        .await;

    let started = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: json!({ "node-start": { "query": "请总结退款政策" } }),
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

    assert_eq!(detail.flow_run.run_mode.as_str(), "debug_flow_run");
    assert_eq!(detail.flow_run.status.as_str(), "waiting_human");
    assert_eq!(
        detail.node_runs.last().unwrap().status.as_str(),
        "waiting_human"
    );
    assert_eq!(detail.checkpoints.len(), 1);
}

#[tokio::test]
async fn resume_flow_run_with_human_input_finishes_downstream_answer_node() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_waiting_human_run("Support Agent").await;

    let detail = service
        .resume_flow_run(ResumeFlowRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_run_id: seeded.flow_run_id,
            checkpoint_id: seeded.checkpoint_id,
            input_payload: json!({ "node-human": { "input": "已审核通过" } }),
        })
        .await
        .unwrap();

    assert_eq!(detail.flow_run.status.as_str(), "succeeded");
    assert_eq!(detail.node_runs.last().unwrap().node_id, "node-answer");
    assert_eq!(
        detail.flow_run.output_payload["answer"],
        json!("已审核通过")
    );
}

#[tokio::test]
async fn complete_callback_task_updates_task_and_requeues_waiting_run() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_waiting_callback_run("Support Agent").await;

    let detail = service
        .complete_callback_task(CompleteCallbackTaskCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            callback_task_id: seeded.callback_task_id,
            response_payload: json!({ "result": { "status": "ok" } }),
        })
        .await
        .unwrap();

    assert_eq!(detail.callback_tasks[0].status.as_str(), "completed");
    assert_eq!(detail.flow_run.status.as_str(), "succeeded");
}

#[tokio::test]
async fn resume_flow_run_rejects_terminal_flow_status_transition() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_waiting_human_run("Support Agent").await;
    service
        .force_flow_run_status(seeded.flow_run_id, FlowRunStatus::Succeeded)
        .await;

    let error = service
        .resume_flow_run(ResumeFlowRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_run_id: seeded.flow_run_id,
            checkpoint_id: seeded.checkpoint_id,
            input_payload: json!({ "node-human": { "input": "已审核通过" } }),
        })
        .await
        .unwrap_err();

    assert!(matches!(
        error.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::InvalidStateTransition { resource, from, to, .. })
            if *resource == "flow_run" && from == "succeeded" && to == "succeeded"
    ));
}
