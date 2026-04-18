# 1Flowbase agentFlow Editor 第一版设计稿

日期：2026-04-15
状态：已完成初稿，待用户审阅

关联文档：
- [04-chatflow-studio/README.md](./modules/04-chatflow-studio/README.md)
- [2026-04-10-orchestration-design-draft.md](./2026-04-10-orchestration-design-draft.md)
- [2026-04-10-p1-architecture.md](./2026-04-10-p1-architecture.md)

## 1. 文档目标

本文档用于收口 `04 agentFlow` 第一版编辑器设计，明确：

- 编排页在 `03` 宿主壳层内的页面结构
- 第一版直接对标 `Dify chatflow` 的哪些交互
- 哪些节点第一批放进来，哪些先不放
- Draft 自动保存、版本历史、布局变更与逻辑变更的边界
- 节点配置面板、问题面板、容器子画布的交互真值

## 2. 设计基线

- 第一版页面和交互直接对标 `../dify` 的 `chatflow`。
- `03` 已完成应用壳层与应用内导航；`04` 不再新增页面级壳层结构，只实现编排页内部 editor。
- 数据边界继续遵循已确认结论：
  - `Draft + FlowVersion`
  - `Authoring Document = schemaVersion + meta + graph + editor`
  - `edge` 只承载控制流
  - 数据绑定统一走 `selector / templated_text / named_bindings / condition_group / state_write`

## 3. 非目标

第一版不在本模块内解决以下问题：

- 完整运行调试台
- Flow Run / Node Run 观测与日志面板
- 发布网关细节与 API 文档页
- 运行时状态模型与持久化 CRUD
- 实时多人协同编辑
- 移动端完整画布编辑

## 4. 页面结构

### 4.1 顶层关系

- `/applications/:applicationId/orchestration` 仍然挂在 `03` 应用壳层内。
- `03` 左侧应用导航保持不变。
- 编排页主工作区整体切换为 editor 画布。

### 4.2 画布内部 Overlay

编排页不新增页面级顶栏，所有 editor 级操作挂在无限画布 overlay。

顶部 overlay 固定包含：

- `30 秒自动保存状态`
- `Issues`
- `历史版本`
- `发布配置`
- `Publish`

顶部 overlay 不重复展示：

- `Flow 名称`

原因：

- 应用和当前编排对象信息已经由既有侧边栏和页面上下文承担。
- 顶部 overlay 只保留编辑动作与状态，不再重复静态识别信息。

### 4.3 画布控制区

画布左下保留 Dify 式控制组，第一版至少包含：

- pointer / hand 模式切换
- auto layout
- note / annotation 入口
- maximize / fit view
- zoom controls
- minimap

### 4.4 节点配置区

- 节点点击后，右侧打开节点配置面板。
- 未选中节点时，右侧节点配置面板默认隐藏。
- Flow 级设置不占右侧常驻区域，统一由顶部 overlay 的按钮触发。

### 4.5 Issues 区

- `Issues` 采用右侧抽屉。
- 点击某条 issue 后：
  - 定位到对应节点
  - 自动打开节点配置面板
  - 展开到对应字段 section

## 5. 默认空态与新增节点

### 5.1 Draft 默认空态

新建 Draft 后，画布默认直接生成三个节点：

- `Start`
- `LLM`
- `Answer`

默认连线为：

`Start -> LLM -> Answer`

第一版不提供完全空白画布，不提供常驻左侧节点库。

### 5.2 新增节点入口

第一版只保留两类高频新增入口：

- 节点后方 `+`
- 从节点 handle 拉线后弹出节点选择器

第一版不做：

- 命令面板
- 常驻左侧节点库
- 复杂批量插入向导

## 6. 节点命名规则

### 6.1 节点类型名

节点类型名直接沿用 Dify 现有基础节点命名，不再为第一版重新命名。

例如：

- `LLM`
- `Start`
- `Answer`
- `IfElse`
- `Iteration`

### 6.2 节点实例别名

- 节点实例别名允许用户修改。
- 节点 `id` 不因别名修改而改变。

## 7. 第一批节点范围

### 7.1 第一批放进来

第一批 editor 直接暴露以下节点类型：

- `Start`
- `Answer`
- `LLM`
- `Knowledge Retrieval`
- `Question Classifier`
- `IfElse`
- `Code`
- `Template Transform`
- `HTTP Request`
- `Tool`
- `Variable Assigner`
- `Parameter Extractor`
- `Iteration`
- `Loop`
- `Human Input`

第一批原则：

- 以 Dify chatflow 常见基础节点为基线
- 优先覆盖核心聊天链路、条件分支、工具调用、文本处理、变量处理、容器编排
- 节点 UI 和交互心智尽量直接复用 Dify 的成熟模式

### 7.2 第一批不放进来

第一批暂不暴露以下节点：

- `Doc Extractor`
- `List Filter`
- `Variable Aggregator`
- `1Flowbase State Read`
- `1Flowbase State Write`
- `End`
- `Trigger Schedule`
- `Trigger Webhook`
- `Trigger Plugin`
- `Agent`
- `Data Source`
- `Knowledge Base`

### 7.3 不放进来的原因

- `Doc Extractor`
  - 输入 `File / Array[File]`
  - 将文档文件内容提取为纯文本输出
  - 更像文件预处理节点，不是 chatflow 第一版核心链路必需项
- `List Filter`
  - 输入数组变量
  - 对数组执行条件筛选、排序、截断、抽取指定项
  - 属于结构化数据处理工具节点，第二阶段再加入更合适
- `Variable Aggregator`
  - 将多个变量按统一类型或分组方式聚合为新的输出
  - 属于高级编排辅助节点，不是第一版最小可用链路必须项
- `1Flowbase State Read / State Write`
  - 属于 1Flowbase 自有运行时状态模型能力
  - 当前第一版 editor 先把 Dify 基础 chatflow 节点与交互整体抄稳，再在下一阶段把 1Flowbase 状态节点并入
- `End`
  - Dify workflow 中存在，但对 chatflow 第一版而言 `Answer` 已承担更直接的对话输出语义
- `Trigger* / Data Source / Knowledge Base / Agent`
  - 依赖更完整的外部触发、数据源、知识库、代理能力专题
  - 不适合作为第一版 editor 基础节点同步开放

### 7.4 关于 Assigner 与 Variable Assigner 的对齐口径

`../dify` 代码中存在历史命名混用：

- `Assigner`
- `VariableAssigner`
- `VariableAggregator`

本项目第一版对外统一采用：

- `Variable Assigner`

语义固定为：

- 对已有变量进行写入、覆盖、追加、清空、数值增减等操作

第一版不单独再暴露历史命名 `Assigner` 作为另一种不同节点。

## 8. 容器节点

### 8.1 Iteration / Loop

- `Iteration` 与 `Loop` 采用子画布聚焦模式。
- 进入容器后，主画布切换到该容器子画布上下文。
- 需要提供 breadcrumb 或返回入口，明确当前位于哪个容器层级。

### 8.2 这样做的原因

- 更贴近 Dify 当前设计
- 更容易表达作用域边界
- 复杂流程可读性更高
- 避免在一个大画布中把容器内部节点全部摊平

## 9. 保存与版本规则

### 9.1 自动保存

- 第一版采用 `30 秒自动保存`。
- 自动保存对象始终是当前 `Draft`。

### 9.2 进入版本历史的变更

以下变更视为“逻辑变更”，应进入版本历史：

- 新增节点
- 删除节点
- 节点配置改动
- 节点连接关系改动
- 容器子图内的结构变化

### 9.3 不进入版本历史的变更

以下变更只更新 Draft，不进入版本历史：

- 节点拖拽换位
- 线条视觉布局调整
- viewport 平移缩放
- 纯画布排版变化

### 9.4 历史保留策略

- 历史只保留最近 `30` 条记录。
- 超出后按时间淘汰最旧记录。

### 9.5 版本恢复

- 从历史恢复时，不直接修改历史版本本身。
- 恢复结果回灌成当前新的 `Draft`。

## 10. 校验与问题反馈

第一版静态校验采用三层反馈：

- 字段级错误
- 节点级错误角标
- 全局 `Issues` 抽屉

本模块只负责：

- 编辑期静态校验
- 缺失配置提示
- selector / binding 基本合法性提示

本模块不负责：

- 完整运行调试
- 实时运行 trace 展示

## 11. 节点配置面板

### 11.1 第一阶段目标

先完成节点配置面板的通用架构，不在第一阶段一次性做完所有 schema 细节。

统一 section 结构建议为：

- `Basics`
- `Inputs`
- `Outputs`
- `Policy`
- `Advanced`

不同节点可以裁剪 section，但整体结构保持统一。

### 11.2 Binding Editor

第一版统一做一套 Binding Editor 家族，覆盖：

- `templated_text`
- `selector`
- `selector_list`
- `named_bindings`
- `condition_group`
- `state_write`

其中：

- `Lexical` 只用于 `templated_text` 的编辑体验
- 持久化真值仍然是模板字符串与结构化 binding 数据

## 12. 交互能力基线

第一版至少支持：

- 单选
- 框选多选
- 拖拽移动
- 复制 / 粘贴
- 删除
- duplicate
- undo / redo
- fit view
- minimap
- auto layout

## 13. 移动端与性能

### 13.1 移动端

- 移动端不提供完整画布编辑。
- 移动端只允许：
  - 受限查看
  - 或直接提示桌面端使用

### 13.2 性能目标

- 第一版按常见 `50` 节点流程流畅编辑设计。
- 更大规模上限由后端环境变量和后续优化继续放开。

## 14. 实施顺序建议

建议按以下顺序实现：

1. 编排页 editor 容器与画布 overlay
2. 默认三节点空态
3. 节点选择、右侧配置面板骨架
4. 节点新增入口与节点选择器
5. Draft 自动保存与历史记录边界
6. Issues 抽屉与节点定位
7. `Iteration / Loop` 子画布聚焦
8. 第一批节点面板逐个接入

## 15. 审阅重点

用户在审阅本稿时，应重点确认：

- 第一批节点清单是否准确
- `Variable Assigner` 放入、`Doc Extractor / List Filter / Variable Aggregator` 延后是否合理
- `30 秒自动保存 + 仅逻辑变更进入历史` 的边界是否准确
- 画布顶部 overlay 与右侧面板职责是否还有冲突
- 容器节点子画布模式是否满足预期
