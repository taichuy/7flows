use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};

use access_control::ensure_permission;
use anyhow::Result;
use async_trait::async_trait;
use uuid::Uuid;

use crate::{
    audit::audit_log,
    errors::ControlPlaneError,
    ports::{
        ApplicationRepository, ApplicationVisibility, CreateApplicationInput,
        CreateApplicationTagInput, DeleteApplicationInput, UpdateApplicationInput,
    },
};

pub struct CreateApplicationCommand {
    pub actor_user_id: Uuid,
    pub application_type: domain::ApplicationType,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub icon_type: Option<String>,
    pub icon_background: Option<String>,
}

pub struct UpdateApplicationCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub name: String,
    pub description: String,
    pub tag_ids: Vec<Uuid>,
}

pub struct DeleteApplicationCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
}

pub struct CreateApplicationTagCommand {
    pub actor_user_id: Uuid,
    pub name: String,
}

pub struct ApplicationService<R> {
    repository: R,
}

impl<R> ApplicationService<R>
where
    R: ApplicationRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn list_applications(
        &self,
        actor_user_id: Uuid,
    ) -> Result<Vec<domain::ApplicationRecord>> {
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;
        let visibility = resolve_application_visibility(&actor)?;

        self.repository
            .list_applications(actor.current_workspace_id, actor_user_id, visibility)
            .await
    }

    pub async fn create_application(
        &self,
        command: CreateApplicationCommand,
    ) -> Result<domain::ApplicationRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "application.create.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let created = self
            .repository
            .create_application(&CreateApplicationInput {
                actor_user_id: command.actor_user_id,
                workspace_id: actor.current_workspace_id,
                application_type: command.application_type,
                name: command.name,
                description: command.description,
                icon: command.icon,
                icon_type: command.icon_type,
                icon_background: command.icon_background,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "application",
                Some(created.id),
                "application.created",
                serde_json::json!({
                    "application_type": created.application_type.as_str(),
                    "name": created.name,
                }),
            ))
            .await?;

        Ok(created)
    }

    pub async fn update_application(
        &self,
        command: UpdateApplicationCommand,
    ) -> Result<domain::ApplicationRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        let application = self
            .repository
            .get_application(actor.current_workspace_id, command.application_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("application"))?;

        ensure_application_edit_permission(&actor, &application)?;

        let updated = self
            .repository
            .update_application(&UpdateApplicationInput {
                actor_user_id: command.actor_user_id,
                workspace_id: actor.current_workspace_id,
                application_id: command.application_id,
                name: normalize_required_text(&command.name, "name")?,
                description: command.description.trim().to_string(),
                tag_ids: dedupe_tag_ids(command.tag_ids),
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "application",
                Some(updated.id),
                "application.updated",
                serde_json::json!({
                    "name": updated.name,
                    "tag_count": updated.tags.len(),
                }),
            ))
            .await?;

        Ok(updated)
    }

    pub async fn delete_application(&self, command: DeleteApplicationCommand) -> Result<()> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        let application = self
            .repository
            .get_application(actor.current_workspace_id, command.application_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("application"))?;

        ensure_application_delete_permission(&actor, &application)?;

        self.repository
            .delete_application(&DeleteApplicationInput {
                actor_user_id: command.actor_user_id,
                workspace_id: actor.current_workspace_id,
                application_id: command.application_id,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "application",
                Some(application.id),
                "application.deleted",
                serde_json::json!({
                    "application_type": application.application_type.as_str(),
                    "name": application.name,
                }),
            ))
            .await?;

        Ok(())
    }

    pub async fn list_application_tags(
        &self,
        actor_user_id: Uuid,
    ) -> Result<Vec<domain::ApplicationTagCatalogEntry>> {
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;
        let visibility = resolve_application_visibility(&actor)?;

        self.repository
            .list_application_tags(actor.current_workspace_id, actor_user_id, visibility)
            .await
    }

    pub async fn create_application_tag(
        &self,
        command: CreateApplicationTagCommand,
    ) -> Result<domain::ApplicationTagCatalogEntry> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;

        if !can_manage_application_metadata(&actor) {
            return Err(ControlPlaneError::PermissionDenied("permission_denied").into());
        }

        let tag = self
            .repository
            .create_application_tag(&CreateApplicationTagInput {
                actor_user_id: command.actor_user_id,
                workspace_id: actor.current_workspace_id,
                name: normalize_required_text(&command.name, "name")?,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "application_tag",
                Some(tag.id),
                "application.tag_created",
                serde_json::json!({
                    "name": tag.name,
                }),
            ))
            .await?;

        Ok(tag)
    }

    pub async fn get_application(
        &self,
        actor_user_id: Uuid,
        application_id: Uuid,
    ) -> Result<domain::ApplicationRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;
        let visibility = resolve_application_visibility(&actor)?;
        let application = self
            .repository
            .get_application(actor.current_workspace_id, application_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("application"))?;

        if matches!(visibility, ApplicationVisibility::Own)
            && application.created_by != actor_user_id
        {
            return Err(ControlPlaneError::PermissionDenied("permission_denied").into());
        }

        Ok(application)
    }
}

fn resolve_application_visibility(
    actor: &domain::ActorContext,
) -> Result<ApplicationVisibility, ControlPlaneError> {
    if actor.is_root || actor.has_permission("application.view.all") {
        return Ok(ApplicationVisibility::All);
    }

    if actor.has_permission("application.view.own") {
        return Ok(ApplicationVisibility::Own);
    }

    Err(ControlPlaneError::PermissionDenied("permission_denied"))
}

fn ensure_application_edit_permission(
    actor: &domain::ActorContext,
    application: &domain::ApplicationRecord,
) -> Result<(), ControlPlaneError> {
    if actor.is_root || actor.has_permission("application.edit.all") {
        return Ok(());
    }

    if actor.has_permission("application.edit.own") && application.created_by == actor.user_id {
        return Ok(());
    }

    Err(ControlPlaneError::PermissionDenied("permission_denied"))
}

fn ensure_application_delete_permission(
    actor: &domain::ActorContext,
    application: &domain::ApplicationRecord,
) -> Result<(), ControlPlaneError> {
    if actor.is_root || actor.has_permission("application.delete.all") {
        return Ok(());
    }

    if actor.has_permission("application.delete.own") && application.created_by == actor.user_id {
        return Ok(());
    }

    Err(ControlPlaneError::PermissionDenied("permission_denied"))
}

fn can_manage_application_metadata(actor: &domain::ActorContext) -> bool {
    actor.is_root
        || actor.has_permission("application.edit.all")
        || actor.has_permission("application.edit.own")
        || actor.has_permission("application.create.all")
}

fn normalize_required_text(value: &str, field: &'static str) -> Result<String, ControlPlaneError> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Err(ControlPlaneError::InvalidInput(field));
    }

    Ok(normalized.to_string())
}

fn dedupe_tag_ids(tag_ids: Vec<Uuid>) -> Vec<Uuid> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for tag_id in tag_ids {
        if seen.insert(tag_id) {
            deduped.push(tag_id);
        }
    }

    deduped
}

#[derive(Default)]
struct InMemoryApplicationRepositoryInner {
    applications: HashMap<Uuid, domain::ApplicationRecord>,
    tags: HashMap<Uuid, domain::ApplicationTagCatalogEntry>,
    permissions: Vec<String>,
    workspace_id: Uuid,
    tenant_id: Uuid,
    audit_events: Vec<String>,
}

#[derive(Clone)]
pub struct InMemoryApplicationRepository {
    inner: Arc<Mutex<InMemoryApplicationRepositoryInner>>,
}

impl InMemoryApplicationRepository {
    pub fn with_permissions(permissions: Vec<&str>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(InMemoryApplicationRepositoryInner {
                applications: HashMap::new(),
                tags: HashMap::new(),
                permissions: permissions.into_iter().map(str::to_string).collect(),
                workspace_id: Uuid::nil(),
                tenant_id: Uuid::nil(),
                audit_events: Vec::new(),
            })),
        }
    }

    fn insert_application(&self, actor_user_id: Uuid, name: &str) -> domain::ApplicationRecord {
        let mut inner = self
            .inner
            .lock()
            .expect("in-memory app repo mutex poisoned");
        let application = build_application_record(
            Uuid::now_v7(),
            CreateApplicationInput {
                actor_user_id,
                workspace_id: inner.workspace_id,
                application_type: domain::ApplicationType::AgentFlow,
                name: name.to_string(),
                description: String::new(),
                icon: None,
                icon_type: None,
                icon_background: None,
            },
        );
        inner
            .applications
            .insert(application.id, application.clone());
        application
    }
}

#[async_trait]
impl ApplicationRepository for InMemoryApplicationRepository {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> Result<domain::ActorContext> {
        let inner = self
            .inner
            .lock()
            .expect("in-memory app repo mutex poisoned");

        Ok(domain::ActorContext::scoped_in_scope(
            actor_user_id,
            inner.tenant_id,
            inner.workspace_id,
            "manager",
            inner.permissions.iter().cloned(),
        ))
    }

    async fn list_applications(
        &self,
        workspace_id: Uuid,
        actor_user_id: Uuid,
        visibility: ApplicationVisibility,
    ) -> Result<Vec<domain::ApplicationRecord>> {
        let mut applications = self
            .inner
            .lock()
            .expect("in-memory app repo mutex poisoned")
            .applications
            .values()
            .filter(|application| application.workspace_id == workspace_id)
            .filter(|application| {
                matches!(visibility, ApplicationVisibility::All)
                    || application.created_by == actor_user_id
            })
            .cloned()
            .collect::<Vec<_>>();
        applications.sort_by(|left, right| {
            right
                .updated_at
                .cmp(&left.updated_at)
                .then(right.id.cmp(&left.id))
        });

        Ok(applications)
    }

    async fn create_application(
        &self,
        input: &CreateApplicationInput,
    ) -> Result<domain::ApplicationRecord> {
        let application = build_application_record(Uuid::now_v7(), input.clone());
        self.inner
            .lock()
            .expect("in-memory app repo mutex poisoned")
            .applications
            .insert(application.id, application.clone());

        Ok(application)
    }

    async fn update_application(
        &self,
        input: &UpdateApplicationInput,
    ) -> Result<domain::ApplicationRecord> {
        let mut inner = self
            .inner
            .lock()
            .expect("in-memory app repo mutex poisoned");
        let tags = input
            .tag_ids
            .iter()
            .map(|tag_id| inner.tags.get(tag_id).cloned())
            .collect::<Option<Vec<_>>>()
            .ok_or(ControlPlaneError::InvalidInput("tag_ids"))?
            .into_iter()
            .map(|tag| domain::ApplicationTag {
                id: tag.id,
                name: tag.name,
            })
            .collect::<Vec<_>>();
        let application = inner
            .applications
            .get_mut(&input.application_id)
            .ok_or(ControlPlaneError::NotFound("application"))?;
        application.name = input.name.clone();
        application.description = input.description.clone();
        application.updated_at = time::OffsetDateTime::now_utc();
        application.tags = tags;

        Ok(application.clone())
    }

    async fn delete_application(&self, input: &DeleteApplicationInput) -> Result<()> {
        let deleted = self
            .inner
            .lock()
            .expect("in-memory app repo mutex poisoned")
            .applications
            .remove(&input.application_id);

        if deleted.is_none() {
            return Err(ControlPlaneError::NotFound("application").into());
        }

        Ok(())
    }

    async fn get_application(
        &self,
        workspace_id: Uuid,
        application_id: Uuid,
    ) -> Result<Option<domain::ApplicationRecord>> {
        let application = self
            .inner
            .lock()
            .expect("in-memory app repo mutex poisoned")
            .applications
            .get(&application_id)
            .cloned()
            .filter(|application| application.workspace_id == workspace_id);

        Ok(application)
    }

    async fn list_application_tags(
        &self,
        workspace_id: Uuid,
        actor_user_id: Uuid,
        visibility: ApplicationVisibility,
    ) -> Result<Vec<domain::ApplicationTagCatalogEntry>> {
        let inner = self
            .inner
            .lock()
            .expect("in-memory app repo mutex poisoned");
        let mut tags = inner.tags.values().cloned().collect::<Vec<_>>();
        for tag in &mut tags {
            tag.application_count = inner
                .applications
                .values()
                .filter(|application| application.workspace_id == workspace_id)
                .filter(|application| {
                    matches!(visibility, ApplicationVisibility::All)
                        || application.created_by == actor_user_id
                })
                .filter(|application| application.tags.iter().any(|item| item.id == tag.id))
                .count() as i64;
        }
        tags.sort_by(|left, right| left.name.cmp(&right.name).then(left.id.cmp(&right.id)));

        Ok(tags)
    }

    async fn create_application_tag(
        &self,
        input: &CreateApplicationTagInput,
    ) -> Result<domain::ApplicationTagCatalogEntry> {
        let mut inner = self
            .inner
            .lock()
            .expect("in-memory app repo mutex poisoned");
        if let Some(existing) = inner
            .tags
            .values()
            .find(|tag| tag.name.eq_ignore_ascii_case(&input.name))
            .cloned()
        {
            return Ok(existing);
        }

        let tag = domain::ApplicationTagCatalogEntry {
            id: Uuid::now_v7(),
            name: input.name.clone(),
            application_count: 0,
        };
        inner.tags.insert(tag.id, tag.clone());

        Ok(tag)
    }

    async fn append_audit_log(&self, event: &domain::AuditLogRecord) -> Result<()> {
        self.inner
            .lock()
            .expect("in-memory app repo mutex poisoned")
            .audit_events
            .push(event.event_code.clone());
        Ok(())
    }
}

fn build_application_record(id: Uuid, input: CreateApplicationInput) -> domain::ApplicationRecord {
    domain::ApplicationRecord {
        id,
        workspace_id: input.workspace_id,
        application_type: input.application_type,
        name: input.name,
        description: input.description,
        icon: input.icon,
        icon_type: input.icon_type,
        icon_background: input.icon_background,
        created_by: input.actor_user_id,
        updated_at: time::OffsetDateTime::now_utc(),
        tags: Vec::new(),
        sections: planned_sections(input.application_type),
    }
}

fn planned_sections(application_type: domain::ApplicationType) -> domain::ApplicationSections {
    domain::ApplicationSections {
        orchestration: domain::ApplicationOrchestrationSection {
            status: "planned".to_string(),
            subject_kind: application_type.as_str().to_string(),
            subject_status: "unconfigured".to_string(),
            current_subject_id: None,
            current_draft_id: None,
        },
        api: domain::ApplicationApiSection {
            status: "planned".to_string(),
            credential_kind: "application_api_key".to_string(),
            invoke_routing_mode: "api_key_bound_application".to_string(),
            invoke_path_template: None,
            api_capability_status: "planned".to_string(),
            credentials_status: "planned".to_string(),
        },
        logs: domain::ApplicationLogsSection {
            status: "planned".to_string(),
            runs_capability_status: "planned".to_string(),
            run_object_kind: "application_run".to_string(),
            log_retention_status: "planned".to_string(),
        },
        monitoring: domain::ApplicationMonitoringSection {
            status: "planned".to_string(),
            metrics_capability_status: "planned".to_string(),
            metrics_object_kind: "application_metrics".to_string(),
            tracing_config_status: "planned".to_string(),
        },
    }
}

impl ApplicationService<InMemoryApplicationRepository> {
    pub fn for_tests() -> Self {
        Self::new(InMemoryApplicationRepository::with_permissions(vec![
            "application.view.all",
            "application.create.all",
            "application.edit.all",
        ]))
    }

    pub fn for_tests_with_permissions(permissions: Vec<&str>) -> Self {
        Self::new(InMemoryApplicationRepository::with_permissions(permissions))
    }

    pub fn seed_foreign_application(&self, name: &str) -> domain::ApplicationRecord {
        self.repository.insert_application(Uuid::now_v7(), name)
    }

    pub fn audit_events(&self) -> Vec<String> {
        self.repository
            .inner
            .lock()
            .expect("in-memory app repo mutex poisoned")
            .audit_events
            .clone()
    }
}
