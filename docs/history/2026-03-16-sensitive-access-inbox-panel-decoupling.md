# 2026-03-16 sensitive access inbox panel decoupling

## 背景

- 在完成一轮项目现状复核后，当前最明确的前端热点之一仍是 `web/components/sensitive-access-inbox-panel.tsx`。
- 该组件同时承载批量治理状态、单条票据渲染、通知摘要、审批表单和重试表单，已经偏离“panel 负责装配、entry card 负责细节”的既有拆层方向。

## 目标

- 继续沿当前仓库的热点治理主线，把 sensitive access inbox 保持在可持续扩展的结构上。
- 在不改变行为和数据契约的前提下，降低单文件复杂度，为后续补 policy explanation、timeline drilldown 和更细粒度 operator action 预留位置。

## 本轮实现

### 1. 拆分 inbox panel 主文件

- 将 `web/components/sensitive-access-inbox-panel.tsx` 收敛为批量治理状态与列表装配层。
- 保留批量审批 / 批量重试的候选计算、确认和消息状态，但不再让主文件承载单条票据的所有 UI 细节。

### 2. 下沉 entry card 与表单逻辑

- 新增 `web/components/sensitive-access-inbox-entry-card.tsx`，承载：
  - 单条 ticket / request / resource 摘要展示
  - 单条审批表单
  - 单条通知重试表单
  - 最新通知错误摘要
- 这样后续若继续补 per-entry explanation、run timeline cross-link 或 approval context drilldown，可直接在 entry card 范围内演进。

### 3. 提取共享 helper

- 新增 `web/components/sensitive-access-inbox-panel-helpers.ts`，集中放置：
  - 默认 operator 标识
  - approval / waiting / requester / notification 等状态文案映射
  - latest notification / retriable notification / pending waiting ticket 等纯函数
- 避免面板文件与条目卡片各自复制同一组标签映射和派生逻辑。

## 影响范围

- `web/components/sensitive-access-inbox-panel.tsx`
- `web/components/sensitive-access-inbox-entry-card.tsx`
- `web/components/sensitive-access-inbox-panel-helpers.ts`

## 验证

- `cd web && pnpm exec tsc --noEmit`
  - 通过

## 结论

- 这次改动没有改变 sensitive access inbox 的业务语义，而是继续把前端 operator surface 从单体组件拆回“装配层 + entry card + helper”的稳定结构。
- 当前项目仍未进入需要人工逐项界面设计验收的阶段，因此本轮不触发通知脚本。

## 下一步

1. 继续把 sensitive access policy explanation 与 notification / run timeline drilldown 下沉到 entry-level presenter。
2. 评估是否把 bulk governance candidate derivation 再提炼成独立 hook，保持 panel 只做 page-section 级装配。
3. 继续沿相同方法治理 `web/lib/get-workflow-publish.ts`、`workflow-tool-execution-validation.ts` 等剩余热点。
