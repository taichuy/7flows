use anyhow::{anyhow, Result};
use sqlx::{Postgres, Transaction};

pub fn sanitize_identifier_fragment(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_' {
                ch
            } else if ch.is_ascii_uppercase() {
                ch.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect()
}

pub fn scalar_sql_type_for(field_kind: domain::ModelFieldKind) -> Result<&'static str> {
    match field_kind {
        domain::ModelFieldKind::String | domain::ModelFieldKind::Enum => Ok("text"),
        domain::ModelFieldKind::Number => Ok("numeric"),
        domain::ModelFieldKind::Boolean => Ok("boolean"),
        domain::ModelFieldKind::Datetime => Ok("timestamptz"),
        domain::ModelFieldKind::Text => Ok("text"),
        domain::ModelFieldKind::Json => Ok("jsonb"),
        domain::ModelFieldKind::ManyToOne => Ok("uuid"),
        domain::ModelFieldKind::OneToMany => Err(anyhow!("one_to_many is metadata only")),
        domain::ModelFieldKind::ManyToMany => Err(anyhow!("many_to_many uses host join table")),
    }
}

pub async fn create_runtime_model_table(
    tx: &mut Transaction<'_, Postgres>,
    model: &domain::ModelDefinitionRecord,
) -> Result<()> {
    let table_name = quote_identifier(&model.physical_table_name)?;
    let scope_column = quote_identifier(scope_column_name(model.scope_kind))?;
    let statement = format!(
        r#"
        create table {table_name} (
          id uuid primary key,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          created_by uuid,
          updated_by uuid,
          {scope_column} uuid not null
        )
        "#
    );

    sqlx::query(&statement).execute(&mut **tx).await?;
    Ok(())
}

pub async fn add_scalar_column(
    tx: &mut Transaction<'_, Postgres>,
    model: &domain::ModelDefinitionRecord,
    field: &domain::ModelFieldRecord,
) -> Result<()> {
    let table_name = quote_identifier(&model.physical_table_name)?;
    let column_name = quote_identifier(&field.physical_column_name)?;
    let sql_type = scalar_sql_type_for(field.field_kind)?;
    let mut statement = format!("alter table {table_name} add column {column_name} {sql_type}");
    if field.is_required {
        statement.push_str(" not null");
    }

    sqlx::query(&statement).execute(&mut **tx).await?;
    maybe_create_unique_index(
        tx,
        &model.physical_table_name,
        &field.physical_column_name,
        field.id,
        field.is_unique,
    )
    .await?;
    Ok(())
}

pub async fn add_fk_column_and_constraint(
    tx: &mut Transaction<'_, Postgres>,
    model: &domain::ModelDefinitionRecord,
    field: &domain::ModelFieldRecord,
    relation_target: &domain::ModelDefinitionRecord,
) -> Result<()> {
    add_scalar_column(tx, model, field).await?;

    let table_name = quote_identifier(&model.physical_table_name)?;
    let column_name = quote_identifier(&field.physical_column_name)?;
    let target_table_name = quote_identifier(&relation_target.physical_table_name)?;
    let constraint_name = quote_identifier(&constraint_name("fk", field.id))?;
    let statement = format!(
        "alter table {table_name} add constraint {constraint_name} foreign key ({column_name}) references {target_table_name}(id) on delete restrict"
    );
    sqlx::query(&statement).execute(&mut **tx).await?;
    Ok(())
}

pub async fn create_join_table(
    tx: &mut Transaction<'_, Postgres>,
    model: &domain::ModelDefinitionRecord,
    relation_target: &domain::ModelDefinitionRecord,
) -> Result<String> {
    let join_table_name = join_table_name(
        &model.code,
        model.id,
        &relation_target.code,
        relation_target.id,
    );
    let quoted_join_table_name = quote_identifier(&join_table_name)?;
    let left_table_name = quote_identifier(&model.physical_table_name)?;
    let right_table_name = quote_identifier(&relation_target.physical_table_name)?;
    let left_constraint_name = quote_identifier(&constraint_name("fk_left", model.id))?;
    let right_constraint_name = quote_identifier(&constraint_name("fk_right", relation_target.id))?;
    let statement = format!(
        r#"
        create table {quoted_join_table_name} (
          id uuid primary key,
          left_model_id uuid not null,
          right_model_id uuid not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          created_by uuid,
          updated_by uuid,
          constraint {left_constraint_name} foreign key (left_model_id) references {left_table_name}(id) on delete cascade,
          constraint {right_constraint_name} foreign key (right_model_id) references {right_table_name}(id) on delete cascade
        )
        "#
    );

    sqlx::query(&statement).execute(&mut **tx).await?;
    Ok(join_table_name)
}

pub async fn drop_runtime_model_table(
    tx: &mut Transaction<'_, Postgres>,
    physical_table_name: &str,
) -> Result<()> {
    let table_name = quote_identifier(physical_table_name)?;
    sqlx::query(&format!("drop table if exists {table_name} cascade"))
        .execute(&mut **tx)
        .await?;
    Ok(())
}

pub async fn drop_join_table(
    tx: &mut Transaction<'_, Postgres>,
    join_table_name: &str,
) -> Result<()> {
    let table_name = quote_identifier(join_table_name)?;
    sqlx::query(&format!("drop table if exists {table_name} cascade"))
        .execute(&mut **tx)
        .await?;
    Ok(())
}

pub async fn drop_runtime_column(
    tx: &mut Transaction<'_, Postgres>,
    table_name: &str,
    column_name: &str,
) -> Result<()> {
    let quoted_table_name = quote_identifier(table_name)?;
    let quoted_column_name = quote_identifier(column_name)?;
    let statement = format!(
        "alter table {quoted_table_name} drop column if exists {quoted_column_name} cascade"
    );
    sqlx::query(&statement).execute(&mut **tx).await?;
    Ok(())
}

fn quote_identifier(value: &str) -> Result<String> {
    if !value
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_')
    {
        return Err(anyhow!("invalid sql identifier"));
    }

    Ok(format!("\"{value}\""))
}

fn constraint_name(prefix: &str, id: uuid::Uuid) -> String {
    let simple = id.simple().to_string();
    format!("{prefix}_{}", &simple[..16])
}

fn scope_column_name(scope_kind: domain::DataModelScopeKind) -> &'static str {
    match scope_kind {
        domain::DataModelScopeKind::Workspace => "team_id",
        domain::DataModelScopeKind::System => "app_id",
    }
}

async fn maybe_create_unique_index(
    tx: &mut Transaction<'_, Postgres>,
    table_name: &str,
    column_name: &str,
    field_id: uuid::Uuid,
    is_unique: bool,
) -> Result<()> {
    if !is_unique {
        return Ok(());
    }

    let quoted_table_name = quote_identifier(table_name)?;
    let quoted_column_name = quote_identifier(column_name)?;
    let index_name = quote_identifier(&constraint_name("uq", field_id))?;
    let statement =
        format!("create unique index {index_name} on {quoted_table_name} ({quoted_column_name})");
    sqlx::query(&statement).execute(&mut **tx).await?;
    Ok(())
}

pub fn join_table_name(
    left_code: &str,
    left_id: uuid::Uuid,
    right_code: &str,
    right_id: uuid::Uuid,
) -> String {
    let left_code_fragment = sanitize_identifier_fragment(left_code);
    let right_code_fragment = sanitize_identifier_fragment(right_code);
    let left_code = truncate_identifier_fragment(&left_code_fragment, 12);
    let right_code = truncate_identifier_fragment(&right_code_fragment, 12);
    let left_suffix = short_random_suffix(left_id);
    let right_suffix = short_random_suffix(right_id);

    format!(
        "rtm_rel_{}_{}_{}_{}",
        left_code, left_suffix, right_code, right_suffix
    )
}

fn short_random_suffix(id: uuid::Uuid) -> String {
    let simple = id.simple().to_string();
    simple[simple.len() - 6..].to_string()
}

fn truncate_identifier_fragment(value: &str, max_len: usize) -> &str {
    let max_len = max_len.min(value.len());
    &value[..max_len]
}
