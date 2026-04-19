use anyhow::{Context, Result};
use async_trait::async_trait;
use control_plane::ports::{
    DownloadedOfficialPluginPackage, OfficialPluginCatalogSnapshot, OfficialPluginCatalogSource,
    OfficialPluginSourceEntry, OfficialPluginSourcePort,
};
use reqwest::Client;
use serde::Deserialize;

use crate::config::ResolvedOfficialPluginSourceConfig;

#[derive(Clone)]
pub struct ApiOfficialPluginRegistry {
    source_kind: String,
    source_label: String,
    registry_url: String,
    trusted_public_keys: Vec<plugin_framework::TrustedPublicKey>,
    client: Client,
}

impl ApiOfficialPluginRegistry {
    pub fn new(
        source: ResolvedOfficialPluginSourceConfig,
        trusted_public_keys: Vec<plugin_framework::TrustedPublicKey>,
    ) -> Self {
        Self {
            source_kind: source.source_kind,
            source_label: source.source_label,
            registry_url: source.registry_url,
            trusted_public_keys,
            client: Client::new(),
        }
    }

    async fn fetch_registry(&self) -> Result<OfficialRegistryDocument> {
        self.client
            .get(&self.registry_url)
            .send()
            .await
            .context("failed to request official plugin registry")?
            .error_for_status()
            .context("official plugin registry returned an error status")?
            .json::<OfficialRegistryDocument>()
            .await
            .context("failed to decode official plugin registry")
    }

    async fn download_bytes(&self, url: &str) -> Result<Vec<u8>> {
        Ok(self
            .client
            .get(url)
            .send()
            .await
            .with_context(|| format!("failed to request official plugin package from {url}"))?
            .error_for_status()
            .with_context(|| format!("official plugin package request failed for {url}"))?
            .bytes()
            .await
            .context("failed to read official plugin package response body")?
            .to_vec())
    }
}

#[async_trait]
impl OfficialPluginSourcePort for ApiOfficialPluginRegistry {
    async fn list_official_catalog(&self) -> Result<OfficialPluginCatalogSnapshot> {
        let document = self.fetch_registry().await?;
        Ok(OfficialPluginCatalogSnapshot {
            source: OfficialPluginCatalogSource {
                source_kind: self.source_kind.clone(),
                source_label: self.source_label.clone(),
                registry_url: self.registry_url.clone(),
            },
            entries: document
                .plugins
                .into_iter()
                .map(OfficialPluginSourceEntry::from)
                .collect(),
        })
    }

    async fn download_plugin(
        &self,
        entry: &OfficialPluginSourceEntry,
    ) -> Result<DownloadedOfficialPluginPackage> {
        Ok(DownloadedOfficialPluginPackage {
            file_name: format!(
                "{}-{}.1flowbasepkg",
                entry.provider_code, entry.latest_version
            ),
            package_bytes: self.download_bytes(&entry.download_url).await?,
        })
    }

    fn trusted_public_keys(&self) -> Vec<plugin_framework::TrustedPublicKey> {
        self.trusted_public_keys.clone()
    }
}

#[derive(Debug, Deserialize)]
struct OfficialRegistryDocument {
    #[allow(dead_code)]
    version: u32,
    #[allow(dead_code)]
    generated_at: Option<String>,
    #[serde(default)]
    plugins: Vec<OfficialRegistryEntry>,
}

#[derive(Debug, Deserialize)]
struct OfficialRegistryEntry {
    plugin_id: String,
    provider_code: String,
    display_name: String,
    protocol: String,
    latest_version: String,
    release_tag: String,
    download_url: String,
    checksum: String,
    #[serde(default = "default_trust_mode")]
    trust_mode: String,
    #[serde(default)]
    signature_algorithm: Option<String>,
    #[serde(default)]
    signing_key_id: Option<String>,
    help_url: Option<String>,
    model_discovery_mode: String,
}

impl From<OfficialRegistryEntry> for OfficialPluginSourceEntry {
    fn from(entry: OfficialRegistryEntry) -> Self {
        Self {
            plugin_id: entry.plugin_id,
            provider_code: entry.provider_code,
            display_name: entry.display_name,
            protocol: entry.protocol,
            latest_version: entry.latest_version,
            release_tag: entry.release_tag,
            download_url: entry.download_url,
            checksum: entry.checksum,
            trust_mode: entry.trust_mode,
            signature_algorithm: entry.signature_algorithm,
            signing_key_id: entry.signing_key_id,
            help_url: entry.help_url,
            model_discovery_mode: entry.model_discovery_mode,
        }
    }
}

fn default_trust_mode() -> String {
    "signature_required".to_string()
}
