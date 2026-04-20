# Runtime Profile Registry Sync And Frontend Consumption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync the official plugin registry to the latest released schema and expose the new runtime-profile, locale, and plugin-type contracts in the web console.

**Architecture:** Keep the sibling repo as the source of truth for release metadata by asserting `official-registry.json` matches the current provider manifest and six-target artifact shape. In `web`, add a thin API transformation layer for plugin i18n contracts, expose `preferred_locale` through `/me`, and add a dedicated settings section for system runtime diagnostics instead of overloading the model-provider page.

**Tech Stack:** Node.js script tests, GitHub release metadata, TypeScript, React, TanStack Router, TanStack Query, Ant Design, Vitest

---

### Task 1: Sync Official Registry To The Current Release

**Files:**
- Modify: `../1flowbase-official-plugins/scripts/_tests/update-official-registry.test.mjs`
- Modify: `../1flowbase-official-plugins/official-registry.json`

- [x] **Step 1: Add a failing drift test**
- [x] **Step 2: Run the sibling repo script tests and confirm RED**
- [x] **Step 3: Update `official-registry.json` to the latest released schema and artifacts**
- [x] **Step 4: Re-run the sibling repo script tests and confirm GREEN**
- [x] **Step 5: Commit the sibling repo changes**

### Task 2: Expose Runtime Profile, Preferred Locale, And Plugin-Type Consumption In Web

**Files:**
- Create: `web/packages/api-client/src/console-system.ts`
- Modify: `web/packages/api-client/src/index.ts`
- Modify: `web/packages/api-client/src/console-me.ts`
- Modify: `web/packages/api-client/src/console-plugins.ts`
- Create: `web/app/src/features/settings/api/system-runtime.ts`
- Create: `web/app/src/features/settings/components/SystemRuntimePanel.tsx`
- Modify: `web/app/src/features/settings/lib/settings-sections.tsx`
- Modify: `web/app/src/app/router.tsx`
- Modify: `web/app/src/features/settings/pages/SettingsPage.tsx`
- Modify: `web/app/src/features/settings/api/plugins.ts`
- Modify: `web/app/src/features/me/components/ProfileForm.tsx`
- Modify: `web/app/src/features/me/api/me.ts`
- Modify: `web/app/src/features/me/_tests/me-page.test.tsx`
- Modify: `web/app/src/features/settings/_tests/settings-page.test.tsx`
- Modify: `web/app/src/routes/_tests/section-shell-routing.test.tsx`
- Modify: `web/app/src/features/settings/api/_tests/settings-api.test.ts`

- [x] **Step 1: Add failing web tests for locale, system runtime, and plugin-type consumption**
- [x] **Step 2: Run the targeted web tests and confirm RED**
- [x] **Step 3: Implement API client and settings wrapper updates**
- [x] **Step 4: Implement the system runtime settings section and `/me` locale field**
- [x] **Step 5: Re-run the targeted web tests and confirm GREEN**
- [ ] **Step 6: Commit the main repo changes**
