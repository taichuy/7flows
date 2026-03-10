# 插件目录前端接入与 workflow tool 绑定

## 背景

上一轮已经把 compat adapter 与 plugin tool catalog 落到数据库，并支持 API 运行时按需补水恢复。但前端仍停留在系统首页的摘要卡片层级：

- 只能看到 adapter / tool 数量
- 可以触发 sync
- 看不到足够的 schema / runtime meta
- 更无法把目录直接绑定回 workflow 的 `tool` 节点

这会让“插件目录已持久化”只在后端成立，离真正可用的工作流配置闭环还差最后一段。

## 目标

在不引入完整画布编辑器的前提下，先把最小可用闭环接起来：

1. 前端直接读取 `/api/plugins/adapters` 与 `/api/plugins/tools`
2. 首页展示更完整的 plugin registry 信息，而不是只看摘要
3. 前端直接读取 `/api/workflows` 与 `/api/workflows/{id}`
4. 在首页提供 workflow 的 `tool` 节点绑定面板，把 compat 工具写回 workflow 定义

## 实现

### 1. 新增前端直连数据层

新增：

- `web/lib/get-plugin-registry.ts`
- `web/lib/get-workflows.ts`

其中：

- plugin registry 直接读取 adapter / tool 注册接口
- workflow 数据直接读取工作流列表与单条详情接口

这样首页不再只依赖 `system overview` 的摘要字段，目录与 workflow 配置都能读取真实对象。

### 2. 首页目录面板升级为真实 registry 视图

新增 `web/components/plugin-registry-panel.tsx`，替换原来首页里较薄的 adapter/tool 卡片：

- adapter 卡片继续支持 sync
- tool 卡片补充：
  - `description`
  - `input_schema` 字段名
  - `plugin_meta.origin`
  - `plugin_meta.author`
  - `plugin_meta.dify_runtime.provider / plugin_id / tool_name`

这让前端第一次能直接看见 compat 工具“会被翻译成什么 Dify runtime binding”。

### 3. 新增 workflow tool binding 面板

新增：

- `web/components/workflow-tool-binding-panel.tsx`
- `web/components/workflow-tool-binding-form.tsx`
- `updateWorkflowToolBinding()` server action

交互路径：

1. 首页读取 workflow 列表
2. 用户选择一个 workflow
3. 面板列出其中所有 `tool` 节点
4. 用户从当前 plugin catalog 中选择一个 compat 工具
5. server action 读取 workflow 详情并更新对应节点的 `config.tool`
6. 通过 `PUT /api/workflows/{id}` 保存定义，触发版本递增

当前绑定策略保持克制：

- 优先写 `config.tool`
- 清除旧的 `config.toolId`
- 保留旧 binding 中已有的 `credentials` / `timeoutMs`
- 不在这轮假装已经有完整的节点参数表单生成器

### 4. 首页职责保持为“工作台入口”，不是临时编辑器替身

这轮没有强行造一套伪画布或临时 DSL 编辑器，而是让首页承担：

- 系统状态
- plugin registry
- workflow tool binding
- run 诊断入口

这样既复用了现有首页骨架，也给后续真正的 workflow 编辑器留下清晰的替换边界。

## 影响范围

- `web/app/actions.ts`
- `web/app/page.tsx`
- `web/app/globals.css`
- `web/lib/get-plugin-registry.ts`
- `web/lib/get-workflows.ts`
- `web/components/plugin-registry-panel.tsx`
- `web/components/workflow-tool-binding-panel.tsx`
- `web/components/workflow-tool-binding-form.tsx`

## 验证

执行：

```powershell
cd web
pnpm lint
```

结果：

- 本轮开发结束后补跑 lint

## 当前边界

这轮仍然没有实现：

- 完整 workflow 画布编辑器
- 节点参数表单自动消费 `input_schema`
- adapterId / credentials / timeout 的完整可视化编辑
- 绑定后即时运行预览与节点级调试

## 下一步

更连续的后续顺序是：

1. 让节点配置页直接消费 compat 工具的 `input_schema`
2. 把 workflow tool binding 从首页工作台迁移到真正的编辑器/配置抽屉
3. 将 plugin invoke 的更多运行细节继续接入 `run_events` 与调试面板
