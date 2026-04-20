---
memory_type: project
topic: contract gate 与跨仓库门禁范围决策已确认
summary: 用户在 `2026-04-20 15` 确认本轮按方案 2 推进，即先修 `style-boundary` 断口并落第一版 contract gate，跨仓库门禁作为下一子项目继续设计。contract gate 的真相源采用主仓共享 fixture JSON；第一版覆盖 `/api/console/model-providers/catalog` 与 `/options` 的顶层包装及关键字段集合；允许同步补齐 `style-boundary` 等测试替身中的 `locale_meta/i18n_catalog`。跨仓库门禁接受按路径命中触发，且第一阶段即采用 Blocking 强度。用户额外要求评估是否需要同步更新相关 skill 或测试说明。
keywords:
  - contract-gate
  - cross-repo-gate
  - style-boundary
  - fixture
  - settings
  - model-provider
  - testing-docs
match_when:
  - 需要编写 contract gate 设计或实施计划
  - 需要决定 fixture 真相源
  - 需要决定跨仓库门禁触发方式
  - 需要判断是否更新 skill 或测试说明
created_at: 2026-04-20 15
updated_at: 2026-04-20 15
last_verified_at: 2026-04-20 15
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs
  - docs/superpowers/plans
  - .agents/skills
  - scripts/node
  - web/app/src/style-boundary
  - web/app/src/features/settings
  - web/packages/api-client
---

# contract gate 与跨仓库门禁范围决策已确认

## 时间

`2026-04-20 15`

## 已确认决策

1. 本轮实施范围采用方案 2：
   - 先修 `style-boundary` 相关断口；
   - 同时落第一版 `contract gate`；
   - `cross-repo gate` 作为下一子项目继续设计。
2. 第一版 `contract gate` 的真相源采用主仓内共享 fixture JSON。
3. 第一版 `contract gate` 覆盖 `/catalog` 与 `/options` 的顶层包装和关键字段集合。
4. 跨仓库门禁接受按路径命中触发。
5. 跨仓库门禁第一阶段即采用 `Blocking` 强度，不走 advisory 过渡。
6. 允许同步补齐测试替身中的 `locale_meta` / `i18n_catalog` 等真实包装字段。

## 待在设计中回答的问题

1. 是否需要同步更新 `.agents/skills`、测试说明或其他门禁文档，以反映新的 gate 结构与运行方式。
