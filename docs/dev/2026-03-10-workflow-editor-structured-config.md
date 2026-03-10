# 2026-03-10 Workflow Editor Structured Config

## 背景

`docs/dev/runtime-foundation.md` 在本轮开始前把最高优先级定义为两件事：

1. 把 `tool` / `mcp_query` / `condition` / `router` 节点从 JSON 文本区升级为结构化配置表单。
2. 把已持久化的 compat 工具目录真正接入 editor 内的节点配置，而不是停留在首页绑定面板。

当时编辑器虽然已经具备画布、保存和版本快照，但节点 inspector 仍然主要依赖整块 JSON 编辑，真实编排门槛偏高；compat 工具目录也只在首页可见，不能直接在工作流画布里完成绑定与输入配置。

## 目标

- 让 P0 范围内的关键节点具备最低可用的结构化配置体验。
- 把 `/api/plugins/tools` 持久化目录直接接入 workflow editor 页面和节点 inspector。
- 在不破坏现有 definition / versioning 链路的前提下，保留高级 JSON 作为兜底入口。
- 顺手拆分过大的 editor inspector 逻辑，避免单文件继续无序膨胀。

## 实现与决策

### 1. workflow editor 页面直接加载 plugin registry

- `web/app/workflows/[workflowId]/page.tsx` 现在会并行加载：
  - workflow 详情
  - workflow 列表
  - plugin registry snapshot
- editor workbench 会接收 `tools`，不再只依赖首页工具绑定面板提供目录上下文。

### 2. inspector 拆分为独立组件

- 从 `web/components/workflow-editor-workbench.tsx` 提取出：
  - `web/components/workflow-editor-inspector.tsx`
  - `web/components/workflow-node-config-form.tsx`
- 这样保留了画布壳层、保存链路和 inspector 表单的职责分离。
- 本轮后 `workflow-editor-workbench.tsx` 从 725 行下降到 631 行，继续符合“单文件不要无上限膨胀”的长期偏好。

### 3. 关键节点改为结构化配置表单

当前已结构化的节点类型：

- `tool`
  - 可直接从 catalog 选择持久化工具目录项
  - 可编辑 `adapterId` / `timeoutMs`
  - 会根据工具 `input_schema` 自动渲染基础输入字段
  - 当前优先支持 `string` / `number` / `boolean` / `enum`
- `mcp_query`
  - 可配置可读节点
  - 可配置额外 artifact 授权
  - 可配置 query source 和 query artifact types
  - 当前围绕已落地的 `authorized_context` 模型提供结构化编辑
- `condition` / `router`
  - 可在 selector rules / expression / fixed branch 三种模式间切换
  - selector 模式支持规则列表增删、operator 选择和 default branch
  - expression 模式支持安全表达式与 fallback branch key

### 4. 保留高级 JSON 作为兜底

- 结构化表单只覆盖当前优先级里最有价值、最稳定的字段。
- `Advanced config JSON` 仍保留在 inspector 中，未被结构化吸收的字段不会丢失。
- `runtimePolicy` 依旧先走 JSON，避免本轮把范围扩散到 join / retry / edge mapping 的全量结构化。

## 影响范围

- `web/app/workflows/[workflowId]/page.tsx`
- `web/components/workflow-editor-workbench.tsx`
- `web/components/workflow-editor-inspector.tsx`
- `web/components/workflow-node-config-form.tsx`

用户可感知变化：

- 工具目录不再只是首页里的“可见状态”，而是 editor 内真正可用的节点配置来源。
- 关键节点不必先手写整块 JSON 才能完成基础编排。
- 结构化表单和高级 JSON 并存，降低了从骨架到真实编排的切换成本。

## 验证

本轮没有引入新的前端测试基础设施，原因是当前 `web/` 仍无 Vitest / RTL 基线，而本轮目标优先级明确落在 P0 编排体验闭环。

已完成验证：

- `pnpm exec tsc --noEmit`
- `pnpm lint`

## 当前边界

- `tool` 节点的 schema-driven 输入字段目前只覆盖基础标量和枚举类型，复杂对象/数组字段仍回落到高级 JSON。
- `mcp_query` 当前只覆盖 `authorized_context` 模式，不延展到未来外部 MCP provider 能力。
- `runtimePolicy`、edge `mapping[]`、join merge 策略仍未结构化。
- 前端测试基线仍缺失，这也是后续需要补齐的事实。

## 下一步建议

1. P0: 把 `run_events` / `node_runs` 的状态接回画布节点高亮、时间线和回放入口，完成“可编排”之后的下一跳“可调试”。
2. P0: 把 edge `mapping[]`、join 策略等剩余高频 JSON 区域继续结构化，避免编排体验在数据流配置处重新断层。
3. P1: 为 editor 补最小前端测试基线，先覆盖 definition 转换和结构化表单的关键纯逻辑。
4. P2: 再继续推进 workflow 新建入口、starter template 和更完整的节点配置抽屉。
