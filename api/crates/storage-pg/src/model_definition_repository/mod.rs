mod change_log;
mod field_queries;
mod model_queries;
mod naming;

use anyhow::Result;
use async_trait::async_trait;
use control_plane::{
    errors::ControlPlaneError,
    ports::{
        AddModelFieldInput, AuthRepository, CreateModelDefinitionInput, ModelDefinitionRepository,
        UpdateModelDefinitionInput, UpdateModelFieldInput,
    },
};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    mappers::model_definition_mapper::{PgModelDefinitionMapper, StoredModelDefinitionRow},
    physical_schema_repository::{
        add_fk_column_and_constraint, add_scalar_column, create_join_table,
        create_runtime_model_table, drop_join_table, drop_runtime_column, drop_runtime_model_table,
        join_table_name,
    },
    repositories::{tenant_id_for_workspace, workspace_id_for_user, PgControlPlaneStore},
};

use self::{
    change_log::{append_change_log, append_change_log_tx, ChangeLogEntry},
    field_queries::{
        insert_model_field, insert_model_field_after_failure, load_fields_by_model_id,
        load_join_tables_for_model, load_model_field_for_update,
    },
    model_queries::{
        insert_model_definition, insert_model_definition_after_failure, load_model_definition,
        load_model_definition_for_update, load_model_definition_with_lock,
    },
    naming::{build_physical_column_name, build_physical_table_name, nullable_actor_user_id},
};

#[async_trait]
impl ModelDefinitionRepository for PgControlPlaneStore {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> Result<domain::ActorContext> {
        let workspace_id = workspace_id_for_user(self.pool(), actor_user_id).await?;
        let tenant_id = tenant_id_for_workspace(self.pool(), workspace_id).await?;
        AuthRepository::load_actor_context(self, actor_user_id, tenant_id, workspace_id, None).await
    }

    async fn list_model_definitions(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<domain::ModelDefinitionRecord>> {
        let fields_by_model_id = load_fields_by_model_id(self.pool()).await?;
        let rows = sqlx::query(
            r#"
            select
                id,
                scope_kind,
                scope_id,
                code,
                title,
                physical_table_name,
                acl_namespace,
                audit_namespace,
                availability_status
            from model_definitions
            where $1 = '00000000-0000-0000-0000-000000000000'::uuid
               or scope_kind <> 'workspace'
               or scope_id = $1
            order by created_at asc
            "#,
        )
        .bind(workspace_id)
        .fetch_all(self.pool())
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                let model_id: Uuid = row.get("id");
                PgModelDefinitionMapper::to_model_definition_record(StoredModelDefinitionRow {
                    id: model_id,
                    scope_kind: row.get("scope_kind"),
                    scope_id: row.get("scope_id"),
                    code: row.get("code"),
                    title: row.get("title"),
                    physical_table_name: row.get("physical_table_name"),
                    acl_namespace: row.get("acl_namespace"),
                    audit_namespace: row.get("audit_namespace"),
                    availability_status: row.get("availability_status"),
                    fields: fields_by_model_id
                        .get(&model_id)
                        .cloned()
                        .unwrap_or_default(),
                })
            })
            .collect())
    }

    async fn get_model_definition(
        &self,
        workspace_id: Uuid,
        model_id: Uuid,
    ) -> Result<Option<domain::ModelDefinitionRecord>> {
        let model = load_model_definition(self.pool(), model_id).await?;
        Ok(model.filter(|definition| {
            workspace_id.is_nil()
                || !matches!(definition.scope_kind, domain::DataModelScopeKind::Workspace)
                || definition.scope_id == workspace_id
        }))
    }

    async fn create_model_definition(
        &self,
        input: &CreateModelDefinitionInput,
    ) -> Result<domain::ModelDefinitionRecord> {
        let model = domain::ModelDefinitionRecord {
            id: Uuid::now_v7(),
            scope_kind: input.scope_kind,
            scope_id: input.scope_id,
            code: input.code.clone(),
            title: input.title.clone(),
            physical_table_name: build_physical_table_name(input.scope_kind, &input.code),
            acl_namespace: format!("state_model.{}", input.code),
            audit_namespace: format!("audit.state_model.{}", input.code),
            fields: vec![],
            availability_status: domain::MetadataAvailabilityStatus::Available,
        };
        let before_snapshot = serde_json::json!({});
        let after_snapshot = serde_json::to_value(&model)?;
        let actor_user_id = nullable_actor_user_id(input.actor_user_id);
        let mut tx = self.pool().begin().await?;

        let transactional_result = async {
            insert_model_definition(
                &mut tx,
                &model,
                actor_user_id,
                domain::MetadataAvailabilityStatus::Available,
            )
            .await?;
            create_runtime_model_table(&mut tx, &model).await?;
            append_change_log_tx(
                &mut tx,
                &ChangeLogEntry {
                    data_model_id: Some(model.id),
                    action: "model.created",
                    target_type: "model_definition",
                    target_id: Some(model.id),
                    actor_user_id,
                    before_snapshot: before_snapshot.clone(),
                    after_snapshot: after_snapshot.clone(),
                    execution_status: "success",
                    error_message: None,
                },
            )
            .await
        }
        .await;

        match transactional_result {
            Ok(()) => {
                tx.commit().await?;
                Ok(model)
            }
            Err(error) => {
                tx.rollback().await?;
                insert_model_definition_after_failure(
                    self.pool(),
                    &model,
                    actor_user_id,
                    domain::MetadataAvailabilityStatus::Broken,
                )
                .await?;
                append_change_log(
                    self.pool(),
                    &ChangeLogEntry {
                        data_model_id: None,
                        action: "model.created",
                        target_type: "model_definition",
                        target_id: Some(model.id),
                        actor_user_id,
                        before_snapshot,
                        after_snapshot,
                        execution_status: "failed",
                        error_message: Some(error.to_string()),
                    },
                )
                .await?;
                Err(error)
            }
        }
    }

    async fn update_model_definition(
        &self,
        input: &UpdateModelDefinitionInput,
    ) -> Result<domain::ModelDefinitionRecord> {
        let row = sqlx::query(
            r#"
            update model_definitions
            set title = $2,
                updated_by = $3,
                updated_at = now()
            where id = $1
            returning
                id,
                scope_kind,
                scope_id,
                code,
                title,
                physical_table_name,
                acl_namespace,
                audit_namespace,
                availability_status
            "#,
        )
        .bind(input.model_id)
        .bind(&input.title)
        .bind(nullable_actor_user_id(input.actor_user_id))
        .fetch_optional(self.pool())
        .await?
        .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        let fields_by_model_id = load_fields_by_model_id(self.pool()).await?;

        Ok(PgModelDefinitionMapper::to_model_definition_record(
            StoredModelDefinitionRow {
                id: row.get("id"),
                scope_kind: row.get("scope_kind"),
                scope_id: row.get("scope_id"),
                code: row.get("code"),
                title: row.get("title"),
                physical_table_name: row.get("physical_table_name"),
                acl_namespace: row.get("acl_namespace"),
                audit_namespace: row.get("audit_namespace"),
                availability_status: row.get("availability_status"),
                fields: fields_by_model_id
                    .get(&input.model_id)
                    .cloned()
                    .unwrap_or_default(),
            },
        ))
    }

    async fn add_model_field(
        &self,
        input: &AddModelFieldInput,
    ) -> Result<domain::ModelFieldRecord> {
        let mut tx = self.pool().begin().await?;
        let model = load_model_definition_for_update(&mut tx, input.model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        let relation_target = match input.relation_target_model_id {
            Some(relation_target_model_id) => Some(
                load_model_definition_with_lock(&mut tx, relation_target_model_id, false)
                    .await?
                    .ok_or(ControlPlaneError::NotFound("relation_target_model"))?,
            ),
            None => None,
        };
        let field = domain::ModelFieldRecord {
            id: Uuid::now_v7(),
            data_model_id: model.id,
            code: input.code.clone(),
            title: input.title.clone(),
            physical_column_name: build_physical_column_name(&input.code),
            field_kind: input.field_kind,
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
        let before_snapshot = serde_json::json!({});
        let after_snapshot = serde_json::to_value(&field)?;
        let actor_user_id = nullable_actor_user_id(input.actor_user_id);

        let transactional_result = async {
            insert_model_field(
                &mut tx,
                &field,
                actor_user_id,
                domain::MetadataAvailabilityStatus::Available,
            )
            .await?;
            match field.field_kind {
                domain::ModelFieldKind::ManyToOne => {
                    let target = relation_target
                        .as_ref()
                        .ok_or(ControlPlaneError::InvalidInput("relation_target_model_id"))?;
                    add_fk_column_and_constraint(&mut tx, &model, &field, target).await?;
                }
                domain::ModelFieldKind::OneToMany => {}
                domain::ModelFieldKind::ManyToMany => {
                    let target = relation_target
                        .as_ref()
                        .ok_or(ControlPlaneError::InvalidInput("relation_target_model_id"))?;
                    create_join_table(&mut tx, &model, target).await?;
                }
                _ => {
                    add_scalar_column(&mut tx, &model, &field).await?;
                }
            }
            append_change_log_tx(
                &mut tx,
                &ChangeLogEntry {
                    data_model_id: Some(model.id),
                    action: "field.created",
                    target_type: "model_field",
                    target_id: Some(field.id),
                    actor_user_id,
                    before_snapshot: before_snapshot.clone(),
                    after_snapshot: after_snapshot.clone(),
                    execution_status: "success",
                    error_message: None,
                },
            )
            .await
        }
        .await;

        match transactional_result {
            Ok(()) => {
                tx.commit().await?;
                Ok(field)
            }
            Err(error) => {
                tx.rollback().await?;
                insert_model_field_after_failure(
                    self.pool(),
                    &field,
                    actor_user_id,
                    domain::MetadataAvailabilityStatus::Broken,
                )
                .await?;
                append_change_log(
                    self.pool(),
                    &ChangeLogEntry {
                        data_model_id: Some(model.id),
                        action: "field.created",
                        target_type: "model_field",
                        target_id: Some(field.id),
                        actor_user_id,
                        before_snapshot,
                        after_snapshot,
                        execution_status: "failed",
                        error_message: Some(error.to_string()),
                    },
                )
                .await?;
                Err(error)
            }
        }
    }

    async fn update_model_field(
        &self,
        input: &UpdateModelFieldInput,
    ) -> Result<domain::ModelFieldRecord> {
        let mut tx = self.pool().begin().await?;
        let existing = load_model_field_for_update(&mut tx, input.model_id, input.field_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_field"))?;
        let before_snapshot = serde_json::to_value(&existing)?;
        let updated = domain::ModelFieldRecord {
            title: input.title.clone(),
            is_required: input.is_required,
            is_unique: input.is_unique,
            default_value: input.default_value.clone(),
            display_interface: input.display_interface.clone(),
            display_options: input.display_options.clone(),
            relation_options: input.relation_options.clone(),
            ..existing
        };
        let after_snapshot = serde_json::to_value(&updated)?;
        let actor_user_id = nullable_actor_user_id(input.actor_user_id);

        let transactional_result = async {
            sqlx::query(
                r#"
                update model_fields
                set
                    title = $3,
                    is_required = $4,
                    is_unique = $5,
                    default_value = $6,
                    display_interface = $7,
                    display_options = $8,
                    relation_options = $9,
                    updated_by = $10,
                    updated_at = now()
                where id = $1
                  and data_model_id = $2
                "#,
            )
            .bind(input.field_id)
            .bind(input.model_id)
            .bind(&updated.title)
            .bind(updated.is_required)
            .bind(updated.is_unique)
            .bind(&updated.default_value)
            .bind(&updated.display_interface)
            .bind(&updated.display_options)
            .bind(&updated.relation_options)
            .bind(actor_user_id)
            .execute(&mut *tx)
            .await?;
            append_change_log_tx(
                &mut tx,
                &ChangeLogEntry {
                    data_model_id: Some(input.model_id),
                    action: "field.updated",
                    target_type: "model_field",
                    target_id: Some(input.field_id),
                    actor_user_id,
                    before_snapshot: before_snapshot.clone(),
                    after_snapshot: after_snapshot.clone(),
                    execution_status: "success",
                    error_message: None,
                },
            )
            .await
        }
        .await;

        match transactional_result {
            Ok(()) => {
                tx.commit().await?;
                Ok(updated)
            }
            Err(error) => {
                tx.rollback().await?;
                append_change_log(
                    self.pool(),
                    &ChangeLogEntry {
                        data_model_id: Some(input.model_id),
                        action: "field.updated",
                        target_type: "model_field",
                        target_id: Some(input.field_id),
                        actor_user_id,
                        before_snapshot,
                        after_snapshot,
                        execution_status: "failed",
                        error_message: Some(error.to_string()),
                    },
                )
                .await?;
                Err(error)
            }
        }
    }

    async fn delete_model_definition(&self, actor_user_id: Uuid, model_id: Uuid) -> Result<()> {
        let mut tx = self.pool().begin().await?;
        let model = load_model_definition_for_update(&mut tx, model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        let related_join_tables = load_join_tables_for_model(&mut tx, model_id).await?;
        let before_snapshot = serde_json::to_value(&model)?;
        let actor_user_id = nullable_actor_user_id(actor_user_id);

        let transactional_result = async {
            for join_table in related_join_tables {
                drop_join_table(&mut tx, &join_table).await?;
            }
            drop_runtime_model_table(&mut tx, &model.physical_table_name).await?;
            sqlx::query("delete from model_definitions where id = $1")
                .bind(model_id)
                .execute(&mut *tx)
                .await?;
            append_change_log_tx(
                &mut tx,
                &ChangeLogEntry {
                    data_model_id: None,
                    action: "model.deleted",
                    target_type: "model_definition",
                    target_id: Some(model_id),
                    actor_user_id,
                    before_snapshot: before_snapshot.clone(),
                    after_snapshot: serde_json::json!({}),
                    execution_status: "success",
                    error_message: None,
                },
            )
            .await
        }
        .await;

        match transactional_result {
            Ok(()) => {
                tx.commit().await?;
                Ok(())
            }
            Err(error) => {
                tx.rollback().await?;
                append_change_log(
                    self.pool(),
                    &ChangeLogEntry {
                        data_model_id: None,
                        action: "model.deleted",
                        target_type: "model_definition",
                        target_id: Some(model_id),
                        actor_user_id,
                        before_snapshot,
                        after_snapshot: serde_json::json!({}),
                        execution_status: "failed",
                        error_message: Some(error.to_string()),
                    },
                )
                .await?;
                Err(error)
            }
        }
    }

    async fn delete_model_field(
        &self,
        actor_user_id: Uuid,
        model_id: Uuid,
        field_id: Uuid,
    ) -> Result<()> {
        let mut tx = self.pool().begin().await?;
        let model = load_model_definition_for_update(&mut tx, model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition"))?;
        let field = load_model_field_for_update(&mut tx, model_id, field_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_field"))?;
        let relation_target = match field.relation_target_model_id {
            Some(relation_target_model_id) => {
                load_model_definition_with_lock(&mut tx, relation_target_model_id, false).await?
            }
            None => None,
        };
        let before_snapshot = serde_json::to_value(&field)?;
        let actor_user_id = nullable_actor_user_id(actor_user_id);

        let transactional_result = async {
            match field.field_kind {
                domain::ModelFieldKind::ManyToMany => {
                    if let Some(relation_target) = relation_target.as_ref() {
                        drop_join_table(
                            &mut tx,
                            &join_table_name(
                                &model.code,
                                model.id,
                                &relation_target.code,
                                relation_target.id,
                            ),
                        )
                        .await?;
                    }
                }
                domain::ModelFieldKind::OneToMany => {}
                _ => {
                    drop_runtime_column(
                        &mut tx,
                        &model.physical_table_name,
                        &field.physical_column_name,
                    )
                    .await?;
                }
            }
            sqlx::query("delete from model_fields where id = $1 and data_model_id = $2")
                .bind(field_id)
                .bind(model_id)
                .execute(&mut *tx)
                .await?;
            append_change_log_tx(
                &mut tx,
                &ChangeLogEntry {
                    data_model_id: Some(model_id),
                    action: "field.deleted",
                    target_type: "model_field",
                    target_id: Some(field_id),
                    actor_user_id,
                    before_snapshot: before_snapshot.clone(),
                    after_snapshot: serde_json::json!({}),
                    execution_status: "success",
                    error_message: None,
                },
            )
            .await
        }
        .await;

        match transactional_result {
            Ok(()) => {
                tx.commit().await?;
                Ok(())
            }
            Err(error) => {
                tx.rollback().await?;
                append_change_log(
                    self.pool(),
                    &ChangeLogEntry {
                        data_model_id: Some(model_id),
                        action: "field.deleted",
                        target_type: "model_field",
                        target_id: Some(field_id),
                        actor_user_id,
                        before_snapshot,
                        after_snapshot: serde_json::json!({}),
                        execution_status: "failed",
                        error_message: Some(error.to_string()),
                    },
                )
                .await?;
                Err(error)
            }
        }
    }

    async fn publish_model_definition(
        &self,
        _actor_user_id: Uuid,
        model_id: Uuid,
    ) -> Result<domain::ModelDefinitionRecord> {
        load_model_definition(self.pool(), model_id)
            .await?
            .ok_or(ControlPlaneError::NotFound("model_definition").into())
    }

    async fn append_audit_log(&self, event: &domain::AuditLogRecord) -> Result<()> {
        AuthRepository::append_audit_log(self, event).await
    }
}
