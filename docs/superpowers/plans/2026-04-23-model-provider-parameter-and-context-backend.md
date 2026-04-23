# Model Provider Parameter And Context Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `parameter_form` to the provider-level options contract, persist model-level `context_window_override_tokens` inside `configured_models`, and align backend/API fixtures so settings and Agent Flow both read one stable contract.

**Architecture:** Keep the write boundary inside `control-plane::model_provider`, not inside routes or repositories. Treat provider-level parameter schema as plugin-package metadata parsed from `provider/*.yaml`, not runtime model metadata. Treat manual context fallback as instance-owned configuration stored in `configured_models_json` and surfaced through instance DTOs and grouped provider options payloads.

**Tech Stack:** Rust (`plugin-framework`, `domain`, `control-plane`, `storage-pg`, `api-server`), PostgreSQL migrations, TypeScript shared API client, JSON contract fixtures, `cargo test`

**Source Spec:** `docs/superpowers/specs/2026-04-23-model-provider-parameter-schema-and-context-override-design.md`

---

## File Structure

**Create**
- `api/crates/storage-pg/migrations/20260423235000_add_model_provider_context_window_override.sql`

**Modify**
- `api/crates/plugin-framework/src/provider_contract.rs`
- `api/crates/plugin-framework/src/provider_package.rs`
- `api/crates/plugin-framework/src/_tests/provider_package_tests.rs`
- `api/crates/plugin-framework/src/_tests/package_intake_tests.rs`
- `api/crates/domain/src/model_provider.rs`
- `api/crates/control-plane/src/model_provider.rs`
- `api/crates/control-plane/src/model_provider/catalog.rs`
- `api/crates/control-plane/src/ports/model_provider.rs`
- `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`
- `api/crates/storage-pg/src/mappers/model_provider_mapper.rs`
- `api/crates/storage-pg/src/model_provider_repository.rs`
- `api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs`
- `api/apps/api-server/src/routes/plugins_and_models/model_providers.rs`
- `api/apps/api-server/src/_tests/model_provider_routes.rs`
- `web/packages/api-client/src/console-model-providers.ts`
- `scripts/node/testing/contracts/model-providers/options.multiple-providers.json`
- `scripts/node/testing/contracts/model-providers/catalog.multiple-providers.json`

**Notes**
- Do not keep `ProviderModelDescriptor.parameter_form` as live product truth in the host contract after this feature.
- Do not create a second persistence table for context overrides; extend `configured_models_json`.
- Keep `enabled_model_ids` derivation behavior unchanged.

### Task 1: Parse Provider-Level `parameter_form` From Provider Packages

**Files:**
- Modify: `api/crates/plugin-framework/src/provider_package.rs`
- Modify: `api/crates/plugin-framework/src/_tests/provider_package_tests.rs`
- Modify: `api/crates/plugin-framework/src/_tests/package_intake_tests.rs`
- Modify: `api/crates/plugin-framework/src/provider_contract.rs`

- [x] **Step 1: Write failing package-loading tests**
  - Add coverage that a provider YAML with `parameter_form` loads successfully into `ProviderDefinition`.
  - Add a negative test that malformed `parameter_form` fails package intake.
  - Keep one assertion that static/dynamic model descriptors no longer need to carry `parameter_form`.

- [x] **Step 2: Run the targeted plugin-framework tests and verify RED**

Run:

```bash
cargo test -p plugin-framework provider_package -- --nocapture
cargo test -p plugin-framework package_intake -- --nocapture
```

Expected:

- FAIL because `RawProviderDefinition` and `ProviderDefinition` do not parse or store `parameter_form`.

- [x] **Step 3: Add provider-level schema parsing**
  - Extend `ProviderDefinition` with `parameter_form: Option<PluginFormSchema>`.
  - Extend `RawProviderDefinition` to deserialize `parameter_form`.
  - Keep `ProviderModelDescriptor` focused on model metadata only.

- [x] **Step 4: Re-run the plugin-framework tests and verify GREEN**

Run:

```bash
cargo test -p plugin-framework provider_package -- --nocapture
cargo test -p plugin-framework package_intake -- --nocapture
```

Expected:

- PASS with provider-level schema round-trip and malformed-schema rejection.

### Task 2: Persist `context_window_override_tokens` Inside `configured_models`

**Files:**
- Create: `api/crates/storage-pg/migrations/20260423235000_add_model_provider_context_window_override.sql`
- Modify: `api/crates/domain/src/model_provider.rs`
- Modify: `api/crates/control-plane/src/ports/model_provider.rs`
- Modify: `api/crates/control-plane/src/model_provider.rs`
- Modify: `api/crates/storage-pg/src/mappers/model_provider_mapper.rs`
- Modify: `api/crates/storage-pg/src/model_provider_repository.rs`
- Modify: `api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs`
- Modify: `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`

- [x] **Step 1: Write failing persistence and service tests**
  - Add repository coverage that `configured_models_json` round-trips `context_window_override_tokens`.
  - Add service coverage that:
    - create/update keep numeric overrides
    - legacy `enabled_model_ids` normalization backfills `context_window_override_tokens = null`
    - empty or absent overrides do not affect enabled-model derivation

- [x] **Step 2: Run the targeted tests and verify RED**

Run:

```bash
cargo test -p storage-pg model_provider_repository -- --nocapture
cargo test -p control-plane model_provider -- --nocapture
```

Expected:

- FAIL because `ModelProviderConfiguredModel` still has only `model_id` and `enabled`.

- [x] **Step 3: Add the forward-only migration and type changes**
  - Add a migration that rewrites `configured_models_json` elements to include `"context_window_override_tokens": null` when missing.
  - Extend `domain::ModelProviderConfiguredModel` and all create/update DTO inputs with `context_window_override_tokens: Option<u64>`.
  - Keep `enabled_model_ids` derivation unchanged.

- [x] **Step 4: Re-run the targeted tests and verify GREEN**

Run:

```bash
cargo test -p storage-pg model_provider_repository -- --nocapture
cargo test -p control-plane model_provider -- --nocapture
```

Expected:

- PASS with override persistence and legacy normalization coverage.

### Task 3: Rewrite API And Shared Client DTOs Around Provider-Level Schema

**Files:**
- Modify: `api/apps/api-server/src/routes/plugins_and_models/model_providers.rs`
- Modify: `api/apps/api-server/src/_tests/model_provider_routes.rs`
- Modify: `web/packages/api-client/src/console-model-providers.ts`

- [x] **Step 1: Write failing route and client assertions**
  - Lock the console contract to:
    - `providers[*].parameter_form`
    - no `models[*].parameter_form`
    - `configured_models[*].context_window_override_tokens`

- [x] **Step 2: Run route tests and verify RED**

Run:

```bash
cargo test -p api-server model_provider_routes -- --nocapture
```

Expected:

- FAIL because route DTOs still serialize model-level `parameter_form` and do not expose the new configured-model field.

- [x] **Step 3: Replace the route and client contract**
  - Add provider-level `parameter_form` to `ModelProviderOptionResponse` and `ConsoleModelProviderOption`.
  - Remove model-level `parameter_form` from route/client descriptor types.
  - Expose `context_window_override_tokens` on configured-model request and response DTOs.

- [x] **Step 4: Re-run route tests and verify GREEN**

Run:

```bash
cargo test -p api-server model_provider_routes -- --nocapture
```

Expected:

- PASS with the new provider-level schema and configured-model payload shape.

### Task 4: Regenerate Contract Fixtures And Cross-Layer Assertions

**Files:**
- Modify: `scripts/node/testing/contracts/model-providers/options.multiple-providers.json`
- Modify: `scripts/node/testing/contracts/model-providers/catalog.multiple-providers.json`
- Modify: `api/crates/control-plane/src/model_provider/catalog.rs`
- Modify: `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`

- [x] **Step 1: Add failing fixture-driven assertions**
  - Assert provider-level `parameter_form` in options fixtures.
  - Assert `catalog` fixtures remain model-metadata-only.
  - Assert fallback model descriptors still synthesize model metadata without inventing parameter schema.

- [x] **Step 2: Run the targeted backend tests and verify RED**

Run:

```bash
cargo test -p control-plane model_provider -- --nocapture
node scripts/node/testing/contracts/model-providers/index.js
```

Expected:

- FAIL because fixtures and fallback descriptors still encode model-level `parameter_form`.

- [x] **Step 3: Update grouped options generation and fixtures**
  - Thread provider-level package schema into `ModelProviderOptionEntry`.
  - Keep fallback model descriptors `parameter_form = None`.
  - Rewrite the JSON fixtures to match the new grouped provider shape.

- [x] **Step 4: Re-run the backend and fixture checks and verify GREEN**

Run:

```bash
cargo test -p control-plane model_provider -- --nocapture
node scripts/node/testing/contracts/model-providers/index.js
```

Expected:

- PASS with stable provider-level fixture snapshots.

### Task 5: Commit The Backend Slice

**Files:**
- Modify only the files listed in Tasks 1-4

- [x] **Step 1: Stage the backend/backend-contract files**

Run:

```bash
git add api/crates/plugin-framework/src/provider_contract.rs \
  api/crates/plugin-framework/src/provider_package.rs \
  api/crates/plugin-framework/src/_tests/provider_package_tests.rs \
  api/crates/plugin-framework/src/_tests/package_intake_tests.rs \
  api/crates/storage-pg/migrations/20260423235000_add_model_provider_context_window_override.sql \
  api/crates/domain/src/model_provider.rs \
  api/crates/control-plane/src/model_provider.rs \
  api/crates/control-plane/src/model_provider/catalog.rs \
  api/crates/control-plane/src/ports/model_provider.rs \
  api/crates/control-plane/src/_tests/model_provider_service_tests.rs \
  api/crates/storage-pg/src/mappers/model_provider_mapper.rs \
  api/crates/storage-pg/src/model_provider_repository.rs \
  api/crates/storage-pg/src/_tests/model_provider_repository_tests.rs \
  api/apps/api-server/src/routes/plugins_and_models/model_providers.rs \
  api/apps/api-server/src/_tests/model_provider_routes.rs \
  web/packages/api-client/src/console-model-providers.ts \
  scripts/node/testing/contracts/model-providers/options.multiple-providers.json \
  scripts/node/testing/contracts/model-providers/catalog.multiple-providers.json
```

- [x] **Step 2: Commit the backend slice**

Run:

```bash
git commit -m "feat: move provider parameter schema to provider options"
```

Expected:

- One commit containing only backend/storage/API-client/fixture work for this slice.
