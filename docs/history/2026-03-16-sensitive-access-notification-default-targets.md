# 2026-03-16 Sensitive Access Notification Default Targets

## 背景

- `docs/dev/runtime-foundation.md` 已把统一 sensitive access 闭环列为当前 `P0`，并明确点名“渠道 preset / 默认 target 策略”是下一步优先项之一。
- 前几轮已经补齐 notification channel governance、channel diagnostics、bulk retry 与 inbox slice filters，但 notification request 仍要求显式传 `notification_target`，导致 operator 明明已经在 diagnostics 里知道渠道配置状态，创建审批请求时却仍要重复填写 target。
- 这会让同一条通知治理语义分裂成两套：一套存在于 diagnostics/config fact，另一套存在于 request payload，既增加操作成本，也让后续 callback / approval / notification 的排障链不够一致。

## 目标

- 让 sensitive access notification channel 支持“显式 target 优先，缺省时回落到渠道默认 target”的统一策略。
- 让 `/api/sensitive-access/notification-channels` 的 diagnostics 能显式展示当前 default target 是否已配置，并做脱敏摘要。
- 保持现有 `ApprovalTicket / NotificationDispatch` 主链不变，只补齐 request preflight 与 diagnostics 的一致性。

## 本轮实现

### 1. 渠道治理增加 default target 解析

- `api/app/core/config.py`
  - 新增 `notification_webhook_default_target`、`notification_slack_default_target`、`notification_feishu_default_target`、`notification_email_default_target`。
- `api/app/services/notification_channel_governance.py`
  - 新增 `get_notification_channel_default_target()`，统一按 channel 解析默认 target。
  - `evaluate_notification_dispatch_preflight()` 改为先用显式 target，缺省时再回落到默认 target。
  - 缺少 target 时的错误文案会明确提示对应的 `SEVENFLOWS_NOTIFICATION_*_DEFAULT_TARGET` 环境变量。

### 2. 请求模型允许省略 `notification_target`

- `api/app/schemas/sensitive_access.py`
  - `SensitiveAccessRequestCreateRequest.notification_target` 改为可选字段。
  - 通过 model validator 统一做 strip/empty-to-none 归一化，避免 route/service 重复判断空字符串。
- `api/app/api/routes/sensitive_access.py`
  - 创建请求时对 service 传入 `payload.notification_target or ""`，与现有 preflight/dispatch 路径保持兼容。

### 3. diagnostics 补齐默认 target 事实

- `api/app/services/notification_channel_diagnostics.py`
  - `config_facts` 新增 `default_target`，当已配置时展示脱敏摘要；未配置时明确提示“每次请求都必须提供 notification_target”。
- 这让 operator 可以在同一页里判断“这个 channel 能不能发”“如果不显式传 target 会落到哪里”。

### 4. 路由与服务测试覆盖真实行为

- `api/tests/test_notification_channel_governance.py`
  - 新增默认 target 生效与缺省失败提示的断言。
- `api/tests/test_sensitive_access_routes.py`
  - 新增“省略 `notification_target` 时使用 Slack 默认 target 创建 dispatch”的路由测试。
  - 新增 diagnostics 对 `default_target` config fact 的断言。

## 验证

- `cd api; .\.venv\Scripts\uv.exe run pytest -q tests/test_notification_channel_governance.py tests/test_sensitive_access_routes.py`
  - 结果：`16 passed in 0.41s`
- `cd api; .\.venv\Scripts\uv.exe run ruff check app/api/routes/sensitive_access.py app/core/config.py app/schemas/sensitive_access.py app/services/notification_channel_diagnostics.py app/services/notification_channel_governance.py tests/test_notification_channel_governance.py tests/test_sensitive_access_routes.py`
  - 结果：通过
- `cd api; .\.venv\Scripts\uv.exe run pytest -q`
  - 结果：`311 passed in 35.62s`
- `cd web; pnpm exec tsc --noEmit`
  - 结果：通过
- `cd web; pnpm lint`
  - 结果：通过（仅保留 Next.js `next lint` 废弃提示，无实际 lint 问题）

## 影响评估

### 对问题 1：架构是否足够承接后续开发

- 这次改动没有新增第二套通知模型，而是复用现有 `NotificationDispatchPreflight -> NotificationDispatchRecord -> diagnostics` 主链补齐缺省策略，说明当前架构足以继续沿主链增量演进。
- 插件扩展、兼容性和安全性上，这种“渠道配置收口到 governance service、route/schema 只做薄透传”的做法也符合现有边界，不会让 channel-specific 细节回流到 runtime 主链。

### 对问题 2：业务闭环推进帮助

- 用户层：审批请求在常见渠道场景下不必再重复输入 target，操作更顺。
- AI 与人协作层：AI/节点创建审批请求时可以直接复用 operator 已配置的默认 target，减少 payload 噪音。
- AI 治理层：diagnostics、preflight 和 dispatch 终于共享同一套默认 target 事实，notification governance 从“能看见健康度”推进到“能真正指导请求落地”。

## 下一步

1. 继续把 notification governance 从“默认 target 已生效”推进到更清晰的 preset 管理、审计和 operator 控制面。
2. 继续补 waiting callback / approval / resume 的联合治理动作，让 operator 不只看到 blocker，还能更快处理 blocker。
3. 继续治理 `runtime_node_dispatch_support.py`、`agent_runtime.py`、`notification_delivery.py` 等热点文件，避免后续通知/治理能力再回堆到单文件。
