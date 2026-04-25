# Agent Flow Debug Console Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改后端运行时合同的前提下，为 `agent-flow` 编辑器增加可用的 `Debug Console`，支持整流输入、结果快照、trace、变量查看和画布联动。

**Architecture:** 这一阶段只消费现有 `startFlowDebugRun` 与 `ApplicationRunDetail` 合同。前端新增 `useAgentFlowDebugSession` 负责本地会话状态，把一次整流运行的最终或等待态 detail 映射成 `Conversation / Trace / Variables` 三类 view model。编辑器 store 只新增右侧面板壳层真值，不把调试消息树塞回全局 store。

**Tech Stack:** React 19、TypeScript、Zustand、TanStack Query、Ant Design 5、Vitest、Testing Library

---

## File Structure

- Create: `web/app/src/features/agent-flow/components/debug-console/AgentFlowDebugConsole.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/DebugConsoleHeader.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/DebugConsoleTabs.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/RunContextPanel.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/conversation/DebugConversationPane.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/conversation/DebugComposer.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/conversation/DebugAssistantMessage.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/conversation/DebugTraceSummary.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/trace/DebugTracePane.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/variables/DebugVariablesPane.tsx`
- Create: `web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts`
- Create: `web/app/src/features/agent-flow/lib/debug-console/run-detail-mapper.ts`
- Create: `web/app/src/features/agent-flow/lib/debug-console/trace-filters.ts`
- Create: `web/app/src/features/agent-flow/lib/debug-console/variable-groups.ts`
- Modify: `web/app/src/features/agent-flow/api/runtime.ts`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowOverlay.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/styles/shell.css`
- Modify: `web/app/src/features/agent-flow/components/editor/styles/index.css`
- Modify: `web/app/src/features/agent-flow/store/editor/slices/panel-slice.ts`
- Modify: `web/app/src/features/agent-flow/store/editor/index.ts`
- Modify: `web/app/src/features/agent-flow/store/editor/selectors.ts`
- Create: `web/app/src/features/agent-flow/_tests/debug-console/debug-console-shell.test.tsx`
- Create: `web/app/src/features/agent-flow/_tests/debug-console/use-agent-flow-debug-session.test.tsx`
- Create: `web/app/src/features/agent-flow/_tests/debug-console/debug-console-trace-linkage.test.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/editor/agent-flow-editor-page.test.tsx`

### Task 1: 加入右侧 Debug Console 壳层与布局真值

**Files:**
- Modify: `web/app/src/features/agent-flow/store/editor/slices/panel-slice.ts`
- Modify: `web/app/src/features/agent-flow/store/editor/index.ts`
- Modify: `web/app/src/features/agent-flow/store/editor/selectors.ts`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/styles/shell.css`
- Create: `web/app/src/features/agent-flow/_tests/debug-console/debug-console-shell.test.tsx`

- [x] **Step 1: 先写壳层失败测试**

测试覆盖以下行为：

```tsx
test('opens a docked debug console from overlay and keeps inspector separate', async () => {
  renderShell(<AgentFlowEditorShell ... />);

  fireEvent.click(await screen.findByRole('button', { name: '调试整流' }));

  expect(await screen.findByRole('complementary', { name: '调试控制台' })).toBeInTheDocument();
  expect(screen.getByText('Conversation')).toBeInTheDocument();
});
```

- [x] **Step 2: 扩展 panel slice**

新增以下壳层状态：

```ts
debugConsoleOpen: boolean;
debugConsoleWidth: number;
debugConsoleActiveTab: 'conversation' | 'trace' | 'variables';
```

并在 `replaceFromServerState` 时保留宽度、重置打开态。

- [x] **Step 3: 在 CanvasFrame 中接入三栏布局**

要求：

1. `Canvas` 仍是主区域
2. `Node Detail Inspector` 保持现有位置
3. `Debug Console` 固定在最右侧
4. 当 `debugConsoleOpen = true` 时，`AgentFlowOverlay` 的“调试整流”按钮只负责打开面板，不直接发起运行

- [x] **Step 4: 补最小样式**

样式最少要落以下类：

```css
.agent-flow-editor__debug-console
.agent-flow-editor__debug-console-resize-handle
.agent-flow-editor__debug-console-body
.agent-flow-editor__debug-console-tabs
```

- [x] **Step 5: 跑目标壳层测试**

Run:

```bash
pnpm --dir web/app test -- src/features/agent-flow/_tests/debug-console/debug-console-shell.test.tsx
```

Expected: PASS

### Task 2: 实现调试会话 hook 和 runtime detail 映射

**Files:**
- Create: `web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts`
- Create: `web/app/src/features/agent-flow/lib/debug-console/run-detail-mapper.ts`
- Create: `web/app/src/features/agent-flow/lib/debug-console/variable-groups.ts`
- Create: `web/app/src/features/agent-flow/lib/debug-console/trace-filters.ts`
- Modify: `web/app/src/features/agent-flow/api/runtime.ts`
- Create: `web/app/src/features/agent-flow/_tests/debug-console/use-agent-flow-debug-session.test.tsx`

- [x] **Step 1: 先写 hook 失败测试**

至少覆盖三类映射：

```tsx
test('creates user and assistant messages after a debug run succeeds', async () => {})
test('maps waiting_human runs to pending assistant state without fake output', async () => {})
test('reuses last run context from local draft storage', async () => {})
```

- [x] **Step 2: 给 agent-flow feature 增补 detail mapper**

在 `api/runtime.ts` 新增前端专用 helper：

```ts
export interface AgentFlowDebugMessage { /* role, content, status, runId */ }
export interface AgentFlowTraceItem { /* nodeId, alias, type, status, durationMs */ }
export interface AgentFlowVariableGroup { /* title, items */ }
```

并提供：

```ts
mapRunDetailToConversation(detail)
mapRunDetailToTrace(detail)
mapRunDetailToVariableGroups(detail)
buildRunContextFromDocument(document, rememberedInputs)
```

- [x] **Step 3: 实现 `useAgentFlowDebugSession`**

hook 至少暴露：

```ts
{
  status,
  runContext,
  messages,
  traceItems,
  variableGroups,
  activeNodeFilter,
  submitPrompt,
  rerunLast,
  clearSession,
  setRunContextValue,
  selectTraceNode,
  syncSelectedNode
}
```

约束：

1. 提交时先插入 `user` 消息和 `assistant` 临时运行态消息
2. 请求完成后再把临时运行态消息替换为最终 detail
3. 成功后保存本次 `Run Context` 到本地存储，key 包含 `applicationId + draftId`
4. 完成后 invalidation `['applications', applicationId, 'runtime']`

- [x] **Step 4: 跑 hook 目标测试**

Run:

```bash
pnpm --dir web/app test -- src/features/agent-flow/_tests/debug-console/use-agent-flow-debug-session.test.tsx
```

Expected: PASS

### Task 3: 落 Conversation / Trace / Variables 三个视图

**Files:**
- Create: `web/app/src/features/agent-flow/components/debug-console/AgentFlowDebugConsole.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/DebugConsoleHeader.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/DebugConsoleTabs.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/RunContextPanel.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/conversation/DebugConversationPane.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/conversation/DebugComposer.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/conversation/DebugAssistantMessage.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/conversation/DebugTraceSummary.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/trace/DebugTracePane.tsx`
- Create: `web/app/src/features/agent-flow/components/debug-console/variables/DebugVariablesPane.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`

- [x] **Step 1: 实现 Run Context 面板**

要求：

1. 从 `Start` 节点 `outputs` 生成输入项
2. 顶部展示 `draft` 环境标识
3. 显示“复用上次输入”状态

- [x] **Step 2: 实现 Conversation 视图**

要求：

1. `Enter` 发送，`Shift + Enter` 换行
2. 处理中文输入法 composing
3. `assistant` 消息内包含：
   - trace summary
   - 最终输出
   - `复制输出`
   - `查看 Trace`
   - `查看 Raw Output`

- [x] **Step 3: 实现 Trace 与 Variables 视图**

`Trace` 至少展示：

```ts
nodeAlias;
nodeType;
status;
startedAt;
finishedAt;
durationMs;
```

`Variables` 至少分组为：

```ts
'Input Variables'
'Node Outputs'
'Conversation / Session'
'Environment'
```

- [x] **Step 4: 把 console 真正挂进 CanvasFrame**

接入顺序：

1. 由 `AgentFlowCanvasFrame` 创建 `useAgentFlowDebugSession`
2. 把 `selectedNodeId` 同步给 session，用于 trace 过滤
3. 把 `pendingLocateNodeId` 回写动作传给 console

- [x] **Step 5: 跑编辑器回归**

Run:

```bash
pnpm --dir web/app test -- src/features/agent-flow/_tests/editor/agent-flow-editor-page.test.tsx
```

Expected:

1. 原有 overlay、保存、节点详情用例仍通过
2. 新增 `Debug Console` 打开与会话展示用例通过

### Task 4: 接画布联动与收尾回归

**Files:**
- Create: `web/app/src/features/agent-flow/_tests/debug-console/debug-console-trace-linkage.test.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvas.tsx`
- Modify: `web/app/src/features/agent-flow/_tests/node-last-run-runtime.test.tsx`

- [x] **Step 1: 先写 trace 联动失败测试**

至少覆盖：

```tsx
test('locates canvas node when clicking a trace row', async () => {})
test('filters trace rows when a node is selected on canvas', async () => {})
```

- [x] **Step 2: 复用现有 locate 能力**

实现要求：

1. trace row click 复用 `pendingLocateNodeId`
2. 不新增第二套画布定位协议
3. 如果点击的 trace 节点不是当前选中节点，不强制打开 Inspector

- [x] **Step 3: 确认 whole-flow run 后刷新 `Node Last Run`**

在 `useAgentFlowDebugSession` 完成运行后继续：

```ts
await queryClient.invalidateQueries({
  queryKey: ['applications', applicationId, 'runtime']
});
```

并补回归断言，确保整流运行后节点 `Last Run` 能拿到新数据。

- [x] **Step 4: 跑受影响测试组合**

Run:

```bash
pnpm --dir web/app test -- \
  src/features/agent-flow/_tests/debug-console/debug-console-trace-linkage.test.tsx \
  src/features/agent-flow/_tests/node-last-run-runtime.test.tsx \
  src/features/agent-flow/_tests/node-detail-panel.test.tsx
```

Expected: PASS

- [x] **Step 5: 提交第一阶段代码**

```bash
git add \
  web/app/src/features/agent-flow/components/debug-console \
  web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts \
  web/app/src/features/agent-flow/lib/debug-console \
  web/app/src/features/agent-flow/api/runtime.ts \
  web/app/src/features/agent-flow/components/editor \
  web/app/src/features/agent-flow/store/editor \
  web/app/src/features/agent-flow/_tests/debug-console \
  web/app/src/features/agent-flow/_tests/editor/agent-flow-editor-page.test.tsx \
  web/app/src/features/agent-flow/_tests/node-last-run-runtime.test.tsx \
  docs/superpowers/plans/2026-04-25-agent-flow-debug-console-foundation.md
git commit -m "feat: add agent flow debug console foundation"
```
