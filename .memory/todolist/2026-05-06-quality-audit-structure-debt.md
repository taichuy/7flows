# 2026-05-06 quality audit structure debt

## Context

Quality gate for `latest` passed on GitHub run `25428429684`, so this offline pass moved to repository quality audit.

Follow-up watch on `2026-05-06 18` found current `latest` head `351b23a8` running GitHub `verify` run `25430321506`. Do not treat the earlier pass as evidence for that newer head until the run artifact is checked.

## Needs User Decision

The audit found structural debt that is too broad to refactor safely during unattended quality watch.

File length evidence from a static scan that excluded `.git`, `node_modules`, `api/target`, and `tmp`:

- `api/crates/control-plane/src/_tests/model_definition_service_tests.rs`: 2222 lines.
- `api/crates/control-plane/src/_tests/model_provider_service_tests.rs`: 2193 lines.
- `api/apps/api-server/src/_tests/application/runtime_model_routes.rs`: 2139 lines.
- `api/apps/api-server/src/_tests/application/model_definition_routes.rs`: 2094 lines.
- `api/crates/control-plane/src/_tests/data_source_service_tests.rs`: 2026 lines.
- `web/app/src/features/settings/_tests/model-providers-page.test.tsx`: 2018 lines.
- `api/crates/control-plane/src/_tests/support.rs`: 1654 lines.

Directory size evidence from the same scan:

- `scripts/node`: 46 entries.
- `api/crates/storage-durable/postgres/migrations`: 43 entries.
- `api/crates/control-plane/src`: 42 entries.
- `api/crates/control-plane/src/_tests`: 37 entries.
- `api/apps/api-server/src/_tests`: 28 entries.
- `web/app/src/features/agent-flow/_tests`: 25 entries.
- `api/crates/storage-durable/postgres/src/_tests`: 24 entries.
- `api/crates/storage-durable/postgres/src`: 23 entries.
- `api/apps/api-server/src`: 22 entries.
- `web/packages/api-client/src`: 20 entries.

## Recommended Direction

Approve a dedicated cleanup plan instead of mixing this into quality-gate watch fixes:

1. Split oversized test files by feature scenario under existing `_tests` directories, starting with `control-plane` service tests and API route tests.
2. Move `scripts/node` command internals into command-specific subdirectories while keeping current CLI entry files stable.
3. Split backend source directories only along existing domain boundaries from `api/AGENTS.md`.
4. Treat `docs/superpowers/plans` and early `docs/superpowers/specs` separately because root `AGENTS.md` allows them to remain historical archives.

## Stop Condition

Do not start broad file moves until the user confirms the cleanup scope and priority, because it will affect imports, test filters, and historical file ownership.
