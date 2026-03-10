# Workflow 编辑器最小骨架

## 背景

前一轮已经把工作流定义、版本快照、运行态追溯、插件目录和首页级 workflow tool binding 接起来，但前端仍然缺少真正的“编排入口”：

- workflow 只能通过 API 或首页局部表单间接修改
- `7Flows IR` 的 `nodes + edges` 还没有对应的画布视图
- 节点位置、连线和基础 metadata 没有统一编辑面
- 首页已经开始承担过多“临时编辑器”职责

这会让项目在“可调试”和“可追溯”上先跑起来了，但“可编排”还没有真正成立。

## 目标

先落一个最小但真实可用的 workflow 编辑器骨架，而不是一次性造完整节点配置系统：

1. 引入 `xyflow`，让 workflow definition 可以被画布化展示
2. 提供独立编辑页，而不是继续堆在首页
3. 支持最小交互：
   - 查看 nodes / edges
   - 新增节点
   - 连接节点
   - 编辑节点名称与基础 config JSON
   - 编辑 edge 的 channel / condition / conditionExpression
   - 保存回后端并复用现有版本递增链路
4. 为后续节点抽屉、调试联动和发布配置预留清晰边界

## 实现

### 1. 新增 workflow definition 与画布状态的转换层

新增：

- `web/lib/workflow-editor.ts`

职责：

- 定义编辑器用的 node / edge data 结构
- 提供 `workflowDefinitionToReactFlow()` 与 `reactFlowToWorkflowDefinition()`
- 约定把节点位置写入 `config.ui.position`
- 提供最小节点 palette 和 edge 草稿构造

这样“画布状态”和“后端 definition”之间有了单独的收口层，后续节点表单替换 JSON 文本区时，不需要重写整条保存链路。

### 2. 新增独立 workflow 编辑页

新增：

- `web/app/workflows/[workflowId]/page.tsx`
- `web/components/workflow-editor-workbench.tsx`

其中：

- 路由页负责读取 workflow 详情与 workflow 列表
- workbench 负责承载 `xyflow` 画布、节点 palette、selection inspector 和保存动作

当前工作台支持：

- 读取已有 workflow definition
- 在画布中展示节点与连线
- 新增 `llm_agent` / `tool` / `mcp_query` / `condition` / `router` / `output`
- 直接编辑节点名
- 通过 JSON 文本区编辑 `config`
- 通过 JSON 文本区 onBlur 编辑 `runtimePolicy`
- 编辑 edge 的 `channel` / `condition` / `conditionExpression`
- 删除选中的节点或连线
- 通过 `PUT /api/workflows/{id}` 保存，并复用后端版本号递增

### 3. 首页补 editor 入口，而不是继续承担编辑职责

更新：

- `web/app/page.tsx`

首页新增 workflow canvas 入口卡片，但不再把更多编辑逻辑堆回首页。这样首页继续承担：

- 系统状态
- plugin registry
- workflow tool binding
- run 诊断入口
- 编辑器跳转入口

真正的编辑行为则开始迁移到独立 workflow 页面。

### 4. 全局样式补 editor 分区与 xyflow 基础样式

更新：

- `web/app/layout.tsx`
- `web/app/globals.css`

当前样式处理：

- 在根 layout 引入 `@xyflow/react` 样式
- 为 editor 页面单独定义三栏布局
- 保持现有工作台视觉语言，但让 canvas / sidebar / inspector 的职责更清晰
- 自定义节点壳层，直接把节点类型与名称显示在卡片上

## 影响范围

- `web/app/layout.tsx`
- `web/app/page.tsx`
- `web/app/workflows/[workflowId]/page.tsx`
- `web/app/globals.css`
- `web/components/workflow-editor-workbench.tsx`
- `web/lib/get-workflows.ts`
- `web/lib/workflow-editor.ts`
- `web/package.json`
- `web/pnpm-lock.yaml`

## 验证

执行：

```powershell
cd web
pnpm lint
pnpm build
```

结果：

- `pnpm lint` 通过
- `pnpm build` 通过
- 新增路由 `/workflows/[workflowId]`

## 当前边界

这轮仍然没有实现：

- workflow 新建入口与草稿模板向导
- 节点参数表单自动消费 `input_schema`
- 基于画布的 tool binding 专用 UI
- run 调试状态在画布上的实时高亮
- `loop` 节点的编辑与执行闭环
- 发布配置、凭证配置和节点权限模型的可视化表单

## 下一步

更连续的后续顺序是：

1. 把 `tool` / `mcp_query` / `condition` 等节点从 JSON 文本区升级为结构化配置表单
2. 把 run / trace 诊断信号接到画布节点状态高亮与时间线回放
3. 补 workflow 新建入口和更稳定的 starter template
4. 在前端开始引入 editor 相关测试，而不是只依赖 lint / build
