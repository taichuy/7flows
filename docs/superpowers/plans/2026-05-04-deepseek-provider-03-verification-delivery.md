# DeepSeek Provider 03 - Verification And Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the DeepSeek provider implementation across the main repository and official plugin repository, then prepare delivery evidence.

**Architecture:** Verification is task-scoped. Run focused tests first, then package dry-run when local tooling supports it, then invoke `qa-evaluation` for delivery review. Do not run broad test suites unless focused evidence exposes a shared contract risk.

**Tech Stack:** Cargo, Node.js `node --test`, 1flowbase host packaging CLI, qa-evaluation.

---

## Task 1: Official Plugin Verification

**Files:**
- Read/verify: `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/deepseek`
- Read/verify: `/home/taichu/git/1flowbase-official-plugins/scripts/_tests`

- [ ] **Step 1: Run DeepSeek provider crate tests**

Run:

```bash
cd /home/taichu/git/1flowbase-official-plugins
cargo test --manifest-path runtime-extensions/model-providers/deepseek/Cargo.toml
```

Expected: PASS.

- [ ] **Step 2: Run official plugin script tests**

Run:

```bash
cd /home/taichu/git/1flowbase-official-plugins
node --test \
  scripts/_tests/build-registry-entry.test.mjs \
  scripts/_tests/deepseek-provider-contract.test.mjs \
  scripts/_tests/list-provider-package-targets.test.mjs \
  scripts/_tests/openai-compatible-parameter-contract.test.mjs \
  scripts/_tests/sort-provider-parameter-order.test.mjs \
  scripts/_tests/sync-provider-manifest-versions.test.mjs \
  scripts/_tests/update-official-registry.test.mjs \
  scripts/_tests/workflow-config.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Verify package target detection includes DeepSeek**

Run:

```bash
cd /home/taichu/git/1flowbase-official-plugins
node scripts/list-provider-package-targets.mjs
```

Expected JSON contains:

```json
{
  "provider_code": "deepseek",
  "plugin_dir": "runtime-extensions/model-providers/deepseek",
  "binary_name": "deepseek-provider"
}
```

- [ ] **Step 4: Commit verification fixes if needed**

If a verification-only fix is required in the official plugin repo:

```bash
cd /home/taichu/git/1flowbase-official-plugins
git add runtime-extensions/model-providers/deepseek scripts
git commit -m "fix: stabilize deepseek provider verification"
git push origin main
```

If no fix is required, leave the repository clean.

---

## Task 2: Main Repository Verification

**Files:**
- Read/verify: `/home/taichu/git/1flowbase/api/crates/plugin-framework`
- Read/verify: `/home/taichu/git/1flowbase/api/apps/plugin-runner`
- Read/verify: `/home/taichu/git/1flowbase/api/apps/api-server`
- Read/verify: `/home/taichu/git/1flowbase/api/crates/orchestration-runtime`
- Read/verify: `/home/taichu/git/1flowbase/api/crates/storage-durable`

- [ ] **Step 1: Run focused contract and route tests**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p plugin-framework provider_balance
cargo test -p plugin-framework provider_usage
cargo test -p plugin-runner provider_runner_exposes_balance
cargo test -p api-server model_provider_routes_mask_secret_until_reveal_and_keep_ready_options
cargo test -p orchestration-runtime input_cache
cargo test -p storage-postgres input_cache
```

Expected: PASS.

- [ ] **Step 2: Run OpenAPI route coverage**

Run:

```bash
cd /home/taichu/git/1flowbase/api
cargo test -p api-server operation_spec_builder_exposes_model_provider_catalog_route
```

Expected: PASS and the generated OpenAPI registry includes `model_provider_get_balance`.

- [ ] **Step 3: Commit verification fixes if needed**

If a verification-only fix is required in the main repository:

```bash
cd /home/taichu/git/1flowbase
git add api
git commit -m "fix: stabilize provider balance verification"
git push origin main
```

If no fix is required, leave the repository clean.

---

## Task 3: Package Dry-Run

**Files:**
- Read/verify: `/home/taichu/git/1flowbase/scripts/node/plugin.js`
- Read/verify: `/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/deepseek`

- [ ] **Step 1: Build DeepSeek provider binary**

Run:

```bash
cd /home/taichu/git/1flowbase-official-plugins
cargo build --manifest-path runtime-extensions/model-providers/deepseek/Cargo.toml --release
```

Expected: binary exists at:

```text
runtime-extensions/model-providers/deepseek/target/release/deepseek-provider
```

- [ ] **Step 2: Run package dry-run**

Run:

```bash
cd /home/taichu/git/1flowbase-official-plugins
node /home/taichu/git/1flowbase/scripts/node/plugin.js package \
  runtime-extensions/model-providers/deepseek \
  --out dist \
  --runtime-binary runtime-extensions/model-providers/deepseek/target/release/deepseek-provider
```

Expected: a `.1flowbasepkg` file appears under `dist/`.

- [ ] **Step 3: Record package dry-run limitation if local target tooling differs**

If the package command requires a target triple, rerun using the same target pattern used by `.github/workflows/provider-ci.yml`. Record the exact command and result in the final QA note.

---

## Task 4: QA Evaluation And Delivery

**Files:**
- Read/verify: `.memory/AGENTS.md`
- Read/verify: `.memory/user-memory.md`
- Read/verify: `docs/superpowers/specs/2026-05-04-deepseek-provider-design.md`
- Read/verify: all three DeepSeek implementation plan files

- [ ] **Step 1: Invoke qa-evaluation**

Use `qa-evaluation` in task mode.

Required evidence:

```bash
cd /home/taichu/git/1flowbase
git status --short --branch
cd /home/taichu/git/1flowbase-official-plugins
git status --short --branch
```

Include:

- focused tests run;
- package dry-run result;
- unverified command with reason if any;
- warning/coverage artifact location check;
- remaining risk.

- [ ] **Step 2: Push both repositories**

Run:

```bash
cd /home/taichu/git/1flowbase
git push origin main
cd /home/taichu/git/1flowbase-official-plugins
git push origin main
```

Expected: both pushes complete or report `Everything up-to-date`.

- [ ] **Step 3: Final status**

Confirm:

```bash
cd /home/taichu/git/1flowbase
git status --short --branch
cd /home/taichu/git/1flowbase-official-plugins
git status --short --branch
```

Expected for both:

```text
## main...origin/main
```

## Plan Completion

- [ ] All Task 1 checkboxes are complete.
- [ ] All Task 2 checkboxes are complete.
- [ ] All Task 3 checkboxes are complete.
- [ ] All Task 4 checkboxes are complete.
- [ ] Update the index plan checkbox for `03 - Verification And Delivery`.
