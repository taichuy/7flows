# Agent Flow Debug Console Live Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `Agent Flow Debug Console` 补齐真正的 `停止运行`、异步整流执行和增量 trace 刷新，让调试控制台从“快照查看器”升级为“live runtime 工作台”。

**Architecture:** 这一阶段把 `start_flow_debug_run` 从“同步执行到返回 detail”改成“先创建 `flow_run` 并快速返回，再由后台继续推进”。前端拿到 `run_id` 后轮询 `get run detail`，并通过新增的 `cancel flow run` 写接口请求终止运行。运行时执行器增加取消检查点；控制面和 API 暴露新的状态流转。

**Tech Stack:** Rust (`domain`, `control-plane`, `storage-durable/postgres`, `api-server`), React 19, TypeScript, TanStack Query, Vitest, cargo test

> 2026-04-25 实施备注：`FlowRunStatus::Cancelled` 与对应状态流转规则在代码中已存在，因此本阶段未新增 domain 状态字段，也未新增 PostgreSQL migration；最终实现直接复用既有 `flow_runs.status` 与 `finished_at`。

---

## File Structure

- Modify: `api/crates/domain/src/orchestration.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`
- Modify: `api/crates/control-plane/src/ports/runtime.rs`
- Modify: `api/crates/storage-durable/postgres/src/orchestration_runtime_repository.rs`
- Modify: `api/crates/storage-durable/postgres/src/mappers/orchestration_runtime_mapper.rs`
- Create: `api/crates/storage-durable/postgres/migrations/20260425130000_add_flow_run_cancel_fields.sql`
- Modify: `api/apps/api-server/src/routes/applications/application_runtime.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `web/packages/api-client/src/console-application-runtime.ts`
- Modify: `web/packages/api-client/src/index.ts`
- Modify: `web/app/src/features/agent-flow/api/runtime.ts`
- Modify: `web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts`
- Modify: `web/app/src/features/agent-flow/components/debug-console/DebugConsoleHeader.tsx`
- Modify: `web/app/src/features/agent-flow/components/debug-console/conversation/DebugAssistantMessage.tsx`
- Create: `api/crates/control-plane/src/_tests/orchestration_runtime/cancel.rs`
- Modify: `api/apps/api-server/src/_tests/application/application_runtime_routes.rs`
- Create: `web/app/src/features/agent-flow/_tests/debug-console/debug-console-live-runtime.test.tsx`

### Task 1: 为 flow run 增加可取消状态流转

**Files:**
- Modify: `api/crates/domain/src/orchestration.rs`
- Modify: `api/crates/control-plane/src/ports/runtime.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`
- Create: `api/crates/control-plane/src/_tests/orchestration_runtime/cancel.rs`

- [x] **Step 1: 先写后端取消失败测试**

至少覆盖：

```rust
#[tokio::test]
async fn cancel_flow_run_marks_running_debug_run_as_cancelled() {}

#[tokio::test]
async fn cancel_flow_run_rejects_terminal_status() {}
```

- [x] **Step 2: 在 domain 中锁定状态规则**

新增或确认以下语义：

1. `running -> cancelled` 允许
2. `queued -> cancelled` 允许
3. `waiting_human / waiting_callback -> cancelled` 允许
4. `succeeded / failed / cancelled` 终态不可再次取消

- [x] **Step 3: 在 control-plane 增加 cancel command**

新增服务接口：

```rust
pub async fn cancel_flow_run(
    &self,
    command: CancelFlowRunCommand,
) -> Result<domain::ApplicationRunDetail>
```

返回值仍统一是最新 `ApplicationRunDetail`。

- [x] **Step 4: 跑 control-plane 测试**

Run:

```bash
cargo test -p control-plane orchestration_runtime::cancel
```

Expected: PASS

### Task 2: 把整流启动改成异步返回

**Files:**
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`
- Modify: `api/crates/storage-durable/postgres/src/orchestration_runtime_repository.rs`
- Modify: `api/crates/storage-durable/postgres/src/mappers/orchestration_runtime_mapper.rs`
- Create: `api/crates/storage-durable/postgres/migrations/20260425130000_add_flow_run_cancel_fields.sql`
- Modify: `api/apps/api-server/src/_tests/application/application_runtime_routes.rs`

- [x] **Step 1: 先写 API route 失败测试**

断言：

1. `POST /orchestration/debug-runs` 立即返回 `201`
2. 返回体里的 `flow_run.status = running`
3. 前端可以直接拿到 `run_id`

- [x] **Step 2: 把 start_flow_debug_run 改成“先落 run，再后台推进”**

实现要求：

1. 创建 `flow_run` 后立即返回
2. 执行器在后台继续更新 `node_runs / events / checkpoints`
3. 每个节点完成后都持久化 detail

- [x] **Step 3: 给执行器增加取消检查**

要求：

1. 每推进一个节点前检查 `flow_run.status`
2. 若已被标记为 `cancelled`，立即停止后续执行
3. 为终止过程写入 cancel event

- [x] **Step 4: 跑 route 与 service 回归**

Run:

```bash
cargo test -p control-plane orchestration_runtime
cargo test -p api-server application_runtime_routes
```

Expected: PASS

### Task 3: 暴露 cancel 接口并更新前端 client

**Files:**
- Modify: `api/apps/api-server/src/routes/applications/application_runtime.rs`
- Modify: `api/apps/api-server/src/openapi.rs`
- Modify: `web/packages/api-client/src/console-application-runtime.ts`
- Modify: `web/packages/api-client/src/index.ts`
- Modify: `web/app/src/features/agent-flow/api/runtime.ts`

- [x] **Step 1: 新增 API route**

接口建议：

```text
POST /api/console/applications/{id}/orchestration/runs/{run_id}/cancel
```

返回最新 `ApplicationRunDetail`。

- [x] **Step 2: 补 api-client 合同**

新增：

```ts
export function cancelConsoleFlowRun(
  applicationId: string,
  runId: string,
  csrfToken: string,
  baseUrl?: string
)
```

- [x] **Step 3: 在 agent-flow feature 包装 cancel helper**

```ts
export function cancelFlowDebugRun(
  applicationId: string,
  runId: string,
  csrfToken: string
)
```

- [x] **Step 4: 跑前后端合同测试**

Run:

```bash
cargo test -p api-server application_runtime_routes
pnpm --dir web/app test -- src/features/agent-flow/_tests/debug-console/debug-console-live-runtime.test.tsx
```

Expected: PASS

### Task 4: 前端接入 live polling 与真实 stop

**Files:**
- Modify: `web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts`
- Modify: `web/app/src/features/agent-flow/components/debug-console/DebugConsoleHeader.tsx`
- Modify: `web/app/src/features/agent-flow/components/debug-console/conversation/DebugAssistantMessage.tsx`
- Create: `web/app/src/features/agent-flow/_tests/debug-console/debug-console-live-runtime.test.tsx`

- [x] **Step 1: 先写 live runtime 前端失败测试**

至少覆盖：

```tsx
test('polls run detail after start until terminal status', async () => {})
test('sends cancel request when clicking stop and updates session to cancelled', async () => {})
```

- [x] **Step 2: 在 session hook 中接入轮询**

要求：

1. `startFlowDebugRun` 返回 `run_id` 后立即进入 `running`
2. 使用 `fetchApplicationRunDetail` 轮询最新 detail
3. 终态后停止轮询

- [x] **Step 3: 在 Header 接入真实 stop**

行为固定：

1. `running / waiting_human / waiting_callback` 显示 `停止运行`
2. 点击后调用 cancel API
3. 成功后更新会话为 `cancelled`

- [x] **Step 4: 在消息和 trace 中表现 cancelled**

至少补这两处：

1. `assistant` 消息状态条显示 `已停止`
2. `Trace` 顶部显示 `cancelled`

- [x] **Step 5: 跑 live runtime 前端测试**

Run:

```bash
pnpm --dir web/app test -- src/features/agent-flow/_tests/debug-console/debug-console-live-runtime.test.tsx
```

Expected: PASS

- [x] **Step 6: 提交第二阶段代码**

```bash
git add \
  api/crates/domain/src/orchestration.rs \
  api/crates/control-plane/src/orchestration_runtime.rs \
  api/crates/control-plane/src/ports/runtime.rs \
  api/crates/control-plane/src/_tests/orchestration_runtime/cancel.rs \
  api/crates/storage-durable/postgres/src/orchestration_runtime_repository.rs \
  api/crates/storage-durable/postgres/src/mappers/orchestration_runtime_mapper.rs \
  api/crates/storage-durable/postgres/migrations/20260425130000_add_flow_run_cancel_fields.sql \
  api/apps/api-server/src/routes/applications/application_runtime.rs \
  api/apps/api-server/src/openapi.rs \
  api/apps/api-server/src/_tests/application/application_runtime_routes.rs \
  web/packages/api-client/src/console-application-runtime.ts \
  web/packages/api-client/src/index.ts \
  web/app/src/features/agent-flow/api/runtime.ts \
  web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts \
  web/app/src/features/agent-flow/components/debug-console/DebugConsoleHeader.tsx \
  web/app/src/features/agent-flow/components/debug-console/conversation/DebugAssistantMessage.tsx \
  web/app/src/features/agent-flow/_tests/debug-console/debug-console-live-runtime.test.tsx \
  docs/superpowers/plans/2026-04-25-agent-flow-debug-console-live-runtime.md
git commit -m "feat: add live runtime controls to agent flow debug console"
```
