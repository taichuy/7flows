use std::collections::{HashMap, HashSet};

use anyhow::Result;
use plugin_framework::{
    provider_contract::{ModelDiscoveryMode, ProviderModelDescriptor},
    provider_package::{ProviderConfigField, ProviderPackage},
};
use serde_json::{json, Map, Value};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    audit::audit_log,
    errors::ControlPlaneError,
    ports::{
        AuthRepository, CreateModelProviderInstanceInput, ModelProviderRepository,
        PluginRepository, ProviderRuntimePort, UpdateModelProviderInstanceInput,
        UpsertModelProviderCatalogCacheInput, UpsertModelProviderSecretInput,
    },
};

pub struct CreateModelProviderInstanceCommand {
    pub actor_user_id: Uuid,
    pub installation_id: Uuid,
    pub display_name: String,
    pub config_json: Value,
}

pub struct UpdateModelProviderInstanceCommand {
    pub actor_user_id: Uuid,
    pub instance_id: Uuid,
    pub display_name: String,
    pub config_json: Value,
}

pub struct DeleteModelProviderInstanceCommand {
    pub actor_user_id: Uuid,
    pub instance_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct ModelProviderCatalogEntry {
    pub installation_id: Uuid,
    pub provider_code: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub display_name: String,
    pub protocol: String,
    pub help_url: Option<String>,
    pub default_base_url: Option<String>,
    pub model_discovery_mode: String,
    pub supports_model_fetch_without_credentials: bool,
    pub enabled: bool,
    pub form_schema: Vec<ProviderConfigField>,
    pub predefined_models: Vec<ProviderModelDescriptor>,
}

#[derive(Debug, Clone)]
pub struct ModelProviderInstanceView {
    pub instance: domain::ModelProviderInstanceRecord,
    pub cache: Option<domain::ModelProviderCatalogCacheRecord>,
}

#[derive(Debug, Clone)]
pub struct ValidateModelProviderResult {
    pub instance: domain::ModelProviderInstanceRecord,
    pub cache: domain::ModelProviderCatalogCacheRecord,
    pub output: Value,
}

#[derive(Debug, Clone)]
pub struct ModelProviderModelCatalog {
    pub provider_instance_id: Uuid,
    pub refresh_status: domain::ModelProviderCatalogRefreshStatus,
    pub source: domain::ModelProviderCatalogSource,
    pub last_error_message: Option<String>,
    pub refreshed_at: Option<OffsetDateTime>,
    pub models: Vec<ProviderModelDescriptor>,
}

#[derive(Debug, Clone)]
pub struct ModelProviderOptionEntry {
    pub provider_instance_id: Uuid,
    pub provider_code: String,
    pub protocol: String,
    pub display_name: String,
    pub models: Vec<ProviderModelDescriptor>,
}

pub struct ModelProviderService<R, H> {
    repository: R,
    runtime: H,
    provider_secret_master_key: String,
}

impl<R, H> ModelProviderService<R, H>
where
    R: AuthRepository + PluginRepository + ModelProviderRepository,
    H: ProviderRuntimePort,
{
    pub fn new(repository: R, runtime: H, provider_secret_master_key: impl Into<String>) -> Self {
        Self {
            repository,
            runtime,
            provider_secret_master_key: provider_secret_master_key.into(),
        }
    }

    pub async fn list_catalog(
        &self,
        actor_user_id: Uuid,
    ) -> Result<Vec<ModelProviderCatalogEntry>> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_state_model_permission(&actor, "view")?;

        let assignments = self
            .repository
            .list_assignments(actor.current_workspace_id)
            .await?
            .into_iter()
            .map(|assignment| assignment.installation_id)
            .collect::<HashSet<_>>();
        let installations = self.repository.list_installations().await?;
        let mut catalog = Vec::new();
        for installation in installations {
            if !installation.enabled || !assignments.contains(&installation.id) {
                continue;
            }
            let package = load_provider_package(&installation.install_path)?;
            catalog.push(ModelProviderCatalogEntry {
                installation_id: installation.id,
                provider_code: installation.provider_code,
                plugin_id: installation.plugin_id,
                plugin_version: installation.plugin_version,
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
                enabled: installation.enabled,
                form_schema: package.provider.form_schema.clone(),
                predefined_models: package.predefined_models.clone(),
            });
        }

        Ok(catalog)
    }

    pub async fn list_instances(
        &self,
        actor_user_id: Uuid,
    ) -> Result<Vec<ModelProviderInstanceView>> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_state_model_permission(&actor, "view")?;

        let instances = self
            .repository
            .list_instances(actor.current_workspace_id)
            .await?;
        let mut output = Vec::with_capacity(instances.len());
        for instance in instances {
            let cache = self.repository.get_catalog_cache(instance.id).await?;
            output.push(self.hydrate_instance_view(instance, cache).await?);
        }
        Ok(output)
    }

    pub async fn create_instance(
        &self,
        command: CreateModelProviderInstanceCommand,
    ) -> Result<ModelProviderInstanceView> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_state_model_permission(&actor, "manage")?;
        let installation = self
            .repository
            .get_installation(command.installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        ensure_installation_assigned(
            &self.repository,
            actor.current_workspace_id,
            command.installation_id,
        )
        .await?;
        if !installation.enabled {
            return Err(ControlPlaneError::Conflict("plugin_installation_disabled").into());
        }

        let package = load_provider_package(&installation.install_path)?;
        let (public_config, secret_config) =
            split_provider_config(&package.provider.form_schema, &command.config_json)?;
        validate_required_fields(
            &package.provider.form_schema,
            &public_config,
            &secret_config,
        )?;
        let instance = self
            .repository
            .create_instance(&CreateModelProviderInstanceInput {
                instance_id: Uuid::now_v7(),
                workspace_id: actor.current_workspace_id,
                installation_id: installation.id,
                provider_code: installation.provider_code.clone(),
                protocol: installation.protocol.clone(),
                display_name: normalize_required_text(&command.display_name, "display_name")?,
                status: domain::ModelProviderInstanceStatus::Draft,
                config_json: public_config.clone(),
                last_validation_status: None,
                last_validation_message: None,
                created_by: command.actor_user_id,
            })
            .await?;
        if !is_empty_object(&secret_config) {
            self.repository
                .upsert_secret(&UpsertModelProviderSecretInput {
                    provider_instance_id: instance.id,
                    plaintext_secret_json: secret_config,
                    secret_version: 1,
                    master_key: self.provider_secret_master_key.clone(),
                })
                .await?;
        }
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "model_provider_instance",
                Some(instance.id),
                "model_provider.created",
                json!({
                    "provider_code": instance.provider_code,
                    "display_name": instance.display_name,
                }),
            ))
            .await?;

        self.hydrate_instance_view(instance, None).await
    }

    pub async fn update_instance(
        &self,
        command: UpdateModelProviderInstanceCommand,
    ) -> Result<ModelProviderInstanceView> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_state_model_permission(&actor, "manage")?;
        let existing = self
            .repository
            .get_instance(actor.current_workspace_id, command.instance_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_provider_instance"))?;
        let installation = self
            .repository
            .get_installation(existing.installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        let package = load_provider_package(&installation.install_path)?;

        let (patch_public_config, patch_secret_config) =
            split_provider_config(&package.provider.form_schema, &command.config_json)?;
        let current_secret_json = self
            .repository
            .get_secret_json(existing.id, &self.provider_secret_master_key)
            .await?
            .unwrap_or_else(empty_object);
        let merged_public_config = merge_json_object(&existing.config_json, &patch_public_config)?;
        let merged_secret_config = merge_json_object(&current_secret_json, &patch_secret_config)?;
        validate_required_fields(
            &package.provider.form_schema,
            &merged_public_config,
            &merged_secret_config,
        )?;

        if !is_empty_object(&patch_secret_config) {
            let version = self
                .repository
                .get_secret_record(existing.id)
                .await?
                .map(|record| record.secret_version + 1)
                .unwrap_or(1);
            self.repository
                .upsert_secret(&UpsertModelProviderSecretInput {
                    provider_instance_id: existing.id,
                    plaintext_secret_json: merged_secret_config.clone(),
                    secret_version: version,
                    master_key: self.provider_secret_master_key.clone(),
                })
                .await?;
        }

        let updated = self
            .repository
            .update_instance(&UpdateModelProviderInstanceInput {
                instance_id: existing.id,
                workspace_id: actor.current_workspace_id,
                display_name: normalize_required_text(&command.display_name, "display_name")?,
                status: match existing.status {
                    domain::ModelProviderInstanceStatus::Disabled => {
                        domain::ModelProviderInstanceStatus::Disabled
                    }
                    _ => domain::ModelProviderInstanceStatus::Draft,
                },
                config_json: merged_public_config,
                last_validated_at: None,
                last_validation_status: None,
                last_validation_message: None,
                updated_by: command.actor_user_id,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "model_provider_instance",
                Some(updated.id),
                "model_provider.updated",
                json!({
                    "provider_code": updated.provider_code,
                    "display_name": updated.display_name,
                }),
            ))
            .await?;

        self.hydrate_instance_view(updated, self.repository.get_catalog_cache(existing.id).await?)
            .await
    }

    pub async fn validate_instance(
        &self,
        actor_user_id: Uuid,
        instance_id: Uuid,
    ) -> Result<ValidateModelProviderResult> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_state_model_permission(&actor, "manage")?;
        let instance = self
            .repository
            .get_instance(actor.current_workspace_id, instance_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_provider_instance"))?;
        let installation = self
            .repository
            .get_installation(instance.installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        let package = load_provider_package(&installation.install_path)?;
        let provider_config = self
            .build_provider_runtime_config(&package, &instance)
            .await?;

        let validation_result = async {
            self.runtime.ensure_loaded(&installation).await?;
            let output = self
                .runtime
                .validate_provider(&installation, provider_config.clone())
                .await?;
            let models = self
                .runtime
                .list_models(&installation, provider_config)
                .await?;
            let now = OffsetDateTime::now_utc();
            let cache = self
                .repository
                .upsert_catalog_cache(&UpsertModelProviderCatalogCacheInput {
                    provider_instance_id: instance.id,
                    model_discovery_mode: map_model_discovery_mode(
                        package.provider.model_discovery_mode,
                    ),
                    refresh_status: domain::ModelProviderCatalogRefreshStatus::Ready,
                    source: map_catalog_source(package.provider.model_discovery_mode),
                    models_json: serde_json::to_value(&models)?,
                    last_error_message: None,
                    refreshed_at: Some(now),
                })
                .await?;
            let updated_instance = self
                .repository
                .update_instance(&UpdateModelProviderInstanceInput {
                    instance_id: instance.id,
                    workspace_id: actor.current_workspace_id,
                    display_name: instance.display_name.clone(),
                    status: domain::ModelProviderInstanceStatus::Ready,
                    config_json: instance.config_json.clone(),
                    last_validated_at: Some(now),
                    last_validation_status: Some(domain::ModelProviderValidationStatus::Succeeded),
                    last_validation_message: Some("validated".to_string()),
                    updated_by: actor_user_id,
                })
                .await?;
            self.repository
                .append_audit_log(&audit_log(
                    Some(actor.current_workspace_id),
                    Some(actor_user_id),
                    "model_provider_instance",
                    Some(instance.id),
                    "model_provider.validated",
                    json!({
                        "provider_code": instance.provider_code,
                        "model_count": models.len(),
                    }),
                ))
                .await?;
            Ok::<ValidateModelProviderResult, anyhow::Error>(ValidateModelProviderResult {
                instance: updated_instance,
                cache,
                output,
            })
        }
        .await;

        match validation_result {
            Ok(result) => Ok(result),
            Err(error) => {
                let now = OffsetDateTime::now_utc();
                let existing_cache = self.repository.get_catalog_cache(instance.id).await?;
                let _ = self
                    .repository
                    .upsert_catalog_cache(&UpsertModelProviderCatalogCacheInput {
                        provider_instance_id: instance.id,
                        model_discovery_mode: map_model_discovery_mode(
                            package.provider.model_discovery_mode,
                        ),
                        refresh_status: domain::ModelProviderCatalogRefreshStatus::Failed,
                        source: map_catalog_source(package.provider.model_discovery_mode),
                        models_json: existing_cache
                            .map(|cache| cache.models_json)
                            .unwrap_or_else(|| json!([])),
                        last_error_message: Some(error.to_string()),
                        refreshed_at: None,
                    })
                    .await;
                let _ = self
                    .repository
                    .update_instance(&UpdateModelProviderInstanceInput {
                        instance_id: instance.id,
                        workspace_id: actor.current_workspace_id,
                        display_name: instance.display_name.clone(),
                        status: domain::ModelProviderInstanceStatus::Invalid,
                        config_json: instance.config_json.clone(),
                        last_validated_at: Some(now),
                        last_validation_status: Some(domain::ModelProviderValidationStatus::Failed),
                        last_validation_message: Some(error.to_string()),
                        updated_by: actor_user_id,
                    })
                    .await;
                let _ = self
                    .repository
                    .append_audit_log(&audit_log(
                        Some(actor.current_workspace_id),
                        Some(actor_user_id),
                        "model_provider_instance",
                        Some(instance.id),
                        "model_provider.validate_failed",
                        json!({
                            "provider_code": instance.provider_code,
                            "message": error.to_string(),
                        }),
                    ))
                    .await;
                Err(error)
            }
        }
    }

    pub async fn list_models(
        &self,
        actor_user_id: Uuid,
        instance_id: Uuid,
    ) -> Result<ModelProviderModelCatalog> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_state_model_permission(&actor, "view")?;
        let instance = self
            .repository
            .get_instance(actor.current_workspace_id, instance_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_provider_instance"))?;
        let installation = self
            .repository
            .get_installation(instance.installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        let package = load_provider_package(&installation.install_path)?;
        if let Some(cache) = self.repository.get_catalog_cache(instance.id).await? {
            return Ok(ModelProviderModelCatalog {
                provider_instance_id: instance.id,
                refresh_status: cache.refresh_status,
                source: cache.source,
                last_error_message: cache.last_error_message,
                refreshed_at: cache.refreshed_at,
                models: serde_json::from_value(cache.models_json).unwrap_or_default(),
            });
        }

        Ok(ModelProviderModelCatalog {
            provider_instance_id: instance.id,
            refresh_status: domain::ModelProviderCatalogRefreshStatus::Idle,
            source: map_catalog_source(package.provider.model_discovery_mode),
            last_error_message: None,
            refreshed_at: None,
            models: package.predefined_models,
        })
    }

    pub async fn refresh_models(
        &self,
        actor_user_id: Uuid,
        instance_id: Uuid,
    ) -> Result<ModelProviderModelCatalog> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_state_model_permission(&actor, "manage")?;
        let instance = self
            .repository
            .get_instance(actor.current_workspace_id, instance_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_provider_instance"))?;
        let installation = self
            .repository
            .get_installation(instance.installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        let package = load_provider_package(&installation.install_path)?;
        let provider_config = self
            .build_provider_runtime_config(&package, &instance)
            .await?;
        let existing_cache = self.repository.get_catalog_cache(instance.id).await?;

        let refresh_result = async {
            self.runtime.ensure_loaded(&installation).await?;
            let models = self
                .runtime
                .list_models(&installation, provider_config)
                .await?;
            let cache = self
                .repository
                .upsert_catalog_cache(&UpsertModelProviderCatalogCacheInput {
                    provider_instance_id: instance.id,
                    model_discovery_mode: map_model_discovery_mode(
                        package.provider.model_discovery_mode,
                    ),
                    refresh_status: domain::ModelProviderCatalogRefreshStatus::Ready,
                    source: map_catalog_source(package.provider.model_discovery_mode),
                    models_json: serde_json::to_value(&models)?,
                    last_error_message: None,
                    refreshed_at: Some(OffsetDateTime::now_utc()),
                })
                .await?;
            self.repository
                .append_audit_log(&audit_log(
                    Some(actor.current_workspace_id),
                    Some(actor_user_id),
                    "model_provider_instance",
                    Some(instance.id),
                    "model_provider.models_refreshed",
                    json!({
                        "provider_code": instance.provider_code,
                        "model_count": models.len(),
                    }),
                ))
                .await?;
            Ok::<ModelProviderModelCatalog, anyhow::Error>(ModelProviderModelCatalog {
                provider_instance_id: instance.id,
                refresh_status: cache.refresh_status,
                source: cache.source,
                last_error_message: cache.last_error_message,
                refreshed_at: cache.refreshed_at,
                models,
            })
        }
        .await;

        match refresh_result {
            Ok(result) => Ok(result),
            Err(error) => {
                let _ = self
                    .repository
                    .upsert_catalog_cache(&UpsertModelProviderCatalogCacheInput {
                        provider_instance_id: instance.id,
                        model_discovery_mode: map_model_discovery_mode(
                            package.provider.model_discovery_mode,
                        ),
                        refresh_status: domain::ModelProviderCatalogRefreshStatus::Failed,
                        source: map_catalog_source(package.provider.model_discovery_mode),
                        models_json: existing_cache
                            .as_ref()
                            .map(|cache| cache.models_json.clone())
                            .unwrap_or_else(|| json!([])),
                        last_error_message: Some(error.to_string()),
                        refreshed_at: existing_cache.and_then(|cache| cache.refreshed_at),
                    })
                    .await;
                let _ = self
                    .repository
                    .append_audit_log(&audit_log(
                        Some(actor.current_workspace_id),
                        Some(actor_user_id),
                        "model_provider_instance",
                        Some(instance.id),
                        "model_provider.models_refresh_failed",
                        json!({
                            "provider_code": instance.provider_code,
                            "message": error.to_string(),
                        }),
                    ))
                    .await;
                Err(error)
            }
        }
    }

    pub async fn delete_instance(&self, command: DeleteModelProviderInstanceCommand) -> Result<()> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_state_model_permission(&actor, "manage")?;
        let instance = self
            .repository
            .get_instance(actor.current_workspace_id, command.instance_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_provider_instance"))?;
        let reference_count = self
            .repository
            .count_instance_references(actor.current_workspace_id, command.instance_id)
            .await?;
        if reference_count > 0 {
            self.repository
                .append_audit_log(&audit_log(
                    Some(actor.current_workspace_id),
                    Some(command.actor_user_id),
                    "model_provider_instance",
                    Some(instance.id),
                    "model_provider.delete_conflict",
                    json!({
                        "provider_code": instance.provider_code,
                        "reference_count": reference_count,
                    }),
                ))
                .await?;
            return Err(ControlPlaneError::Conflict("model_provider_in_use").into());
        }

        self.repository
            .delete_instance(actor.current_workspace_id, command.instance_id)
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "model_provider_instance",
                Some(instance.id),
                "model_provider.deleted",
                json!({
                    "provider_code": instance.provider_code,
                }),
            ))
            .await?;
        Ok(())
    }

    pub async fn options(&self, actor_user_id: Uuid) -> Result<Vec<ModelProviderOptionEntry>> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_state_model_permission(&actor, "view")?;
        let instances = self
            .repository
            .list_instances(actor.current_workspace_id)
            .await?;
        let installation_map = self
            .repository
            .list_installations()
            .await?
            .into_iter()
            .map(|installation| (installation.id, installation))
            .collect::<HashMap<_, _>>();

        let mut options = Vec::new();
        for instance in instances {
            if instance.status != domain::ModelProviderInstanceStatus::Ready {
                continue;
            }
            let Some(installation) = installation_map.get(&instance.installation_id) else {
                continue;
            };
            let package = load_provider_package(&installation.install_path)?;
            let models = match self.repository.get_catalog_cache(instance.id).await? {
                Some(cache) => serde_json::from_value(cache.models_json).unwrap_or_default(),
                None => package.predefined_models,
            };
            options.push(ModelProviderOptionEntry {
                provider_instance_id: instance.id,
                provider_code: instance.provider_code,
                protocol: instance.protocol,
                display_name: instance.display_name,
                models,
            });
        }
        Ok(options)
    }

    async fn build_provider_runtime_config(
        &self,
        package: &ProviderPackage,
        instance: &domain::ModelProviderInstanceRecord,
    ) -> Result<Value> {
        let secret_json = self
            .repository
            .get_secret_json(instance.id, &self.provider_secret_master_key)
            .await?
            .unwrap_or_else(empty_object);
        validate_required_fields(
            &package.provider.form_schema,
            &instance.config_json,
            &secret_json,
        )?;
        merge_json_object(&instance.config_json, &secret_json)
    }

    async fn hydrate_instance_view(
        &self,
        instance: domain::ModelProviderInstanceRecord,
        cache: Option<domain::ModelProviderCatalogCacheRecord>,
    ) -> Result<ModelProviderInstanceView> {
        let secret_json = self
            .repository
            .get_secret_json(instance.id, &self.provider_secret_master_key)
            .await?
            .unwrap_or_else(empty_object);
        let merged_config = merge_json_object(&instance.config_json, &secret_json)?;

        Ok(ModelProviderInstanceView {
            instance: domain::ModelProviderInstanceRecord {
                config_json: merged_config,
                ..instance
            },
            cache,
        })
    }
}

async fn load_actor_context_for_user<R>(
    repository: &R,
    actor_user_id: Uuid,
) -> Result<domain::ActorContext>
where
    R: AuthRepository,
{
    let scope = repository.default_scope_for_user(actor_user_id).await?;
    repository
        .load_actor_context(actor_user_id, scope.tenant_id, scope.workspace_id, None)
        .await
}

async fn ensure_installation_assigned<R>(
    repository: &R,
    workspace_id: Uuid,
    installation_id: Uuid,
) -> Result<()>
where
    R: PluginRepository,
{
    let assigned = repository
        .list_assignments(workspace_id)
        .await?
        .into_iter()
        .any(|assignment| assignment.installation_id == installation_id);
    if assigned {
        Ok(())
    } else {
        Err(ControlPlaneError::Conflict("plugin_assignment_required").into())
    }
}

fn ensure_state_model_permission(
    actor: &domain::ActorContext,
    action: &str,
) -> Result<(), ControlPlaneError> {
    if actor.is_root
        || actor.has_permission(&format!("state_model.{action}.all"))
        || actor.has_permission(&format!("state_model.{action}.own"))
    {
        return Ok(());
    }

    Err(ControlPlaneError::PermissionDenied("permission_denied"))
}

fn normalize_required_text(value: &str, field: &'static str) -> Result<String, anyhow::Error> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(ControlPlaneError::InvalidInput(field).into())
    } else {
        Ok(trimmed.to_string())
    }
}

fn split_provider_config(
    form_schema: &[ProviderConfigField],
    input: &Value,
) -> Result<(Value, Value)> {
    let object = input
        .as_object()
        .ok_or(ControlPlaneError::InvalidInput("config_json"))?;
    let mut public = Map::new();
    let mut secret = Map::new();
    let field_lookup = form_schema
        .iter()
        .map(|field| (field.key.as_str(), field))
        .collect::<HashMap<_, _>>();
    for (key, value) in object {
        let field = field_lookup
            .get(key.as_str())
            .ok_or(ControlPlaneError::InvalidInput("config_json"))?;
        if is_secret_field(&field.field_type) {
            secret.insert(key.clone(), value.clone());
        } else {
            public.insert(key.clone(), value.clone());
        }
    }
    Ok((Value::Object(public), Value::Object(secret)))
}

fn validate_required_fields(
    form_schema: &[ProviderConfigField],
    public_config: &Value,
    secret_config: &Value,
) -> Result<()> {
    let public_object = public_config
        .as_object()
        .ok_or(ControlPlaneError::InvalidInput("config_json"))?;
    let secret_object = secret_config
        .as_object()
        .ok_or(ControlPlaneError::InvalidInput("config_json"))?;
    for field in form_schema {
        if !field.required {
            continue;
        }
        let value = if is_secret_field(&field.field_type) {
            secret_object.get(&field.key)
        } else {
            public_object.get(&field.key)
        };
        if value.is_none()
            || value == Some(&Value::Null)
            || value == Some(&Value::String(String::new()))
        {
            return Err(ControlPlaneError::InvalidInput("config_json").into());
        }
    }
    Ok(())
}

fn merge_json_object(base: &Value, patch: &Value) -> Result<Value> {
    let mut merged = base
        .as_object()
        .cloned()
        .ok_or(ControlPlaneError::InvalidInput("config_json"))?;
    let patch_object = patch
        .as_object()
        .ok_or(ControlPlaneError::InvalidInput("config_json"))?;
    for (key, value) in patch_object {
        merged.insert(key.clone(), value.clone());
    }
    Ok(Value::Object(merged))
}

fn empty_object() -> Value {
    Value::Object(Map::new())
}

fn is_empty_object(value: &Value) -> bool {
    value
        .as_object()
        .map(|object| object.is_empty())
        .unwrap_or(false)
}

fn is_secret_field(field_type: &str) -> bool {
    field_type.trim().eq_ignore_ascii_case("secret")
}

fn load_provider_package(path: &str) -> Result<ProviderPackage> {
    ProviderPackage::load_from_dir(path).map_err(map_framework_error)
}

fn model_discovery_mode_string(mode: ModelDiscoveryMode) -> String {
    format!("{mode:?}").to_ascii_lowercase()
}

fn map_model_discovery_mode(mode: ModelDiscoveryMode) -> domain::ModelProviderDiscoveryMode {
    match mode {
        ModelDiscoveryMode::Static => domain::ModelProviderDiscoveryMode::Static,
        ModelDiscoveryMode::Dynamic => domain::ModelProviderDiscoveryMode::Dynamic,
        ModelDiscoveryMode::Hybrid => domain::ModelProviderDiscoveryMode::Hybrid,
    }
}

fn map_catalog_source(mode: ModelDiscoveryMode) -> domain::ModelProviderCatalogSource {
    match mode {
        ModelDiscoveryMode::Static => domain::ModelProviderCatalogSource::Static,
        ModelDiscoveryMode::Dynamic => domain::ModelProviderCatalogSource::Dynamic,
        ModelDiscoveryMode::Hybrid => domain::ModelProviderCatalogSource::Hybrid,
    }
}

fn map_framework_error(error: plugin_framework::error::PluginFrameworkError) -> anyhow::Error {
    use plugin_framework::error::PluginFrameworkErrorKind;

    match error.kind() {
        PluginFrameworkErrorKind::InvalidAssignment
        | PluginFrameworkErrorKind::InvalidProviderPackage
        | PluginFrameworkErrorKind::InvalidProviderContract
        | PluginFrameworkErrorKind::Serialization => {
            ControlPlaneError::InvalidInput("provider_package").into()
        }
        PluginFrameworkErrorKind::Io | PluginFrameworkErrorKind::RuntimeContract => {
            ControlPlaneError::UpstreamUnavailable("provider_runtime").into()
        }
    }
}
