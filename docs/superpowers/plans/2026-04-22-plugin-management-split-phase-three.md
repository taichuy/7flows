# Plugin Management Split Phase Three Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `plugin_management.rs` and its giant test owner into focused backend modules without changing plugin lifecycle behavior.

**Architecture:** Convert the flat `plugin_management.rs` file into a directory module with a stable `mod.rs` façade. Separate read-model/catalog assembly, install/intake flow, family switching/deletion flow, and artifact/filesystem helpers. Mirror that split under `_tests/plugin_management/` so the production and test owners shrink together.

**Tech Stack:** Rust, `control-plane`, async repository ports, cargo test.

---

## File Structure

**Modify**
- `api/crates/control-plane/src/lib.rs`
- `api/crates/control-plane/src/_tests/mod.rs`
- `docs/superpowers/plans/2026-04-22-plugin-management-split-phase-three.md`

**Create**
- `api/crates/control-plane/src/plugin_management/mod.rs`
- `api/crates/control-plane/src/plugin_management/catalog.rs`
- `api/crates/control-plane/src/plugin_management/install.rs`
- `api/crates/control-plane/src/plugin_management/family.rs`
- `api/crates/control-plane/src/plugin_management/filesystem.rs`
- `api/crates/control-plane/src/_tests/plugin_management/mod.rs`
- `api/crates/control-plane/src/_tests/plugin_management/catalog.rs`
- `api/crates/control-plane/src/_tests/plugin_management/install.rs`
- `api/crates/control-plane/src/_tests/plugin_management/family.rs`
- `api/crates/control-plane/src/_tests/plugin_management/support.rs`

**Delete**
- `api/crates/control-plane/src/plugin_management.rs`
- `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`

**Run**
- `cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture`

## Task 1: Split Production Owner

**Files:**
- Delete: `api/crates/control-plane/src/plugin_management.rs`
- Create: `api/crates/control-plane/src/plugin_management/*.rs`

- [x] **Step 1: Create the module façade**

Keep `pub mod plugin_management;` in `lib.rs`, but replace the flat file with `plugin_management/mod.rs` that re-exports the existing public API:

```rust
mod catalog;
mod family;
mod filesystem;
mod install;

pub use catalog::*;
pub use family::*;
pub use install::*;
```

- [x] **Step 2: Move catalog/view assembly**

Move these read-only items into `catalog.rs`:

- `PluginCatalogEntry`, `PluginCatalogView`, `PluginCatalogFilter`
- `OfficialPluginInstallStatus`, `OfficialPluginCatalogEntry`, `OfficialPluginCatalogView`
- `PluginInstalledVersionView`, `PluginFamilyView`, `PluginFamilyCatalogView`
- helper functions such as `compare_plugin_versions`, `pick_latest_official_entry`, `normalize_official_entries`, `provider_help_url`, `provider_default_base_url`, `provider_model_discovery_mode`, `metadata_string`, `map_catalog_source`
- service methods `list_catalog`, `list_official_catalog`, `list_families`

- [x] **Step 3: Move install/intake flow**

Move these write-path items into `install.rs`:

- `InstallPluginCommand`, `InstallOfficialPluginCommand`, `InstallUploadedPluginCommand`, `UpgradeLatestPluginFamilyCommand`
- `InstallPluginResult`, `InstallSourceMetadata`
- service methods `install_plugin`, `reconcile_all_installations`, `install_uploaded_plugin`, `install_official_plugin`, `upgrade_latest`, `install_intake_result`, `install_plugin_with_metadata`
- helper functions `load_actor_context_for_user`, `load_provider_package`, `load_plugin_manifest`, `build_node_contribution_sync_input`, `map_model_discovery_mode`, `map_framework_error`

- [x] **Step 4: Move family lifecycle and filesystem helpers**

Move these into `family.rs`:

- `EnablePluginCommand`, `AssignPluginCommand`, `SwitchPluginVersionCommand`, `DeletePluginFamilyCommand`
- service methods `enable_plugin`, `assign_plugin`, `switch_version`, `delete_family`, `list_tasks`, `get_task`, `load_current_family_installation`, `switch_family_installation`, `transition_task`

Move these into `filesystem.rs`:

- `remove_path_if_exists`
- `copy_installation_artifact`
- `copy_dir`

## Task 2: Split Plugin Management Tests

**Files:**
- Delete: `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`
- Create: `api/crates/control-plane/src/_tests/plugin_management/*.rs`
- Modify: `api/crates/control-plane/src/_tests/mod.rs`

- [x] **Step 1: Add grouped test module**

Replace the flat `_tests/mod.rs` entry with:

```rust
mod plugin_management;
```

- [x] **Step 2: Move shared fixtures**

Put repository/runtime doubles and package fixture builders into `_tests/plugin_management/support.rs`.

- [x] **Step 3: Group assertions by responsibility**

Move tests into:

- `catalog.rs`: list/read-model assertions
- `install.rs`: install/upload/upgrade assertions
- `family.rs`: enable/assign/switch/delete/task assertions

## Task 3: Verify And Record

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-plugin-management-split-phase-three.md`

- [x] **Step 1: Run focused plugin management tests**

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management -- --nocapture
```

- [x] **Step 2: Run full control-plane crate**

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture
```

- [x] **Step 3: Append execution notes**

Record which production/test slices moved and the fresh verification totals.

- [x] **Step 4: Commit**

```bash
git add api/crates/control-plane/src/plugin_management api/crates/control-plane/src/_tests/plugin_management api/crates/control-plane/src/_tests/mod.rs api/crates/control-plane/src/lib.rs docs/superpowers/plans/2026-04-22-plugin-management-split-phase-three.md
git commit -m "refactor: split plugin management service owners"
```

## Execution Notes

- Completed on `2026-04-22`.
- Replaced the flat production owner with `plugin_management/mod.rs` (`84`), `catalog.rs` (`466`), `install.rs` (`614`), `family.rs` (`655`), and `filesystem.rs` (`64`).
- Replaced the giant test owner with `_tests/plugin_management/support.rs` (`1503`), `catalog.rs` (`344`), `install.rs` (`252`), and `family.rs` (`472`); `_tests/mod.rs` now routes through `mod plugin_management;`.
- Updated downstream test imports in `host_extension_service_tests.rs`, `model_provider_service_tests.rs`, and `node_contribution_service_tests.rs` to use the shared plugin-management support module.
- Verification evidence:
  - `cargo test --manifest-path api/Cargo.toml -p control-plane plugin_management -- --nocapture` passed with `15` plugin management tests green.
  - `cargo test --manifest-path api/Cargo.toml -p control-plane -- --nocapture` passed with `72` crate tests green.
