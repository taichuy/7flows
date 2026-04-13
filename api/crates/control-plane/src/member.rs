use access_control::ensure_permission;
use anyhow::Result;
use uuid::Uuid;

use crate::{
    audit::audit_log,
    errors::ControlPlaneError,
    ports::{CreateMemberInput, MemberRepository},
};

pub struct CreateMemberCommand {
    pub actor_user_id: Uuid,
    pub account: String,
    pub email: String,
    pub phone: Option<String>,
    pub password_hash: String,
    pub name: String,
    pub nickname: String,
    pub introduction: String,
    pub email_login_enabled: bool,
    pub phone_login_enabled: bool,
}

pub struct DisableMemberCommand {
    pub actor_user_id: Uuid,
    pub target_user_id: Uuid,
}

pub struct ResetMemberPasswordCommand {
    pub actor_user_id: Uuid,
    pub target_user_id: Uuid,
    pub password_hash: String,
}

pub struct ReplaceMemberRolesCommand {
    pub actor_user_id: Uuid,
    pub target_user_id: Uuid,
    pub role_codes: Vec<String>,
}

pub struct MemberService<R> {
    repository: R,
}

impl<R> MemberService<R>
where
    R: MemberRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn list_members(&self, actor_user_id: Uuid) -> Result<Vec<domain::UserRecord>> {
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;
        ensure_permission(&actor, "user.view.all").map_err(ControlPlaneError::PermissionDenied)?;
        self.repository
            .list_members(actor.current_workspace_id)
            .await
    }

    pub async fn create_member(&self, command: CreateMemberCommand) -> Result<domain::UserRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "user.manage.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        let user = self
            .repository
            .create_member_with_default_role(&CreateMemberInput {
                actor_user_id: command.actor_user_id,
                workspace_id: actor.current_workspace_id,
                account: command.account,
                email: command.email,
                phone: command.phone,
                password_hash: command.password_hash,
                name: command.name,
                nickname: command.nickname,
                introduction: command.introduction,
                email_login_enabled: command.email_login_enabled,
                phone_login_enabled: command.phone_login_enabled,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(command.actor_user_id),
                "user",
                Some(user.id),
                "member.created",
                serde_json::json!({ "account": user.account }),
            ))
            .await?;

        Ok(user)
    }

    pub async fn disable_member(&self, command: DisableMemberCommand) -> Result<()> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "user.manage.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        self.repository
            .disable_member(command.actor_user_id, command.target_user_id)
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(command.actor_user_id),
                "user",
                Some(command.target_user_id),
                "member.disabled",
                serde_json::json!({}),
            ))
            .await?;
        Ok(())
    }

    pub async fn reset_member_password(&self, command: ResetMemberPasswordCommand) -> Result<()> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "user.manage.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        self.repository
            .reset_member_password(
                command.actor_user_id,
                command.target_user_id,
                &command.password_hash,
            )
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(command.actor_user_id),
                "user",
                Some(command.target_user_id),
                "member.password_reset",
                serde_json::json!({}),
            ))
            .await?;
        Ok(())
    }

    pub async fn replace_member_roles(&self, command: ReplaceMemberRolesCommand) -> Result<()> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "role_permission.manage.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        self.repository
            .replace_member_roles(
                command.actor_user_id,
                actor.current_workspace_id,
                command.target_user_id,
                &command.role_codes,
            )
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(command.actor_user_id),
                "user",
                Some(command.target_user_id),
                "member.roles_replaced",
                serde_json::json!({ "role_codes": command.role_codes }),
            ))
            .await?;
        Ok(())
    }
}
