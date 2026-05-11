use std::sync::Arc;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use plugin_framework::{
    provider_contract::{ProviderInvocationInput, ProviderStreamEvent},
    provider_package::ProviderPackage,
    ProviderConfigField,
};
use serde_json::{json, Value};
use time::OffsetDateTime;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::{
    audit::audit_log,
    capability_plugin_runtime::{CapabilityPluginRuntimePort, ExecuteCapabilityNodeInput},
    errors::ControlPlaneError,
    flow::FlowService,
    model_provider::failover_queue::{freeze_queue_items, FailoverQueueSnapshotItem},
    plugin_lifecycle::reconcile_installation_snapshot,
    ports::{
        AppendRunEventInput, ApplicationRepository, CompleteCallbackTaskInput, FlowRepository,
        ModelDefinitionRepository, ModelProviderRepository, NodeContributionRepository,
        OrchestrationRuntimeRepository, PluginRepository, ProviderRuntimePort,
        RuntimeEventEnvelope, RuntimeEventStream, UpdateFlowRunInput, UpdateNodeRunInput,
    },
    state_transition::{ensure_flow_run_transition, ensure_node_run_transition},
};

pub(crate) mod compile_context;
mod data_model_runtime;
pub mod debug_artifacts;
pub mod debug_stream_events;
pub(crate) mod inputs;
mod live_debug_run;
mod payloads;
mod persistence;
mod runtime_event_persister;

use self::{
    compile_context::{build_compile_context, ensure_compiled_plan_runnable},
    inputs::{
        build_compiled_plan_input, build_complete_flow_run_input, build_complete_node_run_input,
        build_flow_run_input, build_node_run_input,
    },
    payloads::persisted_node_output_payload,
    persistence::{
        checkpoint_node_id, checkpoint_snapshot_from_record, next_node_started_at,
        persist_flow_debug_outcome, persist_preview_events, PersistFlowDebugOutcomeInput,
        WaitingNodeResumeUpdate,
    },
};

pub struct StartNodeDebugPreviewCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub node_id: String,
    pub input_payload: serde_json::Value,
    pub document_snapshot: Option<serde_json::Value>,
    pub debug_session_id: Option<String>,
}

pub struct StartFlowDebugRunCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub input_payload: serde_json::Value,
    pub document_snapshot: Option<serde_json::Value>,
    pub debug_session_id: Option<String>,
}

pub struct PrepareFlowDebugRunCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub flow_run_id: Uuid,
    pub input_payload: serde_json::Value,
    pub document_snapshot: Option<serde_json::Value>,
    pub debug_session_id: String,
}

pub struct ContinueFlowDebugRunCommand {
    pub application_id: Uuid,
    pub flow_run_id: Uuid,
    pub workspace_id: Uuid,
}

pub struct StartPublishedFlowRunCommand {
    pub application_id: Uuid,
    pub flow_run_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct LiveProviderStreamEvent {
    pub node_id: String,
    pub node_run_id: Uuid,
    pub event: ProviderStreamEvent,
}

pub type LiveProviderStreamEventSender = mpsc::UnboundedSender<LiveProviderStreamEvent>;

pub struct CancelFlowRunCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub flow_run_id: Uuid,
}

pub struct ResumeFlowRunCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub flow_run_id: Uuid,
    pub checkpoint_id: Uuid,
    pub input_payload: serde_json::Value,
}

pub struct CompleteCallbackTaskCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub callback_task_id: Uuid,
    pub response_payload: serde_json::Value,
}

fn ensure_data_model_side_effect_confirmation_approved(response_payload: &Value) -> Result<()> {
    let approved = response_payload
        .get("approved")
        .or_else(|| response_payload.get("confirmed"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if approved {
        Ok(())
    } else {
        Err(anyhow!(
            "DATA_MODEL_SIDE_EFFECT_CONFIRMATION_REJECTED: data_model write requires approved confirmation"
        ))
    }
}

fn ensure_data_model_side_effect_confirmation_metadata(
    actor: &domain::ActorContext,
    confirmation_payload: &Value,
) -> Result<()> {
    let expected_actor_user_id = confirmation_payload
        .get("actor_user_id")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("data_model side-effect confirmation actor is required"))
        .and_then(|value| Uuid::parse_str(value).map_err(Into::into))?;
    if expected_actor_user_id != actor.user_id {
        return Err(ControlPlaneError::PermissionDenied(
            "data_model_side_effect_confirmation_actor",
        )
        .into());
    }

    let expires_at = confirmation_payload
        .get("expires_at")
        .cloned()
        .ok_or_else(|| anyhow!("data_model side-effect confirmation expiry is required"))
        .and_then(|value| serde_json::from_value::<OffsetDateTime>(value).map_err(Into::into))?;
    if OffsetDateTime::now_utc() > expires_at {
        return Err(anyhow!(
            "DATA_MODEL_SIDE_EFFECT_CONFIRMATION_EXPIRED: data_model write confirmation expired"
        ));
    }

    Ok(())
}

pub async fn persist_runtime_debug_stream_events<R>(
    repository: &R,
    events: Vec<RuntimeEventEnvelope>,
) -> Result<()>
where
    R: OrchestrationRuntimeRepository,
{
    runtime_event_persister::persist_runtime_debug_stream_events(repository, events).await
}

#[derive(Clone)]
struct RuntimeProviderInvoker<R, H> {
    repository: R,
    runtime: H,
    workspace_id: Uuid,
    provider_secret_master_key: String,
    live_provider_events: Option<LiveProviderStreamEventSender>,
    persist_events: Option<mpsc::UnboundedSender<ProviderStreamEvent>>,
    runtime_event_stream: Option<Arc<dyn RuntimeEventStream>>,
    flow_run_id: Option<Uuid>,
    active_node_id: Option<String>,
    active_node_run_id: Option<Uuid>,
}

pub struct OrchestrationRuntimeService<R, H> {
    repository: R,
    runtime: H,
    runtime_engine: Arc<runtime_core::runtime_engine::RuntimeEngine>,
    provider_secret_master_key: String,
    runtime_event_stream: Option<Arc<dyn RuntimeEventStream>>,
}

impl<R, H> OrchestrationRuntimeService<R, H>
where
    R: ApplicationRepository
        + FlowRepository
        + OrchestrationRuntimeRepository
        + ModelDefinitionRepository
        + ModelProviderRepository
        + NodeContributionRepository
        + PluginRepository
        + Clone
        + Send
        + Sync
        + 'static,
    H: ProviderRuntimePort + CapabilityPluginRuntimePort + Clone,
{
    pub fn new(
        repository: R,
        runtime: H,
        runtime_engine: Arc<runtime_core::runtime_engine::RuntimeEngine>,
        provider_secret_master_key: impl Into<String>,
    ) -> Self {
        Self {
            repository,
            runtime,
            runtime_engine,
            provider_secret_master_key: provider_secret_master_key.into(),
            runtime_event_stream: None,
        }
    }

    pub fn with_runtime_event_stream(mut self, stream: Arc<dyn RuntimeEventStream>) -> Self {
        self.runtime_event_stream = Some(stream);
        self
    }

    fn runtime_invoker(&self, workspace_id: Uuid) -> RuntimeProviderInvoker<R, H> {
        RuntimeProviderInvoker {
            repository: self.repository.clone(),
            runtime: self.runtime.clone(),
            workspace_id,
            provider_secret_master_key: self.provider_secret_master_key.clone(),
            live_provider_events: None,
            persist_events: None,
            runtime_event_stream: self.runtime_event_stream.clone(),
            flow_run_id: None,
            active_node_id: None,
            active_node_run_id: None,
        }
    }

    fn runtime_invoker_with_live_provider_events(
        &self,
        workspace_id: Uuid,
        live_provider_events: LiveProviderStreamEventSender,
    ) -> RuntimeProviderInvoker<R, H> {
        RuntimeProviderInvoker {
            repository: self.repository.clone(),
            runtime: self.runtime.clone(),
            workspace_id,
            provider_secret_master_key: self.provider_secret_master_key.clone(),
            live_provider_events: Some(live_provider_events),
            persist_events: None,
            runtime_event_stream: self.runtime_event_stream.clone(),
            flow_run_id: None,
            active_node_id: None,
            active_node_run_id: None,
        }
    }

    async fn build_compile_context(
        &self,
        workspace_id: Uuid,
    ) -> Result<orchestration_runtime::compiler::FlowCompileContext> {
        build_compile_context(&self.repository, workspace_id).await
    }

    pub async fn start_node_debug_preview(
        &self,
        command: StartNodeDebugPreviewCommand,
    ) -> Result<domain::NodeDebugPreviewResult> {
        let actor = ApplicationRepository::load_actor_context_for_user(
            &self.repository,
            command.actor_user_id,
        )
        .await?;
        let editor_state = FlowService::new(self.repository.clone())
            .get_or_create_editor_state(command.actor_user_id, command.application_id)
            .await?;
        let application = self
            .repository
            .get_application(actor.current_workspace_id, command.application_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("application"))?;
        let compile_context = self.build_compile_context(application.workspace_id).await?;

        let preview_document = command
            .document_snapshot
            .as_ref()
            .unwrap_or(&editor_state.draft.document);

        let mut compiled_plan = orchestration_runtime::compiler::FlowCompiler::compile(
            editor_state.flow.id,
            &editor_state.draft.id.to_string(),
            preview_document,
            &compile_context,
        )?;
        freeze_failover_queue_routes(&self.repository, &mut compiled_plan).await?;
        ensure_compiled_plan_runnable(&compiled_plan)?;
        let invoker = self.runtime_invoker(application.workspace_id);
        let started_at = OffsetDateTime::now_utc();
        let preview = orchestration_runtime::preview_executor::run_node_preview(
            &compiled_plan,
            &command.node_id,
            &command.input_payload,
            &invoker,
        )
        .await?;
        let compiled_record = self
            .repository
            .upsert_compiled_plan(&build_compiled_plan_input(
                command.actor_user_id,
                &editor_state,
                &compiled_plan,
                preview_document,
            )?)
            .await?;
        let flow_run = self
            .repository
            .create_flow_run(&build_flow_run_input(
                command.actor_user_id,
                command.application_id,
                &editor_state,
                &compiled_record,
                &command,
                preview_document,
                started_at,
            ))
            .await?;
        let node_run = self
            .repository
            .create_node_run(&build_node_run_input(
                flow_run.id,
                &compiled_plan,
                &command.node_id,
                &preview,
                started_at,
            )?)
            .await?;
        let events =
            persist_preview_events(&self.repository, &flow_run, &node_run, &preview).await?;
        let finished_at = OffsetDateTime::now_utc();
        ensure_node_run_transition(
            node_run.status,
            if preview.is_failed() {
                domain::NodeRunStatus::Failed
            } else {
                domain::NodeRunStatus::Succeeded
            },
            "complete_node_debug_preview",
        )?;
        let node_run = self
            .repository
            .complete_node_run(&build_complete_node_run_input(
                &node_run,
                &preview,
                finished_at,
            ))
            .await?;
        ensure_flow_run_transition(
            flow_run.status,
            if preview.is_failed() {
                domain::FlowRunStatus::Failed
            } else {
                domain::FlowRunStatus::Succeeded
            },
            "complete_flow_debug_preview",
        )?;
        let flow_run = self
            .repository
            .complete_flow_run(&build_complete_flow_run_input(
                &flow_run,
                &preview,
                finished_at,
            ))
            .await?;

        Ok(domain::NodeDebugPreviewResult {
            flow_run,
            node_run,
            events,
            preview_payload: preview.as_payload(),
        })
    }

    pub async fn start_flow_debug_run(
        &self,
        command: StartFlowDebugRunCommand,
    ) -> Result<domain::ApplicationRunDetail> {
        live_debug_run::start_flow_debug_run(self, command).await
    }

    pub async fn open_flow_debug_run_shell(
        &self,
        command: StartFlowDebugRunCommand,
    ) -> Result<domain::FlowRunRecord> {
        live_debug_run::open_flow_debug_run_shell(self, command).await
    }

    pub async fn prepare_flow_debug_run_from_shell(
        &self,
        command: PrepareFlowDebugRunCommand,
    ) -> Result<domain::ApplicationRunDetail> {
        live_debug_run::prepare_flow_debug_run_from_shell(self, command).await
    }

    pub async fn continue_flow_debug_run(
        &self,
        command: ContinueFlowDebugRunCommand,
    ) -> Result<domain::ApplicationRunDetail> {
        live_debug_run::continue_flow_debug_run(self, command).await
    }

    pub async fn start_published_flow_run(
        &self,
        command: StartPublishedFlowRunCommand,
    ) -> Result<domain::ApplicationRunDetail> {
        let flow_run = self
            .repository
            .get_flow_run(command.application_id, command.flow_run_id)
            .await?
            .ok_or_else(|| anyhow!("flow run not found"))?;
        if flow_run.run_mode != domain::FlowRunMode::PublishedApiRun {
            return Err(ControlPlaneError::InvalidInput("run_mode").into());
        }
        let actor = ApplicationRepository::load_actor_context_for_user(
            &self.repository,
            flow_run.created_by,
        )
        .await?;
        let application = self
            .repository
            .get_application(actor.current_workspace_id, command.application_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("application"))?;

        let running = match flow_run.status {
            domain::FlowRunStatus::Queued => {
                ensure_flow_run_transition(
                    domain::FlowRunStatus::Queued,
                    domain::FlowRunStatus::Running,
                    "start_published_flow_run",
                )?;
                self.repository
                    .update_flow_run_if_status(
                        &UpdateFlowRunInput {
                            flow_run_id: flow_run.id,
                            status: domain::FlowRunStatus::Running,
                            output_payload: flow_run.output_payload.clone(),
                            error_payload: flow_run.error_payload.clone(),
                            finished_at: None,
                        },
                        domain::FlowRunStatus::Queued,
                    )
                    .await?
            }
            domain::FlowRunStatus::Running => Some(flow_run.clone()),
            _ => None,
        };
        let Some(running) = running else {
            return self
                .repository
                .get_application_run_detail(command.application_id, flow_run.id)
                .await?
                .ok_or_else(|| anyhow!("flow run detail not found"));
        };

        self.repository
            .append_run_event(&AppendRunEventInput {
                flow_run_id: running.id,
                node_run_id: None,
                event_type: "public_run_execution_started".to_string(),
                payload: json!({
                    "api_key_id": running.api_key_id,
                    "application_id": running.application_id,
                    "publication_version_id": running.publication_version_id,
                    "creator_user_id": running.created_by,
                    "external_user": running.external_user,
                    "external_conversation_id": running.external_conversation_id,
                    "external_trace_id": running.external_trace_id,
                    "compatibility_mode": running.compatibility_mode,
                }),
            })
            .await?;
        if let Some(stream) = &self.runtime_event_stream {
            let _ = stream
                .append(running.id, debug_stream_events::flow_started(running.id))
                .await;
        }

        let result = self
            .continue_flow_debug_run(ContinueFlowDebugRunCommand {
                application_id: command.application_id,
                flow_run_id: running.id,
                workspace_id: application.workspace_id,
            })
            .await;
        let detail = match result {
            Ok(detail) => detail,
            Err(error) => {
                if let Ok(Some(failed)) = self
                    .repository
                    .get_flow_run(command.application_id, running.id)
                    .await
                {
                    self.append_published_terminal_audit(&application, &failed)
                        .await;
                }
                return Err(error);
            }
        };
        self.append_published_terminal_audit(&application, &detail.flow_run)
            .await;
        Ok(detail)
    }

    pub async fn continue_flow_debug_run_with_live_provider_events(
        &self,
        command: ContinueFlowDebugRunCommand,
        live_provider_events: LiveProviderStreamEventSender,
    ) -> Result<domain::ApplicationRunDetail> {
        live_debug_run::continue_flow_debug_run_with_live_provider_events(
            self,
            command,
            live_provider_events,
        )
        .await
    }

    pub async fn cancel_flow_run(
        &self,
        command: CancelFlowRunCommand,
    ) -> Result<domain::ApplicationRunDetail> {
        live_debug_run::cancel_flow_run(self, command).await
    }

    pub async fn resume_flow_run(
        &self,
        command: ResumeFlowRunCommand,
    ) -> Result<domain::ApplicationRunDetail> {
        let actor = ApplicationRepository::load_actor_context_for_user(
            &self.repository,
            command.actor_user_id,
        )
        .await?;
        let flow_run = self
            .repository
            .get_flow_run(command.application_id, command.flow_run_id)
            .await?
            .ok_or_else(|| anyhow!("flow run not found"))?;
        let checkpoint = self
            .repository
            .get_checkpoint(command.flow_run_id, command.checkpoint_id)
            .await?
            .ok_or_else(|| anyhow!("checkpoint not found"))?;
        let current_detail = self
            .repository
            .get_application_run_detail(command.application_id, command.flow_run_id)
            .await?
            .ok_or_else(|| anyhow!("flow run detail not found"))?;
        let application = self
            .repository
            .get_application(actor.current_workspace_id, command.application_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("application"))?;
        let compiled_plan_id = flow_run
            .compiled_plan_id
            .ok_or_else(|| anyhow!("flow run compiled plan is not attached"))?;
        let compiled_record = self
            .repository
            .get_compiled_plan(compiled_plan_id)
            .await?
            .ok_or_else(|| anyhow!("compiled plan not found"))?;
        let compiled_plan: orchestration_runtime::compiled_plan::CompiledPlan =
            serde_json::from_value(compiled_record.plan.clone())?;
        let snapshot = checkpoint_snapshot_from_record(&checkpoint)?;
        let waiting_node_id = checkpoint_node_id(&checkpoint)?;
        let resume_patch = command
            .input_payload
            .as_object()
            .and_then(|payload| payload.get(&waiting_node_id))
            .cloned()
            .ok_or_else(|| anyhow!("resume payload is missing node input for {waiting_node_id}"))?;
        let outcome = orchestration_runtime::execution_engine::resume_flow_debug_run(
            &compiled_plan,
            &snapshot,
            &waiting_node_id,
            &resume_patch,
            &self.runtime_invoker(application.workspace_id),
        )
        .await?;
        let waiting_node_resume = if let Some(node_run_id) = checkpoint.node_run_id {
            let waiting_node = current_detail
                .node_runs
                .iter()
                .find(|record| record.id == node_run_id)
                .ok_or_else(|| anyhow!("waiting node run not found for checkpoint"))?;
            Some(WaitingNodeResumeUpdate {
                node_run_id,
                from_status: waiting_node.status,
                output_payload: resume_patch,
                metrics_payload: json!({ "resumed": true }),
                debug_payload: json!({}),
            })
        } else {
            None
        };

        self.persist_flow_debug_outcome(PersistFlowDebugOutcomeInput {
            application_id: command.application_id,
            flow_run: &flow_run,
            outcome: &outcome,
            trigger_event_type: "flow_run_resumed",
            trigger_event_payload: json!({
                "checkpoint_id": checkpoint.id,
                "input_payload": command.input_payload,
            }),
            base_started_at: next_node_started_at(&current_detail),
            waiting_node_resume,
        })
        .await
    }

    pub async fn complete_callback_task(
        &self,
        command: CompleteCallbackTaskCommand,
    ) -> Result<domain::ApplicationRunDetail> {
        let actor = ApplicationRepository::load_actor_context_for_user(
            &self.repository,
            command.actor_user_id,
        )
        .await?;
        let pending_callback_task = self
            .repository
            .get_callback_task(command.callback_task_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("callback_task"))?;
        if pending_callback_task.callback_kind == "data_model_side_effect_confirmation" {
            let confirmation_payload = pending_callback_task
                .external_ref_payload
                .as_ref()
                .unwrap_or(&pending_callback_task.request_payload);
            ensure_data_model_side_effect_confirmation_approved(&command.response_payload)?;
            ensure_data_model_side_effect_confirmation_metadata(&actor, confirmation_payload)?;
        }
        let callback_task = self
            .repository
            .complete_callback_task(&CompleteCallbackTaskInput {
                callback_task_id: command.callback_task_id,
                response_payload: command.response_payload.clone(),
                completed_at: OffsetDateTime::now_utc(),
            })
            .await?;
        let detail = self
            .repository
            .get_application_run_detail(command.application_id, callback_task.flow_run_id)
            .await?
            .ok_or_else(|| anyhow!("flow run not found for callback task"))?;
        let application = self
            .repository
            .get_application(actor.current_workspace_id, command.application_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("application"))?;
        let checkpoint = detail
            .checkpoints
            .iter()
            .rev()
            .find(|record| record.node_run_id == Some(callback_task.node_run_id))
            .cloned()
            .ok_or_else(|| anyhow!("checkpoint not found for callback task"))?;
        let flow_run = detail.flow_run.clone();
        let compiled_plan_id = flow_run
            .compiled_plan_id
            .ok_or_else(|| anyhow!("flow run compiled plan is not attached"))?;
        let compiled_record = self
            .repository
            .get_compiled_plan(compiled_plan_id)
            .await?
            .ok_or_else(|| anyhow!("compiled plan not found"))?;
        let compiled_plan: orchestration_runtime::compiled_plan::CompiledPlan =
            serde_json::from_value(compiled_record.plan.clone())?;
        if callback_task.callback_kind == "data_model_side_effect_confirmation" {
            return self
                .complete_data_model_side_effect_callback(
                    command,
                    &actor,
                    &callback_task,
                    &detail,
                    &application,
                    &checkpoint,
                    &flow_run,
                    &compiled_plan,
                )
                .await;
        }
        let snapshot = checkpoint_snapshot_from_record(&checkpoint)?;
        let waiting_node_id = checkpoint_node_id(&checkpoint)?;
        let outcome = orchestration_runtime::execution_engine::resume_flow_debug_run(
            &compiled_plan,
            &snapshot,
            &waiting_node_id,
            &command.response_payload,
            &self.runtime_invoker(application.workspace_id),
        )
        .await?;

        let waiting_node = detail
            .node_runs
            .iter()
            .find(|record| record.id == callback_task.node_run_id)
            .ok_or_else(|| anyhow!("waiting node run not found for callback task"))?;

        self.persist_flow_debug_outcome(PersistFlowDebugOutcomeInput {
            application_id: command.application_id,
            flow_run: &flow_run,
            outcome: &outcome,
            trigger_event_type: "flow_run_resumed",
            trigger_event_payload: json!({
                "callback_task_id": callback_task.id,
                "response_payload": command.response_payload,
            }),
            base_started_at: next_node_started_at(&detail),
            waiting_node_resume: Some(WaitingNodeResumeUpdate {
                node_run_id: callback_task.node_run_id,
                from_status: waiting_node.status,
                output_payload: callback_task.response_payload.clone().ok_or_else(|| {
                    anyhow!("completed callback task is missing response payload")
                })?,
                metrics_payload: json!({ "resumed": true }),
                debug_payload: json!({}),
            }),
        })
        .await
    }

    #[allow(clippy::too_many_arguments)]
    async fn complete_data_model_side_effect_callback(
        &self,
        command: CompleteCallbackTaskCommand,
        actor: &domain::ActorContext,
        callback_task: &domain::CallbackTaskRecord,
        detail: &domain::ApplicationRunDetail,
        application: &domain::ApplicationRecord,
        checkpoint: &domain::CheckpointRecord,
        flow_run: &domain::FlowRunRecord,
        compiled_plan: &orchestration_runtime::compiled_plan::CompiledPlan,
    ) -> Result<domain::ApplicationRunDetail> {
        let waiting_node_id = checkpoint_node_id(checkpoint)?;
        let node = compiled_plan
            .nodes
            .get(&waiting_node_id)
            .ok_or_else(|| anyhow!("waiting data_model node not found in compiled plan"))?;
        let waiting_node = detail
            .node_runs
            .iter()
            .find(|record| record.id == callback_task.node_run_id)
            .ok_or_else(|| anyhow!("waiting node run not found for callback task"))?;
        let confirmation_payload = callback_task
            .external_ref_payload
            .as_ref()
            .unwrap_or(&callback_task.request_payload);
        let execution = data_model_runtime::execute_confirmed_data_model_side_effect(
            self.repository.clone(),
            self.runtime_engine.clone(),
            actor,
            node,
            &data_model_runtime::DataModelRunContext {
                workspace_id: application.workspace_id,
                application_id: command.application_id,
                draft_id: flow_run.draft_id,
                flow_run_id: flow_run.id,
                node_run_id: callback_task.node_run_id,
            },
            confirmation_payload,
        )
        .await;

        if let Some(error_payload) = execution.error_payload.clone() {
            ensure_node_run_transition(
                waiting_node.status,
                domain::NodeRunStatus::Failed,
                "complete_data_model_side_effect_callback",
            )?;
            self.repository
                .update_node_run(&UpdateNodeRunInput {
                    node_run_id: callback_task.node_run_id,
                    status: domain::NodeRunStatus::Failed,
                    output_payload: json!({}),
                    error_payload: Some(error_payload.clone()),
                    metrics_payload: execution.metrics_payload,
                    debug_payload: json!({
                        "callback_task_id": callback_task.id,
                        "callback_kind": callback_task.callback_kind,
                    }),
                    finished_at: Some(OffsetDateTime::now_utc()),
                })
                .await?;
            ensure_flow_run_transition(
                flow_run.status,
                domain::FlowRunStatus::Failed,
                "complete_data_model_side_effect_callback",
            )?;
            self.repository
                .update_flow_run(&UpdateFlowRunInput {
                    flow_run_id: flow_run.id,
                    status: domain::FlowRunStatus::Failed,
                    output_payload: flow_run.output_payload.clone(),
                    error_payload: Some(error_payload.clone()),
                    finished_at: Some(OffsetDateTime::now_utc()),
                })
                .await?;
            self.repository
                .append_run_event(&AppendRunEventInput {
                    flow_run_id: flow_run.id,
                    node_run_id: Some(callback_task.node_run_id),
                    event_type: "flow_run_failed".to_string(),
                    payload: error_payload,
                })
                .await?;
            return self
                .repository
                .get_application_run_detail(command.application_id, flow_run.id)
                .await?
                .ok_or_else(|| anyhow!("flow run detail not found"));
        }

        let snapshot = checkpoint_snapshot_from_record(checkpoint)?;
        let outcome = orchestration_runtime::execution_engine::resume_flow_debug_run(
            compiled_plan,
            &snapshot,
            &waiting_node_id,
            &execution.output_payload,
            &self.runtime_invoker(application.workspace_id),
        )
        .await?;
        let side_effect_receipt = execution
            .metrics_payload
            .get("side_effect_receipt")
            .cloned()
            .unwrap_or(Value::Null);

        self.persist_flow_debug_outcome(PersistFlowDebugOutcomeInput {
            application_id: command.application_id,
            flow_run,
            outcome: &outcome,
            trigger_event_type: "data_model_side_effect_confirmed",
            trigger_event_payload: json!({
                "callback_task_id": callback_task.id,
                "response_payload": command.response_payload,
                "side_effect_receipt": side_effect_receipt,
            }),
            base_started_at: next_node_started_at(detail),
            waiting_node_resume: Some(WaitingNodeResumeUpdate {
                node_run_id: callback_task.node_run_id,
                from_status: waiting_node.status,
                output_payload: persisted_node_output_payload(
                    &execution.output_payload,
                    &execution.metrics_payload,
                    None,
                    &json!({
                        "callback_task_id": callback_task.id,
                        "callback_kind": callback_task.callback_kind,
                        "confirmed": true,
                    }),
                ),
                metrics_payload: execution.metrics_payload,
                debug_payload: json!({
                    "callback_task_id": callback_task.id,
                    "callback_kind": callback_task.callback_kind,
                    "confirmed": true,
                }),
            }),
        })
        .await
    }

    async fn persist_flow_debug_outcome(
        &self,
        input: PersistFlowDebugOutcomeInput<'_>,
    ) -> Result<domain::ApplicationRunDetail> {
        persist_flow_debug_outcome(&self.repository, input).await
    }

    async fn append_published_terminal_audit(
        &self,
        application: &domain::ApplicationRecord,
        flow_run: &domain::FlowRunRecord,
    ) {
        if flow_run.run_mode != domain::FlowRunMode::PublishedApiRun {
            return;
        }
        let (event_type, audit_action) = match flow_run.status {
            domain::FlowRunStatus::Succeeded => (
                "public_run_succeeded",
                "application_public_api.run_succeeded",
            ),
            domain::FlowRunStatus::Failed => {
                ("public_run_failed", "application_public_api.run_failed")
            }
            domain::FlowRunStatus::Cancelled => (
                "public_run_cancelled",
                "application_public_api.run_cancelled",
            ),
            _ => return,
        };
        let payload = json!({
            "api_key_id": flow_run.api_key_id,
            "application_id": flow_run.application_id,
            "publication_version_id": flow_run.publication_version_id,
            "creator_user_id": flow_run.created_by,
            "external_user": flow_run.external_user,
            "external_conversation_id": flow_run.external_conversation_id,
            "external_trace_id": flow_run.external_trace_id,
            "compatibility_mode": flow_run.compatibility_mode,
            "status": flow_run.status.as_str(),
        });
        let _ = self
            .repository
            .append_run_event(&AppendRunEventInput {
                flow_run_id: flow_run.id,
                node_run_id: None,
                event_type: event_type.to_string(),
                payload: payload.clone(),
            })
            .await;
        let _ = ApplicationRepository::append_audit_log(
            &self.repository,
            &audit_log(
                Some(application.workspace_id),
                Some(flow_run.created_by),
                "application_public_api_run",
                Some(flow_run.id),
                audit_action,
                payload,
            ),
        )
        .await;
    }
}

#[async_trait]
impl<R, H> orchestration_runtime::execution_engine::ProviderInvoker for RuntimeProviderInvoker<R, H>
where
    R: ModelProviderRepository + PluginRepository + Clone + Send + Sync,
    H: ProviderRuntimePort + Clone + Send + Sync,
{
    async fn invoke_llm(
        &self,
        runtime: &orchestration_runtime::compiled_plan::CompiledLlmRuntime,
        mut input: ProviderInvocationInput,
    ) -> Result<orchestration_runtime::execution_engine::ProviderInvocationOutput> {
        let provider_resolve_started = std::time::Instant::now();
        let instance = self.resolve_llm_instance(runtime).await?;
        tracing::debug!(
            provider_resolve_ms = provider_resolve_started.elapsed().as_millis() as u64,
            "provider resolve finished"
        );

        let installation_reconcile_started = std::time::Instant::now();
        let installation =
            reconcile_installation_snapshot(&self.repository, instance.installation_id).await?;
        tracing::debug!(
            installation_reconcile_ms = installation_reconcile_started.elapsed().as_millis() as u64,
            "installation reconcile finished"
        );
        let assigned = self
            .repository
            .list_assignments(self.workspace_id)
            .await?
            .into_iter()
            .any(|assignment| assignment.installation_id == installation.id);
        if !assigned
            || matches!(
                installation.desired_state,
                domain::PluginDesiredState::Disabled
            )
        {
            return Err(ControlPlaneError::InvalidInput("provider_code").into());
        }
        if installation.availability_status != domain::PluginAvailabilityStatus::Available {
            return Err(ControlPlaneError::Conflict("plugin_installation_unavailable").into());
        }

        let package_load_started = std::time::Instant::now();
        let package = load_provider_package(&installation.installed_path)?;
        tracing::debug!(
            package_load_ms = package_load_started.elapsed().as_millis() as u64,
            "package load finished"
        );

        let runtime_config_started = std::time::Instant::now();
        input.provider_config = build_provider_runtime_config(
            &self.repository,
            &self.provider_secret_master_key,
            &package,
            &instance,
        )
        .await?;
        tracing::debug!(
            runtime_config_ms = runtime_config_started.elapsed().as_millis() as u64,
            "runtime config finished"
        );

        let mut live_forward_handle = None;
        let live_provider_events = if let (Some(node_id), Some(node_run_id)) =
            (self.active_node_id.clone(), self.active_node_run_id)
        {
            let live_sender = self.live_provider_events.clone();
            let persist_sender = self.persist_events.clone();
            let runtime_event_stream = self.runtime_event_stream.clone();
            let flow_run_id = self.flow_run_id;
            let (provider_sender, mut provider_receiver) =
                mpsc::unbounded_channel::<ProviderStreamEvent>();
            if live_sender.is_some() || runtime_event_stream.is_some() || persist_sender.is_some() {
                live_forward_handle = Some(tokio::spawn(async move {
                    let mut think_tag_splitter = ThinkTagStreamSplitter::default();
                    while let Some(event) = provider_receiver.recv().await {
                        if let Some(sender) = &live_sender {
                            let _ = sender.send(LiveProviderStreamEvent {
                                node_id: node_id.clone(),
                                node_run_id,
                                event: event.clone(),
                            });
                        }
                        if let (Some(stream), Some(flow_run_id)) =
                            (&runtime_event_stream, flow_run_id)
                        {
                            let runtime_events = match &event {
                                ProviderStreamEvent::TextDelta { delta } => think_tag_splitter
                                    .split(delta)
                                    .into_iter()
                                    .map(|part| match part.kind {
                                        DebugDeltaKind::Text => debug_stream_events::text_delta(
                                            &node_id,
                                            node_run_id,
                                            part.text,
                                        ),
                                        DebugDeltaKind::Reasoning => {
                                            debug_stream_events::reasoning_delta(
                                                &node_id,
                                                node_run_id,
                                                part.text,
                                            )
                                        }
                                    })
                                    .collect::<Vec<_>>(),
                                ProviderStreamEvent::ReasoningDelta { delta } => {
                                    vec![debug_stream_events::reasoning_delta(
                                        &node_id,
                                        node_run_id,
                                        delta.clone(),
                                    )]
                                }
                                _ => Vec::new(),
                            };
                            if runtime_events.is_empty() {
                                if let Some(persist) = &persist_sender {
                                    let _ = persist.send(event);
                                }
                                continue;
                            };
                            for runtime_event in runtime_events {
                                let event_type = runtime_event.event_type.clone();
                                let source = runtime_event.source;
                                if let Err(error) = stream.append(flow_run_id, runtime_event).await
                                {
                                    if is_expected_runtime_event_stream_closed_error(&error) {
                                        tracing::debug!(
                                            flow_run_id = %flow_run_id,
                                            event_type = %event_type,
                                            source = ?source,
                                            error = %error,
                                            "provider runtime event append skipped because stream is already closed"
                                        );
                                    } else {
                                        tracing::warn!(
                                            flow_run_id = %flow_run_id,
                                            event_type = %event_type,
                                            source = ?source,
                                            error = %error,
                                            "failed to append provider runtime event"
                                        );
                                    }
                                }
                            }
                        }
                        if let Some(persist) = &persist_sender {
                            let _ = persist.send(event);
                        }
                    }
                }));
                Some(provider_sender)
            } else {
                None
            }
        } else {
            None
        };

        let has_live_provider_events = live_provider_events.is_some();
        let provider_invoke_started = std::time::Instant::now();
        let invocation_result = self
            .runtime
            .invoke_stream_with_live_events(&installation, input, live_provider_events)
            .await;
        tracing::debug!(
            provider_invoke_ms = provider_invoke_started.elapsed().as_millis() as u64,
            "provider invoke finished"
        );
        if let Some(handle) = live_forward_handle {
            if let Err(error) = handle.await {
                tracing::warn!(
                    error = %error,
                    "provider live event forwarding task panicked"
                );
            }
        }
        let invocation_output = invocation_result?;
        if let Some(persist) = &self.persist_events {
            if !has_live_provider_events {
                for event in invocation_output.events.iter().cloned() {
                    let _ = persist.send(event);
                }
            }
        }

        Ok(
            orchestration_runtime::execution_engine::ProviderInvocationOutput {
                events: invocation_output.events,
                result: invocation_output.result,
            },
        )
    }
}

fn is_expected_runtime_event_stream_closed_error(error: &anyhow::Error) -> bool {
    let message = error.to_string();
    message.contains("runtime event stream is closed")
        || message.contains("runtime event stream is not open")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DebugDeltaKind {
    Text,
    Reasoning,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DebugDeltaPart {
    kind: DebugDeltaKind,
    text: String,
}

#[derive(Debug, Default)]
struct ThinkTagStreamSplitter {
    inside_think: bool,
    pending: String,
}

impl ThinkTagStreamSplitter {
    fn split(&mut self, delta: &str) -> Vec<DebugDeltaPart> {
        self.pending.push_str(delta);
        let mut parts = Vec::new();

        loop {
            let tag = if self.inside_think {
                "</think>"
            } else {
                "<think>"
            };

            if let Some(tag_index) = self.pending.find(tag) {
                let text = self.pending[..tag_index].to_string();
                push_debug_delta_part(
                    &mut parts,
                    if self.inside_think {
                        DebugDeltaKind::Reasoning
                    } else {
                        DebugDeltaKind::Text
                    },
                    text,
                );
                self.pending.drain(..tag_index + tag.len());
                self.inside_think = !self.inside_think;
                continue;
            }

            let keep_len = partial_tag_prefix_len(&self.pending, tag);
            let emit_len = self.pending.len().saturating_sub(keep_len);
            if emit_len > 0 {
                let text = self.pending[..emit_len].to_string();
                self.pending.drain(..emit_len);
                push_debug_delta_part(
                    &mut parts,
                    if self.inside_think {
                        DebugDeltaKind::Reasoning
                    } else {
                        DebugDeltaKind::Text
                    },
                    text,
                );
            }
            break;
        }

        parts
    }
}

fn push_debug_delta_part(parts: &mut Vec<DebugDeltaPart>, kind: DebugDeltaKind, text: String) {
    if text.is_empty() {
        return;
    }

    if let Some(previous) = parts.last_mut().filter(|part| part.kind == kind) {
        previous.text.push_str(&text);
        return;
    }

    parts.push(DebugDeltaPart { kind, text });
}

fn partial_tag_prefix_len(buffer: &str, tag: &str) -> usize {
    let max_len = buffer.len().min(tag.len().saturating_sub(1));
    (1..=max_len)
        .rev()
        .find(|length| {
            let start = buffer.len() - length;
            buffer.is_char_boundary(start) && tag.starts_with(&buffer[start..])
        })
        .unwrap_or(0)
}

impl<R, H> RuntimeProviderInvoker<R, H>
where
    R: ModelProviderRepository + PluginRepository + Clone + Send + Sync,
    H: ProviderRuntimePort + Clone + Send + Sync,
{
    pub(super) fn for_flow_run(&self, flow_run_id: Uuid) -> Self {
        Self {
            repository: self.repository.clone(),
            runtime: self.runtime.clone(),
            workspace_id: self.workspace_id,
            provider_secret_master_key: self.provider_secret_master_key.clone(),
            live_provider_events: self.live_provider_events.clone(),
            persist_events: self.persist_events.clone(),
            runtime_event_stream: self.runtime_event_stream.clone(),
            flow_run_id: Some(flow_run_id),
            active_node_id: self.active_node_id.clone(),
            active_node_run_id: self.active_node_run_id,
        }
    }

    fn for_live_llm_node_with_persist(
        &self,
        node_id: String,
        node_run_id: Uuid,
        persist_events: mpsc::UnboundedSender<ProviderStreamEvent>,
    ) -> Self {
        Self {
            repository: self.repository.clone(),
            runtime: self.runtime.clone(),
            workspace_id: self.workspace_id,
            provider_secret_master_key: self.provider_secret_master_key.clone(),
            live_provider_events: self.live_provider_events.clone(),
            persist_events: Some(persist_events),
            runtime_event_stream: self.runtime_event_stream.clone(),
            flow_run_id: self.flow_run_id,
            active_node_id: Some(node_id),
            active_node_run_id: Some(node_run_id),
        }
    }

    async fn resolve_llm_instance(
        &self,
        runtime: &orchestration_runtime::compiled_plan::CompiledLlmRuntime,
    ) -> Result<domain::ModelProviderInstanceRecord> {
        let provider_instance_id = Uuid::parse_str(&runtime.provider_instance_id)
            .map_err(|_| ControlPlaneError::InvalidInput("source_instance_id"))?;
        let instance = self
            .repository
            .get_instance(self.workspace_id, provider_instance_id)
            .await?
            .ok_or(ControlPlaneError::InvalidInput("source_instance_id"))?;
        if instance.provider_code != runtime.provider_code
            || instance.status != domain::ModelProviderInstanceStatus::Ready
            || !instance.included_in_main
        {
            return Err(ControlPlaneError::InvalidInput("source_instance_id").into());
        }
        let installation = self
            .repository
            .get_installation(instance.installation_id)
            .await?
            .ok_or(ControlPlaneError::InvalidInput("source_instance_id"))?;
        let assigned = self
            .repository
            .list_assignments(self.workspace_id)
            .await?
            .into_iter()
            .any(|assignment| assignment.installation_id == installation.id);
        if !assigned
            || matches!(
                installation.desired_state,
                domain::PluginDesiredState::Disabled
            )
            || installation.availability_status != domain::PluginAvailabilityStatus::Available
        {
            return Err(ControlPlaneError::InvalidInput("source_instance_id").into());
        }
        if !instance.enabled_model_ids.is_empty()
            && !instance
                .enabled_model_ids
                .iter()
                .any(|model_id| model_id == &runtime.model)
        {
            return Err(ControlPlaneError::InvalidInput("model").into());
        }

        Ok(instance)
    }
}

#[async_trait]
impl<R, H> orchestration_runtime::execution_engine::CapabilityInvoker
    for RuntimeProviderInvoker<R, H>
where
    R: PluginRepository + Clone + Send + Sync,
    H: ProviderRuntimePort + CapabilityPluginRuntimePort + Clone + Send + Sync,
{
    async fn invoke_capability_node(
        &self,
        runtime: &orchestration_runtime::compiled_plan::CompiledPluginRuntime,
        config_payload: Value,
        input_payload: Value,
    ) -> Result<orchestration_runtime::execution_engine::CapabilityInvocationOutput> {
        let installation =
            reconcile_installation_snapshot(&self.repository, runtime.installation_id).await?;
        let assigned = self
            .repository
            .list_assignments(self.workspace_id)
            .await?
            .into_iter()
            .any(|assignment| assignment.installation_id == installation.id);
        if !assigned
            || matches!(
                installation.desired_state,
                domain::PluginDesiredState::Disabled
            )
        {
            return Err(ControlPlaneError::InvalidInput("installation_id").into());
        }
        if installation.availability_status != domain::PluginAvailabilityStatus::Available {
            return Err(ControlPlaneError::Conflict("plugin_installation_unavailable").into());
        }

        let output = self
            .runtime
            .execute_node(ExecuteCapabilityNodeInput {
                installation,
                contribution_code: runtime.contribution_code.clone(),
                config_payload,
                input_payload,
            })
            .await?;

        Ok(
            orchestration_runtime::execution_engine::CapabilityInvocationOutput {
                output_payload: output.output_payload,
            },
        )
    }
}

async fn build_provider_runtime_config<R>(
    repository: &R,
    master_key: &str,
    package: &ProviderPackage,
    instance: &domain::ModelProviderInstanceRecord,
) -> Result<Value>
where
    R: ModelProviderRepository,
{
    let secret_json = repository
        .get_secret_json(instance.id, master_key)
        .await?
        .unwrap_or_else(empty_object);
    validate_required_fields(
        &package.provider.form_schema,
        &instance.config_json,
        &secret_json,
    )?;
    merge_json_object(&instance.config_json, &secret_json)
}

fn validate_required_fields(
    form_schema: &[ProviderConfigField],
    public_config: &Value,
    secret_config: &Value,
) -> Result<()> {
    let public_object = public_config
        .as_object()
        .ok_or(ControlPlaneError::InvalidInput("config_json"))?;
    let secret_object = secret_config
        .as_object()
        .ok_or(ControlPlaneError::InvalidInput("config_json"))?;
    for field in form_schema {
        if !field.required {
            continue;
        }
        let value = if is_secret_field(&field.field_type) {
            secret_object.get(&field.key)
        } else {
            public_object.get(&field.key)
        };
        if value.is_none()
            || value == Some(&Value::Null)
            || value == Some(&Value::String(String::new()))
        {
            return Err(ControlPlaneError::InvalidInput("config_json").into());
        }
    }
    Ok(())
}

fn merge_json_object(base: &Value, patch: &Value) -> Result<Value> {
    let mut merged = base
        .as_object()
        .cloned()
        .ok_or(ControlPlaneError::InvalidInput("config_json"))?;
    let patch_object = patch
        .as_object()
        .ok_or(ControlPlaneError::InvalidInput("config_json"))?;
    for (key, value) in patch_object {
        merged.insert(key.clone(), value.clone());
    }
    Ok(Value::Object(merged))
}

fn empty_object() -> Value {
    Value::Object(serde_json::Map::new())
}

fn is_secret_field(field_type: &str) -> bool {
    field_type.trim().eq_ignore_ascii_case("secret")
}

fn load_provider_package(path: &str) -> Result<ProviderPackage> {
    ProviderPackage::load_from_dir(path)
        .map_err(|_| ControlPlaneError::InvalidInput("provider_package").into())
}

async fn freeze_failover_queue_routes<R>(
    repository: &R,
    compiled_plan: &mut orchestration_runtime::compiled_plan::CompiledPlan,
) -> Result<()>
where
    R: ModelProviderRepository,
{
    for node in compiled_plan.nodes.values_mut() {
        let Some(runtime) = node.llm_runtime.as_mut() else {
            continue;
        };
        let Some(routing) = runtime.routing.as_mut() else {
            continue;
        };
        if routing.routing_mode
            != orchestration_runtime::compiled_plan::LlmRoutingMode::FailoverQueue
            || !routing.queue_targets.is_empty()
        {
            continue;
        }

        let queue_template_id = routing
            .queue_template_id
            .as_deref()
            .and_then(|value| Uuid::parse_str(value).ok())
            .ok_or(ControlPlaneError::InvalidInput("queue_template_id"))?;
        let queue = repository
            .get_failover_queue_template(queue_template_id)
            .await?
            .ok_or(ControlPlaneError::InvalidInput("queue_template_id"))?;
        if queue.status != "active" {
            return Err(ControlPlaneError::InvalidInput("queue_template_id").into());
        }
        let items = repository
            .list_failover_queue_items(queue_template_id)
            .await?;
        let snapshot_items = items
            .iter()
            .cloned()
            .map(FailoverQueueSnapshotItem::from)
            .collect::<Vec<_>>();
        let snapshot = repository
            .create_failover_queue_snapshot(&crate::ports::CreateModelFailoverQueueSnapshotInput {
                snapshot_id: Uuid::now_v7(),
                queue_template_id,
                version: queue.version,
                items: freeze_queue_items(&snapshot_items),
            })
            .await?;
        routing.queue_snapshot_id = Some(snapshot.id.to_string());
        routing.queue_targets = snapshot_items
            .into_iter()
            .filter(|item| item.enabled)
            .map(
                |item| orchestration_runtime::compiled_plan::CompiledLlmRouteTarget {
                    provider_instance_id: item.provider_instance_id.to_string(),
                    provider_code: item.provider_code,
                    protocol: item.protocol,
                    upstream_model_id: item.upstream_model_id,
                },
            )
            .collect();
        let Some(first_target) = routing.queue_targets.first() else {
            return Err(ControlPlaneError::InvalidInput("queue_template_id").into());
        };
        runtime.provider_instance_id = first_target.provider_instance_id.clone();
        runtime.provider_code = first_target.provider_code.clone();
        runtime.protocol = first_target.protocol.clone();
        runtime.model = first_target.upstream_model_id.clone();
    }

    Ok(())
}

#[cfg(test)]
#[path = "_tests/orchestration_runtime/support.rs"]
pub(crate) mod test_support;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{errors::ControlPlaneError, ports::ModelProviderRepository};

    #[tokio::test]
    async fn orchestration_runtime_resolve_llm_instance_does_not_fallback_when_selected_instance_is_missing(
    ) {
        let repository =
            test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(vec![]);
        let (alpha_instance_id, _) = repository.seed_included_provider_instances();
        let invoker = RuntimeProviderInvoker {
            repository,
            runtime: test_support::InMemoryProviderRuntime::default(),
            workspace_id: Uuid::nil(),
            provider_secret_master_key: "test-master-key".to_string(),
            live_provider_events: None,
            persist_events: None,
            runtime_event_stream: None,
            flow_run_id: None,
            active_node_id: None,
            active_node_run_id: None,
        };

        let error = invoker
            .resolve_llm_instance(&orchestration_runtime::compiled_plan::CompiledLlmRuntime {
                provider_instance_id: Uuid::now_v7().to_string(),
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                model: "gpt-5.4-mini".to_string(),
                routing: None,
            })
            .await
            .expect_err("missing selected instance should fail");

        assert!(matches!(
            error.downcast_ref::<ControlPlaneError>(),
            Some(ControlPlaneError::InvalidInput("source_instance_id"))
        ));
        assert_ne!(alpha_instance_id, Uuid::nil());
    }

    #[tokio::test]
    async fn orchestration_runtime_resolve_llm_instance_does_not_fallback_when_selected_instance_is_not_ready(
    ) {
        let repository =
            test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(vec![]);
        let (_, backup_instance_id) = repository.seed_included_provider_instances();
        repository.set_instance_status(
            backup_instance_id,
            domain::ModelProviderInstanceStatus::Disabled,
        );
        let invoker = RuntimeProviderInvoker {
            repository,
            runtime: test_support::InMemoryProviderRuntime::default(),
            workspace_id: Uuid::nil(),
            provider_secret_master_key: "test-master-key".to_string(),
            live_provider_events: None,
            persist_events: None,
            runtime_event_stream: None,
            flow_run_id: None,
            active_node_id: None,
            active_node_run_id: None,
        };

        let error = invoker
            .resolve_llm_instance(&orchestration_runtime::compiled_plan::CompiledLlmRuntime {
                provider_instance_id: backup_instance_id.to_string(),
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                model: "gpt-5.4-mini".to_string(),
                routing: None,
            })
            .await
            .expect_err("non-ready selected instance should fail");

        assert!(matches!(
            error.downcast_ref::<ControlPlaneError>(),
            Some(ControlPlaneError::InvalidInput("source_instance_id"))
        ));
    }

    #[tokio::test]
    async fn orchestration_runtime_resolve_llm_instance_uses_selected_child_instance_without_provider_fallback(
    ) {
        let repository =
            test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(vec![]);
        let (_, backup_instance_id) = repository.seed_included_provider_instances();
        repository.set_instance_enabled_models(backup_instance_id, vec!["gpt-5.4-mini"]);
        let invoker = RuntimeProviderInvoker {
            repository: repository.clone(),
            runtime: test_support::InMemoryProviderRuntime::default(),
            workspace_id: Uuid::nil(),
            provider_secret_master_key: "test-master-key".to_string(),
            live_provider_events: None,
            persist_events: None,
            runtime_event_stream: None,
            flow_run_id: None,
            active_node_id: None,
            active_node_run_id: None,
        };

        let resolved = invoker
            .resolve_llm_instance(&orchestration_runtime::compiled_plan::CompiledLlmRuntime {
                provider_instance_id: backup_instance_id.to_string(),
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                model: "gpt-5.4-mini".to_string(),
                routing: None,
            })
            .await
            .expect("selected child instance should resolve");

        let repository_instance =
            ModelProviderRepository::get_instance(&repository, Uuid::nil(), backup_instance_id)
                .await
                .expect("instance lookup should succeed")
                .expect("instance should exist");
        assert_eq!(resolved.id, repository_instance.id);
        assert_eq!(resolved.display_name, repository_instance.display_name);
    }

    #[tokio::test]
    async fn orchestration_runtime_resolve_llm_instance_rejects_model_only_present_in_catalog_cache(
    ) {
        let repository =
            test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(vec![]);
        let selected_instance_id = repository.seed_provider_instance(
            "fixture_provider",
            "Cache Wider Than Enabled",
            true,
            domain::ModelProviderInstanceStatus::Ready,
            vec!["other-model"],
        );
        repository
            .set_instance_catalog_models(selected_instance_id, vec!["other-model", "gpt-5.4-mini"]);
        let invoker = RuntimeProviderInvoker {
            repository,
            runtime: test_support::InMemoryProviderRuntime::default(),
            workspace_id: Uuid::nil(),
            provider_secret_master_key: "test-master-key".to_string(),
            live_provider_events: None,
            persist_events: None,
            runtime_event_stream: None,
            flow_run_id: None,
            active_node_id: None,
            active_node_run_id: None,
        };

        let error = invoker
            .resolve_llm_instance(&orchestration_runtime::compiled_plan::CompiledLlmRuntime {
                provider_instance_id: selected_instance_id.to_string(),
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                model: "gpt-5.4-mini".to_string(),
                routing: None,
            })
            .await
            .expect_err("model outside enabled_model_ids should fail");

        assert!(matches!(
            error.downcast_ref::<ControlPlaneError>(),
            Some(ControlPlaneError::InvalidInput("model"))
        ));
    }
}
