use anyhow::Result;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    ports::{ModelProviderRepository, PluginRepository},
};

pub(crate) async fn ensure_provider_exists<R>(
    repository: &R,
    workspace_id: Uuid,
    provider_code: &str,
) -> Result<()>
where
    R: PluginRepository + ModelProviderRepository,
{
    let assigned = repository
        .list_assignments(workspace_id)
        .await?
        .into_iter()
        .any(|assignment| assignment.provider_code == provider_code);
    let has_instances = repository
        .list_instances(workspace_id)
        .await?
        .into_iter()
        .any(|instance| instance.provider_code == provider_code);

    if assigned || has_instances {
        Ok(())
    } else {
        Err(ControlPlaneError::NotFound("model_provider").into())
    }
}
