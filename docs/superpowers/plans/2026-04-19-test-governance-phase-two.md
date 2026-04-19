# Test Governance Phase Two Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the approved test governance model with a dedicated `scripts/node` test runner and a repository-level `full` verification wrapper that stitches scripts, frontend, and backend gates together.

**Architecture:** Keep repository entrypoints in `scripts/node/*` so the repo still has one language-agnostic control plane for verification. Reuse the existing `warning-capture` runner to avoid inventing another execution path, and let `verify-repo` compose already-formalized subcommands instead of duplicating their command logic.

**Tech Stack:** Node.js CLI wrappers, `node:test`, Markdown docs

---

## File Structure

**Create**
- `scripts/node/test-scripts.js`
- `scripts/node/test-scripts/_tests/cli.test.js`
- `scripts/node/verify-repo.js`
- `scripts/node/verify-repo/_tests/cli.test.js`
- `docs/superpowers/plans/2026-04-19-test-governance-phase-two.md`

**Modify**
- `README.md`
- `scripts/node/dev-up/_tests/frontend-api-defaults.test.js`

**Notes**
- `test-scripts` must support running all `scripts/node/**/_tests/*.js` and a filtered targeted mode.
- `verify-repo` is the new repository-level full gate; it should compose `test-scripts`, `test-frontend full`, and `verify-backend`.
- Warning output remains advisory only and must continue to land in `tmp/test-governance/`.
- Verification may expose stale script tests; fix those drifts in place instead of weakening the new repo gate.

### Task 1: Add A Dedicated `scripts/node` Test Runner

**Files:**
- Create: `scripts/node/test-scripts.js`
- Create: `scripts/node/test-scripts/_tests/cli.test.js`

- [x] **Step 1: Write failing CLI tests for script test discovery, filtering, and warning capture**
- [x] **Step 2: Run targeted `node:test` and verify RED**
- [x] **Step 3: Implement `test-scripts.js` on top of the shared warning runner**
- [x] **Step 4: Re-run targeted `node:test` and verify GREEN**

### Task 2: Add A Repository-Level Full Verification Wrapper

**Files:**
- Create: `scripts/node/verify-repo.js`
- Create: `scripts/node/verify-repo/_tests/cli.test.js`
- Modify: `README.md`

- [x] **Step 1: Write failing CLI tests for `verify-repo` command composition**
- [x] **Step 2: Run targeted `node:test` and verify RED**
- [x] **Step 3: Implement `verify-repo.js` and document the new repo-level full gate**
- [x] **Step 4: Re-run targeted `node:test` and verify GREEN**

### Task 3: Focused Verification And Close Out

**Files:**
- Modify: `docs/superpowers/plans/2026-04-19-test-governance-phase-two.md`

- [x] **Step 1: Run fresh script wrapper tests**
- [x] **Step 2: Run `node scripts/node/test-scripts.js`**
- [x] **Step 3: Run `node scripts/node/verify-repo.js` or an injected command-shape verification path**
- [x] **Step 4: Update this plan with actual verification results**
- [ ] **Step 5: Commit**

## Verification Results

- `rtk node --test scripts/node/test-scripts/_tests/cli.test.js scripts/node/verify-repo/_tests/cli.test.js`
  - PASS, `6` tests passed.
- `rtk node --test scripts/node/dev-up/_tests/frontend-api-defaults.test.js`
  - PASS after updating the drifted assertions to the current frontend API transport layout.
- `rtk node scripts/node/test-scripts.js`
  - PASS, `62` script-layer tests passed and warning output was captured under `tmp/test-governance/test-scripts.warnings.log`.
- `rtk node scripts/node/verify-repo.js`
  - PASS.
  - `test-scripts` passed.
  - frontend full gate passed: `lint`, `turbo test`, `build`, `style-boundary`.
  - backend full gate passed: `fmt`, `clippy`, `cargo test --workspace`, `cargo check --workspace`.
