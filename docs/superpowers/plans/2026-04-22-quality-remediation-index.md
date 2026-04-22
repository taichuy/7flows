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

## Completion Status

- [x] Phase 1 completed.
- [x] Phase 2 completed.
- [x] Phase 3 completed.
- [x] Phase 4 completed.

## Final Execution Summary

- Phase 1 restored `page.application-detail` by fixing the missing style-boundary `node-contributions` fixture, adding a focused scene assertion, and reclassifying `/applications/app-1/orchestration` as an invalid stale sample id rather than a real route defect.
- Phase 2 returned `node scripts/node/verify-backend.js` to green by normalizing the original formatting drift and removing the narrow clippy noise that surfaced afterward.
- Phase 3 split the four oversized production owners into explicit module trees:
  - `orchestration_runtime.rs`: `1352 -> 691` lines
  - `model_provider.rs`: `1212 -> 659` lines
  - `SettingsModelProvidersSection.tsx`: `951 -> 441` lines
  - `scripts/node/dev-up/core.js`: `952 -> 59` lines
- Phase 4 split the two oversized `control-plane` support owners into focused support trees without changing the existing test import surface:
  - `src/_tests/orchestration_runtime/support.rs`: `1848 -> 32` lines façade
  - `src/_tests/plugin_management/support.rs`: `1503 -> 64` lines façade

## Final QA Evidence

- Frontend contracts and focused gates:
  - `node scripts/node/test-contracts.js`
  - `node scripts/node/check-style-boundary.js page page.application-detail`
- Frontend fast regression:
  - `node scripts/node/test-frontend.js fast`
  - warnings: [frontend-fast.warnings.log](/home/taichu/git/1flowbase-project-maintenance/tmp/test-governance/frontend-fast.warnings.log)
- Browser evidence:
  - `node scripts/node/page-debug.js snapshot /settings/model-providers --account root --password change-me --wait-for-selector .model-provider-panel`
  - output: [meta.json](/home/taichu/git/1flowbase-project-maintenance/tmp/page-debug/2026-04-22T08-39-20-472Z/meta.json), [page.png](/home/taichu/git/1flowbase-project-maintenance/tmp/page-debug/2026-04-22T08-39-20-472Z/page.png), [console.ndjson](/home/taichu/git/1flowbase-project-maintenance/tmp/page-debug/2026-04-22T08-39-20-472Z/console.ndjson)
- Scripts and backend regression:
  - `node scripts/node/test-scripts.js dev-up`
  - `node scripts/node/verify-backend.js`
  - warnings: [verify-backend.warnings.log](/home/taichu/git/1flowbase-project-maintenance/tmp/test-governance/verify-backend.warnings.log)

## Residual Notes

- The current `globals.css` Ant Design overrides remain intentionally out of scope and whitelisted as theme defaults by [2026-04-22-globals-css-theme-whitelist.md](/home/taichu/git/1flowbase-project-maintenance/.memory/feedback-memory/repository/2026-04-22-globals-css-theme-whitelist.md).
- `api/crates/control-plane/src` still has `24` direct files and `api/crates/control-plane/src/_tests` still has `20` direct files. This remediation reduced owner entropy and stopped adding new flat files, but it did not fully normalize those two directory-level counts.
