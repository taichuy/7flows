# Residual Compatibility Cleanup Phase Four Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining legacy shims, compatibility names, and backward-looking wording that still leak through runtime, backend, frontend, and scripts.

**Architecture:** This phase happens after structural splits so compatibility cleanup no longer fights giant owners. The rule is strict: if a path is no longer part of the supported contract, delete or rename it instead of keeping a silent adapter. API/docs wording must match the new non-compatibility posture.

**Tech Stack:** Rust, TypeScript, Node.js, cargo test, frontend fast gate, script tests.

---

## File Structure

**Modify**
- `api/apps/plugin-runner/src/provider_host.rs`
- `api/crates/control-plane/src/plugin_management/...`
- `api/apps/api-server/src/routes/plugins_and_models/plugins.rs`
- `api/apps/api-server/src/lib.rs`
- `web/app/src/features/agent-flow/lib/llm-node-config.ts`
- `scripts/node/plugin/...`
- `scripts/node/dev-up/core.js`
- `docs/superpowers/plans/2026-04-22-residual-compatibility-cleanup-phase-four.md`

**Create**
- `web/app/src/features/agent-flow/_tests/llm-node-config.test.ts`

**Run**
- `cargo test --manifest-path api/Cargo.toml -p plugin-runner -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p api-server -- --nocapture`
- `pnpm --dir web/app test -- --run src/features/agent-flow/_tests`
- `node scripts/node/test-scripts.js`

## Task 1: Remove Remaining Runtime/Data Compatibility Shims

- [x] **Step 1: Remove legacy model list normalization**

In `plugin-runner/src/provider_host.rs`, delete:

- `LegacyModelDescriptor`
- `legacy_model_metadata`
- the `normalize_models` branch that accepts old `code/label/family/mode`

After this change, provider model list parsing should only accept the current `model_id/display_name/...` shape.

- [x] **Step 2: Remove legacy install naming**

Rename `legacy_manual_import` in `plugin_management` to a neutral current name such as `uploaded_manual_install`, and update persisted audit/metadata values in the same change set.

- [x] **Step 3: Remove legacy frontend config bridge**

Delete `legacyItems` shaping in `llm-node-config.ts` once the current editor contract is the only supported shape.

## Task 2: Remove Compatibility Wording And Command Fallbacks

- [x] **Step 1: Rewrite OpenAPI wording**

In `routes/plugins_and_models/plugins.rs`, stop describing current payloads as “compatible with future generic plugin kinds”; describe the actual current response shape instead.

- [x] **Step 2: Rename legacy-doc router flag**

Replace `include_legacy_docs` with a neutral name that reflects the real toggle purpose.

- [x] **Step 3: Remove script compatibility fallbacks**

Delete:

- `plugin/manifest.js` fallback parsing of old `plugin_code:`
- `dev-up/core.js` `docker-compose` fallback if `docker compose` is now the only supported command
- `dev-up/core.js` stale legacy brand/env migration branches that no longer match the repository identity

## Task 3: Verify And Record

- [x] **Step 1: Run backend/runtime verification**

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-runner -- --nocapture
cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture
cargo test --manifest-path api/Cargo.toml -p api-server -- --nocapture
```

- [x] **Step 2: Run frontend/script verification**

```bash
pnpm --dir web/app test -- --run src/features/agent-flow/_tests
node scripts/node/test-scripts.js
```

- [x] **Step 3: Append execution notes and commit**

```bash
git add api/apps/plugin-runner/src/provider_host.rs api/crates/control-plane/src/plugin_management api/apps/api-server/src/routes/plugins_and_models/plugins.rs api/apps/api-server/src/lib.rs web/app/src/features/agent-flow/lib/llm-node-config.ts web/app/src/features/agent-flow/_tests/llm-node-config.test.ts scripts/node docs/superpowers/plans/2026-04-22-residual-compatibility-cleanup-phase-four.md docs/superpowers/plans/2026-04-22-entropy-reduction-index.md
git commit -m "refactor: remove residual compatibility paths"
```

## Execution Notes

- Completed on `2026-04-22`.
- `plugin-runner/src/provider_host.rs` now accepts only the current `ProviderModelDescriptor` payload shape; the old `code/label/family/mode` bridge is deleted and guarded by a rejection test.
- `control-plane` renamed local/manual install semantics to `uploaded_manual_install` and now persists the install kind into installation metadata instead of leaving local installs unlabeled.
- `web/app/src/features/agent-flow/lib/llm-node-config.ts` now reads only the supported `config.model_provider` and `config.llm_parameters` contract; flat legacy provider/parameter fields are ignored.
- `api-server` plugin OpenAPI descriptions now describe the current payloads directly, and `include_legacy_docs` was renamed to the neutral `include_docs_ui`.
- `scripts/node/plugin/manifest.js` no longer parses `plugin_code:` from manifests, and `scripts/node/dev-up/core.js` no longer mutates existing env files or falls back to `docker-compose`.
- Residual note: `agent-flow` verification still prints the pre-existing React Flow / antd Tooltip / `act(...)` warnings during Vitest runs; warning cleanup remains the Phase 9 scope.

## Verification Evidence

- `cargo test --manifest-path api/Cargo.toml -p plugin-runner normalize_models_rejects_legacy_provider_descriptor_shape -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management_service_labels_local_install_with_current_install_kind -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p api-server openapi_plugin_descriptions_drop_compatibility_wording -- --nocapture`
- `node --test scripts/node/plugin/_tests/modules.test.js scripts/node/dev-up/_tests/core.test.js`
- `pnpm --dir web/app test -- --run src/features/agent-flow/_tests/llm-node-config.test.ts`
- `cargo test --manifest-path api/Cargo.toml -p plugin-runner -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p api-server -- --nocapture`
- `pnpm --dir web/app test -- --run src/features/agent-flow/_tests`
- `node scripts/node/test-scripts.js`
