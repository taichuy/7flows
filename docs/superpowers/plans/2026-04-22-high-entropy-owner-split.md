# High Entropy Owner Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the remaining oversized production owners that still concentrate too much orchestration, settings, and local dev runtime behavior in single files.

**Architecture:** Split by responsibility, not by technical fashion. Each target owner should become a directory or grouped module tree with one clear top-level responsibility and thin public entrypoints. Keep public behavior stable while moving internal logic into smaller owners.

**Tech Stack:** Rust module trees, React component/hooks decomposition, Node CommonJS module grouping.

---

## File Structure

**Primary Targets**
- `api/crates/control-plane/src/orchestration_runtime.rs`
- `api/crates/control-plane/src/model_provider.rs`
- `web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx`
- `scripts/node/dev-up/core.js`

**Likely Create**
- `api/crates/control-plane/src/orchestration_runtime/*`
- `api/crates/control-plane/src/model_provider/*`
- `web/app/src/features/settings/pages/settings-page/model-providers/*`
- `scripts/node/dev-up/*`

**Run**
- `cargo test --manifest-path api/Cargo.toml -p control-plane orchestration_runtime -- --nocapture`
- `cargo test --manifest-path api/Cargo.toml -p control-plane model_provider_service_tests -- --nocapture`
- `pnpm --dir web/app test -- --run src/features/settings/_tests/model-providers-page.test.tsx`
- `node --test scripts/node/dev-up/_tests/core.test.js`

## Task 1: Split `orchestration_runtime.rs`

**Files:**
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`
- Create: `api/crates/control-plane/src/orchestration_runtime/*`

- [x] **Step 1: Isolate compile-context building and provider selection**

Move compile-context assembly, provider candidate selection, and node-contribution lookup helpers under a focused owner such as:

- `compile_context.rs`
- `provider_selection.rs`

- [x] **Step 2: Isolate debug-run and resume flows**

Move start/resume/complete command orchestration into grouped owners such as:

- `debug_run.rs`
- `resume.rs`
- `persistence.rs`

- [x] **Step 3: Keep a thin public service façade**

Leave `orchestration_runtime.rs` or `mod.rs` as the service entrypoint and shared type export surface.

## Task 2: Split `model_provider.rs`

**Files:**
- Modify: `api/crates/control-plane/src/model_provider.rs`
- Create: `api/crates/control-plane/src/model_provider/*`

- [x] **Step 1: Split catalog/options and instance lifecycle**

Separate these concerns:

- catalog listing and i18n shaping
- instance CRUD and validation
- options/reveal-secret/model-list helpers

- [x] **Step 2: Move shared helpers into explicit support owners**

Examples:

- `shared.rs`
- `catalog.rs`
- `instances.rs`
- `options.rs`
- `secrets.rs`

## Task 3: Split `SettingsModelProvidersSection.tsx`

**Files:**
- Modify: `web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx`
- Create: `web/app/src/features/settings/pages/settings-page/model-providers/*`

- [x] **Step 1: Move query and mutation wiring into hooks**

Split fetch/mutate state machines into focused hooks such as:

- `use-model-provider-data.ts`
- `use-model-provider-mutations.ts`
- `use-official-plugin-task.ts`

- [x] **Step 2: Split render owners**

Extract overview, installed-provider area, and upload/install orchestration into focused render owners instead of keeping them in the route-level page section.

## Task 4: Split `scripts/node/dev-up/core.js`

**Files:**
- Modify: `scripts/node/dev-up/core.js`
- Create: `scripts/node/dev-up/*`

- [x] **Step 1: Separate CLI parsing from process orchestration**

Likely owners:

- `cli.js`
- `services.js`
- `middleware.js`
- `postgres-reset.js`
- `process.js`
- `env.js`

- [x] **Step 2: Keep `core.js` as a thin façade**

`core.js` should remain the stable entrypoint, but stop owning 40+ functions directly.

## Task 5: Verify Per Owner Slice

- [x] **Step 1: Verify backend owner splits**

```bash
cargo test --manifest-path api/Cargo.toml -p control-plane orchestration_runtime -- --nocapture
cargo test --manifest-path api/Cargo.toml -p control-plane model_provider_service_tests -- --nocapture
```

- [x] **Step 2: Verify frontend owner split**

```bash
pnpm --dir web/app test -- --run src/features/settings/_tests/model-providers-page.test.tsx
```

- [x] **Step 3: Verify `dev-up` owner split**

```bash
node --test scripts/node/dev-up/_tests/core.test.js
```

## Execution Notes

- `orchestration_runtime.rs` 已拆成薄门面 + `compile_context.rs`、`inputs.rs`、`persistence.rs`，主文件不再继续承载 compile-context 组装、输入映射和持久化细节；为保持测试可编译，`src/_tests/orchestration_runtime/support.rs` 补齐了之前依赖父模块隐式可见性的显式导入。
- `model_provider.rs` 已拆成 `shared.rs`、`catalog.rs`、`instances.rs`、`options.rs`，主文件回收到服务入口和少量协调逻辑；实例 hydration、catalog/options 组装和模型刷新/密钥揭示逻辑已经按责任落到子模块。
- `SettingsModelProvidersSection.tsx` 已从 951 行收敛到 441 行，并拆出 `model-providers/` 子目录；查询/变更状态机移入 `use-model-provider-data.ts`、`use-model-provider-mutations.ts`、`use-official-plugin-task.ts`，概览视图移入 `ModelProviderOverviewSummary.tsx`，共享状态和 helper 落到 `shared.ts`。
- `scripts/node/dev-up/core.js` 已从 952 行收敛到 59 行，CLI、服务定义、环境、docker/middleware、postgres 恢复、进程管理分别落到 `cli.js`、`services.js`、`env.js`、`middleware.js`、`postgres-reset.js`、`process.js`，保留稳定入口和既有导出面。
- 本阶段验证已完成：
  - `cargo test --manifest-path api/Cargo.toml -p control-plane orchestration_runtime -- --nocapture`
  - `cargo test --manifest-path api/Cargo.toml -p control-plane model_provider_service_tests -- --nocapture`
  - `pnpm --dir web/app test -- --run src/features/settings/_tests/model-providers-page.test.tsx`
  - `pnpm --dir web/app exec eslint src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx src/features/settings/pages/settings-page/model-providers/*.ts src/features/settings/pages/settings-page/model-providers/*.tsx`
  - `node --test scripts/node/dev-up/_tests/core.test.js`
  - `node scripts/node/dev-up.js status --backend-only --skip-docker`
