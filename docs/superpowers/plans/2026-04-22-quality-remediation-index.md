# Quality Remediation Plan Index

> **For agentic workers:** Read this index before executing any quality-remediation plan. It defines the remaining in-scope quality work after the `globals.css` theme whitelist decision.

**Goal:** Turn the remaining quality findings into a dependency-aware execution sequence so QA evidence becomes trustworthy again before deeper refactors start.

**Architecture:** Treat the current quality work as four ordered slices. Phase 1 restores the broken `application-detail` frontend evidence path. Phase 2 restores a trustworthy backend repo gate. Phase 3 reduces production-owner entropy in the remaining oversized files. Phase 4 splits oversized test support owners so coverage stops depending on giant fixture files.

**Tech Stack:** Markdown planning docs, Rust, TypeScript React, Node verification scripts, Playwright-based repo tooling.

---

## Scope Decision

- [globals.css](/home/taichu/git/1flowbase-project-maintenance/web/app/src/styles/globals.css) is **out of scope** for this remediation sequence.
- The current global Ant Design overrides were explicitly whitelisted as theme-level defaults in [2026-04-22-globals-css-theme-whitelist.md](/home/taichu/git/1flowbase-project-maintenance/.memory/feedback-memory/repository/2026-04-22-globals-css-theme-whitelist.md).
- Do not reopen that topic unless a concrete page regression appears or local fixes stop working.

## Phase Plans

1. [2026-04-22-application-detail-gate-recovery.md](./2026-04-22-application-detail-gate-recovery.md)
   Restore `page.application-detail` as a trustworthy style-boundary and browser-evidence target.
2. [2026-04-22-backend-repo-gate-recovery.md](./2026-04-22-backend-repo-gate-recovery.md)
   Return `verify-backend` to green so backend work has a stable baseline.
3. [2026-04-22-high-entropy-owner-split.md](./2026-04-22-high-entropy-owner-split.md)
   Split the remaining oversized production owners that still concentrate too much behavior.
4. [2026-04-22-test-support-decomposition.md](./2026-04-22-test-support-decomposition.md)
   Split the giant `control-plane` support files and reduce directory pressure in `_tests`.

## Execution Order

### Phase 1: Restore Frontend Evidence

- Must run first.
- Do not claim frontend application-detail quality coverage until this phase passes.

### Phase 2: Restore Backend Baseline

- Starts after Phase 1 is at least classified.
- Do not start broad backend refactors while `verify-backend` still fails on repo-gate noise.

### Phase 3: Split Production Owners

- Starts only after Phases 1 and 2 produce trustworthy evidence.
- Keep behavior stable; this phase is about owner boundaries, not feature expansion.

### Phase 4: Split Test Support Owners

- Runs after or alongside Phase 3 once production-owner boundaries are stable enough.
- Do not use Phase 4 to hide product bugs; it only reduces test-support entropy.

## Stop Conditions

- Stop if `application-detail` gate recovery reveals a real user-facing route defect instead of a scene-fixture defect.
- Stop if `verify-backend` fails again after formatting for a different root cause than the known formatting drift.
- Stop if any owner split changes a public HTTP or UI contract instead of internal structure.

## Deliverable Rule

- Each phase must leave behind:
  - updated plan status
  - command evidence
  - a clear reclassification of any residual risk
- Do not mark a later phase started until the earlier phase result is recorded.
