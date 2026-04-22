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
- `api/apps/api-server/src/routes/plugins.rs`
- `api/apps/api-server/src/lib.rs`
- `web/app/src/features/agent-flow/lib/llm-node-config.ts`
- `scripts/node/plugin/...`
- `scripts/node/dev-up/core.js`
- `docs/superpowers/plans/2026-04-22-residual-compatibility-cleanup-phase-four.md`

**Run**
- `cargo test --manifest-path api/Cargo.toml -p plugin-runner -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture`
- `pnpm --dir web/app test -- --run src/features/agent-flow/_tests`
- `node scripts/node/test-scripts.js`

## Task 1: Remove Remaining Runtime/Data Compatibility Shims

- [ ] **Step 1: Remove legacy model list normalization**

In `plugin-runner/src/provider_host.rs`, delete:

- `LegacyModelDescriptor`
- `legacy_model_metadata`
- the `normalize_models` branch that accepts old `code/label/family/mode`

After this change, provider model list parsing should only accept the current `model_id/display_name/...` shape.

- [ ] **Step 2: Remove legacy install naming**

Rename `legacy_manual_import` in `plugin_management` to a neutral current name such as `uploaded_manual_install`, and update persisted audit/metadata values in the same change set.

- [ ] **Step 3: Remove legacy frontend config bridge**

Delete `legacyItems` shaping in `llm-node-config.ts` once the current editor contract is the only supported shape.

## Task 2: Remove Compatibility Wording And Command Fallbacks

- [ ] **Step 1: Rewrite OpenAPI wording**

In `routes/plugins.rs`, stop describing current payloads as “compatible with future generic plugin kinds”; describe the actual current response shape instead.

- [ ] **Step 2: Rename legacy-doc router flag**

Replace `include_legacy_docs` with a neutral name that reflects the real toggle purpose.

- [ ] **Step 3: Remove script compatibility fallbacks**

Delete:

- `plugin/core.js` fallback parsing of old `plugin_code:`
- `dev-up/core.js` `docker-compose` fallback if `docker compose` is now the only supported command
- `dev-up/core.js` stale legacy brand/env migration branches that no longer match the repository identity

## Task 3: Verify And Record

- [ ] **Step 1: Run backend/runtime verification**

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-runner -- --nocapture
cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture
```

- [ ] **Step 2: Run frontend/script verification**

```bash
pnpm --dir web/app test -- --run src/features/agent-flow/_tests
node scripts/node/test-scripts.js
```

- [ ] **Step 3: Append execution notes and commit**

```bash
git add api/apps/plugin-runner/src/provider_host.rs api/crates/control-plane/src/plugin_management api/apps/api-server/src/routes/plugins.rs api/apps/api-server/src/lib.rs web/app/src/features/agent-flow/lib/llm-node-config.ts scripts/node docs/superpowers/plans/2026-04-22-residual-compatibility-cleanup-phase-four.md
git commit -m "refactor: remove residual compatibility paths"
```
