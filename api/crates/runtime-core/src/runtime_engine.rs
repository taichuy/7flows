use std::{
    cmp::Ordering,
    collections::HashMap,
    sync::{Arc, Mutex},
};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

use crate::{
    capability_slots::{DefaultValueResolver, RecordValidator},
    model_metadata::ModelMetadata,
    runtime_acl::{resolve_access_scope, RuntimeDataAction},
    runtime_model_registry::RuntimeModelRegistry,
    runtime_record_repository::RuntimeRecordRepository,
};

pub use crate::runtime_record_repository::{
    RuntimeFilterInput, RuntimeListQuery, RuntimeListResult, RuntimeSortInput,
};

#[derive(Debug, Clone)]
pub struct RuntimeListInput {
    pub actor: domain::ActorContext,
    pub app_id: Option<Uuid>,
    pub model_code: String,
    pub filters: Vec<RuntimeFilterInput>,
    pub sorts: Vec<RuntimeSortInput>,
    pub expand_relations: Vec<String>,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Clone)]
pub struct RuntimeGetInput {
    pub actor: domain::ActorContext,
    pub app_id: Option<Uuid>,
    pub model_code: String,
    pub record_id: String,
}

#[derive(Debug, Clone)]
pub struct RuntimeCreateInput {
    pub actor: domain::ActorContext,
    pub app_id: Option<Uuid>,
    pub model_code: String,
    pub payload: Value,
}

#[derive(Debug, Clone)]
pub struct RuntimeUpdateInput {
    pub actor: domain::ActorContext,
    pub app_id: Option<Uuid>,
    pub model_code: String,
    pub record_id: String,
    pub payload: Value,
}

#[derive(Debug, Clone)]
pub struct RuntimeDeleteInput {
    pub actor: domain::ActorContext,
    pub app_id: Option<Uuid>,
    pub model_code: String,
    pub record_id: String,
}

#[derive(Debug, Error)]
pub enum RuntimeModelError {
    #[error("runtime model unavailable: {0}")]
    Unavailable(String),
}

impl RuntimeModelError {
    pub fn unavailable(model_code: impl Into<String>) -> Self {
        Self::Unavailable(model_code.into())
    }
}

#[derive(Clone)]
pub struct RuntimeEngine {
    default_value_resolver: Arc<dyn DefaultValueResolver>,
    validator: Arc<dyn RecordValidator>,
    registry: RuntimeModelRegistry,
    records: Arc<dyn RuntimeRecordRepository>,
}

impl RuntimeEngine {
    pub fn new(registry: RuntimeModelRegistry, records: Arc<dyn RuntimeRecordRepository>) -> Self {
        Self {
            default_value_resolver: Arc::new(PassthroughValueResolver),
            validator: Arc::new(NoopRecordValidator),
            registry,
            records,
        }
    }

    pub fn for_tests() -> Self {
        let registry = RuntimeModelRegistry::default();
        registry.rebuild(vec![test_model_metadata()]);

        Self::new(
            registry,
            Arc::new(InMemoryRuntimeRecordRepository::default()),
        )
    }

    pub fn registry(&self) -> &RuntimeModelRegistry {
        &self.registry
    }

    pub async fn list_records(&self, input: RuntimeListInput) -> Result<RuntimeListResult> {
        let metadata = self.load_metadata(
            &input.model_code,
            input.actor.current_workspace_id,
            input.app_id,
        )?;
        let scope_id =
            self.scope_id_for(&metadata, input.actor.current_workspace_id, input.app_id)?;
        let access_scope = resolve_access_scope(&input.actor, RuntimeDataAction::View)?;

        self.records
            .list_records(
                &metadata,
                RuntimeListQuery {
                    scope_id,
                    owner_user_id: access_scope.owner_user_id,
                    filters: input.filters,
                    sorts: input.sorts,
                    expand_relations: input.expand_relations,
                    page: input.page,
                    page_size: input.page_size,
                },
            )
            .await
    }

    pub async fn get_record(&self, input: RuntimeGetInput) -> Result<Option<Value>> {
        let metadata = self.load_metadata(
            &input.model_code,
            input.actor.current_workspace_id,
            input.app_id,
        )?;
        let scope_id =
            self.scope_id_for(&metadata, input.actor.current_workspace_id, input.app_id)?;
        let access_scope = resolve_access_scope(&input.actor, RuntimeDataAction::View)?;

        self.records
            .get_record(
                &metadata,
                scope_id,
                access_scope.owner_user_id,
                &input.record_id,
            )
            .await
    }

    pub async fn create_record(&self, input: RuntimeCreateInput) -> Result<Value> {
        resolve_access_scope(&input.actor, RuntimeDataAction::Create)?;
        let metadata = self.load_metadata(
            &input.model_code,
            input.actor.current_workspace_id,
            input.app_id,
        )?;
        let scope_id =
            self.scope_id_for(&metadata, input.actor.current_workspace_id, input.app_id)?;
        let payload = self
            .default_value_resolver
            .apply(input.actor.user_id, &input.model_code, input.payload)
            .await?;
        self.validator
            .validate(input.actor.user_id, &input.model_code, &payload)
            .await?;

        self.records
            .create_record(&metadata, input.actor.user_id, scope_id, payload)
            .await
    }

    pub async fn update_record(&self, input: RuntimeUpdateInput) -> Result<Value> {
        let metadata = self.load_metadata(
            &input.model_code,
            input.actor.current_workspace_id,
            input.app_id,
        )?;
        let scope_id =
            self.scope_id_for(&metadata, input.actor.current_workspace_id, input.app_id)?;
        let access_scope = resolve_access_scope(&input.actor, RuntimeDataAction::Edit)?;
        self.validator
            .validate(input.actor.user_id, &input.model_code, &input.payload)
            .await?;

        self.records
            .update_record(
                &metadata,
                input.actor.user_id,
                scope_id,
                access_scope.owner_user_id,
                &input.record_id,
                input.payload,
            )
            .await
    }

    pub async fn delete_record(&self, input: RuntimeDeleteInput) -> Result<Value> {
        let metadata = self.load_metadata(
            &input.model_code,
            input.actor.current_workspace_id,
            input.app_id,
        )?;
        let scope_id =
            self.scope_id_for(&metadata, input.actor.current_workspace_id, input.app_id)?;
        let access_scope = resolve_access_scope(&input.actor, RuntimeDataAction::Delete)?;
        let deleted = self
            .records
            .delete_record(
                &metadata,
                scope_id,
                access_scope.owner_user_id,
                &input.record_id,
            )
            .await?;

        if !deleted {
            return Err(anyhow!("runtime record not found"));
        }

        Ok(serde_json::json!({ "deleted": true }))
    }

    fn load_metadata(
        &self,
        model_code: &str,
        workspace_id: Uuid,
        app_id: Option<Uuid>,
    ) -> Result<ModelMetadata> {
        if let Some(app_id) = app_id {
            if let Some(metadata) =
                self.registry
                    .get(domain::DataModelScopeKind::System, app_id, model_code)
            {
                return Ok(metadata);
            }
        }

        self.registry
            .get(
                domain::DataModelScopeKind::Workspace,
                workspace_id,
                model_code,
            )
            .ok_or_else(|| RuntimeModelError::unavailable(model_code).into())
    }

    fn scope_id_for(
        &self,
        metadata: &ModelMetadata,
        workspace_id: Uuid,
        app_id: Option<Uuid>,
    ) -> Result<Uuid> {
        match metadata.scope_kind {
            domain::DataModelScopeKind::Workspace => Ok(workspace_id),
            domain::DataModelScopeKind::System => {
                app_id.ok_or_else(|| anyhow!("missing app scope context"))
            }
        }
    }
}

#[derive(Default)]
struct InMemoryRuntimeRecordRepository {
    records: Mutex<HashMap<String, HashMap<Uuid, Vec<Value>>>>,
}

#[async_trait]
impl RuntimeRecordRepository for InMemoryRuntimeRecordRepository {
    async fn list_records(
        &self,
        metadata: &ModelMetadata,
        query: RuntimeListQuery,
    ) -> Result<RuntimeListResult> {
        let page = query.page.max(1);
        let page_size = query.page_size.max(1);
        let records = self.records.lock().expect("runtime record lock poisoned");
        let mut items = records
            .get(&metadata.model_code)
            .and_then(|scopes| scopes.get(&query.scope_id))
            .cloned()
            .unwrap_or_default();
        items.retain(|item| owner_matches(item, query.owner_user_id));
        items.retain(|item| filter_matches(item, &query.filters));
        items.sort_by(|left, right| compare_records(left, right, &query.sorts));
        let total = items.len() as i64;
        let offset = ((page - 1) * page_size) as usize;
        let items = items
            .into_iter()
            .skip(offset)
            .take(page_size as usize)
            .collect();

        Ok(RuntimeListResult { items, total })
    }

    async fn get_record(
        &self,
        metadata: &ModelMetadata,
        scope_id: Uuid,
        owner_user_id: Option<Uuid>,
        record_id: &str,
    ) -> Result<Option<Value>> {
        let records = self.records.lock().expect("runtime record lock poisoned");
        Ok(records
            .get(&metadata.model_code)
            .and_then(|scopes| scopes.get(&scope_id))
            .and_then(|items| {
                items
                    .iter()
                    .find(|item| {
                        item["id"].as_str() == Some(record_id) && owner_matches(item, owner_user_id)
                    })
                    .cloned()
            }))
    }

    async fn create_record(
        &self,
        metadata: &ModelMetadata,
        actor_user_id: Uuid,
        scope_id: Uuid,
        payload: Value,
    ) -> Result<Value> {
        let mut record = object_payload(payload);
        record
            .entry("id".to_string())
            .or_insert_with(|| serde_json::json!(Uuid::now_v7()));
        record.insert(
            "created_by".to_string(),
            nullable_actor_user_id(actor_user_id)
                .map(|user_id| serde_json::Value::String(user_id.to_string()))
                .unwrap_or(serde_json::Value::Null),
        );
        let value = Value::Object(record);

        let mut records = self.records.lock().expect("runtime record lock poisoned");
        records
            .entry(metadata.model_code.clone())
            .or_default()
            .entry(scope_id)
            .or_default()
            .push(value.clone());

        Ok(value)
    }

    async fn update_record(
        &self,
        metadata: &ModelMetadata,
        _actor_user_id: Uuid,
        scope_id: Uuid,
        owner_user_id: Option<Uuid>,
        record_id: &str,
        payload: Value,
    ) -> Result<Value> {
        let patch = object_payload(payload);
        let mut records = self.records.lock().expect("runtime record lock poisoned");
        let scoped_records = records
            .entry(metadata.model_code.clone())
            .or_default()
            .entry(scope_id)
            .or_default();
        let record = scoped_records
            .iter_mut()
            .find(|item| {
                item["id"].as_str() == Some(record_id) && owner_matches(item, owner_user_id)
            })
            .ok_or_else(|| anyhow!("runtime record not found"))?;
        let object = record
            .as_object_mut()
            .ok_or_else(|| anyhow!("runtime record must be object"))?;

        for (key, value) in patch {
            object.insert(key, value);
        }

        Ok(record.clone())
    }

    async fn delete_record(
        &self,
        metadata: &ModelMetadata,
        scope_id: Uuid,
        owner_user_id: Option<Uuid>,
        record_id: &str,
    ) -> Result<bool> {
        let mut records = self.records.lock().expect("runtime record lock poisoned");
        let scoped_records = records
            .entry(metadata.model_code.clone())
            .or_default()
            .entry(scope_id)
            .or_default();
        let mut deleted = false;
        scoped_records.retain(|item| {
            let matches =
                item["id"].as_str() == Some(record_id) && owner_matches(item, owner_user_id);
            if matches {
                deleted = true;
                false
            } else {
                true
            }
        });

        Ok(deleted)
    }
}

struct NoopRecordValidator;

#[async_trait]
impl RecordValidator for NoopRecordValidator {
    async fn validate(
        &self,
        _actor_user_id: Uuid,
        _model_code: &str,
        _payload: &Value,
    ) -> Result<()> {
        Ok(())
    }
}

struct PassthroughValueResolver;

#[async_trait]
impl DefaultValueResolver for PassthroughValueResolver {
    async fn apply(
        &self,
        _actor_user_id: Uuid,
        _model_code: &str,
        payload: Value,
    ) -> Result<Value> {
        Ok(Value::Object(object_payload(payload)))
    }
}

fn object_payload(payload: Value) -> serde_json::Map<String, Value> {
    match payload {
        Value::Object(map) => map,
        other => {
            let mut map = serde_json::Map::new();
            map.insert("value".to_string(), other);
            map
        }
    }
}

fn nullable_actor_user_id(actor_user_id: Uuid) -> Option<Uuid> {
    (!actor_user_id.is_nil()).then_some(actor_user_id)
}

fn owner_matches(record: &Value, owner_user_id: Option<Uuid>) -> bool {
    match owner_user_id {
        None => true,
        Some(owner_user_id) => {
            record
                .get("created_by")
                .and_then(Value::as_str)
                .and_then(|value| Uuid::parse_str(value).ok())
                == Some(owner_user_id)
        }
    }
}

fn filter_matches(record: &Value, filters: &[RuntimeFilterInput]) -> bool {
    filters.iter().all(|filter| {
        let current = &record[&filter.field_code];
        match filter.operator.as_str() {
            "eq" => current == &filter.value,
            "ne" => current != &filter.value,
            _ => false,
        }
    })
}

fn compare_records(left: &Value, right: &Value, sorts: &[RuntimeSortInput]) -> Ordering {
    for sort in sorts {
        let ordering = compare_json_values(&left[&sort.field_code], &right[&sort.field_code]);
        if ordering != Ordering::Equal {
            return if sort.direction.eq_ignore_ascii_case("desc") {
                ordering.reverse()
            } else {
                ordering
            };
        }
    }

    Ordering::Equal
}

fn compare_json_values(left: &Value, right: &Value) -> Ordering {
    match (left, right) {
        (Value::String(left), Value::String(right)) => left.cmp(right),
        (Value::Number(left), Value::Number(right)) => left
            .as_f64()
            .partial_cmp(&right.as_f64())
            .unwrap_or(Ordering::Equal),
        (Value::Bool(left), Value::Bool(right)) => left.cmp(right),
        _ => left.to_string().cmp(&right.to_string()),
    }
}

fn test_model_metadata() -> ModelMetadata {
    ModelMetadata {
        model_id: Uuid::nil(),
        model_code: "orders".into(),
        scope_kind: domain::DataModelScopeKind::Workspace,
        scope_id: Uuid::nil(),
        physical_table_name: "rtm_team_demo_orders".into(),
        scope_column_name: "team_id".into(),
        fields: vec![
            domain::ModelFieldRecord {
                id: Uuid::nil(),
                data_model_id: Uuid::nil(),
                code: "title".into(),
                title: "Title".into(),
                physical_column_name: "title".into(),
                field_kind: domain::ModelFieldKind::String,
                is_required: true,
                is_unique: false,
                default_value: None,
                display_interface: Some("input".into()),
                display_options: serde_json::json!({}),
                relation_target_model_id: None,
                relation_options: serde_json::json!({}),
                sort_order: 0,
                availability_status: domain::MetadataAvailabilityStatus::Available,
            },
            domain::ModelFieldRecord {
                id: Uuid::nil(),
                data_model_id: Uuid::nil(),
                code: "status".into(),
                title: "Status".into(),
                physical_column_name: "status".into(),
                field_kind: domain::ModelFieldKind::Enum,
                is_required: true,
                is_unique: false,
                default_value: None,
                display_interface: Some("select".into()),
                display_options: serde_json::json!({ "options": ["draft", "paid"] }),
                relation_target_model_id: None,
                relation_options: serde_json::json!({}),
                sort_order: 1,
                availability_status: domain::MetadataAvailabilityStatus::Available,
            },
        ],
        resource: crate::resource_descriptor::ResourceDescriptor::runtime_model(
            "orders",
            domain::DataModelScopeKind::Workspace,
        ),
    }
}
