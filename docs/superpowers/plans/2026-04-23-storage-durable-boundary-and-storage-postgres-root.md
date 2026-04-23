# Storage Durable Boundary And Storage Postgres Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `storage-durable` as the main durable capability boundary, create `storage-postgres` as the renamed PostgreSQL implementation crate, and freeze a thin, stable public surface before any consumer rewires begin.

**Architecture:** Create the new crate names first while keeping behavior identical to today. `storage-postgres` takes over the current `storage-pg` implementation surface, and `storage-durable` stays thin by exposing only backend kind, main runtime composition, and PostgreSQL bootstrap helpers. No API-server or control-plane consumer moves happen in this plan.

**Tech Stack:** Rust workspace crates, `sqlx`, targeted `cargo test`.

**Source Discussion:** Approved by the current “主存储与外部数据源平台设计” spec; main repo officially supports PostgreSQL only.

---

## File Structure

**Create**
- `api/crates/storage-durable/Cargo.toml`
- `api/crates/storage-durable/src/lib.rs`
- `api/crates/storage-durable/src/backend_kind.rs`
- `api/crates/storage-durable/src/runtime.rs`
- `api/crates/storage-durable/src/_tests/mod.rs`
- `api/crates/storage-durable/src/_tests/runtime_tests.rs`
- `api/crates/storage-postgres/Cargo.toml`
- `api/crates/storage-postgres/src/_tests/crate_smoke_tests.rs`

**Move / Copy**
- `api/crates/storage-pg/src` -> `api/crates/storage-postgres/src`
- `api/crates/storage-pg/migrations` -> `api/crates/storage-postgres/migrations`

**Modify**
- `api/Cargo.toml`
- `api/crates/storage-postgres/src/lib.rs`
- `api/crates/storage-postgres/src/_tests/mod.rs`

**Notes**
- Keep `api/crates/storage-pg` in place until the next plan finishes consumer rewires.
- `storage-durable` must not expose SQLx pool types or migration directory paths.

### Task 1: Create The New `storage-postgres` Crate Root

**Files:**
- Create: `api/crates/storage-postgres/Cargo.toml`
- Create: `api/crates/storage-postgres/src/_tests/crate_smoke_tests.rs`
- Modify: `api/Cargo.toml`
- Modify: `api/crates/storage-postgres/src/lib.rs`
- Modify: `api/crates/storage-postgres/src/_tests/mod.rs`

- [x] **Step 1: Write the failing smoke test for the renamed crate**

Create `api/crates/storage-postgres/src/_tests/crate_smoke_tests.rs`:

```rust
#[test]
fn crate_name_matches_storage_postgres() {
    assert_eq!(storage_postgres::crate_name(), "storage-postgres");
}
```

And wire it in `api/crates/storage-postgres/src/_tests/mod.rs`:

```rust
mod crate_smoke_tests;
```

- [x] **Step 2: Run the focused test to verify it fails**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-postgres crate_name_matches_storage_postgres -- --nocapture
```

Expected:

- FAIL because `storage-postgres` is not yet a workspace member or crate.

- [x] **Step 3: Copy the current PostgreSQL implementation into the new crate name**

Create `api/crates/storage-postgres/Cargo.toml` from the current `storage-pg` manifest, but change the package name:

```toml
[package]
name = "storage-postgres"
version.workspace = true
edition.workspace = true
license.workspace = true
```

Update the new `src/lib.rs` public root:

```rust
extern crate self as storage_postgres;

pub mod application_repository;
pub mod auth_repository;
mod connection;
pub mod flow_repository;
pub mod mappers;
pub mod member_repository;
pub mod model_definition_repository;
pub mod model_provider_repository;
pub mod node_contribution_repository;
pub mod orchestration_runtime_repository;
pub mod physical_schema_repository;
pub mod plugin_repository;
pub mod plugin_worker_repository;
pub mod repositories;
pub mod role_repository;
pub mod runtime_record_repository;
pub mod workspace_repository;

pub use connection::connect;
pub use repositories::PgControlPlaneStore;

pub fn crate_name() -> &'static str {
    "storage-postgres"
}
```

Also add `storage-postgres` to `api/Cargo.toml` workspace members without deleting `storage-pg` yet.

- [x] **Step 4: Re-run the focused crate smoke test**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-postgres crate_name_matches_storage_postgres -- --nocapture
```

Expected:

- PASS with the new crate name resolved and exported.

- [x] **Step 5: Commit the renamed PostgreSQL root**

```bash
git add api/Cargo.toml api/crates/storage-postgres
git commit -m "feat: add storage-postgres crate root"
```

### Task 2: Introduce The Thin `storage-durable` Capability Crate

**Files:**
- Create: `api/crates/storage-durable/Cargo.toml`
- Create: `api/crates/storage-durable/src/lib.rs`
- Create: `api/crates/storage-durable/src/backend_kind.rs`
- Create: `api/crates/storage-durable/src/runtime.rs`
- Create: `api/crates/storage-durable/src/_tests/mod.rs`
- Create: `api/crates/storage-durable/src/_tests/runtime_tests.rs`
- Modify: `api/Cargo.toml`

- [x] **Step 1: Write the failing public-surface tests**

Create `api/crates/storage-durable/src/_tests/runtime_tests.rs`:

```rust
use storage_durable::{build_main_durable_postgres, DurableBackendKind, MainDurableStore};

#[test]
fn durable_backend_kind_parses_postgres() {
    assert_eq!(
        DurableBackendKind::from_env_value("postgres").unwrap().as_str(),
        "postgres"
    );
}

#[test]
fn main_durable_store_alias_points_at_storage_postgres() {
    let type_name = std::any::type_name::<MainDurableStore>();
    assert!(type_name.contains("storage_postgres"));
}

#[test]
fn postgres_builder_is_part_of_public_surface() {
    let _ = build_main_durable_postgres;
}
```

Wire it in `api/crates/storage-durable/src/_tests/mod.rs`:

```rust
mod runtime_tests;
```

- [x] **Step 2: Run the focused test to verify it fails**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-durable runtime_tests -- --nocapture
```

Expected:

- FAIL because the crate and exports do not exist yet.

- [x] **Step 3: Implement the durable capability surface**

Create `api/crates/storage-durable/src/backend_kind.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurableBackendKind {
    Postgres,
}

impl DurableBackendKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Postgres => "postgres",
        }
    }

    pub fn from_env_value(value: &str) -> anyhow::Result<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "postgres" => Ok(Self::Postgres),
            other => Err(anyhow::anyhow!("unsupported durable backend: {other}")),
        }
    }
}
```

Create `api/crates/storage-durable/src/runtime.rs`:

```rust
pub type MainDurableStore = storage_postgres::PgControlPlaneStore;

#[derive(Clone)]
pub struct MainDurableRuntime {
    pub kind: DurableBackendKind,
    pub store: MainDurableStore,
}

pub async fn build_main_durable_postgres(
    database_url: &str,
) -> anyhow::Result<MainDurableRuntime> {
    let pool = storage_postgres::connect(database_url).await?;
    storage_postgres::run_migrations(&pool).await?;

    Ok(MainDurableRuntime {
        kind: DurableBackendKind::Postgres,
        store: storage_postgres::PgControlPlaneStore::new(pool),
    })
}
```

Create `api/crates/storage-durable/src/lib.rs`:

```rust
extern crate self as storage_durable;

mod backend_kind;
mod runtime;

pub use backend_kind::DurableBackendKind;
pub use runtime::{build_main_durable_postgres, MainDurableRuntime, MainDurableStore};

pub fn crate_name() -> &'static str {
    "storage-durable"
}
```

- [x] **Step 4: Re-run the durable crate tests**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-durable runtime_tests -- --nocapture
```

Expected:

- PASS with `DurableBackendKind`, `MainDurableStore`, and the PostgreSQL builder exported.

- [x] **Step 5: Commit the durable capability crate**

```bash
git add api/Cargo.toml api/crates/storage-durable
git commit -m "feat: add storage-durable capability crate"
```

### Task 3: Freeze The Public Durable Surface Against Drift

**Files:**
- Modify: `api/crates/storage-durable/src/lib.rs`
- Modify: `api/crates/storage-durable/src/_tests/runtime_tests.rs`
- Modify: `api/crates/storage-postgres/src/lib.rs`

- [x] **Step 1: Extend the tests so the public names are explicit**

Add to `api/crates/storage-durable/src/_tests/runtime_tests.rs`:

```rust
#[test]
fn durable_crate_name_and_postgres_crate_name_are_stable() {
    assert_eq!(storage_durable::crate_name(), "storage-durable");
    assert_eq!(storage_postgres::crate_name(), "storage-postgres");
}
```

- [x] **Step 2: Run the new public-surface check**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-durable durable_crate_name_and_postgres_crate_name_are_stable -- --nocapture
```

Expected:

- PASS, or FAIL if the crates still leak old names.

- [x] **Step 3: Remove any temporary export noise**

Keep the public durable surface limited to:

```rust
pub use backend_kind::DurableBackendKind;
pub use runtime::{build_main_durable_postgres, MainDurableRuntime, MainDurableStore};
```

And keep the PostgreSQL implementation crate surface limited to the existing concrete exports:

```rust
pub use connection::connect;
pub use repositories::PgControlPlaneStore;
pub async fn run_migrations(pool: &PgPool) -> Result<()>;
```

- [x] **Step 4: Run both new crate suites**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-durable -- --nocapture
cargo test --manifest-path api/Cargo.toml -p storage-postgres crate_name_matches_storage_postgres -- --nocapture
```

Expected:

- PASS with the new boundary names frozen before consumers move.

- [x] **Step 5: Commit the frozen public surface**

```bash
git add api/crates/storage-durable api/crates/storage-postgres
git commit -m "refactor: freeze durable storage public surface"
```
