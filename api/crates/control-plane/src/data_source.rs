use std::collections::HashSet;

use anyhow::Result;
use plugin_framework::data_source_contract::{
    DataSourceCatalogEntry, DataSourceConfigInput, DataSourcePreviewReadInput,
    DataSourcePreviewReadOutput,
};
use serde_json::{json, Value};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::{
    audit::audit_log,
    errors::ControlPlaneError,
    ports::{
        AuthRepository, CreateDataSourceInstanceInput, CreateDataSourcePreviewSessionInput,
        DataSourceRepository, DataSourceRuntimePort, PluginRepository,
        UpdateDataSourceInstanceStatusInput, UpsertDataSourceCatalogCacheInput,
        UpsertDataSourceSecretInput,
    },
};

#[derive(Debug, Clone)]
pub struct CreateDataSourceInstanceCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub installation_id: Uuid,
    pub source_code: String,
    pub display_name: String,
    pub config_json: Value,
    pub secret_json: Value,
}

#[derive(Debug, Clone)]
pub struct ValidateDataSourceInstanceCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub instance_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct PreviewDataSourceReadCommand {
    pub actor_user_id: Uuid,
    pub workspace_id: Uuid,
    pub instance_id: Uuid,
    pub resource_key: String,
    pub limit: Option<u32>,
    pub cursor: Option<String>,
    pub options_json: Value,
}

#[derive(Debug, Clone)]
pub struct DataSourceInstanceView {
    pub instance: domain::DataSourceInstanceRecord,
    pub catalog: Option<domain::DataSourceCatalogCacheRecord>,
}

#[derive(Debug, Clone)]
pub struct DataSourceCatalogEntryView {
    pub installation_id: Uuid,
    pub source_code: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub display_name: String,
    pub protocol: String,
}

#[derive(Debug, Clone)]
pub struct ValidateDataSourceInstanceResult {
    pub instance: domain::DataSourceInstanceRecord,
    pub catalog: domain::DataSourceCatalogCacheRecord,
    pub output: Value,
}

#[derive(Debug, Clone)]
pub struct PreviewDataSourceReadResult {
    pub preview_session: domain::DataSourcePreviewSessionRecord,
    pub output: DataSourcePreviewReadOutput,
}

pub struct DataSourceService<R, H> {
    repository: R,
    runtime: H,
}

impl<R, H> DataSourceService<R, H>
where
    R: AuthRepository + PluginRepository + DataSourceRepository,
    H: DataSourceRuntimePort,
{
    pub fn new(repository: R, runtime: H) -> Self {
        Self {
            repository,
            runtime,
        }
    }

    pub async fn list_catalog(
        &self,
        actor_user_id: Uuid,
        workspace_id: Uuid,
    ) -> Result<Vec<DataSourceCatalogEntryView>> {
        let actor = load_actor_context_for_user(&self.repository, actor_user_id).await?;
        ensure_workspace_matches(&actor, workspace_id)?;
        ensure_state_model_permission(&actor, "view")?;

        let assigned_installation_ids = self
            .repository
            .list_assignments(workspace_id)
            .await?
            .into_iter()
            .map(|assignment| assignment.installation_id)
            .collect::<HashSet<_>>();

        let mut entries = self
            .repository
            .list_installations()
            .await?
            .into_iter()
            .filter(|installation| installation.contract_version == "1flowbase.data_source/v1")
            .filter(|installation| assigned_installation_ids.contains(&installation.id))
            .map(|installation| DataSourceCatalogEntryView {
                installation_id: installation.id,
                source_code: installation.provider_code,
                plugin_id: installation.plugin_id,
                plugin_version: installation.plugin_version,
                display_name: installation.display_name,
                protocol: installation.protocol,
            })
            .collect::<Vec<_>>();
        entries.sort_by(|left, right| left.display_name.cmp(&right.display_name));
        Ok(entries)
    }

    pub async fn create_instance(
        &self,
        command: CreateDataSourceInstanceCommand,
    ) -> Result<DataSourceInstanceView> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_workspace_matches(&actor, command.workspace_id)?;
        ensure_state_model_permission(&actor, "manage")?;

        let installation = self
            .repository
            .get_installation(command.installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        ensure_installation_assigned(
            &self.repository,
            command.workspace_id,
            command.installation_id,
        )
        .await?;
        ensure_data_source_installation(&installation, &command.source_code)?;

        let instance = self
            .repository
            .create_instance(&CreateDataSourceInstanceInput {
                instance_id: Uuid::now_v7(),
                workspace_id: command.workspace_id,
                installation_id: command.installation_id,
                source_code: normalize_required_text(&command.source_code, "source_code")?,
                display_name: normalize_required_text(&command.display_name, "display_name")?,
                status: domain::DataSourceInstanceStatus::Draft,
                config_json: ensure_json_object(&command.config_json, "config_json")?,
                metadata_json: json!({}),
                created_by: actor.user_id,
            })
            .await?;

        self.repository
            .upsert_secret(&UpsertDataSourceSecretInput {
                data_source_instance_id: instance.id,
                secret_json: ensure_json_object(&command.secret_json, "secret_json")?,
                secret_version: 1,
            })
            .await?;

        self.repository
            .append_audit_log(&audit_log(
                Some(command.workspace_id),
                Some(actor.user_id),
                "data_source_instance",
                Some(instance.id),
                "data_source.instance_created",
                json!({
                    "installation_id": command.installation_id,
                    "source_code": instance.source_code,
                }),
            ))
            .await?;

        Ok(DataSourceInstanceView {
            instance,
            catalog: None,
        })
    }

    pub async fn validate_instance(
        &self,
        command: ValidateDataSourceInstanceCommand,
    ) -> Result<ValidateDataSourceInstanceResult> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_workspace_matches(&actor, command.workspace_id)?;
        ensure_state_model_permission(&actor, "manage")?;

        let existing = self
            .repository
            .get_instance(command.workspace_id, command.instance_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("data_source_instance"))?;
        let installation = self
            .repository
            .get_installation(existing.installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        ensure_installation_assigned(
            &self.repository,
            command.workspace_id,
            existing.installation_id,
        )
        .await?;

        let secret_json = self
            .repository
            .get_secret_json(existing.id)
            .await?
            .unwrap_or_else(|| json!({}));

        self.runtime.ensure_loaded(&installation).await?;
        let output = self
            .runtime
            .validate_config(
                &installation,
                existing.config_json.clone(),
                secret_json.clone(),
            )
            .await?;
        self.runtime
            .test_connection(
                &installation,
                existing.config_json.clone(),
                secret_json.clone(),
            )
            .await?;
        let catalog_json = self
            .runtime
            .discover_catalog(&installation, existing.config_json.clone(), secret_json)
            .await?;
        let _catalog_entries: Vec<DataSourceCatalogEntry> =
            serde_json::from_value(catalog_json.clone())?;
        let now = OffsetDateTime::now_utc();

        let instance = self
            .repository
            .update_instance_status(&UpdateDataSourceInstanceStatusInput {
                workspace_id: command.workspace_id,
                instance_id: existing.id,
                status: domain::DataSourceInstanceStatus::Ready,
                metadata_json: existing.metadata_json.clone(),
                updated_by: actor.user_id,
            })
            .await?;
        let catalog = self
            .repository
            .upsert_catalog_cache(&UpsertDataSourceCatalogCacheInput {
                data_source_instance_id: instance.id,
                refresh_status: domain::DataSourceCatalogRefreshStatus::Ready,
                catalog_json,
                last_error_message: None,
                refreshed_at: Some(now),
            })
            .await?;

        self.repository
            .append_audit_log(&audit_log(
                Some(command.workspace_id),
                Some(actor.user_id),
                "data_source_instance",
                Some(instance.id),
                "data_source.instance_validated",
                json!({
                    "refresh_status": catalog.refresh_status.as_str(),
                }),
            ))
            .await?;

        Ok(ValidateDataSourceInstanceResult {
            instance,
            catalog,
            output,
        })
    }

    pub async fn preview_read(
        &self,
        command: PreviewDataSourceReadCommand,
    ) -> Result<PreviewDataSourceReadResult> {
        let actor = load_actor_context_for_user(&self.repository, command.actor_user_id).await?;
        ensure_workspace_matches(&actor, command.workspace_id)?;
        ensure_state_model_permission(&actor, "manage")?;

        let instance = self
            .repository
            .get_instance(command.workspace_id, command.instance_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("data_source_instance"))?;
        let installation = self
            .repository
            .get_installation(instance.installation_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("plugin_installation"))?;
        ensure_installation_assigned(
            &self.repository,
            command.workspace_id,
            instance.installation_id,
        )
        .await?;

        let secret_json = self
            .repository
            .get_secret_json(instance.id)
            .await?
            .unwrap_or_else(|| json!({}));
        let preview_input = DataSourcePreviewReadInput {
            connection: DataSourceConfigInput {
                config_json: instance.config_json.clone(),
                secret_json,
            },
            resource_key: normalize_required_text(&command.resource_key, "resource_key")?,
            limit: command.limit,
            cursor: command.cursor,
            options_json: command.options_json,
        };
        let output = self
            .runtime
            .preview_read(&installation, preview_input.clone())
            .await?;
        let preview_json = serde_json::to_value(&output)?;
        let preview_session = self
            .repository
            .create_preview_session(&CreateDataSourcePreviewSessionInput {
                session_id: Uuid::now_v7(),
                workspace_id: command.workspace_id,
                actor_user_id: actor.user_id,
                data_source_instance_id: Some(instance.id),
                config_fingerprint: build_preview_fingerprint(&preview_input)?,
                preview_json,
                expires_at: OffsetDateTime::now_utc() + Duration::minutes(15),
            })
            .await?;

        self.repository
            .append_audit_log(&audit_log(
                Some(command.workspace_id),
                Some(actor.user_id),
                "data_source_instance",
                Some(instance.id),
                "data_source.preview_read",
                json!({
                    "resource_key": preview_input.resource_key,
                }),
            ))
            .await?;

        Ok(PreviewDataSourceReadResult {
            preview_session,
            output,
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

fn ensure_workspace_matches(actor: &domain::ActorContext, workspace_id: Uuid) -> Result<()> {
    if actor.current_workspace_id == workspace_id {
        Ok(())
    } else {
        Err(ControlPlaneError::InvalidInput("workspace_id").into())
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

fn ensure_data_source_installation(
    installation: &domain::PluginInstallationRecord,
    source_code: &str,
) -> Result<()> {
    if installation.contract_version != "1flowbase.data_source/v1" {
        return Err(ControlPlaneError::InvalidInput("plugin_installation").into());
    }
    if installation.provider_code != source_code {
        return Err(ControlPlaneError::InvalidInput("source_code").into());
    }
    Ok(())
}

fn normalize_required_text(value: &str, field: &'static str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(ControlPlaneError::InvalidInput(field).into())
    } else {
        Ok(trimmed.to_string())
    }
}

fn ensure_json_object(value: &Value, field: &'static str) -> Result<Value> {
    if value.is_object() {
        Ok(value.clone())
    } else {
        Err(ControlPlaneError::InvalidInput(field).into())
    }
}

fn build_preview_fingerprint(input: &DataSourcePreviewReadInput) -> Result<String> {
    Ok(serde_json::to_string(input)?)
}
