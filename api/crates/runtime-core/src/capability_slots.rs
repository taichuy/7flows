use async_trait::async_trait;
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScopeResolution {
    pub scope_code: String,
}

#[async_trait]
pub trait QueryScopeResolver: Send + Sync {
    async fn resolve(
        &self,
        actor_user_id: Uuid,
        model_code: &str,
    ) -> anyhow::Result<ScopeResolution>;
}

#[async_trait]
pub trait RecordValidator: Send + Sync {
    async fn validate(
        &self,
        actor_user_id: Uuid,
        model_code: &str,
        payload: &Value,
    ) -> anyhow::Result<()>;
}

#[async_trait]
pub trait DefaultValueResolver: Send + Sync {
    async fn apply(
        &self,
        actor_user_id: Uuid,
        model_code: &str,
        payload: Value,
    ) -> anyhow::Result<Value>;
}
