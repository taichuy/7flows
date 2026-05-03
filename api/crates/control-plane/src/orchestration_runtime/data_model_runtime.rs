use std::sync::Arc;

use anyhow::{anyhow, Result};
use serde_json::{json, Map, Value};
use time::OffsetDateTime;

use crate::{model_definition::ModelDefinitionService, ports::ModelDefinitionRepository};

const WORKFLOW_LIST_PAGE_SIZE_MAX: i64 = 100;

pub(super) struct DataModelNodeExecution {
    pub(super) output_payload: Value,
    pub(super) error_payload: Option<Value>,
    pub(super) metrics_payload: Value,
}

pub(super) async fn execute_data_model_node<R>(
    repository: R,
    runtime_engine: Arc<runtime_core::runtime_engine::RuntimeEngine>,
    actor: &domain::ActorContext,
    node: &orchestration_runtime::compiled_plan::CompiledNode,
    resolved_inputs: &Map<String, Value>,
) -> DataModelNodeExecution
where
    R: ModelDefinitionRepository + Clone,
{
    let started_at = OffsetDateTime::now_utc();
    let result =
        execute_data_model_node_inner(repository, runtime_engine, actor, node, resolved_inputs)
            .await;
    let elapsed_ms = (OffsetDateTime::now_utc() - started_at)
        .whole_milliseconds()
        .max(0);

    match result {
        Ok(output_payload) => DataModelNodeExecution {
            output_payload,
            error_payload: None,
            metrics_payload: json!({
                "runtime": "data_model",
                "duration_ms": elapsed_ms,
            }),
        },
        Err(error) => DataModelNodeExecution {
            output_payload: json!({}),
            error_payload: Some(json!({ "message": error.to_string() })),
            metrics_payload: json!({
                "runtime": "data_model",
                "duration_ms": elapsed_ms,
            }),
        },
    }
}

async fn execute_data_model_node_inner<R>(
    repository: R,
    runtime_engine: Arc<runtime_core::runtime_engine::RuntimeEngine>,
    actor: &domain::ActorContext,
    node: &orchestration_runtime::compiled_plan::CompiledNode,
    resolved_inputs: &Map<String, Value>,
) -> Result<Value>
where
    R: ModelDefinitionRepository + Clone,
{
    let model_code = required_config_string(&node.config, "data_model_code")?;
    let action = required_config_string(&node.config, "action")?;
    let runtime = WorkflowDataModelRuntime::new(repository, runtime_engine);

    match action.as_str() {
        "list" => {
            let query = input_or_config_value(&node.config, resolved_inputs, "query")
                .unwrap_or(Value::Null);
            runtime.list(actor.clone(), model_code, query).await
        }
        "get" => {
            let record_id = required_record_id(&node.config, resolved_inputs)?;
            runtime.get(actor.clone(), model_code, record_id).await
        }
        "create" => {
            let payload = input_or_config_value(&node.config, resolved_inputs, "payload")
                .unwrap_or(Value::Null);
            runtime.create(actor.clone(), model_code, payload).await
        }
        "update" => {
            let record_id = required_record_id(&node.config, resolved_inputs)?;
            let payload = input_or_config_value(&node.config, resolved_inputs, "payload")
                .unwrap_or(Value::Null);
            runtime
                .update(actor.clone(), model_code, record_id, payload)
                .await
        }
        "delete" => {
            let record_id = required_record_id(&node.config, resolved_inputs)?;
            runtime.delete(actor.clone(), model_code, record_id).await
        }
        other => Err(anyhow!("unsupported data_model action: {other}")),
    }
}

#[derive(Clone)]
pub(super) struct WorkflowDataModelRuntime<R> {
    repository: R,
    runtime_engine: Arc<runtime_core::runtime_engine::RuntimeEngine>,
}

impl<R> WorkflowDataModelRuntime<R>
where
    R: ModelDefinitionRepository + Clone,
{
    pub(super) fn new(
        repository: R,
        runtime_engine: Arc<runtime_core::runtime_engine::RuntimeEngine>,
    ) -> Self {
        Self {
            repository,
            runtime_engine,
        }
    }

    pub(super) async fn list(
        &self,
        actor: domain::ActorContext,
        model_code: String,
        query: Value,
    ) -> Result<Value> {
        let options = ListOptions::from_value(query)?;
        if let Some(metadata) = self.runtime_model_metadata(&actor, &model_code) {
            validate_list_options(&metadata, &options)?;
        }
        let scope_grant = self.scope_grant(&actor, &model_code).await?;
        let result = self
            .runtime_engine
            .list_records(runtime_core::runtime_engine::RuntimeListInput {
                actor,
                model_code,
                scope_grant,
                filters: options.filters,
                sorts: options.sorts,
                expand_relations: options.expand_relations,
                page: options.page,
                page_size: options.page_size,
            })
            .await?;

        Ok(json!({
            "records": result.items,
            "total": result.total,
        }))
    }

    pub(super) async fn get(
        &self,
        actor: domain::ActorContext,
        model_code: String,
        record_id: String,
    ) -> Result<Value> {
        let scope_grant = self.scope_grant(&actor, &model_code).await?;
        let record = self
            .runtime_engine
            .get_record(runtime_core::runtime_engine::RuntimeGetInput {
                actor,
                model_code,
                record_id,
                scope_grant,
            })
            .await?
            .ok_or_else(|| anyhow!("runtime record not found"))?;

        Ok(json!({ "record": record }))
    }

    pub(super) async fn create(
        &self,
        actor: domain::ActorContext,
        model_code: String,
        payload: Value,
    ) -> Result<Value> {
        ensure_object_payload(&payload)?;
        let scope_grant = self.scope_grant(&actor, &model_code).await?;
        let record = self
            .runtime_engine
            .create_record(runtime_core::runtime_engine::RuntimeCreateInput {
                actor,
                model_code,
                payload,
                scope_grant,
            })
            .await?;

        Ok(json!({ "record": record }))
    }

    pub(super) async fn update(
        &self,
        actor: domain::ActorContext,
        model_code: String,
        record_id: String,
        payload: Value,
    ) -> Result<Value> {
        ensure_object_payload(&payload)?;
        let scope_grant = self.scope_grant(&actor, &model_code).await?;
        let record = self
            .runtime_engine
            .update_record(runtime_core::runtime_engine::RuntimeUpdateInput {
                actor,
                model_code,
                record_id,
                payload,
                scope_grant,
            })
            .await?;

        Ok(json!({ "record": record }))
    }

    pub(super) async fn delete(
        &self,
        actor: domain::ActorContext,
        model_code: String,
        record_id: String,
    ) -> Result<Value> {
        let scope_grant = self.scope_grant(&actor, &model_code).await?;
        self.runtime_engine
            .delete_record(runtime_core::runtime_engine::RuntimeDeleteInput {
                actor,
                model_code,
                record_id: record_id.clone(),
                scope_grant,
            })
            .await?;

        Ok(json!({ "deleted_id": record_id }))
    }

    fn runtime_model_metadata(
        &self,
        actor: &domain::ActorContext,
        model_code: &str,
    ) -> Option<runtime_core::model_metadata::ModelMetadata> {
        self.runtime_engine
            .registry()
            .get(
                domain::DataModelScopeKind::Workspace,
                actor.current_workspace_id,
                model_code,
            )
            .or_else(|| {
                self.runtime_engine.registry().get(
                    domain::DataModelScopeKind::System,
                    domain::SYSTEM_SCOPE_ID,
                    model_code,
                )
            })
    }

    async fn scope_grant(
        &self,
        actor: &domain::ActorContext,
        model_code: &str,
    ) -> Result<Option<runtime_core::runtime_acl::RuntimeScopeGrant>> {
        let Some(model) = self
            .runtime_engine
            .registry()
            .get(
                domain::DataModelScopeKind::Workspace,
                actor.current_workspace_id,
                model_code,
            )
            .or_else(|| {
                self.runtime_engine.registry().get(
                    domain::DataModelScopeKind::System,
                    domain::SYSTEM_SCOPE_ID,
                    model_code,
                )
            })
        else {
            return Ok(None);
        };

        ModelDefinitionService::new(self.repository.clone())
            .load_runtime_scope_grant(actor, model.model_id)
            .await
    }
}

#[derive(Debug)]
struct ListOptions {
    filters: Vec<runtime_core::runtime_engine::RuntimeFilterInput>,
    sorts: Vec<runtime_core::runtime_engine::RuntimeSortInput>,
    expand_relations: Vec<String>,
    page: i64,
    page_size: i64,
}

impl ListOptions {
    fn from_value(value: Value) -> Result<Self> {
        let object = match value {
            Value::Null => Map::new(),
            Value::Object(object) => object,
            _ => return Err(anyhow!("data_model list query must be object")),
        };

        let page = optional_integer(object.get("page"), "page", 1)?.max(1);
        let page_size = optional_integer(object.get("page_size"), "page_size", 20)?
            .clamp(1, WORKFLOW_LIST_PAGE_SIZE_MAX);

        Ok(Self {
            filters: parse_filters(object.get("filters"))?,
            sorts: parse_sorts(object.get("sorts"))?,
            expand_relations: parse_string_list(object.get("expand_relations"))?,
            page,
            page_size,
        })
    }
}

fn parse_filters(
    value: Option<&Value>,
) -> Result<Vec<runtime_core::runtime_engine::RuntimeFilterInput>> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    let entries = value
        .as_array()
        .ok_or_else(|| anyhow!("data_model list filters must be array"))?;

    entries
        .iter()
        .map(|entry| {
            let object = entry
                .as_object()
                .ok_or_else(|| anyhow!("data_model list filter must be object"))?;
            let operator = required_string(object, "operator")?;
            ensure_supported_filter_operator(&operator)?;
            Ok(runtime_core::runtime_engine::RuntimeFilterInput {
                field_code: required_string(object, "field_code")?,
                operator,
                value: object.get("value").cloned().unwrap_or(Value::Null),
            })
        })
        .collect()
}

fn parse_sorts(
    value: Option<&Value>,
) -> Result<Vec<runtime_core::runtime_engine::RuntimeSortInput>> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    let entries = value
        .as_array()
        .ok_or_else(|| anyhow!("data_model list sorts must be array"))?;

    entries
        .iter()
        .map(|entry| {
            let object = entry
                .as_object()
                .ok_or_else(|| anyhow!("data_model list sort must be object"))?;
            let direction = object
                .get("direction")
                .and_then(Value::as_str)
                .unwrap_or("asc")
                .to_ascii_lowercase();
            ensure_supported_sort_direction(&direction)?;
            Ok(runtime_core::runtime_engine::RuntimeSortInput {
                field_code: required_string(object, "field_code")?,
                direction,
            })
        })
        .collect()
}

fn parse_string_list(value: Option<&Value>) -> Result<Vec<String>> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    let entries = value
        .as_array()
        .ok_or_else(|| anyhow!("data_model list expand_relations must be array"))?;

    entries
        .iter()
        .map(|entry| {
            entry
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| anyhow!("data_model list expand_relations item must be string"))
        })
        .collect()
}

fn optional_integer(value: Option<&Value>, key: &'static str, default_value: i64) -> Result<i64> {
    match value {
        Some(value) => value
            .as_i64()
            .ok_or_else(|| anyhow!("data_model list {key} must be integer")),
        None => Ok(default_value),
    }
}

fn validate_list_options(
    metadata: &runtime_core::model_metadata::ModelMetadata,
    options: &ListOptions,
) -> Result<()> {
    for filter in &options.filters {
        if metadata.field_by_code(&filter.field_code).is_none() {
            return Err(anyhow!("undeclared field code: {}", filter.field_code));
        }
        ensure_supported_filter_operator(&filter.operator)?;
    }

    for sort in &options.sorts {
        if metadata.field_by_code(&sort.field_code).is_none() {
            return Err(anyhow!("undeclared sort field: {}", sort.field_code));
        }
        ensure_supported_sort_direction(&sort.direction)?;
    }

    for relation_code in &options.expand_relations {
        let field = metadata
            .field_by_code(relation_code)
            .ok_or_else(|| anyhow!("undeclared relation code: {relation_code}"))?;
        if !matches!(
            field.field_kind,
            domain::ModelFieldKind::ManyToOne | domain::ModelFieldKind::OneToMany
        ) {
            return Err(anyhow!("unsupported relation expansion"));
        }
    }

    Ok(())
}

fn ensure_supported_filter_operator(operator: &str) -> Result<()> {
    match operator {
        "eq" | "ne" | "gt" | "gte" | "lt" | "lte" => Ok(()),
        _ => Err(anyhow!("data_model list filter operator is unsupported")),
    }
}

fn ensure_supported_sort_direction(direction: &str) -> Result<()> {
    match direction.to_ascii_lowercase().as_str() {
        "asc" | "desc" => Ok(()),
        _ => Err(anyhow!("data_model list sort direction is unsupported")),
    }
}

fn required_string(object: &Map<String, Value>, key: &'static str) -> Result<String> {
    object
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| anyhow!("data_model list {key} is required"))
}

fn ensure_object_payload(payload: &Value) -> Result<()> {
    if payload.is_object() {
        Ok(())
    } else {
        Err(anyhow!("data_model payload must be object"))
    }
}

fn required_config_string(config: &Value, key: &'static str) -> Result<String> {
    config
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| anyhow!("data_model config.{key} is required"))
}

fn required_record_id(config: &Value, resolved_inputs: &Map<String, Value>) -> Result<String> {
    input_or_config_value(config, resolved_inputs, "record_id")
        .and_then(|value| value.as_str().map(str::to_string))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("data_model config.record_id is required"))
}

fn input_or_config_value(
    config: &Value,
    resolved_inputs: &Map<String, Value>,
    key: &str,
) -> Option<Value> {
    resolved_inputs
        .get(key)
        .cloned()
        .or_else(|| config.get(key).cloned())
}
