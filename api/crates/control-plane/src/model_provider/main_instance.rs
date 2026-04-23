use anyhow::Result;
use uuid::Uuid;

use crate::{
    model_provider::{ModelProviderMainInstanceView, UpdateModelProviderMainInstanceCommand},
    ports::{ModelProviderRepository, PluginRepository, UpsertModelProviderMainInstanceInput},
};

pub(super) async fn get_main_instance<R>(
    repository: &R,
    workspace_id: Uuid,
    provider_code: &str,
) -> Result<ModelProviderMainInstanceView>
where
    R: PluginRepository + ModelProviderRepository,
{
    super::routing::ensure_provider_exists(repository, workspace_id, provider_code).await?;
    Ok(to_view(
        provider_code,
        repository
            .get_main_instance(workspace_id, provider_code)
            .await?
            .as_ref(),
    ))
}

pub(super) async fn update_main_instance<R>(
    repository: &R,
    workspace_id: Uuid,
    command: &UpdateModelProviderMainInstanceCommand,
) -> Result<ModelProviderMainInstanceView>
where
    R: PluginRepository + ModelProviderRepository,
{
    super::routing::ensure_provider_exists(repository, workspace_id, &command.provider_code)
        .await?;
    let record = repository
        .upsert_main_instance(&UpsertModelProviderMainInstanceInput {
            workspace_id,
            provider_code: command.provider_code.clone(),
            auto_include_new_instances: command.auto_include_new_instances,
            updated_by: command.actor_user_id,
        })
        .await?;
    Ok(ModelProviderMainInstanceView {
        provider_code: record.provider_code,
        auto_include_new_instances: record.auto_include_new_instances,
    })
}

pub(super) fn auto_include_new_instances(
    record: Option<&domain::ModelProviderMainInstanceRecord>,
) -> bool {
    record
        .map(|record| record.auto_include_new_instances)
        .unwrap_or(true)
}

fn to_view(
    provider_code: &str,
    record: Option<&domain::ModelProviderMainInstanceRecord>,
) -> ModelProviderMainInstanceView {
    ModelProviderMainInstanceView {
        provider_code: provider_code.to_string(),
        auto_include_new_instances: auto_include_new_instances(record),
    }
}
