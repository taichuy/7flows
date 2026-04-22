# Owner And Directory Entropy Reduction Phase Five Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the next batch of high-value entropy by splitting one oversized frontend style owner, splitting two oversized backend owners, and moving crowded test/repository directories into topic subdirectories.

**Architecture:** Keep public behavior unchanged. This phase is structural only: split by clear owner boundaries, route all imports through stable entrypoints, and move grouped files under subdirectories so directory pressure drops without changing contracts. Each slice must leave behind a smaller stable owner plus passing focused verification.

**Tech Stack:** React, CSS, Rust, Axum route tests, sqlx repositories, Vitest, cargo test.

---

## Scope

1. Frontend style split:
   - `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
2. Backend repository split:
   - `api/crates/storage-pg/src/model_definition_repository.rs`
3. Backend route-test split + directory收纳:
   - `api/apps/api-server/src/_tests/plugin_routes.rs`
   - `web/app/src/features/agent-flow/_tests`
   - `api/apps/api-server/src/_tests`
   - `api/crates/storage-pg/src`

## Task 1: Split `agent-flow-editor.css`

**Files:**
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowEditorShell.tsx`
- Delete: `web/app/src/features/agent-flow/components/editor/agent-flow-editor.css`
- Create: `web/app/src/features/agent-flow/components/editor/styles/shell.css`
- Create: `web/app/src/features/agent-flow/components/editor/styles/detail-panel.css`
- Create: `web/app/src/features/agent-flow/components/editor/styles/inspector.css`
- Create: `web/app/src/features/agent-flow/components/editor/styles/canvas.css`
- Create: `web/app/src/features/agent-flow/components/editor/styles/index.css`

- [x] Keep import surface stable by switching `AgentFlowEditorShell.tsx` to `./styles/index.css`.
- [x] Move shell/overlay/breadcrumb/dock selectors into `shell.css`.
- [x] Move node-detail shell, tabs, relations, policies into `detail-panel.css`.
- [x] Move inspector inputs/field layout into `inspector.css`.
- [x] Move canvas and zoom-toolbar selectors into `canvas.css`.
- [x] Run:
```bash
pnpm --dir web/app test -- --run src/features/agent-flow/_tests/agent-flow-editor-page.test.tsx src/features/agent-flow/_tests/node-detail-panel.test.tsx src/features/agent-flow/_tests/node-inspector.test.tsx src/features/agent-flow/_tests/agent-flow-canvas.test.tsx
```

## Task 2: Split `model_definition_repository.rs`

**Files:**
- Modify: `api/crates/storage-pg/src/lib.rs`
- Delete: `api/crates/storage-pg/src/model_definition_repository.rs`
- Create: `api/crates/storage-pg/src/model_definition_repository/mod.rs`
- Create: `api/crates/storage-pg/src/model_definition_repository/model_queries.rs`
- Create: `api/crates/storage-pg/src/model_definition_repository/field_queries.rs`
- Create: `api/crates/storage-pg/src/model_definition_repository/change_log.rs`
- Create: `api/crates/storage-pg/src/model_definition_repository/naming.rs`

- [x] Keep the trait impl in `mod.rs`, but move row loading/query helpers into dedicated files.
- [x] Move change-log append/failed-write helpers into `change_log.rs`.
- [x] Move physical naming helpers into `naming.rs`.
- [x] Route internal calls through private module functions only; no behavior change.
- [x] Run:
```bash
cargo test --manifest-path api/Cargo.toml -p storage-pg model_definition_repository -- --nocapture
```

## Task 3: Split `plugin_routes.rs` And Re-home Crowded Directories

**Files:**
- Modify: `api/apps/api-server/src/_tests/mod.rs`
- Delete: `api/apps/api-server/src/_tests/plugin_routes.rs`
- Create: `api/apps/api-server/src/_tests/plugin_routes/mod.rs`
- Create: `api/apps/api-server/src/_tests/plugin_routes/support.rs`
- Create: `api/apps/api-server/src/_tests/plugin_routes/install_and_access.rs`
- Create: `api/apps/api-server/src/_tests/plugin_routes/catalog_and_upload.rs`
- Create: `api/apps/api-server/src/_tests/plugin_routes/family_management.rs`
- Move: selected `web/app/src/features/agent-flow/_tests/*.test.*` files into themed subdirectories
- Move: selected `api/apps/api-server/src/_tests/*.rs` files into themed subdirectories where the count still exceeds the rule

- [x] Extract package builders/request helpers from `plugin_routes.rs` into `support.rs`.
- [x] Group the route tests under topic modules and keep `_tests/mod.rs` entry stable with `mod plugin_routes;`.
- [x] Re-home `agent-flow/_tests` into subdirectories such as `editor/`, `document/`, `nodes/`, `runtime/` until the root `_tests` file count is below the local rule.
- [x] Re-home `api-server/src/_tests` route tests into topic subdirectories such as `application/`, `plugin/`, `openapi/`, `workspace/` until the root `_tests` file count is below the local rule.
- [x] Ensure `api/crates/storage-pg/src` root file count drops by converting `model_definition_repository` into a directory module in Task 2 and keeping any new helpers under that subdirectory.
- [x] Run:
```bash
cargo test --manifest-path api/Cargo.toml -p api-server plugin_routes -- --nocapture
pnpm --dir web/app test -- --run src/features/agent-flow/_tests
```

## Task 4: Batch Verification And Record

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-owner-and-directory-entropy-reduction-phase-five.md`

- [x] Run:
```bash
node scripts/node/test-frontend.js fast
cargo test --manifest-path api/Cargo.toml -p storage-pg -- --nocapture
cargo test --manifest-path api/Cargo.toml -p api-server -- --nocapture
```
- [x] Append execution notes with the before/after file sizes and directory counts.
- [ ] Commit the phase.

## Execution Notes

- `2026-04-22`: Plan created for the next entropy-reduction slice after `fe9ff8c5`.
- `2026-04-22`: Task 1 completed. `agent-flow-editor.css` (1408 lines) was replaced by:
  - `styles/shell.css` 119 lines
  - `styles/detail-panel.css` 472 lines
  - `styles/inspector.css` 213 lines
  - `styles/canvas.css` 608 lines
  - `styles/index.css` 4 lines
- `2026-04-22`: Task 2 completed. `model_definition_repository.rs` (1181 lines) was replaced by:
  - `model_definition_repository/mod.rs` 634 lines
  - `model_queries.rs` 187 lines
  - `field_queries.rs` 287 lines
  - `change_log.rs` 87 lines
  - `naming.rs` 28 lines
- `2026-04-22`: Task 3 completed. `plugin_routes.rs` (1254 lines) was replaced by:
  - `plugin_routes/support.rs` 386 lines
  - `plugin_routes/install_and_access.rs` 240 lines
  - `plugin_routes/catalog_and_upload.rs` 251 lines
  - `plugin_routes/family_management.rs` 414 lines
  - `plugin_routes/mod.rs` 4 lines
- `2026-04-22`: Directory counts:
  - `web/app/src/features/agent-flow/_tests`: `22 -> 15`
  - `api/apps/api-server/src/_tests`: `22 -> 15`
  - `api/crates/storage-pg/src`: `17 -> 15`
- `2026-04-22`: Validation:
  - `pnpm --dir web/app test -- --run src/features/agent-flow/_tests/editor src/features/agent-flow/_tests/node-detail-panel.test.tsx src/features/agent-flow/_tests/node-inspector.test.tsx`
  - `cargo test --manifest-path api/Cargo.toml -p storage-pg -- --nocapture`
  - `cargo test --manifest-path api/Cargo.toml -p api-server plugin_routes -- --nocapture`
  - `node scripts/node/test-frontend.js fast`
  - `cargo test --manifest-path api/Cargo.toml -p api-server -- --nocapture`
- `2026-04-22`: `tmp/test-governance/frontend-fast.warnings.log` remained empty after the fast gate rerun.
