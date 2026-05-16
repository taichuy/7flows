use access_control::ensure_permission;
use anyhow::Result;
use uuid::Uuid;

use crate::{
    application::{ensure_application_edit_permission, resolve_application_visibility},
    errors::ControlPlaneError,
    ports::{
        ApplicationJsDependencySelectionRepository, ApplicationRepository, ApplicationVisibility,
        AuthRepository, JsDependencyRepository, ReplaceApplicationJsDependencySelectionInput,
    },
};

pub struct ListWorkspaceJsDependenciesQuery {
    pub actor_user_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct JsDependencyCatalogView {
    pub entries: Vec<domain::JsDependencyRegistryEntry>,
}

pub struct JsDependencyService<R> {
    repository: R,
}

pub struct ReplaceApplicationJsDependencySelectionCommand {
    pub actor_user_id: Uuid,
    pub application_id: Uuid,
    pub installation_id: Uuid,
    pub alias: String,
    pub target: String,
}

pub struct ApplicationJsDependencyService<R> {
    repository: R,
}

impl<R> JsDependencyService<R>
where
    R: AuthRepository + JsDependencyRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn list_workspace_js_dependencies(
        &self,
        query: ListWorkspaceJsDependenciesQuery,
    ) -> Result<JsDependencyCatalogView> {
        let actor = self
            .repository
            .load_actor_context_for_user(query.actor_user_id)
            .await?;
        ensure_permission(&actor, "plugin_config.view.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        Ok(JsDependencyCatalogView {
            entries: self
                .repository
                .list_workspace_js_dependencies(actor.current_workspace_id)
                .await?,
        })
    }
}

impl<R> ApplicationJsDependencyService<R>
where
    R: ApplicationRepository + JsDependencyRepository + ApplicationJsDependencySelectionRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn list_application_js_dependency_selections(
        &self,
        actor_user_id: Uuid,
        application_id: Uuid,
    ) -> Result<Vec<domain::ApplicationJsDependencySelection>> {
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

        self.repository
            .list_application_js_dependency_selections(actor.current_workspace_id, application.id)
            .await
    }

    pub async fn replace_application_js_dependency_selection(
        &self,
        command: ReplaceApplicationJsDependencySelectionCommand,
    ) -> Result<domain::ApplicationJsDependencySelection> {
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

        let catalog_entry = self
            .repository
            .list_workspace_js_dependencies(actor.current_workspace_id)
            .await?
            .into_iter()
            .find(|entry| {
                entry.installation_id == command.installation_id
                    && entry.alias == command.alias
                    && entry.target == command.target
            })
            .ok_or(ControlPlaneError::NotFound("js_dependency"))?;

        self.repository
            .replace_application_js_dependency_selection(
                &ReplaceApplicationJsDependencySelectionInput::from_catalog_entry(
                    command.actor_user_id,
                    actor.current_workspace_id,
                    application.id,
                    catalog_entry,
                ),
            )
            .await
    }
}
