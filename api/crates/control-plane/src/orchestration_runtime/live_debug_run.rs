use anyhow::{anyhow, Result};
use plugin_framework::provider_contract::ProviderStreamEvent;
use serde_json::{json, Value};
use time::OffsetDateTime;
use tokio::{
    sync::mpsc,
    time::{self as tokio_time, Duration, MissedTickBehavior},
};
use uuid::Uuid;

use crate::{
    capability_runtime::{host_tool_capability_id, mcp_tool_capability_id},
    errors::ControlPlaneError,
    flow::FlowService,
    ports::{
        AppendBillingSessionInput, AppendCapabilityInvocationInput, AppendContextProjectionInput,
        AppendCostLedgerInput, AppendCreditLedgerInput, AppendModelFailoverAttemptLedgerInput,
        AppendRunEventInput, AppendUsageLedgerInput, AttachCompiledPlanToFlowRunInput,
        CreateCallbackTaskInput, CreateCheckpointInput, CreateFlowRunShellInput,
        CreateNodeRunInput, FailQueuedFlowRunShellInput,
        LinkUsageLedgerToModelFailoverAttemptInput, OrchestrationRuntimeRepository,
        RuntimeEventCloseReason, UpdateFlowRunInput, UpdateNodeRunInput,
    },
    runtime_observability::{
        append_host_event, append_host_span, append_provider_stream_events_raw,
        append_provider_stream_events_raw_filtered,
        projection::{estimate_tokens_for_text, model_input_hash},
        AppendHostSpanInput, LiveEventCoalescer, PROVIDER_DELTA_COALESCE_MAX_BYTES,
        PROVIDER_DELTA_COALESCE_MAX_DELAY_MS,
    },
    state_transition::{ensure_flow_run_transition, ensure_node_run_transition},
};

use super::{
    compile_context::ensure_compiled_plan_runnable, debug_stream_events,
    inputs::build_compiled_plan_input, CancelFlowRunCommand, ContinueFlowDebugRunCommand,
    LiveProviderStreamEventSender, OrchestrationRuntimeService, PrepareFlowDebugRunCommand,
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
        + crate::ports::ModelDefinitionRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone
        + Send
        + Sync
        + 'static,
    H: crate::ports::ProviderRuntimePort
        + crate::capability_plugin_runtime::CapabilityPluginRuntimePort
        + Clone,
{
    let actor_user_id = command.actor_user_id;
    let application_id = command.application_id;
    let input_payload = command.input_payload.clone();
    let document_snapshot = command.document_snapshot.clone();
    let shell = open_flow_debug_run_shell(service, command).await?;

    prepare_flow_debug_run_from_shell(
        service,
        PrepareFlowDebugRunCommand {
            actor_user_id,
            application_id,
            flow_run_id: shell.id,
            input_payload,
            document_snapshot,
        },
    )
    .await
}

fn shell_mismatch_error() -> anyhow::Error {
    anyhow!("flow debug run shell does not match prepare command")
}

fn validate_flow_debug_run_shell(
    flow_run: &domain::FlowRunRecord,
    command: &PrepareFlowDebugRunCommand,
    editor_state: &domain::FlowEditorState,
) -> Result<()> {
    if flow_run.created_by != command.actor_user_id
        || flow_run.run_mode != domain::FlowRunMode::DebugFlowRun
        || flow_run.target_node_id.is_some()
        || flow_run.status != domain::FlowRunStatus::Queued
        || flow_run.compiled_plan_id.is_some()
        || flow_run.input_payload != command.input_payload
        || flow_run.flow_id != editor_state.flow.id
        || flow_run.draft_id != editor_state.draft.id
    {
        return Err(shell_mismatch_error());
    }

    Ok(())
}

pub(super) async fn open_flow_debug_run_shell<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    command: StartFlowDebugRunCommand,
) -> Result<domain::FlowRunRecord>
where
    R: crate::ports::ApplicationRepository
        + crate::ports::FlowRepository
        + OrchestrationRuntimeRepository
        + Clone
        + Send
        + Sync
        + 'static,
    H: crate::ports::ProviderRuntimePort
        + crate::capability_plugin_runtime::CapabilityPluginRuntimePort
        + Clone,
{
    let actor = crate::ports::ApplicationRepository::load_actor_context_for_user(
        &service.repository,
        command.actor_user_id,
    )
    .await?;
    let editor_state = FlowService::new(service.repository.clone())
        .get_or_create_editor_state(command.actor_user_id, command.application_id)
        .await?;
    service
        .repository
        .get_application(actor.current_workspace_id, command.application_id)
        .await?
        .ok_or(ControlPlaneError::NotFound("application"))?;

    service
        .repository
        .create_flow_run_shell(&CreateFlowRunShellInput {
            actor_user_id: command.actor_user_id,
            application_id: command.application_id,
            flow_id: editor_state.flow.id,
            flow_draft_id: editor_state.draft.id,
            run_mode: domain::FlowRunMode::DebugFlowRun,
            target_node_id: None,
            status: domain::FlowRunStatus::Queued,
            input_payload: command.input_payload,
            started_at: OffsetDateTime::now_utc(),
        })
        .await
}

pub(super) async fn prepare_flow_debug_run_from_shell<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    command: PrepareFlowDebugRunCommand,
) -> Result<domain::ApplicationRunDetail>
where
    R: crate::ports::ApplicationRepository
        + crate::ports::FlowRepository
        + OrchestrationRuntimeRepository
        + crate::ports::ModelDefinitionRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone
        + Send
        + Sync
        + 'static,
    H: crate::ports::ProviderRuntimePort
        + crate::capability_plugin_runtime::CapabilityPluginRuntimePort
        + Clone,
{
    let actor = crate::ports::ApplicationRepository::load_actor_context_for_user(
        &service.repository,
        command.actor_user_id,
    )
    .await?;
    let flow_run = service
        .repository
        .get_flow_run(command.application_id, command.flow_run_id)
        .await?
        .ok_or_else(shell_mismatch_error)?;
    let editor_state = FlowService::new(service.repository.clone())
        .get_or_create_editor_state(command.actor_user_id, command.application_id)
        .await?;
    validate_flow_debug_run_shell(&flow_run, &command, &editor_state)?;
    let application = service
        .repository
        .get_application(actor.current_workspace_id, command.application_id)
        .await?
        .ok_or(ControlPlaneError::NotFound("application"))?;
    let pre_attach_result = async {
        let compile_context = service
            .build_compile_context(application.workspace_id)
            .await?;
        let debug_document = command
            .document_snapshot
            .as_ref()
            .unwrap_or(&editor_state.draft.document);

        let mut compiled_plan = orchestration_runtime::compiler::FlowCompiler::compile(
            editor_state.flow.id,
            &editor_state.draft.id.to_string(),
            debug_document,
            &compile_context,
        )?;
        super::freeze_failover_queue_routes(&service.repository, &mut compiled_plan).await?;
        ensure_compiled_plan_runnable(&compiled_plan)?;
        let compiled_record = service
            .repository
            .upsert_compiled_plan(&build_compiled_plan_input(
                command.actor_user_id,
                &editor_state,
                &compiled_plan,
            )?)
            .await?;

        Result::<_>::Ok((compiled_plan, compiled_record))
    }
    .await;

    let (compiled_plan, compiled_record) = match pre_attach_result {
        Ok(result) => result,
        Err(error) => {
            fail_queued_flow_run_shell(
                service,
                command.application_id,
                command.flow_run_id,
                &error,
            )
            .await?;
            return Err(error);
        }
    };

    let flow_run = match service
        .repository
        .attach_compiled_plan_to_flow_run(&AttachCompiledPlanToFlowRunInput {
            flow_run_id: command.flow_run_id,
            compiled_plan_id: compiled_record.id,
            status: domain::FlowRunStatus::Running,
        })
        .await
    {
        Ok(flow_run) => flow_run,
        Err(error) => {
            fail_queued_flow_run_shell(
                service,
                command.application_id,
                command.flow_run_id,
                &error,
            )
            .await?;
            return Err(error);
        }
    };

    let post_attach_result = async {
        service
            .repository
            .append_run_event(&AppendRunEventInput {
                flow_run_id: flow_run.id,
                node_run_id: None,
                event_type: "flow_run_started".to_string(),
                payload: json!({
                    "run_mode": domain::FlowRunMode::DebugFlowRun.as_str(),
                    "input_payload": command.input_payload.clone(),
                }),
            })
            .await?;
        append_runtime_event(
            service,
            flow_run.id,
            debug_stream_events::flow_started(flow_run.id),
        )
        .await;

        record_gateway_billing_audit(
            &service.repository,
            &flow_run,
            command.actor_user_id,
            command.application_id,
            application.workspace_id,
            &compiled_plan,
        )
        .await?;

        load_run_detail(&service.repository, command.application_id, flow_run.id).await
    }
    .await;

    if let Err(error) = post_attach_result {
        fail_flow_run(service, command.application_id, command.flow_run_id, &error).await?;
        return Err(error);
    }

    post_attach_result
}

async fn fail_queued_flow_run_shell<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    application_id: Uuid,
    flow_run_id: Uuid,
    error: &anyhow::Error,
) -> Result<Option<domain::ApplicationRunDetail>>
where
    R: crate::ports::ApplicationRepository
        + crate::ports::FlowRepository
        + OrchestrationRuntimeRepository
        + crate::ports::ModelDefinitionRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone
        + Send
        + Sync
        + 'static,
    H: crate::ports::ProviderRuntimePort
        + crate::capability_plugin_runtime::CapabilityPluginRuntimePort
        + Clone,
{
    let error_payload = json!({ "message": error.to_string() });
    let Some(flow_run) = service
        .repository
        .fail_queued_flow_run_shell(&FailQueuedFlowRunShellInput {
            flow_run_id,
            output_payload: json!({}),
            error_payload: error_payload.clone(),
            finished_at: OffsetDateTime::now_utc(),
        })
        .await?
    else {
        return Ok(None);
    };
    emit_flow_failed_and_close(service, flow_run.id, error_payload.clone()).await;
    service
        .repository
        .append_run_event(&AppendRunEventInput {
            flow_run_id: flow_run.id,
            node_run_id: None,
            event_type: "flow_run_failed".to_string(),
            payload: error_payload.clone(),
        })
        .await?;

    load_run_detail(&service.repository, application_id, flow_run.id)
        .await
        .map(Some)
}

async fn record_gateway_billing_audit<R>(
    repository: &R,
    flow_run: &domain::FlowRunRecord,
    actor_user_id: Uuid,
    application_id: Uuid,
    workspace_id: Uuid,
    compiled_plan: &orchestration_runtime::compiled_plan::CompiledPlan,
) -> Result<()>
where
    R: OrchestrationRuntimeRepository,
{
    let route_id = Uuid::now_v7();
    let llm_runtime = compiled_plan
        .nodes
        .values()
        .find_map(|node| node.llm_runtime.as_ref());
    let provider_instance_id =
        llm_runtime.and_then(|runtime| Uuid::parse_str(&runtime.provider_instance_id).ok());
    let routing_mode = llm_runtime
        .and_then(|runtime| runtime.routing.as_ref())
        .map(|routing| match routing.routing_mode {
            orchestration_runtime::compiled_plan::LlmRoutingMode::FixedModel => "fixed_model",
            orchestration_runtime::compiled_plan::LlmRoutingMode::FailoverQueue => "failover_queue",
        })
        .unwrap_or("debug_run");
    let logical_model_id = llm_runtime
        .map(|runtime| runtime.model.as_str())
        .unwrap_or("debug_run");
    let upstream_model_id = llm_runtime.map(|runtime| runtime.model.clone());
    let route_trace = json!({
        "logical_model_id": logical_model_id,
        "route_id": route_id,
        "provider_instance_id": provider_instance_id,
        "provider_account_id": null,
        "upstream_model_id": upstream_model_id.clone(),
        "routing_mode": routing_mode,
        "trust_level": domain::RuntimeTrustLevel::HostFact.as_str(),
    });
    let idempotency_key = format!("gateway:{}:reserve", flow_run.id);
    let cost = repository
        .append_cost_ledger(&AppendCostLedgerInput {
            flow_run_id: Some(flow_run.id),
            span_id: None,
            usage_ledger_id: None,
            workspace_id,
            provider_instance_id,
            provider_account_id: None,
            gateway_route_id: Some(route_id),
            model_id: Some(logical_model_id.to_string()),
            upstream_model_id,
            price_snapshot: json!({
                "route_trace": route_trace.clone(),
                "source": "gateway_debug_run_start"
            }),
            raw_cost: Some("0".to_string()),
            normalized_cost: Some("0".to_string()),
            settlement_currency: Some("credit".to_string()),
            cost_source: "gateway_reservation".to_string(),
            cost_status: "pending_usage".to_string(),
        })
        .await?;
    let credit = repository
        .append_credit_ledger(&AppendCreditLedgerInput {
            workspace_id,
            user_id: Some(actor_user_id),
            app_id: Some(application_id),
            agent_id: None,
            flow_run_id: Some(flow_run.id),
            span_id: None,
            cost_ledger_id: Some(cost.id),
            transaction_type: "reserve".to_string(),
            amount: "0".to_string(),
            balance_after: None,
            credit_unit: "credit".to_string(),
            reason: "gateway_billing_session_reserved".to_string(),
            idempotency_key: idempotency_key.clone(),
            status: "posted".to_string(),
        })
        .await?;
    let billing_session = repository
        .append_billing_session(&AppendBillingSessionInput {
            workspace_id,
            flow_run_id: Some(flow_run.id),
            client_request_id: None,
            idempotency_key,
            route_id: Some(route_id),
            provider_account_id: None,
            status: domain::BillingSessionStatus::Reserved,
            reserved_credit_ledger_id: Some(credit.id),
            settled_credit_ledger_id: None,
            refund_credit_ledger_id: None,
            metadata: json!({
                "route_trace": route_trace.clone(),
                "fail_safe": "continue"
            }),
        })
        .await?;
    let cost_hash = repository
        .append_audit_hash(
            flow_run.id,
            "runtime_cost_ledger",
            cost.id,
            json!({
                "cost_source": cost.cost_source.clone(),
                "cost_status": cost.cost_status.clone(),
                "route_trace": route_trace.clone(),
            }),
        )
        .await?;
    let credit_hash = repository
        .append_audit_hash(
            flow_run.id,
            "runtime_credit_ledger",
            credit.id,
            json!({
                "transaction_type": credit.transaction_type.clone(),
                "amount": credit.amount.clone(),
                "reason": credit.reason.clone(),
                "idempotency_key": credit.idempotency_key.clone(),
            }),
        )
        .await?;
    let billing_hash = repository
        .append_audit_hash(
            flow_run.id,
            "billing_sessions",
            billing_session.id,
            json!({
                "status": billing_session.status.as_str(),
                "idempotency_key": billing_session.idempotency_key.clone(),
                "route_trace": route_trace.clone(),
            }),
        )
        .await?;

    repository
        .append_run_event(&AppendRunEventInput {
            flow_run_id: flow_run.id,
            node_run_id: None,
            event_type: "gateway_billing_session_reserved".to_string(),
            payload: json!({
                "billing_session": {
                    "id": billing_session.id,
                    "status": billing_session.status.as_str(),
                    "idempotency_key": billing_session.idempotency_key,
                },
                "cost_ledger": {
                    "id": cost.id,
                    "cost_status": cost.cost_status,
                },
                "credit_ledger": {
                    "id": credit.id,
                    "transaction_type": credit.transaction_type,
                },
                "audit_hashes": [
                    cost_hash.id,
                    credit_hash.id,
                    billing_hash.id
                ],
                "route_trace": route_trace,
            }),
        })
        .await?;
    Ok(())
}

pub(super) async fn continue_flow_debug_run<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    command: ContinueFlowDebugRunCommand,
) -> Result<domain::ApplicationRunDetail>
where
    R: crate::ports::ApplicationRepository
        + crate::ports::FlowRepository
        + OrchestrationRuntimeRepository
        + crate::ports::ModelDefinitionRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone
        + Send
        + Sync
        + 'static,
    H: crate::ports::ProviderRuntimePort
        + crate::capability_plugin_runtime::CapabilityPluginRuntimePort
        + Clone,
{
    continue_flow_debug_run_with_optional_live_provider_events(service, command, None).await
}

pub(super) async fn continue_flow_debug_run_with_live_provider_events<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    command: ContinueFlowDebugRunCommand,
    live_provider_events: LiveProviderStreamEventSender,
) -> Result<domain::ApplicationRunDetail>
where
    R: crate::ports::ApplicationRepository
        + crate::ports::FlowRepository
        + OrchestrationRuntimeRepository
        + crate::ports::ModelDefinitionRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone
        + Send
        + Sync
        + 'static,
    H: crate::ports::ProviderRuntimePort
        + crate::capability_plugin_runtime::CapabilityPluginRuntimePort
        + Clone,
{
    continue_flow_debug_run_with_optional_live_provider_events(
        service,
        command,
        Some(live_provider_events),
    )
    .await
}

async fn continue_flow_debug_run_with_optional_live_provider_events<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    command: ContinueFlowDebugRunCommand,
    live_provider_events: Option<LiveProviderStreamEventSender>,
) -> Result<domain::ApplicationRunDetail>
where
    R: crate::ports::ApplicationRepository
        + crate::ports::FlowRepository
        + OrchestrationRuntimeRepository
        + crate::ports::ModelDefinitionRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone
        + Send
        + Sync
        + 'static,
    H: crate::ports::ProviderRuntimePort
        + crate::capability_plugin_runtime::CapabilityPluginRuntimePort
        + Clone,
{
    let result = continue_flow_debug_run_inner(service, &command, live_provider_events).await;

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
        + crate::ports::ModelDefinitionRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone
        + Send
        + Sync
        + 'static,
    H: crate::ports::ProviderRuntimePort
        + crate::capability_plugin_runtime::CapabilityPluginRuntimePort
        + Clone,
{
    let actor = crate::ports::ApplicationRepository::load_actor_context_for_user(
        &service.repository,
        command.actor_user_id,
    )
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
    ensure_flow_run_transition(
        flow_run.status,
        domain::FlowRunStatus::Cancelled,
        "cancel_flow_run",
    )?;
    let updated = service
        .repository
        .update_flow_run_if_status(
            &UpdateFlowRunInput {
                flow_run_id: flow_run.id,
                status: domain::FlowRunStatus::Cancelled,
                output_payload: flow_run.output_payload.clone(),
                error_payload: flow_run.error_payload.clone(),
                finished_at: Some(OffsetDateTime::now_utc()),
            },
            flow_run.status,
        )
        .await?;
    let Some(flow_run) = updated else {
        return load_run_detail(&service.repository, command.application_id, flow_run.id).await;
    };
    append_runtime_event(
        service,
        flow_run.id,
        debug_stream_events::flow_cancelled(flow_run.id),
    )
    .await;
    close_runtime_event_stream(service, flow_run.id, RuntimeEventCloseReason::Cancelled).await;
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

async fn append_runtime_event<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    flow_run_id: Uuid,
    event: crate::ports::RuntimeEventPayload,
) {
    if let Some(stream) = &service.runtime_event_stream {
        let event_type = event.event_type.clone();
        let source = event.source;
        if let Err(error) = stream.append(flow_run_id, event).await {
            if is_expected_runtime_event_stream_closed_error(&error) {
                tracing::debug!(
                    flow_run_id = %flow_run_id,
                    event_type = %event_type,
                    source = ?source,
                    error = %error,
                    "runtime event append skipped because stream is already closed"
                );
            } else {
                tracing::warn!(
                    flow_run_id = %flow_run_id,
                    event_type = %event_type,
                    source = ?source,
                    error = %error,
                    "failed to append runtime event"
                );
            }
        }
    }
}

async fn close_runtime_event_stream<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    flow_run_id: Uuid,
    reason: RuntimeEventCloseReason,
) {
    if let Some(stream) = &service.runtime_event_stream {
        if let Err(error) = stream.close_run(flow_run_id, reason).await {
            if is_expected_runtime_event_stream_closed_error(&error) {
                tracing::debug!(
                    flow_run_id = %flow_run_id,
                    reason = ?reason,
                    error = %error,
                    "runtime event stream close skipped because stream is not open"
                );
            } else {
                tracing::warn!(
                    flow_run_id = %flow_run_id,
                    reason = ?reason,
                    error = %error,
                    "failed to close runtime event stream"
                );
            }
        }
    }
}

fn is_expected_runtime_event_stream_closed_error(error: &anyhow::Error) -> bool {
    let message = error.to_string();
    message.contains("runtime event stream is closed")
        || message.contains("runtime event stream is not open")
}

async fn emit_flow_failed_and_close<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    flow_run_id: Uuid,
    error_payload: Value,
) {
    emit_flow_failed_and_close_with_reason(
        service,
        flow_run_id,
        error_payload,
        RuntimeEventCloseReason::Failed,
    )
    .await;
}

async fn emit_flow_failed_and_close_with_reason<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    flow_run_id: Uuid,
    error_payload: Value,
    reason: RuntimeEventCloseReason,
) {
    append_runtime_event(
        service,
        flow_run_id,
        debug_stream_events::flow_failed(flow_run_id, error_payload),
    )
    .await;
    close_runtime_event_stream(service, flow_run_id, reason).await;
}

async fn update_node_run_and_emit<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    flow_run_id: Uuid,
    input: &UpdateNodeRunInput,
) -> Result<domain::NodeRunRecord>
where
    R: OrchestrationRuntimeRepository,
{
    let node_run = service.repository.update_node_run(input).await?;
    append_runtime_event(
        service,
        flow_run_id,
        debug_stream_events::node_finished(&node_run),
    )
    .await;
    Ok(node_run)
}

async fn continue_flow_debug_run_inner<R, H>(
    service: &OrchestrationRuntimeService<R, H>,
    command: &ContinueFlowDebugRunCommand,
    live_provider_events: Option<LiveProviderStreamEventSender>,
) -> Result<domain::ApplicationRunDetail>
where
    R: crate::ports::ApplicationRepository
        + crate::ports::FlowRepository
        + OrchestrationRuntimeRepository
        + crate::ports::ModelDefinitionRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone
        + Send
        + Sync
        + 'static,
    H: crate::ports::ProviderRuntimePort
        + crate::capability_plugin_runtime::CapabilityPluginRuntimePort
        + Clone,
{
    let flow_run = service
        .repository
        .get_flow_run(command.application_id, command.flow_run_id)
        .await?
        .ok_or_else(|| anyhow!("flow run not found"))?;
    if flow_run.status != domain::FlowRunStatus::Running {
        return load_run_detail(&service.repository, command.application_id, flow_run.id).await;
    }
    let actor = crate::ports::ApplicationRepository::load_actor_context_for_user(
        &service.repository,
        flow_run.created_by,
    )
    .await?;
    let application = service
        .repository
        .get_application(command.workspace_id, command.application_id)
        .await?
        .ok_or(ControlPlaneError::NotFound("application"))?;
    let compiled_plan_id = flow_run
        .compiled_plan_id
        .ok_or_else(|| anyhow!("flow run compiled plan is not attached"))?;
    let compiled_record = service
        .repository
        .get_compiled_plan(compiled_plan_id)
        .await?
        .ok_or_else(|| anyhow!("compiled plan not found"))?;
    let compiled_plan: orchestration_runtime::compiled_plan::CompiledPlan =
        serde_json::from_value(compiled_record.plan)?;
    let invoker = if let Some(live_provider_events) = live_provider_events {
        service.runtime_invoker_with_live_provider_events(
            application.workspace_id,
            live_provider_events,
        )
    } else {
        service.runtime_invoker(application.workspace_id)
    }
    .for_flow_run(flow_run.id);
    let mut variable_pool = flow_run
        .input_payload
        .as_object()
        .cloned()
        .ok_or_else(|| anyhow!("input payload must be an object"))?;
    let mut last_output_payload = json!({});
    let flow_span = append_host_span(
        &service.repository,
        AppendHostSpanInput {
            flow_run_id: flow_run.id,
            node_run_id: None,
            parent_span_id: None,
            kind: domain::RuntimeSpanKind::Flow,
            name: "debug flow".to_string(),
            started_at: flow_run.started_at,
            metadata: json!({
                "application_id": command.application_id,
                "run_mode": flow_run.run_mode.as_str(),
                "trigger_event_type": "flow_run_continued",
            }),
        },
    )
    .await?;

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
        let rendered_templates = orchestration_runtime::binding_runtime::render_templated_bindings(
            node,
            &resolved_inputs,
        );
        let node_started_at = OffsetDateTime::now_utc();
        let node_run = service
            .repository
            .create_node_run(&CreateNodeRunInput {
                flow_run_id: flow_run.id,
                node_id: node.node_id.clone(),
                node_type: node.node_type.clone(),
                node_alias: node.alias.clone(),
                status: domain::NodeRunStatus::Running,
                input_payload: Value::Object(resolved_inputs.clone()),
                started_at: node_started_at,
            })
            .await?;
        append_runtime_event(
            service,
            flow_run.id,
            debug_stream_events::node_started(&node_run),
        )
        .await;
        let node_span = append_host_span(
            &service.repository,
            AppendHostSpanInput {
                flow_run_id: flow_run.id,
                node_run_id: Some(node_run.id),
                parent_span_id: Some(flow_span.id),
                kind: if node.node_type == "llm" {
                    domain::RuntimeSpanKind::LlmTurn
                } else {
                    domain::RuntimeSpanKind::Node
                },
                name: node.alias.clone(),
                started_at: node_started_at,
                metadata: json!({
                    "node_id": node.node_id,
                    "node_type": node.node_type,
                }),
            },
        )
        .await?;

        match node.node_type.as_str() {
            "start" => {
                let output_payload = variable_pool
                    .get(node_id)
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                last_output_payload = output_payload.clone();
                update_node_run_and_emit(
                    service,
                    flow_run.id,
                    &UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: domain::NodeRunStatus::Succeeded,
                        output_payload,
                        error_payload: None,
                        metrics_payload: json!({ "preview_mode": true }),
                        finished_at: Some(OffsetDateTime::now_utc()),
                    },
                )
                .await?;
            }
            "llm" => {
                let persist_text_run_events = service.runtime_event_stream.is_none();
                let (persist_sender, persist_receiver) = mpsc::unbounded_channel();
                let persist_handle = tokio::spawn(run_live_event_persister(
                    service.repository.clone(),
                    flow_run.id,
                    node_run.id,
                    node_span.id,
                    persist_text_run_events,
                    persist_receiver,
                ));
                let llm_invoker = invoker.for_live_llm_node_with_persist(
                    node.node_id.clone(),
                    node_run.id,
                    persist_sender,
                );
                let execution_result = orchestration_runtime::execution_engine::execute_llm_node(
                    node,
                    &resolved_inputs,
                    &rendered_templates,
                    &llm_invoker,
                )
                .await;
                drop(llm_invoker);
                persist_handle
                    .await
                    .map_err(|e| anyhow!("persist task panicked: {e}"))??;
                let execution = execution_result?;

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
                update_node_run_and_emit(
                    service,
                    flow_run.id,
                    &UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: node_status,
                        output_payload: execution.output_payload.clone(),
                        error_payload: execution.error_payload.clone(),
                        metrics_payload: execution.metrics_payload.clone(),
                        finished_at: Some(OffsetDateTime::now_utc()),
                    },
                )
                .await?;
                persist_llm_context_observability(
                    &service.repository,
                    flow_run.id,
                    node_run.id,
                    node_span.id,
                    Value::Object(resolved_inputs.clone()),
                    &execution.metrics_payload,
                    execution.error_payload.as_ref(),
                )
                .await?;

                if is_run_cancelled(&service.repository, command.application_id, flow_run.id)
                    .await?
                {
                    return load_run_detail(
                        &service.repository,
                        command.application_id,
                        flow_run.id,
                    )
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
                    emit_flow_failed_and_close(service, flow_run.id, error_payload.clone()).await;
                    service
                        .repository
                        .append_run_event(&AppendRunEventInput {
                            flow_run_id: flow_run.id,
                            node_run_id: Some(node_run.id),
                            event_type: "flow_run_failed".to_string(),
                            payload: error_payload,
                        })
                        .await?;
                    return load_run_detail(
                        &service.repository,
                        command.application_id,
                        flow_run.id,
                    )
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
                update_node_run_and_emit(
                    service,
                    flow_run.id,
                    &UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: node_status,
                        output_payload: execution.output_payload.clone(),
                        error_payload: execution.error_payload.clone(),
                        metrics_payload: execution.metrics_payload.clone(),
                        finished_at: Some(OffsetDateTime::now_utc()),
                    },
                )
                .await?;

                if is_run_cancelled(&service.repository, command.application_id, flow_run.id)
                    .await?
                {
                    return load_run_detail(
                        &service.repository,
                        command.application_id,
                        flow_run.id,
                    )
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
                    emit_flow_failed_and_close(service, flow_run.id, error_payload.clone()).await;
                    service
                        .repository
                        .append_run_event(&AppendRunEventInput {
                            flow_run_id: flow_run.id,
                            node_run_id: Some(node_run.id),
                            event_type: "flow_run_failed".to_string(),
                            payload: error_payload,
                        })
                        .await?;
                    return load_run_detail(
                        &service.repository,
                        command.application_id,
                        flow_run.id,
                    )
                    .await;
                }

                variable_pool.insert(node.node_id.clone(), execution.output_payload);
            }
            "data_model_list" | "data_model_get" | "data_model_create" | "data_model_update"
            | "data_model_delete" => {
                let execution = super::data_model_runtime::execute_data_model_node(
                    service.repository.clone(),
                    service.runtime_engine.clone(),
                    &actor,
                    node,
                    &resolved_inputs,
                )
                .await;
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
                update_node_run_and_emit(
                    service,
                    flow_run.id,
                    &UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: node_status,
                        output_payload: execution.output_payload.clone(),
                        error_payload: execution.error_payload.clone(),
                        metrics_payload: execution.metrics_payload.clone(),
                        finished_at: Some(OffsetDateTime::now_utc()),
                    },
                )
                .await?;

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
                    emit_flow_failed_and_close(service, flow_run.id, error_payload.clone()).await;
                    service
                        .repository
                        .append_run_event(&AppendRunEventInput {
                            flow_run_id: flow_run.id,
                            node_run_id: Some(node_run.id),
                            event_type: "flow_run_failed".to_string(),
                            payload: error_payload,
                        })
                        .await?;
                    return load_run_detail(
                        &service.repository,
                        command.application_id,
                        flow_run.id,
                    )
                    .await;
                }

                variable_pool.insert(node.node_id.clone(), execution.output_payload);
            }
            "template_transform" | "answer" => {
                let output_key = first_output_key(node);
                let output_value =
                    rendered_templates
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
                update_node_run_and_emit(
                    service,
                    flow_run.id,
                    &UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: domain::NodeRunStatus::Succeeded,
                        output_payload,
                        error_payload: None,
                        metrics_payload: json!({ "preview_mode": true }),
                        finished_at: Some(OffsetDateTime::now_utc()),
                    },
                )
                .await?;
            }
            "human_input" => {
                update_node_run_and_emit(
                    service,
                    flow_run.id,
                    &UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: domain::NodeRunStatus::WaitingHuman,
                        output_payload: json!({}),
                        error_payload: None,
                        metrics_payload: json!({ "preview_mode": true, "waiting": "human_input" }),
                        finished_at: None,
                    },
                )
                .await?;

                if is_run_cancelled(&service.repository, command.application_id, flow_run.id)
                    .await?
                {
                    return load_run_detail(
                        &service.repository,
                        command.application_id,
                        flow_run.id,
                    )
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
                return load_run_detail(&service.repository, command.application_id, flow_run.id)
                    .await;
            }
            "tool" | "http_request" => {
                let request_payload = Value::Object(resolved_inputs.clone());
                update_node_run_and_emit(
                    service,
                    flow_run.id,
                    &UpdateNodeRunInput {
                        node_run_id: node_run.id,
                        status: domain::NodeRunStatus::WaitingCallback,
                        output_payload: json!({}),
                        error_payload: None,
                        metrics_payload: json!({ "preview_mode": true, "waiting": node.node_type }),
                        finished_at: None,
                    },
                )
                .await?;

                if is_run_cancelled(&service.repository, command.application_id, flow_run.id)
                    .await?
                {
                    return load_run_detail(
                        &service.repository,
                        command.application_id,
                        flow_run.id,
                    )
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
                return load_run_detail(&service.repository, command.application_id, flow_run.id)
                    .await;
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
    let updated = service
        .repository
        .update_flow_run_if_status(
            &UpdateFlowRunInput {
                flow_run_id: flow_run.id,
                status: domain::FlowRunStatus::Succeeded,
                output_payload: last_output_payload.clone(),
                error_payload: None,
                finished_at: Some(OffsetDateTime::now_utc()),
            },
            domain::FlowRunStatus::Running,
        )
        .await?;
    if updated.is_none() {
        return load_run_detail(&service.repository, command.application_id, flow_run.id).await;
    }
    append_runtime_event(
        service,
        flow_run.id,
        debug_stream_events::flow_finished(flow_run.id, last_output_payload.clone()),
    )
    .await;
    close_runtime_event_stream(service, flow_run.id, RuntimeEventCloseReason::Finished).await;
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
        + crate::ports::ModelDefinitionRepository
        + crate::ports::ModelProviderRepository
        + crate::ports::NodeContributionRepository
        + crate::ports::PluginRepository
        + Clone
        + Send
        + Sync
        + 'static,
    H: crate::ports::ProviderRuntimePort
        + crate::capability_plugin_runtime::CapabilityPluginRuntimePort
        + Clone,
{
    let Some(flow_run) = service
        .repository
        .get_flow_run(application_id, flow_run_id)
        .await?
    else {
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
    ensure_flow_run_transition(
        flow_run.status,
        domain::FlowRunStatus::Failed,
        "fail_flow_run",
    )?;
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
    emit_flow_failed_and_close(service, flow_run_id, error_payload.clone()).await;
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

async fn run_live_event_persister<R>(
    repository: R,
    flow_run_id: Uuid,
    node_run_id: Uuid,
    span_id: Uuid,
    persist_text_run_events: bool,
    mut receiver: mpsc::UnboundedReceiver<ProviderStreamEvent>,
) -> Result<()>
where
    R: OrchestrationRuntimeRepository,
{
    let mut coalescer = LiveEventCoalescer::new(PROVIDER_DELTA_COALESCE_MAX_BYTES);
    let mut flush_interval =
        tokio_time::interval(Duration::from_millis(PROVIDER_DELTA_COALESCE_MAX_DELAY_MS));
    flush_interval.set_missed_tick_behavior(MissedTickBehavior::Delay);

    loop {
        tokio::select! {
            maybe_event = receiver.recv() => {
                let Some(event) = maybe_event else {
                    break;
                };
                write_provider_event_batch(
                    &repository,
                    flow_run_id,
                    Some(node_run_id),
                    Some(span_id),
                    persist_text_run_events,
                    &coalescer.push(event),
                )
                .await?;
            }
            _ = flush_interval.tick() => {
                write_provider_event_batch(
                    &repository,
                    flow_run_id,
                    Some(node_run_id),
                    Some(span_id),
                    persist_text_run_events,
                    &coalescer.flush_buffered(),
                )
                .await?;
            }
        }
    }

    write_provider_event_batch(
        &repository,
        flow_run_id,
        Some(node_run_id),
        Some(span_id),
        persist_text_run_events,
        &coalescer.finish(),
    )
    .await?;

    Ok(())
}

async fn write_provider_event_batch<R>(
    repository: &R,
    flow_run_id: Uuid,
    node_run_id: Option<Uuid>,
    span_id: Option<Uuid>,
    persist_text_run_events: bool,
    events: &[ProviderStreamEvent],
) -> Result<()>
where
    R: OrchestrationRuntimeRepository,
{
    if events.is_empty() {
        return Ok(());
    }

    if persist_text_run_events {
        append_provider_stream_events_raw(repository, flow_run_id, node_run_id, span_id, events)
            .await?;
    } else {
        append_provider_stream_events_raw_filtered(
            repository,
            flow_run_id,
            node_run_id,
            span_id,
            events,
            |event| !matches!(event, ProviderStreamEvent::TextDelta { .. }),
        )
        .await?;
    }
    for event in events {
        append_provider_capability_intent(repository, flow_run_id, node_run_id, span_id, event)
            .await?;
    }

    Ok(())
}

async fn persist_llm_context_observability<R>(
    repository: &R,
    flow_run_id: Uuid,
    node_run_id: Uuid,
    span_id: Uuid,
    node_input: Value,
    metrics_payload: &Value,
    error_payload: Option<&Value>,
) -> Result<()>
where
    R: OrchestrationRuntimeRepository,
{
    let model_input = json!({
        "node_input": node_input,
        "provider": metrics_payload.get("provider_code").cloned().unwrap_or(Value::Null),
        "model": metrics_payload.get("model").cloned().unwrap_or(Value::Null),
    });
    let model_input_hash = model_input_hash(&model_input);
    let projection = repository
        .append_context_projection(&AppendContextProjectionInput {
            flow_run_id,
            node_run_id: Some(node_run_id),
            llm_turn_span_id: Some(span_id),
            projection_kind: "managed_full".to_string(),
            merge_stage_ref: None,
            source_transcript_ref: None,
            source_item_refs: json!([]),
            compaction_event_id: None,
            summary_version: None,
            model_input_ref: format!("runtime_artifact:inline:{model_input_hash}"),
            model_input_hash,
            compacted_summary_ref: None,
            previous_projection_id: None,
            token_estimate: Some(estimate_tokens_for_text(&model_input.to_string())),
            provider_continuation_metadata: json!({}),
        })
        .await?;

    let usage = metrics_payload.get("usage").cloned();
    let raw_usage = usage.clone().unwrap_or_else(|| json!({}));
    let usage_status = if usage.is_some() && error_payload.is_none() {
        domain::UsageLedgerStatus::Recorded
    } else {
        domain::UsageLedgerStatus::UnavailableError
    };

    let attempts = append_model_attempts_from_metrics(
        repository,
        flow_run_id,
        node_run_id,
        span_id,
        &projection,
        metrics_payload,
        error_payload,
    )
    .await?;
    let usage_attempt_id = winner_attempt_id(&attempts);

    let usage_ledger = repository
        .append_usage_ledger(&AppendUsageLedgerInput {
            flow_run_id,
            node_run_id: Some(node_run_id),
            span_id: Some(span_id),
            failover_attempt_id: usage_attempt_id,
            provider_instance_id: metrics_payload
                .get("provider_instance_id")
                .and_then(Value::as_str)
                .and_then(|value| Uuid::parse_str(value).ok()),
            gateway_route_id: None,
            model_id: metrics_payload
                .get("model")
                .and_then(Value::as_str)
                .map(str::to_string),
            upstream_model_id: metrics_payload
                .get("model")
                .and_then(Value::as_str)
                .map(str::to_string),
            upstream_request_id: None,
            input_tokens: usage_i64(&raw_usage, "input_tokens"),
            cached_input_tokens: usage_i64(&raw_usage, "cached_input_tokens"),
            output_tokens: usage_i64(&raw_usage, "output_tokens"),
            reasoning_output_tokens: usage_i64(&raw_usage, "reasoning_tokens"),
            total_tokens: usage_i64(&raw_usage, "total_tokens"),
            cache_read_tokens: usage_i64(&raw_usage, "cache_read_tokens"),
            cache_write_tokens: usage_i64(&raw_usage, "cache_write_tokens"),
            price_snapshot: None,
            cost_snapshot: None,
            usage_status,
            raw_usage: raw_usage.clone(),
            normalized_usage: raw_usage,
        })
        .await?;
    if let Some(failover_attempt_id) = usage_attempt_id {
        repository
            .link_usage_ledger_to_model_failover_attempt(
                &LinkUsageLedgerToModelFailoverAttemptInput {
                    failover_attempt_id,
                    usage_ledger_id: usage_ledger.id,
                },
            )
            .await?;
    }

    Ok(())
}

async fn append_model_attempts_from_metrics<R>(
    repository: &R,
    flow_run_id: Uuid,
    node_run_id: Uuid,
    span_id: Uuid,
    projection: &domain::ContextProjectionRecord,
    metrics_payload: &Value,
    error_payload: Option<&Value>,
) -> Result<Vec<domain::ModelFailoverAttemptLedgerRecord>>
where
    R: OrchestrationRuntimeRepository,
{
    let mut attempt_payloads = metrics_payload
        .get("attempts")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    if attempt_payloads.is_empty() {
        attempt_payloads.push(json!({
            "attempt_index": 0,
            "provider_instance_id": metrics_payload.get("provider_instance_id").cloned().unwrap_or(Value::Null),
            "provider_code": metrics_payload.get("provider_code").cloned().unwrap_or(Value::Null),
            "protocol": metrics_payload.get("protocol").cloned().unwrap_or(Value::Null),
            "upstream_model_id": metrics_payload.get("model").cloned().unwrap_or(Value::Null),
            "status": if error_payload.is_some() { "failed" } else { "succeeded" },
            "failed_after_first_token": false,
        }));
    }

    let mut records = Vec::with_capacity(attempt_payloads.len());
    for selected_attempt in attempt_payloads {
        let status = selected_attempt
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or(if error_payload.is_some() {
                "failed"
            } else {
                "succeeded"
            });

        let record = repository
            .append_model_failover_attempt_ledger(&AppendModelFailoverAttemptLedgerInput {
                flow_run_id,
                node_run_id: Some(node_run_id),
                llm_turn_span_id: Some(span_id),
                queue_snapshot_id: metrics_payload
                    .get("queue_snapshot_id")
                    .and_then(Value::as_str)
                    .and_then(|value| Uuid::parse_str(value).ok()),
                attempt_index: selected_attempt
                    .get("attempt_index")
                    .and_then(Value::as_i64)
                    .unwrap_or(records.len() as i64) as i32,
                provider_instance_id: selected_attempt
                    .get("provider_instance_id")
                    .and_then(Value::as_str)
                    .and_then(|value| Uuid::parse_str(value).ok()),
                provider_code: selected_attempt
                    .get("provider_code")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string(),
                upstream_model_id: selected_attempt
                    .get("upstream_model_id")
                    .or_else(|| selected_attempt.get("model"))
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string(),
                protocol: selected_attempt
                    .get("protocol")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string(),
                request_ref: Some(projection.model_input_ref.clone()),
                request_hash: Some(projection.model_input_hash.clone()),
                started_at: OffsetDateTime::now_utc(),
                first_token_at: None,
                finished_at: Some(OffsetDateTime::now_utc()),
                status: status.to_string(),
                failed_after_first_token: selected_attempt
                    .get("failed_after_first_token")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                upstream_request_id: selected_attempt
                    .get("upstream_request_id")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                error_code: selected_attempt
                    .get("error_code")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .or_else(|| {
                        (status != "succeeded").then(|| {
                            error_payload
                                .and_then(|payload| payload.get("error_kind"))
                                .and_then(Value::as_str)
                                .unwrap_or("provider_error")
                                .to_string()
                        })
                    }),
                error_message_ref: selected_attempt
                    .get("error_message_ref")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                usage_ledger_id: None,
                cost_ledger_id: None,
                response_ref: selected_attempt
                    .get("response_ref")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            })
            .await?;
        records.push(record);
    }

    Ok(records)
}

fn winner_attempt_id(attempts: &[domain::ModelFailoverAttemptLedgerRecord]) -> Option<Uuid> {
    attempts
        .iter()
        .find(|attempt| attempt.status == "succeeded")
        .map(|attempt| attempt.id)
}

fn usage_i64(usage: &Value, field: &str) -> Option<i64> {
    usage.get(field).and_then(Value::as_i64)
}

async fn append_provider_capability_intent<R>(
    repository: &R,
    flow_run_id: Uuid,
    node_run_id: Option<Uuid>,
    span_id: Option<Uuid>,
    event: &ProviderStreamEvent,
) -> Result<()>
where
    R: OrchestrationRuntimeRepository,
{
    let (capability_id, call) = match event {
        ProviderStreamEvent::ToolCallCommit { call } => (
            host_tool_capability_id(&call.name),
            serde_json::to_value(call)?,
        ),
        ProviderStreamEvent::McpCallCommit { call } => (
            mcp_tool_capability_id(&call.server, &call.method),
            serde_json::to_value(call)?,
        ),
        _ => return Ok(()),
    };

    let event = append_host_event(
        repository,
        flow_run_id,
        node_run_id,
        span_id,
        "capability_call_requested",
        domain::RuntimeEventLayer::Capability,
        json!({
            "provider_only_intent": true,
            "capability_id": capability_id,
            "requested_by": "model",
            "call": call,
        }),
    )
    .await?;
    repository
        .append_capability_invocation(&AppendCapabilityInvocationInput {
            flow_run_id,
            span_id,
            capability_id,
            requested_by_span_id: span_id,
            requester_kind: "model".to_string(),
            arguments_ref: Some(format!("runtime_artifact:inline:{}", event.id)),
            authorization_status: "requested".to_string(),
            authorization_reason: None,
            result_ref: None,
            normalized_result: None,
            started_at: None,
            finished_at: None,
            error_payload: None,
        })
        .await?;

    Ok(())
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
