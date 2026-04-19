# Official Plugin Registry Latest-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the official plugin install flow treat the registry as one latest official version per provider, and show update prompts whenever the installed version differs from that latest version.

**Architecture:** Normalize official registry data at the control-plane boundary so downstream callers only see one latest entry per `provider_code`. Keep a defensive frontend dedupe for the install panel, and separately tighten the `1flowbase-official-plugins` registry update script so the source data itself cannot retain stale or foreign entries for the same provider.

**Tech Stack:** Rust control-plane service tests, React/Vitest settings page tests, Node.js registry maintenance script tests.

---

### Task 1: Lock the main-project contract with failing tests

**Files:**
- Modify: `api/crates/control-plane/src/_tests/plugin_management_service_tests.rs`
- Modify: `web/app/src/features/settings/_tests/model-providers-page.test.tsx`

- [ ] **Step 1: Write the failing backend normalization test**

Add a test that injects multiple official entries for the same `provider_code` and asserts `list_families()` resolves `latest_version` to only the newest `1flowbase` entry.

- [ ] **Step 2: Run the backend test to verify it fails**

Run: `rtk cargo test -p control-plane plugin_management_service_lists_provider_families_with_latest_official_entry_per_provider`
Expected: FAIL because the current implementation keeps whichever entry lands last in the map.

- [ ] **Step 3: Write the failing frontend update-state test**

Add a settings page test where the official catalog includes both stale and latest entries for one provider while the installed family remains on the old version, and assert the page only shows the latest official version plus the upgrade CTA.

- [ ] **Step 4: Run the frontend test to verify it fails**

Run: `rtk npm test -- web/app/src/features/settings/_tests/model-providers-page.test.tsx --runInBand`
Expected: FAIL because stale catalog entries still influence the rendered state.

### Task 2: Implement main-project normalization and UI behavior

**Files:**
- Modify: `api/crates/control-plane/src/plugin_management.rs`
- Modify: `web/app/src/features/settings/components/model-providers/OfficialPluginInstallPanel.tsx`

- [ ] **Step 1: Implement official entry normalization in control-plane**

Extract helper logic that groups official entries by `provider_code`, prefers the current source namespace for ties, and keeps only the highest semantic version before `list_official_catalog()` and `list_families()` consume the snapshot.

- [ ] **Step 2: Keep frontend install cards aligned to normalized latest entries**

Simplify the install panel dedupe so it mirrors the backend contract and always renders the latest version card per provider.

- [ ] **Step 3: Run backend and frontend target tests**

Run:
- `rtk cargo test -p control-plane plugin_management_service_lists_provider_families_with_latest_official_entry_per_provider`
- `rtk npm test -- web/app/src/features/settings/_tests/model-providers-page.test.tsx --runInBand`

Expected: PASS with the latest-only contract and correct update prompting.

### Task 3: Tighten the official plugin repository source contract

**Files:**
- Modify: `1flowbase-official-plugins/scripts/_tests/update-official-registry.test.mjs`
- Modify: `1flowbase-official-plugins/scripts/update-official-registry.mjs`
- Modify: `1flowbase-official-plugins/official-registry.json`

- [ ] **Step 1: Write the failing registry-script test**

Add a case proving that inserting a new `1flowbase` entry for a provider removes stale entries for the same `provider_code`, including mismatched namespaces like `1flowse.*`.

- [ ] **Step 2: Run the script test to verify it fails**

Run: `rtk node --test 1flowbase-official-plugins/scripts/_tests/update-official-registry.test.mjs`
Expected: FAIL because current upsert only replaces by exact `plugin_id`.

- [ ] **Step 3: Implement the registry cleanup rule and update the checked-in registry**

Change the script to replace entries by normalized provider ownership rather than exact `plugin_id`, then remove the stale `1flowse.openai_compatible` item from `official-registry.json`.

- [ ] **Step 4: Re-run the script test**

Run: `rtk node --test 1flowbase-official-plugins/scripts/_tests/update-official-registry.test.mjs`
Expected: PASS with one latest entry per provider in the registry.

### Task 4: Verify, document memory, and commit

**Files:**
- Modify: `.memory/project-memory/...` or `.memory/feedback-memory/...` if the final contract is worth preserving

- [ ] **Step 1: Run fresh verification commands**

Run:
- `rtk cargo test -p control-plane plugin_management_service_lists_provider_families_with_latest_official_entry_per_provider`
- `rtk npm test -- web/app/src/features/settings/_tests/model-providers-page.test.tsx --runInBand`
- `rtk node --test 1flowbase-official-plugins/scripts/_tests/update-official-registry.test.mjs`

- [ ] **Step 2: Update memory with the agreed official-registry contract**

Record that `official-registry.json` is latest-only per provider and cross-product entries must not be mixed into the 1flowbase official registry.

- [ ] **Step 3: Commit intentionally**

Commit the main-project changes in this repository, and keep plugin-repository changes isolated to the plugin repository workflow as requested by the user memory.
