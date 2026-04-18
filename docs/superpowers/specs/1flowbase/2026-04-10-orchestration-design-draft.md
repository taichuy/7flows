# 1flowbase 编排设计讨论草稿

> 状态：持续更新中的讨论草稿
>
> 更新时间：2026-04-10
>
> 范围：Flow 定义层、变量体系、画布与调试分层

## 1. 本轮讨论目标

当前讨论聚焦 `Flow 定义层`，并明确参考 `../dify` 的工作流与变量体系设计，重点覆盖：

- 基础节点类型
- 画布结构
- 调试与预览
- 值缓存与存储分层
- 变量、别名、编辑器中的变量传递

## 2. 已确认方向

- 变量引用协议采用 `Dify 式 selector`
- selector 第二段直接绑定 `输出变量名`
- 变量改名时，全局联动更新所有引用是预期行为
- 所有“在工作流里写字符串且允许引用变量”的字段，统一走同一套富编辑器规范
- 富编辑器交互层采用 `Lexical` 变量节点思路
- 持久化真相与运行时真相仍然是 `模板字符串`，不是 Lexical JSON
- `Lexical` 仅作为前端编辑层的临时表示，不进入后端运行时

## 3. 模板与编辑器规范

### 3.1 统一规则

- 凡是允许引用变量的字符串字段，统一使用同一套编辑器能力
- 编辑态表现为 `文本节点 + 变量节点`
- 存储态统一回写为模板字符串
- 后端、发布、运行、版本 diff、调试都只认模板字符串及其编译结果

### 3.2 参考 Dify 的结论

- Dify 的 prompt editor 基于 `Lexical`
- 工作流变量在编辑态是 `DecoratorNode`
- 但持久化时仍会回写为模板字符串
- 因此可借鉴其“交互层节点化、存储层字符串化”的分层方式

## 4. 变量体系设计

### 4.1 核心模型

- 全局唯一引用协议是 `selector`
- 建议格式为：`["scope_or_node_id", "name", ...nestedPath]`
- 运行时唯一事实来源是 `VariablePool`
- 节点成功执行后，`outputs` 自动写回 `VariablePool`
- 深层字段不单独落为顶层变量，只在读取时按路径解析

### 4.2 命名空间

至少包含以下命名空间：

- `sys`
- `env`
- `conversation`
- 普通节点输出：`[nodeId, outputName]`
- Iteration 局部变量：`[iterationNodeId, "item"]`、`[iterationNodeId, "index"]`
- Loop 局部变量：`[loopNodeId, loopVarName]`

### 4.3 别名规则

- 局部别名仅存在于当前节点内部
- 别名只是一层输入绑定映射，不进入全局变量空间
- 真正的依赖分析、可见性计算、改名联动，都以底层 selector 为准

## 5. 容器作用域语义

### 5.1 Iteration

- 采用 `copy 父作用域` 模式
- 每轮复制父级变量池
- 每轮注入 `item / index`
- 每轮子图内部独立运行
- 对外只回传：
  - Iteration 节点显式导出输出
  - `conversation` 变量变更

### 5.2 Loop

- 采用 `share 父作用域` 模式
- Loop 变量挂在 `[loopNodeId, label]`
- 支持状态跨轮累积
- 每轮清理 Loop 子图内部节点遗留输出，避免旧值污染下一轮
- 对外只暴露 Loop 节点自己声明的输出，不直接泄漏内部节点输出

## 6. 节点输入绑定模型

建议引入统一的 `Binding Schema`，不允许前端或后端靠字段名隐式猜测依赖。

### 6.1 绑定类型

- `templated_text`
  - 运行时消费的字符串字段
  - 前端用 Lexical 变量节点编辑
  - 持久化为模板字符串
- `selector`
  - 单个变量引用
- `selector_list`
  - 多个变量引用
- `named_bindings`
  - 当前节点内部的局部别名绑定
- `condition_group`
  - 结构化条件
- `state_write`
  - 状态写入操作

### 6.2 节点职责

每个节点类型都应同时提供：

- `field schema`
  - 决定前端如何渲染配置界面
- `dependency extractor`
  - 决定编译器、单节点调试、静态校验如何收集 selector 依赖

## 7. 变量可见性规则

- `sys / env / conversation` 全局可见
- 普通节点输出仅在“拓扑上位于当前节点之前且执行路径可达”时可见
- 分支内不能直接读取兄弟分支内部输出
- 容器内部只能访问其允许的父作用域变量与局部变量
- 容器外部不能直接引用容器内部子节点输出，只能引用容器节点自己的导出输出

## 8. 调试、预览与存储分层

### 8.1 对象分层

- `Flow Draft`
  - 当前编辑中的 graph 定义
- `Draft Inspect Value`
  - 编辑器中用于单节点调试和预览的临时值
- `Flow Run`
  - 一次完整运行实例
- `Node Run`
  - 某节点在某次运行中的执行记录

### 8.2 调试能力

- 支持静态预览
- 支持输入预览
- 支持 Prompt 预览
- 支持单节点调试
- 支持整流调试
- 支持容器单步调试

### 8.3 存储分层

- `graph` 本体只存定义，不存调试值和运行缓存
- `Draft Inspect Value` 独立于 graph 存储
- `Node Run Output` 按运行实例独立存储
- PostgreSQL 存元数据与中小值
- Object Storage 存大文本、大 JSON、文件
- Redis 仅做热缓存和运行时加速，不作为真相来源

## 9. P1 基础节点建议

### 9.1 运行节点

- `Start`
- `TriggerWebhook`
- `Return`
- `LLM`
- `Tool`
- `HttpRequest`
- `Template`
- `Code`
- `IfElse`
- `Iteration`
- `Loop`
- `StateRead`
- `StateWrite`

### 9.2 非运行节点

- `Note`
- `Group`

### 9.3 P1 暂不单列

- `QuestionClassifier`
- `ParameterExtractor`
- `VariableAggregator`
- `TriggerSchedule`
- `TriggerPlugin`
- `Datasource`

## 10. 画布设计原则

- 画布持久化模型采用 `graph = { nodes, edges, viewport }`
- `node` 负责业务配置、输入绑定、输出契约、容器归属、布局信息
- `edge` 只负责执行依赖与分支出口，不承载数据映射
- 数据传递全部走 `selector / named_bindings / templated_text`
- `IfElse` 的出边应绑定稳定 `caseId`
- `Iteration / Loop` 是容器节点
- 容器内部建议保留系统入口节点，但不作为普通可编辑节点暴露
- graph 中不存临时 UI 状态，如 `selected / hovering / running`

## 11. 待继续讨论

下一阶段待收敛内容：

- Graph Schema / DSL / 版本化策略
- 节点输出契约结构
- 模板字符串语法边界
- 单节点调试的数据补齐策略
- 改名、复制、导入导出的联动规则

## 12. Graph Schema / DSL / 版本化策略

### 12.1 三层表示

建议将 Flow 相关表示拆为三层，而不是试图让一个 JSON 同时承担编辑、运行和发布三种职责。

- `Authoring Document`
  - 编辑态的权威持久化格式
  - 存数据库
  - 供前端编辑器、版本 diff、导入导出使用
- `Compiled Plan`
  - 运行前由 Authoring Document 编译得到
  - 不直接暴露给用户编辑
  - 供运行时调度器执行
- `Published Contract`
  - 对外发布时生成的接口契约
  - 不与 Authoring Document 混存

### 12.2 Authoring Document 作为唯一持久化 DSL

P1 建议只定义一套权威持久化格式，不并存第二套等价 DSL。

建议顶层结构如下：

- `schemaVersion`
  - 例如：`1flowbase.flow/v1`
- `meta`
  - Flow 名称、描述、标签、创建信息等
- `graph`
  - `nodes`
  - `edges`
- `editor`
  - `viewport`
  - `annotations`
  - 其他纯编辑器信息

建议注意：

- `graph` 是运行定义
- `editor` 是编辑器附属信息
- `graph` 与 `editor` 一起构成 Authoring Document
- 运行时编译只读取 `graph`

### 12.3 Node 结构建议

每个运行节点建议至少包含以下稳定字段：

- `id`
  - 稳定唯一 ID
- `kind`
  - 节点类型，如 `llm / http_request / iteration`
- `configVersion`
  - 当前节点配置结构版本
- `name`
  - 用户可见名称
- `description`
  - 可选说明
- `position`
  - 画布坐标
- `containerId`
  - 若在容器中，指向所属 `Iteration / Loop`
- `policy`
  - 重试、错误处理、超时等运行策略
- `config`
  - 节点特定配置
- `inputBindings`
  - 当前节点的 selector / 模板 / 条件 / 局部别名绑定
- `outputSchema`
  - 当前节点导出的输出契约

要求：

- 不在节点定义里存 `selected / hovering / running`
- 不在节点定义里存调试值、last run、临时缓存
- 节点 `id` 不应依赖标题、位置或时间戳字符串拼接

### 12.4 Edge 结构建议

每条边建议最少包含：

- `id`
- `sourceNodeId`
- `sourceHandleId`
- `targetNodeId`
- `targetHandleId`

原则：

- Edge 只表达控制流依赖
- 不在 Edge 上做数据映射
- `IfElse` 的边绑定稳定 `caseId`
- 普通顺序节点可以统一使用默认 handle，如 `out/default`

### 12.5 Editor 附属结构

建议把纯编辑器元素从运行节点中分离出来，挂到 `editor.annotations`：

- `Note`
- `Group`
- 其他未来的纯视觉标注对象

这样做的目的：

- 运行时编译时不需要过滤非执行节点
- 版本 diff 更干净
- 导入导出时更容易区分“执行定义”和“协作注释”

### 12.6 Compiled Plan

运行时不直接消费 Authoring Document，而是先编译为 `Compiled Plan`。

Compiled Plan 至少应包含：

- 已校验的节点配置
- 已解析的输入依赖
- 拓扑关系
- 分支出口映射
- 容器子图边界
- 输出契约
- 运行策略展开结果

这意味着：

- 编辑器持久化格式可以更偏向可读、可 diff
- 运行时格式可以更偏向执行效率和调度清晰度

### 12.7 版本化与迁移策略

本节当前决策采用接近 `Dify Chatflow` 的心智模型：

- 每个应用只有一个可变 `Draft`
- 历史 `FlowVersion` 全部不可变
- 发布只是让 `Publish Endpoint` 指向新的 `FlowVersion`
- 恢复历史版本时，先把它回灌为新的 `Draft`，再由用户决定是否重新发布

建议同时做两级版本：

- `schemaVersion`
  - 文档级版本
  - 控制 `Authoring Document` 顶层结构迁移
- `configVersion`
  - 节点级版本
  - 控制单节点配置迁移

建议规则：

- `Draft` 在进入编辑器前，必须已经迁移到当前支持的最新内存模型
- `FlowVersion` 数据库存储保持发布时的原始快照，不做静默覆盖
- 迁移顺序固定为：
  - 先做 `schemaVersion` 文档级迁移
  - 再按节点类型逐个做 `configVersion` 迁移
  - 最后做一次规范化与校验，生成当前编辑器可消费的 `Draft`
- 编辑器、编译器默认只面对“已迁移到当前版本”的内存模型，不背长期多版本 UI 兼容包袱

### 12.8 Draft、Version、Publish、Restore 语义

建议数据模型至少区分：

- `FlowDraft`
  - 当前唯一可编辑工作副本
  - 始终可变
  - 自动保存与日常编辑都只落在 Draft
- `FlowVersion`
  - 不可变快照
  - 用于发布、审计、回滚、diff、导出
- `Publish Endpoint`
  - 对外稳定地址
  - 内部持有当前生效的 `publishedFlowVersionId`

建议明确以下规则：

- 一个应用在 P1 只维护一个主 `Draft`
- 一个应用可以拥有多个历史 `FlowVersion`
- 当前线上生效版本不是 `Draft`，而是 `Publish Endpoint -> FlowVersion` 的指针关系
- `Draft` 在发布后继续保留，并作为后续编辑的起点

### 12.9 发布规则

发布动作定义为一个原子过程：

1. 读取当前 `Draft`
2. 校验 graph、节点配置、依赖、权限与发布前约束
3. 冻结生成一个新的不可变 `FlowVersion`
4. 将 `Publish Endpoint.publishedFlowVersionId` 切换到新版本

规则约束：

- 用户点击 `Publish` 时，不需要先手动“生成版本”
- 系统自动从当前 `Draft` 冻结出新 `FlowVersion`
- 只有新 `FlowVersion` 创建成功后，才允许切换发布指针
- 如果冻结失败或指针切换失败，发布整体失败，不允许出现半成功状态
- 发布完成后，线上流量永远命中新版本；旧版本保留在历史中，不被覆盖

### 12.10 恢复与回滚规则

历史版本恢复采用“恢复到 Draft，而不是直接切线上”的规则。

建议语义如下：

- 在版本历史中选择某个 `FlowVersion` 时，先以只读方式预览
- 用户点击 `Restore` 后，系统用该版本内容覆盖当前 `Draft`
- `Restore` 不修改任何 `Publish Endpoint` 指针
- 历史版本恢复完成后，如需线上生效，必须再执行一次 `Publish`

这样做的目的：

- 避免“查看历史版本”与“线上回滚”混成同一个动作
- 保证线上发布始终是显式操作
- 保证恢复后的版本仍有机会在重新发布前补做检查或小修订

### 12.11 迁移触发时机

对于旧版本，建议区分“运行态兼容”和“编辑态恢复”两类入口。

- 已发布旧版本在运行时可以做只读迁移到当前编译内存模型
  - 仅用于执行
  - 不回写数据库
- 用户在版本历史中打开一个旧版本准备恢复时
  - 系统先检测 `schemaVersion / configVersion`
  - 若版本过旧，先弹出迁移提示
  - 用户确认后，再基于该历史版本生成一个迁移后的新 `Draft`

这意味着：

- 历史 `FlowVersion` 始终保留原文
- 当前 `Draft` 始终保持最新编辑器结构
- “迁移”是进入当前编辑体系的门槛，不是对历史版本的后台重写

### 12.12 迁移失败处理

迁移失败时，建议采用严格阻断策略：

- 不覆盖现有 `Draft`
- 不修改当前线上 `Publish Endpoint`
- 不生成半成品 `Draft`
- 向用户展示明确的迁移失败原因
- 允许用户继续只读查看旧版本、导出原始文档或后续补做迁移器

### 12.13 导入导出策略

P1 建议导入导出直接使用同一份 Authoring Document JSON。

建议规则：

- 导出时输出标准 JSON 文档
- 导入时先校验 `schemaVersion`
- 如发生 ID 冲突，导入器统一重写 `flowId`
- `nodeId / edgeId / caseId / handleId` 在单个导入文档内必须保持稳定

### 12.14 哈希与 diff

建议对 Authoring Document 做规范化后计算内容哈希，用于：

- dirty check
- draft 保存去重
- 版本内容指纹

建议规范化时：

- 去除纯临时字段
- 保持稳定字段排序
- 不把运行态缓存纳入哈希

## 13. 待继续讨论

下一阶段待收敛内容：

- 节点输出契约结构
- 模板字符串语法边界
- 单节点调试的数据补齐策略
- 改名、复制、导入导出的联动规则

## 14. 节点输出契约结构

### 14.1 基本原则

节点输出契约不能只靠前端按节点类型“猜”，也不能把所有运行时信息都混成可引用变量。

建议将节点执行产物拆成三类：

- `public outputs`
  - 对下游节点可见
  - 会写入 `VariablePool`
  - 可被 selector 引用
- `internal control outputs`
  - 只给引擎使用
  - 不进入公共变量空间
  - 例如分支命中 case、容器内部控制信号
- `run metadata`
  - 属于 `Node Run`
  - 不作为普通变量传播
  - 例如耗时、token、价格、状态、错误类型

### 14.2 为什么要这样拆

参考 Dify 可以看到：

- 它很多节点会把业务输出与部分运行信息一起组织到 outputs 或 metadata 中
- 这种做法对 P1 可用，但长期会让“变量体系”和“运行观测”耦合

因此 1flowbase 建议比 Dify 更明确：

- `VariablePool` 只承载真正要参与编排的数据
- 运行观测信息进入 `Node Run`
- 引擎控制信号不暴露为普通 selector

### 14.3 建议的数据结构

每个节点都应有标准化 `outputSchema`：

- `public`
  - 当前节点可暴露给下游的输出字段定义
- `internal`
  - 引擎内部消费的控制字段定义
- `meta`
  - Node Run 元信息字段定义

每个字段建议包含：

- `name`
- `type`
- `description`
- `required`
- `nullable`
- `children`
  - 对 object / array item 的结构定义
- `source`
  - `system / declared / derived / plugin`
- `streamable`
  - 是否支持流式产生

### 14.4 字段类型建议

P1 先统一支持以下类型：

- `string`
- `number`
- `boolean`
- `object`
- `array`
- `file`

其中：

- `object` 必须允许声明 `children`
- `array` 必须允许声明 `itemType` 或 `children`
- `file` 视为一等类型，不退化成普通 object

### 14.5 节点输出契约来源

不同节点的输出契约来源可以不同，但最终都应落成统一结构：

- `fixed`
  - 固定输出
  - 如 `Template.output`
- `declared`
  - 用户在节点配置中显式声明
  - 如 `Code.outputs`
- `derived`
  - 由节点配置推导
  - 如 `Iteration.output` 的数组元素类型
- `plugin`
  - 来自外部工具/数据源 schema

### 14.6 推荐的节点输出边界

建议 P1 按下面方式定义典型节点输出：

- `Start`
  - `public`: 入口变量 + 必要系统入口变量
  - `meta`: 无特殊要求
- `LLM`
  - `public`: `text`、可选 `reasoning_content`、可选 `structured_output`、可选 `files`
  - `meta`: `usage`、`model`、`finish_reason`
- `Template`
  - `public`: `output`
- `HttpRequest`
  - `public`: `body`、`status_code`、`headers`、`files`
  - `meta`: 请求耗时、重试次数
- `Tool`
  - `public`: 工具 schema 声明输出 + 通用文本/文件输出
- `Code`
  - `public`: 用户声明输出
- `IfElse`
  - `public`: 建议仅暴露 `matched` 或不暴露公共输出
  - `internal`: `selectedCaseId`
- `Iteration`
  - `public`: 显式导出 `output`
  - `internal`: 当前轮控制信号
  - `meta`: 每轮耗时 map
- `Loop`
  - `public`: 显式导出 loop 变量结果
  - `internal`: break / continue 控制信息
  - `meta`: 每轮耗时 map、完成原因
- `Return`
  - `public`: 对外返回契约
- `StateRead`
  - `public`: 读取结果
- `StateWrite`
  - `public`: 可选 `result` 或无公共输出
  - `meta`: 写入条数、影响范围

### 14.7 变量池写入规则

只有 `public outputs` 会自动写入 `VariablePool`。

明确禁止：

- `internal control outputs` 自动进入公共变量空间
- `run metadata` 自动进入公共变量空间

这样可以避免：

- 下游节点错误依赖内部控制字段
- 变量选择器列表被观测字段污染
- 运行时演进时破坏用户编排

### 14.8 控制流与数据流分离

以 `IfElse` 为例：

- 控制流依赖 `selectedCaseId`
- 数据流若需要布尔结果，则显式定义 `matched`

即：

- `selectedCaseId` 是引擎字段
- `matched` 才是业务字段

这一规则也适用于其他容器与控制节点。

### 14.9 对前端的影响

前端变量选择器只展示：

- `public outputs`
- `sys / env / conversation`
- 当前容器作用域局部变量

前端不展示：

- internal outputs
- run metadata

调试面板可以展示三类信息，但变量插入器只允许选择公共输出。

## 15. 待继续讨论

下一阶段待收敛内容：

- 模板字符串语法边界
- 单节点调试的数据补齐策略
- 改名、复制、导入导出的联动规则
