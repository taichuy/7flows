use anyhow::anyhow;
use async_trait::async_trait;

use crate::{
    driver::FileStorageDriver,
    errors::{FileStorageError, FileStorageResult},
    types::{
        DeleteObjectInput, FileStorageHealthcheck, FileStoragePutInput, FileStoragePutResult,
        GenerateAccessUrlInput, OpenReadInput, OpenReadResult,
    },
};

#[derive(Debug, Default)]
pub struct RustfsFileStorageDriver;

#[derive(Debug, Clone)]
struct RustfsConfig {
    endpoint: String,
    bucket: String,
    access_key: String,
    secret_key: String,
}

fn required_string(
    config_json: &serde_json::Value,
    field: &'static str,
) -> FileStorageResult<String> {
    config_json
        .get(field)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or(FileStorageError::InvalidConfig(field))
}

fn parse_config(config_json: &serde_json::Value) -> FileStorageResult<RustfsConfig> {
    Ok(RustfsConfig {
        endpoint: required_string(config_json, "endpoint")?,
        bucket: required_string(config_json, "bucket")?,
        access_key: required_string(config_json, "access_key")?,
        secret_key: required_string(config_json, "secret_key")?,
    })
}

#[async_trait]
impl FileStorageDriver for RustfsFileStorageDriver {
    fn driver_type(&self) -> &'static str {
        "rustfs"
    }

    fn validate_config(&self, config_json: &serde_json::Value) -> FileStorageResult<()> {
        let _ = parse_config(config_json)?;
        Ok(())
    }

    async fn healthcheck(
        &self,
        config_json: &serde_json::Value,
    ) -> FileStorageResult<FileStorageHealthcheck> {
        let config = parse_config(config_json)?;
        let credentials_configured = !config.access_key.is_empty() && !config.secret_key.is_empty();
        Ok(FileStorageHealthcheck {
            reachable: false,
            detail: Some(format!(
                "rustfs driver behavior not implemented in task 1 for {}/{} (credentials_configured={credentials_configured})",
                config.endpoint, config.bucket
            )),
        })
    }

    async fn put_object(
        &self,
        _input: FileStoragePutInput<'_>,
    ) -> FileStorageResult<FileStoragePutResult> {
        Err(FileStorageError::Other(anyhow!(
            "rustfs driver behavior not implemented in task 1"
        )))
    }

    async fn delete_object(&self, _input: DeleteObjectInput<'_>) -> FileStorageResult<()> {
        Err(FileStorageError::Other(anyhow!(
            "rustfs driver behavior not implemented in task 1"
        )))
    }

    async fn open_read(&self, _input: OpenReadInput<'_>) -> FileStorageResult<OpenReadResult> {
        Err(FileStorageError::Other(anyhow!(
            "rustfs driver behavior not implemented in task 1"
        )))
    }

    async fn generate_access_url(
        &self,
        _input: GenerateAccessUrlInput<'_>,
    ) -> FileStorageResult<Option<String>> {
        Ok(None)
    }
}
