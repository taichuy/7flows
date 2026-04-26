use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use anyhow::Result;
use async_trait::async_trait;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    application::{ApplicationService, InMemoryApplicationRepository},
    errors::ControlPlaneError,
    ports::{
        ApplicationRepository, ApplicationVisibility, CreateApplicationInput,
        CreateApplicationTagInput, DeleteApplicationInput, FlowRepository, UpdateApplicationInput,
    },
};

pub struct SaveFlowDraftCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub document: serde_json::Value,
    pub change_kind: domain::FlowChangeKind,
    pub summary: String,
}

pub struct FlowService<R> {
    repository: R,
}

impl<R> FlowService<R>
where
    R: ApplicationRepository + FlowRepository + Clone,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn get_or_create_editor_state(
        &self,
        actor_user_id: Uuid,
        application_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        ApplicationService::new(self.repository.clone())
            .get_application(actor_user_id, application_id)
            .await?;
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;

        self.repository
            .get_or_create_editor_state(actor.current_workspace_id, application_id, actor_user_id)
            .await
    }

    pub async fn save_draft(
        &self,
        command: SaveFlowDraftCommand,
    ) -> Result<domain::FlowEditorState> {
        ApplicationService::new(self.repository.clone())
            .get_application(command.actor_user_id, command.application_id)
            .await?;
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;

        self.repository
            .save_draft(
                actor.current_workspace_id,
                command.application_id,
                command.actor_user_id,
                command.document,
                command.change_kind,
                &command.summary,
            )
            .await
    }

    pub async fn restore_version(
        &self,
        actor_user_id: Uuid,
        application_id: Uuid,
        version_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        ApplicationService::new(self.repository.clone())
            .get_application(actor_user_id, application_id)
            .await?;
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;

        self.repository
            .restore_version(
                actor.current_workspace_id,
                application_id,
                actor_user_id,
                version_id,
            )
            .await
    }
}

#[derive(Default)]
struct InMemoryFlowRepositoryInner {
    editor_state_by_application_id: HashMap<Uuid, domain::FlowEditorState>,
}

#[derive(Clone)]
pub struct InMemoryFlowRepository {
    applications: InMemoryApplicationRepository,
    inner: Arc<Mutex<InMemoryFlowRepositoryInner>>,
}

impl InMemoryFlowRepository {
    pub fn with_permissions(permissions: Vec<&str>) -> Self {
        Self {
            applications: InMemoryApplicationRepository::with_permissions(permissions),
            inner: Arc::new(Mutex::new(InMemoryFlowRepositoryInner::default())),
        }
    }

    pub async fn seed_application_for_actor(
        &self,
        actor_user_id: Uuid,
        name: &str,
    ) -> Result<domain::ApplicationRecord> {
        ApplicationRepository::create_application(
            &self.applications,
            &CreateApplicationInput {
                actor_user_id,
                workspace_id: Uuid::nil(),
                application_type: domain::ApplicationType::AgentFlow,
                name: name.to_string(),
                description: String::new(),
                icon: None,
                icon_type: None,
                icon_background: None,
            },
        )
        .await
    }
}

#[async_trait]
impl ApplicationRepository for InMemoryFlowRepository {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> Result<domain::ActorContext> {
        ApplicationRepository::load_actor_context_for_user(&self.applications, actor_user_id).await
    }

    async fn list_applications(
        &self,
        workspace_id: Uuid,
        actor_user_id: Uuid,
        visibility: crate::ports::ApplicationVisibility,
    ) -> Result<Vec<domain::ApplicationRecord>> {
        ApplicationRepository::list_applications(
            &self.applications,
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
        ApplicationRepository::create_application(&self.applications, input).await
    }

    async fn delete_application(&self, input: &DeleteApplicationInput) -> Result<()> {
        ApplicationRepository::delete_application(&self.applications, input).await
    }

    async fn get_application(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
    ) -> Result<Option<domain::ApplicationRecord>> {
        ApplicationRepository::get_application(&self.applications, workspace_id, application_id)
            .await
    }

    async fn update_application(
        &self,
        input: &UpdateApplicationInput,
    ) -> Result<domain::ApplicationRecord> {
        ApplicationRepository::update_application(&self.applications, input).await
    }

    async fn list_application_tags(
        &self,
        workspace_id: Uuid,
        actor_user_id: Uuid,
        visibility: ApplicationVisibility,
    ) -> Result<Vec<domain::ApplicationTagCatalogEntry>> {
        ApplicationRepository::list_application_tags(
            &self.applications,
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
        ApplicationRepository::create_application_tag(&self.applications, input).await
    }

    async fn append_audit_log(&self, event: &domain::AuditLogRecord) -> Result<()> {
        ApplicationRepository::append_audit_log(&self.applications, event).await
    }
}

#[async_trait]
impl FlowRepository for InMemoryFlowRepository {
    async fn get_or_create_editor_state(
        &self,
        _workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        let mut inner = self
            .inner
            .lock()
            .expect("in-memory flow repo mutex poisoned");

        Ok(inner
            .editor_state_by_application_id
            .entry(application_id)
            .or_insert_with(|| bootstrap_editor_state(application_id, actor_user_id))
            .clone())
    }

    async fn save_draft(
        &self,
        _workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
        document: serde_json::Value,
        change_kind: domain::FlowChangeKind,
        summary: &str,
    ) -> Result<domain::FlowEditorState> {
        let mut inner = self
            .inner
            .lock()
            .expect("in-memory flow repo mutex poisoned");
        let state = inner
            .editor_state_by_application_id
            .entry(application_id)
            .or_insert_with(|| bootstrap_editor_state(application_id, actor_user_id));

        state.flow.updated_at = OffsetDateTime::now_utc();
        state.draft.schema_version = document_schema_version(&document).to_string();
        state.draft.document = document.clone();
        state.draft.updated_at = OffsetDateTime::now_utc();

        if matches!(change_kind, domain::FlowChangeKind::Logical) {
            let sequence = state
                .versions
                .last()
                .map(|version| version.sequence + 1)
                .unwrap_or(1);
            state.versions.push(domain::FlowVersionRecord {
                id: Uuid::now_v7(),
                flow_id: state.flow.id,
                sequence,
                trigger: domain::FlowVersionTrigger::Autosave,
                change_kind: domain::FlowChangeKind::Logical,
                summary: summary.to_string(),
                document,
                created_at: OffsetDateTime::now_utc(),
            });
            trim_versions(&mut state.versions);
        }

        Ok(state.clone())
    }

    async fn restore_version(
        &self,
        _workspace_id: Uuid,
        application_id: Uuid,
        actor_user_id: Uuid,
        version_id: Uuid,
    ) -> Result<domain::FlowEditorState> {
        let mut inner = self
            .inner
            .lock()
            .expect("in-memory flow repo mutex poisoned");
        let state = inner
            .editor_state_by_application_id
            .entry(application_id)
            .or_insert_with(|| bootstrap_editor_state(application_id, actor_user_id));
        let restored = state
            .versions
            .iter()
            .find(|version| version.id == version_id)
            .cloned()
            .ok_or(ControlPlaneError::NotFound("flow_version"))?;

        state.flow.updated_at = OffsetDateTime::now_utc();
        state.draft.schema_version = document_schema_version(&restored.document).to_string();
        state.draft.document = restored.document.clone();
        state.draft.updated_at = OffsetDateTime::now_utc();
        state.versions.push(domain::FlowVersionRecord {
            id: Uuid::now_v7(),
            flow_id: state.flow.id,
            sequence: state
                .versions
                .last()
                .map(|version| version.sequence + 1)
                .unwrap_or(1),
            trigger: domain::FlowVersionTrigger::Restore,
            change_kind: domain::FlowChangeKind::Logical,
            summary: format!("恢复版本 {}", restored.sequence),
            document: restored.document,
            created_at: OffsetDateTime::now_utc(),
        });
        trim_versions(&mut state.versions);

        Ok(state.clone())
    }
}

fn bootstrap_editor_state(application_id: Uuid, actor_user_id: Uuid) -> domain::FlowEditorState {
    let flow_id = Uuid::now_v7();
    let document = domain::default_flow_document(flow_id);

    domain::FlowEditorState {
        flow: domain::FlowRecord {
            id: flow_id,
            application_id,
            created_by: actor_user_id,
            updated_at: OffsetDateTime::now_utc(),
        },
        draft: domain::FlowDraftRecord {
            id: Uuid::now_v7(),
            flow_id,
            schema_version: domain::FLOW_SCHEMA_VERSION.to_string(),
            document: document.clone(),
            updated_at: OffsetDateTime::now_utc(),
        },
        versions: vec![domain::FlowVersionRecord {
            id: Uuid::now_v7(),
            flow_id,
            sequence: 1,
            trigger: domain::FlowVersionTrigger::Autosave,
            change_kind: domain::FlowChangeKind::Logical,
            summary: "初始化默认草稿".to_string(),
            document,
            created_at: OffsetDateTime::now_utc(),
        }],
        autosave_interval_seconds: domain::FLOW_AUTOSAVE_INTERVAL_SECONDS,
    }
}

fn document_schema_version(document: &serde_json::Value) -> &str {
    document
        .get("schemaVersion")
        .and_then(serde_json::Value::as_str)
        .unwrap_or(domain::FLOW_SCHEMA_VERSION)
}

fn trim_versions(versions: &mut Vec<domain::FlowVersionRecord>) {
    if versions.len() > domain::FLOW_HISTORY_LIMIT {
        let overflow = versions.len() - domain::FLOW_HISTORY_LIMIT;
        versions.drain(..overflow);
    }
}

impl FlowService<InMemoryFlowRepository> {
    pub fn for_tests() -> Self {
        Self::new(InMemoryFlowRepository::with_permissions(vec![
            "application.view.all",
            "application.create.all",
        ]))
    }

    pub fn for_tests_with_permissions(permissions: Vec<&str>) -> Self {
        Self::new(InMemoryFlowRepository::with_permissions(permissions))
    }

    pub async fn seed_application_for_actor(
        &self,
        actor_user_id: Uuid,
        name: &str,
    ) -> Result<domain::ApplicationRecord> {
        self.repository
            .seed_application_for_actor(actor_user_id, name)
            .await
    }
}
