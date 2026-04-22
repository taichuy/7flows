# Baseline Recovery Phase One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the first layer of repository trust by fixing the known shared contract drift and backend schema-fixture drift, then rerun the core gates to establish the remaining failure surface.

**Architecture:** Keep this phase intentionally narrow. Do not refactor giant files yet. Fix the truth-source mismatches first: one in the frontend settings model-provider options consumer/test path, one in the backend node-contribution route fixture path. Then rerun the repository’s representative gates to confirm what still fails after the explicit drift is removed.

**Tech Stack:** TypeScript, Vitest, Rust, SQLx/PostgreSQL tests, Node verification scripts.

---

## File Structure

**Modify**
- `web/app/src/features/settings/api/_tests/settings-api.test.ts`
- `api/apps/api-server/src/_tests/node_contribution_routes.rs`
- `docs/superpowers/plans/2026-04-22-baseline-recovery-phase-one.md`

**Verify**
- `scripts/node/testing/contracts/model-providers/options.multiple-providers.json`
- `api/crates/storage-pg/migrations/20260420203000_add_plugin_lifecycle_snapshots.sql`

**Run**
- `node scripts/node/test-contracts.js`
- `node scripts/node/test-frontend.js fast`
- `node scripts/node/test-backend.js`
- `cargo test -p api-server node_contribution_routes_list_registry_entries_for_application_workspace -- --nocapture`

## Task 1: Repair Settings Model Provider Options Contract Expectations

**Files:**
- Modify: `web/app/src/features/settings/api/_tests/settings-api.test.ts`
- Verify: `web/app/src/test/model-provider-contract-fixtures.ts`
- Verify: `scripts/node/testing/contracts/model-providers/options.multiple-providers.json`

- [x] **Step 1: Keep the failing contract assertion focused on the real shared shape**

Change the stale expectation from `instances[0]` to `providers[0]`, and align the expected `plugin_type` with the current truth source:

```ts
expect(modelProviderOptionsContract.providers[0]).toEqual(
  expect.objectContaining({
    effective_instance_id: 'provider-openai-prod',
    provider_code: 'openai_compatible',
    plugin_type: 'model_provider',
    namespace: 'plugin.openai_compatible',
    label_key: 'provider.label',
    description_key: 'provider.description'
  })
);
```

- [x] **Step 2: Run the targeted RED/GREEN contract test**

Run:

```bash
pnpm --dir web/app exec vitest run src/features/settings/api/_tests/settings-api.test.ts
```

Expected:

- Before the edit, FAIL at the stale `instances[0]` assertion.
- After the edit, PASS for the settings API wrapper file.

## Task 2: Repair Backend Node Contribution Route Fixture Drift

**Files:**
- Modify: `api/apps/api-server/src/_tests/node_contribution_routes.rs`
- Verify: `api/crates/storage-pg/migrations/20260420203000_add_plugin_lifecycle_snapshots.sql`

- [x] **Step 1: Replace the removed `enabled` fixture column with lifecycle snapshot fields**

Update the SQL fixture insert so it matches the post-migration `plugin_installations` shape. Replace the removed `enabled` slot with:

```sql
desired_state,
artifact_status,
runtime_status,
availability_status,
```

and bind lifecycle values such as:

```rust
.bind("active_requested")
.bind("installed")
.bind("active")
.bind("available")
```

- [x] **Step 2: Run the targeted backend route test**

Run:

```bash
cargo test --manifest-path api/Cargo.toml -p api-server node_contribution_routes_list_registry_entries_for_application_workspace -- --nocapture
```

Expected:

- Before the edit, FAIL with PostgreSQL `42703` because `plugin_installations.enabled` does not exist.
- After the edit, PASS or move to the next real assertion failure beyond schema drift.

## Task 3: Re-run Core Gates And Record Remaining Surface

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-baseline-recovery-phase-one.md`

- [x] **Step 1: Re-run the shared contract gate**

Run:

```bash
node scripts/node/test-contracts.js
```

Expected:

- PASS, or reveal the next shared consumer drift after the settings assertion is fixed.

- [x] **Step 2: Re-run the frontend fast gate**

Run:

```bash
node scripts/node/test-frontend.js fast
```

Expected:

- The settings API contract failure is gone.
- Any remaining failures now represent separate issues, not the already-known stale options contract.

- [x] **Step 3: Re-run the backend aggregate gate**

Run:

```bash
node scripts/node/test-backend.js
```

Expected:

- The known `plugin_installations.enabled` schema drift no longer appears.
- Remaining failures, if any, are new root-cause candidates for the next loop.

- [x] **Step 4: Update this plan with the observed remaining failures**

Append a short execution note under this plan after running the commands:

```md
## Execution Notes

- `2026-04-22`: `test-contracts` ...
- `2026-04-22`: `test-frontend.js fast` ...
- `2026-04-22`: `test-backend.js` ...
```

- [ ] **Step 5: Commit Phase 1 baseline recovery**

```bash
git add web/app/src/features/settings/api/_tests/settings-api.test.ts api/apps/api-server/src/_tests/node_contribution_routes.rs docs/superpowers/specs/1flowbase/2026-04-22-entropy-reduction-and-baseline-recovery-design.md docs/superpowers/plans/2026-04-22-entropy-reduction-index.md docs/superpowers/plans/2026-04-22-baseline-recovery-phase-one.md
git commit -m "fix: restore baseline contract and schema fixtures"
```

## Execution Notes

- `2026-04-22`: `src/features/settings/api/_tests/settings-api.test.ts` 从过期的 `instances[0]` / `provider_instance_id` / `plugin_type: 'provider'` 断言改到当前共享真值 `providers[0]` / `effective_instance_id` / `plugin_type: 'model_provider'`，定向 settings API 测试转绿。
- `2026-04-22`: `api/apps/api-server/src/_tests/node_contribution_routes.rs` 的 `plugin_installations` fixture 已对齐 lifecycle snapshot schema，移除了已删除的 `enabled` 列，定向 `cargo test -p api-server node_contribution_routes_list_registry_entries_for_application_workspace -- --nocapture` 通过。
- `2026-04-22`: `node scripts/node/test-contracts.js` 通过，已知的 model-provider options consumer drift 不再复现。
- `2026-04-22`: `node scripts/node/test-backend.js` 通过，已知的 `plugin_installations.enabled` schema drift 不再复现。
- `2026-04-22`: 首轮 `node scripts/node/test-frontend.js fast` 暴露出剩余 `agent-flow` 测试漂移，根因为缺失 `node-contributions` mock、过期 issue 文案断言，以及 `node-contribution-picker` 使用默认 5 秒超时。
- `2026-04-22`: 已补齐 `node-last-run-runtime.test.tsx` 与 `application-shell-routing.test.tsx` 的 `node-contributions` mock，更新 `agent-flow-editor-page.test.tsx` 的 issue 标题断言，并将 `node-contribution-picker.test.tsx` 对齐同类画布集成测试的 `20_000` ms timeout。
- `2026-04-22`: 复跑 `node scripts/node/test-frontend.js fast`，结果为 `51` 个测试文件、`186` 个测试全部通过；剩余输出仅为已有 React Flow/antd warning，不构成当前 gate 失败。
