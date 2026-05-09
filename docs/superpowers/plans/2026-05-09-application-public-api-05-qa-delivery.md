# Application Public API 05 QA And Delivery Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Update the index plan after each completed task.

**Goal:** Validate the completed Application Public API slice with targeted evidence and deliver it without running local heavy gates unless explicitly requested.

**Architecture:** Use task-scoped backend, route, OpenAPI, API client, frontend, and runtime checks first. Then run `qa-evaluation` to review evidence against the spec and push the branch so GitHub Actions covers heavy Rust consistency gates.

**Tech Stack:** Cargo, SQLx tests, Node verification scripts, PNPM/Vitest, Playwright/page-debug where needed, GitHub Actions.

---

## Files

- Modify: `docs/superpowers/plans/2026-05-09-application-public-api-index.md`
- Modify: active child plan status files as tasks complete
- Optional Modify: `scripts/node/test-contracts.js` only if new public API DTO consumers require contract gate registration
- Optional Modify: `.github/workflows/verify.yml` only if CI needs a new targeted gate
- Output artifacts: `tmp/test-governance/*`

## Tasks

### Task 1: Run backend core evidence

- [x] Run application key and publication service tests:

```bash
cargo test -p control-plane application_public_api -- --test-threads=1
```

- [x] Run storage repository and migration tests:

```bash
cargo test -p storage-postgres application_public_api -- --test-threads=1
cargo test -p storage-postgres migration_smoke -- --test-threads=1
```

- [x] Run API server route tests:

```bash
cargo test -p api-server application_public_api -- --test-threads=1
cargo test -p api-server application_api_routes -- --test-threads=1
```

Expected:

- Application API key lifecycle passes.
- Data Model API key behavior remains intact.
- Active publication is required for public runs.
- Native/OpenAI/Anthropic routes are mounted and authenticated.

Evidence:

- `cargo test -p control-plane application_public_api -- --test-threads=1` passed: 56 tests.
- `cargo test -p storage-postgres application_public_api -- --test-threads=1` passed: 4 tests.
- `cargo test -p storage-postgres migration_smoke -- --test-threads=1` passed: 7 tests.
- `cargo test -p api-server application_public_api -- --test-threads=1` passed: 13 tests.
- `cargo test -p api-server application_api_routes -- --test-threads=1` passed: 3 tests.

### Task 2: Run OpenAPI and API client evidence

- [x] Verify OpenAPI:

```bash
node scripts/node/verify-openapi.js
```

- [x] Run API client tests:

```bash
pnpm --dir web/packages/api-client test -- application-public-api
pnpm --dir web/packages/api-client test
```

Expected:

- Public routes are included in OpenAPI.
- Console management/docs routes include `application_id`.
- Public runtime examples do not include `application_id`.
- API client path and payload tests pass.

Evidence:

- `node scripts/node/verify-openapi.js` passed.
- `pnpm --dir web/packages/api-client test -- application-public-api` passed.
- `pnpm --dir web/packages/api-client test` passed: 5 files, 29 tests.

### Task 3: Run frontend targeted evidence

- [x] Run app API page tests:

```bash
pnpm --dir web/app test -- application-api-page application-api-docs
```

- [x] Run Settings docs regression tests:

```bash
pnpm --dir web/app test -- api-docs-panel
```

- [x] Run fast frontend gate:

```bash
node scripts/node/test-frontend.js fast
```

Expected:

- Application API section renders keys/docs/mapping/debug tabs.
- Settings docs still work through the shared explorer.
- Full API keys are not persisted.

Evidence:

- `cd web/app && node ../../scripts/node/run-frontend-vitest.js run src/features/applications/_tests/application-api-page.test.tsx src/features/applications/_tests/application-api-docs.test.tsx src/features/settings/_tests/api-docs-panel.test.tsx` passed: 3 files, 12 tests.
- `cd web/app && node ../../scripts/node/run-frontend-vitest.js run src/features/applications/_tests/application-api-page.test.tsx src/features/applications/_tests/application-api-docs.test.tsx src/features/settings/_tests/api-docs-panel.test.tsx src/shared/ui/section-page-layout/_tests/section-page-layout.test.tsx src/style-boundary/_tests/registry.test.tsx` passed after mobile/layout fixes: 5 files, 27 tests.
- `node scripts/node/test-frontend.js fast` passed: 80 files, 405 tests.
- Note: `pnpm --dir web/app test -- api-docs-panel` is excluded by the app fast-test wrapper and reports no matched files, so targeted evidence uses the repo wrapper directly with explicit file paths.

### Task 4: Collect browser and style evidence when UI is complete

- [x] Start the dev server only if no existing usable server is running.
- [x] Use the project's Playwright/page-debug path to inspect:
  - Application detail API tab desktop.
  - Application detail API tab mobile.
  - Settings docs page regression.
- [x] If shared CSS or Scalar wrapper styles changed, run the style-boundary check that covers docs/application routes.
- [x] Save warnings and screenshots only under approved project locations:
  - warnings/logs under `tmp/test-governance/`.
  - visual artifacts under `uploads/` only when screenshots are needed for user-facing evidence.

Expected:

- No overlapping controls or clipped key/action text.
- App API tab stays inside the application section.
- Settings docs still render the Scalar viewer.

Evidence:

- Existing dev server/API were already running on `127.0.0.1:3100` and `127.0.0.1:7800`.
- `node scripts/node/page-debug.js snapshot /applications/019e0aad-e2d6-7d62-9684-26320fb7f78c/api --out-dir tmp/test-governance/page-debug-application-api-existing --wait-for-selector .application-api-page --timeout 30000` passed with `warnings: []`.
- `node scripts/node/page-debug.js snapshot '/settings/docs?category=console' --out-dir tmp/test-governance/page-debug-settings-docs --wait-for-selector .api-docs-panel --timeout 30000` passed with `warnings: []`.
- Mobile Playwright check at `390x844` wrote `tmp/test-governance/page-debug-application-api-mobile/meta.json`; App API content, page grid, and status card did not overflow the viewport after the SectionPageLayout/App API CSS fixes.
- `node scripts/node/check-style-boundary.js page page.application-api` passed.
- `node scripts/node/check-style-boundary.js page page.settings-docs` passed.
- `node scripts/node/check-style-boundary.js all-pages` was attempted but is not delivery evidence: it timed out in pre-existing `page.application-detail` setup while waiting for `.agent-flow-node-card--type-llm`.

### Task 5: Run `qa-evaluation` task review

- [x] Load `qa-evaluation` before writing the delivery review.
- [x] Review evidence against the spec acceptance list:
  - Key lifecycle.
  - Active publication requirement.
  - Native blocking and streaming.
  - Waiting/resume/cancel.
  - OpenAI blocking and streaming.
  - Anthropic blocking and streaming.
  - Unsupported feature errors.
  - Application API docs/UI.
  - Mapping nullable `model_target`.
  - No public `application_id` in URLs.
- [x] Record any unverified items explicitly as "not verified" rather than claiming completion.

Expected:

- QA output is evidence-driven and does not invent pass/fail claims without command or browser evidence.

QA notes:

- Verified by targeted evidence: key lifecycle, active publication requirement, Native run/resume/cancel/file route coverage, Native SSE translation, OpenAI/Anthropic blocking and streaming adapters, unsupported feature errors, app-scoped docs/UI, nullable `model_target`, no public `application_id` in runtime URLs, and one-time full API key UI behavior.
- Not verified locally: full workspace Rust test/clippy/coverage and full frontend `verify:full`; these remain delegated to GitHub Actions per the local heavy-gate budget.

### Task 6: Final repository state, commit, and push

- [x] Confirm the working tree only contains intended implementation and plan status changes:

```bash
git status --short
```

- [x] Commit with an English message, for example:

```bash
git add api web docs scripts .github
git commit -m "Implement application public API"
```

- [x] Push only the current branch:

```bash
git push
```

- [x] Monitor GitHub Actions for heavy Rust consistency gates instead of running them locally unless the user explicitly requests local heavy gates.

Expected:

- Current branch is pushed.
- Local verification evidence is summarized.
- Heavy backend gates are delegated to CI.

## Stop Conditions

- Any targeted test exposes data leakage across API keys, applications, or users.
- Public route docs include `application_id` in runtime URLs.
- `model` becomes validated against provider/runtime model registry.
- UI stores a full API key outside component memory.
- Local heavy gates are required by the user before delivery; pause and ask for the exact local gate budget.
