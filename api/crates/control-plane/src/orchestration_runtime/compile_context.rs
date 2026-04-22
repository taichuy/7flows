use std::collections::{BTreeMap, BTreeSet};

use anyhow::Result;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    ports::{ModelProviderRepository, NodeContributionRepository},
};

#[derive(Debug, Clone)]
pub(super) struct ProviderInstanceSelectionCandidate {
    pub(super) instance: domain::ModelProviderInstanceRecord,
    pub(super) available_models: BTreeSet<String>,
}

pub(super) async fn build_compile_context<R>(
    repository: &R,
    workspace_id: Uuid,
) -> Result<orchestration_runtime::compiler::FlowCompileContext>
where
    R: ModelProviderRepository + NodeContributionRepository,
{
    let instances = repository.list_instances(workspace_id).await?;
    let contributions = repository.list_node_contributions(workspace_id).await?;
    let mut provider_families = BTreeMap::new();
    let mut node_contributions = BTreeMap::new();
    let mut provider_candidates =
        BTreeMap::<String, Vec<ProviderInstanceSelectionCandidate>>::new();

    for instance in instances {
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

        provider_candidates
            .entry(instance.provider_code.clone())
            .or_default()
            .push(ProviderInstanceSelectionCandidate {
                instance,
                available_models,
            });
    }

    for (provider_code, candidates) in provider_candidates {
        let Some(candidate) = select_effective_provider_candidate(&candidates) else {
            continue;
        };
        provider_families.insert(
            provider_code.clone(),
            orchestration_runtime::compiler::FlowCompileProviderFamily {
                effective_instance_id: candidate.instance.id.to_string(),
                provider_code,
                protocol: candidate.instance.protocol.clone(),
                is_ready: candidate.instance.status == domain::ModelProviderInstanceStatus::Ready,
                available_models: candidate.available_models.clone(),
                allow_custom_models: allow_custom_models(&candidate.instance.config_json),
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

pub(super) fn allow_custom_models(config_json: &Value) -> bool {
    config_json
        .get("validate_model")
        .and_then(Value::as_bool)
        .map(|value| !value)
        .unwrap_or(false)
}

pub(super) fn select_effective_provider_candidate(
    candidates: &[ProviderInstanceSelectionCandidate],
) -> Option<&ProviderInstanceSelectionCandidate> {
    candidates.iter().max_by_key(|candidate| {
        (
            candidate.instance.status == domain::ModelProviderInstanceStatus::Ready,
            candidate.instance.last_validated_at,
            candidate.instance.updated_at,
            candidate.instance.id,
        )
    })
}

pub(super) fn select_effective_provider_instance(
    instances: &[domain::ModelProviderInstanceRecord],
) -> Option<&domain::ModelProviderInstanceRecord> {
    instances.iter().max_by_key(|instance| {
        (
            instance.status == domain::ModelProviderInstanceStatus::Ready,
            instance.last_validated_at,
            instance.updated_at,
            instance.id,
        )
    })
}
