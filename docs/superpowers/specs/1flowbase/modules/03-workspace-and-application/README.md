# 03 工作台与 Application 宿主容器

日期：2026-04-15
状态：已确认，待写 implementation plan

## 讨论进度

- 状态：`confirmed`
- 完成情况：已将旧版“Flow 前置容器”重写为 `Application` 一等宿主模块，确认工作台首页、Application 创建、应用详情四分区、ACL 接法，以及与 `04/05/06B` 的未来能力挂接边界。
- 最后更新：2026-04-15 09:00 CST

## 本模块目标

`03` 的目标不是先做完整应用平台，而是先把 `Application` 作为一等交付容器固定下来，为后续 `agentFlow` 编排、运行、日志、监控和对外交付提供稳定宿主。

当前模块只回答五个问题：

- 用户如何在工作台浏览、筛选、创建和进入 `Application`
- `Application` 如何作为独立于 `Flow` 的一级对象存在
- 应用详情页如何固定成可持续扩展的四分区壳层
- `03` 当前最小实现范围是什么
- 后续 `04/05/06B` 应该挂到应用壳层的哪个位置

## 当前代码事实

- 当前控制台已有正式壳层与顶层导航：`工作台 / 子系统 / 工具 / 设置 / 个人资料`
- 当前首页仍是工作台正式空态，不是应用列表页
- 当前前后端还没有 `Application` 列表、创建、详情和应用内四分区路由
- 权限目录已存在 `application.*`、`flow.*`、`publish_endpoint.*`
- 当前 `06B` 已确认“应用级 API Key / Token 鉴权”属于未来发布网关专题，但尚未实现
- 当前 `05` 已确认运行时对象是 `Flow Run / Node Run / Checkpoint`，但尚未挂到应用详情页

## 本模块范围

- 工作台首页改造为 `Application` 列表页
- `Application` 最小数据模型与创建流程
- 应用详情二级壳层与四分区导航
- `Application` 详情中 future hooks 的契约冻结
- `application.*` ACL 的首次正式消费

## 本轮确认

- `Application` 是一级容器对象，不是 `Flow` 的临时别名。
- `application_type` 是一级真相。
- `03` 当前只开放 `agent_flow` 创建，但创建表单必须同时展示未来类型卡片，至少包含禁用态的 `workflow`。
- `03` 只创建 `Application`，不创建真实 `Flow`；`04` 再接手 `draft/version/graph`。
- 顶层导航不改，但 `工作台 /` 首页内容改为 `Application` 列表页。
- 应用详情路由统一为：
  - `/applications/:applicationId/orchestration`
  - `/applications/:applicationId/api`
  - `/applications/:applicationId/logs`
  - `/applications/:applicationId/monitoring`
- `/applications/:applicationId` 必须直接重定向到 `orchestration`
- 不再保留独立 `overview`

## 信息架构

### 工作台首页

工作台首页固定为 `Application` 列表页，包含：

- 搜索
- 类型筛选
- `新建应用`
- 卡片网格列表

每张应用卡片展示：

- 图标
- 名称
- 类型标签
- 简介
- 最近更新时间
- 主按钮 `进入应用`

### 创建入口

创建入口采用单表单，而不是分步 wizard。

布局固定为：

- 顶部：类型选择卡片区
- 下方：共用字段 `名称 / 图标 / 简介`

当前状态：

- `AgentFlow` 卡片可选
- `Workflow` 等未来类型显示正式禁用态与“未开放”

### 应用详情

应用详情页复用现有 [section-page-layout](/home/taichu/git/1flowbase/web/app/src/shared/ui/section-page-layout/SectionPageLayout.tsx) 作为二级路由壳层，固定四个分区：

- `编排`
- `API`
- `日志`
- `监控`

`03` 阶段这四个分区都允许是正式空态，但不能只是“视觉占位”；必须同时冻结后续能力挂载契约。

## 四分区契约

### 编排分区

`orchestration` 分区是应用主内容主体的挂载位，不是纯静态介绍页。

`03` 需要先定义：

- 当前应用是否已绑定主编排主体
- 当前主编排主体属于什么种类
- 当前主编排主体是否已进入可编辑状态

对 `agent_flow` 类型，详情 DTO 需要预留：

- `subject_kind`
- `subject_status`
- `current_subject_id`
- `current_draft_id`

当前阶段允许这些字段为空；`04` 再把它们接到真实 `agentFlow` Draft / Version / Graph。

### API 分区

`api` 分区不是内部平台 API 文档，而是应用级凭证与对外交付契约入口。

本轮冻结的原则是：

- 每个 `Application` 有自己的 API Key
- 同一 `application_type` 的对外调用 URL 保持统一
- 不同应用之间靠各自 API Key 绑定关系区分
- 未来对外调用不应通过 URL 中的 `applicationId` 区分应用

因此 `03` 只冻结以下契约字段，不冻结具体外部调用 path：

- `credential_kind = application_api_key`
- `invoke_routing_mode = api_key_bound_application`
- `invoke_path_template` 由 `application_type` 决定
- `api_capability_status`
- `credentials_status`

真正的 API Key 管理、外部调用协议、发布切换与兼容协议，统一留给 `06B 发布网关`。

### 日志分区

`logs` 分区对应应用级运行日志，而不是编辑器草稿历史。

本轮冻结的业务对象是：

- `Application Run List`
- `Application Run Detail`
- 后续可下钻的 `Node Run / Event Trace`

`03` 只要求应用详情 DTO 预留：

- `runs_capability_status`
- `run_object_kind = application_run`
- `log_retention_status`

真正的运行日志查询、Run Detail、事件流与节点级追踪，由 `05 运行时编排与调试` 接入。

### 监控分区

`monitoring` 分区对应应用级聚合指标和 tracing / observability 配置。

本轮冻结的未来挂载位包括：

- 聚合概览指标
- 时间序列指标
- tracing 配置

`03` 只要求应用详情 DTO 预留：

- `metrics_capability_status`
- `metrics_object_kind = application_metrics`
- `tracing_config_status`

真正的指标计算、聚合查询与 tracing 配置实现，留给后续运行时 / observability 专题。

## 后端边界

### 03 当前实际实现范围

`03` 后端只做最小闭环，不超前：

- `GET /api/console/applications`
- `POST /api/console/applications`
- `GET /api/console/applications/:id`

### 03 不提前实现

- Application 更新
- Application 删除
- Application 复制
- API Key 管理接口
- 对外调用接口
- Flow 本体管理
- Run 查询接口
- Metrics 查询接口
- Tracing 配置接口

### 详情接口的职责

虽然 `03` 只有三个控制台接口，但 `GET /api/console/applications/:id` 不能只返回基础元数据；它还需要返回四分区 future hooks 所需的最小描述信息。

建议详情响应最少包含：

- Application 基础信息
- `application_type`
- 当前可见分区定义
- 各分区 capability status
- 各分区未来绑定对象的最小锚点字段

## 数据模型最小集

`03` 最小数据模型固定为：

- `id`
- `workspace_id`
- `application_type`
- `name`
- `description`
- 图标相关字段
- `created_by`
- `updated_at`

当前明确不做：

- `slug`
- `code`
- `default_flow_id`
- 发布状态字段
- 运行统计聚合字段

## 权限接法

`03` 开始真正消费 `application.*` ACL。

规则固定为：

- 进入工作台列表页仍需要会话与页面访问权限
- 资源列表与详情读取走 `application.view.own/all`
- 创建走 `application.create.all`
- `own` 语义按 `created_by == actor.user_id`
- 进入 `orchestration` 分区时，当前先走应用可见性；等 `04` 落地后再把 `flow.*` 接进去

前端表现固定为：

- 没有创建权限，不显示或禁用 `新建应用`
- 没有某个应用查看权限，该应用不应出现在列表里
- 直接访问无权限应用详情页，返回正式 `403/404` 状态页，而不是空白页

## 前端落点

前端最小改动面为：

- `HomePage` 重写为应用列表页
- `routes` 新增 application detail 路由组
- `@1flowbase/shared-types` 扩 route id
- `features/applications/` 新建：
  - 列表页
  - 创建表单或弹窗
  - 应用详情壳层
  - 四个二级分区正式空态页
- 复用 `section-page-layout`，不重新发明应用内壳层

## 验证要求

### 后端

- application service 测试
- application route 测试
- `application.view own/all` 测试
- `application.create.all` 测试

### 前端

- 工作台列表页测试
- 创建表单测试
- application 二级路由与重定向测试
- 权限裁剪测试

## 明确不纳入本模块

以下能力不再作为 `03` 前置条件：

- 协作者管理
- Application 更新 / 删除 / 复制
- 真正的 Flow Draft / Version / Graph
- API Key 管理实现
- 对外调用实现
- 日志列表与 Run Detail 实现
- 监控图表与 tracing 配置实现
- 发布状态汇总
- 历史版本恢复

这些内容后续若继续需要，统一在 `04/05/06B` 或相关后续专题中补回，不再混入 `03` 的最小闭环。

## 跨模块边界

### 与 04 的边界

- `03` 负责 `Application` 宿主容器、入口、上下文和 `orchestration` 挂载位
- `04` 负责 `agentFlow` Studio 本体：
  - 画布
  - 图结构
  - 节点与连线
  - Draft / Version
  - 编排编辑体验

### 与 05 的边界

- `03` 只冻结 `logs` 与 `monitoring` 的对象锚点和壳层位置
- `05` 负责把 `Flow Run / Node Run / Event Trace / Metrics` 接进这些分区

### 与 06B 的边界

- `03` 只冻结 `API` 分区的“应用级凭证 + 统一调用 URL + API Key 绑定应用”原则
- `06B` 负责真实 API Key 生命周期、对外调用协议、发布入口和兼容协议

## 当前结论摘要

- `03` 的正式语义是：`工作台首页 + Application 创建 + Application 详情四分区宿主壳层`
- `Application` 是一级交付对象，`application_type` 是一级真相
- `03` 当前真正实现仍然只做 `list/create/detail`
- 但 `detail` 必须同时冻结 `orchestration/api/logs/monitoring` 四分区的 future hooks
- `API` 分区已明确采用：
  - 同类应用共享统一调用 URL
  - 不同应用靠 API Key 绑定区分
  - 不通过外部调用 URL 中的 `applicationId` 区分应用
- 后续开发顺序固定为：先补 `03` 的 Application 宿主容器，再进入 `04`，之后由 `05/06B` 分别接入运行与对外交付能力
