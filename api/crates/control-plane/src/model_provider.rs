use std::collections::{BTreeMap, HashMap, HashSet};

use anyhow::Result;
use plugin_framework::{
    provider_contract::{PluginFormSchema, ProviderModelDescriptor},
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
        AuthRepository, CreateModelProviderInstanceInput, CreateModelProviderPreviewSessionInput,
        ModelProviderRepository, PluginRepository, ProviderRuntimePort,
        UpdateModelProviderInstanceInput, UpsertModelProviderCatalogCacheInput,
        UpsertModelProviderSecretInput,
    },
    state_transition::ensure_model_provider_instance_transition,
};

mod catalog;
mod instances;
mod main_instance;
mod options;
pub(crate) mod routing;
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
    pub configured_models: Vec<domain::ModelProviderConfiguredModel>,
    pub enabled_model_ids: Vec<String>,
    pub included_in_main: Option<bool>,
    pub preview_token: Option<Uuid>,
}

pub struct UpdateModelProviderInstanceCommand {
    pub actor_user_id: Uuid,
    pub instance_id: Uuid,
    pub display_name: String,
    pub config_json: Value,
    pub configured_models: Vec<domain::ModelProviderConfiguredModel>,
    pub enabled_model_ids: Vec<String>,
    pub included_in_main: bool,
    pub preview_token: Option<Uuid>,
}

pub struct UpdateModelProviderMainInstanceCommand {
    pub actor_user_id: Uuid,
    pub provider_code: String,
    pub auto_include_new_instances: bool,
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
pub struct ModelProviderMainInstanceView {
    pub provider_code: String,
    pub auto_include_new_instances: bool,
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
    pub icon: Option<String>,
    pub parameter_form: Option<PluginFormSchema>,
    pub main_instance: ModelProviderMainInstanceSummary,
    pub model_groups: Vec<ModelProviderOptionGroup>,
}

#[derive(Debug, Clone)]
pub struct ModelProviderMainInstanceSummary {
    pub provider_code: String,
    pub auto_include_new_instances: bool,
    pub group_count: usize,
    pub model_count: usize,
}

#[derive(Debug, Clone)]
pub struct ModelProviderOptionGroup {
    pub source_instance_id: Uuid,
    pub source_instance_display_name: String,
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


[Content truncated by AionUi ACP client. Request a smaller line/limit range to continue.]
