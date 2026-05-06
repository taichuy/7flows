use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use access_control::ensure_permission;
use anyhow::Result;
use async_trait::async_trait;
use domain::{DataModelScopeKind, ScopeDataModelPermissionProfile};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    audit::audit_log,
    errors::ControlPlaneError,
    ports::{
        AddModelFieldInput, ApiKeyDataModelReadinessRecord, CreateModelDefinitionInput,
        CreateScopeDataModelGrantInput, ModelDefinitionRepository, UpdateModelDefinitionInput,
        UpdateModelDefinitionStatusInput, UpdateModelFieldInput, UpdateScopeDataModelGrantInput,
    },
};

pub struct CreateModelDefinitionCommand {
    pub actor_user_id: Uuid,
    pub scope_kind: DataModelScopeKind,
    pub data_source_instance_id: Option<Uuid>,
    pub external_resource_key: Option<String>,
    pub external_table_id: Option<String>,
    pub code: String,
    pub title: String,
    pub status: Option<domain::DataModelStatus>,
}

pub struct PublishModelCommand {
    pub actor_user_id: Uuid,
    pub model_id: Uuid,
}

pub struct UpdateModelDefinitionCommand {
    pub actor_user_id: Uuid,
    pub model_id: Uuid,
    pub title: String,
    pub external_table_id: Option<String>,
}

pub struct UpdateModelDefinitionStatusCommand {
    pub actor_user_id: Uuid,
    pub model_id: Uuid,
    pub status: domain::DataModelStatus,
    pub api_exposure_status: domain::ApiExposureStatus,
}

pub struct AddModelFieldCommand {
    pub actor_user_id: Uuid,
    pub model_id: Uuid,
    pub code: String,
    pub title: String,
    pub external_field_key: Option<String>,
    pub field_kind: domain::ModelFieldKind,
    pub is_required: bool,
    pub is_unique: bool,
    pub default_value: Option<serde_json::Value>,
    pub display_interface: Option<String>,
    pub display_options: serde_json::Value,
    pub relation_target_model_id: Option<Uuid>,
    pub relation_options: serde_json::Value,
}

pub struct UpdateModelFieldCommand {
    pub actor_user_id: Uuid,
    pub model_id: Uuid,
    pub field_id: Uuid,
    pub title: String,
    pub is_required: bool,
    pub is_unique: bool,
    pub default_value: Option<serde_json::Value>,
    pub display_interface: Option<String>,
    pub display_options: serde_json::Value,
    pub relation_options: serde_json::Value,
}

pub struct DeleteModelDefinitionCommand {
    pub actor_user_id: Uuid,
    pub model_id: Uuid,
    pub confirmed: bool,
}

pub struct DeleteModelFieldCommand {
    pub actor_user_id: Uuid,
    pub model_id: Uuid,
    pub field_id: Uuid,
    pub confirmed: bool,
}

pub struct CreateScopeDataModelGrantCommand {
    pub actor_user_id: Uuid,
    pub scope_kind: DataModelScopeKind,
    pub scope_id: Uuid,
    pub data_model_id: Uuid,
    pub enabled: bool,
    pub permission_profile: String,
    pub confirm_unsafe_external_source_system_all: bool,
}

pub struct UpdateScopeDataModelGrantCommand {
    pub actor_user_id: Uuid,
    pub data_model_id: Uuid,
    pub grant_id: Uuid,
    pub enabled: Option<bool>,
    pub permission_profile: Option<String>,
    pub confirm_unsafe_external_source_system_all: bool,
}

pub struct DeleteScopeDataModelGrantCommand {
    pub actor_user_id: Uuid,
    pub data_model_id: Uuid,
    pub grant_id: Uuid,
}

pub struct PublishedModel {
    pub model: domain::ModelDefinitionRecord,
    pub resource: runtime_core::resource_descriptor::ResourceDescriptor,
}

pub struct ModelDefinitionService<R> {
    repository: R,
}

pub fn runtime_scope_grant_from_record(
    grant: &domain::ScopeDataModelGrantRecord,
) -> runtime_core::runtime_acl::RuntimeScopeGrant {
    runtime_core::runtime_acl::RuntimeScopeGrant {
        data_model_id: grant.data_model_id,
        scope_kind: grant.scope_kind,
        scope_id: grant.scope_id,
        enabled: grant.enabled,
        permission_profile: grant.permission_profile,
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

fn ensure_scope_grant_lifecycle_authorized(
    actor: &domain::ActorContext,
    scope_kind: DataModelScopeKind,
    scope_id: Uuid,
) -> Result<(), ControlPlaneError> {
    if actor.is_root {
        return Ok(());
    }

    if scope_kind == DataModelScopeKind::Workspace && scope_id == actor.current_workspace_id {
        return Ok(());
    }

    Err(ControlPlaneError::PermissionDenied("permission_denied"))
}

fn ensure_protected_model_override_authorized(
    actor: &domain::ActorContext,
    model: &domain::ModelDefinitionRecord,
) -> Result<(), ControlPlaneError> {
    if model.protection.is_protected && !actor.is_root {
        return Err(ControlPlaneError::PermissionDenied("protected_data_model"));
    }

    Ok(())
}

fn ensure_field_mutable(
    model: &domain::ModelDefinitionRecord,
    field_id: Uuid,
) -> Result<(), ControlPlaneError> {
    let field = model
        .fields
        .iter()
        .find(|field| field.id == field_id)
        .ok_or(ControlPlaneError::NotFound("model_field"))?;
    if field.is_system || !field.is_writable {
        return Err(ControlPlaneError::InvalidInput("model_field").into());
    }

    Ok(())
}

impl<R> ModelDefinitionService<R>
where
    R: ModelDefinitionRepository,
{
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn load_runtime_scope_grant(
        &self,
        actor: &domain::ActorContext,
        data_model_id: Uuid,
    ) -> Result<Option<runtime_core::runtime_acl::RuntimeScopeGrant>> {
        let workspace_grants = self
            .repository
            .list_scope_data_model_grants(DataModelScopeKind::Workspace, actor.current_workspace_id)
            .await?;
        if let Some(grant) = workspace_grants
            .iter()
            .find(|grant| grant.data_model_id == data_model_id)
        {
            return Ok(Some(runtime_scope_grant_from_record(grant)));
        }

        if !actor.is_root {
            return Ok(None);
        }

        let system_grants = self
            .repository
            .list_scope_data_model_grants(DataModelScopeKind::System, domain::SYSTEM_SCOPE_ID)
            .await?;
        Ok(system_grants
            .iter()
            .find(|grant| grant.data_model_id == data_model_id)
            .map(runtime_scope_grant_from_record))
    }

    pub async fn load_runtime_scope_grant_for_scope(
        &self,
        scope_kind: DataModelScopeKind,
        scope_id: Uuid,
        data_model_id: Uuid,
    ) -> Result<Option<runtime_core::runtime_acl::RuntimeScopeGrant>> {
        let grants = self
            .repository
            .list_scope_data_model_grants(scope_kind, scope_id)
            .await?;
        Ok(grants
            .iter()
            .find(|grant| grant.data_model_id == data_model_id)
            .map(runtime_scope_grant_from_record))
    }

    pub async fn list_models(
        &self,
        actor_user_id: Uuid,
    ) -> Result<Vec<domain::ModelDefinitionRecord>> {
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "view")?;
        let models = self
            .repository
            .list_model_definitions(actor.current_workspace_id)
            .await?;
        self.with_effective_exposures(models).await
    }

    pub async fn create_model(
        &self,
        command: CreateModelDefinitionCommand,
    ) -> Result<domain::ModelDefinitionRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "state_model.create.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        let grant_scope_id = match command.scope_kind {
            DataModelScopeKind::Workspace => actor.current_workspace_id,
            DataModelScopeKind::System => domain::SYSTEM_SCOPE_ID,
        };
        let source_kind = if command.data_source_instance_id.is_some() {
            domain::DataModelSourceKind::ExternalSource
        } else {
            domain::DataModelSourceKind::MainSource
        };
        let external_resource_key =
            normalize_external_resource_key(source_kind, command.external_resource_key.as_deref())?;
        let external_table_id =
            normalize_external_table_id(source_kind, command.external_table_id.as_deref())?;
        let defaults = match command.data_source_instance_id {
            Some(data_source_instance_id) => {
                self.repository
                    .get_data_source_defaults(actor.current_workspace_id, data_source_instance_id)
                    .await?
            }
            None => domain::DataSourceDefaults::default(),
        };
        let status = command.status.unwrap_or(defaults.data_model_status);
        let api_exposure_status =
            normalize_api_exposure_for_status(status, defaults.api_exposure_status)?;

        let model = self
            .repository
            .create_model_definition(&CreateModelDefinitionInput {
                actor_user_id: command.actor_user_id,
                scope_kind: DataModelScopeKind::System,
                scope_id: domain::SYSTEM_SCOPE_ID,
                data_source_instance_id: command.data_source_instance_id,
                source_kind,
                external_resource_key,
                external_table_id,
                external_capability_snapshot: None,
                code: command.code,
                title: command.title,
                status,
                api_exposure_status,
                protection: domain::DataModelProtection::default(),
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "state_model",
                Some(model.id),
                "state_model.created",
                serde_json::json!({ "code": model.code }),
            ))
            .await?;
        let grant = self
            .repository
            .create_scope_data_model_grant(&CreateScopeDataModelGrantInput {
                grant_id: Uuid::now_v7(),
                scope_kind: command.scope_kind,
                scope_id: grant_scope_id,
                data_model_id: model.id,
                enabled: true,
                permission_profile: domain::ScopeDataModelPermissionProfile::ScopeAll,
                created_by: Some(command.actor_user_id),
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "state_model",
                Some(model.id),
                "state_model.scope_grant_created",
                serde_json::json!({
                    "scope_kind": grant.scope_kind.as_str(),
                    "scope_id": grant.scope_id,
                    "enabled": grant.enabled,
                    "permission_profile": grant.permission_profile.as_str(),
                }),
            ))
            .await?;

        self.with_effective_exposure(model).await
    }

    pub async fn update_model_status(
        &self,
        command: UpdateModelDefinitionStatusCommand,
    ) -> Result<domain::ModelDefinitionRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "manage")?;
        let previous_model = self
            .repository
            .get_model_definition(actor.current_workspace_id, command.model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        ensure_protected_model_override_authorized(&actor, &previous_model)?;
        let previous_effective = self.effective_api_exposure_status(&previous_model).await?;

        let candidate = domain::ModelDefinitionRecord {
            status: command.status,
            api_exposure_status: command.api_exposure_status,
            ..previous_model
        };
        let api_exposure_status = self.normalized_api_exposure_for_status(&candidate).await?;
        let model = self
            .repository
            .update_model_definition_status(&UpdateModelDefinitionStatusInput {
                actor_user_id: command.actor_user_id,
                workspace_id: actor.current_workspace_id,
                model_id: command.model_id,
                status: command.status,
                api_exposure_status,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "state_model",
                Some(command.model_id),
                "state_model.status_updated",
                serde_json::json!({
                    "status": model.status.as_str(),
                    "api_exposure_status": model.api_exposure_status.as_str(),
                }),
            ))
            .await?;
        let model = self.with_effective_exposure(model).await?;
        if previous_effective != model.api_exposure_status {
            self.repository
                .append_audit_log(&audit_log(
                    Some(actor.current_workspace_id),
                    Some(command.actor_user_id),
                    "state_model",
                    Some(command.model_id),
                    "state_model.api_exposure_status_changed",
                    serde_json::json!({
                        "from": previous_effective.as_str(),
                        "to": model.api_exposure_status.as_str(),
                        "status": model.status.as_str(),
                    }),
                ))
                .await?;
        }

        Ok(model)
    }

    pub async fn get_model(
        &self,
        actor_user_id: Uuid,
        model_id: Uuid,
    ) -> Result<domain::ModelDefinitionRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "view")?;

        let model = self
            .repository
            .get_model_definition(actor.current_workspace_id, model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        self.with_effective_exposure(model).await
    }

    pub async fn list_scope_grants(
        &self,
        actor_user_id: Uuid,
        model_id: Uuid,
    ) -> Result<Vec<domain::ScopeDataModelGrantRecord>> {
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "view")?;
        self.repository
            .get_model_definition(actor.current_workspace_id, model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;

        let mut grants = self
            .repository
            .list_scope_data_model_grants(
                domain::DataModelScopeKind::Workspace,
                actor.current_workspace_id,
            )
            .await?;
        grants.extend(
            self.repository
                .list_scope_data_model_grants(
                    domain::DataModelScopeKind::System,
                    domain::SYSTEM_SCOPE_ID,
                )
                .await?,
        );
        grants.retain(|grant| grant.data_model_id == model_id);
        grants.sort_by(|left, right| {
            left.scope_kind
                .as_str()
                .cmp(right.scope_kind.as_str())
                .then(
                    left.permission_profile
                        .as_str()
                        .cmp(right.permission_profile.as_str()),
                )
                .then(left.id.cmp(&right.id))
        });
        Ok(grants)
    }

    pub async fn update_model(
        &self,
        command: UpdateModelDefinitionCommand,
    ) -> Result<domain::ModelDefinitionRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "manage")?;
        let previous_model = self
            .repository
            .get_model_definition(actor.current_workspace_id, command.model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        let external_table_id = normalize_external_table_id(
            previous_model.source_kind,
            command.external_table_id.as_deref(),
        )?;

        let model = self
            .repository
            .update_model_definition(&UpdateModelDefinitionInput {
                actor_user_id: command.actor_user_id,
                model_id: command.model_id,
                title: command.title,
                external_table_id,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "state_model",
                Some(command.model_id),
                "state_model.updated",
                serde_json::json!({ "title": model.title }),
            ))
            .await?;

        self.with_effective_exposure(model).await
    }

    pub async fn add_field(
        &self,
        command: AddModelFieldCommand,
    ) -> Result<domain::ModelFieldRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "manage")?;
        let model = self
            .repository
            .get_model_definition(actor.current_workspace_id, command.model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        let external_field_key =
            normalize_external_field_key(model.source_kind, command.external_field_key.as_deref())?;

        let field = self
            .repository
            .add_model_field(&AddModelFieldInput {
                actor_user_id: command.actor_user_id,
                model_id: command.model_id,
                code: command.code,
                title: command.title,
                physical_column_name: None,
                external_field_key,
                field_kind: command.field_kind,
                is_system: false,
                is_writable: true,
                apply_physical_schema: true,
                is_required: command.is_required,
                is_unique: command.is_unique,
                default_value: command.default_value,
                display_interface: command.display_interface,
                display_options: command.display_options,
                relation_target_model_id: command.relation_target_model_id,
                relation_options: command.relation_options,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "state_model",
                Some(command.model_id),
                "state_model.field_created",
                serde_json::json!({ "field_code": field.code }),
            ))
            .await?;

        Ok(field)
    }

    pub async fn update_field(
        &self,
        command: UpdateModelFieldCommand,
    ) -> Result<domain::ModelFieldRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "manage")?;
        let model = self
            .repository
            .get_model_definition(actor.current_workspace_id, command.model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        ensure_protected_model_override_authorized(&actor, &model)?;
        ensure_field_mutable(&model, command.field_id)?;

        let field = self
            .repository
            .update_model_field(&UpdateModelFieldInput {
                actor_user_id: command.actor_user_id,
                model_id: command.model_id,
                field_id: command.field_id,
                title: command.title,
                is_required: command.is_required,
                is_unique: command.is_unique,
                default_value: command.default_value,
                display_interface: command.display_interface,
                display_options: command.display_options,
                relation_options: command.relation_options,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "state_model",
                Some(command.model_id),
                "state_model.field_updated",
                serde_json::json!({ "field_id": command.field_id }),
            ))
            .await?;

        Ok(field)
    }

    pub async fn delete_model(&self, command: DeleteModelDefinitionCommand) -> Result<()> {
        if !command.confirmed {
            return Err(ControlPlaneError::InvalidInput("confirmation").into());
        }

        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "manage")?;
        let model = self
            .repository
            .get_model_definition(actor.current_workspace_id, command.model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        ensure_protected_model_override_authorized(&actor, &model)?;

        self.repository
            .delete_model_definition(command.actor_user_id, command.model_id)
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "state_model",
                Some(command.model_id),
                "state_model.deleted",
                serde_json::json!({}),
            ))
            .await?;

        Ok(())
    }

    pub async fn delete_field(&self, command: DeleteModelFieldCommand) -> Result<()> {
        if !command.confirmed {
            return Err(ControlPlaneError::InvalidInput("confirmation").into());
        }

        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "manage")?;
        let model = self
            .repository
            .get_model_definition(actor.current_workspace_id, command.model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        ensure_protected_model_override_authorized(&actor, &model)?;
        ensure_field_mutable(&model, command.field_id)?;

        self.repository
            .delete_model_field(command.actor_user_id, command.model_id, command.field_id)
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "state_model",
                Some(command.model_id),
                "state_model.field_deleted",
                serde_json::json!({ "field_id": command.field_id }),
            ))
            .await?;

        Ok(())
    }

    pub async fn publish_model(&self, command: PublishModelCommand) -> Result<PublishedModel> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_permission(&actor, "state_model.manage.all")
            .map_err(ControlPlaneError::PermissionDenied)?;
        let existing = self
            .repository
            .get_model_definition(actor.current_workspace_id, command.model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        ensure_protected_model_override_authorized(&actor, &existing)?;

        let model = self
            .repository
            .publish_model_definition(command.actor_user_id, command.model_id)
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "state_model",
                Some(command.model_id),
                "state_model.published",
                serde_json::json!({}),
            ))
            .await?;

        Ok(PublishedModel {
            resource: runtime_core::resource_descriptor::ResourceDescriptor::runtime_model(
                &model.code,
                model.scope_kind,
            ),
            model,
        })
    }

    pub async fn create_scope_grant(
        &self,
        command: CreateScopeDataModelGrantCommand,
    ) -> Result<domain::ScopeDataModelGrantRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "manage")?;
        let permission_profile =
            domain::ScopeDataModelPermissionProfile::parse(&command.permission_profile)
                .ok_or(ControlPlaneError::InvalidInput("permission_profile"))?;
        let model = self
            .repository
            .get_model_definition(actor.current_workspace_id, command.data_model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        ensure_scope_grant_lifecycle_authorized(&actor, command.scope_kind, command.scope_id)?;
        ensure_unsafe_external_system_all_confirmed(
            &model,
            permission_profile,
            command.confirm_unsafe_external_source_system_all,
        )?;

        let grant = self
            .repository
            .create_scope_data_model_grant(&CreateScopeDataModelGrantInput {
                grant_id: Uuid::now_v7(),
                scope_kind: command.scope_kind,
                scope_id: command.scope_id,
                data_model_id: command.data_model_id,
                enabled: command.enabled,
                permission_profile,
                created_by: Some(command.actor_user_id),
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "state_model",
                Some(command.data_model_id),
                "state_model.scope_grant_created",
                serde_json::json!({
                    "scope_kind": grant.scope_kind.as_str(),
                    "scope_id": grant.scope_id,
                    "enabled": grant.enabled,
                    "permission_profile": grant.permission_profile.as_str(),
                }),
            ))
            .await?;

        Ok(grant)
    }

    pub async fn update_scope_grant(
        &self,
        command: UpdateScopeDataModelGrantCommand,
    ) -> Result<domain::ScopeDataModelGrantRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "manage")?;
        let model = self
            .repository
            .get_model_definition(actor.current_workspace_id, command.data_model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;

        let existing = self
            .repository
            .get_scope_data_model_grant(command.data_model_id, command.grant_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("scope_data_model_grant"))?;
        ensure_scope_grant_lifecycle_authorized(&actor, existing.scope_kind, existing.scope_id)?;
        let permission_profile = match command.permission_profile {
            Some(permission_profile) => {
                domain::ScopeDataModelPermissionProfile::parse(&permission_profile)
                    .ok_or(ControlPlaneError::InvalidInput("permission_profile"))?
            }
            None => existing.permission_profile,
        };
        let enabled = command.enabled.unwrap_or(existing.enabled);
        ensure_unsafe_external_system_all_confirmed(
            &model,
            permission_profile,
            command.confirm_unsafe_external_source_system_all,
        )?;

        let grant = self
            .repository
            .update_scope_data_model_grant(&UpdateScopeDataModelGrantInput {
                data_model_id: command.data_model_id,
                grant_id: command.grant_id,
                enabled,
                permission_profile,
            })
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "state_model",
                Some(command.data_model_id),
                "state_model.scope_grant_updated",
                serde_json::json!({
                    "scope_kind": grant.scope_kind.as_str(),
                    "scope_id": grant.scope_id,
                    "enabled": grant.enabled,
                    "permission_profile": grant.permission_profile.as_str(),
                }),
            ))
            .await?;

        Ok(grant)
    }

    pub async fn delete_scope_grant(
        &self,
        command: DeleteScopeDataModelGrantCommand,
    ) -> Result<domain::ScopeDataModelGrantRecord> {
        let actor = self
            .repository
            .load_actor_context_for_user(command.actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "manage")?;
        self.repository
            .get_model_definition(actor.current_workspace_id, command.data_model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        let existing = self
            .repository
            .get_scope_data_model_grant(command.data_model_id, command.grant_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("scope_data_model_grant"))?;
        ensure_scope_grant_lifecycle_authorized(&actor, existing.scope_kind, existing.scope_id)?;

        let grant = self
            .repository
            .delete_scope_data_model_grant(command.data_model_id, command.grant_id)
            .await?;
        self.repository
            .append_audit_log(&audit_log(
                Some(actor.current_workspace_id),
                Some(command.actor_user_id),
                "state_model",
                Some(command.data_model_id),
                "state_model.scope_grant_deleted",
                serde_json::json!({
                    "grant_id": grant.id,
                    "scope_kind": grant.scope_kind.as_str(),
                    "scope_id": grant.scope_id,
                    "enabled": grant.enabled,
                    "permission_profile": grant.permission_profile.as_str(),
                }),
            ))
            .await?;

        Ok(grant)
    }

    pub async fn advisor_findings(
        &self,
        actor_user_id: Uuid,
        model_id: Uuid,
    ) -> Result<Vec<domain::DataModelAdvisorFinding>> {
        let actor = self
            .repository
            .load_actor_context_for_user(actor_user_id)
            .await?;
        ensure_state_model_permission(&actor, "view")?;
        let model = self
            .repository
            .get_model_definition(actor.current_workspace_id, model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        let effective = self.with_effective_exposure(model.clone()).await?;
        let facts = self.api_exposure_advisor_facts(&model).await?;
        let mut findings = Vec::new();

        if effective.status == domain::DataModelStatus::Published
            && effective.api_exposure_status == domain::ApiExposureStatus::PublishedNotExposed
            && !facts.has_active_api_key
        {
            findings.push(advisor_finding(
                model.id,
                domain::DataModelAdvisorSeverity::Info,
                "published_not_exposed",
                "The Data Model is published but not exposed through API keys.",
                "Create an API key permission path only when external API access is intended.",
                true,
            ));
        }

        if effective.api_exposure_status == domain::ApiExposureStatus::ApiExposedNoPermission
            || (facts.has_active_api_key && !facts.has_ready_path)
        {
            findings.push(advisor_finding(
                model.id,
                domain::DataModelAdvisorSeverity::High,
                "api_exposed_no_permission",
                "An API exposure path exists but does not have complete runtime permissions.",
                "Check API key action permissions, scope grants, scope filters, and audit readiness.",
                false,
            ));
        }

        if external_source_is_unsafe(&model) {
            findings.push(advisor_finding(
                model.id,
                domain::DataModelAdvisorSeverity::Blocking,
                "unsafe_external_source",
                "The external source lacks required scope filtering safety guarantees.",
                "Enable scope filtering in the data source capability before exposing this Data Model.",
                false,
            ));
        }

        if facts.has_write_permission && !facts.audit_configured {
            findings.push(advisor_finding(
                model.id,
                domain::DataModelAdvisorSeverity::High,
                "missing_audit_for_write_api",
                "Write API permissions require an audit namespace.",
                "Configure audit logging before enabling create, update, or delete API access.",
                false,
            ));
        }

        if facts.has_action_permission && !facts.has_usable_scope_filter {
            findings.push(advisor_finding(
                model.id,
                domain::DataModelAdvisorSeverity::Blocking,
                "missing_scope_filter",
                "API access has actions but no usable scope grant for runtime filtering.",
                "Create an enabled owner or scope_all grant for the API key scope.",
                false,
            ));
        }

        if model.protection.is_protected
            && (model.api_exposure_status != domain::ApiExposureStatus::PublishedNotExposed
                || facts.has_active_api_key)
        {
            findings.push(advisor_finding(
                model.id,
                domain::DataModelAdvisorSeverity::Blocking,
                "protected_model_exposure_attempt",
                "Protected Data Models cannot be exposed by normal admin API configuration.",
                "Use root emergency override only for audited operational recovery.",
                false,
            ));
        }

        if has_duplicate_or_risky_field_configuration(&model.fields) {
            findings.push(advisor_finding(
                model.id,
                domain::DataModelAdvisorSeverity::Medium,
                "duplicate_risky_field_configuration",
                "Fields contain duplicate external identifiers or risky uniqueness settings.",
                "Review duplicate field codes, duplicate external keys, and unique JSON fields.",
                true,
            ));
        }

        Ok(findings)
    }

    async fn with_effective_exposures(
        &self,
        models: Vec<domain::ModelDefinitionRecord>,
    ) -> Result<Vec<domain::ModelDefinitionRecord>> {
        let mut effective_models = Vec::with_capacity(models.len());
        for model in models {
            effective_models.push(self.with_effective_exposure(model).await?);
        }
        Ok(effective_models)
    }

    async fn with_effective_exposure(
        &self,
        mut model: domain::ModelDefinitionRecord,
    ) -> Result<domain::ModelDefinitionRecord> {
        model.api_exposure_status = self.effective_api_exposure_status(&model).await?;
        Ok(model)
    }

    async fn normalized_api_exposure_for_status(
        &self,
        model: &domain::ModelDefinitionRecord,
    ) -> Result<domain::ApiExposureStatus> {
        if model.status == domain::DataModelStatus::Draft {
            return Ok(domain::ApiExposureStatus::Draft);
        }
        let effective = self.effective_api_exposure_status(model).await?;
        if model.api_exposure_status == domain::ApiExposureStatus::ApiExposedReady {
            return Ok(effective);
        }
        normalize_api_exposure_for_status(model.status, model.api_exposure_status)
    }

    async fn effective_api_exposure_status(
        &self,
        model: &domain::ModelDefinitionRecord,
    ) -> Result<domain::ApiExposureStatus> {
        match model.status {
            domain::DataModelStatus::Draft => return Ok(domain::ApiExposureStatus::Draft),
            domain::DataModelStatus::Disabled | domain::DataModelStatus::Broken => {
                return Ok(match model.api_exposure_status {
                    domain::ApiExposureStatus::Draft
                    | domain::ApiExposureStatus::ApiExposedReady => {
                        domain::ApiExposureStatus::ApiExposedNoPermission
                    }
                    exposure => exposure,
                });
            }
            domain::DataModelStatus::Published => {}
        }

        if external_source_is_unsafe(model) {
            return Ok(domain::ApiExposureStatus::UnsafeExternalSource);
        }
        let readiness = self.api_exposure_readiness(model).await?;
        if !readiness.has_active_api_key {
            return Ok(domain::ApiExposureStatus::PublishedNotExposed);
        }
        if readiness.has_ready_path {
            return Ok(domain::ApiExposureStatus::ApiExposedReady);
        }
        Ok(domain::ApiExposureStatus::ApiExposedNoPermission)
    }

    async fn api_exposure_readiness(
        &self,
        model: &domain::ModelDefinitionRecord,
    ) -> Result<ApiExposureReadinessFacts> {
        let facts = self.api_exposure_advisor_facts(model).await?;
        Ok(ApiExposureReadinessFacts {
            has_active_api_key: facts.has_active_api_key,
            has_ready_path: facts.has_ready_path,
        })
    }

    async fn api_exposure_advisor_facts(
        &self,
        model: &domain::ModelDefinitionRecord,
    ) -> Result<ApiExposureAdvisorFacts> {
        let api_key_facts = self
            .repository
            .list_api_key_data_model_readiness(model.id)
            .await?;
        let active_api_key_facts = api_key_facts
            .into_iter()
            .filter(active_api_key_readiness)
            .collect::<Vec<_>>();
        let has_active_api_key = !active_api_key_facts.is_empty();
        let audit_configured = !model.audit_namespace.trim().is_empty();

        let mut has_ready_path = false;
        let mut has_action_permission = false;
        let mut has_write_permission = false;
        let mut has_usable_scope_filter = false;
        for key_fact in active_api_key_facts {
            if !key_fact.has_any_action_permission() {
                continue;
            }
            has_action_permission = true;
            has_write_permission |=
                key_fact.allow_create || key_fact.allow_update || key_fact.allow_delete;
            let grants = self
                .repository
                .list_scope_data_model_grants(key_fact.scope_kind, key_fact.scope_id)
                .await?;
            let has_scope_filter = grants.iter().any(|grant| {
                grant.data_model_id == model.id
                    && grant.enabled
                    && api_key_runtime_can_use_grant_profile(grant.permission_profile)
            });
            has_usable_scope_filter |= has_scope_filter;
            if has_scope_filter && audit_configured {
                has_ready_path = true;
                break;
            }
        }

        Ok(ApiExposureAdvisorFacts {
            has_active_api_key,
            has_ready_path,
            has_action_permission,
            has_write_permission,
            has_usable_scope_filter,
            audit_configured,
        })
    }
}

struct ApiExposureReadinessFacts {
    has_active_api_key: bool,
    has_ready_path: bool,
}

struct ApiExposureAdvisorFacts {
    has_active_api_key: bool,
    has_ready_path: bool,
    has_action_permission: bool,
    has_write_permission: bool,
    has_usable_scope_filter: bool,
    audit_configured: bool,
}

fn advisor_finding(
    data_model_id: Uuid,
    severity: domain::DataModelAdvisorSeverity,
    code: &'static str,
    message: &'static str,
    recommended_action: &'static str,
    can_acknowledge: bool,
) -> domain::DataModelAdvisorFinding {
    domain::DataModelAdvisorFinding {
        id: format!("{data_model_id}:{code}"),
        data_model_id,
        severity,
        code: code.to_string(),
        message: message.to_string(),
        recommended_action: recommended_action.to_string(),
        can_acknowledge,
    }
}

fn has_duplicate_or_risky_field_configuration(fields: &[domain::ModelFieldRecord]) -> bool {
    let mut codes = std::collections::HashSet::new();
    let mut external_keys = std::collections::HashSet::new();

    for field in fields {
        if !codes.insert(field.code.as_str()) {
            return true;
        }
        if let Some(external_key) = field.external_field_key.as_deref() {
            if !external_keys.insert(external_key) {
                return true;
            }
        }
        if field.is_unique && field.field_kind == domain::ModelFieldKind::Json {
            return true;
        }
    }

    false
}

fn active_api_key_readiness(readiness: &ApiKeyDataModelReadinessRecord) -> bool {
    readiness.key_enabled
        && readiness
            .expires_at
            .is_none_or(|expires_at| expires_at > OffsetDateTime::now_utc())
}

fn api_key_runtime_can_use_grant_profile(
    permission_profile: ScopeDataModelPermissionProfile,
) -> bool {
    match permission_profile {
        ScopeDataModelPermissionProfile::Owner | ScopeDataModelPermissionProfile::ScopeAll => true,
        ScopeDataModelPermissionProfile::SystemAll => false,
    }
}

fn external_source_is_unsafe(model: &domain::ModelDefinitionRecord) -> bool {
    if model.source_kind != domain::DataModelSourceKind::ExternalSource {
        return false;
    }

    let Some(snapshot) = &model.external_capability_snapshot else {
        return true;
    };

    !snapshot
        .get("supports_scope_filter")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

fn ensure_unsafe_external_system_all_confirmed(
    model: &domain::ModelDefinitionRecord,
    permission_profile: ScopeDataModelPermissionProfile,
    confirmed: bool,
) -> Result<(), ControlPlaneError> {
    if permission_profile == ScopeDataModelPermissionProfile::SystemAll
        && external_source_is_unsafe(model)
        && !confirmed
    {
        return Err(ControlPlaneError::InvalidInput("confirmation"));
    }

    Ok(())
}

fn normalize_external_resource_key(
    source_kind: domain::DataModelSourceKind,
    value: Option<&str>,
) -> Result<Option<String>, ControlPlaneError> {
    match source_kind {
        domain::DataModelSourceKind::ExternalSource => value
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| Ok(Some(value.to_string())))
            .unwrap_or_else(|| Err(ControlPlaneError::InvalidInput("external_resource_key"))),
        domain::DataModelSourceKind::MainSource => {
            if value.map(str::trim).is_some_and(|value| !value.is_empty()) {
                Err(ControlPlaneError::InvalidInput("external_resource_key"))
            } else {
                Ok(None)
            }
        }
    }
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn normalize_external_table_id(
    source_kind: domain::DataModelSourceKind,
    value: Option<&str>,
) -> Result<Option<String>, ControlPlaneError> {
    match source_kind {
        domain::DataModelSourceKind::ExternalSource => Ok(normalize_optional_text(value)),
        domain::DataModelSourceKind::MainSource => match normalize_optional_text(value) {
            Some(_) => Err(ControlPlaneError::InvalidInput("external_table_id")),
            None => Ok(None),
        },
    }
}

fn normalize_external_field_key(
    source_kind: domain::DataModelSourceKind,
    value: Option<&str>,
) -> Result<Option<String>, ControlPlaneError> {
    match source_kind {
        domain::DataModelSourceKind::ExternalSource => value
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| Ok(Some(value.to_string())))
            .unwrap_or_else(|| Err(ControlPlaneError::InvalidInput("external_field_key"))),
        domain::DataModelSourceKind::MainSource => {
            if value.map(str::trim).is_some_and(|value| !value.is_empty()) {
                Err(ControlPlaneError::InvalidInput("external_field_key"))
            } else {
                Ok(None)
            }
        }
    }
}

#[derive(Default, Clone)]
pub struct InMemoryModelDefinitionRepository {
    models: Arc<Mutex<HashMap<Uuid, domain::ModelDefinitionRecord>>>,
    data_source_defaults: Arc<Mutex<HashMap<(Uuid, Uuid), domain::DataSourceDefaults>>>,
    grants: Arc<Mutex<Vec<domain::ScopeDataModelGrantRecord>>>,
    api_key_readiness: Arc<Mutex<Vec<ApiKeyDataModelReadinessRecord>>>,
    audit_logs: Arc<Mutex<Vec<domain::AuditLogRecord>>>,
}

impl InMemoryModelDefinitionRepository {
    pub fn with_data_source_defaults(
        data_source_instance_id: Uuid,
        defaults: domain::DataSourceDefaults,
    ) -> Self {
        Self {
            models: Arc::default(),
            data_source_defaults: Arc::new(Mutex::new(HashMap::from([(
                (Uuid::nil(), data_source_instance_id),
                defaults,
            )]))),
            grants: Arc::default(),
            api_key_readiness: Arc::default(),
            audit_logs: Arc::default(),
        }
    }

    pub fn add_api_key_readiness(&self, readiness: ApiKeyDataModelReadinessRecord) {
        self.api_key_readiness
            .lock()
            .expect("in-memory api key readiness lock poisoned")
            .push(readiness);
    }

    pub fn replace_grant_permission_profile_for_tests(
        &self,
        data_model_id: Uuid,
        permission_profile: domain::ScopeDataModelPermissionProfile,
    ) {
        let mut grants = self.grants.lock().expect("in-memory grant lock poisoned");
        for grant in grants
            .iter_mut()
            .filter(|grant| grant.data_model_id == data_model_id)
        {
            grant.permission_profile = permission_profile;
        }
    }

    pub fn audit_events(&self) -> Vec<String> {
        self.audit_logs
            .lock()
            .expect("in-memory audit log lock poisoned")
            .iter()
            .map(|event| event.event_code.clone())
            .collect()
    }

    fn upsert_placeholder(&self, model_id: Uuid) -> domain::ModelDefinitionRecord {
        let mut models = self.models.lock().expect("in-memory model lock poisoned");
        let entry = models
            .entry(model_id)
            .or_insert_with(|| domain::ModelDefinitionRecord {
                id: model_id,
                scope_kind: DataModelScopeKind::Workspace,
                scope_id: Uuid::nil(),
                code: if model_id.is_nil() {
                    "nil".to_string()
                } else {
                    format!("model_{}", model_id.simple())
                },
                title: "Runtime Model".to_string(),
                physical_table_name: format!("rtm_workspace_00000000_{}", model_id.simple()),
                acl_namespace: "state_model.runtime_model".to_string(),
                audit_namespace: "audit.state_model.runtime_model".to_string(),
                fields: vec![],
                availability_status: domain::MetadataAvailabilityStatus::Available,
                data_source_instance_id: None,
                source_kind: domain::DataModelSourceKind::MainSource,
                external_resource_key: None,
                external_table_id: None,
                external_capability_snapshot: None,
                status: domain::DataModelStatus::Published,
                api_exposure_status: domain::ApiExposureStatus::PublishedNotExposed,
                protection: domain::DataModelProtection::default(),
            });
        entry.clone()
    }
}

#[async_trait]
impl ModelDefinitionRepository for InMemoryModelDefinitionRepository {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> Result<domain::ActorContext> {
        Ok(domain::ActorContext::root(
            actor_user_id,
            Uuid::nil(),
            "root",
        ))
    }

    async fn list_model_definitions(
        &self,
        _workspace_id: Uuid,
    ) -> Result<Vec<domain::ModelDefinitionRecord>> {
        let models = self.models.lock().expect("in-memory model lock poisoned");
        Ok(models.values().cloned().collect())
    }

    async fn get_model_definition(
        &self,
        workspace_id: Uuid,
        model_id: Uuid,
    ) -> Result<Option<domain::ModelDefinitionRecord>> {
        let models = self.models.lock().expect("in-memory model lock poisoned");
        Ok(models
            .get(&model_id)
            .filter(|model| {
                workspace_id.is_nil()
                    || !matches!(model.scope_kind, DataModelScopeKind::Workspace)
                    || model.scope_id == workspace_id
            })
            .cloned())
    }

    async fn get_data_source_defaults(
        &self,
        workspace_id: Uuid,
        data_source_instance_id: Uuid,
    ) -> Result<domain::DataSourceDefaults> {
        self.data_source_defaults
            .lock()
            .expect("in-memory data source defaults lock poisoned")
            .get(&(workspace_id, data_source_instance_id))
            .copied()
            .ok_or_else(|| ControlPlaneError::NotFound("data_source_instance").into())
    }

    async fn create_model_definition(
        &self,
        input: &CreateModelDefinitionInput,
    ) -> Result<domain::ModelDefinitionRecord> {
        let model = domain::ModelDefinitionRecord {
            id: Uuid::now_v7(),
            scope_kind: input.scope_kind,
            scope_id: input.scope_id,
            data_source_instance_id: input.data_source_instance_id,
            source_kind: input.source_kind,
            external_resource_key: input.external_resource_key.clone(),
            external_table_id: input.external_table_id.clone(),
            external_capability_snapshot: input.external_capability_snapshot.clone(),
            code: input.code.clone(),
            title: input.title.clone(),
            physical_table_name: build_physical_table_name(input.scope_kind, &input.code),
            acl_namespace: format!("state_model.{}", input.code),
            audit_namespace: format!("audit.state_model.{}", input.code),
            fields: vec![],
            availability_status: domain::MetadataAvailabilityStatus::Available,
            status: input.status,
            api_exposure_status: input.api_exposure_status,
            protection: input.protection.clone(),
        };
        self.models
            .lock()
            .expect("in-memory model lock poisoned")
            .insert(model.id, model.clone());
        Ok(model)
    }

    async fn update_model_definition(
        &self,
        input: &UpdateModelDefinitionInput,
    ) -> Result<domain::ModelDefinitionRecord> {
        let mut models = self.models.lock().expect("in-memory model lock poisoned");
        let model = models
            .get_mut(&input.model_id)
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        model.title = input.title.clone();
        model.external_table_id = input.external_table_id.clone();
        Ok(model.clone())
    }

    async fn update_model_definition_status(
        &self,
        input: &UpdateModelDefinitionStatusInput,
    ) -> Result<domain::ModelDefinitionRecord> {
        let mut models = self.models.lock().expect("in-memory model lock poisoned");
        let model = models
            .get_mut(&input.model_id)
            .filter(|model| {
                input.workspace_id.is_nil()
                    || !matches!(model.scope_kind, DataModelScopeKind::Workspace)
                    || model.scope_id == input.workspace_id
            })
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        model.status = input.status;
        model.api_exposure_status = input.api_exposure_status;
        Ok(model.clone())
    }

    async fn add_model_field(
        &self,
        input: &AddModelFieldInput,
    ) -> Result<domain::ModelFieldRecord> {
        let mut models = self.models.lock().expect("in-memory model lock poisoned");
        let model = models
            .get_mut(&input.model_id)
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        let field = domain::ModelFieldRecord {
            id: Uuid::now_v7(),
            data_model_id: input.model_id,
            code: input.code.clone(),
            title: input.title.clone(),
            physical_column_name: input
                .physical_column_name
                .clone()
                .unwrap_or_else(|| build_physical_column_name(&input.code)),
            external_field_key: input.external_field_key.clone(),
            field_kind: input.field_kind,
            is_system: input.is_system,
            is_writable: input.is_writable,
            is_required: input.is_required,
            is_unique: input.is_unique,
            default_value: input.default_value.clone(),
            display_interface: input.display_interface.clone(),
            display_options: input.display_options.clone(),
            relation_target_model_id: input.relation_target_model_id,
            relation_options: input.relation_options.clone(),
            sort_order: model.fields.len() as i32,
            availability_status: domain::MetadataAvailabilityStatus::Available,
        };
        model.fields.push(field.clone());
        Ok(field)
    }

    async fn update_model_field(
        &self,
        input: &UpdateModelFieldInput,
    ) -> Result<domain::ModelFieldRecord> {
        let mut models = self.models.lock().expect("in-memory model lock poisoned");
        let model = models
            .get_mut(&input.model_id)
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        let field = model
            .fields
            .iter_mut()
            .find(|field| field.id == input.field_id)
            .ok_or(ControlPlaneError::NotFound("model_field"))?;
        field.title = input.title.clone();
        field.is_required = input.is_required;
        field.is_unique = input.is_unique;
        field.default_value = input.default_value.clone();
        field.display_interface = input.display_interface.clone();
        field.display_options = input.display_options.clone();
        field.relation_options = input.relation_options.clone();

        Ok(field.clone())
    }

    async fn delete_model_definition(&self, _actor_user_id: Uuid, model_id: Uuid) -> Result<()> {
        let removed = self
            .models
            .lock()
            .expect("in-memory model lock poisoned")
            .remove(&model_id);
        if removed.is_some() {
            Ok(())
        } else {
            Err(ControlPlaneError::NotFound("model_definition").into())
        }
    }

    async fn delete_model_field(
        &self,
        _actor_user_id: Uuid,
        model_id: Uuid,
        field_id: Uuid,
    ) -> Result<()> {
        let mut models = self.models.lock().expect("in-memory model lock poisoned");
        let model = models
            .get_mut(&model_id)
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        let original_len = model.fields.len();
        model.fields.retain(|field| field.id != field_id);
        if model.fields.len() == original_len {
            Err(ControlPlaneError::NotFound("model_field").into())
        } else {
            Ok(())
        }
    }

    async fn publish_model_definition(
        &self,
        _actor_user_id: Uuid,
        model_id: Uuid,
    ) -> Result<domain::ModelDefinitionRecord> {
        Ok(self.upsert_placeholder(model_id))
    }

    async fn create_scope_data_model_grant(
        &self,
        input: &CreateScopeDataModelGrantInput,
    ) -> Result<domain::ScopeDataModelGrantRecord> {
        self.models
            .lock()
            .expect("in-memory model lock poisoned")
            .get(&input.data_model_id)
            .filter(|model| matches!(model.scope_kind, DataModelScopeKind::System))
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;

        let grant = domain::ScopeDataModelGrantRecord {
            id: input.grant_id,
            scope_kind: input.scope_kind,
            scope_id: input.scope_id,
            data_model_id: input.data_model_id,
            enabled: input.enabled,
            permission_profile: input.permission_profile,
            created_by: input.created_by,
            created_at: time::OffsetDateTime::now_utc(),
            updated_at: time::OffsetDateTime::now_utc(),
        };
        self.grants
            .lock()
            .expect("in-memory grant lock poisoned")
            .push(grant.clone());
        Ok(grant)
    }

    async fn update_scope_data_model_grant(
        &self,
        input: &UpdateScopeDataModelGrantInput,
    ) -> Result<domain::ScopeDataModelGrantRecord> {
        self.models
            .lock()
            .expect("in-memory model lock poisoned")
            .get(&input.data_model_id)
            .filter(|model| matches!(model.scope_kind, DataModelScopeKind::System))
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;

        let mut grants = self.grants.lock().expect("in-memory grant lock poisoned");
        let grant = grants
            .iter_mut()
            .find(|grant| grant.id == input.grant_id && grant.data_model_id == input.data_model_id)
            .ok_or(ControlPlaneError::NotFound("scope_data_model_grant"))?;
        grant.enabled = input.enabled;
        grant.permission_profile = input.permission_profile;
        grant.updated_at = time::OffsetDateTime::now_utc();
        Ok(grant.clone())
    }

    async fn get_scope_data_model_grant(
        &self,
        data_model_id: Uuid,
        grant_id: Uuid,
    ) -> Result<Option<domain::ScopeDataModelGrantRecord>> {
        Ok(self
            .grants
            .lock()
            .expect("in-memory grant lock poisoned")
            .iter()
            .find(|grant| grant.id == grant_id && grant.data_model_id == data_model_id)
            .cloned())
    }

    async fn delete_scope_data_model_grant(
        &self,
        data_model_id: Uuid,
        grant_id: Uuid,
    ) -> Result<domain::ScopeDataModelGrantRecord> {
        let mut grants = self.grants.lock().expect("in-memory grant lock poisoned");
        let index = grants
            .iter()
            .position(|grant| grant.id == grant_id && grant.data_model_id == data_model_id)
            .ok_or(ControlPlaneError::NotFound("scope_data_model_grant"))?;
        Ok(grants.remove(index))
    }

    async fn list_scope_data_model_grants(
        &self,
        scope_kind: DataModelScopeKind,
        scope_id: Uuid,
    ) -> Result<Vec<domain::ScopeDataModelGrantRecord>> {
        Ok(self
            .grants
            .lock()
            .expect("in-memory grant lock poisoned")
            .iter()
            .filter(|grant| grant.scope_kind == scope_kind && grant.scope_id == scope_id)
            .cloned()
            .collect())
    }

    async fn list_api_key_data_model_readiness(
        &self,
        data_model_id: Uuid,
    ) -> Result<Vec<ApiKeyDataModelReadinessRecord>> {
        Ok(self
            .api_key_readiness
            .lock()
            .expect("in-memory api key readiness lock poisoned")
            .iter()
            .filter(|readiness| readiness.data_model_id == data_model_id)
            .cloned()
            .collect())
    }

    async fn append_audit_log(&self, event: &domain::AuditLogRecord) -> Result<()> {
        self.audit_logs
            .lock()
            .expect("in-memory audit log lock poisoned")
            .push(event.clone());
        Ok(())
    }
}

impl ModelDefinitionService<InMemoryModelDefinitionRepository> {
    pub fn for_tests() -> Self {
        Self::new(InMemoryModelDefinitionRepository::default())
    }
}

fn normalize_api_exposure_for_status(
    status: domain::DataModelStatus,
    exposure: domain::ApiExposureStatus,
) -> Result<domain::ApiExposureStatus> {
    let effective_exposure = if status == domain::DataModelStatus::Draft {
        domain::ApiExposureStatus::Draft
    } else {
        exposure
    };
    if domain::ApiExposureStatus::validate_for_status(
        status,
        effective_exposure,
        domain::ApiExposureReadiness::default(),
    )
    .is_rejected()
    {
        Err(ControlPlaneError::InvalidInput("api_exposure_status").into())
    } else {
        Ok(effective_exposure)
    }
}

fn build_physical_table_name(scope_kind: DataModelScopeKind, code: &str) -> String {
    let prefix = match scope_kind {
        DataModelScopeKind::Workspace => "workspace",
        DataModelScopeKind::System => "system",
    };
    let suffix = Uuid::now_v7().simple().to_string();
    let sanitized_code = code.replace('-', "_");

    format!(
        "rtm_{prefix}_{}_{}",
        &suffix[suffix.len() - 8..],
        sanitized_code
    )
}

fn build_physical_column_name(code: &str) -> String {
    code.replace('-', "_")
}
