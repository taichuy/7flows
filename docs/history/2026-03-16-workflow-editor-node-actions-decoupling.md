# 2026-03-16 Workflow Editor Node Actions Decoupling

## 背景

- 2026-03-16 当天已经连续完成 `workflow-editor-workbench.tsx` orchestration 拆层，以及 `use-workflow-editor-graph.ts` 中 workflow-level `variables / publish` state 的拆分。
- 最近一次 Git 提交已是 `95d8be3 refactor: split workflow editor graph workflow state`，说明上午那份“项目现状复核与优先级衔接”结论仍然成立，但当前 `HEAD` 已经再向前推进了一步，不能继续把 `fd7d3bf` 视作最新状态。
- 继续抽查源码后，`web/components/workflow-editor-workbench/use-workflow-editor-graph.ts` 仍同时承担 graph orchestration、selected node mutation、node config JSON、runtime policy / schema patch 等多类职责，已成为 editor 下一处最自然的解耦热点。

## 目标

- 继续顺着同一条 editor 主线做低风险拆分，而不是横向开启新方向。
- 把 selected node 的 mutation 与 node config / schema / runtimePolicy 编辑逻辑从 graph hook 中拆出。
- 保持 `WorkflowEditorWorkbench`、`WorkflowEditorInspector` 与保存 / validation / preflight 行为不变。

## 实现

### 1. 新增 node actions hook

- 新增 `web/components/workflow-editor-workbench/use-workflow-editor-node-actions.ts`。
- 统一承接以下 selected node 相关逻辑：
  - `nodeConfigText` 与选中节点 config 的同步
  - `focusNode()`
  - `handleAddNode()`
  - `handleNodeNameChange()`
  - `handleSelectedNodeConfigChange()`
  - `applyNodeConfigJson()`
  - `updateNodeInputSchema()` / `updateNodeOutputSchema()`
  - `updateNodeRuntimePolicy()` / `handleNodeRuntimePolicyChange()`
  - `handleDeleteSelectedNode()`

### 2. graph hook 回收到更纯粹的 orchestration 定位

- `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts` 现在主要保留：
  - workflow graph 初始化与 reset
  - workflow-level state 组合
  - nodes / edges / selection 的基础 orchestration
  - edge mutation
  - `currentDefinition` 统一组装
- 原来散落在 graph hook 中的大量 selected node patch 逻辑，已下沉到专用 hook，避免继续与 workflow-level state、edge state 混堆在一起。

## 影响范围

- `web/components/workflow-editor-workbench/use-workflow-editor-graph.ts`
- `web/components/workflow-editor-workbench/use-workflow-editor-node-actions.ts`
- `docs/dev/runtime-foundation.md`
- `docs/history/2026-03-16-workflow-editor-node-actions-decoupling.md`

## 验证

- `cd web; pnpm lint`
- `cd web; pnpm exec tsc --noEmit`
- `git diff --check`

## 结论

- 当前项目基础框架已经可以持续承接功能开发；这轮最有价值的动作依然不是重搭，而是沿既有热点做连续解耦。
- `use-workflow-editor-graph.ts` 继续朝“graph orchestration hook”收口，复杂度不再把 selected node 的 mutation、JSON patch 和 schema/runtimePolicy 编辑全部堆回一个文件。
- 下一步仍应继续沿 editor 主线，优先拆 node config / edge editing / validation focus 之间剩余的耦合点，并把更细粒度字段聚焦补到 sensitive access policy 与 schema builder 上。
