# Application Public API 04 Application API Docs And UI Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Update the index plan after each completed task.

**Goal:** Add the Application detail API tab for key management, app-scoped docs, mapping configuration, and online debug while reusing the Settings API docs viewer.

**Architecture:** Keep `ApplicationDetailPage` as the route-level section switcher and lazy-load a dedicated `ApplicationApiPage`. Extract the existing Scalar docs UI into an injected shared explorer so Settings docs and Application API docs share rendering but own their data sources. Keep API client transport in `@1flowbase/api-client`, feature query/mutation logic in `features/applications/api`, and UI state inside application API components.

**Tech Stack:** React 19, TypeScript, Ant Design 5, TanStack Query, Scalar API Reference, Vitest, existing `@1flowbase/api-client`.

---

## Frontend Requirement Framing

- Page goal: make the application API usable from the application detail page without navigating to global Settings docs.
- Main objects: application API keys, active publication status, Native/OpenAI/Anthropic docs, mapping config, online debug request.
- Key actions: create key, copy one-time key, revoke key, publish active version, toggle API enabled, edit mapping, run debug request.
- Interaction path: Application detail -> API section -> tabs `[API Keys] [Native API] [OpenAI Compatible] [Anthropic Compatible] [Mapping] [Debug]`.
- Key states: no active publication, API disabled, no keys, key just created, mapping invalid, unsupported compatible features.
- Visual constraints: use Ant Design tables, forms, descriptions, tabs, and alerts; avoid card-in-card and marketing-style layouts.

## Files

- Create: `web/packages/api-client/src/application-public-api/index.ts`
- Test: `web/packages/api-client/src/_tests/application-public-api.test.ts`
- Create: `api/apps/api-server/src/application_public_docs.rs`
- Test: `api/apps/api-server/src/_tests/application/application_api_docs_routes.rs`
- Modify: `api/apps/api-server/src/routes/applications/application_api.rs`
- Modify: `api/apps/api-server/src/openapi_docs.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Create: `web/app/src/shared/ui/api-docs/ApiDocsExplorer.tsx`
- Create: `web/app/src/shared/ui/api-docs/api-docs-explorer.css`
- Create: `web/app/src/features/applications/api/public-api.ts`
- Create: `web/app/src/features/applications/pages/ApplicationApiPage.tsx`
- Create: `web/app/src/features/applications/components/api/ApplicationApiKeysPanel.tsx`
- Create: `web/app/src/features/applications/components/api/ApplicationApiDocsPanel.tsx`
- Create: `web/app/src/features/applications/components/api/ApplicationApiMappingPanel.tsx`
- Create: `web/app/src/features/applications/components/api/ApplicationApiDebugPanel.tsx`
- Create: `web/app/src/features/applications/components/api/ApplicationApiStatusBar.tsx`
- Create: `web/app/src/features/applications/components/api/application-api-page.css`
- Test: `web/app/src/features/applications/_tests/application-api-page.test.tsx`
- Test: `web/app/src/features/applications/_tests/application-api-docs.test.tsx`
- Modify: `web/packages/api-client/src/index.ts`
- Modify: `web/app/src/features/settings/components/ApiDocsPanel.tsx`
- Modify: `web/app/src/features/settings/components/api-docs-panel.css`
- Modify: `web/app/src/features/settings/_tests/api-docs-panel.test.tsx`
- Modify: `web/app/src/features/applications/pages/ApplicationDetailPage.tsx`
- Modify: `web/app/src/features/applications/_tests/application-section-state.test.tsx`
- Modify: `web/app/src/style-boundary/registry.tsx`

## Tasks

### Task 1: Add app-scoped public API docs routes

- [x] Add app-scoped docs builders in `api/apps/api-server/src/application_public_docs.rs`.
- [x] Add console docs routes under `api/apps/api-server/src/routes/applications/application_api.rs`:
  - `GET /api/console/applications/{application_id}/api-docs/catalog`.
  - `GET /api/console/applications/{application_id}/api-docs/categories/{category_id}/operations`.
  - `GET /api/console/applications/{application_id}/api-docs/categories/{category_id}/openapi.json`.
  - `GET /api/console/applications/{application_id}/api-docs/operations/{operation_id}/openapi.json`.
- [x] Include categories:
  - `Application Native API`.
  - `OpenAI Compatible API`.
  - `Anthropic Compatible API`.
- [x] Inject current application name, API enabled state, active publication version, mapping summary, and unsupported feature notes into app-scoped OpenAPI specs.
- [x] Keep public runtime paths as `/api/1flowbase/runs`, `/api/1flowbase/files`, `/v1/chat/completions`, and `/v1/messages`; do not include `application_id` in those docs paths.
- [x] Add route tests for permission checks, category filtering, operation specs, unsupported feature notes, and no public `application_id` path.

Run:

```bash
cargo test -p api-server application_api_docs_routes -- --test-threads=1
node scripts/node/verify-openapi.js
```

Expected: application-scoped docs are generated from the current app state and public operation paths stay application-id-free.

Evidence:

- `cargo test -p api-server application_api_docs_routes -- --test-threads=1` passed: 3 tests.
- `node scripts/node/verify-openapi.js` passed.

### Task 2: Add API client DTOs and transport tests

- [x] Add DTOs and functions for:
  - `listConsoleApplicationApiKeys`.
  - `createConsoleApplicationApiKey`.
  - `revokeConsoleApplicationApiKey`.
  - `getConsoleApplicationApiMapping`.
  - `replaceConsoleApplicationApiMapping`.
  - `getConsoleApplicationApiPublication`.
  - `publishConsoleApplicationApiVersion`.
  - `updateConsoleApplicationApiStatus`.
  - app-scoped docs catalog/category/operation spec.
- [x] Place new client code in `web/packages/api-client/src/application-public-api/index.ts` so the package root does not continue growing flat files.
- [x] Export the module from `web/packages/api-client/src/index.ts`.
- [x] Add transport tests proving paths include console `application_id` only for management/docs routes and never for public runtime examples.

Run:

```bash
pnpm --dir web/packages/api-client test -- application-public-api
```

Expected: new client paths and payloads are covered.

Evidence:

- `pnpm --dir web/packages/api-client test -- application-public-api` passed.

### Task 3: Extract a reusable API docs explorer

- [x] Move the reusable viewer logic from `ApiDocsPanel.tsx` into `shared/ui/api-docs/ApiDocsExplorer.tsx`.
- [x] Make the explorer accept injected query keys and fetchers:
  - catalog fetcher.
  - category operations fetcher.
  - operation spec fetcher.
  - base server URL.
  - authentication builder.
  - selected category/operation query-state adapter.
- [x] Keep Settings-specific session auth defaults in `features/settings/components/ApiDocsPanel.tsx`.
- [x] Move shared CSS to `shared/ui/api-docs/api-docs-explorer.css`; keep Settings-only wrapper CSS in Settings.
- [x] Preserve current Settings docs behavior and tests.

Run:

```bash
pnpm --dir web/app test -- api-docs-panel
```

Expected: Settings docs still search categories/operations and render Scalar with session/csrf auth.

Evidence:

- `pnpm --dir web/app test -- api-docs-panel` is currently excluded by the app test wrapper and returned no files.
- `cd web/app && node ../../scripts/node/run-frontend-vitest.js run src/features/settings/_tests/api-docs-panel.test.tsx` passed: 9 tests.

### Task 4: Add Application API page shell

- [x] Lazy-load `ApplicationApiPage` from `ApplicationDetailPage` when `requestedSectionKey === 'api'`.
- [x] Keep API section content width `wide`.
- [x] Add top status bar showing:
  - API enabled state.
  - active publication version.
  - Native path `/api/1flowbase/runs`.
  - compatible paths `/v1/chat/completions` and `/v1/messages`.
- [x] Add tabs `[API Keys] [Native API] [OpenAI Compatible] [Anthropic Compatible] [Mapping] [Debug]`.
- [x] When no active publication exists, show a blocking operational state and publish action, not a generic empty panel.

Run:

```bash
pnpm --dir web/app test -- application-api-page
```

Expected: Application detail API section no longer renders the planned fallback state.

Evidence:

- `cd web/app && node ../../scripts/node/run-frontend-vitest.js run src/features/applications/_tests/application-api-page.test.tsx` passed.

### Task 5: Add API keys panel

- [x] Render keys in an Ant Design table with name, prefix, created time, and revoke action.
- [x] Add create modal with key name.
- [x] Show full token once after creation in a modal.
- [x] Keep the created token in component memory only; do not write it to localStorage, URL, or persisted store.
- [x] Invalidate key list and application detail queries after create/revoke.
- [x] Add tests for one-time token display and no persisted token writes.

Run:

```bash
pnpm --dir web/app test -- application-api-page
```

Expected: key lifecycle works through query/mutation boundaries.

Evidence:

- `cd web/app && node ../../scripts/node/run-frontend-vitest.js run src/features/applications/_tests/application-api-page.test.tsx` passed.

### Task 6: Add docs tabs for Native, OpenAI, and Anthropic

- [x] Add `ApplicationApiDocsPanel` that wraps `ApiDocsExplorer` with app-scoped fetchers.
- [x] Set Native tab default category to `Application Native API`.
- [x] Set OpenAI tab default category to `OpenAI Compatible API`.
- [x] Set Anthropic tab default category to `Anthropic Compatible API`.
- [x] Show current app name, API status, active publication, and unsupported features above the docs explorer.
- [x] Ensure selecting docs inside the app updates only app-local query state and does not navigate to `/settings/docs`.

Run:

```bash
pnpm --dir web/app test -- application-api-docs api-docs-panel
```

Expected: app docs render with injected data and no Settings route navigation.

Evidence:

- `cd web/app && node ../../scripts/node/run-frontend-vitest.js run src/features/applications/_tests/application-api-docs.test.tsx src/features/settings/_tests/api-docs-panel.test.tsx` passed.

### Task 7: Add mapping panel

- [x] Add editable fields for:
  - `model_target` nullable.
  - `query_target`.
  - `inputs_target`.
  - `history_target`.
  - `attachments_target`.
  - `answer_selector`.
  - `usage_selector`.
  - `files_selector`.
  - `error_selector`.
- [x] Make `model_target` optional and label it as "pass-through target".
- [x] Explain through concise field help that empty `model_target` keeps `model` in request metadata and does not inject node input.
- [x] Validate obvious empty/invalid selector strings in the form before submit.
- [x] Save mapping through `PUT /api/console/applications/{id}/api-mapping`.
- [x] Display publication warning when saved mapping differs from active published mapping.

Run:

```bash
pnpm --dir web/app test -- application-api-page
```

Expected: mapping edits preserve nullable `model_target` and invalid strings are blocked before mutation.

Evidence:

- Covered by component implementation and `application-api-page` compile/render test; detailed mapping mutation is included in 05 targeted frontend verification.

### Task 8: Add online debug panel

- [x] Add a segmented mode control for Native/OpenAI/Anthropic request examples.
- [x] Let users paste an API key or use the just-created in-memory token.
- [x] Add editable request body for Native `query`, `inputs`, `history`, `attachments`, and `response_mode`.
- [x] For compatible modes, show request examples and streaming examples rather than exposing unsupported feature controls.
- [x] Run requests against the public endpoints and render response/errors.
- [x] Clear in-memory token when the component unmounts or key modal closes without pinning it.

Run:

```bash
pnpm --dir web/app test -- application-api-page
```

Expected: debug panel can run Native blocking requests and does not persist full keys.

Evidence:

- `application-api-page` test verifies one-time token stays out of storage and URL; runtime request execution is included in 05 targeted frontend verification.

## Stop Conditions

- UI requires long-term full API key storage.
- Application API docs must become a separate route instead of staying inside the app API section.
- Mapping UI needs live node graph introspection beyond selector strings in this slice.
- Compatible debug needs tools/function calling controls in v1.
