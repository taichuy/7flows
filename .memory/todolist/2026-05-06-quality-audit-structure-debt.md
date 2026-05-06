# 2026-05-06 quality audit structure debt

## Context

Quality gate for `latest` passed on GitHub run `25428429684`, so this offline pass moved to repository quality audit.

## Needs User Decision

The audit found structural debt that is too broad to refactor safely during unattended quality watch:

- Several test files exceed the 1500-line target, including `api/crates/control-plane/src/_tests/model_definition_service_tests.rs` and `web/app/src/features/settings/_tests/model-providers-page.test.tsx`.
- Several directories exceed the 15-entry target, including `scripts/node`, `api/crates/control-plane/src`, and `api/crates/storage-durable/postgres/src`.

## Recommended Direction

Approve a dedicated cleanup plan instead of mixing this into quality-gate watch fixes:

1. Split oversized test files by feature scenario under existing `_tests` directories.
2. Move `scripts/node` command internals into command-specific subdirectories while keeping current CLI entry files stable.
3. Split backend source directories only along existing domain boundaries from `api/AGENTS.md`.

## Stop Condition

Do not start broad file moves until the user confirms the cleanup scope and priority, because it will affect imports, test filters, and historical file ownership.
