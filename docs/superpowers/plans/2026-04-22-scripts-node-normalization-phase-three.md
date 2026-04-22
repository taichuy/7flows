# Scripts Node Normalization Phase Three Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `scripts/node` sprawl by splitting `plugin/core.js`, shrinking top-level entrypoint count, and aligning command ownership with script domains.

**Architecture:** Keep CLI behavior stable while moving implementation into focused modules. `scripts/node/plugin/core.js` becomes a small dispatcher over `init`, `package`, `manifest`, and `release` helpers. Then normalize top-level `scripts/node` entrypoints by grouping verification and test orchestration under domain directories with intentionally thin launch files.

**Tech Stack:** Node.js, CommonJS modules, repository script entrypoints, `node:test`.

---

## File Structure

**Modify**
- `scripts/node/plugin/core.js`
- `scripts/node/plugin.js`
- `docs/superpowers/plans/2026-04-22-scripts-node-normalization-phase-three.md`

**Create**
- `scripts/node/plugin/init.js`
- `scripts/node/plugin/manifest.js`
- `scripts/node/plugin/package.js`
- `scripts/node/plugin/release.js`
- `scripts/node/plugin/fs.js`
- `scripts/node/test/index.js`
- `scripts/node/verify/index.js`
- `scripts/node/tooling/index.js`

**Delete or Move**
- legacy single-purpose top-level entrypoints once all references are updated in the same change set

**Run**
- `node scripts/node/test-scripts.js`
- `node scripts/node/verify-repo.js`

## Task 1: Split Plugin Script Core

**Files:**
- Modify: `scripts/node/plugin/core.js`
- Create: `scripts/node/plugin/*.js`

- [ ] **Step 1: Keep `core.js` as command dispatcher**

`core.js` should only parse CLI args and delegate.

- [ ] **Step 2: Move implementation by concern**

- `init.js`: plugin scaffolding/init
- `manifest.js`: manifest/provider code derivation and metadata shaping
- `package.js`: package/archive assembly
- `release.js`: release metadata and signing flow
- `fs.js`: reusable filesystem helpers

## Task 2: Normalize `scripts/node` Topology

**Files:**
- Create grouped dispatchers and move command implementations under them

- [ ] **Step 1: Group test entrypoints**

Consolidate:

- `test-backend.js`
- `test-contracts.js`
- `test-frontend.js`
- `test-scripts.js`

behind a `scripts/node/test/` implementation tree.

- [ ] **Step 2: Group verify entrypoints**

Consolidate:

- `verify-backend.js`
- `verify-ci.js`
- `verify-coverage.js`
- `verify-repo.js`

behind a `scripts/node/verify/` implementation tree.

- [ ] **Step 3: Group tooling helpers**

Move `page-debug`, `check-style-boundary`, `mock-ui-sync`, `claude-skill-sync`, and runtime-gate orchestration behind `scripts/node/tooling/`.

## Task 3: Verify And Record

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-scripts-node-normalization-phase-three.md`

- [ ] **Step 1: Run script tests**

```bash
node scripts/node/test-scripts.js
```

- [ ] **Step 2: Run repo verification**

```bash
node scripts/node/verify-repo.js
```

- [ ] **Step 3: Append execution notes and commit**

```bash
git add scripts/node docs/superpowers/plans/2026-04-22-scripts-node-normalization-phase-three.md
git commit -m "refactor: normalize node script owners"
```
