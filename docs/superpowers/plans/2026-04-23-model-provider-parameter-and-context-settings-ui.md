# Model Provider Parameter And Context Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a model-row “上下文” field to the settings drawer so operators can edit `context_window_override_tokens` with strict validation while keeping storage numeric and display ergonomic.

**Architecture:** Keep the edit workflow inside the existing `ModelProviderInstanceDrawer` rather than inventing a second modal. Add one focused parsing/formatting helper for context-size values, thread the numeric override through create/update mutations, and keep the drawer table as the single owner of model-level manual overrides.

**Tech Stack:** TypeScript, React, Ant Design 5, TanStack Query, Vitest

**Source Spec:** `docs/superpowers/specs/2026-04-23-model-provider-parameter-schema-and-context-override-design.md`

---

## File Structure

**Create**
- `web/app/src/features/settings/components/model-providers/model-context-window.ts`

**Modify**
- `web/app/src/features/settings/api/model-providers.ts`
- `web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-mutations.ts`
- `web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx`
- `web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx`
- `web/app/src/features/settings/_tests/model-providers-page.test.tsx`

**Notes**
- Do not store `16K`/`1M` strings in React submit payloads or API payloads; convert to numbers before submit.
- Validation belongs in the drawer workflow, not only in backend error handling.
- Use existing `antd` inputs (`AutoComplete` or `Select` with search) instead of adding a new dependency.

### Task 1: Add Shared Context-Window Parse And Format Helpers

**Files:**
- Create: `web/app/src/features/settings/components/model-providers/model-context-window.ts`
- Test: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`

- [x] **Step 1: Write failing helper-driven UI tests**
  - Cover accepted values:
    - `200000`
    - `200K`
    - `1M`
    - preset values `16K/32K/64K/128K/256K/1M`
  - Cover rejected values:
    - `abc`
    - `1g`
    - `10kk`
    - empty-space-only strings

- [x] **Step 2: Run the focused settings tests and verify RED**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- FAIL because there is no shared parse/format helper and the drawer row model has no context column.

- [x] **Step 3: Implement strict parse/format helpers**
  - Add a helper that:
    - executes `trim + toLowerCase`
    - accepts `/^\d+$/`, `/^\d+k$/`, `/^\d+m$/`
    - converts to numeric token counts
    - returns an explicit validation error for illegal formats
  - Add a formatting helper that maps stored numbers to preferred display strings such as `128K` or `1M`.

- [x] **Step 4: Re-run the focused settings tests and verify GREEN**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- PASS with deterministic parse/format behavior.

### Task 2: Extend Drawer Row State And Submit Payloads

**Files:**
- Modify: `web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx`
- Modify: `web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-mutations.ts`
- Modify: `web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx`
- Modify: `web/app/src/features/settings/api/model-providers.ts`

- [x] **Step 1: Write failing drawer tests for the new column**
  - Cover:
    - create mode row includes a context input
    - edit mode rehydrates an existing numeric override as formatted display
    - clearing the field sends `null`
    - valid custom input sends a number
    - invalid input blocks submit

- [x] **Step 2: Run the focused settings tests and verify RED**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- FAIL because the drawer row state still contains only `model_id` and `enabled`.

- [x] **Step 3: Thread `context_window_override_tokens` through the drawer and mutations**
  - Extend the row type and normalization logic.
  - Add a new “上下文” column beside model ID and enable switch.
  - Submit numeric values only through `configured_models`.
  - Keep preview-model cache behavior unchanged.

- [x] **Step 4: Re-run the focused settings tests and verify GREEN**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- PASS with create/edit/save coverage for numeric context overrides.

### Task 3: Lock Preset Choices And Display Semantics

**Files:**
- Modify: `web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx`
- Modify: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`

- [x] **Step 1: Add failing UI assertions for preset choices**
  - Assert the dropdown offers:
    - `16K`
    - `32K`
    - `64K`
    - `128K`
    - `256K`
    - `1M`
  - Assert display uses uppercase `K/M` even though parsing is case-insensitive.

- [x] **Step 2: Run the focused settings tests and verify RED**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- FAIL until the drawer renders the preset choices and display formatter.

- [x] **Step 3: Render the preset-backed input**
  - Use a searchable input/dropdown control.
  - Keep free-text entry enabled.
  - Ensure row display and edit-state formatting stay consistent.

- [x] **Step 4: Re-run the focused settings tests and verify GREEN**

Run:

```bash
pnpm --dir web/app test -- src/features/settings/_tests/model-providers-page.test.tsx
```

Expected:

- PASS with stable preset-option rendering and uppercase display.

### Task 4: Commit The Settings Slice

**Files:**
- Modify only the files listed above

- [x] **Step 1: Stage the settings UI files**

Run:

```bash
git add web/app/src/features/settings/components/model-providers/model-context-window.ts \
  web/app/src/features/settings/api/model-providers.ts \
  web/app/src/features/settings/pages/settings-page/model-providers/use-model-provider-mutations.ts \
  web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx \
  web/app/src/features/settings/components/model-providers/ModelProviderInstanceDrawer.tsx \
  web/app/src/features/settings/_tests/model-providers-page.test.tsx
```

- [x] **Step 2: Commit the settings slice**

Run:

```bash
git commit -m "feat: add model context override editing"
```

Expected:

- One commit containing only settings-surface work for manual context overrides.
