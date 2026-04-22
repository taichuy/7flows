use anyhow::Result;
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use crate::mappers::model_definition_mapper::{PgModelDefinitionMapper, StoredModelDefinitionRow};

use super::field_queries::{load_fields_by_model_id, load_fields_for_model};

pub(super) async fn load_model_definition(
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
            audit_namespace,
            availability_status
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
            availability_status: row.get("availability_status"),
            fields: fields_by_model_id
                .get(&model_id)
                .cloned()
                .unwrap_or_default(),
        })
    }))
}

pub(super) async fn load_model_definition_for_update(
    tx: &mut Transaction<'_, Postgres>,
    model_id: Uuid,
) -> Result<Option<domain::ModelDefinitionRecord>> {
    load_model_definition_with_lock(tx, model_id, true).await
}

pub(super) async fn load_model_definition_with_lock(
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
            audit_namespace,
            availability_status
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
            availability_status: row.get("availability_status"),
            fields,
        })
    }))
}

pub(super) async fn insert_model_definition(
    tx: &mut Transaction<'_, Postgres>,
    model: &domain::ModelDefinitionRecord,
    actor_user_id: Option<Uuid>,
    availability_status: domain::MetadataAvailabilityStatus,
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
            availability_status,
            created_by,
            updated_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
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
    .bind(availability_status.as_str())
    .bind(actor_user_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub(super) async fn insert_model_definition_after_failure(
    pool: &sqlx::PgPool,
    model: &domain::ModelDefinitionRecord,
    actor_user_id: Option<Uuid>,
    availability_status: domain::MetadataAvailabilityStatus,
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
            availability_status,
            created_by,
            updated_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        on conflict (id) do update
        set availability_status = excluded.availability_status,
            updated_by = excluded.updated_by,
            updated_at = now()
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
    .bind(availability_status.as_str())
    .bind(actor_user_id)
    .execute(pool)
    .await?;
    Ok(())
}
