# 2026-03-16 Sensitive Access Timeline Drilldown

## 背景

- 用户要求先系统阅读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md`，再结合最近一次 Git 提交判断项目现状、基础框架是否成立，以及是否需要继续衔接最近主线开发。
- 复核最近提交 `975ef01 feat: surface sensitive access approval timeline` 后，结论是：当前主线仍然是统一敏感访问治理，不需要回头返工 runtime / publish 基础架构；更值得继续衔接的是把刚落地的 approval timeline 从“能看”推进到“能筛、能跳、能按 run 切片”。
- 继续审查前端与文档后，发现一个直接影响 operator 判断的问题：`web/lib/get-sensitive-access.ts` 的 inbox summary 会用全量 `NotificationDispatch` 计算摘要，即使页面已经通过 ticket status / waiting status 做了切片，通知计数仍可能被无关票据污染；如果继续加 `run_id` 切片，这个偏差会更明显。

## 现状判断

### 1. 上一次 Git 提交是否需要衔接

- 结论：**需要继续衔接。** `975ef01` 已把 run diagnostics 和 published detail 接上 approval timeline，但 operator 仍缺少本地筛选、跨入口跳转和按 run 切片的 inbox 入口；如果停在这里，安全事实层虽然已经可见，但排障路径仍然偏散。

### 2. 基础框架是否已经写好

- 结论：**是。** 当前仓库已经具备 workflow / runtime / published surface / sensitive access / run diagnostics 的统一事实层，这轮工作只是在既有前端入口上继续做 operator drilldown，不需要新增第二套执行语义或安全模型。

### 3. 架构是否满足功能推进与扩展性

- 结论：**满足。** 本轮继续复用 `SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 与共享时间线组件，没有把 run diagnostics、published detail 或 inbox 做成三套互相独立的数据模型；相反，是在现有 shared component 和 query helper 上补充筛选和 cross-link，把 operator 入口进一步收口。

### 4. 当前仍需关注的结构热点

- 后端结构热点保持不变，仍主要集中在 `api/app/services/runtime_node_dispatch_support.py`、`api/app/services/agent_runtime_llm_support.py`、`api/app/services/run_views.py` 等服务层热点。
- 前端结构热点仍包括 `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`、`web/components/run-diagnostics-execution/execution-node-card.tsx`、`web/lib/get-workflow-publish.ts`。
- 本轮新增的 `web/components/sensitive-access-timeline-entry-list.tsx` 虽然功能增强，但仍保持为共享 operator 组件，后续应继续避免把 inbox/run/published detail 的额外逻辑重新复制进多个页面。

## 目标

1. 让 approval timeline 在 run diagnostics 和 published detail 中支持最小本地筛选，而不是只能整段滚读。
2. 让 operator 可以从 timeline 直接跳回 run 页面或跳到带上下文的 inbox slice，减少在多个页面之间手工记忆 run / ticket 状态。
3. 修正 inbox summary 的统计范围，使其与当前筛选票据保持一致，避免 run-sliced 视图里的通知摘要被全局数据污染。

## 实现

### 1. 共享时间线组件补齐筛选与跨入口跳转

- 重写 `web/components/sensitive-access-timeline-entry-list.tsx` 为客户端共享组件。
- 新增三组本地筛选：
  - decision filter
  - ticket filter
  - notification filter
- 每条 timeline entry 现在都可直接跳转：
  - `open run`：返回对应 run detail
  - `open inbox slice`：带 `run_id + status + waiting_status` 跳到 inbox 切片

### 2. Inbox 页面支持 `run_id` 切片并保持筛选状态

- 更新 `web/app/sensitive-access/page.tsx`：
  - 解析 `run_id` query param
  - 把 `run_id` 继续透传给 `getSensitiveAccessInboxSnapshot()`
  - 让 approval status / waiting status 两组 filter link 在切换时保持当前 `run_id`
  - 当页面处于 run slice 中时，显式展示当前 run slice，并提供 clear 入口

### 3. 修正 inbox summary 的通知统计边界

- 更新 `web/lib/get-sensitive-access.ts`：`buildInboxSummary()` 不再使用全量 `NotificationDispatch` 列表，而是只统计当前 `entries` 实际关联到的通知。
- 这样 `run_id` 切片和 status/waiting status 切片下看到的 Delivered / Pending / Failed 计数，与当前列表上下文保持一致。

### 4. Published detail 显式透传 run 上下文

- 更新 `web/components/workflow-publish-invocation-detail-panel.tsx`，把 `run?.id ?? invocation.run_id` 作为默认 run 上下文传给共享时间线组件，避免 timeline entry 局部缺失 run id 时丢失 cross-link 能力。

## 验证

### 前端静态校验

在 `web/` 目录执行：

```powershell
pnpm lint
pnpm exec tsc --noEmit
```

结果：通过。

- `pnpm lint` 无 ESLint 错误；仍会提示 `next lint` 将在 Next.js 16 废弃，这是仓库当前脚本层面的既有提示，不是本轮新增问题。
- `pnpm exec tsc --noEmit` 通过。

### 差异检查

本轮收尾前继续执行：

```powershell
git diff --check
```

结果：通过；若仍出现 LF/CRLF 提示，应视为当前工作区换行归一告警，而不是本轮逻辑错误。

## 结论与下一步

- 当前项目依然**没有进入**“只剩人工逐项界面设计 / 全链路人工验收”的阶段，因此本轮**不触发** `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"`。
- 本轮确认：基础框架已经足够支撑继续按产品设计推进，当前更值得做的是沿既有敏感访问事实层继续补通知自动投递、批量治理动作和跨入口解释，而不是返工运行时底座。
- 下一步建议按优先级继续：
  1. **P0**：补真实 `notification worker / adapter`，让 `slack / email / webhook / feishu` 不再停留在诚实失败 + 手动 retry。
  2. **P0**：在 inbox / run / published detail 之间继续补聚合解释与批量治理动作，例如批量 retry、批量 approve/reject、统一 security explanation。
  3. **P1**：继续拆 `web/components/run-diagnostics-execution/execution-node-card.tsx`，把 tool / ai / callback / sensitive access 卡片继续分块，避免节点详情页再次涨成单体。
