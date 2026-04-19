---
memory_type: project
topic: CI 与 coverage 第三阶段 implementation 完成
summary: 在 `2026-04-19 22`，第三阶段 implementation 已完成并通过真实验证。当前仓库已新增 `verify-coverage`、`verify-ci`、GitHub Actions `verify` workflow、共享 coverage 阈值配置、前端 coverage script / reporter，以及 `settings/api` wrapper 测试来把高风险 coverage gate 拉过阈值。验证结果包括：`rtk node --test scripts/node/verify-coverage/_tests/cli.test.js scripts/node/verify-ci/_tests/cli.test.js` 通过，`rtk node scripts/node/verify-coverage.js frontend` / `backend` / `all` 通过，`rtk node scripts/node/verify-ci.js` 通过。
keywords:
  - ci
  - coverage
  - plan-stage
  - verify-coverage
  - verify-ci
  - github-actions
match_when:
  - 需要继续执行第三阶段 implementation plan
  - 需要确认第三阶段计划文件路径
  - 需要知道当前阶段已完成 implementation 与真实验证
created_at: 2026-04-19 20
updated_at: 2026-04-19 22
last_verified_at: 2026-04-19 22
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans
  - scripts/node
  - web
  - .github/workflows
---

# CI 与 coverage 第三阶段 implementation 完成

## 时间

`2026-04-19 22`

## 谁在做什么

- 用户要求直接在当前仓库按 plan 顺序实现，并在每个任务完成后同步更新进度。
- AI 已按 `Inline Execution` 完成 Task 1 至 Task 4，并把验证结果回写到 plan 与阶段记忆。

## 为什么这样做

- 第三阶段范围已经冻结，本轮目标是把 CI 与 coverage 基础设施真正落仓、跑通并留下可复用的验证证据。
- 用户明确要求不走 subagent，由当前会话 inline 顺序实现，因此整个实现过程都按 task 粒度推进，并在关键节点回写 plan / memory。

## 当前阶段状态

- 基线提交为 `7c1b55d3d8be356a895c184624089209583c0b13`，当前 implementation 已完成：
  - 新增 `scripts/node/testing/coverage-thresholds.js`
  - 新增 `scripts/node/verify-coverage.js` 与 `scripts/node/verify-ci.js`
  - 新增 `scripts/node/verify-coverage/_tests/cli.test.js` 与 `scripts/node/verify-ci/_tests/cli.test.js`
  - 新增 `.github/workflows/verify.yml`
  - `web` / `web/app` 已接入 frontend coverage script、Vitest coverage reporter 与 `@vitest/coverage-v8`
  - 新增 `web/app/src/features/settings/api/_tests/settings-api.test.ts`
  - 修正 `web/app/src/features/settings/_tests/model-providers-page.test.tsx` 的异步等待与超时预算，使其能在 coverage 模式下稳定通过
- 已完成真实验证：
  - `rtk node --test scripts/node/verify-coverage/_tests/cli.test.js scripts/node/verify-ci/_tests/cli.test.js`
  - `rtk node scripts/node/verify-coverage.js frontend`
  - `rtk cargo install cargo-llvm-cov --locked`
  - `rtk cargo llvm-cov --help`
  - `rtk node scripts/node/verify-coverage.js backend`
  - `rtk node scripts/node/verify-ci.js`
- 当前阶段状态：
  - Implementation complete
  - Plan / memory 已同步
  - 本轮收尾为创建最终 commit
