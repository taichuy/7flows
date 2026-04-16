# 1Flowse agentFlow Node Detail 第一版设计稿

日期：2026-04-16
状态：已确认设计，待用户审阅

关联文档：
- [2026-04-15-agentflow-editor-design.md](./2026-04-15-agentflow-editor-design.md)
- [2026-04-16-agentflow-editor-store-centered-restructure-design.md](./2026-04-16-agentflow-editor-store-centered-restructure-design.md)
- [modules/04-chatflow-studio/README.md](./modules/04-chatflow-studio/README.md)
- [modules/05-runtime-orchestration/README.md](./modules/05-runtime-orchestration/README.md)

## 1. 文档目标

本文档用于收口 `agentFlow` 第一版 `Node Detail` 设计，明确：

- 当前右侧薄 `Inspector` 如何升级为完整节点详情面板
- `04 agentFlow` 与 `05 runtime orchestration` 在节点详情上的边界
- 当前版本全部已接入节点的详情结构真值
- 高优先级节点的字段级交互设计
- `配置` 与 `上次运行` 两个 tab 的组件边界与扩展方式

## 2. 背景与问题

当前 [NodeInspector](/home/taichu/git/1flowse/web/app/src/features/agent-flow/components/inspector/NodeInspector.tsx) 已经完成了最小可用的 schema-driven 字段编辑能力，但仍存在以下问题：

- 过于接近“字段表单渲染器”，不具备完整节点详情心智
- 缺少统一 header、节点说明、关系信息、通用策略块
- 无法平滑承接后续 `Last Run / Node Run / trace`
- 输出区域当前仍容易被理解为“编辑输出”，而不是“展示输出契约”
- 容器节点缺少“进入子画布 / 返回上层”的明确详情入口

用户目标不是继续给当前 `NodeInspector` 叠字段，而是先把当前版本全部节点的详情结构一次性收稳，再让 `05` 在同一壳层内接入真实运行态。

## 3. 范围与非目标

### 3.1 本稿范围

本稿覆盖当前版本全部已接入节点：

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

本稿同时覆盖：

- 右侧详情面板壳层
- `配置` tab 真内容
- `上次运行` tab 的壳层与结构定义
- 通用详情组件边界
- 输出契约、关系信息、通用策略块

### 3.2 非目标

本稿不在当前模块内解决：

- `Node Run / Flow Run / trace` 的真实数据接入
- 完整单节点调试执行链路
- 运行事件时间线
- 运行日志、token 明细、重试轨迹的真实查询
- 移动端专门适配与布局优化
- 下一批未接入节点的详情设计

## 4. 模块边界

### 4.1 `04 agentFlow` 负责什么

`04` 负责把节点详情做成完整的 authoring 面板，包含：

- 统一 `Node Detail Panel` 壳层
- 节点头部信息与主操作
- 节点配置表单与 schema-driven 编辑器
- 输出契约展示
- 直接上游 / 下游关系信息
- Retry / Error / Next Step 等 authoring 通用块
- `上次运行` tab 的壳层、占位和未来扩展位

### 4.2 `05 runtime orchestration` 负责什么

`05` 负责把真实运行态接到已存在的 panel 结构里，包含：

- `Last Run` 真数据
- `Node Run / Flow Run` 状态映射
- 单节点运行结果
- trace / metadata / input / output 真值
- 运行错误、执行人、开始时间、token 等真实观测信息

### 4.3 边界结论

第一版的设计原则是：

- `04` 先把结构收稳
- `05` 再把真实运行数据接进去
- 不在 `04` 内用假运行逻辑或占位数据冒充 runtime

因此：

- `配置` tab 在 `04` 完整落地
- `上次运行` tab 在 `04` 先实现壳层与空态
- `05` 在不推翻 panel 结构的前提下接手 `Last Run`

## 5. 总体方案

方向采用：

- 升级为统一右侧 `Node Detail Panel`
- 右侧详情采用参与布局的停靠 panel，而不是绝对定位浮层
- 用 `Ant Design Splitter` 作为左右分栏与拖宽 primitive
- 内部继续保留 schema-driven `NodeInspector`
- 不继续沿用“只有折叠字段区的薄 Inspector”心智
- 不直接照搬 `../dify` 的 monolithic panel 实现
- 借 `Dify` 的产品结构，保留 `1Flowse` 当前 `store + interaction hook + schema renderer` 的前端内核方向
- header 恢复节点主身份信息的内联编辑，不再把别名和简介拆散到配置卡片里

## 6. 信息架构

### 6.1 面板形态

- 右侧详情升级为统一 `Node Detail Panel`
- 维持右侧固定停靠心智，不改成 `Drawer`、`Modal` 或浏览器原生弹窗
- panel 必须参与 editor 布局，打开后挤压可用画布宽度，而不是覆盖画布
- 支持用户调宽
- 调宽能力通过 `Ant Design Splitter` 提供，不额外引入新的分栏体系
- 面板宽度应为 editor 独立状态，而不是附着在 `NodeInspector` 组件自身
- 当前如果存在绝对定位浮层实现，应视为中间态并在本次设计内回收

### 6.2 顶层结构

节点详情固定采用双 tab：

- `配置`
- `上次运行`

规则：

- `配置` tab 承载当前模块所有真实可用内容
- `上次运行` tab 在 `04` 先有真实结构和占位空态
- `05` 再把真实运行数据接入 `上次运行`
- 两个 tab 共用同一个停靠 panel 容器、同一套宽度状态和同一套滚动边界
- 切换 tab 只替换内容，不改变 panel 定位方式，不允许出现“切到上次运行就像整页覆盖画布”的观感

### 6.3 Header

Header 固定包含：

- 类型图标
- 类型名
- 节点别名输入
- 节点简介输入
- 帮助入口
- 一键运行当前节点按钮
- 更多操作菜单
- 关闭按钮

补充规则：

- 类型图标第一版允许用 `Ant Design` icon 占位，后续再替换成正式 SVG
- 一键运行按钮位置参考 `Dify`，放在 header 右侧动作区，不放进更多操作菜单
- 类型名是只读元信息
- 别名与简介仍是当前节点的基础 authoring 字段，但编辑入口固定收口到 header
- header 是节点主身份区；配置 tab 内不再重复放一套别名 / 简介编辑表单

### 6.4 更多操作

第一版更多操作只保留：

- `定位节点`
- `复制节点`

不在当前版本放入：

- 删除
- 批量更多操作
- 类型切换
- 运行当前节点

`复制节点` 规则：

- 普通节点：复制同配置新节点，并重写新的 `nodeId`
- 容器节点：复制整个容器子图，并重写内部 `nodeId / edgeId / caseId / 容器内部引用`

### 6.5 配置 tab 的四层结构

`配置` tab 不再只是“section 列表”，而是固定四层：

1. `Node Summary`
2. `Node Config Sections`
3. `Common Policy Blocks`
4. `Relations`

含义如下：

#### 第一层：Node Summary

用于承载：

- 节点短说明
- 帮助外链
- 必要的静态使用提示

目标是让用户先知道“这是什么节点、负责什么”，再进入配置细节。

明确不承载：

- 别名编辑
- 简介编辑

#### 第二层：Node Config Sections

保留 schema-driven `NodeInspector` 内核，统一按 section 渲染字段编辑器。

统一 section 集合仍为：

- `Inputs`
- `Outputs`
- `Policy`
- `Advanced`

其中：

- 不是每个节点都必须具备全部 section
- section 顺序保持统一
- section 内字段继续由 `nodeDefinitions` 类 schema 描述驱动

#### 第三层：Common Policy Blocks

通用块固定收口为：

- `Retry Policy`
- `Error Policy`
- `Next Step`

规则：

- 它们是 detail panel 的通用 authoring 块
- 不是节点自己随意发散的局部表单
- 不因为节点字段 schema 不同而改变总体位置

#### 第四层：Relations

只展示：

- 直接上游节点
- 直接下游节点

不做：

- 全链路依赖树
- 复杂引用图谱

并补一条固定说明：

- 当前节点可以在输入绑定中引用当前作用域下所有可见上游输出变量

### 6.6 上次运行 tab 的三层结构

`上次运行` tab 参考 `Dify` 收口为三层：

1. `运行摘要`
2. `节点输入输出`
3. `元数据`

#### 第一层：运行摘要

用于展示：

- 状态：`SUCCESS / FAILED / RUNNING / ...`
- 运行时间：例如 `0.000s`
- 总 token 数：例如 `0 Tokens`

#### 第二层：节点输入输出

用于展示：

- 本次节点输入摘要
- 本次节点输出摘要
- 支持展开查看完整文本 / JSON / 文件引用

#### 第三层：元数据

用于展示：

- 状态
- 执行人
- 开始时间
- 运行时间
- 总 token 数

### 6.7 `04` 阶段对 `Last Run` 的落地要求

`04` 阶段必须实现：

- `上次运行` tab 壳层
- 统一布局
- `loading / empty / unavailable` 占位态
- 三层结构的 UI 骨架
- 与 `配置` tab 相同的 panel 内容宽度、滚动行为与停靠心智

`04` 阶段不实现：

- 真实运行数据查询
- 真实状态映射
- trace 数据
- 真实 token / metadata

## 7. 通用组件边界

第一版应把当前节点详情拆成以下共用组件：

- `AgentFlowCanvasFrame`
  - 负责 `Splitter` 分栏装配
  - 负责“画布区域 / 右侧详情”的页面级布局
  - 负责详情打开时的宽度约束与布局稳定性
- `NodeDetailPanel`
  - 右侧统一壳层
  - 负责 panel 宽度透传、tab 装配、整体布局
  - 不再自己承担绝对定位浮层职责
- `NodeDetailHeader`
  - 负责图标、类型、别名输入、简介输入、帮助、运行按钮、更多操作、关闭
  - 直接写回当前节点主身份 authoring 字段
- `NodeConfigTab`
  - 承载 authoring 内容
- `NodeLastRunTab`
  - 承载 `Last Run` 壳层与未来 runtime 扩展位
  - 与 `NodeConfigTab` 共用同一 panel 内容容器规则
- `NodeInspector`
  - 继续只负责 schema-driven section/field renderer
- `NodeSummaryCard`
  - 只读说明卡片
  - 不再承载别名 / 简介编辑
- `NodeOutputContractCard`
  - 统一展示输出契约
- `NodeRelationsCard`
  - 统一展示直接上游 / 下游
- `NodePolicySection`
  - 承载 `Retry Policy / Error Policy / Next Step`
- `NodeActionMenu`
  - 处理定位和复制
- `NodeRunButton`
  - 处理 header 的一键运行

组件边界原则：

- 外层 panel 负责信息架构与布局
- `NodeInspector` 不再承担完整详情面板职责
- 运行态容器和 authoring 容器从现在开始分层
- header 负责节点身份信息，summary card 负责节点说明，两者不再重叠

## 8. 输出契约规则

### 8.1 总规则

所有节点“输出值”在详情面板中统一只读。

即：

- 当前节点详情不允许直接编辑运行输出值
- 下游节点消费上游输出时，只能通过下游自己的输入绑定处理
- 当前节点只负责声明和展示自己的输出契约

### 8.2 输出的心智模型

统一把节点输出理解为一个运行时 `JSON object`。

面板中展示的“输出变量”本质上是该 object 的属性映射。

因此：

- `Outputs` section / 输出契约卡片只负责展示“这个节点会暴露哪些输出 key”
- 不负责编辑运行值

### 8.3 少数节点的“输出定义”规则

对少数允许定义输出结构的节点，例如 `Code`：

- 允许在节点自己的配置区里定义“输出契约”
- 但不在 `Outputs` 展示区直接编辑

也就是说：

- `Outputs` 区只读
- “输出契约定义入口”属于该节点的配置区逻辑

### 8.4 `Code` 节点的契约规则

`Code` 节点参考 `Dify` 的心智：

- 用户在配置区声明输出变量名列表
- 运行代码返回 object
- 返回 object 的 key 必须和声明的输出契约匹配
- 如果不匹配，则校验报错

示例心智：

```javascript
function main({ arg1, arg2 }) {
  return {
    result: arg1 + arg2
  }
}
```

在这个例子里：

- `result` 属于声明的输出契约
- 下游通过 selector / binding 消费 `result`
- 不是在当前节点里直接编辑 `result` 的值

## 9. 节点关系规则

`Relations` 区第一版只展示最直接的结构关系：

- 直接上游节点列表
- 直接下游节点列表

不展示：

- 多跳祖先 / 后代
- 全量依赖树
- 容器展开后的全局链路图

关系区还应明确表达：

- 当前节点可引用的是“当前作用域下可见上游输出”
- 可见性规则仍遵循 `04` 已确认的 selector / 作用域 / 拓扑边界

## 10. Issues 联动规则

当前版本先保持现有 Issues 联动能力，不额外扩张。

保留：

- 点击 issue 后定位到节点
- 打开对应详情区域
- 聚焦到目标字段

当前版本不新增：

- 字段红框高亮系统
- 自动修复建议
- 独立问题修复面板

## 11. 节点详情矩阵

以下为全部已接入节点的 section 级真值。

| 节点 | Node Config 主区 | 通用块 |
| --- | --- | --- |
| `Start` | 输入定义、系统输入说明 | 输出契约、关系 |
| `Answer` | 回复内容绑定 | 输出契约、关系、Next Step |
| `LLM` | 模型、Prompt、上下文、推理参数 | 输出契约、Retry、Error、关系 |
| `Knowledge Retrieval` | 检索输入、检索策略 | 输出契约、Retry、Error、关系 |
| `Question Classifier` | 模型、分类输入、类别配置、高级设置 | 输出契约、Retry、Error、关系 |
| `IfElse` | 条件组、分支语义 | 输出契约、关系、Next Step |
| `Code` | 输入变量、代码编辑器、输出契约定义 | 输出契约、Retry、Error、关系 |
| `Template Transform` | 模板输入、模板正文 | 输出契约、关系 |
| `HTTP Request` | 方法、URL、Headers、Params、Body、超时/SSL | 输出契约、Retry、Error、关系 |
| `Tool` | 工具标识、参数 schema、工具配置 | 输出契约、Retry、Error、关系 |
| `Variable Assigner` | 变量写入操作列表 | 输出契约、关系 |
| `Parameter Extractor` | 源文本、参数结构 / 提取配置 | 输出契约、Retry、Error、关系 |
| `Iteration` | 列表输入、容器配置、进入子画布入口 | 输出契约、关系、Next Step |
| `Loop` | 入口条件、轮次策略、进入子画布入口 | 输出契约、Retry、Error、关系、Next Step |
| `Human Input` | 问题、输入表单、等待策略 | 输出契约、关系、Error |

## 12. 高频节点字段级设计

以下节点在本稿中进一步下钻到字段级。

### 12.1 `LLM`

字段级重点：

- `model`
- `system_prompt`
- `user_prompt`
- `context selector`
- `temperature`
- `max_tokens`

输出契约展示：

- `text`
- 若后续支持结构化输出，则展示结构化输出 schema

### 12.2 `Tool`

字段级重点：

- `tool_name / provider`
- 工具输入参数
- 工具配置参数

规则：

- 参数表单应继续支持按工具 schema 动态渲染
- 输出契约只读展示标准文本、文件、JSON 以及 schema 派生字段

### 12.3 `HTTP Request`

字段级重点：

- `method`
- `url`
- `headers`
- `params`
- `body`
- `ssl_verify`
- `timeout`

输出契约展示：

- `body`
- `status_code`
- `headers`
- `files`

### 12.4 `Code`

字段级重点：

- 输入变量列表
- 运行语言
- 代码编辑器
- 输出契约定义区

规则：

- 输出契约定义区用于声明合法输出 key
- 运行时返回 object 必须满足契约
- 输出契约展示区只读

### 12.5 `Question Classifier`

字段级重点：

- 模型
- 分类输入变量
- 类别列表
- 高级设置

输出契约展示：

- `class_name`
- 相关结构化输出

### 12.6 `Variable Assigner`

字段级重点：

- 状态写入 / 覆盖 / 追加 / 清空操作列表

输出契约展示：

- 变量写入结果摘要

## 13. 容器节点规则

对 `Iteration / Loop`：

- 在详情内必须提供“进入子画布”入口
- 在进入子画布后仍保留返回上层的上下文能力
- 不在详情面板里嵌入子画布本体

也就是说：

- 面板负责表达容器语义与进入方式
- 真正的容器编辑仍发生在主画布上下文

## 14. 移动端策略

本稿不额外为移动端设计专门适配。

当前口径为：

- 节点详情结构按桌面优先设计
- 窄屏不额外裁切信息架构
- 画布与详情按现有宿主能力自然退化
- 若宿主当前在窄屏直接降级为“请使用桌面端编辑”，本次设计保持该降级策略，不为 panel 重构额外开放半可用编辑态

## 15. 数据与前端状态边界

### 15.1 Authoring 状态

以下内容属于 `04` 的 editor store / authoring state：

- 当前选中节点
- 详情面板开关
- 当前 tab
- panel 宽度
- section 展开状态
- 复制 / 定位 / 进入子画布等交互状态
- header 中别名 / 简介编辑的即时 authoring 变更

### 15.2 Runtime 状态

以下内容属于 `05` 的运行态数据：

- 最后一次运行状态
- 运行输入 / 输出
- 执行人
- 开始时间
- token
- trace / metadata

### 15.3 过渡规则

`04` 实现 `NodeLastRunTab` 时：

- 不直接模拟 runtime 数据结构
- 只保留稳定 UI contract
- `05` 接入时只替换数据来源，不重写 panel 布局

并补充以下交互规则：

- `selectedNodeId` 决定右侧详情是否显示
- 关闭详情时，不重置 `nodeDetailTab` 与 `nodeDetailWidth`
- 切换 `配置 / 上次运行` 时，不改变 panel 宽度
- 切换节点时默认保留当前 tab，不额外强制回到 `配置`
- `nodeDetailWidth` 由 `Splitter` 更新，并受到最小 / 最大宽度约束

## 16. 验收要求

当该设计进入实现时，验收至少包含：

- 右侧 `Node Detail Panel` 壳层成立
- 详情为右侧停靠 panel，不再以绝对定位浮层覆盖画布
- `Splitter` 拖宽成立，panel 宽度可持久保留
- Header、主操作、更多操作、tab 结构成立
- Header 中可直接编辑别名与简介
- `NodeSummaryCard` 不再重复出现别名 / 简介编辑控件
- `配置` tab 可覆盖全部已接入节点
- `上次运行` tab 的壳层与空态成立
- `配置 / 上次运行` 切换后仍处于同一个停靠 panel 容器内
- 通用块 `Retry / Error / Next Step / Relations / Output Contract` 成立
- 容器节点可从详情进入子画布
- 复制普通节点与复制容器子图的规则清晰可测
- `Code` 节点输出契约定义与返回值一致性规则明确

## 17. 明确建议

建议按本稿推进，不再继续扩现有“薄 Inspector”，也不改走弹窗路线。

正确做法是：

- 用右侧停靠的 `Node Detail Panel` 建立完整外层结构
- 用 `Ant Design Splitter` 管 editor 画布与详情分栏
- 保留 `NodeInspector` 作为 schema-driven 内核
- 把别名 / 简介收回 header 身份区
- 让 `04` 先把 authoring 真值收稳
- 再让 `05` 在已存在的 `Last Run` 结构中接入 runtime

这样可以避免：

- 把 authoring 细节和 runtime 细节混成一层
- 把 `NodeInspector` 演化成第二个 editor 内核
- 在 `05` 到来时推翻整个 panel 结构重做
