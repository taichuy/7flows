# IR 校验收紧

## 背景

当前工作流定义校验已经覆盖最基础的图结构，但离“能稳定承接后续业务开发”还差一层：

- 某些分支配置在画布上看起来可配，运行时才发现分支 key 根本不可达
- MCP 查询的 artifact type 可能在运行时才暴露未授权
- `tool` 节点绑定还存在冲突配置空间
- `variables` / `publish` 这类设计态对象还缺少唯一性约束

在继续推进插件兼容和业务流之前，先把这些设计态约束收紧，可以减少“定义存进去了，但后面每一层都得兜底”的返工。

## 目标

把这轮 IR 校验增强集中在“当前运行时已经有明确消费语义、且最容易引发隐蔽错误”的部分：

- branch/router 出边条件约束
- MCP artifact 授权前置校验
- tool 节点绑定一致性
- variables / publish 唯一性

## 决策

### 1. 分支节点的出边条件要和节点语义对齐

新增约束：

- `condition` / `router` 的显式分支条件不能重复
- `condition` / `router` 最多只有一条 fallback 边（无 `condition`）
- `selector` 节点的显式分支条件必须来自 `rules[].key` 或默认分支
- `condition + expression` 节点的显式分支条件只能是 `true` / `false`
- 非分支节点不能声明自定义成功分支条件，避免把普通边误当成 branch key

原因：

- 这些规则和当前运行时 `_should_activate_edge()` 的行为是一致的
- 先在设计态拒绝不可达分支，比把错误拖到执行时更便宜

### 2. MCP artifact 授权前置到定义校验

新增约束：

- `mcp_query.config.query.artifactTypes` 若显式声明，必须被 `contextAccess` 授权

原因：

- 当前运行时已经会在执行阶段拒绝未授权 artifact type
- 既然设计态就能判断，就不应该让错误拖到 run 阶段才出现

### 3. tool 绑定继续保持 7Flows 统一形态

新增约束：

- `tool` 节点不能同时定义 `config.tool` 和 `config.toolId`
- `config.tool.adapterId` 必须配合 `config.tool.ecosystem`
- `ecosystem = native` 时不接受 `adapterId`

原因：

- 插件兼容最终也要落回 7Flows 统一工具引用，而不是让定义层同时存在多套冲突写法
- 这也符合“插件先转换成 7Flows 生态，再由运行时消费”的边界

### 4. 设计态对象唯一性补齐

新增约束：

- `variables[].name` 唯一
- `publish[].id` 唯一
- `publish[].name` 唯一
- `publish[].workflowVersion` 若显式指定，必须是语义化版本格式

原因：

- 这些对象后续都会参与版本快照、发布绑定和前端配置展示
- 不先收唯一性，后面每一层都会被迫做额外歧义处理

## 影响范围

- `api/app/schemas/workflow.py`
- `api/tests/test_workflow_routes.py`
- `docs/dev/runtime-foundation.md`

## 验证

执行：

```powershell
cd api
.\.venv\Scripts\python.exe -m pytest tests/test_workflow_routes.py tests/test_run_routes.py
```

验证覆盖：

- duplicate variable / publish metadata 会被拒绝
- 冲突的 tool 绑定会被拒绝
- 未授权的 MCP artifact type 会被拒绝
- 不可达或不合法的 branch edge 条件会被拒绝
- 新校验不影响现有 run trace 与 workflow 路由用例

## 下一步

1. 继续补更完整的 `7Flows IR` 约束时，优先围绕运行时已消费的语义展开，不提前发明第二套 DSL。
2. 插件兼容代理落地时，继续把外部插件映射到统一 `tool` 引用，而不是在工作流定义层引入外部协议特有字段。
