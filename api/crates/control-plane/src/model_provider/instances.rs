use anyhow::Result;
use plugin_framework::provider_package::ProviderConfigField;
use serde_json::Value;

use crate::{model_provider::ModelProviderInstanceView, ports::ModelProviderRepository};

use super::shared::{
    empty_object, mask_secret_config, merge_json_object, validate_required_fields,
};

pub(super) async fn build_provider_runtime_config<R>(
    repository: &R,
    provider_secret_master_key: &str,
    package: &plugin_framework::provider_package::ProviderPackage,
    instance: &domain::ModelProviderInstanceRecord,
) -> Result<Value>
where
    R: ModelProviderRepository,
{
    let secret_json = repository
        .get_secret_json(instance.id, provider_secret_master_key)
        .await?
        .unwrap_or_else(empty_object);
    validate_required_fields(
        &package.provider.form_schema,
        &instance.config_json,
        &secret_json,
    )?;
    merge_json_object(&instance.config_json, &secret_json)
}

pub(super) async fn hydrate_instance_view<R>(
    repository: &R,
    provider_secret_master_key: &str,
    instance: domain::ModelProviderInstanceRecord,
    cache: Option<domain::ModelProviderCatalogCacheRecord>,
    form_schema: &[ProviderConfigField],
) -> Result<ModelProviderInstanceView>
where
    R: ModelProviderRepository,
{
    let secret_json = repository
        .get_secret_json(instance.id, provider_secret_master_key)
        .await?
        .unwrap_or_else(empty_object);
    let merged_config = mask_secret_config(&instance.config_json, &secret_json, form_schema)?;

    Ok(ModelProviderInstanceView {
        instance: domain::ModelProviderInstanceRecord {
            config_json: merged_config,
            ..instance
        },
        cache,
    })
}
