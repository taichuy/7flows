# Application Public API 02 Native Run Service And Public Routes Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Update the index plan after each completed task.

**Goal:** Implement Native public run APIs that execute only the active published version resolved from an application API key.

**Architecture:** Add a public Native service in control-plane that authenticates the key, loads the active publication, maps the Native envelope into a runtime input payload, and delegates execution to a published-flow run path. Public Axum routes only parse protocol fields, stream results, and map errors.

**Tech Stack:** Rust 2021, Axum, Tokio, SSE, RuntimeEventStream, SQLx/PostgreSQL, Serde, Utoipa, storage-object/file-management.

---

## Files

- Create: `api/crates/storage-durable/postgres/migrations/20260509235500_add_application_public_run_state.sql`
- Create: `api/crates/control-plane/src/application_public_api/native.rs`
- Create: `api/crates/control-plane/src/application_public_api/run_service.rs`
- Create: `api/crates/control-plane/src/application_public_api/conversations.rs`
- Create: `api/crates/control-plane/src/application_public_api/files.rs`
- Create: `api/crates/control-plane/src/application_public_api/streaming.rs`
- Create: `api/apps/api-server/src/routes/application_public_api/mod.rs`
- Create: `api/apps/api-server/src/routes/application_public_api/native.rs`
- Create: `api/apps/api-server/src/routes/application_public_api/dto.rs`
- Create: `api/apps/api-server/src/routes/application_public_api/sse.rs`
- Test: `api/crates/control-plane/src/_tests/application_public_api/native_run.rs`
- Test: `api/apps/api-server/src/_tests/application_public_api/native_routes.rs`
- Test: `api/apps/api-server/src/_tests/application_public_api/native_streaming.rs`
- Modify: `api/crates/domain/src/orchestration.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime/inputs.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime/live_debug_run/*`
- Modify: `api/crates/control-plane/src/ports/runtime.rs`
- Modify: `api/crates/storage-durable/postgres/src/orchestration_runtime_repository/*`
- Modify: `api/crates/storage-durable/postgres/src/mappers/orchestration_runtime_mapper.rs`
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/openapi.rs`

## Tasks

### Task 1: Add failing tests for Native request contracts

- [x] Add tests proving `NativeRunRequest.model` accepts any string and rejects non-string JSON values.
- [x] Add tests proving `model_target = null` keeps `model` in run metadata but does not add it to node input payload.
- [x] Add tests for `query`, `inputs`, `history`, `attachments`, `conversation`, `response_mode`, `stream_options`, `execution`, and `metadata` validation.
- [x] Add tests for `409 application_not_published` when the key's application has no active publication.
- [x] Add tests for `403` when reading a run created by a different application API key.

Run:

```bash
cargo test -p control-plane application_public_api::native_run -- --test-threads=1
cargo test -p api-server native_routes -- --test-threads=1
```

Expected: tests fail because Native run service and routes do not exist yet.

### Task 2: Add published run persistence state

- [x] Extend `FlowRunMode` with `PublishedApiRun`.
- [x] Extend the `flow_runs_run_mode_check` constraint to include `published_api_run`.
- [x] Add nullable `flow_runs` metadata columns:
  - `api_key_id uuid`.
  - `publication_version_id uuid`.
  - `external_user text`.
  - `external_conversation_id text`.
  - `external_trace_id text`.
  - `compatibility_mode text`.
  - `idempotency_key text`.
- [x] Add `application_public_conversations`:
  - `id uuid primary key`.
  - `application_id uuid not null`.
  - `api_key_id uuid not null`.
  - `external_user text not null`.
  - `external_conversation_id text not null`.
  - `created_at`, `updated_at`.
  - Unique `(application_id, api_key_id, external_user, external_conversation_id)`.
- [x] Update repository mappers to preserve the new run metadata.

Run:

```bash
cargo test -p storage-postgres orchestration_runtime_repository -- --test-threads=1
```

Expected: existing debug run persistence continues to pass and published run metadata round-trips.

### Task 3: Add Native envelope domain types and mapper

- [x] Define `NativeRunRequest` and nested value types in `application_public_api/native.rs`.
- [x] Define `NativeRunResult`, `NativeRunStatus`, `NativeRequiredAction`, `NativeUsage`, and `NativeError`.
- [x] Define attachment source variants:
  - `upload_file_id`.
  - Reserved `url`.
  - Reserved `base64`.
- [x] Implement `NativeInputMapper`:
  - Writes `query` to `query_target`.
  - Writes `model` only when `model_target` is non-null.
  - Writes `inputs`, `history`, and `attachments` only when targets are configured.
  - Preserves original `model`, execution metadata, compatibility mode, and request metadata in run metadata.
- [x] Add tests for mapping collision and null-target behavior.

Run:

```bash
cargo test -p control-plane application_public_api::native -- --test-threads=1
```

Expected: mapper produces stable runtime input payloads and never validates `model` value.

### Task 4: Add published-flow run service

- [x] Add `ApplicationPublishedRunService::start_native_run`.
- [x] Authenticate `Authorization: Bearer <application_api_key>` through `ApplicationApiKeyService`.
- [x] Check application exists, `api_enabled = true`, and active publication exists.
- [x] Use the publication's immutable compiled plan and mapping snapshot.
- [x] Add `OrchestrationRuntimeService::start_published_flow_run` rather than reusing debug-only document snapshot entry points.
- [x] Create `published_api_run` flow runs with public metadata and `created_by = api_key.creator_user_id`.
- [x] Apply idempotency by `(application_id, api_key_id, idempotency_key)` when the request supplies `execution.idempotency_key`.
- [x] Append audit metadata for `api_key_id`, `application_id`, `publication_version_id`, `creator_user_id`, external user, conversation id, trace id, response mode, and compatibility mode.
- [x] Emit audit log events for public run started, succeeded, failed, cancelled, and denied.
- [x] Return blocking result when `response_mode = blocking`.
- [x] Return initial run metadata for streaming mode.

Run:

```bash
cargo test -p control-plane application_public_api::run_service -- --test-threads=1
cargo test -p control-plane published_api_run -- --test-threads=1
```

Expected: published runs execute from frozen publication state and never read editor draft mapping.

### Task 5: Add run read, cancel, resume, and conversation binding

- [x] Add `get_native_run` that verifies the run belongs to the key-bound application and key.
- [x] Add `cancel_native_run` that calls the existing cancellation path for `published_api_run`.
- [ ] Add `resume_native_run` for callback tasks:
  - [x] Accepts `callback_task_id`.
  - [x] Validates the callback task belongs to the run.
  - [x] Converts the resume payload into the existing callback completion command.
  - [x] Supports blocking and streaming response modes.
- [x] Bind conversations by `application_id + api_key_id + conversation.user + conversation.id`.
- [x] Auto-generate an external conversation id when not provided and return it in blocking and terminal events.

Run:

```bash
cargo test -p control-plane application_public_api::conversations -- --test-threads=1
cargo test -p control-plane application_public_api::resume -- --test-threads=1
```

Expected: conversations cannot cross API keys and waiting callback resume returns a final result.

### Task 6: Add public Native routes

- [x] Add public router with:
  - `POST /api/1flowbase/runs`.
  - `GET /api/1flowbase/runs/{run_id}`.
  - `POST /api/1flowbase/runs/{run_id}/resume`.
  - `POST /api/1flowbase/runs/{run_id}/cancel`.
  - `POST /api/1flowbase/files`.
- [x] Mount the public router without `/api/console`.
- [x] `POST /api/1flowbase/files` must authenticate application key and use the same file-management/object-storage boundary as console upload, but scope the file record to the key-bound application/workspace.
- [x] Add Utoipa schemas and paths.
- [x] Map control-plane errors to Native error objects.

Run:

```bash
cargo test -p api-server native_routes -- --test-threads=1
node scripts/node/verify-openapi.js
```

Expected: public Native routes are mounted and documented without `application_id` in paths.

### Task 7: Add Native SSE streaming

- [x] Subscribe to `RuntimeEventStream` for `published_api_run`.
- [x] Convert runtime events to Native SSE event names:
  - `run.started`.
  - `message.delta`.
  - `workflow.event`.
  - `required_action`.
  - `usage.delta`.
  - `run.completed`.
  - `run.failed`.
  - `run.cancelled`.
- [x] Default `include_workflow_events` to `none`.
- [x] Emit only public workflow events when `include_workflow_events = public`.
- [x] Emit final terminal event with answer, conversation, usage, attachments, and run metadata.
- [x] Keep debug-only runtime payloads out of public SSE.

Run:

```bash
cargo test -p api-server native_streaming -- --test-threads=1
cargo test -p control-plane application_public_api::streaming -- --test-threads=1
```

Expected: streaming returns text deltas and one terminal event, and debug internals are not exposed.

## Stop Conditions

- Native run requires draft execution or editor-state reads.
- Public run must bypass `ApplicationApiKeyService`.
- Compatible adapters need to alter the core Native envelope instead of mapping into it.
- The runtime needs long-lived conversations beyond the scoped external conversation table in this slice.
