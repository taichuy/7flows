use std::{
    cmp::Ordering,
    collections::HashMap,
    sync::{Arc, Mutex},
};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    capability_slots::{DefaultValueResolver, RecordValidator},
    model_metadata::ModelMetadata,
    runtime_model_registry::RuntimeModelRegistry,
    runtime_record_repository::RuntimeRecordRepository,
};

pub use crate::runtime_record_repository::{
    RuntimeFilterInput, RuntimeListResult, RuntimeSortInput,
};

#[derive(Debug, Clone)]
pub struct RuntimeListInput {
    pub actor_user_id: Uuid,
    pub team_id: Uuid,
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
    pub actor_user_id: Uuid,
    pub team_id: Uuid,
    pub app_id: Option<Uuid>,
    pub model_code: String,
    pub record_id: String,
}

#[derive(Debug, Clone)]
pub struct RuntimeCreateInput {
    pub actor_user_id: Uuid,
    pub team_id: Uuid,
    pub app_id: Option<Uuid>,
    pub model_code: String,
    pub payload: Value,
}

#[derive(Debug, Clone)]
pub struct RuntimeUpdateInput {
    pub actor_user_id: Uuid,
    pub team_id: Uuid,
    pub app_id: Option<Uuid>,
    pub model_code: String,
    pub record_id: String,
    pub payload: Value,
}

#[derive(Debug, Clone)]
pub struct RuntimeDeleteInput {
    pub actor_user_id: Uuid,
    pub team_id: Uuid,
    pub app_id: Option<Uuid>,
    pub model_code: String,
    pub record_id: String,
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
        let metadata = self.load_metadata(&input.model_code, input.team_id, input.app_id)?;
        let scope_id = self.scope_id_for(&metadata, input.team_id, input.app_id)?;

        self.records
            .list_records(
                &metadata,
                scope_id,
                &input.filters,
                &input.sorts,
                &input.expand_relations,
                input.page,
                input.page_size,
            )
            .await
    }

    pub async fn get_record(&self, input: RuntimeGetInput) -> Result<Option<Value>> {
        let metadata = self.load_metadata(&input.model_code, input.team_id, input.app_id)?;
        let scope_id = self.scope_id_for(&metadata, input.team_id, input.app_id)?;

        self.records
            .get_record(&metadata, scope_id, &input.record_id)
            .await
    }

    pub async fn create_record(&self, input: RuntimeCreateInput) -> Result<Value> {
        let metadata = self.load_metadata(&input.model_code, input.team_id, input.app_id)?;
        let scope_id = self.scope_id_for(&metadata, input.team_id, input.app_id)?;
        let payload = self
            .default_value_resolver
            .apply(input.actor_user_id, &input.model_code, input.payload)
            .await?;
        self.validator
            .validate(input.actor_user_id, &input.model_code, &payload)
            .await?;

        self.records
            .create_record(&metadata, input.actor_user_id, scope_id, payload)
            .await
    }

    pub async fn update_record(&self, input: RuntimeUpdateInput) -> Result<Value> {
        let metadata = self.load_metadata(&input.model_code, input.team_id, input.app_id)?;
        let scope_id = self.scope_id_for(&metadata, input.team_id, input.app_id)?;
        self.validator
            .validate(input.actor_user_id, &input.model_code, &input.payload)
            .await?;

        self.records
            .update_record(
                &metadata,
                input.actor_user_id,
                scope_id,
                &input.record_id,
                input.payload,
            )
            .await
    }

    pub async fn delete_record(&self, input: RuntimeDeleteInput) -> Result<Value> {
        let metadata = self.load_metadata(&input.model_code, input.team_id, input.app_id)?;
        let scope_id = self.scope_id_for(&metadata, input.team_id, input.app_id)?;
        let deleted = self
            .records
            .delete_record(&metadata, scope_id, &input.record_id)
            .await?;

        Ok(serde_json::json!({ "deleted": deleted }))
    }

    fn load_metadata(
        &self,
        model_code: &str,
        team_id: Uuid,
        app_id: Option<Uuid>,
    ) -> Result<ModelMetadata> {
        if let Some(app_id) = app_id {
            if let Some(metadata) =
                self.registry
                    .get(domain::DataModelScopeKind::App, app_id, model_code)
            {
                return Ok(metadata);
            }
        }

        self.registry
            .get(domain::DataModelScopeKind::Team, team_id, model_code)
            .ok_or_else(|| anyhow!("unknown data model definition"))
    }

    fn scope_id_for(
        &self,
        metadata: &ModelMetadata,
        team_id: Uuid,
        app_id: Option<Uuid>,
    ) -> Result<Uuid> {
        match metadata.scope_kind {
            domain::DataModelScopeKind::Team => Ok(team_id),
            domain::DataModelScopeKind::App => {
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
        scope_id: Uuid,
        filters: &[RuntimeFilterInput],
        sorts: &[RuntimeSortInput],
        _expand_relations: &[String],
        page: i64,
        page_size: i64,
    ) -> Result<RuntimeListResult> {
        let page = page.max(1);
        let page_size = page_size.max(1);
        let records = self.records.lock().expect("runtime record lock poisoned");
        let mut items = records
            .get(&metadata.model_code)
            .and_then(|scopes| scopes.get(&scope_id))
            .cloned()
            .unwrap_or_default();
        items.retain(|item| filter_matches(item, filters));
        items.sort_by(|left, right| compare_records(left, right, sorts));
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
        record_id: &str,
    ) -> Result<Option<Value>> {
        let records = self.records.lock().expect("runtime record lock poisoned");
        Ok(records
            .get(&metadata.model_code)
            .and_then(|scopes| scopes.get(&scope_id))
            .and_then(|items| {
                items
                    .iter()
                    .find(|item| item["id"].as_str() == Some(record_id))
                    .cloned()
            }))
    }

    async fn create_record(
        &self,
        metadata: &ModelMetadata,
        _actor_user_id: Uuid,
        scope_id: Uuid,
        payload: Value,
    ) -> Result<Value> {
        let mut record = object_payload(payload);
        record
            .entry("id".to_string())
            .or_insert_with(|| serde_json::json!(Uuid::now_v7()));
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
            .find(|item| item["id"].as_str() == Some(record_id))
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
        record_id: &str,
    ) -> Result<bool> {
        let mut records = self.records.lock().expect("runtime record lock poisoned");
        let scoped_records = records
            .entry(metadata.model_code.clone())
            .or_default()
            .entry(scope_id)
            .or_default();
        let original_len = scoped_records.len();
        scoped_records.retain(|item| item["id"].as_str() != Some(record_id));

        Ok(scoped_records.len() != original_len)
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
        scope_kind: domain::DataModelScopeKind::Team,
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
            },
        ],
        resource: crate::resource_descriptor::ResourceDescriptor::runtime_model(
            "orders",
            domain::DataModelScopeKind::Team,
        ),
    }
}
