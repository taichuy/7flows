use async_trait::async_trait;
use control_plane::ports::{OfficialPluginSourcePort, SessionStore};
use domain::SessionRecord;
use runtime_core::runtime_engine::RuntimeEngine;
use storage_pg::PgControlPlaneStore;
use storage_ephemeral::{MemorySessionStore, RedisSessionStore};
use time::OffsetDateTime;

use crate::openapi_docs::ApiDocsRegistry;
use crate::{
    provider_runtime::ApiRuntimeServices,
    runtime_profile_client::{ApiRuntimeProfilePort, PluginRunnerSystemPort},
};

#[derive(Clone)]
pub enum SessionStoreHandle {
    Redis(Box<RedisSessionStore>),
    Memory(MemorySessionStore),
}

#[async_trait]
impl SessionStore for SessionStoreHandle {
    async fn put(&self, session: SessionRecord) -> anyhow::Result<()> {
        match self {
            Self::Redis(store) => store.put(session).await,
            Self::Memory(store) => store.put(session).await,
        }
    }

    async fn get(&self, session_id: &str) -> anyhow::Result<Option<SessionRecord>> {
        match self {
            Self::Redis(store) => store.get(session_id).await,
            Self::Memory(store) => store.get(session_id).await,
        }
    }

    async fn delete(&self, session_id: &str) -> anyhow::Result<()> {
        match self {
            Self::Redis(store) => store.delete(session_id).await,
            Self::Memory(store) => store.delete(session_id).await,
        }
    }

    async fn touch(&self, session_id: &str, expires_at_unix: i64) -> anyhow::Result<()> {
        match self {
            Self::Redis(store) => store.touch(session_id, expires_at_unix).await,
            Self::Memory(store) => store.touch(session_id, expires_at_unix).await,
        }
    }
}

#[derive(Clone)]
pub struct ApiState {
    pub store: PgControlPlaneStore,
    pub runtime_engine: std::sync::Arc<RuntimeEngine>,
    pub provider_runtime: std::sync::Arc<ApiRuntimeServices>,
    pub process_started_at: OffsetDateTime,
    pub api_runtime_profile: std::sync::Arc<dyn ApiRuntimeProfilePort>,
    pub plugin_runner_system: std::sync::Arc<dyn PluginRunnerSystemPort>,
    pub official_plugin_source: std::sync::Arc<dyn OfficialPluginSourcePort>,
    pub provider_install_root: String,
    pub provider_secret_master_key: String,
    pub host_extension_dropin_root: String,
    pub allow_unverified_filesystem_dropins: bool,
    pub allow_uploaded_host_extensions: bool,
    pub session_store: SessionStoreHandle,
    pub api_docs: std::sync::Arc<ApiDocsRegistry>,
    pub cookie_name: String,
    pub session_ttl_days: i64,
    pub bootstrap_workspace_name: String,
}
