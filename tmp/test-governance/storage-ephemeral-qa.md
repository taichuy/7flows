# Storage Ephemeral QA Closeout

## Scope

- Evaluated on `2026-04-23 15`.
- Covered the full `storage-ephemeral` migration set:
  - new `storage-ephemeral` capability crate and memory backend contracts
  - config-driven session backend selection with `memory` as the default
  - session rewiring in `api-server`
  - workflow lease and wakeup primitives plus bootstrap seam documentation
  - removal of the legacy `storage-redis` crate and repository references

## Commands Run

1. `cargo test --manifest-path api/Cargo.toml -p storage-ephemeral -- --nocapture`
   Result: PASS. `10 passed; 0 failed`.
2. `cargo test --manifest-path api/Cargo.toml -p api-server config_tests -- --nocapture`
   Result: PASS. `15 passed; 0 failed`.
3. `cargo test --manifest-path api/Cargo.toml -p api-server session_routes -- --nocapture`
   Result: PASS. `5 passed; 0 failed`.
4. `cargo test --manifest-path api/Cargo.toml -p api-server --test health_routes -- --nocapture`
   Result: PASS. `5 passed; 0 failed`.
   Note: used the explicit integration-test target because `cargo test ... health_routes` only filters by test name and did not execute the file-scoped integration tests.
5. `cargo test --manifest-path api/Cargo.toml -p control-plane workspace_session -- --nocapture`
   Result: PASS. `4 passed; 0 failed`.
6. `cargo test --manifest-path api/Cargo.toml -p control-plane session_security -- --nocapture`
   Result: PASS. `3 passed; 0 failed`.
7. `cargo metadata --manifest-path api/Cargo.toml --format-version 1 > /tmp/storage-ephemeral-metadata.json`
   Result: PASS. Metadata refreshed for the post-migration workspace.
8. `cargo check --manifest-path api/Cargo.toml -p api-server`
   Result: PASS. `api-server` compiles against `storage-ephemeral` after legacy crate deletion.
9. `rg -n "storage-redis|storage_redis|RedisSessionStore|InMemorySessionStore" api -g '!target'`
   Result: PASS. No remaining legacy code references.
10. `rg -n "storage-redis|API_REDIS_URL" api/README.md api/AGENTS.md api/apps/api-server/.env api/apps/api-server/.env.example api/apps/api-server/.env.production.example web/app/.env.example`
   Result: PASS. No remaining legacy doc/env references.

## Results

- `storage-ephemeral` now owns ephemeral key/value storage, session adapters, lease primitives, and wakeup primitives.
- `api-server` defaults to `API_EPHEMERAL_BACKEND=memory` and only requires `API_EPHEMERAL_REDIS_URL` when `redis` is explicitly selected.
- Legacy `storage-redis` workspace membership and code were removed.
- Focused auth/session/workspace regressions stayed green after the migration.

## Residual Risks

- The Redis-backed session adapter is config-gated and compiles, but this regression pass did not exercise it against a live Redis instance.
- Lease and wakeup primitives currently have in-memory unit coverage only; there is no multi-process or multi-node verification in this closeout.

## Decision

- PASS. The `storage-ephemeral` migration is ready on the current branch with the above residual risks noted.
