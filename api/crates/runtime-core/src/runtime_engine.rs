use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock},
};

use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;
use uuid::Uuid;

use crate::capability_slots::{
    DefaultValueResolver, QueryScopeResolver, RecordValidator, ScopeResolution,
};

#[derive(Debug, Clone)]
pub struct RuntimeCreateInput {
    pub actor_user_id: Uuid,
    pub model_code: String,
    pub payload: Value,
}

#[derive(Debug, Clone)]
pub struct RuntimeQueryInput {
    pub actor_user_id: Uuid,
    pub model_code: String,
}

#[derive(Clone)]
pub struct InMemoryRuntimeEngine {
    default_value_resolver: Arc<dyn DefaultValueResolver>,
    query_scope_resolver: Arc<dyn QueryScopeResolver>,
    validator: Arc<dyn RecordValidator>,
    records: Arc<Mutex<HashMap<String, Vec<Value>>>>,
}

impl InMemoryRuntimeEngine {
    pub fn for_tests() -> Self {
        Self {
            default_value_resolver: Arc::new(DefaultOwnerValueResolver),
            query_scope_resolver: Arc::new(DefaultOwnScopeResolver),
            validator: Arc::new(NoopRecordValidator),
            records: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn shared() -> Self {
        static SHARED_ENGINE: OnceLock<InMemoryRuntimeEngine> = OnceLock::new();

        SHARED_ENGINE.get_or_init(Self::for_tests).clone()
    }

    pub async fn create_record(&self, input: RuntimeCreateInput) -> Result<Value> {
        let payload = self
            .default_value_resolver
            .apply(input.actor_user_id, &input.model_code, input.payload)
            .await?;
        self.validator
            .validate(input.actor_user_id, &input.model_code, &payload)
            .await?;

        let mut records = self.records.lock().expect("runtime engine lock poisoned");
        records
            .entry(input.model_code)
            .or_default()
            .push(payload.clone());

        Ok(payload)
    }

    pub async fn list_records(&self, input: RuntimeQueryInput) -> Result<Vec<Value>> {
        let _scope = self.resolve_scope(input.clone()).await?;
        let records = self.records.lock().expect("runtime engine lock poisoned");

        Ok(records.get(&input.model_code).cloned().unwrap_or_default())
    }

    pub async fn resolve_scope(&self, input: RuntimeQueryInput) -> Result<ScopeResolution> {
        self.query_scope_resolver
            .resolve(input.actor_user_id, &input.model_code)
            .await
    }

    pub async fn run_action(
        &self,
        actor_user_id: Uuid,
        model_code: &str,
        record_id: &str,
        action_code: &str,
    ) -> Result<Value> {
        let _scope = self
            .query_scope_resolver
            .resolve(actor_user_id, model_code)
            .await?;

        Ok(serde_json::json!({
            "id": record_id,
            "model_code": model_code,
            "action_code": action_code,
            "status": "accepted",
        }))
    }
}

struct DefaultOwnScopeResolver;

#[async_trait]
impl QueryScopeResolver for DefaultOwnScopeResolver {
    async fn resolve(&self, _actor_user_id: Uuid, _model_code: &str) -> Result<ScopeResolution> {
        Ok(ScopeResolution {
            scope_code: "own".to_string(),
        })
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

struct DefaultOwnerValueResolver;

#[async_trait]
impl DefaultValueResolver for DefaultOwnerValueResolver {
    async fn apply(&self, actor_user_id: Uuid, model_code: &str, payload: Value) -> Result<Value> {
        let mut object = match payload {
            Value::Object(map) => map,
            other => {
                let mut map = serde_json::Map::new();
                map.insert("value".to_string(), other);
                map
            }
        };
        object
            .entry("owner_id".to_string())
            .or_insert(serde_json::json!(actor_user_id));
        object
            .entry("model_code".to_string())
            .or_insert(serde_json::json!(model_code));
        object
            .entry("id".to_string())
            .or_insert(serde_json::json!(Uuid::now_v7()));

        Ok(Value::Object(object))
    }
}
