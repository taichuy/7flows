# Storage Ephemeral Session And Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire session storage onto `storage-ephemeral`, make memory the default single-node backend, keep Redis optional, and add config plus expiry behavior that works for both memory and Redis-backed session storage.

**Architecture:** Keep `SessionStore` as the business-facing control-plane port. Implement session adapters inside `storage-ephemeral`, build `ApiState` from a config-selected backend, and parse `API_EPHEMERAL_BACKEND` plus optional Redis connection settings. Session expiry must no longer rely exclusively on Redis key eviction; the memory path must reject expired sessions on read.

**Tech Stack:** Rust (`storage-ephemeral`, `control-plane`, `api-server`), env config parsing, targeted `cargo test`.

**Source Discussion:** Approved `storage-ephemeral` direction and the existing `SessionStore` contract in `control-plane`.

---

## File Structure

**Create**
- `api/crates/storage-ephemeral/src/session_store.rs`
- `api/crates/storage-ephemeral/src/memory/session_store.rs`
- `api/crates/storage-ephemeral/src/redis/mod.rs`
- `api/crates/storage-ephemeral/src/redis/session_store.rs`
- `api/crates/storage-ephemeral/src/_tests/session_store_tests.rs`

**Modify**
- `api/crates/storage-ephemeral/Cargo.toml`
- `api/crates/storage-ephemeral/src/lib.rs`
- `api/crates/storage-ephemeral/src/memory/mod.rs`
- `api/apps/api-server/Cargo.toml`
- `api/apps/api-server/src/config.rs`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/app_state.rs`
- `api/apps/api-server/src/middleware/require_session.rs`
- `api/apps/api-server/src/_tests/config_tests.rs`
- `api/apps/api-server/src/_tests/support/auth.rs`
- `api/apps/api-server/tests/health_routes.rs`
- `api/apps/api-server/.env.example`
- `api/apps/api-server/.env.production.example`
- `web/app/.env.example`

**Notes**
- This plan still keeps `storage-redis` present in the workspace while rewiring consumers. Deletion happens in the final migration plan.
- Proposed config draft:
  - `API_EPHEMERAL_BACKEND=memory|redis`
  - `API_EPHEMERAL_REDIS_URL=redis://...` only when backend is `redis`
  - `API_SESSION_TTL_DAYS` remains the session lifetime input

### Task 1: Add RED Tests For Config-Driven Backend Selection

**Files:**
- Modify: `api/apps/api-server/src/config.rs`
- Modify: `api/apps/api-server/src/_tests/config_tests.rs`

- [ ] **Step 1: Write the failing config tests**

Add tests like:

```rust
#[test]
fn api_config_defaults_ephemeral_backend_to_memory() {
    let config = ApiConfig::from_env_map(&base_env_without_ephemeral_backend()).unwrap();

    assert_eq!(config.ephemeral_backend.as_str(), "memory");
    assert_eq!(config.ephemeral_redis_url, None);
}

#[test]
fn api_config_requires_redis_url_when_ephemeral_backend_is_redis() {
    let error = ApiConfig::from_env_map(&base_env_with_backend("redis")).unwrap_err();

    assert!(error.to_string().contains("API_EPHEMERAL_REDIS_URL"));
}
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server config_tests -- --nocapture
```

Expected:

- FAIL because `ApiConfig` does not yet expose an ephemeral backend selection surface.

- [ ] **Step 3: Add backend selection config**

Extend config with fields like:

```rust
pub struct ApiConfig {
    ...
    pub ephemeral_backend: storage_ephemeral::EphemeralBackendKind,
    pub ephemeral_redis_url: Option<String>,
}
```

Parse them with rules like:

```rust
let ephemeral_backend = map
    .get("API_EPHEMERAL_BACKEND")
    .map(String::as_str)
    .map(storage_ephemeral::EphemeralBackendKind::from_env_value)
    .transpose()?
    .unwrap_or(storage_ephemeral::EphemeralBackendKind::Memory);

let ephemeral_redis_url = match ephemeral_backend {
    storage_ephemeral::EphemeralBackendKind::Memory => None,
    storage_ephemeral::EphemeralBackendKind::Redis => Some(get("API_EPHEMERAL_REDIS_URL")?),
};
```

- [ ] **Step 4: Re-run the config tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server config_tests -- --nocapture
```

Expected:

- PASS with `memory` as the default and Redis config required only when explicitly selected.

- [ ] **Step 5: Commit the config contract**

```bash
git add api/apps/api-server/src/config.rs api/apps/api-server/src/_tests/config_tests.rs api/apps/api-server/.env.example api/apps/api-server/.env.production.example web/app/.env.example
git commit -m "feat: add storage-ephemeral backend config"
```

### Task 2: Implement Session Adapters In `storage-ephemeral`

**Files:**
- Create: `api/crates/storage-ephemeral/src/session_store.rs`
- Create: `api/crates/storage-ephemeral/src/memory/session_store.rs`
- Create: `api/crates/storage-ephemeral/src/redis/mod.rs`
- Create: `api/crates/storage-ephemeral/src/redis/session_store.rs`
- Create: `api/crates/storage-ephemeral/src/_tests/session_store_tests.rs`
- Modify: `api/crates/storage-ephemeral/Cargo.toml`
- Modify: `api/crates/storage-ephemeral/src/lib.rs`
- Modify: `api/crates/storage-ephemeral/src/memory/mod.rs`

- [ ] **Step 1: Write failing session-store tests**

Create tests like:

```rust
use control_plane::ports::SessionStore;
use storage_ephemeral::MemorySessionStore;

#[tokio::test]
async fn memory_session_store_drops_expired_session_on_get() {
    let store = MemorySessionStore::new("flowbase:test");
    let expired = fixture_session_with_expiry(time::OffsetDateTime::now_utc().unix_timestamp() - 1);

    store.put(expired).await.unwrap();

    assert!(store.get("session-1").await.unwrap().is_none());
}

#[tokio::test]
async fn memory_session_store_touch_extends_expiry() {
    let store = MemorySessionStore::new("flowbase:test");
    let session = fixture_session_with_expiry(time::OffsetDateTime::now_utc().unix_timestamp() + 10);

    store.put(session.clone()).await.unwrap();
    store.touch(&session.session_id, session.expires_at_unix + 60).await.unwrap();

    assert!(store.get(&session.session_id).await.unwrap().is_some());
}
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral session_store_tests -- --nocapture
```

Expected:

- FAIL because the new crate does not yet implement `SessionStore`.

- [ ] **Step 3: Implement memory and Redis session adapters**

Use shapes like:

```rust
pub struct MemorySessionStore {
    kv: MemoryKvStore,
}

pub struct RedisSessionStore {
    manager: redis::aio::ConnectionManager,
    key_prefix: String,
}
```

Memory `get` must explicitly enforce expiry:

```rust
let Some(session) = self.read_session(session_id).await? else {
    return Ok(None);
};
if session.expires_at_unix <= time::OffsetDateTime::now_utc().unix_timestamp() {
    self.delete(session_id).await?;
    return Ok(None);
}
Ok(Some(session))
```

- [ ] **Step 4: Re-run the session-store tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral session_store_tests -- --nocapture
```

Expected:

- PASS with memory expiry behavior covered inside the store rather than only in Redis TTL.

- [ ] **Step 5: Commit the session adapters**

```bash
git add api/crates/storage-ephemeral/Cargo.toml api/crates/storage-ephemeral/src/lib.rs api/crates/storage-ephemeral/src/session_store.rs api/crates/storage-ephemeral/src/memory api/crates/storage-ephemeral/src/redis api/crates/storage-ephemeral/src/_tests/session_store_tests.rs
git commit -m "feat: add storage-ephemeral session adapters"
```

### Task 3: Rewire API Server Consumers To The New Backend Selection

**Files:**
- Modify: `api/apps/api-server/Cargo.toml`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/app_state.rs`
- Modify: `api/apps/api-server/src/middleware/require_session.rs`
- Modify: `api/apps/api-server/src/_tests/support/auth.rs`
- Modify: `api/apps/api-server/tests/health_routes.rs`

- [ ] **Step 1: Write failing integration tests for memory-backed session flow**

Add tests like:

```rust
#[tokio::test]
async fn app_from_config_supports_memory_ephemeral_backend() {
    let config = test_config_with_ephemeral_backend("memory");
    let app = crate::app_from_config(&config).await.unwrap();

    let response = app.oneshot(sign_in_request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn expired_memory_session_is_rejected_by_require_session() {
    let app = build_test_app_with_memory_session_store();
    seed_expired_memory_session(&app).await;

    let response = app.oneshot(get_session_request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server session_routes -- --nocapture
cargo test --manifest-path api/Cargo.toml -p api-server health_routes -- --nocapture
```

Expected:

- FAIL because `api-server` still imports `storage_redis` directly and always constructs `RedisSessionStore`.

- [ ] **Step 3: Rewire the session handle**

Change the state wiring to shapes like:

```rust
pub enum SessionStoreHandle {
    Memory(storage_ephemeral::MemorySessionStore),
    Redis(Box<storage_ephemeral::RedisSessionStore>),
}
```

And construct it from config:

```rust
let session_store = match config.ephemeral_backend {
    storage_ephemeral::EphemeralBackendKind::Memory => {
        SessionStoreHandle::Memory(storage_ephemeral::MemorySessionStore::new("flowbase:console:session"))
    }
    storage_ephemeral::EphemeralBackendKind::Redis => {
        SessionStoreHandle::Redis(Box::new(
            storage_ephemeral::RedisSessionStore::new(
                config.ephemeral_redis_url.as_deref().unwrap(),
                "flowbase:console:session",
            ).await?,
        ))
    }
};
```

- [ ] **Step 4: Re-run the focused API tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server config_tests -- --nocapture
cargo test --manifest-path api/Cargo.toml -p api-server session_routes -- --nocapture
cargo test --manifest-path api/Cargo.toml -p api-server health_routes -- --nocapture
```

Expected:

- PASS with memory as the default single-node backend and Redis only selected when configured.

- [ ] **Step 5: Commit the API-server rewire**

```bash
git add api/apps/api-server/Cargo.toml api/apps/api-server/src/lib.rs api/apps/api-server/src/app_state.rs api/apps/api-server/src/middleware/require_session.rs api/apps/api-server/src/_tests/support/auth.rs api/apps/api-server/tests/health_routes.rs
git commit -m "feat: rewire session storage onto storage-ephemeral"
```
