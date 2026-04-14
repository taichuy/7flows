use access_control::ensure_permission;
use anyhow::Result;
use domain::{ActorContext, TeamRecord};
use uuid::Uuid;

use crate::{errors::ControlPlaneError, ports::TeamRepository};

pub struct UpdateTeamCommand {
    pub actor: ActorContext,
    pub team_id: Uuid,
    pub name: String,
    pub logo_url: Option<String>,
    pub introduction: String,
}

pub struct TeamService<R> {
    repository: R,
}

impl<R> TeamService<R>
where
    R: TeamRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn get_team(&self, team_id: Uuid) -> Result<TeamRecord> {
        self.repository
            .get_team(team_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("team").into())
    }

    pub async fn list_accessible_workspaces(&self, user_id: Uuid) -> Result<Vec<TeamRecord>> {
        self.repository.list_accessible_workspaces(user_id).await
    }

    pub async fn get_accessible_workspace(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
    ) -> Result<TeamRecord> {
        self.repository
            .get_accessible_workspace(user_id, workspace_id)
            .await?
            .ok_or(ControlPlaneError::PermissionDenied("workspace_access_denied").into())
    }

    pub async fn update_team(&self, command: UpdateTeamCommand) -> Result<TeamRecord> {
        ensure_permission(&command.actor, "team.configure.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        self.repository
            .update_team(
                command.actor.user_id,
                command.team_id,
                &command.name,
                command.logo_url.as_deref(),
                &command.introduction,
            )
            .await
    }
}
