use access_control::ensure_permission;
use anyhow::Result;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    ports::{AuthRepository, NodeContributionRepository},
};

pub struct ListNodeContributionsQuery {
    pub actor_user_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct NodeContributionListView {
    pub entries: Vec<domain::NodeContributionRegistryEntry>,
}

pub struct NodeContributionService<R> {
    repository: R,
}

impl<R> NodeContributionService<R>
where
    R: AuthRepository + NodeContributionRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn list_node_contributions(
        &self,
        query: ListNodeContributionsQuery,
    ) -> Result<NodeContributionListView> {
        let actor = self
            .repository
            .load_actor_context_for_user(query.actor_user_id)
            .await?;
        ensure_permission(&actor, "plugin_config.view.all")
            .map_err(ControlPlaneError::PermissionDenied)?;

        Ok(NodeContributionListView {
            entries: self
                .repository
                .list_node_contributions(actor.current_workspace_id)
                .await?,
        })
    }
}
