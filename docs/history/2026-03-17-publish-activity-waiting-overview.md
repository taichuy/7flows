# 2026-03-17 Publish activity waiting overview

## 背景

- `docs/dev/runtime-foundation.md` 已把 `P0 WAITING_CALLBACK` 主线收口到 shared presenter、entry card 与 publish detail，但 `publish activity` 首屏概览仍主要停留在 traffic / rate limit / issue signal。
- 这会让 operator 在进入 publish activity 后，仍要先翻 recent invocation entry 或打开 detail，才能判断当前筛选切片里到底有没有 active waiting、是 callback 在等、还是同步 surface 正在撞 waiting 边界。

## 目标

- 把 publish activity 的概览层继续接回统一的 waiting/operator explanation，而不是继续依赖 invocation 列表逐条阅读。
- 尽量复用现有 audit summary / facet 事实，避免为了补一张概览卡再引入一套新的后端聚合模型。

## 实现

- 在 `web/lib/published-invocation-presenters.ts` 新增 `buildPublishedInvocationWaitingOverview()`，基于 audit `run_status_counts`、`reason_counts` 与 `summary.last_run_status` 统一生成：
  - `active waiting / callback waits / approval-input waits / generic waits`
  - `sync_waiting_unsupported` 的聚合提示
  - 首屏 headline、detail 与 chips
- 在 `web/components/workflow-publish-activity-panel-sections.tsx` 的 `WorkflowPublishActivityInsights` 中新增：
  - `Waiting now` status card，直接显示当前筛选切片里的 active waiting 数量
  - `Waiting follow-up` overview card，集中展示 waiting 压力、callback/input 分布、sync waiting rejection 与 latest run status
- 本轮没有新增独立后端字段，而是先把已有 published invocation audit 事实更稳定地转成 operator 能直接理解的 first-screen summary。

## 影响范围

- `publish activity` 首屏从“看总量 / 看失败”进一步进入“看 waiting 压力 / 知道下一步先查哪里”。
- `published invocation entry card`、`publish detail` 与 `publish activity insights` 现在开始共享同一类 waiting/operator 认知层，而不是各处手工拼接不同解释。
- 这条改动继续服务的是 operator 主链闭环，而不是局部样式整理；它把 publish surface 的排障起点前移到 overview 层，减少必须逐条点开 detail 才能判断是否有 waiting 压力的摩擦。

## 验证

- `web/pnpm exec tsc --noEmit`
- `web/pnpm lint`
- `git diff --check`

## 下一步

- 继续把 `Waiting follow-up` 这类 aggregated explanation 往更多 publish/operator 入口扩展，优先补 drilldown/filter 对齐，而不是重新在各卡片里复制 waiting 文案。
