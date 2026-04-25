use std::collections::{BTreeMap, HashMap, HashSet};

use anyhow::Result;
use plugin_framework::provider_contract::{ProviderModelDescriptor, ProviderModelSource};
use uuid::Uuid;

use crate::{
    i18n::{merge_i18n_catalog, plugin_namespace, trim_provider_bundles, RequestedLocales},
    model_provider::{
        ModelProviderCatalogEntry, ModelProviderCatalogView, ModelProviderMainInstanceSummary,
        ModelProviderOptionEntry, ModelProviderOptionGroup, ModelProviderOptionsView,
    },
    plugin_lifecycle::reconcile_installation_snapshot,
    ports::{AuthRepository, ModelProviderRepository, PluginRepository},
};

use super::shared::{
    ensure_state_model_permission, load_actor_context_for_user, load_provider_package,
    localized_model_descriptor, model_discovery_mode_string,
};

pub(super) async fn list_catalog<R>(
    repository: &R,
    actor_user_id: Uuid,
    locales: RequestedLocales,
) -> Result<ModelProviderCatalogView>
where
    R: AuthRepository + PluginRepository,
{
    let actor = load_actor_context_for_user(repository, actor_user_id).await?;
    ensure_state_model_permission(&actor, "view")?;

    let assignments = repository
        .list_assignments(actor.current_workspace_id)
        .await?
        .into_iter()
        .map(|assignment| assignment.installation_id)
        .collect::<HashSet<_>>();
    let installations = repository.list_installations().await?;
    let mut catalog = Vec::new();
    let mut i18n_catalog = BTreeMap::new();
    for installation in installations {
        let installation = reconcile_installation_snapshot(repository, installation.id).await?;
        if matches!(
            installation.desired_state,
            domain::PluginDesiredState::Disabled
        ) || !assignments.contains(&installation.id)
            || installation.availability_status != domain::PluginAvailabilityStatus::Available
        {
            continue;
        }
        let package = load_provider_package(&installation.installed_path)?;
        let namespace = plugin_namespace(&installation.provider_code);
        merge_i18n_catalog(
            &mut i18n_catalog,
            trim_provider_bundles(&namespace, &package.i18n, &locales),
        );
        catalog.push(ModelProviderCatalogEntry {
            installation_id: installation.id,
            provider_code: installation.provider_code,
            plugin_id: installation.plugin_id,
            plugin_version: installation.plugin_version,
            plugin_type: "model_provider".to_string(),
            namespace: namespace.clone(),
            label_key: "provider.label".to_string(),
            description_key: Some("provider.description".to_string()),
            display_name: package.provider.display_name.clone(),
            protocol: installation.protocol,
            help_url: package.provider.help_url.clone(),
            default_base_url: package.provider.default_base_url.clone(),
            model_discovery_mode: model_discovery_mode_string(
                package.provider.model_discovery_mode,
            ),
            supports_model_fetch_without_credentials: package
                .provider
                .supports_model_fetch_without_credentials,
            desired_state: installation.desired_state.as_str().to_string(),
            availability_status: installation.availability_status.as_str().to_string(),
            form_schema: package.provider.form_schema.clone(),
            predefined_models: package
                .predefined_models
                .into_iter()
                .map(|model| localized_model_descriptor(&namespace, model))
                .collect(),
        });
    }

    Ok(ModelProviderCatalogView {
        entries: catalog,
        i18n_catalog,
    })
}

pub(super) async fn options<R>(
    repository: &R,
    actor_user_id: Uuid,
    locales: RequestedLocales,
) -> Result<ModelProviderOptionsView>
where
    R: AuthRepository + PluginRepository + ModelProviderRepository,
{
    let actor = load_actor_context_for_user(repository, actor_user_id).await?;
    ensure_state_model_permission(&actor, "view")?;
    let mut installation_map = HashMap::new();
    for installation in repository.list_installations().await? {
        let installation = reconcile_installation_snapshot(repository, installation.id).await?;
        installation_map.insert(installation.id, installation);
    }
    let mut instances_by_provider =
        HashMap::<String, Vec<domain::ModelProviderInstanceRecord>>::new();
    for instance in repository
        .list_instances(actor.current_workspace_id)
        .await?
    {
        if instance.status != domain::ModelProviderInstanceStatus::Ready
            || !instance.included_in_main
        {
            continue;
        }
        instances_by_provider
            .entry(instance.provider_code.clone())
            .or_default()
            .push(instance);
    }
    let mut provider_codes = instances_by_provider.keys().cloned().collect::<Vec<_>>();
    provider_codes.sort();

    let mut options = Vec::new();
    let mut i18n_catalog = BTreeMap::new();
    for provider_code in provider_codes {
        let Some(mut instances) = instances_by_provider.remove(&provider_code) else {
            continue;
        };
        instances.sort_by(|left, right| {
            left.display_name
                .cmp(&right.display_name)
                .then(left.id.cmp(&right.id))
        });
        let Some(first_instance) = instances.first() else {
            continue;
        };
        let installation_id = first_instance.installation_id;
        let protocol = first_instance.protocol.clone();
        let Some(installation) = installation_map.get(&installation_id) else {
            continue;
        };
        if installation.availability_status != domain::PluginAvailabilityStatus::Available {
            continue;
        }
        let package = load_provider_package(&installation.installed_path)?;
        let namespace = plugin_namespace(&provider_code);
        merge_i18n_catalog(
            &mut i18n_catalog,
            trim_provider_bundles(&namespace, &package.i18n, &locales),
        );

        let main_instance = repository
            .get_main_instance(actor.current_workspace_id, &provider_code)
            .await?;
        let mut model_groups = Vec::with_capacity(instances.len());
        let mut model_count = 0;
        for instance in instances {
            let candidate_models = match repository.get_catalog_cache(instance.id).await? {
                Some(cache) => serde_json::from_value(cache.models_json).unwrap_or_default(),
                None => package.predefined_models.clone(),
            };
            let models = expose_enabled_models(
                &namespace,
                candidate_models,
                &instance.configured_models,
                &instance.enabled_model_ids,
            );
            model_count += models.len();
            model_groups.push(ModelProviderOptionGroup {
                source_instance_id: instance.id,
                source_instance_display_name: instance.display_name,
                models,
            });
        }
        options.push(ModelProviderOptionEntry {
            provider_code: provider_code.clone(),
            plugin_type: "model_provider".to_string(),
            namespace: namespace.clone(),
            label_key: "provider.label".to_string(),
            description_key: Some("provider.description".to_string()),
            protocol,
            display_name: package.provider.display_name.clone(),
            icon: package.manifest.icon.clone(),
            parameter_form: package.provider.parameter_form.clone(),
            main_instance: ModelProviderMainInstanceSummary {
                provider_code: provider_code.clone(),
                auto_include_new_instances: super::main_instance::auto_include_new_instances(
                    main_instance.as_ref(),
                ),
                group_count: model_groups.len(),
                model_count,
            },
            model_groups,
        });
    }
    Ok(ModelProviderOptionsView {


[Content truncated by AionUi ACP client. Request a smaller line/limit range to continue.]
