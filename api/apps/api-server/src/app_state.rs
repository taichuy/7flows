use async_trait::async_trait;
use control_plane::ports::SessionStore;
use domain::SessionRecord;
use runtime_core::runtime_engine::RuntimeEngine;
use storage_pg::PgControlPlaneStore;
use storage_redis::{InMemorySessionStore, RedisSessionStore};

#[derive(Clone)]
pub enum SessionStoreHandle {
    Redis(Box<RedisSessionStore>),
    InMemory(InMemorySessionStore),
}

#[async_trait]
impl SessionStore for SessionStoreHandle {
    async fn put(&self, session: SessionRecord) -> anyhow::Result<()> {
        match self {
            Self::Redis(store) => store.put(session).await,
            Self::InMemory(store) => store.put(session).await,
        }
    }

    async fn get(&self, session_id: &str) -> anyhow::Result<Option<SessionRecord>> {
        match self {
            Self::Redis(store) => store.get(session_id).await,
            Self::InMemory(store) => store.get(session_id).await,
        }
    }

    async fn delete(&self, session_id: &str) -> anyhow::Result<()> {
        match self {
            Self::Redis(store) => store.delete(session_id).await,
            Self::InMemory(store) => store.delete(session_id).await,
        }
    }

    async fn touch(&self, session_id: &str, expires_at_unix: i64) -> anyhow::Result<()> {
        match self {
            Self::Redis(store) => store.touch(session_id, expires_at_unix).await,
            Self::InMemory(store) => store.touch(session_id, expires_at_unix).await,
        }
    }
}

#[derive(Clone)]
pub struct ApiState {
    pub store: PgControlPlaneStore,
    pub runtime_engine: std::sync::Arc<RuntimeEngine>,
    pub session_store: SessionStoreHandle,
    pub cookie_name: String,
    pub session_ttl_days: i64,
    pub bootstrap_team_name: String,
}
