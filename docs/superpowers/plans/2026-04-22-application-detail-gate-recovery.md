# Application Detail Gate Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore `page.application-detail` as a trustworthy frontend quality target so style-boundary and browser evidence fail only on real UI problems, not on missing scene data.

**Architecture:** Fix the scene fixture first, not the production editor. The current failure comes from missing application-detail scene inputs, especially `node-contributions`, which prevents the editor shell from rendering. Make the style-boundary scene self-contained, add a focused scene assertion, then rerun the browser-level gates. If the real `/applications/:id/orchestration` route still fails after the scene is fixed, record that as a separate route-quality finding instead of masking it inside the scene tool.

**Tech Stack:** React, TanStack Router, style-boundary registry, Vitest, Playwright-based `page-debug`, Node QA tooling.

---

## File Structure

**Modify**
- `web/app/src/style-boundary/registry.tsx`
- `web/app/src/style-boundary/_tests/registry.test.tsx`
- `web/app/src/style-boundary/scenario-manifest.json`
- `docs/superpowers/plans/2026-04-22-application-detail-gate-recovery.md`

**Run**
- `pnpm --dir web/app test -- --run src/style-boundary/_tests/registry.test.tsx`
- `node scripts/node/check-style-boundary.js page page.application-detail`
- `node scripts/node/page-debug.js snapshot 'http://127.0.0.1:3100/style-boundary.html?scene=page.application-detail' --account root --password change-me --wait-for-selector .agent-flow-editor__shell`
- `node scripts/node/page-debug.js snapshot /applications/app-1/orchestration --account root --password change-me`

## Task 1: Make The Style-Boundary Scene Self-Contained

**Files:**
- Modify: `web/app/src/style-boundary/registry.tsx`

- [ ] **Step 1: Inventory all requests needed by `page.application-detail`**

Cover the current application-detail scene dependency chain at minimum:

- `GET /api/console/applications/app-1`
- `GET /api/console/applications/app-1/orchestration`
- `GET /api/console/model-providers/options`
- `GET /api/console/node-contributions?application_id=app-1`
- any node last-run requests already used by the scene

- [ ] **Step 2: Add the missing `node-contributions` fixture response**

Return a deterministic workspace-scoped contribution list from `seedStyleBoundaryApplicationFetch()` so the editor can finish loading instead of falling into the error state.

- [ ] **Step 3: Keep the scene owner explicit**

Do not move this mock logic into production API consumers. Keep it local to the style-boundary runtime scene owner.

## Task 2: Add A Focused Scene Assertion

**Files:**
- Modify: `web/app/src/style-boundary/_tests/registry.test.tsx`
- Modify: `web/app/src/style-boundary/scenario-manifest.json`

- [ ] **Step 1: Assert that `page.application-detail` reaches the editor shell**

Add a focused registry/runtime assertion that the application-detail scene renders `.agent-flow-editor__shell` rather than the generic error result.

- [ ] **Step 2: Keep boundary assertions structural**

If the manifest needs adjustment, keep it to structure-level assertions such as `display` or shell presence. Do not turn visual details into gate conditions.

## Task 3: Re-run Browser Evidence

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-application-detail-gate-recovery.md`

- [ ] **Step 1: Re-run the style-boundary page gate**

```bash
node scripts/node/check-style-boundary.js page page.application-detail
```

Expected:
- PASS for the scene-level shell render and boundary assertions.

- [ ] **Step 2: Capture browser evidence for the style-boundary scene**

```bash
node scripts/node/page-debug.js snapshot 'http://127.0.0.1:3100/style-boundary.html?scene=page.application-detail' --account root --password change-me --wait-for-selector .agent-flow-editor__shell
```

Expected:
- final URL resolves to the application-detail scene target
- `.agent-flow-editor__shell` is visible
- no console request failure for `node-contributions`

- [ ] **Step 3: Reclassify the real route**

```bash
node scripts/node/page-debug.js snapshot /applications/app-1/orchestration --account root --password change-me
```

Expected:
- If the route still fails, record it as a separate real-route issue with its own API/root-cause note.
- Do not keep mixing a fixture failure and a real route failure into one finding.

- [ ] **Step 4: Append execution notes**

Record:

- which fixture requests were missing
- whether `page.application-detail` gate now passes
- whether the real `/applications/app-1/orchestration` route still fails

