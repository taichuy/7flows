# Test Support Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce backend test-support entropy by splitting the two oversized `control-plane` support owners and lowering `_tests` directory pressure.

**Architecture:** Keep test behavior stable while reorganizing support code into focused helper modules. The split should reduce single-file size, improve discoverability, and stop the current coverage strategy from depending on giant all-purpose fixture files.

**Tech Stack:** Rust `#[cfg(test)]` module trees, crate unit tests, grouped `_tests` support owners.

---

## File Structure

**Primary Targets**
- `api/crates/control-plane/src/_tests/orchestration_runtime/support.rs`
- `api/crates/control-plane/src/_tests/plugin_management/support.rs`
- `api/crates/control-plane/src/_tests/orchestration_runtime/*`
- `api/crates/control-plane/src/_tests/plugin_management/*`

**Likely Create**
- `api/crates/control-plane/src/_tests/orchestration_runtime/support/*`
- `api/crates/control-plane/src/_tests/plugin_management/support/*`

**Run**
- `cargo test --manifest-path api/Cargo.toml -p control-plane orchestration_runtime -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture`

## Task 1: Split Orchestration Runtime Support

**Files:**
- Modify: `api/crates/control-plane/src/_tests/orchestration_runtime/support.rs`
- Create: `api/crates/control-plane/src/_tests/orchestration_runtime/support/*`

- [ ] **Step 1: Separate in-memory doubles from seeded fixtures**

Split by concern:

- repository/runtime doubles
- package writers
- seeded application/run builders
- reusable fixture documents

- [ ] **Step 2: Keep one stable `support` export surface**

Expose the same helpers through a small `mod.rs` or façade so existing tests can migrate incrementally.

## Task 2: Split Plugin Management Support

**Files:**
- Modify: `api/crates/control-plane/src/_tests/plugin_management/support.rs`
- Create: `api/crates/control-plane/src/_tests/plugin_management/support/*`

- [ ] **Step 1: Separate harness, package builders, and catalog fixtures**

Split at least:

- service harness / in-memory store setup
- official catalog fixtures
- package/archive builders
- repetitive lifecycle helper assertions

- [ ] **Step 2: Update grouped plugin-management tests to import from the new support tree**

Touch:

- `catalog.rs`
- `family.rs`
- `install.rs`

under `src/_tests/plugin_management/`

## Task 3: Lower Directory Pressure

**Files:**
- Modify: `api/crates/control-plane/src/_tests/mod.rs`
- Modify: `api/crates/control-plane/src/_tests/*`

- [ ] **Step 1: Keep support owners inside their nearest domain subdirectories**

Do not add new flat files back into `_tests/`. Prefer:

- `orchestration_runtime/support/...`
- `plugin_management/support/...`

- [ ] **Step 2: Recount root `_tests` pressure after the split**

The target is not just smaller files, but fewer flat owners competing in the same directory.

## Task 4: Verify And Record

- [ ] **Step 1: Re-run orchestration runtime tests**

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane orchestration_runtime -- --nocapture
```

- [ ] **Step 2: Re-run plugin-management tests**

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management -- --nocapture
```

- [ ] **Step 3: Re-run the full crate**

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture
```

- [ ] **Step 4: Append execution notes**

Record:

- before/after line counts
- before/after directory counts
- whether any helper API had to change

