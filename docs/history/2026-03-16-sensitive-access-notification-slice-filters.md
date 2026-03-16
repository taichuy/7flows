# 2026-03-16 Sensitive Access Notification Slice Filters

## 背景

- `docs/dev/runtime-foundation.md` 把本阶段 `P0` 持续聚焦在 callback waiting / approval pending / notification dispatch 的统一 operator 主链。
- 2026-03-16 前一轮已经把 `/sensitive-access` inbox slice 扩到 `node_run_id / access_request_id / approval_ticket_id`，并让 callback summary、publish callback drilldown、timeline list 与 blocked card 都能直达对应 slice。
- 但进一步复核时发现一个真实缺口：`web/lib/get-sensitive-access.ts` 在构造 inbox snapshot 时，通知投递列表仍只按 `approval_ticket_id` 单条件查询；当页面只带 `run_id / node_run_id / access_request_id` 细粒度 slice 时，票据和请求虽然能对上，通知列表却可能为空，导致 operator 在 callback/approval 联合排障时仍会丢通知上下文。

## 目标

- 让 sensitive access inbox snapshot 的 notification dispatch 数据与 request/ticket slice 使用同一组过滤维度。
- 支持按 `run_id / node_run_id / access_request_id / approval_ticket_id` 查询通知投递记录。
- 保持治理模型不变，只修正当前 slice 视图的数据闭环缺口。

## 本轮实现

### 1. 后端通知列表接口补齐 slice 过滤

- `api/app/api/routes/sensitive_access.py`
  - `/notification-dispatches` 新增 `run_id`、`node_run_id`、`access_request_id` 查询参数。
- `api/app/services/sensitive_access_control.py`
  - 将新增过滤条件透传到 query 层。
- `api/app/services/sensitive_access_queries.py`
  - `list_notification_dispatches()` 在需要时 join `ApprovalTicketRecord`，从票据维度过滤 `run_id / node_run_id / access_request_id`。

### 2. 前端 inbox snapshot 改为按同范围拉取通知

- `web/lib/get-sensitive-access.ts`
  - `getNotificationDispatches()` 现在支持 `runId / nodeRunId / accessRequestId / approvalTicketId`。
  - `getSensitiveAccessInboxSnapshot()` 会把当前 active slice 全量传给 notification fetch，而不是只在 ticket id 存在时才过滤。

### 3. 回归测试锁定行为

- `api/tests/test_sensitive_access_routes.py`
  - 新增通知列表按 `run_id + node_run_id + access_request_id` 命中单条记录的断言。
  - 新增不匹配 slice 时返回空数组的断言，防止后续过滤再次回退。

## 验证

- `cd api; .\.venv\Scripts\uv.exe run pytest -q tests/test_sensitive_access_routes.py`
  - 结果：`9 passed in 0.38s`
- `cd api; .\.venv\Scripts\uv.exe run pytest -q`
  - 结果：`308 passed in 33.79s`
- `cd web; pnpm exec tsc --noEmit`
  - 结果：通过
- `cd web; pnpm lint`
  - 结果：通过（仅保留 Next.js `next lint` 废弃提示）

## 影响评估

- 对用户层：当前 slice 下的通知投递状态终于与票据/请求保持一致，不再出现“票据在、通知空白”的误导。
- 对 AI 与人协作层：callback waiting、approval pending 和 notification dispatch 现在可以在同一条 slice 里查看，不需要再切回 ticket id 单点检索。
- 对 AI 治理层：这次没有新增第二套 operator 模型，而是把已有 `ApprovalTicket / NotificationDispatch` 主链的数据闭环补完整。

## 下一步

1. 继续把 waiting callback / approval pending 的联合治理动作补强到更细的 operator 面，而不只停留在可查看。
2. 继续把 publish detail、run diagnostics 与 inbox 之间的共享 explanation / summary 统一到 presenter/helper 层，避免文案和口径漂移。
3. 持续治理 `runtime_node_dispatch_support.py`、`agent_runtime.py`、`get-workflow-publish.ts` 等热点文件，避免 operator 能力继续叠回聚合层。
