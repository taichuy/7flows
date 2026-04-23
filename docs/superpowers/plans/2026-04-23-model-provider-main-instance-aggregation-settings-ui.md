# Model Provider Main Instance Aggregation Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the settings surface so the main instance becomes a fixed aggregation view with provider-level defaults and child-instance inclusion toggles instead of a user-selected primary instance.

**Architecture:** Keep the API contract thin through `web/packages/api-client` and `features/settings/api`, then move the operator workflow into the existing settings components rather than inventing a new page. The modal owns the main-instance summary and grouped model preview, while the drawer owns create/edit state for real child instances and their `included_in_main` flag.

**Tech Stack:** TypeScript, React, Ant Design, TanStack Query, Vitest

---

## File Structure

**Modify**
- `web/packages/api-client/src/console-model-providers.ts`
- `web/app/src/features/settings/api/model-providers.ts`
- `web/app/src/features/settings/pages/settings-page/model-providers/shared.ts`
- `web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-data.ts`
- `web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-mutations.ts`
- `web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx`
- `web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx`
- `web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx`
- `web/app/src/features/settings/components/model-providers/ModelProviderInstancesModal.tsx`
- `web/app/src/features/settings/components/model-providers/ModelProviderInstancesTable.tsx`
- `web/app/src/features/settings/components/model-providers/model-provider-panel.css`
- `web/app/src/features/settings/api/_tests/settings-api.test.ts`
- `web/app/src/features/settings/_tests/model-providers-page.test.tsx`

**Notes**
- Reuse existing `antd` controls. Do not add a bespoke tree selector or grouped-combobox package.
- The provider-level default should be edited from the modal main-instance header, not buried in the child-instance drawer.
- Do not preserve any “主实例：选择 ready 实例” copy or local state after this refactor.

### Task 1: Update Shared Frontend DTOs For Main-Instance Aggregation

**Files:**
- Modify: `web/packages/api-client/src/console-model-providers.ts`
- Modify: `web/app/src/features/settings/api/model-providers.ts`
- Modify: `web/app/src/features/settings/api/_tests/settings-api.test.ts`

- [x] **Step 1: Write failing API adapter tests for the new payload shape**
  - Lock the settings frontend contract to:
    - instance field `included_in_main: boolean`
    - no `is_primary`
    - provider-level main-instance settings payload with `auto_include_new_instances`
    - options payload with `main_instance` and grouped `model_groups`

- [x] **Step 2: Run the targeted API adapter tests and verify RED**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/api/_tests/settings-api.test.ts
```

Expected:

- FAIL because the shared client types still expose `is_primary`, `effective_instance_id`, and routing-update helpers.

- [x] **Step 3: Rewrite the shared DTOs and adapters**
  - In `console-model-providers.ts`:
    - add `included_in_main`
    - add main-instance settings DTOs
    - replace single-instance option fields with grouped `model_groups`
    - remove routing-update DTOs and helper exports
  - In `features/settings/api/model-providers.ts`:
    - add fetch/update helpers for provider-level main-instance settings
    - remove `updateSettingsModelProviderRouting`

- [x] **Step 4: Re-run the targeted API adapter tests and verify GREEN**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/api/_tests/settings-api.test.ts
```

Expected:

- PASS with the new main-instance settings and grouped options contract.

Task 1 status:
- Working tree now exposes `included_in_main` on instance DTOs, provider-level main-instance fetch/update helpers, and grouped `main_instance + model_groups` option payloads through both `@1flowbase/api-client` and `features/settings/api`.
- Re-verified on current working tree with `pnpm --dir web/app test -- src/features/settings/api/_tests/settings-api.test.ts` -> `4 passed; 0 failed`.
- RED was observed first with `fetchSettingsModelProviderMainInstance is not a function`, confirming the adapter layer still lacked the new helper before the DTO/helper rewrite.

### Task 2: Rebuild Settings State Around Provider Defaults And Included Child Instances

**Files:**
- Modify: `web/app/src/features/settings/pages/settings-page/model-providers/shared.ts`
- Modify: `web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-data.ts`
- Modify: `web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-mutations.ts`
- Modify: `web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx`
- Modify: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`

- [x] **Step 1: Write failing page tests for the new settings state model**
  - Add coverage that:
    - opening the modal no longer selects a primary child instance
    - the modal loads provider-level main-instance settings
    - changing the provider default toggle issues the new update call
    - changing a child-instance inclusion toggle issues an instance update, not a routing update

- [x] **Step 2: Run the focused page tests and verify RED**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- FAIL because shared state still stores `selectedInstanceId`, `pickPreferredInstanceId`, and `updateRoutingMutation`.

- [x] **Step 3: Replace modal and mutation state wiring**
  - In `shared.ts`:
    - remove `pickPreferredInstanceId`
    - replace modal state with provider-scoped main-instance state rather than “current selected instance”
  - In `use-model-provider-data.ts`:
    - fetch provider-level main-instance settings and grouped model data
    - stop deriving `primaryInstanceSummary`
  - In `use-model-provider-mutations.ts`:
    - remove `updateRoutingMutation`
    - add `updateMainInstanceSettingsMutation`
    - add instance-update helpers that can patch `included_in_main`
  - In `SettingsModelProvidersSection.tsx`:
    - wire the modal to provider-level settings and child-instance inclusion changes

- [x] **Step 4: Re-run the focused page tests and verify GREEN**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- PASS with provider-level default management and per-instance inclusion updates.

Task 2 status:
- Shared state now uses provider-scoped modal state only, fetches provider-level main-instance settings, and invalidates both grouped option data and provider main-instance queries on writes.
- `SettingsModelProvidersSection.tsx` now routes provider default changes through `updateMainInstanceSettingsMutation` and child inclusion changes through `updateSettingsModelProviderInstance`, with no routing-update path left in the settings consumer.
- RED was observed first on `pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx` with stale primary-selector assertions and missing main-instance state wiring.
- Re-verified GREEN on the current working tree with `pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx` -> `22 passed; 0 failed`.

### Task 3: Replace The Primary-Selector Modal With A Fixed Main-Instance View

**Files:**
- Modify: `web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/ModelProviderInstancesModal.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/ModelProviderInstancesTable.tsx`
- Modify: `web/app/src/features/settings/components/model-providers/model-provider-panel.css`
- Modify: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`

- [x] **Step 1: Add failing UI assertions for the new modal and table surfaces**
  - Cover:
    - the modal always shows a “主实例” aggregation block
    - the old primary-instance `<Select aria-label="主实例">` is gone
    - grouped model previews render under source-instance headings
    - child instances render `加入主实例` toggles and no longer render a “主实例” tag

- [x] **Step 2: Run the focused page tests and verify RED**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- FAIL because the modal still renders the primary-instance selector and the table rows still expose `is_primary`.

- [x] **Step 3: Rewrite the presentation layer**
  - In `ModelProviderCatalogPanel.tsx`, change summary copy from “主实例：某个真实实例名” to “主实例：聚合视图 / 已接入 X 个实例”.
  - In `ModelProviderInstancesModal.tsx`:
    - render a fixed main-instance header with provider-level toggle and grouped model list
    - remove expanded-instance-driven candidate-cache fetch assumptions from the header
  - In `ModelProviderInstancesTable.tsx`, keep it child-instance oriented and remove any primary-instance rendering.
  - In CSS, add only the minimum layout selectors for the fixed header + grouped list + inclusion toggle rows.

- [x] **Step 4: Re-run the focused page tests and verify GREEN**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- PASS with the new fixed main-instance surface.

Task 3 status:
- Catalog rows now summarize each provider as `主实例：聚合视图 / 已接入 X 个实例`, while the instances modal renders a fixed `主实例` aggregation card with grouped model previews under source-instance headings.
- The old primary-instance selector is removed; child instances now live in a flat management table with `加入主实例` switches and no per-row primary tag.
- The modal uses grouped option data immediately, so the provider default switch no longer flashes an incorrect unchecked fallback before the dedicated main-instance query returns.

### Task 4: Extend The Instance Drawer For `included_in_main`

**Files:**
- Modify: `web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx`
- Modify: `web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx`
- Modify: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`

- [x] **Step 1: Write failing drawer tests for the new child-instance field**
  - Add coverage that:
    - create mode defaults `included_in_main` from provider-level `auto_include_new_instances`
    - edit mode rehydrates the current `included_in_main` value
    - submitting the drawer sends `included_in_main` together with `enabled_model_ids` and config

- [x] **Step 2: Run the focused page tests and verify RED**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- FAIL because the drawer form does not render or submit `included_in_main`.

- [x] **Step 3: Thread `included_in_main` through the drawer form**
  - Add a top-level “加入主实例” switch to the drawer form.
  - Initialize create mode from provider-level defaults loaded in section state.
  - Initialize edit mode from `instance.included_in_main`.
  - Update create/update submits in `SettingsModelProvidersSection.tsx` so the payload includes `included_in_main`.

- [x] **Step 4: Re-run the focused page tests and verify GREEN**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- PASS with drawer create/edit support for `included_in_main`.

Task 4 status:
- The instance drawer now exposes a top-level `加入主实例` switch, defaults create mode from the provider-level `auto_include_new_instances` value, and rehydrates edit mode from `instance.included_in_main`.
- Create and update submissions now always include `included_in_main` together with configured model rows and provider config.

### Task 5: Close The Settings Slice With Focused Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-04-23-model-provider-main-instance-aggregation-settings-ui.md`

- [x] **Step 1: Run the final frontend verification set**

Run:

```bash
pnpm --dir web/app test -- \
  src/features/settings/api/_tests/settings-api.test.ts \
  src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- Both targeted settings test files pass with the new aggregation workflow.

- [x] **Step 2: Update this plan with actual verification output**
  - Append a `Verification Results` section with concrete pass/fail output.

- [ ] **Step 3: Commit**

```bash
git add web/packages/api-client/src/console-model-providers.ts \
  web/app/src/features/settings/api/model-providers.ts \
  web/app/src/features/settings/pages/settings-page/model-providers/shared.ts \
  web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-data.ts \
  web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-mutations.ts \
  web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx \
  web/app/src/features/settings/components/model-providers/ModelProviderCatalogPanel.tsx \
  web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx \
  web/app/src/features/settings/components/model-providers/ModelProviderInstancesModal.tsx \
  web/app/src/features/settings/components/model-providers/ModelProviderInstancesTable.tsx \
  web/app/src/features/settings/components/model-providers/model-provider-panel.css \
  web/app/src/features/settings/api/_tests/settings-api.test.ts \
  web/app/src/features/settings/_tests/model-providers-page.test.tsx \
  docs/superpowers/plans/2026-04-23-model-provider-main-instance-aggregation-settings-ui.md
git commit -m "feat(model-providers): add main-instance aggregation settings ui"
```

## Verification Results
- `pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx`
  - `22 passed; 0 failed`
- `pnpm --dir web/app test -- src/features/settings/api/_tests/settings-api.test.ts src/features/settings/_tests/model-providers-page.test.tsx`
  - `26 passed; 0 failed`
