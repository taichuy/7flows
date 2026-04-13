use anyhow::{anyhow, Result};
use async_trait::async_trait;
use control_plane::ports::ModelDefinitionRepository;
use runtime_core::{
    model_metadata::ModelMetadata,
    runtime_record_repository::{
        RuntimeFilterInput, RuntimeListResult, RuntimeRecordRepository, RuntimeSortInput,
    },
};
use serde_json::Value;
use sqlx::{postgres::PgRow, Postgres, QueryBuilder, Row};
use uuid::Uuid;

use crate::repositories::PgControlPlaneStore;

impl PgControlPlaneStore {
    pub async fn list_runtime_model_metadata(&self) -> Result<Vec<ModelMetadata>> {
        let models = ModelDefinitionRepository::list_model_definitions(self).await?;
        Ok(models.into_iter().map(to_runtime_model_metadata).collect())
    }

    async fn runtime_model_metadata_by_id(&self, model_id: Uuid) -> Result<Option<ModelMetadata>> {
        let model = ModelDefinitionRepository::get_model_definition(self, model_id).await?;
        Ok(model.map(to_runtime_model_metadata))
    }
}

#[async_trait]
impl RuntimeRecordRepository for PgControlPlaneStore {
    async fn list_records(
        &self,
        metadata: &ModelMetadata,
        scope_id: Uuid,
        filters: &[RuntimeFilterInput],
        sorts: &[RuntimeSortInput],
        expand_relations: &[String],
        page: i64,
        page_size: i64,
    ) -> Result<RuntimeListResult> {
        let page = page.max(1);
        let page_size = page_size.max(1);
        let table_name = quote_identifier(&metadata.physical_table_name)?;
        let scope_column_name = quote_identifier(&metadata.scope_column_name)?;
        let offset = (page - 1) * page_size;

        let mut count_builder = QueryBuilder::<Postgres>::new(format!(
            "select count(*)::bigint from {table_name} where {scope_column_name} = "
        ));
        count_builder.push_bind(scope_id);
        append_filter_clause(&mut count_builder, metadata, filters)?;
        let total = count_builder
            .build_query_scalar::<i64>()
            .fetch_one(self.pool())
            .await?;

        let mut list_builder = QueryBuilder::<Postgres>::new(format!(
            "select row_to_json(t) from (select * from {table_name} where {scope_column_name} = "
        ));
        list_builder.push_bind(scope_id);
        append_filter_clause(&mut list_builder, metadata, filters)?;
        append_sort_clause(&mut list_builder, metadata, sorts)?;
        list_builder.push(" limit ");
        list_builder.push_bind(page_size);
        list_builder.push(" offset ");
        list_builder.push_bind(offset);
        list_builder.push(") t");

        let rows = list_builder
            .build_query_scalar::<Value>()
            .fetch_all(self.pool())
            .await?;
        let mut items = Vec::with_capacity(rows.len());
        for row in rows {
            let normalized = normalize_record(metadata, row);
            items.push(
                self.expand_relations(metadata, scope_id, normalized, expand_relations)
                    .await?,
            );
        }

        Ok(RuntimeListResult { items, total })
    }

    async fn get_record(
        &self,
        metadata: &ModelMetadata,
        scope_id: Uuid,
        record_id: &str,
    ) -> Result<Option<Value>> {
        let table_name = quote_identifier(&metadata.physical_table_name)?;
        let scope_column_name = quote_identifier(&metadata.scope_column_name)?;
        let record_id = parse_record_id(record_id)?;
        let mut builder = QueryBuilder::<Postgres>::new(format!(
            "select row_to_json(t) from (select * from {table_name} where {scope_column_name} = "
        ));
        builder.push_bind(scope_id);
        builder.push(" and id = ");
        builder.push_bind(record_id);
        builder.push(" limit 1) t");

        let row = builder
            .build_query_scalar::<Value>()
            .fetch_optional(self.pool())
            .await?;

        Ok(row.map(|value| normalize_record(metadata, value)))
    }

    async fn create_record(
        &self,
        metadata: &ModelMetadata,
        actor_user_id: Uuid,
        scope_id: Uuid,
        payload: Value,
    ) -> Result<Value> {
        let payload = payload_object(payload)?;
        let table_name = quote_identifier(&metadata.physical_table_name)?;
        let scope_column_name = quote_identifier(&metadata.scope_column_name)?;
        let record_id = Uuid::now_v7();
        let actor_user_id = nullable_actor_user_id(actor_user_id);
        let mut declared_fields = Vec::with_capacity(payload.len());
        for (field_code, value) in &payload {
            let field = metadata
                .field_by_code(field_code)
                .ok_or_else(|| anyhow!("undeclared field code: {field_code}"))?;
            declared_fields.push((field, value));
        }

        let mut builder = QueryBuilder::<Postgres>::new(format!(
            "insert into {table_name} (id, {scope_column_name}, created_by, updated_by"
        ));
        for (field, _) in &declared_fields {
            builder.push(", ");
            builder.push(quote_identifier(&field.physical_column_name)?);
        }
        builder.push(") values (");
        builder.push_bind(record_id);
        builder.push(", ");
        builder.push_bind(scope_id);
        builder.push(", ");
        builder.push_bind(actor_user_id);
        builder.push(", ");
        builder.push_bind(actor_user_id);
        for (field, value) in declared_fields {
            builder.push(", ");
            push_field_value(&mut builder, field, value)?;
        }
        builder.push(")");
        builder.build().execute(self.pool()).await?;

        self.get_record(metadata, scope_id, &record_id.to_string())
            .await?
            .ok_or_else(|| anyhow!("runtime record not found after create"))
    }

    async fn update_record(
        &self,
        metadata: &ModelMetadata,
        actor_user_id: Uuid,
        scope_id: Uuid,
        record_id: &str,
        payload: Value,
    ) -> Result<Value> {
        let payload = payload_object(payload)?;
        if payload.is_empty() {
            return self
                .get_record(metadata, scope_id, record_id)
                .await?
                .ok_or_else(|| anyhow!("runtime record not found"));
        }

        let table_name = quote_identifier(&metadata.physical_table_name)?;
        let scope_column_name = quote_identifier(&metadata.scope_column_name)?;
        let record_id = parse_record_id(record_id)?;
        let actor_user_id = nullable_actor_user_id(actor_user_id);
        let mut declared_fields = Vec::with_capacity(payload.len());
        for (field_code, value) in &payload {
            let field = metadata
                .field_by_code(field_code)
                .ok_or_else(|| anyhow!("undeclared field code: {field_code}"))?;
            declared_fields.push((field, value));
        }

        let mut builder =
            QueryBuilder::<Postgres>::new(format!("update {table_name} set updated_by = "));
        builder.push_bind(actor_user_id);
        builder.push(", updated_at = now()");
        for (field, value) in declared_fields {
            builder.push(", ");
            builder.push(quote_identifier(&field.physical_column_name)?);
            builder.push(" = ");
            push_field_value(&mut builder, field, value)?;
        }
        builder.push(" where ");
        builder.push(scope_column_name);
        builder.push(" = ");
        builder.push_bind(scope_id);
        builder.push(" and id = ");
        builder.push_bind(record_id);
        builder.build().execute(self.pool()).await?;

        self.get_record(metadata, scope_id, &record_id.to_string())
            .await?
            .ok_or_else(|| anyhow!("runtime record not found after update"))
    }

    async fn delete_record(
        &self,
        metadata: &ModelMetadata,
        scope_id: Uuid,
        record_id: &str,
    ) -> Result<bool> {
        let table_name = quote_identifier(&metadata.physical_table_name)?;
        let scope_column_name = quote_identifier(&metadata.scope_column_name)?;
        let record_id = parse_record_id(record_id)?;
        let mut builder = QueryBuilder::<Postgres>::new(format!(
            "delete from {table_name} where {scope_column_name} = "
        ));
        builder.push_bind(scope_id);
        builder.push(" and id = ");
        builder.push_bind(record_id);

        let result = builder.build().execute(self.pool()).await?;
        Ok(result.rows_affected() > 0)
    }
}

impl PgControlPlaneStore {
    async fn expand_relations(
        &self,
        metadata: &ModelMetadata,
        scope_id: Uuid,
        record: Value,
        expand_relations: &[String],
    ) -> Result<Value> {
        if expand_relations.is_empty() {
            return Ok(record);
        }

        let mut object = match record {
            Value::Object(object) => object,
            other => return Ok(other),
        };

        for relation_code in expand_relations {
            let field = metadata
                .field_by_code(relation_code)
                .ok_or_else(|| anyhow!("undeclared relation code: {relation_code}"))?;
            match field.field_kind {
                domain::ModelFieldKind::ManyToOne => {
                    let Some(target_model_id) = field.relation_target_model_id else {
                        continue;
                    };
                    let Some(target_record_id) = object.get(&field.code).and_then(Value::as_str)
                    else {
                        continue;
                    };
                    let Some(target_metadata) =
                        self.runtime_model_metadata_by_id(target_model_id).await?
                    else {
                        continue;
                    };
                    let expanded = RuntimeRecordRepository::get_record(
                        self,
                        &target_metadata,
                        scope_id,
                        target_record_id,
                    )
                    .await?
                    .unwrap_or(Value::Null);
                    object.insert(field.code.clone(), expanded);
                }
                domain::ModelFieldKind::OneToMany => {
                    let Some(target_model_id) = field.relation_target_model_id else {
                        continue;
                    };
                    let Some(target_metadata) =
                        self.runtime_model_metadata_by_id(target_model_id).await?
                    else {
                        continue;
                    };
                    let Some(mapped_by) = field
                        .relation_options
                        .get("mapped_by")
                        .and_then(Value::as_str)
                    else {
                        continue;
                    };
                    let Some(record_id) = object.get("id").cloned() else {
                        continue;
                    };
                    let expanded = RuntimeRecordRepository::list_records(
                        self,
                        &target_metadata,
                        scope_id,
                        &[RuntimeFilterInput {
                            field_code: mapped_by.to_string(),
                            operator: "eq".into(),
                            value: record_id,
                        }],
                        &[],
                        &[],
                        1,
                        100,
                    )
                    .await?;
                    object.insert(field.code.clone(), Value::Array(expanded.items));
                }
                _ => return Err(anyhow!("unsupported relation expansion")),
            }
        }

        Ok(Value::Object(object))
    }
}

fn to_runtime_model_metadata(model: domain::ModelDefinitionRecord) -> ModelMetadata {
    ModelMetadata {
        model_id: model.id,
        model_code: model.code.clone(),
        scope_kind: model.scope_kind,
        scope_id: model.scope_id,
        physical_table_name: model.physical_table_name,
        scope_column_name: match model.scope_kind {
            domain::DataModelScopeKind::Team => "team_id".into(),
            domain::DataModelScopeKind::App => "app_id".into(),
        },
        fields: model.fields,
        resource: runtime_core::resource_descriptor::ResourceDescriptor::runtime_model(
            &model.code,
            model.scope_kind,
        ),
    }
}

fn append_filter_clause(
    builder: &mut QueryBuilder<Postgres>,
    metadata: &ModelMetadata,
    filters: &[RuntimeFilterInput],
) -> Result<()> {
    for filter in filters {
        let field = metadata
            .field_by_code(&filter.field_code)
            .ok_or_else(|| anyhow!("undeclared field code: {}", filter.field_code))?;
        builder.push(" and ");
        builder.push(quote_identifier(&field.physical_column_name)?);
        builder.push(" ");
        builder.push(filter_operator_sql(&filter.operator)?);
        builder.push(" ");
        push_field_value(builder, field, &filter.value)?;
    }

    Ok(())
}

fn append_sort_clause(
    builder: &mut QueryBuilder<Postgres>,
    metadata: &ModelMetadata,
    sorts: &[RuntimeSortInput],
) -> Result<()> {
    if sorts.is_empty() {
        builder.push(" order by created_at desc");
        return Ok(());
    }

    builder.push(" order by ");
    for (index, sort) in sorts.iter().enumerate() {
        if index > 0 {
            builder.push(", ");
        }
        let field = metadata
            .field_by_code(&sort.field_code)
            .ok_or_else(|| anyhow!("undeclared sort field: {}", sort.field_code))?;
        builder.push(quote_identifier(&field.physical_column_name)?);
        builder.push(" ");
        builder.push(sort_direction_sql(&sort.direction)?);
    }

    Ok(())
}

fn push_field_value(
    builder: &mut QueryBuilder<Postgres>,
    field: &domain::ModelFieldRecord,
    value: &Value,
) -> Result<()> {
    match field.field_kind {
        domain::ModelFieldKind::String
        | domain::ModelFieldKind::Enum
        | domain::ModelFieldKind::Text
        | domain::ModelFieldKind::Datetime => builder.push_bind(json_string(value)?),
        domain::ModelFieldKind::Number => builder.push_bind(json_number(value)?),
        domain::ModelFieldKind::Boolean => builder.push_bind(json_bool(value)?),
        domain::ModelFieldKind::Json => builder.push_bind(value.clone()),
        domain::ModelFieldKind::ManyToOne => builder.push_bind(json_uuid(value)?),
        domain::ModelFieldKind::OneToMany => {
            return Err(anyhow!("one_to_many cannot be persisted directly"))
        }
        domain::ModelFieldKind::ManyToMany => {
            return Err(anyhow!("many_to_many cannot be persisted directly"))
        }
    };

    Ok(())
}

fn normalize_record(metadata: &ModelMetadata, value: Value) -> Value {
    let Value::Object(mut object) = value else {
        return value;
    };
    object.remove(&metadata.scope_column_name);
    for field in &metadata.fields {
        if field.code != field.physical_column_name {
            if let Some(field_value) = object.remove(&field.physical_column_name) {
                object.insert(field.code.clone(), field_value);
            }
        }
    }

    Value::Object(object)
}

fn payload_object(payload: Value) -> Result<serde_json::Map<String, Value>> {
    match payload {
        Value::Object(map) => Ok(map),
        _ => Err(anyhow!("runtime payload must be object")),
    }
}

fn filter_operator_sql(operator: &str) -> Result<&'static str> {
    match operator {
        "eq" => Ok("="),
        "ne" => Ok("<>"),
        "gt" => Ok(">"),
        "gte" => Ok(">="),
        "lt" => Ok("<"),
        "lte" => Ok("<="),
        _ => Err(anyhow!("unsupported filter operator")),
    }
}

fn sort_direction_sql(direction: &str) -> Result<&'static str> {
    match direction.to_ascii_lowercase().as_str() {
        "asc" => Ok("asc"),
        "desc" => Ok("desc"),
        _ => Err(anyhow!("unsupported sort direction")),
    }
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

fn parse_record_id(record_id: &str) -> Result<Uuid> {
    Uuid::parse_str(record_id).map_err(Into::into)
}

fn json_string(value: &Value) -> Result<String> {
    value
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| anyhow!("expected string value"))
}

fn json_number(value: &Value) -> Result<f64> {
    value
        .as_f64()
        .ok_or_else(|| anyhow!("expected numeric value"))
}

fn json_bool(value: &Value) -> Result<bool> {
    value
        .as_bool()
        .ok_or_else(|| anyhow!("expected boolean value"))
}

fn json_uuid(value: &Value) -> Result<Uuid> {
    parse_record_id(
        value
            .as_str()
            .ok_or_else(|| anyhow!("expected uuid string value"))?,
    )
}

fn nullable_actor_user_id(actor_user_id: Uuid) -> Option<Uuid> {
    (!actor_user_id.is_nil()).then_some(actor_user_id)
}

#[allow(dead_code)]
fn to_model_field_record(row: PgRow) -> domain::ModelFieldRecord {
    domain::ModelFieldRecord {
        id: row.get("id"),
        data_model_id: row.get("data_model_id"),
        code: row.get("code"),
        title: row.get("title"),
        physical_column_name: row.get("physical_column_name"),
        field_kind: domain::ModelFieldKind::from_db(row.get("field_kind")),
        is_required: row.get("is_required"),
        is_unique: row.get("is_unique"),
        default_value: row.get("default_value"),
        display_interface: row.get("display_interface"),
        display_options: row.get("display_options"),
        relation_target_model_id: row.get("relation_target_model_id"),
        relation_options: row.get("relation_options"),
        sort_order: row.get("sort_order"),
    }
}
