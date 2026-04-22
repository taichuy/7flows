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
3. `2026-04-22-structural-split-phase-three.md`
   Planned next. Splits oversized backend/frontend owners after compatibility scope is reduced.
4. `2026-04-22-test-stabilization-phase-four.md`
   Planned last. Converts remaining flaky/slow tests into stable coverage once the code shape stops moving.

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
