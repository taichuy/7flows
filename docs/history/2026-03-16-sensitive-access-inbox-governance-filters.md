# 2026-03-16 Sensitive Access Inbox Governance Filters

## 背景

- `docs/dev/runtime-foundation.md` 已把 sensitive access explanation、callback/approval 联合排障和 operator 动作面列为当前 `P0/P1` 主线。
- 当前 `/sensitive-access` 页面虽然已经具备审批状态、waiting 状态和 run/node/ticket slice，但 operator 仍然缺少几类高频治理切片：
  - 谁发起了访问请求（`human / ai / workflow / tool`）；
  - 当前策略决策是什么（`allow / deny / require_approval / allow_masked`）；
  - 通知当前卡在哪个渠道、什么状态。
- 这会让“审批事实已经集中到 inbox”与“真正定位通知/发起方问题”之间还差一层筛选闭环，尤其不利于 callback waiting、审批和通知失败联合排障。

## 目标

- 让 sensitive access inbox 支持按 `requester_type / decision / notification status / notification channel` 继续切片。
- 尽量复用现有 request / ticket / notification 主链，不新增第二套治理对象。
- 保持 route 和 service 为薄扩展，避免把筛选逻辑堆回前端单页或单个后端路由。

## 本轮实现

### 1. 通知列表 API 补齐 `channel` 过滤

- `api/app/services/sensitive_access_queries.py`
  - `list_notification_dispatches()` 新增 `channel` 过滤条件。
- `api/app/services/sensitive_access_control.py`
  - `SensitiveAccessControlService.list_notification_dispatches()` 透传 `channel`。
- `api/app/api/routes/sensitive_access.py`
  - `/api/sensitive-access/notification-dispatches` 新增 `channel` query 参数。

这让 notification diagnostics 不再只能按 `approval_ticket_id / run_id / node_run_id / access_request_id / status` 过滤，而是能直接定位到具体渠道。

### 2. 前端 snapshot helper 接通治理切片

- `web/lib/get-sensitive-access.ts`
  - `getSensitiveAccessInboxSnapshot()` 新增 `requestDecision / requesterType / notificationStatus / notificationChannel` 选项。
  - `getSensitiveAccessRequests()` 透传 `decision / requester_type`。
  - `getNotificationDispatches()` 透传 `status / channel`。
  - 当请求或通知过滤开启时，snapshot 会同步收紧 inbox entries，避免出现“票据还在，但 request/notification 已被过滤掉”的空壳卡片。

### 3. Inbox 页面补成真正可点的治理过滤入口

- `web/app/sensitive-access/page.tsx`
  - 新增四组 filter chips：
    - request decision
    - requester type
    - notification status
    - notification channel
  - active filter summary 也同步展示这些治理切片，不再只显示 run/node/ticket slice。
- `web/lib/sensitive-access-links.ts`
  - `buildSensitiveAccessInboxHref()` 支持生成上述新 query 参数，保持 run detail、publish detail、timeline list 后续都能复用同一入口。

## 验证

- `cd api; .\.venv\Scripts\uv.exe run pytest -q tests/test_sensitive_access_routes.py`
  - 结果：`10 passed in 0.53s`
- `cd api; .\.venv\Scripts\uv.exe run pytest -q`
  - 结果：`314 passed in 35.42s`
- `cd api; .\.venv\Scripts\uv.exe run ruff check app/api/routes/sensitive_access.py app/services/sensitive_access_control.py app/services/sensitive_access_queries.py tests/test_sensitive_access_routes.py`
  - 结果：通过
- `cd web; pnpm exec tsc --noEmit`
  - 结果：通过
- `cd web; pnpm lint`
  - 结果：通过（仅保留 Next.js `next lint` 废弃提示，无实际 lint 问题）

## 影响评估

### 对问题 1：架构是否继续支撑扩展性 / 兼容性 / 可靠性 / 安全性

- 是。此次改动没有新增第二套治理链，而是沿 `SensitiveAccessRequest -> ApprovalTicket -> NotificationDispatch -> Inbox` 主链补了更多 operator 过滤维度。
- 后端只是在 query/service/route 上做薄扩展，说明当前架构已经能以较低代价承接治理能力增强。
- 这类改动直接增强了排障稳定性和操作可靠性：operator 可以更快定位“哪个发起方、哪个决策、哪个渠道”在阻塞恢复。

### 对问题 2：对业务闭环推进的帮助

- **用户层**：人工 operator 在 inbox 里更容易按失败通知、特定渠道或特定发起方处理问题。
- **AI 与人协作层**：当 callback waiting、审批和通知混在一起时，能够快速区分是 AI 发起、workflow 发起，还是 tool 发起的访问请求。
- **AI 治理层**：治理视角从“能看到票据”推进到“能按治理维度切片排障”，更接近产品设计里的统一审批/通知/审计控制面。

## 关于是否陷入细枝末节

- 没有。这轮不是单纯做样式或局部重构，而是把现有 sensitive access 主链补成更接近真实 operator 使用场景的治理入口。
- 它直接服务于当前 `P0/P1` 的主线：callback waiting、approval pending、notification dispatch 的联合排障，而不是绕开主业务去修边角 UI。

## 下一步

1. 继续把 inbox / run detail / publish detail 的 operator 动作入口收敛到更贴近 blocker 的治理动作，而不只是“跳到 inbox 再筛一次”。
2. 继续沿 `WAITING_CALLBACK` 主线补 explanation 与 callback drilldown，让通知/审批/恢复三者在更多入口上共享同一叙事。
3. 在治理能力继续增强的同时，持续避免把复杂筛选和拼装逻辑重新堆回 `web/app/sensitive-access/page.tsx` 或单个 route/service。
