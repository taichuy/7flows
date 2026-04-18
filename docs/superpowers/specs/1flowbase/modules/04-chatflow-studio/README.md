# 04 agentFlow 编排与版本管理

日期：2026-04-10
状态：已完成

## 讨论进度

- 状态：`completed`
- 完成情况：已完成模块定稿并获用户通过，确认模块边界、Authoring Document 顶层、发布版本更新时机、模板字符串边界、复制/导入导出联动、统一 `outputs` + `outputSchema` 输出模型、保留键隐藏规则、调试态与发布态分层、产品命名。
- 最后更新：2026-04-10 17:25 CST

## 已整理来源文档

- [2026-04-10-product-design.md](../../2026-04-10-product-design.md)
- [2026-04-10-product-requirements.md](../../2026-04-10-product-requirements.md)
- [2026-04-10-p1-architecture.md](../../2026-04-10-p1-architecture.md)
- [2026-04-10-orchestration-design-draft.md](../../2026-04-10-orchestration-design-draft.md)

## 本模块范围

- Flow 画布编排
- 节点与连线模型
- 变量、输入输出契约与编辑器规范
- Draft / Version 层面的版本管理

## 已确认

- `Flow` 是最核心的可编辑资产。
- 画布编排基于 `xyflow` 的无限画布能力。
- P1 优先级已确认先完成 ChatFlow 工作流编排。
- 一个 Flow 是可版本化工作流定义，至少包含：节点、连线、变量定义、输入输出契约、状态读写行为、发布相关设置。
- P1 节点类别最小集合已收敛为：LLM 节点、工具节点、状态读取节点、状态写入节点、输入输出节点。
- P1 基础节点建议还包括：`Start`、`TriggerWebhook`、`Return`、`HttpRequest`、`Template`、`Code`、`IfElse`、`Iteration`、`Loop`；非运行节点包括 `Note`、`Group`。
- 变量引用协议采用 Dify 式 `selector`，建议格式为 `["scope_or_node_id", "name", ...nestedPath]`。
- selector 第二段直接绑定输出变量名；变量改名时应全局联动更新引用。
- 所有允许引用变量的字符串字段统一走同一套富编辑器规范。
- 编辑态采用 `Lexical` 变量节点思路；持久化真相与运行时真相仍然是模板字符串，不存 `Lexical JSON`。
- 运行时变量唯一事实来源是 `VariablePool`；节点成功执行后输出自动写回 `VariablePool`。
- 建议引入统一 `Binding Schema`，至少覆盖 `templated_text`、`selector`、`selector_list`、`named_bindings`、`condition_group`、`state_write`。
- 变量可见性遵循拓扑可达与容器作用域限制，容器外不能直接读取容器内部子节点输出。
- 画布持久化模型采用 `graph = { nodes, edges, viewport }`。
- `edge` 只负责控制流依赖，不承载数据映射；数据传递统一走 `selector / named_bindings / templated_text`。
- 建议将 Flow 表示拆为 `Authoring Document`、`Compiled Plan`、`Published Contract` 三层。
- P1 采用一个可变 `Draft` + 多个不可变 `FlowVersion` 的版本心智模型。
- `04` 模块仅讨论编辑器、DSL、版本管理、变量绑定；运行调试放入 `05`，发布接口放入 `06`，状态读写语义放入 `07`。
- `Authoring Document` 顶层固定为 `schemaVersion / meta / graph / editor`。
- `Note`、`Group` 这类纯视觉元素进入 `editor.annotations`，不混入运行节点。
- 发布版本只在点击 `Publish` 后更新；日常编辑始终落在 `Draft`。
- P1 模板字符串边界收敛为“变量插值 + 路径访问”，条件判断不进入模板语法，继续使用结构化 `condition_group`。
- 所有节点都应接入统一变量绑定能力。
- 调试样例输入、inspect 值、断点/单节点测试配置不进入发布契约，只作为 `Draft` 附属调试数据保存。
- 产品入口命名统一为 `agentFlow`；内部模型仍可沿用通用 `Flow` 术语。
- 画布内复制粘贴必须生成新的 `nodeId / edgeId / caseId` 等标识，并同步改写复制子图内部引用。
- Flow 级导入导出允许保留原内部 ID；若发生冲突，则整包重写并同步改写内部引用。
- 节点运行结果统一使用一个 `outputs` 对象承载，并统一进入 `VariablePool`。
- 节点通过静态或动态 `outputSchema` 声明“哪些输出可被下游选择器引用”。
- 保留键统一采用 `__` 前缀，默认隐藏，不进入变量选择器。

## 待讨论

- 无

## 对照参考

- 已对照 `../dify` 的变量池、节点输出和前端变量面板实现。
- 当前更接近 Dify 的推荐方向是：
  - 节点运行结果统一进入 `outputs`
  - `outputs` 统一进入变量池
  - 节点通过静态或动态 `outputSchema` 声明“哪些输出可供下游引用”
  - 少量保留键允许存在于 `outputs` 中，仅供引擎或 UI 使用，不一定进入变量选择器

## 审阅入口

- 当前模块已通过，后续若有改动作为跨模块联动回补，不再作为主讨论入口。
