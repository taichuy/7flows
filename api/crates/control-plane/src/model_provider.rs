use std::collections::{BTreeMap, HashMap, HashSet};

use anyhow::Result;
use plugin_framework::{
    provider_contract::{ModelDiscoveryMode, ProviderModelDescriptor, ProviderModelSource},
    provider_package::{ProviderConfigField, ProviderPackage},
};
use serde_json::{json, Map, Value};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    audit::audit_log,
    errors::ControlPlaneError,
    i18n::{
        merge_i18n_catalog, plugin_namespace, trim_provider_bundles, I18nCatalog, RequestedLocales,
    },
    plugin_lifecycle::reconcile_installation_snapshot,
    ports::{
        AuthRepository, CreateModelProviderInstanceInput,
        CreateModelProviderPreviewSessionInput, ModelProviderRepository, PluginRepository,
        ProviderRuntimePort, UpdateModelProviderInstanceInput,
        UpsertModelProviderCatalogCacheInput, UpsertModelProviderSecretInput,
    },
    state_transition::ensure_model_provider_instance_transition,
};

pub struct CreateModelProviderInstanceCommand {
    pub actor_user_id: Uuid,
    pub installation_id: Uuid,
    pub display_name: String,
    pub config_json: Value,
    pub configured_models: Vec<domain::ModelProviderConfiguredModel>,
    pub enabled_model_ids: Vec<String>,
    pub preview_token: Option<Uuid>,
}

pub struct UpdateModelProviderInstanceCommand {
    pub actor_user_id: Uuid,
    pub instance_id: Uuid,
    pub display_name: String,
    pub config_json: Value,
    pub configured_models: Vec<domain::ModelProviderConfiguredModel>,
    pub enabled_model_ids: Vec<String>,
    pub preview_token: Option<Uuid>,
}

pub type ModelProviderConfiguredModelInput = domain::ModelProviderConfiguredModel;

pub struct DeleteModelProviderInstanceCommand {
    pub actor_user_id: Uuid,
    pub instance_id: Uuid,
}

pub struct PreviewModelProviderModelsCommand {
    pub actor_user_id: Uuid,
    pub installation_id: Option<Uuid>,
    pub instance_id: Option<Uuid>,
    pub config_json: Value,
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
pub struct PreviewModelProviderModelsResult {
    pub models: Vec<ProviderModelDescriptor>,
    pub preview_token: Uuid,
    pub expires_at: OffsetDateTime,
}

struct PreviewStateRequest<'a> {
    installation_id: Option<Uuid>,
    instance_id: Option<Uuid>,
    provider_config: &'a Value,
    preview_token: Option<Uuid>,
}

struct ResolvedPreviewState {
    models_json: Option<Value>,
    refreshed_at: Option<OffsetDateTime>,
    preview_token: Option<Uuid>,
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
        let mut i18n_catalog = BTreeMap::new();
        for installation in installations {
            let installation =
                reconcile_installation_snapshot(&self.repository, installation.id).await?;
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
        let provider_config = merge_json_object(&public_config, &secret_config)?;
        let configured_models =
            normalize_configured_models(command.configured_models, command.enabled_model_ids);
        let enabled_model_ids = configured_models_to_enabled_model_ids(&configured_models);
        let preview_state = self
            .resolve_preview_state(
                &actor,
                PreviewStateRequest {
                    installation_id: Some(installation.id),
                    instance_id: None,
                    provider_config: &provider_config,
                    preview_token: command.preview_token,
                },
            )
            .await?;
        let instance = self
            .repository
            .create_instance(&CreateModelProviderInstanceInput {
                instance_id: Uuid::now_v7(),
                workspace_id: actor.current_workspace_id,
                installation_id: installation.id,
                provider_code: installation.provider_code.clone(),
                protocol: installation.protocol.clone(),
                display_name: normalize_required_text(&command.display_name, "display_name")?,
                status: derive_instance_status(false, &enabled_model_ids),
                config_json: public_config.clone(),
                configured_models: configured_models.clone(),
                enabled_model_ids,
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
        if let Some(models_json) = preview_state.models_json.as_ref() {
            self.repository
                .upsert_catalog_cache(&UpsertModelProviderCatalogCacheInput {
                    provider_instance_id: instance.id,
                    model_discovery_mode: map_model_discovery_mode(
                        package.provider.model_discovery_mode,
                    ),
                    refresh_status: domain::ModelProviderCatalogRefreshStatus::Ready,
                    source: map_catalog_source(package.provider.model_discovery_mode),
                    models_json: models_json.clone(),
                    last_error_message: None,
                    refreshed_at: preview_state.refreshed_at,
                })
                .await?;
        }
        if let Some(preview_token) = preview_state.preview_token {
            self.repository
                .delete_preview_session(actor.current_workspace_id, preview_token)
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

        self.hydrate_instance_view(
            instance.clone(),
            self.repository.get_catalog_cache(instance.id).await?,
            &package.provider.form_schema,
        )
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
        let provider_config = merge_json_object(&merged_public_config, &merged_secret_config)?;
        let configured_models =
            normalize_configured_models(command.configured_models, command.enabled_model_ids);
        let enabled_model_ids = configured_models_to_enabled_model_ids(&configured_models);

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

        let preview_state = self
            .resolve_preview_state(
                &actor,
                PreviewStateRequest {
                    installation_id: Some(installation.id),
                    instance_id: Some(existing.id),
                    provider_config: &provider_config,
                    preview_token: command.preview_token,
                },
            )
            .await?;
        let next_status = derive_instance_status(
            matches!(existing.status, domain::ModelProviderInstanceStatus::Disabled),
            &enabled_model_ids,
        );
        ensure_model_provider_instance_transition(existing.status, next_status, "update_instance")?;

        let updated = self
            .repository
            .update_instance(&UpdateModelProviderInstanceInput {
                instance_id: existing.id,
                workspace_id: actor.current_workspace_id,
                display_name: normalize_required_text(&command.display_name, "display_name")?,
                status: next_status,
                config_json: merged_public_config,
                configured_models: configured_models.clone(),
                enabled_model_ids,
                updated_by: command.actor_user_id,
            })
            .await?;
        if let Some(models_json) = preview_state.models_json.as_ref() {
            self.repository
                .upsert_catalog_cache(&UpsertModelProviderCatalogCacheInput {
                    provider_instance_id: existing.id,
                    model_discovery_mode: map_model_discovery_mode(
                        package.provider.model_discovery_mode,
                    ),
                    refresh_status: domain::ModelProviderCatalogRefreshStatus::Ready,
                    source: map_catalog_source(package.provider.model_discovery_mode),
                    models_json: models_json.clone(),
                    last_error_message: None,
                    refreshed_at: preview_state.refreshed_at,
                })
                .await?;
        }
        if let Some(preview_token) = preview_state.preview_token {
            self.repository
                .delete_preview_session(actor.current_workspace_id, preview_token)
                .await?;
        }
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

    async fn resolve_preview_state(
        &self,
        actor: &domain::ActorContext,
        request: PreviewStateRequest<'_>,
    ) -> Result<ResolvedPreviewState> {
        let Some(preview_token) = request.preview_token else {
            return Ok(ResolvedPreviewState {
                models_json: None,
                refreshed_at: None,
                preview_token: None,
            });
        };

        let session = self
            .repository
            .get_preview_session(actor.current_workspace_id, preview_token)
            .await?
            .ok_or(ControlPlaneError::InvalidInput("preview_token"))?;
        if session.actor_user_id != actor.user_id || session.expires_at < OffsetDateTime::now_utc()
        {
            return Err(ControlPlaneError::InvalidInput("preview_token").into());
        }
        if session.installation_id != request.installation_id || session.instance_id != request.instance_id {
            return Err(ControlPlaneError::InvalidInput("preview_token").into());
        }
        if session.config_fingerprint != fingerprint_provider_config(request.provider_config)? {
            return Err(ControlPlaneError::InvalidInput("preview_token").into());
        }

        let models_json = session.models_json;
        deserialize_models_json(&models_json)?;

        Ok(ResolvedPreviewState {
            models_json: Some(models_json),
            refreshed_at: Some(OffsetDateTime::now_utc()),
            preview_token: Some(preview_token),
        })
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
            let next_status = derive_instance_status(false, &instance.enabled_model_ids);
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
                next_status,
                "validate_instance_success",
            )?;
            let updated_instance = self
                .repository
                .update_instance(&UpdateModelProviderInstanceInput {
                    instance_id: instance.id,
                    workspace_id: actor.current_workspace_id,
                    display_name: instance.display_name.clone(),
                    status: next_status,
                    config_json: instance.config_json.clone(),
                    configured_models: instance.configured_models.clone(),
                    enabled_model_ids: instance.enabled_model_ids.clone(),
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
                            configured_models: instance.configured_models.clone(),
                            enabled_model_ids: instance.enabled_model_ids.clone(),
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

    pub async fn preview_models(
        &self,
        command: PreviewModelProviderModelsCommand,
    ) -> Result<PreviewModelProviderModelsResult> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_state_model_permission(&actor, "manage")?;

        let (
            installation,
            _package,
            provider_config,
            provider_code,
            audit_resource_id,
        ) = match command.instance_id {
            Some(instance_id) => {
                let instance = self
                    .repository
                    .get_instance(actor.current_workspace_id, instance_id)
                    .await?
                    .ok_or(ControlPlaneError::NotFound("model_provider_instance"))?;
                let installation =
                    reconcile_installation_snapshot(&self.repository, instance.installation_id)
                        .await?;
                if installation.availability_status != domain::PluginAvailabilityStatus::Available {
                    return Err(
                        ControlPlaneError::Conflict("plugin_installation_unavailable").into()
                    );
                }
                let package = load_provider_package(&installation.installed_path)?;
                let (patch_public_config, patch_secret_config) =
                    split_provider_config(&package.provider.form_schema, &command.config_json)?;
                let current_secret_json = self
                    .repository
                    .get_secret_json(instance.id, &self.provider_secret_master_key)
                    .await?
                    .unwrap_or_else(empty_object);
                let merged_public_config =
                    merge_json_object(&instance.config_json, &patch_public_config)?;
                let merged_secret_config =
                    merge_json_object(&current_secret_json, &patch_secret_config)?;
                validate_required_fields(
                    &package.provider.form_schema,
                    &merged_public_config,
                    &merged_secret_config,
                )?;
                let provider_config =
                    merge_json_object(&merged_public_config, &merged_secret_config)?;
                (
                    installation,
                    package,
                    provider_config,
                    instance.provider_code,
                    Some(instance.id),
                )
            }
            None => {
                let installation_id = command
                    .installation_id
                    .ok_or(ControlPlaneError::InvalidInput("installation_id"))?;
                let installation = self
                    .repository
                    .get_installation(installation_id)
                    .await?
                    .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
                ensure_installation_assigned(
                    &self.repository,
                    actor.current_workspace_id,
                    installation_id,
                )
                .await?;
                if matches!(
                    installation.desired_state,
                    domain::PluginDesiredState::Disabled
                ) || installation.availability_status != domain::PluginAvailabilityStatus::Available
                {
                    return Err(
                        ControlPlaneError::Conflict("plugin_installation_unavailable").into()
                    );
                }
                let package = load_provider_package(&installation.installed_path)?;
                let (public_config, secret_config) =
                    split_provider_config(&package.provider.form_schema, &command.config_json)?;
                validate_required_fields(
                    &package.provider.form_schema,
                    &public_config,
                    &secret_config,
                )?;
                let provider_config = merge_json_object(&public_config, &secret_config)?;
                (
                    installation.clone(),
                    package,
                    provider_config,
                    installation.provider_code,
                    None,
                )
            }
        };

        self.runtime.ensure_loaded(&installation).await?;
        let models = self
            .runtime
            .list_models(&installation, provider_config.clone())
            .await?;
        let expires_at = OffsetDateTime::now_utc() + time::Duration::minutes(10);
        let preview_token = Uuid::now_v7();
        self.repository
            .create_preview_session(&CreateModelProviderPreviewSessionInput {
                session_id: preview_token,
                workspace_id: actor.current_workspace_id,
                actor_user_id: command.actor_user_id,
                installation_id: Some(installation.id),
                instance_id: audit_resource_id,
                config_fingerprint: fingerprint_provider_config(&provider_config)?,
                models_json: serde_json::to_value(&models)?,
                expires_at,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "model_provider_instance",
                audit_resource_id,
                "model_provider.models_previewed",
                json!({
                    "provider_code": provider_code,
                    "model_count": models.len(),
                }),
            ))
            .await?;
        Ok(PreviewModelProviderModelsResult {
            models,
            preview_token,
            expires_at,
        })
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
        let package = load_provider_package(&installation.installed_path)?;
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
        let installation =
            reconcile_installation_snapshot(&self.repository, instance.installation_id).await?;
        if installation.availability_status != domain::PluginAvailabilityStatus::Available {
            return Err(ControlPlaneError::Conflict("plugin_installation_unavailable").into());
        }
        let package = load_provider_package(&installation.installed_path)?;
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

    pub async fn options(
        &self,
        actor_user_id: Uuid,
        locales: RequestedLocales,
    ) -> Result<ModelProviderOptionsView> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_state_model_permission(&actor, "view")?;
        let instances = self
            .repository
            .list_instances(actor.current_workspace_id)
            .await?;
        let mut installation_map = HashMap::new();
        for installation in self.repository.list_installations().await? {
            let installation =
                reconcile_installation_snapshot(&self.repository, installation.id).await?;
            installation_map.insert(installation.id, installation);
        }

        let mut instances_by_provider = BTreeMap::<String, Vec<domain::ModelProviderInstanceRecord>>::new();
        for instance in instances {
            instances_by_provider
                .entry(instance.provider_code.clone())
                .or_default()
                .push(instance);
        }

        let mut options = Vec::new();
        let mut i18n_catalog = BTreeMap::new();
        for (provider_code, provider_instances) in instances_by_provider {
            let Some(instance) = select_effective_model_provider_instance(&provider_instances) else {
                continue;
            };
            if instance.status != domain::ModelProviderInstanceStatus::Ready {
                continue;
            }
            let Some(installation) = installation_map.get(&instance.installation_id) else {
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
            let models = match self.repository.get_catalog_cache(instance.id).await? {
                Some(cache) => serde_json::from_value(cache.models_json).unwrap_or_default(),
                None => package.predefined_models.clone(),
            };
            options.push(ModelProviderOptionEntry {
                provider_code,
                plugin_type: "model_provider".to_string(),
                namespace: namespace.clone(),
                label_key: "provider.label".to_string(),
                description_key: Some("provider.description".to_string()),
                protocol: instance.protocol.clone(),
                display_name: package.provider.display_name.clone(),
                effective_instance_id: instance.id,
                effective_instance_display_name: instance.display_name.clone(),
                models: models
                    .into_iter()
                    .map(|model| localized_model_descriptor(&namespace, model))
                    .collect(),
            });
        }
        Ok(ModelProviderOptionsView {
            providers: options,
            i18n_catalog,
        })
    }

    pub async fn reveal_secret(
        &self,
        actor_user_id: Uuid,
        instance_id: Uuid,
        key: &str,
    ) -> Result<String> {
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
        let package = load_provider_package(&installation.installed_path)?;
        let field = package
            .provider
            .form_schema
            .iter()
            .find(|field| field.key == key)
            .ok_or(ControlPlaneError::InvalidInput("key"))?;
        if !is_secret_field(&field.field_type) {
            return Err(ControlPlaneError::InvalidInput("key").into());
        }

        let secret_json = self
            .repository
            .get_secret_json(instance.id, &self.provider_secret_master_key)
            .await?
            .unwrap_or_else(empty_object);
        secret_json
            .get(key)
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or(ControlPlaneError::NotFound("model_provider_secret").into())
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
        form_schema: &[ProviderConfigField],
    ) -> Result<ModelProviderInstanceView> {
        let secret_json = self
            .repository
            .get_secret_json(instance.id, &self.provider_secret_master_key)
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

fn normalize_enabled_model_ids(enabled_model_ids: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    let mut seen = HashSet::new();
    for model_id in enabled_model_ids {
        let trimmed = model_id.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }
        normalized.push(trimmed.to_string());
    }
    normalized
}

fn normalize_configured_models(
    configured_models: Vec<domain::ModelProviderConfiguredModel>,
    enabled_model_ids: Vec<String>,
) -> Vec<domain::ModelProviderConfiguredModel> {
    if configured_models.is_empty() {
        return normalize_enabled_model_ids(enabled_model_ids)
            .into_iter()
            .map(|model_id| domain::ModelProviderConfiguredModel {
                model_id,
                enabled: true,
            })
            .collect();
    }

    let mut normalized = Vec::new();
    let mut seen = HashSet::new();
    for configured_model in configured_models {
        let trimmed = configured_model.model_id.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }
        normalized.push(domain::ModelProviderConfiguredModel {
            model_id: trimmed.to_string(),
            enabled: configured_model.enabled,
        });
    }
    normalized
}

fn configured_models_to_enabled_model_ids(
    configured_models: &[domain::ModelProviderConfiguredModel],
) -> Vec<String> {
    configured_models
        .iter()
        .filter(|configured_model| configured_model.enabled)
        .map(|configured_model| configured_model.model_id.clone())
        .collect()
}

fn derive_instance_status(
    disabled_instance: bool,
    enabled_model_ids: &[String],
) -> domain::ModelProviderInstanceStatus {
    if disabled_instance {
        domain::ModelProviderInstanceStatus::Disabled
    } else if enabled_model_ids.is_empty() {
        domain::ModelProviderInstanceStatus::Draft
    } else {
        domain::ModelProviderInstanceStatus::Ready
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

fn mask_secret_config(
    base: &Value,
    secret_json: &Value,
    form_schema: &[ProviderConfigField],
) -> Result<Value> {
    let mut merged = base
        .as_object()
        .cloned()
        .ok_or(ControlPlaneError::InvalidInput("config_json"))?;
    let secret_object = secret_json
        .as_object()
        .ok_or(ControlPlaneError::InvalidInput("config_json"))?;
    for field in form_schema {
        if !is_secret_field(&field.field_type) {
            continue;
        }

        let Some(value) = secret_object.get(&field.key) else {
            continue;
        };
        merged.insert(field.key.clone(), mask_secret_value(value));
    }

    Ok(Value::Object(merged))
}

fn mask_secret_value(value: &Value) -> Value {
    match value {
        Value::String(text) => Value::String(mask_secret_preview(text)),
        Value::Null => Value::Null,
        _ => Value::String("****".to_string()),
    }
}

fn mask_secret_preview(value: &str) -> String {
    let char_count = value.chars().count();
    if char_count <= 8 {
        return "****".to_string();
    }

    let prefix = value.chars().take(4).collect::<String>();
    let suffix = value
        .chars()
        .skip(char_count.saturating_sub(4))
        .collect::<String>();
    format!("{prefix}****{suffix}")
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

fn fingerprint_provider_config(config: &Value) -> Result<String> {
    Ok(serde_json::to_string(&canonicalize_json(config))?)
}

fn canonicalize_json(value: &Value) -> Value {
    match value {
        Value::Object(object) => Value::Object(
            object
                .iter()
                .map(|(key, entry)| (key.clone(), canonicalize_json(entry)))
                .collect::<BTreeMap<_, _>>()
                .into_iter()
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(canonicalize_json).collect()),
        _ => value.clone(),
    }
}

fn deserialize_models_json(models_json: &Value) -> Result<Vec<ProviderModelDescriptor>> {
    Ok(serde_json::from_value(models_json.clone())?)
}

fn load_provider_package(path: &str) -> Result<ProviderPackage> {
    ProviderPackage::load_from_dir(path).map_err(map_framework_error)
}

fn localized_model_descriptor(
    namespace: &str,
    model: ProviderModelDescriptor,
) -> LocalizedProviderModelDescriptor {
    let display_name_fallback = Some(model.display_name.clone());
    match model.source {
        ProviderModelSource::Static => {
            let model_key = model_i18n_key(&model.model_id);
            LocalizedProviderModelDescriptor {
                descriptor: model,
                namespace: Some(namespace.to_string()),
                label_key: Some(format!("models.{model_key}.label")),
                description_key: Some(format!("models.{model_key}.description")),
                display_name_fallback,
            }
        }
        ProviderModelSource::Dynamic => LocalizedProviderModelDescriptor {
            descriptor: model,
            namespace: None,
            label_key: None,
            description_key: None,
            display_name_fallback,
        },
    }
}

fn model_i18n_key(model_id: &str) -> String {
    model_id
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() {
                value.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect()
}

fn model_discovery_mode_string(mode: ModelDiscoveryMode) -> String {
    format!("{mode:?}").to_ascii_lowercase()
}

fn select_effective_model_provider_instance<'a>(
    instances: &'a [domain::ModelProviderInstanceRecord],
) -> Option<&'a domain::ModelProviderInstanceRecord> {
    instances.iter().max_by_key(|instance| {
        (
            instance.status == domain::ModelProviderInstanceStatus::Ready,
            instance.updated_at,
            instance.id,
        )
    })
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
