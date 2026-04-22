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

**Run**
- `pnpm --dir web/app test -- --run src/features/settings/_tests/settings-page.test.tsx`
- `pnpm --dir web/app test -- --run src/features/settings/_tests/model-providers-page.test.tsx`
- `node scripts/node/test-frontend.js fast`

## Task 1: Extract Section View Model

**Files:**
- Modify: `web/app/src/features/settings/lib/settings-sections.tsx`
- Create: `web/app/src/features/settings/pages/settings-page/use-settings-sections.ts`

- [ ] **Step 1: Keep `lib/settings-sections.tsx` as pure section metadata**

Leave static section definitions and labels in `lib/settings-sections.tsx`.

- [ ] **Step 2: Move permission/filter/selection logic into a hook**

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

- [ ] **Step 1: Turn `SettingsPage.tsx` into a route container**

Keep only:

- route params / navigation wiring
- hook consumption
- high-level composition

- [ ] **Step 2: Move render owners into dedicated files**

- `SettingsRouteShell.tsx`: page shell / layout
- `SettingsNavigation.tsx`: rail navigation rendering
- `SettingsSectionBody.tsx`: section-to-panel switch
- `SettingsEmptyState.tsx`: no-visible-section fallback

## Task 3: Verify And Record

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-frontend-settings-split-phase-three.md`

- [ ] **Step 1: Run focused settings tests**

```bash
pnpm --dir web/app test -- --run src/features/settings/_tests/settings-page.test.tsx
pnpm --dir web/app test -- --run src/features/settings/_tests/model-providers-page.test.tsx
```

- [ ] **Step 2: Run frontend fast gate**

```bash
node scripts/node/test-frontend.js fast
```

- [ ] **Step 3: Append execution notes and commit**

```bash
git add web/app/src/features/settings/pages/SettingsPage.tsx web/app/src/features/settings/pages/settings-page web/app/src/features/settings/lib/settings-sections.tsx docs/superpowers/plans/2026-04-22-frontend-settings-split-phase-three.md
git commit -m "refactor: split settings page owners"
```
