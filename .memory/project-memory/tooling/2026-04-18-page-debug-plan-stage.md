---
memory_type: project
topic: page-debug 已进入实现计划阶段
summary: 自 2026-04-18 11 起，`page-debug` 的设计已转为实现计划，计划文档固定为 `docs/superpowers/plans/2026-04-18-page-debug.md`，后续实现按 CLI 合同、认证态、页面就绪、证据采集、快照重写五个任务推进。
keywords:
  - page-debug
  - implementation plan
  - playwright
  - snapshot
  - evidence
match_when:
  - 需要执行 page-debug 实现计划
  - 需要确认 page-debug 当前处于 spec 还是 plan 阶段
  - 需要知道计划拆分为哪些任务
created_at: 2026-04-18 11
updated_at: 2026-04-18 11
last_verified_at: 2026-04-18 11
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-18-page-debug.md
  - scripts/node/page-debug.js
  - scripts/node/page-debug/
---

# page-debug 已进入实现计划阶段

## 时间

`2026-04-18 11`

## 谁在做什么

- 用户已确认 page-debug 设计稿。
- AI 已将设计转写为实现计划，准备进入执行选择。

## 为什么这样做

- 该脚本涉及 CLI、认证态、Playwright、页面就绪判断、证据采集和快照重写，不能无计划直接堆实现。

## 为什么要做

- 让后续实现严格围绕 AI 场景展开：给一个路由即可自动登录、稳定抓取、产出可比对证据。

## 截止日期

- 无

## 决策背后动机

- 计划文档固定为 `docs/superpowers/plans/2026-04-18-page-debug.md`。
- 任务拆分固定为五段：CLI 合同、root 凭据与登录、页面就绪与证据、快照重写、整体集成与手工验收。
- 认证态实现优先复用 `scripts/node/dev-up/core.js` 暴露的环境解析能力，不另起一套 `.env` 解析规则。
