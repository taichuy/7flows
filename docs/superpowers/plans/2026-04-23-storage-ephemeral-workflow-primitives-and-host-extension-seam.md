# Storage Ephemeral Workflow Primitives And Host Extension Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add future-facing ephemeral workflow primitives such as leases and wakeup signals, plus a documented infrastructure-provider seam, without making Redis mandatory or changing PostgreSQL’s role as the durable source of truth for workflow execution.

**Architecture:** Keep this plan intentionally narrow. `storage-ephemeral` gains reusable `LeaseStore` and `WakeupSignalBus` contracts with in-memory implementations only. Workflow consumers do not switch to Redis here; the point is to stabilize the interfaces that future multi-node execution can use. The current host-extension system remains untouched; instead, document the bootstrap seam required for a future optional backend provider because host extensions load too late to supply the session/cache path today.

**Tech Stack:** Rust (`storage-ephemeral`), `tokio`, markdown docs, targeted `cargo test`.

**Source Discussion:** Approved `storage-ephemeral` direction; workflow remains PostgreSQL-backed for durable state.

---

## File Structure

**Create**
- `api/crates/storage-ephemeral/src/lease_store.rs`
- `api/crates/storage-ephemeral/src/wakeup_signal.rs`
- `api/crates/storage-ephemeral/src/memory/lease_store.rs`
- `api/crates/storage-ephemeral/src/memory/wakeup_signal.rs`
- `api/crates/storage-ephemeral/src/_tests/lease_store_tests.rs`
- `api/crates/storage-ephemeral/src/_tests/wakeup_signal_tests.rs`
- `api/crates/storage-ephemeral/README.md`

**Modify**
- `api/crates/storage-ephemeral/src/lib.rs`
- `api/crates/storage-ephemeral/src/memory/mod.rs`

**Notes**
- This plan defines interfaces and in-memory behavior only. It does not add Redis-backed workflow execution.
- The host-extension seam is documented, not implemented. Current startup ordering still builds `ApiState` before `load_host_extensions_at_startup()`.

### Task 1: Add A Lease Contract And Memory Implementation

**Files:**
- Create: `api/crates/storage-ephemeral/src/lease_store.rs`
- Create: `api/crates/storage-ephemeral/src/memory/lease_store.rs`
- Create: `api/crates/storage-ephemeral/src/_tests/lease_store_tests.rs`
- Modify: `api/crates/storage-ephemeral/src/lib.rs`
- Modify: `api/crates/storage-ephemeral/src/memory/mod.rs`

- [ ] **Step 1: Write failing lease tests**

Create tests like:

```rust
use storage_ephemeral::{LeaseStore, MemoryLeaseStore};
use time::Duration;

#[tokio::test]
async fn memory_lease_store_allows_single_owner_until_expiry() {
    let store = MemoryLeaseStore::new("flowbase:lease");

    assert!(store.acquire("flow-run:1", "worker-a", Duration::seconds(30)).await.unwrap());
    assert!(!store.acquire("flow-run:1", "worker-b", Duration::seconds(30)).await.unwrap());
}

#[tokio::test]
async fn memory_lease_store_renews_owner_lease() {
    let store = MemoryLeaseStore::new("flowbase:lease");

    store.acquire("flow-run:2", "worker-a", Duration::seconds(30)).await.unwrap();
    assert!(store.renew("flow-run:2", "worker-a", Duration::seconds(30)).await.unwrap());
}
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral lease_store_tests -- --nocapture
```

Expected:

- FAIL because no lease contract or memory implementation exists yet.

- [ ] **Step 3: Implement the lease interface**

Use a narrow shape like:

```rust
#[async_trait]
pub trait LeaseStore: Send + Sync {
    async fn acquire(&self, key: &str, owner: &str, ttl: time::Duration) -> anyhow::Result<bool>;
    async fn renew(&self, key: &str, owner: &str, ttl: time::Duration) -> anyhow::Result<bool>;
    async fn release(&self, key: &str, owner: &str) -> anyhow::Result<bool>;
}
```

And a memory implementation shaped like:

```rust
pub struct MemoryLeaseStore {
    namespace: String,
    inner: Arc<RwLock<HashMap<String, LeaseEntry>>>,
}
```

- [ ] **Step 4: Re-run the lease tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral lease_store_tests -- --nocapture
```

Expected:

- PASS with in-memory single-process lease semantics defined for future workflow consumers.

- [ ] **Step 5: Commit the lease primitive**

```bash
git add api/crates/storage-ephemeral/src/lib.rs api/crates/storage-ephemeral/src/lease_store.rs api/crates/storage-ephemeral/src/memory/mod.rs api/crates/storage-ephemeral/src/memory/lease_store.rs api/crates/storage-ephemeral/src/_tests/lease_store_tests.rs
git commit -m "feat: add storage-ephemeral lease primitive"
```

### Task 2: Add A Local Wakeup Signal Primitive

**Files:**
- Create: `api/crates/storage-ephemeral/src/wakeup_signal.rs`
- Create: `api/crates/storage-ephemeral/src/memory/wakeup_signal.rs`
- Create: `api/crates/storage-ephemeral/src/_tests/wakeup_signal_tests.rs`
- Modify: `api/crates/storage-ephemeral/src/lib.rs`
- Modify: `api/crates/storage-ephemeral/src/memory/mod.rs`

- [ ] **Step 1: Write failing wakeup signal tests**

Create tests like:

```rust
use storage_ephemeral::{MemoryWakeupSignalBus, WakeupSignalBus};

#[tokio::test]
async fn memory_wakeup_signal_bus_delivers_one_signal() {
    let bus = MemoryWakeupSignalBus::new();

    bus.publish("flow-run:1").await.unwrap();

    assert_eq!(bus.poll().await.unwrap(), Some("flow-run:1".to_string()));
}
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral wakeup_signal_tests -- --nocapture
```

Expected:

- FAIL because no wakeup bus exists yet.

- [ ] **Step 3: Implement a process-local wakeup signal bus**

Use a minimal interface:

```rust
#[async_trait]
pub trait WakeupSignalBus: Send + Sync {
    async fn publish(&self, key: &str) -> anyhow::Result<()>;
    async fn poll(&self) -> anyhow::Result<Option<String>>;
}
```

Use a local queue for the memory implementation:

```rust
pub struct MemoryWakeupSignalBus {
    sender: tokio::sync::mpsc::UnboundedSender<String>,
    receiver: Arc<tokio::sync::Mutex<tokio::sync::mpsc::UnboundedReceiver<String>>>,
}
```

- [ ] **Step 4: Re-run the wakeup tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral wakeup_signal_tests -- --nocapture
```

Expected:

- PASS with a process-local signal primitive ready for future single-node workflow wakeups.

- [ ] **Step 5: Commit the wakeup primitive**

```bash
git add api/crates/storage-ephemeral/src/lib.rs api/crates/storage-ephemeral/src/wakeup_signal.rs api/crates/storage-ephemeral/src/memory/mod.rs api/crates/storage-ephemeral/src/memory/wakeup_signal.rs api/crates/storage-ephemeral/src/_tests/wakeup_signal_tests.rs
git commit -m "feat: add storage-ephemeral wakeup signal primitive"
```

### Task 3: Document The Future Infra-Provider Seam

**Files:**
- Create: `api/crates/storage-ephemeral/README.md`

- [ ] **Step 1: Write the failing documentation assertions as a review checklist**

Prepare the README sections that must exist:

```md
# storage-ephemeral

## Capability Boundary
## Built-in Backends
## Workflow Primitives
## Why Host Extensions Cannot Provide Session Backends Yet
## Future Infra Provider Bootstrap Contract
```

- [ ] **Step 2: Run the documentation sanity check**

Run:

```bash
rg -n "Why Host Extensions Cannot Provide Session Backends Yet|Future Infra Provider Bootstrap Contract" api/crates/storage-ephemeral/README.md
```

Expected:

- FAIL because the README does not exist yet.

- [ ] **Step 3: Write the README with the bootstrap-ordering rule**

Include wording like:

```md
Host extensions are activated after `ApiState` construction and after the session backend has already been chosen. They cannot currently supply `SessionStore`, `EphemeralKvStore`, or other early startup infrastructure providers. A future `infra provider` contract must load before `app_from_config()` builds the core state.
```

- [ ] **Step 4: Re-run the documentation sanity check**

Run:

```bash
rg -n "Why Host Extensions Cannot Provide Session Backends Yet|Future Infra Provider Bootstrap Contract" api/crates/storage-ephemeral/README.md
```

Expected:

- PASS with the bootstrap seam documented explicitly for future Redis plugin work.

- [ ] **Step 5: Commit the documentation seam**

```bash
git add api/crates/storage-ephemeral/README.md
git commit -m "docs: describe storage-ephemeral bootstrap seam"
```
