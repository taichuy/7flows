# Storage Ephemeral Contract And Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a new `storage-ephemeral` crate with capability-oriented naming, a default memory backend, and a narrow key/value contract that can later host Redis-backed adapters without leaking Redis-specific APIs into the rest of the system.

**Architecture:** Add `storage-ephemeral` alongside the existing `storage-redis` crate first so the workspace can adopt the new capability layer without breaking current consumers. The new crate owns `backend`, `kv_store`, and `memory` modules, exposes a stable `EphemeralBackendKind` plus `EphemeralKvStore` trait, and ships a memory implementation that handles TTL and namespace semantics in-process.

**Tech Stack:** Rust workspace crates, `tokio`, `time`, `serde_json`, targeted `cargo test`.

**Source Discussion:** Current approved architecture direction in the `storage-ephemeral` discussion; `storage-redis` remains temporary only until the later migration plan removes it.

---

## File Structure

**Create**
- `api/crates/storage-ephemeral/Cargo.toml`
- `api/crates/storage-ephemeral/src/lib.rs`
- `api/crates/storage-ephemeral/src/backend.rs`
- `api/crates/storage-ephemeral/src/kv_store.rs`
- `api/crates/storage-ephemeral/src/memory/mod.rs`
- `api/crates/storage-ephemeral/src/memory/kv_store.rs`
- `api/crates/storage-ephemeral/src/_tests/mod.rs`
- `api/crates/storage-ephemeral/src/_tests/kv_store_contract_tests.rs`

**Modify**
- `api/Cargo.toml`

**Notes**
- Keep `api/crates/storage-redis` in place during this plan. Consumer rewires happen in the next plan.
- The contract must stay capability-oriented. Do not expose Redis command vocabulary.

### Task 1: Add The New Workspace Crate And RED Contract Tests

**Files:**
- Create: `api/crates/storage-ephemeral/Cargo.toml`
- Create: `api/crates/storage-ephemeral/src/lib.rs`
- Create: `api/crates/storage-ephemeral/src/backend.rs`
- Create: `api/crates/storage-ephemeral/src/kv_store.rs`
- Create: `api/crates/storage-ephemeral/src/_tests/mod.rs`
- Create: `api/crates/storage-ephemeral/src/_tests/kv_store_contract_tests.rs`
- Modify: `api/Cargo.toml`

- [x] **Step 1: Write the failing contract tests**

Create tests like:

```rust
use storage_ephemeral::{EphemeralBackendKind, EphemeralKvStore, MemoryKvStore};
use time::Duration;

#[tokio::test]
async fn memory_kv_store_expires_entries_on_read() {
    let store = MemoryKvStore::new("flowbase:test");
    store
        .set_json("session:1", serde_json::json!({"ok": true}), Some(Duration::seconds(1)))
        .await
        .unwrap();

    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    assert_eq!(store.get_json("session:1").await.unwrap(), None);
}

#[tokio::test]
async fn memory_kv_store_set_if_absent_only_writes_once() {
    let store = MemoryKvStore::new("flowbase:test");

    assert!(store
        .set_if_absent_json("key", serde_json::json!({"value": 1}), None)
        .await
        .unwrap());
    assert!(!store
        .set_if_absent_json("key", serde_json::json!({"value": 2}), None)
        .await
        .unwrap());
}

#[test]
fn backend_kind_parses_memory_and_redis() {
    assert_eq!(EphemeralBackendKind::from_env_value("memory").unwrap().as_str(), "memory");
    assert_eq!(EphemeralBackendKind::from_env_value("redis").unwrap().as_str(), "redis");
}
```

- [x] **Step 2: Run RED verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral kv_store_contract -- --nocapture
```

Expected:

- FAIL because the crate, trait, and memory implementation do not exist yet.

- [x] **Step 3: Add the new crate and core contract surface**

Create the crate skeleton shaped like:

```toml
[package]
name = "storage-ephemeral"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
anyhow.workspace = true
async-trait.workspace = true
serde_json.workspace = true
time.workspace = true
tokio.workspace = true
```

And define the core contract:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EphemeralBackendKind {
    Memory,
    Redis,
}

#[async_trait]
pub trait EphemeralKvStore: Send + Sync {
    async fn set_json(
        &self,
        key: &str,
        value: serde_json::Value,
        ttl: Option<time::Duration>,
    ) -> anyhow::Result<()>;
    async fn get_json(&self, key: &str) -> anyhow::Result<Option<serde_json::Value>>;
    async fn delete(&self, key: &str) -> anyhow::Result<()>;
    async fn touch(&self, key: &str, ttl: time::Duration) -> anyhow::Result<bool>;
    async fn set_if_absent_json(
        &self,
        key: &str,
        value: serde_json::Value,
        ttl: Option<time::Duration>,
    ) -> anyhow::Result<bool>;
}
```

- [x] **Step 4: Re-run the contract tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral kv_store_contract -- --nocapture
```

Expected:

- FAIL only on the missing memory backend behavior, not on missing crate or missing symbols.

- [x] **Step 5: Commit the crate skeleton**

```bash
git add api/Cargo.toml api/crates/storage-ephemeral
git commit -m "feat: add storage-ephemeral crate skeleton"
```

### Task 2: Implement The In-Memory Key/Value Backend

**Files:**
- Create: `api/crates/storage-ephemeral/src/memory/mod.rs`
- Create: `api/crates/storage-ephemeral/src/memory/kv_store.rs`
- Modify: `api/crates/storage-ephemeral/src/lib.rs`
- Modify: `api/crates/storage-ephemeral/src/_tests/kv_store_contract_tests.rs`

- [x] **Step 1: Extend tests for namespace and touch behavior**

Add cases like:

```rust
#[tokio::test]
async fn memory_kv_store_prefixes_namespace_and_extends_ttl() {
    let store = MemoryKvStore::new("flowbase:test");
    store
        .set_json("session:2", serde_json::json!({"ok": true}), Some(Duration::seconds(1)))
        .await
        .unwrap();

    assert!(store.touch("session:2", Duration::seconds(3)).await.unwrap());
    assert_eq!(
        store.raw_key_for_test("session:2"),
        "flowbase:test:session:2".to_string()
    );
}
```

- [x] **Step 2: Run RED verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral kv_store_contract -- --nocapture
```

Expected:

- FAIL because the memory backend does not yet implement TTL purge or namespace formatting.

- [x] **Step 3: Implement `MemoryKvStore` with lazy expiry**

Use a shape like:

```rust
#[derive(Clone)]
pub struct MemoryKvStore {
    namespace: String,
    inner: Arc<RwLock<HashMap<String, MemoryEntry>>>,
}

struct MemoryEntry {
    value: serde_json::Value,
    expires_at: Option<time::OffsetDateTime>,
}

impl MemoryKvStore {
    pub fn new(namespace: impl Into<String>) -> Self { ... }

    fn namespaced_key(&self, key: &str) -> String {
        format!("{}:{}", self.namespace, key)
    }
}
```

TTL rules must include:

```rust
if entry.expires_at.is_some_and(|deadline| deadline <= OffsetDateTime::now_utc()) {
    map.remove(&namespaced_key);
    return Ok(None);
}
```

- [x] **Step 4: Re-run the backend contract tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral kv_store_contract -- --nocapture
```

Expected:

- PASS with expiry, namespace, and `set_if_absent` behavior verified for the memory backend.

- [x] **Step 5: Commit the memory backend**

```bash
git add api/crates/storage-ephemeral/src/lib.rs api/crates/storage-ephemeral/src/memory api/crates/storage-ephemeral/src/_tests/kv_store_contract_tests.rs
git commit -m "feat: add storage-ephemeral memory kv backend"
```

### Task 3: Lock The Public Exports And Naming Surface

**Files:**
- Modify: `api/crates/storage-ephemeral/src/lib.rs`
- Modify: `api/crates/storage-ephemeral/src/backend.rs`
- Modify: `api/crates/storage-ephemeral/src/kv_store.rs`

- [x] **Step 1: Add a public export smoke test**

Add:

```rust
#[test]
fn public_exports_match_capability_names() {
    use storage_ephemeral::{EphemeralBackendKind, EphemeralKvStore, MemoryKvStore};

    assert_eq!(EphemeralBackendKind::Memory.as_str(), "memory");
    let _ = std::any::type_name::<MemoryKvStore>();
    let _ = std::any::type_name::<&dyn EphemeralKvStore>();
}
```

- [x] **Step 2: Run RED verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral public_exports_match_capability_names -- --nocapture
```

Expected:

- FAIL if the crate still leaks temporary names or does not re-export the contract cleanly.

- [x] **Step 3: Freeze the crate surface**

Export only the stable names:

```rust
mod backend;
mod kv_store;
pub mod memory;

pub use backend::EphemeralBackendKind;
pub use kv_store::EphemeralKvStore;
pub use memory::MemoryKvStore;
```

- [x] **Step 4: Re-run the focused export test and the full crate test suite**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral -- --nocapture
```

Expected:

- PASS with the new crate surface locked to capability-oriented names.

- [x] **Step 5: Commit the public API**

```bash
git add api/crates/storage-ephemeral/src/lib.rs api/crates/storage-ephemeral/src/backend.rs api/crates/storage-ephemeral/src/kv_store.rs
git commit -m "feat: stabilize storage-ephemeral contract exports"
```
