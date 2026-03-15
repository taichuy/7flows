# 2026-03-16 Sensitive Access Inbox

## 背景

- 用户要求先系统阅读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/dev/runtime-foundation.md`，再判断最近一次 Git 提交是否需要衔接，并按优先级继续开发、补记录。
- 复核结果是：当前仓库的基础框架已经足够支撑持续功能开发；最近提交 `8d19601 feat: export published invocation audit safely` 继续补的是 publish governance 的敏感导出主链，不需要回头补“基础框架”。
- 当前真正仍然缺少的是 operator 落点：后端已经具备 `SensitiveAccessRequest / ApprovalTicket / NotificationDispatch` 模型与 API，也已经在 run trace export、publish detail、cache inventory、publish activity export 等入口触发统一阻断，但前端还没有一个真实的审批 / 通知收件箱页面。

## 目标

1. 补出一个最小但真实可用的敏感访问收件箱页面，让 operator 可以查看审批票据和通知投递。
2. 允许在前端直接对 `pending + waiting` 的审批票据执行批准 / 拒绝，而不是只能停留在 blocked-card 文案或手工调接口。
3. 把收件箱摘要接到首页，形成“首页看信号、收件箱做处理、run 诊断看细节”的入口分层。

## 现状判断

### 1. 最近一次提交是否需要衔接

- 结论：**需要顺着主线衔接，但不必继续局限在 publish export 子问题。** `8d19601` 已把 publish activity export 接进统一敏感访问控制；本轮延续的是同一条治理主线，把已经存在的审批事实层接到真实 operator UI。

### 2. 基础框架是否已经写好

- 结论：**是。** 当前项目已经具备 workflow / runtime / published surface / sensitive access 的真实骨架；问题不在“框架没搭好”，而在于要继续把横向治理能力落到具体入口。

### 3. 架构是否支撑后续扩展、兼容、可靠性与安全性

- 结论：**总体成立。** `7Flows IR`、单一 runtime orchestrator、统一事件流、统一敏感访问主链仍然保持清晰；本轮只是把既有 `ApprovalTicket / NotificationDispatch` 事实层接到前端，不引入第二套审批模型或第二条执行链。

### 4. 是否存在需要解耦的热点文件

- 结论：**存在，但当前更高优先级是把 P0 operator 入口补齐。** `agent_runtime_llm_support.py`、`run_views.py`、`workspace_starters.py`、`workflow-editor-workbench.tsx` 仍是后续要继续治理的热点；本轮新增 inbox 页面时保持独立 helper / action / panel，不把首页或既有 publish panel 再继续做成 God component。

## 实现

### 1. 新增敏感访问取数层

- 新增 `web/lib/get-sensitive-access.ts`：
  - 对齐后端 `SensitiveResourceItem / SensitiveAccessRequestItem / ApprovalTicketItem / NotificationDispatchItem` 结构
  - 提供 `getSensitiveAccessInboxSnapshot()`，把 resource / request / ticket / notification 合并成前端可直接消费的 inbox entry
  - 统一计算 pending/waiting/notification summary，供首页与 inbox 页面复用

### 2. 新增审批决策 server action

- 新增 `web/app/actions/sensitive-access.ts`：
  - 调用 `POST /api/sensitive-access/approval-tickets/{ticket_id}/decision`
  - 在前端提交批准 / 拒绝后，自动 `revalidatePath("/")`、`revalidatePath("/sensitive-access")`，并在可用时回刷对应 `run` 页面

### 3. 新增最小收件箱页面与交互

- 新增 `web/app/sensitive-access/page.tsx`：
  - 提供按 `status / waiting_status` 的票据筛选
  - 展示 pending、waiting、notification delivery 等摘要
  - 承接“审批 / 通知收件箱”这个产品设计里明确存在、但之前还没有落到 UI 的一级入口
- 新增 `web/components/sensitive-access-inbox-panel.tsx`：
  - 展示审批票据、访问请求、敏感资源与通知投递记录的聚合视图
  - 对 `pending + waiting` 的票据直接提供批准 / 拒绝动作，并附带 operator 标识输入
  - 为每条票据保留跳转到 `/runs/{runId}` 的排障入口

### 4. 首页接入敏感访问摘要

- 更新 `web/app/page.tsx`：
  - 在工作台首页新增 sensitive access summary 区块
  - 首页只展示 pending tickets / waiting resumes / delivered/failed notices 等聚合信号，并提供跳转到收件箱页面的入口
- 更新 `README.md`：
  - 把 sensitive access inbox 纳入当前界面事实说明，避免文档继续停留在“只有 blocked-card，没有收件箱落点”的旧状态

## 影响范围

- `web/lib/get-sensitive-access.ts`
- `web/app/actions/sensitive-access.ts`
- `web/app/actions.ts`
- `web/components/sensitive-access-inbox-panel.tsx`
- `web/app/sensitive-access/page.tsx`
- `web/app/page.tsx`
- `web/app/globals.css`
- `README.md`
- `docs/dev/runtime-foundation.md`

## 验证

### 前端类型检查

在 `web/` 目录执行：

```powershell
pnpm exec tsc --noEmit
```

结果：

- 通过

### 前端 Lint

在 `web/` 目录执行：

```powershell
pnpm lint
```

结果：

- 通过（保留既有 Next.js `next lint` 弃用提示，不影响本轮正确性）

### 仓库差异检查

在仓库根目录执行：

```powershell
git diff --check
```

结果：

- 通过

## 结论与下一步

- 当前项目仍**没有进入**“只剩人工逐项界面设计/验收”的阶段，因此本轮**不触发** `node "e:\code\taichuCode\ai-presson-wen\aionui\notice\kill-port-8050.js"`。
- 这轮开发证明：当前项目不是缺“基础框架”，而是继续把统一治理能力接到真实 operator 入口。敏感访问现在已经从“后端有事实层 + 页面局部 blocked-card”推进到“首页有摘要 + inbox 可处理 + run 可回溯”。
- 下一步建议按优先级继续：
  1. **P0**：补真实 notification worker / dispatch retry，把 inbox 从“查看通知记录”推进到“真正的收件与重试主链”。
  2. **P0**：继续补 `WAITING_CALLBACK` 的 published drilldown 与 operator 入口，让 callback 型阻断也能进入同一类操作面。
  3. **P1**：补 publish approval timeline / security decision summary，把 publish blocked-card、收件箱和 publish governance 串成更完整的治理视图。
  4. **P1**：继续治理 `workflow-editor-workbench.tsx`、`run_views.py`、`agent_runtime_llm_support.py` 等热点文件，保持结构演进不落后于功能推进。
