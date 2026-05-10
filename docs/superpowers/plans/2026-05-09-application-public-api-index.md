# Application Public API 1+n Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is an index plan; execute child plans in order and update checkbox state in both this file and the active child plan after each completed task.

**Goal:** Implement the first production slice of 1flowbase Application Public API: application-bound API keys, published-version-only Native runs, OpenAI and Anthropic compatible endpoints, application-scoped API docs, mapping UI, and acceptance evidence.

**Architecture:** Keep Native API as the only core protocol. Application API keys resolve the application and active published version, then compatibility adapters convert OpenAI or Anthropic payloads into the same Native envelope before execution. Console routes manage keys, publishing, mapping, and app-scoped docs; public routes never expose `application_id`.

**Tech Stack:** Rust 2021, Axum, Tokio, SQLx/PostgreSQL, Serde, Utoipa/OpenAPI, RuntimeEventStream, React 19, TypeScript, Ant Design 5, TanStack Query, Scalar API Reference, Vitest.

---

## Source Spec

- `docs/superpowers/specs/1flowbase/2026-05-09-application-public-api-design.md`
- `.memory/project-memory/2026-05-09-application-public-api-decisions.md`
- `.memory/feedback-memory/repository/2026-05-09-application-api-model-pass-through.md`
- `.memory/feedback-memory/repository/2026-04-15-application-api-routing-bound-by-key-not-path.md`

## Planning Rules

- Plan language is English.
- Execute in the current repository; do not create a git worktree.
- Keep warning and coverage artifacts under `tmp/test-governance/`.
- Use `qa-evaluation` for self-check, acceptance, regression, or delivery review stages.
- Heavy Rust consistency gates should run in GitHub Actions unless the user explicitly asks to run them locally.
- After each completed child-plan task, update both the child plan and this index.
- If using subagents during implementation, run only one independent implementation subagent at a time.

## Existing Local Changes To Preserve

The plan was created after commit `b9ae568e Clarify public API model passthrough`. No unrelated local changes were present before these plan files were added.

## Child Plans

- [x] **01 Publication And API Key Core:** `docs/superpowers/plans/2026-05-09-application-public-api-01-publication-api-key-core.md`
  - Adds application API key storage and console management.
  - Adds active published version, API enabled state, and mapping snapshot boundaries.
  - Preserves Data Model API key behavior.
  - [x] Task 1 RED tests added and verified failing against missing application public API core.
  - [x] Task 2 migration added and storage migration tests verified.
  - [x] Task 3 application API key domain/service added; publication/mapping tests remain red for Task 4.
  - [x] Task 4 mapping and publication service boundary added; control-plane application_public_api tests pass.
  - [x] Task 5 console application API routes added and route/OpenAPI checks passed.
  - [x] Task 6 application API section status now reflects key + mapping + active publication state.

- [x] **02 Native Run Service And Public Routes:** `docs/superpowers/plans/2026-05-09-application-public-api-02-native-run-service-routes.md`
  - Adds Native `/api/1flowbase/runs`, run read, resume, cancel, and file upload.
  - Adds published API run mode, conversation binding, audit metadata, and Native SSE.
  - Ensures `model` is type-only pass-through and only injected when `model_target` is configured.
  - [x] Task 1 RED tests added for Native request contract and public route behavior.
  - [x] Task 2 published run persistence state added with run metadata round-trip coverage.
  - [x] Task 3 Native envelope types and input mapper added; model remains pass-through.
  - [x] Task 4 published-flow execution, blocking result, idempotency, and terminal audit added.
  - [x] Task 5 read/cancel/resume and conversation binding added; public resume route delegates to existing callback completion.
  - [x] Task 6 public Native run/file routes mounted with Native error mapping and OpenAPI coverage.
  - [x] Task 7 Native SSE maps runtime events to public event names and filters debug internals.

- [x] **03 OpenAI And Anthropic Compatible Adapters:** `docs/superpowers/plans/2026-05-09-application-public-api-03-compatible-adapters.md`
  - Adds `/v1/chat/completions` and `/v1/messages`.
  - Converts compatible request/response/error/streaming shapes at the adapter boundary.
  - Keeps unsupported tools and waiting states out of compatible v1.
  - [x] Task 1 OpenAI and Anthropic mapper RED tests added, then verified green after mapper implementation.
  - [x] Task 2 OpenAI text-chat mapper, error model, blocking DTO, and streaming chunk translator added; multimodal/file inputs return `unsupported_feature` in this slice.
  - [x] Task 3 Anthropic text-chat mapper, dual header auth, error model, blocking DTO, and streaming event translator added; multimodal/document/tool blocks return `unsupported_feature` in this slice.
  - [x] Task 4 compatible public routes mounted at `/v1/*`, reuse Native run service, and are registered in OpenAPI.
  - [x] Task 5 compatible streams translate public text/terminal/error events and hide Native workflow/debug internals.

- [x] **04 Application API Docs And UI:** `docs/superpowers/plans/2026-05-09-application-public-api-04-docs-ui.md`
  - Abstracts the Settings API docs panel into a reusable docs explorer.
  - Adds Application API tab for keys, Native docs, OpenAI docs, Anthropic docs, mapping, and online debug.
  - Keeps full API keys in memory only after creation.
  - [x] Task 1 app-scoped public API docs routes added with current application state, unsupported feature notes, and public paths without `application_id`.
  - [x] Task 2 API client DTOs and transport tests added under `application-public-api`.
  - [x] Task 3 Settings API docs viewer extracted to reusable `ApiDocsExplorer` with injected fetchers/auth/query-state.
  - [x] Task 4 Application API page shell lazy-loaded from application detail with status bar, tabs, and publish action.
  - [x] Task 5 API key table/create/revoke flow added; full token remains one-time in component memory.
  - [x] Task 6 Native/OpenAI/Anthropic docs tabs use app-scoped docs fetchers and local query state.
  - [x] Task 7 Mapping panel added with nullable `model_target` and selector validation.
  - [x] Task 8 Debug panel added for Native/OpenAI/Anthropic public requests without persisted keys.

- [x] **05 QA And Delivery:** `docs/superpowers/plans/2026-05-09-application-public-api-05-qa-delivery.md`
  - Runs targeted backend, API, OpenAPI, frontend, and app-route evidence.
  - Uses `qa-evaluation` for the delivery review.
  - Defers heavy Rust consistency gates to GitHub Actions by pushing the branch.
  - [x] Task 1 backend application public API, storage, migration, and route tests passed.
  - [x] Task 2 OpenAPI and API client tests passed.
  - [x] Task 3 targeted frontend and fast frontend gate passed.
  - [x] Task 4 page-debug, mobile viewport, and target style-boundary checks passed; all-pages style-boundary remains limited by an existing application-detail scene timeout.
  - [x] Task 5 QA review recorded verified and unverified gates.

## Required Execution Order

1. Run plan 01 first because all public execution paths depend on application API key identity, active publication, and published mapping snapshots.
2. Run plan 02 second because Native API is the core protocol and compatible endpoints must call into it instead of duplicating runtime execution.
3. Run plan 03 third because OpenAI and Anthropic adapters depend on the Native request/result/stream contracts.
4. Run plan 04 after plans 01-03 so the frontend can consume stable console routes and operation docs.
5. Run plan 05 last to validate cross-layer contracts and produce delivery evidence.

## Acceptance Mapping

| Requirement | Child Plans |
| --- | --- |
| External URL does not expose `application_id` | 01, 02, 03, 05 |
| Application identity comes from application API key | 01, 02, 03 |
| API key calls only active published version | 01, 02, 05 |
| Application API keys are create/list/delete, creator-scoped, and token-only-once | 01, 04, 05 |
| Native API supports `query`, optional `model`, `inputs`, `history`, `attachments`, conversation, streaming, execution metadata | 02, 05 |
| `model` is pass-through string, not a serving id or routing input | 01, 02, 03, 05 |
| `model_target` may be null and must not auto-inject node input when null | 01, 02, 04, 05 |
| Native SSE emits run/message/workflow/required_action/usage/terminal events | 02, 05 |
| OpenAI blocking and streaming response shapes are SDK-compatible | 03, 05 |
| Anthropic blocking and streaming response shapes are SDK-compatible | 03, 05 |
| Unsupported tools/files/images behavior is documented and returns compatible errors | 03, 04, 05 |
| Application API tab reuses docs explorer without jumping to Settings docs | 04, 05 |
| Online debug does not persist full API keys | 04, 05 |

## Global Verification Commands

Targeted backend:

```bash
cargo test -p control-plane application_public_api -- --test-threads=1
cargo test -p storage-postgres application_public_api -- --test-threads=1
cargo test -p api-server application_public_api -- --test-threads=1
```

OpenAPI and generated client:

```bash
node scripts/node/verify-openapi.js
pnpm --dir web/packages/api-client test
```

Targeted frontend:

```bash
pnpm --dir web/app test -- application-api api-docs-panel
```

Repository contracts:

```bash
node scripts/node/test-contracts.js
node scripts/node/test-frontend.js fast
```

Run heavy Rust consistency gates in GitHub Actions by pushing the current branch unless the user explicitly requests local heavy gates.

## Stop Conditions

Pause implementation and return to design if any active child plan requires:

- Public API calls to select a non-active or explicit historical published version.
- Application identity in the external URL path.
- `model` validation against public serving ids, provider model ids, or runtime routing records.
- Compatible endpoints to support tools, tool results, function calls, computer use, or waiting-state resume in v1.
- Root-only global visibility of all users' application API keys inside the app API key list.
- Long-term frontend storage of full application API keys.
- RuntimeExtension or CapabilityPlugin direct access to host infra contracts outside declared host/provider boundaries.
