use anyhow::{anyhow, Result};
use serde_json::json;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    flow::FlowService,
    ports::{
        AppendRunEventInput, ApplicationRepository, CompleteFlowRunInput, CompleteNodeRunInput,
        CreateFlowRunInput, CreateNodeRunInput, FlowRepository, OrchestrationRuntimeRepository,
        UpsertCompiledPlanInput,
    },
};

pub struct StartNodeDebugPreviewCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub node_id: String,
    pub input_payload: serde_json::Value,
}

pub struct OrchestrationRuntimeService<R> {
    repository: R,
}

impl<R> OrchestrationRuntimeService<R>
where
    R: ApplicationRepository + FlowRepository + OrchestrationRuntimeRepository + Clone,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn start_node_debug_preview(
        &self,
        command: StartNodeDebugPreviewCommand,
    ) -> Result<domain::NodeDebugPreviewResult> {
        let editor_state = FlowService::new(self.repository.clone())
            .get_or_create_editor_state(command.actor_user_id, command.application_id)
            .await?;

        let compiled_plan = orchestration_runtime::compiler::FlowCompiler::compile(
            editor_state.flow.id,
            &editor_state.draft.id.to_string(),
            &editor_state.draft.document,
        )?;
        let preview = orchestration_runtime::preview_executor::run_node_preview(
            &compiled_plan,
            &command.node_id,
            &command.input_payload,
        )?;
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
        let events = persist_preview_events(&self.repository, &flow_run, &node_run, &preview).await?;
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
        status: domain::NodeRunStatus::Succeeded,
        output_payload: preview.as_payload(),
        error_payload: None,
        metrics_payload: json!({
            "output_contract_count": preview.output_contract.len(),
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
        status: domain::FlowRunStatus::Succeeded,
        output_payload: preview.as_payload(),
        error_payload: None,
        finished_at,
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
    let completed = repository
        .append_run_event(&AppendRunEventInput {
            flow_run_id: flow_run.id,
            node_run_id: Some(node_run.id),
            event_type: "node_preview_completed".to_string(),
            payload: preview.as_payload(),
        })
        .await?;

    Ok(vec![started, completed])
}

#[cfg(test)]
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

#[cfg(test)]
use async_trait::async_trait;

#[cfg(test)]
use crate::{
    errors::ControlPlaneError,
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
    events_by_flow_run_id: HashMap<Uuid, Vec<domain::RunEventRecord>>,
}

#[cfg(test)]
#[derive(Clone)]
pub(crate) struct InMemoryOrchestrationRuntimeRepository {
    flow: InMemoryFlowRepository,
    inner: Arc<Mutex<InMemoryOrchestrationRuntimeState>>,
}

#[cfg(test)]
impl InMemoryOrchestrationRuntimeRepository {
    fn with_permissions(permissions: Vec<&str>) -> Self {
        Self {
            flow: InMemoryFlowRepository::with_permissions(permissions),
            inner: Arc::new(Mutex::new(InMemoryOrchestrationRuntimeState::default())),
        }
    }

    async fn seed_application_for_actor(
        &self,
        actor_user_id: Uuid,
        name: &str,
    ) -> Result<domain::ApplicationRecord> {
        self.flow.seed_application_for_actor(actor_user_id, name).await
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
        ApplicationRepository::list_applications(&self.flow, workspace_id, actor_user_id, visibility)
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
        ApplicationRepository::list_application_tags(&self.flow, workspace_id, actor_user_id, visibility)
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
        FlowRepository::get_or_create_editor_state(&self.flow, workspace_id, application_id, actor_user_id)
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

    async fn complete_node_run(
        &self,
        input: &CompleteNodeRunInput,
    ) -> Result<domain::NodeRunRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let Some(record) = inner.node_runs_by_id.get_mut(&input.node_run_id) else {
            return Err(ControlPlaneError::NotFound("node_run").into());
        };
        record.status = input.status;
        record.output_payload = input.output_payload.clone();
        record.error_payload = input.error_payload.clone();
        record.metrics_payload = input.metrics_payload.clone();
        record.finished_at = Some(input.finished_at);
        Ok(record.clone())
    }

    async fn complete_flow_run(
        &self,
        input: &CompleteFlowRunInput,
    ) -> Result<domain::FlowRunRecord> {
        let mut inner = self.inner.lock().expect("runtime repo mutex poisoned");
        let Some(record) = inner.flow_runs_by_id.get_mut(&input.flow_run_id) else {
            return Err(ControlPlaneError::NotFound("flow_run").into());
        };
        record.status = input.status;
        record.output_payload = input.output_payload.clone();
        record.error_payload = input.error_payload.clone();
        record.finished_at = Some(input.finished_at);
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
            checkpoints: Vec::new(),
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
pub struct SeededPreviewApplication {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
}

#[cfg(test)]
impl OrchestrationRuntimeService<InMemoryOrchestrationRuntimeRepository> {
    pub fn for_tests() -> Self {
        Self::new(InMemoryOrchestrationRuntimeRepository::with_permissions(vec![
            "application.view.all",
            "application.create.all",
        ]))
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

        SeededPreviewApplication {
            actor_user_id,
            application_id: application.id,
        }
    }
}
