use std::collections::{HashMap, HashSet};

use anyhow::Result;
use async_trait::async_trait;
use control_plane::{
    errors::ControlPlaneError,
    ports::{
        AddModelFieldInput, AuthRepository, CreateModelDefinitionInput, ModelDefinitionRepository,
        UpdateModelDefinitionInput, UpdateModelFieldInput,
    },
};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use crate::{
    mappers::{
        model_definition_mapper::{PgModelDefinitionMapper, StoredModelDefinitionRow},
        model_field_mapper::{PgModelFieldMapper, StoredModelFieldRow},
    },
    physical_schema_repository::{
        add_fk_column_and_constraint, add_scalar_column, create_join_table,
        create_runtime_model_table, drop_join_table, drop_runtime_column, drop_runtime_model_table,
        join_table_name, sanitize_identifier_fragment,
    },
    repositories::{team_id_for_user, tenant_id_for_team, PgControlPlaneStore},
};

struct ChangeLogEntry<'a> {
    data_model_id: Option<Uuid>,
    action: &'a str,
    target_type: &'a str,
    target_id: Option<Uuid>,
    actor_user_id: Option<Uuid>,
    before_snapshot: serde_json::Value,
    after_snapshot: serde_json::Value,
    execution_status: &'a str,
    error_message: Option<String>,
}

#[async_trait]
impl ModelDefinitionRepository for PgControlPlaneStore {
    async fn load_actor_context_for_user(
        &self,
        actor_user_id: Uuid,
    ) -> Result<domain::ActorContext> {
        let team_id = team_id_for_user(self.pool(), actor_user_id).await?;
        let tenant_id = tenant_id_for_team(self.pool(), team_id).await?;
        AuthRepository::load_actor_context(self, actor_user_id, tenant_id, team_id, None).await
    }

    async fn list_model_definitions(&self) -> Result<Vec<domain::ModelDefinitionRecord>> {
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
                audit_namespace
            from model_definitions
            order by created_at asc
            "#,
        )
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
        model_id: Uuid,
    ) -> Result<Option<domain::ModelDefinitionRecord>> {
        load_model_definition(self.pool(), model_id).await
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
        };
        let before_snapshot = serde_json::json!({});
        let after_snapshot = serde_json::to_value(&model)?;
        let actor_user_id = nullable_actor_user_id(input.actor_user_id);
        let mut tx = self.pool().begin().await?;

        let transactional_result = async {
            insert_model_definition(&mut tx, &model, actor_user_id).await?;
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
                audit_namespace
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
        };
        let before_snapshot = serde_json::json!({});
        let after_snapshot = serde_json::to_value(&field)?;
        let actor_user_id = nullable_actor_user_id(input.actor_user_id);

        let transactional_result = async {
            insert_model_field(&mut tx, &field, actor_user_id).await?;
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

async fn load_model_definition(
    pool: &sqlx::PgPool,
    model_id: Uuid,
) -> Result<Option<domain::ModelDefinitionRecord>> {
    let fields_by_model_id = load_fields_by_model_id(pool).await?;
    let row = sqlx::query(
        r#"
        select
            id,
            scope_kind,
            scope_id,
            code,
            title,
            physical_table_name,
            acl_namespace,
            audit_namespace
        from model_definitions
        where id = $1
        "#,
    )
    .bind(model_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| {
        PgModelDefinitionMapper::to_model_definition_record(StoredModelDefinitionRow {
            id: row.get("id"),
            scope_kind: row.get("scope_kind"),
            scope_id: row.get("scope_id"),
            code: row.get("code"),
            title: row.get("title"),
            physical_table_name: row.get("physical_table_name"),
            acl_namespace: row.get("acl_namespace"),
            audit_namespace: row.get("audit_namespace"),
            fields: fields_by_model_id
                .get(&model_id)
                .cloned()
                .unwrap_or_default(),
        })
    }))
}

async fn load_model_definition_for_update(
    tx: &mut Transaction<'_, Postgres>,
    model_id: Uuid,
) -> Result<Option<domain::ModelDefinitionRecord>> {
    load_model_definition_with_lock(tx, model_id, true).await
}

async fn load_model_definition_with_lock(
    tx: &mut Transaction<'_, Postgres>,
    model_id: Uuid,
    for_update: bool,
) -> Result<Option<domain::ModelDefinitionRecord>> {
    let fields = load_fields_for_model(tx, model_id).await?;
    let mut statement = String::from(
        r#"
        select
            id,
            scope_kind,
            scope_id,
            code,
            title,
            physical_table_name,
            acl_namespace,
            audit_namespace
        from model_definitions
        where id = $1
        "#,
    );
    if for_update {
        statement.push_str(" for update");
    }

    let row = sqlx::query(&statement)
        .bind(model_id)
        .fetch_optional(&mut **tx)
        .await?;

    Ok(row.map(|row| {
        PgModelDefinitionMapper::to_model_definition_record(StoredModelDefinitionRow {
            id: row.get("id"),
            scope_kind: row.get("scope_kind"),
            scope_id: row.get("scope_id"),
            code: row.get("code"),
            title: row.get("title"),
            physical_table_name: row.get("physical_table_name"),
            acl_namespace: row.get("acl_namespace"),
            audit_namespace: row.get("audit_namespace"),
            fields,
        })
    }))
}

async fn insert_model_definition(
    tx: &mut Transaction<'_, Postgres>,
    model: &domain::ModelDefinitionRecord,
    actor_user_id: Option<Uuid>,
) -> Result<()> {
    sqlx::query(
        r#"
        insert into model_definitions (
            id,
            scope_kind,
            scope_id,
            code,
            title,
            physical_table_name,
            acl_namespace,
            audit_namespace,
            created_by,
            updated_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        "#,
    )
    .bind(model.id)
    .bind(model.scope_kind.as_str())
    .bind(model.scope_id)
    .bind(&model.code)
    .bind(&model.title)
    .bind(&model.physical_table_name)
    .bind(&model.acl_namespace)
    .bind(&model.audit_namespace)
    .bind(actor_user_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn insert_model_field(
    tx: &mut Transaction<'_, Postgres>,
    field: &domain::ModelFieldRecord,
    actor_user_id: Option<Uuid>,
) -> Result<()> {
    sqlx::query(
        r#"
        insert into model_fields (
            id,
            data_model_id,
            code,
            title,
            physical_column_name,
            field_kind,
            is_required,
            is_unique,
            default_value,
            display_interface,
            display_options,
            relation_target_model_id,
            relation_options,
            sort_order,
            created_by,
            updated_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
        "#,
    )
    .bind(field.id)
    .bind(field.data_model_id)
    .bind(&field.code)
    .bind(&field.title)
    .bind(&field.physical_column_name)
    .bind(field.field_kind.as_str())
    .bind(field.is_required)
    .bind(field.is_unique)
    .bind(&field.default_value)
    .bind(&field.display_interface)
    .bind(&field.display_options)
    .bind(field.relation_target_model_id)
    .bind(&field.relation_options)
    .bind(field.sort_order)
    .bind(actor_user_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn load_fields_by_model_id(
    pool: &sqlx::PgPool,
) -> Result<HashMap<Uuid, Vec<domain::ModelFieldRecord>>> {
    let rows = sqlx::query(
        r#"
        select
            id,
            data_model_id,
            code,
            title,
            physical_column_name,
            field_kind,
            is_required,
            is_unique,
            default_value,
            display_interface,
            display_options,
            relation_target_model_id,
            relation_options,
            sort_order
        from model_fields
        order by data_model_id asc, sort_order asc, created_at asc
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(group_field_rows(rows))
}

async fn load_fields_for_model(
    tx: &mut Transaction<'_, Postgres>,
    model_id: Uuid,
) -> Result<Vec<domain::ModelFieldRecord>> {
    let rows = sqlx::query(
        r#"
        select
            id,
            data_model_id,
            code,
            title,
            physical_column_name,
            field_kind,
            is_required,
            is_unique,
            default_value,
            display_interface,
            display_options,
            relation_target_model_id,
            relation_options,
            sort_order
        from model_fields
        where data_model_id = $1
        order by sort_order asc, created_at asc
        "#,
    )
    .bind(model_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(group_field_rows(rows).remove(&model_id).unwrap_or_default())
}

async fn load_model_field_for_update(
    tx: &mut Transaction<'_, Postgres>,
    model_id: Uuid,
    field_id: Uuid,
) -> Result<Option<domain::ModelFieldRecord>> {
    let row = sqlx::query(
        r#"
        select
            id,
            data_model_id,
            code,
            title,
            physical_column_name,
            field_kind,
            is_required,
            is_unique,
            default_value,
            display_interface,
            display_options,
            relation_target_model_id,
            relation_options,
            sort_order
        from model_fields
        where data_model_id = $1
          and id = $2
        for update
        "#,
    )
    .bind(model_id)
    .bind(field_id)
    .fetch_optional(&mut **tx)
    .await?;

    Ok(row.map(to_model_field_record))
}

async fn load_join_tables_for_model(
    tx: &mut Transaction<'_, Postgres>,
    model_id: Uuid,
) -> Result<Vec<String>> {
    let rows = sqlx::query(
        r#"
        select
            owner.id as owner_id,
            owner.code as owner_code,
            target.id as target_id,
            target.code as target_code
        from model_fields fields
        join model_definitions owner on owner.id = fields.data_model_id
        join model_definitions target on target.id = fields.relation_target_model_id
        where fields.field_kind = 'many_to_many'
          and (fields.data_model_id = $1 or fields.relation_target_model_id = $1)
        "#,
    )
    .bind(model_id)
    .fetch_all(&mut **tx)
    .await?;

    let mut table_names = HashSet::new();
    for row in rows {
        table_names.insert(join_table_name(
            row.get::<String, _>("owner_code").as_str(),
            row.get("owner_id"),
            row.get::<String, _>("target_code").as_str(),
            row.get("target_id"),
        ));
    }

    Ok(table_names.into_iter().collect())
}

async fn append_change_log_tx(
    tx: &mut Transaction<'_, Postgres>,
    entry: &ChangeLogEntry<'_>,
) -> Result<()> {
    sqlx::query(
        r#"
        insert into model_change_logs (
            id,
            data_model_id,
            action,
            target_type,
            target_id,
            actor_user_id,
            before_snapshot,
            after_snapshot,
            execution_status,
            error_message
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(entry.data_model_id)
    .bind(entry.action)
    .bind(entry.target_type)
    .bind(entry.target_id)
    .bind(entry.actor_user_id)
    .bind(&entry.before_snapshot)
    .bind(&entry.after_snapshot)
    .bind(entry.execution_status)
    .bind(&entry.error_message)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn append_change_log(pool: &sqlx::PgPool, entry: &ChangeLogEntry<'_>) -> Result<()> {
    sqlx::query(
        r#"
        insert into model_change_logs (
            id,
            data_model_id,
            action,
            target_type,
            target_id,
            actor_user_id,
            before_snapshot,
            after_snapshot,
            execution_status,
            error_message
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(entry.data_model_id)
    .bind(entry.action)
    .bind(entry.target_type)
    .bind(entry.target_id)
    .bind(entry.actor_user_id)
    .bind(&entry.before_snapshot)
    .bind(&entry.after_snapshot)
    .bind(entry.execution_status)
    .bind(&entry.error_message)
    .execute(pool)
    .await?;
    Ok(())
}

fn group_field_rows(
    rows: Vec<sqlx::postgres::PgRow>,
) -> HashMap<Uuid, Vec<domain::ModelFieldRecord>> {
    let mut fields_by_model_id = HashMap::new();
    for row in rows {
        let field = to_model_field_record(row);
        fields_by_model_id
            .entry(field.data_model_id)
            .or_insert_with(Vec::new)
            .push(field);
    }
    fields_by_model_id
}

fn to_model_field_record(row: sqlx::postgres::PgRow) -> domain::ModelFieldRecord {
    PgModelFieldMapper::to_model_field_record(StoredModelFieldRow {
        id: row.get("id"),
        data_model_id: row.get("data_model_id"),
        code: row.get("code"),
        title: row.get("title"),
        physical_column_name: row.get("physical_column_name"),
        field_kind: row.get("field_kind"),
        is_required: row.get("is_required"),
        is_unique: row.get("is_unique"),
        default_value: row.get("default_value"),
        display_interface: row.get("display_interface"),
        display_options: row.get("display_options"),
        relation_target_model_id: row.get("relation_target_model_id"),
        relation_options: row.get("relation_options"),
        sort_order: row.get("sort_order"),
    })
}

fn build_physical_table_name(scope_kind: domain::DataModelScopeKind, code: &str) -> String {
    let prefix = match scope_kind {
        domain::DataModelScopeKind::Team => "team",
        domain::DataModelScopeKind::App => "app",
    };
    let suffix = Uuid::now_v7().simple().to_string();

    format!(
        "rtm_{prefix}_{}_{}",
        &suffix[suffix.len() - 8..],
        sanitize_identifier_fragment(code)
    )
}

fn build_physical_column_name(code: &str) -> String {
    sanitize_identifier_fragment(code)
}

fn nullable_actor_user_id(actor_user_id: Uuid) -> Option<Uuid> {
    (!actor_user_id.is_nil()).then_some(actor_user_id)
}
