# 2026-03-16 Sensitive Access Notification Retry

## 背景

- 用户要求先系统阅读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md`，再结合最近一次 Git 提交判断项目现状、基础框架是否成立，以及是否需要衔接后续开发。
- 复核最近提交链后，结论是：`3c61ae7 feat: add sensitive access inbox` 仍然在推进统一敏感访问治理主线，不需要回头补“基础框架”；项目已具备可持续功能开发的 runtime / published surface / trace / inbox 骨架。
- 当前更紧迫的缺口不是“有没有通知模型”，而是通知投递语义还不够诚实：除 `in_app` 以外的通道此前会留下长期 `pending` 记录，但仓库尚未接入真实 worker / adapter，operator 也缺少一个最小的手动 retry 动作。

## 现状判断

### 1. 上一次 Git 提交是否需要衔接

- 结论：**需要继续衔接。** `3c61ae7` 已把审批 / 通知收件箱接到前端，但通知分发仍停留在“记录存在，外部通道还未真实执行”的阶段；本轮顺着这条主线补齐更诚实的 delivery 状态和最小 retry 入口。

### 2. 基础框架是否已经写好

- 结论：**是。** 当前仓库已经具备 workflow / runtime / published surface / sensitive access 的统一事实层与主干 API，足以支撑继续做功能性开发，不需要停下来重新设计底座。

### 3. 架构是否满足扩展性、兼容性、可靠性、安全性

- 结论：**总体满足。** `7Flows IR`、单一 runtime orchestrator、统一事件事实层、统一敏感访问模型和 published surface 没有被本轮改动破坏。
- 本轮保持在现有 `SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 主链内演进，没有额外引入第二套通知状态机，也没有把通知逻辑写回 runtime 或 UI 特判。
- 对“未落地能力”保持诚实：未实现的通知 adapter 不再伪装成长期 `pending`，而是明确记为 `failed` 并带原因，这比继续制造“看似会自动恢复”的假象更符合当前架构边界与产品诚实性。

### 4. 当前仍需关注的结构热点

- 后端热点仍包括：`api/app/services/agent_runtime_llm_support.py`、`api/app/services/run_views.py`、`api/app/services/workspace_starter_templates.py`、`api/app/services/runtime_node_dispatch_support.py`。
- 前端热点仍包括：`web/components/workflow-editor-workbench.tsx`、`web/lib/get-workflow-publish.ts`、`web/components/workspace-starter-library.tsx`。
- 本轮没有优先拆这些热点，是因为 `P0` 更应该先把敏感访问治理链补成“有真实 operator 动作 + 不伪造状态”的闭环。

## 目标

1. 让敏感访问通知投递结果与当前代码事实一致，不再把未接入 adapter 的通道伪装成长期 `pending`。
2. 补出最小可用的 `/api/sensitive-access/notification-dispatches/{dispatch_id}/retry`，让 operator 可以在收件箱里对最新失败通知做手动重试。
3. 保持通知、审批、run 诊断仍然围绕同一套 `ApprovalTicket / NotificationDispatch` 事实层演进，为后续 worker / adapter / timeline 扩展保留稳定边界。

## 实现

### 1. 后端通知投递语义改为“诚实失败”

- 更新 `api/app/services/sensitive_access_control.py`：
  - 抽出 `_create_notification_dispatch()`，统一生成通知投递记录。
  - `in_app` 通道继续即时标记为 `delivered`。
  - `slack / email / webhook / feishu` 等尚未接入的通道不再留下假性的长期 `pending`，而是直接记为 `failed`，并写入“worker/adapter 尚未实现”的明确错误说明。

### 2. 新增通知重试 API

- 更新 `api/app/schemas/sensitive_access.py`、`api/app/services/sensitive_access_types.py`、`api/app/api/routes/sensitive_access.py`：
  - 新增 `NotificationDispatchRetryResponse` 与对应 bundle。
  - 新增 `POST /api/sensitive-access/notification-dispatches/{dispatch_id}/retry`。
  - 只允许对**最新**、且所属票据仍是 `pending + waiting` 的通知做 retry，避免对历史记录重复派生第二条状态线。
  - 已 `delivered` 的通知不允许 retry；若旧记录仍是 `pending`，retry 时会把旧记录标记为被手动重试 supersede，避免 summary 长期累计伪 pending。

### 3. 前端 inbox 接入重试动作

- 更新 `web/app/actions/sensitive-access.ts`：新增 `retrySensitiveAccessNotificationDispatch()` server action，统一回刷首页、`/sensitive-access` 与关联 run 页面。
- 更新 `web/components/sensitive-access-inbox-panel.tsx`：
  - 当票据仍为 `pending + waiting` 且最新通知不是 `delivered` 时，显示“重试最新通知”按钮。
  - 把最新通知错误原因直接展示给 operator，避免 retry 仍然只剩静态 badge。

### 4. 文档同步

- 更新 `docs/dev/runtime-foundation.md`：把通知诚实失败语义与 retry API 纳入当前事实，并把下一步从“dispatch retry”推进到“真实 worker / adapter + timeline”。
- 更新 `README.md`：把收件箱支持“手动重试最新失败通知”写入当前界面事实。

## 验证

### 后端测试

在 `api/` 目录执行：

```powershell
api/.venv/Scripts/uv.exe run pytest tests/test_sensitive_access_routes.py -q
```

预期覆盖：

- 高敏资源 + `in_app` 通知仍会即时 delivered。
- 高敏资源 + 外部通知通道现在会诚实失败。
- `notification-dispatches/{dispatch_id}/retry` 会产生新的尝试记录，并沿用同一 approval ticket。

### 前端校验

在 `web/` 目录执行：

```powershell
pnpm exec tsc --noEmit
pnpm lint
```

### 差异检查

在仓库根目录执行：

```powershell
git diff --check
```

## 结论与下一步

- 当前项目依然**没有进入**“只剩人工逐项界面设计 / 验收”的阶段，因此本轮**不触发** `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"`。
- 这轮开发继续证明：当前仓库真正缺的是把既有治理事实层补成真实 operator 闭环，而不是重写基础框架。
- 下一步建议按优先级继续：
  1. **P0**：补真实 `notification worker / adapter`，把当前“诚实失败 + 手动 retry”推进到可自动投递。
  2. **P0**：补 approval timeline / notification timeline，让 operator 能看到审批与通知的时间顺序，而不只是一组 badge。
  3. **P0**：继续把 `WAITING_CALLBACK` 的 published drilldown 与 operator 入口接到同一控制面。
  4. **P1**：继续治理 `agent_runtime_llm_support.py`、`run_views.py`、`workflow-editor-workbench.tsx` 等结构热点，防止功能推进快于解耦节奏。
