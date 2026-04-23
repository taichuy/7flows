# Storage Ephemeral Migration And Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the old `storage-redis` naming and consumer references, migrate docs plus env examples to the new `storage-ephemeral` vocabulary, and close the work with targeted regression plus `qa-evaluation`.

**Architecture:** This is the final cleanup plan. After the earlier plans land, the workspace and API-server should already be green on `storage-ephemeral`. This plan deletes the obsolete crate and references, updates local docs and environment examples, and runs focused regression over sign-in, session read, logout, revoke-all, workspace switch, config parsing, and memory backend startup paths. The QA closeout captures evidence under `tmp/test-governance/`.

**Tech Stack:** Rust workspace crates, markdown docs, env examples, targeted `cargo test`, `qa-evaluation`.

**Source Discussion:** Approved `storage-ephemeral` direction and the three dependent plans in this set.

---

## File Structure

**Delete**
- `api/crates/storage-redis/Cargo.toml`
- `api/crates/storage-redis/src/lib.rs`
- `api/crates/storage-redis/src/session_store.rs`
- `api/crates/storage-redis/src/in_memory_session_store.rs`
- `api/crates/storage-redis/src/_tests/mod.rs`
- `api/crates/storage-redis/src/_tests/session_store_tests.rs`

**Modify**
- `api/Cargo.toml`
- `api/Cargo.lock`
- `api/README.md`
- `api/AGENTS.md`
- `api/apps/api-server/Cargo.toml`
- `api/apps/api-server/src/_tests/support/auth.rs`
- `api/apps/api-server/src/_tests/config_tests.rs`
- `api/apps/api-server/tests/health_routes.rs`
- `api/apps/api-server/.env`
- `api/apps/api-server/.env.example`
- `api/apps/api-server/.env.production.example`
- `web/app/.env.example`

**Notes**
- This plan assumes the previous three plans are already green.
- Because this plan enters migration closeout and regression, it must finish with `qa-evaluation` artifacts in `tmp/test-governance/`.

### Task 1: Remove Old Crate References And Delete `storage-redis`

**Files:**
- Delete: `api/crates/storage-redis/**`
- Modify: `api/Cargo.toml`
- Modify: `api/Cargo.lock`
- Modify: `api/apps/api-server/Cargo.toml`

- [ ] **Step 1: Write the failing search checks**

Run the pre-delete checks:

```bash
rg -n "storage-redis|storage_redis|RedisSessionStore|InMemorySessionStore" api
```

Expected:

- FINDINGS in workspace membership, crate references, API-server imports, and docs. These are the migration targets.

- [ ] **Step 2: Delete the old crate and switch dependency names**

Apply changes like:

```toml
members = [
  ...
  "crates/storage-ephemeral",
  ...
]
```

And:

```toml
storage-ephemeral = { path = "../../crates/storage-ephemeral" }
```

- [ ] **Step 3: Re-run the search checks**

Run:

```bash
rg -n "storage-redis|storage_redis|RedisSessionStore|InMemorySessionStore" api
```

Expected:

- PASS with no code references remaining. Documentation updates may still be pending in the next task if the search is intentionally scoped to code only.

- [ ] **Step 4: Refresh the lockfile**

Run:

```bash
cargo metadata --manifest-path api/Cargo.toml --format-version 1 > /tmp/storage-ephemeral-metadata.json
cargo check --manifest-path api/Cargo.toml -p api-server
```

Expected:

- PASS with `Cargo.lock` refreshed to the new crate name and the API-server compiling against `storage-ephemeral`.

- [ ] **Step 5: Commit the crate migration**

```bash
git add api/Cargo.toml api/Cargo.lock api/apps/api-server/Cargo.toml
git add -u api/crates/storage-redis
git commit -m "refactor: replace storage-redis with storage-ephemeral"
```

### Task 2: Update Docs, AGENTS, And Env Examples

**Files:**
- Modify: `api/README.md`
- Modify: `api/AGENTS.md`
- Modify: `api/apps/api-server/.env`
- Modify: `api/apps/api-server/.env.example`
- Modify: `api/apps/api-server/.env.production.example`
- Modify: `web/app/.env.example`

- [ ] **Step 1: Write the failing doc/env search checks**

Run:

```bash
rg -n "storage-redis|API_REDIS_URL" api/README.md api/AGENTS.md api/apps/api-server/.env api/apps/api-server/.env.example api/apps/api-server/.env.production.example web/app/.env.example
```

Expected:

- FINDINGS that still describe Redis as the default or mandatory backend.

- [ ] **Step 2: Update docs and environment vocabulary**

Make the docs and env files say:

```md
- `crates/storage-ephemeral`: non-durable session and ephemeral coordination adapters
```

And replace the env contract with:

```env
API_EPHEMERAL_BACKEND=memory
# API_EPHEMERAL_REDIS_URL=redis://:1flowbase@127.0.0.1:36379
```

- [ ] **Step 3: Re-run the doc/env search checks**

Run:

```bash
rg -n "storage-redis|API_REDIS_URL" api/README.md api/AGENTS.md api/apps/api-server/.env api/apps/api-server/.env.example api/apps/api-server/.env.production.example web/app/.env.example
```

Expected:

- PASS with the new capability name and optional Redis config spelled consistently.

- [ ] **Step 4: Commit the docs and env updates**

```bash
git add api/README.md api/AGENTS.md api/apps/api-server/.env api/apps/api-server/.env.example api/apps/api-server/.env.production.example web/app/.env.example
git commit -m "docs: update storage-ephemeral naming and env examples"
```

### Task 3: Run Focused Regression And QA Closeout

**Files:**
- Modify: `api/apps/api-server/src/_tests/support/auth.rs`
- Modify: `api/apps/api-server/src/_tests/config_tests.rs`
- Modify: `api/apps/api-server/tests/health_routes.rs`
- Create: `tmp/test-governance/storage-ephemeral-qa.md`

- [ ] **Step 1: Add or update focused regression coverage**

Ensure coverage exists for:

```rust
#[tokio::test]
async fn sign_in_and_get_session_work_with_memory_backend() { ... }

#[tokio::test]
async fn logout_and_revoke_all_remove_memory_backed_sessions() { ... }

#[tokio::test]
async fn switch_workspace_rewrites_memory_backed_session_payload() { ... }
```

- [ ] **Step 2: Run the focused regression suite**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p storage-ephemeral -- --nocapture
cargo test --manifest-path api/Cargo.toml -p api-server config_tests -- --nocapture
cargo test --manifest-path api/Cargo.toml -p api-server session_routes -- --nocapture
cargo test --manifest-path api/Cargo.toml -p api-server health_routes -- --nocapture
cargo test --manifest-path api/Cargo.toml -p control-plane workspace_session -- --nocapture
cargo test --manifest-path api/Cargo.toml -p control-plane session_security -- --nocapture
```

Expected:

- PASS with memory backend as the default and session behavior green across auth, logout, revoke-all, and workspace switching.

- [ ] **Step 3: Run `qa-evaluation` and save the closeout artifact**

Create `tmp/test-governance/storage-ephemeral-qa.md` with sections:

```md
# Storage Ephemeral QA Closeout

## Scope
## Commands Run
## Results
## Residual Risks
## Decision
```

And record the exact test commands plus pass/fail outcome there.

- [ ] **Step 4: Commit the regression closeout**

```bash
git add api/apps/api-server/src/_tests/support/auth.rs api/apps/api-server/src/_tests/config_tests.rs api/apps/api-server/tests/health_routes.rs tmp/test-governance/storage-ephemeral-qa.md
git commit -m "test: close storage-ephemeral migration regression"
```
