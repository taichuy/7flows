# Application Public API 03 OpenAI And Anthropic Compatible Adapters Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Update the index plan after each completed task.

**Goal:** Add OpenAI `/v1/chat/completions` and Anthropic `/v1/messages` compatibility endpoints as adapters over Native public runs.

**Architecture:** Compatibility code is adapter-only. It parses third-party request shapes, rejects unsupported v1 features early, maps supported fields into `NativeRunRequest`, calls the Native run service, then maps Native blocking or streaming results back into the third-party protocol shape.

**Tech Stack:** Rust 2021, Axum, Serde, SSE, RuntimeEventStream, Utoipa/OpenAPI.

---

## Files

- Create: `api/crates/control-plane/src/application_public_api/compat/mod.rs`
- Create: `api/crates/control-plane/src/application_public_api/compat/openai.rs`
- Create: `api/crates/control-plane/src/application_public_api/compat/anthropic.rs`
- Create: `api/apps/api-server/src/routes/application_public_api/openai.rs`
- Create: `api/apps/api-server/src/routes/application_public_api/anthropic.rs`
- Test: `api/crates/control-plane/src/_tests/application_public_api/openai_compat.rs`
- Test: `api/crates/control-plane/src/_tests/application_public_api/anthropic_compat.rs`
- Test: `api/apps/api-server/src/_tests/application_public_api/compat_routes.rs`
- Modify: `api/apps/api-server/src/routes/application_public_api/mod.rs`
- Modify: `api/apps/api-server/src/openapi.rs`

## Tasks

### Task 1: Add failing adapter tests

- [x] Add OpenAI mapper tests:
  - Last user text maps to Native `query`.
  - Prior messages map to Native `history`.
  - `stream = true` maps to `response_mode = streaming`.
  - `user` maps to `conversation.user`.
  - `metadata` maps to Native `metadata`.
  - `model` maps to Native `model` exactly and is not validated.
  - `tools`, `tool_choice`, `function_call`, audio output, and multimodal generation return `unsupported_feature`.
- [x] Add Anthropic mapper tests:
  - `system` maps to system history context.
  - Last user text maps to Native `query`.
  - Prior messages map to Native `history`.
  - `stream = true` maps to `response_mode = streaming`.
  - `metadata.user_id` maps to `conversation.user`.
  - `model` maps to Native `model` exactly and is not validated.
  - `tools`, `tool_choice`, tool result blocks, and computer use return `unsupported_feature`.

Run:

```bash
cargo test -p control-plane openai_compat -- --test-threads=1
cargo test -p control-plane anthropic_compat -- --test-threads=1
```

Expected: tests fail because adapters do not exist yet.

### Task 2: Implement OpenAI compatible mapper and error model

- [x] Define OpenAI adapter parser and error model for Chat Completions v1 text-chat subset.
- [x] Convert text content parts and plain string content into Native text history.
- [x] Reject OpenAI image/file/audio/multimodal content outside the v1 text-chat subset with `unsupported_feature`; URL/base64 file conversion remains reserved for the later multimodal slice.
- [x] Reject unsupported features with:

```json
{
  "error": {
    "message": "tools is not supported by this endpoint",
    "type": "invalid_request_error",
    "param": "tools",
    "code": "unsupported_feature"
  }
}
```

- [x] Map Native errors into OpenAI error objects.
- [x] Add response DTOs for blocking chat completion object and streaming chunk.

Run:

```bash
cargo test -p control-plane openai_compat -- --test-threads=1
```

Expected: supported fields map to Native and unsupported features never reach Native run service.

### Task 3: Implement Anthropic compatible mapper and error model

- [x] Define Anthropic adapter parser and error model for v1 text-chat subset.
- [x] Convert text content blocks into Native text history.
- [x] Reject Anthropic image/document/tool/computer-use blocks outside the v1 text-chat subset with `unsupported_feature`; URL/base64 file conversion remains reserved for the later multimodal slice.
- [x] Accept `Authorization: Bearer <key>` and `x-api-key: <key>` at the route layer.
- [x] Reject unsupported features with:

```json
{
  "type": "error",
  "error": {
    "type": "unsupported_feature",
    "message": "tools is not supported by this endpoint"
  }
}
```

- [x] Map Native errors into Anthropic error objects.
- [x] Add response DTOs for blocking message object and streaming event stream.

Run:

```bash
cargo test -p control-plane anthropic_compat -- --test-threads=1
```

Expected: supported fields map to Native and Anthropic errors follow Anthropic object shape.

### Task 4: Add compatible public routes

- [x] Add `POST /v1/chat/completions`.
- [x] Add `POST /v1/messages`.
- [x] Mount both routes at the root public router, not under `/api/console`.
- [x] Reuse Native authentication and Native run service.
- [x] Add route tests for:
  - Missing/invalid key.
  - No active publication.
  - Blocking success.
  - Streaming success.
  - Unsupported feature error shape.
  - Anthropic `x-api-key` authentication.
- [x] Register Utoipa paths and schemas.

Run:

```bash
cargo test -p api-server openai_routes -- --test-threads=1
cargo test -p api-server anthropic_routes -- --test-threads=1
node scripts/node/verify-openapi.js
```

Expected: compatible routes are mounted at `/v1/*` and documented as application-key-routed endpoints.

### Task 5: Add streaming protocol translators

- [x] Translate Native `message.delta` into OpenAI `chat.completion.chunk` deltas.
- [x] Translate Native terminal event into OpenAI final chunk and `[DONE]`.
- [x] Translate Native `message.delta` into Anthropic `content_block_delta`.
- [x] Translate Native terminal event into Anthropic `message_delta` and `message_stop`.
- [x] Do not expose Native `workflow.event` through compatible streams.
- [x] Convert Native `required_action` waiting states into compatible errors with docs guidance to use Native API.

Run:

```bash
cargo test -p api-server openai_routes -- --test-threads=1
cargo test -p api-server anthropic_routes -- --test-threads=1
```

Expected: streaming output can be consumed as standard OpenAI or Anthropic event streams.

## Verification Evidence

- `cargo test -p control-plane openai_compat -- --test-threads=1` passed: 11 tests.
- `cargo test -p control-plane anthropic_compat -- --test-threads=1` passed: 10 tests.
- `cargo test -p api-server compat_routes -- --test-threads=1` passed: 6 tests.
- `node scripts/node/verify-openapi.js` passed.

## Stop Conditions

- OpenAI or Anthropic tools/function calling must be supported in v1.
- Compatible endpoints need to return public workflow events.
- Compatible endpoints need to resume waiting callback states.
- `model` is requested to be validated against provider/model registry instead of passed to Native.
