use std::{fs, io::Cursor, path::PathBuf};

use anyhow::{anyhow, bail, Context, Result};
use async_trait::async_trait;
use control_plane::ports::{
    DownloadedOfficialPluginPackage, OfficialPluginSourceEntry, OfficialPluginSourcePort,
};
use flate2::read::GzDecoder;
use reqwest::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tar::Archive;
use uuid::Uuid;

#[derive(Clone)]
pub struct ApiOfficialPluginRegistry {
    registry_url: String,
    client: Client,
}

impl ApiOfficialPluginRegistry {
    pub fn new(registry_url: impl Into<String>) -> Self {
        Self {
            registry_url: registry_url.into(),
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
    async fn list_official_catalog(&self) -> Result<Vec<OfficialPluginSourceEntry>> {
        Ok(self
            .fetch_registry()
            .await?
            .plugins
            .into_iter()
            .map(|entry| OfficialPluginSourceEntry {
                plugin_id: entry.plugin_id,
                provider_code: entry.provider_code,
                display_name: entry.display_name,
                protocol: entry.protocol,
                latest_version: entry.latest_version,
                release_tag: entry.release_tag,
                download_url: entry.download_url,
                checksum: entry.checksum,
                signature_status: entry.signature_status,
                help_url: entry.help_url,
                model_discovery_mode: entry.model_discovery_mode,
            })
            .collect())
    }

    async fn download_plugin(
        &self,
        entry: &OfficialPluginSourceEntry,
    ) -> Result<DownloadedOfficialPluginPackage> {
        let bytes = self.download_bytes(&entry.download_url).await?;
        verify_sha256(&bytes, &entry.checksum)?;
        let package_root = extract_package_archive(&bytes)?;
        Ok(DownloadedOfficialPluginPackage {
            package_root,
            checksum: entry.checksum.clone(),
            signature_status: entry.signature_status.clone(),
        })
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
    signature_status: String,
    help_url: Option<String>,
    model_discovery_mode: String,
}

fn verify_sha256(bytes: &[u8], checksum: &str) -> Result<()> {
    let expected = checksum
        .strip_prefix("sha256:")
        .unwrap_or(checksum)
        .trim()
        .to_ascii_lowercase();
    if expected.is_empty() {
        bail!("official plugin checksum is empty");
    }

    let actual = format!("{:x}", Sha256::digest(bytes));
    if actual != expected {
        return Err(anyhow!(
            "official plugin checksum mismatch: expected {expected}, got {actual}"
        ));
    }

    Ok(())
}

fn extract_package_archive(bytes: &[u8]) -> Result<PathBuf> {
    let extract_root = std::env::temp_dir().join(format!("official-plugin-{}", Uuid::now_v7()));
    fs::create_dir_all(&extract_root)
        .with_context(|| format!("failed to create {}", extract_root.display()))?;

    let unpack_result = (|| -> Result<()> {
        let decoder = GzDecoder::new(Cursor::new(bytes));
        let mut archive = Archive::new(decoder);
        archive
            .unpack(&extract_root)
            .with_context(|| format!("failed to extract {}", extract_root.display()))?;
        Ok(())
    })();

    if let Err(error) = unpack_result {
        let _ = fs::remove_dir_all(&extract_root);
        return Err(error);
    }

    Ok(extract_root)
}
