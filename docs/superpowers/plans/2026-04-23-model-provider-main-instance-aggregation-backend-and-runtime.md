# Model Provider Main Instance Aggregation Backend And Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old manual-primary routing contract with provider-level main-instance aggregation settings, make child-instance inclusion explicit, and make runtime resolve real child instances from node config instead of a single provider-wide primary instance.

**Architecture:** Keep the write entry in `control-plane::model_provider`, not in routes or repositories. Add one forward-only PostgreSQL migration that drops the old routing table usage, adds provider-level aggregation settings plus per-instance inclusion, then thread the new contract through `domain`, `ports`, `storage-pg`, `control-plane`, `api-server`, and runtime compile-context code so every consumer sees the same provider-scoped virtual main-instance truth.

**Tech Stack:** Rust (`domain`, `control-plane`, `storage-pg`, `api-server`, `orchestration-runtime`), PostgreSQL migrations, `cargo test`

---

## File Structure

**Create**
- `api/crates/storage-pg/migrations/20260423093000_replace_manual_primary_with_main_instance_aggregation.sql`
- `api/crates/control-plane/src/model_provider/main_instance.rs`

**Modify**
- `api/crates/domain/src/model_provider.rs`
- `api/crates/domain/src/flow.rs`
- `api/crates/control-plane/src/model_provider.rs`
- `api/crates/control-plane/src/model_provider/catalog.rs`
- `api/crates/control-plane/src/model_provider/instances.rs`
- `api/crates/control-plane/src/model_provider/routing.rs`
- `api/crates/control-plane/src/orchestration_runtime/compile_context.rs`
- `api/crates/control-plane/src/ports/model_provider.rs`
- `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`
- `api/crates/control-plane/src/_tests/orchestration_runtime/support/repository.rs`
- `api/crates/control-plane/src/_tests/orchestration_runtime/support/fixtures.rs`
- `api/crates/storage-pg/src/mappers/model_provider_mapper.rs`
- `api/crates/storage-pg/src/model_provider_repository.rs`
- `api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs`
- `api/apps/api-server/src/routes/plugins_and_models/model_providers.rs`
- `api/apps/api-server/src/_tests/model_provider_routes.rs`

**Notes**
- Do not edit the old migration `20260422223000_create_model_provider_routings.sql`; add a new migration instead.
- Keep the old `model_provider_routings` table only if the compiler or migration chain requires it to stay on disk, but remove it from all live reads and writes in this feature.
- `enabled_model_ids` remains the source of effective child-instance models. Main-instance aggregation only changes how those per-instance models are grouped and exposed.

### Task 1: Replace Manual Primary Storage With Aggregation Settings

**Files:**
- Create: `api/crates/storage-pg/migrations/20260423093000_replace_manual_primary_with_main_instance_aggregation.sql`
- Modify: `api/crates/domain/src/model_provider.rs`
- Modify: `api/crates/control-plane/src/ports/model_provider.rs`
- Modify: `api/crates/storage-pg/src/mappers/model_provider_mapper.rs`
- Modify: `api/crates/storage-pg/src/model_provider_repository.rs`
- Modify: `api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs`

- [x] **Step 1: Write failing repository tests for provider defaults and instance inclusion**
  - Add repository coverage that round-trips:
    - provider-level `auto_include_new_instances = true`
    - provider-level `auto_include_new_instances = false`
    - child-instance `included_in_main = true`
    - child-instance `included_in_main = false`
  - Add a read-path assertion that listing instances no longer depends on `routing_mode` or `primary_instance_id`.

- [x] **Step 2: Run the repository tests and verify RED**

Run:

```bash
cargo test -p storage-pg model_provider_repository -- --nocapture
```

Expected:

- FAIL because the repository schema and mapper rows still expose `model_provider_routings` and do not persist provider-level defaults or `included_in_main`.

- [x] **Step 3: Add the forward-only migration and persistence-model changes**
  - In `20260423093000_replace_manual_primary_with_main_instance_aggregation.sql`:
    - create `model_provider_main_instances` with `workspace_id`, `provider_code`, `auto_include_new_instances`, audit columns, and a unique `(workspace_id, provider_code)` key
    - add `included_in_main boolean not null default true` to `model_provider_instances`
    - backfill one `model_provider_main_instances` row per provider family with `auto_include_new_instances = true`
    - backfill `included_in_main = true` for existing rows
  - In `domain` and `ports`:
    - add a `ModelProviderMainInstanceRecord`
    - extend instance records with `included_in_main`
    - add repository inputs for create/update/upsert main-instance settings
  - In `storage-pg`:
    - map the new columns and rows
    - add repository methods to get and upsert provider-level main-instance settings
    - stop using `upsert_routing` and `list_routings` as live writes for this feature

- [x] **Step 4: Re-run the repository tests and verify GREEN**

Run:

```bash
cargo test -p storage-pg model_provider_repository -- --nocapture
```

Expected:

- PASS with the new provider-default and `included_in_main` assertions.

Task 1 status:
- Landed in `f8d73035` and `418ce4e8`.
- Re-verified on current `HEAD` with `cargo test -p storage-pg model_provider_repository -- --nocapture` -> `7 passed; 0 failed`.

### Task 2: Rewrite Control-Plane Save And Read Flows Around Virtual Main Instances

**Files:**
- Create: `api/crates/control-plane/src/model_provider/main_instance.rs`
- Modify: `api/crates/control-plane/src/model_provider.rs`
- Modify: `api/crates/control-plane/src/model_provider/instances.rs`
- Modify: `api/crates/control-plane/src/model_provider/catalog.rs`
- Modify: `api/crates/control-plane/src/model_provider/routing.rs`
- Modify: `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`

- [x] **Step 1: Write failing service tests for the new aggregation semantics**
  - Add service tests that prove:
    - creating a child instance inherits `included_in_main` from provider-level `auto_include_new_instances`
    - updating a child instance can flip `included_in_main` without changing `enabled_model_ids`
    - provider options group models by source instance instead of collapsing to one effective instance
    - listing instances no longer marks one row as `is_primary`
    - provider-level settings can be updated without touching child-instance secrets or config

- [x] **Step 2: Run the targeted control-plane tests and verify RED**

Run:

```bash
cargo test -p control-plane model_provider -- --nocapture
```

Expected:

- FAIL because `ModelProviderInstanceView`, `ModelProviderOptionEntry`, and the service save path still assume one `primary_instance_id` and still surface `is_primary`.

- [x] **Step 3: Replace primary-instance service logic with main-instance aggregation**
  - In `model_provider.rs`:
    - remove the product-level `UpdateModelProviderRoutingCommand`
    - add commands and views for provider-level main-instance settings
    - thread `included_in_main` through create/update instance flows
  - In `instances.rs`:
    - hydrate instance views with `included_in_main`
    - stop computing `is_primary`
  - In `catalog.rs`:
    - build grouped `model_groups` from child instances filtered by `status == Ready && included_in_main`
    - keep synthetic fallback descriptors for configured IDs missing from candidate cache
  - In `routing.rs`:
    - stop resolving a provider-wide executable instance
    - keep only helpers that validate provider/instance relationships if runtime still shares the module name

- [x] **Step 4: Re-run the targeted control-plane tests and verify GREEN**

Run:

```bash
cargo test -p control-plane model_provider -- --nocapture
```

Expected:

- PASS with provider-level main-instance settings and grouped option generation.

Task 2 status:
- Working tree now includes provider-level main-instance service reads/writes, grouped `model_groups`, and child-instance `included_in_main` flow-through.
- Re-verified on current working tree with `cargo test -p control-plane model_provider -- --nocapture` -> `19 passed; 0 failed`.

### Task 3: Rewrite API Server DTOs Around Main-Instance Aggregation

**Files:**
- Modify: `api/apps/api-server/src/routes/plugins_and_models/model_providers.rs`
- Modify: `api/apps/api-server/src/_tests/model_provider_routes.rs`

- [x] **Step 1: Write failing route tests for the new request/response payloads**
  - Add route coverage that:
    - instance responses include `included_in_main`
    - instance responses no longer include `is_primary`
    - provider-level settings read/write `auto_include_new_instances`
    - the options payload returns `main_instance` summary plus grouped `model_groups`
    - the old `PUT /providers/{provider_code}/routing` contract is no longer part of the product flow

- [x] **Step 2: Run the route tests and verify RED**

Run:

```bash
cargo test -p api-server model_provider_routes -- --nocapture
```

Expected:

- FAIL because route DTOs still use `UpdateModelProviderRoutingBody`, `ModelProviderRoutingResponse`, `is_primary`, and `effective_instance_id`.

- [x] **Step 3: Replace the route contract**
  - In `model_providers.rs`:
    - remove `UpdateModelProviderRoutingBody` and the old routing response
    - add main-instance settings request/response bodies
    - extend `ModelProviderInstanceResponse` with `included_in_main`
    - replace single-instance options response fields with:
      - `main_instance`
      - `model_groups`
      - per-group `source_instance_id` and `source_instance_display_name`
  - Update route tests and OpenAPI assertions to match the new JSON shape.

- [x] **Step 4: Re-run the route tests and verify GREEN**

Run:

```bash
cargo test -p api-server model_provider_routes -- --nocapture
```

Expected:

- PASS with the new main-instance settings and grouped options contract.

Task 3 status:
- Working tree now serves `GET/PUT /providers/{provider_code}/main-instance`, returns `included_in_main`, and exposes grouped `main_instance + model_groups` option payloads.
- Canonical OpenAPI now explicitly registers both main-instance operations and their `404` error branch.
- Re-verified on current working tree with `cargo test -p api-server model_provider_routes -- --nocapture` -> `7 passed; 0 failed`.

### Task 4: Make Compile Context And Runtime Resolve Real Child Instances

**Files:**
- Modify: `api/crates/domain/src/flow.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime/compile_context.rs`
- Modify: `api/crates/control-plane/src/_tests/orchestration_runtime/support/repository.rs`
- Modify: `api/crates/control-plane/src/_tests/orchestration_runtime/support/fixtures.rs`
- Modify: `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`

- [x] **Step 1: Add failing runtime and compile-context tests**
  - Cover:
    - node config now requires `source_instance_id`
    - compile-time validation fails if `source_instance_id` is missing, belongs to another provider, is not ready, or is not aggregated
    - runtime no longer resolves a child instance from provider-wide primary routing

- [x] **Step 2: Run the targeted runtime tests and verify RED**

Run:

```bash
cargo test -p control-plane orchestration_runtime -- --nocapture
```

Expected:

- FAIL because compile context and runtime support fixtures still derive executable instances from `primary_instance_id`.

- [x] **Step 3: Rewrite compile-context and runtime lookup**
  - In `domain/src/flow.rs`, extend the LLM node provider contract with `source_instance_id`.
  - In `compile_context.rs`:
    - keep provider-family aggregation for availability checks
    - stop mapping each provider to a single executable instance
    - validate node-selected `source_instance_id` against provider ownership, readiness, inclusion, and model availability
  - Update orchestration-runtime test fixtures so node configs include explicit source-instance IDs.

- [x] **Step 4: Re-run the targeted runtime tests and verify GREEN**

Run:

```bash
cargo test -p control-plane orchestration_runtime -- --nocapture
```

Expected:

- PASS with explicit source-instance runtime resolution.

Task 4 status:
- Working tree now requires `config.model_provider.source_instance_id`, validates selected child instances against `included_in_main`, `enabled_model_ids`, and installation runnable state, and removes provider-wide runtime fallback.
- The implementation needed two omitted active-path files to complete the feature end-to-end: `api/crates/control-plane/src/orchestration_runtime.rs` and `api/crates/orchestration-runtime/src/compiler.rs`, plus compiler test coverage in `api/crates/orchestration-runtime/src/_tests/compiler_tests.rs`.
- Re-verified on current working tree with `cargo test -p control-plane orchestration_runtime -- --nocapture` -> `19 passed; 0 failed` and `cargo test -p orchestration-runtime compiler -- --nocapture` -> `8 passed; 0 failed`.

### Task 5: Close The Backend Slice With Focused Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-04-23-model-provider-main-instance-aggregation-backend-and-runtime.md`

- [x] **Step 1: Run the final backend verification set**

Run:

```bash
cargo test -p storage-pg model_provider_repository -- --nocapture
cargo test -p control-plane model_provider -- --nocapture
cargo test -p control-plane orchestration_runtime -- --nocapture
cargo test -p api-server model_provider_routes -- --nocapture
```

Expected:

- All four targeted suites pass with the new aggregation contract.

- [x] **Step 2: Update this plan with actual verification output**
  - Append a `Verification Results` section with concrete pass/fail output.

- [ ] **Step 3: Commit**

```bash
git add api/crates/storage-pg/migrations/20260423093000_replace_manual_primary_with_main_instance_aggregation.sql \
  api/crates/domain/src/model_provider.rs \
  api/crates/domain/src/flow.rs \
  api/crates/control-plane/src/model_provider.rs \
  api/crates/control-plane/src/model_provider/main_instance.rs \
  api/crates/control-plane/src/model_provider/catalog.rs \
  api/crates/control-plane/src/model_provider/instances.rs \
  api/crates/control-plane/src/model_provider/routing.rs \
  api/crates/control-plane/src/orchestration_runtime.rs \
  api/crates/control-plane/src/orchestration_runtime/compile_context.rs \
  api/crates/control-plane/src/ports/model_provider.rs \
  api/crates/control-plane/src/_tests/model_provider_service_tests.rs \
  api/crates/control-plane/src/_tests/orchestration_runtime/support/repository.rs \
  api/crates/control-plane/src/_tests/orchestration_runtime/support/fixtures.rs \
  api/crates/orchestration-runtime/src/compiler.rs \
  api/crates/orchestration-runtime/src/_tests/compiler_tests.rs \
  api/crates/storage-pg/src/mappers/model_provider_mapper.rs \
  api/crates/storage-pg/src/model_provider_repository.rs \
  api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs \
  api/apps/api-server/src/openapi.rs \
  api/apps/api-server/src/routes/plugins_and_models/model_providers.rs \
  api/apps/api-server/src/_tests/model_provider_routes.rs \
  docs/superpowers/plans/2026-04-23-model-provider-main-instance-aggregation-backend-and-runtime.md
git commit -m "feat(model-providers): add main-instance aggregation backend contract"
```

## Verification Results

- `cargo test -p storage-pg model_provider_repository -- --nocapture`
  - `7 passed; 0 failed; 0 ignored; 0 measured; 35 filtered out`
- `cargo test -p control-plane model_provider -- --nocapture`
  - `19 passed; 0 failed; 0 ignored; 0 measured; 79 filtered out`
- `cargo test -p control-plane orchestration_runtime -- --nocapture`
  - `19 passed; 0 failed; 0 ignored; 0 measured; 79 filtered out`
- `cargo test -p api-server model_provider_routes -- --nocapture`
  - `7 passed; 0 failed; 0 ignored; 0 measured; 81 filtered out`
