use std::collections::{BTreeMap, BTreeSet};

use anyhow::Result;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    errors::ControlPlaneError,
    ports::{ModelProviderRepository, NodeContributionRepository, PluginRepository},
};

pub(super) async fn build_compile_context<R>(
    repository: &R,
    workspace_id: Uuid,
) -> Result<orchestration_runtime::compiler::FlowCompileContext>
where
    R: ModelProviderRepository + NodeContributionRepository + PluginRepository,
{
    let instances = repository.list_instances(workspace_id).await?;
    let contributions = repository.list_node_contributions(workspace_id).await?;
    let assigned_installation_ids = repository
        .list_assignments(workspace_id)
        .await?
        .into_iter()
        .map(|assignment| assignment.installation_id)
        .collect::<BTreeSet<_>>();
    let mut provider_families = BTreeMap::new();
    let mut provider_instances = BTreeMap::new();
    let mut node_contributions = BTreeMap::new();

    for instance in instances {
        let available_models = available_models_for_instance(repository, &instance).await?;
        let allow_custom_models = allow_custom_models(&instance);
        let installation_runnable = installation_is_runnable(
            repository,
            instance.installation_id,
            assigned_installation_ids.contains(&instance.installation_id),
        )
        .await?;
        provider_instances.insert(
            instance.id.to_string(),
            orchestration_runtime::compiler::FlowCompileProviderInstance {
                provider_instance_id: instance.id.to_string(),
                provider_code: instance.provider_code.clone(),
                protocol: instance.protocol.clone(),
                is_ready: instance.status == domain::ModelProviderInstanceStatus::Ready,
                is_runnable: installation_runnable,
                included_in_main: instance.included_in_main,
                available_models: available_models.clone(),
                allow_custom_models,
            },
        );

        if !instance.included_in_main || !installation_runnable {
            continue;
        }

        provider_families
            .entry(instance.provider_code.clone())
            .and_modify(
                |family: &mut orchestration_runtime::compiler::FlowCompileProviderFamily| {
                    family.is_ready |=
                        instance.status == domain::ModelProviderInstanceStatus::Ready;
                    family
                        .available_models
                        .extend(available_models.iter().cloned());
                    family.allow_custom_models |= allow_custom_models;
                },
            )
            .or_insert_with(
                || orchestration_runtime::compiler::FlowCompileProviderFamily {
                    provider_code: instance.provider_code.clone(),
                    protocol: instance.protocol.clone(),
                    is_ready: instance.status == domain::ModelProviderInstanceStatus::Ready,
                    available_models,
                    allow_custom_models,
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
        provider_instances,
        node_contributions,
    })
}

pub(super) fn ensure_compiled_plan_runnable(
    compiled_plan: &orchestration_runtime::compiled_plan::CompiledPlan,
) -> Result<()> {
    if let Some(issue) = compiled_plan.compile_issues.first() {
        let field = match issue.code {
            orchestration_runtime::compiled_plan::CompileIssueCode::MissingProviderInstance =>
                missing_provider_field(issue.message.as_str()),
            orchestration_runtime::compiled_plan::CompileIssueCode::ProviderInstanceNotFound
            | orchestration_runtime::compiled_plan::CompileIssueCode::ProviderInstanceNotReady =>
                "source_instance_id",
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

async fn available_models_for_instance<R>(
    repository: &R,
    instance: &domain::ModelProviderInstanceRecord,
) -> Result<BTreeSet<String>>
where
    R: ModelProviderRepository,
{
    if !instance.enabled_model_ids.is_empty() {
        return Ok(instance.enabled_model_ids.iter().cloned().collect());
    }

    let cached_models = repository
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

    Ok(cached_models)
}

async fn installation_is_runnable<R>(
    repository: &R,
    installation_id: Uuid,
    assigned: bool,
) -> Result<bool>
where
    R: PluginRepository,
{
    if !assigned {
        return Ok(false);
    }
    let Some(installation) = repository.get_installation(installation_id).await? else {
        return Ok(false);
    };

    Ok(!matches!(
        installation.desired_state,
        domain::PluginDesiredState::Disabled
    ) && installation.availability_status == domain::PluginAvailabilityStatus::Available)
}

fn missing_provider_field(message: &str) -> &'static str {
    if message.contains("source_instance_id") {
        "source_instance_id"
    } else {
        "provider_code"
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::*;
    use crate::{
        errors::ControlPlaneError,
        ports::{ModelProviderRepository, UpsertModelProviderRoutingInput},
    };

    fn llm_document(
        flow_id: Uuid,
        provider_code: &str,
        source_instance_id: Option<Uuid>,
        model_id: &str,
    ) -> Value {
        let mut model_provider = json!({
            "provider_code": provider_code,
            "model_id": model_id,
        });
        if let Some(source_instance_id) = source_instance_id {
            model_provider["source_instance_id"] = json!(source_instance_id.to_string());
        }

        json!({
            "schemaVersion": "1flowbase.flow/v1",
            "meta": {
                "flowId": flow_id.to_string(),
                "name": "Compile Context Test",
                "description": "",
                "tags": []
            },
            "graph": {
                "nodes": [
                    {
                        "id": "node-start",
                        "type": "start",
                        "alias": "Start",
                        "description": "",
                        "containerId": null,
                        "position": { "x": 0, "y": 0 },
                        "configVersion": 1,
                        "config": {},
                        "bindings": {},
                        "outputs": [{ "key": "query", "title": "用户输入", "valueType": "string" }]
                    },
                    {
                        "id": "node-llm",
                        "type": "llm",
                        "alias": "LLM",
                        "description": "",
                        "containerId": null,
                        "position": { "x": 240, "y": 0 },
                        "configVersion": 1,
                        "config": {
                            "model_provider": model_provider,
                            "temperature": 0.2
                        },
                        "bindings": {
                            "user_prompt": { "kind": "selector", "value": ["node-start", "query"] }
                        },
                        "outputs": [{ "key": "text", "title": "模型输出", "valueType": "string" }]
                    }
                ],
                "edges": [
                    {
                        "id": "edge-start-llm",
                        "source": "node-start",
                        "target": "node-llm",
                        "sourceHandle": null,
                        "targetHandle": null,
                        "containerId": null,
                        "points": []
                    }
                ]
            },
            "editor": {
                "viewport": { "x": 0, "y": 0, "zoom": 1 },
                "annotations": [],
                "activeContainerPath": []
            }
        })
    }

    async fn compile_error_field(
        repository: &super::super::test_support::InMemoryOrchestrationRuntimeRepository,
        document: &Value,
    ) -> String {
        let compile_context = build_compile_context(repository, Uuid::nil())
            .await
            .expect("compile context should build");
        let compiled_plan = orchestration_runtime::compiler::FlowCompiler::compile(
            Uuid::now_v7(),
            "draft-1",
            document,
            &compile_context,
        )
        .expect("plan should compile");
        let error = ensure_compiled_plan_runnable(&compiled_plan).expect_err("plan should fail");
        match error.downcast_ref::<ControlPlaneError>() {
            Some(ControlPlaneError::InvalidInput(field)) => (*field).to_string(),
            other => panic!("expected invalid input error, got {other:?}"),
        }
    }

    async fn seed_primary_routing(
        repository: &super::super::test_support::InMemoryOrchestrationRuntimeRepository,
        primary_instance_id: Uuid,
    ) {
        ModelProviderRepository::upsert_routing(
            repository,
            &UpsertModelProviderRoutingInput {
                workspace_id: Uuid::nil(),
                provider_code: "fixture_provider".to_string(),
                routing_mode: domain::ModelProviderRoutingMode::ManualPrimary,
                primary_instance_id,
                updated_by: Uuid::nil(),
            },
        )
        .await
        .expect("routing should seed");
    }

    #[tokio::test]
    async fn orchestration_runtime_compile_context_requires_source_instance_id() {
        let repository =
            super::super::test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(
                vec![],
            );
        seed_primary_routing(&repository, repository.default_provider_instance_id()).await;

        let field = compile_error_field(
            &repository,
            &llm_document(Uuid::now_v7(), "fixture_provider", None, "gpt-5.4-mini"),
        )
        .await;

        assert_eq!(field, "source_instance_id");
    }

    #[tokio::test]
    async fn orchestration_runtime_compile_context_rejects_source_instance_from_another_provider() {
        let repository =
            super::super::test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(
                vec![],
            );
        seed_primary_routing(&repository, repository.default_provider_instance_id()).await;
        let foreign_instance_id = repository.seed_provider_instance(
            "other_provider",
            "Foreign Provider Instance",
            true,
            domain::ModelProviderInstanceStatus::Ready,
            vec!["gpt-5.4-mini"],
        );

        let field = compile_error_field(
            &repository,
            &llm_document(
                Uuid::now_v7(),
                "fixture_provider",
                Some(foreign_instance_id),
                "gpt-5.4-mini",
            ),
        )
        .await;

        assert_eq!(field, "source_instance_id");
    }

    #[tokio::test]
    async fn orchestration_runtime_compile_context_rejects_non_ready_source_instance() {
        let repository =
            super::super::test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(
                vec![],
            );
        let instance_id = repository.default_provider_instance_id();
        repository.set_instance_status(instance_id, domain::ModelProviderInstanceStatus::Disabled);
        seed_primary_routing(&repository, instance_id).await;

        let field = compile_error_field(
            &repository,
            &llm_document(
                Uuid::now_v7(),
                "fixture_provider",
                Some(instance_id),
                "gpt-5.4-mini",
            ),
        )
        .await;

        assert_eq!(field, "source_instance_id");
    }

    #[tokio::test]
    async fn orchestration_runtime_compile_context_rejects_source_instance_outside_main_aggregation(
    ) {
        let repository =
            super::super::test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(
                vec![],
            );
        seed_primary_routing(&repository, repository.default_provider_instance_id()).await;
        let excluded_instance_id = repository.seed_provider_instance(
            "fixture_provider",
            "Excluded",
            false,
            domain::ModelProviderInstanceStatus::Ready,
            vec!["gpt-5.4-mini"],
        );

        let field = compile_error_field(
            &repository,
            &llm_document(
                Uuid::now_v7(),
                "fixture_provider",
                Some(excluded_instance_id),
                "gpt-5.4-mini",
            ),
        )
        .await;

        assert_eq!(field, "source_instance_id");
    }

    #[tokio::test]
    async fn orchestration_runtime_compile_context_validates_model_on_selected_source_instance() {
        let repository =
            super::super::test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(
                vec![],
            );
        seed_primary_routing(&repository, repository.default_provider_instance_id()).await;
        let selected_instance_id = repository.seed_provider_instance(
            "fixture_provider",
            "Narrow Model Set",
            true,
            domain::ModelProviderInstanceStatus::Ready,
            vec!["other-model"],
        );

        let field = compile_error_field(
            &repository,
            &llm_document(
                Uuid::now_v7(),
                "fixture_provider",
                Some(selected_instance_id),
                "gpt-5.4-mini",
            ),
        )
        .await;

        assert_eq!(field, "model");
    }

    #[tokio::test]
    async fn orchestration_runtime_compile_context_does_not_expand_enabled_models_from_catalog_cache(
    ) {
        let repository =
            super::super::test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(
                vec![],
            );
        seed_primary_routing(&repository, repository.default_provider_instance_id()).await;
        let selected_instance_id = repository.seed_provider_instance(
            "fixture_provider",
            "Cache Wider Than Enabled",
            true,
            domain::ModelProviderInstanceStatus::Ready,
            vec!["other-model"],
        );
        repository
            .set_instance_catalog_models(selected_instance_id, vec!["other-model", "gpt-5.4-mini"]);

        let field = compile_error_field(
            &repository,
            &llm_document(
                Uuid::now_v7(),
                "fixture_provider",
                Some(selected_instance_id),
                "gpt-5.4-mini",
            ),
        )
        .await;

        assert_eq!(field, "model");
    }

    #[tokio::test]
    async fn orchestration_runtime_compile_context_rejects_source_instance_when_installation_unassigned(
    ) {
        let repository =
            super::super::test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(
                vec![],
            );
        let instance_id = repository.default_provider_instance_id();
        let installation_id =
            ModelProviderRepository::get_instance(&repository, Uuid::nil(), instance_id)
                .await
                .expect("instance lookup should succeed")
                .expect("instance should exist")
                .installation_id;
        repository.remove_assignment_for_installation(Uuid::nil(), installation_id);

        let field = compile_error_field(
            &repository,
            &llm_document(
                Uuid::now_v7(),
                "fixture_provider",
                Some(instance_id),
                "gpt-5.4-mini",
            ),
        )
        .await;

        assert_eq!(field, "source_instance_id");
    }

    #[tokio::test]
    async fn orchestration_runtime_compile_context_rejects_source_instance_when_installation_disabled(
    ) {
        let repository =
            super::super::test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(
                vec![],
            );
        let instance_id = repository.default_provider_instance_id();
        let installation_id =
            ModelProviderRepository::get_instance(&repository, Uuid::nil(), instance_id)
                .await
                .expect("instance lookup should succeed")
                .expect("instance should exist")
                .installation_id;
        repository.set_installation_state(
            installation_id,
            domain::PluginDesiredState::Disabled,
            domain::PluginAvailabilityStatus::Disabled,
        );

        let field = compile_error_field(
            &repository,
            &llm_document(
                Uuid::now_v7(),
                "fixture_provider",
                Some(instance_id),
                "gpt-5.4-mini",
            ),
        )
        .await;

        assert_eq!(field, "source_instance_id");
    }
}
