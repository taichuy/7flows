use anyhow::{anyhow, Result};
use plugin_framework::provider_contract::ProviderStreamEvent;
use serde_json::{json, Value};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    flow::FlowService,
    ports::{
        AppendRunEventInput, CreateCallbackTaskInput, CreateCheckpointInput, CreateFlowRunInput,
        CreateNodeRunInput, OrchestrationRuntimeRepository, UpdateFlowRunInput, UpdateNodeRunInput,
    },
    state_transition::{ensure_flow_run_transition, ensure_node_run_transition},
};

use super::{
    compile_context::ensure_compiled_plan_runnable,
    inputs::build_compiled_plan_input,
    CancelFlowRunCommand, ContinueFlowDebugRunCommand, OrchestrationRuntimeService,
    StartFlowDebugRunCommand,
};

pub(super) async fn start_flow_debug_run<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    command: StartFlowDebugRunCommand,
) -> Result<domain::ApplicationRunDetail>
where
    R: crate::ports::ApplicationRepository
        + crate::ports::FlowRepository
        + OrchestrationRuntimeRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone,
    H: crate::ports::ProviderRuntimePort + crate::capability_plugin_runtime::CapabilityPluginRuntimePort + Clone,
{
    let actor = service
        .repository
        .load_actor_context_for_user(command.actor_user_id)
        .await?;
    let editor_state = FlowService::new(service.repository.clone())
        .get_or_create_editor_state(command.actor_user_id, command.application_id)
        .await?;
    let application = service
        .repository
        .get_application(actor.current_workspace_id, command.application_id)
        .await?
        .ok_or(ControlPlaneError::NotFound("application"))?;
    let compile_context = service.build_compile_context(application.workspace_id).await?;
    let compiled_plan = orchestration_runtime::compiler::FlowCompiler::compile(
        editor_state.flow.id,
        &editor_state.draft.id.to_string(),
        &editor_state.draft.document,
        &compile_context,
    )?;
    ensure_compiled_plan_runnable(&compiled_plan)?;
    let compiled_record = service
        .repository
        .upsert_compiled_plan(&build_compiled_plan_input(
            command.actor_user_id,
            &editor_state,
            &compiled_plan,
        )?)
        .await?;
    let flow_run = service
        .repository
        .create_flow_run(&CreateFlowRunInput {
            actor_user_id: command.actor_user_id,
            application_id: command.application_id,
            flow_id: editor_state.flow.id,
            flow_draft_id: editor_state.draft.id,
            compiled_plan_id: compiled_record.id,
            run_mode: domain::FlowRunMode::DebugFlowRun,
            target_node_id: None,
            status: domain::FlowRunStatus::Running,
            input_payload: command.input_payload.clone(),
            started_at: OffsetDateTime::now_utc(),
        })
        .await?;

    service
        .repository
        .append_run_event(&AppendRunEventInput {
            flow_run_id: flow_run.id,
            node_run_id: None,
            event_type: "flow_run_started".to_string(),
            payload: json!({
                "run_mode": domain::FlowRunMode::DebugFlowRun.as_str(),
                "input_payload": command.input_payload,
            }),
        })
        .await?;

    load_run_detail(&service.repository, command.application_id, flow_run.id).await
}

pub(super) async fn continue_flow_debug_run<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    command: ContinueFlowDebugRunCommand,
) -> Result<domain::ApplicationRunDetail>
where
    R: crate::ports::ApplicationRepository
        + crate::ports::FlowRepository
        + OrchestrationRuntimeRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone,
    H: crate::ports::ProviderRuntimePort + crate::capability_plugin_runtime::CapabilityPluginRuntimePort + Clone,
{
    let result = continue_flow_debug_run_inner(service, &command).await;

    match result {
        Ok(detail) => Ok(detail),
        Err(error) => fail_flow_run(service, command.application_id, command.flow_run_id, &error)
            .await
            .or(Err(error)),
    }
}

pub(super) async fn cancel_flow_run<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    command: CancelFlowRunCommand,
) -> Result<domain::ApplicationRunDetail>
where
    R: crate::ports::ApplicationRepository
        + crate::ports::FlowRepository
        + OrchestrationRuntimeRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone,
    H: crate::ports::ProviderRuntimePort + crate::capability_plugin_runtime::CapabilityPluginRuntimePort + Clone,
{
    let actor = service
        .repository
        .load_actor_context_for_user(command.actor_user_id)
        .await?;
    service
        .repository
        .get_application(actor.current_workspace_id, command.application_id)
        .await?
        .ok_or(ControlPlaneError::NotFound("application"))?;
    let flow_run = service
        .repository
        .get_flow_run(command.application_id, command.flow_run_id)
        .await?
        .ok_or_else(|| anyhow!("flow run not found"))?;
    ensure_flow_run_transition(flow_run.status, domain::FlowRunStatus::Cancelled, "cancel_flow_run")?;
    service
        .repository
        .update_flow_run(&UpdateFlowRunInput {
            flow_run_id: flow_run.id,
            status: domain::FlowRunStatus::Cancelled,
            output_payload: flow_run.output_payload,
            error_payload: flow_run.error_payload,
            finished_at: Some(OffsetDateTime::now_utc()),
        })
        .await?;
    service
        .repository
        .append_run_event(&AppendRunEventInput {
            flow_run_id: flow_run.id,
            node_run_id: None,
            event_type: "flow_run_cancelled".to_string(),
            payload: json!({
                "reason": "manual_stop",
            }),
        })
        .await?;

    load_run_detail(&service.repository, command.application_id, flow_run.id).await
}

async fn continue_flow_debug_run_inner<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    command: &ContinueFlowDebugRunCommand,
) -> Result<domain::ApplicationRunDetail>
where
    R: crate::ports::ApplicationRepository
        + crate::ports::FlowRepository
        + OrchestrationRuntimeRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone,
    H: crate::ports::ProviderRuntimePort + crate::capability_plugin_runtime::CapabilityPluginRuntimePort + Clone,
{
    let flow_run = service
        .repository
        .get_flow_run(command.application_id, command.flow_run_id)
        .await?
        .ok_or_else(|| anyhow!("flow run not found"))?;
    if flow_run.status != domain::FlowRunStatus::Running {
        return load_run_detail(&service.repository, command.application_id, flow_run.id).await;
    }
    let application = service
        .repository
        .get_application(command.workspace_id, command.application_id)
        .await?
        .ok_or(ControlPlaneError::NotFound("application"))?;
    let compiled_record = service
        .repository
        .get_compiled_plan(flow_run.compiled_plan_id)
        .await?
        .ok_or_else(|| anyhow!("compiled plan not found"))?;
    let compiled_plan: orchestration_runtime::compiled_plan::CompiledPlan =
        serde_json::from_value(compiled_record.plan)?;
    let invoker = service.runtime_invoker(application.workspace_id);
    let mut variable_pool = flow_run
        .input_payload
        .as_object()
        .cloned()
        .ok_or_else(|| anyhow!("input payload must be an object"))?;
    let mut last_output_payload = json!({});

    for node_id in &compiled_plan.topological_order {
        if is_run_cancelled(&service.repository, command.application_id, flow_run.id).await? {
            return load_run_detail(&service.repository, command.application_id, flow_run.id).await;
        }

        let node = compiled_plan
            .nodes
            .get(node_id)
            .ok_or_else(|| anyhow!("compiled node missing: {node_id}"))?;
        let resolved_inputs =
            orchestration_runtime::binding_runtime::resolve_node_inputs(node, &variable_pool)?;
        let rendered_templates =
            orchestration_runtime::binding_runtime::render_templated_bindings(node, &resolved_inputs);
        let node_run = service
            .repository
            .create_node_run(&CreateNodeRunInput {
                flow_run_id: flow_run.id,
                node_id: node.node_id.clone(),
                node_type: node.node_type.clone(),
                node_alias: node.alias.clone(),
                status: domain::NodeRunStatus::Running,
                input_payload: Value::Object(resolved_inputs.clone()),
                started_at: OffsetDateTime::now_utc(),
            })
            .await?;

        match node.node_type.as_str() {
            "start" => {
                let output_payload = variable_pool
                    .get(node_id)
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                last_output_payload = output_payload.clone();
                service
                    .repository
                    .update_node_run(&UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: domain::NodeRunStatus::Succeeded,
                        output_payload,
                        error_payload: None,
                        metrics_payload: json!({ "preview_mode": true }),
                        finished_at: Some(OffsetDateTime::now_utc()),
                    })
                    .await?;
            }
            "llm" => {
                let execution = orchestration_runtime::execution_engine::execute_llm_node(
                    node,
                    &resolved_inputs,
                    &rendered_templates,
                    &invoker,
                )
                .await?;
                last_output_payload = execution.output_payload.clone();
                let node_status = if execution.error_payload.is_some() {
                    domain::NodeRunStatus::Failed
                } else {
                    domain::NodeRunStatus::Succeeded
                };
                ensure_node_run_transition(
                    domain::NodeRunStatus::Running,
                    node_status,
                    "continue_flow_debug_run",
                )?;
                service
                    .repository
                    .update_node_run(&UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: node_status,
                        output_payload: execution.output_payload.clone(),
                        error_payload: execution.error_payload.clone(),
                        metrics_payload: execution.metrics_payload.clone(),
                        finished_at: Some(OffsetDateTime::now_utc()),
                    })
                    .await?;
                append_provider_stream_events(
                    &service.repository,
                    flow_run.id,
                    Some(node_run.id),
                    &execution.provider_events,
                )
                .await?;

                if is_run_cancelled(&service.repository, command.application_id, flow_run.id).await? {
                    return load_run_detail(&service.repository, command.application_id, flow_run.id)
                        .await;
                }

                if let Some(error_payload) = execution.error_payload {
                    ensure_flow_run_transition(
                        domain::FlowRunStatus::Running,
                        domain::FlowRunStatus::Failed,
                        "continue_flow_debug_run",
                    )?;
                    service
                        .repository
                        .update_flow_run(&UpdateFlowRunInput {
                            flow_run_id: flow_run.id,
                            status: domain::FlowRunStatus::Failed,
                            output_payload: last_output_payload.clone(),
                            error_payload: Some(error_payload.clone()),
                            finished_at: Some(OffsetDateTime::now_utc()),
                        })
                        .await?;
                    service
                        .repository
                        .append_run_event(&AppendRunEventInput {
                            flow_run_id: flow_run.id,
                            node_run_id: Some(node_run.id),
                            event_type: "flow_run_failed".to_string(),
                            payload: error_payload,
                        })
                        .await?;
                    return load_run_detail(&service.repository, command.application_id, flow_run.id)
                        .await;
                }

                variable_pool.insert(node.node_id.clone(), execution.output_payload);
            }
            "plugin_node" => {
                let execution =
                    orchestration_runtime::execution_engine::execute_capability_plugin_node(
                        node,
                        &resolved_inputs,
                        &rendered_templates,
                        &invoker,
                    )
                    .await?;
                last_output_payload = execution.output_payload.clone();
                let node_status = if execution.error_payload.is_some() {
                    domain::NodeRunStatus::Failed
                } else {
                    domain::NodeRunStatus::Succeeded
                };
                ensure_node_run_transition(
                    domain::NodeRunStatus::Running,
                    node_status,
                    "continue_flow_debug_run",
                )?;
                service
                    .repository
                    .update_node_run(&UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: node_status,
                        output_payload: execution.output_payload.clone(),
                        error_payload: execution.error_payload.clone(),
                        metrics_payload: execution.metrics_payload.clone(),
                        finished_at: Some(OffsetDateTime::now_utc()),
                    })
                    .await?;

                if is_run_cancelled(&service.repository, command.application_id, flow_run.id).await? {
                    return load_run_detail(&service.repository, command.application_id, flow_run.id)
                        .await;
                }

                if let Some(error_payload) = execution.error_payload {
                    ensure_flow_run_transition(
                        domain::FlowRunStatus::Running,
                        domain::FlowRunStatus::Failed,
                        "continue_flow_debug_run",
                    )?;
                    service
                        .repository
                        .update_flow_run(&UpdateFlowRunInput {
                            flow_run_id: flow_run.id,
                            status: domain::FlowRunStatus::Failed,
                            output_payload: last_output_payload.clone(),
                            error_payload: Some(error_payload.clone()),
                            finished_at: Some(OffsetDateTime::now_utc()),
                        })
                        .await?;
                    service
                        .repository
                        .append_run_event(&AppendRunEventInput {
                            flow_run_id: flow_run.id,
                            node_run_id: Some(node_run.id),
                            event_type: "flow_run_failed".to_string(),
                            payload: error_payload,
                        })
                        .await?;
                    return load_run_detail(&service.repository, command.application_id, flow_run.id)
                        .await;
                }

                variable_pool.insert(node.node_id.clone(), execution.output_payload);
            }
            "template_transform" | "answer" => {
                let output_key = first_output_key(node);
                let output_value = rendered_templates
                    .values()
                    .next()
                    .cloned()
                    .unwrap_or_else(|| {
                        resolved_inputs
                            .values()
                            .next()
                            .cloned()
                            .unwrap_or(Value::Null)
                    });
                let output_payload = json!({ output_key: output_value });
                last_output_payload = output_payload.clone();
                variable_pool.insert(node.node_id.clone(), output_payload.clone());
                service
                    .repository
                    .update_node_run(&UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: domain::NodeRunStatus::Succeeded,
                        output_payload,
                        error_payload: None,
                        metrics_payload: json!({ "preview_mode": true }),
                        finished_at: Some(OffsetDateTime::now_utc()),
                    })
                    .await?;
            }
            "human_input" => {
                service
                    .repository
                    .update_node_run(&UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: domain::NodeRunStatus::WaitingHuman,
                        output_payload: json!({}),
                        error_payload: None,
                        metrics_payload: json!({ "preview_mode": true, "waiting": "human_input" }),
                        finished_at: None,
                    })
                    .await?;

                if is_run_cancelled(&service.repository, command.application_id, flow_run.id).await? {
                    return load_run_detail(&service.repository, command.application_id, flow_run.id)
                        .await;
                }

                let prompt = rendered_templates
                    .get("prompt")
                    .and_then(Value::as_str)
                    .unwrap_or("请提供人工输入");
                ensure_flow_run_transition(
                    domain::FlowRunStatus::Running,
                    domain::FlowRunStatus::WaitingHuman,
                    "continue_flow_debug_run",
                )?;
                service
                    .repository
                    .create_checkpoint(&CreateCheckpointInput {
                        flow_run_id: flow_run.id,
                        node_run_id: Some(node_run.id),
                        status: "waiting_human".to_string(),
                        reason: "等待人工输入".to_string(),
                        locator_payload: json!({
                            "node_id": node.node_id,
                            "next_node_index": next_node_index(&compiled_plan, node_id)?,
                        }),
                        variable_snapshot: Value::Object(variable_pool.clone()),
                        external_ref_payload: Some(json!({ "prompt": prompt })),
                    })
                    .await?;
                service
                    .repository
                    .update_flow_run(&UpdateFlowRunInput {
                        flow_run_id: flow_run.id,
                        status: domain::FlowRunStatus::WaitingHuman,
                        output_payload: last_output_payload.clone(),
                        error_payload: None,
                        finished_at: None,
                    })
                    .await?;
                return load_run_detail(&service.repository, command.application_id, flow_run.id).await;
            }
            "tool" | "http_request" => {
                let request_payload = Value::Object(resolved_inputs.clone());
                service
                    .repository
                    .update_node_run(&UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: domain::NodeRunStatus::WaitingCallback,
                        output_payload: json!({}),
                        error_payload: None,
                        metrics_payload: json!({ "preview_mode": true, "waiting": node.node_type }),
                        finished_at: None,
                    })
                    .await?;

                if is_run_cancelled(&service.repository, command.application_id, flow_run.id).await? {
                    return load_run_detail(&service.repository, command.application_id, flow_run.id)
                        .await;
                }

                ensure_flow_run_transition(
                    domain::FlowRunStatus::Running,
                    domain::FlowRunStatus::WaitingCallback,
                    "continue_flow_debug_run",
                )?;
                service
                    .repository
                    .create_checkpoint(&CreateCheckpointInput {
                        flow_run_id: flow_run.id,
                        node_run_id: Some(node_run.id),
                        status: "waiting_callback".to_string(),
                        reason: "等待 callback 回填".to_string(),
                        locator_payload: json!({
                            "node_id": node.node_id,
                            "next_node_index": next_node_index(&compiled_plan, node_id)?,
                        }),
                        variable_snapshot: Value::Object(variable_pool.clone()),
                        external_ref_payload: Some(request_payload.clone()),
                    })
                    .await?;
                service
                    .repository
                    .create_callback_task(&CreateCallbackTaskInput {
                        flow_run_id: flow_run.id,
                        node_run_id: node_run.id,
                        callback_kind: node.node_type.clone(),
                        request_payload: request_payload.clone(),
                        external_ref_payload: Some(request_payload),
                    })
                    .await?;
                service
                    .repository
                    .update_flow_run(&UpdateFlowRunInput {
                        flow_run_id: flow_run.id,
                        status: domain::FlowRunStatus::WaitingCallback,
                        output_payload: last_output_payload.clone(),
                        error_payload: None,
                        finished_at: None,
                    })
                    .await?;
                return load_run_detail(&service.repository, command.application_id, flow_run.id).await;
            }
            other => return Err(anyhow!("unsupported debug node type: {other}")),
        }
    }

    if is_run_cancelled(&service.repository, command.application_id, flow_run.id).await? {
        return load_run_detail(&service.repository, command.application_id, flow_run.id).await;
    }

    ensure_flow_run_transition(
        domain::FlowRunStatus::Running,
        domain::FlowRunStatus::Succeeded,
        "continue_flow_debug_run",
    )?;
    service
        .repository
        .update_flow_run(&UpdateFlowRunInput {
            flow_run_id: flow_run.id,
            status: domain::FlowRunStatus::Succeeded,
            output_payload: last_output_payload.clone(),
            error_payload: None,
            finished_at: Some(OffsetDateTime::now_utc()),
        })
        .await?;
    service
        .repository
        .append_run_event(&AppendRunEventInput {
            flow_run_id: flow_run.id,
            node_run_id: None,
            event_type: "flow_run_completed".to_string(),
            payload: last_output_payload,
        })
        .await?;

    load_run_detail(&service.repository, command.application_id, flow_run.id).await
}

async fn load_run_detail<R>(
    repository: &R,
    application_id: Uuid,
    flow_run_id: Uuid,
) -> Result<domain::ApplicationRunDetail>
where
    R: OrchestrationRuntimeRepository,
{
    repository
        .get_application_run_detail(application_id, flow_run_id)
        .await?
        .ok_or_else(|| anyhow!("flow run detail not found"))
}

async fn fail_flow_run<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    application_id: Uuid,
    flow_run_id: Uuid,
    error: &anyhow::Error,
) -> Result<domain::ApplicationRunDetail>
where
    R: crate::ports::ApplicationRepository
        + crate::ports::FlowRepository
        + OrchestrationRuntimeRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone,
    H: crate::ports::ProviderRuntimePort + crate::capability_plugin_runtime::CapabilityPluginRuntimePort + Clone,
{
    let Some(flow_run) = service
        .repository
        .get_flow_run(application_id, flow_run_id)
        .await? else {
        return Err(anyhow!("flow run not found"));
    };
    if matches!(
        flow_run.status,
        domain::FlowRunStatus::Cancelled
            | domain::FlowRunStatus::Succeeded
            | domain::FlowRunStatus::Failed
    ) {
        return load_run_detail(&service.repository, application_id, flow_run_id).await;
    }
    ensure_flow_run_transition(flow_run.status, domain::FlowRunStatus::Failed, "fail_flow_run")?;
    let error_payload = json!({ "message": error.to_string() });
    service
        .repository
        .update_flow_run(&UpdateFlowRunInput {
            flow_run_id,
            status: domain::FlowRunStatus::Failed,
            output_payload: flow_run.output_payload,
            error_payload: Some(error_payload.clone()),
            finished_at: Some(OffsetDateTime::now_utc()),
        })
        .await?;
    service
        .repository
        .append_run_event(&AppendRunEventInput {
            flow_run_id,
            node_run_id: None,
            event_type: "flow_run_failed".to_string(),
            payload: error_payload,
        })
        .await?;

    load_run_detail(&service.repository, application_id, flow_run_id).await
}

async fn is_run_cancelled<R>(
    repository: &R,
    application_id: Uuid,
    flow_run_id: Uuid,
) -> Result<bool>
where
    R: OrchestrationRuntimeRepository,
{
    Ok(repository
        .get_flow_run(application_id, flow_run_id)
        .await?
        .map(|run| run.status == domain::FlowRunStatus::Cancelled)
        .unwrap_or(false))
}

async fn append_provider_stream_events<R>(
    repository: &R,
    flow_run_id: Uuid,
    node_run_id: Option<Uuid>,
    events: &[ProviderStreamEvent],
) -> Result<()>
where
    R: OrchestrationRuntimeRepository,
{
    for event in events {
        repository
            .append_run_event(&AppendRunEventInput {
                flow_run_id,
                node_run_id,
                event_type: provider_stream_event_type(event).to_string(),
                payload: serde_json::to_value(event)?,
            })
            .await?;
    }

    Ok(())
}

fn provider_stream_event_type(event: &ProviderStreamEvent) -> &'static str {
    match event {
        ProviderStreamEvent::TextDelta { .. } => "text_delta",
        ProviderStreamEvent::ReasoningDelta { .. } => "reasoning_delta",
        ProviderStreamEvent::ToolCallDelta { .. } => "tool_call_delta",
        ProviderStreamEvent::ToolCallCommit { .. } => "tool_call_commit",
        ProviderStreamEvent::McpCallDelta { .. } => "mcp_call_delta",
        ProviderStreamEvent::McpCallCommit { .. } => "mcp_call_commit",
        ProviderStreamEvent::UsageDelta { .. } => "usage_delta",
        ProviderStreamEvent::UsageSnapshot { .. } => "usage_snapshot",
        ProviderStreamEvent::Finish { .. } => "finish",
        ProviderStreamEvent::Error { .. } => "error",
    }
}

fn next_node_index(
    compiled_plan: &orchestration_runtime::compiled_plan::CompiledPlan,
    node_id: &str,
) -> Result<usize> {
    let index = compiled_plan
        .topological_order
        .iter()
        .position(|value| value == node_id)
        .ok_or_else(|| anyhow!("compiled node missing from topological order: {node_id}"))?;

    Ok(index + 1)
}

fn first_output_key(node: &orchestration_runtime::compiled_plan::CompiledNode) -> String {
    node.outputs
        .first()
        .map(|output| output.key.clone())
        .unwrap_or_else(|| "output".to_string())
}
