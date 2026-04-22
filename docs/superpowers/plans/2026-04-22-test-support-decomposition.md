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

- [x] **Step 1: Separate in-memory doubles from seeded fixtures**

Split by concern:

- repository/runtime doubles
- package writers
- seeded application/run builders
- reusable fixture documents

- [x] **Step 2: Keep one stable `support` export surface**

Expose the same helpers through a small `mod.rs` or façade so existing tests can migrate incrementally.

## Task 2: Split Plugin Management Support

**Files:**
- Modify: `api/crates/control-plane/src/_tests/plugin_management/support.rs`
- Create: `api/crates/control-plane/src/_tests/plugin_management/support/*`

- [x] **Step 1: Separate harness, package builders, and catalog fixtures**

Split at least:

- service harness / in-memory store setup
- official catalog fixtures
- package/archive builders
- repetitive lifecycle helper assertions

- [x] **Step 2: Update grouped plugin-management tests to import from the new support tree**

Touch:

- `catalog.rs`
- `family.rs`
- `install.rs`

under `src/_tests/plugin_management/`

## Task 3: Lower Directory Pressure

**Files:**
- Modify: `api/crates/control-plane/src/_tests/mod.rs`
- Modify: `api/crates/control-plane/src/_tests/*`

- [x] **Step 1: Keep support owners inside their nearest domain subdirectories**

Do not add new flat files back into `_tests/`. Prefer:

- `orchestration_runtime/support/...`
- `plugin_management/support/...`

- [x] **Step 2: Recount root `_tests` pressure after the split**

The target is not just smaller files, but fewer flat owners competing in the same directory.

## Task 4: Verify And Record

- [x] **Step 1: Re-run orchestration runtime tests**

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane orchestration_runtime -- --nocapture
```

- [x] **Step 2: Re-run plugin-management tests**

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management -- --nocapture
```

- [x] **Step 3: Re-run the full crate**

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture
```

- [x] **Step 4: Append execution notes**

Record:

- before/after line counts
- before/after directory counts
- whether any helper API had to change

## Execution Notes

- `orchestration_runtime/support.rs` 已从 1848 行拆成 32 行 façade + `support/repository.rs` 1145 行 + `support/fixtures.rs` 681 行。原有测试入口仍然通过 `#[path = "_tests/orchestration_runtime/support.rs"] mod test_support;` 接入，没有改生产模块的调用方式。
- `plugin_management/support.rs` 已从 1503 行拆成 64 行 façade + `support/repository.rs` 675 行 + `support/source.rs` 250 行 + `support/fixtures.rs` 536 行。`catalog.rs`、`family.rs`、`install.rs` 继续走 `super::support::{...}`，没有要求调用点改路径。
- 两个超长 support owner 都已经降到单文件 1500 行以下，且拆分边界按职责收敛：
  - orchestration runtime: repository/runtime doubles 与 seeded fixtures/package writers 分离
  - plugin management: in-memory repository、official source/runtime、package/archive fixtures 分离
- 目录计数：
  - `api/crates/control-plane/src/_tests` 直系文件数维持 20，不新增新的 flat test owner
  - `api/crates/control-plane/src/_tests/orchestration_runtime` 直系文件数维持 4，新建 `support/` 子目录承载 2 个文件
  - `api/crates/control-plane/src/_tests/plugin_management` 直系文件数维持 5，新建 `support/` 子目录承载 3 个文件
- helper API 变化：
  - 没有要求测试调用面改路径或改函数名
  - 为了跨子模块复用，少量 test-only helper 的 Rust 可见性从文件内/父模块提升到 crate 级，但仅限 `_tests` support tree
- 本阶段验证已完成：
  - `cargo test --manifest-path api/Cargo.toml -p control-plane orchestration_runtime -- --nocapture`
  - `cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management -- --nocapture`
  - `cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture`
  - `cargo fmt --manifest-path api/Cargo.toml --all`
