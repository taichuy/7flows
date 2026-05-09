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

- [ ] Run application key and publication service tests:

```bash
cargo test -p control-plane application_public_api -- --test-threads=1
```

- [ ] Run storage repository and migration tests:

```bash
cargo test -p storage-postgres application_public_api -- --test-threads=1
cargo test -p storage-postgres migration_smoke -- --test-threads=1
```

- [ ] Run API server route tests:

```bash
cargo test -p api-server application_public_api -- --test-threads=1
cargo test -p api-server application_api_routes -- --test-threads=1
```

Expected:

- Application API key lifecycle passes.
- Data Model API key behavior remains intact.
- Active publication is required for public runs.
- Native/OpenAI/Anthropic routes are mounted and authenticated.

### Task 2: Run OpenAPI and API client evidence

- [ ] Verify OpenAPI:

```bash
node scripts/node/verify-openapi.js
```

- [ ] Run API client tests:

```bash
pnpm --dir web/packages/api-client test -- application-public-api
pnpm --dir web/packages/api-client test
```

Expected:

- Public routes are included in OpenAPI.
- Console management/docs routes include `application_id`.
- Public runtime examples do not include `application_id`.
- API client path and payload tests pass.

### Task 3: Run frontend targeted evidence

- [ ] Run app API page tests:

```bash
pnpm --dir web/app test -- application-api-page application-api-docs
```

- [ ] Run Settings docs regression tests:

```bash
pnpm --dir web/app test -- api-docs-panel
```

- [ ] Run fast frontend gate:

```bash
node scripts/node/test-frontend.js fast
```

Expected:

- Application API section renders keys/docs/mapping/debug tabs.
- Settings docs still work through the shared explorer.
- Full API keys are not persisted.

### Task 4: Collect browser and style evidence when UI is complete

- [ ] Start the dev server only if no existing usable server is running.
- [ ] Use the project's Playwright/page-debug path to inspect:
  - Application detail API tab desktop.
  - Application detail API tab mobile.
  - Settings docs page regression.
- [ ] If shared CSS or Scalar wrapper styles changed, run the style-boundary check that covers docs/application routes.
- [ ] Save warnings and screenshots only under approved project locations:
  - warnings/logs under `tmp/test-governance/`.
  - visual artifacts under `uploads/` only when screenshots are needed for user-facing evidence.

Expected:

- No overlapping controls or clipped key/action text.
- App API tab stays inside the application section.
- Settings docs still render the Scalar viewer.

### Task 5: Run `qa-evaluation` task review

- [ ] Load `qa-evaluation` before writing the delivery review.
- [ ] Review evidence against the spec acceptance list:
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
- [ ] Record any unverified items explicitly as "not verified" rather than claiming completion.

Expected:

- QA output is evidence-driven and does not invent pass/fail claims without command or browser evidence.

### Task 6: Final repository state, commit, and push

- [ ] Confirm the working tree only contains intended implementation and plan status changes:

```bash
git status --short
```

- [ ] Commit with an English message, for example:

```bash
git add api web docs scripts .github
git commit -m "Implement application public API"
```

- [ ] Push only the current branch:

```bash
git push
```

- [ ] Monitor GitHub Actions for heavy Rust consistency gates instead of running them locally unless the user explicitly requests local heavy gates.

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
