# Frontend Settings Split Phase Three Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `SettingsPage.tsx` entropy by splitting the route container, section gating, and section render owners into focused frontend modules.

**Architecture:** Preserve the current `/settings/*` behavior and tests while turning `SettingsPage.tsx` into a thin route-level container. Move section availability, section selection, and section body composition into dedicated files so each owner has one clear concern.

**Tech Stack:** React, TypeScript, TanStack Router, Ant Design, Vitest.

---

## File Structure

**Modify**
- `web/app/src/features/settings/pages/SettingsPage.tsx`
- `web/app/src/features/settings/lib/settings-sections.tsx`
- `docs/superpowers/plans/2026-04-22-frontend-settings-split-phase-three.md`

**Create**
- `web/app/src/features/settings/pages/settings-page/use-settings-sections.ts`
- `web/app/src/features/settings/pages/settings-page/SettingsRouteShell.tsx`
- `web/app/src/features/settings/pages/settings-page/SettingsSectionBody.tsx`
- `web/app/src/features/settings/pages/settings-page/SettingsEmptyState.tsx`
- `web/app/src/features/settings/pages/settings-page/SettingsNavigation.tsx`
- `web/app/src/features/settings/pages/settings-page/SettingsModelProvidersSection.tsx`

**Run**
- `pnpm --dir web/app test -- --run src/features/settings/_tests/settings-page.test.tsx`
- `pnpm --dir web/app test -- --run src/features/settings/_tests/model-providers-page.test.tsx`
- `node scripts/node/test-frontend.js fast`

## Task 1: Extract Section View Model

**Files:**
- Modify: `web/app/src/features/settings/lib/settings-sections.tsx`
- Create: `web/app/src/features/settings/pages/settings-page/use-settings-sections.ts`

- [x] **Step 1: Keep `lib/settings-sections.tsx` as pure section metadata**

Leave static section definitions and labels in `lib/settings-sections.tsx`.

- [x] **Step 2: Move permission/filter/selection logic into a hook**

`use-settings-sections.ts` should own:

- visible-section filtering from current permissions
- current route section resolution
- fallback redirect target selection

## Task 2: Thin The Page Owner

**Files:**
- Modify: `web/app/src/features/settings/pages/SettingsPage.tsx`
- Create: `SettingsRouteShell.tsx`
- Create: `SettingsSectionBody.tsx`
- Create: `SettingsEmptyState.tsx`
- Create: `SettingsNavigation.tsx`

- [x] **Step 1: Turn `SettingsPage.tsx` into a route container**

Keep only:

- route params / navigation wiring
- hook consumption
- high-level composition

- [x] **Step 2: Move render owners into dedicated files**

- `SettingsRouteShell.tsx`: page shell / layout
- `SettingsNavigation.tsx`: rail navigation rendering
- `SettingsSectionBody.tsx`: section-to-panel switch
- `SettingsEmptyState.tsx`: no-visible-section fallback

## Task 3: Verify And Record

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-frontend-settings-split-phase-three.md`

- [x] **Step 1: Run focused settings tests**

```bash
pnpm --dir web/app test -- --run src/features/settings/_tests/settings-page.test.tsx
pnpm --dir web/app test -- --run src/features/settings/_tests/model-providers-page.test.tsx
```

- [x] **Step 2: Run frontend fast gate**

```bash
node scripts/node/test-frontend.js fast
```

- [x] **Step 3: Append execution notes and commit**

```bash
git add web/app/src/features/settings/pages/SettingsPage.tsx web/app/src/features/settings/pages/settings-page web/app/src/features/settings/lib/settings-sections.tsx docs/superpowers/plans/2026-04-22-frontend-settings-split-phase-three.md
git commit -m "refactor: split settings page owners"
```

## Execution Notes

- Completed on `2026-04-22`.
- Reduced `web/app/src/features/settings/pages/SettingsPage.tsx` from `1037` lines to `60` lines by turning it into a route container that only wires auth-derived capabilities, section resolution, redirect behavior, and shell composition.
- Kept `web/app/src/features/settings/lib/settings-sections.tsx` as static section metadata and moved visible-section filtering, active-section resolution, and fallback redirect selection into `pages/settings-page/use-settings-sections.ts`.
- Introduced focused render owners: `SettingsRouteShell.tsx`, `SettingsNavigation.tsx`, `SettingsEmptyState.tsx`, and `SettingsSectionBody.tsx`.
- Extracted the heavyweight model-provider orchestration into `SettingsModelProvidersSection.tsx`, so the settings route owner no longer mixes page navigation with plugin/provider state machines.
- Updated `web/app/src/style-boundary/scenario-manifest.json` so the newly extracted settings-page owners still map to `page.settings` for file-scoped boundary checks.

## Verification Evidence

- `pnpm --dir web/app test -- --run src/features/settings/_tests/settings-page.test.tsx`
- `pnpm --dir web/app test -- --run src/features/settings/_tests/model-providers-page.test.tsx`
- `node scripts/node/test-frontend.js fast`
- `node scripts/node/check-style-boundary.js page page.settings`
