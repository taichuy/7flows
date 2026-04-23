# Storage Durable Consumer Rewire And Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire API-server and related test support onto `storage-durable`, then delete `storage-pg` and clean the repo so only `storage-postgres` remains as the concrete implementation name.

**Architecture:** Move consumers after the new crates exist. API-server should import only `storage-durable` for main durable storage bootstrap and store typing, while implementation details remain in `storage-postgres`. Once the new path compiles and tests pass, delete the old crate and update local docs and rules in the same plan.

**Tech Stack:** Rust workspace crates, targeted `cargo test`, `cargo check`, repository grep cleanup.

**Source Discussion:** This is the deletion and adoption phase of the approved durable boundary migration.

---

## File Structure

**Modify**
- `api/apps/api-server/Cargo.toml`
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/app_state.rs`
- `api/apps/api-server/src/bin/reset_root_password.rs`
- `api/apps/api-server/tests/health_routes.rs`
- `api/apps/api-server/src/_tests/support/auth.rs`
- `api/apps/api-server/src/_tests/support/applications.rs`
- `api/apps/api-server/src/runtime_registry_sync.rs`
- `api/README.md`
- `api/AGENTS.md`
- `api/Cargo.toml`

**Delete**
- `api/crates/storage-pg/`

**Notes**
- Do not reintroduce `storage-postgres` imports into route modules or unrelated control-plane code. The host boundary should stop at `storage-durable`.

### Task 1: Rewire API-server And Test Support To `storage-durable`

**Files:**
- Modify: `api/apps/api-server/Cargo.toml`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/app_state.rs`
- Modify: `api/apps/api-server/src/bin/reset_root_password.rs`
- Modify: `api/apps/api-server/tests/health_routes.rs`
- Modify: `api/apps/api-server/src/_tests/support/auth.rs`
- Modify: `api/apps/api-server/src/_tests/support/applications.rs`

- [x] **Step 1: Make one consumer test compile against the durable boundary first**

Update `api/apps/api-server/tests/health_routes.rs` and the shared support helpers to expect the new builder:

```rust
let durable = storage_durable::build_main_durable_postgres(&config.database_url)
    .await
    .unwrap();
let store = durable.store.clone();
```

And update type imports away from `storage_pg::PgControlPlaneStore`:

```rust
use storage_durable::MainDurableStore;
```

- [x] **Step 2: Run the focused API-server tests to verify the compile break**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server --test health_routes -- --nocapture
```

Expected:

- FAIL because API-server still imports `storage_pg` directly.

- [x] **Step 3: Rewire the API-server host bootstrap**

Update `api/apps/api-server/Cargo.toml`:

```toml
storage-durable = { path = "../../crates/storage-durable" }
storage-ephemeral = { path = "../../crates/storage-ephemeral" }
```

Update `api/apps/api-server/src/lib.rs`:

```rust
use storage_durable::build_main_durable_postgres;

pub async fn app_from_config(config: &ApiConfig) -> Result<Router> {
    let durable = build_main_durable_postgres(&config.database_url).await?;
    let store = durable.store.clone();

    // existing bootstrap and runtime-engine setup follows unchanged
}
```

Update `api/apps/api-server/src/app_state.rs`:

```rust
use storage_durable::MainDurableStore;

#[derive(Clone)]
pub struct ApiState {
    pub store: MainDurableStore,
    // ...
}
```

Update `api/apps/api-server/src/bin/reset_root_password.rs` the same way:

```rust
let durable = storage_durable::build_main_durable_postgres(&config.database_url).await?;
let store = durable.store;
```

- [x] **Step 4: Run the focused API-server tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server session_routes -- --nocapture
cargo test --manifest-path api/Cargo.toml -p api-server --test health_routes -- --nocapture
```

Expected:

- PASS with API-server bootstrapping through `storage-durable`.

- [x] **Step 5: Commit the consumer rewire**

```bash
git add api/apps/api-server/Cargo.toml api/apps/api-server/src api/apps/api-server/tests
git commit -m "refactor: rewire api-server to storage-durable"
```

### Task 2: Delete `storage-pg` And Remove Old Imports

**Files:**
- Modify: `api/Cargo.toml`
- Delete: `api/crates/storage-pg`
- Modify: `api/apps/api-server/src/runtime_registry_sync.rs`
- Modify: `api/apps/api-server/src/_tests/support/auth.rs`
- Modify: `api/apps/api-server/src/_tests/support/applications.rs`

- [x] **Step 1: Measure the remaining old-name references before deletion**

Run:

```bash
rg -n "storage-pg|storage_pg" api -g '!target'
```

Expected:

- Hits in workspace membership, imports, tests, docs, and the old crate directory.

- [x] **Step 2: Remove the old crate and final old-name imports**

Delete the old workspace member from `api/Cargo.toml` and replace it with the new one only:

```toml
members = [
  "apps/api-server",
  "apps/plugin-runner",
  "crates/domain",
  "crates/control-plane",
  "crates/orchestration-runtime",
  "crates/runtime-core",
  "crates/runtime-profile",
  "crates/publish-gateway",
  "crates/access-control",
  "crates/plugin-framework",
  "crates/storage-postgres",
  "crates/storage-durable",
  "crates/storage-ephemeral",
  "crates/storage-object",
  "crates/observability"
]
```

Delete the old directory:

```bash
rm -rf api/crates/storage-pg
```

Update any straggling imports such as `runtime_registry_sync.rs` to read through `MainDurableStore` or the new concrete crate, whichever is architecturally correct for that file.

- [x] **Step 3: Re-run the old-name grep to verify cleanup**

Run:

```bash
rg -n "storage-pg|storage_pg" api -g '!target'
```

Expected:

- No hits in active code or workspace config.

- [x] **Step 4: Run focused compile and durable tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-postgres crate_name_matches_storage_postgres -- --nocapture
cargo check --manifest-path api/Cargo.toml -p api-server
```

Expected:

- PASS, confirming the repo no longer depends on `storage-pg`.

- [x] **Step 5: Commit the old-crate deletion**

```bash
git add api/Cargo.toml api/apps/api-server
git rm -r api/crates/storage-pg
git commit -m "refactor: replace storage-pg with storage-postgres"
```

### Task 3: Update Local Rules And Repository Docs To The New Names

**Files:**
- Modify: `api/README.md`
- Modify: `api/AGENTS.md`

- [ ] **Step 1: Add a docs grep check for the old durable name**

Run:

```bash
rg -n "storage-pg|storage_pg" api/README.md api/AGENTS.md
```

Expected:

- FAIL with hits showing the docs still point at the old name.

- [ ] **Step 2: Update the local docs and rules**

In `api/README.md`, change the durable crate description to:

```md
- `crates/storage-durable`: Main durable storage boundary used by API-server and other hosts
- `crates/storage-postgres`: PostgreSQL-backed repository implementations and migrations
```

In `api/AGENTS.md`, update the durable rules to:

```md
- `crates/storage-durable` 放平台主存储边界、主存储启动入口与健康检查入口。
- `crates/storage-postgres` 放 PostgreSQL `repository impl`、查询、事务、`migrations`、存储层 `mapper`。
- `crates/storage-postgres/src/*_repository.rs` 只实现存储端口，不承载 HTTP 语义。
- `storage-postgres/migrations` 只放 PostgreSQL 数据库迁移。
```

- [ ] **Step 3: Re-run the docs grep**

Run:

```bash
rg -n "storage-pg|storage_pg" api/README.md api/AGENTS.md
```

Expected:

- No hits in the local API docs or rules.

- [ ] **Step 4: Run a final API-server smoke check**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server --test health_routes -- --nocapture
```

Expected:

- PASS with docs and code pointing at the same durable boundary names.

- [ ] **Step 5: Commit the docs cleanup**

```bash
git add api/README.md api/AGENTS.md
git commit -m "docs: update durable storage boundary names"
```
