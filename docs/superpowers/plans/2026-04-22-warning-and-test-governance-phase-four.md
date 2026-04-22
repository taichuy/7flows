# Warning And Test Governance Phase Four Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear warning noise from the frontend/test stack and make warning evidence land in `tmp/test-governance/` instead of leaking as unactioned console spam.

**Architecture:** Treat warnings as governance debt, not harmless background noise. Fix the deprecated Ant Design tooltip API, make React Flow tests render through a shared stable test frame, and address the remaining `act(...)` warning. Store warning and coverage artifacts under `tmp/test-governance/` so regressions become diffable.

**Tech Stack:** React, Vitest, Testing Library, Ant Design, Node verification scripts.

---

## File Structure

**Modify**
- `web/app/src/features/agent-flow/components/nodes/AgentFlowNodeCard.tsx`
- `web/app/src/features/agent-flow/_tests/...`
- `scripts/node/test-frontend.js`
- `scripts/node/verify-coverage.js`
- `docs/superpowers/plans/2026-04-22-warning-and-test-governance-phase-four.md`

**Create**
- `web/app/src/test/renderers/render-react-flow-scene.tsx`
- `tmp/test-governance/.gitkeep`

**Run**
- `pnpm --dir web/app test -- --run src/features/agent-flow/_tests`
- `node scripts/node/test-frontend.js fast`
- `node scripts/node/verify-coverage.js`

## Task 1: Remove Known Frontend Deprecation Warnings

- [ ] **Step 1: Replace deprecated Ant Design tooltip prop**

Update `AgentFlowNodeCard.tsx` from `overlayInnerStyle` to the supported `styles={{ body: ... }}` shape.

- [ ] **Step 2: Add a shared React Flow test renderer**

Create `render-react-flow-scene.tsx` that always provides:

- fixed width/height container
- the same provider stack
- any shared style/bootstrap requirements needed by React Flow tests

Then migrate `agent-flow` canvas/node tests to this helper instead of duplicating ad hoc wrappers.

- [ ] **Step 3: Fix the remaining `act(...)` warning**

Target the templated text field test/update flow so asynchronous state changes are awaited explicitly.

## Task 2: Make Warning Evidence First-Class

- [ ] **Step 1: Write warning artifacts to `tmp/test-governance/`**

Update frontend/coverage verification scripts so warnings and coverage summaries are persisted under:

- `tmp/test-governance/frontend-fast.log`
- `tmp/test-governance/frontend-fast.warnings.log`
- `tmp/test-governance/coverage-summary.log`

- [ ] **Step 2: Keep logs additive and easy to diff**

Do not dump warnings into random temp paths or stdout only.

## Task 3: Verify And Record

- [ ] **Step 1: Run focused agent-flow tests**

```bash
pnpm --dir web/app test -- --run src/features/agent-flow/_tests
```

- [ ] **Step 2: Run frontend fast gate and coverage verification**

```bash
node scripts/node/test-frontend.js fast
node scripts/node/verify-coverage.js
```

- [ ] **Step 3: Append execution notes and commit**

```bash
git add web/app/src/features/agent-flow web/app/src/test/renderers scripts/node/test-frontend.js scripts/node/verify-coverage.js tmp/test-governance docs/superpowers/plans/2026-04-22-warning-and-test-governance-phase-four.md
git commit -m "refactor: govern frontend warnings and test artifacts"
```
