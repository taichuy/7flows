use anyhow::{anyhow, Result};
use async_trait::async_trait;
use plugin_framework::{
    provider_contract::ProviderInvocationInput, provider_package::ProviderPackage,
    ProviderConfigField,
};
use serde_json::{json, Value};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    capability_plugin_runtime::{CapabilityPluginRuntimePort, ExecuteCapabilityNodeInput},
    errors::ControlPlaneError,
    flow::FlowService,
    plugin_lifecycle::reconcile_installation_snapshot,
    ports::{
        ApplicationRepository, CompleteCallbackTaskInput, CreateFlowRunInput, FlowRepository,
        ModelProviderRepository, NodeContributionRepository, OrchestrationRuntimeRepository,
        PluginRepository, ProviderRuntimePort,
    },
    state_transition::{ensure_flow_run_transition, ensure_node_run_transition},
};

mod compile_context;
mod inputs;
mod persistence;

use self::{
    compile_context::{build_compile_context, ensure_compiled_plan_runnable},
    inputs::{
        build_compiled_plan_input, build_complete_flow_run_input, build_complete_node_run_input,
        build_flow_run_input, build_node_run_input,
    },
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
        + NodeContributionRepository
        + PluginRepository
        + Clone,
    H: ProviderRuntimePort + CapabilityPluginRuntimePort + Clone,
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
        build_compile_context(&self.repository, workspace_id).await
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
        let instance = self.resolve_llm_instance(runtime).await?;
        let installation =
            reconcile_installation_snapshot(&self.repository, instance.installation_id).await?;
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

        let package = load_provider_package(&installation.installed_path)?;
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

impl<R, H> RuntimeProviderInvoker<R, H>
where
    R: ModelProviderRepository + PluginRepository + Clone + Send + Sync,
    H: ProviderRuntimePort + Clone + Send + Sync,
{
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

#[cfg(test)]
#[path = "_tests/orchestration_runtime/support.rs"]
mod test_support;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{errors::ControlPlaneError, ports::ModelProviderRepository};

    #[tokio::test]
    async fn orchestration_runtime_resolve_llm_instance_does_not_fallback_when_selected_instance_is_missing(
    ) {
        let repository =
            test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(vec![]);
        let (primary_instance_id, _) = repository.seed_primary_and_backup_provider_instances();
        let invoker = RuntimeProviderInvoker {
            repository,
            runtime: test_support::InMemoryProviderRuntime,
            workspace_id: Uuid::nil(),
            provider_secret_master_key: "test-master-key".to_string(),
        };

        let error = invoker
            .resolve_llm_instance(&orchestration_runtime::compiled_plan::CompiledLlmRuntime {
                provider_instance_id: Uuid::now_v7().to_string(),
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                model: "gpt-5.4-mini".to_string(),
            })
            .await
            .expect_err("missing selected instance should fail");

        assert!(matches!(
            error.downcast_ref::<ControlPlaneError>(),
            Some(ControlPlaneError::InvalidInput("source_instance_id"))
        ));
        assert_ne!(primary_instance_id, Uuid::nil());
    }

    #[tokio::test]
    async fn orchestration_runtime_resolve_llm_instance_does_not_fallback_when_selected_instance_is_not_ready(
    ) {
        let repository =
            test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(vec![]);
        let (_, backup_instance_id) = repository.seed_primary_and_backup_provider_instances();
        repository.set_instance_status(
            backup_instance_id,
            domain::ModelProviderInstanceStatus::Disabled,
        );
        let invoker = RuntimeProviderInvoker {
            repository,
            runtime: test_support::InMemoryProviderRuntime,
            workspace_id: Uuid::nil(),
            provider_secret_master_key: "test-master-key".to_string(),
        };

        let error = invoker
            .resolve_llm_instance(&orchestration_runtime::compiled_plan::CompiledLlmRuntime {
                provider_instance_id: backup_instance_id.to_string(),
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                model: "gpt-5.4-mini".to_string(),
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
        let (_, backup_instance_id) = repository.seed_primary_and_backup_provider_instances();
        repository.set_instance_enabled_models(backup_instance_id, vec!["gpt-5.4-mini"]);
        let invoker = RuntimeProviderInvoker {
            repository: repository.clone(),
            runtime: test_support::InMemoryProviderRuntime,
            workspace_id: Uuid::nil(),
            provider_secret_master_key: "test-master-key".to_string(),
        };

        let resolved = invoker
            .resolve_llm_instance(&orchestration_runtime::compiled_plan::CompiledLlmRuntime {
                provider_instance_id: backup_instance_id.to_string(),
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                model: "gpt-5.4-mini".to_string(),
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
            runtime: test_support::InMemoryProviderRuntime,
            workspace_id: Uuid::nil(),
            provider_secret_master_key: "test-master-key".to_string(),
        };

        let error = invoker
            .resolve_llm_instance(&orchestration_runtime::compiled_plan::CompiledLlmRuntime {
                provider_instance_id: selected_instance_id.to_string(),
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                model: "gpt-5.4-mini".to_string(),
            })
            .await
            .expect_err("model outside enabled_model_ids should fail");

        assert!(matches!(
            error.downcast_ref::<ControlPlaneError>(),
            Some(ControlPlaneError::InvalidInput("model"))
        ));
    }
}
