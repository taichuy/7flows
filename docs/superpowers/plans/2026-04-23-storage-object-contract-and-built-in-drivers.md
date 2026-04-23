# Storage Object Contract And Built-In Drivers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `storage-object` crate with a stable file-storage driver boundary that ships built-in `local` and `rustfs` adapters and can be consumed by later control-plane and API work without knowing storage internals.

**Architecture:** Keep `storage-object` driver-focused and free of control-plane persistence concerns. The crate should expose one registry, one trait surface, typed request and response payloads, and built-in drivers. `local` owns filesystem behavior under configured roots, while `rustfs` stays behind a single S3-compatible client adapter so later storage types can evolve without changing higher layers.

**Tech Stack:** Rust workspace crate, `async-trait`, `tokio::fs`, `serde_json`, `aws-sdk-s3`, targeted `cargo test`.

**Source Discussion:** Approved by the current file-manager storage spec; V1 officially supports only `local` and `rustfs`.

---

## File Structure

**Create**
- `api/crates/storage-object/src/driver.rs`
- `api/crates/storage-object/src/errors.rs`
- `api/crates/storage-object/src/registry.rs`
- `api/crates/storage-object/src/types.rs`
- `api/crates/storage-object/src/drivers/mod.rs`
- `api/crates/storage-object/src/drivers/local.rs`
- `api/crates/storage-object/src/drivers/rustfs.rs`
- `api/crates/storage-object/src/_tests/mod.rs`
- `api/crates/storage-object/src/_tests/driver_registry_tests.rs`
- `api/crates/storage-object/src/_tests/local_driver_tests.rs`
- `api/crates/storage-object/src/_tests/rustfs_driver_tests.rs`

**Modify**
- `api/Cargo.toml`
- `api/crates/storage-object/Cargo.toml`
- `api/crates/storage-object/src/lib.rs`

**Notes**
- Keep this crate storage-driver only. Do not add `ActorContext`, `workspace` logic, `file_storages` SQL, or dynamic-model provisioning here.
- `rustfs` should use endpoint, bucket, credentials, region, and path-style config from JSON, but its external driver type remains `rustfs`, not `s3`.
- Tests in this plan stay offline. Do not add live-network integration to the default test suite.

### Task 1: Define The Driver Contract And Built-In Registry

**Files:**
- Create: `api/crates/storage-object/src/driver.rs`
- Create: `api/crates/storage-object/src/errors.rs`
- Create: `api/crates/storage-object/src/registry.rs`
- Create: `api/crates/storage-object/src/types.rs`
- Create: `api/crates/storage-object/src/_tests/mod.rs`
- Create: `api/crates/storage-object/src/_tests/driver_registry_tests.rs`
- Modify: `api/crates/storage-object/src/lib.rs`
- Modify: `api/crates/storage-object/Cargo.toml`
- Modify: `api/Cargo.toml`

- [x] **Step 1: Write the failing registry contract tests**

Create `api/crates/storage-object/src/_tests/driver_registry_tests.rs`:

```rust
use storage_object::{builtin_driver_registry, FileStorageError};

#[test]
fn builtin_registry_lists_local_and_rustfs() {
    let registry = builtin_driver_registry();
    assert_eq!(
        registry.driver_types(),
        vec!["local".to_string(), "rustfs".to_string()]
    );
}

#[test]
fn builtin_registry_returns_driver_by_type() {
    let registry = builtin_driver_registry();
    assert_eq!(registry.get("local").unwrap().driver_type(), "local");
    assert_eq!(registry.get("rustfs").unwrap().driver_type(), "rustfs");
    assert!(registry.get("oss").is_none());
}

#[test]
fn unsupported_driver_error_formats_cleanly() {
    let error = FileStorageError::unsupported_driver("oss");
    assert_eq!(error.to_string(), "unsupported file storage driver: oss");
}
```

Create `api/crates/storage-object/src/_tests/mod.rs`:

```rust
mod driver_registry_tests;
mod local_driver_tests;
mod rustfs_driver_tests;
```

- [x] **Step 2: Run the focused test to verify it fails**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-object driver_registry_tests -- --nocapture
```

Expected:

- FAIL because the registry, error type, and driver exports do not exist yet.

- [x] **Step 3: Implement the shared driver contract, typed payloads, and registry**

Add workspace dependencies in `api/Cargo.toml`:

```toml
[workspace.dependencies]
aws-config = { version = "1", default-features = false, features = ["behavior-version-latest", "rt-tokio", "rustls"] }
aws-sdk-s3 = { version = "1", default-features = false, features = ["rt-tokio", "rustls"] }
```

Update `api/crates/storage-object/Cargo.toml`:

```toml
[dependencies]
anyhow.workspace = true
async-trait.workspace = true
aws-config.workspace = true
aws-sdk-s3.workspace = true
serde.workspace = true
serde_json.workspace = true
thiserror.workspace = true
tokio.workspace = true
uuid.workspace = true
```

Create `api/crates/storage-object/src/driver.rs`:

```rust
use async_trait::async_trait;

use crate::{
    errors::FileStorageResult,
    types::{
        DeleteObjectInput, FileStorageHealthcheck, FileStoragePutInput, FileStoragePutResult,
        GenerateAccessUrlInput, OpenReadInput, OpenReadResult,
    },
};

#[async_trait]
pub trait FileStorageDriver: Send + Sync {
    fn driver_type(&self) -> &'static str;

    fn validate_config(&self, config_json: &serde_json::Value) -> FileStorageResult<()>;

    async fn healthcheck(
        &self,
        config_json: &serde_json::Value,
    ) -> FileStorageResult<FileStorageHealthcheck>;

    async fn put_object(&self, input: FileStoragePutInput<'_>)
        -> FileStorageResult<FileStoragePutResult>;

    async fn delete_object(&self, input: DeleteObjectInput<'_>) -> FileStorageResult<()>;

    async fn open_read(&self, input: OpenReadInput<'_>) -> FileStorageResult<OpenReadResult>;

    async fn generate_access_url(
        &self,
        input: GenerateAccessUrlInput<'_>,
    ) -> FileStorageResult<Option<String>>;
}
```

Create `api/crates/storage-object/src/types.rs`:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileStorageHealthcheck {
    pub reachable: bool,
    pub detail: Option<String>,
}

pub struct FileStoragePutInput<'a> {
    pub config_json: &'a serde_json::Value,
    pub object_path: &'a str,
    pub content_type: Option<&'a str>,
    pub bytes: &'a [u8],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileStoragePutResult {
    pub path: String,
    pub url: Option<String>,
    pub metadata_json: serde_json::Value,
}

pub struct DeleteObjectInput<'a> {
    pub config_json: &'a serde_json::Value,
    pub object_path: &'a str,
}

pub struct OpenReadInput<'a> {
    pub config_json: &'a serde_json::Value,
    pub object_path: &'a str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenReadResult {
    pub bytes: Vec<u8>,
    pub content_type: Option<String>,
}

pub struct GenerateAccessUrlInput<'a> {
    pub config_json: &'a serde_json::Value,
    pub object_path: &'a str,
}
```

Create `api/crates/storage-object/src/errors.rs`:

```rust
use thiserror::Error;

pub type FileStorageResult<T> = Result<T, FileStorageError>;

#[derive(Debug, Error)]
pub enum FileStorageError {
    #[error("unsupported file storage driver: {0}")]
    UnsupportedDriver(String),
    #[error("invalid file storage config: {0}")]
    InvalidConfig(&'static str),
    #[error("object not found")]
    ObjectNotFound,
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl FileStorageError {
    pub fn unsupported_driver(driver_type: impl Into<String>) -> Self {
        Self::UnsupportedDriver(driver_type.into())
    }
}
```

Create `api/crates/storage-object/src/registry.rs`:

```rust
use std::{collections::BTreeMap, sync::Arc};

use crate::{driver::FileStorageDriver, drivers::{local::LocalFileStorageDriver, rustfs::RustfsFileStorageDriver}};

#[derive(Clone, Default)]
pub struct FileStorageDriverRegistry {
    drivers: BTreeMap<String, Arc<dyn FileStorageDriver>>,
}

impl FileStorageDriverRegistry {
    pub fn register(mut self, driver: Arc<dyn FileStorageDriver>) -> Self {
        self.drivers
            .insert(driver.driver_type().to_string(), driver);
        self
    }

    pub fn get(&self, driver_type: &str) -> Option<Arc<dyn FileStorageDriver>> {
        self.drivers.get(driver_type).cloned()
    }

    pub fn driver_types(&self) -> Vec<String> {
        self.drivers.keys().cloned().collect()
    }
}

pub fn builtin_driver_registry() -> FileStorageDriverRegistry {
    FileStorageDriverRegistry::default()
        .register(Arc::new(LocalFileStorageDriver::default()))
        .register(Arc::new(RustfsFileStorageDriver::default()))
}
```

Update `api/crates/storage-object/src/lib.rs`:

```rust
extern crate self as storage_object;

pub mod driver;
pub mod drivers;
pub mod errors;
pub mod registry;
pub mod types;

pub use driver::FileStorageDriver;
pub use errors::{FileStorageError, FileStorageResult};
pub use registry::{builtin_driver_registry, FileStorageDriverRegistry};
pub use types::*;

pub fn crate_name() -> &'static str {
    "storage-object"
}

#[cfg(test)]
mod _tests;
```

- [x] **Step 4: Re-run the focused registry tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-object driver_registry_tests -- --nocapture
```

Expected:

- PASS with the registry returning `local` and `rustfs` in sorted order.

- [x] **Step 5: Commit the contract root**

```bash
git add api/Cargo.toml api/crates/storage-object
git commit -m "feat: add storage object driver contract"
```

### Task 2: Implement The Local Filesystem Driver

> Execution note (2026-04-23 20): The plan example and acceptance test diverged on `content_type` and path hardening. Implementation followed the acceptance test as the source of truth, preserving `content_type` for local round-trips and rejecting absolute or non-normal object paths.

**Files:**
- Create: `api/crates/storage-object/src/drivers/mod.rs`
- Create: `api/crates/storage-object/src/drivers/local.rs`
- Create: `api/crates/storage-object/src/_tests/local_driver_tests.rs`

- [x] **Step 1: Write the failing local driver round-trip test**

Create `api/crates/storage-object/src/_tests/local_driver_tests.rs`:

```rust
use std::{fs, path::PathBuf};

use storage_object::{
    drivers::local::LocalFileStorageDriver, DeleteObjectInput, FileStorageDriver,
    FileStoragePutInput, GenerateAccessUrlInput, OpenReadInput,
};
use uuid::Uuid;

fn temp_root() -> PathBuf {
    let root = std::env::temp_dir().join(format!("storage-object-local-{}", Uuid::now_v7()));
    fs::create_dir_all(&root).unwrap();
    root
}

#[tokio::test]
async fn local_driver_put_read_delete_roundtrip() {
    let driver = LocalFileStorageDriver::default();
    let root = temp_root();
    let config_json = serde_json::json!({
        "root_path": root.display().to_string(),
        "public_base_url": null
    });

    let stored = driver
        .put_object(FileStoragePutInput {
            config_json: &config_json,
            object_path: "attachments/2026/04/demo.txt",
            content_type: Some("text/plain"),
            bytes: b"hello",
        })
        .await
        .unwrap();
    assert_eq!(stored.path, "attachments/2026/04/demo.txt");
    assert_eq!(stored.url, None);

    let read = driver
        .open_read(OpenReadInput {
            config_json: &config_json,
            object_path: &stored.path,
        })
        .await
        .unwrap();
    assert_eq!(read.bytes, b"hello");
    assert_eq!(read.content_type.as_deref(), Some("text/plain"));

    assert_eq!(
        driver
            .generate_access_url(GenerateAccessUrlInput {
                config_json: &config_json,
                object_path: &stored.path,
            })
            .await
            .unwrap(),
        None
    );

    driver
        .delete_object(DeleteObjectInput {
            config_json: &config_json,
            object_path: &stored.path,
        })
        .await
        .unwrap();

    assert!(
        driver
            .open_read(OpenReadInput {
                config_json: &config_json,
                object_path: &stored.path,
            })
            .await
            .is_err()
    );
}
```

- [x] **Step 2: Run the focused local-driver test to verify it fails**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-object local_driver_put_read_delete_roundtrip -- --nocapture
```

Expected:

- FAIL because the `local` driver module and file operations do not exist yet.

- [x] **Step 3: Implement the local driver with strict relative paths**

Create `api/crates/storage-object/src/drivers/mod.rs`:

```rust
pub mod local;
pub mod rustfs;
```

Create `api/crates/storage-object/src/drivers/local.rs`:

```rust
use std::path::{Path, PathBuf};

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

#[derive(Default)]
pub struct LocalFileStorageDriver;

fn root_path(config_json: &serde_json::Value) -> FileStorageResult<PathBuf> {
    config_json
        .get("root_path")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .ok_or(FileStorageError::InvalidConfig("root_path"))
}

fn resolve_object_path(root: &Path, object_path: &str) -> FileStorageResult<PathBuf> {
    let candidate = root.join(object_path);
    if candidate.components().any(|part| matches!(part, std::path::Component::ParentDir)) {
        return Err(FileStorageError::InvalidConfig("object_path"));
    }
    Ok(candidate)
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
        fs::create_dir_all(&root).await?;
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
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        fs::write(&full_path, input.bytes).await?;
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
        match fs::remove_file(full_path).await {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    async fn open_read(&self, input: OpenReadInput<'_>) -> FileStorageResult<OpenReadResult> {
        let root = root_path(input.config_json)?;
        let full_path = resolve_object_path(&root, input.object_path)?;
        let bytes = fs::read(full_path)
            .await
            .map_err(|error| match error.kind() {
                std::io::ErrorKind::NotFound => FileStorageError::ObjectNotFound,
                _ => error.into(),
            })?;
        Ok(OpenReadResult {
            bytes,
            content_type: None,
        })
    }

    async fn generate_access_url(
        &self,
        input: GenerateAccessUrlInput<'_>,
    ) -> FileStorageResult<Option<String>> {
        Ok(input
            .config_json
            .get("public_base_url")
            .and_then(|value| value.as_str())
            .map(|base| format!("{}/{}", base.trim_end_matches('/'), input.object_path)))
    }
}
```

- [x] **Step 4: Re-run the focused local-driver test**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-object local_driver_put_read_delete_roundtrip -- --nocapture
```

Expected:

- PASS with the file written under a temporary root, then read and deleted successfully.

- [x] **Step 5: Commit the local driver**

```bash
git add api/crates/storage-object
git commit -m "feat: add local storage object driver"
```

### Task 3: Implement The `rustfs` Driver As An S3-Compatible Adapter

> Execution note (2026-04-23 20): The original placeholder `rustfs` stub already satisfied the two smallest plan assertions, so implementation added one extra offline red test for `public_base_url` before landing the full adapter. `path_style` is now read from JSON with a default of `true`, which aligns the earlier scope note with the concrete adapter behavior.

**Files:**
- Create: `api/crates/storage-object/src/drivers/rustfs.rs`
- Create: `api/crates/storage-object/src/_tests/rustfs_driver_tests.rs`

- [x] **Step 1: Write the failing rustfs config and healthcheck tests**

Create `api/crates/storage-object/src/_tests/rustfs_driver_tests.rs`:

```rust
use storage_object::{drivers::rustfs::RustfsFileStorageDriver, FileStorageDriver};

#[test]
fn rustfs_driver_requires_endpoint_bucket_access_key_and_secret_key() {
    let driver = RustfsFileStorageDriver::default();

    assert!(driver
        .validate_config(&serde_json::json!({
            "endpoint": "http://127.0.0.1:39000",
            "bucket": "attachments"
        }))
        .is_err());

    assert!(driver
        .validate_config(&serde_json::json!({
            "endpoint": "http://127.0.0.1:39000",
            "bucket": "attachments",
            "access_key": "rustfsadmin",
            "secret_key": "rustfsadmin"
        }))
        .is_ok());
}

#[tokio::test]
async fn rustfs_healthcheck_reports_invalid_endpoint_before_network_io() {
    let driver = RustfsFileStorageDriver::default();
    let error = driver
        .healthcheck(&serde_json::json!({
            "endpoint": "",
            "bucket": "attachments",
            "access_key": "rustfsadmin",
            "secret_key": "rustfsadmin"
        }))
        .await
        .unwrap_err();

    assert_eq!(error.to_string(), "invalid file storage config: endpoint");
}
```

- [x] **Step 2: Run the focused rustfs tests to verify they fail**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-object rustfs_driver_tests -- --nocapture
```

Expected:

- FAIL because the `rustfs` driver does not exist yet.

- [x] **Step 3: Implement the rustfs adapter with isolated S3 client construction**

Create `api/crates/storage-object/src/drivers/rustfs.rs`:

```rust
use async_trait::async_trait;
use aws_config::{meta::region::RegionProviderChain, BehaviorVersion};
use aws_sdk_s3::{
    config::{Builder as S3ConfigBuilder, Credentials, Region},
    Client,
};

use crate::{
    driver::FileStorageDriver,
    errors::{FileStorageError, FileStorageResult},
    types::{
        DeleteObjectInput, FileStorageHealthcheck, FileStoragePutInput, FileStoragePutResult,
        GenerateAccessUrlInput, OpenReadInput, OpenReadResult,
    },
};

#[derive(Default)]
pub struct RustfsFileStorageDriver;

struct RustfsConfig {
    endpoint: String,
    bucket: String,
    access_key: String,
    secret_key: String,
    region: String,
    public_base_url: Option<String>,
}

fn parse_config(config_json: &serde_json::Value) -> FileStorageResult<RustfsConfig> {
    let endpoint = config_json
        .get("endpoint")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or(FileStorageError::InvalidConfig("endpoint"))?;
    let bucket = config_json
        .get("bucket")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or(FileStorageError::InvalidConfig("bucket"))?;
    let access_key = config_json
        .get("access_key")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or(FileStorageError::InvalidConfig("access_key"))?;
    let secret_key = config_json
        .get("secret_key")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or(FileStorageError::InvalidConfig("secret_key"))?;

    Ok(RustfsConfig {
        endpoint: endpoint.to_string(),
        bucket: bucket.to_string(),
        access_key: access_key.to_string(),
        secret_key: secret_key.to_string(),
        region: config_json
            .get("region")
            .and_then(|value| value.as_str())
            .unwrap_or("us-east-1")
            .to_string(),
        public_base_url: config_json
            .get("public_base_url")
            .and_then(|value| value.as_str())
            .map(str::to_string),
    })
}

async fn build_client(config: &RustfsConfig) -> FileStorageResult<Client> {
    let region = Region::new(config.region.clone());
    let shared = aws_config::defaults(BehaviorVersion::latest())
        .region(RegionProviderChain::first_try(region.clone()))
        .credentials_provider(Credentials::new(
            config.access_key.clone(),
            config.secret_key.clone(),
            None,
            None,
            "rustfs-driver",
        ))
        .load()
        .await;

    let s3_config = S3ConfigBuilder::from(&shared)
        .region(region)
        .endpoint_url(config.endpoint.clone())
        .force_path_style(true)
        .build();

    Ok(Client::from_conf(s3_config))
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
        let client = build_client(&config).await?;
        client.head_bucket().bucket(&config.bucket).send().await?;
        Ok(FileStorageHealthcheck {
            reachable: true,
            detail: Some(config.bucket),
        })
    }

    async fn put_object(
        &self,
        input: FileStoragePutInput<'_>,
    ) -> FileStorageResult<FileStoragePutResult> {
        let config = parse_config(input.config_json)?;
        let client = build_client(&config).await?;
        client
            .put_object()
            .bucket(&config.bucket)
            .key(input.object_path)
            .body(input.bytes.to_vec().into())
            .set_content_type(input.content_type.map(str::to_string))
            .send()
            .await?;
        let url = config
            .public_base_url
            .as_ref()
            .map(|base| format!("{}/{}", base.trim_end_matches('/'), input.object_path));
        Ok(FileStoragePutResult {
            path: input.object_path.to_string(),
            url,
            metadata_json: serde_json::json!({
                "driver_type": "rustfs",
                "bucket": config.bucket,
            }),
        })
    }

    async fn delete_object(&self, input: DeleteObjectInput<'_>) -> FileStorageResult<()> {
        let config = parse_config(input.config_json)?;
        let client = build_client(&config).await?;
        client
            .delete_object()
            .bucket(&config.bucket)
            .key(input.object_path)
            .send()
            .await?;
        Ok(())
    }

    async fn open_read(&self, input: OpenReadInput<'_>) -> FileStorageResult<OpenReadResult> {
        let config = parse_config(input.config_json)?;
        let client = build_client(&config).await?;
        let output = client
            .get_object()
            .bucket(&config.bucket)
            .key(input.object_path)
            .send()
            .await?;
        let bytes = output.body.collect().await?.into_bytes().to_vec();
        Ok(OpenReadResult {
            bytes,
            content_type: output.content_type,
        })
    }

    async fn generate_access_url(
        &self,
        input: GenerateAccessUrlInput<'_>,
    ) -> FileStorageResult<Option<String>> {
        let config = parse_config(input.config_json)?;
        Ok(config
            .public_base_url
            .map(|base| format!("{}/{}", base.trim_end_matches('/'), input.object_path)))
    }
}
```

- [x] **Step 4: Re-run the focused rustfs tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-object rustfs_driver_tests -- --nocapture
```

Expected:

- PASS with config validation covered offline and no live bucket required.

- [x] **Step 5: Commit the rustfs driver**

```bash
git add api/Cargo.toml api/crates/storage-object
git commit -m "feat: add rustfs storage object driver"
```

### Task 4: Close The Crate With A Focused Smoke Run

**Files:**
- Modify: `api/crates/storage-object/src/lib.rs`

- [x] **Step 1: Add the final smoke export block if it is still missing**

Ensure `api/crates/storage-object/src/lib.rs` exports the public surface used by later plans:

```rust
pub use driver::FileStorageDriver;
pub use drivers::{local::LocalFileStorageDriver, rustfs::RustfsFileStorageDriver};
pub use registry::{builtin_driver_registry, FileStorageDriverRegistry};
pub use types::{
    DeleteObjectInput, FileStorageHealthcheck, FileStoragePutInput, FileStoragePutResult,
    GenerateAccessUrlInput, OpenReadInput, OpenReadResult,
};
```

- [x] **Step 2: Run the full `storage-object` crate tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-object -- --nocapture
```

Expected:

- PASS with registry, local-driver, and rustfs-driver tests green.

- [x] **Step 3: Run a compile smoke check on the API workspace**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-durable crate_name_matches_storage_durable -- --nocapture
```

Expected:

- PASS, proving the new dependencies did not break adjacent workspace crates.

- [x] **Step 4: Review the final diff for driver-boundary leakage**

Run:

```bash
git diff -- api/crates/storage-object api/Cargo.toml
```

Expected:

- No `ActorContext`, SQL, `workspace_id`, or route code inside `storage-object`.

- [x] **Step 5: Commit the completed driver boundary**

```bash
git add api/Cargo.toml api/crates/storage-object
git commit -m "feat: finalize storage object driver boundary"
```
