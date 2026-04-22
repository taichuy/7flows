use std::collections::HashMap;

use anyhow::Result;
use plugin_framework::{
    provider_contract::ProviderModelDescriptor,
    provider_package::{ProviderConfigField, ProviderPackage},
};
use serde_json::{json, Value};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    audit::audit_log,
    errors::ControlPlaneError,
    i18n::{I18nCatalog, RequestedLocales},
    plugin_lifecycle::reconcile_installation_snapshot,
    ports::{
        AuthRepository, CreateModelProviderInstanceInput, ModelProviderRepository,
        PluginRepository, ProviderRuntimePort, UpdateModelProviderInstanceInput,
        UpsertModelProviderCatalogCacheInput, UpsertModelProviderSecretInput,
    },
    state_transition::ensure_model_provider_instance_transition,
};

mod catalog;
mod instances;
mod options;
mod shared;

use self::{
    instances::{build_provider_runtime_config, hydrate_instance_view},
    shared::{
        empty_object, ensure_installation_assigned, ensure_state_model_permission, is_empty_object,
        load_actor_context_for_user, load_provider_package, map_catalog_source,
        map_model_discovery_mode, merge_json_object, normalize_required_text,
        split_provider_config, validate_required_fields,
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
    pub plugin_type: String,
    pub namespace: String,
    pub label_key: String,
    pub description_key: Option<String>,
    pub display_name: String,
    pub protocol: String,
    pub help_url: Option<String>,
    pub default_base_url: Option<String>,
    pub model_discovery_mode: String,
    pub supports_model_fetch_without_credentials: bool,
    pub desired_state: String,
    pub availability_status: String,
    pub form_schema: Vec<ProviderConfigField>,
    pub predefined_models: Vec<LocalizedProviderModelDescriptor>,
}

#[derive(Debug, Clone)]
pub struct ModelProviderCatalogView {
    pub entries: Vec<ModelProviderCatalogEntry>,
    pub i18n_catalog: I18nCatalog,
}

#[derive(Debug, Clone)]
pub struct LocalizedProviderModelDescriptor {
    pub descriptor: ProviderModelDescriptor,
    pub namespace: Option<String>,
    pub label_key: Option<String>,
    pub description_key: Option<String>,
    pub display_name_fallback: Option<String>,
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
    pub provider_code: String,
    pub plugin_type: String,
    pub namespace: String,
    pub label_key: String,
    pub description_key: Option<String>,
    pub protocol: String,
    pub display_name: String,
    pub effective_instance_id: Uuid,
    pub effective_instance_display_name: String,
    pub models: Vec<LocalizedProviderModelDescriptor>,
}

#[derive(Debug, Clone)]
pub struct ModelProviderOptionsView {
    pub providers: Vec<ModelProviderOptionEntry>,
    pub i18n_catalog: I18nCatalog,
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
        locales: RequestedLocales,
    ) -> Result<ModelProviderCatalogView> {
        catalog::list_catalog(&self.repository, actor_user_id, locales).await
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
        let mut form_schemas: HashMap<Uuid, Vec<ProviderConfigField>> = HashMap::new();
        let mut output = Vec::with_capacity(instances.len());
        for instance in instances {
            let cache = self.repository.get_catalog_cache(instance.id).await?;
            let form_schema = match form_schemas.get(&instance.installation_id) {
                Some(form_schema) => form_schema.clone(),
                None => {
                    let installation = self
                        .repository
                        .get_installation(instance.installation_id)
                        .await?
                        .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
                    let package = load_provider_package(&installation.installed_path)?;
                    let form_schema = package.provider.form_schema;
                    form_schemas.insert(instance.installation_id, form_schema.clone());
                    form_schema
                }
            };
            output.push(
                self.hydrate_instance_view(instance, cache, &form_schema)
                    .await?,
            );
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
        if matches!(
            installation.desired_state,
            domain::PluginDesiredState::Disabled
        ) {
            return Err(ControlPlaneError::Conflict("plugin_installation_disabled").into());
        }

        let package = load_provider_package(&installation.installed_path)?;
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

        self.hydrate_instance_view(instance, None, &package.provider.form_schema)
            .await
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
        let package = load_provider_package(&installation.installed_path)?;

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

        let next_status = match existing.status {
            domain::ModelProviderInstanceStatus::Disabled => {
                domain::ModelProviderInstanceStatus::Disabled
            }
            _ => domain::ModelProviderInstanceStatus::Draft,
        };
        ensure_model_provider_instance_transition(existing.status, next_status, "update_instance")?;

        let updated = self
            .repository
            .update_instance(&UpdateModelProviderInstanceInput {
                instance_id: existing.id,
                workspace_id: actor.current_workspace_id,
                display_name: normalize_required_text(&command.display_name, "display_name")?,
                status: next_status,
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

        self.hydrate_instance_view(
            updated,
            self.repository.get_catalog_cache(existing.id).await?,
            &package.provider.form_schema,
        )
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
        let installation =
            reconcile_installation_snapshot(&self.repository, instance.installation_id).await?;
        if installation.availability_status != domain::PluginAvailabilityStatus::Available {
            return Err(ControlPlaneError::Conflict("plugin_installation_unavailable").into());
        }
        let package = load_provider_package(&installation.installed_path)?;
        let provider_config = self
            .build_provider_runtime_config(&package, &instance)
            .await?;
        ensure_model_provider_instance_transition(
            instance.status,
            domain::ModelProviderInstanceStatus::Ready,
            "validate_instance_success",
        )?;

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
            ensure_model_provider_instance_transition(
                instance.status,
                domain::ModelProviderInstanceStatus::Ready,
                "validate_instance_success",
            )?;
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
            let masked_view = self
                .hydrate_instance_view(
                    updated_instance,
                    Some(cache.clone()),
                    &package.provider.form_schema,
                )
                .await?;
            Ok::<ValidateModelProviderResult, anyhow::Error>(ValidateModelProviderResult {
                instance: masked_view.instance,
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
                let invalid_transition_allowed = ensure_model_provider_instance_transition(
                    instance.status,
                    domain::ModelProviderInstanceStatus::Invalid,
                    "validate_instance_failure",
                )
                .is_ok();
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
                if invalid_transition_allowed {
                    let _ = self
                        .repository
                        .update_instance(&UpdateModelProviderInstanceInput {
                            instance_id: instance.id,
                            workspace_id: actor.current_workspace_id,
                            display_name: instance.display_name.clone(),
                            status: domain::ModelProviderInstanceStatus::Invalid,
                            config_json: instance.config_json.clone(),
                            last_validated_at: Some(now),
                            last_validation_status: Some(
                                domain::ModelProviderValidationStatus::Failed,
                            ),
                            last_validation_message: Some(error.to_string()),
                            updated_by: actor_user_id,
                        })
                        .await;
                }
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
        options::list_models(&self.repository, actor_user_id, instance_id).await
    }

    pub async fn refresh_models(
        &self,
        actor_user_id: Uuid,
        instance_id: Uuid,
    ) -> Result<ModelProviderModelCatalog> {
        options::refresh_models(
            &self.repository,
            &self.runtime,
            &self.provider_secret_master_key,
            actor_user_id,
            instance_id,
        )
        .await
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

    pub async fn options(
        &self,
        actor_user_id: Uuid,
        locales: RequestedLocales,
    ) -> Result<ModelProviderOptionsView> {
        catalog::options(&self.repository, actor_user_id, locales).await
    }

    pub async fn reveal_secret(
        &self,
        actor_user_id: Uuid,
        instance_id: Uuid,
        key: &str,
    ) -> Result<String> {
        options::reveal_secret(
            &self.repository,
            &self.provider_secret_master_key,
            actor_user_id,
            instance_id,
            key,
        )
        .await
    }

    async fn build_provider_runtime_config(
        &self,
        package: &ProviderPackage,
        instance: &domain::ModelProviderInstanceRecord,
    ) -> Result<Value> {
        build_provider_runtime_config(
            &self.repository,
            &self.provider_secret_master_key,
            package,
            instance,
        )
        .await
    }

    async fn hydrate_instance_view(
        &self,
        instance: domain::ModelProviderInstanceRecord,
        cache: Option<domain::ModelProviderCatalogCacheRecord>,
        form_schema: &[ProviderConfigField],
    ) -> Result<ModelProviderInstanceView> {
        hydrate_instance_view(
            &self.repository,
            &self.provider_secret_master_key,
            instance,
            cache,
            form_schema,
        )
        .await
    }
}
