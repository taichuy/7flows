use anyhow::Result;
use domain::{ActorContext, SessionRecord};
use uuid::Uuid;

use crate::{
    audit::audit_log,
    errors::ControlPlaneError,
    ports::{AuthRepository, SessionStore, TeamRepository},
};

#[derive(Debug)]
pub struct SwitchWorkspaceCommand {
    pub actor_user_id: Uuid,
    pub session_id: String,
    pub target_workspace_id: Uuid,
}

#[derive(Debug)]
pub struct SwitchWorkspaceResult {
    pub actor: ActorContext,
    pub session: SessionRecord,
}

pub struct WorkspaceSessionService<R, T, S> {
    auth_repository: R,
    team_repository: T,
    session_store: S,
}

impl<R, T, S> WorkspaceSessionService<R, T, S>
where
    R: AuthRepository,
    T: TeamRepository,
    S: SessionStore,
{
    pub fn new(auth_repository: R, team_repository: T, session_store: S) -> Self {
        Self {
            auth_repository,
            team_repository,
            session_store,
        }
    }

    pub async fn switch_workspace(
        &self,
        command: SwitchWorkspaceCommand,
    ) -> Result<SwitchWorkspaceResult> {
        let current_session = self
            .session_store
            .get(&command.session_id)
            .await?
            .ok_or(ControlPlaneError::NotAuthenticated)?;
        if current_session.user_id != command.actor_user_id {
            return Err(ControlPlaneError::NotAuthenticated.into());
        }

        let user = self
            .auth_repository
            .find_user_by_id(command.actor_user_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("user"))?;

        if command.target_workspace_id == current_session.current_workspace_id {
            let actor = self
                .auth_repository
                .load_actor_context(
                    command.actor_user_id,
                    current_session.tenant_id,
                    current_session.current_workspace_id,
                    user.default_display_role.as_deref(),
                )
                .await?;

            return Ok(SwitchWorkspaceResult {
                actor,
                session: current_session,
            });
        }

        let target_workspace = self
            .team_repository
            .get_accessible_workspace(command.actor_user_id, command.target_workspace_id)
            .await?
            .ok_or(ControlPlaneError::PermissionDenied(
                "workspace_access_denied",
            ))?;

        let actor = self
            .auth_repository
            .load_actor_context(
                command.actor_user_id,
                target_workspace.tenant_id,
                target_workspace.id,
                user.default_display_role.as_deref(),
            )
            .await?;

        let next_session = SessionRecord {
            session_id: current_session.session_id.clone(),
            user_id: current_session.user_id,
            tenant_id: target_workspace.tenant_id,
            current_workspace_id: target_workspace.id,
            session_version: current_session.session_version,
            csrf_token: Uuid::now_v7().to_string(),
            expires_at_unix: current_session.expires_at_unix,
        };

        self.session_store.put(next_session.clone()).await?;
        self.auth_repository
            .append_audit_log(&audit_log(
                Some(command.actor_user_id),
                "session",
                None,
                "session.switch_workspace",
                serde_json::json!({
                    "from_workspace_id": current_session.current_workspace_id,
                    "to_workspace_id": next_session.current_workspace_id,
                }),
            ))
            .await?;

        Ok(SwitchWorkspaceResult {
            actor,
            session: next_session,
        })
    }
}
