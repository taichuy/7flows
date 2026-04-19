use std::collections::{BTreeMap, BTreeSet};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use plugin_framework::{
    provider_contract::{ProviderInvocationInput, ProviderStreamEvent},
    provider_package::ProviderPackage,
    ProviderConfigField,
};
use serde_json::{json, Value};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    flow::FlowService,
    ports::{
        AppendRunEventInput, ApplicationRepository, CompleteCallbackTaskInput,
        CompleteFlowRunInput, CompleteNodeRunInput, CreateCallbackTaskInput, CreateCheckpointInput,
        CreateFlowRunInput, CreateNodeRunInput, FlowRepository, ModelProviderRepository,
        OrchestrationRuntimeRepository, PluginRepository, ProviderRuntimePort, UpdateFlowRunInput,
        UpdateNodeRunInput, UpsertCompiledPlanInput,
    },
};

pub struct StartNodeDebugPreviewCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub node_id: String,
    pub input_payload: serde_json::Value,
}

pub struct StartFlowDebugRunCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub input_payload: serde_json::Value,
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

struct WaitingNodeResumeUpdate {
    node_run_id: Uuid,
    output_payload: Value,
}

struct PersistFlowDebugOutcomeInput<'a> {
    application_id: Uuid,
    flow_run: &'a domain::FlowRunRecord,
    outcome: &'a orchestration_runtime::execution_state::FlowDebugExecutionOutcome,
    trigger_event_type: &'a str,
    trigger_event_payload: Value,
    base_started_at: OffsetDateTime,
    waiting_node_resume: Option<WaitingNodeResumeUpdate>,
}

#[derive(Clone)]
struct RuntimeProviderInvoker<R, H> {
    repository: R,
    runtime: H,
    workspace_id: Uuid,
    provider_secret_master_key: String,
}

pub struct OrchestrationRuntimeService<R, H> {
    repository: R,
    runtime: H,
    provider_secret_master_key: String,
}

impl<R, H> OrchestrationRuntimeService<R, H>
where
    R: ApplicationRepository
        + FlowRepository
        + OrchestrationRuntimeRepository
        + ModelProviderRepository
        + PluginRepository
        + Clone,
    H: ProviderRuntimePort + Clone,
{
    pub fn new(repository: R, runtime: H, provider_secret_master_key: impl Into<String>) -> Self {
        Self {
            repository,
            runtime,
            provider_secret_master_key: provider_secret_master_key.into(),
        }
    }

    fn runtime_invoker(&self, workspace_id: Uuid) -> RuntimeProviderInvoker<R, H> {
        RuntimeProviderInvoker {
            repository: self.repository.clone(),
            runtime: self.runtime.clone(),
            workspace_id,
            provider_secret_master_key: self.provider_secret_master_key.clone(),
        }
    }

    async fn build_compile_context(
        &self,
        workspace_id: Uuid,
    ) -> Result<orchestration_runtime::compiler::FlowCompileContext> {
        let instances = self.repository.list_instances(workspace_id).await?;
        let mut provider_instances = BTreeMap::new();

        for instance in instances {
            let available_models = self
                .repository
                .get_catalog_cache(instance.id)
                .await?
                .and_then(|cache| cache.models_json.as_array().cloned())
                .unwrap_or_default()
                .into_iter()
                .filter_map(|model| {
                    model
                        .get("model_id")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .collect::<BTreeSet<_>>();

            provider_instances.insert(
                instance.id.to_string(),
                orchestration_runtime::compiler::FlowCompileProviderInstance {
                    provider_instance_id: instance.id.to_string(),
                    provider_code: instance.provider_code,
                    protocol: instance.protocol,
                    is_ready: instance.status == domain::ModelProviderInstanceStatus::Ready,
                    available_models,
                    allow_custom_models: allow_custom_models(&instance.config_json),
                },
            );
        }

        Ok(orchestration_runtime::compiler::FlowCompileContext { provider_instances })
    }

    pub async fn start_node_debug_preview(
        &self,
        command: StartNodeDebugPreviewCommand,
    ) -> Result<domain::NodeDebugPreviewResult> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
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

        let compiled_plan = orchestration_runtime::compiler::FlowCompiler::compile(
            editor_state.flow.id,
            &editor_state.draft.id.to_string(),
            &editor_state.draft.document,
            &compile_context,
        )?;
        ensure_compiled_plan_runnable(&compiled_plan)?;
        let invoker = self.runtime_invoker(application.workspace_id);
        let preview = orchestration_runtime::preview_executor::run_node_preview(
            &compiled_plan,
            &command.node_id,
            &command.input_payload,
            &invoker,
        )
        .await?;
        let started_at = OffsetDateTime::now_utc();
        let compiled_record = self
            .repository
            .upsert_compiled_plan(&build_compiled_plan_input(
                command.actor_user_id,
                &editor_state,
                &compiled_plan,
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
        let node_run = self
            .repository
            .complete_node_run(&build_complete_node_run_input(
                &node_run,
                &preview,
                finished_at,
            ))
            .await?;
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
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
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
        let compiled_plan = orchestration_runtime::compiler::FlowCompiler::compile(
            editor_state.flow.id,
            &editor_state.draft.id.to_string(),
            &editor_state.draft.document,
            &compile_context,
        )?;
        ensure_compiled_plan_runnable(&compiled_plan)?;
        let invoker = self.runtime_invoker(application.workspace_id);
        let outcome = orchestration_runtime::execution_engine::start_flow_debug_run(
            &compiled_plan,
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
            )?)
            .await?;
        let flow_run = self
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

        self.persist_flow_debug_outcome(PersistFlowDebugOutcomeInput {
            application_id: command.application_id,
            flow_run: &flow_run,
            outcome: &outcome,
            trigger_event_type: "flow_run_started",
            trigger_event_payload: json!({
                "run_mode": domain::FlowRunMode::DebugFlowRun.as_str(),
                "input_payload": command.input_payload,
            }),
            base_started_at: OffsetDateTime::now_utc(),
            waiting_node_resume: None,
        })
        .await
    }

    pub async fn resume_flow_run(
        &self,
        command: ResumeFlowRunCommand,
    ) -> Result<domain::ApplicationRunDetail> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
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
        let compiled_record = self
            .repository
            .get_compiled_plan(flow_run.compiled_plan_id)
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
            &command.input_payload,
            &self.runtime_invoker(application.workspace_id),
        )
        .await?;

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
            waiting_node_resume: checkpoint.node_run_id.map(|node_run_id| {
                WaitingNodeResumeUpdate {
                    node_run_id,
                    output_payload: resume_patch,
                }
            }),
        })
        .await
    }

    pub async fn complete_callback_task(
        &self,
        command: CompleteCallbackTaskCommand,
    ) -> Result<domain::ApplicationRunDetail> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
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
        let compiled_record = self
            .repository
            .get_compiled_plan(flow_run.compiled_plan_id)
            .await?
            .ok_or_else(|| anyhow!("compiled plan not found"))?;
        let compiled_plan: orchestration_runtime::compiled_plan::CompiledPlan =
            serde_json::from_value(compiled_record.plan.clone())?;
        let snapshot = checkpoint_snapshot_from_record(&checkpoint)?;
        let waiting_node_id = checkpoint_node_id(&checkpoint)?;
        let resume_payload = json!({
            waiting_node_id.clone(): command.response_payload.clone()
        });
        let outcome = orchestration_runtime::execution_engine::resume_flow_debug_run(
            &compiled_plan,
            &snapshot,
            &resume_payload,
            &self.runtime_invoker(application.workspace_id),
        )
        .await?;

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
                output_payload: callback_task.response_payload.clone().ok_or_else(|| {
                    anyhow!("completed callback task is missing response payload")
                })?,
            }),
        })
        .await
    }

    async fn persist_flow_debug_outcome(
        &self,
        input: PersistFlowDebugOutcomeInput<'_>,
    ) -> Result<domain::ApplicationRunDetail> {
        let PersistFlowDebugOutcomeInput {
            application_id,
            flow_run,
            outcome,
            trigger_event_type,
            trigger_event_payload,
            base_started_at,
            waiting_node_resume,
        } = input;
        self.repository
            .append_run_event(&AppendRunEventInput {
                flow_run_id: flow_run.id,
                node_run_id: waiting_node_resume.as_ref().map(|value| value.node_run_id),
                event_type: trigger_event_type.to_string(),
                payload: trigger_event_payload,
            })
            .await?;

        if let Some(waiting_node_resume) = waiting_node_resume {
            self.repository
                .update_node_run(&UpdateNodeRunInput {
                    node_run_id: waiting_node_resume.node_run_id,
                    status: domain::NodeRunStatus::Succeeded,
                    output_payload: waiting_node_resume.output_payload,
                    error_payload: None,
                    metrics_payload: json!({ "resumed": true }),
                    finished_at: Some(OffsetDateTime::now_utc()),
                })
                .await?;
        }

        let waiting_node_run =
            persist_flow_debug_node_traces(&self.repository, flow_run.id, outcome, base_started_at)
                .await?;

        match &outcome.stop_reason {
            orchestration_runtime::execution_state::ExecutionStopReason::WaitingHuman(wait) => {
                let snapshot = outcome
                    .checkpoint_snapshot
                    .as_ref()
                    .ok_or_else(|| anyhow!("waiting_human outcome is missing checkpoint"))?;
                let waiting_node_run = waiting_node_run
                    .ok_or_else(|| anyhow!("waiting_human outcome is missing node run"))?;
                self.repository
                    .create_checkpoint(&CreateCheckpointInput {
                        flow_run_id: flow_run.id,
                        node_run_id: Some(waiting_node_run.id),
                        status: "waiting_human".to_string(),
                        reason: "等待人工输入".to_string(),
                        locator_payload: json!({
                            "node_id": wait.node_id,
                            "next_node_index": snapshot.next_node_index,
                        }),
                        variable_snapshot: Value::Object(snapshot.variable_pool.clone()),
                        external_ref_payload: Some(json!({ "prompt": wait.prompt })),
                    })
                    .await?;
                self.repository
                    .update_flow_run(&UpdateFlowRunInput {
                        flow_run_id: flow_run.id,
                        status: domain::FlowRunStatus::WaitingHuman,
                        output_payload: json!({}),
                        error_payload: None,
                        finished_at: None,
                    })
                    .await?;
            }
            orchestration_runtime::execution_state::ExecutionStopReason::WaitingCallback(wait) => {
                let snapshot = outcome
                    .checkpoint_snapshot
                    .as_ref()
                    .ok_or_else(|| anyhow!("waiting_callback outcome is missing checkpoint"))?;
                let waiting_node_run = waiting_node_run
                    .ok_or_else(|| anyhow!("waiting_callback outcome is missing node run"))?;
                self.repository
                    .create_checkpoint(&CreateCheckpointInput {
                        flow_run_id: flow_run.id,
                        node_run_id: Some(waiting_node_run.id),
                        status: "waiting_callback".to_string(),
                        reason: "等待 callback 回填".to_string(),
                        locator_payload: json!({
                            "node_id": wait.node_id,
                            "next_node_index": snapshot.next_node_index,
                        }),
                        variable_snapshot: Value::Object(snapshot.variable_pool.clone()),
                        external_ref_payload: Some(wait.request_payload.clone()),
                    })
                    .await?;
                self.repository
                    .create_callback_task(&CreateCallbackTaskInput {
                        flow_run_id: flow_run.id,
                        node_run_id: waiting_node_run.id,
                        callback_kind: wait.callback_kind.clone(),
                        request_payload: wait.request_payload.clone(),
                        external_ref_payload: Some(wait.request_payload.clone()),
                    })
                    .await?;
                self.repository
                    .update_flow_run(&UpdateFlowRunInput {
                        flow_run_id: flow_run.id,
                        status: domain::FlowRunStatus::WaitingCallback,
                        output_payload: json!({}),
                        error_payload: None,
                        finished_at: None,
                    })
                    .await?;
            }
            orchestration_runtime::execution_state::ExecutionStopReason::Completed => {
                self.repository
                    .update_flow_run(&UpdateFlowRunInput {
                        flow_run_id: flow_run.id,
                        status: domain::FlowRunStatus::Succeeded,
                        output_payload: final_flow_output_payload(outcome),
                        error_payload: None,
                        finished_at: Some(OffsetDateTime::now_utc()),
                    })
                    .await?;
                self.repository
                    .append_run_event(&AppendRunEventInput {
                        flow_run_id: flow_run.id,
                        node_run_id: None,
                        event_type: "flow_run_completed".to_string(),
                        payload: final_flow_output_payload(outcome),
                    })
                    .await?;
            }
            orchestration_runtime::execution_state::ExecutionStopReason::Failed(failure) => {
                self.repository
                    .update_flow_run(&UpdateFlowRunInput {
                        flow_run_id: flow_run.id,
                        status: domain::FlowRunStatus::Failed,
                        output_payload: final_flow_output_payload(outcome),
                        error_payload: Some(failure.error_payload.clone()),
                        finished_at: Some(OffsetDateTime::now_utc()),
                    })
                    .await?;
                self.repository
                    .append_run_event(&AppendRunEventInput {
                        flow_run_id: flow_run.id,
                        node_run_id: None,
                        event_type: "flow_run_failed".to_string(),
                        payload: failure.error_payload.clone(),
                    })
                    .await?;
            }
        }

        self.repository
            .get_application_run_detail(application_id, flow_run.id)
            .await?
            .ok_or_else(|| anyhow!("persisted flow run detail not found"))
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
        let provider_instance_id = Uuid::parse_str(&runtime.provider_instance_id)
            .map_err(|_| ControlPlaneError::InvalidInput("provider_instance_id"))?;
        let instance = self
            .repository
            .get_instance(self.workspace_id, provider_instance_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_provider_instance"))?;
        if instance.status != domain::ModelProviderInstanceStatus::Ready {
            return Err(ControlPlaneError::InvalidInput("provider_instance_id").into());
        }
        let installation = self
            .repository
            .get_installation(instance.installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        let assigned = self
            .repository
            .list_assignments(self.workspace_id)
            .await?
            .into_iter()
            .any(|assignment| assignment.installation_id == installation.id);
        if !assigned || !installation.enabled {
            return Err(ControlPlaneError::InvalidInput("provider_instance_id").into());
        }

        let package = load_provider_package(&installation.install_path)?;
        input.provider_config = build_provider_runtime_config(
            &self.repository,
            &self.provider_secret_master_key,
            &package,
            &instance,
        )
        .await?;

        self.runtime
            .invoke_stream(&installation, input)
            .await
            .map(
                |output| orchestration_runtime::execution_engine::ProviderInvocationOutput {
                    events: output.events,
                    result: output.result,
                },
            )
    }
}

fn build_compiled_plan_input(
    actor_user_id: Uuid,
    editor_state: &domain::FlowEditorState,
    compiled_plan: &orchestration_runtime::compiled_plan::CompiledPlan,
) -> Result<UpsertCompiledPlanInput> {
    Ok(UpsertCompiledPlanInput {
        actor_user_id,
        flow_id: editor_state.flow.id,
        flow_draft_id: editor_state.draft.id,
        schema_version: compiled_plan.schema_version.clone(),
        document_updated_at: editor_state.draft.updated_at,
        plan: serde_json::to_value(compiled_plan)?,
    })
}

fn build_flow_run_input(
    actor_user_id: Uuid,
    application_id: Uuid,
    editor_state: &domain::FlowEditorState,
    compiled_record: &domain::CompiledPlanRecord,
    command: &StartNodeDebugPreviewCommand,
    started_at: OffsetDateTime,
) -> CreateFlowRunInput {
    CreateFlowRunInput {
        actor_user_id,
        application_id,
        flow_id: editor_state.flow.id,
        flow_draft_id: editor_state.draft.id,
        compiled_plan_id: compiled_record.id,
        run_mode: domain::FlowRunMode::DebugNodePreview,
        target_node_id: Some(command.node_id.clone()),
        status: domain::FlowRunStatus::Running,
        input_payload: command.input_payload.clone(),
        started_at,
    }
}

fn build_node_run_input(
    flow_run_id: Uuid,
    compiled_plan: &orchestration_runtime::compiled_plan::CompiledPlan,
    target_node_id: &str,
    preview: &orchestration_runtime::preview_executor::NodePreviewOutcome,
    started_at: OffsetDateTime,
) -> Result<CreateNodeRunInput> {
    let node = compiled_plan
        .nodes
        .get(target_node_id)
        .ok_or_else(|| anyhow!("target node not found in compiled plan: {target_node_id}"))?;

    Ok(CreateNodeRunInput {
        flow_run_id,
        node_id: node.node_id.clone(),
        node_type: node.node_type.clone(),
        node_alias: node.alias.clone(),
        status: domain::NodeRunStatus::Running,
        input_payload: json!(preview.resolved_inputs),
        started_at,
    })
}

fn build_complete_node_run_input(
    node_run: &domain::NodeRunRecord,
    preview: &orchestration_runtime::preview_executor::NodePreviewOutcome,
    finished_at: OffsetDateTime,
) -> CompleteNodeRunInput {
    CompleteNodeRunInput {
        node_run_id: node_run.id,
        status: if preview.is_failed() {
            domain::NodeRunStatus::Failed
        } else {
            domain::NodeRunStatus::Succeeded
        },
        output_payload: preview.as_payload(),
        error_payload: preview.error_payload.clone(),
        metrics_payload: json!({
            "output_contract_count": preview.output_contract.len(),
            "provider_events": preview.provider_events.len(),
            "runtime": preview.metrics_payload,
        }),
        finished_at,
    }
}

fn build_complete_flow_run_input(
    flow_run: &domain::FlowRunRecord,
    preview: &orchestration_runtime::preview_executor::NodePreviewOutcome,
    finished_at: OffsetDateTime,
) -> CompleteFlowRunInput {
    CompleteFlowRunInput {
        flow_run_id: flow_run.id,
        status: if preview.is_failed() {
            domain::FlowRunStatus::Failed
        } else {
            domain::FlowRunStatus::Succeeded
        },
        output_payload: preview.as_payload(),
        error_payload: preview.error_payload.clone(),
        finished_at,
    }
}

fn ensure_compiled_plan_runnable(
    compiled_plan: &orchestration_runtime::compiled_plan::CompiledPlan,
) -> Result<()> {
    if let Some(issue) = compiled_plan.compile_issues.first() {
        let field = match issue.code {
            orchestration_runtime::compiled_plan::CompileIssueCode::MissingProviderInstance
            | orchestration_runtime::compiled_plan::CompileIssueCode::ProviderInstanceNotFound
            | orchestration_runtime::compiled_plan::CompileIssueCode::ProviderInstanceNotReady => {
                "provider_instance_id"
            }
            orchestration_runtime::compiled_plan::CompileIssueCode::MissingModel
            | orchestration_runtime::compiled_plan::CompileIssueCode::ModelNotAvailable => "model",
        };
        return Err(ControlPlaneError::InvalidInput(field).into());
    }

    Ok(())
}

async fn append_provider_stream_events<R>(
    repository: &R,
    flow_run_id: Uuid,
    node_run_id: Option<Uuid>,
    events: &[ProviderStreamEvent],
) -> Result<Vec<domain::RunEventRecord>>
where
    R: OrchestrationRuntimeRepository,
{
    let mut records = Vec::with_capacity(events.len());
    for event in events {
        records.push(
            repository
                .append_run_event(&AppendRunEventInput {
                    flow_run_id,
                    node_run_id,
                    event_type: provider_stream_event_type(event).to_string(),
                    payload: serde_json::to_value(event)?,
                })
                .await?,
        );
    }
    Ok(records)
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

async fn persist_preview_events<R>(
    repository: &R,
    flow_run: &domain::FlowRunRecord,
    node_run: &domain::NodeRunRecord,
    preview: &orchestration_runtime::preview_executor::NodePreviewOutcome,
) -> Result<Vec<domain::RunEventRecord>>
where
    R: OrchestrationRuntimeRepository,
{
    let mut events = Vec::new();
    let started = repository
        .append_run_event(&AppendRunEventInput {
            flow_run_id: flow_run.id,
            node_run_id: Some(node_run.id),
            event_type: "node_preview_started".to_string(),
            payload: json!({
                "target_node_id": preview.target_node_id,
                "input_payload": flow_run.input_payload,
            }),
        })
        .await?;
    events.push(started);
    events.extend(
        append_provider_stream_events(
            repository,
            flow_run.id,
            Some(node_run.id),
            &preview.provider_events,
        )
        .await?,
    );
    let completed = repository
        .append_run_event(&AppendRunEventInput {
            flow_run_id: flow_run.id,
            node_run_id: Some(node_run.id),
            event_type: if preview.is_failed() {
                "node_preview_failed".to_string()
            } else {
                "node_preview_completed".to_string()
            },
            payload: preview.as_payload(),
        })
        .await?;
    events.push(completed);

    Ok(events)
}

async fn persist_flow_debug_node_traces<R>(
    repository: &R,
    flow_run_id: Uuid,
    outcome: &orchestration_runtime::execution_state::FlowDebugExecutionOutcome,
    base_started_at: OffsetDateTime,
) -> Result<Option<domain::NodeRunRecord>>
where
    R: OrchestrationRuntimeRepository,
{
    let waiting_node_id = match &outcome.stop_reason {
        orchestration_runtime::execution_state::ExecutionStopReason::WaitingHuman(wait) => {
            Some((wait.node_id.as_str(), domain::NodeRunStatus::WaitingHuman))
        }
        orchestration_runtime::execution_state::ExecutionStopReason::WaitingCallback(wait) => {
            Some((
                wait.node_id.as_str(),
                domain::NodeRunStatus::WaitingCallback,
            ))
        }
        orchestration_runtime::execution_state::ExecutionStopReason::Failed(failure) => {
            Some((failure.node_id.as_str(), domain::NodeRunStatus::Failed))
        }
        orchestration_runtime::execution_state::ExecutionStopReason::Completed => None,
    };
    let mut waiting_node_run = None;

    for (index, trace) in outcome.node_traces.iter().enumerate() {
        let started_at = base_started_at + Duration::seconds(index as i64);
        let node_run = repository
            .create_node_run(&CreateNodeRunInput {
                flow_run_id,
                node_id: trace.node_id.clone(),
                node_type: trace.node_type.clone(),
                node_alias: trace.node_alias.clone(),
                status: domain::NodeRunStatus::Running,
                input_payload: trace.input_payload.clone(),
                started_at,
            })
            .await?;
        let (status, finished_at) = match waiting_node_id {
            Some((waiting_id, waiting_status)) if waiting_id == trace.node_id => {
                if waiting_status == domain::NodeRunStatus::Failed {
                    (waiting_status, Some(started_at))
                } else {
                    (waiting_status, None)
                }
            }
            _ => (domain::NodeRunStatus::Succeeded, Some(started_at)),
        };
        let node_run = repository
            .update_node_run(&UpdateNodeRunInput {
                node_run_id: node_run.id,
                status,
                output_payload: trace.output_payload.clone(),
                error_payload: trace.error_payload.clone(),
                metrics_payload: trace.metrics_payload.clone(),
                finished_at,
            })
            .await?;
        append_provider_stream_events(
            repository,
            flow_run_id,
            Some(node_run.id),
            &trace.provider_events,
        )
        .await?;

        if finished_at.is_none() && status != domain::NodeRunStatus::Failed {
            waiting_node_run = Some(node_run);
        }
    }

    Ok(waiting_node_run)
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

fn allow_custom_models(config_json: &Value) -> bool {
    config_json
        .get("validate_model")
        .and_then(Value::as_bool)
        .map(|value| !value)
        .unwrap_or(false)
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

fn checkpoint_snapshot_from_record(
    checkpoint: &domain::CheckpointRecord,
) -> Result<orchestration_runtime::execution_state::CheckpointSnapshot> {
    Ok(orchestration_runtime::execution_state::CheckpointSnapshot {
        next_node_index: checkpoint
            .locator_payload
            .get("next_node_index")
            .and_then(Value::as_u64)
            .ok_or_else(|| anyhow!("checkpoint is missing next_node_index"))?
            as usize,
        variable_pool: checkpoint
            .variable_snapshot
            .as_object()
            .cloned()
            .ok_or_else(|| anyhow!("checkpoint variable_snapshot must be an object"))?,
    })
}

fn checkpoint_node_id(checkpoint: &domain::CheckpointRecord) -> Result<String> {
    checkpoint
        .locator_payload
        .get("node_id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| anyhow!("checkpoint is missing node_id"))
}

fn final_flow_output_payload(
    outcome: &orchestration_runtime::execution_state::FlowDebugExecutionOutcome,
) -> Value {
    outcome
        .node_traces
        .last()
        .map(|trace| trace.output_payload.clone())
        .unwrap_or_else(|| json!({}))
}

fn next_node_started_at(detail: &domain::ApplicationRunDetail) -> OffsetDateTime {
    detail
        .node_runs
        .iter()
        .map(|record| record.started_at)
        .max()
        .map(|value| value + Duration::seconds(1))
        .unwrap_or_else(OffsetDateTime::now_utc)
}

#[cfg(test)]
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

#[cfg(test)]
use crate::{
    flow::InMemoryFlowRepository,
    ports::{
        ApplicationVisibility, CreateApplicationInput, CreateApplicationTagInput,
        UpdateApplicationInput,
    },
};

#[cfg(test)]
#[derive(Default)]
struct InMemoryOrchestrationRuntimeState {
    compiled_plans_by_draft_id: HashMap<Uuid, domain::CompiledPlanRecord>,
    flow_runs_by_id: HashMap<Uuid, domain::FlowRunRecord>,
    node_runs_by_id: HashMap<Uuid, domain::NodeRunRecord>,
    checkpoints_by_id: HashMap<Uuid, domain::CheckpointRecord>,
    callback_tasks_by_id: HashMap<Uuid, domain::CallbackTaskRecord>,
    events_by_flow_run_id: HashMap<Uuid, Vec<domain::RunEventRecord>>,
    installations_by_id: HashMap<Uuid, domain::PluginInstallationRecord>,
    assignments_by_workspace: HashMap<Uuid, Vec<domain::PluginAssignmentRecord>>,
    instances_by_id: HashMap<Uuid, domain::ModelProviderInstanceRecord>,
    caches_by_instance_id: HashMap<Uuid, domain::ModelProviderCatalogCacheRecord>,
    secret_json_by_instance_id: HashMap<Uuid, Value>,
}

#[cfg(test)]
#[derive(Clone)]
pub(crate) struct InMemoryOrchestrationRuntimeRepository {
    flow: InMemoryFlowRepository,
    inner: Arc<Mutex<InMemoryOrchestrationRuntimeState>>,
    default_provider_instance_id: Uuid,
}

#[cfg(test)]
impl InMemoryOrchestrationRuntimeRepository {
    fn with_permissions(permissions: Vec<&str>) -> Self {
        let flow = InMemoryFlowRepository::with_permissions(permissions);
        let installation_id = Uuid::now_v7();
        let provider_instance_id = Uuid::now_v7();
        let workspace_id = Uuid::nil();
        let install_path = write_test_provider_package();
        let now = OffsetDateTime::now_utc();
        let installation = domain::PluginInstallationRecord {
            id: installation_id,
            provider_code: "fixture_provider".to_string(),
            plugin_id: "fixture_provider@0.1.0".to_string(),
            plugin_version: "0.1.0".to_string(),
            contract_version: "1flowbase.provider/v1".to_string(),
            protocol: "openai_compatible".to_string(),
            display_name: "Fixture Provider".to_string(),
            source_kind: "test".to_string(),
            verification_status: domain::PluginVerificationStatus::Valid,
            enabled: true,
            install_path,
            checksum: None,
            signature_status: None,
            metadata_json: json!({}),
            created_by: Uuid::nil(),
            created_at: now,
            updated_at: now,
        };
        let assignment = domain::PluginAssignmentRecord {
            id: Uuid::now_v7(),
            installation_id,
            workspace_id,
            provider_code: "fixture_provider".to_string(),
            assigned_by: Uuid::nil(),
            created_at: now,
        };
        let instance = domain::ModelProviderInstanceRecord {
            id: provider_instance_id,
            workspace_id,
            installation_id,
            provider_code: "fixture_provider".to_string(),
            protocol: "openai_compatible".to_string(),
            display_name: "Fixture".to_string(),
            status: domain::ModelProviderInstanceStatus::Ready,
            config_json: json!({
                "base_url": "https://api.example.com",
                "validate_model": true,
            }),
            last_validated_at: Some(now),
            last_validation_status: Some(domain::ModelProviderValidationStatus::Succeeded),
            last_validation_message: Some("validated".to_string()),
            created_by: Uuid::nil(),
            updated_by: Uuid::nil(),
            created_at: now,
            updated_at: now,
        };
        let cache = domain::ModelProviderCatalogCacheRecord {
            provider_instance_id,
            model_discovery_mode: domain::ModelProviderDiscoveryMode::Hybrid,
            refresh_status: domain::ModelProviderCatalogRefreshStatus::Ready,
            source: domain::ModelProviderCatalogSource::Hybrid,
            models_json: json!([
                {
                    "model_id": "gpt-5.4-mini",
                    "display_name": "GPT-5.4 Mini",
                    "source": "dynamic",
                    "supports_streaming": true,
                    "supports_tool_call": true,
                    "supports_multimodal": false,
                    "context_window": 128000,
                    "max_output_tokens": 4096,
                    "provider_metadata": {}
                }
            ]),
            last_error_message: None,
            refreshed_at: Some(now),
            updated_at: now,
        };

        Self {
            flow,
            inner: Arc::new(Mutex::new(InMemoryOrchestrationRuntimeState {
                installations_by_id: HashMap::from([(installation_id, installation)]),
                assignments_by_workspace: HashMap::from([(workspace_id, vec![assignment])]),
                instances_by_id: HashMap::from([(provider_instance_id, instance)]),
                caches_by_instance_id: HashMap::from([(provider_instance_id, cache)]),
                secret_json_by_instance_id: HashMap::from([(
                    provider_instance_id,
                    json!({ "api_key": "test-secret" }),
                )]),
                ..InMemoryOrchestrationRuntimeState::default()
            })),
            default_provider_instance_id: provider_instance_id,
        }
    }

    async fn seed_application_for_actor(
        &self,
        actor_user_id: Uuid,
        name: &str,
    ) -> Result<domain::ApplicationRecord> {
        self.flow
            .seed_application_for_actor(actor_user_id, name)
            .await
    }

    fn default_provider_instance_id(&self) -> Uuid {
        self.default_provider_instance_id
    }
}

#[cfg(test)]
#[async_trait]
impl ApplicationRepository for InMemoryOrchestrationRuntimeRepository {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> Result<domain::ActorContext> {
        ApplicationRepository::load_actor_context_for_user(&self.flow, actor_user_id).await
    }

    async fn list_applications(
        &self,
        workspace_id: Uuid,
        actor_user_id: Uuid,
        visibility: ApplicationVisibility,
    ) -> Result<Vec<domain::ApplicationRecord>> {
        ApplicationRepository::list_applications(
            &self.flow,
            workspace_id,
            actor_user_id,
            visibility,
        )
        .await
    }

    async fn create_application(
        &self,
        input: &CreateApplicationInput,
    ) -> Result<domain::ApplicationRecord> {
        ApplicationRepository::create_application(&self.flow, input).await
    }

    async fn update_application(
        &self,
        input: &UpdateApplicationInput,
    ) -> Result<domain::ApplicationRecord> {
        ApplicationRepository::update_application(&self.flow, input).await
    }

    async fn get_application(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
    ) -> Result<Option<domain::ApplicationRecord>> {
        ApplicationRepository::get_application(&self.flow, workspace_id, application_id).await
    }

    async fn list_application_tags(
        &self,
        workspace_id: Uuid,
        actor_user_id: Uuid,
        visibility: ApplicationVisibility,
    ) -> Result<Vec<domain::ApplicationTagCatalogEntry>> {
        ApplicationRepository::list_application_tags(
            &self.flow,
            workspace_id,
            actor_user_id,
            visibility,
        )
        .await
    }

    async fn create_application_tag(
        &self,
        input: &CreateApplicationTagInput,
    ) -> Result<domain::ApplicationTagCatalogEntry> {
        ApplicationRepository::create_application_tag(&self.flow, input).await
    }

    async fn append_audit_log(&self, event: &domain::AuditLogRecord) -> Result<()> {
        ApplicationRepository::append_audit_log(&self.flow, event).await
    }
}

#[cfg(test)]
#[async_trait]
impl FlowRepository for InMemoryOrchestrationRuntimeRepository {
    async fn get_or_create_editor_state(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        FlowRepository::get_or_create_editor_state(
            &self.flow,
            workspace_id,
            application_id,
            actor_user_id,
        )
        .await
    }

    async fn save_draft(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
        document: serde_json::Value,
        change_kind: domain::FlowChangeKind,
        summary: &str,
    ) -> Result<domain::FlowEditorState> {
        FlowRepository::save_draft(
            &self.flow,
            workspace_id,
            application_id,
            actor_user_id,
            document,
            change_kind,
            summary,
        )
        .await
    }

    async fn restore_version(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
        version_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        FlowRepository::restore_version(
            &self.flow,
            workspace_id,
            application_id,
            actor_user_id,
            version_id,
        )
        .await
    }
}

#[cfg(test)]
#[async_trait]
impl PluginRepository for InMemoryOrchestrationRuntimeRepository {
    async fn upsert_installation(
        &self,
        _input: &crate::ports::UpsertPluginInstallationInput,
    ) -> Result<domain::PluginInstallationRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn get_installation(
        &self,
        installation_id: Uuid,
    ) -> Result<Option<domain::PluginInstallationRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner.installations_by_id.get(&installation_id).cloned())
    }

    async fn list_installations(&self) -> Result<Vec<domain::PluginInstallationRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner.installations_by_id.values().cloned().collect())
    }

    async fn update_installation_enabled(
        &self,
        _input: &crate::ports::UpdatePluginInstallationEnabledInput,
    ) -> Result<domain::PluginInstallationRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn create_assignment(
        &self,
        _input: &crate::ports::CreatePluginAssignmentInput,
    ) -> Result<domain::PluginAssignmentRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn list_assignments(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<domain::PluginAssignmentRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .assignments_by_workspace
            .get(&workspace_id)
            .cloned()
            .unwrap_or_default())
    }

    async fn create_task(
        &self,
        _input: &crate::ports::CreatePluginTaskInput,
    ) -> Result<domain::PluginTaskRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn update_task_status(
        &self,
        _input: &crate::ports::UpdatePluginTaskStatusInput,
    ) -> Result<domain::PluginTaskRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn get_task(&self, _task_id: Uuid) -> Result<Option<domain::PluginTaskRecord>> {
        Ok(None)
    }

    async fn list_tasks(&self) -> Result<Vec<domain::PluginTaskRecord>> {
        Ok(Vec::new())
    }
}

#[cfg(test)]
#[async_trait]
impl ModelProviderRepository for InMemoryOrchestrationRuntimeRepository {
    async fn create_instance(
        &self,
        _input: &crate::ports::CreateModelProviderInstanceInput,
    ) -> Result<domain::ModelProviderInstanceRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn update_instance(
        &self,
        _input: &crate::ports::UpdateModelProviderInstanceInput,
    ) -> Result<domain::ModelProviderInstanceRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn get_instance(
        &self,
        workspace_id: Uuid,
        instance_id: Uuid,
    ) -> Result<Option<domain::ModelProviderInstanceRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .instances_by_id
            .get(&instance_id)
            .filter(|record| record.workspace_id == workspace_id)
            .cloned())
    }

    async fn list_instances(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<domain::ModelProviderInstanceRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .instances_by_id
            .values()
            .filter(|record| record.workspace_id == workspace_id)
            .cloned()
            .collect())
    }

    async fn reassign_instances_to_installation(
        &self,
        _input: &crate::ports::ReassignModelProviderInstancesInput,
    ) -> Result<Vec<domain::ModelProviderInstanceRecord>> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn upsert_catalog_cache(
        &self,
        _input: &crate::ports::UpsertModelProviderCatalogCacheInput,
    ) -> Result<domain::ModelProviderCatalogCacheRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn get_catalog_cache(
        &self,
        provider_instance_id: Uuid,
    ) -> Result<Option<domain::ModelProviderCatalogCacheRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .caches_by_instance_id
            .get(&provider_instance_id)
            .cloned())
    }

    async fn upsert_secret(
        &self,
        _input: &crate::ports::UpsertModelProviderSecretInput,
    ) -> Result<domain::ModelProviderSecretRecord> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn get_secret_json(
        &self,
        provider_instance_id: Uuid,
        _master_key: &str,
    ) -> Result<Option<Value>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .secret_json_by_instance_id
            .get(&provider_instance_id)
            .cloned())
    }

    async fn get_secret_record(
        &self,
        provider_instance_id: Uuid,
    ) -> Result<Option<domain::ModelProviderSecretRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .secret_json_by_instance_id
            .get(&provider_instance_id)
            .map(|secret| domain::ModelProviderSecretRecord {
                provider_instance_id,
                encrypted_secret_json: secret.clone(),
                secret_version: 1,
                updated_at: OffsetDateTime::now_utc(),
            }))
    }

    async fn delete_instance(&self, _workspace_id: Uuid, _instance_id: Uuid) -> Result<()> {
        unimplemented!("not needed in orchestration runtime tests")
    }

    async fn count_instance_references(
        &self,
        _workspace_id: Uuid,
        _instance_id: Uuid,
    ) -> Result<u64> {
        Ok(0)
    }
}

#[cfg(test)]
#[derive(Clone, Default)]
pub(crate) struct InMemoryProviderRuntime;

#[cfg(test)]
#[async_trait]
impl ProviderRuntimePort for InMemoryProviderRuntime {
    async fn ensure_loaded(&self, _installation: &domain::PluginInstallationRecord) -> Result<()> {
        Ok(())
    }

    async fn validate_provider(
        &self,
        _installation: &domain::PluginInstallationRecord,
        _provider_config: Value,
    ) -> Result<Value> {
        Ok(json!({ "ok": true }))
    }

    async fn list_models(
        &self,
        _installation: &domain::PluginInstallationRecord,
        _provider_config: Value,
    ) -> Result<Vec<plugin_framework::provider_contract::ProviderModelDescriptor>> {
        Ok(vec![])
    }

    async fn invoke_stream(
        &self,
        _installation: &domain::PluginInstallationRecord,
        input: ProviderInvocationInput,
    ) -> Result<crate::ports::ProviderRuntimeInvocationOutput> {
        let prompt = input
            .messages
            .first()
            .map(|message| message.content.clone())
            .unwrap_or_default();
        Ok(crate::ports::ProviderRuntimeInvocationOutput {
            events: vec![
                ProviderStreamEvent::TextDelta {
                    delta: format!("echo:{}:{}", input.model, prompt),
                },
                ProviderStreamEvent::UsageSnapshot {
                    usage: plugin_framework::provider_contract::ProviderUsage {
                        input_tokens: Some(5),
                        output_tokens: Some(7),
                        total_tokens: Some(12),
                        ..plugin_framework::provider_contract::ProviderUsage::default()
                    },
                },
                ProviderStreamEvent::Finish {
                    reason: plugin_framework::provider_contract::ProviderFinishReason::Stop,
                },
            ],
            result: plugin_framework::provider_contract::ProviderInvocationResult {
                final_content: Some(format!("echo:{}:{}", input.model, prompt)),
                usage: plugin_framework::provider_contract::ProviderUsage {
                    input_tokens: Some(5),
                    output_tokens: Some(7),
                    total_tokens: Some(12),
                    ..plugin_framework::provider_contract::ProviderUsage::default()
                },
                finish_reason: Some(
                    plugin_framework::provider_contract::ProviderFinishReason::Stop,
                ),
                ..plugin_framework::provider_contract::ProviderInvocationResult::default()
            },
        })
    }
}

#[cfg(test)]
#[async_trait]
impl OrchestrationRuntimeRepository for InMemoryOrchestrationRuntimeRepository {
    async fn upsert_compiled_plan(
        &self,
        input: &UpsertCompiledPlanInput,
    ) -> Result<domain::CompiledPlanRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let now = OffsetDateTime::now_utc();
        let record = inner
            .compiled_plans_by_draft_id
            .entry(input.flow_draft_id)
            .and_modify(|record| {
                record.flow_id = input.flow_id;
                record.schema_version = input.schema_version.clone();
                record.document_updated_at = input.document_updated_at;
                record.plan = input.plan.clone();
                record.created_by = input.actor_user_id;
                record.updated_at = now;
            })
            .or_insert_with(|| domain::CompiledPlanRecord {
                id: Uuid::now_v7(),
                flow_id: input.flow_id,
                draft_id: input.flow_draft_id,
                schema_version: input.schema_version.clone(),
                document_updated_at: input.document_updated_at,
                plan: input.plan.clone(),
                created_by: input.actor_user_id,
                created_at: now,
                updated_at: now,
            })
            .clone();

        Ok(record)
    }

    async fn get_compiled_plan(
        &self,
        compiled_plan_id: Uuid,
    ) -> Result<Option<domain::CompiledPlanRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .compiled_plans_by_draft_id
            .values()
            .find(|record| record.id == compiled_plan_id)
            .cloned())
    }

    async fn create_flow_run(&self, input: &CreateFlowRunInput) -> Result<domain::FlowRunRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let record = domain::FlowRunRecord {
            id: Uuid::now_v7(),
            application_id: input.application_id,
            flow_id: input.flow_id,
            draft_id: input.flow_draft_id,
            compiled_plan_id: input.compiled_plan_id,
            run_mode: input.run_mode,
            target_node_id: input.target_node_id.clone(),
            status: input.status,
            input_payload: input.input_payload.clone(),
            output_payload: json!({}),
            error_payload: None,
            created_by: input.actor_user_id,
            started_at: input.started_at,
            finished_at: None,
            created_at: input.started_at,
        };
        inner.flow_runs_by_id.insert(record.id, record.clone());
        Ok(record)
    }

    async fn get_flow_run(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> Result<Option<domain::FlowRunRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .flow_runs_by_id
            .get(&flow_run_id)
            .filter(|record| record.application_id == application_id)
            .cloned())
    }

    async fn create_node_run(&self, input: &CreateNodeRunInput) -> Result<domain::NodeRunRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let record = domain::NodeRunRecord {
            id: Uuid::now_v7(),
            flow_run_id: input.flow_run_id,
            node_id: input.node_id.clone(),
            node_type: input.node_type.clone(),
            node_alias: input.node_alias.clone(),
            status: input.status,
            input_payload: input.input_payload.clone(),
            output_payload: json!({}),
            error_payload: None,
            metrics_payload: json!({}),
            started_at: input.started_at,
            finished_at: None,
        };
        inner.node_runs_by_id.insert(record.id, record.clone());
        Ok(record)
    }

    async fn update_node_run(&self, input: &UpdateNodeRunInput) -> Result<domain::NodeRunRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let Some(record) = inner.node_runs_by_id.get_mut(&input.node_run_id) else {
            return Err(ControlPlaneError::NotFound("node_run").into());
        };
        record.status = input.status;
        record.output_payload = input.output_payload.clone();
        record.error_payload = input.error_payload.clone();
        record.metrics_payload = input.metrics_payload.clone();
        record.finished_at = input.finished_at;
        Ok(record.clone())
    }

    async fn complete_node_run(
        &self,
        input: &CompleteNodeRunInput,
    ) -> Result<domain::NodeRunRecord> {
        self.update_node_run(&UpdateNodeRunInput {
            node_run_id: input.node_run_id,
            status: input.status,
            output_payload: input.output_payload.clone(),
            error_payload: input.error_payload.clone(),
            metrics_payload: input.metrics_payload.clone(),
            finished_at: Some(input.finished_at),
        })
        .await
    }

    async fn update_flow_run(&self, input: &UpdateFlowRunInput) -> Result<domain::FlowRunRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let Some(record) = inner.flow_runs_by_id.get_mut(&input.flow_run_id) else {
            return Err(ControlPlaneError::NotFound("flow_run").into());
        };
        record.status = input.status;
        record.output_payload = input.output_payload.clone();
        record.error_payload = input.error_payload.clone();
        record.finished_at = input.finished_at;
        Ok(record.clone())
    }

    async fn complete_flow_run(
        &self,
        input: &CompleteFlowRunInput,
    ) -> Result<domain::FlowRunRecord> {
        self.update_flow_run(&UpdateFlowRunInput {
            flow_run_id: input.flow_run_id,
            status: input.status,
            output_payload: input.output_payload.clone(),
            error_payload: input.error_payload.clone(),
            finished_at: Some(input.finished_at),
        })
        .await
    }

    async fn get_checkpoint(
        &self,
        flow_run_id: Uuid,
        checkpoint_id: Uuid,
    ) -> Result<Option<domain::CheckpointRecord>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        Ok(inner
            .checkpoints_by_id
            .get(&checkpoint_id)
            .filter(|record| record.flow_run_id == flow_run_id)
            .cloned())
    }

    async fn create_checkpoint(
        &self,
        input: &CreateCheckpointInput,
    ) -> Result<domain::CheckpointRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let record = domain::CheckpointRecord {
            id: Uuid::now_v7(),
            flow_run_id: input.flow_run_id,
            node_run_id: input.node_run_id,
            status: input.status.clone(),
            reason: input.reason.clone(),
            locator_payload: input.locator_payload.clone(),
            variable_snapshot: input.variable_snapshot.clone(),
            external_ref_payload: input.external_ref_payload.clone(),
            created_at: OffsetDateTime::now_utc(),
        };
        inner.checkpoints_by_id.insert(record.id, record.clone());
        Ok(record)
    }

    async fn create_callback_task(
        &self,
        input: &CreateCallbackTaskInput,
    ) -> Result<domain::CallbackTaskRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let record = domain::CallbackTaskRecord {
            id: Uuid::now_v7(),
            flow_run_id: input.flow_run_id,
            node_run_id: input.node_run_id,
            callback_kind: input.callback_kind.clone(),
            status: domain::CallbackTaskStatus::Pending,
            request_payload: input.request_payload.clone(),
            response_payload: None,
            external_ref_payload: input.external_ref_payload.clone(),
            created_at: OffsetDateTime::now_utc(),
            completed_at: None,
        };
        inner.callback_tasks_by_id.insert(record.id, record.clone());
        Ok(record)
    }

    async fn complete_callback_task(
        &self,
        input: &CompleteCallbackTaskInput,
    ) -> Result<domain::CallbackTaskRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let Some(record) = inner.callback_tasks_by_id.get_mut(&input.callback_task_id) else {
            return Err(ControlPlaneError::NotFound("callback_task").into());
        };
        record.status = domain::CallbackTaskStatus::Completed;
        record.response_payload = Some(input.response_payload.clone());
        record.completed_at = Some(input.completed_at);
        Ok(record.clone())
    }

    async fn append_run_event(
        &self,
        input: &AppendRunEventInput,
    ) -> Result<domain::RunEventRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let events = inner
            .events_by_flow_run_id
            .entry(input.flow_run_id)
            .or_default();
        let event = domain::RunEventRecord {
            id: Uuid::now_v7(),
            flow_run_id: input.flow_run_id,
            node_run_id: input.node_run_id,
            sequence: (events.len() + 1) as i64,
            event_type: input.event_type.clone(),
            payload: input.payload.clone(),
            created_at: OffsetDateTime::now_utc(),
        };
        events.push(event.clone());
        Ok(event)
    }

    async fn list_application_runs(
        &self,
        application_id: Uuid,
    ) -> Result<Vec<domain::ApplicationRunSummary>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let mut runs = inner
            .flow_runs_by_id
            .values()
            .filter(|record| record.application_id == application_id)
            .map(|record| domain::ApplicationRunSummary {
                id: record.id,
                run_mode: record.run_mode,
                status: record.status,
                target_node_id: record.target_node_id.clone(),
                started_at: record.started_at,
                finished_at: record.finished_at,
            })
            .collect::<Vec<_>>();
        runs.sort_by(|left, right| {
            right
                .started_at
                .cmp(&left.started_at)
                .then_with(|| right.id.cmp(&left.id))
        });
        Ok(runs)
    }

    async fn get_application_run_detail(
        &self,
        application_id: Uuid,
        flow_run_id: Uuid,
    ) -> Result<Option<domain::ApplicationRunDetail>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let Some(flow_run) = inner.flow_runs_by_id.get(&flow_run_id).cloned() else {
            return Ok(None);
        };
        if flow_run.application_id != application_id {
            return Ok(None);
        }

        let mut node_runs = inner
            .node_runs_by_id
            .values()
            .filter(|record| record.flow_run_id == flow_run.id)
            .cloned()
            .collect::<Vec<_>>();
        node_runs.sort_by(|left, right| {
            left.started_at
                .cmp(&right.started_at)
                .then_with(|| left.id.cmp(&right.id))
        });

        Ok(Some(domain::ApplicationRunDetail {
            flow_run,
            node_runs,
            checkpoints: {
                let mut checkpoints = inner
                    .checkpoints_by_id
                    .values()
                    .filter(|record| record.flow_run_id == flow_run_id)
                    .cloned()
                    .collect::<Vec<_>>();
                checkpoints.sort_by(|left, right| {
                    left.created_at
                        .cmp(&right.created_at)
                        .then_with(|| left.id.cmp(&right.id))
                });
                checkpoints
            },
            callback_tasks: {
                let mut callback_tasks = inner
                    .callback_tasks_by_id
                    .values()
                    .filter(|record| record.flow_run_id == flow_run_id)
                    .cloned()
                    .collect::<Vec<_>>();
                callback_tasks.sort_by(|left, right| {
                    left.created_at
                        .cmp(&right.created_at)
                        .then_with(|| left.id.cmp(&right.id))
                });
                callback_tasks
            },
            events: inner
                .events_by_flow_run_id
                .get(&flow_run_id)
                .cloned()
                .unwrap_or_default(),
        }))
    }

    async fn get_latest_node_run(
        &self,
        application_id: Uuid,
        node_id: &str,
    ) -> Result<Option<domain::NodeLastRun>> {
        let inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let mut candidates = inner
            .node_runs_by_id
            .values()
            .filter_map(|node_run| {
                inner
                    .flow_runs_by_id
                    .get(&node_run.flow_run_id)
                    .filter(|flow_run| {
                        flow_run.application_id == application_id && node_run.node_id == node_id
                    })
                    .map(|flow_run| (flow_run.clone(), node_run.clone()))
            })
            .collect::<Vec<_>>();
        candidates.sort_by(|left, right| {
            right
                .1
                .started_at
                .cmp(&left.1.started_at)
                .then_with(|| right.1.id.cmp(&left.1.id))
        });
        let Some((flow_run, node_run)) = candidates.into_iter().next() else {
            return Ok(None);
        };

        let events = inner
            .events_by_flow_run_id
            .get(&flow_run.id)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|event| event.node_run_id.is_none() || event.node_run_id == Some(node_run.id))
            .collect();

        Ok(Some(domain::NodeLastRun {
            flow_run,
            node_run,
            checkpoints: Vec::new(),
            events,
        }))
    }
}

#[cfg(test)]
fn write_test_provider_package() -> String {
    use std::fs;

    let root = std::env::temp_dir().join(format!("1flowbase-provider-fixture-{}", Uuid::now_v7()));
    fs::create_dir_all(root.join("provider")).expect("create fixture provider dir");
    fs::create_dir_all(root.join("models/llm")).expect("create fixture models dir");
    fs::create_dir_all(root.join("i18n")).expect("create fixture i18n dir");
    fs::write(
        root.join("manifest.yaml"),
        r#"plugin_code: fixture_provider
display_name: Fixture Provider
version: 0.1.0
contract_version: 1flowbase.provider/v1
supported_model_types:
  - llm
runner:
  language: nodejs
  entrypoint: provider/fixture_provider.js
"#,
    )
    .expect("write manifest");
    fs::write(
        root.join("provider/fixture_provider.yaml"),
        r#"provider_code: fixture_provider
display_name: Fixture Provider
protocol: openai_compatible
help_url: https://example.com/help
default_base_url: https://api.example.com
model_discovery: hybrid
supports_model_fetch_without_credentials: true
config_schema:
  - key: base_url
    type: string
    required: true
  - key: api_key
    type: secret
    required: true
  - key: validate_model
    type: boolean
    required: false
"#,
    )
    .expect("write provider yaml");
    fs::write(
        root.join("provider/fixture_provider.js"),
        "'use strict'; module.exports = { async validateProviderCredentials() { return { ok: true }; }, async listModels() { return []; }, async invoke() { return { events: [], result: {} }; } };",
    )
    .expect("write runtime");
    fs::write(
        root.join("models/llm/_position.yaml"),
        "items:\n  - fixture_chat\n",
    )
    .expect("write position");
    fs::write(
        root.join("models/llm/fixture_chat.yaml"),
        r#"model: gpt-5.4-mini
label: GPT-5.4 Mini
family: llm
capabilities:
  - stream
  - tool_call
context_window: 128000
max_output_tokens: 4096
provider_metadata:
  tier: default
"#,
    )
    .expect("write model");
    fs::write(
        root.join("i18n/en_US.json"),
        r#"{
  "plugin": {
    "label": "Fixture Provider",
    "description": "Fixture provider"
  },
  "provider": {
    "label": "Fixture Provider"
  }
}"#,
    )
    .expect("write i18n");

    root.to_string_lossy().to_string()
}

#[cfg(test)]
pub struct SeededPreviewApplication {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
}

#[cfg(test)]
pub struct SeededWaitingHumanRun {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub flow_run_id: Uuid,
    pub checkpoint_id: Uuid,
}

#[cfg(test)]
pub struct SeededWaitingCallbackRun {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub callback_task_id: Uuid,
}

#[cfg(test)]
impl OrchestrationRuntimeService<InMemoryOrchestrationRuntimeRepository, InMemoryProviderRuntime> {
    pub fn for_tests() -> Self {
        Self::new(
            InMemoryOrchestrationRuntimeRepository::with_permissions(vec![
                "application.view.all",
                "application.create.all",
            ]),
            InMemoryProviderRuntime,
            "test-master-key",
        )
    }

    pub async fn seed_application_with_flow(&self, name: &str) -> SeededPreviewApplication {
        let actor_user_id = Uuid::now_v7();
        let application = self
            .repository
            .seed_application_for_actor(actor_user_id, name)
            .await
            .expect("seed application should succeed");
        let _ = FlowRepository::get_or_create_editor_state(
            &self.repository,
            Uuid::nil(),
            application.id,
            actor_user_id,
        )
        .await
        .expect("seed flow should succeed");
        let editor_state = FlowRepository::get_or_create_editor_state(
            &self.repository,
            Uuid::nil(),
            application.id,
            actor_user_id,
        )
        .await
        .expect("seed flow should succeed");
        let _ = FlowRepository::save_draft(
            &self.repository,
            Uuid::nil(),
            application.id,
            actor_user_id,
            build_ready_provider_flow_document(
                editor_state.flow.id,
                self.repository.default_provider_instance_id(),
            ),
            domain::FlowChangeKind::Logical,
            "seed runtime preview flow",
        )
        .await
        .expect("seed preview flow should succeed");

        SeededPreviewApplication {
            actor_user_id,
            application_id: application.id,
        }
    }

    pub async fn seed_application_with_human_input_flow(
        &self,
        name: &str,
    ) -> SeededPreviewApplication {
        self.seed_application_with_document(name, build_human_input_flow_document)
            .await
    }

    pub async fn seed_waiting_human_run(&self, name: &str) -> SeededWaitingHumanRun {
        let seeded = self.seed_application_with_human_input_flow(name).await;
        let detail = self
            .start_flow_debug_run(StartFlowDebugRunCommand {
                actor_user_id: seeded.actor_user_id,
                application_id: seeded.application_id,
                input_payload: json!({
                    "node-start": { "query": "请总结退款政策" }
                }),
            })
            .await
            .expect("seed waiting human run should succeed");

        SeededWaitingHumanRun {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
            checkpoint_id: detail.checkpoints.last().expect("checkpoint").id,
        }
    }

    pub async fn seed_waiting_callback_run(&self, name: &str) -> SeededWaitingCallbackRun {
        let seeded = self
            .seed_application_with_document(name, build_callback_flow_document)
            .await;
        let detail = self
            .start_flow_debug_run(StartFlowDebugRunCommand {
                actor_user_id: seeded.actor_user_id,
                application_id: seeded.application_id,
                input_payload: json!({
                    "node-start": { "query": "order_123" }
                }),
            })
            .await
            .expect("seed waiting callback run should succeed");

        SeededWaitingCallbackRun {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            callback_task_id: detail.callback_tasks.first().expect("callback task").id,
        }
    }

    async fn seed_application_with_document(
        &self,
        name: &str,
        builder: fn(Uuid, Uuid) -> Value,
    ) -> SeededPreviewApplication {
        let seeded = self.seed_application_with_flow(name).await;
        let editor_state = FlowRepository::get_or_create_editor_state(
            &self.repository,
            Uuid::nil(),
            seeded.application_id,
            seeded.actor_user_id,
        )
        .await
        .expect("seed editor state should succeed");
        let _ = FlowRepository::save_draft(
            &self.repository,
            Uuid::nil(),
            seeded.application_id,
            seeded.actor_user_id,
            builder(
                editor_state.flow.id,
                self.repository.default_provider_instance_id(),
            ),
            domain::FlowChangeKind::Logical,
            "seed runtime resume flow",
        )
        .await
        .expect("seed custom draft should succeed");

        seeded
    }
}

#[cfg(test)]
fn build_ready_provider_flow_document(flow_id: Uuid, provider_instance_id: Uuid) -> Value {
    json!({
        "schemaVersion": "1flowbase.flow/v1",
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
                    "config": {
                        "provider_instance_id": provider_instance_id.to_string(),
                        "model": "gpt-5.4-mini",
                        "temperature": 0.2
                    },
                    "bindings": {
                        "user_prompt": { "kind": "selector", "value": ["node-start", "query"] }
                    },
                    "outputs": [{ "key": "text", "title": "模型输出", "valueType": "string" }]
                },
                {
                    "id": "node-answer",
                    "type": "answer",
                    "alias": "Answer",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 480, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {
                        "answer_template": { "kind": "selector", "value": ["node-llm", "text"] }
                    },
                    "outputs": [{ "key": "answer", "title": "对话输出", "valueType": "string" }]
                }
            ],
            "edges": [
                { "id": "edge-start-llm", "source": "node-start", "target": "node-llm", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] },
                { "id": "edge-llm-answer", "source": "node-llm", "target": "node-answer", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] }
            ]
        },
        "editor": { "viewport": { "x": 0, "y": 0, "zoom": 1 }, "annotations": [], "activeContainerPath": [] }
    })
}

#[cfg(test)]
fn build_human_input_flow_document(flow_id: Uuid, provider_instance_id: Uuid) -> Value {
    json!({
        "schemaVersion": "1flowbase.flow/v1",
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
                    "config": {
                        "provider_instance_id": provider_instance_id.to_string(),
                        "model": "gpt-5.4-mini",
                        "temperature": 0.2
                    },
                    "bindings": {
                        "user_prompt": { "kind": "selector", "value": ["node-start", "query"] }
                    },
                    "outputs": [{ "key": "text", "title": "模型输出", "valueType": "string" }]
                },
                {
                    "id": "node-human",
                    "type": "human_input",
                    "alias": "Human Input",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 480, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {
                        "prompt": { "kind": "templated_text", "value": "请审核：{{ node-llm.text }}" }
                    },
                    "outputs": [{ "key": "input", "title": "人工输入", "valueType": "string" }]
                },
                {
                    "id": "node-answer",
                    "type": "answer",
                    "alias": "Answer",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 720, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {
                        "answer_template": { "kind": "selector", "value": ["node-human", "input"] }
                    },
                    "outputs": [{ "key": "answer", "title": "对话输出", "valueType": "string" }]
                }
            ],
            "edges": [
                { "id": "edge-start-llm", "source": "node-start", "target": "node-llm", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] },
                { "id": "edge-llm-human", "source": "node-llm", "target": "node-human", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] },
                { "id": "edge-human-answer", "source": "node-human", "target": "node-answer", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] }
            ]
        },
        "editor": { "viewport": { "x": 0, "y": 0, "zoom": 1 }, "annotations": [], "activeContainerPath": [] }
    })
}

#[cfg(test)]
fn build_callback_flow_document(flow_id: Uuid, _provider_instance_id: Uuid) -> Value {
    json!({
        "schemaVersion": "1flowbase.flow/v1",
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
                    "id": "node-tool",
                    "type": "tool",
                    "alias": "Tool",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 240, "y": 0 },
                    "configVersion": 1,
                    "config": { "tool_name": "lookup_order" },
                    "bindings": {
                        "order_id": { "kind": "selector", "value": ["node-start", "query"] }
                    },
                    "outputs": [{ "key": "result", "title": "工具输出", "valueType": "json" }]
                },
                {
                    "id": "node-answer",
                    "type": "answer",
                    "alias": "Answer",
                    "description": "",
                    "containerId": null,
                    "position": { "x": 480, "y": 0 },
                    "configVersion": 1,
                    "config": {},
                    "bindings": {
                        "answer_template": { "kind": "selector", "value": ["node-tool", "result"] }
                    },
                    "outputs": [{ "key": "answer", "title": "对话输出", "valueType": "json" }]
                }
            ],
            "edges": [
                { "id": "edge-start-tool", "source": "node-start", "target": "node-tool", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] },
                { "id": "edge-tool-answer", "source": "node-tool", "target": "node-answer", "sourceHandle": null, "targetHandle": null, "containerId": null, "points": [] }
            ]
        },
        "editor": { "viewport": { "x": 0, "y": 0, "zoom": 1 }, "annotations": [], "activeContainerPath": [] }
    })
}
