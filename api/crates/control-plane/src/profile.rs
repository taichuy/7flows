use anyhow::Result;
use domain::{ActorContext, UserRecord};
use uuid::Uuid;

use crate::ports::AuthRepository;

pub struct MeProfile {
    pub user: UserRecord,
    pub actor: ActorContext,
}

pub struct ProfileService<R> {
    repository: R,
}

impl<R> ProfileService<R>
where
    R: AuthRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn get_me(
        &self,
        user_id: Uuid,
        tenant_id: Uuid,
        workspace_id: Uuid,
    ) -> Result<MeProfile> {
        let user = self
            .repository
            .find_user_by_id(user_id)
            .await?
            .ok_or(crate::errors::ControlPlaneError::NotFound("user"))?;
        let actor = self
            .repository
            .load_actor_context(
                user_id,
                tenant_id,
                workspace_id,
                user.default_display_role.as_deref(),
            )
            .await?;

        Ok(MeProfile { user, actor })
    }
}
