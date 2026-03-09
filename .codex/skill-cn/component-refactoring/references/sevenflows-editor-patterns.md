# 7Flows 编辑器重构模式

本规则用于重构 7Flows 的前端组件，尤其是未来的画布编辑器、节点组件、配置面板、调试面板和发布配置界面。

## 当前仓库前提

- 当前 `web/` 仍是轻量骨架，没有 Dify 中那类现成的 workflow store、复杂 service hooks 或组件分析脚本。
- 因此重构时不要假设存在 `pnpm analyze-component`、`pnpm refactor-component` 或 Dify 目录结构。
- 当前最可靠的验证命令是：
  - `pnpm lint`
  - `pnpm exec tsc --noEmit`
  - 若项目后续引入测试，再补运行对应测试命令

## 重构目标

重构不是把组件简单拆碎，而是把 7Flows 的几个核心界面职责分开：

- 画布编排
- 节点可视化壳层
- 节点配置表单
- 运行调试与事件查看
- 发布协议映射

## 关键拆分模式

### 1. 节点壳层与节点配置分离

推荐方向：

```text
editor/nodes/<node-type>/
  node.tsx
  panel.tsx
  use-node-config.ts
  types.ts
```

- `node.tsx`：负责节点在画布上的视觉表达、状态徽标、连接点
- `panel.tsx`：负责右侧配置面板或抽屉
- `use-node-config.ts`：负责该节点的配置读写、默认值、局部交互逻辑
- `types.ts`：维护节点 UI 需要的派生类型

避免把画布渲染、配置表单、运行预览、API 调用、变量解析全部塞进一个组件。

### 2. 通用节点骨架 + 节点类型特化

- 对 `llm_agent`、`tool`、`sandbox_code`、`mcp_query`、`router`、`loop`、`output` 等节点，应尽量复用统一的节点壳层。
- 节点特有差异放在字段区块、徽标、能力开关和局部 hook 中。
- 不要复制粘贴一套又一套几乎相同的节点 JSX。

### 3. 表单 schema 渲染与业务字段分离

- 插件参数表单、节点配置表单、发布协议映射表单，适合抽成可复用的 schema renderer 或 section 组件。
- 但业务含义不同的字段分组仍要保留显式 section，例如：
  - 模型与推理
  - 工具与 MCP
  - 沙盒与权限
  - 输入输出 schema
  - 重试与超时

### 4. 调试面板按视图拆分

调试面板适合拆成几个稳定区域：

- timeline / run events
- node input / output
- logs
- metrics
- error state

不要让一个“调试侧边栏组件”同时掌管 websocket、事件过滤、日志格式化、JSON 预览和 UI 切换。

### 5. 发布配置按协议映射拆分

- `native`、`openai`、`anthropic` 的配置差异可以拆成独立 section 或子组件。
- 但它们都应共享一层 `PublishedEndpoint` 视图模型，避免每种协议都有一套表单状态和提交流程。

## xyflow 重构注意事项

- `nodeTypes` / `edgeTypes` 放在稳定引用位置，不要在组件 render 内重新创建
- 交互元素使用 `nodrag` / `nowheel` 之类的保护类
- 节点组件只消费必要 props，避免整个画布状态对象层层透传
- 节点内部如果既有视觉态又有配置态，优先把配置态放到 panel，不要让节点卡片本身变成“大表单”

## 何时应该先抽 Hook

满足以下任一情况，优先抽 hook：

- 组件里有多组相互关联的 `useState`
- 有 2 个以上副作用或订阅逻辑
- 有变量解析、schema 转换、权限可见性推导等派生逻辑
- 有调试状态、节点状态、表单状态混在一起

## 何时应该先拆子组件

满足以下任一情况，优先拆子组件：

- 有明显不同的 UI 区块，例如 hero / canvas / side panel / debug drawer
- JSX 条件分支太深
- 同类表单区块重复出现
- 一个组件同时渲染多个弹层、模态框或 tab 内容

## 重构后的最小验证

每次抽取后至少运行：

```bash
pnpm lint
pnpm exec tsc --noEmit
```

如果项目已经为该区域补上测试，再追加运行相关测试。
