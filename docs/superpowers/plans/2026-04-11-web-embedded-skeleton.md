# Web Embedded Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the minimal `Embedded App` front-end skeleton to `web/` without restructuring the existing app.

**Architecture:** Keep the current `web/app/src/app` structure. Add placeholder feature pages and routes for Embedded App management/runtime, create the missing `embedded-contracts` package, and refine the existing `embed-sdk` package into a tiny shell with explicit exports.

**Tech Stack:** React, TanStack Router, Vitest, TypeScript, pnpm workspace

---

### Task 1: Add failing app tests for embedded placeholder routes
- [ ] Add route tests for `/embedded-apps`, `/embedded-apps/$embeddedAppId`, `/embedded/$embeddedAppId`
- [ ] Run `cd web && pnpm --filter @1flowse/web test -- src/app/App.test.tsx` and confirm failure

### Task 2: Add minimal placeholder pages and routes
- [ ] Create `web/app/src/features/embedded-apps/EmbeddedAppsPage.tsx`
- [ ] Create `web/app/src/features/embedded-apps/EmbeddedAppDetailPage.tsx`
- [ ] Create `web/app/src/features/embedded-runtime/EmbeddedMountPage.tsx`
- [ ] Update `web/app/src/app/router.tsx` with placeholder routes
- [ ] Re-run the app test and confirm pass

### Task 3: Add minimal workspace package skeletons
- [ ] Add failing tests for `web/packages/embed-sdk` and new `web/packages/embedded-contracts`
- [ ] Refine `web/packages/embed-sdk/src` into `index.ts`, `types.ts`, `client.ts`
- [ ] Create `web/packages/embedded-contracts` package with minimal manifest types and helper
- [ ] Run targeted package tests and confirm pass

### Task 4: Verify changed web workspace pieces
- [ ] Run targeted lint/build/test commands for changed app and packages
- [ ] Update `.memory` with the initialization result
