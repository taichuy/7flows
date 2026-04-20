---
memory_type: project
topic: cross-repo gate 可启动但必须作为 Phase B 新子项目推进
summary: 用户在 `2026-04-20 22` 确认 `cross-repo gate` 可以启动，但推进方式必须是单独开启 `Phase B` 的 spec/plan，不回写或扩展已经冻结并完成的 `Phase A` implementation plan。
keywords:
  - cross-repo-gate
  - phase-b
  - spec
  - plan
  - frozen-boundary
match_when:
  - 需要开始 cross-repo gate 的 spec 或 plan
  - 需要判断是否继续沿用 Phase A plan
  - 需要确认 Phase B 的推进方式
created_at: 2026-04-20 22
updated_at: 2026-04-20 22
last_verified_at: 2026-04-20 22
decision_policy: verify_before_decision
scope:
  - /home/taichu/git/1flowbase/docs/superpowers/specs
  - /home/taichu/git/1flowbase/docs/superpowers/plans
  - /home/taichu/git/1flowbase/scripts/node
  - /home/taichu/git/1flowbase/.github/workflows
  - /home/taichu/git/1flowbase-official-plugins
---

# cross-repo gate 可启动但必须作为 Phase B 新子项目推进

## 时间

`2026-04-20 22`

## 谁在做什么

用户批准继续推进 `cross-repo gate`，但要求它作为新的 `Phase B` 子项目启动；AI 不得回头改写已经冻结并执行完毕的 `Phase A` plan。

## 为什么这样做

`Phase A` 已经完成并通过 `verify-repo`，当前基础足够支撑下一阶段继续推进；但流程上需要保持阶段边界清楚，避免把两个阶段混成一个 implementation plan。

## 为什么要做

这样可以在技术上复用 `Phase A` 已经落地的 canonical fixture、`test-contracts` 和 repo gate 基础，同时在过程上保持 spec、plan、提交和验收边界清晰。

## 截止日期

无硬性外部截止日期；当前目标是开始 `Phase B` 的独立 spec/plan 设计。

## 决策背后动机

1. 技术上，`Phase A` 已完成且基础已够，`cross-repo gate` 可以开始。
2. 过程上，`Phase B` 必须单独立项，不能继续往 `Phase A` 的冻结计划里追加任务。
3. 后续如果需要修改 `cross-repo gate` 触发路径、Blocking 规则或插件仓库回归范围，应在 `Phase B` spec/plan 中单独决策。

## 关联文档

1. [2026-04-20-model-provider-contract-gate-design.md](/home/taichu/git/1flowbase/docs/superpowers/specs/1flowbase/2026-04-20-model-provider-contract-gate-design.md)
2. [2026-04-20-model-provider-contract-gate-implementation.md](/home/taichu/git/1flowbase/docs/superpowers/plans/2026-04-20-model-provider-contract-gate-implementation.md)
3. [2026-04-20-model-provider-contract-phase-a-implemented.md](/home/taichu/git/1flowbase-project-maintenance/.memory/project-memory/2026-04-20-model-provider-contract-phase-a-implemented.md)
