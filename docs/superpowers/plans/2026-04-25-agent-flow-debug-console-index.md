# Agent Flow Debug Console 计划索引

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `Agent Flow Debug Console` 落成编排页内的整流调试入口，并按“先快照闭环、再 live runtime”的顺序推进。

**Architecture:** 第一阶段只动前端和已有 runtime detail 消费链路，做出右侧 `Debug Console`、`Run Context`、`Conversation / Trace / Variables` 三个视图，并把整流运行结果映射成调试快照。第二阶段再改后端运行时合同，补齐真正的 `stop / cancel`、异步运行和增量 trace 刷新。

**Tech Stack:** React 19、TypeScript、Zustand、TanStack Query、Ant Design 5、Vitest、Rust control-plane、Axum、`@1flowbase/api-client`

---

## 执行顺序

- [ ] **Step 1: 先执行第一阶段基础计划**

计划文件：

```text
docs/superpowers/plans/2026-04-25-agent-flow-debug-console-foundation.md
```

目标：

1. 让编排页内出现可用的 `Debug Console`
2. 跑通整流输入、结果快照、trace 和变量查看
3. 与 `Node Last Run` 和画布形成联动

- [ ] **Step 2: 第一阶段验收通过后，再执行第二阶段 live runtime 计划**

计划文件：

```text
docs/superpowers/plans/2026-04-25-agent-flow-debug-console-live-runtime.md
```

目标：

1. 让 `stop` 变成真实能力
2. 让整流运行从同步请求升级为异步可观察运行
3. 让 trace 和画布运行态能实时刷新

## 锁定决策

- [ ] **Step 1: 保持产品边界**

实现时不得改变以下结论：

1. `Debug Console` 是编排页级运行工作台，不是节点 `Inspector` 的一部分。
2. `Node Last Run` 继续保留在节点 `Inspector` 内，负责节点级历史查看。
3. `Application Logs` 继续负责全量历史 run 管理，不把日志列表塞回编排页。

- [ ] **Step 2: 保持阶段边界**

第一阶段不得做以下“假完成”：

1. 不允许用前端 `AbortController` 冒充真正的 `stop`
2. 不允许用模拟 trace 代替真实 `ApplicationRunDetail`
3. 不允许把 human input form 和 callback 表单强行塞进第一阶段

## 验证顺序

- [ ] **Step 1: 先跑目标前端测试**

Run:

```bash
pnpm --dir web/app test -- src/features/agent-flow/_tests/debug-console/*
```

Expected:

1. `Debug Console` 壳层、会话 hook、trace 联动相关用例通过

- [ ] **Step 2: 再跑受影响的 agent-flow 现有回归**

Run:

```bash
pnpm --dir web/app test -- \
  src/features/agent-flow/_tests/editor/agent-flow-editor-page.test.tsx \
  src/features/agent-flow/_tests/node-last-run-runtime.test.tsx \
  src/features/agent-flow/_tests/node-detail-panel.test.tsx
```

Expected:

1. `调试整流` 入口回归通过
2. 节点详情和 `Node Last Run` 不回退

- [ ] **Step 3: 第二阶段进入后，再补后端合同测试**

Run:

```bash
cargo test -p control-plane orchestration_runtime
cargo test -p api-server application_runtime_routes
```

Expected:

1. `start / detail / cancel` 的状态流转通过
2. 异步运行 detail 查询与取消动作通过
