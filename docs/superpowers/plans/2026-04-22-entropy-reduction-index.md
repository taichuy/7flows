# Entropy Reduction Plan Index

> **For agentic workers:** Read this index before executing any entropy-reduction plan. It defines the dependency-aware sequence and the stop conditions for each phase.

**Goal:** Give the repository cleanup work a single execution map so baseline recovery, compatibility removal, structural refactors, and test stabilization land in the right order.

**Architecture:** Treat this effort as four dependent phases, not one giant refactor. Phase 1 restores trustworthy feedback loops. Phase 2 removes compatibility and dead-code debt that would otherwise keep misleading future work. Phase 3 splits oversized owners into smaller units. Phase 4 stabilizes the remaining test surface after the structural work lands.

**Tech Stack:** Markdown planning docs, Rust, TypeScript React, Node verification scripts.

---

## Source Design

- [2026-04-22-entropy-reduction-and-baseline-recovery-design.md](../specs/1flowbase/2026-04-22-entropy-reduction-and-baseline-recovery-design.md)

## Phase Plans

1. [2026-04-22-baseline-recovery-phase-one.md](./2026-04-22-baseline-recovery-phase-one.md)
   Completed on `2026-04-22`. Restored `test-contracts`, `test-backend.js`, and `test-frontend.js fast` before broader code removal.
2. `2026-04-22-compatibility-removal-phase-two.md`
   [2026-04-22-compatibility-removal-phase-two.md](./2026-04-22-compatibility-removal-phase-two.md)
   Completed on `2026-04-22`. Removed legacy invoke fallback acceptance and deleted dead provider manifest compatibility types.
3. [2026-04-22-structural-split-phase-three.md](./2026-04-22-structural-split-phase-three.md)
   Started on `2026-04-22`. First structural slice completed by extracting `orchestration_runtime` test support out of the production owner; further owner splits still remain.
4. [2026-04-22-plugin-management-split-phase-three.md](./2026-04-22-plugin-management-split-phase-three.md)
   Completed on `2026-04-22`. Split `plugin_management.rs` into catalog/install/family/filesystem owners and mirrored the split under `_tests/plugin_management/`.
5. [2026-04-22-backend-boundary-normalization-phase-three.md](./2026-04-22-backend-boundary-normalization-phase-three.md)
   Completed on `2026-04-22`. Split `ports.rs` into domain owners, grouped `api-server` routes under domain folders, and replaced `_tests/support.rs` with grouped support modules.
6. [2026-04-22-frontend-settings-split-phase-three.md](./2026-04-22-frontend-settings-split-phase-three.md)
   Completed on `2026-04-22`. Shrunk `SettingsPage.tsx` into a route container, moved section resolution into a hook, and extracted the model-provider section into its own owner.
7. [2026-04-22-scripts-node-normalization-phase-three.md](./2026-04-22-scripts-node-normalization-phase-three.md)
   Completed on `2026-04-22`. Split `plugin/core.js` into focused owners, introduced grouped `test/verify/tooling` dispatchers, and kept stable top-level wrappers as thin façades.
8. [2026-04-22-residual-compatibility-cleanup-phase-four.md](./2026-04-22-residual-compatibility-cleanup-phase-four.md)
   Completed on `2026-04-22`. Removed residual runtime/data shims, renamed local install semantics, cleaned plugin OpenAPI wording, dropped legacy `llm-node-config` bridges, and deleted node script compatibility fallbacks.
9. [2026-04-22-warning-and-test-governance-phase-four.md](./2026-04-22-warning-and-test-governance-phase-four.md)
   Completed on `2026-04-22`. Cleared the remaining React Flow / Ant Design / `act(...)` warning noise and moved frontend/coverage evidence into `tmp/test-governance/`.

## Execution Autonomy

- Default execution order is complete; no pending entropy-reduction phases remain.
- Continue sequentially without asking for fresh approval between plans.
- Stop only if one of these happens:
  - a step would change a public HTTP/UI contract rather than internal structure
  - a verification command fails twice with different root causes
  - a plan assumption is invalidated by fresh code movement

## Remaining Work Map

- Entropy-reduction sequence completed on `2026-04-22`.
- No pending cleanup items remain in this index.

## Execution Rules

### Phase 1: Baseline First

- Must run first.
- Do not start compatibility removal before shared contract and schema-fixture drift are corrected.

### Phase 2: Remove Compatibility

- Starts only after Phase 1 evidence is collected.
- Remove dead compatibility code before splitting giant files, otherwise the split preserves bad abstractions.

### Phase 3: Split Owners

- Starts only after compatibility paths are reduced.
- Prefer extracting domain helpers, filesystem helpers, and test fixtures into focused files instead of layer-by-layer shuffling.

### Phase 4: Stabilize Tests

- Runs after Phases 2 and 3.
- Any timeout extension must be justified by real workload, not used as a masking tactic.

## Stop Conditions

- If Phase 1 reveals additional schema/API truth-source drifts, keep work inside Phase 1 until they are closed or explicitly reclassified.
- If compatibility removal changes public contracts unexpectedly, stop before Phase 3 and rewrite the Phase 2 plan.
- If a structural split breaks more tests than it clarifies, stop and re-scope to a smaller owner slice.
