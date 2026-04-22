# Backend Boundary Normalization Phase Three Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize oversized backend boundary owners by splitting `ports.rs`, grouping `api-server` routes, and reducing route-test support sprawl.

**Architecture:** Keep route paths and service interfaces stable while physically reorganizing module ownership. First split `ports.rs` into domain-specific port modules. Then group route modules by domain under `api-server/src/routes/`. Finally split `api-server/src/_tests/support.rs` so route fixtures stop accumulating in one file.

**Tech Stack:** Rust modules, `control-plane`, `api-server`, cargo test.

---

## File Structure

**Modify**
- `api/crates/control-plane/src/lib.rs`
- `api/apps/api-server/src/routes/mod.rs`
- `api/apps/api-server/src/_tests/mod.rs`
- `docs/superpowers/plans/2026-04-22-backend-boundary-normalization-phase-three.md`

**Create**
- `api/crates/control-plane/src/ports/mod.rs`
- `api/crates/control-plane/src/ports/application.rs`
- `api/crates/control-plane/src/ports/flow.rs`
- `api/crates/control-plane/src/ports/plugin.rs`
- `api/crates/control-plane/src/ports/model_provider.rs`
- `api/crates/control-plane/src/ports/runtime.rs`
- `api/crates/control-plane/src/ports/auth.rs`
- `api/apps/api-server/src/routes/applications/mod.rs`
- `api/apps/api-server/src/routes/identity/mod.rs`
- `api/apps/api-server/src/routes/settings/mod.rs`
- `api/apps/api-server/src/routes/plugins_and_models/mod.rs`
- `api/apps/api-server/src/_tests/support/mod.rs`
- `api/apps/api-server/src/_tests/support/auth.rs`
- `api/apps/api-server/src/_tests/support/applications.rs`
- `api/apps/api-server/src/_tests/support/plugins.rs`
- `api/apps/api-server/src/_tests/support/packages.rs`

**Delete**
- `api/crates/control-plane/src/ports.rs`
- `api/apps/api-server/src/_tests/support.rs`

**Run**
- `cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p api-server -- --nocapture`
- `node scripts/node/test-backend.js`

## Task 1: Split Control Plane Ports

**Files:**
- Delete: `api/crates/control-plane/src/ports.rs`
- Create: `api/crates/control-plane/src/ports/*.rs`

- [ ] **Step 1: Create `ports/mod.rs` façade**

Expose the same public names through grouped submodules:

```rust
mod application;
mod auth;
mod flow;
mod model_provider;
mod plugin;
mod runtime;

pub use application::*;
pub use auth::*;
pub use flow::*;
pub use model_provider::*;
pub use plugin::*;
pub use runtime::*;
```

- [ ] **Step 2: Move traits by domain**

Use these buckets:

- `application.rs`: `ApplicationRepository` and related DTO inputs
- `flow.rs`: `FlowRepository`, orchestration editor/save inputs
- `plugin.rs`: plugin installation/assignment/task and node contribution ports
- `model_provider.rs`: instance/secret/catalog cache ports
- `runtime.rs`: runtime invocation and callback/checkpoint ports
- `auth.rs`: shared auth/session/profile-facing repository traits

## Task 2: Group API Server Routes

**Files:**
- Modify: `api/apps/api-server/src/routes/mod.rs`
- Move route files under grouped subdirectories

- [ ] **Step 1: Group route modules without changing public route paths**

Use these buckets:

- `routes/applications/`: `applications`, `application_orchestration`, `application_runtime`
- `routes/identity/`: `auth`, `session`, `me`
- `routes/settings/`: `members`, `roles`, `permissions`, `workspace`, `workspaces`, `system`, `docs`
- `routes/plugins_and_models/`: `model_definitions`, `runtime_models`, `model_providers`, `node_contributions`, `plugins`

- [ ] **Step 2: Re-export through `routes/mod.rs`**

Keep the rest of the crate importing unchanged names by re-exporting the moved modules.

## Task 3: Split Route Test Support

**Files:**
- Delete: `api/apps/api-server/src/_tests/support.rs`
- Create: `api/apps/api-server/src/_tests/support/*.rs`
- Modify: `api/apps/api-server/src/_tests/mod.rs`

- [ ] **Step 1: Create grouped support module**

Use:

- `auth.rs`: sign-in/session helpers
- `applications.rs`: workspace/application fixture helpers
- `plugins.rs`: registry/plugin fixture helpers
- `packages.rs`: provider package writers / filesystem helpers

- [ ] **Step 2: Update route tests to import from `support::...`**

Keep test behavior unchanged; only fix module paths.

## Task 4: Verify And Record

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-backend-boundary-normalization-phase-three.md`

- [ ] **Step 1: Run `control-plane` tests**

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture
```

- [ ] **Step 2: Run `api-server` tests**

```bash
cargo test --manifest-path api/Cargo.toml -p api-server -- --nocapture
```

- [ ] **Step 3: Run backend aggregate gate**

```bash
node scripts/node/test-backend.js
```

- [ ] **Step 4: Append execution notes and commit**

```bash
git add api/crates/control-plane/src/ports api/apps/api-server/src/routes api/apps/api-server/src/_tests/support api/apps/api-server/src/_tests/mod.rs docs/superpowers/plans/2026-04-22-backend-boundary-normalization-phase-three.md
git commit -m "refactor: normalize backend boundary modules"
```
