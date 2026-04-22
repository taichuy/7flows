use std::collections::{BTreeMap, BTreeSet};

use anyhow::Result;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    ports::{ModelProviderRepository, NodeContributionRepository},
};

pub(super) async fn build_compile_context<R>(
    repository: &R,
    workspace_id: Uuid,
) -> Result<orchestration_runtime::compiler::FlowCompileContext>
where
    R: ModelProviderRepository + NodeContributionRepository,
{
    let instances = repository.list_instances(workspace_id).await?;
    let routings = repository.list_routings(workspace_id).await?;
    let contributions = repository.list_node_contributions(workspace_id).await?;
    let mut provider_families = BTreeMap::new();
    let mut node_contributions = BTreeMap::new();
    let instances_by_id = instances
        .into_iter()
        .map(|instance| (instance.id, instance))
        .collect::<BTreeMap<_, _>>();
    let routing_by_provider = routings
        .into_iter()
        .map(|routing| (routing.provider_code.clone(), routing))
        .collect::<BTreeMap<_, _>>();

    for (provider_code, routing) in routing_by_provider {
        let Some(instance) = instances_by_id.get(&routing.primary_instance_id) else {
            continue;
        };
        if instance.provider_code != provider_code {
            continue;
        }

        let available_models = repository
            .get_catalog_cache(instance.id)
            .await?
            .and_then(|cache| cache.models_json.as_array().cloned())
            .unwrap_or_default()
            .into_iter()
            .filter_map(|model| {
                model
                    .get("model_id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect::<BTreeSet<_>>();

        provider_families.insert(
            provider_code.clone(),
            orchestration_runtime::compiler::FlowCompileProviderFamily {
                effective_instance_id: instance.id.to_string(),
                provider_code,
                protocol: instance.protocol.clone(),
                is_ready: instance.status == domain::ModelProviderInstanceStatus::Ready,
                available_models,
                allow_custom_models: allow_custom_models(instance),
            },
        );
    }

    for entry in contributions {
        let key = node_contribution_lookup_key(
            &entry.plugin_id,
            &entry.plugin_version,
            &entry.contribution_code,
            &entry.node_shell,
            &entry.schema_version,
        );
        node_contributions.insert(
            key,
            orchestration_runtime::compiler::FlowCompileNodeContribution {
                installation_id: entry.installation_id,
                plugin_id: entry.plugin_id,
                plugin_version: entry.plugin_version,
                contribution_code: entry.contribution_code,
                node_shell: entry.node_shell,
                schema_version: entry.schema_version,
                dependency_status: entry.dependency_status.as_str().to_string(),
            },
        );
    }

    Ok(orchestration_runtime::compiler::FlowCompileContext {
        provider_families,
        node_contributions,
    })
}

pub(super) fn ensure_compiled_plan_runnable(
    compiled_plan: &orchestration_runtime::compiled_plan::CompiledPlan,
) -> Result<()> {
    if let Some(issue) = compiled_plan.compile_issues.first() {
        let field = match issue.code {
            orchestration_runtime::compiled_plan::CompileIssueCode::MissingProviderInstance
            | orchestration_runtime::compiled_plan::CompileIssueCode::ProviderInstanceNotFound
            | orchestration_runtime::compiled_plan::CompileIssueCode::ProviderInstanceNotReady => {
                "provider_code"
            }
            orchestration_runtime::compiled_plan::CompileIssueCode::MissingModel
            | orchestration_runtime::compiled_plan::CompileIssueCode::ModelNotAvailable => "model",
            orchestration_runtime::compiled_plan::CompileIssueCode::MissingPluginId => "plugin_id",
            orchestration_runtime::compiled_plan::CompileIssueCode::MissingPluginVersion => {
                "plugin_version"
            }
            orchestration_runtime::compiled_plan::CompileIssueCode::MissingContributionCode => {
                "contribution_code"
            }
            orchestration_runtime::compiled_plan::CompileIssueCode::MissingNodeShell => {
                "node_shell"
            }
            orchestration_runtime::compiled_plan::CompileIssueCode::MissingSchemaVersion => {
                "schema_version"
            }
            orchestration_runtime::compiled_plan::CompileIssueCode::MissingPluginContribution
            | orchestration_runtime::compiled_plan::CompileIssueCode::PluginContributionDependencyNotReady =>
                "contribution_code",
        };
        return Err(ControlPlaneError::InvalidInput(field).into());
    }

    Ok(())
}

pub(super) fn node_contribution_lookup_key(
    plugin_id: &str,
    plugin_version: &str,
    contribution_code: &str,
    node_shell: &str,
    schema_version: &str,
) -> String {
    format!("{plugin_id}::{plugin_version}::{contribution_code}::{node_shell}::{schema_version}")
}

pub(super) fn allow_custom_models(instance: &domain::ModelProviderInstanceRecord) -> bool {
    instance.enabled_model_ids.is_empty()
}

pub(super) fn select_effective_provider_instance(
    instances: &[domain::ModelProviderInstanceRecord],
) -> Option<&domain::ModelProviderInstanceRecord> {
    instances.iter().max_by_key(|instance| {
        (
            instance.status == domain::ModelProviderInstanceStatus::Ready,
            instance.updated_at,
            instance.id,
        )
    })
}
