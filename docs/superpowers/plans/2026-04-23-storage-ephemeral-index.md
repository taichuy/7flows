# Storage Ephemeral Plan Index

> **For agentic workers:** Read this index before executing any `storage-ephemeral` plan. It maps the approved `storage-ephemeral` direction into a dependency-aware execution order and fixes the shared scope rules up front.

**Goal:** Replace the implementation-named `storage-redis` slice with a capability-named `storage-ephemeral` layer that defaults to memory, keeps session integration intact, preserves PostgreSQL as workflow source of truth, and leaves a clean future seam for Redis-backed multi-node extensions.

**Architecture:** Execute this work in four dependent tracks. First, add the new crate, contract surface, and memory backend without touching consumers. Second, rewire session and startup config onto the new layer. Third, add future-facing lease and wakeup primitives plus the documented host-extension seam without forcing Redis into the current runtime. Fourth, remove the old `storage-redis` references, migrate docs/env examples, and close the work with focused regression plus QA.

**Tech Stack:** Markdown planning docs only.

---

## Approved Design Source

Execute these plans against the approved direction from the current architecture discussion:

1. `storage-ephemeral` is the new capability layer name.
2. `memory` is the default built-in backend.
3. `SessionStore` remains a business-facing port and is implemented on top of `storage-ephemeral`.
4. PostgreSQL remains the workflow fact source.
5. Redis stays optional and future-facing, with host-extension delivery considered only after a separate infrastructure-provider bootstrap seam exists.

## New Execution Plans

1. [2026-04-23-storage-ephemeral-contract-and-layout.md](./2026-04-23-storage-ephemeral-contract-and-layout.md)
   Introduces the new crate, workspace membership, capability-oriented module layout, backend kind enum, and memory-backed key/value contract with TTL semantics.
2. [2026-04-23-storage-ephemeral-session-and-config.md](./2026-04-23-storage-ephemeral-session-and-config.md)
   Moves session storage onto `storage-ephemeral`, adds config-driven backend selection, makes Redis optional, and fixes memory-backend expiry behavior.
3. [2026-04-23-storage-ephemeral-workflow-primitives-and-host-extension-seam.md](./2026-04-23-storage-ephemeral-workflow-primitives-and-host-extension-seam.md)
   Adds future workflow-oriented ephemeral primitives such as leases and wakeup signals while documenting the bootstrap gap that currently prevents host extensions from supplying early core infrastructure providers.
4. [2026-04-23-storage-ephemeral-migration-and-regression.md](./2026-04-23-storage-ephemeral-migration-and-regression.md)
   Removes the old crate references, updates docs and env examples, and closes the migration with focused regression plus `qa-evaluation`.

## Recommended Execution Order

### Phase 1: Contract Root

1. `2026-04-23-storage-ephemeral-contract-and-layout.md`

Run this first. The remaining plans assume the new crate, naming, and memory key/value contract already exist.

### Phase 2: Core Consumer Rewire

2. `2026-04-23-storage-ephemeral-session-and-config.md`

Run this second. It turns the new crate into the real session backend and removes the startup hard dependency on Redis for single-node mode.

### Phase 3: Future Workflow Extension Seam

3. `2026-04-23-storage-ephemeral-workflow-primitives-and-host-extension-seam.md`

Run this third. It must not start before the core crate and backend selection flow are stable because its types build on the same capability-oriented naming and backend model.

### Phase 4: Cleanup, Deletion, And QA Closeout

4. `2026-04-23-storage-ephemeral-migration-and-regression.md`

Run this last. It removes the old `storage-redis` references only after the new consumer path is already green.

## Shared Scope Rules

These rules apply to every plan in this set:

1. Do not keep `storage-redis` as the long-term semantic name for the layer.
2. Do not rename the capability layer to `memory`; `memory` is a backend, not the architectural boundary.
3. Do not collapse sessions into a generic cache API. `SessionStore` remains a narrow business port.
4. Do not make Redis mandatory for single-node startup, local development, or workflow execution.
5. Do not treat Redis as the workflow fact source. PostgreSQL remains the durable source of truth for runs, checkpoints, callback tasks, and events.
6. Do not introduce host-extension powered infrastructure registration in this plan set; only define the seam and document the bootstrap ordering requirement.
7. Keep compatibility shims to the minimum needed to preserve ordered migration. Temporary overlap between old and new crates is acceptable only between dependent plans and must be removed by the final migration plan.

## Shared Naming Rules

Use these names consistently across plans:

1. “storage-ephemeral / ephemeral layer” means the capability-oriented, non-durable infrastructure layer.
2. “backend” means a concrete implementation such as `memory` or `redis`.
3. “session store” means the business-facing session adapter built on top of the ephemeral layer.
4. “workflow primitives” means reusable ephemeral coordination abilities such as leases and wakeup signals, not a durable execution queue.
5. “infra-provider seam” means the future startup-time registration surface for optional backends. It is not the current `host_extension` activation path.

## Dependency Notes

- The contract-and-layout plan owns the new crate, workspace membership, module names, and the first stable key/value contract.
- The session-and-config plan owns backend selection config, session expiry correctness, and all API-server consumer rewires.
- The workflow-primitives plan owns only future-facing ephemeral contracts and in-memory implementations; it must not smuggle Redis back into the core startup path.
- The migration-and-regression plan owns all old-name deletions, docs/env updates, and the final QA closeout.
