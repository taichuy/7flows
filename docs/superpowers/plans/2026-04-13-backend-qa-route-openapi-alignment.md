# Backend QA Route OpenAPI Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the exposed backend routes and `/openapi.json` truthful again by removing legacy mutation paths, documenting every public/control/runtime endpoint already in scope, and isolating OpenAPI composition from the rest of `api-server`.

**Architecture:** Keep route handlers in the existing route modules, but move OpenAPI composition into a dedicated `openapi.rs` module. Topic B lands the behavior first; this plan removes temporary aliases, annotates missing handlers, and makes `ApiDoc` the single authoritative list of current public routes.

**Tech Stack:** Rust stable, Axum, utoipa, utoipa-swagger-ui, serde_json

**Source Spec:** `docs/superpowers/specs/1flowse/2026-04-13-backend-qa-remediation-design.md`

**Approval:** User approved splitting the remediation work into multiple backend plans on `2026-04-13 14`, with this file covering topic C from the spec.

---

## Scope Notes

- This plan assumes topic B has already added the new session/password endpoints.
- This plan owns route naming and OpenAPI truthfulness. It does not own password/session semantics themselves.
- Runtime record schemas may remain generic JSON in this phase; do not attempt per-model schema generation here.

## File Structure

**Create**
- `api/apps/api-server/src/openapi.rs`
- `api/apps/api-server/src/_tests/openapi_alignment.rs`

**Modify**
- `api/apps/api-server/src/lib.rs`
- `api/apps/api-server/src/routes/session.rs`
- `api/apps/api-server/src/routes/me.rs`
- `api/apps/api-server/src/routes/members.rs`
- `api/apps/api-server/src/routes/model_definitions.rs`
- `api/apps/api-server/src/routes/runtime_models.rs`
- `api/apps/api-server/src/_tests/mod.rs`
- `api/apps/api-server/tests/health_routes.rs`

### Task 1: Move OpenAPI Composition Into A Dedicated Module

**Files:**
- Create: `api/apps/api-server/src/openapi.rs`
- Modify: `api/apps/api-server/src/lib.rs`
- Modify: `api/apps/api-server/src/routes/model_definitions.rs`
- Modify: `api/apps/api-server/src/routes/runtime_models.rs`
- Create: `api/apps/api-server/src/_tests/openapi_alignment.rs`
- Modify: `api/apps/api-server/src/_tests/mod.rs`

- [ ] **Step 1: Add failing OpenAPI coverage tests**

Create `api/apps/api-server/src/_tests/openapi_alignment.rs` with:

```rust
#[tokio::test]
async fn openapi_contains_runtime_and_model_detail_routes() {}

#[tokio::test]
async fn openapi_excludes_legacy_member_mutation_routes() {}
```

The first test must assert that `/openapi.json` contains at least:

- `/api/console/models/{id}`
- `/api/console/models/{id}/fields`
- `/api/runtime/models/{model_code}/records`
- `/api/runtime/models/{model_code}/records/{id}`
- `/api/console/session/actions/revoke-all`
- `/api/console/me/actions/change-password`

- [ ] **Step 2: Run the focused OpenAPI failures**

Run: `cargo test -p api-server openapi_contains_runtime_and_model_detail_routes -- --exact`

Expected: FAIL because `runtime_models` and most model-definition mutations are not in `ApiDoc`.

- [ ] **Step 3: Create `openapi.rs` and annotate missing routes**

Create `api/apps/api-server/src/openapi.rs` and move the `OpenApi` derive there:

```rust
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        health,
        console_health,
        routes::auth::list_providers,
        routes::auth::sign_in,
        routes::session::get_session,
        routes::session::delete_session,
        routes::session::revoke_all_sessions,
        routes::me::get_me,
        routes::me::change_password,
        routes::team::get_team,
        routes::team::patch_team,
        routes::members::list_members,
        routes::members::create_member,
        routes::members::disable_member,
        routes::members::reset_member,
        routes::members::replace_member_roles,
        routes::roles::list_roles,
        routes::roles::create_role,
        routes::roles::update_role,
        routes::roles::delete_role,
        routes::roles::get_role_permissions,
        routes::roles::replace_role_permissions,
        routes::permissions::list_permissions,
        routes::model_definitions::list_models,
        routes::model_definitions::create_model,
        routes::model_definitions::get_model,
        routes::model_definitions::update_model,
        routes::model_definitions::delete_model,
        routes::model_definitions::create_field,
        routes::model_definitions::update_field,
        routes::model_definitions::delete_field,
        routes::runtime_models::list_records,
        routes::runtime_models::get_record,
        routes::runtime_models::create_record,
        routes::runtime_models::update_record,
        routes::runtime_models::delete_record,
    ),
    ...
)]
pub struct ApiDoc;
```

Then:

- export `pub mod openapi;` from `api/apps/api-server/src/lib.rs`;
- replace `ApiDoc::openapi()` calls in `lib.rs` with `openapi::ApiDoc::openapi()`;
- add missing `#[utoipa::path]` annotations and response schemas in `routes/model_definitions.rs` and `routes/runtime_models.rs`.

For runtime routes, keep the schema generic:

```rust
#[schema(value_type = Object)]
pub struct RuntimeRecordEnvelope;
```

or equivalent `serde_json::Value` schema wrappers.

- [ ] **Step 4: Re-run the OpenAPI coverage tests**

Run: `cargo test -p api-server openapi_contains_runtime_and_model_detail_routes -- --exact`

Expected: PASS

- [ ] **Step 5: Commit the OpenAPI composition slice**

```bash
git add api/apps/api-server/src/openapi.rs api/apps/api-server/src/lib.rs api/apps/api-server/src/routes/model_definitions.rs api/apps/api-server/src/routes/runtime_models.rs api/apps/api-server/src/_tests/mod.rs api/apps/api-server/src/_tests/openapi_alignment.rs
git commit -m "refactor: isolate api server openapi composition"
```

### Task 2: Remove Legacy Mutation Paths And Lock The New Route Contract

**Files:**
- Modify: `api/apps/api-server/src/routes/members.rs`
- Modify: `api/apps/api-server/src/routes/session.rs`
- Modify: `api/apps/api-server/src/routes/me.rs`
- Modify: `api/apps/api-server/src/_tests/openapi_alignment.rs`
- Modify: `api/apps/api-server/tests/health_routes.rs`

- [ ] **Step 1: Add failing regressions for legacy route removal**

Add route assertions that:

- `/api/console/members/{id}/disable` returns `404`;
- `/api/console/members/{id}/reset-password` returns `404`;
- the action-path routes continue to return `204`;
- `/openapi.json` no longer contains the old member mutation paths.

- [ ] **Step 2: Run the focused failures**

Run: `cargo test -p api-server openapi_excludes_legacy_member_mutation_routes -- --exact`

Expected: FAIL because topic B kept temporary aliases alive.

- [ ] **Step 3: Remove the compatibility aliases**

In `api/apps/api-server/src/routes/members.rs`, keep only:

```rust
.route("/members/:id/actions/disable", post(disable_member))
.route("/members/:id/actions/reset-password", post(reset_member))
```

Do not leave silent compatibility routes behind.

If topic B added any temporary alias for `/me` or `/session`, remove those too so the final contract is exactly the remediation spec.

- [ ] **Step 4: Re-run the contract regressions**

Run: `cargo test -p api-server openapi_excludes_legacy_member_mutation_routes -- --exact`

Expected: PASS

Run: `cargo test -p api-server member_action_routes_remove_legacy_aliases -- --exact`

Expected: PASS

- [ ] **Step 5: Commit the route cleanup**

```bash
git add api/apps/api-server/src/routes/members.rs api/apps/api-server/src/routes/session.rs api/apps/api-server/src/routes/me.rs api/apps/api-server/src/_tests/openapi_alignment.rs api/apps/api-server/tests/health_routes.rs
git commit -m "fix: align backend routes with remediation contract"
```

### Task 3: Verify `/openapi.json` Against The Real Router

**Files:**
- Test: `api/apps/api-server/src/_tests/openapi_alignment.rs`
- Test: `api/apps/api-server/tests/health_routes.rs`

- [ ] **Step 1: Run the dedicated OpenAPI regressions**

Run: `cargo test -p api-server openapi_alignment -- --nocapture`

Expected: PASS

- [ ] **Step 2: Run the health and docs smoke tests**

Run: `cargo test -p api-server openapi_route_exposes_api_title -- --exact --nocapture`

Expected: PASS

Run: `cargo test -p api-server openapi_contains_runtime_and_model_detail_routes -- --exact --nocapture`

Expected: PASS

- [ ] **Step 3: Run the unified backend verification**

Run: `node scripts/node/verify-backend.js`

Expected: PASS

- [ ] **Step 4: Diff the generated contract manually**

Run: `cargo test -p api-server openapi_excludes_legacy_member_mutation_routes -- --exact --nocapture`

Expected: PASS and confirm the new action paths are the only member mutation routes.

- [ ] **Step 5: Commit the verified topic-C batch**

```bash
git add .
git commit -m "test: verify backend route openapi alignment"
```

Plan complete and saved to `docs/superpowers/plans/2026-04-13-backend-qa-route-openapi-alignment.md`.
