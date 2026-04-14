use access_control::ensure_permission;
use anyhow::Result;
use uuid::Uuid;

use crate::{
    audit::audit_log,
    errors::ControlPlaneError,
    ports::{CreateWorkspaceRoleInput, RoleRepository, UpdateWorkspaceRoleInput},
};

pub struct CreateRoleCommand {
    pub actor_user_id: Uuid,
    pub code: String,
    pub name: String,
    pub introduction: String,
    pub auto_grant_new_permissions: bool,
    pub is_default_member_role: bool,
}

pub struct UpdateRoleCommand {
    pub actor_user_id: Uuid,
    pub role_code: String,
    pub name: String,
    pub introduction: String,
    pub auto_grant_new_permissions: Option<bool>,
    pub is_default_member_role: Option<bool>,
}

pub struct DeleteRoleCommand {
    pub actor_user_id: Uuid,
    pub role_code: String,
}

pub struct ReplaceRolePermissionsCommand {
    pub actor_user_id: Uuid,
    pub role_code: String,
    pub permission_codes: Vec<String>,
}

pub struct RoleService<R> {
    repository: R,
}

impl<R> RoleService<R>
where
    R: RoleRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn list_roles(&self, actor_user_id: Uuid) -> Result<Vec<domain::RoleTemplate>> {
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;
        ensure_permission(&actor, "role_permission.view.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        self.repository.list_roles(actor.current_workspace_id).await
    }

    pub async fn get_role_permissions(
        &self,
        actor_user_id: Uuid,
        role_code: &str,
    ) -> Result<Vec<String>> {
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;
        ensure_permission(&actor, "role_permission.view.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        self.repository
            .list_role_permissions(actor.current_workspace_id, role_code)
            .await
    }

    pub async fn create_role(&self, command: CreateRoleCommand) -> Result<()> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "role_permission.manage.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        self.repository
            .create_team_role(&CreateWorkspaceRoleInput {
                actor_user_id: command.actor_user_id,
                workspace_id: actor.current_workspace_id,
                code: command.code.clone(),
                name: command.name.clone(),
                introduction: command.introduction.clone(),
                auto_grant_new_permissions: command.auto_grant_new_permissions,
                is_default_member_role: command.is_default_member_role,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "role",
                None,
                "role.created",
                serde_json::json!({ "code": command.code }),
            ))
            .await?;
        Ok(())
    }

    pub async fn update_role(&self, command: UpdateRoleCommand) -> Result<()> {
        if command.role_code == "root" {
            return Err(ControlPlaneError::PermissionDenied("root_role_immutable").into());
        }
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "role_permission.manage.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        self.repository
            .update_team_role(&UpdateWorkspaceRoleInput {
                actor_user_id: command.actor_user_id,
                workspace_id: actor.current_workspace_id,
                role_code: command.role_code.clone(),
                name: command.name.clone(),
                introduction: command.introduction.clone(),
                auto_grant_new_permissions: command.auto_grant_new_permissions,
                is_default_member_role: command.is_default_member_role,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "role",
                None,
                "role.updated",
                serde_json::json!({ "code": command.role_code }),
            ))
            .await?;
        Ok(())
    }

    pub async fn delete_role(&self, command: DeleteRoleCommand) -> Result<()> {
        if command.role_code == "root" {
            return Err(ControlPlaneError::PermissionDenied("root_role_immutable").into());
        }
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "role_permission.manage.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        self.repository
            .delete_team_role(
                command.actor_user_id,
                actor.current_workspace_id,
                &command.role_code,
            )
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "role",
                None,
                "role.deleted",
                serde_json::json!({ "code": command.role_code }),
            ))
            .await?;
        Ok(())
    }

    pub async fn replace_permissions(&self, command: ReplaceRolePermissionsCommand) -> Result<()> {
        if command.role_code == "root" {
            return Err(ControlPlaneError::PermissionDenied("root_role_immutable").into());
        }
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "role_permission.manage.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        self.repository
            .replace_role_permissions(
                command.actor_user_id,
                actor.current_workspace_id,
                &command.role_code,
                &command.permission_codes,
            )
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "role",
                None,
                "role.permissions_replaced",
                serde_json::json!({
                    "code": command.role_code,
                    "permission_codes": command.permission_codes,
                }),
            ))
            .await?;
        Ok(())
    }
}
