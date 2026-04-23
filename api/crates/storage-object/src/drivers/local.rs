use std::path::{Component, Path, PathBuf};

use anyhow::Error as AnyhowError;
use async_trait::async_trait;
use tokio::fs;

use crate::{
    driver::FileStorageDriver,
    errors::{FileStorageError, FileStorageResult},
    types::{
        DeleteObjectInput, FileStorageHealthcheck, FileStoragePutInput, FileStoragePutResult,
        GenerateAccessUrlInput, OpenReadInput, OpenReadResult,
    },
};

#[derive(Debug, Default)]
pub struct LocalFileStorageDriver;

fn root_path(config_json: &serde_json::Value) -> FileStorageResult<PathBuf> {
    config_json
        .get("root_path")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .ok_or(FileStorageError::InvalidConfig("root_path"))
}

fn resolve_object_path(root: &Path, object_path: &str) -> FileStorageResult<PathBuf> {
    let relative = Path::new(object_path);

    if object_path.trim().is_empty()
        || relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(FileStorageError::InvalidConfig("object_path"));
    }

    Ok(root.join(relative))
}

fn metadata_path(path: &Path) -> FileStorageResult<PathBuf> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or(FileStorageError::InvalidConfig("object_path"))?;

    // The Task 2 contract expects content_type to survive a local read round-trip.
    Ok(path.with_file_name(format!("{file_name}.metadata.json")))
}

fn other_error(error: impl Into<AnyhowError>) -> FileStorageError {
    FileStorageError::Other(error.into())
}

#[async_trait]
impl FileStorageDriver for LocalFileStorageDriver {
    fn driver_type(&self) -> &'static str {
        "local"
    }

    fn validate_config(&self, config_json: &serde_json::Value) -> FileStorageResult<()> {
        let _ = root_path(config_json)?;
        Ok(())
    }

    async fn healthcheck(
        &self,
        config_json: &serde_json::Value,
    ) -> FileStorageResult<FileStorageHealthcheck> {
        let root = root_path(config_json)?;
        fs::create_dir_all(&root).await.map_err(other_error)?;
        Ok(FileStorageHealthcheck {
            reachable: true,
            detail: Some(root.display().to_string()),
        })
    }

    async fn put_object(
        &self,
        input: FileStoragePutInput<'_>,
    ) -> FileStorageResult<FileStoragePutResult> {
        let root = root_path(input.config_json)?;
        let full_path = resolve_object_path(&root, input.object_path)?;
        let metadata_path = metadata_path(&full_path)?;

        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).await.map_err(other_error)?;
        }

        fs::write(&full_path, input.bytes)
            .await
            .map_err(other_error)?;
        fs::write(
            metadata_path,
            serde_json::to_vec(&serde_json::json!({
                "content_type": input.content_type,
            }))
            .map_err(other_error)?,
        )
        .await
        .map_err(other_error)?;

        Ok(FileStoragePutResult {
            path: input.object_path.to_string(),
            url: None,
            metadata_json: serde_json::json!({
                "driver_type": "local",
                "content_type": input.content_type,
            }),
        })
    }

    async fn delete_object(&self, input: DeleteObjectInput<'_>) -> FileStorageResult<()> {
        let root = root_path(input.config_json)?;
        let full_path = resolve_object_path(&root, input.object_path)?;
        let metadata_path = metadata_path(&full_path)?;

        match fs::remove_file(&full_path).await {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(other_error(error)),
        }

        match fs::remove_file(metadata_path).await {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(other_error(error)),
        }

        Ok(())
    }

    async fn open_read(&self, input: OpenReadInput<'_>) -> FileStorageResult<OpenReadResult> {
        let root = root_path(input.config_json)?;
        let full_path = resolve_object_path(&root, input.object_path)?;
        let metadata_path = metadata_path(&full_path)?;

        let bytes = fs::read(&full_path)
            .await
            .map_err(|error| match error.kind() {
                std::io::ErrorKind::NotFound => FileStorageError::ObjectNotFound,
                _ => other_error(error),
            })?;

        let content_type = match fs::read(&metadata_path).await {
            Ok(metadata_bytes) => serde_json::from_slice::<serde_json::Value>(&metadata_bytes)
                .map_err(other_error)?
                .get("content_type")
                .and_then(|value| value.as_str())
                .map(str::to_string),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(other_error(error)),
        };

        Ok(OpenReadResult {
            bytes,
            content_type,
        })
    }

    async fn generate_access_url(
        &self,
        input: GenerateAccessUrlInput<'_>,
    ) -> FileStorageResult<Option<String>> {
        let _ = resolve_object_path(&root_path(input.config_json)?, input.object_path)?;

        Ok(input
            .config_json
            .get("public_base_url")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|base| format!("{}/{}", base.trim_end_matches('/'), input.object_path)))
    }
}
