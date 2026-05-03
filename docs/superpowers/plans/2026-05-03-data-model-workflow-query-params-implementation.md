# Data Model Workflow Query Params Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is an index plan; execute child plans in order and update checkbox state in both this file and the active child plan after each task.

**Goal:** Build structured query params for Data Model workflow `list` nodes so filters, sorts, pagination, relation expansion, and selector-backed values work in node config, debug preview, compilation, and runtime execution.

**Architecture:** Add a first-class `data_model_query` binding. The frontend owns constrained editing and selector dependency discovery; the compiler and debug preview filter bindings by Data Model action; the backend binding runtime resolves query values into the existing `WorkflowDataModelRuntime::list` query JSON.

**Tech Stack:** React 19, Ant Design 5, Vitest, `@1flowbase/flow-schema`, Rust 2021, `serde_json`, `anyhow`, Tokio tests.

---

## Source Spec

- Spec: `docs/superpowers/specs/1flowbase/2026-05-03-data-model-workflow-query-params-design.md`
- Commit containing spec: `bb670524 docs: add data model workflow query params spec`

## Worktree Caution

The current workspace has unrelated frontend edits in:
- `web/app/src/features/agent-flow/_tests/agent-flow-node-card.test.tsx`
- `web/app/src/features/agent-flow/components/editor/styles/canvas.css`
- `web/app/src/features/agent-flow/components/editor/styles/detail-panel.css`
- `web/app/src/features/agent-flow/components/editor/styles/inspector.css`
- `web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx`

Do not revert or reformat them. The implementation does not require touching those files.

## Child Plans

- [x] **01 Frontend Contract:** `docs/superpowers/plans/2026-05-03-data-model-workflow-query-params-implementation-01-frontend-contract.md`
  - Adds shared TypeScript query binding types.
  - Adds frontend query helpers.
  - Makes debug preview, validation, and duplicate transforms selector-aware and action-aware.

- [ ] **02 Frontend UI:** `docs/superpowers/plans/2026-05-03-data-model-workflow-query-params-implementation-02-frontend-ui.md`
  - Registers the Data Model query editor in node schema.
  - Adds `DataModelQueryField`.
  - Covers field filtering, operator options, selector-backed values, sorting, relation expansion, and pagination.

- [ ] **03 Backend Orchestration Runtime:** `docs/superpowers/plans/2026-05-03-data-model-workflow-query-params-implementation-03-backend-orchestration-runtime.md`
  - Filters compiled Data Model bindings by action.
  - Extracts selectors from `data_model_query`.
  - Resolves `data_model_query` into the standard runtime list query object.

- [ ] **04 Control Plane And Verification:** `docs/superpowers/plans/2026-05-03-data-model-workflow-query-params-implementation-04-control-plane-verification.md`
  - Adds workflow list pagination clamp and runtime validation.
  - Adds Data Model execution coverage.
  - Runs final frontend and backend gates.

## Acceptance Mapping

- Data Model list node can configure query params: child plan 02.
- Constant filter values work: child plans 03 and 04.
- Selector filter values work: child plans 01, 03, and 04.
- Sort and pagination work: child plans 02, 03, and 04.
- Relation expand UI and runtime validation are covered: child plans 02 and 04.
- Hidden query binding does not affect non-list actions: child plans 01, 03, and 04.
- Debug preview recognizes missing query variables: child plan 01.
- Backend output stays `{ records, total }`: child plan 04 preserves existing output shape.
- Warning and coverage artifacts stay under `tmp/test-governance/`: child plan 04.

## Verification Commands

Targeted frontend:

```bash
pnpm --dir web/app test -- node-schema-registry node-inspector node-debug-preview-input validate-document document-transforms
```

Targeted backend:

```bash
cargo test -p orchestration-runtime compile_data_model data_model_query -- --test-threads=1
cargo test -p control-plane orchestration_runtime_data_model -- --test-threads=1
```

Focused frontend workspace:

```bash
pnpm --dir web/app test -- agent-flow
```

## Stop Conditions

Pause implementation and return to design if any of these are required:
- Nested filter groups or `or` query.
- Cross-model join query.
- SQL custom query.
- Query one/query many split for Data Model list.
- Change to `/api/runtime/models/{model_code}/records` HTTP query protocol.
