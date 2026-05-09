# Application Public API 01 Publication And API Key Core Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Update the index plan after each completed task.

**Goal:** Add the stable backend core for application API keys, API enabled state, active published versions, and mapping snapshots.

**Architecture:** Extend the existing API key repository without breaking Data Model runtime keys. Add a dedicated application-public-api service boundary in control-plane for console key management, mapping validation, publishing, and active publication lookup. Store edit-time mapping separately from immutable publication snapshots.

**Tech Stack:** Rust 2021, SQLx/PostgreSQL, Serde, UUID v7, Axum, Utoipa, existing control-plane repository traits.

---

## Files

- Create: `api/crates/storage-durable/postgres/migrations/20260509234500_create_application_public_api_core.sql`
- Create: `api/crates/domain/src/application_public_api.rs`
- Create: `api/crates/control-plane/src/application_public_api/mod.rs`
- Create: `api/crates/control-plane/src/application_public_api/api_keys.rs`
- Create: `api/crates/control-plane/src/application_public_api/publications.rs`
- Create: `api/crates/control-plane/src/application_public_api/mapping.rs`
- Create: `api/crates/control-plane/src/ports/application_public_api.rs`
- Create: `api/crates/storage-durable/postgres/src/application_public_api_repository/mod.rs`
- Create: `api/crates/storage-durable/postgres/src/application_public_api_repository/api_keys.rs`
- Create: `api/crates/storage-durable/postgres/src/application_public_api_repository/publications.rs`
- Create: `api/crates/storage-durable/postgres/src/application_public_api_repository/mapping.rs`
- Create: `api/crates/storage-durable/postgres/src/mappers/application_public_api_mapper.rs`
- Create: `api/apps/api-server/src/routes/applications/application_api.rs`
- Test: `api/crates/control-plane/src/_tests/application_public_api/mod.rs`
- Test: `api/crates/storage-durable/postgres/src/_tests/application_public_api_repository_tests.rs`
- Test: `api/apps/api-server/src/_tests/application/application_api_routes.rs`
- Modify: `api/crates/domain/src/auth.rs`
- Modify: `api/crates/domain/src/application.rs`
- Modify: `api/crates/domain/src/lib.rs`
- Modify: `api/crates/control-plane/src/auth.rs`
- Modify: `api/crates/control-plane/src/lib.rs`
- Modify: `api/crates/control-plane/src/ports/mod.rs`
- Modify: `api/crates/control-plane/src/ports/auth.rs`
- Modify: `api/crates/storage-durable/postgres/src/auth_repository.rs`
- Modify: `api/crates/storage-durable/postgres/src/lib.rs`
- Modify: `api/crates/storage-durable/postgres/src/mappers/mod.rs`
- Modify: `api/apps/api-server/src/routes/applications/mod.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/openapi.rs`

## Tasks

### Task 1: Add failing domain and storage tests

- [x] Add control-plane tests for `ApplicationApiKeyService`:
  - Create returns an `apk_` token exactly once.
  - List only returns keys created by the current actor for the current application.
  - Revoke hides the key from list and makes it unusable.
  - Root does not get a special "view every user's key" list path.
  - Data Model `dmk_` keys still authenticate for Data Model runtime only.
- [x] Add storage tests proving `api_keys.key_kind` separates `data_model_api_key` and `application_api_key`.
- [x] Add publication tests:
  - Publishing creates an immutable `application_publication_versions` record.
  - Only one active publication exists per application.
  - Public lookup returns `application_not_published` when no active publication exists.
  - Mapping validation rejects missing `query_target` and invalid selector syntax.
  - `model_target = null` is accepted.

Run:

```bash
cargo test -p control-plane application_public_api -- --test-threads=1
cargo test -p storage-postgres application_public_api_repository -- --test-threads=1
```

Expected: tests fail because the new types, tables, and services do not exist yet.

### Task 2: Add migration for API key kind, mappings, and publications

- [x] Extend `api_keys` with:
  - `key_kind text not null default 'data_model_api_key'`.
  - `application_id uuid null references applications(id) on delete cascade`.
  - Check constraint for `data_model_api_key` and `application_api_key`.
  - Check constraint requiring `application_id` when `key_kind = 'application_api_key'`.
  - Index `(application_id, creator_user_id, created_at desc, id desc)` for app key lists.
- [x] Add `application_api_mappings`:
  - `application_id uuid primary key references applications(id) on delete cascade`.
  - `mapping_config jsonb not null`.
  - `updated_by uuid not null references users(id)`.
  - `updated_at timestamptz not null default now()`.
- [x] Add `application_publication_versions`:
  - `id uuid primary key`.
  - `application_id`, `flow_id`, `flow_version_id`, `compiled_plan_id`.
  - `version_sequence bigint not null`.
  - `active boolean not null default false`.
  - `api_enabled boolean not null default true`.
  - `flow_schema_version`, `document_hash`, `document_snapshot`, `mapping_snapshot`, `runtime_profile_snapshot`, `output_selector`.
  - `created_by`, `created_at`.
  - Unique partial index `(application_id) where active`.
  - Unique index `(application_id, version_sequence)`.
- [x] Add `applications.api_enabled boolean not null default false`.

Run:

```bash
cargo test -p storage-postgres migration_smoke -- --test-threads=1
```

Expected: migration applies cleanly and existing Data Model API key tests still pass after implementation.

### Task 3: Extend API key domain without changing Data Model runtime semantics

- [x] Add `domain::ApiKeyKind` with `DataModelApiKey` and `ApplicationApiKey`.
- [x] Extend `domain::ApiKeyRecord` with `key_kind` and `application_id`.
- [x] Extend `CreateApiKeyInput` with `key_kind` and `application_id`.
- [x] Keep `ApiKeyService::create_api_key` issuing `dmk_` Data Model keys and rejecting accidental `application_api_key` use through the old command.
- [x] Keep `ApiKeyService::authenticate_bearer_token` restricted to Data Model keys.
- [x] Add `ApplicationApiKeyService` that issues `apk_` tokens and authenticates application keys.
- [x] Add `ApplicationApiKeyActor` with:
  - `api_key_id`.
  - `application_id`.
  - `creator_user_id`.
  - `tenant_id`.
  - `workspace_id`.
  - `actor` built from the key creator and current application workspace.

Run:

```bash
cargo test -p control-plane application_public_api -- --test-threads=1
```

Expected: Data Model API key tests still use `dmk_`; application key tests use `apk_`.

### Task 4: Add application mapping and publication services

- [x] Add `ApplicationApiMappingConfig`:
  - `input.model_target: Option<String>`.
  - `input.query_target: String`.
  - `input.inputs_target: Option<String>`.
  - `input.history_target: Option<String>`.
  - `input.attachments_target: Option<String>`.
  - `output.answer_selector: Option<String>`.
  - `output.usage_selector: Option<String>`.
  - `output.files_selector: Option<String>`.
  - `output.error_selector: Option<String>`.
- [x] Default mapping must use `query_target = "start.query"` and `model_target = null`.
- [x] Add selector validation that accepts dotted paths and `null`, rejects empty strings, wildcards, and array script syntax.
- [x] Add `ApplicationPublicationService::publish_active_version`:
  - Loads the current flow editor state.
  - Freezes a protected flow version or creates one from current draft if needed.
  - Builds or reuses an immutable compiled plan for the document hash.
  - Validates mapping before publishing.
  - Deactivates previous publication and inserts the new active publication in one transaction.
  - Snapshots mapping, runtime profile metadata, output selector, document, and compiled plan id.
- [x] Add `ApplicationPublicationService::set_api_enabled`.
- [x] Add `ApplicationPublicationService::load_active_publication`.

Run:

```bash
cargo test -p control-plane application_public_api::publications -- --test-threads=1
```

Expected: active publication lookup is deterministic and mapping errors block publish.

### Task 5: Add console routes for keys, mapping, and publishing

- [x] Add `api/apps/api-server/src/routes/applications/application_api.rs` with:
  - `GET /api/console/applications/{application_id}/api-keys`.
  - `POST /api/console/applications/{application_id}/api-keys`.
  - `DELETE /api/console/applications/{application_id}/api-keys/{key_id}`.
  - `GET /api/console/applications/{application_id}/api-mapping`.
  - `PUT /api/console/applications/{application_id}/api-mapping`.
  - `GET /api/console/applications/{application_id}/api-publication`.
  - `POST /api/console/applications/{application_id}/api-publications`.
  - `PATCH /api/console/applications/{application_id}/api-status`.
- [x] Use session authentication and existing application permission checks for console management.
- [x] Return full key token only in create response.
- [x] Add route tests for same-user visibility, foreign-user invisibility, revoke, publish, and API enabled state.
- [x] Register routes in `routes/applications/mod.rs`, `routes/mod.rs`, `lib.rs`, and `openapi.rs`.

Run:

```bash
cargo test -p api-server application_api_routes -- --test-threads=1
node scripts/node/verify-openapi.js
```

Expected: console routes are documented and do not change existing Data Model API key routes.

### Task 6: Update application section status

- [x] Change application API section from planned-only status to active status when API keys, mapping, and active publication exist.
- [x] Keep `credential_kind = application_api_key`.
- [x] Keep `invoke_routing_mode = api_key_bound_application`.
- [x] Set `invoke_path_template` to `/api/1flowbase/runs`.
- [x] Add tests in application domain, mapper, and API route fixtures.

Run:

```bash
cargo test -p control-plane application -- --test-threads=1
cargo test -p storage-postgres application_mapper -- --test-threads=1
cargo test -p api-server application_routes -- --test-threads=1
```

Expected: API section reflects the new core without exposing `application_id` in public URL templates.

## Stop Conditions

- Publishing needs gray release, multi-active versions, or explicit version selection.
- Application API keys need root-global list visibility inside app key management.
- Mapping requires runtime samples or live node execution to validate.
- `model` is requested as a provider model, serving id, or route key instead of a pass-through string.
