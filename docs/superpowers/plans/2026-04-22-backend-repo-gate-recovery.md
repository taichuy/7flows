# Backend Repo Gate Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return `node scripts/node/verify-backend.js` to a clean green state so backend refactors can rely on the repository gate again.

**Architecture:** Keep this phase narrow and mechanical. The current blocker is formatting drift, not behavior. Normalize the reported files, rerun the local targeted tests for the touched crates, then rerun the full backend gate. If a second root cause appears after formatting, record it separately instead of silently expanding scope.

**Tech Stack:** Rust, `cargo fmt`, `cargo test`, repo-level backend verification script.

---

## File Structure

**Modify**
- `api/apps/plugin-runner/tests/provider_runtime_routes.rs`
- `api/crates/control-plane/src/model_provider.rs`
- `api/crates/control-plane/src/orchestration_runtime.rs`
- `docs/superpowers/plans/2026-04-22-backend-repo-gate-recovery.md`

**Run**
- `cargo fmt --manifest-path api/Cargo.toml --all`
- `cargo test --manifest-path api/Cargo.toml -p plugin-runner -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture`
- `node scripts/node/verify-backend.js`

## Task 1: Remove Known Formatting Drift

**Files:**
- Modify: `api/apps/plugin-runner/tests/provider_runtime_routes.rs`
- Modify: `api/crates/control-plane/src/model_provider.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`

- [ ] **Step 1: Confirm only formatting changed in the reported files**

Review the `cargo fmt --check` diff and verify it is whitespace/layout-only.

- [ ] **Step 2: Apply workspace formatting**

```bash
cargo fmt --manifest-path api/Cargo.toml --all
```

Expected:
- the formatting drift in the three reported files disappears

## Task 2: Rebuild Confidence With Targeted Tests

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-backend-repo-gate-recovery.md`

- [ ] **Step 1: Re-run `plugin-runner` tests**

```bash
cargo test --manifest-path api/Cargo.toml -p plugin-runner -- --nocapture
```

- [ ] **Step 2: Re-run `control-plane` tests**

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture
```

Expected:
- no functional regression introduced by the formatting normalization

## Task 3: Re-run The Repo Gate

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-backend-repo-gate-recovery.md`

- [ ] **Step 1: Re-run the backend aggregate gate**

```bash
node scripts/node/verify-backend.js
```

Expected:
- green backend repo gate

- [ ] **Step 2: Record any second-order failures explicitly**

If `verify-backend` fails again for a different reason, record:

- the failing command
- the new root cause
- whether it blocks Phase 3 owner splits

