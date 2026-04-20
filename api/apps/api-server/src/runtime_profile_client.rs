use anyhow::Result;
use async_trait::async_trait;
use runtime_profile::RuntimeProfile;
use time::OffsetDateTime;

#[async_trait]
pub trait ApiRuntimeProfilePort: Send + Sync {
    async fn collect_runtime_profile(
        &self,
        process_started_at: OffsetDateTime,
    ) -> Result<RuntimeProfile>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct HostApiRuntimeProfileCollector;

#[async_trait]
impl ApiRuntimeProfilePort for HostApiRuntimeProfileCollector {
    async fn collect_runtime_profile(
        &self,
        process_started_at: OffsetDateTime,
    ) -> Result<RuntimeProfile> {
        runtime_profile::collect_runtime_profile(
            "api-server",
            env!("CARGO_PKG_VERSION"),
            process_started_at,
            "ok",
        )
    }
}

#[async_trait]
pub trait PluginRunnerSystemPort: Send + Sync {
    async fn fetch_runtime_profile(&self) -> Result<RuntimeProfile>;
}

#[derive(Clone)]
pub struct HttpPluginRunnerSystemClient {
    base_url: String,
    client: reqwest::Client,
}

impl HttpPluginRunnerSystemClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl PluginRunnerSystemPort for HttpPluginRunnerSystemClient {
    async fn fetch_runtime_profile(&self) -> Result<RuntimeProfile> {
        self.client
            .get(format!(
                "{}/system/runtime-profile",
                self.base_url.trim_end_matches('/')
            ))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await
            .map_err(Into::into)
    }
}
