# 2026-03-16 Sensitive Access Inbox 批量治理

## 背景

本轮先按仓库基线重新复核了以下事实来源：

- `AGENTS.md`
- `docs/dev/user-preferences.md`
- `docs/product-design.md`
- `docs/technical-design-supplement.md`
- `docs/open-source-commercial-strategy.md`
- `docs/dev/runtime-foundation.md`
- 最近 Git 提交与 2026-03-16 的开发留痕

复核结论是：

1. 当前基础框架已经足够支撑继续做功能开发，不需要为了治理能力另起执行引擎或第二套流程 DSL。
2. 最新提交 `b06b16b feat: add notification channel diagnostics` 已把 sensitive access 从“看得见通道健康”推进到“看得见真实 operator diagnostics”，下一步最自然的 P0 衔接就是把 inbox 的治理动作从单条点击扩成批量治理。
3. 项目仍未进入“只剩人工逐项界面设计 / 全链路人工验收”的阶段，因此本轮不触发 `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"`。

## 目标

在不破坏既有 `SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 事实层、调度器和 run 失效刷新语义的前提下，补齐 inbox 当前筛选结果集上的批量治理动作：

- 批量批准 / 拒绝 `pending + waiting` 票据
- 批量重试每条票据最新且未成功投递的通知
- 返回结构化跳过原因摘要，避免 operator 只能逐条点开后才知道为什么被跳过

## 实现

### 1. 后端新增批量治理契约与路由

- 在 `api/app/schemas/sensitive_access.py` 新增：
  - `ApprovalTicketBulkDecisionRequest / Result`
  - `NotificationDispatchBulkRetryRequest / Result`
  - 对应的 skipped item / skipped summary 结构
- 在 `api/app/api/routes/sensitive_access.py` 新增：
  - `POST /api/sensitive-access/approval-tickets/bulk-decision`
  - `POST /api/sensitive-access/notification-dispatches/bulk-retry`

实现约束：

- 批量请求会先去重 `ticket_ids / dispatch_ids`，避免同一对象重复执行。
- 每个对象仍复用现有 `SensitiveAccessControlService.decide_ticket()` 与 `retry_notification_dispatch()`，不引入第二套审批 / 重试语义。
- 批量路径允许“部分成功 + 部分跳过”，并返回 `skipped_reason_summary`，避免因为一条异常就整体失败。

### 2. 前端 inbox 增加 bulk governance card

- 在 `web/components/sensitive-access-inbox-panel.tsx` 保留单条 approve / reject / retry 表单，同时新增基于当前筛选结果集的批量动作入口。
- 新增 `web/components/sensitive-access-bulk-governance-card.tsx`，把批量治理卡独立拆出，避免 `SensitiveAccessInboxPanel` 继续膨胀。
- 新增 `web/app/actions/sensitive-access.ts` 的批量 server action：
  - `bulkDecideSensitiveAccessApprovalTickets()`
  - `bulkRetrySensitiveAccessNotificationDispatches()`

交互语义：

- 批量 approve / reject 默认作用于当前筛选结果中的 `pending + waiting` 票据
- 批量 retry 只处理当前筛选结果中每条票据最新且未成功投递的 notification dispatch
- action 完成后会统一刷新 `/`、`/sensitive-access` 和受影响的 `/runs/{run_id}`

### 3. 结构热点处理

- `web/components/sensitive-access-inbox-panel.tsx` 原本只有单条治理动作；本轮没有继续把 bulk 逻辑直接堆进去，而是拆出 `SensitiveAccessBulkGovernanceCard`。
- 这次改动说明：当前项目的长文件治理策略仍然成立——优先在“功能继续推进”的同时做轻量拆层，而不是等文件重新长成单体后再回头重构。

## 影响范围

- 后端：
  - `api/app/schemas/sensitive_access.py`
  - `api/app/api/routes/sensitive_access.py`
- 前端：
  - `web/app/actions/sensitive-access.ts`
  - `web/components/sensitive-access-inbox-panel.tsx`
  - `web/components/sensitive-access-bulk-governance-card.tsx`
  - `web/lib/get-sensitive-access.ts`
- 测试：
  - `api/tests/test_sensitive_access_routes.py`

## 验证

在仓库本地完成以下验证：

```powershell
cd api
.\.venv\Scripts\uv.exe run pytest -q tests/test_sensitive_access_routes.py
.\.venv\Scripts\uv.exe run pytest -q

cd ..\web
pnpm exec tsc --noEmit
pnpm lint

cd ..
git diff --check
```

结果：通过。

- `tests/test_sensitive_access_routes.py`：`8 passed`
- `api` 全量测试：`292 passed`
- `web` 类型检查：通过
- `web` lint：通过
- `git diff --check`：无 diff 错误，仅提示工作区 LF/CRLF 转换警告

## 结论

- 当前项目基础框架已经满足继续推进主要功能闭环的要求，尤其是 sensitive access 这条主线可以继续沿统一事实层、统一 service 和统一 run 刷新语义前进，不需要回退去补“有没有基础框架”。
- 插件扩展性、兼容性、可靠性与安全性的主干方向没有跑偏：runtime 仍保持单一主控，兼容层仍旁挂，批量治理也只是复用现有事实层而不是新建治理专用 DSL。
- 当前代码里仍有更长的结构热点，但本轮更高优先级的是把 operator 批量治理补到真实可用；拆出 `SensitiveAccessBulkGovernanceCard` 已经把这次前端新增复杂度控制在局部。

## 下一步建议

1. **P0**：把相同的批量治理与解释层继续扩到 run detail / published detail，避免 inbox 已可批量操作但跨入口仍只能逐条排障。
2. **P0**：继续补 notification channel preset / 默认 target 策略，让审批请求不必每次手写 channel target。
3. **P1**：继续治理 `run_views.py`、`run_trace_views.py` 和 workflow editor graph 热点，保持功能推进同时不过度放大单文件复杂度。
